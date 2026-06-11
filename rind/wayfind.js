// rind/wayfind.js — wayfinding in the foam: drivable spiral ramps + azimuthal roads.
//
// The foam shell is a graph: chambers are vertices, shared walls are edges (the same
// adjacency the frame solver stiffens). A ROAD for a vehicle is a chain of adjacent
// chambers hugging an ideal deck curve:
//   · spiral RAMP — a helix of constant grade g: climb radially while sweeping azimuth,
//     r(θ) = r₀ ± g·r₀·(θ−θ₀). Spin gravity points along +r̂, so grade = dr/ds is
//     exactly the slope a vehicle feels (hull-ward = downhill, core-ward = uphill).
//   · azimuthal ROAD — constant radius: a level street around the ring.
//
// findLeg() finds such a chain constructively — A* over the chamber graph, confined to
// a corridor around the ideal deck and strictly monotone in azimuth — and returns a
// certificate: every chamber centre within rTol of the deck, consecutive chambers
// graph-adjacent. Chambers are ~1 cell wide, so the smooth deck of grade g provably
// threads the chain.
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

  // the ideal deck radius at azimuth th for a found leg (clamped to the leg's span)
  function idealR(leg, th) {
    const t = Math.min(Math.max(th, leg.th0), leg.th1);
    return leg.rA + (leg.dir ? leg.dir * leg.g * leg.rA * (t - leg.th0) : 0);
  }

  // ── one leg: A* over the chamber graph in a corridor around the ideal deck.
  //    o = { x0, th0, th1, rA (radius at th0), dir (+1 hull-ward / −1 core-ward / 0 road),
  //          g (deck grade), startCell? (chain from a previous leg) } ──
  function findLeg(nav, o) {
    const cs = nav.cells, c = nav.cell, { x0, th0, th1, rA, dir, g } = o;
    const rTol = (dir ? 1.25 : 1.0) * c, xTol = 1.85 * c, thPad = 0.9 * c / rA;
    const leg = { th0, th1, rA, dir, g };
    const rId = (th) => idealR(leg, th);
    const inC = (i) => { const q = cs[i]; return q.th >= th0 - thPad && q.th <= th1 + thPad && Math.abs(q.z - x0) <= xTol && Math.abs(nav.Ri + q.rad - rId(q.th)) <= rTol; };
    const corridor = new Set();
    for (let i = 0; i < nav.n; i++) if (inC(i)) corridor.add(i);
    let start = o.startCell;
    if (start == null) {
      let bd = Infinity;
      corridor.forEach((i) => { const q = cs[i], d = Math.hypot((q.th - th0) * rA, nav.Ri + q.rad - rA, q.z - x0); if (d < bd) { bd = d; start = i; } });
      if (start == null || bd > 2.4 * c) return null;     // no chamber near the anchor
    } else corridor.add(start);
    const thGoal = th1 - 0.7 * c / rA;
    // A* — cost grows with run length and deviation from the deck; heuristic = remaining run
    const gS = new Map([[start, 0]]), came = new Map(), done = new Set();
    const h = (i) => Math.max(0, (thGoal - cs[i].th) * rA);
    const heap = [[h(start), start]];
    const push = (e) => { heap.push(e); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; } };
    const pop = () => { const t = heap[0], L = heap.pop(); if (heap.length) { heap[0] = L; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === k) break; const s = heap[m]; heap[m] = heap[k]; heap[k] = s; k = m; } } return t; };
    let goal = -1;
    while (heap.length) {
      const u = pop()[1];
      if (done.has(u)) continue; done.add(u);
      if (cs[u].th >= thGoal) { goal = u; break; }
      const a = cs[u], gu = gS.get(u);
      for (const v of nav.adj[u]) {
        if (done.has(v) || !corridor.has(v)) continue;
        const b = cs[v], dth = b.th - a.th;
        if (dth <= 1e-9) continue;                                  // strictly monotone azimuth
        const dr = b.rad - a.rad;
        if (Math.abs(dr) > 0.9 * c) continue;                       // no shaft-hops between steps
        const rm = nav.Ri + (a.rad + b.rad) / 2, run = Math.hypot(rm * dth, b.z - a.z);
        const dR = (nav.Ri + b.rad - rId(b.th)) / c, dX = (b.z - x0) / c;
        const w = run * (1 + 3 * dR * dR + 1.5 * dX * dX) + 0.1 * c;
        const alt = gu + w, old = gS.get(v);
        if (old === undefined || alt < old) { gS.set(v, alt); came.set(v, u); push([alt + h(v), v]); }
      }
    }
    if (goal < 0) return null;
    const path = [goal]; while (came.has(path[0])) path.unshift(came.get(path[0]));
    let len = 0, maxDev = 0;
    for (let k = 0; k < path.length; k++) {
      const q = cs[path[k]];
      maxDev = Math.max(maxDev, Math.abs(nav.Ri + q.rad - rId(q.th)));
      if (k) { const p = cs[path[k - 1]], rm = nav.Ri + (p.rad + q.rad) / 2; len += Math.hypot(rm * (q.th - p.th), q.z - p.z); }
    }
    const last = cs[path[path.length - 1]];
    leg.cells = path; leg.len = len; leg.climb = last.rad - cs[path[0]].rad;
    leg.maxDev = maxDev; leg.rEnd = nav.Ri + last.rad; leg.thEnd = last.th; leg.rTol = rTol;
    return leg;
  }

  // ── the composite demo: spiral ramp A → level azimuthal road → spiral ramp B,
  //    anchored at a seed-random spot. Returns { A, R, B, x0, dirA, dirB, grade } or null. ──
  function planRoute(nav, opt) {
    const grade = (opt && opt.grade) || 0.12, attempts = (opt && opt.attempts) || 14;
    const c = nav.cell, rBar = nav.Ri + nav.T / 2;
    let s = ((((opt && opt.seed) || 1) * 0x9e3779b9) >>> 0) || 1;
    const rr = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const m = 1.2 * c / rBar, lo = -nav.arcRad / 2 + m, hi = nav.arcRad / 2 - m, span = hi - lo;
    const fA = 0.41, fR = 0.18, rLo = nav.Ri + 2.5 * c, rHi = nav.Ri + nav.T - 2.5 * c;
    for (let at = 0; at < attempts; at++) {
      const thA1 = lo + fA * span, thR1 = lo + (fA + fR) * span;
      const climbA = grade * rBar * fA * span;
      let dirA = rr() < 0.5 ? 1 : -1;
      const r0 = rLo + rr() * (rHi - rLo);
      if (r0 + dirA * climbA < rLo || r0 + dirA * climbA > rHi) dirA = -dirA;
      if (r0 + dirA * climbA < rLo || r0 + dirA * climbA > rHi) continue;
      const x0 = 2 * c + rr() * (nav.Lx - 4 * c);
      const A = findLeg(nav, { x0, th0: lo, th1: thA1, rA: r0, dir: dirA, g: grade });
      if (!A) continue;
      const R = findLeg(nav, { x0, th0: A.thEnd, th1: thR1, rA: A.rEnd, dir: 0, g: 0, startCell: A.cells[A.cells.length - 1] });
      if (!R) continue;
      const climbB = grade * rBar * (hi - R.thEnd);
      let dirB = dirA;
      if (R.rEnd + dirB * climbB < rLo || R.rEnd + dirB * climbB > rHi) dirB = -dirB;
      if (R.rEnd + dirB * climbB < rLo || R.rEnd + dirB * climbB > rHi) continue;
      const B = findLeg(nav, { x0, th0: R.thEnd, th1: hi, rA: R.rEnd, dir: dirB, g: grade, startCell: R.cells[R.cells.length - 1] });
      if (!B) continue;
      return { A, R, B, x0, dirA, dirB, grade };
    }
    return null;
  }

  // ── the "just about anywhere" claim, measured: try a single full-span ramp from N
  //    seed-random anchors (random azimuth window, axial station, start radius and
  //    direction) and count how many succeed. ──
  function proveAnywhere(nav, opt) {
    const trials = (opt && opt.trials) || 100, grade = (opt && opt.grade) || 0.12;
    const c = nav.cell, rBar = nav.Ri + nav.T / 2;
    let s = ((opt && opt.seed) || 0xC0FFEE) >>> 0;
    const rr = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const m = 1.2 * c / rBar, lo = -nav.arcRad / 2 + m, hi = nav.arcRad / 2 - m;
    const span = 0.41 * (hi - lo), rLo = nav.Ri + 2.5 * c, rHi = nav.Ri + nav.T - 2.5 * c;
    let ok = 0;
    for (let t = 0; t < trials; t++) {
      const th0 = lo + rr() * (hi - lo - span);
      const x0 = 1.5 * c + rr() * (nav.Lx - 3 * c);
      const climb = grade * rBar * span;
      let dir = rr() < 0.5 ? 1 : -1;
      const r0 = rLo + rr() * (rHi - rLo);
      if (r0 + dir * climb < rLo || r0 + dir * climb > rHi) dir = -dir;
      if (r0 + dir * climb < rLo || r0 + dir * climb > rHi) continue;
      if (findLeg(nav, { x0, th0, th1: th0 + span, rA: r0, dir, g: grade })) ok++;
    }
    return { ok, trials };
  }

  const api = { sectorFoam, buildNav, findLeg, planRoute, proveAnywhere, idealR };
  root.HOOPWAYFIND = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
