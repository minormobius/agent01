/* Anabasis's generator. Rooms from a seed, each kept only if the solver says
   so, the way Anakata's are: it must be solvable walking (the only moves the
   page has), in the tier's band of moves, and PROVED, by an exhaustive
   search, impossible without its ramps (and without its crates, where it
   has any). Of the first few rooms that pass, the one whose solution does
   the most is the one you get. Same seed, same room, for as long as this
   file doesn't change; a room's link (Anakata's "D" codes) is the room
   itself, cell by cell, so it outlives any change here.

   The rooms are built from the parts two gravities need. The ground is a
   map of TERRACES in w: each (x, y) column is solid in its walking layer
   up to some slice and open above it, so you stand on top of it there,
   held kata. The columns are grouped into a few regions (a Voronoi
   partition), each region one terrace at one height, so the room reads as
   plateaus rather than noise. From a higher terrace you slip down onto a
   lower one for free; back up, only a RAMP takes you, one slice at a time,
   over a terrace's edge. Then:
     dips     single columns sunk a slice or two below their neighbours:
              slip in and you're stuck, unless a ramp leads out or a crate
              fills it first
     walls    columns solid through every slice
     drops    holes through the floor, where you fall out of the world
     crates   to fill a dip (a crate rests a slice up, on top of it, and is
              ground to stand on) or to stand on an edge
   The goal goes high, the start somewhere else; the search decides whether
   it's a room.                                                              */
import { World, EMPTY, SOLID, GOAL, RAMP_XA, RAMP_XK, RAMP_YA, RAMP_YK, ACTIONS } from "../../anakata/js/world.js";
import { rng, seedOf, encode, decode } from "../../anakata/js/gen.js";
export { rng, seedOf, encode, decode };

export const GEN = "a1"; // bump when a change here changes what a seed makes

export const TIERS = {
  easy: { X: [4, 5], Y: [3, 4], W: [4, 4], spine: [5, 8], ups: [1, 2], downs: [1, 1], dips: [0, 1], fetch: 0.3, crates: [0, 1], walls: 0.15, drops: [0, 1], minRamps: 1, minSlips: 1, needCrate: 0, len: [5, 12], tries: 300, keep: 3, limit: 20000 },
  medium: { X: [5, 6], Y: [4, 5], W: [4, 5], spine: [8, 13], ups: [2, 3], downs: [1, 2], dips: [1, 1], fetch: 0.5, crates: [1, 2], walls: 0.15, drops: [0, 2], minRamps: 2, minSlips: 2, needCrate: 0.6, len: [9, 20], tries: 400, keep: 4, limit: 40000 },
  hard: { X: [6, 7], Y: [6, 6], W: [5, 5], spine: [12, 20], ups: [3, 4], downs: [2, 3], dips: [1, 2], fetch: 0.6, crates: [2, 3], walls: 0.12, drops: [1, 2], minRamps: 3, minSlips: 3, needCrate: 0.9, len: [13, 36], tries: 500, keep: 3, limit: 80000 },
};

const Z = 2; // the floor, and the layer you walk in
const WALK = (a) => a.kind === "walk";
const LEAN = { "1,0": RAMP_XA, "-1,0": RAMP_XK, "0,1": RAMP_YA, "0,-1": RAMP_YK }; // a ramp leaning ana the way (dx, dy) goes

export function candidate(rnd, T) {
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const X = int(...T.X), Y = int(...T.Y), W = int(...T.W), C = X * Y;
  const cells = new Uint8Array(C * Z * W), at = (x, y, z, w) => x + X * (y + Y * (z + Z * w));
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], inside = (x, y) => x >= 0 && y >= 0 && x < X && y < Y;
  // the spine: a wandering path, start to goal, that never touches itself (each new cell borders
  // only the one before it), so its heights are all that connect it
  const len = int(...T.spine), path = [[int(0, X - 1), int(0, Y - 1)]], on = new Set([path[0].join()]);
  while (path.length < len) {
    const [x, y] = path[path.length - 1];
    const next = N4.map(([dx, dy]) => [x + dx, y + dy]).filter(([u, v]) => inside(u, v) && !on.has(u + "," + v) &&
      N4.every(([dx, dy]) => { const k = u + dx + "," + (v + dy); return !on.has(k) || k === x + "," + y; }));
    if (!next.length) break;
    const n = next[int(0, next.length - 1)]; path.push(n); on.add(n.join());
  }
  if (path.length < T.spine[0]) return null;
  // its heights: the rises, each one a ramp; the drops, each one a slip; and dips, cells sunk a slice
  // below the ones either side, with no ramp out: only a crate in one gets you across
  const L = path.length;
  let steps, Hs, dips;
  for (let g = 0; g < 12 && !Hs; g++) {
    steps = Array(L - 1).fill(0); dips = [];
    const slots = [...Array(L - 1).keys()], pickSlot = () => slots.splice(int(0, slots.length - 1), 1)[0];
    for (let want = int(...T.dips), k = 0; want > 0 && L >= 5 && k < 30; k++) {
      const i = int(2, L - 3), [o, a, b, c] = [path[i - 2], path[i - 1], path[i], path[i + 1]], line = (p, q, r) => p[0] - q[0] === q[0] - r[0] && p[1] - q[1] === q[1] - r[1];
      if (line(a, b, c) && line(o, a, b) && [i - 2, i - 1, i].every((j) => slots.includes(j))) { want--; dips.push(i); steps[i - 1] = -1; steps[i] = 1; for (const j of [i, i - 1, i - 2]) slots.splice(slots.indexOf(j), 1); } // level before it, so you can stand behind the crate
    }
    for (let k = int(...T.downs); k > 0 && slots.length; k--) steps[pickSlot()] = -int(1, 2);
    for (let k = int(...T.ups) + 1; k > 0 && slots.length; k--) steps[pickSlot()] = 1;
    const h = [0]; for (const d of steps) h.push(h[h.length - 1] + d);
    const lo = Math.min(...h), hs = h.map((v) => v - lo + 1);
    if (Math.max(...hs) <= W - 1 && hs[L - 1] > hs[0]) Hs = hs;
  }
  if (!Hs) return null;
  // the rest of the room, column by column, from the spine cells beside it: mostly too high to get
  // into from any of them (a wall in the way), sometimes a hole below them all (slip in and you're
  // stuck), sometimes level with or below its nearest (room to move a crate, and maybe a shortcut,
  // which the search will find and the band of moves will judge), or solid right through
  const H = Array(C).fill(0), kind = Array(C).fill(0); // kind: 0 ground, 1 wall, 2 drop
  path.forEach(([x, y], i) => { H[y * X + x] = Hs[i]; });
  const spineAt = new Map(path.map(([x, y], i) => [x + "," + y, i]));
  for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) {
    if (on.has(x + "," + y)) continue;
    const adj = N4.map(([dx, dy]) => spineAt.get(x + dx + "," + (y + dy))).filter((i) => i !== undefined).map((i) => Hs[i]);
    let bi = 0, bd = 1e9; path.forEach(([u, v], i) => { const d = Math.abs(u - x) + Math.abs(v - y) + rnd() * 0.6; if (d < bd) { bd = d; bi = i; } });
    const hi = adj.length ? Math.max(...adj) : Hs[bi], lo = adj.length ? Math.min(...adj) : Hs[bi], r = rnd();
    if (r < T.walls) kind[y * X + x] = 1;
    else if (r < 0.62) H[y * X + x] = hi + 1;
    else if (r < 0.75 && lo > 1) H[y * X + x] = int(1, lo - 1);
    else H[y * X + x] = Math.max(1, Hs[bi] - int(0, 1));
    if (H[y * X + x] > W - 1) kind[y * X + x] = 1;
  }
  for (let k = int(...T.drops); k > 0; k--) { const x = int(0, X - 1), y = int(0, Y - 1); if (!on.has(x + "," + y)) kind[y * X + x] = 2; }
  for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) {
    const c = y * X + x;
    for (let w = 0; w < W; w++) {
      cells[at(x, y, 0, w)] = kind[c] === 2 ? EMPTY : SOLID;
      cells[at(x, y, 1, w)] = kind[c] === 1 || (kind[c] === 0 && w < H[c]) ? SOLID : EMPTY;
    }
  }
  // a ramp at every rise of the spine, but none out of a dip
  path.forEach(([x, y], i) => {
    if (i < L - 1 && steps[i] === 1 && !dips.includes(i)) { const [u, v] = path[i + 1]; cells[at(x, y, 0, Hs[i])] = LEAN[(u - x) + "," + (v - y)]; }
  });
  // the start, the goal, and the crates: one for each dip, either just before it in line (push it
  // in as you go) or somewhere else on the ground, to be fetched; the rest anywhere on the ground
  const sp = path[0], gp = path[L - 1];
  cells[at(gp[0], gp[1], 1, Hs[L - 1])] = GOAL;
  const ground = [];
  for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) { const c = y * X + x; if (!kind[c] && !(x === sp[0] && y === sp[1]) && !(x === gp[0] && y === gp[1])) ground.push([x, y, H[c]]); }
  const crates = [], put = ([x, y, h]) => { const i = at(x, y, 1, h); if (!crates.includes(i)) crates.push(i); };
  const offSpine = () => ground.filter(([x, y]) => !on.has(x + "," + y));
  for (const i of dips) {
    const away = rnd() < T.fetch ? offSpine() : [];
    put(away.length ? away[int(0, away.length - 1)] : [...path[i - 1], Hs[i - 1]]);
  }
  for (let k = int(...T.crates) - crates.length; k > 0; k--) { const g = offSpine(); if (g.length) put(g[int(0, g.length - 1)]); }
  return { X, Y, Z, W, cells, start: at(sp[0], sp[1], 1, Hs[0]), crates, gravW: true, spine: path.map(([x, y], i) => [x, y, Hs[i]]) };
}

/* what a solution does, for choosing the best of the rooms that pass */
export function measure(world, moves) {
  let s = { p: world.start.p, crates: world.start.crates.slice() }, ramps = 0, slips = 0, cratesMoved = 0;
  const heights = new Set([world.coords(s.p)[3]]);
  for (const ai of moves) {
    const n = world.act(s, ACTIONS[ai]), a = world.coords(s.p)[3], b = world.coords(n.p)[3];
    if (b > a) ramps++; else if (b < a) slips++;
    if (n.crates.join() !== s.crates.join()) cratesMoved++;
    s = n; heights.add(b);
  }
  return { len: moves.length, ramps, slips, cratesMoved, heights: heights.size, score: moves.length + 3 * ramps + 2 * slips + 3 * cratesMoved + 2 * heights.size };
}

export function generate(seed, tierName = "medium") {
  const T = TIERS[tierName], rnd = rng(seed);
  let best = null, kept = 0, tried = 0;
  for (; tried < T.tries && kept < T.keep; tried++) {
    const c = candidate(rnd, T);
    if (!c) continue;
    const world = new World(Object.assign({ name: "", hint: "" }, c));
    if (world.won(world.start)) continue;
    const sol = world.solve(WALK, T.limit);
    if (!sol.moves || sol.moves.length < T.len[0] || sol.moves.length > T.len[1]) continue;
    const m = measure(world, sol.moves);
    if (m.ramps < T.minRamps || m.slips < T.minSlips) continue;
    // proved: no way up without the ramps
    world.rampsOff = true; const flat = world.solve(WALK, T.limit); world.rampsOff = false;
    if (flat.moves || flat.states >= T.limit) continue;
    // and, for the rooms that are to need their crates, none without them
    let needsCrates = false;
    if (world.start.crates.length && m.cratesMoved) {
      const bare = new World(Object.assign({}, c, { name: "", hint: "", crates: [] })).solve(WALK, T.limit);
      needsCrates = !bare.moves && bare.states < T.limit;
    }
    if (rnd() < T.needCrate && !needsCrates) continue;
    kept++;
    m.needsCrates = needsCrates;
    if (!best || m.score > best.m.score) best = { world, m, par: sol.moves.length };
  }
  if (!best) return null;
  const m = best.m, n = (k, one) => k + " " + one + (k === 1 ? "" : "s");
  best.world.name = tierName + " " + seed.toString(36);
  best.world.hint = `A generated room, proved impossible without its ramps${m.needsCrates ? " and without its crate" + (best.world.start.crates.length > 1 ? "s" : "") : ""}. The shortest way takes ${n(m.ramps, "ramp")} up and ${n(m.slips, "slip")} down.`;
  return Object.assign(best, { tier: tierName, seed, tried });
}
