/* The Ludographer — THE ENGINE. Catalogue number in, whole board game out.

   Given a number n this rolls a deterministic, *coherent* board game: a theme,
   a board topology, a core engine mechanic, a legal handful of secondaries that
   actually fit it, the components those mechanics imply, a win condition the
   assembled set can be driven toward, a turn structure, a setup, a generated
   rulebook, a designer persona, and one deliberately "shaken-loose" twist
   (borges/'s propp.absent, re-aimed at game design).

   Coherence is structural, not luck: the generator is a constraint walk over
   lexicon.js. It can only ever express games whose parts fit — which is the
   whole v1 playability claim. (A bot self-playtest that rejects *degenerate*
   but legal games is the phase-2 upgrade, and it pairs with actually playing
   them.)

   Fully determined by n. Attaches to LUDO.generate(n). Works in node so the
   generator can be smoke-tested off-page (see test/smoke.mjs). */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var L = NS.LUDO = NS.LUDO || {};
  var lex = L.lex;

  var WIN_TAGS = ["vp", "majority", "race", "network", "set", "elimination", "market"];
  function isStandalone(m) { return m.provides.some(function (t) { return WIN_TAGS.indexOf(t) >= 0; }); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // ── twists: "what we shook loose." Each has a precond against the assembled
  //    spec so the subversion stays coherent with the game it lands on. ───────
  var TWISTS = [
    { when: function (g) { return g.win.id === "vp-threshold"; },
      text: function (g) { return "Scoring is inverted: the player with the *fewest* " + g.t.vp + " at game-end wins. Every grasping instinct you bring from other games becomes a trap, and a generous-looking gift is usually a knife."; } },
    { when: function (g) { return g.has("market"); },
      text: function (g) { return "The currency you spend is also the currency you are scored on — there is no separate money. Winning a lot makes you poorer in the only number that matters, so every purchase is a small act of self-sabotage you have to make pay."; } },
    { when: function (g) { return g.has("elimination"); },
      text: function (g) { return "One player, drawn in secret at setup, wins only if everyone else loses. Their " + g.t.piece + "s look like yours; their help is the most dangerous thing on the board."; } },
    { when: function (g) { return g.has("action") || g.win.id === "race-finish"; },
      text: function (g) { return "Turn order is not fixed — it is re-auctioned every round, and going *last* is sometimes worth paying through the nose for. The cheapest seat is rarely the best one."; } },
    { when: function (g) { return g.has("spatial"); },
      text: function (g) { return "The board is consumed as you play: spaces used are removed for good, so the playable space strictly shrinks toward a forced, accelerating ending. Hesitation is its own kind of loss."; } },
    { when: function (g) { return true; },
      text: function (g) { return "Information is fully open — no hidden hand, no fog, no secret anything. Every defeat is one you could have seen coming, which makes the table very quiet and very mean."; } },
    { when: function (g) { return true; },
      text: function (g) { return "Ties are deliberately never broken. A shared victory is a real, common, intended outcome, and the whole design nudges players into the temporary alliances that force one."; } },
    { when: function (g) { return g.has("vp"); },
      text: function (g) { return "Your score is hidden from *you* — you bank " + g.t.vp + " face-down and may never count your own pile until the end. You play the whole game on a feel for where you stand."; } }
  ];

  // ── action-menu fragments, derived from the assembled mechanics. ───────────
  function actionMenu(g) {
    var acts = [];
    var add = function (name, body) { acts.push({ name: name, body: body }); };
    if (g.has("resource")) add("Gather", "Take " + g.r0 + " (and sometimes " + (g.r1 || "a second good") + ") from the board or your engine.");
    if (g.has("action")) add("Deploy", "Commit a " + g.t.worker + " to an open action space and resolve it.");
    if (g.has("network") || g.topology.id === "graph") add("Claim a route", "Spend to claim an edge and extend your " + g.t.route + " network.");
    if (g.has("spatial") && !g.has("network")) add("Place", "Add a " + g.t.piece + " to the board where the rules allow.");
    if (g.has("movement")) add("Move", "Advance a " + g.t.piece + ", paying for each step beyond the first.");
    if (g.has("market")) add("Trade", "Buy or sell against the market; flooding a good moves its price.");
    if (g.has("set") || g.has("draft") || g.has("hand")) add("Acquire", "Draw or draft a " + g.t.card + " toward the collection you are building.");
    if (g.has("vp") && acts.length < 3) add("Score", "Cash in what you have built for " + g.t.vp + " — but you can only do this so often.");
    if (acts.length === 0) add("Act", "Take the single action your role allows this turn.");
    return acts.slice(0, 5);
  }

  function turnStructure(g) {
    if (g.has("tempo") || g.byId("simultaneous-selection")) return { kind: "simultaneous", text: "Each round, all players secretly choose an action, then reveal together and resolve in a fixed order." };
    if (g.topology.id === "rondel" || g.byId("rondel-actions")) return { kind: "rondel", text: "On your turn, walk your marker forward around the rondel and take the action it lands on." };
    if (g.byId("worker-placement")) return { kind: "placement", text: "Players take turns placing one " + g.t.worker + " at a time until all are deployed; then the round resolves and they return." };
    if (g.has("action")) return { kind: "action-points", text: "On your turn you have an action budget; spend it across the action menu in any order, then play passes left." };
    return { kind: "turn-based", text: "Players take full turns clockwise. On your turn, take one action from the menu below, then play passes left." };
  }

  function makeSetup(g) {
    var s = [];
    s.push("Lay out " + g.topology.name.toLowerCase() + " — " + g.topology.blurb.charAt(0).toLowerCase() + g.topology.blurb.slice(1));
    s.push("Seed the supply of " + g.resources.slice(0, 3).join(", ") + (g.resources.length > 3 ? " and the rest" : "") + " within reach of all players.");
    if (g.has("vp")) s.push("Set every player's " + g.t.vp + " marker to zero on the score track.");
    s.push("Give each player their starting " + (g.has("action") ? g.t.worker + "s" : g.t.piece + "s") + " and a reference card.");
    if (g.byId("variable-powers")) s.push("Deal each player one secret faction power; resolve any start-of-game text.");
    if (g.byId("hidden-objectives")) s.push("Deal each player their hidden objective(s); keep them concealed until the end.");
    s.push("Decide the first player at random. Play proceeds " + (turnStructure(g).kind === "simultaneous" ? "simultaneously each round" : "clockwise") + ".");
    return s;
  }

  function title(rand, theme) {
    var w = theme.words;
    var patterns = [
      function () { return rand.pick(w.adj) + " " + rand.pick(w.noun); },
      function () { return cap(rand.pick(theme.resources)) + " & " + rand.pick(w.noun); },
      function () { return "The " + rand.pick(w.adj) + " " + rand.pick(w.noun); },
      function () { return rand.pick(w.noun) + " of " + rand.pick(w.place); },
      function () { return rand.pick(w.verb) + "!"; },
      function () { return rand.pick(w.agent) + "s of " + rand.pick(w.place); }
    ];
    return rand.pick(patterns)();
  }

  function designer(rand) {
    var st = lex.STUDIO, dz = lex.DESIGNER;
    var studio = rand.pick(st.fore) + rand.pick(st.aft) + " " + rand.pick(st.kind);
    var person = rand.pick(dz.first) + " " + rand.pick(dz.last);
    return { studio: studio, person: person, year: 1990 + rand.int(0, 36) };
  }

  // ── the engine ─────────────────────────────────────────────────────────────
  L.generate = function generate(n) {
    n = Math.max(1, Math.floor(Number(n) || 1));
    var rand = lex.prng ? lex.prng.Rand("ludo::" + n) : L.prng.Rand("ludo::" + n);

    var theme = rand.pick(lex.THEMES);

    // resources (the economy): an ordered subset of the theme's palette.
    var rk = Math.min(theme.resources.length, rand.int(3, 6));
    var resources = rand.sample(theme.resources, rk);

    // the spec, built incrementally so mechanic.rule(g) can read it.
    var g = {
      seed: n,
      theme: { id: theme.id, name: theme.name, setting: theme.setting, pal: theme.pal },
      t: theme.t,
      resources: resources,
      r0: resources[0],
      r1: resources[1] || null,
      mechIds: [],
      params: {}
    };
    g.has = function (tag) { return g._tags && g._tags[tag]; };
    g.byId = function (id) { return g.mechIds.indexOf(id) >= 0; };
    g._tags = {};
    function grant(m) {
      g.mechIds.push(m.id);
      m.provides.forEach(function (t) { g._tags[t] = true; });
    }

    // 1) core: a standalone core (one whose provides reach a win tag).
    var cores = lex.MECH.filter(function (m) { return m.family === "core" && isStandalone(m); });
    var primary = rand.pickWeighted(cores, function (m) { return 6 - Math.min(5, m.weight); });
    grant(primary);

    // 2) topology compatible with the core.
    var topoId = rand.pick(primary.topos.indexOf("*") >= 0 ? lex.TOPOLOGIES.map(function (x) { return x.id; }) : primary.topos);
    var topo = lex.topoById(topoId);
    g.topology = { id: topo.id, name: topo.name, short: topo.short, blurb: topo.blurb };
    g.params = topo.params(rand.fork("topo"));

    // 3) maybe a second, hybrid core (compatible) — keeps some games chunky.
    if (rand.chance(0.28)) {
      var hybridPool = lex.MECH.filter(function (m) {
        return m.family === "core" && m.id !== primary.id &&
          (m.topos.indexOf("*") >= 0 || m.topos.indexOf(topo.id) >= 0) &&
          !conflicts(m, g.mechIds) && reqMet(m, g._tags);
      });
      if (hybridPool.length) grant(rand.pick(hybridPool));
    }

    // 4) secondaries (spice + economy) within a complexity budget.
    var budget = rand.int(5, 9);
    function curWeight() { return g.mechIds.reduce(function (a, id) { return a + lex.byId(id).weight; }, 0); }
    var spice = lex.MECH.filter(function (m) { return m.family === "spice" || m.family === "economy"; });
    var want = rand.int(1, 3);
    var guard = 0;
    while (want > 0 && guard++ < 30) {
      var pool = spice.filter(function (m) {
        return g.mechIds.indexOf(m.id) < 0 &&
          (m.topos.indexOf("*") >= 0 || m.topos.indexOf(topo.id) >= 0) &&
          !conflicts(m, g.mechIds) && reqMet(m, g._tags) &&
          curWeight() + m.weight <= budget + 1;
      });
      if (!pool.length) break;
      grant(rand.pick(pool));
      want--;
    }

    // resolve mechanic objects (in a stable, readable order: cores then rest).
    g.mechanics = g.mechIds.map(function (id) { return lex.byId(id); })
      .sort(function (a, b) {
        var fam = { core: 0, economy: 1, spice: 2 };
        return (fam[a.family] - fam[b.family]) || (b.weight - a.weight);
      })
      .map(function (m) { return { id: m.id, name: m.name, family: m.family, weight: m.weight, desc: m.desc, rule: m.rule(g) }; });

    // 5) win condition: any whose required tag is present, weighted.
    var winPool = lex.WINS.filter(function (w) { return g._tags[w.needs]; });
    var win = rand.pickWeighted(winPool, function (w) { return w.weight; });
    g.params.vpTarget = (win.id === "economic" ? 12 + 4 * rand.int(2, 5) : 8 + 2 * rand.int(2, 8));
    g.params.rounds = rand.int(5, 10);
    g.win = { id: win.id, name: win.name, describe: win.describe(g) };

    // 6) components: union over the set + topology base + score track + book.
    var compIds = {};
    if (g._tags.spatial || ["square", "hex", "graph", "regions", "track", "modular"].indexOf(topo.id) >= 0) compIds["board"] = 1;
    g.mechIds.forEach(function (id) { (lex.byId(id).comps || []).forEach(function (c) { compIds[c] = 1; }); });
    if (g._tags.vp) compIds["score-track"] = compIds["score-track"] || 0; // pseudo
    var components = Object.keys(compIds).map(function (c) {
      var meta = lex.COMPONENTS[c] || [c.replace(/-/g, " "), "token"];
      return { id: c, name: meta[0], icon: meta[1], qty: qtyFor(c, g, rand) };
    });
    if (g._tags.vp) components.push({ id: "score-track", name: "a score track", icon: "board", qty: 1 });
    components.push({ id: "rulebook", name: "this rulebook", icon: "book", qty: 1 });
    g.components = dedupeBy(components, "id");

    // 7) players, turn, setup, complexity.
    g.players = playerCount(g, rand);
    g.turn = turnStructure(g);
    g.actions = actionMenu(g);
    g.setup = makeSetup(g);
    var rawW = g.mechanics.reduce(function (a, m) { return a + m.weight; }, 0);
    g.complexity = Math.max(1.2, Math.min(5, +(1 + rawW * 0.42).toFixed(1)));
    g.playtime = Math.round((15 + rawW * 6) * (0.7 + g.players.max * 0.12) / 5) * 5;

    // 8) the twist, designer, naming, tagline.
    var tw = TWISTS.filter(function (t) { return t.when(g); });
    g.twist = (tw.length ? rand.pick(tw) : TWISTS[5]).text(g);
    var d = designer(rand);
    g.designer = d;
    g.title = title(rand, theme);
    g.subtitle = subtitle(g, rand);
    g.tagline = tagline(g);

    return g;
  };

  // ── helpers ────────────────────────────────────────────────────────────────
  function conflicts(m, ids) {
    for (var i = 0; i < ids.length; i++) {
      if ((m.conflicts || []).indexOf(ids[i]) >= 0) return true;
      var other = lex.byId(ids[i]);
      if ((other.conflicts || []).indexOf(m.id) >= 0) return true;
    }
    return false;
  }
  function reqMet(m, tags) {
    if (!m.requires || !m.requires.length) return true;
    return m.requires.some(function (t) { return !!tags[t]; });
  }
  function dedupeBy(arr, key) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (!seen[x[key]]) { seen[x[key]] = 1; out.push(x); } });
    return out;
  }
  function qtyFor(c, g, rand) {
    var map = {
      "worker-meeples": 3 * g.playersCapGuess || 12, "resource-cubes": 60, "resource-tokens": 60,
      "cards": 54, "dev-cards": 60, "tiles": (g.params.tilePool || 64), "influence-discs": 40,
      "pawns": 8, "army-units": 48, "stones": 60, "route-tokens": 45, "claim-tokens": 45,
      "money-tokens": 80, "shares": 40, "walls": 40, "goods-tokens": 40, "combat-dice": 5,
      "lots": 30, "objective-cards": 24, "power-cards": 12, "select-cards": 24, "action-cards": 30,
      "bonus-cards": 12, "route-cards": 36, "risk-dice": 4
    };
    return map[c] || 1;
  }
  function playerCount(g, rand) {
    var min = 2, max = rand.pick([4, 4, 5, 6]);
    if (g.byId("connection")) { min = 2; max = 2; }
    if (g.byId("auction") || g.byId("stock-influence")) min = Math.max(min, 3);
    if (g.byId("area-movement")) { min = 2; max = Math.max(max, 5); }
    if (g.byId("racing")) min = 2;
    if (max < min) max = min;
    g.playersCapGuess = max;
    return { min: min, max: max, best: Math.min(max, min + 1 + (rand.f() < 0.5 ? 1 : 0)) };
  }
  function subtitle(g, rand) {
    var core = g.mechanics[0].name.toLowerCase();
    var picks = [
      "a game of " + core + " for " + g.players.min + "–" + g.players.max + " players",
      g.players.min + "–" + g.players.max + " players · " + g.playtime + " min · weight " + g.complexity,
      "a " + g.theme.name.toLowerCase() + " game of " + core
    ];
    return rand.pick(picks);
  }
  function tagline(g) {
    return cap(g.theme.setting) + " You win by " + g.win.name.toLowerCase() + ".";
  }

  // expose helpers for tests / renderer
  L.engine = { isStandalone: isStandalone, TWISTS: TWISTS };
})();
