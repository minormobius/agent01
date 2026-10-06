/* Bucky — the logic: parts, the clock, the checks, the levels, and a router
   that proves every level can be built.

   A design puts a PART on each atom it uses and an ARROW on each bond it
   uses. An atom's inputs are the arrows pointing at it; it drives every
   arrow pointing away. C60 gives every atom three bonds, so:
     wire, not     one in, up to two out (a wire is also a splitter)
     and, or, xor, nand, nor
                   two in, one out
     src           a level's input: no in, up to three out
     lamp          a level's output: one in, none out
   An atom with too few inputs is OPEN (dim, drives 0); with too many, or an
   arrow it can't have, it is BAD (red, drives 0).

   Time is synchronous and every atom costs one tick, wires included:
     next[a] = part(a)(inputs of a, now).
   So a loop is a delay line. A ring of wires holds whatever pattern is in
   it; put one NOT in it and it can never settle, and it blinks with a
   period of twice its length (a pentagon: 10 ticks). Five NOTs round a
   pentagon blink every tick instead: from all-zero they all flip together.

   The checks run the design exactly as the page does:
     table  every row from a cold start (all zero), held HOLD ticks; each
            lamp must sit still at the right value for the last SETTLE.
     seq    the same, but the steps run on without a reset between them
            (a latch has to remember).
     blink  from cold, the lamp must flip at least 4 times in the second
            half of BLINK ticks.

   The router (B.route) builds each level from a netlist: random gate
   placement, then breadth-first wiring through empty atoms, thousands of
   times; the fewest parts found is the level's PAR (js/par.js, baked by
   tools/bake.mjs). It is the best known, not a proved optimum: beat it. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var B = NS.BUCKY = NS.BUCKY || {};

  B.HOLD = 72; B.SETTLE = 8; B.BLINK = 160;
  B.PARTS = {
    wire: { ins: 1, outs: 2, f: function (a) { return a; }, label: "", name: "wire" },
    not: { ins: 1, outs: 2, f: function (a) { return 1 - a; }, label: "NOT", name: "NOT" },
    and: { ins: 2, outs: 1, f: function (a, b) { return a & b; }, label: "AND", name: "AND" },
    or: { ins: 2, outs: 1, f: function (a, b) { return a | b; }, label: "OR", name: "OR" },
    xor: { ins: 2, outs: 1, f: function (a, b) { return a ^ b; }, label: "XOR", name: "XOR" },
    nand: { ins: 2, outs: 1, f: function (a, b) { return 1 - (a & b); }, label: "NAND", name: "NAND" },
    nor: { ins: 2, outs: 1, f: function (a, b) { return 1 - (a | b); }, label: "NOR", name: "NOR" },
    src: { ins: 0, outs: 3 },
    lamp: { ins: 1, outs: 0 },
  };
  var CODE = { "": ".", wire: "w", not: "n", and: "a", or: "o", xor: "x", nand: "d", nor: "r" }, DECODE = {};
  Object.keys(CODE).forEach(function (k) { DECODE[CODE[k]] = k; });

  /* ------------------------------------------------------------ the levels
     Terminals sit at the atom nearest a direction (x right, y up, z toward
     you at the start), never two side by side. `net` is the reference
     circuit the router builds: gates by id, lamps by the signal they show. */
  var L = [];
  function rows(names, f) {
    var out = [], k = names.length;
    for (var m = 0; m < 1 << k; m++) {
      var inp = {}; names.forEach(function (n, i) { inp[n] = (m >> (k - 1 - i)) & 1; });
      out.push({ in: inp, want: f(inp) });
    }
    return out;
  }
  L.push({ id: "wire", title: "Wire", parts: ["wire"],
    brief: "Carry A to the lamp. Drag from A, atom to atom; each atom you pass becomes a wire. A signal costs one tick per atom.",
    src: { A: [-0.8, 0.1, 0.6] }, lamp: { out: [0.8, -0.1, 0.6] },
    check: "table", rows: rows(["A"], function (v) { return { out: v.A }; }),
    net: { gates: [], lamps: { out: "A" } } });
  L.push({ id: "not", title: "Not", parts: ["wire", "not"],
    brief: "Light the lamp when A is off. Pick NOT, tap an atom to place it, then wire A into it and it into the lamp.",
    src: { A: [-0.8, 0.2, 0.55] }, lamp: { out: [0.8, -0.2, 0.55] },
    check: "table", rows: rows(["A"], function (v) { return { out: 1 - v.A }; }),
    net: { gates: [{ id: "n", f: "not", in: ["A"] }], lamps: { out: "n" } } });
  L.push({ id: "and", title: "And", parts: ["wire", "and"],
    brief: "Both A and B. A gate takes two arrows in and sends one out, which is all three of its bonds.",
    src: { A: [-0.75, 0.45, 0.5], B: [-0.75, -0.45, 0.5] }, lamp: { out: [0.85, 0, 0.5] },
    check: "table", rows: rows(["A", "B"], function (v) { return { out: v.A & v.B }; }),
    net: { gates: [{ id: "g", f: "and", in: ["A", "B"] }], lamps: { out: "g" } } });
  L.push({ id: "or", title: "Or", parts: ["wire", "or"],
    brief: "Either A or B. Now the lamp is round the back: drag the empty space to turn the ball.",
    src: { A: [-0.6, 0.5, 0.6], B: [-0.6, -0.5, 0.6] }, lamp: { out: [0.3, 0, -0.95] },
    check: "table", rows: rows(["A", "B"], function (v) { return { out: v.A | v.B }; }),
    net: { gates: [{ id: "g", f: "or", in: ["A", "B"] }], lamps: { out: "g" } } });
  L.push({ id: "blink", title: "Blink", parts: ["wire", "not"],
    brief: "No inputs at all: make the lamp blink. Every atom is one tick late, so a loop with a NOT in it chases its own tail forever. The pentagons make good clocks.",
    src: {}, lamp: { out: [0.2, 0, 0.98] },
    check: "blink",
    net: { gates: [{ id: "n", f: "not", in: ["n"] }], lamps: { out: "n" } } });
  L.push({ id: "nandnot", title: "One gate", parts: ["wire", "nand"],
    brief: "Only NAND, and the lamp wants NOT A. A wire can split: one arrow in, two out.",
    src: { A: [-0.8, 0.2, 0.55] }, lamp: { out: [0.8, -0.2, 0.55] },
    check: "table", rows: rows(["A"], function (v) { return { out: 1 - v.A }; }),
    net: { gates: [{ id: "g", f: "nand", in: ["A", "A"] }], lamps: { out: "g" } } });
  L.push({ id: "xor", title: "Not both", parts: ["wire", "and", "or", "not"],
    brief: "A or B, but not both, and no XOR in the box. Sources can feed up to three arrows.",
    src: { A: [-0.75, 0.45, 0.5], B: [-0.75, -0.45, 0.5] }, lamp: { out: [0.85, 0, 0.5] },
    check: "table", rows: rows(["A", "B"], function (v) { return { out: v.A ^ v.B }; }),
    net: { gates: [{ id: "o", f: "or", in: ["A", "B"] }, { id: "a", f: "and", in: ["A", "B"] }, { id: "n", f: "not", in: ["a"] }, { id: "x", f: "and", in: ["o", "n"] }], lamps: { out: "x" } } });
  L.push({ id: "nandxor", title: "Universal", parts: ["wire", "nand"],
    brief: "The same lamp, A or B but not both, from NAND alone. Four will do it.",
    src: { A: [-0.75, 0.45, 0.5], B: [-0.75, -0.45, 0.5] }, lamp: { out: [0.85, 0, 0.5] },
    check: "table", rows: rows(["A", "B"], function (v) { return { out: v.A ^ v.B }; }),
    net: { gates: [{ id: "m", f: "nand", in: ["A", "B"] }, { id: "p", f: "nand", in: ["A", "m"] }, { id: "q", f: "nand", in: ["B", "m"] }, { id: "x", f: "nand", in: ["p", "q"] }], lamps: { out: "x" } } });
  L.push({ id: "adder", title: "Half adder", parts: ["wire", "xor", "and"],
    brief: "Add A and B: SUM is the ones, CARRY the twos. Two lamps, and the ball is planar: wires can't cross, so route round.",
    src: { A: [-0.75, 0.45, 0.5], B: [-0.75, -0.45, 0.5] }, lamp: { sum: [0.75, 0.45, 0.5], carry: [0.75, -0.45, 0.5] },
    check: "table", rows: rows(["A", "B"], function (v) { return { sum: v.A ^ v.B, carry: v.A & v.B }; }),
    net: { gates: [{ id: "s", f: "xor", in: ["A", "B"] }, { id: "c", f: "and", in: ["A", "B"] }], lamps: { sum: "s", carry: "c" } } });
  L.push({ id: "majority", title: "Majority", parts: ["wire", "and", "or"],
    brief: "Three voters; the lamp lights when at least two say yes.",
    src: { A: [-0.7, 0.55, 0.45], B: [-0.85, 0, 0.5], C: [-0.7, -0.55, 0.45] }, lamp: { out: [0.85, 0, 0.5] },
    check: "table", rows: rows(["A", "B", "C"], function (v) { return { out: (v.A + v.B + v.C) >= 2 ? 1 : 0 }; }),
    net: { gates: [{ id: "ab", f: "and", in: ["A", "B"] }, { id: "o", f: "or", in: ["A", "B"] }, { id: "c", f: "and", in: ["C", "o"] }, { id: "m", f: "or", in: ["ab", "c"] }], lamps: { out: "m" } } });
  L.push({ id: "latch", title: "Latch", parts: ["wire", "nor"],
    brief: "A memory. SET lights Q and RESET puts it out, and with both off Q must remember. Two NORs, each feeding the other. Tap a source to flip it.",
    src: { SET: [-0.75, 0.45, 0.5], RESET: [-0.75, -0.45, 0.5] }, lamp: { Q: [0.85, 0, 0.5] },
    check: "seq", rows: [
      { in: { SET: 0, RESET: 1 }, want: { Q: 0 } }, { in: { SET: 0, RESET: 0 }, want: { Q: 0 } },
      { in: { SET: 1, RESET: 0 }, want: { Q: 1 } }, { in: { SET: 0, RESET: 0 }, want: { Q: 1 } },
      { in: { SET: 0, RESET: 1 }, want: { Q: 0 } }, { in: { SET: 0, RESET: 0 }, want: { Q: 0 } },
      { in: { SET: 1, RESET: 0 }, want: { Q: 1 } }, { in: { SET: 1, RESET: 0 }, want: { Q: 1 } },
      { in: { SET: 0, RESET: 0 }, want: { Q: 1 } }],
    net: { gates: [{ id: "q", f: "nor", in: ["RESET", "qb"] }, { id: "qb", f: "nor", in: ["SET", "q"] }], lamps: { Q: "q" } } });
  L.push({ id: "kick", title: "The boot", parts: ["wire", "and", "not"],
    brief: "Three sensors watch what rolls past. Kick it if it is blue, and a diamond, and not big.",
    src: { blue: [-0.6, 0.6, 0.5], diamond: [-0.9, 0, 0.45], big: [-0.6, -0.6, 0.5] }, lamp: { kick: [0.2, 0.1, -0.97] },
    check: "table", rows: rows(["blue", "diamond", "big"], function (v) { return { kick: v.blue & v.diamond & (1 - v.big) }; }),
    net: { gates: [{ id: "bd", f: "and", in: ["blue", "diamond"] }, { id: "nb", f: "not", in: ["big"] }, { id: "k", f: "and", in: ["bd", "nb"] }], lamps: { kick: "k" } } });
  B.LEVELS = L;

  /* Where a level's terminals land: nearest atom to each direction, in the
     order given, skipping any atom on or beside one already placed. */
  B.terminals = function (lv) {
    if (lv._t) return lv._t;
    var ball = B.ball(), role = new Array(ball.n).fill(""), name = new Array(ball.n).fill(""), at = {};
    var put = function (kind, nm, d) {
      var l = Math.hypot(d[0], d[1], d[2]), best = -2, bi = -1;
      for (var a = 0; a < ball.n; a++) {
        if (role[a] || ball.nbrs[a].some(function (b) { return role[b]; })) continue;
        var p = ball.atoms[a], s = (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / l;
        if (s > best) { best = s; bi = a; }
      }
      role[bi] = kind; name[bi] = nm; at[nm] = bi;
    };
    Object.keys(lv.src).forEach(function (k) { put("src", k, lv.src[k]); });
    Object.keys(lv.lamp).forEach(function (k) { put("lamp", k, lv.lamp[k]); });
    return (lv._t = { role: role, name: name, at: at, srcs: Object.keys(lv.src), lamps: Object.keys(lv.lamp) });
  };

  /* ------------------------------------------------------------ designs
     { role: [60 part names or ""], arrow: { "a-b": from } }. Terminals are
     the level's and never stored. */
  B.blank = function (lv) {
    var t = B.terminals(lv);
    return { role: t.role.map(function (r) { return r === "src" || r === "lamp" ? r : ""; }), arrow: {} };
  };
  B.copy = function (d) { var a = {}; for (var k in d.arrow) a[k] = d.arrow[k]; return { role: d.role.slice(), arrow: a }; };
  B.parts = function (d) { return d.role.filter(function (r) { return r && r !== "src" && r !== "lamp"; }).length; };
  B.encode = function (d) {
    var s = d.role.map(function (r) { return r === "src" || r === "lamp" ? "." : CODE[r]; }).join("");
    return s + "|" + Object.keys(d.arrow).map(function (k) { var ab = k.split("-"), f = d.arrow[k]; return f + ">" + (f === +ab[0] ? ab[1] : ab[0]); }).join(",");
  };
  B.decode = function (lv, s) {
    var d = B.blank(lv), parts = String(s || "").split("|"), ball = B.ball();
    if (parts[0].length !== ball.n) return d;
    for (var a = 0; a < ball.n; a++) if (!d.role[a]) d.role[a] = DECODE[parts[0][a]] || "";
    (parts[1] || "").split(",").forEach(function (e) {
      var m = /^(\d+)>(\d+)$/.exec(e); if (!m) return;
      var f = +m[1], t = +m[2];
      if (f < ball.n && t < ball.n && ball.nbrs[f].indexOf(t) >= 0 && d.role[f] && d.role[t]) d.arrow[B.key(f, t)] = f;
    });
    return d;
  };
  /* Clearing a part takes its arrows with it: an arrow always joins two parts. */
  B.clear = function (d, a) {
    var ball = B.ball();
    if (d.role[a] === "src" || d.role[a] === "lamp") return;
    d.role[a] = "";
    ball.nbrs[a].forEach(function (b) { delete d.arrow[B.key(a, b)]; });
  };

  /* ------------------------------------------------------------ the clock */
  B.compile = function (d) {
    var ball = B.ball(), n = ball.n, ins = [], outs = [], status = [];
    for (var a = 0; a < n; a++) { ins.push([]); outs.push([]); }
    for (var k in d.arrow) {
      var ab = k.split("-"), f = d.arrow[k], t = f === +ab[0] ? +ab[1] : +ab[0];
      outs[f].push(t); ins[t].push(f);
    }
    for (a = 0; a < n; a++) {
      var r = d.role[a], P = B.PARTS[r];
      if (!r) status.push(ins[a].length || outs[a].length ? "bad" : "empty");
      else if (ins[a].length > P.ins || outs[a].length > P.outs) status.push("bad");
      else if (ins[a].length < P.ins) status.push("open");
      else status.push("ok");
    }
    return { n: n, role: d.role, ins: ins, outs: outs, status: status };
  };
  /* One tick. `src` maps an atom to its value for the sources. */
  B.step = function (c, v, src) {
    var nv = new Array(c.n);
    for (var a = 0; a < c.n; a++) {
      var r = c.role[a];
      if (r === "src") nv[a] = src[a] | 0;
      else if (c.status[a] !== "ok") nv[a] = 0;
      else if (r === "lamp") nv[a] = v[c.ins[a][0]];
      else { var f = B.PARTS[r].f, i = c.ins[a]; nv[a] = i.length === 1 ? f(v[i[0]]) : f(v[i[0]], v[i[1]]); }
    }
    return nv;
  };
  B.zero = function (c) { return new Array(c.n).fill(0); };
  function srcMap(t, inp) { var m = {}; t.srcs.forEach(function (s) { m[t.at[s]] = inp[s] | 0; }); return m; }

  /* Run the level's check. → { pass, rows: [{ ok, got }], parts } */
  B.check = function (lv, d) {
    var c = B.compile(d), t = B.terminals(lv), res = [], pass = true;
    if (lv.check === "blink") {
      var v = B.zero(c), lamp = t.at[t.lamps[0]], flips = 0, prev = 0;
      for (var k = 0; k < B.BLINK; k++) { v = B.step(c, v, {}); if (k >= B.BLINK / 2 && v[lamp] !== prev) flips++; prev = v[lamp]; }
      pass = flips >= 4;
      return { pass: pass, rows: [{ ok: pass, got: { flips: flips } }], parts: B.parts(d) };
    }
    var vv = B.zero(c);
    lv.rows.forEach(function (row) {
      if (lv.check === "table") vv = B.zero(c);
      var src = srcMap(t, row.in), seen = {};
      t.lamps.forEach(function (l) { seen[l] = []; });
      for (var k = 0; k < B.HOLD; k++) {
        vv = B.step(c, vv, src);
        if (k >= B.HOLD - B.SETTLE) t.lamps.forEach(function (l) { seen[l].push(vv[t.at[l]]); });
      }
      var got = {}, ok = true;
      t.lamps.forEach(function (l) {
        var s = seen[l], still = s.every(function (x) { return x === s[0]; });
        got[l] = still ? s[0] : "~";
        if (got[l] !== row.want[l]) ok = false;
      });
      res.push({ ok: ok, got: got }); if (!ok) pass = false;
    });
    return { pass: pass, rows: res, parts: B.parts(d) };
  };

  /* ------------------------------------------------------------ the router */
  function outCap(r) { return B.PARTS[r] ? B.PARTS[r].outs : 0; }
  B.route = function (lv, rng, place) {
    var ball = B.ball(), d = B.blank(lv), t = B.terminals(lv), net = lv.net, drv = {}, ins = {}, outs = {};
    for (var a = 0; a < ball.n; a++) { ins[a] = 0; outs[a] = 0; }
    t.srcs.forEach(function (s) { drv[s] = t.at[s]; });
    var free = []; for (a = 0; a < ball.n; a++) if (!d.role[a]) free.push(a);
    for (var g = 0; g < net.gates.length; g++) {
      var gate = net.gates[g], i = place ? free.indexOf(place[g]) : Math.floor(rng() * free.length), at = free[i];
      if (i < 0) return null;
      free.splice(i, 1); d.role[at] = gate.f; drv[gate.id] = at;
    }
    d.place = net.gates.map(function (gate) { return drv[gate.id]; });
    var jobs = [];
    net.gates.forEach(function (gate) { gate.in.forEach(function (s) { jobs.push([s, drv[gate.id]]); }); });
    Object.keys(net.lamps).forEach(function (l) { jobs.push([net.lamps[l], t.at[l]]); });
    for (i = jobs.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), x = jobs[i]; jobs[i] = jobs[j]; jobs[j] = x; }
    var tree = {};
    Object.keys(drv).forEach(function (s) { tree[s] = [drv[s]]; });
    var freeBond = function (p, q) { return !d.arrow[B.key(p, q)]; };
    /* Breadth-first from the given first steps [from, to] through empty
       atoms to the sink. A loop back into its own tree (a clock's NOT
       feeding itself) must leave and return by different bonds, so each of
       the sink's own first steps is searched alone. */
    var search = function (seeds, sink) {
      var prev = {}, depth = {}, q = [];
      for (var k = 0; k < seeds.length; k++) {
        var s = seeds[k][0], u = seeds[k][1];
        if (u === sink) return { last: s, prev: prev, len: 0 };
        if (prev[u] === undefined) { prev[u] = s; depth[u] = 1; q.push(u); }
      }
      for (var h = 0; h < q.length; h++) {
        var v = q[h];
        for (var e = 0; e < 3; e++) {
          var w = ball.nbrs[v][e];
          if (w === prev[v]) continue;
          if (w === sink) return { last: v, prev: prev, len: depth[v] };
          if (!d.role[w] && prev[w] === undefined) { prev[w] = v; depth[w] = depth[v] + 1; q.push(w); }
        }
      }
      return null;
    };
    for (var jn = 0; jn < jobs.length; jn++) {
      var sig = jobs[jn][0], sink = jobs[jn][1], seeds = [], own = [];
      tree[sig].forEach(function (s) {
        if (outs[s] >= outCap(d.role[s])) return;
        ball.nbrs[s].forEach(function (u) {
          if (!freeBond(s, u) || (u !== sink && d.role[u])) return;
          (s === sink ? own : seeds).push([s, u]);
        });
      });
      var res = seeds.length ? search(seeds, sink) : null;
      own.forEach(function (sd) { var r = search([sd], sink); if (r && (!res || r.len < res.len)) res = r; });
      if (!res) return null;
      var prev = res.prev, last = res.last;
      // walk back from `last` to the tree, laying wire
      var cur = last, nxt = sink;
      while (true) {
        d.arrow[B.key(cur, nxt)] = cur; outs[cur]++; ins[nxt]++;
        if (prev[cur] === undefined) break;
        d.role[cur] = "wire"; tree[sig].push(cur);
        nxt = cur; cur = prev[cur];
      }
      if (tree[sig].indexOf(cur) < 0) return null;
    }
    return d;
  };
  /* The fewest parts found: `tries` random placements, then a climb that
     moves one gate at a time to a nearby atom and re-routes it in a few
     random orders, keeping anything no worse. Every candidate must pass the
     level's own check. */
  B.par = function (lv, seed, tries) {
    var rng = mulberry32(seed), best = null, ball = B.ball();
    var better = function (d) {
      if (!d || (best && B.parts(d) > B.parts(best))) return false;
      if (!B.check(lv, d).pass) return false;
      best = d; return true;
    };
    for (var k = 0; k < tries; k++) {
      var d = B.route(lv, rng);
      if (d && (!best || B.parts(d) < B.parts(best))) better(d);
    }
    var G = lv.net.gates.length;
    for (k = 0; best && G && k < tries; k++) {
      var pl = best.place.slice(), g = Math.floor(rng() * G), a = pl[g];
      for (var s = 1 + Math.floor(rng() * 2); s > 0; s--) a = ball.nbrs[a][Math.floor(rng() * 3)];
      pl[g] = a;
      for (var o = 0; o < 4; o++) better(B.route(lv, rng, pl));
    }
    if (best) delete best.place;
    return best;
  };
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  B.mulberry32 = mulberry32;
})();
