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

  function generateFoam(o) {
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

  const api = { generateFoam };
  root.HOOPFOAM = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
