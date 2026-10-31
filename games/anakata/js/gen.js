/* Anakata's generator, and the codes that make any room a link.

   A room is built at random from a seed, and kept only if the solver says so:
   it must be solvable, it must be IMPOSSIBLE without moving through w (an
   exhaustive search of every state reachable in 3D, ramps just floor, finds
   no way), and its shortest solution must move through w (hooks along it,
   steps a ramp carries you) at least the tier's number of times and be in
   the tier's band of moves. Of the first few rooms that pass, the one
   whose solution does the most (moves, w-hooks, crates moved, slices
   visited) is the one you get. Same seed, same room, for as long as this
   file doesn't change; the code below is how a room survives a change to
   this file: it IS the room, cell by cell.

   The rooms are built from the parts a 4D puzzle needs:
     barriers  a wall two high, or a chasm, right across a slice, cutting it
               in two; some slices have it and some don't, so the way round
               is through w
     steps     one cell high: climbable, and good to stand crates against
     anchors   so the hook has something to pull you to, in w and out of it
     crates    to fetch through w, to stand on, to leave on plates
     plates    with doors across another slice's gap
     ramps     a diagonal run through the x-w plane across the barrier, the
               floor carved away beside it so it carries you
   and sometimes, on the harder tiers, w wraps round.                       */
import { World, EMPTY, SOLID, ANCHOR, PLATE, DOOR, GOAL, RAMP_XA, RAMP_XK, isW, ACTIONS } from "./world.js";

export const GEN = "g3"; // bump when a change here changes what a seed makes

export const TIERS = {
  easy: { X: [5, 6], Y: [3, 4], W: [3, 3], anchors: [3, 5], crates: [0, 1], plates: 0, second: 0, ramps: 0.35, wrap: 0, minW: 1, minHooks: 0, len: [5, 14], tries: 300, keep: 3, limit: 20000 },
  medium: { X: [6, 7], Y: [4, 5], W: [3, 4], anchors: [4, 6], crates: [1, 1], plates: 0.4, second: 0.35, ramps: 0.45, wrap: 0.1, minW: 2, minHooks: 1, len: [10, 26], tries: 400, keep: 4, limit: 40000 },
  hard: { X: [6, 7], Y: [5, 6], W: [4, 4], anchors: [5, 8], crates: [1, 2], plates: 0.6, second: 0.85, ramps: 0.45, wrap: 0.15, minW: 3, minHooks: 2, len: [16, 44], tries: 500, keep: 3, limit: 60000 },
};

export function rng(seed) { // mulberry32
  let t = seed >>> 0;
  return () => { t = (t + 0x6d2b79f5) >>> 0; let x = t; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
/* a seed from any text (a date, a word) */
export function seedOf(text) { let h = 2166136261; for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

const Z = 3; // the floor, where you walk, and a layer above it

export function candidate(rnd, T) {
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const X = int(...T.X), Y = int(...T.Y), W = int(...T.W);
  const cells = new Uint8Array(X * Y * Z * W), at = (x, y, z, w) => x + X * (y + Y * (z + Z * w));
  for (let w = 0; w < W; w++) for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) cells[at(x, y, 0, w)] = SOLID;
  // barriers: a wall two high or a chasm right across a slice, in some slices and not in others.
  // Across x always; across y too on the harder tiers, with its gaps in other slices
  const gaps = (n) => { const has = Array.from({ length: W }, () => rnd() < 0.72); if (has.every(Boolean)) has[int(0, W - 1)] = false; if (!has.some(Boolean)) has[int(0, W - 1)] = true; return has; };
  const bars = [{ axis: 0, at: int(2, X - 3), chasm: rnd() < 0.4, has: gaps() }];
  if (rnd() < T.second) bars.push({ axis: 1, at: int(1, Y - 2), chasm: rnd() < 0.4, has: gaps() });
  for (const B of bars) for (let w = 0; w < W; w++) if (B.has[w]) for (let u = 0; u < (B.axis ? X : Y); u++) {
    const [x, y] = B.axis ? [u, B.at] : [B.at, u];
    if (B.chasm) cells[at(x, y, 0, w)] = EMPTY; else { cells[at(x, y, 1, w)] = SOLID; cells[at(x, y, 2, w)] = SOLID; }
  }
  const onBar = (x, y) => bars.some((B) => (B.axis ? y === B.at : x === B.at));
  // a ramp across the first barrier: a diagonal run through the x-w plane, the floor carved
  // away either side of it in each slice, so walking along it carries you through w
  const ramp = [];
  if (rnd() < T.ramps && W >= 3 && X >= 5) {
    const L = int(2, Math.min(3, W - 1)), sl = rnd() < 0.5 ? 1 : -1, y = int(0, Y - 1);
    const w0 = sl > 0 ? int(0, W - 1 - L) : int(L, W - 1), x0 = Math.max(1, Math.min(X - 1 - L, bars[0].at - int(0, L - 1)));
    const clear = (x, w) => { cells[at(x, y, 1, w)] = EMPTY; cells[at(x, y, 2, w)] = EMPTY; };
    for (let k = 0; k < L; k++) {
      const x = x0 + k, w = w0 + sl * k;
      cells[at(x, y, 0, w)] = sl > 0 ? RAMP_XA : RAMP_XK; clear(x, w); ramp.push([x, y, w]);
      cells[at(x + 1, y, 0, w)] = EMPTY; if (k > 0) cells[at(x - 1, y, 0, w)] = EMPTY;
    }
    cells[at(x0 - 1, y, 0, w0)] = SOLID; clear(x0 - 1, w0);
    cells[at(x0 + L, y, 0, w0 + sl * L)] = SOLID; clear(x0 + L, w0 + sl * L);
  }
  const onRamp = (x, y, w) => ramp.some((r) => r[0] === x && r[1] === y && r[2] === w);
  // a few more holes and steps
  for (let k = int(0, 2); k > 0; k--) { const x = int(0, X - 1), y = int(0, Y - 1); const w = int(0, W - 1); if (!onBar(x, y) && !onRamp(x, y, w)) cells[at(x, y, 0, w)] = EMPTY; }
  for (let k = int(1, 3); k > 0; k--) { const x = int(0, X - 1), y = int(0, Y - 1), w = int(0, W - 1); if (!onBar(x, y) && cells[at(x, y, 0, w)] && cells[at(x, y, 1, w)] === EMPTY) cells[at(x, y, 1, w)] = SOLID; }
  // a ledge two high along one end, to want a crate (sometimes)
  if (rnd() < 0.4) { const x = pick([0, X - 1]), w = int(0, W - 1); for (let y = 0; y < Y; y++) if (rnd() < 0.7) { cells[at(x, y, 1, w)] = SOLID; cells[at(x, y, 2, w)] = SOLID; } }
  const stand = (x, y, w) => cells[at(x, y, 0, w)] === SOLID && cells[at(x, y, 1, w)] === EMPTY && !ramp.some((r) => Math.abs(r[0] - x) <= 1 && r[1] === y);
  const free = (where) => { // somewhere you could stand: floor below, nothing in it
    for (let g = 0; g < 200; g++) { const x = int(0, X - 1), y = int(0, Y - 1), w = int(0, W - 1); if (stand(x, y, w) && (!where || where(x, y, w))) return [x, y, 1, w]; }
    return null;
  };
  // anchor posts on the outermost slices, so the hook can reach them along w from the slices between
  for (let k = int(...T.anchors); k > 0; k--) {
    const c = rnd() < 0.75 ? free((x, y, w) => (w === 0 || w === W - 1) && !onBar(x, y)) : free((x, y) => !onBar(x, y));
    if (c) cells[at(...c)] = ANCHOR;
  }
  // a plate, and a door across one of the first barrier's gaps
  const B0 = bars[0];
  if (rnd() < T.plates && !B0.chasm) {
    const c = free((x, y) => !onBar(x, y));
    const open = B0.has.map((h, w) => (h ? -1 : w)).filter((w) => w >= 0);
    if (c && open.length) { cells[at(c[0], c[1], 0, c[3])] = PLATE; const w = pick(open); for (let y = 0; y < Y; y++) { cells[at(B0.at, y, 1, w)] = DOOR; cells[at(B0.at, y, 2, w)] = SOLID; } }
  }
  const crates = [];
  for (let k = int(...T.crates); k > 0; k--) { const c = free(); if (c) { const i = at(...c); if (!crates.includes(i)) crates.push(i); } }
  // start and goal on opposite sides of the barriers, in slices where they stand
  const side = (x, y) => bars.map((B) => ((B.axis ? y : x) < B.at ? 0 : 1)).join();
  const s = free((x, y) => !onBar(x, y));
  if (!s) return null;
  const g = free((x, y, w) => !onBar(x, y) && bars.every((B) => ((B.axis ? y : x) < B.at) !== ((B.axis ? s[1] : s[0]) < B.at)) && w !== s[3]);
  if (!g) return null;
  const si = at(...s), gi = at(...g);
  if (si === gi || crates.includes(si) || crates.includes(gi) || side(s[0], s[1]) === side(g[0], g[1]) && bars.length === 1) return null;
  cells[gi] = GOAL;
  return { X, Y, Z, W, cells, start: si, crates, wrap: W >= 4 && rnd() < T.wrap };
}

/* what a solution does, for choosing the best of the rooms that pass */
function measure(world, moves) {
  let s = { p: world.start.p, crates: world.start.crates.slice() }, cratesMoved = 0;
  const slices = new Set([world.coords(s.p)[3]]);
  let rampSteps = 0;
  for (const ai of moves) {
    const n = world.act(s, ACTIONS[ai]);
    if (n.crates.join() !== s.crates.join()) cratesMoved++;
    if (ACTIONS[ai].kind === "walk" && world.coords(n.p)[3] !== world.coords(s.p)[3]) rampSteps++;
    s = n; slices.add(world.coords(s.p)[3]);
  }
  const wHooks = moves.filter((ai) => isW(ACTIONS[ai])).length, wMoves = wHooks + rampSteps;
  return { len: moves.length, wHooks, rampSteps, wMoves, cratesMoved, slices: slices.size, score: moves.length + 4 * wHooks + 3 * rampSteps + 3 * cratesMoved + 2 * slices.size };
}

export function generate(seed, tierName = "medium") {
  const T = TIERS[tierName], rnd = rng(seed);
  let best = null, kept = 0, tried = 0;
  for (; tried < T.tries && kept < T.keep; tried++) {
    const c = candidate(rnd, T);
    if (!c) continue;
    const world = new World(Object.assign({ name: "", hint: "" }, c));
    if (world.cells[world.start.p] === GOAL || !world.relaxedReach(true)) continue; // cheaply proved hopeless
    const sol = world.solve(() => true, T.limit);
    if (!sol.moves || sol.moves.length < T.len[0] || sol.moves.length > T.len[1]) continue;
    const m = measure(world, sol.moves);
    if (m.wMoves < T.minW || m.wHooks < T.minHooks) continue;
    if (world.relaxedReach(false)) { // the cheap proof that w is needed didn't hold: search for real
      const flat = world.solveFlat(T.limit);
      if (flat.moves || flat.states >= T.limit) continue; // only rooms PROVED to need w
    }
    kept++;
    if (!best || m.score > best.m.score) best = { world, m, par: sol.moves.length };
  }
  if (!best) return null;
  best.world.name = tierName + " " + seed.toString(36);
  const tm = (n, one) => n + " " + one + (n === 1 ? "" : "s"), m = best.m;
  best.world.hint = "A generated room, proved impossible without moving through w. The shortest way through " + [m.wHooks ? "hooks along w " + (m.wHooks === 1 ? "once" : m.wHooks + " times") : "", m.rampSteps ? "walks " + tm(m.rampSteps, "ramp step") : ""].filter(Boolean).join(" and ") + ".";
  return Object.assign(best, { tier: tierName, seed, tried });
}

/* ---------------------------------------------------------------- codes
   A room as a URL-safe string: a version letter, X Y Z W in base 36, then the
   cells run-length coded, a byte per run, then base64url.
     "B" (now): symbol << 4 | run − 1 (runs up to 16); symbols are the cell
         types (0–9, ramps included), 14 a crate, 15 you.
     "C" the same, for a room whose w wraps round.
     "D" and "E" the same again, for Anabasis's rooms (w a second down),
         without and with the wrap.
     "A" (the first links): symbol << 5 | run − 1 (runs up to 32); cell
         types 0–5, 6 a crate, 7 you. Still read, so old links still open. */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function b64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0), k = Math.min(3, bytes.length - i);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (k > 1 ? B64[(n >> 6) & 63] : "") + (k > 2 ? B64[n & 63] : "");
  }
  return out;
}
function unb64(s) {
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const v = [0, 1, 2, 3].map((j) => (i + j < s.length ? B64.indexOf(s[i + j]) : 0));
    if (v.some((x) => x < 0)) throw new Error("not a room code");
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3], k = Math.min(4, s.length - i);
    out.push((n >> 16) & 255); if (k > 2) out.push((n >> 8) & 255); if (k > 3) out.push(n & 255);
  }
  return out;
}
export function encode(world) {
  const sym = Array.from(world.cells);
  for (const c of world.start.crates) sym[c] = 14;
  sym[world.start.p] = 15;
  const bytes = [];
  for (let i = 0; i < sym.length;) { let r = 1; while (i + r < sym.length && sym[i + r] === sym[i] && r < 16) r++; bytes.push((sym[i] << 4) | (r - 1)); i += r; }
  return (world.gravW ? (world.wrap ? "E" : "D") : world.wrap ? "C" : "B") + [world.X, world.Y, world.Z, world.W].map((n) => n.toString(36)).join("") + b64(bytes);
}
export function decode(code, name = "a shared room") {
  if (!/^[A-E][0-9a-z]{4}[A-Za-z0-9_-]+$/.test(code)) throw new Error("not a room code");
  const v = code[0], bits = v === "A" ? 5 : 4, CRATE = v === "A" ? 6 : 14, YOU = v === "A" ? 7 : 15, top = v === "A" ? 5 : 9;
  const [X, Y, Zz, W] = code.slice(1, 5).split("").map((c) => parseInt(c, 36)), N = X * Y * Zz * W;
  if (!(X && Y && Zz && W) || N > 4096) throw new Error("not a room code");
  const sym = [];
  for (const b of unb64(code.slice(5))) for (let r = (b & ((1 << bits) - 1)) + 1; r > 0; r--) sym.push(b >> bits);
  if (sym.length !== N) throw new Error("a room code that's been cut short");
  const cells = new Uint8Array(N), crates = [];
  let start = -1;
  for (let i = 0; i < N; i++) { const t = sym[i]; if (t === CRATE) crates.push(i); else if (t === YOU) start = i; else if (t <= top) cells[i] = t; else throw new Error("not a room code"); }
  if (start < 0 || !cells.includes(GOAL)) throw new Error("a room with no start or no goal");
  return new World({ name, hint: "", X, Y, Z: Zz, W, cells, start, crates, wrap: v === "C" || v === "E", gravW: v === "D" || v === "E" });
}
