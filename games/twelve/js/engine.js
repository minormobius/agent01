/* Twelve — 2048 on a buckyball.

   A 2048 swipe means "everything moves one way", and on a sphere there is
   no one way: the hairy ball theorem says every direction field on a
   sphere has a point where it vanishes. So the moves here are built on
   those points. The twelve pentagons are DRAINS. Nothing sits on a drain;
   a move picks one, and every tile slides downhill toward it (one hex
   nearer each step, the step best aimed at the drain) until it rests on
   the drain's rim or against another tile. Equal tiles that meet merge,
   once per tile per move, nearest the drain first, as against a wall.

   Measured (test/analysis.mjs, the same simulator reproduces classic
   2048's known numbers): on C60, twenty hexes and one new tile a move,
   random play tops out at 128, the same as 4×4 2048, and greedy play
   reaches 1024–2048 against 2048's 256. The luck floor is the same and
   skill is worth about eight times as much: twelve drains are three times
   the moves of four walls, and a drain next to the last one is a small,
   controlled shove. C80 (thirty hexes) with three new tiles a move plays
   about as tight. Bigger spheres don't work: the drains sit too far
   apart, so tiles pour together and merge on their own. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var T = NS.TWELVE = NS.TWELVE || {};

  T.MODES = {
    c60: { sphere: "c60", drop: 1, label: "C60 · twenty" },
    c80: { sphere: "c80", drop: 3, label: "C80 · thirty, three a move" }
  };

  function hash(str) { var h = 2166136261 >>> 0; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function rngFrom(seed) {
    var a = hash(String(seed));
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* The drains of a sphere. For each pentagon p: d[i] = hex steps from i
     to p's rim (0 on the rim, -1 on pentagons), down[i] = the hex one step
     nearer (the one best aimed at p), order = the hexes nearest first. */
  var cache = {};
  function setup(name) {
    if (cache[name]) return cache[name];
    var s = NS.COAST.sphere(name), pents = [];
    for (var i = 0; i < s.n; i++) if (s.pent[i]) pents.push(i);
    var dot = function (a, b) { return s.pos[3 * a] * s.pos[3 * b] + s.pos[3 * a + 1] * s.pos[3 * b + 1] + s.pos[3 * a + 2] * s.pos[3 * b + 2]; };
    var drains = pents.map(function (p) {
      var d = new Int32Array(s.n).fill(-1), q = [];
      s.nbrs[p].forEach(function (v) { d[v] = 0; q.push(v); });
      for (var h = 0; h < q.length; h++) s.nbrs[q[h]].forEach(function (v) { if (d[v] < 0 && !s.pent[v]) { d[v] = d[q[h]] + 1; q.push(v); } });
      var down = new Int32Array(s.n).fill(-1);
      for (var k = 0; k < s.n; k++) {
        if (d[k] <= 0) continue;
        var best = -1, bd = -2;
        s.nbrs[k].forEach(function (v) { if (d[v] === d[k] - 1 && dot(v, p) > bd) { bd = dot(v, p); best = v; } });
        down[k] = best;
      }
      var order = [];
      for (k = 0; k < s.n; k++) if (!s.pent[k]) order.push(k);
      order.sort(function (a, b) { return d[a] - d[b] || a - b; });
      return { p: p, d: d, down: down, order: order };
    });
    var env = { s: s, drains: drains, hexes: s.n - pents.length };
    cache[name] = env; return env;
  }

  /* One move toward drain w, on a copy of g. Returns the new values, the
     points scored, and a trail per tile that moved (the cells it passed
     through, and whether it merged at the end) for the animation. */
  function pull(env, g, w) {
    var W = env.drains[w], out = g.slice(), merged = new Uint8Array(g.length), trails = [], score = 0;
    for (var q = 0; q < W.order.length; q++) {
      var i = W.order[q]; if (!out[i]) continue;
      var u = i, path = [i], merge = false;
      while (W.down[u] >= 0) {
        var v = W.down[u];
        if (!out[v]) { out[v] = out[u]; out[u] = 0; u = v; path.push(v); continue; }
        if (out[v] === out[u] && !merged[v]) { out[v] *= 2; score += out[v]; out[u] = 0; merged[v] = 1; path.push(v); merge = true; }
        break;
      }
      if (path.length > 1) trails.push({ path: path, value: g[i], merge: merge });
    }
    return { g: out, score: score, trails: trails, moved: trails.length > 0 };
  }

  function Game(mode, seed) {
    this.mode = T.MODES[mode] || T.MODES.c60; this.key = mode in T.MODES ? mode : "c60";
    this.env = setup(this.mode.sphere); this.s = this.env.s;
    this.seed = String(seed); this.rnd = rngFrom("twelve:" + this.key + ":" + this.seed);
    this.g = new Array(this.s.n).fill(0); this.score = 0; this.moves = 0; this.last = -1; this.spawned = [];
    for (var k = 0; k < this.mode.drop + 1; k++) this.spawn();
  }
  Game.prototype.spawn = function () {
    var e = [], g = this.g, s = this.s;
    for (var i = 0; i < s.n; i++) if (!g[i] && !s.pent[i]) e.push(i);
    if (!e.length) return -1;
    var c = e[Math.floor(this.rnd() * e.length)];
    g[c] = this.rnd() < 0.9 ? 2 : 4; this.spawned.push(c);
    return c;
  };
  Game.prototype.preview = function (w) { return pull(this.env, this.g, w); };
  /* Make a move toward drain w. Returns the move (with trails), or null
     if nothing would move. */
  Game.prototype.move = function (w) {
    var r = pull(this.env, this.g, w);
    if (!r.moved) return null;
    this.g = r.g; this.score += r.score; this.moves++; this.last = w; this.spawned = [];
    for (var k = 0; k < this.mode.drop; k++) this.spawn();
    r.spawned = this.spawned.slice();
    return r;
  };
  Game.prototype.canMove = function () { for (var w = 0; w < this.env.drains.length; w++) if (pull(this.env, this.g, w).moved) return true; return false; };
  Game.prototype.best = function () { return Math.max.apply(null, this.g); };
  Game.prototype.save = function () { return { k: this.key, seed: this.seed, g: this.g, score: this.score, moves: this.moves, last: this.last }; };
  Game.restore = function (o) {
    if (!o || !T.MODES[o.k]) return null;
    var G = new Game(o.k, o.seed);
    if (!o.g || o.g.length !== G.s.n) return null;
    G.g = o.g.slice(); G.score = o.score || 0; G.moves = o.moves || 0; G.last = o.last == null ? -1 : o.last; G.spawned = [];
    // advance the spawn stream past the moves already played, so a restored game deals what it would have
    for (var k = 0; k < G.moves * G.mode.drop * 2; k++) G.rnd();
    return G;
  };

  T.setup = setup; T.pull = pull; T.Game = Game; T.rngFrom = rngFrom;
})();
