// rind/wayfind.js — wayfinding in the foam: drivable spiral ramps + azimuthal roads.
//
// The foam shell is a graph: chambers are vertices, shared walls are edges (the same
// adjacency the frame solver stiffens). A ROAD for a vehicle is a chain of adjacent
// chambers hugging an ideal deck curve:
//   · spiral RAMP — a corkscrew around a RADIAL axis (the parking-garage spiral): loop
//     in the (azimuthal, axial) plane at radius ρ while climbing radially at deck grade
//     g, so r advances g·ρ per radian of winding. Spin gravity points along +r̂, so a
//     vehicle drives the loop level-ish and gains g of slope — hull-ward is downhill,
//     core-ward uphill. One ramp threads the full shell depth in ~|Δr|/(2π·g·ρ) turns.
//   · azimuthal ROAD — constant radius: a level street around the ring.
//
// findSpiralRamp() finds the corkscrew constructively: walk the ideal helix waypoint by
// waypoint (16 per turn) and chain each to the next through a bounded local search over
// graph-adjacent chambers near the deck. findRoad() runs a corridor-confined A* between
// a chamber ON one ramp's chain and a chamber ON the other's, strictly monotone in
// azimuth at near-constant radius. A found chain is a certificate: every chamber centre
// within ~1.4 cells of the deck (chambers are ~1 cell wide), consecutive chambers
// graph-adjacent — so the smooth deck provably threads the chain.
//
// Why this works "just about anywhere": the seeds come from a jittered grid — each grid
// site holds at most one seed, displaced ≤ ¼·cell per axis — and the adjacency
// threshold is 1.85·cell while two surviving face-adjacent sites are at most
// √(1.5² + 0.5² + 0.5²) ≈ 1.66·cell apart. So wherever the density thinning spares the
// sites, grid connectivity survives, and a corridor a couple of cells wide holds
// several parallel candidate chains. proveAnywhere() measures the realised success
// rate over random anchors. Runs in node and the browser (no DOM, no rendering).
(function (root) {
  'use strict';

  // ── the sector foam — single source for foamview's cylinder scene AND the tests.
  //    x = axial, y = circumferential arc, z = radial depth; graded denser toward the
  //    hull; deterministic from the seed. ──
  function sectorFoam(o) {
    const Ri = o.Ri, T = o.T, cell = o.cell, arcDeg = o.arcDeg, axial = o.axial, grade = o.grade;
    const arcRad = arcDeg * Math.PI / 180, arcLen = Ri * arcRad, Lx = axial * cell;
    const nx = Math.max(1, axial), ny = Math.max(4, Math.round(arcLen / cell)), nz = Math.max(2, Math.round(T / cell));
    let a = (o.seed >>> 0) || 1; const rng = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const raw = [];
    for (let iz = 0; iz < nz; iz++) { const zc = (iz + 0.5) / nz, dens = 1 + grade * zc; for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) { if (rng() > dens / (1 + grade)) continue; raw.push({ x: (ix + 0.5 + 0.5 * (rng() - 0.5)) * Lx / nx, y: (iy + 0.5 + 0.5 * (rng() - 0.5)) * arcLen / ny, z: (iz + 0.5 + 0.5 * (rng() - 0.5)) * T / nz }); } }
    const NC = raw.length;
    // 3D spatial-hash adjacency (face + edge neighbours → triangulated, stiff net)
    const bs = 1.9 * cell, gi = (v) => Math.floor(v / bs), bins = new Map();
    for (let i = 0; i < NC; i++) { const p = raw[i], k = gi(p.x) + '|' + gi(p.y) + '|' + gi(p.z); let b = bins.get(k); if (!b) { b = []; bins.set(k, b); } b.push(i); }
    const thr = (1.85 * cell) ** 2, mi = [], mj = [];
    for (let i = 0; i < NC; i++) { const p = raw[i], bx = gi(p.x), by = gi(p.y), bz = gi(p.z); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const b = bins.get((bx + dx) + '|' + (by + dy) + '|' + (bz + dz)); if (!b) continue; for (const j of b) { if (j <= i) continue; const q = raw[j], ddx = p.x - q.x, ddy = p.y - q.y, ddz = p.z - q.z; if (ddx * ddx + ddy * ddy + ddz * ddz < thr) { mi.push(i); mj.push(j); } } } }
    // wrap to the annulus sector (axis = world z = axial; arc centred on +X)
    const nodes = raw.map((p) => { const th = -arcRad / 2 + (p.y / arcLen) * arcRad, r = Ri + p.z; return { x: r * Math.cos(th), y: r * Math.sin(th), z: p.x, th, rad: p.z, circ: p.y }; });
    return { nodes, mi, mj, arcLen, arcRad, Lx, layers: nz, Ri, T, cell };
  }

  function buildNav(f) {
    const n = f.nodes.length, adj = Array.from({ length: n }, () => []);
    for (let m = 0; m < f.mi.length; m++) { adj[f.mi[m]].push(f.mj[m]); adj[f.mj[m]].push(f.mi[m]); }
    return { cells: f.nodes, adj, n, cell: f.cell, Ri: f.Ri, T: f.T, arcRad: f.arcRad, Lx: f.Lx };
  }

  // the ideal corkscrew deck of a ramp at winding angle phi ∈ [0, phiEnd]:
  // radius advances g·ρ per radian; the loop lives in the (azimuthal, axial) plane.
  function helixPoint(ramp, phi) {
    const r = ramp.r0 + ramp.dirR * ramp.g * ramp.rho * phi, ang = ramp.phase0 + phi;
    return { r, th: ramp.thc + ramp.rho * Math.cos(ang) / r, x: ramp.xc + ramp.rho * Math.sin(ang) };
  }

  // 3D chamber↔deck-point distance (azimuth measured as arc length)
  function distTo(nav, i, p) {
    const q = nav.cells[i], rq = nav.Ri + q.rad;
    return Math.hypot(rq - p.r, (q.th - p.th) * (rq + p.r) / 2, q.z - p.x);
  }

  // ── the spiral ramp: chain chambers along the corkscrew, waypoint by waypoint.
  //    o = { thc, xc (the radial axis), rho (loop radius), r0, r1 (climb span),
  //          g (deck grade), phase0 }. Fails (null) only if some waypoint has no
  //    chamber within tolerance reachable through the graph. ──
  function findSpiralRamp(nav, o) {
    const c = nav.cell, tol = 1.4 * c;
    const ramp = { thc: o.thc, xc: o.xc, rho: o.rho, r0: o.r0, r1: o.r1, g: o.g, phase0: o.phase0 || 0 };
    ramp.dirR = o.r1 >= o.r0 ? 1 : -1;
    const dphi = o.g * o.rho;                       // dr per radian of winding
    ramp.phiEnd = Math.abs(o.r1 - o.r0) / dphi;
    ramp.turns = ramp.phiEnd / (2 * Math.PI);
    const SPT = 16, N = Math.max(2, Math.ceil(ramp.turns * SPT));
    const steps = []; for (let i = 0; i <= N; i++) steps.push(helixPoint(ramp, ramp.phiEnd * i / N));
    // start: nearest chamber to the foot of the helix (scan once; the tube is tiny vs the foam)
    let cur = -1, bd = Infinity;
    for (let i = 0; i < nav.n; i++) { const d = distTo(nav, i, steps[0]); if (d < bd) { bd = d; cur = i; } }
    if (cur < 0 || bd > tol) return null;
    const chain = [cur], wp = [0];
    for (let i = 1; i <= N; i++) {
      const tgt = steps[i], prev = steps[i - 1];
      let best = cur, bdist = distTo(nav, cur, tgt);
      if (bdist > 0.95 * c) {
        // bounded local search: ≤ 4 hops over chambers near this deck segment
        const par = new Map([[cur, -1]]);
        let frontier = [cur];
        for (let depth = 0; depth < 5 && bdist > 0.95 * c; depth++) {
          const next = [];
          for (const u of frontier) for (const v of nav.adj[u]) {
            if (par.has(v)) continue;
            if (Math.min(distTo(nav, v, prev), distTo(nav, v, tgt)) > tol) continue;
            par.set(v, u); next.push(v);
            const dt = distTo(nav, v, tgt);
            if (dt < bdist) { bdist = dt; best = v; }
          }
          if (!next.length) break;
          frontier = next;
        }
        if (bdist > tol) return null;               // a true gap at this waypoint
        const seg = []; for (let u = best; u !== cur; u = par.get(u)) seg.unshift(u);
        for (const u of seg) { chain.push(u); wp.push(i); }
        cur = best;
      }
    }
    // stats: horizontal run, realised grade, worst offset from the deck
    let hLen = 0, maxDev = 0;
    for (let k = 0; k < chain.length; k++) {
      const q = nav.cells[chain[k]];
      maxDev = Math.max(maxDev, Math.min(distTo(nav, chain[k], steps[wp[k]]), distTo(nav, chain[k], steps[Math.max(0, wp[k] - 1)])));
      if (k) { const p = nav.cells[chain[k - 1]], rm = nav.Ri + (p.rad + q.rad) / 2; hLen += Math.hypot(rm * (q.th - p.th), q.z - p.z); }
    }
    ramp.cells = chain; ramp.wp = wp; ramp.hLen = hLen;
    ramp.climb = (nav.Ri + nav.cells[chain[chain.length - 1]].rad) - (nav.Ri + nav.cells[chain[0]].rad);
    ramp.grade = Math.abs(ramp.climb) / Math.max(hLen, 1e-9);
    ramp.maxDev = maxDev; ramp.tol = tol;
    return ramp;
  }

  // ── the azimuthal road: A* from a chamber ON one ramp's chain to a chamber ON the
  //    other's, strictly monotone in azimuth, hugging a near-level deck (the two ends
  //    sit within ~1.5 cells of the same radius — the worst end mismatch one winding
  //    of the corkscrew can leave). ──
  function findRoad(nav, o) {
    const cs = nav.cells, c = nav.cell, from = o.from, to = o.to;
    const A = cs[from], B = cs[to];
    if (B.th <= A.th) return null;                  // callers put the low-azimuth ramp first
    const rA = nav.Ri + A.rad, rB = nav.Ri + B.rad, span = B.th - A.th, pad = 0.9 * c / rA;
    const rAt = (th) => rA + (rB - rA) * (Math.min(Math.max(th, A.th), B.th) - A.th) / span;
    const xAt = (th) => A.z + (B.z - A.z) * (Math.min(Math.max(th, A.th), B.th) - A.th) / span;
    const rTol = 1.1 * c, xTol = 1.85 * c;
    const corridor = new Set([from, to]);
    for (let i = 0; i < nav.n; i++) {
      const q = cs[i];
      if (q.th < A.th - pad || q.th > B.th + pad) continue;
      if (Math.abs(q.z - xAt(q.th)) > xTol) continue;
      if (Math.abs(nav.Ri + q.rad - rAt(q.th)) <= rTol) corridor.add(i);
    }
    const gS = new Map([[from, 0]]), came = new Map(), done = new Set();
    const h = (i) => Math.max(0, (B.th - cs[i].th) * rA);
    const heap = [[h(from), from]];
    const push = (e) => { heap.push(e); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; } };
    const pop = () => { const t = heap[0], L = heap.pop(); if (heap.length) { heap[0] = L; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === k) break; const s = heap[m]; heap[m] = heap[k]; heap[k] = s; k = m; } } return t; };
    let found = false;
    while (heap.length) {
      const u = pop()[1];
      if (done.has(u)) continue; done.add(u);
      if (u === to) { found = true; break; }
      const a = cs[u], gu = gS.get(u);
      for (const v of nav.adj[u]) {
        if (done.has(v) || !corridor.has(v)) continue;
        const b = cs[v], dth = b.th - a.th;
        if (dth <= 1e-9) continue;                  // strictly monotone azimuth
        const dr = b.rad - a.rad;
        if (Math.abs(dr) > 0.9 * c) continue;       // no shaft-hops
        const rm = nav.Ri + (a.rad + b.rad) / 2, run = Math.hypot(rm * dth, b.z - a.z);
        const dR = (nav.Ri + b.rad - rAt(b.th)) / c, dX = (b.z - xAt(b.th)) / c;
        const w = run * (1 + 3 * dR * dR + 1.5 * dX * dX) + 0.1 * c;
        const alt = gu + w, old = gS.get(v);
        if (old === undefined || alt < old) { gS.set(v, alt); came.set(v, u); push([alt + h(v), v]); }
      }
    }
    if (!found) return null;
    const path = [to]; while (came.has(path[0])) path.unshift(came.get(path[0]));
    let len = 0, maxDev = 0;
    for (let k = 0; k < path.length; k++) {
      const q = cs[path[k]];
      maxDev = Math.max(maxDev, Math.abs(nav.Ri + q.rad - rAt(q.th)));
      if (k) { const p = cs[path[k - 1]], rm = nav.Ri + (p.rad + q.rad) / 2; len += Math.hypot(rm * (q.th - p.th), q.z - p.z); }
    }
    return { cells: path, len, climb: rB - rA, maxDev, grade: Math.abs(rB - rA) / Math.max(len, 1e-9), rTol };
  }

  // ── the composite demo: two full-depth corkscrew ramps at opposite ends of the
  //    sector, connected by a level azimuthal road every `roadEvery` of climb.
  //    Returns { A, B, roads[], g, rho, roadEvery } or null. ──
  function planRoute(nav, opt) {
    const c = nav.cell, g = (opt && opt.grade) || 0.12;
    const rho = (opt && opt.rho) || 3 * c, roadEvery = (opt && opt.roadEvery) || 15 * c;
    const attempts = (opt && opt.attempts) || 14, rBar = nav.Ri + nav.T / 2;
    let s = ((((opt && opt.seed) || 1) * 0x9e3779b9) >>> 0) || 1;
    const rr = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const rLo = nav.Ri + 2.5 * c, rHi = nav.Ri + nav.T - 2.5 * c;
    const mTh = (rho + 2.5 * c) / rBar, lo = -nav.arcRad / 2 + mTh, hi = nav.arcRad / 2 - mTh;
    const xLo = rho + 1.2 * c, xHi = nav.Lx - rho - 1.2 * c;
    // a chain cell on the side of the corkscrew that faces the other ramp
    const facing = (ramp, sign) => ramp.cells.filter((i) => {
      const q = nav.cells[i], rq = nav.Ri + q.rad;
      const ang = Math.atan2(q.z - ramp.xc, (q.th - ramp.thc) * rq);
      return sign > 0 ? Math.abs(ang) < Math.PI / 5 : Math.abs(ang) > Math.PI - Math.PI / 5;
    });
    for (let at = 0; at < attempts; at++) {
      const thcA = lo + rr() * 0.15 * (hi - lo), thcB = hi - rr() * 0.15 * (hi - lo);
      const xc = xLo + rr() * Math.max(0, xHi - xLo);
      const A = findSpiralRamp(nav, { thc: thcA, xc, rho, r0: rLo, r1: rHi, g, phase0: rr() * 2 * Math.PI });
      if (!A) continue;
      const B = findSpiralRamp(nav, { thc: thcB, xc, rho, r0: rLo, r1: rHi, g, phase0: rr() * 2 * Math.PI });
      if (!B) continue;
      const fA = facing(A, +1), fB = facing(B, -1);
      if (!fA.length || !fB.length) continue;
      const nearest = (list, r) => { let b = -1, bd = Infinity; for (const i of list) { const d = Math.abs(nav.Ri + nav.cells[i].rad - r); if (d < bd) { bd = d; b = i; } } return b; };
      const nRoads = Math.floor((rHi - rLo) / roadEvery) + 1, roads = [];
      for (let j = 0; j < nRoads; j++) {
        const rk = rLo + Math.min(j * roadEvery, rHi - rLo);
        const ca = nearest(fA, rk), cb = nearest(fB, nav.Ri + nav.cells[ca].rad);
        const road = findRoad(nav, { from: ca, to: cb });
        if (!road) { roads.length = 0; break; }
        roads.push(road);
      }
      if (!roads.length) continue;
      return { A, B, roads, g, rho, roadEvery };
    }
    return null;
  }

  // ── the "just about anywhere" claim, measured: a corkscrew climbing `climb` (default
  //    300 m = 15 cells) from N seed-random anchors (random azimuth, axial station,
  //    start radius, winding phase). ──
  function proveAnywhere(nav, opt) {
    const trials = (opt && opt.trials) || 100, g = (opt && opt.grade) || 0.12;
    const c = nav.cell, rho = (opt && opt.rho) || 3 * c, climb = (opt && opt.climb) || 15 * c;
    const rBar = nav.Ri + nav.T / 2;
    let s = ((opt && opt.seed) || 0xC0FFEE) >>> 0;
    const rr = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const rLo = nav.Ri + 2.5 * c, rHi = nav.Ri + nav.T - 2.5 * c;
    const mTh = (rho + 1.2 * c) / rBar, lo = -nav.arcRad / 2 + mTh, hi = nav.arcRad / 2 - mTh;
    const xLo = rho + 1.2 * c, xHi = nav.Lx - rho - 1.2 * c;
    let ok = 0;
    for (let t = 0; t < trials; t++) {
      const thc = lo + rr() * (hi - lo), xc = xLo + rr() * Math.max(0, xHi - xLo);
      const r0 = rLo + rr() * (rHi - rLo - climb);
      if (findSpiralRamp(nav, { thc, xc, rho, r0, r1: r0 + climb, g, phase0: rr() * 2 * Math.PI })) ok++;
    }
    return { ok, trials };
  }

  const api = { sectorFoam, buildNav, findSpiralRamp, findRoad, planRoute, proveAnywhere, helixPoint };
  root.HOOPWAYFIND = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
