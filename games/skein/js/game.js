/* Skein — the rules of play.

   You trace a chain of neighbouring tiles; letting go (or tapping the last
   tile again) submits it.
     · a theme word, on its own tiles     → found (the span shows in gold)
     · a theme word, on other tiles       → "right word, wrong place"
     · any other word of 4+ letters       → counts toward a hint
   Every three such words earn one hint. A hint rings the tiles of a word
   you haven't found; a second hint on the same word numbers them in order.
   Tiles of found words are spent: a trace can't use them. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var K = NS.SKEIN = NS.SKEIN || {};
  var PER_HINT = 3;

  function keyOf(cells) { return cells.slice().sort(function (a, b) { return a - b; }).join(","); }

  function Game(board, dict) {
    this.board = board; this.s = K.sphere(board.sphere); this.letters = board.letters;
    this.words = board.words.map(function (w) { return { w: w.w, cells: w.cells, span: w.span, key: keyOf(w.cells) }; });
    this.owner = new Int32Array(this.s.n).fill(-1);
    this.found = new Set(); this.extras = new Set(); this.sel = [];
    this.hintsUsed = 0; this.hint = -1; this.hintLevel = 0; this.dict = dict || null;
    this.traces = 0;
  }
  Game.prototype.word = function () { var L = this.letters; return this.sel.map(function (c) { return L[c]; }).join(""); };
  Game.prototype.adjacent = function (a, b) { return this.s.nbrs[a].indexOf(b) >= 0; };
  Game.prototype.free = function (c) { return this.owner[c] < 0; };
  /* Add a tile to the trace. Stepping back onto the previous tile undoes
     the last step; a tile not next to the end starts a new trace. */
  Game.prototype.step = function (c) {
    if (c < 0 || !this.free(c)) return false;
    var n = this.sel.length, at = this.sel.indexOf(c);
    if (n && c === this.sel[n - 1]) return false;
    if (at >= 0) { this.sel.length = at + 1; return true; }
    if (n && !this.adjacent(this.sel[n - 1], c)) { this.sel = [c]; return true; }
    this.sel.push(c); return true;
  };
  Game.prototype.clear = function () { this.sel = []; };
  /* Submit the trace. Returns { kind, word } where kind is one of
     found, span, wrong-place, again, extra, extra-again, short, unknown. */
  Game.prototype.submit = function () {
    var w = this.word(), cells = this.sel.slice(), self = this;
    this.sel = [];
    if (w.length < 4) return { kind: "short", word: w };
    this.traces++;
    var k = keyOf(cells), hit = -1, named = -1;
    this.words.forEach(function (x, i) { if (x.w === w) { named = i; if (x.key === k) hit = i; } });
    if (hit >= 0) {
      if (this.found.has(hit)) return { kind: "again", word: w };
      this.found.add(hit);
      this.words[hit].cells.forEach(function (c) { self.owner[c] = hit; });
      if (this.hint === hit) { this.hint = -1; this.hintLevel = 0; }
      return { kind: this.words[hit].span ? "span" : "found", word: w };
    }
    if (named >= 0) return { kind: "wrong-place", word: w };
    if (this.dict && this.dict.has(w)) {
      if (this.extras.has(w)) return { kind: "extra-again", word: w };
      this.extras.add(w); return { kind: "extra", word: w };
    }
    return { kind: this.dict ? "unknown" : "unchecked", word: w };
  };
  Game.prototype.hintsEarned = function () { return Math.floor(this.extras.size / PER_HINT); };
  Game.prototype.hintsLeft = function () { return this.hintsEarned() - this.hintsUsed; };
  Game.prototype.towardHint = function () { return this.extras.size % PER_HINT; };
  /* Spend a hint: ring an unfound word's tiles, or (if one is already
     ringed) show its order. Prefers the span while it's unfound. */
  Game.prototype.useHint = function () {
    if (this.hintsLeft() <= 0 || this.done()) return false;
    if (this.hint >= 0 && this.hintLevel === 1) { this.hintLevel = 2; this.hintsUsed++; return true; }
    if (this.hint >= 0) return false;
    var self = this, open = [];
    this.words.forEach(function (x, i) { if (!self.found.has(i)) open.push(i); });
    var sp = open.filter(function (i) { return self.words[i].span; });
    this.hint = sp.length ? sp[0] : open[0]; this.hintLevel = 1; this.hintsUsed++;
    return true;
  };
  Game.prototype.done = function () { return this.found.size === this.words.length; };
  Game.prototype.PER_HINT = PER_HINT;

  /* State for saving: which words are found, the extras, the hints. */
  Game.prototype.save = function () { return { f: Array.from(this.found), x: Array.from(this.extras), h: this.hintsUsed, hw: this.hint, hl: this.hintLevel, t: this.traces }; };
  Game.prototype.restore = function (o) {
    var self = this; if (!o) return;
    (o.f || []).forEach(function (i) { if (self.words[i]) { self.found.add(i); self.words[i].cells.forEach(function (c) { self.owner[c] = i; }); } });
    (o.x || []).forEach(function (w) { self.extras.add(w); });
    this.hintsUsed = o.h || 0; this.hint = o.hw == null ? -1 : o.hw; this.hintLevel = o.hl || 0; this.traces = o.t || 0;
    if (this.hint >= 0 && this.found.has(this.hint)) { this.hint = -1; this.hintLevel = 0; }
  };

  K.Game = Game;
})();
