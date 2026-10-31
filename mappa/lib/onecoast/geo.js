/* One Coast — the maps: icosahedral Goldberg spheres (the buckyball family).

   Tiles are the corners of a geodesic triangulation of the icosahedron;
   each tile's polygon is the ring of its triangles' centres. Every such
   sphere has exactly 12 pentagons (Euler) and the rest hexagons.
   Two refinements, composed, reach the whole family we use:
     split  each triangle into four (edge midpoints)      GP(h,k) → GP(2h,2k)
     sqrt3  a point in each triangle, old edges flipped   GP(h,k) → GP(h-k... ) rotated, ×√3
       icosahedron            12 tiles (the dodecahedron's faces)
       sqrt3                  32  = C60 's 12 + 20
       split                  42  = C80 's 12 + 30
       sqrt3·sqrt3            92  = C180's 12 + 80
       split·sqrt3           122  = C240's 12 + 110
   Then a few rounds of spring smoothing so the hexagons come out as near
   to identical as the curvature allows.

   Each tile's sides are listed counter-clockwise seen from outside, and
   nbrs[i][j] is the tile across side j (between corners j and j+1). Tiles
   don't flip, so that orientation is what rotation means. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var C = NS.COAST = NS.COAST || {};

  function nrm(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function icosahedron() {
    var p = (1 + Math.sqrt(5)) / 2, V = [];
    [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]].forEach(function (v) { V.push(nrm(v)); });
    var F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    return orient({ V: V, F: F });
  }
  function orient(m) { // every triangle counter-clockwise from outside
    m.F = m.F.map(function (f) {
      var a = m.V[f[0]], b = m.V[f[1]], c = m.V[f[2]];
      return dot(cross(sub(b, a), sub(c, a)), add(add(a, b), c)) < 0 ? [f[0], f[2], f[1]] : f;
    });
    return m;
  }
  function split(m) {
    var V = m.V.slice(), cache = new Map(), F = [];
    function mid(a, b) {
      var k = a < b ? a + "," + b : b + "," + a;
      if (!cache.has(k)) { cache.set(k, V.length); V.push(nrm(add(V[a], V[b]))); }
      return cache.get(k);
    }
    m.F.forEach(function (f) {
      var a = f[0], b = f[1], c = f[2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      F.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    });
    return orient({ V: V, F: F });
  }
  function sqrt3(m) {
    var V = m.V.slice(), cen = m.F.map(function (f) { V.push(nrm(add(add(m.V[f[0]], m.V[f[1]]), m.V[f[2]]))); return V.length - 1; });
    var edgeFace = new Map();
    m.F.forEach(function (f, i) { for (var e = 0; e < 3; e++) edgeFace.set(f[e] + "," + f[(e + 1) % 3], i); });
    var F = [];
    m.F.forEach(function (f, i) {
      for (var e = 0; e < 3; e++) {
        var u = f[e], v = f[(e + 1) % 3], j = edgeFace.get(v + "," + u);
        if (i < j) F.push([cen[i], u, cen[j]], [cen[j], v, cen[i]]); // the flipped edge, once per pair
      }
    });
    return orient({ V: V, F: F });
  }

  /* Spring smoothing: each tile centre moves toward its neighbours' mean,
     back onto the sphere. Topology untouched. */
  function smooth(m, rounds) {
    var n = m.V.length, nb = Array.from({ length: n }, function () { return new Set(); });
    m.F.forEach(function (f) { for (var e = 0; e < 3; e++) { nb[f[e]].add(f[(e + 1) % 3]); nb[f[(e + 1) % 3]].add(f[e]); } });
    var V = m.V;
    for (var r = 0; r < rounds; r++) {
      V = V.map(function (v, i) {
        var s = [0, 0, 0]; nb[i].forEach(function (j) { s = add(s, V[j]); });
        return nrm(add(v, [(s[0] / nb[i].size - v[0]) * 0.5, (s[1] / nb[i].size - v[1]) * 0.5, (s[2] / nb[i].size - v[2]) * 0.5]));
      });
    }
    return { V: V, F: m.F };
  }

  /* Tiles from the triangulation: a tile per vertex, its corners the centres
     of its triangles in counter-clockwise order, nbrs aligned with sides. */
  function tiles(m) {
    var n = m.V.length, at = new Map(), first = new Int32Array(n).fill(-1);
    m.F.forEach(function (f, i) { for (var e = 0; e < 3; e++) { at.set(f[e] + "," + f[(e + 1) % 3], i); if (first[f[e]] < 0) first[f[e]] = i; } });
    var corners = m.F.map(function (f) { return nrm(add(add(m.V[f[0]], m.V[f[1]]), m.V[f[2]])); });
    var polys = [], nbrs = [];
    for (var i = 0; i < n; i++) {
      var ring = [], ns = [], fc = first[i], guard = 0;
      do {
        var f = m.F[fc], k = f.indexOf(i), nxt = f[(k + 1) % 3], prv = f[(k + 2) % 3];
        ring.push(fc); ns.push(prv);
        fc = at.get(i + "," + prv); // the triangle across edge i–prv
      } while (fc !== first[i] && ++guard < 12);
      polys.push(ring); nbrs.push(ns);
    }
    // align: side j runs from corner j to corner j+1; find the tile sharing both
    var sides = polys.map(function (ring, i) {
      return ring.map(function (c, j) {
        var d = ring[(j + 1) % ring.length], f1 = m.F[c], f2 = m.F[d];
        var common = f1.filter(function (x) { return x !== i && f2.indexOf(x) >= 0; });
        return common[0];
      });
    });
    var pos = new Float64Array(3 * n), cv = new Float64Array(3 * corners.length);
    m.V.forEach(function (v, i) { pos[3 * i] = v[0]; pos[3 * i + 1] = v[1]; pos[3 * i + 2] = v[2]; });
    corners.forEach(function (v, i) { cv[3 * i] = v[0]; cv[3 * i + 1] = v[1]; cv[3 * i + 2] = v[2]; });
    return { n: n, pos: pos, polys: polys, verts: cv, nbrs: sides, pent: polys.map(function (r) { return r.length === 5; }) };
  }

  var RECIPES = { c60: ["sqrt3"], c80: ["split"], c180: ["sqrt3", "sqrt3"], c240: ["sqrt3", "split"] };
  var cache = {};
  function sphere(name) {
    if (cache[name]) return cache[name];
    var m = icosahedron();
    RECIPES[name].forEach(function (op) { m = op === "split" ? split(m) : sqrt3(m); });
    var t = tiles(smooth(m, 30));
    t.name = name;
    return (cache[name] = t);
  }

  C.sphere = sphere;
  C.SPHERES = Object.keys(RECIPES);
})();
