/* Twelve — 2048 on a buckyball.

   A 2048 swipe means "everything moves one way", and on a sphere there is
   no one way: the hairy ball theorem says every direction field on a
   sphere has a point where it vanishes. So the moves here are built on
   those points. The twelve pentagons are DRAINS. Nothing sits on a drain;
   a move picks one, and every tile slides toward it along its lane, one of
   the drain's five spiral arms (see setup), until it reaches the drain's
   rim or meets another tile. Equal tiles that meet merge, once per tile per
   move, nearest the drain first: each arm is exactly a row of 2048.

   Measured (test/analysis.mjs, whose simulator reproduces classic 2048's
   known numbers): on C60, five arms of four, one new tile a move, random
   play reaches 64–128 like 4×4 2048, and greedy play 256–512 against
   2048's 128–256. Same luck floor, about twice the room for skill, from
   twelve directions where 2048 has four. C80, five arms of six with four
   new tiles a move, is the longer game. Bigger spheres are far too roomy. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var T = NS.TWELVE = NS.TWELVE || {};

  T.MODES = {
    c60: { sphere: "c60", drop: 1, label: "C60 · twenty" },
    c80: { sphere: "c80", drop: 4, label: "C80 · thirty, four a move" }
  };

  function hash(str) { var h = 2166136261 >>> 0; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function rngFrom(seed) {
    var a = hash(String(seed));
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* The drains of a sphere, each a five-armed WHIRLPOOL.

     A first version poured each tile down the steepest way, but the rings
     round a drain grow outward, so two tiles could want the same cell and
     which one won was invisible: an apparent coin toss. Instead: a pentagon
     has five-fold symmetry, so the hexes round it fall into orbits of five.
     An ARM is a chain of neighbours starting on the drain's rim and taking
     exactly one hex from each orbit; its five rotations are five lanes that
     cover every hex once and never touch. A pour is then exactly 2048, on
     five independent rows spiralling into the drain — no contention, ever.
     C60 has two arms (mirror images), C80 sixteen. We take the one that
     climbs outward most steadily and, between mirror twins, the one that
     turns anticlockwise seen from outside, so every drain swirls alike.

     For each drain: lanes (rim first), down[i] = the next hex toward the
     rim along i's lane (-1 on the rim), order = hexes rim-first, d = BFS
     hex distance from the rim (for scoring only). */
  var cache = {};
  function setup(name) {
    if (cache[name]) return cache[name];
    var s = NS.COAST.sphere(name), pents = [];
    for (var i = 0; i < s.n; i++) if (s.pent[i]) pents.push(i);
    var P = function (k) { return [s.pos[3 * k], s.pos[3 * k + 1], s.pos[3 * k + 2]]; };
    var nearest = function (q) { var b = -1, bd = -2; for (var k = 0; k < s.n; k++) { var d = q[0] * s.pos[3 * k] + q[1] * s.pos[3 * k + 1] + q[2] * s.pos[3 * k + 2]; if (d > bd) { bd = d; b = k; } } return b; };
    var drains = pents.map(function (p) {
      var d = new Int32Array(s.n).fill(-1), q = [];
      s.nbrs[p].forEach(function (v) { d[v] = 0; q.push(v); });
      for (var h = 0; h < q.length; h++) s.nbrs[q[h]].forEach(function (v) { if (d[v] < 0 && !s.pent[v]) { d[v] = d[q[h]] + 1; q.push(v); } });
      // the rotation by 72° about this drain, as a map on cells
      var ax = P(p), R = rotation(ax, 2 * Math.PI / 5), map = new Int32Array(s.n);
      for (var k = 0; k < s.n; k++) map[k] = nearest(R(P(k)));
      var orbit = new Int32Array(s.n).fill(-1), nOrb = 0;
      for (k = 0; k < s.n; k++) if (!s.pent[k] && orbit[k] < 0) { var j = k; do { orbit[j] = nOrb; j = map[j]; } while (j !== k); nOrb++; }
      // every arm from one rim hex (the others are its rotations)
      var arms = [], used = new Uint8Array(nOrb), path = [s.nbrs[p][0]];
      used[orbit[path[0]]] = 1;
      (function go() {
        if (path.length === nOrb) { arms.push(path.slice()); return; }
        s.nbrs[path[path.length - 1]].forEach(function (v) {
          if (s.pent[v] || used[orbit[v]]) return;
          used[orbit[v]] = 1; path.push(v); go(); path.pop(); used[orbit[v]] = 0;
        });
      })();
      // score: steady climbing outward (a step that holds its ring costs 1, one that falls back costs 3), then swirl
      var best = null, bestKey = null;
      arms.forEach(function (arm) {
        var cost = 0, swirl = 0;
        for (var a = 1; a < arm.length; a++) {
          var inc = d[arm[a]] - d[arm[a - 1]]; cost += inc === 1 ? 0 : inc === 0 ? 1 : 3;
          var u = P(arm[a - 1]), v = P(arm[a]);
          swirl += ax[0] * (u[1] * v[2] - u[2] * v[1]) + ax[1] * (u[2] * v[0] - u[0] * v[2]) + ax[2] * (u[0] * v[1] - u[1] * v[0]);
        }
        var key = [cost, swirl > 0 ? 0 : 1, -Math.abs(swirl)];
        if (!best || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2] - 1e-9)))) { best = arm; bestKey = key; }
      });
      var lanes = [], lane = best;
      for (var r = 0; r < 5; r++) { lanes.push(lane); lane = lane.map(function (c) { return map[c]; }); }
      var down = new Int32Array(s.n).fill(-1), pos = new Int32Array(s.n).fill(-1);
      lanes.forEach(function (L) { L.forEach(function (c, at) { pos[c] = at; down[c] = at ? L[at - 1] : -1; }); });
      var order = [];
      for (k = 0; k < s.n; k++) if (!s.pent[k]) order.push(k);
      order.sort(function (a, b) { return pos[a] - pos[b] || a - b; });
      return { p: p, d: d, down: down, order: order, lanes: lanes, arms: arms.length };
    });
    var env = { s: s, drains: drains, hexes: s.n - pents.length };
    cache[name] = env; return env;
  }
  function rotation(ax, t) {
    var x = ax[0], y = ax[1], z = ax[2], c = Math.cos(t), sn = Math.sin(t), C1 = 1 - c;
    return function (p) { return [
      (c + x * x * C1) * p[0] + (x * y * C1 - z * sn) * p[1] + (x * z * C1 + y * sn) * p[2],
      (y * x * C1 + z * sn) * p[0] + (c + y * y * C1) * p[1] + (y * z * C1 - x * sn) * p[2],
      (z * x * C1 - y * sn) * p[0] + (z * y * C1 + x * sn) * p[1] + (c + z * z * C1) * p[2]]; };
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
