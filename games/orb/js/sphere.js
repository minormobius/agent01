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

   Incremental hull, O(n²) worst case, which at a few hundred cells is a few
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

    for (var p = 0; p < n; p++) {
      if (p === a || p === b || p === c || p === d) continue;
      var vis = [];
      for (var fi = 0; fi < faces.length; fi++) if (faces[fi].alive && visible(faces[fi], p)) vis.push(fi);
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
    for (fi = 0; fi < faces.length; fi++) if (faces[fi].alive) out.push(faces[fi].v);
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

  function buildMesh(seed, n, relax) {
    if (relax == null) relax = 2;
    var rng = O.rngFor(seed, "mesh", n), P = new Float64Array(3*n);
    for (var i = 0; i < n; i++) {
      var z = 2*rng.next() - 1, th = 2*Math.PI*rng.next(), r = Math.sqrt(1 - z*z);
      P[3*i] = r*Math.cos(th); P[3*i+1] = r*Math.sin(th); P[3*i+2] = z;
    }
    var vor = voronoi(P, n);
    for (var it = 0; it < relax; it++) { P = lloyd(P, n, vor); vor = voronoi(P, n); }
    return { n: n, sites: P, verts: vor.verts, polys: vor.polys, nbrs: vor.nbrs, tris: vor.tris, seed: seed, relax: relax };
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
  function buildProjective(seed, n, relax) {
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
    var nbrs = [];
    for (i = 0; i < n; i++) {
      var ns = [];
      vor.nbrs[i].forEach(function (j) { var g = j % n; if (g !== i && ns.indexOf(g) < 0) ns.push(g); });
      nbrs.push(ns);
    }
    return { n: n, cover: N, proj: true, sites: P, verts: vor.verts, polys: vor.polys, nbrs: nbrs, coverNbrs: vor.nbrs, tris: vor.tris, seed: seed, relax: relax };
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

  O.buildMesh = buildMesh;
  O.buildProjective = buildProjective;
  O.cellAt = cellAt;
  O._hull = hull;
})();
