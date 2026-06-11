// hoop/foam.js — layered, braced, navigable cellular structure generator.
//
// The structure is the network of cell EDGES (a space-frame / "monster truss"); the
// wall PLATES that span the cells seal compartments, carry local pressure, and
// partition rooms — they are not in the global load path (conservative). Doors and
// stairs are openings in those plates, so they never cut a structural edge: every
// chamber can reach all its neighbours without weakening the skeleton.
//
// Generation (geometry + the navigation graph) lives here so it runs in the browser
// AND headless in node. Structural SCORING is the Rust/wasm frame solver
// (solve_frame_json) — this module emits a ready-to-solve frame model.
//
// Coordinates: x = axial (along the cylinder, [0,width]); y = radial ([0,thickness])
// with y=0 the inner livable surface (core-ward) and y=thickness the hull (anchored,
// where the outward spin-load lands). Curvature is ignored — at "huge" radius a shell
// patch is essentially a flat slab.
(function (root) {
  'use strict';

  function gridGen(o) {
    const W = o.width, T = o.thickness, L = Math.max(1, o.layers | 0);
    const roomSize = Math.max(1e-3, o.roomSize), wallT = Math.max(1e-6, o.wallT);
    const grade = Math.max(0, Math.min(1, o.grade == null ? 0 : o.grade));
    const brace = o.brace || 'diag';
    const E = o.e || 200e9, pEff = o.pEff || 1e5;
    const nx = Math.max(1, Math.round(W / roomSize));

    // graded row heights: rows thin toward the hull (high k) when grade>0 — denser
    // structure where the radial stress is highest (bone / Wolff's law).
    const wts = [];
    for (let k = 0; k < L; k++) wts.push(1 - 0.6 * grade * (L > 1 ? k / (L - 1) : 0));
    const wsum = wts.reduce((a, b) => a + b, 0);
    const yb = [0];
    for (let k = 0; k < L; k++) yb.push(yb[k] + T * wts[k] / wsum); // yb[L] === T
    const xs = [];
    for (let i = 0; i <= nx; i++) xs.push(W * i / nx);

    const node = (i, k) => k * (nx + 1) + i;
    const nodes = [];
    for (let k = 0; k <= L; k++) for (let i = 0; i <= nx; i++) nodes.push({ x: xs[i], y: yb[k] });

    // edges = the structural frame
    const walls = [];
    for (let k = 0; k <= L; k++) for (let i = 0; i < nx; i++) walls.push({ a: node(i, k), b: node(i + 1, k), kind: 'floor' });
    for (let k = 0; k < L; k++) for (let i = 0; i <= nx; i++) walls.push({ a: node(i, k), b: node(i, k + 1), kind: 'partition' });
    for (let k = 0; k < L; k++) for (let i = 0; i < nx; i++) {
      if (brace === 'diag') {
        const flip = (i + k) % 2 === 0; // alternate so the lattice isn't biased
        walls.push(flip ? { a: node(i, k), b: node(i + 1, k + 1), kind: 'brace' }
                        : { a: node(i + 1, k), b: node(i, k + 1), kind: 'brace' });
      } else if (brace === 'x') {
        walls.push({ a: node(i, k), b: node(i + 1, k + 1), kind: 'brace' });
        walls.push({ a: node(i + 1, k), b: node(i, k + 1), kind: 'brace' });
      }
    }

    // cells + the navigation graph (dual of the wall mesh)
    const cellId = (i, k) => k * nx + i;
    const cells = [];
    for (let k = 0; k < L; k++) for (let i = 0; i < nx; i++) {
      cells.push({ id: cellId(i, k), col: i, layer: k, cx: (xs[i] + xs[i + 1]) / 2, cy: (yb[k] + yb[k + 1]) / 2 });
    }
    const portals = [];
    for (let k = 0; k < L; k++) for (let i = 0; i < nx; i++) {
      if (i < nx - 1) portals.push({ a: cellId(i, k), b: cellId(i + 1, k), kind: 'door', x: xs[i + 1], y: (yb[k] + yb[k + 1]) / 2 });
      if (k < L - 1) portals.push({ a: cellId(i, k), b: cellId(i, k + 1), kind: 'stair', x: (xs[i] + xs[i + 1]) / 2, y: yb[k + 1] });
    }
    // verify navigability (union-find) — every chamber reachable?
    const par = cells.map((_, i) => i);
    const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    portals.forEach((p) => { par[find(p.a)] = find(p.b); });
    const components = new Set(cells.map((_, i) => find(i))).size;

    // emit the frame model for solve_frame_json: anchor the hull row, push the inner
    // row outward (radial compression) with a small lateral term to exercise shear.
    const area = wallT, inertia = wallT * wallT * wallT / 12, c = wallT / 2;
    const fnodes = nodes.map((n) => ({ pos: [n.x, n.y], fix: [false, false, false], load: [0, 0, 0] }));
    for (let i = 0; i <= nx; i++) { const id = node(i, L); fnodes[id].fix = [true, true, true]; }   // hull anchored
    const perNode = W / nx;
    for (let i = 0; i <= nx; i++) { const id = node(i, 0); fnodes[id].load = [0.05 * pEff * perNode, pEff * perNode, 0]; }
    const members = walls.map((w) => ({ i: w.a, j: w.b, e: E, area, inertia, c }));

    let wallLen = 0;
    for (const w of walls) { const A = nodes[w.a], B = nodes[w.b]; wallLen += Math.hypot(B.x - A.x, B.y - A.y); }
    const relDensity = wallLen * wallT / (W * T);

    return {
      nodes, walls, cells, portals,
      nav: { connected: components === 1, components, cellCount: cells.length,
             doors: portals.filter((p) => p.kind === 'door').length,
             stairs: portals.filter((p) => p.kind === 'stair').length },
      frame: { nodes: fnodes, members },
      meta: { nx, layers: L, relDensity, wallLen, rowY: yb, brace },
    };
  }

  // ── organic froth: graded seeds → Lloyd-relaxed Voronoi (per-cell half-plane
  //    clipping, so no Delaunay needed) → cell walls. Same output shape as the grid;
  //    the Voronoi adjacency (cells sharing a wall) IS the navigation graph. ──
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // deterministic hash (FNV-1a-ish) for tileable block seeding + seam placement
  function fnv() { let h = 2166136261 >>> 0; for (let i = 0; i < arguments.length; i++) { h ^= arguments[i] >>> 0; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rnd(h) { return (h >>> 0) / 4294967296; }
  function clipHP(poly, nx, ny, mx, my) { // keep the half-plane closer to the seed
    const out = [], N = poly.length, side = (p) => (p.x - mx) * nx + (p.y - my) * ny;
    for (let i = 0; i < N; i++) {
      const A = poly[i], B = poly[(i + 1) % N], sa = side(A), sb = side(B);
      if (sa <= 1e-9) out.push(A);
      if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) { const t = sa / (sa - sb); out.push({ x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) }); }
    }
    return out;
  }
  function voronoi(seeds, W, T) {
    return seeds.map((s, i) => {
      let poly = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: T }, { x: 0, y: T }];
      for (let j = 0; j < seeds.length && poly.length >= 3; j++) {
        if (j === i) continue; const t = seeds[j];
        poly = clipHP(poly, t.x - s.x, t.y - s.y, (s.x + t.x) / 2, (s.y + t.y) / 2);
      }
      return poly;
    });
  }
  function centroid(poly) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], cr = p.x * q.y - q.x * p.y; a += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr; }
    if (Math.abs(a) < 1e-9) { let mx = 0, my = 0; poly.forEach((p) => { mx += p.x; my += p.y; }); return { x: mx / poly.length, y: my / poly.length }; }
    return { x: cx / (3 * a), y: cy / (3 * a) };
  }
  function frothGen(o) {
    const W = o.width, T = o.thickness, L = Math.max(1, o.layers | 0);
    const room = Math.max(1e-3, o.roomSize), wallT = Math.max(1e-6, o.wallT);
    const grade = Math.max(0, Math.min(1, o.grade == null ? 0 : o.grade)), E = o.e || 200e9, pEff = o.pEff || 1e5;
    const nx = Math.max(2, Math.round(W / room)), RELAX = o.relax == null ? 4 : o.relax;
    const wts = []; for (let k = 0; k < L; k++) wts.push(1 - 0.6 * grade * (L > 1 ? k / (L - 1) : 0));
    const ws = wts.reduce((a, b) => a + b, 0), yb = [0];
    for (let k = 0; k < L; k++) yb.push(yb[k] + T * wts[k] / ws);
    // seed a jittered, radially-graded grid, then Lloyd-relax toward Plateau (120°)
    const rng = mulberry(o.blockIndex != null ? fnv(o.seed || 0, o.blockIndex, nx, L) : 9001 + nx * 131 + L * 17);
    let seeds = [];
    for (let k = 0; k < L; k++) for (let i = 0; i < nx; i++) {
      const x = (i + 0.5 + 0.7 * (rng() - 0.5)) * W / nx, y = yb[k] + (0.5 + 0.7 * (rng() - 0.5)) * (yb[k + 1] - yb[k]);
      seeds.push({ x: Math.max(1, Math.min(W - 1, x)), y: Math.max(1, Math.min(T - 1, y)) });
    }
    for (let it = 0; it < RELAX; it++) {
      seeds = voronoi(seeds, W, T).map((poly, idx) => { if (poly.length < 3) return seeds[idx]; const c = centroid(poly); return { x: Math.max(1, Math.min(W - 1, c.x)), y: Math.max(1, Math.min(T - 1, c.y)) }; });
    }
    const polys = voronoi(seeds, W, T);
    // dedup vertices + edges; an edge shared by two cells is an interior wall + adjacency
    const r = Math.max(0.5, room * 0.02), vmap = new Map(), nodes = [];
    const vid = (p) => { const k = Math.round(p.x / r) + '_' + Math.round(p.y / r); if (vmap.has(k)) return vmap.get(k); const id = nodes.length; nodes.push({ x: p.x, y: p.y }); vmap.set(k, id); return id; };
    const edgeMap = new Map(), cells = [];
    polys.forEach((poly, ci) => {
      if (poly.length < 3) { cells.push(null); return; }
      const c = centroid(poly); let layer = 0; for (let k = 0; k < L; k++) if (c.y >= yb[k] && c.y <= yb[k + 1]) { layer = k; break; }
      cells.push({ id: ci, cx: c.x, cy: c.y, layer });
      for (let i = 0; i < poly.length; i++) {
        const a = vid(poly[i]), b = vid(poly[(i + 1) % poly.length]); if (a === b) continue;
        const ek = a < b ? a + '_' + b : b + '_' + a; let e = edgeMap.get(ek);
        if (!e) { e = { a, b, cells: [] }; edgeMap.set(ek, e); } if (e.cells.indexOf(ci) < 0) e.cells.push(ci);
      }
    });
    const walls = [], portals = [];
    edgeMap.forEach((e) => {
      const len = Math.hypot(nodes[e.a].x - nodes[e.b].x, nodes[e.a].y - nodes[e.b].y);
      if (len < r) return; // drop slivers from dedup
      walls.push({ a: e.a, b: e.b, kind: 'wall' });
      if (e.cells.length === 2) {
        const A = cells[e.cells[0]], B = cells[e.cells[1]];
        if (A && B) portals.push({ a: A.id, b: B.id, kind: A.layer === B.layer ? 'door' : 'stair', x: (nodes[e.a].x + nodes[e.b].x) / 2, y: (nodes[e.a].y + nodes[e.b].y) / 2 });
      }
    });
    const valid = cells.filter(Boolean), par = {};
    valid.forEach((c) => { par[c.id] = c.id; });
    const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    portals.forEach((p) => { if (par[p.a] != null && par[p.b] != null) par[find(p.a)] = find(p.b); });
    const components = new Set(valid.map((c) => find(c.id))).size;
    // frame model: anchor hull-side vertices, push inner-side vertices outward
    const area = wallT, inertia = wallT * wallT * wallT / 12, c2 = wallT / 2;
    const fnodes = nodes.map((n) => ({ pos: [n.x, n.y], fix: [false, false, false], load: [0, 0, 0] }));
    nodes.forEach((n, i) => { if (n.y >= T * 0.94) fnodes[i].fix = [true, true, true]; });
    const inner = nodes.map((n, i) => i).filter((i) => nodes[i].y <= T * 0.06);
    const per = pEff * W / Math.max(1, inner.length);
    inner.forEach((i) => { fnodes[i].load = [0.05 * per, per, 0]; });
    const members = walls.map((w) => ({ i: w.a, j: w.b, e: E, area, inertia, c: c2 }));
    let wallLen = 0; walls.forEach((w) => { wallLen += Math.hypot(nodes[w.a].x - nodes[w.b].x, nodes[w.a].y - nodes[w.b].y); });
    return {
      nodes, walls, cells: valid, portals,
      nav: { connected: components === 1, components, cellCount: valid.length, doors: portals.filter((p) => p.kind === 'door').length, stairs: portals.filter((p) => p.kind === 'stair').length },
      frame: { nodes: fnodes, members },
      meta: { nx, layers: L, relDensity: wallLen * wallT / (W * T), wallLen, rowY: yb, mode: 'froth' },
    };
  }

  // ── annular sector: warp a flat foam into a wedge of the ring [R-T, R] × Δθ and
  //    re-apply boundary conditions as a periodic unit cell — radial centrifugal load
  //    on the inner face, balanced by HOOP TENSION pulled on the two angular end faces
  //    (the rest of the ring). The solve then shows whether the *cellular* hull carries
  //    that hoop, not just an idealised membrane. Nodes warp to (r·sinθ, r·cosθ): radial
  //    out = +y on screen (toward the hull, "down"). ──
  function toAnnulus(f, o) {
    const R = o.R, T = o.thickness, rIn = Math.max(1, R - T), W = o.width, dth = W / R, half = dth / 2;
    const pEff = o.pEff || 1e5;
    const wn = f.nodes.map((n) => { const r = rIn + n.y, th = (n.x / W - 0.5) * dth; return { x: r * Math.sin(th), y: r * Math.cos(th), r, th }; });
    const fnodes = wn.map((w) => ({ pos: [w.x, w.y], fix: [false, false, false], load: [0, 0, 0] }));
    const inner = [], endP = [], endM = [];
    f.nodes.forEach((n, i) => {
      if (n.y <= T * 0.06) inner.push(i);
      if (n.x <= W * 0.02) endM.push(i); else if (n.x >= W * 0.98) endP.push(i);
    });
    // radial centrifugal load on the inner face (outward = +radial = (sinθ, cosθ))
    const totalRadial = pEff * W, Lr = inner.length ? totalRadial / inner.length : 0;
    inner.forEach((i) => { const th = wn[i].th; fnodes[i].load[0] += Lr * Math.sin(th); fnodes[i].load[1] += Lr * Math.cos(th); });
    // hoop tension on each end face (tangential = (cosθ, -sinθ)); net of the two ends
    // is radially inward 2·T·sin(half), balancing the outward load.
    // hoop tension: use the analytic value from the cross-section model when provided
    // (closes the loop — T = σ_hoop·shell = p_eff·R), else fall back to force balance.
    const Thoop = o.hoopTension != null ? o.hoopTension : totalRadial / (2 * Math.max(1e-3, Math.sin(half)));
    const applyEnd = (arr, sgn) => { const per = arr.length ? Thoop / arr.length : 0; arr.forEach((i) => { const th = wn[i].th; fnodes[i].load[0] += sgn * per * Math.cos(th); fnodes[i].load[1] += sgn * per * (-Math.sin(th)); }); };
    applyEnd(endP, +1); applyEnd(endM, -1);
    // pin rigid-body modes: inner-mid (ux,uy) + outer-mid (ux, kills rotation about it)
    const near = (tx, ty) => { let b = 0, bd = Infinity; f.nodes.forEach((n, i) => { const d = (n.x - tx) ** 2 + (n.y - ty) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
    fnodes[near(W / 2, 0)].fix = [true, true, false];
    fnodes[near(W / 2, T)].fix[0] = true;
    const warpPt = (px2, py2) => { const r = rIn + py2, th = (px2 / W - 0.5) * dth; return { x: r * Math.sin(th), y: r * Math.cos(th) }; };
    return {
      nodes: wn.map((w) => ({ x: w.x, y: w.y })),
      walls: f.walls,
      cells: f.cells.map((c) => { const w = warpPt(c.cx, c.cy); return Object.assign({}, c, { cx: w.x, cy: w.y }); }),
      portals: f.portals.map((p) => Object.assign({}, p, warpPt(p.x, p.y))),
      nav: f.nav,
      frame: { nodes: fnodes, members: f.frame.members },
      meta: Object.assign({}, f.meta, { annular: true, R, rIn, dth }),
    };
  }

  // Cross-block continuity: a block clips to its box, so its left/right faces are
  // straight seam bulkheads that abut the neighbour exactly. The only thing that must
  // *match* across the seam is the connecting hatch — placed at a y derived from the
  // SHARED seam id (block bx's right seam id = bx+1 = block bx+1's left seam id), so both
  // neighbours put the hatch on the same floor. Deterministic from (seed, seamId).
  function addSeamHatches(f, o) {
    const L = f.meta.layers, yb = f.meta.rowY, seed = o.seed || 0, W = o.width;
    const seamY = (id) => { const k = Math.floor(rnd(fnv(seed, id, 7)) * L); return (yb[k] + yb[k + 1]) / 2; };
    f.portals.push({ kind: 'seam', side: 'L', seamId: o.blockIndex, x: 0, y: seamY(o.blockIndex) });
    f.portals.push({ kind: 'seam', side: 'R', seamId: o.blockIndex + 1, x: W, y: seamY(o.blockIndex + 1) });
    f.meta.blockIndex = o.blockIndex;
  }

  function generateFoam(o) {
    const f = (o.mode || 'grid') === 'froth' ? frothGen(o) : gridGen(o);
    if (o.blockIndex != null) addSeamHatches(f, o);
    return o.annular && o.R ? toAnnulus(f, o) : f;
  }

  const api = { generateFoam };
  root.HOOPFOAM = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
