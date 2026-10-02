/* Orb — the double torus: a hyperbolic surface.

   A genus-2 surface can't be flat (Euler characteristic −2, so Gauss–Bonnet
   wants total curvature −4π). Its honest geometry is hyperbolic: a regular
   octagon in the hyperbolic plane whose eight corners are 45° each, opposite
   sides glued. All eight corners become one point with 8 × 45° = 360° round
   it; V − E + F = 1 − 4 + 1 = −2. Each gluing is a hyperbolic translation
   along the line through the octagon's centre and the two sides' midpoints,
   by twice the inradius. Those four translations generate the group whose
   copies of the octagon tile the whole hyperbolic plane.

   Everything here lives in the POINCARÉ DISK (|z| < 1, the plane's
   conformal map): isometries are Möbius maps z ↦ (az + b)/(b̄z + ā),
   |a|² − |b|² = 1, stored as [ar, ai, br, bi]. Voronoi cells are clipped in
   the KLEIN model, where the hyperbolic bisector of two points is a straight
   line, each cell computed with its own site moved to the centre (where
   everything is well-conditioned), against every site's images in the
   octagons round the fundamental one. Then Lloyd relaxation, as on the
   sphere and the torus.

   The average cell has 6 + 12/n neighbours: a little over six, the mirror of
   the sphere's 6 − 12/n. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.ORB = NS.ORB || {};

  var PI = Math.PI, N8 = 8;
  var COSH_RIN = 1 / Math.tan(PI / 8);                          // cot(π/8): centre to side midpoint
  var RIN = Math.acosh(COSH_RIN), L = 2 * RIN;                    // the gluing translations' length
  var RCIRC = Math.acosh(COSH_RIN * COSH_RIN);                    // cot²(π/8): centre to corner
  var T_IN = Math.tanh(RIN);                                      // the sides, in the Klein model
  var AREA = 4 * PI;

  /* ---- Möbius maps of the disk: [ar, ai, br, bi] ---- */
  function mob(ar, ai, br, bi) { return [ar, ai, br, bi]; }
  var ID = mob(1, 0, 0, 0);
  function apply(M, x, y) { // (a z + b) / (b̄ z + ā)
    var nr = M[0] * x - M[1] * y + M[2], ni = M[0] * y + M[1] * x + M[3];
    var dr = M[2] * x + M[3] * y + M[0], di = M[2] * y - M[3] * x - M[1];
    var d = dr * dr + di * di;
    return [(nr * dr + ni * di) / d, (ni * dr - nr * di) / d];
  }
  function compose(A, B) { // A ∘ B: a = a1 a2 + b1 b̄2, b = a1 b2 + b1 ā2
    return [A[0] * B[0] - A[1] * B[1] + A[2] * B[2] + A[3] * B[3], A[0] * B[1] + A[1] * B[0] + A[3] * B[2] - A[2] * B[3],
      A[0] * B[2] - A[1] * B[3] + A[2] * B[0] + A[3] * B[1], A[0] * B[3] + A[1] * B[2] + A[3] * B[0] - A[2] * B[1]];
  }
  function inverse(M) { return [M[0], -M[1], -M[2], -M[3]]; }
  function normalise(M) { var d = Math.sqrt(Math.max(1e-300, M[0] * M[0] + M[1] * M[1] - M[2] * M[2] - M[3] * M[3])); return [M[0] / d, M[1] / d, M[2] / d, M[3] / d]; }
  /* The translation carrying 0 to c (and the geodesic through them along itself). */
  function tau(cx, cy) { var s = 1 / Math.sqrt(1 - cx * cx - cy * cy); return [s, 0, cx * s, cy * s]; }
  function distO(x, y) { var r = Math.hypot(x, y); return 2 * Math.atanh(Math.min(r, 1 - 1e-15)); } // hyperbolic distance from the centre

  /* The side pairings: g_k translates by L toward direction kπ/4 (k = 0..3),
     carrying side k + 4 onto side k. GENS = [g0..g3, g0⁻¹..g3⁻¹]. */
  var GENS = [];
  for (var k = 0; k < 4; k++) { var ch = Math.cosh(L / 2), sh = Math.sinh(L / 2); GENS.push(mob(ch, 0, sh * Math.cos(k * PI / 4), sh * Math.sin(k * PI / 4))); }
  for (k = 0; k < 4; k++) GENS.push(inverse(GENS[k]));

  /* Is disk point (x, y) in the fundamental octagon? (Klein: a Euclidean regular octagon.) */
  function klein(x, y) { var s = 2 / (1 + x * x + y * y); return [x * s, y * s]; }
  function outside(x, y) { // the side it's beyond (0..7), or -1
    var kk = klein(x, y), worst = -1, wv = T_IN + 1e-12;
    for (var s = 0; s < N8; s++) { var v = kk[0] * Math.cos(s * PI / 4) + kk[1] * Math.sin(s * PI / 4); if (v > wv) { wv = v; worst = s; } }
    return worst;
  }
  /* Bring a point into the octagon: returns [x, y, M] with M the group
     element applied (M(original) = result). */
  function reduce(x, y) {
    var M = ID;
    for (var it = 0; it < 64; it++) {
      var s = outside(x, y); if (s < 0) break;
      var g = s < 4 ? GENS[s + 4] : GENS[s - 4]; // beyond side s: translate back across it
      var p = apply(g, x, y); x = p[0]; y = p[1]; M = compose(g, M);
    }
    return [x, y, M];
  }

  /* Group elements whose octagon's centre lies within `radius` of the centre,
     found breadth-first. */
  function tilesWithin(radius) {
    var out = [ID], seen = new Map(), q = [ID], key = function (M) { var c = apply(M, 0, 0); return Math.round(c[0] * 1e7) + "," + Math.round(c[1] * 1e7); };
    seen.set(key(ID), true);
    for (var h = 0; h < q.length; h++) for (var g = 0; g < 8; g++) {
      var M = normalise(compose(q[h], GENS[g])), c = apply(M, 0, 0), d = distO(c[0], c[1]), kk = key(M);
      if (seen.has(kk) || d > radius + 2 * RIN + 0.5) continue;
      seen.set(kk, true); q.push(M); if (d <= radius) out.push(M);
    }
    return out;
  }
  var NEAR = null; // the octagons that touch the fundamental one (and it): enough images for any cell's neighbours
  function near() { if (!NEAR) NEAR = tilesWithin(2 * RCIRC + 0.2); return NEAR; }

  /* One cell: site i moved to the centre, clipped in the Klein model by the
     bisector with every nearby image of every site, nearest first. */
  function cellOf(S, n, i, maxD) {
    var toO = tau(-S[2 * i], -S[2 * i + 1]), back = tau(S[2 * i], S[2 * i + 1]), tiles = near(), cands = [], tmax = Math.tanh(maxD / 2);
    for (var e = 0; e < tiles.length; e++) for (var j = 0; j < n; j++) {
      if (j === i && e === 0) continue;
      var p0 = apply(tiles[e], S[2 * j], S[2 * j + 1]), w = apply(toO, p0[0], p0[1]), r2 = w[0] * w[0] + w[1] * w[1];
      if (r2 > tmax * tmax) continue;
      cands.push({ j: j, e: e, w: w, q0: (1 + r2) / (1 - r2), q1: 2 * w[0] / (1 - r2), q2: 2 * w[1] / (1 - r2) });
    }
    cands.sort(function (a, b) { return a.q0 - b.q0; });
    var B = 0.95, poly = [[-B, -B, -1], [B, -B, -1], [B, B, -1], [-B, B, -1]]; // Klein coordinates; [x, y, the candidate across the edge starting here]
    for (var c = 0; c < cands.length; c++) {
      var C = cands[c], maxR = 0;
      for (var v = 0; v < poly.length; v++) maxR = Math.max(maxR, Math.atanh(Math.min(Math.hypot(poly[v][0], poly[v][1]), 1 - 1e-15)));
      if (Math.acosh(C.q0) > 2 * maxR + 1e-9) break;
      // keep the side nearer the centre: q1·x + q2·y ≤ q0 − 1
      var out = [], Lp = poly.length, cc = C.q0 - 1;
      for (v = 0; v < Lp; v++) {
        var A = poly[v], Bv = poly[(v + 1) % Lp], da = C.q1 * A[0] + C.q2 * A[1] - cc, db = C.q1 * Bv[0] + C.q2 * Bv[1] - cc;
        if (da <= 0) out.push(A);
        if ((da <= 0) !== (db <= 0)) { var t = da / (da - db); out.push([A[0] + t * (Bv[0] - A[0]), A[1] + t * (Bv[1] - A[1]), da <= 0 ? c : A[2]]); }
      }
      poly = out;
    }
    // back to the Poincaré disk, in the fundamental frame; and the edges' neighbours
    var ring = [], edges = [];
    for (v = 0; v < poly.length; v++) {
      var a = poly[v], b = poly[(v + 1) % poly.length];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-10) continue;
      var kr = Math.hypot(a[0], a[1]), s = 1 / (1 + Math.sqrt(Math.max(0, 1 - kr * kr)));
      ring.push(apply(back, a[0] * s, a[1] * s));
      edges.push(a[2] >= 0 ? { j: cands[a[2]].j, e: cands[a[2]].e } : null);
    }
    return { ring: ring, edges: edges };
  }

  /* The double torus's Voronoi mesh: n random sites (uniform by hyperbolic
     area, in the octagon), `relax` rounds of Lloyd. */
  function buildDoubleTorus(seed, n, relax) {
    if (relax == null) relax = 2;
    var rng = O.rngFor(seed, "double-torus", n), S = new Float64Array(2 * n), coshR = Math.cosh(RCIRC);
    for (var i = 0; i < n;) {
      var d = Math.acosh(1 + rng.next() * (coshR - 1)), th = 2 * PI * rng.next(), r = Math.tanh(d / 2);
      var x = r * Math.cos(th), y = r * Math.sin(th);
      if (outside(x, y) < 0) { S[2 * i] = x; S[2 * i + 1] = y; i++; }
    }
    var rho = Math.acosh(1 + AREA / n / (2 * PI)), maxD = Math.max(1.5, 7 * rho); // a typical cell's radius; how far a neighbour can be
    var cells = [];
    for (var it = 0; it <= relax; it++) {
      cells = [];
      for (i = 0; i < n; i++) cells.push(cellOf(S, n, i, maxD));
      if (it === relax) break;
      for (i = 0; i < n; i++) { // centroid in the cell's own frame (nearly flat at this size), back, and into the octagon
        var toO = tau(-S[2 * i], -S[2 * i + 1]), back = tau(S[2 * i], S[2 * i + 1]), P = cells[i].ring.map(function (p) { return apply(toO, p[0], p[1]); });
        var A = 0, cx = 0, cy = 0;
        for (var q = 0; q < P.length; q++) { var a = P[q], b = P[(q + 1) % P.length], cr = a[0] * b[1] - b[0] * a[1]; A += cr; cx += (a[0] + b[0]) * cr; cy += (a[1] + b[1]) * cr; }
        if (Math.abs(A) < 1e-15) continue;
        var c = apply(back, cx / (3 * A), cy / (3 * A)), red = reduce(c[0], c[1]);
        S[2 * i] = red[0]; S[2 * i + 1] = red[1];
      }
    }
    var nbrs = cells.map(function (cl, i) {
      var ns = [];
      cl.edges.forEach(function (ed) { if (ed && ed.j !== i && ns.indexOf(ed.j) < 0) ns.push(ed.j); });
      return ns;
    });
    for (i = 0; i < n; i++) nbrs[i].forEach(function (j) { if (nbrs[j].indexOf(i) < 0) nbrs[j].push(i); });
    return { topology: "hyperbolic", surface: "double-torus", n: n, sites: S, rings: cells.map(function (c) { return c.ring; }), edges: cells.map(function (c) { return c.edges; }), nbrs: nbrs, seed: seed, relax: relax };
  }

  /* ------------------------------------------------------------ the view
     The Poincaré disk, centred on the cursor. The camera is a Möbius map C
     (the fundamental frame → the view disk). A drag carries the point under
     the finger to the finger: C ← τ(z1) ∘ τ(−z0) ∘ C. Whenever the cursor
     (C⁻¹(0)) leaves the octagon, C ← C ∘ r⁻¹ with r the group element that
     brings it back: the picture is identical (the tiling doesn't change),
     and the numbers stay small however far you travel. */
  function HyperCam(mesh) { this.mesh = mesh; this.C = ID; this.zoom = 1; this.view = 2.9; }
  HyperCam.prototype.cursor = function () { var p = apply(inverse(this.C), 0, 0); return p; };
  HyperCam.prototype.recentre = function () {
    var p = this.cursor(), red = reduce(p[0], p[1]);
    if (red[2] !== ID) this.C = normalise(compose(this.C, inverse(red[2])));
  };
  HyperCam.prototype.slide = function (x0, y0, x1, y1) { // disk points (|z| < 1)
    if (Math.hypot(x0, y0) >= 0.995 || Math.hypot(x1, y1) >= 0.995) return;
    this.C = normalise(compose(tau(x1, y1), compose(tau(-x0, -y0), this.C)));
    this.recentre();
  };
  /* Centre on fundamental point (x, y) by fraction t (along the geodesic). */
  HyperCam.prototype.toward = function (x, y, t) {
    var p = this.nearest(x, y), r = Math.hypot(p[0], p[1]); if (r < 1e-9) return;
    var d = distO(p[0], p[1]) * (t == null ? 1 : t), s = Math.tanh(d / 2) / r;
    this.slide(p[0] * s, p[1] * s, 0, 0);
  };
  /* The copy of fundamental point (x, y) nearest the middle of the view, in view coordinates. */
  HyperCam.prototype.nearest = function (x, y) {
    var T = near(), best = null, br = 2;
    for (var e = 0; e < T.length; e++) { var p = apply(compose(this.C, T[e]), x, y), r = Math.hypot(p[0], p[1]); if (r < br) { br = r; best = p; } }
    return best;
  };
  /* Every visible copy of every cell this frame: [{ i, M (fundamental → view), ring (view disk) }]. */
  HyperCam.prototype.copies = function () {
    var m = this.mesh, out = [], tiles = this.tiles || (this.tiles = tilesWithin(this.view + 2 * RCIRC)), lim = Math.tanh(this.view / 2), tlim = Math.tanh((this.view + RCIRC) / 2);
    for (var e = 0; e < tiles.length; e++) {
      var M = compose(this.C, tiles[e]), c = apply(M, 0, 0);
      if (Math.hypot(c[0], c[1]) > tlim) continue;
      for (var i = 0; i < m.n; i++) {
        var z = apply(M, m.sites[2 * i], m.sites[2 * i + 1]);
        if (Math.hypot(z[0], z[1]) > lim) continue;
        out.push({ i: i, M: M, z: z, ring: geodesicRing(M, m.rings[i]) });
      }
    }
    return out;
  };
  /* A cell's outline in the view: its corners mapped, each edge a geodesic
     (straight in Klein, so sampled there and mapped back to Poincaré). */
  function geodesicRing(M, ring) {
    var pts = ring.map(function (p) { return apply(M, p[0], p[1]); }), out = [];
    for (var q = 0; q < pts.length; q++) {
      var a = klein(pts[q][0], pts[q][1]), b = klein(pts[(q + 1) % pts.length][0], pts[(q + 1) % pts.length][1]);
      for (var t = 0; t < 3; t++) {
        var x = a[0] + (b[0] - a[0]) * t / 3, y = a[1] + (b[1] - a[1]) * t / 3, kr = Math.hypot(x, y), s = 1 / (1 + Math.sqrt(Math.max(0, 1 - kr * kr)));
        out.push([x * s, y * s]);
      }
    }
    return out;
  }
  /* The fundamental octagon's outline (for the inset), as disk points. */
  function octagon(M) {
    M = M || ID;
    var pts = [], rc = Math.tanh(RCIRC / 2);
    for (var s = 0; s < N8; s++) { var a = s * PI / 4 + PI / 8; pts.push([rc * Math.cos(a), rc * Math.sin(a)]); }
    return geodesicRing(M, pts);
  }

  O.buildDoubleTorus = buildDoubleTorus;
  O.HyperCam = HyperCam;
  O.hyper = { apply: apply, compose: compose, inverse: inverse, tau: tau, reduce: reduce, outside: outside, tilesWithin: tilesWithin, GENS: GENS, RIN: RIN, RCIRC: RCIRC, AREA: AREA, octagon: octagon, distO: distO, klein: klein, near: near, geodesicRing: geodesicRing };
})();
