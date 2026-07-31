/* Switchboard — the exact scheduling solver.
 *
 * The shift is a single-machine scheduling problem: non-preemptive service,
 * release times, hard deadlines, maximise served value. That is exactly
 * solvable by a bitmask DP over subsets —
 *
 *     dp[S] = the earliest time by which every call in S can have been served
 *
 * — because for a fixed set, finishing it as early as possible is always at
 * least as good for everything that follows. Fill dp, then take the highest
 * total value over the subsets that are reachable at all.
 *
 * This is the only game in the family where a REAL-TIME board has a provable
 * best answer. It works only because the schedule is fully visible and nothing
 * is random: the player is not guessing at the future, they are failing to
 * physically keep up with one they can see.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var S = NS.SWITCHBOARD = NS.SWITCHBOARD || {};

  // 2^16 x 16 is about a million transitions — a few ms. Shifts are generated
  // well under this; the guard is here so a future content change fails loudly
  // rather than hanging the browser.
  var MAX_JOBS = 16;
  var EPS = 1e-9;

  /* Core DP. `items` are {id, at, rem, due, value} with `at` already clamped to
     the current time and `rem` the work still outstanding. Returns the best
     total value and one order achieving it. */
  /* The sim advances in fixed dt steps, so a call can only be picked up on a
     step boundary and only completes on one. The solver has to schedule in the
     same units or it computes an optimum nobody can execute: in continuous time
     each start rounds up by up to one dt, and across a chain of a dozen calls
     that compounds until a tight deadline slips. Measured before this was
     added, perfect play missed the "optimum" on 17 of 120 shifts.

     An optimum that cannot be reached is not an optimum, it is a reproach. */
  function gridUp(t) {
    var dt = S.CONFIG.dt;
    return Math.ceil(t / dt - EPS) * dt;
  }

  function schedule(items) {
    var k = items.length;
    if (k === 0) return { value: 0, order: [] };
    if (k > MAX_JOBS) throw new Error("switchboard: " + k + " calls exceeds the solver's " + MAX_JOBS + "-call limit");

    var size = 1 << k, i, sub, j;
    var dp = new Float64Array(size);
    var par = new Int32Array(size);
    var val = new Float64Array(size);
    for (i = 0; i < size; i++) { dp[i] = Infinity; par[i] = -1; }
    dp[0] = 0;

    // Value of a subset is fixed by the subset, so accumulate it once.
    val[0] = 0;
    for (sub = 1; sub < size; sub++) {
      var low = sub & -sub;
      val[sub] = val[sub ^ low] + items[Math.log2(low) | 0].value;
    }

    for (sub = 0; sub < size; sub++) {
      var now = dp[sub];
      if (now === Infinity) continue;
      for (j = 0; j < k; j++) {
        if (sub & (1 << j)) continue;
        var it = items[j];
        // Start on a step boundary, and serve for a whole number of steps.
        var finish = gridUp(Math.max(now, it.at)) + gridUp(it.rem);
        if (finish > it.due + EPS) continue;      // cannot be completed in time
        var ns = sub | (1 << j);
        if (finish < dp[ns] - EPS) { dp[ns] = finish; par[ns] = j; }
      }
    }

    var bestSub = 0, bestVal = 0;
    for (sub = 0; sub < size; sub++) {
      if (dp[sub] === Infinity) continue;
      if (val[sub] > bestVal + EPS) { bestVal = val[sub]; bestSub = sub; }
    }

    var order = [];
    for (var cur = bestSub; cur > 0;) {
      var p = par[cur];
      if (p < 0) break;
      order.unshift(items[p].id);
      cur ^= (1 << p);
    }
    return { value: bestVal, order: order };
  }

  /* Everything still obtainable from this live state, playing perfectly.
     Includes the option of abandoning the line currently held — which is never
     actually better under full information, but the solver should not assume
     what it can cheaply verify. */
  function potential(s) {
    var pending = s.jobs.filter(function (j) { return j.state === "waiting" || j.state === "live"; });
    var held = s.holding !== null ? S.jobById(s, s.holding) : null;

    var freeItems = pending.map(function (j) {
      return { id: j.id, at: Math.max(j.at, s.t), rem: j.dur, due: j.due, value: j.value };
    });
    var best = schedule(freeItems);       // drop whatever is held, keep all options

    if (held && held.progress > 0) {
      var rem = held.dur - held.progress;
      if (s.t + rem <= held.due + EPS) {
        var rest = pending.filter(function (j) { return j.id !== held.id; }).map(function (j) {
          return { id: j.id, at: Math.max(j.at, s.t + rem), rem: j.dur, due: j.due, value: j.value };
        });
        var carry = schedule(rest);
        var carried = held.value + carry.value;
        if (carried > best.value + EPS) {
          best = { value: carried, order: [held.id].concat(carry.order) };
        }
      }
    }
    return best;
  }

  /* Best from here ASSUMING YOU SEE THE CURRENT COMMITMENT THROUGH.
   *
   * `potential` above answers "what could a perfect player still get", which
   * includes abandoning the line in hand. That is the right general notion, but
   * it is the wrong one for attribution: at the instant you take a long call,
   * nothing is lost yet — you could still drop it — so the ceiling does not
   * move and the report blames nobody. The cost of a commitment only exists if
   * the commitment is honoured, which is exactly what the readout claims.
   */
  function committed(s) {
    var pending = s.jobs.filter(function (j) { return j.state === "waiting" || j.state === "live"; });
    var held = s.holding !== null ? S.jobById(s, s.holding) : null;
    if (!held) {
      return schedule(pending.map(function (j) {
        return { id: j.id, at: Math.max(j.at, s.t), rem: j.dur, due: j.due, value: j.value };
      }));
    }
    var rem = held.dur - held.progress;
    var done = s.t + gridUp(rem);
    if (done > held.due + EPS) return potential(s);   // it cannot be honoured
    var rest = pending.filter(function (j) { return j.id !== held.id; }).map(function (j) {
      return { id: j.id, at: Math.max(j.at, done), rem: j.dur, due: j.due, value: j.value };
    });
    var after = schedule(rest);
    return { value: held.value + after.value, order: [held.id].concat(after.order) };
  }

  /* The best the whole shift could ever have gone. */
  function optimum(initial) {
    return schedule(initial.jobs.map(function (j) {
      return { id: j.id, at: j.at, rem: j.dur, due: j.due, value: j.value };
    }));
  }

  /* Replay a finished shift and find where the value went.
   *
   * The ceiling — what you had earned plus what was still obtainable — can only
   * ever fall, and it starts at the optimum. Every drop in it is a decision that
   * cost you something, and the size of the drop is exactly what it cost. Same
   * shape as The Ratchet's post-mortem, but with a price attached instead of a
   * yes or no.
   */
  function postShift(initial, history, dt) {
    dt = dt || S.CONFIG.dt;
    var s = S.cloneState(initial);
    s.events = null;                       // no need to accumulate during replay
    var opt = optimum(initial);
    var ceiling = opt.value;
    var losses = [];

    // Replay the recorded inputs against the real rules rather than a model of
    // them, so the attribution cannot drift from what actually happened.
    var acts = history.filter(function (h) { return h.action === "hold" || h.action === "drop"; });
    var ai = 0, guard = 0;
    var limit = Math.ceil((S.closesAt(initial) + 2) / dt) + 10;

    while (s.phase !== "done" && guard++ < limit) {
      while (ai < acts.length && acts[ai].t <= s.t + EPS) {
        var a = acts[ai++];
        if (a.action === "hold") S.hold(s, a.id); else S.release(s);
        // A hold is priced as a commitment honoured; a drop is priced as what
        // is left after actually having dropped it.
        var after = s.score + (a.action === "hold" ? committed(s) : potential(s)).value;
        if (after < ceiling - EPS) {
          losses.push({
            t: s.t, action: a.action, id: a.id,
            cost: +(ceiling - after).toFixed(3),
          });
          ceiling = after;
        }
      }
      S.step(s, dt);
    }

    // Anything still unaccounted for was lost to standing still.
    var idleLoss = +(ceiling - s.score).toFixed(3);
    losses.sort(function (x, y) { return y.cost - x.cost; });
    return {
      optimum: opt.value, optimumOrder: opt.order,
      achieved: s.score,
      lost: +(opt.value - s.score).toFixed(3),
      losses: losses,
      worst: losses[0] || null,
      first: losses.length ? losses.reduce(function (a, b) { return a.t <= b.t ? a : b; }) : null,
      idleLoss: idleLoss > EPS ? idleLoss : 0,
      replayScore: s.score,
    };
  }

  S.MAX_JOBS = MAX_JOBS;
  S.schedule = schedule;
  S.potential = potential;
  S.committed = committed;
  S.optimum = optimum;
  S.postShift = postShift;
})();
