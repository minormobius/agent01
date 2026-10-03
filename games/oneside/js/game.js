/* One Side — the game, as plain simulation (no DOM: the selftest runs it).

   You walk the paper's surface. The ghosts walk it too, but each is
   physically on the OTHER face of wherever it seems to be: a ghost at
   surface point g stands at the same spot of the strip as back(g), which is
   where you see it. So, as seen from your face:

     - its moves are bound by the maze half a strip away (the maze at g),
       never by your walls: it drifts through them along rails you can only
       see faintly, through the paper;
     - it takes its signals from there: the classic targets are worked out
       where you are, then carried through the twist (back()) to its face;
     - it kills you through the paper, at your spot on the other face.

   And there's only one side. Walk half a strip and you're on the stretch of
   maze they were bound to; they're bound to the one you left.

   The ghost minds are the arcade's: each moves tile to tile and, at each
   tile, takes the open way (never straight back) whose next tile is
   nearest its target, ties broken up, left, down, right; modes run
   scatter → chase on the arcade's clock, and every change of mode turns
   them round. Their targets, in your frame:
     red     your tile
     pink    four tiles ahead of you
     cyan    twice the step from red to two tiles ahead of you
     orange  your tile while far off, its scatter point when within 8
   Two ghosts on level 1, three on level 2, four from level 3. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var M = NS.ONESIDE;
  var DX = [0, -1, 0, 1], DY = [-1, 0, 1, 0]; // up, left, down, right: the arcade's tie order
  var NAMES = ["red", "pink", "cyan", "orange"];
  var SCHEDULE = [7, 15, 7, 15, 6, 18, 5, Infinity]; // scatter, chase, … (the arcade's, with shorter chases)
  var RELEASE = [2, 5, 8.5, 12];
  /* The arcade's bonus fruit, by level (then the key forever). */
  var FRUIT = [["cherry", 100], ["strawberry", 300], ["orange", 500], ["orange", 500], ["apple", 700], ["apple", 700], ["melon", 1000], ["melon", 1000], ["galaxian", 2000], ["galaxian", 2000], ["bell", 3000], ["bell", 3000], ["key", 5000]];
  var FRUIT_AT = [70, 170], FRUIT_FOR = 12;

  function Game(seed, level) {
    this.seed = seed; this.level = level || 1; this.score = 0; this.lives = 4; this.nextLife = 5000;
    this.events = []; this.t = 0;
    this.newMaze();
  }
  Game.prototype.newMaze = function () {
    var mz = this.maze = M.build(this.seed + ":" + this.level);
    this.left = 0; for (var i = 0; i < mz.dots.length; i++) if (mz.dots[i]) this.left++;
    this.eaten = 0; this.fruit = null;
    this.rand = M.rng("ghosts:" + this.seed + ":" + this.level);
    this.reset();
  };
  /* Everyone back to their places (after a death, or a new maze). */
  Game.prototype.reset = function () {
    var mz = this.maze, k = 1 + 0.05 * (this.level - 1);
    this.speed = { pac: 6.2 * Math.min(k, 1.3), ghost: 4.65 * Math.min(k, 1.4), fright: 3.6, eyes: 12 };
    this.pac = { x: mz.start[0], y: mz.start[1], d: 1, p: 0, moving: false, want: -1, mouth: 0 };
    // two ghosts on the first level, three on the second, all four after: they're harder to escape than
    // the arcade's, since your walls don't slow them
    var count = Math.min(4, this.level + 1);
    this.ghosts = NAMES.slice(0, count).map(function (name, i) { return { name: name, i: i, x: mz.spawn[0], y: mz.spawn[1], d: 0, p: 0, state: "wait", fright: false }; });
    this.mode = 0; this.modeT = 0; this.frightT = 0; this.chain = 0; this.clock = 0;
    this.state = "ready"; this.stateT = 0;
  };
  Game.prototype.input = function (d) { this.pac.want = d; if (this.state === "ready") this.state = "play"; };

  function open(mz, x, y) { return M.isOpen(mz, x, y); }
  /* Continuous position of an entity on the surface. */
  function pos(e) { return [e.x + DX[e.d] * e.p, e.y + DY[e.d] * e.p]; }
  Game.prototype.pos = pos;
  /* Where a ghost physically is, in your frame: the other face of its surface point. */
  Game.prototype.seen = function (g) { var q = pos(g); return M.back(q[0], q[1]); };

  Game.prototype.step = function (dt) {
    this.events.length = 0;
    if (this.state === "ready" || this.state === "over") return;
    this.stateT += dt;
    if (this.state === "dying") { if (this.stateT > 1.6) { if (this.lives <= 0) this.state = "over"; else this.reset(); } return; }
    if (this.state === "clear") { if (this.stateT > 1.8) { this.level++; this.newMaze(); this.state = "ready"; } return; }
    this.clock += dt;
    // the mode clock (paused while they're frightened)
    if (this.frightT > 0) {
      this.frightT -= dt;
      if (this.frightT <= 0) { this.frightT = 0; this.ghosts.forEach(function (g) { g.fright = false; }); }
    } else {
      this.modeT += dt;
      if (this.modeT >= SCHEDULE[this.mode]) { this.modeT = 0; this.mode++; this.turnAround(); }
    }
    this.movePac(dt);
    var self = this;
    this.ghosts.forEach(function (g) {
      if (g.state === "wait") { if (self.clock >= RELEASE[g.i]) { g.state = "out"; g.d = self.choose(g, true); self.events.push({ kind: "release", g: g.i }); } return; }
      self.moveGhost(g, dt);
    });
    this.collide();
    this.fruitStep(dt);
    if (this.score >= this.nextLife) { this.lives++; this.nextLife += 5000; this.events.push({ kind: "life" }); }
    if (this.left === 0 && this.state === "play") { this.state = "clear"; this.stateT = 0; this.events.push({ kind: "clear" }); }
  };
  Game.prototype.scatter = function () { return this.mode % 2 === 0; };
  Game.prototype.turnAround = function () {
    this.ghosts.forEach(function (g) { if (g.state === "out") { g.x = M.wrapX(g.x + DX[g.d] * (g.p > 0 ? 1 : 0)); g.y += DY[g.d] * (g.p > 0 ? 1 : 0); if (g.p > 0) g.p = 1 - g.p; g.d = (g.d + 2) % 4; } });
  };

  Game.prototype.movePac = function (dt) {
    var e = this.pac, mz = this.maze, left = this.speed.pac * dt * (this.frightT > 0 ? 1.08 : 1);
    if (e.want >= 0 && e.want === (e.d + 2) % 4 && e.moving && e.p > 0) { e.x = M.wrapX(e.x + DX[e.d]); e.y += DY[e.d]; e.p = 1 - e.p; e.d = e.want; }
    for (var guard = 0; left > 1e-9 && guard < 8; guard++) {
      if (e.p === 0) {
        if (e.want >= 0 && open(mz, e.x + DX[e.want], e.y + DY[e.want])) { e.d = e.want; e.moving = true; }
        else if (!open(mz, e.x + DX[e.d], e.y + DY[e.d])) { e.moving = false; break; }
        else e.moving = true;
      }
      if (!e.moving) break;
      var s = Math.min(left, 1 - e.p); e.p += s; left -= s; e.mouth += s;
      if (e.p >= 1 - 1e-9) { e.x = M.wrapX(e.x + DX[e.d]); e.y += DY[e.d]; e.p = 0; this.eat(e.x, e.y); }
    }
  };
  Game.prototype.eat = function (x, y) {
    var mz = this.maze, k = y * M.W + x, v = mz.dots[k];
    if (!v) return;
    mz.dots[k] = 0; this.left--; this.eaten++;
    if (FRUIT_AT.indexOf(this.eaten) >= 0) this.spawnFruit();
    if (v === 1) { this.score += 10; this.events.push({ kind: "dot" }); }
    else {
      this.score += 50; this.frightT = Math.max(2, 7 - 0.5 * (this.level - 1)); this.chain = 0;
      this.ghosts.forEach(function (g) { if (g.state === "out") { g.fright = true; } });
      this.turnAround(); this.events.push({ kind: "power" });
    }
  };

  Game.prototype.moveGhost = function (g, dt) {
    var sp = g.state === "eyes" ? this.speed.eyes : g.fright ? this.speed.fright : this.speed.ghost, left = sp * dt;
    for (var guard = 0; left > 1e-9 && guard < 8; guard++) {
      if (g.p === 0) {
        if (g.state === "eyes" && g.x === this.maze.spawn[0] && g.y === this.maze.spawn[1]) { g.state = "out"; g.fright = false; }
        g.d = this.choose(g, false);
      }
      var s = Math.min(left, 1 - g.p); g.p += s; left -= s;
      if (g.p >= 1 - 1e-9) { g.x = M.wrapX(g.x + DX[g.d]); g.y += DY[g.d]; g.p = 0; }
    }
  };
  /* The arcade's choice at a tile: every open way but straight back, the one
     whose next tile is nearest the target (frightened: at random). */
  Game.prototype.choose = function (g, any) {
    var mz = this.maze, opts = [];
    for (var d = 0; d < 4; d++) if ((any || d !== (g.d + 2) % 4) && open(mz, g.x + DX[d], g.y + DY[d])) opts.push(d);
    if (!opts.length) return (g.d + 2) % 4; // a dead end (there are none, but never stick)
    if (g.fright && g.state !== "eyes") return opts[Math.floor(this.rand() * opts.length)];
    var T = this.target(g), best = opts[0], bd = Infinity;
    opts.forEach(function (d) { var ex = M.dx(T[0], g.x + DX[d]), ey = g.y + DY[d] - T[1], dd = ex * ex + ey * ey; if (dd < bd - 1e-9) { bd = dd; best = d; } });
    return best;
  };
  /* A ghost's target, on its own face of the paper. Worked out where you
     are, then carried through the twist: its signals come from half a strip away. */
  Game.prototype.target = function (g) {
    var mz = this.maze;
    if (g.state === "eyes") return mz.spawn;
    var corners = [[6, -2], [18, M.H + 1], [30, -2], [42, M.H + 1]];
    if (this.scatter()) return corners[g.i];
    var P = this.pac, pd = P.d, T;
    if (g.i === 0) T = [P.x, P.y];
    else if (g.i === 1) T = [P.x + 4 * DX[pd], P.y + 4 * DY[pd]];
    else if (g.i === 2) {
      var B = this.seen(this.ghosts[0]), V = [P.x + 2 * DX[pd], P.y + 2 * DY[pd]];
      T = [V[0] + M.dx(B[0], V[0]), 2 * V[1] - B[1]];
    } else {
      var S = this.seen(g), far = Math.hypot(M.dx(S[0], P.x), S[1] - P.y) > 8;
      if (!far) return corners[3];
      T = [P.x, P.y];
    }
    return M.back(T[0], T[1]);
  };

  /* The fruit. It turns up right beside you, through the paper: on the
     other face, at the back of a corridor near where you are, so it's
     really half a strip away. Twelve seconds to get round to it. You eat it
     from its own face; a fruit on your stretch is just a fruit. */
  Game.prototype.spawnFruit = function () {
    var mz = this.maze, P = this.pac, best = null, bd = Infinity, kind = FRUIT[Math.min(this.level, FRUIT.length) - 1];
    for (var ddx = -4; ddx <= 4; ddx++) for (var ddy = -4; ddy <= 4; ddy++) {
      var b = M.back(P.x + ddx, P.y + ddy), d = Math.abs(ddx) + Math.abs(ddy) + this.rand() * 0.5; // a spot near you, physically; its back is where the fruit sits
      if (d < 2 || !open(mz, b[0], b[1])) continue;
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) best = mz.start.slice();
    this.fruit = { x: M.wrapX(best[0]), y: best[1], kind: kind[0], value: kind[1], t: FRUIT_FOR };
    this.events.push({ kind: "fruit-on", fruit: kind[0] });
  };
  Game.prototype.fruitStep = function (dt) {
    var f = this.fruit; if (!f) return;
    f.t -= dt;
    var q = pos(this.pac);
    if (Math.abs(M.dx(f.x, q[0])) < 0.5 && Math.abs(f.y - q[1]) < 0.5) {
      this.score += f.value; this.events.push({ kind: "fruit", fruit: f.kind, pts: f.value }); this.fruit = null; return;
    }
    if (f.t <= 0) { this.fruit = null; this.events.push({ kind: "fruit-off" }); }
  };

  /* Touching happens at the same spot of the strip: a ghost at g against you at back(g). */
  Game.prototype.collide = function () {
    var q = pos(this.pac), self = this;
    this.ghosts.forEach(function (g) {
      if (g.state !== "out" || self.state !== "play") return;
      var s = self.seen(g);
      if (Math.abs(M.dx(s[0], q[0])) < 0.6 && Math.abs(s[1] - q[1]) < 0.6) {
        if (g.fright) { g.state = "eyes"; g.fright = false; self.chain++; var pts = 100 * Math.pow(2, self.chain); self.score += pts; self.events.push({ kind: "eat", g: g.i, pts: pts }); }
        else { self.state = "dying"; self.stateT = 0; self.lives--; self.events.push({ kind: "die", g: g.i }); }
      }
    });
  };

  M.Game = Game; M.DX = DX; M.DY = DY; M.NAMES = NAMES; M.FRUIT = FRUIT;
})();
