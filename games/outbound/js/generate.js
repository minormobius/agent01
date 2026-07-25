/* Outbound — the route generator and the lexicon.
 *
 * (seed, leg) -> a haul. The route, the hazards, the crew you set out with and
 * the words the log uses all come from here and nothing after.
 *
 * The lexicon is not decoration. The Ratchet's content was
 * "SCREE SLOPE · toll 2 · solved by ROPE or BRIDGE", which is a spec line, and
 * a page of spec lines is a spreadsheet however you style it. The same
 * information written as a place with a name and a sentence about it is a
 * journey. The mechanics underneath are identical.
 *
 * The contract, inherited from The Ratchet: a haul handed to a player must be
 * finishable with the fuel and crew they actually arrive with.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.OUTBOUND = NS.OUTBOUND || {};

  function cfg() { return O.CFG; }

  // ---------------------------------------------------------- the lexicon --

  var SURNAMES = ["Vesk", "Aldana", "Corrow", "Imbe", "Sarto", "Halloway", "Nkemi",
    "Petrov", "Quist", "Rhee", "Tan", "Okonkwo", "Varga", "Lindqvist", "Abara", "Cruz"];
  var GIVEN = ["Mira", "Tomas", "Sable", "Idris", "June", "Kestrel", "Ana", "Wren",
    "Oduya", "Sol", "Bex", "Nadia", "Ruy", "Ines", "Cass", "Emet"];

  var PLACES = ["Ashfall", "Kepler's Grave", "The Verge", "Tannhauser Shoal", "Cold Harbour",
    "Meridian Drift", "The Long Quiet", "Barrow Station", "Hesper", "Ninety-Nine",
    "The Shelf", "Ossuary", "Pale Reach", "Cinder", "Tallow Gate", "The Slow Mile"];

  /* One line per hazard kind, in the register of a ship's log. Written so the
     mechanical fact (what it costs, who can handle it) is legible from the
     fiction rather than from a table. */
  var PROSE = {
    breach: [
      "A seam opens on the dorsal spine. You can hear it.",
      "Something small and very fast went through the hull and out the other side.",
      "The pressure alarm has been going for nine minutes.",
    ],
    drift: [
      "The stars do not match the chart. They have not matched for some time.",
      "Dead reckoning only, and the numbers are drifting apart.",
      "The beacon here stopped transmitting a long while ago.",
    ],
    customs: [
      "A cutter puts itself across your bow and asks for papers.",
      "Someone at the gate wants a manifest you do not have.",
      "The station wants a fee, and then another fee.",
    ],
    fever: [
      "Two of the crew are sweating through their bunks.",
      "Whatever came aboard at the last stop is aboard still.",
      "The water tastes wrong and everyone knows it.",
    ],
    pirates: [
      "Three contacts, no transponders, closing without hurry.",
      "They have been matching your burn for an hour. They are not lost.",
      "A voice on the open channel, very friendly, asking what you carry.",
    ],
    debris: [
      "Someone else's ship, spread across four hundred kilometres.",
      "The field ahead is old wreckage, and it is turning.",
      "Rock and metal, and no clean line through it.",
    ],
    silence: [
      "No traffic. No beacons. Nothing on any band.",
      "The quiet out here has a texture to it.",
      "Nobody has come this way in a while, and you can tell.",
    ],
  };

  function legPlan(leg) {
    var c = cfg();
    return {
      stages: Math.min(c.maxStages, c.baseStages + Math.floor(leg * c.stagesPerLeg)),
      // The number of hazards you cannot possibly crew — the engine of the game,
      // because it forces you to decide what to simply absorb.
      deficit: Math.min(c.maxDeficit, c.baseDeficit + Math.floor(leg * c.deficitPerLeg)),
      rewards: leg >= 2 ? 1 + (leg >= 5 ? 1 : 0) : 0,
    };
  }


  function buildLeg(seed, leg, fuel, maxFuel, carried) {
    var rng = O.rngFor(seed, leg);
    var plan = legPlan(leg);
    var kinds = Object.keys(O.HAZARDS);
    var i;

    // --- the road ---------------------------------------------------------
    var placeNames = rng.shuffled(PLACES);
    var made = 0;
    /* One system. Kept as a factory because the tightening pass below adds more
       of them, and a system invented later has to be indistinguishable from one
       invented now. */
    function makeStage(after) {
      var kind, guard = 0;
      do { kind = rng.pick(kinds); } while (kind === after && guard++ < 8);
      var st = {
        kind: kind,
        place: placeNames[made % placeNames.length],
        prose: rng.pick(PROSE[kind]),
        toll: O.HAZARDS[kind].toll,
        reward: null,
      };
      made++;
      return st;
    }

    var stages = [];
    var last = null;
    for (i = 0; i < plan.stages; i++) {
      var st0 = makeStage(last);
      last = st0.kind;
      stages.push(st0);
    }

    // --- what you find out there -----------------------------------------
    var mid = [];
    for (i = 1; i < stages.length - 1; i++) mid.push(i);
    var spots = rng.shuffled(mid).slice(0, plan.rewards);
    for (i = 0; i < spots.length; i++) {
      if (rng.chance(0.45)) {
        stages[spots[i]].reward = { kind: "fuel", amount: rng.int(3, 5) };
      } else {
        stages[spots[i]].reward = {
          kind: "crew",
          name: rng.pick(GIVEN) + " " + rng.pick(SURNAMES),
          role: rng.pick(neededRoles(stages, spots[i] + 1)),
        };
      }
    }

    // --- who is aboard ----------------------------------------------------
    // Carried crew keep their strain: this is a haul, not a series of levels.
    var crew;
    if (carried && carried.length) {
      crew = carried.map(function (c) {
        return { id: c.id, name: c.name, role: c.role, strain: c.strain, alive: c.alive, lostAt: null };
      }).filter(function (c) { return c.alive; });
    } else {
      /* Five hands, but only FOUR of the six disciplines.

         The four is what makes `deficit` plantable — there is always trouble
         out there nobody aboard is trained for. The five is what makes most
         systems an actual choice rather than a queue: with two disciplines
         qualified for each hazard and someone doubled up, you are usually
         picking WHICH person to wear out, not whether to. A crew of four ran
         at 2.3 options a system, which is a prompt, not a decision. */
      var pool = rng.shuffled(neededRoles(stages, 0));
      var roles = [];
      var want = cfg().crewRoles;
      for (i = 0; i < pool.length && roles.length < want; i++) {
        if (roles.indexOf(pool[i]) === -1) roles.push(pool[i]);
      }
      while (roles.length < want) roles.push(rng.pick(Object.keys(O.ROLES)));
      while (roles.length < cfg().crewSize) roles.push(rng.pick(roles));
      crew = roles.map(function (role, n) {
        return {
          id: n + 1, name: rng.pick(GIVEN) + " " + rng.pick(SURNAMES),
          role: role, strain: 0, alive: true, lostAt: null,
        };
      });
    }

    var s = {
      seed: String(seed), leg: leg,
      stages: stages, at: 0, crew: crew,
      fuel: fuel, maxFuel: maxFuel,
      phase: "travel", history: [], log: [], events: [],
    };
    applyDeficit(s, rng, plan.deficit);
    return makeFinishable(s, rng, makeStage, plan);
  }

  /* The difficulty knob, and the only one that matters.

     A route this crew can meet everywhere is not a decision, it is a queue —
     you send the right person each time and nothing is ever weighed. So a
     planned number of systems are re-rolled to trouble that NOBODY aboard is
     trained for. Those are the ones where you have to choose between fuel you
     will want later and a person you will want later, and there is no third
     answer.

     Never at the first system: the opening should teach the verb, not spring
     the trap. */
  function applyDeficit(s, rng, want) {
    var b = blindness(s);
    if (!b.kinds.length) return 0;   // a broad enough crew meets everything — leave it
    var have = b.count;
    while (have < want && plantBlind(s, rng)) have++;
    return have;
  }

  /* What this crew cannot meet: which kinds of trouble, and how many systems on
     the route are already one of them. */
  function blindness(s) {
    var aboard = {};
    s.crew.forEach(function (c) { if (c.alive) aboard[c.role] = true; });
    var covers = function (kind) {
      return O.HAZARDS[kind].needs.some(function (r) { return aboard[r]; });
    };
    var kinds = Object.keys(O.HAZARDS).filter(function (k) { return !covers(k); });
    var count = 0;
    for (var i = 0; i < s.stages.length; i++) if (!covers(s.stages[i].kind)) count++;
    return { covers: covers, kinds: kinds, count: count };
  }

  /* Re-roll one coverable system into trouble nobody aboard is trained for.
     Never the first: the opening should teach the verb, not spring the trap.
     Refuses if it would make the haul unfinishable, and reports whether it
     managed it, so callers can fall back to a cruder lever. */
  function plantBlind(s, rng) {
    var b = blindness(s);
    if (!b.kinds.length) return false;
    /* A road that is mostly trouble nobody can meet stops being a road and
       becomes a corridor of forced burns — and it reads as monotonous, every
       row carrying the same red sentence. Cap it as a share of the run. */
    if (b.count >= Math.ceil(s.stages.length * cfg().maxBlindShare)) return false;
    var spots = [], i;
    for (i = 1; i < s.stages.length; i++) if (b.covers(s.stages[i].kind)) spots.push(i);
    spots = rng.shuffled(spots);
    for (i = 0; i < spots.length; i++) {
      var st = s.stages[spots[i]];
      var kind = rng.pick(b.kinds);
      var was = { kind: st.kind, toll: st.toll, prose: st.prose };
      st.kind = kind;
      st.toll = O.HAZARDS[kind].toll;
      st.prose = rng.pick(PROSE[kind]);
      if (O.rate(s).completable) return true;
      st.kind = was.kind; st.toll = was.toll; st.prose = was.prose;
    }
    return false;
  }

  /* Make one system a longer burn than its kind suggests.

     The best of the three tightening levers, because it is the only one that
     costs the player nothing they can see: the road is no longer, the crew is
     untouched, and one stretch is simply more expensive to buy your way past.
     Capped, because a toll nobody could ever pay is just a system with the burn
     button greyed out. */
  function raiseToll(s, rng) {
    var spots = [], i;
    for (i = 1; i < s.stages.length; i++) {
      if (s.stages[i].toll < cfg().maxToll) spots.push(i);
    }
    spots = rng.shuffled(spots);
    for (i = 0; i < spots.length; i++) {
      var st = s.stages[spots[i]];
      st.toll++;
      if (O.rate(s).completable) return true;
      st.toll--;
    }
    return false;
  }

  /* Take back something the route was going to give you. The last lever before
     padding the road, and the only one that can tighten a leg whose systems are
     already as expensive and as uncrewable as they can be made. */
  function dropReward(s) {
    for (var i = s.stages.length - 1; i >= 0; i--) {
      var st = s.stages[i];
      if (!st.reward) continue;
      var was = st.reward;
      st.reward = null;
      if (O.rate(s).completable) return true;
      st.reward = was;
    }
    return false;
  }

  /* Every discipline this route has a use for, listed once per hazard it could
     handle — so a route full of breaches draws engineers more often. */
  function neededRoles(stages, from) {
    var out = [];
    for (var i = from; i < stages.length; i++) {
      var needs = O.HAZARDS[stages[i].kind].needs;
      for (var j = 0; j < needs.length; j++) out.push(needs[j]);
    }
    return out.length ? out : Object.keys(O.ROLES);
  }

  /* Make the haul finishable, then make it interesting.

     Handing someone an impossible route breaks the only promise this game
     makes — that the haul was survivable when it started, so losing it was
     something you did.

     WHICH repair is used matters more here than it did in The Ratchet, and this
     is the single place the two games genuinely differ. The Ratchet repaired a
     bad roll by granting another tool, which was free because tools were a
     per-route resource anyway. Doing the same here — signing on another hand —
     quietly refills the ONE resource the whole game is about. It measured
     exactly as badly as that sounds: perfect play buried 23 people across a
     twelve-leg haul and never once suffered for it, because every dead crewman
     was replaced at the next port by the generator.

     So the repairs are ordered by what they cost the player later. Fuel is
     bought at every port. Distance is just distance. People are not replaceable
     and signing one on is the last resort, reached only when a haul would
     otherwise be dead on arrival. */
  function makeFinishable(s, rng, makeStage, plan) {
    var attempt;
    for (attempt = 0; attempt < 30 && !O.rate(s).completable; attempt++) {
      if (s.fuel < s.maxFuel) {
        s.fuel = Math.min(s.maxFuel, s.fuel + 2);       // the port had cheap fuel
      } else if (s.stages.length > 3) {
        s.stages = s.stages.slice(0, -1);               // a shorter run than you hoped
      } else {
        s.crew.push({                                   // last resort — see above
          id: O.nextCrewId(s),
          name: rng.pick(GIVEN) + " " + rng.pick(SURNAMES),
          role: rng.pick(neededRoles(s.stages, s.at)),
          strain: 0, alive: true, lostAt: null,
        });
      }
    }

    /* A route where every option works asks nothing.

       Tighten against the NARROWEST choice on a perfect crossing, not the
       opening one. Generating against the opening is what produced hauls where
       63% of every decision had no wrong answer: the first system is meant to
       be forgiving, so a generator that only looks there declares the job done
       and hands over a corridor.

       Two levers, cheapest first. Planting one more system nobody aboard can
       meet costs the player nothing in patience and forces a real trade; making
       the run longer costs them a page of clicking, so it is the fallback. */
    for (var tighten = 0; tighten < 14; tighten++) {
      if (O.narrowest(s) <= cfg().loose) break;
      if (plantBlind(s, rng)) continue;
      if (raiseToll(s, rng)) continue;
      if (dropReward(s)) continue;
      // Lengthening is last and capped: a haul that has to be padded four
      // systems past its plan to find a question is not going to find one at
      // five, and the player pays for every extra in clicks.
      if (s.stages.length >= plan.stages + cfg().maxPadding) break;
      var probe = O.cloneState(s);
      probe.stages = s.stages.concat([makeStage(s.stages[s.stages.length - 1].kind)]);
      if (!O.rate(probe).completable) break;
      s.stages = probe.stages;
    }

    s.crew = s.crew.filter(function (c) { return c.alive; });
    return s;
  }

  function newGame(seed) { return buildLeg(seed, 1, cfg().startFuel, cfg().maxFuel, null); }

  /* Arriving buys fuel, never crew. The people you have are the people you
     have — that asymmetry is the whole shape of the game. */
  function nextLeg(s) {
    return buildLeg(s.seed, s.leg + 1,
      Math.min(s.maxFuel, s.fuel + cfg().refuelPerLeg), s.maxFuel, s.crew);
  }

  Object.defineProperty(O, "START_FUEL", { get: function () { return cfg().startFuel; }, configurable: true });
  Object.defineProperty(O, "MAX_FUEL", { get: function () { return cfg().maxFuel; }, configurable: true });
  Object.defineProperty(O, "REFUEL_PER_LEG", { get: function () { return cfg().refuelPerLeg; }, configurable: true });
  O.PLACES = PLACES;
  O.PROSE = PROSE;
  O.legPlan = legPlan;
  O.buildLeg = buildLeg;
  O.newGame = newGame;
  O.nextLeg = nextLeg;
})();
