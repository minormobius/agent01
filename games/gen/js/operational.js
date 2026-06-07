/* The Ludographer — OPERATIONAL PROJECTION.
 *
 * The generator (generate.js) emits a *descriptive* game: prose rules + tags.
 * To self-test a game you have to be able to *play* it, and you cannot write a
 * bespoke engine for ~10^6 different games. So we project every generated game
 * down onto a common abstract economy — an MDP that captures the decision
 * skeleton shared by almost all board games:
 *
 *     state  = per-player { resources, victory points, passive production,
 *                           track position }, plus a turn/round clock
 *     moves  = a small menu of parameterised ACTIONS (gather / convert / build /
 *              claim / advance / score), each with a resource COST and a YIELD
 *     end    = a victory-point target, a race-to-the-line, or a round cap
 *     winner = most VP (or first across the line)
 *
 * The action costs and yields are themselves rolled from the seed, so some
 * games come out balanced and some come out degenerate (one dominant action,
 * unwinnable, never-ending, first-player-locked) — which is exactly what the
 * self-test downstream is built to detect.
 *
 * This is deliberately an *economic* projection: it models the resource/tempo/
 * scoring spine of a game, not its spatial tactics (blocking, adjacency,
 * hidden info). That is enough to catch the big degeneracies cheaply, and a
 * later rung can give spatial-heavy mechanics bespoke semantics. It is the same
 * move automated-game-design systems make when they reduce games to a common
 * ludeme model.
 *
 * Pure/deterministic from the spec. Attaches to LUDO.operational(g) -> model.
 * Used only by the backend self-test; the static showcase never calls it. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var L = NS.LUDO = NS.LUDO || {};

  function has(g, tag) { return !!g._tags[tag]; }

  // Build the abstract action menu from the assembled mechanics + economy.
  // Each action: { id, cost:{res:n}, yield:{ res:n, vp:n, track:n, prod:{res:n} }, ap:1 }
  function deriveActions(g, r) {
    var res = g.resources, r0 = res[0], r1 = res[1] || res[0], r2 = res[2] || r1;
    var A = [];
    var push = function (id, cost, yld) { A.push({ id: id, cost: cost || {}, yield: yld || {} }); };

    // 1) gather — the income floor. Always present, often two flavours.
    var ga = {}; ga[r0] = r.int(1, 3); push("gather-" + r0, {}, gathered(ga));
    if (res[1]) { var gb = {}; gb[r1] = r.int(1, 2); push("gather-" + r1, {}, gathered(gb)); }

    // 2) convert / refine — turn raw into refined (and a touch of vp).
    if ((has(g, "resource") || has(g, "engine")) && res[1]) {
      var c = {}; c[r0] = r.int(2, 3); var y = {}; y[r1] = r.int(1, 2);
      push("convert", c, withVp(gathered(y), r.int(0, 1)));
    }

    // 3) build — engine games: pay now for permanent passive production.
    if (has(g, "engine")) {
      var bc = {}; bc[r0] = r.int(2, 4); var prod = {}; prod[r.pick([r0, r1])] = 1;
      push("build", bc, { prod: prod, vp: r.int(0, 1) });
    }

    // 4) the victory engine — shaped by the win condition.
    if (g.win.id === "race-finish" || has(g, "race")) {
      var ac = {}; ac[r0] = r.int(1, 2); push("advance", ac, { track: 1 });
    }
    if (g.win.id === "network-complete" || has(g, "network") || has(g, "spatial")) {
      var cl = {}; cl[r0] = r.int(1, 3); if (res[1] && r.chance(0.5)) cl[r1] = 1;
      push("claim", cl, { vp: r.int(1, 3) });
    }
    if (has(g, "majority")) {
      var mc = {}; mc[r0] = r.int(1, 2); push("commit", mc, { vp: r.int(1, 2) });
    }
    if (has(g, "set") || has(g, "draft")) {
      var sc = {}; sc[r.pick([r0, r1, r2])] = r.int(2, 4); push("turn-in-set", sc, { vp: r.int(2, 4) });
    }
    // a general "score" sink so every game can convert holdings into points.
    if (has(g, "vp") || has(g, "market")) {
      var pc = {}; pc[r0] = r.int(2, 4); if (res[1]) pc[r1] = r.int(0, 2);
      push("score", pc, { vp: r.int(2, 5) });
    }

    // 5) occasionally a *dominated* or *too-good* action sneaks in — this is the
    //    raw material a degenerate game is made of, and the filter must catch it.
    if (r.chance(0.25)) { var tc = {}; tc[r0] = 1; push("quick-points", tc, { vp: r.int(0, 4) }); }

    // dedupe by id, guarantee at least a gather + a vp sink
    var ids = {}; A = A.filter(function (a) { if (ids[a.id]) return false; ids[a.id] = 1; return true; });
    if (!A.some(function (a) { return a.yield.vp || a.yield.track; })) {
      var fc = {}; fc[r0] = 2; push("score", fc, { vp: 3 });
    }
    return A;
  }
  function gathered(m) { return { res: m }; }
  function withVp(y, vp) { y.vp = (y.vp || 0) + vp; return y; }

  L.operational = function (g) {
    var r = L.prng.Rand("ludo::op::" + g.seed);
    var actions = deriveActions(g, r);
    var race = g.win.id === "race-finish" || (has(g, "race") && actions.some(function (a) { return a.yield.track; }));

    var model = {
      seed: g.seed,
      resources: g.resources,
      actions: actions,
      apPerTurn: r.int(1, 3),                 // action points per turn
      startRes: seedStart(g, r),              // a little starting stock
      end: race
        ? { type: "race", target: 8 + r.int(4, 16) }
        : { type: "vp", target: g.params.vpTarget, roundCap: Math.max(8, g.params.rounds) },
      hardTurnCap: 400,                        // guard for never-ending games
      // value weights the greedy agent uses (also handy for analysis)
      w: { vp: 10, track: race ? 11 : 2, prod: 14, res: 1.0 }
    };
    return model;
  };

  function seedStart(g, r) {
    var s = {}; g.resources.forEach(function (res, i) { s[res] = i < 2 ? r.int(1, 3) : 0; }); return s;
  }
})();
