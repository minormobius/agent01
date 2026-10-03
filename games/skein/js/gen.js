/* Skein — making a board, and proving it has one answer.

   The board is a Goldberg sphere (../onecoast/js/geo.js): hexagons and
   twelve pentagons, a letter on every tile. Two antipodal pentagons are the
   POLES. The SPAN (the theme, revealed) runs from one pole to the other;
   the theme words fill every other tile, each a chain of neighbours, no
   tile used twice.

   Making one:
     1. pick the span (long enough to reach pole to pole) and a set of pool
        words whose letters, with the span's, exactly fill the sphere;
     2. lay the span: a random self-avoiding walk of exactly its length
        from pole to pole (pruned by distance-to-go);
     3. find a Hamiltonian path through every other tile (Warnsdorff with
        backtracking), stir it with backbite moves, cut it into the words'
        lengths, and lay each word along its piece, either way round;
     4. PROVE it: an exact-cover search over every place each word can be
        traced. If the tiles can be split into the words more than one way,
        throw the layout away and lay again.

   So a finished board has exactly one answer, and any word traced
   somewhere else is the right word in the wrong place — the game says so. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var K = NS.SKEIN = NS.SKEIN || {};

  function hash(str) { var h = 2166136261 >>> 0; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function rngFrom(seed) {
    var a = hash(String(seed));
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function bfs(s, from, ok) {
    var d = new Int32Array(s.n).fill(-1), q = [from]; d[from] = 0;
    for (var h = 0; h < q.length; h++) { var u = q[h]; s.nbrs[u].forEach(function (v) { if (d[v] < 0 && (!ok || ok(v))) { d[v] = d[u] + 1; q.push(v); } }); }
    return d;
  }
  /* The six antipodal pentagon pairs. On a torus: every cell and the cell
     half way round both ways, as far as the torus goes. */
  function polePairs(s) {
    var P = [], out = [];
    if (s.torus) {
      var m = s.mesh;
      for (var c = 0; c < s.n; c++) { var o = NS.ORB.torusCellAt(m, m.sites[2 * c] + m.W / 2, m.sites[2 * c + 1] + m.H / 2); if (c < o) out.push([c, o]); }
      return out;
    }
    for (var i = 0; i < s.n; i++) if (s.pent[i]) P.push(i);
    P.forEach(function (a) {
      var b = -1, best = 2;
      P.forEach(function (p) { var d = s.pos[3 * a] * s.pos[3 * p] + s.pos[3 * a + 1] * s.pos[3 * p + 1] + s.pos[3 * a + 2] * s.pos[3 * p + 2]; if (d < best) { best = d; b = p; } });
      if (a < b) out.push([a, b]);
    });
    return out;
  }

  /* Words whose lengths sum to exactly `total`, none inside another. */
  function pickWords(pool, total, span, rnd) {
    var words = pool.filter(function (w) { return w.indexOf(span) < 0 && span.indexOf(w) < 0; });
    for (var tries = 0; tries < 400; tries++) {
      var order = shuffle(words.slice(), rnd), got = [], sum = 0;
      for (var i = 0; i < order.length && sum < total; i++) {
        var w = order[i];
        if (sum + w.length > total) continue;
        if (total - sum - w.length > 0 && total - sum - w.length < 4) continue;
        if (got.some(function (g) { return g.indexOf(w) >= 0 || w.indexOf(g) >= 0; })) continue;
        got.push(w); sum += w.length;
      }
      if (sum === total) return got;
    }
    return null;
  }

  /* A self-avoiding walk of exactly L tiles from a to b. */
  function spanPath(s, a, b, L, rnd, budget) {
    var toB = bfs(s, b), used = new Uint8Array(s.n), path = [a], steps = 0;
    used[a] = 1;
    function go() {
      if (++steps > budget) return false;
      var u = path[path.length - 1], left = L - path.length;
      if (left === 0) return u === b;
      var opts = shuffle(s.nbrs[u].slice(), rnd).filter(function (v) { return !used[v] && toB[v] <= left - 1 && (v !== b || left === 1); });
      for (var i = 0; i < opts.length; i++) {
        used[opts[i]] = 1; path.push(opts[i]);
        if (go()) return true;
        used[opts[i]] = 0; path.pop();
      }
      return false;
    }
    return go() ? path : null;
  }

  /* A Hamiltonian path through the free tiles: Warnsdorff (fewest onward
     moves first, random ties) with backtracking and two prunes — the free
     tiles must stay connected, and at most one free tile may be a forced
     end (one free neighbour, not next to the head). */
  function hamPath(s, free, rnd, budget) {
    var cells = []; for (var i = 0; i < s.n; i++) if (free[i]) cells.push(i);
    var left = new Uint8Array(free), steps = 0, path = [];
    function deg(v) { var d = 0; s.nbrs[v].forEach(function (w) { if (left[w]) d++; }); return d; }
    function viable(head, remaining) {
      if (remaining === 0) return true;
      var start = -1, ends = 0;
      for (var q = 0; q < cells.length; q++) {
        var v = cells[q]; if (!left[v]) continue;
        if (start < 0) start = v;
        var d = deg(v), touches = s.nbrs[v].indexOf(head) >= 0;
        if (d === 0 && !touches) return false;
        if (d <= 1 && !touches) { if (++ends > 1) return false; }
      }
      var seen = bfs(s, start, function (v) { return left[v]; }), n = 0;
      for (q = 0; q < cells.length; q++) if (left[cells[q]] && seen[cells[q]] >= 0) n++;
      return n === remaining;
    }
    function go(remaining) {
      if (remaining === 0) return true;
      if (++steps > budget) return false;
      var u = path[path.length - 1];
      var opts = s.nbrs[u].filter(function (v) { return left[v]; }).map(function (v) { return [deg(v) + rnd() * 0.5, v]; });
      opts.sort(function (x, y) { return x[0] - y[0]; });
      for (var k = 0; k < opts.length; k++) {
        var v = opts[k][1];
        left[v] = 0; path.push(v);
        if (viable(v, remaining - 1) && go(remaining - 1)) return true;
        left[v] = 1; path.pop();
      }
      return false;
    }
    // start at a tile with few free neighbours: dead ends must be path ends
    var starts = shuffle(cells.slice(), rnd).sort(function (x, y) { return deg(x) - deg(y); }).slice(0, 4);
    for (var t = 0; t < starts.length; t++) {
      path = [starts[t]]; left = new Uint8Array(free); left[starts[t]] = 0; steps = 0;
      if (viable(starts[t], cells.length - 1) && go(cells.length - 1)) return path;
    }
    return null;
  }
  /* Backbite: grab a neighbour of the end and reverse the tail beyond it.
     Keeps the path Hamiltonian, moves its ends and its shape about. */
  function backbite(s, path, free, rnd, moves) {
    var pos = new Int32Array(s.n).fill(-1);
    path.forEach(function (c, i) { pos[c] = i; });
    for (var m = 0; m < moves; m++) {
      if (rnd() < 0.5) { path.reverse(); path.forEach(function (c, i) { pos[c] = i; }); }
      var last = path.length - 1, e = path[last];
      var nb = s.nbrs[e].filter(function (v) { return free[v] && pos[v] >= 0 && pos[v] !== last - 1; });
      if (!nb.length) continue;
      var v = nb[Math.floor(rnd() * nb.length)], i = pos[v];
      for (var a = i + 1, b = last; a < b; a++, b--) { var t = path[a]; path[a] = path[b]; path[b] = t; pos[path[a]] = a; pos[path[b]] = b; }
    }
    return path;
  }

  /* Every place `word` can be traced on these letters: paths of
     neighbours, no tile twice. Deduplicated by tile set (a word traced two
     ways over the same tiles is one placement). */
  function placements(s, letters, word) {
    var out = [], seen = {}, path = [], used = new Uint8Array(s.n);
    function go(u, k) {
      if (k === word.length - 1) { var key = path.slice().sort(function (x, y) { return x - y; }).join(","); if (!seen[key]) { seen[key] = 1; out.push(path.slice()); } return; }
      s.nbrs[u].forEach(function (v) {
        if (!used[v] && letters[v] === word[k + 1]) { used[v] = 1; path.push(v); go(v, k + 1); path.pop(); used[v] = 0; }
      });
    }
    for (var i = 0; i < s.n; i++) if (letters[i] === word[0]) { used[i] = 1; path = [i]; go(i, 0); used[i] = 0; }
    return out;
  }
  /* How many ways do the words exactly tile the sphere? Stops at `limit`. */
  function countSolutions(s, letters, words, limit) {
    var P = [], byCell = []; for (var i = 0; i < s.n; i++) byCell.push([]);
    words.forEach(function (w, wi) { placements(s, letters, w).forEach(function (cells) { var id = P.length; P.push({ w: wi, cells: cells }); cells.forEach(function (c) { byCell[c].push(id); }); }); });
    var covered = new Uint8Array(s.n), usedW = new Uint8Array(words.length), found = 0, nodes = 0;
    function fits(p) { if (usedW[p.w]) return false; for (var q = 0; q < p.cells.length; q++) if (covered[p.cells[q]]) return false; return true; }
    function go(left) {
      if (found >= limit) return;
      if (left === 0) { found++; return; }
      nodes++;
      var best = -1, bestN = 1e9;
      for (var c = 0; c < s.n; c++) {
        if (covered[c]) continue;
        var n = 0; for (var q = 0; q < byCell[c].length; q++) if (fits(P[byCell[c][q]])) n++;
        if (n < bestN) { bestN = n; best = c; if (n === 0) return; }
      }
      byCell[best].forEach(function (id) {
        var p = P[id]; if (!fits(p) || found >= limit) return;
        usedW[p.w] = 1; p.cells.forEach(function (x) { covered[x] = 1; });
        go(left - p.cells.length);
        usedW[p.w] = 0; p.cells.forEach(function (x) { covered[x] = 0; });
      });
    }
    go(s.n);
    return { solutions: found, placements: P.length, nodes: nodes };
  }

  /* Make a board. theme: an entry of K.THEMES; sphereName: c80, c180, c240, t32, t72, t128.
     Returns { sphere, clue, poles, letters, words: [{ w, cells, span }] }. */
  function generate(theme, sphereName, seed, opts) {
    opts = opts || {};
    var s = K.sphere(sphereName), rnd = rngFrom("skein:" + sphereName + ":" + seed);
    var pairs = polePairs(s);
    for (var attempt = 0; attempt < (opts.attempts || 60); attempt++) {
      var poles = pairs[Math.floor(rnd() * pairs.length)];
      if (rnd() < 0.5) poles = [poles[1], poles[0]];
      var reach = bfs(s, poles[0])[poles[1]] + 1;
      // the shortest span that can reach: a long span on a small sphere leaves too little for the words
      var spans = theme.spans.filter(function (w) { return w.length >= reach && w.length <= Math.max(reach + 8, s.n / 3); });
      if (!spans.length) return null;
      var span = spans[0], words = pickWords(theme.words, s.n - span.length, span, rnd);
      if (!words) continue;
      var sp = spanPath(s, poles[0], poles[1], span.length, rnd, 20000);
      if (!sp) continue;
      var free = new Uint8Array(s.n).fill(1); sp.forEach(function (c) { free[c] = 0; });
      var ham = hamPath(s, free, rnd, 40000);
      if (!ham) continue;
      backbite(s, ham, free, rnd, 40 * ham.length);
      // cut into the words' lengths, in a random order, each laid either way round
      var order = shuffle(words.slice(), rnd), at = 0, laid = [{ w: span, cells: sp, span: true }];
      order.forEach(function (w) { var seg = ham.slice(at, at + w.length); at += w.length; if (rnd() < 0.5) seg.reverse(); laid.push({ w: w, cells: seg, span: false }); });
      var letters = new Array(s.n);
      laid.forEach(function (L) { L.cells.forEach(function (c, k) { letters[c] = L.w[k]; }); });
      var proof = countSolutions(s, letters, laid.map(function (L) { return L.w; }), 2);
      if (proof.solutions !== 1) continue;
      return { sphere: sphereName, clue: theme.clue, poles: poles, letters: letters.join(""), words: laid, attempts: attempt + 1, proof: proof };
    }
    return null;
  }

  K.rngFrom = rngFrom; K.polePairs = polePairs; K.placements = placements; K.countSolutions = countSolutions;
  K.generate = generate; K.bfs = bfs;
  /* The boards: One Coast's Goldberg spheres (c80, c180, c240), and
     honeycomb tori (t32, t72, t128: rows × twice as many columns, the
     donut's own proportions) from ../orb/js/torus.js. A torus needs no
     pentagons (Euler χ = 0), so every cell has six neighbours. */
  var TORI = { t32: [4, 8], t72: [6, 12], t128: [8, 16] }, tcache = {};
  K.TORI = Object.keys(TORI);
  K.sphere = function (name) {
    if (!TORI[name]) return NS.COAST.sphere(name);
    if (tcache[name]) return tcache[name];
    var h = NS.ORB.buildHexTorus(TORI[name][0], TORI[name][1]);
    return (tcache[name] = { name: name, torus: true, n: h.n, nbrs: h.nbrs, mesh: h });
  };
})();
