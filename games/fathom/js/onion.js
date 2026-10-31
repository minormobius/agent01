/* Fathom — the minefield: an onion of Voronoi shells.

   K concentric shells, each its own Voronoi sphere (../orb/js/sphere.js,
   walls evened), outermost first. A cell's neighbours are its ring on its
   own shell, and the cells it overlaps on the shells just inside and just
   outside it: bricks, not columns, so every number reaches about three
   cells into the layer below and a buried mine shows through the shells
   above it. Overlaps under OVERLAP of a cell's area are dropped: a sliver of
   contact you can't see is the short-wall problem again, in depth.

   The board is just a graph, { n, nbrs }, so Orb's rules and its no-guess
   solver and generator (../orb/js/rules.js, solve.js) play it unchanged.
   Cell id = shell × per + index on that shell. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.ORB, F = NS.FATHOM = NS.FATHOM || {};

  var OVERLAP = 0.08, SAMPLES = 260, DEPTH = 2.2;
  F.SIZES = {
    shallow: { shells: 3, per: 110, m: 48, label: "shallow · 3 shells" },
    deep: { shells: 4, per: 160, m: 100, label: "deep · 4 shells" },
    abyss: { shells: 5, per: 200, m: 171, label: "abyss · 5 shells" },
  };
  /* Shell radii, outermost 1: evenly spaced, the core a sphere of RCORE. */
  var RCORE = 0.32;
  function radius(k, K) { return 1 - (1 - RCORE - 0.06) * k / Math.max(1, K - 1); }

  function build(size, seed) {
    var c = F.SIZES[size], K = c.shells, per = c.per, shells = [];
    for (var k = 0; k < K; k++) shells.push(O.buildMesh(seed + ":" + k, per, 2, true));
    // overlaps between neighbouring shells, by a Fibonacci lattice of directions
    var N = SAMPLES * per, ga = Math.PI * (3 - Math.sqrt(5)), hits = [];
    for (k = 0; k + 1 < K; k++) hits.push(new Map());
    var at = new Int32Array(K);
    for (var s = 0; s < N; s++) {
      var z = 1 - 2 * (s + 0.5) / N, r = Math.sqrt(1 - z * z), th = ga * s, x = r * Math.cos(th), y = r * Math.sin(th);
      for (k = 0; k < K; k++) at[k] = O.cellAt(shells[k], x, y, z);
      for (k = 0; k + 1 < K; k++) { var key = at[k] * 100000 + at[k + 1]; hits[k].set(key, (hits[k].get(key) || 0) + 1); }
    }
    var nbrs = [], min = OVERLAP * SAMPLES;
    for (k = 0; k < K; k++) for (var i = 0; i < per; i++) nbrs.push(shells[k].nbrs[i].map(function (j) { return k * per + j; }));
    var down = [], up = [];
    for (k = 0; k < K * per; k++) { down.push([]); up.push([]); }
    hits.forEach(function (H, k2) {
      H.forEach(function (cnt, key) {
        if (cnt < min) return;
        var a = k2 * per + Math.floor(key / 100000), b = (k2 + 1) * per + key % 100000;
        nbrs[a].push(b); nbrs[b].push(a); down[a].push(b); up[b].push(a);
      });
    });
    var R = []; for (k = 0; k < K; k++) R.push(radius(k, K));
    // zeros flood only along their own shell: going deeper is always a tap of your own (the cells below a
    // zero are just as certain, so the solver and the no-guess proof don't change)
    var flood = []; for (k = 0; k < K; k++) for (i = 0; i < per; i++) flood.push(shells[k].nbrs[i].map(function (j) { return k * per + j; }));
    // the water gets denser with depth: the innermost shell is DEPTH times as likely to hold a mine as the outermost
    var weight = new Float64Array(K * per); for (k = 0; k < K; k++) for (i = 0; i < per; i++) weight[k * per + i] = 1 + (DEPTH - 1) * k / Math.max(1, K - 1);
    return { n: K * per, nbrs: nbrs, flood: flood, weight: weight, shells: shells, K: K, per: per, radii: R, down: down, up: up, seed: seed, size: size, fathom: true };
  }
  F.build = build; F.RCORE = RCORE;
  F.shellOf = function (m, i) { return Math.floor(i / m.per); };
})();
