/* One Side — the surface and its maze.

   A Möbius strip has one side, but at any spot it has two faces. Take the
   paper's whole surface, both faces of the strip together: it is one long
   band, twice as long as the strip, with no twist (the strip's double
   cover). Paint the maze on THAT. The back of the spot you stand on is the
   part of the surface half its length further on, flipped top to bottom:

       back(x, y) = (x + L, H − 1 − y)      on a band of length 2L, height H

   so the maze on the back of the paper is a different stretch of the same
   maze. The strip's two long edges are one edge, and the band wraps round.

   The maze is classic in shape: corridors one tile wide on node rows and
   columns, walls in between, no dead ends, plenty of loops. Node columns
   every 3 tiles round the band; node rows mirror about the middle, so a
   node's back is a node. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var M = NS.ONESIDE = NS.ONESIDE || {};

  var L = 24, W = 2 * L, H = 17, ROWS = [1, 4, 8, 12, 15], STEP = 3, COLS = W / STEP;

  function rng(seed) { // mulberry32 on a string hash
    var h = 2166136261 >>> 0; seed = String(seed);
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    var a = h;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function wrapX(x) { x %= W; return x < 0 ? x + W : x; }
  /* The other face of (x, y): the same spot of the strip. An involution. */
  function back(x, y) { return [wrapX(x + L), H - 1 - y]; }
  /* Signed x from a to b the short way round the band. */
  function dx(a, b) { var d = wrapX(b - a); return d > L ? d - W : d; }

  function build(seed) {
    var R = rng("oneside:" + seed), nr = ROWS.length, node = function (c, r) { return r * COLS + c; }, N = COLS * nr;
    var edges = [];
    for (var r = 0; r < nr; r++) for (var c = 0; c < COLS; c++) {
      edges.push([node(c, r), node((c + 1) % COLS, r)]);
      if (r + 1 < nr) edges.push([node(c, r), node(c, r + 1)]);
    }
    // a random spanning tree (Kruskal), then loops: every node at least two ways out, and some more
    var parent = []; for (var i = 0; i < N; i++) parent.push(i);
    var find = function (a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    var order = edges.map(function (e, k) { return [R(), k]; }).sort(function (a, b) { return a[0] - b[0]; });
    var on = new Uint8Array(edges.length), deg = new Int32Array(N);
    order.forEach(function (o) { var e = edges[o[1]], a = find(e[0]), b = find(e[1]); if (a !== b) { parent[a] = b; on[o[1]] = 1; deg[e[0]]++; deg[e[1]]++; } });
    order.forEach(function (o) { var e = edges[o[1]]; if (!on[o[1]] && (deg[e[0]] < 2 || deg[e[1]] < 2 || R() < 0.22)) { on[o[1]] = 1; deg[e[0]]++; deg[e[1]]++; } });
    // carve
    var open = new Uint8Array(W * H), at = function (x, y) { return y * W + wrapX(x); };
    var xy = function (n) { return [(n % COLS) * STEP, ROWS[Math.floor(n / COLS)]]; };
    edges.forEach(function (e, k) {
      if (!on[k]) return;
      var a = xy(e[0]), b = xy(e[1]);
      if (a[1] === b[1]) for (var t = 0; t <= STEP; t++) open[at(a[0] + t, a[1])] = 1;
      else for (var y = a[1]; y <= b[1]; y++) open[at(a[0], y)] = 1;
    });
    // places: the ghosts' spawn and Pac's start (physically well apart), four power pellets
    var spawn = [12, 8], start = [24, 15];
    if (!open[at(spawn[0], spawn[1])] || !open[at(start[0], start[1])]) { open[at(spawn[0], spawn[1])] = 1; open[at(start[0], start[1])] = 1; }
    var power = [[3, 1], [21, 15], [27, 1], [45, 15]].map(function (p) { return nearestOpen(open, p[0], p[1]); });
    var dots = new Uint8Array(W * H);
    for (i = 0; i < W * H; i++) dots[i] = open[i];
    dots[at(start[0], start[1])] = 0; dots[at(spawn[0], spawn[1])] = 0;
    power.forEach(function (p) { dots[at(p[0], p[1])] = 2; });
    return { seed: seed, L: L, W: W, H: H, open: open, dots: dots, spawn: spawn, start: start, power: power, rows: ROWS, step: STEP };
  }
  function nearestOpen(open, x, y) {
    var best = null, bd = 1e9;
    for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) if (open[yy * W + xx]) { var d = Math.abs(dx(x, xx)) + Math.abs(yy - y); if (d < bd) { bd = d; best = [xx, yy]; } }
    return best;
  }

  M.build = build; M.back = back; M.dx = dx; M.wrapX = wrapX; M.rng = rng;
  M.L = L; M.W = W; M.H = H;
  M.isOpen = function (mz, x, y) { return y >= 0 && y < H && mz.open[y * W + wrapX(x)] === 1; };
})();
