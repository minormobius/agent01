/* Twelve — 2048 on a buckyball.

   A 2048 swipe means "everything moves one way", and on a sphere there is
   no one way: the hairy ball theorem says every direction field on a
   sphere has a point where it vanishes. So the moves here are built on
   those points. DRAINS are cells nothing sits on; a move picks one and
   every tile pours toward it until it reaches the drain's rim or meets
   another tile. Equal tiles that meet merge, once per tile per move,
   nearest the drain first, as against a wall.

   Two ways to pour (FLOWS):
     gravity  each tile takes the steepest way down (one hex nearer each
              step, the step best aimed at the drain). Rings round a drain
              grow outward, so tiles funnel together: two can want one
              cell, and the nearer one (truly nearer, on the sphere) gets
              it. The aiming preview shows who wins before you pour.
     vortex   each pentagon drain is a whirlpool of five spiral arms that
              never share a cell (see arms below), so a pour is exactly
              2048 on five rows and nothing ever contends. Pentagon drains
              only, so C60 and C80.

   The bigger spheres (SPECIES): every rotation axis of the icosahedron can
   be a drain where a cell sits on it — 12 five-fold (the pentagons), 20
   three-fold (face centres), 30 two-fold (edge midpoints). C180 has hexes
   on the three-fold axes, C240 on the two-fold ones. Without them the big
   spheres are so roomy that a one-move-ahead player never dies; with them,
   and with RAIN (one more new tile a move every 100 moves), every game
   ends and skill is how long you last. Numbers: test/analysis.mjs. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var T = NS.TWELVE = NS.TWELVE || {};

  T.MODES = {
    c60: { sphere: "c60", axes: [5], drop: 1, rain: 0, label: "C60 · 20 cells · 12 drains" },
    c80: { sphere: "c80", axes: [5], drop: 1, rain: 100, label: "C80 · 30 cells · 12 drains · rain" },
    c180: { sphere: "c180", axes: [5, 3], drop: 1, rain: 100, label: "C180 · 60 cells · 32 drains · rain" },
    c240: { sphere: "c240", axes: [5, 2], drop: 1, rain: 100, label: "C240 · 80 cells · 42 drains · rain" }
  };
  T.FLOWS = ["gravity", "vortex"];
  T.flows = function (mode) { var M = T.MODES[mode]; return M && M.axes.length === 1 ? T.FLOWS : ["gravity"]; };

  function hash(str) { var h = 2166136261 >>> 0; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function rngFrom(seed) {
    var a = hash(String(seed));
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function rotation(ax, t) {
    var x = ax[0], y = ax[1], z = ax[2], c = Math.cos(t), sn = Math.sin(t), C1 = 1 - c;
    return function (p) { return [
      (c + x * x * C1) * p[0] + (x * y * C1 - z * sn) * p[1] + (x * z * C1 + y * sn) * p[2],
      (y * x * C1 + z * sn) * p[0] + (c + y * y * C1) * p[1] + (y * z * C1 - x * sn) * p[2],
      (z * x * C1 - y * sn) * p[0] + (z * y * C1 + x * sn) * p[1] + (c + z * z * C1) * p[2]]; };
  }

  /* The board for a mode: which cells are drains, and how each pours.
     Each drain: p (its cell), fold (5, 3 or 2), d (hex steps from its rim),
     gravity { down, order }, vortex { down, order, lanes } or null. */
  var cache = {};
  function setup(mode) {
    if (typeof mode === "string" && !T.MODES[mode]) mode = { c60: "c60" }[mode] || mode;
    var M = T.MODES[mode] || T.MODES.c60, key = M.sphere + ":" + M.axes.join(",");
    if (cache[key]) return cache[key];
    var s = NS.COAST.sphere(M.sphere), n = s.n;
    var P = function (k) { return [s.pos[3 * k], s.pos[3 * k + 1], s.pos[3 * k + 2]]; };
    var dot = function (a, b) { return s.pos[3 * a] * s.pos[3 * b] + s.pos[3 * a + 1] * s.pos[3 * b + 1] + s.pos[3 * a + 2] * s.pos[3 * b + 2]; };
    var nearest = function (q) { var b = -1, bd = -2; for (var k = 0; k < n; k++) { var d = q[0] * s.pos[3 * k] + q[1] * s.pos[3 * k + 1] + q[2] * s.pos[3 * k + 2]; if (d > bd) { bd = d; b = k; } } return [b, bd]; };
    // the map on cells of the rotation by 360°/k about cell i's axis, or null if that isn't a symmetry
    var symMap = function (i, k) {
      var R = rotation(P(i), 2 * Math.PI / k), map = new Int32Array(n);
      for (var j = 0; j < n; j++) { var m = nearest(R(P(j))); if (m[1] < 1 - 1e-6) return null; map[j] = m[0]; }
      return map;
    };
    var fold = new Int8Array(n), maps = {};
    for (var i = 0; i < n; i++) {
      if (s.pent[i]) { fold[i] = 5; continue; }
      for (var a = 0; a < M.axes.length; a++) { var k = M.axes[a]; if (k !== 5 && symMap(i, k)) { fold[i] = k; break; } }
    }
    var hole = new Uint8Array(n), cells = 0;
    for (i = 0; i < n; i++) { if (fold[i]) hole[i] = 1; else cells++; }

    var drains = [];
    for (i = 0; i < n; i++) if (hole[i]) drains.push(drain(i));
    function drain(p) {
      var d = new Int32Array(n).fill(-1), q = [];
      s.nbrs[p].forEach(function (v) { if (!hole[v]) { d[v] = 0; q.push(v); } });
      for (var h = 0; h < q.length; h++) s.nbrs[q[h]].forEach(function (v) { if (d[v] < 0 && !hole[v]) { d[v] = d[q[h]] + 1; q.push(v); } });
      var down = new Int32Array(n).fill(-1);
      for (var c = 0; c < n; c++) {
        if (d[c] <= 0) continue;
        var best = -1, bd = -2;
        s.nbrs[c].forEach(function (v) { if (d[v] === d[c] - 1 && dot(v, p) > bd) { bd = dot(v, p); best = v; } });
        down[c] = best;
      }
      var order = [];
      for (c = 0; c < n; c++) if (!hole[c]) order.push(c);
      // nearest first: hex steps, then true distance on the sphere (the nearer tile wins a contested cell)
      order.sort(function (x, y) { return d[x] - d[y] || dot(y, p) - dot(x, p) || x - y; });
      return { p: p, fold: fold[p], d: d, gravity: { down: down, order: order }, vortex: null };
    }

    /* Vortex arms (pentagon drains, when they are the only drains). The
       hexes round a pentagon fall into orbits of five under its 72°
       rotation; an ARM is a chain of neighbours from the rim taking one hex
       from each orbit, and its five rotations partition the hexes into five
       lanes that never touch. Search: branch and bound on how unsteadily
       the arm climbs outward (a step that holds its ring costs 1, one that
       falls back 3); among the cheapest, the one that swirls anticlockwise
       seen from outside. Found for one drain, carried to the rest by the
       sphere's symmetry so every drain swirls alike. */
    if (M.axes.length === 1) {
      var D0 = drains[0], map0 = symMap(D0.p, 5), orbit = new Int32Array(n).fill(-1), nOrb = 0;
      for (i = 0; i < n; i++) if (!hole[i] && orbit[i] < 0) { var j = i; do { orbit[j] = nOrb; j = map0[j]; } while (j !== i); nOrb++; }
      var ax = P(D0.p), bestArm = null, bestKey = null, used = new Uint8Array(nOrb), path = [s.nbrs[D0.p][0]];
      used[orbit[path[0]]] = 1;
      var better = function (x, y) { return !y || x[0] < y[0] || (x[0] === y[0] && (x[1] < y[1] || (x[1] === y[1] && x[2] < y[2] - 1e-9))); };
      (function go(cost, swirl) {
        if (bestKey && cost > bestKey[0]) return;
        if (path.length === nOrb) { var key = [cost, swirl > 0 ? 0 : 1, -Math.abs(swirl)]; if (better(key, bestKey)) { bestKey = key; bestArm = path.slice(); } return; }
        var u = path[path.length - 1], U = P(u);
        s.nbrs[u].filter(function (v) { return !hole[v] && !used[orbit[v]]; })
          .sort(function (x, y) { return (D0.d[y] - D0.d[x]) || x - y; })
          .forEach(function (v) {
            var inc = D0.d[v] - D0.d[u], V = P(v);
            var tw = ax[0] * (U[1] * V[2] - U[2] * V[1]) + ax[1] * (U[2] * V[0] - U[0] * V[2]) + ax[2] * (U[0] * V[1] - U[1] * V[0]);
            used[orbit[v]] = 1; path.push(v); go(cost + (inc === 1 ? 0 : inc === 0 ? 1 : 3), swirl + tw); path.pop(); used[orbit[v]] = 0;
          });
      })(0, 0);
      drains.forEach(function (D) {
        // a rotation of the sphere carrying drain 0 onto this one (any of them will do: they differ by D's own 72° turns)
        var carry = carrier(D0.p, D.p), arm = bestArm.map(function (c) { return carry[c]; });
        var rot = symMap(D.p, 5), lanes = [], lane = arm;
        for (var r = 0; r < 5; r++) { lanes.push(lane); lane = lane.map(function (c) { return rot[c]; }); }
        var down = new Int32Array(n).fill(-1), pos = new Int32Array(n).fill(-1);
        lanes.forEach(function (L) { L.forEach(function (c, at) { pos[c] = at; down[c] = at ? L[at - 1] : -1; }); });
        var order = [];
        for (var c = 0; c < n; c++) if (!hole[c]) order.push(c);
        order.sort(function (x, y) { return pos[x] - pos[y] || x - y; });
        D.vortex = { down: down, order: order, lanes: lanes };
      });
    }
    // a rotation taking cell a to cell b that is a symmetry of the sphere, as a map on cells
    function carrier(a, b) {
      if (a === b) { var id = new Int32Array(n); for (var k = 0; k < n; k++) id[k] = k; return id; }
      var A = P(a), B = P(b), axis = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]], L = Math.hypot(axis[0], axis[1], axis[2]);
      var base = L < 1e-9 ? rotation(perp(A), Math.PI) : rotation([axis[0] / L, axis[1] / L, axis[2] / L], Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]))));
      for (var t = 0; t < 10; t++) { // then turn about b until the whole sphere lands on itself
        var spin = rotation(B, t * Math.PI / 5), map = new Int32Array(n), ok = true;
        for (var j = 0; j < n && ok; j++) { var m = nearest(spin(base(P(j)))); if (m[1] < 1 - 1e-6) ok = false; else map[j] = m[0]; }
        if (ok) return map;
      }
      throw new Error("no symmetry carries drain " + a + " to " + b);
    }
    function perp(v) { var w = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], c = [v[1] * w[2] - v[2] * w[1], v[2] * w[0] - v[0] * w[2], v[0] * w[1] - v[1] * w[0]], l = Math.hypot(c[0], c[1], c[2]); return [c[0] / l, c[1] / l, c[2] / l]; }

    var env = { s: s, mode: M, drains: drains, hole: hole, hexes: cells, cells: cells };
    cache[key] = env; return env;
  }

  /* One move toward drain w, on a copy of g, by flow ("gravity"/"vortex").
     Returns the new values, the points scored, and a trail per tile that
     moved (the cells it passed through; whether it merged) for the
     animation and the aiming preview. */
  function pull(env, g, w, flow) {
    var D = env.drains[w], W = (flow === "vortex" && D.vortex) || D.gravity;
    var out = g.slice(), merged = new Uint8Array(g.length), trails = [], score = 0;
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

  function Game(mode, seed, flow) {
    this.key = T.MODES[mode] ? mode : "c60"; this.mode = T.MODES[this.key];
    this.flow = T.flows(this.key).indexOf(flow) >= 0 ? flow : "gravity";
    this.env = setup(this.key); this.s = this.env.s;
    this.seed = String(seed);
    var raw = rngFrom("twelve:" + this.key + ":" + this.seed), self = this;
    this.draws = 0; this.rnd = function () { self.draws++; return raw(); };
    this.g = new Array(this.s.n).fill(0); this.score = 0; this.moves = 0; this.last = -1; this.spawned = [];
    for (var k = 0; k < this.mode.drop + 1; k++) this.spawn();
  }
  /* New tiles per move: the drop, plus one for every `rain` moves made. */
  Game.prototype.rain = function () { return this.mode.drop + (this.mode.rain ? Math.floor(this.moves / this.mode.rain) : 0); };
  Game.prototype.spawn = function () {
    var e = [], g = this.g, hole = this.env.hole;
    for (var i = 0; i < g.length; i++) if (!g[i] && !hole[i]) e.push(i);
    if (!e.length) return -1;
    var c = e[Math.floor(this.rnd() * e.length)];
    g[c] = this.rnd() < 0.9 ? 2 : 4; this.spawned.push(c);
    return c;
  };
  Game.prototype.preview = function (w) { return pull(this.env, this.g, w, this.flow); };
  /* Make a move toward drain w. Returns the move (with trails), or null if nothing would move. */
  Game.prototype.move = function (w) {
    var r = pull(this.env, this.g, w, this.flow);
    if (!r.moved) return null;
    var drop = this.rain();
    this.g = r.g; this.score += r.score; this.moves++; this.last = w; this.spawned = [];
    for (var k = 0; k < drop; k++) this.spawn();
    r.spawned = this.spawned.slice();
    return r;
  };
  Game.prototype.canMove = function () { for (var w = 0; w < this.env.drains.length; w++) if (pull(this.env, this.g, w, this.flow).moved) return true; return false; };
  Game.prototype.best = function () { return Math.max.apply(null, this.g); };
  Game.prototype.save = function () { return { k: this.key, f: this.flow, seed: this.seed, g: this.g, score: this.score, moves: this.moves, last: this.last, draws: this.draws }; };
  Game.restore = function (o) {
    if (!o || !T.MODES[o.k]) return null;
    var G = new Game(o.k, o.seed, o.f || "gravity");
    if (!o.g || o.g.length !== G.s.n) return null;
    for (var i = 0; i < o.g.length; i++) if (o.g[i] && G.env.hole[i]) return null; // a save from another layout of drains
    // advance the spawn stream to where it was, so a restored game deals what it would have
    while (G.draws < (o.draws || 0)) G.rnd();
    G.g = o.g.slice(); G.score = o.score || 0; G.moves = o.moves || 0; G.last = o.last == null ? -1 : o.last; G.spawned = [];
    return G;
  };

  T.setup = setup; T.pull = pull; T.Game = Game; T.rngFrom = rngFrom;
})();
