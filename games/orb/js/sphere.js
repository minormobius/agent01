/* Orb — the mesh.

   A spherical Voronoi diagram, built the cheap exact way: the convex hull of
   points on a sphere IS their spherical Delaunay triangulation, and each
   Delaunay triangle's circumcentre (its outward normal, normalised) is a
   Voronoi vertex. So a hull gives us everything — the cells, their corners in
   order, and the adjacency the game runs on.

   Adjacency is "shares an edge". On a Voronoi diagram in general position every
   vertex has degree 3, so "shares an edge" and "shares a corner" are the same
   relation — the square grid's diagonal-neighbour rule has no analogue to get
   wrong. Average degree on a sphere is exactly 6 − 12/n (Euler), the hex
   grid's 6, with real spread: fives, sixes, sevens, the odd four or eight.

   Points start uniform-random and get a few rounds of Lloyd relaxation, which
   keeps the irregularity but kills the slivers — a near-zero edge would be an
   adjacency nobody can see. `relax` is the knob between "foam" and "football".

   Incremental hull; each new point finds the faces it sees by walking the
   triangulation (see findVisible), so a few thousand cells take a few
   milliseconds. Exposes O.buildMesh(seed, n, relax). */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.ORB = NS.ORB || {};

  function sub(P, i, j) { return [P[3*i]-P[3*j], P[3*i+1]-P[3*j+1], P[3*i+2]-P[3*j+2]]; }
  function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; }

  /* Convex hull of unit vectors. Returns triangles [a,b,c] wound
     counter-clockwise seen from outside. */
  function hull(P, n) {
    var faces = [];       // {v:[a,b,c], nx,ny,nz,d, alive}
    var edge = new Map(); // directed edge a*n+b -> face index

    function addFace(a, b, c) {
      var nrm = cross(sub(P, b, a), sub(P, c, a));
      var f = { v: [a, b, c], n: nrm, d: nrm[0]*P[3*a] + nrm[1]*P[3*a+1] + nrm[2]*P[3*a+2], alive: true };
      var id = faces.length;
      faces.push(f);
      edge.set(a*n+b, id); edge.set(b*n+c, id); edge.set(c*n+a, id);
      return id;
    }
    function visible(f, p) {
      var n_ = f.n;
      return n_[0]*P[3*p] + n_[1]*P[3*p+1] + n_[2]*P[3*p+2] - f.d > 1e-14;
    }

    // Seed tetrahedron: 0, 1, the point farthest from line 0-1, the point
    // farthest from that plane. Random points make this effectively free.
    var a = 0, b = 1, c = -1, d = -1, best = 0;
    var ab = sub(P, b, a);
    for (var i = 2; i < n; i++) {
      var cr = cross(ab, sub(P, i, a)), m = Math.hypot(cr[0], cr[1], cr[2]);
      if (m > best) { best = m; c = i; }
    }
    var pn = cross(ab, sub(P, c, a)); best = 0;
    for (i = 2; i < n; i++) {
      if (i === c) continue;
      var v = sub(P, i, a), s = Math.abs(v[0]*pn[0] + v[1]*pn[1] + v[2]*pn[2]);
      if (s > best) { best = s; d = i; }
    }
    var ad = sub(P, d, a);
    if (ad[0]*pn[0] + ad[1]*pn[1] + ad[2]*pn[2] > 0) { var t = b; b = c; c = t; } // d behind abc
    addFace(a, b, c); addFace(a, d, b); addFace(b, d, c); addFace(c, d, a);

    /* The faces p can see. Scanning every face ever made (the dead ones too)
       made a hull O(n²): fine at a few hundred cells, 80 ms at Ecumene's two
       thousand and far worse at its six. So walk instead: from the newest
       face, step across whichever edge p lies beyond, until a face p can see;
       the faces it can see are connected (their rim is the horizon), so flood
       out from that one. Sorted, they are exactly the full scan's list in
       the full scan's order, so the hull comes out face for face the same.
       Where the walk can't settle (the first few points, before the hull
       holds the centre; a point inside it; a rounding tie) the full scan
       decides, as it always did. */
    function scanAll(p) { var v = []; for (var fi = 0; fi < faces.length; fi++) if (faces[fi].alive && visible(faces[fi], p)) v.push(fi); return v; }
    function findVisible(p) {
      var px = P[3*p], py = P[3*p+1], pz = P[3*p+2], f = faces.length - 1, start = -1;
      while (f >= 0 && !faces[f].alive) f--;
      for (var steps = 0; f >= 0 && steps < 4 * n + 64; steps++) {
        var F = faces[f];
        if (visible(F, p)) { start = f; break; }
        var bestE = -1, bestS = 0;
        for (var e = 0; e < 3; e++) {
          var u = F.v[e], w = F.v[(e+1)%3], o = F.v[(e+2)%3];
          var mx = P[3*u+1]*P[3*w+2]-P[3*u+2]*P[3*w+1], my = P[3*u+2]*P[3*w]-P[3*u]*P[3*w+2], mz = P[3*u]*P[3*w+1]-P[3*u+1]*P[3*w];
          var so = mx*P[3*o] + my*P[3*o+1] + mz*P[3*o+2], sp = mx*px + my*py + mz*pz, s = so > 0 ? sp : -sp;
          if (s < bestS) { bestS = s; bestE = e; }   // p beyond this edge's great circle, away from the face
        }
        if (bestE < 0) break;
        var nf = edge.get(F.v[(bestE+1)%3]*n + F.v[bestE]);
        if (nf === undefined || !faces[nf].alive) break;
        f = nf;
      }
      if (start < 0) return scanAll(p);
      var seen = new Set([start]), q = [start], out = [];
      while (q.length) {
        var g = q.pop(), G = faces[g]; out.push(g);
        for (var k = 0; k < 3; k++) {
          var nb = edge.get(G.v[(k+1)%3]*n + G.v[k]);
          if (nb === undefined || seen.has(nb)) continue;
          seen.add(nb);
          if (faces[nb].alive && visible(faces[nb], p)) q.push(nb);
        }
      }
      return out.sort(function (x, y) { return x - y; });
    }

    for (var p = 0; p < n; p++) {
      if (p === a || p === b || p === c || p === d) continue;
      var vis = findVisible(p);
      if (!vis.length) continue; // duplicate / interior point: not a cell
      var isVis = new Set(vis), horizon = [];
      for (var k = 0; k < vis.length; k++) {
        var fv = faces[vis[k]].v;
        for (var e = 0; e < 3; e++) {
          var u = fv[e], w = fv[(e+1)%3];
          if (!isVis.has(edge.get(w*n+u))) horizon.push([u, w]);
        }
      }
      for (k = 0; k < vis.length; k++) {
        var F = faces[vis[k]]; F.alive = false;
        for (e = 0; e < 3; e++) {
          var key = F.v[e]*n + F.v[(e+1)%3];
          if (edge.get(key) === vis[k]) edge.delete(key);
        }
      }
      for (k = 0; k < horizon.length; k++) addFace(horizon[k][0], horizon[k][1], p);
    }
    var out = [];
    for (var fi = 0; fi < faces.length; fi++) if (faces[fi].alive) out.push(faces[fi].v);
    return out;
  }

  /* Voronoi from the hull: vertices, and each cell's ring of vertices and
     neighbours in the same rotational order. */
  function voronoi(P, n) {
    var tris = hull(P, n);
    var F = tris.length, V = new Float64Array(3*F), byEdge = new Map(), first = new Int32Array(n).fill(-1);
    for (var f = 0; f < F; f++) {
      var t = tris[f];
      var c = norm(cross(sub(P, t[1], t[0]), sub(P, t[2], t[0])));
      V[3*f] = c[0]; V[3*f+1] = c[1]; V[3*f+2] = c[2];
      for (var e = 0; e < 3; e++) {
        byEdge.set(t[e]*n + t[(e+1)%3], f);
        if (first[t[e]] < 0) first[t[e]] = f;
      }
    }
    var polys = new Array(n), nbrs = new Array(n);
    for (var i = 0; i < n; i++) {
      var ring = [], ns = [], f0 = first[i], fc = f0, guard = 0;
      if (f0 < 0) { polys[i] = []; nbrs[i] = []; continue; }
      do {
        var tv = tris[fc], at = tv.indexOf(i);
        var j = tv[(at+1)%3], k = tv[(at+2)%3];
        ring.push(fc); ns.push(j);
        fc = byEdge.get(i*n + k); // the face across edge (k,i) holds i→k
      } while (fc !== f0 && fc !== undefined && ++guard < 64);
      polys[i] = ring; nbrs[i] = ns;
    }
    return { verts: V, polys: polys, nbrs: nbrs, tris: tris };
  }

  /* Area-weighted centroid of each cell, projected back onto the sphere. */
  function lloyd(P, n, vor) {
    var Q = new Float64Array(3*n), V = vor.verts;
    for (var i = 0; i < n; i++) {
      var ring = vor.polys[i], sx = 0, sy = 0, sz = 0;
      var px = P[3*i], py = P[3*i+1], pz = P[3*i+2];
      for (var r = 0; r < ring.length; r++) {
        var A = ring[r], B = ring[(r+1)%ring.length];
        var ax = V[3*A], ay = V[3*A+1], az = V[3*A+2], bx = V[3*B], by = V[3*B+1], bz = V[3*B+2];
        var cr = cross([ax-px, ay-py, az-pz], [bx-px, by-py, bz-pz]);
        var w = Math.hypot(cr[0], cr[1], cr[2]);
        sx += w * (px+ax+bx); sy += w * (py+ay+by); sz += w * (pz+az+bz);
      }
      var c = norm([sx, sy, sz]);
      Q[3*i] = c[0]; Q[3*i+1] = c[1]; Q[3*i+2] = c[2];
    }
    return Q;
  }

  function buildMesh(seed, n, relax, even) {
    if (relax == null) relax = 2;
    var rng = O.rngFor(seed, "mesh", n), P = new Float64Array(3*n);
    for (var i = 0; i < n; i++) {
      var z = 2*rng.next() - 1, th = 2*Math.PI*rng.next(), r = Math.sqrt(1 - z*z);
      P[3*i] = r*Math.cos(th); P[3*i+1] = r*Math.sin(th); P[3*i+2] = z;
    }
    var vor = voronoi(P, n);
    for (var it = 0; it < relax; it++) { P = lloyd(P, n, vor); vor = voronoi(P, n); }
    var walls = even ? evenWalls(function () { return sphereWalls(P, n, vor); }, function (mv) {
      var Q = new Float64Array(3 * n);
      for (var i = 0; i < n; i++) { var c = moveSphere(P, i, mv[i]); Q[3 * i] = c[0]; Q[3 * i + 1] = c[1]; Q[3 * i + 2] = c[2]; }
      P = Q; vor = voronoi(P, n);
    }) : null;
    return { n: n, sites: P, verts: vor.verts, polys: vor.polys, nbrs: vor.nbrs, tris: vor.tris, seed: seed, relax: relax, walls: walls };
  }

  /* The PROJECTIVE PLANE: the sphere with every point glued to the point
     opposite it. Its Voronoi diagram is the sphere's diagram of antipodal
     PAIRS of sites (kept symmetric through Lloyd: each pair relaxes to the
     average of its two centroids, one negated), and each pair is one cell.
     So the mesh carries the double cover for drawing (2n sites, polys,
     verts: cover cell i and i + n are the same game cell) and the game's
     adjacency on the n cells. Euler characteristic 1, so V − E + F = 1 and
     the average cell has 6 − 6/n neighbours.

     Any hemisphere is the whole projective plane, once: the globe view
     already IS its honest map. Turn it, and a cell sinking under one rim
     comes back up on the opposite rim, mirrored. */
  function buildProjective(seed, n, relax, even) {
    if (relax == null) relax = 2;
    var rng = O.rngFor(seed, "projective", n), N = 2 * n, P = new Float64Array(3 * N);
    for (var i = 0; i < n; i++) {
      var z = 2 * rng.next() - 1, th = 2 * Math.PI * rng.next(), r = Math.sqrt(1 - z * z);
      P[3 * i] = r * Math.cos(th); P[3 * i + 1] = r * Math.sin(th); P[3 * i + 2] = z;
      P[3 * (i + n)] = -P[3 * i]; P[3 * (i + n) + 1] = -P[3 * i + 1]; P[3 * (i + n) + 2] = -P[3 * i + 2];
    }
    var vor = voronoi(P, N);
    for (var it = 0; it < relax; it++) {
      var Q = lloyd(P, N, vor);
      for (i = 0; i < n; i++) {
        var c = norm([Q[3 * i] - Q[3 * (i + n)], Q[3 * i + 1] - Q[3 * (i + n) + 1], Q[3 * i + 2] - Q[3 * (i + n) + 2]]);
        P[3 * i] = c[0]; P[3 * i + 1] = c[1]; P[3 * i + 2] = c[2];
        P[3 * (i + n)] = -c[0]; P[3 * (i + n) + 1] = -c[1]; P[3 * (i + n) + 2] = -c[2];
      }
      vor = voronoi(P, N);
    }
    var walls = even ? evenWalls(function () { return sphereWalls(P, N, vor); }, function (mv) {
      for (var i = 0; i < n; i++) { // the pair moves together: average the two halves' moves, one turned round
        var a = moveSphere(P, i, mv[i]), b = moveSphere(P, i + n, mv[i + n]), c = norm([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
        P[3 * i] = c[0]; P[3 * i + 1] = c[1]; P[3 * i + 2] = c[2]; P[3 * (i + n)] = -c[0]; P[3 * (i + n) + 1] = -c[1]; P[3 * (i + n) + 2] = -c[2];
      }
      vor = voronoi(P, N);
    }) : null;
    var nbrs = [];
    for (i = 0; i < n; i++) {
      var ns = [];
      vor.nbrs[i].forEach(function (j) { var g = j % n; if (g !== i && ns.indexOf(g) < 0) ns.push(g); });
      nbrs.push(ns);
    }
    return { n: n, cover: N, proj: true, sites: P, verts: vor.verts, polys: vor.polys, nbrs: nbrs, coverNbrs: vor.nbrs, tris: vor.tris, seed: seed, relax: relax, walls: walls };
  }

  /* Index of the cell containing unit vector (x,y,z): the nearest site, which
     is the definition of a Voronoi cell — hit-testing needs no polygons.
     (On the projective plane this is the COVER cell; mod n is the game's.) */
  function cellAt(mesh, x, y, z) {
    var P = mesh.sites, best = -2, bi = -1;
    for (var i = 0, N = P.length / 3; i < N; i++) {
      var d = P[3*i]*x + P[3*i+1]*y + P[3*i+2]*z;
      if (d > best) { best = d; bi = i; }
    }
    return bi;
  }

  /* ------------------------------------------------------------ even walls
     A Voronoi wall gets short when four sites are nearly on one circle, and
     a short wall is a neighbour you can't see. No minimum can be imposed on
     a Voronoi diagram of given sites, but the sites can move: every wall
     under `min` pulls its two cells together and pushes the two cells at its
     ends apart (each step lengthens it by about four times the step), then
     the diagram is rebuilt from the moved sites, so it is still exactly a
     Voronoi diagram, just of slightly different points.

     The surfaces share this through one description: per cell, its walls in
     ring order, each with the neighbour across it, that neighbour's image as
     a vector from the cell's site in the cell's own local frame, and the
     wall's length. A cell only ever moves itself, in its own frame, so the
     torus's wrap, the Klein bottle's flip and the hyperbolic gluings never
     come into it. Returns the moves ([dx, dy] per cell), or null when no
     wall is short. */
  function wallMoves(cells, min) {
    var short = new Map(), key = function (a, b) { return a < b ? a + "," + b : b + "," + a; };
    cells.forEach(function (W, i) { W.forEach(function (w) { if (w.len < min) short.set(key(i, w.j), Math.max(short.get(key(i, w.j)) || 0, 1.15 * min - w.len)); }); });
    if (!short.size) return null;
    var step = 0.28, cap = 1.2 * min;
    return cells.map(function (W, i) {
      var dx = 0, dy = 0;
      for (var q = 0; q < W.length; q++) {
        var w = W[q], d = short.get(key(i, w.j)), l;
        if (d) { l = Math.hypot(w.x, w.y) || 1; dx += step * d * w.x / l; dy += step * d * w.y / l; } // toward the cell across a short wall
        var a = W[(q + W.length - 1) % W.length], e = short.get(key(a.j, w.j));
        if (e && a.j !== w.j && a.j !== i && w.j !== i) { // this corner ends the short wall between the cells either side of it: step away
          var mx = (a.x + w.x) / 2, my = (a.y + w.y) / 2; l = Math.hypot(mx, my) || 1; dx -= step * e * mx / l; dy -= step * e * my / l;
        }
      }
      var r = Math.hypot(dx, dy); if (r > cap) { dx *= cap / r; dy *= cap / r; }
      return [dx, dy];
    });
  }
  function median(cells) { var L = []; cells.forEach(function (W) { W.forEach(function (w) { L.push(w.len); }); }); L.sort(function (a, b) { return a - b; }); return L[L.length >> 1]; }
  /* The loop every surface runs: describe, move, rebuild, until no wall is
     under a quarter of the median (or `rounds` runs out). */
  function evenWalls(describe, move, rounds) {
    var cells = describe(), min = median(cells) / 4, it = 0;
    for (; it < (rounds || 60); it++) {
      var mv = wallMoves(cells, min);
      if (!mv) break;
      move(mv); cells = describe();
    }
    var left = 0; cells.forEach(function (W) { W.forEach(function (w) { if (w.len < min) left++; }); });
    return { min: min, rounds: it, short: left / 2 };
  }
  O.evenWalls = evenWalls;

  /* The sphere's description: a tangent frame at each site, walls between
     consecutive ring corners (angles), neighbours by the face they share. */
  function sphereWalls(P, N, vor) {
    var V = vor.verts, tris = vor.tris;
    var out = [];
    for (var i = 0; i < N; i++) {
      var p = [P[3 * i], P[3 * i + 1], P[3 * i + 2]], f = frame(p), ring = vor.polys[i], W = [];
      for (var r = 0; r < ring.length; r++) {
        var A = ring[r], B = ring[(r + 1) % ring.length], ta = tris[A], tb = tris[B], j = -1;
        for (var q = 0; q < 3; q++) if (ta[q] !== i && tb.indexOf(ta[q]) >= 0) j = ta[q];
        var d = [P[3 * j] - p[0], P[3 * j + 1] - p[1], P[3 * j + 2] - p[2]];
        W.push({ j: j, len: Math.acos(Math.max(-1, Math.min(1, V[3 * A] * V[3 * B] + V[3 * A + 1] * V[3 * B + 1] + V[3 * A + 2] * V[3 * B + 2]))), x: dot(d, f[0]), y: dot(d, f[1]) });
      }
      out.push(W);
    }
    return out;
  }
  function frame(p) { var a = Math.abs(p[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = norm(cross(p, a)), e2 = cross(p, e1); return [e1, e2]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function moveSphere(P, i, mv) { var p = [P[3 * i], P[3 * i + 1], P[3 * i + 2]], f = frame(p); return norm([p[0] + mv[0] * f[0][0] + mv[1] * f[1][0], p[1] + mv[0] * f[0][1] + mv[1] * f[1][1], p[2] + mv[0] * f[0][2] + mv[1] * f[1][2]]); }

  O.buildMesh = buildMesh;
  O.buildProjective = buildProjective;
  O.cellAt = cellAt;
  O._hull = hull;
  O.voronoi = voronoi; // any sites (Ecumene rebuilds its refined mesh with it)
})();
