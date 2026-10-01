/* Strand — the rules of play. No DOM; test/strand.selftest.mjs drives it.

   A colour is not one directed path but a set of FRAGMENTS (paths of
   nodes). An anchored fragment starts at one of the colour's two ends; a
   colour is joined when one fragment runs end to end. This is what makes
   strands stable from both ends:

     · drawing from end B grows B's half and never disturbs A's;
     · two halves join when one steps onto the other (anywhere along it);
     · driving through another colour takes ONLY the cell you touch: the
       pieces either side stay painted, the far one as a loose fragment,
       and you can reconnect it later by stepping onto it;
     · within a single drag every cut is provisional: back off and the cell
       is given back, as in Flow.

   begin(cell)   on an end: that end's half restarts from it. The other half
                 is untouched; on a joined strand only this end lets go and
                 the painted cells stay as the other end's half.
                 on a fragment: it is cut back to this cell and you draw on.
                 anywhere else: not a draw (the page turns the sphere).
   extend(cell)  grow into a neighbour; back up along the active fragment;
                 join your own other half or a loose fragment by stepping
                 onto it; never onto another colour's end.
   A bridge cell holds two lane nodes; the side you enter from picks one. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var S = NS.STRAND = NS.STRAND || {};

  function Game(level) {
    var b = S.board(level.board), g = S.playGraph(b, level.walls, level.bridges), self = this;
    this.level = level; this.board = b; this.g = g; this.cellOf = g.cellOf;
    this.nodesOf = Array.from({ length: b.n }, function () { return []; });
    for (var v = 0; v < g.n; v++) this.nodesOf[g.cellOf[v]].push(v);
    this.endOf = new Int16Array(g.n).fill(-1);
    level.pairs.forEach(function (p, k) { self.endOf[p[0]] = k; self.endOf[p[1]] = k; });
    this.K = level.pairs.length;
    this.frags = level.pairs.map(function () { return []; });
    this.owner = new Int16Array(g.n).fill(-1);
    this.done = new Uint8Array(this.K);
    this.active = -1; this.cur = null; this.base = null; this.moves = 0;
    this._refresh();

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

  var P = Game.prototype;

  P.isEnd = function (v, k) { return this.endOf[v] === k; };
  /* Put anchored fragments in canonical form: they start at their end. */
  P._norm = function (f, k) {
    if (f.length > 1 && !this.isEnd(f[0], k) && this.isEnd(f[f.length - 1], k)) f.reverse();
    return f;
  };
  P._refresh = function () {
    var self = this;
    this.owner.fill(-1);
    this.level.pairs.forEach(function (p, k) { self.owner[p[0]] = k; self.owner[p[1]] = k; });
    this.frags.forEach(function (fs, k) { fs.forEach(function (f) { f.forEach(function (v) { self.owner[v] = k; }); }); });
    this.frags.forEach(function (fs, k) {
      self.done[k] = fs.some(function (f) { return f.length >= 2 && self.isEnd(f[0], k) && self.isEnd(f[f.length - 1], k) && f[0] !== f[f.length - 1]; }) ? 1 : 0;
    });
  };
  P.find = function (v) {
    for (var k = 0; k < this.K; k++) for (var i = 0; i < this.frags[k].length; i++) {
      var at = this.frags[k][i].indexOf(v);
      if (at >= 0) return { k: k, i: i, at: at };
    }
    return null;
  };
  /* All fragments as one flat list, for drawing: [{ k, nodes, anchored }] */
  P.strands = function () {
    var out = [], self = this;
    this.frags.forEach(function (fs, k) { fs.forEach(function (f) { out.push({ k: k, nodes: f, anchored: self.isEnd(f[0], k) || self.isEnd(f[f.length - 1], k) }); }); });
    return out;
  };

  /* Start a drag. The active fragment is lifted out into `cur`; everything
     else is frozen in `base`, and the board is recomputed from the two after
     every step (so cuts are provisional until the drag ends). */
  P.begin = function (cell) {
    var nodes = this.nodesOf[cell], i, k, f;
    // an end: that end's half restarts here
    for (i = 0; i < nodes.length; i++) {
      var e = nodes[i]; k = this.endOf[e];
      if (k < 0) continue;
      var fs = this.frags[k];
      for (var j = 0; j < fs.length; j++) {
        f = fs[j];
        if (f[0] === e || f[f.length - 1] === e) {
          if (f[0] !== e) f.reverse();
          fs.splice(j, 1);
          // a joined strand: only this end lets go; everything painted stays
          // as the other end's half. An unjoined half restarts.
          if (f.length > 1 && this.isEnd(f[f.length - 1], k)) fs.push(this._norm(f.slice(1), k));
          break;
        }
      }
      return this._lift(k, [e]);
    }
    // a fragment: cut back to here
    for (i = 0; i < nodes.length; i++) {
      var hit = this.find(nodes[i]);
      if (!hit) continue;
      k = hit.k; f = this.frags[k][hit.i];
      this.frags[k].splice(hit.i, 1);
      var a = f.slice(0, hit.at + 1), z = f.slice(hit.at);
      var anchoredA = this.isEnd(a[0], k), anchoredZ = this.isEnd(z[z.length - 1], k);
      var keep;
      if (anchoredA && anchoredZ) {           // a joined strand: split it, both halves survive
        keep = a;
        if (z.length > 1) this.frags[k].push(this._norm(z.slice(1), k));
      } else if (anchoredZ) keep = z.reverse();
      else if (anchoredA) keep = a;
      else keep = a.length >= z.length ? a : z.reverse(); // loose: keep the longer side
      return this._lift(k, keep);
    }
    this.active = -1;
    return -1;
  };
  P._lift = function (k, cur) {
    this.active = k; this.cur = cur;
    this.base = this.frags.map(function (fs) { return fs.map(function (f) { return f.slice(); }); });
    this._recompute();
    return k;
  };

  /* The board = base fragments minus the cells the active fragment now
     holds (each removal splits a fragment, both pieces kept), plus it. */
  P._recompute = function () {
    var mine = new Set(this.cur), self = this;
    this.frags = this.base.map(function (fs, k) {
      var out = [];
      fs.forEach(function (f) {
        var piece = [];
        for (var i = 0; i <= f.length; i++) {
          if (i < f.length && !mine.has(f[i])) { piece.push(f[i]); continue; }
          if (piece.length && !(piece.length === 1 && self.isEnd(piece[0], k))) out.push(self._norm(piece, k));
          piece = [];
        }
      });
      if (k === self.active) out.push(self.cur);
      return out;
    });
    this._refresh();
  };

  P.extend = function (cell) {
    var a = this.active;
    if (a < 0) return false;
    var cur = this.cur, head = cur[cur.length - 1], nodes = this.nodesOf[cell], i;
    if (this.cellOf[head] === cell) return false;
    var joined = cur.length >= 2 && this.isEnd(cur[0], a) && this.isEnd(head, a);
    var nb = this.g.nbrs[head], v = -1;
    // a step forward wins over backing up: a strand may cross ITSELF on a
    // bridge, so its own first lane being in this cell isn't a retreat
    if (!joined) for (i = 0; i < nodes.length; i++) {
      var n_ = nodes[i], e = this.endOf[n_];
      if (nb.indexOf(n_) >= 0 && cur.indexOf(n_) < 0 && (e < 0 || e === a)) { v = n_; break; }
    }
    if (v >= 0) {
      var own = this.owner[v] === a ? this._ownFrag(v) : null;
      if (own) {                              // step onto our own half or a loose piece: join it
        var f = own.f, at = own.at, tail;
        if (this.isEnd(f[0], a)) tail = f.slice(0, at + 1).reverse();          // anchored half: run home along it
        else tail = (at >= f.length - 1 - at) ? f.slice(0, at + 1).reverse() : f.slice(at); // loose: take the longer side
        for (i = 0; i < tail.length; i++) cur.push(tail[i]);
      } else cur.push(v);
      this.moves++;
      this._recompute();
      return true;
    }
    for (i = 0; i < nodes.length; i++) { // back up along the active fragment
      var back = cur.indexOf(nodes[i]);
      if (back >= 0) { cur.length = back + 1; this._recompute(); return true; }
    }
    return false;
  };
  /* The fragment of the active colour holding v, as it stands in base minus
     the active fragment (i.e. what you'd be joining). */
  P._ownFrag = function (v) {
    var fs = this.frags[this.active];
    for (var i = 0; i < fs.length; i++) {
      if (fs[i] === this.cur) continue;
      var at = fs[i].indexOf(v);
      if (at >= 0) return { f: fs[i], at: at };
    }
    if (this.isEnd(v, this.active)) return { f: [v], at: 0 };
    return null;
  };

  /* A fast swipe can skip cells: walk the shortest run of free cells (at
     most `max` steps) to where the finger is. */
  P.reach = function (cell, max) {
    var a = this.active;
    if (a < 0) return false;
    var cur = this.cur, start = cur[cur.length - 1], g = this.g, goal = new Set(this.nodesOf[cell]);
    var prev = new Map([[start, -1]]), frontier = [start];
    for (var d = 0; d < (max || 3) && frontier.length; d++) {
      var next = [];
      for (var fi = 0; fi < frontier.length; fi++) {
        var u = frontier[fi];
        for (var k = 0; k < g.nbrs[u].length; k++) {
          var v = g.nbrs[u][k];
          if (prev.has(v)) continue;
          if (goal.has(v) && (this.endOf[v] < 0 || this.endOf[v] === a) && cur.indexOf(v) < 0) {
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

  /* A tap with no drag: on an end, clear its half; on a loose piece, delete
     it. (begin() already did the end's part.) */
  P.tap = function (cell) {
    var nodes = this.nodesOf[cell];
    for (var i = 0; i < nodes.length; i++) {
      var hit = this.find(nodes[i]);
      if (!hit) continue;
      var f = this.frags[hit.k][hit.i], k = hit.k;
      if (!this.isEnd(f[0], k) && !this.isEnd(f[f.length - 1], k)) { this.frags[k].splice(hit.i, 1); this._refresh(); return true; }
      if (f.length === 1) { this.frags[k].splice(hit.i, 1); this._refresh(); return true; }
    }
    return false;
  };

  P.end = function () { this.active = -1; this.cur = null; this.base = null; };
  P.reset = function () { this.frags = this.frags.map(function () { return []; }); this.end(); this._refresh(); };

  P.painted = function () { var c = 0; for (var v = 0; v < this.g.n; v++) if (this.owner[v] >= 0) c++; return c; };
  P.joined = function () { var c = 0; for (var k = 0; k < this.K; k++) c += this.done[k]; return c; };
  P.solved = function () {
    if (this.joined() !== this.K || this.painted() !== this.g.n) return false;
    for (var k = 0; k < this.K; k++) if (this.frags[k].length !== 1) return false; // no loose pieces left over
    return true;
  };

  S.Game = Game;
})();
