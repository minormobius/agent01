/* One Coast — worlds, tiles, and the one-coastline rule.

   Every side of every tile is LAND or SEA, and a side is shared: both tiles
   that meet there must agree. Where a tile's land side meets its own sea
   side, at a corner, a coast runs into the tile. Inside a tile with several
   land runs the CENTRE decides how they join: a land centre makes one
   landmass with sea bays cut into it; a sea centre makes one bay of sea
   with separate capes of land. So a tile is (side bits, centre bit), up to
   rotation: 14 side patterns, and every one but the two uniform tiles
   comes in a bay version and a cape version, so 26 kinds of hexagon.
   Tiles turn but never flip.

   Pentagons are uniform: all land (a massif) or all sea (a deep).

   THE RULE. On a sphere, one continent and one ocean is the same thing as
   exactly one coastline: if land and sea are each connected, the shore
   between them is a single closed loop. In general, with L land masses and
   S seas, a sphere has L + S − 1 coastlines (the regions form a tree). So a
   world's score is its coastline count, and a perfect world has one.

   A world's tiles are what goes in the bag, so the generator only makes
   perfect worlds: a perfect finish is proved to exist when the game starts. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var C = NS.COAST = NS.COAST || {};

  function rngFrom(seed) {
    var h = 1779033703 ^ String(seed).length;
    for (var i = 0; i < String(seed).length; i++) { h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    var a = h >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  C.rngFrom = rngFrom;

  /* side index of tile i facing tile j */
  function sideTo(s, i, j) { return s.nbrs[i].indexOf(j); }

  /* A tile as placed: edges[j] for the cell's side j (rotation already
     applied), centre bit. */
  function placedEdges(tile, rot, k) {
    var out = new Array(k);
    for (var j = 0; j < k; j++) out[j] = tile.e[(j + rot) % k];
    return out;
  }

  /* Canonical key for a tile: its side bits at the rotation that reads
     smallest, then the centre. */
  function tileKey(edges, centre) {
    var k = edges.length, best = null;
    for (var r = 0; r < k; r++) {
      var s = "";
      for (var j = 0; j < k; j++) s += edges[(j + r) % k];
      if (best === null || s < best) best = s;
    }
    return best + ":" + normCentre(edges, centre);
  }
  /* A uniform tile's centre is its edges' type (no inland lakes, no islands
     in a tile); otherwise the centre is free. */
  function normCentre(edges, centre) {
    var land = 0; for (var j = 0; j < edges.length; j++) land += edges[j];
    return land === 0 ? 0 : land === edges.length ? 1 : centre;
  }
  function tileFromKey(key) {
    var p = key.split(":");
    return { e: p[0].split("").map(Number), c: Number(p[1]), key: key };
  }

  /* Land runs: maximal arcs of land sides, as [startSide, length]. */
  function runs(edges, bit) {
    var k = edges.length, out = [], start = -1;
    var all = edges.every(function (x) { return x === bit; });
    if (all) return [[0, k]];
    for (var j = 0; j < k; j++) if (edges[j] === bit && edges[(j + k - 1) % k] !== bit) {
      var len = 0; while (edges[(j + len) % k] === bit) len++;
      out.push([j, len]);
    }
    return out;
  }

  /* Count land masses and seas over a fully tiled sphere.
     world: { edges: [cell][side] bits, centre: [cell] bit } */
  function census(s, world) {
    // pieces: per cell, per side → piece id
    var parent = [], pieceOf = s.nbrs.map(function (ns) { return new Array(ns.length); });
    function mk(bit) { parent.push(parent.length); kind.push(bit); return parent.length - 1; }
    var kind = [];
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[a] = b; }
    for (var i = 0; i < s.n; i++) {
      var e = world.edges[i], c = normCentre(e, world.centre[i]);
      [1, 0].forEach(function (bit) {
        var rs = runs(e, bit);
        if (!rs.length || (rs.length === 1 && rs[0][1] === 0)) return;
        if (e.every(function (x) { return x !== bit; })) return;
        if (c === bit) { // centre joins all runs of this kind
          var id = mk(bit);
          rs.forEach(function (r) { for (var q = 0; q < r[1]; q++) pieceOf[i][(r[0] + q) % e.length] = id; });
        } else rs.forEach(function (r) { var id2 = mk(bit); for (var q = 0; q < r[1]; q++) pieceOf[i][(r[0] + q) % e.length] = id2; });
      });
    }
    for (i = 0; i < s.n; i++) s.nbrs[i].forEach(function (j, side) {
      if (j < i) return;
      union(pieceOf[i][side], pieceOf[j][sideTo(s, j, i)]);
    });
    var roots = new Map();
    for (var p = 0; p < parent.length; p++) { var r = find(p); if (!roots.has(r)) roots.set(r, kind[r]); }
    var land = 0, sea = 0;
    roots.forEach(function (bit) { if (bit) land++; else sea++; });
    return { land: land, sea: sea, coasts: land && sea ? land + sea - 1 : 0, pieceOf: pieceOf, find: find };
  }

  /* A perfect world on sphere s: a smooth random field, thresholded, with
     pentagons made uniform, retried until it has one land and one sea.
     opts: { seed, land (fraction of sides, default 0.42) } */
  function generate(s, opts) {
    opts = opts || {};
    var seed = opts.seed == null ? "world" : opts.seed, frac = opts.land == null ? 0.42 : opts.land;
    var V = function (i) { return [s.verts[3 * i], s.verts[3 * i + 1], s.verts[3 * i + 2]]; };
    // side midpoints, shared
    var sideMid = s.polys.map(function (ring) { return ring.map(function (a, j) { var b = ring[(j + 1) % ring.length], A = V(a), B = V(b), m = [A[0] + B[0], A[1] + B[1], A[2] + B[2]], l = Math.hypot(m[0], m[1], m[2]); return [m[0] / l, m[1] / l, m[2] / l]; }); });
    var cen = function (i) { return [s.pos[3 * i], s.pos[3 * i + 1], s.pos[3 * i + 2]]; };
    for (var attempt = 0; attempt < 400; attempt++) {
      var rnd = rngFrom(seed + "#" + attempt), blobs = [];
      var nb = 3 + Math.floor(rnd() * 4);
      for (var b = 0; b < nb; b++) {
        var z = 2 * rnd() - 1, t = 2 * Math.PI * rnd(), r = Math.sqrt(1 - z * z);
        blobs.push({ c: [r * Math.cos(t), r * Math.sin(t), z], w: (rnd() < 0.75 ? 1 : -0.7) * (0.6 + rnd()), k: 2 + rnd() * 5 });
      }
      // fine detail, so shores cut through tiles instead of tracing them
      var wob = []; for (b = 0; b < 16; b++) { var z2 = 2 * rnd() - 1, t2 = 2 * Math.PI * rnd(), r2 = Math.sqrt(1 - z2 * z2); wob.push({ c: [r2 * Math.cos(t2), r2 * Math.sin(t2), z2], w: 0.5 * (rnd() - 0.5), k: 12 + rnd() * 18 }); }
      var field = function (p) {
        var v = 0;
        blobs.concat(wob).forEach(function (bl) { var d = p[0] * bl.c[0] + p[1] * bl.c[1] + p[2] * bl.c[2]; v += bl.w * Math.exp(bl.k * (d - 1)); });
        return v;
      };
      // threshold at the quantile that gives the land fraction
      var vals = []; sideMid.forEach(function (ms) { ms.forEach(function (m) { vals.push(field(m)); }); });
      vals.sort(function (a, c) { return a - c; });
      var th = vals[Math.floor((1 - frac) * vals.length)];
      var edges = sideMid.map(function (ms) { return ms.map(function (m) { return field(m) > th ? 1 : 0; }); });
      var centre = s.polys.map(function (_, i) { return field(cen(i)) > th ? 1 : 0; });
      // pentagons uniform, and their neighbours agree on the shared side
      for (var i = 0; i < s.n; i++) if (s.pent[i]) {
        var bit = centre[i];
        edges[i] = edges[i].map(function () { return bit; });
        s.nbrs[i].forEach(function (j) { edges[j][sideTo(s, j, i)] = bit; });
      }
      // shared sides agree (both tiles read the same midpoint; this is belt and braces)
      for (i = 0; i < s.n; i++) s.nbrs[i].forEach(function (j, side) { edges[j][sideTo(s, j, i)] = edges[i][side]; });
      centre = centre.map(function (c, i) { return normCentre(edges[i], c); });
      var w = { edges: edges, centre: centre };
      var cs = census(s, w);
      var pentLand = 0; for (i = 0; i < s.n; i++) if (s.pent[i]) pentLand += centre[i];
      // perfect, and the twelve pentagons not all one kind (they're a mix of massifs and deeps)
      if (cs.land === 1 && cs.sea === 1 && pentLand > 1 && pentLand < 11) { w.attempts = attempt + 1; w.seed = seed; return w; }
    }
    throw new Error("no perfect world for seed " + seed);
  }

  /* The bag: every hexagon of the world as a tile kind. */
  function bag(s, world) {
    var out = [];
    for (var i = 0; i < s.n; i++) if (!s.pent[i]) out.push(tileKey(world.edges[i], world.centre[i]));
    return out;
  }

  /* Can tile t sit in cell i at rotation r, given what's placed? */
  function fits(s, placed, i, t, r) {
    var k = s.nbrs[i].length;
    if (t.e.length !== k) return false;
    for (var j = 0; j < k; j++) {
      var nb = s.nbrs[i][j], p = placed[nb];
      if (!p) continue;
      if (p.edges[sideTo(s, nb, i)] !== t.e[(j + r) % k]) return false;
    }
    return true;
  }
  /* Every legal (cell, rotation) for tile t; touching=true requires a placed neighbour. */
  function spots(s, placed, t) {
    var out = [];
    for (var i = 0; i < s.n; i++) {
      if (placed[i] || s.pent[i]) continue;
      var touch = s.nbrs[i].some(function (j) { return placed[j]; });
      if (!touch) continue;
      var seen = new Set();
      for (var r = 0; r < t.e.length; r++) {
        var key = placedEdges(t, r, t.e.length).join("");
        if (seen.has(key)) continue; // symmetric tiles: one entry per distinct orientation
        seen.add(key);
        if (fits(s, placed, i, t, r)) out.push({ cell: i, rot: r });
      }
    }
    return out;
  }
  function place(s, placed, i, t, r) {
    var k = s.nbrs[i].length;
    placed[i] = { key: t.key, rot: r, edges: placedEdges(t, r, k), centre: t.c };
  }
  /* The pentagons, placed from the start. */
  function startBoard(s, world) {
    var placed = new Array(s.n).fill(null);
    for (var i = 0; i < s.n; i++) if (s.pent[i]) placed[i] = { key: tileKey(world.edges[i], world.centre[i]), rot: 0, edges: world.edges[i].slice(), centre: world.centre[i], fixed: true };
    return placed;
  }

  /* The partial census, for play in progress. placed[i] is null (empty) or
     { edges, centre }. A side joins its two pieces only if both tiles are
     there and agree; a mismatched side is a CLIFF and joins nothing. A
     region is SEALED once none of its pieces touches an empty neighbour:
     it can never join anything again, so a sealed region that isn't the
     only one of its kind is a permanent island or lake. */
  function partial(s, placed) {
    var parent = [], kind = [], open = [], pieceOf = new Array(s.n), cliffs = 0;
    function mk(bit) { parent.push(parent.length); kind.push(bit); open.push(0); return parent.length - 1; }
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    for (var i = 0; i < s.n; i++) {
      var p = placed[i]; if (!p) continue;
      var e = p.edges, c = normCentre(e, p.centre), map = new Array(e.length);
      [1, 0].forEach(function (bit) {
        if (e.every(function (x) { return x !== bit; })) return;
        var rs = runs(e, bit);
        if (c === bit) { var id = mk(bit); rs.forEach(function (r) { for (var q = 0; q < r[1]; q++) map[(r[0] + q) % e.length] = id; }); }
        else rs.forEach(function (r) { var id2 = mk(bit); for (var q = 0; q < r[1]; q++) map[(r[0] + q) % e.length] = id2; });
      });
      pieceOf[i] = map;
    }
    for (i = 0; i < s.n; i++) {
      if (!placed[i]) continue;
      s.nbrs[i].forEach(function (j, side) {
        if (!placed[j]) { open[pieceOf[i][side]] = 1; return; }
        if (j < i) return;
        var other = sideTo(s, j, i);
        if (placed[i].edges[side] !== placed[j].edges[other]) { cliffs++; return; }
        var a = find(pieceOf[i][side]), b = find(pieceOf[j][other]);
        if (a !== b) { parent[a] = b; open[b] = open[b] || open[a]; }
      });
    }
    var land = 0, sea = 0, sealedLand = 0, sealedSea = 0, seen = new Set();
    for (var q = 0; q < parent.length; q++) {
      var r = find(q); if (seen.has(r)) continue; seen.add(r);
      var o = 0; for (var z = 0; z < parent.length; z++) if (find(z) === r && open[z]) { o = 1; break; }
      if (kind[r]) { land++; if (!o) sealedLand++; } else { sea++; if (!o) sealedSea++; }
    }
    return { land: land, sea: sea, sealedLand: sealedLand, sealedSea: sealedSea, cliffs: cliffs, coasts: land && sea ? land + sea - 1 : 0, pieceOf: pieceOf, find: find };
  }
  /* Every empty cell touching the map, with every distinct rotation of t,
     matching or not, and how many of its sides would be cliffs. */
  function anySpots(s, placed, t) {
    var out = [];
    for (var i = 0; i < s.n; i++) {
      if (placed[i] || s.pent[i] || t.e.length !== s.nbrs[i].length) continue;
      if (!s.nbrs[i].some(function (j) { return placed[j]; })) continue;
      var seen = new Set();
      for (var r = 0; r < t.e.length; r++) {
        var key = placedEdges(t, r, t.e.length).join("");
        if (seen.has(key)) continue; seen.add(key);
        var mis = 0, touch = 0;
        for (var j = 0; j < t.e.length; j++) { var nb = s.nbrs[i][j], p = placed[nb]; if (!p) continue; touch++; if (p.edges[sideTo(s, nb, i)] !== t.e[(j + r) % t.e.length]) mis++; }
        out.push({ cell: i, rot: r, cliffs: mis, touch: touch });
      }
    }
    return out;
  }
  C.partial = partial; C.anySpots = anySpots;
  /* FREE PAINT. The painter says only which tiles are land; sides and
     centres follow. A side between two land tiles is land, between two sea
     tiles sea; a side on the shore goes one way or the other by a fixed
     per-side coin, so the coastline wanders across tiles instead of tracing
     their outlines. Pentagons stay uniform. */
  function fromCells(s, land, salt) {
    var edges = s.nbrs.map(function (ns) { return new Array(ns.length); });
    for (var i = 0; i < s.n; i++) s.nbrs[i].forEach(function (j, side) {
      if (j < i) return;
      var bit;
      if (s.pent[i]) bit = land[i]; else if (s.pent[j]) bit = land[j];
      else if (land[i] === land[j]) bit = land[i];
      else bit = (rngFrom((salt || "paint") + ":" + i + "-" + j)() < 0.5) ? 1 : 0;
      edges[i][side] = bit; edges[j][sideTo(s, j, i)] = bit;
    });
    var centre = land.map(function (b, i) { return normCentre(edges[i], b ? 1 : 0); });
    return { edges: edges, centre: centre };
  }

  /* A world as text: sphere name, then every centre bit and every side bit
     (each shared side once, in tile order), packed six to a base64url char.
     A C240 world is about 80 characters, short enough for a link. Mappa
     rebuilds the same sphere and decodes the same bits. */
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function bitsOf(s, world) {
    var bits = world.centre.map(function (c) { return c ? 1 : 0; });
    for (var i = 0; i < s.n; i++) s.nbrs[i].forEach(function (j, side) { if (j > i) bits.push(world.edges[i][side]); });
    return bits;
  }
  function encode(s, world) {
    var bits = bitsOf(s, world), out = "";
    for (var q = 0; q < bits.length; q += 6) { var v = 0; for (var b = 0; b < 6; b++) v = (v << 1) | (bits[q + b] || 0); out += B64[v]; }
    return s.name + "." + out;
  }
  function decode(token) {
    var dot = token.indexOf("."), name = token.slice(0, dot), s = C.sphere(name), body = token.slice(dot + 1), bits = [];
    for (var q = 0; q < body.length; q++) { var v = B64.indexOf(body[q]); for (var b = 5; b >= 0; b--) bits.push((v >> b) & 1); }
    var centre = bits.slice(0, s.n), edges = s.nbrs.map(function (ns) { return new Array(ns.length); }), at = s.n;
    for (var i = 0; i < s.n; i++) s.nbrs[i].forEach(function (j, side) {
      if (j <= i) return;
      var bit = bits[at++] || 0; edges[i][side] = bit; edges[j][sideTo(s, j, i)] = bit;
    });
    return { sphere: s, world: { edges: edges, centre: centre.map(function (c, i) { return normCentre(edges[i], c); }) } };
  }

  /* A smooth land/sea field for a world, for anyone who wants "is this point
     land?" off the tiles (mappa's elevation). Every centre and side midpoint
     is a sample; the field is their kernel-weighted vote in [-1, 1]. */
  function field(s, world) {
    var pts = [], vals = [];
    var V = function (i) { return [s.verts[3 * i], s.verts[3 * i + 1], s.verts[3 * i + 2]]; };
    for (var i = 0; i < s.n; i++) {
      pts.push([s.pos[3 * i], s.pos[3 * i + 1], s.pos[3 * i + 2]]); vals.push(world.centre[i] ? 1 : -1);
      s.polys[i].forEach(function (a, j) {
        if (s.nbrs[i][j] < i) return;
        var A = V(a), B = V(s.polys[i][(j + 1) % s.polys[i].length]), m = [A[0] + B[0], A[1] + B[1], A[2] + B[2]], l = Math.hypot(m[0], m[1], m[2]);
        pts.push([m[0] / l, m[1] / l, m[2] / l]); vals.push(world.edges[i][j] ? 1 : -1);
      });
    }
    var spacing = Math.sqrt(4 * Math.PI / pts.length), kappa = 1.2 / (spacing * spacing);
    return function (p) {
      var num = 0, den = 0;
      for (var q = 0; q < pts.length; q++) {
        var d = p[0] * pts[q][0] + p[1] * pts[q][1] + p[2] * pts[q][2];
        if (d < 0.5) continue;
        var w = Math.exp(kappa * (d - 1)); num += w * vals[q]; den += w;
      }
      return den ? num / den : -1;
    };
  }
  C.fromCells = fromCells; C.encode = encode; C.decode = decode; C.field = field;
  C.census = census; C.generate = generate; C.bag = bag; C.fits = fits; C.spots = spots; C.place = place;
  C.startBoard = startBoard; C.tileKey = tileKey; C.tileFromKey = tileFromKey; C.runs = runs; C.normCentre = normCentre;
  C.sideTo = sideTo; C.placedEdges = placedEdges;
})();
