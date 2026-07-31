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

  /* Real Europan nomenclature — the chaos terrain, the linea, the maculae. The
     IAU already named this moon out of Celtic and Greek myth, so the map does
     the atmospheric work for nothing and every place on the route is a place
     that exists. */
  var PLACES = ["Conamara", "Pwyll", "Thera Macula", "Thrace Macula", "Tyre", "Callanish",
    "Manannán", "Agenor Linea", "Rhadamanthys", "Astypalaea", "Argadnel Regio", "Cilix",
    "Cadmus Linea", "Minos Linea", "Taliesin", "Belus Linea"];

  /* One line per kind of trouble, in the register of a convoy log — flat,
     clipped, written by somebody with other things to do. The mechanical fact
     (what it costs, who can handle it) has to be legible from the sentence
     rather than from a table; that is the entire difference between this and a
     spreadsheet. */
  var PROSE = {
    breach: [
      "Plate seam opened when the ridge shifted. It is spraying atmosphere into the dark.",
      "Cold-welded patch gave out. Frame six is at ambient and ambient here is nothing.",
      "Hairline through the outer plate, frame nine. You can hear the core pressure going.",
      "Something spalled off the ridge and went through us. Two compartments dark.",
      "The hull alarm has been sounding for eleven minutes and the patch is not holding.",
    ],
    drift: [
      "Magnetometer is useless this close to the flux tube. We are guessing and we know it.",
      "Two fixes an hour apart, ninety kilometres apart. One of them is a lie.",
      "No fix. Under this much ice the inertials are all we have and they disagree.",
      "The transponder chain ends here. It was supposed to run another sixty kilometres.",
      "Dead reckoning since Tyre, and the error cone is wider than the corridor.",
    ],
    cordon: [
      "Barrier vehicles nose to nose across the lead, and a lamp asking us to stop.",
      "Whoever holds this crossing wants papers we were never issued.",
      "A checkpoint out of the fog, ours or theirs, wanting codes and dose cards.",
      "They want the manifest, the IFF challenge, and everybody scanned before we roll.",
      "Screening line across the whole lead. Nobody goes through undosed and unlogged.",
    ],
    hot: [
      "Jupiter is up and the count outside just went off the top of the scale.",
      "Shielding is holding in the core and nowhere else. Anyone who goes out pays for it.",
      "The belt is dumping. Surface count is four hundred times nominal and climbing.",
      "Flux tube swung over us an hour ago. Everything outside the core is hot.",
      "Dosimeters screaming in the forward bay. Whatever we do here we do quickly.",
    ],
    interdict: [
      "They have our track and they are not closing. They are herding us.",
      "Two vehicles standing off the lead, turrets tracking, waiting to see what we do.",
      "Three tracks on the ice behind us, spread wide, matching our speed exactly.",
      "Someone is walking their fire up the lead toward us and taking their time.",
      "Contact holding at nine kilometres. No transponder, no challenge, no hurry.",
    ],
    crevasse: [
      "Pressure ridges stacked four deep, and something dark opening between them.",
      "The lead ends in broken ground. No route on the chart survives contact with it.",
      "The chaos terrain starts here and there is no clean line through any of it.",
      "Bridged crevasses under fresh snow. The ground-radar cannot see the far walls.",
      "Ice broken into rafts the size of city blocks, and all of it still moving.",
    ],
    dark: [
      "Nothing on any band for ninety minutes. That is not how a supply corridor sounds.",
      "Empty ice to the horizon. Whatever happened out here happened a long time ago.",
      "No beacons, no traffic, no wreckage. Nobody has come this way in a long time.",
      "Sixty kilometres of open lead with nothing on it and nowhere to be if it goes wrong.",
      "The quiet out here has a texture. The gunner has not sat down in two hours.",
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

    /* Prose is drawn without replacement per kind.

       This matters more than it looks. The deficit mechanic deliberately plants
       several systems of the SAME kind — the trouble nobody aboard can meet —
       so a ten-system route routinely carries four pressure breaches. Picking
       each line independently then guaranteed the same sentence twice on one
       screen, which reads as a template the instant you notice it and undoes
       the only thing separating this from a table of rows. */
    var usedProse = {};
    function proseFor(kind) {
      var all = PROSE[kind];
      if (!usedProse[kind]) usedProse[kind] = [];
      var fresh = all.filter(function (line) { return usedProse[kind].indexOf(line) === -1; });
      if (!fresh.length) { usedProse[kind] = []; fresh = all; }   // ran out — start over
      var line = rng.pick(fresh);
      usedProse[kind].push(line);
      return line;
    }

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
        prose: proseFor(kind),
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
    applyDeficit(s, rng, plan.deficit, proseFor);
    return makeFinishable(s, rng, makeStage, plan, proseFor);
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
  function applyDeficit(s, rng, want, proseFor) {
    var b = blindness(s);
    if (!b.kinds.length) return 0;   // a broad enough crew meets everything — leave it
    var have = b.count;
    while (have < want && plantBlind(s, rng, proseFor)) have++;
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
  function plantBlind(s, rng, proseFor) {
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
      var at = spots[i];
      var st = s.stages[at];
      /* Prefer a kind unlike its neighbours. With only two trades missing there
         are few kinds to choose from, so without this the planted systems clump
         into a run of identical rows. */
      var near = {};
      if (s.stages[at - 1]) near[s.stages[at - 1].kind] = true;
      if (s.stages[at + 1]) near[s.stages[at + 1].kind] = true;
      var choices = b.kinds.filter(function (k) { return !near[k]; });
      var kind = rng.pick(choices.length ? choices : b.kinds);
      var was = { kind: st.kind, toll: st.toll, prose: st.prose };
      st.kind = kind;
      st.toll = O.HAZARDS[kind].toll;
      st.prose = proseFor(kind);
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
  function makeFinishable(s, rng, makeStage, plan, proseFor) {
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
      if (plantBlind(s, rng, proseFor)) continue;
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
