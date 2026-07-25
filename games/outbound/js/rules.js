/* Outbound — the rules.
 *
 * A one-way convoy run across the Europan ice, with a crew you will not get
 * back. Twenty-fourth century, second decade of the war for the ocean below.
 *
 * This is The Ratchet rebuilt around a body. The Ratchet's mechanic was right —
 * every choice permanently removes an option, and the solver can name the move
 * that killed a run — but it presented a route as a table of rows with numbers,
 * so it read as a spreadsheet. The fix was not to hide information (Oregon
 * Trail's map is visible too); it was to make the resource a person.
 *
 * So the kit is a CREW. Sending someone out to handle trouble costs them, and
 * when they are used up you lose them. A tool you spend is now a name.
 *
 * Europa is what gives that cost a physical cause rather than an abstract one.
 * Everything outside the crawler's shielded core sits inside Jupiter's
 * radiation belt, so going out there is measured in dose. Two hard jobs is what
 * a person has in them. The generic version of this game called the stat
 * "strain" and had to hand-wave what it was; here it is simply what the ice
 * does to anybody who has to stand on it.
 *
 * THE STATE GRAPH IS STILL ACYCLIC, which is what keeps the viability solver
 * exact. Every action either advances a stage, or strictly spends fuel:
 *
 *   send   — advances (and adds strain)
 *   burn   — advances and spends fuel
 *   rest   — spends fuel, and is the ONLY action that lowers strain
 *
 * Rest is the dangerous one: lowering strain could cycle. It cannot, because it
 * always costs fuel, and the only thing that ever hands fuel back is salvage —
 * which is picked up on the way past a system, so it advances too. Order the
 * states by (stage ascending, fuel descending) and every action moves strictly
 * forward in that order: send and burn raise the stage, rest holds the stage
 * and drops the fuel. No state is ever revisited. The selftest checks this
 * exhaustively over whole reachable graphs rather than taking this paragraph's
 * word for it.
 *
 * Pure. No DOM, no clock, no Math.random. Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.OUTBOUND = NS.OUTBOUND || {};

  /* Read from config at call time, never captured — the sweep in test/sweep.mjs
     changes these between runs. restCost must stay > 0 or the state graph stops
     being acyclic and the solver runs for ever; the selftest asserts it. */
  function cfg() { return O.CFG; }

  /* Seven kinds of trouble on the ice. Each is handled by two of the six
     trades, so nobody aboard is a lock and key and everyone you spend was
     wanted somewhere else on the route.

     The pairs and the tolls are load-bearing — they are the coverage graph the
     difficulty is measured against, and every number in the README was measured
     on exactly this shape. Renaming trouble is free; re-pairing it is not. */
  var HAZARDS = {
    breach:     { id: "breach",     name: "A PRESSURE BREACH", needs: ["engineer", "rigger"],  toll: 3 },
    drift:      { id: "drift",      name: "NAVIGATION DRIFT",  needs: ["pilot", "engineer"],   toll: 2 },
    cordon:     { id: "cordon",     name: "A CORDON",          needs: ["signals", "medic"],    toll: 3 },
    hot:        { id: "hot",        name: "A HOT ZONE",        needs: ["medic", "engineer"],   toll: 2 },
    interdict:  { id: "interdict",  name: "AN INTERDICTION",   needs: ["gunner", "signals"],   toll: 3 },
    crevasse:   { id: "crevasse",   name: "A CREVASSE FIELD",  needs: ["rigger", "pilot"],     toll: 2 },
    dark:       { id: "dark",       name: "A DARK STRETCH",    needs: ["pilot", "gunner"],     toll: 1 },
  };

  var ROLES = {
    engineer: { id: "engineer", name: "ENGINEER", glyph: "\u2699" },
    pilot:    { id: "pilot",    name: "PILOT",    glyph: "\u2727" },
    medic:    { id: "medic",    name: "MEDIC",    glyph: "\u271a" },
    rigger:   { id: "rigger",   name: "RIGGER",   glyph: "\u2301" },
    signals:  { id: "signals",  name: "SIGNALS",  glyph: "\u25c8" },
    gunner:   { id: "gunner",   name: "GUNNER",   glyph: "\u2726" },
  };

  /* What the ice has taken out of somebody. The words matter more than the
     number — this is the whole reason the game has a crew instead of an
     inventory. Indexed by dose, with the last word always meaning gone, so the
     ladder stays correct if maxStrain moves. */
  var CONDITION = ["clean", "dosed", "failing", "gone"];

  function cloneState(s) {
    return {
      seed: s.seed, leg: s.leg,
      stages: s.stages,                 // never mutated — safe to share
      at: s.at,
      crew: s.crew.map(function (c) {
        return { id: c.id, name: c.name, role: c.role, strain: c.strain, alive: c.alive, lostAt: c.lostAt };
      }),
      fuel: s.fuel, maxFuel: s.maxFuel,
      phase: s.phase,
      history: s.history.slice(),
      log: s.log.slice(),
      events: [],
    };
  }

  /* Memo key. Where you are, what you can burn, and the condition of everyone
     aboard — nothing else can affect the future. */
  function keyOf(s) {
    var st = s.crew.map(function (c) { return c.alive ? c.strain : "x"; }).join("");
    return s.at + "|" + s.fuel + "|" + st;
  }

  function stageAt(s, i) { return s.stages[i === undefined ? s.at : i]; }
  /* What burning past this system costs. The hazard kind sets the baseline; a
     given system may be worse than its kind ("the burn here is longer than the
     chart said"), which is how the generator tightens a route without taking
     anyone off the crew or padding the road. Read the STAGE, never the kind. */
  function tollAt(s, i) {
    var st = stageAt(s, i);
    return st.toll === undefined ? HAZARDS[st.kind].toll : st.toll;
  }
  function crewById(s, id) {
    for (var i = 0; i < s.crew.length; i++) if (s.crew[i].id === id) return s.crew[i];
    return null;
  }
  function alive(s) { return s.crew.filter(function (c) { return c.alive; }); }
  /* Ids must be unique for the whole haul, and the dead are dropped between
     legs — so never derive one from the length of the roster. */
  function nextCrewId(s) {
    var max = 0;
    for (var i = 0; i < s.crew.length; i++) if (s.crew[i].id > max) max = s.crew[i].id;
    return max + 1;
  }
  function condition(c) {
    var max = cfg().maxStrain;
    if (c.strain >= max) return CONDITION[CONDITION.length - 1];
    // Spread the available words across however many sends a person has in them.
    var span = CONDITION.length - 1;                       // words before "gone"
    return CONDITION[Math.min(span - 1, Math.floor(c.strain * span / max))];
  }

  function emit(s, ev) { if (s.events) s.events.push(ev); }

  // -------------------------------------------------------------- actions --

  /* Everything you could do here. The solver walks exactly this list, so an
     action missing from it is not a move the game believes in. */
  function legalActions(s) {
    var out = [];
    if (s.phase !== "travel") return out;
    var haz = HAZARDS[stageAt(s).kind];
    var crew = alive(s), i;
    for (i = 0; i < crew.length; i++) {
      if (haz.needs.indexOf(crew[i].role) !== -1) out.push({ type: "send", crew: crew[i].id });
    }
    // Burning through is always available, even when it strands you.
    out.push({ type: "burn" });
    /* A layover relieves ONE person, not the ship.
       Relieving everybody for a flat price was the single worst number in the
       first build: at eight fuel a leg you could reset the whole crew twice a
       port, so strain never accumulated and the irreversibility the game is
       built on quietly stopped existing — careful play ran the full twelve legs
       and buried 0.3 people. Per-person, a layover is a real question: whose
       turn to sit one out, knowing the others carry it. */
    if (s.fuel >= cfg().restCost) {
      for (i = 0; i < crew.length; i++) {
        if (crew[i].strain > 0) out.push({ type: "rest", crew: crew[i].id });
      }
    }
    return out;
  }

  function actionKey(a) { return a.type + (a.crew ? ":" + a.crew : ""); }

  function advance(s, solvedBy) {
    var st = stageAt(s);
    if (solvedBy && st.reward) {
      if (st.reward.kind === "fuel") {
        s.fuel = Math.min(s.maxFuel, s.fuel + st.reward.amount);
        emit(s, { type: "salvage", amount: st.reward.amount, at: s.at });
      } else {
        var c = { id: nextCrewId(s), name: st.reward.name, role: st.reward.role, strain: 0, alive: true, lostAt: null };
        s.crew.push(c);
        emit(s, { type: "joined", crew: c, at: s.at });
      }
    }
    s.at++;
    if (s.at >= s.stages.length) {
      s.phase = "arrived";
      emit(s, { type: "arrived" });
    }
  }

  function applyAction(s, a) {
    if (s.phase !== "travel") return false;
    var st = stageAt(s);
    var haz = HAZARDS[st.kind];

    if (a.type === "send") {
      var c = crewById(s, a.crew);
      if (!c || !c.alive || haz.needs.indexOf(c.role) === -1) return false;
      c.strain++;
      s.history.push({ at: s.at, action: "send", crew: c.id });
      var lost = c.strain >= cfg().maxStrain;
      if (lost) {
        c.alive = false;
        c.lostAt = s.at;
        emit(s, { type: "lost", crew: c, at: s.at, hazard: st.kind });
        s.log.push({ at: s.at, text: c.name + " did not come back in at " + st.place + "." });
      } else {
        emit(s, { type: "send", crew: c, at: s.at, hazard: st.kind });
        s.log.push({ at: s.at, text: c.name + " handled " + haz.name.toLowerCase() + " at " + st.place + "." });
      }
      advance(s, true);
      return true;
    }

    if (a.type === "burn") {
      var toll = tollAt(s);
      s.fuel -= toll;
      s.history.push({ at: s.at, action: "burn", toll: toll });
      emit(s, { type: "burn", toll: toll, at: s.at });
      if (s.fuel < 0) {
        s.fuel = 0;
        s.phase = "lost";
        emit(s, { type: "stranded", at: s.at });
        s.log.push({ at: s.at, text: "The cells went flat at " + st.place + ". Nothing moves now." });
        return true;
      }
      s.log.push({ at: s.at, text: "Ran the cells hot and pushed past " + st.place + "." });
      advance(s, false);
      return true;
    }

    if (a.type === "rest") {
      // Every refusal must happen before anything is spent — a rejected action
      // that has already docked the tanks would corrupt the solver's search.
      if (s.fuel < cfg().restCost) return false;
      var m = crewById(s, a.crew);
      if (!m || !m.alive || m.strain <= 0) return false;
      s.fuel -= cfg().restCost;                      // strictly decreasing: no cycles
      m.strain -= cfg().restRelief;
      s.history.push({ at: s.at, action: "rest", crew: m.id });
      emit(s, { type: "rest", crew: m, at: s.at });
      s.log.push({ at: s.at, text: "Laid up short of " + st.place + ". " + m.name + " stood down into the core." });
      // Deliberately does NOT advance — a layover is a trade, not progress.
      return true;
    }

    return false;
  }

  /* Live views of the three tunables the rest of the codebase reads often.
     Getters, not copies, so a sweep that changes the config is seen everywhere. */
  Object.defineProperty(O, "MAX_STRAIN", { get: function () { return cfg().maxStrain; }, configurable: true });
  Object.defineProperty(O, "REST_COST", { get: function () { return cfg().restCost; }, configurable: true });
  Object.defineProperty(O, "REST_RELIEF", { get: function () { return cfg().restRelief; }, configurable: true });

  O.HAZARDS = HAZARDS;
  O.ROLES = ROLES;
  O.CONDITION = CONDITION;
  O.cloneState = cloneState;
  O.keyOf = keyOf;
  O.stageAt = stageAt;
  O.tollAt = tollAt;
  O.crewById = crewById;
  O.alive = alive;
  O.nextCrewId = nextCrewId;
  O.condition = condition;
  O.legalActions = legalActions;
  O.actionKey = actionKey;
  O.applyAction = applyAction;
})();
