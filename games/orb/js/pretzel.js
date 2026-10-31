/* Orb — the double torus as a donut with two holes.

   js/hyper.js plays the double torus where it is honest: the hyperbolic
   plane, which a genus-2 surface can't leave without bending. This file
   bends it. It builds a map from the octagon onto a pretzel in 3D, which
   distorts the cells (no surface with two holes in 3D has constant
   curvature) but shows the surface whole.

   The trick that makes the map exist: the regular octagon with opposite
   sides glued is the Bolza surface, and turning it half a turn about its
   centre (z ↦ −z) is its hyperelliptic involution, which fixes six points:
   the centre, the four side midpoints (each glued to the opposite one) and
   the corner (all eight are one point). A pretzel lying flat has the same
   symmetry: half a turn about its long axis, which pierces it six times.
   Quotient both by the half turn and you get a sphere with six marked
   points. Any four disjoint arcs on that sphere from one marked point (the
   corner) to four others (the midpoints) lift to four loops through the
   corner, and cutting along them leaves exactly the octagon, its sides
   glued opposite to opposite. So:

     1. mesh the pretzel z²/s² + g² = δ², where g = x⁴ − x² + c·y²
        (Gerono's lemniscate, a figure eight), so |g| < δ is a band with
        two holes: over the plane, then evened out on the surface itself;
     2. draw four arcs on its top face from the corner's axis point to four
        of the others (the sixth is the octagon's centre), and close each
        with its half-turned copy on the bottom face;
     3. cut along those four loops, which leaves a disc whose boundary reads
        x₀x₁x₂x₃x₀⁻¹x₁⁻¹x₂⁻¹x₃⁻¹, the octagon's word, and lay it out in
        the octagon (Klein model, so convex) by Floater's mean-value
        parameterisation, with each side's points placed by arc length and
        the opposite side's by the gluing itself; then let the seams slide,
        relaxing every vertex to the hyperbolic barycentre of its neighbours
        with the ones across a seam carried over by the gluing (a harmonic
        map, so an embedding), so the map agrees across every seam;
     4. look a point up: reduce it into the octagon, find its triangle,
        interpolate.

   Built once per page (the map depends on the octagon, not the board), in a
   worker (js/bend.js): under a second on a laptop. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.ORB = NS.ORB || {};

  // the band's width, the thickness, how round the holes are, the mesh step, and relaxation rounds: chosen by
  // measuring how much the map stretches cells (a flat-lying pretzel can't be conformal to this surface, whose
  // symmetry it lacks, so some stretch is unavoidable: about 2×, against 1.4 for the cells in the disk)
  var DELTA = 0.2, ZS = 1.7, CY = 0.5, STEP = 0.05, RELAX = 250;
  function g(x, y) { var x2 = x * x; return x2 * x2 - x2 + CY * y * y; }
  function height(x, y) { var v = g(x, y); return ZS * Math.sqrt(Math.max(0, DELTA * DELTA - v * v)); }

  /* Pull a point onto the pretzel z²/s² + g² = δ² (a few Newton steps along the gradient). */
  function onSurface(x, y, z) {
    for (var it = 0; it < 8; it++) {
      var x2 = x * x, gg = x2 * x2 - x2 + CY * y * y, F = z * z / (ZS * ZS) + gg * gg - DELTA * DELTA;
      var gx = 2 * gg * (4 * x2 * x - 2 * x), gy = 4 * CY * gg * y, gz = 2 * z / (ZS * ZS), n2 = gx * gx + gy * gy + gz * gz;
      if (n2 < 1e-18) break;
      var k = F / n2; x -= k * gx; y -= k * gy; z -= k * gz;
      if (Math.abs(F) < 1e-14) break;
    }
    return [x, y, z];
  }

  function build() {
    var H = O.hyper, PI = Math.PI;
    /* ---- 1. the band |g| < δ, by marching triangles over a lattice symmetric in y ---- */
    var dy = STEP * Math.sqrt(3) / 2, J = Math.ceil(0.75 / Math.sqrt(CY) / dy), I = Math.ceil(1.2 / STEP);
    var X = [], Y = [], rim = [], lat = new Map(), key = function (j, i) { return j * 10000 + i; };
    var inside = [];
    function latId(j, i) {
      var k = key(j, i); if (lat.has(k)) return lat.get(k);
      var x = (i + (Math.abs(j) % 2) / 2) * STEP, y = j * dy, id = X.length;
      X.push(x); Y.push(y); rim.push(0); inside.push(Math.abs(g(x, y)) < DELTA ? 1 : 0); lat.set(k, id); return id;
    }
    var cut = new Map();
    function cutId(a, b) { // the rim point on lattice edge a–b (a inside, b out)
      var k = a < b ? a + "," + b : b + "," + a; if (cut.has(k)) return cut.get(k);
      var L = g(X[b], Y[b]) > 0 ? DELTA : -DELTA, lo = 0, hi = 1;
      for (var it = 0; it < 40; it++) { var t = (lo + hi) / 2, v = g(X[a] + t * (X[b] - X[a]), Y[a] + t * (Y[b] - Y[a])); if ((v - L) * (g(X[a], Y[a]) - L) > 0) lo = t; else hi = t; }
      var t2 = (lo + hi) / 2, id = X.length;
      X.push(X[a] + t2 * (X[b] - X[a])); Y.push(Y[a] + t2 * (Y[b] - Y[a])); rim.push(1); inside.push(1);
      cut.set(k, id); return id;
    }
    var tris = [];
    function addTri(a, b, c) {
      var A = [a, b, c], n = inside[a] + inside[b] + inside[c];
      if (n === 0) return;
      if (n === 3) { tris.push([a, b, c]); return; }
      while (n === 1 ? !inside[A[0]] : inside[A[2]]) A = [A[1], A[2], A[0]]; // 1 in: it goes first; 2 in: the out one goes last
      if (n === 1) tris.push([A[0], cutId(A[0], A[1]), cutId(A[0], A[2])]);
      else { var e1 = cutId(A[1], A[2]), e2 = cutId(A[0], A[2]); tris.push([A[0], A[1], e1]); tris.push([A[0], e1, e2]); }
    }
    for (var j = -J; j < J; j++) for (var i = -I; i <= I; i++) {
      if (Math.abs(j) % 2 === 0) { addTri(latId(j, i), latId(j, i + 1), latId(j + 1, i)); addTri(latId(j, i + 1), latId(j + 1, i + 1), latId(j + 1, i)); }
      else { addTri(latId(j, i), latId(j + 1, i + 1), latId(j + 1, i)); addTri(latId(j, i), latId(j, i + 1), latId(j + 1, i + 1)); }
    }
    // the corner's axis point is where all four loops start: subdivide round it so it has room for them
    var xb0 = Math.sqrt((1 + Math.sqrt(1 - 4 * DELTA)) / 2), hub = -1, hd = 1;
    cut.forEach(function (id) { var d = Math.abs(X[id] + xb0) + Math.abs(Y[id]) * 100; if (d < hd) { hd = d; hub = id; } });
    // clear a small half-disc round it and fan it from the hub, so it has neighbours all round
    var R0 = 2.2 * STEP, gone = [], keep = [];
    tris.forEach(function (t) { var cx = (X[t[0]] + X[t[1]] + X[t[2]]) / 3, cy = (Y[t[0]] + Y[t[1]] + Y[t[2]]) / 3; (Math.hypot(cx - X[hub], cy - Y[hub]) < R0 ? gone : keep).push(t); });
    var ge = new Set(); gone.forEach(function (t) { for (var q = 0; q < 3; q++) ge.add(t[q] + "," + t[(q + 1) % 3]); });
    gone.forEach(function (t) { for (var q = 0; q < 3; q++) { var a = t[q], c = t[(q + 1) % 3]; if (!ge.has(c + "," + a) && a !== hub && c !== hub && !(rim[a] && rim[c])) keep.push([hub, a, c]); } });
    tris = keep;
    // keep only the vertices in use, and give the bottom face its own copies of the inner ones
    var used = new Int32Array(X.length).fill(-1), PX = [], PY = [], RIM = [];
    tris.forEach(function (t) { t.forEach(function (v) { if (used[v] < 0) { used[v] = PX.length; PX.push(X[v]); PY.push(Y[v]); RIM.push(rim[v]); } }); });
    var nTop = PX.length, bot = new Int32Array(nTop), nV = nTop;
    for (var v = 0; v < nTop; v++) bot[v] = RIM[v] ? v : nV++;
    var V3 = new Float64Array(3 * nV), PLx = new Float64Array(nV), PLy = new Float64Array(nV);
    for (v = 0; v < nTop; v++) {
      var z = RIM[v] ? 0 : height(PX[v], PY[v]);
      V3[3 * v] = PX[v]; V3[3 * v + 1] = PY[v]; V3[3 * v + 2] = z; PLx[v] = PX[v]; PLy[v] = PY[v];
      var b = bot[v]; V3[3 * b] = PX[v]; V3[3 * b + 1] = PY[v]; V3[3 * b + 2] = -z; PLx[b] = PX[v]; PLy[b] = PY[v];
    }
    var T = [];
    tris.forEach(function (t) { var a = used[t[0]], b2 = used[t[1]], c = used[t[2]]; T.push([a, b2, c]); T.push([bot[a], bot[c], bot[b2]]); });

    /* ---- 2. the six axis points and four loops ---- */
    var axis = [];
    for (v = 0; v < nTop; v++) if (RIM[v] && Math.abs(PY[v]) < 1e-12) axis.push(v);
    axis.sort(function (a, b3) { return PX[a] - PX[b3]; });
    if (axis.length !== 6) throw new Error("pretzel: expected 6 axis points, got " + axis.length);
    var nbr = []; for (v = 0; v < nV; v++) nbr.push([]);
    T.forEach(function (t) { for (var q = 0; q < 3; q++) { var a = t[q], c = t[(q + 1) % 3]; if (nbr[a].indexOf(c) < 0) nbr[a].push(c); if (nbr[c].indexOf(a) < 0) nbr[c].push(a); } });
    var blocked = new Uint8Array(nV);
    function polyDist(x, y, P) {
      var best = 1e9;
      for (var q = 0; q + 1 < P.length; q++) {
        var ax = P[q][0], ay = P[q][1], bx = P[q + 1][0], by = P[q + 1][1], ex = bx - ax, ey = by - ay;
        var t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)));
        best = Math.min(best, Math.hypot(x - ax - t * ex, y - ay - t * ey));
      }
      return best;
    }
    function path(src, dst, P, sheet) { // Dijkstra on one face (+1 top, −1 bottom), hugging polyline P, off the rim, clear of earlier paths
      var dist = new Float64Array(nV).fill(Infinity), prev = new Int32Array(nV).fill(-1), done = new Uint8Array(nV), heap = [];
      var hpush = function (c, w) { heap.push([c, w]); var i = heap.length - 1; while (i) { var p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
      var hpop = function () { var top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; var i = 0; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; };
      dist[src] = 0; hpush(0, src);
      while (heap.length) {
        var u = hpop()[1]; if (done[u]) continue; done[u] = 1;
        if (u === dst) break;
        nbr[u].forEach(function (w) {
          if (done[w] || (w !== dst && ((w < nTop && RIM[w]) || blocked[w] || (w < nTop ? 1 : -1) !== sheet))) return;
          var mx = (PLx[u] + PLx[w]) / 2, my = (PLy[u] + PLy[w]) / 2, d = polyDist(mx, sheet * my, P) / 0.03;
          var c = dist[u] + Math.hypot(PLx[w] - PLx[u], PLy[w] - PLy[u]) * (1 + 40 * d * d);
          if (c < dist[w]) { dist[w] = c; prev[w] = u; hpush(c, w); }
        });
      }
      if (prev[dst] < 0) throw new Error("pretzel: no path");
      var out = [dst]; while (out[out.length - 1] !== src) out.push(prev[out[out.length - 1]]);
      out.reverse(); out.forEach(function (w, k) { if (k && k < out.length - 1) blocked[w] = 1; });
      return out;
    }
    // the corner is the left hole's outer edge; the midpoints are the far left, both sides of the bar and the far
    // right; the octagon's centre is the right hole's outer edge. Corner and centre sit opposite, two midpoints
    // between them either way round, as on the Bolza surface (where they are an octahedron's vertices)
    var vtx = axis[1], targets = [axis[0], axis[2], axis[3], axis[5]], xa = PX[axis[2]], xb = -PX[axis[1]], xo = PX[axis[5]];
    var lanes = [ // from the corner: to the far left, over the left hole, under it to the bar's far side, under both to the far right
      [[-xb, 0], [-xo, 0]],
      [[-xb, 0], [-0.95, 0.15], [-0.84, 0.43], [-0.68, 0.47], [-0.5, 0.4], [-0.41, 0.14], [-xa, 0]],
      [[-xb, 0], [-0.92, -0.12], [-0.82, -0.33], [-0.68, -0.35], [-0.5, -0.3], [-0.3, -0.12], [0.3, -0.12], [0.42, -0.05], [xa, 0]],
      [[-xb, 0], [-0.98, -0.1], [-0.9, -0.48], [-0.68, -0.56], [-0.4, -0.45], [0, -0.32], [0.4, -0.45], [0.68, -0.56], [0.9, -0.48], [1.0, -0.2], [xo, 0]],
    ];
    var ys = 1 / Math.sqrt(CY); lanes = lanes.map(function (L) { return L.map(function (p) { return [p[0], p[1] * ys]; }); });
    var loops = targets.map(function (m, k) {
      // the top arc, and its half-turned copy (x, y) → (x, −y) on the bottom, back again
      var top = path(vtx, m, lanes[k], 1)
      var back = path(m, vtx, lanes[k], -1).slice(1, -1);
      return top.concat(back); // closes at vtx
    });

    /* ---- 2b. even the mesh out on the surface itself ----
       Built over the plane, the mesh is sparse where the surface is steep (the
       walls round the rims), so smooth it in 3D and pull each vertex back
       onto the surface: triangles of even size on the pretzel, which is what
       the map's weights need. The combinatorics, and so the loops, don't
       change. */
    for (var sm = 0; sm < 60; sm++) {
      var NX = Float64Array.from(V3);
      for (v = 0; v < nV; v++) {
        var nb = nbr[v], ax = 0, ay = 0, az = 0;
        for (var q = 0; q < nb.length; q++) { ax += V3[3 * nb[q]]; ay += V3[3 * nb[q] + 1]; az += V3[3 * nb[q] + 2]; }
        var pr = onSurface(V3[3 * v] + 0.5 * (ax / nb.length - V3[3 * v]), V3[3 * v + 1] + 0.5 * (ay / nb.length - V3[3 * v + 1]), V3[3 * v + 2] + 0.5 * (az / nb.length - V3[3 * v + 2]));
        NX[3 * v] = pr[0]; NX[3 * v + 1] = pr[1]; NX[3 * v + 2] = pr[2];
      }
      V3 = NX;
    }

    /* ---- 3. cut along the loops, walk the boundary, lay the disc out in the octagon ---- */
    var cutE = new Set(), onLoop = new Int32Array(nV).fill(-1), ek = function (a, b3) { return a < b3 ? a * nV + b3 : b3 * nV + a; };
    loops.forEach(function (Lp, k) { for (var q = 0; q < Lp.length; q++) { cutE.add(ek(Lp[q], Lp[(q + 1) % Lp.length])); if (Lp[q] !== vtx) onLoop[Lp[q]] = k; } });
    onLoop[vtx] = 99;
    var dirT = new Map(); T.forEach(function (t, ti) { for (var q = 0; q < 3; q++) dirT.set(t[q] * nV + t[(q + 1) % 3], ti); });
    var cornerCopy = T.map(function (t) { return t.slice(); }), nD = nV, orig = []; for (v = 0; v < nV; v++) orig.push(v);
    for (v = 0; v < nV; v++) {
      if (onLoop[v] < 0) continue;
      var start = -1; // a triangle whose edge (v → next) is cut
      for (var ti = 0; ti < T.length && start < 0; ti++) { var q0 = T[ti].indexOf(v); if (q0 >= 0 && cutE.has(ek(v, T[ti][(q0 + 1) % 3]))) start = ti; }
      var t0 = start, wedge = -1, copy = -1, guard = 0;
      do {
        var tt = T[t0], q1 = tt.indexOf(v), bnext = tt[(q1 + 1) % 3], cprev = tt[(q1 + 2) % 3];
        if (cutE.has(ek(v, bnext))) { wedge++; copy = wedge === 0 ? v : nD++; if (copy !== v) orig.push(v); }
        cornerCopy[t0][q1] = copy;
        t0 = dirT.get(v * nV + cprev); // the next triangle ccw round v holds the edge v → cprev
        if (t0 == null || ++guard > 400) throw new Error("pretzel: fan");
      } while (t0 !== start);
    }
    var bnd = new Map(), dset = new Set();
    cornerCopy.forEach(function (t) { for (var q = 0; q < 3; q++) dset.add(t[q] * nD + t[(q + 1) % 3]); });
    cornerCopy.forEach(function (t) { for (var q = 0; q < 3; q++) { var a = t[q], b3 = t[(q + 1) % 3]; if (!dset.has(b3 * nD + a)) bnd.set(a, b3); } });
    var walk = [], s0 = -1;
    bnd.forEach(function (b3, a) { if (s0 < 0 && orig[a] === vtx) s0 = a; });
    for (var a2 = s0; ; ) { walk.push(a2); a2 = bnd.get(a2); if (a2 === s0) break; if (walk.length > bnd.size) throw new Error("pretzel: boundary"); }
    if (walk.length !== bnd.size) throw new Error("pretzel: the cut is not a disc");
    var segs = [], cur = null;
    walk.forEach(function (w) { if (orig[w] === vtx) { if (cur) cur.push(w); cur = [w]; segs.push(cur); } else cur.push(w); });
    cur.push(walk[0]);
    if (segs.length !== 8) throw new Error("pretzel: " + segs.length + " sides");
    var segLoop = segs.map(function (sg) { return onLoop[orig[sg[1]]]; });
    for (var sd = 0; sd < 4; sd++) if (segLoop[sd] !== segLoop[sd + 4]) throw new Error("pretzel: the cut doesn't read as the octagon");
    var K = new Float64Array(2 * nD), fixed = new Uint8Array(nD);
    var rc = Math.tanh(H.RCIRC / 2), corner = function (a) { return [rc * Math.cos(a), rc * Math.sin(a)]; };
    function geo(a, b3, t) { var bb = H.apply(H.tau(-a[0], -a[1]), b3[0], b3[1]), d = H.distO(bb[0], bb[1]), r = Math.tanh(t * d / 2), l = Math.hypot(bb[0], bb[1]); return H.apply(H.tau(a[0], a[1]), bb[0] / l * r, bb[1] / l * r); }
    function put(w, p) { var kk = H.klein(p[0], p[1]); K[2 * w] = kk[0]; K[2 * w + 1] = kk[1]; fixed[w] = 1; }
    var at = []; // per side 0..3: original vertex → its point on that side
    for (sd = 0; sd < 4; sd++) {
      var sg = segs[sd], len = [0];
      for (var q = 1; q < sg.length; q++) { var p0 = orig[sg[q - 1]], p1 = orig[sg[q]]; len.push(len[q - 1] + Math.hypot(V3[3 * p1] - V3[3 * p0], V3[3 * p1 + 1] - V3[3 * p0 + 1], V3[3 * p1 + 2] - V3[3 * p0 + 2])); }
      var c0 = corner(sd * PI / 4 - PI / 8), c1 = corner(sd * PI / 4 + PI / 8), mp = new Map();
      for (q = 0; q < sg.length; q++) { var p = geo(c0, c1, len[q] / len[len.length - 1]); put(sg[q], p); if (q && q < sg.length - 1) mp.set(orig[sg[q]], p); }
      at.push(mp);
      var Gi = H.inverse(H.GENS[sd]);
      segs[sd + 4].forEach(function (w, k2) { if (k2 && k2 < segs[sd + 4].length - 1) { var pp = mp.get(orig[w]); put(w, H.apply(Gi, pp[0], pp[1])); } });
    }
    // a Tutte embedding: every free vertex at a weighted mean of its neighbours. Any positive weights give a
    // bijection onto the convex octagon; symmetric ones (1/length, so rims and the hub don't crowd) make it a
    // Laplace problem, solved by conjugate gradients
    var Wt = []; for (v = 0; v < nD; v++) Wt.push(new Map());
    cornerCopy.forEach(function (t) {
      for (var q = 0; q < 3; q++) {
        var a = t[q], c = t[(q + 1) % 3], oa = orig[a], oc = orig[c];
        var l = Math.hypot(V3[3 * oa] - V3[3 * oc], V3[3 * oa + 1] - V3[3 * oc + 1], V3[3 * oa + 2] - V3[3 * oc + 2]), w = 1 / Math.max(l, 0.4 * STEP);
        Wt[a].set(c, w); Wt[c].set(a, w);
      }
    });
    var idx = new Int32Array(nD).fill(-1), free = []; for (v = 0; v < nD; v++) if (!fixed[v]) { idx[v] = free.length; free.push(v); }
    var NF = free.length, Ai = [], Aw = [], Dg = new Float64Array(NF), Bx = new Float64Array(NF), By = new Float64Array(NF);
    free.forEach(function (w, r) {
      var ids = [], ws = [];
      Wt[w].forEach(function (x, k3) { Dg[r] += x; if (idx[k3] >= 0) { ids.push(idx[k3]); ws.push(x); } else { Bx[r] += x * K[2 * k3]; By[r] += x * K[2 * k3 + 1]; } });
      Ai.push(ids); Aw.push(ws);
    });
    function cg(B) { // (D − W) x = B
      var x = new Float64Array(NF), r = Float64Array.from(B), p = Float64Array.from(B), Ap = new Float64Array(NF), rr = 0;
      for (var i = 0; i < NF; i++) rr += r[i] * r[i];
      for (var it = 0; it < 3000 && rr > 1e-22; it++) {
        var pAp = 0;
        for (i = 0; i < NF; i++) { var sum = Dg[i] * p[i], ids = Ai[i], ws = Aw[i]; for (var q = 0; q < ids.length; q++) sum -= ws[q] * p[ids[q]]; Ap[i] = sum; pAp += p[i] * sum; }
        var al = rr / pAp, rr2 = 0;
        for (i = 0; i < NF; i++) { x[i] += al * p[i]; r[i] -= al * Ap[i]; rr2 += r[i] * r[i]; }
        var be = rr2 / rr; rr = rr2;
        for (i = 0; i < NF; i++) p[i] = r[i] + be * p[i];
      }
      cg.its = it; return x;
    }
    var SX = cg(Bx), it = cg.its, SY = cg(By); it = Math.max(it, cg.its);
    free.forEach(function (w, r) { K[2 * w] = SX[r]; K[2 * w + 1] = SY[r]; });
    var ITS = it;

    /* ---- 3b. let the seams slide: a harmonic map into the surface itself ----
       The layout above pins each side's points by arc length, which squeezes
       the map hard near the seams. Here every vertex moves to the weighted
       hyperbolic barycentre of its neighbours, with the neighbours across a
       seam carried over by the gluing, so the sides are free to slide while
       staying glued. Positive weights make the result an embedding
       (Colin de Verdière's theorem for hyperbolic surfaces); cotangent
       weights, clamped positive, make it close to conformal. The corner (all
       eight octagon corners) stays put. */
    var ID = [1, 0, 0, 0], Pp = new Float64Array(2 * nD);
    for (v = 0; v < nD; v++) { var kx = K[2 * v], ky = K[2 * v + 1], kr = Math.hypot(kx, ky), kf = 1 / (1 + Math.sqrt(Math.max(0, 1 - kr * kr))); Pp[2 * v] = kx * kf; Pp[2 * v + 1] = ky * kf; }
    var repOf = new Int32Array(nD), Mof = new Array(nD).fill(null), hubFix = new Uint8Array(nD);
    for (v = 0; v < nD; v++) { repOf[v] = v; if (orig[v] === vtx) hubFix[v] = 1; }
    for (sd = 0; sd < 4; sd++) {
      var byO = new Map(); segs[sd].forEach(function (w) { byO.set(orig[w], w); });
      var Gi2 = H.inverse(H.GENS[sd]);
      segs[sd + 4].forEach(function (w) { if (!hubFix[w]) { repOf[w] = byO.get(orig[w]); Mof[w] = Gi2; } });
    }
    var copies = []; for (v = 0; v < nD; v++) copies.push([]);
    for (v = 0; v < nD; v++) if (!hubFix[v]) copies[repOf[v]].push([v, Mof[v] ? H.inverse(Mof[v]) : null]);
    var P3 = function (w) { var o = orig[w]; return [V3[3 * o], V3[3 * o + 1], V3[3 * o + 2]]; };
    var NB = []; for (v = 0; v < nD; v++) NB.push(new Map());
    cornerCopy.forEach(function (t) {
      var A = P3(t[0]), B = P3(t[1]), C = P3(t[2]), pts = [A, B, C];
      for (var q = 0; q < 3; q++) {
        var a = pts[q], b4 = pts[(q + 1) % 3], c = pts[(q + 2) % 3], u1 = [b4[0] - a[0], b4[1] - a[1], b4[2] - a[2]], u2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        var cr = Math.hypot(u1[1] * u2[2] - u1[2] * u2[1], u1[2] * u2[0] - u1[0] * u2[2], u1[0] * u2[1] - u1[1] * u2[0]), dt = u1[0] * u2[0] + u1[1] * u2[1] + u1[2] * u2[2];
        var cot = Math.max(0.05, Math.min(4, dt / Math.max(cr, 1e-12))) / 2, e1 = t[(q + 1) % 3], e2 = t[(q + 2) % 3]; // the angle at t[q] weighs the opposite edge
        NB[e1].set(e2, (NB[e1].get(e2) || 0) + cot); NB[e2].set(e1, (NB[e2].get(e1) || 0) + cot);
      }
    });
    var NBL = NB.map(function (mp) { var ids = [], ws = []; mp.forEach(function (x, k3) { ids.push(k3); ws.push(x); }); return [ids, ws]; });
    function posOf(w) { if (hubFix[w]) { var kh = K[2 * w], kh2 = K[2 * w + 1], r0 = Math.hypot(kh, kh2), f0 = 1 / (1 + Math.sqrt(1 - r0 * r0)); return [kh * f0, kh2 * f0]; } var r = repOf[w]; return Mof[w] ? H.apply(Mof[w], Pp[2 * r], Pp[2 * r + 1]) : [Pp[2 * r], Pp[2 * r + 1]]; }
    var reps = []; for (v = 0; v < nD; v++) if (!hubFix[v] && repOf[v] === v) reps.push(v);
    var relaxed = 0;
    for (var rit = 0; rit < RELAX; rit++) {
      var mv = 0;
      for (var ri = 0; ri < reps.length; ri++) {
        var rr = reps[ri], P0x = Pp[2 * rr], P0y = Pp[2 * rr + 1], toO = H.tau(-P0x, -P0y), sx = 0, sy = 0, sw = 0, cps = copies[rr];
        for (var ci = 0; ci < cps.length; ci++) {
          var cw = cps[ci][0], Mi = cps[ci][1], L2 = NBL[cw], ids = L2[0], ws = L2[1];
          for (q = 0; q < ids.length; q++) {
            var pq = posOf(ids[q]); if (Mi) pq = H.apply(Mi, pq[0], pq[1]);
            pq = H.apply(toO, pq[0], pq[1]); var s2 = 2 / (1 + pq[0] * pq[0] + pq[1] * pq[1]);
            sx += ws[q] * pq[0] * s2; sy += ws[q] * pq[1] * s2; sw += ws[q];
          }
        }
        sx /= sw; sy /= sw;
        var sr = Math.hypot(sx, sy), sf = 1 / (1 + Math.sqrt(Math.max(0, 1 - sr * sr))), np = H.apply(H.tau(P0x, P0y), sx * sf, sy * sf);
        mv = Math.max(mv, Math.abs(np[0] - P0x) + Math.abs(np[1] - P0y));
        Pp[2 * rr] = np[0]; Pp[2 * rr + 1] = np[1];
      }
      relaxed = rit + 1;
      if (mv < 1e-7) break;
    }
    var FP = new Float64Array(2 * nD); for (v = 0; v < nD; v++) { var pf = posOf(v), kf2 = H.klein(pf[0], pf[1]); FP[2 * v] = kf2[0]; FP[2 * v + 1] = kf2[1]; }

    /* ---- 4. point location: every triangle, and the images across the seams of the ones that cross them ---- */
    var GN = 64, grid = []; for (q = 0; q < GN * GN; q++) grid.push([]);
    var cell = function (x) { return Math.max(0, Math.min(GN - 1, Math.floor((x + 1) / 2 * GN))); };
    var TC = []; // [triangle, x0, y0, x1, y1, x2, y2] in Klein coordinates
    var NT = H.near(), lim = Math.tanh(H.RCIRC) + 0.01;
    function reg(t, xs, ys) {
      if (Math.min.apply(null, xs) > lim || Math.max.apply(null, xs) < -lim || Math.min.apply(null, ys) > lim || Math.max.apply(null, ys) < -lim) return;
      var id = TC.length; TC.push([t, xs[0], ys[0], xs[1], ys[1], xs[2], ys[2]]);
      for (var gy = cell(Math.min.apply(null, ys)); gy <= cell(Math.max.apply(null, ys)); gy++) for (var gx = cell(Math.min.apply(null, xs)); gx <= cell(Math.max.apply(null, xs)); gx++) grid[gy * GN + gx].push(id);
    }
    var pos2 = 0, neg2 = 0;
    cornerCopy.forEach(function (t) {
      var xs = t.map(function (w) { return FP[2 * w]; }), ys = t.map(function (w) { return FP[2 * w + 1]; });
      var d = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]); if (d > 1e-14) pos2++; else if (d < -1e-14) neg2++;
      reg(t, xs, ys);
      var outs = t.some(function (w) { var pp = posOf(w); return H.outside(pp[0], pp[1]) >= 0 || hubFix[w]; });
      if (!outs) return;
      for (var e = 1; e < NT.length; e++) {
        var im = t.map(function (w) { var pp = posOf(w), q4 = H.apply(NT[e], pp[0], pp[1]); return H.klein(q4[0], q4[1]); });
        reg(t, im.map(function (a) { return a[0]; }), im.map(function (a) { return a[1]; }));
      }
    });
    function locate(kx, ky) { // [triangle, barycentrics]: the containing one, or the nearest miss
      var list = grid[cell(ky) * GN + cell(kx)], best = null, bw = -1e9;
      for (var q2 = 0; q2 < list.length; q2++) {
        var R = TC[list[q2]], ax = R[1], ay = R[2], bx = R[3], by = R[4], cx = R[5], cy = R[6];
        var d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(d) < 1e-18) continue;
        var l1 = ((by - cy) * (kx - cx) + (cx - bx) * (ky - cy)) / d, l2 = ((cy - ay) * (kx - cx) + (ax - cx) * (ky - cy)) / d, l3 = 1 - l1 - l2, mn = Math.min(l1, l2, l3);
        if (mn > bw) { bw = mn; best = [R[0], l1, l2, l3]; if (mn >= 0) break; }
      }
      return best;
    }
    /* A disk point (anywhere: it is reduced into the octagon first) → the pretzel. */
    function at3(x, y) {
      var r = H.reduce(x, y), kk = H.klein(r[0], r[1]), L = locate(kk[0], kk[1]);
      if (!L) return [0, 0, 0];
      var px = 0, py = 0, pz = 0;
      for (var q2 = 0; q2 < 3; q2++) { var o = orig[L[0][q2]], wq = L[q2 + 1]; px += wq * V3[3 * o]; py += wq * V3[3 * o + 1]; pz += wq * V3[3 * o + 2]; }
      return onSurface(px, py, pz);
    }
    // the parameterisation is a bijection only if no triangle flipped
    var flips = Math.min(pos2, neg2), sgn = pos2 >= neg2 ? 1 : -1;
    return { locate: locate, at: at3, flips: flips, its: ITS, relax: relaxed, vertices: nV, triangles: T.length, edges: (function () { var s = new Set(); T.forEach(function (t) { for (var q2 = 0; q2 < 3; q2++) s.add(ek(t[q2], t[(q2 + 1) % 3])); }); return s.size; })(), axis: axis.map(function (w) { return PX[w]; }), sides: segs.length, mirrored: sgn < 0 };
  }

  /* The outward normal at a point of the pretzel: the gradient of z²/s² + g² − δ². */
  function normal(X) {
    var x = X[0], y = X[1], gg = g(x, y), n = [2 * gg * (4 * x * x * x - 2 * x), 4 * CY * gg * y, 2 * X[2] / (ZS * ZS)], l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  }

  /* Everything the view draws for one board, as flat arrays (so a worker can
     hand it over): each cell's outline on the pretzel, its edges sampled
     along the geodesic so it hugs the surface, its centre and normal; and the
     octagon's four pairs of sides as loops. */
  function cells(mesh) {
    var P = O.pretzel(), H = O.hyper, PER = 6, out = [];
    for (var i = 0; i < mesh.n; i++) {
      var ring = mesh.rings[i], pts = [];
      for (var q = 0; q < ring.length; q++) {
        var a = H.klein(ring[q][0], ring[q][1]), b = H.klein(ring[(q + 1) % ring.length][0], ring[(q + 1) % ring.length][1]);
        for (var t = 0; t < PER; t++) {
          var x = a[0] + (b[0] - a[0]) * t / PER, y = a[1] + (b[1] - a[1]) * t / PER, r = Math.hypot(x, y), f = 1 / (1 + Math.sqrt(Math.max(0, 1 - r * r))), X = P.at(x * f, y * f);
          pts.push(X[0], X[1], X[2]);
        }
      }
      var c = P.at(mesh.sites[2 * i], mesh.sites[2 * i + 1]);
      out.push({ ring: pts, c: c, n: normal(c) });
    }
    var rc = Math.tanh(H.RCIRC / 2), loops = [];
    for (var k = 0; k < 4; k++) { // side k, a hair inside the octagon
      var a2 = H.klein(rc * Math.cos(k * Math.PI / 4 - Math.PI / 8), rc * Math.sin(k * Math.PI / 4 - Math.PI / 8)), b2 = H.klein(rc * Math.cos(k * Math.PI / 4 + Math.PI / 8), rc * Math.sin(k * Math.PI / 4 + Math.PI / 8)), lp = [];
      for (var s2 = 0; s2 <= 96; s2++) {
        var kx = (a2[0] + (b2[0] - a2[0]) * s2 / 96) * 0.9995, ky = (a2[1] + (b2[1] - a2[1]) * s2 / 96) * 0.9995, kr = Math.hypot(kx, ky), kf = 1 / (1 + Math.sqrt(1 - kr * kr)), Y = P.at(kx * kf, ky * kf);
        lp.push(Y[0], Y[1], Y[2]);
      }
      loops.push(lp);
    }
    return { cells: out, loops: loops };
  }

  /* Is the pretzel's solid in the way, looking from point X along unit direction d? */
  function blocked(X, d) {
    for (var t = 0.03; t < 3; t += 0.012) {
      var x = X[0] + t * d[0], y = X[1] + t * d[1], z = X[2] + t * d[2], gg = g(x, y);
      if (z * z / (ZS * ZS) + gg * gg - DELTA * DELTA < 0) return true;
    }
    return false;
  }
  /* A direction to look at the point with outward normal n from: the normal
     itself if nothing is in the way, else tilted toward looking down (or up)
     through the holes, which is how you see the inside of one. */
  function viewDir(X, n) {
    var up = n[2] >= 0 ? 1 : -1, tilts = [0, 0.35, 0.6, 0.85, 1.1, 1.35];
    for (var sg = 0; sg < 2; sg++, up = -up) for (var k = 0; k < tilts.length; k++) {
      var zx = -n[2] * n[0], zy = -n[2] * n[1], zz = 1 - n[2] * n[2], zl = Math.hypot(zx, zy, zz); // global z, less its part along n
      if (zl < 1e-6) return n;
      var c = Math.cos(tilts[k]), s = Math.sin(tilts[k]) * up / zl, d = [n[0] * c + zx * s, n[1] * c + zy * s, n[2] * c + zz * s], dl = Math.hypot(d[0], d[1], d[2]);
      d = [d[0] / dl, d[1] / dl, d[2] / dl];
      if (!blocked(X, d)) return d;
    }
    return n;
  }

  var MAP = null;
  O.pretzel = function () { if (!MAP) MAP = build(); return MAP; };
  O.pretzel.cells = cells; O.pretzel.normal = normal; O.pretzel.viewDir = viewDir;
})();
