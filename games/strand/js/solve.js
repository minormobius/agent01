/* Strand — the exact solver, and the level carver that leans on it.

   solve(g, pairs, cap) enumerates every way to join each pair (s, t) with
   node-disjoint paths that together cover every node of g, stopping at
   `cap` solutions. It always extends the most constrained strand (fewest
   next steps), and prunes when:
     · a free cell can no longer get the two path neighbours it needs;
     · some unfinished strand's two ends no longer meet through free cells;
     · some free region is touched by no strand that could still sweep it.
   All three are necessary conditions, so the pruning is sound; the
   selftest checks it against brute force on small graphs.

   carve() makes a level: draw a random answer, then add walls, only on
   edges the answer does not use, so it always survives, each one killing
   the alternative the solver just found, until the answer is the only one.
   Then remove every wall that turns out not to matter. What is left is a
   labyrinth where every wall is load-bearing. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var S = NS.STRAND = NS.STRAND || {};

  function solve(g, pairs, cap, budget) {
    cap = cap || 2; budget = budget || 3e6;
    var n = g.n, nb = g.nbrs, K = pairs.length;
    // every strand grows from BOTH ends; end[2p] and end[2p+1] are its heads
    var own = new Int16Array(n).fill(-1), isHead = new Int16Array(n).fill(-1);
    var end = [], trail = [];
    pairs.forEach(function (p, i) { own[p[0]] = i; own[p[1]] = i; end.push(p[0], p[1]); trail.push([p[0]], [p[1]]); isHead[p[0]] = 2 * i; isHead[p[1]] = 2 * i + 1; });
    var free = n - 2 * K, nodes = 0, sols = [];
    var done = new Uint8Array(K), left = K;
    var reg = new Int32Array(n), stack = [];

    function feasible() {
      var u, v, k;
      // every free cell needs two possible path neighbours: free cells or live heads
      for (u = 0; u < n; u++) {
        if (own[u] !== -1) continue;
        var c = 0;
        for (k = 0; k < nb[u].length && c < 2; k++) {
          v = nb[u][k];
          if (own[v] === -1 || (isHead[v] >= 0 && !done[own[v]])) c++;
        }
        if (c < 2) return false;
      }
      reg.fill(-1);
      var R = 0;
      for (u = 0; u < n; u++) {
        if (own[u] !== -1 || reg[u] >= 0) continue;
        stack.length = 0; stack.push(u); reg[u] = R;
        while (stack.length) { var x = stack.pop(); for (k = 0; k < nb[x].length; k++) { v = nb[x][k]; if (own[v] === -1 && reg[v] < 0) { reg[v] = R; stack.push(v); } } }
        R++;
      }
      var served = new Uint8Array(R), mark = new Int32Array(R).fill(-1);
      for (var p = 0; p < K; p++) {
        if (done[p]) continue;
        var a = end[2 * p], b = end[2 * p + 1], joined = nb[a].indexOf(b) >= 0;
        for (k = 0; k < nb[a].length; k++) { v = nb[a][k]; if (own[v] === -1) mark[reg[v]] = p; }
        for (k = 0; k < nb[b].length; k++) { v = nb[b][k]; if (own[v] === -1 && mark[reg[v]] === p) { joined = true; served[reg[v]] = 1; } }
        if (!joined) return false;
      }
      for (var r = 0; r < R; r++) if (!served[r]) return false;
      return true;
    }

    // moves for head e: free neighbours, plus "join" if the other head is adjacent
    function moves(e) {
      var h = end[e], other = end[e ^ 1], out = [];
      for (var k = 0; k < nb[h].length; k++) { var v = nb[h][k]; if (v === other || own[v] === -1) out.push(v); }
      return out;
    }

    function rec() {
      if (++nodes > budget || sols.length >= cap) return;
      if (!left) {
        if (free === 0) sols.push(pairs.map(function (p, i) { return trail[2 * i].concat(trail[2 * i + 1].slice().reverse()); }));
        return;
      }
      var best = -1, bm = null;
      for (var e = 0; e < 2 * K; e++) {
        if (done[e >> 1]) continue;
        var m = moves(e);
        if (!m.length) return;
        if (!bm || m.length < bm.length) { best = e; bm = m; if (m.length === 1) break; }
      }
      var p = best >> 1, h = end[best], other = end[best ^ 1];
      for (var i = 0; i < bm.length; i++) {
        var v = bm[i];
        if (v === other) {
          done[p] = 1; left--;
          if (feasible()) rec();
          left++; done[p] = 0;
        } else {
          own[v] = p; isHead[h] = -1; isHead[v] = best; end[best] = v; trail[best].push(v); free--;
          if (feasible()) rec();
          free++; trail[best].pop(); end[best] = h; isHead[v] = -1; isHead[h] = best; own[v] = -1;
        }
        if (nodes > budget || sols.length >= cap) return;
      }
    }
    if (feasible()) rec();
    return { count: sols.length, sols: sols, exhausted: nodes > budget, nodes: nodes };
  }

  /* A random Hamiltonian path (Warnsdorff order, random ties, restarts). */
  function hamPath(g, rng, avoidEnds) {
    for (var tries = 0; tries < 400; tries++) {
      var s = rng.int(0, g.n - 1);
      if (avoidEnds && avoidEnds(s)) continue;
      var seen = new Uint8Array(g.n), p = [s], nodes = 0; seen[s] = 1;
      var onward = function (v) { var c = 0; for (var k = 0; k < g.nbrs[v].length; k++) if (!seen[g.nbrs[v][k]]) c++; return c; };
      var ok = (function rec(u) {
        if (p.length === g.n) return true;
        if (++nodes > 4000) return false;
        var opts = g.nbrs[u].filter(function (v) { return !seen[v]; }).map(function (v) { return [onward(v) + rng.next() * 0.9, v]; });
        opts.sort(function (a, b) { return a[0] - b[0]; });
        for (var i = 0; i < opts.length; i++) {
          var v = opts[i][1]; seen[v] = 1; p.push(v);
          if (rec(v)) return true;
          p.pop(); seen[v] = 0;
        }
        return false;
      })(s);
      if (ok) return p;
    }
    return null;
  }

  function edgeKey(a, b) { return a < b ? a + "-" + b : b + "-" + a; }
  function usedEdges(sol) {
    var set = new Set();
    sol.forEach(function (path) { for (var k = 1; k < path.length; k++) set.add(edgeKey(path[k - 1], path[k])); });
    return set;
  }

  /* Make one level on board b.
     opts: { pairs, bridges, minLen, rng, budget } */
  function carve(b, opts) {
    var rng = opts.rng, K = opts.pairs;
    // bridges: well-separated cells with at least four sides (panels only)
    var bridges = [], taken = new Set();
    for (var tries = 0; bridges.length < (opts.bridges || 0) && tries < 200; tries++) {
      var c = rng.int(0, b.n - 1);
      if (b.nbrs[c].length < 4 || taken.has(c)) continue;
      bridges.push({ cell: c, lanes: S.bridgeLanes(b, c, rng.int(0, b.nbrs[c].length - 1)) });
      taken.add(c); b.nbrs[c].forEach(function (j) { taken.add(j); b.nbrs[j].forEach(function (x) { taken.add(x); }); });
    }
    var g0 = S.playGraph(b, [], bridges);
    var isLane = function (v) { return g0.cellOf[v] !== v || bridges.some(function (br) { return br.cell === v; }); };
    var ham = hamPath(g0, rng, isLane);
    if (!ham) return null;
    // cut into K strands of at least minLen, never ending on a bridge lane
    var minLen = opts.minLen || 3, cuts = null;
    for (var attempt = 0; attempt < 200 && !cuts; attempt++) {
      var lens = new Array(K).fill(minLen), rest = g0.n - minLen * K;
      if (rest < 0) return null;
      while (rest-- > 0) lens[rng.int(0, K - 1)]++;
      var at = 0, ok = true, cs = [];
      for (var i = 0; i < K; i++) { var a = at, z = at + lens[i] - 1; if (isLane(ham[a]) || isLane(ham[z])) { ok = false; break; } cs.push([a, z]); at += lens[i]; }
      if (ok) cuts = cs;
    }
    if (!cuts) return null;
    var pairs = cuts.map(function (c) { return [ham[c[0]], ham[c[1]]]; });
    var answer = cuts.map(function (c) { return ham.slice(c[0], c[1] + 1); });
    var used = usedEdges(answer);

    // walls on unused edges until the answer is the only one
    var walls = [], budget = opts.budget || 2e6;
    for (var round = 0; round < 400; round++) {
      var r = solve(S.playGraph(b, walls, bridges), pairs, 2, budget);
      if (r.exhausted) return null;
      if (r.count <= 1) break;
      var alt = r.sols.find(function (sol) { return sol.some(function (p, i) { return p.join() !== answer[i].join(); }); });
      var cand = Array.from(usedEdges(alt)).filter(function (e) { return !used.has(e); })
        .map(function (e) { return e.split("-").map(Number); })
        .map(function (e) { return [g0.cellOf[e[0]], g0.cellOf[e[1]]]; })
        .filter(function (e) { return e[0] !== e[1] && !walls.some(function (w) { return edgeKey(w[0], w[1]) === edgeKey(e[0], e[1]); }) && !used.has(edgeKey(e[0], e[1])); });
      if (!cand.length) return null;
      walls.push(rng.pick(cand));
    }
    // drop every wall that doesn't matter
    var order = rng.shuffle(walls.map(function (w, i) { return i; }));
    var keep = walls.slice();
    order.forEach(function (i) {
      var trial = keep.filter(function (w) { return w !== walls[i]; });
      if (trial.length === keep.length) return;
      var r2 = solve(S.playGraph(b, trial, bridges), pairs, 2, budget);
      if (!r2.exhausted && r2.count === 1) keep = trial;
    });
    var check = solve(S.playGraph(b, keep, bridges), pairs, 2, budget);
    if (check.exhausted || check.count !== 1) return null;
    return { pairs: pairs, walls: keep, bridges: bridges, nodes: check.nodes };
  }

  S.solve = solve;
  S.carve = carve;
  S.hamPath = hamPath;
})();
