/* OOZE — the game's rules, its oracle, its levels. No DOM.

   The world is AMOEBA's 4D floor: a 3D space (x, z, w) the cell crawls across, y up. A level is a start, a goal (a ball
   on the floor: reach it with the cell's middle), walls (boxes standing on the floor, which the membrane and the nucleus
   can't enter), food, and the energy the cell sets out with. Crawling costs energy (about one unit a radius, measured:
   the work of polymerisation, plus a little for being alive); food refills it; with none left the cell can't push a
   pseudopod and starves.

   THE ORACLE says whether a level can be done, and how hard it is:
   - where the cell fits: a grid over the floor (cells of GRID), a point free if it is at least CLEAR from every wall
     (the nucleus is the rigid part: its radius plus a margin; the membrane flows round anything);
   - the distances between the places that matter (start, each food, the goal), by Dijkstra over that grid (26
     neighbours, steps their true lengths);
   - then which food to eat, in what order: states (where, which eaten) holding the most energy you can have there,
     filled in order of how many have been eaten. A level is solvable if some state can reach the goal with energy
     to spare. Every leg is charged its length × COST (the measured cost a radius, with a margin for the turning and
     waiting a real pilot does).
   It returns the plan (the order, and the path through the grid, for a bot or a hint), the margin, how many foods are
   needed at the least, the route's length, how much of it runs through w, and the narrowest gap on it; and a
   difficulty out of 10 made of those.

   LEVELS: ten made by hand, each teaching one thing, and a generator (seeded, so a seed is a level) that builds a run
   of barriers with gaps in z or in w, pillars, and food, sets the energy so the food is needed, and keeps only what the
   oracle says can be done at the difficulty asked for. */

export const GRID = 0.25, CLEAR = 0.55, COST = 1.45, HEIGHT = 3;

/* ---------------------------------------------------------------- geometry on the floor (x, z, w) */
const boxDist = (p, B) => { let q = 0; for (let k = 0; k < 3; k++) { const v = Math.max(B.lo[k] - p[k], 0, p[k] - B.hi[k]); q += v * v; } return Math.sqrt(q); };
export function clearance(level, p) { let m = Infinity; for (const B of level.walls) m = Math.min(m, boxDist(p, B)); return m; }
/* the arena's own walls (so the cell can't wander off the map), from its bounds */
export function boundsWalls(level) {
  const [x0, x1] = level.size.x, [z0, z1] = level.size.z, [w0, w1] = level.size.w, t = 1, B = (lo, hi) => ({ lo, hi, edge: true });
  return [B([x0 - t, z0 - t, w0 - t], [x0, z1 + t, w1 + t]), B([x1, z0 - t, w0 - t], [x1 + t, z1 + t, w1 + t]), B([x0, z0 - t, w0 - t], [x1, z0, w1 + t]), B([x0, z1, w0 - t], [x1, z1 + t, w1 + t]), B([x0, z0, w0 - t], [x1, z1, w0]), B([x0, z0, w1], [x1, z1, w1 + t])];
}
export const allWalls = (level) => [...level.walls, ...boundsWalls(level)];
/* the walls as the engine wants them: 4D boxes (x, y, z, w), standing HEIGHT tall, and reaching below the floor (a
   point lying on the floor, y = 0, must count as inside a wall it has crawled into) */
export const engineWalls = (level) => allWalls(level).map((B) => ({ lo: [B.lo[0], -1, B.lo[1], B.lo[2]], hi: [B.hi[0], HEIGHT, B.hi[1], B.hi[2]], edge: !!B.edge }));

/* ---------------------------------------------------------------- the oracle */
export function oracle(level) {
  const walls = allWalls(level), [x0, x1] = level.size.x, [z0, z1] = level.size.z, [w0, w1] = level.size.w;
  const nx = Math.round((x1 - x0) / GRID) + 1, nz = Math.round((z1 - z0) / GRID) + 1, nw = Math.round((w1 - w0) / GRID) + 1, N = nx * nz * nw;
  const at = (i, j, k) => i + nx * (j + nz * k), pos = (c) => { const i = c % nx, j = Math.floor(c / nx) % nz, k = Math.floor(c / (nx * nz)); return [x0 + i * GRID, z0 + j * GRID, w0 + k * GRID]; };
  const clr = new Float32Array(N); for (let c = 0; c < N; c++) { const p = pos(c); let m = Infinity; for (const B of walls) m = Math.min(m, boxDist(p, B)); clr[c] = m; }
  const free = (c) => clr[c] >= CLEAR;
  const nearest = (p) => { const i = Math.max(0, Math.min(nx - 1, Math.round((p[0] - x0) / GRID))), j = Math.max(0, Math.min(nz - 1, Math.round((p[1] - z0) / GRID))), k = Math.max(0, Math.min(nw - 1, Math.round((p[2] - w0) / GRID)));
    let best = at(i, j, k), bd = Infinity; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let e = -2; e <= 2; e++) { const ii = i + a, jj = j + b, kk = k + e; if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= nz || kk >= nw) continue; const c = at(ii, jj, kk); if (!free(c)) continue; const q = pos(c), dd = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (dd < bd) { bd = dd; best = c; } } return best; };
  const nb = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) if (a || b || e) nb.push([a, b, e, GRID * Math.hypot(a, b, e)]);
  // Dijkstra from a cell over free cells (a binary heap in typed arrays; distances in doubles, so a node popped is
  // compared with exactly what was stored)
  const hk = new Float64Array(N * 8), hv = new Int32Array(N * 8);
  const dijkstra = (src) => {
    const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1); let n = 0;
    const push = (key, v) => { let i = n++; hk[i] = key; hv[i] = v; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; const tk = hk[p], tv = hv[p]; hk[p] = hk[i]; hv[p] = hv[i]; hk[i] = tk; hv[i] = tv; i = p; } };
    const pop = () => { const v = hv[0]; n--; hk[0] = hk[n]; hv[0] = hv[n]; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < n && hk[l] < hk[m]) m = l; if (r < n && hk[r] < hk[m]) m = r; if (m === i) break; const tk = hk[m], tv = hv[m]; hk[m] = hk[i]; hv[m] = hv[i]; hk[i] = tk; hv[i] = tv; i = m; } return v; };
    dist[src] = 0; push(0, src);
    while (n > 0) { const dd = hk[0], c = pop(); if (dd > dist[c]) continue; const i = c % nx, j = Math.floor(c / nx) % nz, k = Math.floor(c / (nx * nz));
      for (let q = 0; q < nb.length; q++) { const [a, b, e, l] = nb[q], ii = i + a, jj = j + b, kk = k + e; if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= nz || kk >= nw) continue; const m = at(ii, jj, kk); if (!free(m)) continue; const nd = dd + l; if (nd < dist[m]) { dist[m] = nd; prev[m] = c; if (n < hk.length) push(nd, m); } } }
    return { dist, prev };
  };
  // the places that matter: 0 start, 1..F food, F+1 goal
  const keys = [level.start, ...level.foods, level.goal.c].map(nearest), K = keys.length, G = K - 1, F = level.foods.length;
  const runs = keys.map((c) => (free(c) ? dijkstra(c) : null));
  const D = keys.map((_, a) => keys.map((c, b) => (runs[a] ? runs[a].dist[c] : Infinity)));
  // the goal is a ball: reaching its edge will do, so legs to it are shortened by its radius
  for (let a = 0; a < K; a++) D[a][G] = Math.max(0, D[a][G] - level.goal.r * 0.8);
  // which food, in what order: best[node][mask] = the most energy you can have standing there
  const M = 1 << F, best = Array.from({ length: K }, () => new Float64Array(M).fill(-Infinity)), from = Array.from({ length: K }, () => new Int32Array(M).fill(-1));
  best[0][0] = level.E0;
  const order = [...Array(M).keys()].sort((a, b) => popcount(a) - popcount(b));
  let win = null;
  for (const mask of order) for (let a = 0; a < K - 1; a++) {
    const e = best[a][mask]; if (e === -Infinity) continue;
    // to the goal from here?
    const eg = e - COST * D[a][G]; if (eg >= 0 && (!win || popcount(mask) < popcount(win.mask) || (popcount(mask) === popcount(win.mask) && eg > win.left))) win = { a, mask, left: eg };
    for (let f = 0; f < F; f++) { if (mask & (1 << f)) continue; const b = f + 1, e2 = e - COST * D[a][b]; if (e2 < 0) continue; const e3 = Math.min(level.eMax ?? Infinity, e2 + level.foodE), m2 = mask | (1 << f); if (e3 > best[b][m2]) { best[b][m2] = e3; from[b][m2] = a; } }
  }
  if (!win) return { solvable: false, keys, D, grid: { nx, nz, nw, x0, z0, w0 } };
  // the plan back from the winning state, and its path through the grid
  const seq = [G]; let a = win.a, mask = win.mask; while (a !== 0 || mask !== 0) { seq.push(a); const p = from[a][mask]; mask &= ~(1 << (a - 1)); a = p; } seq.push(0); seq.reverse();
  // (the margin: the least energy left on arrival anywhere along the plan, against what it started with)
  let e = level.E0, minLeft = Infinity, length = 0, wMove = 0, narrow = Infinity; const path = [];
  for (let s = 0; s + 1 < seq.length; s++) {
    const u = seq[s], v = seq[s + 1]; e -= COST * D[u][v]; minLeft = Math.min(minLeft, e); length += D[u][v]; if (v !== G) e = Math.min(level.eMax ?? Infinity, e + level.foodE);
    // the leg's cells, from the run out of u
    const leg = []; let c = keys[v]; while (c !== -1 && c !== keys[u]) { leg.push(c); c = runs[u].prev[c]; } leg.push(keys[u]); leg.reverse();
    for (let q = 1; q < leg.length; q++) { const p0 = pos(leg[q - 1]), p1 = pos(leg[q]); wMove += Math.abs(p1[2] - p0[2]); narrow = Math.min(narrow, clr[leg[q]]); }
    for (const c2 of leg) { const p = pos(c2); if (!path.length || path[path.length - 1].some((x, k) => x !== p[k])) path.push(p); }
  }
  const straight = Math.hypot(...level.goal.c.map((x, k) => x - level.start[k]));
  const out = { solvable: true, plan: seq, foodsNeeded: popcount(win.mask), margin: minLeft / level.E0, length, tortuous: length / Math.max(1, straight), wShare: wMove / Math.max(1e-9, length), narrow, path };
  out.difficulty = rate(out, level);
  return out;
}
function popcount(m) { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; }
/* difficulty /10: how far, how many stops for food, how little to spare, how winding, how much of it through w, how
   tight the tightest gap */
export function rate(o, level) {
  const len = Math.min(1, o.length / 30), food = Math.min(1, o.foodsNeeded / 5), tight = Math.max(0, Math.min(1, (0.6 - o.margin) / 0.6)), wind = Math.min(1, (o.tortuous - 1) / 1.2), w = Math.min(1, o.wShare / 0.5), gap = Math.max(0, Math.min(1, (1.2 - o.narrow) / 0.6));
  void level;
  return Math.round(10 * Math.min(1, 0.22 * len + 0.22 * food + 0.18 * tight + 0.14 * wind + 0.14 * w + 0.1 * gap) * 10) / 10;
}

/* ---------------------------------------------------------------- the ten
   In the order they teach, each harder than the last (the selftest holds both). Each one's E0 is 1.3 × the least the
   oracle needs, rounded up to a half; and where there is food, the level can't be done without it */
const L = (o) => ({ size: { x: [-2, 10], z: [-3, 3], w: [-3, 3] }, start: [0, 0, 0], walls: [], foods: [], foodE: 10, eMax: 16, ...o });
export const INTRO = [
  L({ name: "First crawl", hint: "Press and hold the smell sphere where you want to go. The goal glows ahead, along x.", goal: { c: [6, 0, 0], r: 0.9 }, E0: 10 }),
  L({ name: "Hungry", hint: "Not enough to get there. Eat on the way: crawl over the green morsel and close round it.", size: { x: [-2, 13], z: [-3, 3], w: [-3, 3] }, goal: { c: [10, 0, 0], r: 0.9 }, foods: [[5, 0, 0]], E0: 9.5 }),
  L({ name: "Squeeze", hint: "A gap only just wider than your nucleus. Line up and push straight through.", size: { x: [-2, 10], z: [-3, 3], w: [-3, 3] }, goal: { c: [7, 0, 0], r: 0.9 }, walls: [{ lo: [3, -3, -3], hi: [3.6, -0.6, 3] }, { lo: [3, 0.6, -3], hi: [3.6, 3, 3] }, { lo: [3, -0.6, -3], hi: [3.6, 0.6, -0.6] }, { lo: [3, -0.6, 0.6], hi: [3.6, 0.6, 3] }], E0: 12 }),
  L({ name: "Ana", hint: "The goal isn't in your slice: it's ana, +w. Steer toward w on the sphere (or slide your slice to see it).", size: { x: [-2, 8], z: [-3, 3], w: [-3, 5] }, goal: { c: [4, 0, 3.5], r: 0.9 }, E0: 9 }),
  L({ name: "Off to one side", hint: "The food isn't on your line. Go and get it: a detour that pays for itself.", size: { x: [-2, 13], z: [-4, 4], w: [-3, 3] }, goal: { c: [10, 0, 0], r: 0.9 }, foods: [[4, 3, 0]], E0: 10 }),
  L({ name: "Two ways", hint: "A short way straight through, with nothing to eat, and a long way round the side past food. Only one gets you there.", size: { x: [-2, 13], z: [-5, 5], w: [-3, 3] }, goal: { c: [10, 0, 0], r: 0.9 }, walls: [{ lo: [5, -5, -3], hi: [5.6, -0.8, 3] }, { lo: [5, 0.8, -3], hi: [5.6, 3, 3] }], foods: [[2.5, 4, 0], [7.5, 4, 0]], E0: 9.5 }),
  L({ name: "The wall", hint: "A wall across your whole view, every z. In 4D that isn't the end of it: it stops short in w. Go round, ana.", size: { x: [-2, 10], z: [-3, 3], w: [-4, 4] }, goal: { c: [7, 0, 0], r: 0.9 }, walls: [{ lo: [3, -3, -4], hi: [3.6, 3, 1.2] }], E0: 15 }),
  L({ name: "Larder", hint: "The food is spread through w. You'll need more than one; plan the round.", size: { x: [-2, 13], z: [-3, 3], w: [-4, 4] }, goal: { c: [11, 0, 0], r: 0.9 }, foods: [[3, 0, 3], [6, 0, -3], [9, 0, 3]], E0: 8 }),
  L({ name: "Kata and back", hint: "Two walls, open on opposite sides in w. Weave: ana round the first, kata round the second.", size: { x: [-2, 13], z: [-3, 3], w: [-4, 4] }, goal: { c: [10.5, 0, 0], r: 0.9 }, walls: [{ lo: [3, -3, -4], hi: [3.6, 3, 1.2] }, { lo: [6.5, -3, -1.2], hi: [7.1, 3, 4] }], foods: [[5, 0, 2.5]], E0: 15.5 }),
  L({ name: "Hyphae", hint: "Walls in z and w, food behind them. Everything so far, at once.", size: { x: [-2, 16], z: [-4, 4], w: [-4, 4] }, goal: { c: [14, 0, 0], r: 0.9 }, walls: [{ lo: [3, -4, -4], hi: [3.6, 4, 1] }, { lo: [7, -4, -1], hi: [7.6, 4, 4] }, { lo: [11, -4, -4], hi: [11.6, 1, 4] }], foods: [[5, 0, 2.6], [9, 0, -2.6], [12.8, 2.6, 0]], E0: 12.5 }),
];

/* ---------------------------------------------------------------- the generator */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* a level from a seed, at a difficulty (0..1): barriers across x, each with a gap in z or in w (or a pillar field),
   food round about, and energy set so the food is needed. Tried again (the next seed along) until the oracle says it
   can be done at about that difficulty */
export function generate(seed, diff = 0.5, tries = 40) {
  for (let t = 0; t < tries; t++) {
    const R = rng(seed * 7919 + t * 104729 + 1), lv = build(R, diff);
    lv.name = `Seed ${seed}`; lv.seed = seed;
    const o = oracle(lv);
    if (o.solvable && Math.abs(o.difficulty / 10 - diff) < 0.22 + t * 0.01) return { level: lv, oracle: o };
  }
  return null;
}
function build(R, diff) {
  const length = 8 + Math.round(12 * diff + 4 * R()), Z = 3 + Math.round(2 * R()), W = 3 + Math.round(2 * diff * R() + 1);
  const lv = { size: { x: [-2, length + 2], z: [-Z, Z], w: [-W, W] }, start: [0, 0, 0], goal: { c: [length, (R() - 0.5) * Z, (R() - 0.5) * W], r: 0.9 }, walls: [], foods: [], foodE: 10, eMax: 16 };
  const nBar = Math.round(1 + 4 * diff * (0.6 + 0.4 * R())), thick = 0.6;
  for (let b = 0; b < nBar; b++) {
    const x = 2.5 + ((b + 0.5) * (length - 4)) / nBar + (R() - 0.5), gapW = 1.3 + 1.2 * (1 - diff) * R(), kind = R();
    if (kind < 0.45) { // a gap in w: a wall over every z, stopping short ana or kata
      const up = R() < 0.5, edge = (up ? 1 : -1) * (W - gapW);
      lv.walls.push(up ? { lo: [x, -Z, -W], hi: [x + thick, Z, edge] } : { lo: [x, -Z, edge], hi: [x + thick, Z, W] });
    } else if (kind < 0.8) { // a gap in z: a wall over every w, with a slot
      const zc = (R() - 0.5) * (2 * Z - gapW - 1);
      lv.walls.push({ lo: [x, -Z, -W], hi: [x + thick, zc - gapW / 2, W] }, { lo: [x, zc + gapW / 2, -W], hi: [x + thick, Z, W] });
    } else { // a window: a hole in both z and w at once
      const zc = (R() - 0.5) * (2 * Z - gapW - 1), wc = (R() - 0.5) * (2 * W - gapW - 1), h = gapW / 2;
      lv.walls.push({ lo: [x, -Z, -W], hi: [x + thick, zc - h, W] }, { lo: [x, zc + h, -W], hi: [x + thick, Z, W] }, { lo: [x, zc - h, -W], hi: [x + thick, zc + h, wc - h] }, { lo: [x, zc - h, wc + h], hi: [x + thick, zc + h, W] });
    }
  }
  // food: between the barriers, somewhere free
  const nFood = Math.round(1 + 4 * diff + R());
  for (let f = 0; f < nFood * 3 && lv.foods.length < nFood; f++) { const p = [1.5 + R() * (length - 2), (R() - 0.5) * (2 * Z - 1.5), (R() - 0.5) * (2 * W - 1.5)]; if (clearance(lv, p) > 0.9 && lv.foods.every((q) => Math.hypot(...q.map((x, k) => x - p[k])) > 2)) lv.foods.push(p); }
  // the energy: enough for a part of the way without food, the rest to be eaten for (harder: less of it)
  const o0 = oracle({ ...lv, E0: 1e9 }); if (!o0.solvable) return { ...lv, E0: 1 };
  lv.E0 = Math.max(4, Math.round(COST * o0.length * (1.05 - 0.6 * diff) * 10) / 10);
  if (lv.E0 > lv.eMax) lv.eMax = Math.ceil(lv.E0 + 2);
  return lv;
}
