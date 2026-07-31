/* Switchboard — the rules.
 *
 * Six lines, one operator. Calls arrive on a schedule you can SEE IN FULL from
 * the first second, each with a length and a deadline. You serve one by holding
 * it, and while you are holding it you are holding it — everything else keeps
 * counting down without you.
 *
 * The family's empty cell. Hold the Line is real-time with no ground truth;
 * Telegraph and The Ratchet have exact answers and no clock. This is real-time
 * WITH an exact answer, which is only possible because nothing is hidden and
 * nothing is random: the whole shift is a scheduling problem, and scheduling
 * problems have optima. Telegraph took the clock away from perfect information;
 * this puts it back and takes away everything else.
 *
 * Pure. No DOM, no wall clock, no Math.random — time only advances because
 * step() is called. Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var S = NS.SWITCHBOARD = NS.SWITCHBOARD || {};

  // Progress and the clock are accumulated by repeated += dt, which drifts from
  // exact multiples after a few thousand additions. Comparisons that decide
  // whether a call completed have to tolerate that, or a call needs one extra
  // step and the "exact" optimum becomes unreachable by one frame.
  var EPS = 1e-9;

  var CONFIG = {
    LINES: 6,
    dt: 1 / 120,          // fixed step; the bots and the browser share it
  };

  /* When the board clears. Every call has a deadline, so every call resolves —
     the shift is over when none are left, and it needs no arbitrary cutoff.

     It had one, and it was a real bug: closing at `duration + 1.5s` silently
     truncated calls the solver had legitimately scheduled past that point, so
     perfect play missed its own optimum on 5% of shifts. `duration` governs
     when calls ARRIVE; it was never supposed to govern when they can be
     finished. */
  function closesAt(s) {
    var last = 0;
    for (var i = 0; i < s.jobs.length; i++) last = Math.max(last, s.jobs[i].due);
    return last + CONFIG.dt * 2;
  }

  /* Call kinds exist to make the board readable at a glance rather than to add
     mechanics: a long, valuable call is visibly a bigger commitment than a
     short cheap one, so the triage is legible without reading numbers. */
  var KINDS = {
    quick:  { id: "quick",  name: "QUICK",  glyph: "·" },
    normal: { id: "normal", name: "CALL",   glyph: "◦" },
    long:   { id: "long",   name: "LONG",   glyph: "●" },
    urgent: { id: "urgent", name: "URGENT", glyph: "!" },
  };

  function cloneState(s) {
    return {
      seed: s.seed, shift: s.shift,
      t: s.t, duration: s.duration,
      jobs: s.jobs.map(function (j) {
        return {
          id: j.id, line: j.line, kind: j.kind, at: j.at, dur: j.dur, due: j.due,
          value: j.value, state: j.state, progress: j.progress,
          startedAt: j.startedAt, doneAt: j.doneAt,
        };
      }),
      holding: s.holding,
      score: s.score, served: s.served, missed: s.missed, dropped: s.dropped,
      phase: s.phase,
      history: s.history.slice(),
      events: [],
    };
  }

  function jobById(s, id) {
    for (var i = 0; i < s.jobs.length; i++) if (s.jobs[i].id === id) return s.jobs[i];
    return null;
  }

  function emit(s, ev) { if (s.events) s.events.push(ev); }

  /* A call is live once it has arrived and while it is neither finished nor
     past its deadline. */
  function isLive(j, t) { return j.state === "live" && t < j.due - EPS; }

  /* Time left before this call must be COMPLETE, minus the work still needed.
     Negative means it is already lost whatever you do — the board shows this,
     because knowing a line is dead is exactly the information that lets you
     stop caring about it. */
  function slack(j, t) { return (j.due - t) - (j.dur - j.progress); }

  function doomed(j, t) { return j.state === "live" && slack(j, t) < 0; }

  // --------------------------------------------------------------- actions --

  /* Take a line. You are committed only in the sense that letting go throws the
     work away — the sim will not stop you, and the post-shift report will tell
     you what it cost. */
  function hold(s, id) {
    if (s.phase !== "run") return false;
    var j = jobById(s, id);
    if (!j || !isLive(j, s.t)) return false;
    if (s.holding === id) return true;
    if (s.holding !== null) release(s);
    s.holding = id;
    j.startedAt = s.t;
    s.history.push({ t: s.t, action: "hold", id: id });
    emit(s, { type: "hold", id: id, line: j.line });
    return true;
  }

  function release(s) {
    if (s.holding === null) return false;
    var j = jobById(s, s.holding);
    s.holding = null;
    if (j && j.state === "live" && j.progress > 0) {
      // Everything you had on that line is gone. Under full information this is
      // never the right move, which is exactly why it is worth reporting.
      s.dropped++;
      s.history.push({ t: s.t, action: "drop", id: j.id, progress: j.progress });
      emit(s, { type: "drop", id: j.id, line: j.line, progress: j.progress, dur: j.dur });
      j.progress = 0;
      j.startedAt = null;
    }
    return true;
  }

  // ------------------------------------------------------------------ step --

  function step(s, dt) {
    if (s.phase === "done") return s;
    s.t += dt;
    var i, j;

    // Arrivals.
    for (i = 0; i < s.jobs.length; i++) {
      j = s.jobs[i];
      if (j.state === "waiting" && s.t >= j.at) {
        j.state = "live";
        emit(s, { type: "arrive", id: j.id, line: j.line, kind: j.kind });
      }
    }

    // The line you are on.
    if (s.holding !== null) {
      j = jobById(s, s.holding);
      if (!j || j.state !== "live") {
        s.holding = null;
      } else {
        j.progress += dt;
        if (j.progress >= j.dur - EPS) {
          j.progress = j.dur;
          j.state = "served";
          j.doneAt = s.t;
          s.score += j.value;
          s.served++;
          s.holding = null;
          s.history.push({ t: s.t, action: "served", id: j.id });
          emit(s, { type: "served", id: j.id, line: j.line, value: j.value });
        }
      }
    }

    // Deadlines. Checked after service so a call completing exactly on its
    // deadline counts as served rather than lost.
    for (i = 0; i < s.jobs.length; i++) {
      j = s.jobs[i];
      if (j.state === "live" && s.t >= j.due - EPS) {
        j.state = "missed";
        s.missed++;
        if (s.holding === j.id) s.holding = null;
        s.history.push({ t: s.t, action: "missed", id: j.id });
        emit(s, { type: "missed", id: j.id, line: j.line, value: j.value });
      }
    }

    if (!s.jobs.some(function (x) { return x.state === "live" || x.state === "waiting"; })) {
      s.phase = "done";
      emit(s, { type: "closed" });
    } else if (s.t > closesAt(s) + 1) {
      // Backstop only — unreachable unless a deadline is malformed.
      for (i = 0; i < s.jobs.length; i++) {
        j = s.jobs[i];
        if (j.state === "live" || j.state === "waiting") { j.state = "missed"; s.missed++; }
      }
      s.holding = null;
      s.phase = "done";
      emit(s, { type: "closed" });
    }
    return s;
  }

  function liveJobs(s) {
    return s.jobs.filter(function (j) { return isLive(j, s.t); });
  }

  function totalValue(s) {
    return s.jobs.reduce(function (a, j) { return a + j.value; }, 0);
  }

  S.EPS = EPS;
  S.CONFIG = CONFIG;
  S.closesAt = closesAt;
  S.KINDS = KINDS;
  S.cloneState = cloneState;
  S.jobById = jobById;
  S.isLive = isLive;
  S.slack = slack;
  S.doomed = doomed;
  S.hold = hold;
  S.release = release;
  S.step = step;
  S.liveJobs = liveJobs;
  S.totalValue = totalValue;
})();
