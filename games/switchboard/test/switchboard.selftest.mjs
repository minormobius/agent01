/* node games/switchboard/test/switchboard.selftest.mjs
 *
 * Gates Switchboard. The load-bearing property is unusual for this family:
 *
 *   THE SOLVER AND THE SIM MUST AGREE, EXACTLY.
 *
 * This is the one game here that claims an exact optimum for a real-time board.
 * If perfect play cannot reach the number shown to the player, the number is a
 * reproach rather than a target, and the whole premise is void. Two real bugs
 * were caught by exactly this check: the solver scheduling in continuous time
 * while the sim runs on a 1/120s grid, and the shift closing on a fixed timer
 * that truncated calls the solver had legitimately planned.
 *
 * Picked up automatically by scripts/preflight.mjs when games/ is touched.
 */
import { loadSwitchboard, playShift, POLICIES } from "./harness.mjs";
import { checkDeterminism, checkContract } from "../../../packages/pressure-lab/lab.mjs";

const S = await loadSwitchboard();
let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

const fp = (s) => s.jobs.map((j) => `${j.at}/${j.dur}/${j.due}/${j.value}/${j.line}`).join("|");
/* A hand-built board, so scenarios are exact rather than hunted for. */
function board(jobs, duration = 30) {
  return {
    seed: "hand", shift: 1, t: 0, duration,
    jobs: jobs.map((j, i) => Object.assign({
      id: i + 1, line: i % 6, kind: "normal", value: 3,
      state: "waiting", progress: 0, startedAt: null, doneAt: null,
    }, j)),
    holding: null, score: 0, served: 0, missed: 0, dropped: 0,
    phase: "run", history: [], events: [],
  };
}
function runTo(s, t) {
  const dt = S.CONFIG.dt;
  let guard = 0;
  while (s.t < t - 1e-9 && s.phase !== "done" && guard++ < 20000) S.step(s, dt);
  return s;
}

console.log("— determinism —");
{
  const d = checkDeterminism((c) => S.buildShift(c[0], c[1]), fp,
    [["a", 1], ["a", 4], ["b", 2], ["c", 7]]);
  ck(d.ok, `same (seed, shift) reproduces — ${d.detail}`);
  ck(fp(S.buildShift("a", 1)) !== fp(S.buildShift("b", 1)), "different seeds differ");
  ck(fp(S.buildShift("a", 1)) !== fp(S.buildShift("a", 2)), "different shifts differ");

  const a = playShift(S, S.buildShift("rep", 4), "leastSlack");
  const b = playShift(S, S.buildShift("rep", 4), "leastSlack");
  ck(a.score === b.score && a.served === b.served, `a full shift reproduces (${a.score} pts)`);
}

console.log("\n— the solver and the sim agree —");
{
  // The property the whole game rests on.
  let bad = [];
  for (let i = 0; i < 60; i++) {
    const sh = S.buildShift(`agree-${i}`, 1 + (i % 8));
    const opt = S.optimum(sh).value;
    const got = playShift(S, sh, "optimal").score;
    if (Math.abs(opt - got) > 1e-6) bad.push(`agree-${i}: solver ${opt} vs played ${got}`);
  }
  ck(bad.length === 0, `perfect play reaches the stated optimum on all 60 shifts${bad.length ? " — " + bad.slice(0, 3).join("; ") : ""}`);

  // No policy may ever beat it. That would mean the "optimum" is not one.
  let over = [];
  for (let i = 0; i < 40; i++) {
    const sh = S.buildShift(`cap-${i}`, 1 + (i % 8));
    const opt = S.optimum(sh).value;
    for (const p of Object.keys(POLICIES)) {
      if (playShift(S, sh, p).score > opt + 1e-6) over.push(`${p} on cap-${i}`);
    }
  }
  ck(over.length === 0, `no policy exceeds the optimum${over.length ? " — " + over.slice(0, 3).join(", ") : ""}`);
}

console.log("\n— the rules —");
{
  // Serving takes exactly its duration.
  const s = board([{ at: 0, dur: 2, due: 10, value: 3 }]);
  runTo(s, 0.1);
  ck(S.hold(s, 1), "a live call can be taken");
  runTo(s, 1.9);
  ck(s.jobs[0].state === "live", "it is not finished early");
  runTo(s, 2.2);
  ck(s.jobs[0].state === "served" && s.score === 3, "it completes after its duration and pays out");

  // Letting go throws the work away.
  const d = board([{ at: 0, dur: 3, due: 20 }]);
  runTo(d, 0.1); S.hold(d, 1); runTo(d, 1.5);
  ck(d.jobs[0].progress > 1, "progress accumulates while held");
  S.release(d);
  ck(d.jobs[0].progress === 0 && d.dropped === 1, "releasing early loses all of it");
  ck(d.holding === null, "and frees the operator");

  // Deadlines are hard, and measured on completion not on starting.
  const m = board([{ at: 0, dur: 2, due: 3 }]);
  runTo(m, 1.5); S.hold(m, 1); runTo(m, 3.1);
  ck(m.jobs[0].state === "missed" && m.score === 0,
    "starting in time is not enough — it must FINISH in time");

  // You can only be on one line.
  const two = board([{ at: 0, dur: 3, due: 20 }, { at: 0, dur: 3, due: 20 }]);
  runTo(two, 0.1);
  S.hold(two, 1); runTo(two, 1); S.hold(two, 2);
  ck(two.holding === 2 && two.jobs[0].progress === 0,
    "taking a second line drops the first");

  ck(!S.hold(board([{ at: 5, dur: 1, due: 9 }]), 1), "a call that has not arrived cannot be taken");
}

console.log("\n— slack and doom —");
{
  const s = board([{ at: 0, dur: 2, due: 5 }]);
  runTo(s, 0.5);
  ck(Math.abs(S.slack(s.jobs[0], s.t) - 2.5) < 0.05, "slack is time left minus work left");
  ck(!S.doomed(s.jobs[0], s.t), "a servable call is not doomed");
  runTo(s, 3.5);
  ck(S.doomed(s.jobs[0], s.t), "once the work no longer fits, it is doomed");
  // A doomed call is worth knowing about precisely so you can ignore it.
  ck(S.potential(s).value === 0, "and the solver agrees nothing is still obtainable");
}

console.log("\n— the shift ends when the board clears —");
{
  // The bug this replaced: a fixed cutoff truncated calls the solver had
  // legitimately scheduled, so perfect play missed its own optimum.
  const late = board([{ at: 1, dur: 2, due: 40 }], 5);
  ck(S.closesAt(late) > late.duration, "closing time follows the last deadline, not the arrival window");
  runTo(late, 1.1); S.hold(late, 1);
  runTo(late, 45);
  ck(late.phase === "done" && late.score === 3,
    "a call whose deadline is past the arrival window is still servable");

  const empty = board([{ at: 0, dur: 1, due: 2 }]);
  runTo(empty, 5);
  ck(empty.phase === "done", "the shift closes once nothing is live or waiting");
}

console.log("\n— the scheduler —");
{
  const one = (items) => S.schedule(items).value;
  ck(one([]) === 0, "an empty board is worth nothing");
  ck(one([{ id: 1, at: 0, rem: 1, due: 2, value: 5 }]) === 5, "a feasible call is taken");
  ck(one([{ id: 1, at: 0, rem: 5, due: 2, value: 5 }]) === 0, "an infeasible one is not");

  // Two calls, only one servable — it must pick the valuable one.
  const pick = S.schedule([
    { id: 1, at: 0, rem: 3, due: 3.2, value: 2 },
    { id: 2, at: 0, rem: 3, due: 3.2, value: 6 },
  ]);
  ck(pick.value === 6 && pick.order.join() === "2", "with room for one, it takes the better one");

  // Ordering matters: earliest-deadline-first would strand the second.
  const seq = S.schedule([
    { id: 1, at: 0, rem: 2, due: 10, value: 3 },
    { id: 2, at: 0, rem: 2, due: 2.1, value: 3 },
  ]);
  ck(seq.value === 6 && seq.order[0] === 2, "it orders to fit both in — only 2-then-1 works");

  // Waiting for a later arrival is allowed.
  ck(one([{ id: 1, at: 5, rem: 1, due: 7, value: 4 }]) === 4, "idling until a call arrives is allowed");
  ck(S.schedule([{ id: 1, at: 0, rem: 1, due: 9, value: 1 }, { id: 2, at: 8, rem: 1, due: 9, value: 1 }]).value === 2,
    "a gap between calls is not wasted");
}

console.log("\n— the post-shift report —");
{
  // A board where taking the long call first provably costs you the other two.
  const trap = board([
    { at: 0, dur: 4, due: 4.5, value: 4 },
    { at: 0, dur: 1, due: 2.2, value: 3 },
    { at: 0, dur: 1, due: 3.4, value: 3 },
  ]);
  const opt = S.optimum(trap);
  ck(opt.value === 6, `the trap board is worth ${opt.value} played well (both short calls)`);

  const s = S.cloneState(trap);
  runTo(s, 0.05); S.hold(s, 1);              // the costly commitment
  runTo(s, S.closesAt(trap) + 0.5);
  ck(s.score === 4, "taking the long call scores less");

  const pm = S.postShift(trap, s.history);
  ck(pm.optimum === 6 && pm.achieved === 4, "the report knows both numbers");
  ck(pm.losses.length > 0, "and blames a specific moment");
  ck(pm.losses[0].id === 1, `the blamed commitment is the long call (id ${pm.losses[0].id})`);
  ck(pm.losses[0].cost === 2, `priced exactly (${pm.losses[0].cost} pts)`);

  // Perfect play should be blamed for nothing.
  const good = S.cloneState(trap);
  runTo(good, 0.05); S.hold(good, 2);
  runTo(good, 1.1); S.hold(good, 3);
  runTo(good, S.closesAt(trap) + 0.5);
  const clean = S.postShift(trap, good.history);
  ck(clean.achieved === 6 && clean.losses.length === 0, "a perfect shift is blamed for nothing");
}

console.log("\n— the generator's contract —");
{
  const shifts = Array.from({ length: 40 }, (_, i) => S.buildShift(`gen-${i}`, 1 + (i % 9)));
  const triage = checkContract((sh) => sh, (sh) => S.optimum(sh).value < S.totalValue(sh) - 1e-9, shifts);
  ck(triage.ok, `every shift forces triage — ${triage.detail}`);

  const skill = shifts.filter((sh) => S.optimum(sh).value <= S.naiveBest(sh) + 1e-9).length;
  ck(skill === 0, `every shift rewards thinking ahead (${shifts.length - skill}/${shifts.length} beat every simple rule)`);

  ck(shifts.every((sh) => sh.jobs.length <= S.MAX_JOBS), `no shift exceeds the ${S.MAX_JOBS}-call solver limit`);
  ck(shifts.every((sh) => sh.jobs.every((j) => j.due > j.at + j.dur)), "every call is individually servable");
  ck(shifts.every((sh) => sh.jobs.every((j) => j.line >= 0 && j.line < S.CONFIG.LINES)), "every call sits on a real line");
}

console.log("\n— skill actually matters —");
{
  const shifts = Array.from({ length: 40 }, (_, i) => S.buildShift(`skill-${i}`, 2 + (i % 6)));
  const mean = (p) => shifts.reduce((a, sh) => a + (S.optimum(sh).value - playShift(S, sh, p).score), 0) / shifts.length;
  const newest = mean("newest"), best = Math.min(mean("leastSlack"), mean("density"));
  ck(best < newest, `a real rule beats grabbing the newest line (${best.toFixed(2)} vs ${newest.toFixed(2)} pts behind)`);
  ck(best > 0.5, `and still falls well short of perfect (${best.toFixed(2)} pts behind) — there is headroom`);
}

console.log(failures ? `\n${failures} FAILED\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
