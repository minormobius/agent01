/* Strand — the rules of play. No DOM; test/strand.selftest.mjs drives it.

   Flow's drag semantics, on the play graph (walls removed, bridges split):
     begin(cell)   on an end: that colour's strand restarts from it.
                   on a strand: that strand is cut back to this cell.
                   anywhere else: not a draw (the page turns the sphere).
     extend(cell)  into a neighbour: grow. Onto your own strand: back up to
                   it. Into another colour's strand: cut it there, and that
                   cut is undone if you back off again within the same drag,
                   as in Flow. Never onto another colour's end, never past
                   your own far end.
   A bridge cell holds two lane nodes; which lane a strand takes is decided
   by the side it enters from. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var S = NS.STRAND = NS.STRAND || {};

  function Game(level) {
    var b = S.board(level.board), g = S.playGraph(b, level.walls, level.bridges);
    this.level = level; this.board = b; this.g = g; this.cellOf = g.cellOf;
    this.nodesOf = Array.from({ length: b.n }, function () { return []; });
    for (var v = 0; v < g.n; v++) this.nodesOf[g.cellOf[v]].push(v);
    this.endOf = new Int16Array(g.n).fill(-1);
    var self = this;
    level.pairs.forEach(function (p, k) { self.endOf[p[0]] = k; self.endOf[p[1]] = k; });
    this.strands = level.pairs.map(function () { return []; });
    this.owner = new Int16Array(g.n).fill(-1);
    this.done = new Uint8Array(level.pairs.length);
    this.active = -1; this.base = null; this.moves = 0;
    level.pairs.forEach(function (p, k) { self.owner[p[0]] = k; self.owner[p[1]] = k; });

    // what to draw as walls
    var key = function (a, c) { return a < c ? a + "-" + c : c + "-" + a; };
    this.wallSet = new Set(level.walls.map(function (w) { return key(w[0], w[1]); }));
    this.wallSegs = [];
    if (b.kind === "panels") {
      var seg = function (a, c) {
        var common = b.polys[a].filter(function (x) { return b.polys[c].indexOf(x) >= 0; });
        if (common.length >= 2) self.wallSegs.push([common[0], common[1]]);
      };
      level.walls.forEach(function (w) { seg(w[0], w[1]); });
      level.bridges.forEach(function (br) {
        b.nbrs[br.cell].forEach(function (j) {
          if (br.lanes[0].indexOf(j) < 0 && br.lanes[1].indexOf(j) < 0 && !self.wallSet.has(key(br.cell, j))) seg(br.cell, j);
        });
      });
    }
  }

  Game.prototype._refresh = function () {
    var self = this;
    this.owner.fill(-1);
    this.level.pairs.forEach(function (p, k) { self.owner[p[0]] = k; self.owner[p[1]] = k; });
    this.strands.forEach(function (st, k) { st.forEach(function (v) { self.owner[v] = k; }); });
    this.strands.forEach(function (st, k) {
      var p = self.level.pairs[k];
      self.done[k] = st.length >= 2 && p.indexOf(st[0]) >= 0 && p.indexOf(st[st.length - 1]) >= 0 && st[0] !== st[st.length - 1] ? 1 : 0;
    });
  };

  Game.prototype.begin = function (cell) {
    var nodes = this.nodesOf[cell], k, i;
    for (i = 0; i < nodes.length; i++) {
      k = this.endOf[nodes[i]];
      if (k >= 0) { this.strands[k] = [nodes[i]]; this.active = k; this._snap(); this._refresh(); return k; }
    }
    for (i = 0; i < nodes.length; i++) {
      for (k = 0; k < this.strands.length; k++) {
        var at = this.strands[k].indexOf(nodes[i]);
        if (at >= 0) { this.strands[k].length = at + 1; this.active = k; this._snap(); this._refresh(); return k; }
      }
    }
    this.active = -1;
    return -1;
  };
  Game.prototype._snap = function () { this.base = this.strands.map(function (s) { return s.slice(); }); };

  Game.prototype.extend = function (cell) {
    var a = this.active;
    if (a < 0) return false;
    var st = this.strands[a], last = st[st.length - 1], nodes = this.nodesOf[cell], i;
    if (this.cellOf[last] === cell) return false;
    // a step forward wins over backing up: a strand may cross ITSELF on a
    // bridge, so its own first lane being in this cell isn't a retreat if
    // the other lane is open from here
    var nb = this.g.nbrs[last], v = -1;
    if (!this.done[a]) for (i = 0; i < nodes.length; i++) {
      var n_ = nodes[i], e = this.endOf[n_];
      if (nb.indexOf(n_) >= 0 && st.indexOf(n_) < 0 && (e < 0 || e === a)) { v = n_; break; }
    }
    if (v >= 0) { st.push(v); this.moves++; this._rebase(); return true; }
    for (i = 0; i < nodes.length; i++) { // back up along our own strand
      var at = st.indexOf(nodes[i]);
      if (at >= 0) { st.length = at + 1; this._rebase(); return true; }
    }
    return false;
  };

  /* Other strands: as they were when the drag began, cut where the active
     strand now runs. Backing off restores them. */
  Game.prototype._rebase = function () {
    var a = this.active, mine = new Set(this.strands[a]), self = this;
    this.strands = this.strands.map(function (s, k) {
      if (k === a) return s;
      var src = self.base[k], out = [];
      for (var i = 0; i < src.length; i++) { if (mine.has(src[i])) break; out.push(src[i]); }
      return out;
    });
    this._refresh();
  };

  /* A fast swipe can skip cells. If `cell` isn't next to the strand's head,
     find the shortest run of free cells (at most `max` steps) that reaches
     it and walk it, so the strand lands where the finger did. */
  Game.prototype.reach = function (cell, max) {
    var a = this.active;
    if (a < 0 || this.done[a]) return false;
    var st = this.strands[a], start = st[st.length - 1], g = this.g, goal = new Set(this.nodesOf[cell]);
    var prev = new Map([[start, -1]]), frontier = [start];
    for (var d = 0; d < (max || 3) && frontier.length; d++) {
      var next = [];
      for (var f = 0; f < frontier.length; f++) {
        var u = frontier[f];
        for (var k = 0; k < g.nbrs[u].length; k++) {
          var v = g.nbrs[u][k];
          if (prev.has(v)) continue;
          if (goal.has(v) && (this.endOf[v] < 0 || this.endOf[v] === a) && st.indexOf(v) < 0) {
            var path = [v], w = u;
            while (w !== start) { path.push(w); w = prev.get(w); }
            path.reverse();
            for (var q = 0; q < path.length; q++) if (!this.extend(this.cellOf[path[q]])) return q > 0;
            return true;
          }
          if (this.owner[v] < 0) { prev.set(v, u); next.push(v); }
        }
      }
      frontier = next;
    }
    return false;
  };

  Game.prototype.end = function () { this.active = -1; this.base = null; };
  Game.prototype.reset = function () { this.strands = this.strands.map(function () { return []; }); this.active = -1; this._refresh(); };

  Game.prototype.painted = function () { var c = 0; for (var v = 0; v < this.g.n; v++) if (this.owner[v] >= 0) c++; return c; };
  Game.prototype.joined = function () { var c = 0; for (var k = 0; k < this.done.length; k++) c += this.done[k]; return c; };
  Game.prototype.solved = function () { return this.joined() === this.done.length && this.painted() === this.g.n; };

  S.Game = Game;
})();
