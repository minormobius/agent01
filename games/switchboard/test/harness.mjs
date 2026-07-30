/* Shared test harness for Switchboard.
 *
 * The bots here are pure scheduling rules, and the interesting thing about them
 * is that they are all *reasonable*. Earliest-deadline-first is the textbook
 * answer for a machine that cannot miss anything; least-slack is what a person
 * actually feels. Neither is optimal when you are allowed to abandon calls, and
 * the size of that shortfall is the game.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function loadSwitchboard() {
  await import(path.join(here, "../js/prng.js"));
  await import(path.join(here, "../js/rules.js"));
  await import(path.join(here, "../js/solve.js"));
  await import(path.join(here, "../js/generate.js"));
  return globalThis.SWITCHBOARD;
}

/* Each policy picks which live call to take whenever a hand comes free.
   Returning null means stand idle this instant. */
export const POLICIES = {
  // The control: grab whatever lit up most recently. What a panicking human does.
  newest(S, s, live) {
    return live.reduce((a, b) => (b.at > a.at ? b : a));
  },
  // Textbook. Optimal when nothing may be dropped; this board is not that.
  edf(S, s, live) {
    return live.reduce((a, b) => (b.due < a.due ? b : a));
  },
  // What attention actually feels like: serve whatever is closest to being lost.
  leastSlack(S, s, live) {
    return live.reduce((a, b) => (S.slack(b, s.t) < S.slack(a, s.t) ? b : a));
  },
  // Chase points.
  richest(S, s, live) {
    return live.reduce((a, b) => (b.value > a.value ? b : a));
  },
  // Value per second of commitment — the best simple rule.
  density(S, s, live) {
    return live.reduce((a, b) => (b.value / b.dur > a.value / a.dur ? b : a));
  },
  /* Follows the solver's plan for the whole shift. Not a heuristic — this is
     what perfect play scores, and it should equal the optimum exactly. */
  optimal(S, s, live, memo) {
    if (!memo.order) memo.order = S.optimum(s).order.slice();
    while (memo.order.length) {
      const j = S.jobById(s, memo.order[0]);
      if (!j || j.state !== "live") {
        // Not arrived yet: wait for it rather than taking something else, which
        // is the part every greedy rule gets wrong.
        if (j && j.state === "waiting") return null;
        memo.order.shift();
        continue;
      }
      return j;
    }
    return null;
  },
};

/* Play one shift. Policies only ever act when a hand is free, so they never
   abandon a call — abandoning is never optimal under full information. */
export function playShift(S, shift, policyName) {
  const s = S.cloneState(shift);
  s.events = null;
  const policy = POLICIES[policyName];
  const memo = {};
  const dt = S.CONFIG.dt;
  let guard = 0;
  const limit = Math.ceil((S.closesAt(s) + 2) / dt) + 10;

  while (s.phase !== "done" && guard++ < limit) {
    if (s.holding === null) {
      const live = S.liveJobs(s).filter((j) => !S.doomed(j, s.t));
      if (live.length) {
        const pick = policy(S, s, live, memo);
        if (pick) S.hold(s, pick.id);
      }
    }
    S.step(s, dt);
  }
  return { score: s.score, served: s.served, missed: s.missed, state: s };
}

export function playRun(S, seed, policyName, maxShift = 10) {
  let shift = S.newGame(seed);
  let cleared = 0, totalGap = 0;
  for (let i = 0; i < maxShift; i++) {
    const out = playShift(S, shift, policyName);
    const opt = S.optimum(shift).value;
    totalGap += opt - out.score;
    // A shift is "held" if you got at least three quarters of what was there.
    if (out.score < opt * 0.75) return { cleared, totalGap, lastShift: shift.shift };
    cleared++;
    shift = S.nextShift(shift);
  }
  return { cleared, totalGap, lastShift: shift.shift, capped: true };
}
