/* Hold the Line — the simulation.

   A pure state machine. `newRun(seed)` builds a run, `step(run, dt)` advances
   it, and three verbs mutate it: setFocus, throwGrenade, pickGate. Nothing in
   this file touches the DOM, reads a clock, or calls Math.random — the only
   entropy is the seeded rng on the run itself.

   That discipline is the reason test/balance.mjs can exist: a bot can play ten
   thousand runs in a second and get exactly the results a phone would, so
   "is wave 9 too hard" becomes a measurement instead of an opinion.

   Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var H = NS.HORDE = NS.HORDE || {};
  var CONFIG = H.CONFIG, ZOMBIES = H.ZOMBIES, UPGRADES = H.UPGRADES;

  // ------------------------------------------------------------- run setup --

  function newRun(seed, opts) {
    opts = opts || {};
    var C = CONFIG;
    var run = {
      seed: String(seed),
      rng: H.makeRng(seed),

      t: 0,                 // seconds of simulated time
      wave: 0,              // wave currently being fought (0 before the first)
      phase: "brief",       // brief | wave | gate | dead
      phaseT: C.briefTime,

      wall: { hp: C.wallMax, max: C.wallMax },
      arcs: [],
      focus: 0,

      zombies: [],
      nextId: 1,

      // Every number the cards are allowed to move. Starting values are copied
      // out of CONFIG so a run can never write back into the shared config.
      mods: {
        dps: C.dps,
        spill: C.spill,
        heatRate: C.heatRate,
        coolRate: C.coolRate,
        droop: C.droop,
        jamTime: C.jamTime,
        wallMax: C.wallMax,
        grenadeCd: C.grenadeCd,
        grenadeDmg: C.grenadeDmg,
        speedMul: 1,
        gateOffers: C.gateOffers,
        twin: 0,            // 0 = no twin mount
        execute: 0,         // bonus multiplier vs sub-half-health targets
        outer: 0,           // bonus multiplier vs targets in the far half
        clearRepair: 0,     // wall repaired after each cleared wave
      },

      grenade: { cd: 0 },
      gate: null,
      taken: [],

      spawns: [],           // pending {at, arc, type} for the current wave
      spawnIdx: 0,
      waveT: 0,
      waveDur: 0,

      stats: { kills: 0, leaks: 0, dmg: 0, byType: {}, wavesCleared: 0 },

      // The renderer drains this; the bot never fills it.
      events: [],
      quiet: !!opts.quiet,
    };
    for (var i = 0; i < C.ARCS; i++) run.arcs.push({ heat: 0, jam: 0 });
    return run;
  }

  function emit(run, ev) {
    if (run.quiet) return;
    run.events.push(ev);
    // A renderer that stalls (backgrounded tab) must not grow this without
    // bound. Old feedback is worthless anyway — drop from the front.
    if (run.events.length > 240) run.events.splice(0, run.events.length - 240);
  }

  // ------------------------------------------------------------- the horde --

  function eligibleTypes(wave) {
    var out = [];
    for (var k in ZOMBIES) if (ZOMBIES[k].minWave <= wave) out.push(ZOMBIES[k]);
    return out;
  }

  /* How much the director wants to see each type at this wave. Walkers stay the
     backbone; brutes ramp in hard because they are the reason you need the
     grenade, and swarms exist to punish anyone hiding on one arc. */
  function typeWeight(z, wave) {
    switch (z.id) {
      case "walker": return 3;
      case "runner": return 2;
      case "swarm": return 1.5;
      case "brute": return 0.6 + 0.12 * wave;
      default: return 1;
    }
  }

  function weightedPick(rand, items, weightOf) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += weightOf(items[i]);
    var roll = rand() * total;
    for (i = 0; i < items.length; i++) {
      roll -= weightOf(items[i]);
      if (roll <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /* Build the whole wave up front, deterministically, then let step() release
     it on a timeline. Deciding the shape of a wave in one place makes it
     inspectable — test/balance.mjs prints these plans directly. */
  function buildWave(run, wave) {
    var C = CONFIG, rand = run.rng.stream("waves");
    var budget = C.waveBudget(wave);
    var dur = C.waveDuration(wave);
    var nArcs = C.waveArcs(wave);

    var all = [];
    for (var i = 0; i < C.ARCS; i++) all.push(i);
    var active = run.rng.shuffled("waves", all).slice(0, nArcs);

    // Front-load the pressure onto one or two arcs. An evenly spread wave has
    // no decision in it — the interesting shape is "two arcs are drowning and
    // a third is about to".
    var arcWeight = {};
    for (i = 0; i < active.length; i++) {
      arcWeight[active[i]] = i === 0 ? 3 : (i === 1 ? 2 : 1);
    }

    var types = eligibleTypes(wave);
    var spawns = [];
    var spent = 0;
    var guard = 0;
    while (spent < budget && guard++ < 400) {
      var z = weightedPick(rand, types, function (t) { return typeWeight(t, wave); });
      var arc = weightedPick(rand, active, function (a) { return arcWeight[a]; });
      // Spawns stop at 80% of the nominal duration; the tail of a wave is the
      // last stragglers walking in, which is when you get your breath back.
      var at = rand() * dur * 0.8;
      spawns.push({ at: at, arc: arc, type: z.id, clump: z.clump });
      spent += z.pts * z.clump;
    }
    spawns.sort(function (a, b) { return a.at - b.at; });

    run.spawns = spawns;
    run.spawnIdx = 0;
    run.waveDur = dur;
    run.waveT = 0;
  }

  function spawnZombie(run, arc, typeId, wave, jitter) {
    var Z = ZOMBIES[typeId], C = CONFIG;
    var hp = Z.hp * C.hpScale(wave);
    var z = {
      id: run.nextId++,
      arc: arc,
      // Nudge the start radius so a clump does not render as one dot.
      r: 1 + jitter * 0.06,
      hp: hp,
      maxHp: hp,
      type: typeId,
      speed: Z.speed * C.speedScale(wave),
      dmg: Z.dmg,
      dead: false,
    };
    run.zombies.push(z);
    return z;
  }

  // ------------------------------------------------------------- targeting --

  function closestIn(run, arc) {
    var best = null;
    for (var i = 0; i < run.zombies.length; i++) {
      var z = run.zombies[i];
      if (z.dead || z.arc !== arc) continue;
      if (!best || z.r < best.r) best = z;
    }
    return best;
  }

  function kill(run, z) {
    z.dead = true;
    z.hp = 0;
    run.stats.kills++;
    run.stats.byType[z.type] = (run.stats.byType[z.type] || 0) + 1;
    emit(run, { type: "kill", arc: z.arc, r: z.r, kind: z.type });
  }

  /* Pour `amount` damage-points into one arc, closest target first, overflowing
     into the next as each dies. Single-target-with-overflow is what makes a
     brute feel like a wall rather than a sponge: while it lives, everything
     behind it keeps walking. */
  function damageArc(run, arc, amount) {
    var guard = 0;
    while (amount > 1e-9 && guard++ < 64) {
      var z = closestIn(run, arc);
      if (!z) return;
      // Damage bonuses are additive with each other and multiplicative on the
      // base, so stacking HOLLOW POINTS with SNIPER'S NEST is good without
      // being a run-ending combo.
      var mul = 1;
      if (run.mods.execute && z.hp < z.maxHp * 0.5) mul += run.mods.execute;
      if (run.mods.outer && z.r > 0.5) mul += run.mods.outer;
      var need = z.hp / mul;
      if (amount >= need) {
        amount -= need;
        run.stats.dmg += z.hp;
        kill(run, z);
      } else {
        z.hp -= amount * mul;
        run.stats.dmg += amount * mul;
        return;
      }
    }
  }

  /* The DPS multiplier each arc is receiving this instant. This function *is*
     the fire-allocation mechanic: focus gets the good number degraded by heat,
     a twin mount leaks a real fraction into both neighbours, and everything
     else gets spill. */
  function arcMultiplier(run, i) {
    var m = run.mods;
    var focused = i === run.focus;
    var jammed = run.arcs[run.focus].jam > 0;
    if (focused) return jammed ? m.spill : (1 - m.droop * run.arcs[i].heat);
    if (m.twin && !jammed) {
      var n = CONFIG.ARCS;
      var left = (run.focus + n - 1) % n, right = (run.focus + 1) % n;
      if (i === left || i === right) return Math.max(m.spill, m.twin);
    }
    return m.spill;
  }

  // ------------------------------------------------------------- the gates --

  function availableUpgrades(run) {
    var out = [];
    for (var i = 0; i < UPGRADES.length; i++) {
      var u = UPGRADES[i];
      if (u.minWave > run.wave) continue;
      if (!u.repeatable && run.taken.indexOf(u.id) !== -1) continue;
      out.push(u);
    }
    return out;
  }

  function openGate(run) {
    var pool = availableUpgrades(run);
    var rand = run.rng.stream("cards");
    var n = Math.min(run.mods.gateOffers, pool.length);
    var offers = [];
    // Rarity is the reciprocal of power, so run-winners show up rarely and the
    // small utility cards are the texture of a normal gate.
    for (var i = 0; i < n; i++) {
      var pick = weightedPick(rand, pool, function (u) { return 1 / u.weight; });
      offers.push(pick);
      pool = pool.filter(function (u) { return u !== pick; });
      if (!pool.length) break;
    }
    run.gate = { offers: offers, timeLeft: CONFIG.gateTime, auto: false };
    run.phase = "gate";
    emit(run, { type: "gate", wave: run.wave });
  }

  /* Which card you get if you freeze: the weakest on the table. */
  function weakestOffer(gate) {
    var idx = 0;
    for (var i = 1; i < gate.offers.length; i++) {
      if (gate.offers[i].weight < gate.offers[idx].weight) idx = i;
    }
    return idx;
  }

  function pickGate(run, index) {
    if (run.phase !== "gate" || !run.gate) return false;
    var u = run.gate.offers[index];
    if (!u) return false;
    u.apply(run);
    run.taken.push(u.id);
    run.gate = null;
    run.phase = "brief";
    run.phaseT = CONFIG.briefTime;
    emit(run, { type: "upgrade", id: u.id, name: u.name });
    return true;
  }

  // --------------------------------------------------------------- actions --

  function setFocus(run, arc) {
    if (arc < 0 || arc >= CONFIG.ARCS) return false;
    run.focus = arc | 0;
    return true;
  }

  function grenadeReady(run) {
    return run.phase === "wave" && run.grenade.cd <= 0;
  }

  function throwGrenade(run) {
    if (!grenadeReady(run)) return false;
    var n = CONFIG.ARCS, m = run.mods;
    // Index 0 is the arc you are looking at; the other two are its neighbours
    // and take splash. Aiming a grenade is therefore its own small allocation.
    var arcs = [run.focus, (run.focus + n - 1) % n, (run.focus + 1) % n];
    for (var a = 0; a < arcs.length; a++) {
      var dmg = m.grenadeDmg * (a === 0 ? 1 : CONFIG.grenadeSplash);
      // Unlike the gun, a grenade hits *everything* in the arc for a flat
      // amount. That is what makes it the answer to a swarm and only a dent
      // in a brute.
      for (var i = 0; i < run.zombies.length; i++) {
        var z = run.zombies[i];
        if (z.dead || z.arc !== arcs[a]) continue;
        z.hp -= dmg;
        run.stats.dmg += Math.min(dmg, z.maxHp);
        if (z.hp <= 0) kill(run, z);
      }
    }
    run.grenade.cd = m.grenadeCd;
    emit(run, { type: "grenade", arc: run.focus });
    return true;
  }

  // ------------------------------------------------------------------ step --

  function step(run, dt) {
    if (run.phase === "dead") return run;
    var C = CONFIG, m = run.mods, i;
    run.t += dt;
    if (run.grenade.cd > 0) run.grenade.cd = Math.max(0, run.grenade.cd - dt);

    // --- heat, on every arc, in every phase ---------------------------------
    // Arcs cool while you are elsewhere and while a gate is open. Entering a
    // wave cold is deliberate: the pressure should come from the horde, not
    // from a meter you inherited.
    for (i = 0; i < run.arcs.length; i++) {
      var a = run.arcs[i];
      if (a.jam > 0) {
        a.jam = Math.max(0, a.jam - dt);
        if (a.jam === 0) a.heat = C.jamRecoverHeat;
      } else if (i === run.focus && run.phase === "wave") {
        a.heat += m.heatRate * dt;
        if (a.heat >= 1) {
          a.heat = 1;
          a.jam = m.jamTime;
          emit(run, { type: "jam", arc: i });
        }
      } else {
        a.heat = Math.max(0, a.heat - m.coolRate * dt);
      }
    }

    if (run.phase === "brief") {
      run.phaseT -= dt;
      if (run.phaseT <= 0) {
        run.wave++;
        buildWave(run, run.wave);
        run.phase = "wave";
        emit(run, { type: "wave", wave: run.wave });
      }
      return run;
    }

    if (run.phase === "gate") {
      run.gate.timeLeft -= dt;
      if (run.gate.timeLeft <= 0) {
        run.gate.auto = true;
        emit(run, { type: "timeout" });
        pickGate(run, weakestOffer(run.gate));
      }
      return run;
    }

    // --- phase: wave -------------------------------------------------------
    run.waveT += dt;

    // Release everything whose time has come.
    while (run.spawnIdx < run.spawns.length && run.spawns[run.spawnIdx].at <= run.waveT) {
      var s = run.spawns[run.spawnIdx++];
      for (var c = 0; c < s.clump; c++) spawnZombie(run, s.arc, s.type, run.wave, c);
    }

    // Advance the horde, then resolve leaks.
    for (i = 0; i < run.zombies.length; i++) {
      var z = run.zombies[i];
      if (z.dead) continue;
      z.r -= z.speed * m.speedMul * dt;
      if (z.r <= 0) {
        z.r = 0;
        z.dead = true;
        run.stats.leaks++;
        run.wall.hp -= z.dmg;
        emit(run, { type: "leak", arc: z.arc, dmg: z.dmg });
      }
    }

    // Fire. Every arc, every tick, at whatever multiplier it has earned.
    for (i = 0; i < C.ARCS; i++) {
      var mult = arcMultiplier(run, i);
      if (mult > 0) damageArc(run, i, m.dps * mult * dt);
    }

    // Compact the dead out once per step rather than mid-iteration.
    var live = [];
    for (i = 0; i < run.zombies.length; i++) if (!run.zombies[i].dead) live.push(run.zombies[i]);
    run.zombies = live;

    if (run.wall.hp <= 0) {
      run.wall.hp = 0;
      run.phase = "dead";
      emit(run, { type: "death", wave: run.wave });
      return run;
    }

    // Wave is over when the plan is exhausted and the field is clear.
    if (run.spawnIdx >= run.spawns.length && run.zombies.length === 0) {
      run.stats.wavesCleared = run.wave;
      if (m.clearRepair) {
        run.wall.hp = Math.min(run.wall.max, run.wall.hp + m.clearRepair);
      }
      openGate(run);
    }
    return run;
  }

  // --------------------------------------------------------------- helpers --

  /* Pressure per arc in [0,1] — how close that direction is to hurting you.
     The renderer uses it to colour the rim; the bot uses it to decide where to
     look. Sharing one definition keeps "what the player sees" and "what the bot
     optimises" honest with each other. */
  function arcThreat(run, arc) {
    var worst = 0;
    for (var i = 0; i < run.zombies.length; i++) {
      var z = run.zombies[i];
      if (z.dead || z.arc !== arc) continue;
      // Closeness dominates, and it has to dominate *sharply*. A linear ramp
      // put every arc holding anything at all near the top of the scale, which
      // rendered the whole arena red — if everything is urgent, nothing is.
      // Squaring keeps a distant arc quiet and only lights one up as bodies get
      // genuinely close. The tiny floor means presence still registers, so a
      // bot never sees "no arc worth looking at" while zombies are on screen.
      var t = Math.pow(1 - z.r, 2) * (0.75 + 0.25 * (z.hp / Math.max(1, z.maxHp))) + 0.02;
      if (t > worst) worst = t;
    }
    return Math.min(1, worst);
  }

  H.newRun = newRun;
  H.step = step;
  H.setFocus = setFocus;
  H.throwGrenade = throwGrenade;
  H.grenadeReady = grenadeReady;
  H.pickGate = pickGate;
  H.arcThreat = arcThreat;
  H.arcMultiplier = arcMultiplier;
  H.weakestOffer = weakestOffer;
  H.buildWave = buildWave;
})();
