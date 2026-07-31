/* The Ratchet — the rules.
 *
 * You cross a route once. Every tool in your kit is single-use, the whole route
 * is visible from the start, and there are never enough tools for every stage.
 * No clock, no opponent, nothing hidden. The pressure is entirely the future
 * shrinking behind each choice.
 *
 * The state graph is deliberately ACYCLIC: every action either advances the
 * stage or removes a tool, and nothing ever puts a tool back except arriving at
 * a stage that rewards one — which still advances. That is what lets the solver
 * in js/solve.js answer "does any future still complete this route" by plain
 * memoised search, which is the whole reason this game is shaped this way.
 *
 * Pure. No DOM, no clock, no Math.random. Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var R = NS.RATCHET = NS.RATCHET || {};

  var SCRAP_VALUE = 2;   // supply gained by burning a tool for parts

  /* Six tools. Each solves two kinds of obstacle, and every kind is solvable by
     two tools — so nothing is ever a lock-and-key, and every tool you spend was
     wanted somewhere else. */
  var TOOLS = {
    bridge:  { id: "bridge",  name: "BRIDGE",  glyph: "═", blurb: "spans a gap" },
    rope:    { id: "rope",    name: "ROPE",    glyph: "§", blurb: "down, or up" },
    charge:  { id: "charge",  name: "CHARGE",  glyph: "✳", blurb: "moves what won't move" },
    lantern: { id: "lantern", name: "LANTERN", glyph: "✦", blurb: "light" },
    coin:    { id: "coin",    name: "COIN",    glyph: "◉", blurb: "for people" },
    decoy:   { id: "decoy",   name: "DECOY",   glyph: "◇", blurb: "for things that follow" },
  };

  /* `toll` is what the stage costs in supply if you simply walk through it and
     take the damage. Solving with a tool costs the tool instead. */
  var OBSTACLES = {
    ravine:     { id: "ravine",     name: "THE RAVINE",     accepts: ["bridge", "rope"],    toll: 3 },
    flood:      { id: "flood",      name: "FLOODED ROAD",   accepts: ["bridge", "rope"],    toll: 2 },
    rockfall:   { id: "rockfall",   name: "ROCKFALL",       accepts: ["charge", "rope"],    toll: 2 },
    tunnel:     { id: "tunnel",     name: "THE LONG DARK",  accepts: ["lantern", "charge"], toll: 2 },
    whiteout:   { id: "whiteout",   name: "WHITEOUT",       accepts: ["lantern", "decoy"],  toll: 2 },
    checkpoint: { id: "checkpoint", name: "CHECKPOINT",     accepts: ["coin", "decoy"],     toll: 3 },
    sealed:     { id: "sealed",     name: "THE SEALED GATE",accepts: ["charge", "coin"],    toll: 3 },
    pack:       { id: "pack",       name: "THE PACK",       accepts: ["decoy", "charge"],   toll: 2 },
    scree:      { id: "scree",      name: "SCREE SLOPE",    accepts: ["rope", "bridge"],    toll: 1 },
    market:     { id: "market",     name: "THE MARKET",     accepts: ["coin", "lantern"],   toll: 2 },
  };

  // ------------------------------------------------------------------ kit --

  function kitCount(kit, id) { return kit[id] || 0; }
  function kitTotal(kit) {
    var n = 0;
    for (var k in kit) n += kit[k];
    return n;
  }
  function kitList(kit) {
    var out = [];
    for (var id in TOOLS) for (var i = 0; i < kitCount(kit, id); i++) out.push(id);
    return out;
  }
  /* Stable string form of the kit — used as part of the memo key, so the order
     of the keys must never depend on insertion order. */
  function kitKey(kit) {
    var parts = [];
    for (var id in TOOLS) parts.push(kitCount(kit, id));
    return parts.join("");
  }

  function cloneState(s) {
    var kit = {};
    for (var id in s.kit) kit[id] = s.kit[id];
    return {
      seed: s.seed, route: s.route,
      stages: s.stages,              // never mutated — safe to share
      at: s.at, kit: kit,
      supply: s.supply, maxSupply: s.maxSupply,
      phase: s.phase,
      history: s.history.slice(),
      events: [],
    };
  }

  /* Memo key. Everything the future depends on and nothing else: where you are,
     what you carry, what you can absorb. History and events are deliberately
     excluded — two different pasts that leave you in the same position have
     exactly the same future. */
  function keyOf(s) { return s.at + "|" + s.supply + "|" + kitKey(s.kit); }

  // -------------------------------------------------------------- actions --

  function stageAt(s, i) { return s.stages[i === undefined ? s.at : i]; }

  /* Every legal action from here. The solver walks exactly this list, so
     anything missing from it is not a move the game believes in. */
  function legalActions(s) {
    var out = [];
    if (s.phase !== "travel") return out;
    var st = stageAt(s), i;
    var obs = OBSTACLES[st.kind];
    for (i = 0; i < obs.accepts.length; i++) {
      var t = obs.accepts[i];
      if (kitCount(s.kit, t) > 0) out.push({ type: "use", tool: t });
    }
    // Walking through is ALWAYS available, even when it kills you. Being able
    // to choose the death is different from being trapped into it, and the
    // post-mortem depends on the distinction.
    out.push({ type: "pay" });
    var carried = kitList(s.kit), seen = {};
    for (i = 0; i < carried.length; i++) {
      if (seen[carried[i]]) continue;
      seen[carried[i]] = true;
      out.push({ type: "scrap", tool: carried[i] });
    }
    return out;
  }

  function actionKey(a) { return a.type + (a.tool ? ":" + a.tool : ""); }

  function emit(s, ev) { if (s.events) s.events.push(ev); }

  function advance(s, solved) {
    var st = stageAt(s);
    // A reward is for *solving*, never for surviving. That is what makes a
    // stage worth spending on rather than merely surviving.
    if (solved && st.reward) {
      s.kit[st.reward] = kitCount(s.kit, st.reward) + 1;
      emit(s, { type: "reward", tool: st.reward, at: s.at });
    }
    s.at++;
    if (s.at >= s.stages.length) {
      s.phase = "won";
      emit(s, { type: "arrived" });
    }
  }

  function applyAction(s, a) {
    if (s.phase !== "travel") return false;
    var st = stageAt(s);
    var obs = OBSTACLES[st.kind];

    if (a.type === "use") {
      if (kitCount(s.kit, a.tool) <= 0) return false;
      if (obs.accepts.indexOf(a.tool) === -1) return false;
      s.kit[a.tool]--;
      s.history.push({ at: s.at, action: "use", tool: a.tool });
      emit(s, { type: "use", tool: a.tool, at: s.at });
      advance(s, true);
      return true;
    }

    if (a.type === "pay") {
      s.supply -= st.toll;
      s.history.push({ at: s.at, action: "pay", toll: st.toll });
      emit(s, { type: "pay", toll: st.toll, at: s.at });
      if (s.supply < 0) {
        s.supply = 0;
        s.phase = "lost";
        emit(s, { type: "stranded", at: s.at });
        return true;
      }
      advance(s, false);
      return true;
    }

    if (a.type === "scrap") {
      if (kitCount(s.kit, a.tool) <= 0) return false;
      s.kit[a.tool]--;
      var before = s.supply;
      s.supply = Math.min(s.maxSupply, s.supply + SCRAP_VALUE);
      s.history.push({ at: s.at, action: "scrap", tool: a.tool, gained: s.supply - before });
      emit(s, { type: "scrap", tool: a.tool, gained: s.supply - before, at: s.at });
      // Deliberately does NOT advance. Scrapping is a trade, not progress.
      return true;
    }

    return false;
  }

  /* Describe what an action would do, for the UI. Kept here rather than in the
     view so the label and the rule can never disagree. */
  function describeAction(s, a) {
    var st = stageAt(s);
    if (a.type === "use") return "Spend " + TOOLS[a.tool].name;
    if (a.type === "pay") return "Push through · −" + st.toll + " supply";
    if (a.type === "scrap") return "Scrap " + TOOLS[a.tool].name + " · +" + SCRAP_VALUE + " supply";
    return "";
  }

  R.SCRAP_VALUE = SCRAP_VALUE;
  R.TOOLS = TOOLS;
  R.OBSTACLES = OBSTACLES;
  R.kitCount = kitCount;
  R.kitTotal = kitTotal;
  R.kitList = kitList;
  R.kitKey = kitKey;
  R.cloneState = cloneState;
  R.keyOf = keyOf;
  R.stageAt = stageAt;
  R.legalActions = legalActions;
  R.actionKey = actionKey;
  R.applyAction = applyAction;
  R.describeAction = describeAction;
})();
