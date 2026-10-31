/* One Coast — the two ways to play. No DOM; the selftest drives both.

   EXPEDITION. A perfect world is generated and hidden; its twelve
   pentagons are laid; its hexagons go into the bag, shuffled. You hold
   three. Lay any tile on any empty cell touching the map, turned any way.
   A side where your tile disagrees with its neighbour is a CLIFF: allowed,
   but it joins nothing. When the bag is empty the world is scored by its
   coastlines (one is perfect) and then its cliffs. A perfect world existed
   at the start; you can reveal it at the end.

   ATELIER. Free building: paint tiles land or sea and the coasts follow.
   Any world can be opened in mappa or, if it has exactly one coastline,
   played as an expedition. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var C = NS.COAST = NS.COAST || {};

  function Expedition(sphereName, seed, opts) {
    opts = opts || {};
    var s = this.s = C.sphere(sphereName);
    this.seed = seed;
    this.world = opts.world || C.generate(s, { seed: seed });
    this.handSize = opts.hand || 3;
    var bag = C.bag(s, this.world), rnd = C.rngFrom("bag:" + seed);
    for (var i = bag.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
    this.bag = bag;
    this.placed = C.startBoard(s, this.world);
    this.hand = [];
    this.moves = [];
    this.refill();
  }
  var E = Expedition.prototype;
  E.refill = function () { while (this.hand.length < this.handSize && this.bag.length) this.hand.push(this.bag.pop()); };
  E.frontier = function () {
    var s = this.s, p = this.placed, out = new Set();
    for (var i = 0; i < s.n; i++) if (!p[i] && s.nbrs[i].some(function (j) { return p[j]; })) out.add(i);
    return out;
  };
  /* Cliffs tile t at rotation r would make in cell i: the sides that disagree. */
  E.cliffSides = function (i, t, r) {
    var s = this.s, out = [];
    for (var j = 0; j < s.nbrs[i].length; j++) {
      var nb = s.nbrs[i][j], p = this.placed[nb];
      if (p && p.edges[C.sideTo(s, nb, i)] !== t.e[(j + r) % t.e.length]) out.push(j);
    }
    return out;
  };
  /* The rotation of hand tile h for cell i with the fewest cliffs, starting
     the search at `from` so repeated asks cycle through the alternatives. */
  E.rotations = function (i, h) {
    var t = C.tileFromKey(this.hand[h]), seen = new Set(), out = [];
    for (var r = 0; r < t.e.length; r++) {
      var key = C.placedEdges(t, r, t.e.length).join("");
      if (seen.has(key)) continue; seen.add(key);
      out.push({ rot: r, cliffs: this.cliffSides(i, t, r) });
    }
    out.sort(function (a, b) { return a.cliffs.length - b.cliffs.length; });
    return out;
  };
  /* Cells where hand tile h fits with no cliffs at all. */
  E.perfectSpots = function (h) {
    var t = C.tileFromKey(this.hand[h]), out = new Set();
    C.anySpots(this.s, this.placed, t).forEach(function (sp) { if (!sp.cliffs) out.add(sp.cell); });
    return out;
  };
  E.place = function (h, i, r) {
    if (this.placed[i] || !this.frontier().has(i)) return false;
    var t = C.tileFromKey(this.hand[h]), cl = this.cliffSides(i, t, r).length;
    C.place(this.s, this.placed, i, t, r);
    this.moves.push({ cell: i, key: t.key, rot: r, cliffs: cl });
    this.hand.splice(h, 1);
    this.refill();
    return true;
  };
  E.left = function () { return this.bag.length + this.hand.length; };
  E.done = function () { return this.left() === 0; };
  E.status = function () { return C.partial(this.s, this.placed); };

  /* ATELIER: a world you paint. Starts from a generated perfect world. */
  function Atelier(sphereName, seed, token) {
    if (token) { var d = C.decode(token); this.s = d.sphere; this.world = d.world; }
    else { this.s = C.sphere(sphereName); this.world = C.generate(this.s, { seed: seed }); }
    this.salt = "atelier";
  }
  var A = Atelier.prototype;
  /* Paint cell i land (1) or sea (0): its centre, and each of its sides by
     the free-paint rule with that neighbour. Pentagons stay uniform and
     pull their sides with them. */
  A.paint = function (i, bit) {
    var s = this.s, w = this.world;
    if (C.normCentre(w.edges[i], w.centre[i]) === bit && w.edges[i].every(function (e) { return e === bit; })) return false;
    var landOf = function (c) { return C.normCentre(w.edges[c], w.centre[c]); };
    s.nbrs[i].forEach(function (j, side) {
      var other = landOf(j), b;
      if (s.pent[i]) b = bit; else if (s.pent[j]) b = other;
      else if (other === bit) b = bit;
      else b = (C.rngFrom("atelier:" + Math.min(i, j) + "-" + Math.max(i, j))() < 0.5) ? 1 : 0;
      w.edges[i][side] = b; w.edges[j][C.sideTo(s, j, i)] = b;
      w.centre[j] = C.normCentre(w.edges[j], other);
    });
    if (s.pent[i]) w.edges[i] = w.edges[i].map(function () { return bit; });
    w.centre[i] = C.normCentre(w.edges[i], bit);
    return true;
  };
  A.census = function () { return C.census(this.s, this.world); };
  A.token = function () { return C.encode(this.s, this.world); };

  C.Expedition = Expedition; C.Atelier = Atelier;
})();
