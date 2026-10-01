/* One Coast — the shape of a coast inside a tile.

   A tile's sides are land or sea. Where a land side meets a sea side, at a
   corner, a coast enters. The tile's CENTRE kind fills the middle; the
   other kind's runs become capes (land into sea) or bays (sea into land),
   each a band along its run of sides whose inner edge is the coastline:

        corner a ─ inner(a) ~ inner(…) ~ inner(b) ─ corner b

   Both ends are corners, and corners are shared by the three tiles that
   meet there, so a coast leaves one tile exactly where it enters the next:
   the shoreline is continuous across the whole sphere though every tile is
   drawn alone. The inner edge is smoothed and given a seeded fractal wiggle
   (midpoint displacement in the surface's tangent plane), so shores look
   weathered, not machined. Same tile, same cell, same shape, every frame.

   Works on the sphere (normal = the point) and flat (normal = +z), so the
   hand's thumbnails are drawn by the same code as the world. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var C = NS.COAST = NS.COAST || {};

  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.hypot(a[0], a[1], a[2]); }
  function nrm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  /* Chaikin corner-cutting, endpoints kept: rounds the polyline. */
  function chaikin(pts, rounds) {
    for (var r = 0; r < rounds; r++) {
      var out = [pts[0]];
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        if (i > 0) out.push(lerp(a, b, 0.25));
        if (i < pts.length - 2) out.push(lerp(a, b, 0.75));
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }
  /* Midpoint displacement sideways within the surface: fractal shoreline. */
  function wiggle(pts, rnd, amp, depth, normalAt) {
    for (var d = 0; d < depth; d++) {
      var out = [pts[0]];
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1], m = lerp(a, b, 0.5), dir = sub(b, a), side = nrm(cross(normalAt(m), dir));
        var k = (rnd() - 0.5) * 2 * amp * len(dir);
        out.push([m[0] + side[0] * k, m[1] + side[1] * k, m[2] + side[2] * k], b);
      }
      pts = out; amp *= 0.55;
    }
    return pts;
  }

  /* Geometry of one tile.
     corners: k points (counter-clockwise from outside), centre: point,
     edges: k bits (side j runs corner j → j+1), centreBit, seed: string,
     sphere: true to keep points on the unit sphere.
     Returns { centre: 0|1, land: [polygon…], coasts: [path…] }  (3D points) */
  function tileArt(corners, centre, edges, centreBit, seed, sphere) {
    var k = corners.length, X = C.normCentre(edges, centreBit), Y = 1 - X;
    var land = [], coasts = [];
    var onS = sphere ? nrm : function (p) { return p; };
    var normalAt = sphere ? function (p) { return nrm(p); } : function () { return [0, 0, 1]; };
    var all = edges.every(function (e) { return e === X; });
    if (all) { if (X) land.push(corners.slice()); return { centre: X, land: land, coasts: coasts }; }
    var rnd = C.rngFrom(seed);
    var caps = C.runs(edges, Y).map(function (r, idx) {
      var start = r[0], n = r[1], depth = 0.44 + 0.07 * Math.min(n, 3) + (rnd() - 0.5) * 0.14;
      var path = [corners[start]];
      for (var q = 0; q <= n; q++) {
        var c = corners[(start + q) % k];
        // the ends tuck in less, so a cape narrows to its neck at the corners
        var t = (q === 0 || q === n) ? depth * 0.55 : depth;
        path.push(lerp(c, centre, t));
      }
      path.push(corners[(start + n) % k]);
      path = chaikin(path, 2).map(onS);
      path = chaikin(wiggle(path, rnd, 0.34, 2, normalAt), 1).map(onS); // two fractal levels, then rounded: weathered, not saw-toothed
      return { start: start, n: n, path: path };
    });
    caps.forEach(function (cp) { coasts.push(cp.path); });
    if (X) { // land tile with sea bays: walk the rim, detouring round each bay
      var poly = [], j = 0;
      var byStart = {}; caps.forEach(function (cp) { byStart[cp.start] = cp; });
      while (j < k) {
        var cp = byStart[j];
        if (cp) { for (var q = 0; q < cp.path.length - 1; q++) poly.push(cp.path[q]); j += cp.n; }
        else { poly.push(corners[j]); j++; }
      }
      // a bay that wraps past side k-1 starts before 0: handle by rotating
      if (caps.some(function (c2) { return c2.start + c2.n > k; })) {
        poly = []; var first = caps[0].start; j = 0;
        while (j < k) {
          var at = (first + j) % k, cp2 = byStart[at];
          if (cp2) { for (q = 0; q < cp2.path.length - 1; q++) poly.push(cp2.path[q]); j += cp2.n; }
          else { poly.push(corners[at]); j++; }
        }
      }
      land.push(poly);
    } else { // sea tile with land capes: each cape is its run of rim plus its coast back
      caps.forEach(function (cp) {
        var poly2 = [];
        for (var q = 0; q <= cp.n; q++) poly2.push(corners[(cp.start + q) % k]);
        for (q = cp.path.length - 2; q >= 1; q--) poly2.push(cp.path[q]);
        land.push(poly2);
      });
    }
    return { centre: X, land: land, coasts: coasts };
  }

  /* Art for cell i of sphere s holding a placed tile (edges per side). */
  function cellArt(s, i, edges, centreBit) {
    var corners = s.polys[i].map(function (v) { return [s.verts[3 * v], s.verts[3 * v + 1], s.verts[3 * v + 2]]; });
    var centre = [s.pos[3 * i], s.pos[3 * i + 1], s.pos[3 * i + 2]];
    return tileArt(corners, centre, edges, centreBit, s.name + ":" + i + ":" + edges.join("") + centreBit, true);
  }
  /* A flat regular k-gon, radius 1, for thumbnails. Corner j sits so side j
     is the one at angle (j + ½)·2π/k. */
  function flatArt(edges, centreBit, seed) {
    var k = edges.length, corners = [];
    for (var j = 0; j < k; j++) { var a = Math.PI / 2 - (j * 2 * Math.PI) / k; corners.push([Math.cos(a), Math.sin(a), 0]); }
    return tileArt(corners, [0, 0, 0], edges, centreBit, seed || edges.join("") + centreBit, false);
  }

  C.tileArt = tileArt; C.cellArt = cellArt; C.flatArt = flatArt;
})();
