/* Switchboard — the shift generator.
 *
 * (seed, shift number) -> a board. Everything is decided here: every arrival,
 * length, deadline and value, all of it visible to the player from the first
 * second.
 *
 * The contract this genre owes: a shift must FORCE TRIAGE and REWARD SKILL.
 * If everything can be served, there is no decision; if a simple heuristic
 * matches the optimum, there is no decision either. Both are checked here with
 * the same solver the player is graded against.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var S = NS.SWITCHBOARD = NS.SWITCHBOARD || {};

  /* Lengths and values are correlated but not proportional: a LONG call is
     worth more per second than two QUICK ones, and an URGENT is worth a lot for
     its length but arrives with almost no slack. That keeps "always take the
     biggest" and "always take the cheapest" both wrong. */
  var SPEC = {
    quick:  { dur: [1.1, 1.5], value: 2, slack: [1.6, 2.6] },
    normal: { dur: [1.9, 2.6], value: 3, slack: [1.3, 2.2] },
    long:   { dur: [3.2, 4.2], value: 6, slack: [1.1, 1.8] },
    urgent: { dur: [1.4, 1.9], value: 5, slack: [0.35, 0.7] },
  };

  function shiftPlan(shift) {
    return {
      duration: Math.min(34, 22 + 2 * shift),
      jobs: Math.min(14, 7 + shift),
      // Deadlines tighten with depth. Below ~0.75 almost nothing is servable
      // out of order, which stops being triage and starts being dictation.
      squeeze: Math.max(0.72, 1.0 - 0.045 * (shift - 1)),
      bursts: 2 + Math.floor(shift / 3),
      urgentChance: Math.min(0.32, 0.08 + 0.035 * shift),
    };
  }

  function buildShift(seed, shift) {
    var rng = S.rngFor(seed, shift);
    var plan = shiftPlan(shift);
    var i;

    /* Arrivals come in bursts, not evenly. An even stream is a queue you can
       simply work through; a burst is the moment three lines light up and you
       have two hands' worth of nothing. */
    var burstAt = [];
    for (i = 0; i < plan.bursts; i++) {
      burstAt.push(rng.float(0.5, plan.duration * 0.78));
    }
    burstAt.sort(function (a, b) { return a - b; });
    // The board must light up straight away. Left to chance the first burst can
    // land seconds in, and a shift that opens on an empty board teaches the
    // player that nothing is urgent — the opposite of the whole point.
    burstAt[0] = rng.float(0.2, 0.9);

    var jobs = [];
    for (i = 0; i < plan.jobs; i++) {
      var kind = rng.chance(plan.urgentChance) ? "urgent"
        : rng.chance(0.28) ? "long"
        : rng.chance(0.45) ? "quick" : "normal";
      var spec = SPEC[kind];
      var base = rng.pick(burstAt);
      var at = Math.max(0, Math.min(plan.duration * 0.9, base + rng.float(-0.6, 1.6)));
      var dur = rng.float(spec.dur[0], spec.dur[1]);
      var slack = rng.float(spec.slack[0], spec.slack[1]) * plan.squeeze;
      jobs.push({
        id: i + 1, line: 0, kind: kind,
        at: +at.toFixed(2),
        dur: +dur.toFixed(2),
        due: +(at + dur + dur * slack).toFixed(2),
        value: spec.value,
        state: "waiting", progress: 0, startedAt: null, doneAt: null,
      });
    }
    jobs.sort(function (a, b) { return a.at - b.at; });
    jobs.forEach(function (j, n) { j.id = n + 1; });
    assignLines(jobs);

    var s = {
      seed: String(seed), shift: shift,
      t: 0, duration: plan.duration,
      jobs: jobs, holding: null,
      score: 0, served: 0, missed: 0, dropped: 0,
      phase: "run", history: [], events: [],
    };
    return enforceContract(s, rng, plan);
  }

  /* Spread concurrent calls across the six lines so the board reads as a board.
     Purely presentational — the solver does not care which line a call is on. */
  function assignLines(jobs) {
    var freeAt = new Array(S.CONFIG.LINES).fill(-Infinity);
    jobs.forEach(function (j) {
      var best = 0;
      for (var l = 1; l < S.CONFIG.LINES; l++) {
        if (freeAt[l] < freeAt[best]) best = l;
      }
      j.line = best;
      freeAt[best] = j.due;
    });
  }

  /* What a player who is paying attention but not thinking ahead would score.
     If this matches the optimum, the shift is not asking a question. */
  function naiveBest(s) {
    var best = 0;
    ["edf", "value", "shortest"].forEach(function (rule) {
      best = Math.max(best, simpleRun(s, rule));
    });
    return best;
  }

  function simpleRun(s0, rule) {
    var s = S.cloneState(s0);
    s.events = null;
    var dt = S.CONFIG.dt, guard = 0;
    var limit = Math.ceil((S.closesAt(s) + 2) / dt) + 10;
    while (s.phase !== "done" && guard++ < limit) {
      if (s.holding === null) {
        var live = S.liveJobs(s).filter(function (j) { return !S.doomed(j, s.t); });
        if (live.length) {
          live.sort(function (a, b) {
            if (rule === "edf") return a.due - b.due;
            if (rule === "value") return b.value - a.value;
            return a.dur - b.dur;
          });
          S.hold(s, live[0].id);
        }
      }
      S.step(s, dt);
    }
    return s.score;
  }

  /* Force triage, then force thought. Repairs are ordered so the ones that keep
     the shift's shape come first — tightening a deadline preserves every call,
     while adding traffic changes what the board is. */
  function enforceContract(s, rng, plan) {
    var total = S.totalValue(s);
    for (var attempt = 0; attempt < 10; attempt++) {
      var opt = S.optimum(s).value;
      var naive = naiveBest(s);
      var forcesTriage = opt < total - 1e-9;
      var rewardsSkill = opt > naive + 1e-9;
      if (forcesTriage && rewardsSkill) break;

      if (!forcesTriage) {
        // Everything fits. Squeeze the most generous deadlines until it doesn't.
        var loose = s.jobs.slice().sort(function (a, b) {
          return (b.due - b.at - b.dur) - (a.due - a.at - a.dur);
        });
        for (var i = 0; i < Math.min(3, loose.length); i++) {
          var j = loose[i];
          j.due = +(j.at + j.dur + (j.due - j.at - j.dur) * 0.62).toFixed(2);
        }
        continue;
      }
      // Triage is forced but a simple rule already finds the best answer.
      // Collide two calls so ordering starts to matter.
      if (s.jobs.length >= 2) {
        var a = rng.int(0, s.jobs.length - 1);
        var b = (a + 1) % s.jobs.length;
        s.jobs[b].at = s.jobs[a].at;
        s.jobs[b].due = +(s.jobs[b].at + s.jobs[b].dur * rng.float(1.5, 2.2)).toFixed(2);
        s.jobs.sort(function (x, y) { return x.at - y.at; });
        assignLines(s.jobs);
      }
    }
    return s;
  }

  function newGame(seed) { return buildShift(seed, 1); }
  function nextShift(s) { return buildShift(s.seed, s.shift + 1); }

  S.SPEC = SPEC;
  S.shiftPlan = shiftPlan;
  S.buildShift = buildShift;
  S.naiveBest = naiveBest;
  S.simpleRun = simpleRun;
  S.newGame = newGame;
  S.nextShift = nextShift;
})();
