/* Orb — the solver, and the generator that leans on it.

   Does Minesweeper stay solvable on a Voronoi mesh? Not by itself — and it
   never was on squares either. "Solvable" is a property of a *mine layout*,
   not of a tiling: plenty of ordinary expert boards force a coin-flip. What
   changes on an irregular mesh is how often (test/analysis.mjs measures it).
   So the game does not hope. Every board is run through an exact solver from
   the first click before you see it, and only a board that can be cleared by
   pure deduction ships. Any loss here was avoidable, and the game can show you
   the cell that proved it.

   deduce(): what is certain, given only what a player can see.
     level 1  a single number: all its unknowns are safe, or all are mines
     level 2  two overlapping numbers (the 1-2 and subset patterns)
     level 3  exact: enumerate every assignment of each frontier component,
              then combine components against the total mine count. A cell is
              safe iff no consistent world puts a mine on it.
   Level 3 is the ground truth; 1 and 2 exist for speed and to grade boards.
   Its combination step is boolean, not a count — we only ever ask "is there
   *any* world where…", which is exact and cannot overflow. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.ORB = NS.ORB || {};

  var NODE_BUDGET = 400000;

  /* view = { n, nbrs, open, count, known (1 = known mine, 2 = known safe), total } */
  function deduce(v, opts) {
    var maxLevel = (opts && opts.maxLevel) || 3;
    var n = v.n, nb = v.nbrs, open = v.open, known = v.known;
    var cons = [], consOf = new Array(n), i, k;

    for (i = 0; i < n; i++) {
      if (!open[i]) continue;
      var vars = [], r = v.count[i];
      for (k = 0; k < nb[i].length; k++) {
        var j = nb[i][k];
        if (known[j] === 1) r--; else if (!open[j] && !known[j]) vars.push(j);
      }
      if (vars.length) cons.push({ vars: vars, r: r });
    }

    var safe = new Set(), mine = new Set();
    function done(level) { return { safe: Array.from(safe), mine: Array.from(mine), level: level }; }
    if (opts && opts.exactOnly) { var e0 = exact(v, cons); return e0.exhausted ? { safe: [], mine: [], level: 0, exhausted: true } : { safe: e0.safe, mine: e0.mine, level: 3 }; }

    // level 1
    for (k = 0; k < cons.length; k++) {
      var C = cons[k];
      if (C.r === 0) C.vars.forEach(function (x) { safe.add(x); });
      else if (C.r === C.vars.length) C.vars.forEach(function (x) { mine.add(x); });
    }
    if (safe.size || mine.size) return done(1);
    if (maxLevel < 2) return done(0);

    // level 2 — every pair of numbers that share an unknown
    for (k = 0; k < cons.length; k++) {
      cons[k].set = new Set(cons[k].vars);
      for (var q = 0; q < cons[k].vars.length; q++) {
        var x = cons[k].vars[q];
        (consOf[x] = consOf[x] || []).push(k);
      }
    }
    var seen = new Set();
    for (i = 0; i < n; i++) {
      var cs = consOf[i];
      if (!cs) continue;
      for (var a = 0; a < cs.length; a++) for (var b = 0; b < cs.length; b++) {
        if (a === b) continue;
        var key = cs[a] * 65536 + cs[b];
        if (seen.has(key)) continue; seen.add(key);
        var A = cons[cs[a]], B = cons[cs[b]];
        var onlyA = A.vars.filter(function (y) { return !B.set.has(y); });
        var onlyB = B.vars.filter(function (y) { return !A.set.has(y); });
        // B has rB − rA more mines than A; if onlyB is exactly that big, it is
        // all mines and onlyA is all clear. (Covers subset: onlyA empty.)
        if (onlyB.length && B.r - A.r === onlyB.length) {
          onlyB.forEach(function (y) { mine.add(y); });
          onlyA.forEach(function (y) { safe.add(y); });
        } else if (!onlyA.length && onlyB.length && B.r === A.r) {
          onlyB.forEach(function (y) { safe.add(y); });
        }
      }
    }
    if (safe.size || mine.size) return done(2);
    if (maxLevel < 3) return done(0);

    // level 3 — exact
    var ex = exact(v, cons);
    if (ex.exhausted) return { safe: [], mine: [], level: 0, exhausted: true };
    ex.safe.forEach(function (y) { safe.add(y); });
    ex.mine.forEach(function (y) { mine.add(y); });
    return done(safe.size || mine.size ? 3 : 0);
  }

  function exact(v, cons) {
    var n = v.n, open = v.open, known = v.known, i, k;
    var isFront = new Uint8Array(n), consOf = new Array(n);
    for (k = 0; k < cons.length; k++) for (i = 0; i < cons[k].vars.length; i++) {
      var x = cons[k].vars[i];
      isFront[x] = 1; (consOf[x] = consOf[x] || []).push(k);
    }
    var R = v.total, L = 0;
    for (i = 0; i < n; i++) { if (known[i] === 1) R--; else if (!open[i] && !known[i] && !isFront[i]) L++; }

    // components: connect cells through shared constraints
    var comp = new Int32Array(n).fill(-1), comps = [];
    for (i = 0; i < n; i++) {
      if (!isFront[i] || comp[i] >= 0) continue;
      var id = comps.length, order = [], qu = [i], usedC = new Set();
      comp[i] = id;
      while (qu.length) {
        var c = qu.shift(); order.push(c);
        for (k = 0; k < consOf[c].length; k++) {
          var ci = consOf[c][k]; usedC.add(ci);
          var vs = cons[ci].vars;
          for (var t = 0; t < vs.length; t++) if (comp[vs[t]] < 0) { comp[vs[t]] = id; qu.push(vs[t]); }
        }
      }
      comps.push({ vars: order, cons: Array.from(usedC) });
    }

    var budget = { left: NODE_BUDGET };
    for (k = 0; k < comps.length; k++) {
      enumerate(comps[k], cons, consOf, budget);
      if (budget.left < 0) return { exhausted: true };
    }

    // feasible mine totals per component, then "every other component" sums
    function orSum(A, B) { // boolean convolution
      var out = new Uint8Array(A.length + B.length - 1);
      for (var p = 0; p < A.length; p++) if (A[p]) for (var q = 0; q < B.length; q++) if (B[q]) out[p+q] = 1;
      return out;
    }
    var feas = comps.map(function (C) { return C.feasible; });
    var pre = [Uint8Array.of(1)], suf = new Array(comps.length + 1);
    for (k = 0; k < comps.length; k++) pre.push(orSum(pre[k], feas[k]));
    suf[comps.length] = Uint8Array.of(1);
    for (k = comps.length - 1; k >= 0; k--) suf[k] = orSum(feas[k], suf[k+1]);
    function fits(s) { var rest = R - s; return rest >= 0 && rest <= L; }

    var safe = [], mine = [];
    for (k = 0; k < comps.length; k++) {
      var others = orSum(pre[k], suf[k+1]), C = comps[k], K = C.vars.length + 1;
      var okK = new Uint8Array(K);
      for (var kk = 0; kk < K; kk++) {
        if (!C.feasible[kk]) continue;
        for (var s = 0; s < others.length; s++) if (others[s] && fits(kk + s)) { okK[kk] = 1; break; }
      }
      for (i = 0; i < C.vars.length; i++) {
        var canMine = false, canSafe = false;
        for (kk = 0; kk < K; kk++) {
          if (!okK[kk]) continue;
          if (C.mineIn[i*K + kk]) canMine = true;
          if (C.safeIn[i*K + kk]) canSafe = true;
        }
        if (!canMine) safe.push(C.vars[i]);
        else if (!canSafe) mine.push(C.vars[i]);
      }
    }
    if (L > 0) { // cells no number touches
      var all = pre[comps.length], intMine = false, intSafe = false;
      for (var s2 = 0; s2 < all.length; s2++) {
        if (!all[s2] || !fits(s2)) continue;
        if (R - s2 >= 1) intMine = true;
        if (R - s2 <= L - 1) intSafe = true;
      }
      if (!intMine || !intSafe) for (i = 0; i < n; i++) {
        if (open[i] || known[i] || isFront[i]) continue;
        if (!intMine) safe.push(i); else mine.push(i);
      }
    }
    return { safe: safe, mine: mine };
  }

  /* Backtracking over one component. Records, for each mine total k, whether
     some solution has var i mined (mineIn) / clear (safeIn). */
  function enumerate(C, cons, consOf, budget) {
    var vars = C.vars, m = vars.length, K = m + 1;
    var local = new Map(); vars.forEach(function (x, idx) { local.set(x, idx); });
    var cl = C.cons, cr = new Int32Array(cons.length), cu = new Int32Array(cons.length);
    for (var t = 0; t < cl.length; t++) { cr[cl[t]] = 0; cu[cl[t]] = cons[cl[t]].vars.length; }
    var asg = new Uint8Array(m), feasible = new Uint8Array(K);
    var mineIn = new Uint8Array(m*K), safeIn = new Uint8Array(m*K);

    function ok(x, val) {
      var cs = consOf[x], good = true;
      for (var q = 0; q < cs.length; q++) {
        var c = cs[q]; cu[c]--; cr[c] += val;
        var r = cons[c].r;
        if (cr[c] > r || cr[c] + cu[c] < r) good = false;
      }
      return good;
    }
    function undo(x, val) {
      var cs = consOf[x];
      for (var q = 0; q < cs.length; q++) { cu[cs[q]]++; cr[cs[q]] -= val; }
    }
    function rec(d, mines) {
      if (--budget.left < 0) return;
      if (d === m) {
        feasible[mines] = 1;
        for (var q = 0; q < m; q++) (asg[q] ? mineIn : safeIn)[q*K + mines] = 1;
        return;
      }
      var x = vars[d];
      for (var val = 0; val < 2; val++) {
        asg[d] = val;
        if (ok(x, val)) rec(d + 1, mines + val);
        undo(x, val);
        if (budget.left < 0) return;
      }
    }
    rec(0, 0);
    C.feasible = feasible; C.mineIn = mineIn; C.safeIn = safeIn;
  }

  /* Play a board out by deduction alone from `first`. Returns whether it
     cleared, how many deduction rounds it took, and the hardest level needed. */
  function solveFrom(mesh, mineArr, first) {
    var n = mesh.n, s = O.newState(mesh, mineArr.length);
    O.plant(s, mineArr); s.phase = "play";
    var known = new Uint8Array(n), hardest = 1, rounds = 0, levels = [0, 0, 0, 0];
    O.reveal(s, first);
    var view = { n: n, nbrs: mesh.nbrs, open: s.open, count: s.count, known: known, total: mineArr.length };
    while (s.phase === "play") {
      var d = deduce(view);
      if (!d.safe.length && !d.mine.length) return { solved: false, rounds: rounds, hardest: hardest, levels: levels, exhausted: !!d.exhausted, state: s, known: known };
      rounds++; levels[d.level]++;
      if (d.level > hardest) hardest = d.level;
      d.mine.forEach(function (x) { known[x] = 1; });
      d.safe.forEach(function (x) { O.reveal(s, x); });
      if (s.phase === "lost") throw new Error("solver opened a mine — deduce() is unsound");
    }
    return { solved: true, rounds: rounds, hardest: hardest, levels: levels, state: s, known: known };
  }

  function randomMines(mesh, nMines, first, rng) {
    var banned = new Set(mesh.nbrs[first]); banned.add(first);
    var pool = [];
    for (var i = 0; i < mesh.n; i++) if (!banned.has(i)) pool.push(i);
    rng.shuffle(pool);
    return pool.slice(0, nMines);
  }

  /* A board that can be cleared from `first` without one guess.
     Strategy: deal a random layout; if the solver gets stuck, move one mine
     from the stuck frontier into the unseen interior and try again (the
     repair keeps most of a layout that was nearly right); after too many
     repairs, re-deal. Deterministic in (seed, mesh, nMines, first). */
  function generate(mesh, nMines, first, seed, opts) {
    var noGuess = !(opts && opts.noGuess === false);
    var rng = O.rngFor(seed, "mines", mesh.n, nMines, first);
    var deals = 0, repairs = 0;
    for (;;) {
      deals++;
      var mines = randomMines(mesh, nMines, first, rng);
      if (!noGuess) return { mines: mines, deals: deals, repairs: 0 };
      for (var rep = 0; rep < 40; rep++) {
        var res = solveFrom(mesh, mines, first);
        if (res.solved) return { mines: mines, deals: deals, repairs: repairs, hardest: res.hardest, rounds: res.rounds };
        if (!repair(mesh, mines, first, res, rng)) break;
        repairs++;
      }
      if (deals > 200) throw new Error("orb: no guess-free board in 200 deals — density too high for this mesh");
    }
  }

  function repair(mesh, mines, first, res, rng) {
    var s = res.state, known = res.known, n = mesh.n, nb = mesh.nbrs;
    var banned = new Set(nb[first]); banned.add(first);
    var front = [], interior = [];
    for (var i = 0; i < n; i++) {
      if (s.open[i] || known[i]) continue;
      var touches = false;
      for (var k = 0; k < nb[i].length; k++) if (s.open[nb[i][k]]) { touches = true; break; }
      if (touches) { if (s.mine[i]) front.push(i); }
      else if (!s.mine[i] && !banned.has(i)) interior.push(i);
    }
    if (!front.length || !interior.length) return false;
    var from = rng.pick(front), to = rng.pick(interior);
    mines[mines.indexOf(from)] = to;
    return true;
  }

  /* Everything a player could know for certain right now — ALL of it.
     This is what the guess counter checks taps against, so it must be the
     complete set. deduce() is not: it stops at the first level that finds
     anything, which is right for solving (take the cheap wins, then look
     again) and wrong here. A tap on a cell cleared by two overlapping numbers
     would be called a guess whenever some single number elsewhere happened
     to clear something too. So: the exact solver, which the selftest proves
     complete against brute force. If it ever runs out of budget on a huge
     frontier, the answer is marked `partial` and callers must not call a tap
     a guess on its strength. Flags are ignored: they are the player's
     opinion, not knowledge. */
  function certainties(s) {
    var open = s.open;
    if (s.phase === "lost") { open = s.open.slice(); open[s.boom] = 0; }
    var known = new Uint8Array(s.n);
    var view = { n: s.n, nbrs: s.mesh.nbrs, open: open, count: s.count, known: known, total: s.nMines };
    // cheap rules to a fixpoint first: every cell they settle is one fewer
    // variable for the exact search (the difference between ms and a blown
    // budget on a frontier left ragged by lucky taps)
    for (var guard = 0; guard < s.n; guard++) {
      var d = deduce(view, { maxLevel: 2 }), grew = false;
      d.safe.forEach(function (x) { if (!known[x]) { known[x] = 2; grew = true; } });
      d.mine.forEach(function (x) { if (!known[x]) { known[x] = 1; grew = true; } });
      if (!grew) break;
    }
    var ex = deduce(view, { exactOnly: true }), safe = [], mine = [], i;
    for (i = 0; i < s.n; i++) { if (known[i] === 2) safe.push(i); else if (known[i] === 1) mine.push(i); }
    if (ex.exhausted) return { safe: safe, mine: mine, partial: true };
    return { safe: safe.concat(ex.safe), mine: mine.concat(ex.mine), partial: false };
  }

  O.deduce = deduce;
  O.solveFrom = solveFrom;
  O.generate = generate;
  O.randomMines = randomMines;
  O.certainties = certainties;
})();
