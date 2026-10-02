/* Strand — the boards.

   Flow on a sphere: join each pair of same-coloured ends with a strand, so
   the strands never share a cell and together paint every cell.

   A board is a cell graph on the unit sphere, in one of two readings:

     panels  cells are polygons (the soccer ball's 12 pentagons and 20
             hexagons, or a Voronoi sphere's cells); a strand steps between
             cells that share an edge. Five or six ways out of every cell.
     atoms   cells are points (C60's 60 carbons, or a Voronoi sphere's
             corners); a strand runs along bonds. Exactly three ways out,
             so every cell a strand passes through uses two of its three.

   Bare panels are too free to have one answer (two pairs on C60's panels
   have thousands), so panel levels are carved: WALLS block the edge between
   two cells, and BRIDGES are forced crossings, cells two strands must pass
   straight through, one each way. Both are expressed by rewriting the graph
   (a wall drops an adjacency; a bridge splits its cell into two lanes that
   each connect one pair of opposite sides), so the solver never needs to
   know they exist.

   The TORUS boards (torus-…) are the same game on a doughnut: a honeycomb
   with six ways out of every cell, its corners as a carbon nanotorus, or a
   Voronoi torus. No pentagons: a torus needs no defects (Euler χ = 0).

   Needs ORB.buildMesh (../orb/js/sphere.js) for the Voronoi boards and
   ../orb/js/torus.js for the torus. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var S = NS.STRAND = NS.STRAND || {};
  var phi = (1 + Math.sqrt(5)) / 2;

  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  function uniq(pts) {
    var out = [];
    pts.forEach(function (p) { if (!out.some(function (q) { return Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) < 1e-9; })) out.push(p); });
    return out;
  }
  function expand(bases) { // all cyclic permutations and sign changes
    var pts = [];
    bases.forEach(function (b) {
      [[b[0], b[1], b[2]], [b[1], b[2], b[0]], [b[2], b[0], b[1]]].forEach(function (c) {
        for (var s = 0; s < 8; s++) pts.push([c[0] * (s & 1 ? -1 : 1), c[1] * (s & 2 ? -1 : 1), c[2] * (s & 4 ? -1 : 1)]);
      });
    });
    return uniq(pts);
  }
  function byDistance(pts, len2) {
    return pts.map(function (p, i) {
      var out = [];
      pts.forEach(function (q, j) { var d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (j !== i && Math.abs(d - len2) < 1e-6) out.push(j); });
      return out;
    });
  }
  function flat(vs) { var a = new Float64Array(vs.length * 3); vs.forEach(function (v, i) { var u = norm(v); a[3 * i] = u[0]; a[3 * i + 1] = u[1]; a[3 * i + 2] = u[2]; }); return a; }

  /* Put each cell's neighbour list in rotational order around the cell, so
     "opposite sides" means something (bridges need it). */
  function orderAround(pos, nbrs) {
    return nbrs.map(function (ns, i) {
      var c = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
      var ref = Math.abs(c[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      var u = norm([ref[1] * c[2] - ref[2] * c[1], ref[2] * c[0] - ref[0] * c[2], ref[0] * c[1] - ref[1] * c[0]]);
      var w = [c[1] * u[2] - c[2] * u[1], c[2] * u[0] - c[0] * u[2], c[0] * u[1] - c[1] * u[0]];
      return ns.slice().sort(function (a, b) {
        var ang = function (j) { var d = [pos[3 * j] - c[0], pos[3 * j + 1] - c[1], pos[3 * j + 2] - c[2]]; return Math.atan2(d[0] * w[0] + d[1] * w[1] + d[2] * w[2], d[0] * u[0] + d[1] * u[1] + d[2] * u[2]); };
        return ang(a) - ang(b);
      });
    });
  }

  var c60cache = null;
  function c60() {
    if (c60cache) return c60cache;
    var pts = expand([[0, 1, 3 * phi], [1, 2 + phi, 2 * phi], [phi, 2, 2 * phi + 1]]);
    var bonds = byDistance(pts, 4);
    // rings: the 5- and 6-cycles that bound faces
    var rings = [];
    for (var s = 0; s < pts.length; s++) {
      (function dfs(path) {
        var u = path[path.length - 1];
        if (path.length > 6) return;
        bonds[u].forEach(function (v) {
          if (v === s && path.length >= 5) {
            var key = path.slice().sort(function (a, b) { return a - b; }).join();
            if (!rings.some(function (r) { return r.key === key; })) rings.push({ key: key, cyc: path.slice() });
          } else if (v > s && path.indexOf(v) < 0) dfs(path.concat([v]));
        });
      })([s]);
    }
    c60cache = { pts: pts, bonds: bonds, rings: rings.map(function (r) { return r.cyc; }) };
    return c60cache;
  }

  function atomsBoard(name, pos, bonds) {
    return { kind: "atoms", name: name, n: bonds.length, nbrs: bonds, pos: pos };
  }
  function panelsBoard(name, pos, nbrs, polys, verts) {
    return { kind: "panels", name: name, n: nbrs.length, nbrs: orderAround(pos, nbrs), pos: pos, polys: polys, verts: verts };
  }

  /* Even out an atom layout without touching its bonds. A Voronoi diagram's
     corners can sit almost on top of each other (a near-zero edge), which
     is fine for drawing cells and useless for tapping atoms. Springs pull
     bonded atoms together, every pair pushes apart, everything stays on the
     sphere. Only positions move, so a level's graph — and its proved
     answer — is unchanged. Deterministic: no randomness, fixed steps. */
  function relax(P0, bonds) {
    var n = bonds.length, P = Float64Array.from(P0), F = new Float64Array(3 * n);
    var spring = 1, rep = 2 / n, i, j, k; // stronger repulsion (4/n) folds bonds across each other on bigger boards
    for (var it = 0; it < 300; it++) {
      F.fill(0);
      for (i = 0; i < n; i++) {
        for (k = 0; k < bonds[i].length; k++) {
          j = bonds[i][k];
          F[3 * i] += spring * (P[3 * j] - P[3 * i]); F[3 * i + 1] += spring * (P[3 * j + 1] - P[3 * i + 1]); F[3 * i + 2] += spring * (P[3 * j + 2] - P[3 * i + 2]);
        }
        for (j = 0; j < n; j++) {
          if (j === i) continue;
          var dx = P[3 * i] - P[3 * j], dy = P[3 * i + 1] - P[3 * j + 1], dz = P[3 * i + 2] - P[3 * j + 2];
          var d2 = dx * dx + dy * dy + dz * dz + 1e-6, f = rep / (d2 * Math.sqrt(d2));
          F[3 * i] += f * dx; F[3 * i + 1] += f * dy; F[3 * i + 2] += f * dz;
        }
      }
      var step = 0.05 * (1 - it / 300) + 0.005;
      for (i = 0; i < n; i++) {
        var x = P[3 * i] + step * F[3 * i], y = P[3 * i + 1] + step * F[3 * i + 1], z = P[3 * i + 2] + step * F[3 * i + 2], l = Math.hypot(x, y, z);
        P[3 * i] = x / l; P[3 * i + 1] = y / l; P[3 * i + 2] = z / l;
      }
    }
    return P;
  }

  /* The torus (../orb/js/torus.js): the board keeps the flat mesh, and the
     view draws it as a donut or as its wrapped map.
       torus-hex-panels     the honeycomb torus, rows × cols hexes, six ways out of every cell
       torus-hex-atoms      its corners: a carbon nanotorus, three bonds each, as C60's atoms
       torus-voronoi-panels a Voronoi diagram of the flat torus, n cells */
  function torusBoard(spec) {
    var O = NS.ORB;
    if (spec.type === "torus-voronoi-panels") {
      var tv = O.buildTorus(spec.seed, spec.n, 3);
      return { kind: "panels", topology: "torus", name: "Voronoi torus " + spec.n + " · panels", n: tv.n, nbrs: tv.nbrs.map(function (x) { return x.slice(); }), polys: tv.polys, mesh: tv };
    }
    var h = O.buildHexTorus(spec.rows, spec.cols);
    if (spec.type === "torus-hex-panels") return { kind: "panels", topology: "torus", name: "hex torus " + spec.rows + "×" + spec.cols + " · panels", n: h.n, nbrs: h.nbrs.map(function (x) { return x.slice(); }), polys: h.polys, mesh: h };
    // atoms: the honeycomb's corners, bonded along its edges
    var nv = h.verts.length / 2, bonds = Array.from({ length: nv }, function () { return []; });
    h.polys.forEach(function (ring) {
      for (var k = 0; k < ring.length; k++) { var a = ring[k], b = ring[(k + 1) % ring.length]; if (bonds[a].indexOf(b) < 0) { bonds[a].push(b); bonds[b].push(a); } }
    });
    var atoms = { topology: "torus", kind: "atoms", n: nv, W: h.W, H: h.H, sites: h.verts, verts: new Float64Array(0), polys: [], nbrs: bonds };
    return { kind: "atoms", topology: "torus", name: "nanotorus " + nv + " · atoms", n: nv, nbrs: bonds, mesh: atoms, surface: h };
  }

  /* spec: { type: "c60-atoms" | "c60-panels" | "voronoi-panels" | "voronoi-atoms" | "torus-…", n?, seed?, rows?, cols? } */
  function board(spec) {
    if (spec.type.indexOf("torus-") === 0) return torusBoard(spec);
    if (spec.type === "c60-atoms") { var C = c60(); return atomsBoard("C60 · atoms", flat(C.pts), C.bonds); }
    if (spec.type === "c60-panels") {
      var C2 = c60(), rings = C2.rings;
      var nb = rings.map(function (r, i) {
        var out = [];
        rings.forEach(function (q, j) { if (j !== i && q.filter(function (x) { return r.indexOf(x) >= 0; }).length === 2) out.push(j); });
        return out;
      });
      var cent = rings.map(function (r) { var c = [0, 0, 0]; r.forEach(function (a) { c[0] += C2.pts[a][0]; c[1] += C2.pts[a][1]; c[2] += C2.pts[a][2]; }); return c; });
      return panelsBoard("C60 · panels", flat(cent), nb, rings, flat(C2.pts));
    }
    var m = NS.ORB.buildMesh(spec.seed, spec.n, 2);
    if (spec.type === "voronoi-panels") return panelsBoard("Voronoi " + spec.n + " · panels", m.sites, m.nbrs.map(function (x) { return x.slice(); }), m.polys, m.verts);
    if (spec.type === "voronoi-atoms") {
      var nv = m.verts.length / 3, bonds = Array.from({ length: nv }, function () { return []; });
      m.polys.forEach(function (ring) {
        for (var k = 0; k < ring.length; k++) {
          var a = ring[k], b = ring[(k + 1) % ring.length];
          if (bonds[a].indexOf(b) < 0) { bonds[a].push(b); bonds[b].push(a); }
        }
      });
      return atomsBoard("Voronoi " + spec.n + " · atoms", relax(m.verts, bonds), bonds);
    }
    throw new Error("unknown board " + spec.type);
  }

  /* The play graph: the board with walls removed and bridges split into
     lanes. Node i < n is cell i (for a bridge, its first lane); bridge k's
     second lane is node n + k. cellOf maps every node back to its cell. */
  function playGraph(b, walls, bridges) {
    var wall = new Set((walls || []).map(function (w) { return Math.min(w[0], w[1]) + "-" + Math.max(w[0], w[1]); }));
    var nbrs = b.nbrs.map(function (ns, i) { return ns.filter(function (j) { return !wall.has(Math.min(i, j) + "-" + Math.max(i, j)); }); });
    var cellOf = []; for (var i = 0; i < b.n; i++) cellOf.push(i);
    (bridges || []).forEach(function (br, k) {
      var c = br.cell, L1 = br.lanes[0], L2 = br.lanes[1], lane2 = b.n + k;
      cellOf.push(c);
      b.nbrs[c].forEach(function (j) { // every side but the four lane ends is closed
        if (L1.indexOf(j) < 0) nbrs[j] = nbrs[j].filter(function (x) { return x !== c; });
      });
      var open = function (j) { return !wall.has(Math.min(c, j) + "-" + Math.max(c, j)); };
      var l2 = L2.filter(open);
      l2.forEach(function (j) { if (nbrs[j].indexOf(lane2) < 0) nbrs[j].push(lane2); });
      nbrs[c] = L1.filter(open);
      nbrs.push(l2);
    });
    return { n: nbrs.length, nbrs: nbrs, cellOf: cellOf, cells: b.n };
  }

  /* Lanes for a bridge on cell c: two pairs of sides that alternate around
     it, as near to straight across as the cell's shape allows. */
  function bridgeLanes(b, c, rot) {
    var ns = b.nbrs[c], k = ns.length, h = Math.ceil(k / 2), at = function (i) { return ns[(i + rot) % k]; };
    return [[at(0), at(h)], [at(1), at(h + 1)]];
  }

  S.board = board;
  S.playGraph = playGraph;
  S.bridgeLanes = bridgeLanes;
})();
