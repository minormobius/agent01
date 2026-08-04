#!/usr/bin/env node
// loop-tick.mjs — the reactor's decision. Does the loop take another turn, and
// on what?
//
// This is the governor, and it is a script rather than YAML for the same reason
// every other judgement in this repo is: a workflow step cannot be selftested,
// and this is the one component whose bug is *expensive rather than visible* —
// a scheduler that keeps dispatching spends the operator's month in a circle,
// and CLAUDE.md already states the real currency: "an unbounded hour does not
// produce a bill, it produces an operator who cannot use their own tools for the
// rest of the week."
//
//   node scripts/loop-tick.mjs             # decide, print the reasoning
//   node scripts/loop-tick.mjs --json      # the decision, machine-readable
//   node scripts/loop-tick.mjs --write     # …and write the work orders
//
// THE BUDGET IS A CONTROLLER, NOT A COUNTDOWN (CLOSED-LOOP.md §8). The
// interesting version is not "run N turns then stop" — it is reading the gauge
// and deciding where the marginal turn pays: spend on the artifact whose judge
// score is still climbing, retire the one that has plateaued. That is the
// difference between a batch job and a loop, and it is implemented in
// `rank()` below.
//
// It also requires seeing the gauge honestly, INCLUDING THE CASE WHERE THE
// GAUGE SAYS STOP AND THE CORRECT RESPONSE IS TO STOP. Not finding a more
// permissive gauge, not splitting work across accounts, not routing around the
// limit. That sentence is in CLOSED-LOOP.md §8 and it is repeated here because
// this file is where it would be violated.

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { parseLedger, computeGraph, readyQueue } from './lib/beads.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const write = argv.includes('--write');

// Overridable so the selftest can drive the REAL CLI — argv, stdout, exit code
// and all — against a scratch ledger. `decide` being pure is what makes the
// governor testable; it is not what makes the process contract testable, and
// the two bugs that stopped the plan seat both lived in the process contract.
const LOOP_DIR = process.env.LOOP_DIR ? resolve(process.env.LOOP_DIR) : join(ROOT, '.github', 'loop');
const WORK_DIR = join(LOOP_DIR, 'work');
const TURNS = join(LOOP_DIR, 'turns.jsonl');

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const jsonl = (text) => text.split('\n')
  .filter((l) => l.trim() && !l.trim().startsWith('//'))
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

/**
 * Decide. Pure — takes the world, returns a decision, touches nothing. That is
 * what makes the selftest able to drive it through a budget exhaustion, a
 * plateau and a gate-failure streak without a runner.
 *
 * `now` is injected for the same reason.
 */
/**
 * `turns` and `runs` are DIFFERENT LEDGERS and must stay that way.
 *
 *   turns.jsonl — one record per work order ISSUED, written by this file
 *   runs.jsonl  — one record per turn JUDGED, written by loop-judge
 *
 * The budget counts `turns`. It used to count `runs`, and a rehearsal found
 * what that costs: runs.jsonl is appended only by the judge, so if the judge
 * never fires — trigger missed, gate tripped, job failed — the reactor reports
 * "0 turns so far" forever and dispatches without limit while `hardStopTurns`
 * and `turnsPerDay` sit silently inert. Green, healthy, metering nothing; the
 * same shape as workers/cron dispatching nothing for its entire life.
 *
 * **The meter belongs at the point of spend.** Budget accounting and quality
 * measurement must not share a writer, because the quality writer is allowed
 * to fail and the budget writer is not.
 */
export function decide({ config, beads, turns = [], runs = [], now = new Date().toISOString(), openOrders = [] }) {
  const halt = (reason, detail = '') => ({ act: 'halt', reason, detail, dispatch: [] });

  // 1. THE MASTER SWITCH, first and unconditional.
  if (config.enabled !== true) {
    return halt('disabled', 'enabled is false in .github/loop/config.json — this is the default and turning it on is a signed commit');
  }

  const budget = config.budget ?? {};
  const stop = config.stop ?? {};
  const graph = computeGraph(beads);
  // DISPATCHABLE, not merely ready: class A only. A class-B bead is ready for a
  // human and never for the fleet — see beads.mjs on why the default is closed.
  //
  // AND NOT ALREADY ISSUED. A work order does not change its bead's status, so
  // without this filter the bead stays `ready` and the very next tick dispatches
  // it AGAIN — two agents on one bead, racing on one outbox file, at double the
  // spend. The per-bead GitHub concurrency group serialises them, which makes it
  // worse rather than better: both still run, and the second silently overwrites
  // the first's work. Found by rehearsing two ticks in a row.
  const issuedTo = new Set(openOrders);
  const queue = readyQueue(graph, { dispatchableOnly: true }).filter((b) => !issuedTo.has(b.id));

  // 2. THE HARD STOP. A controller with a bug is still a loop; this is the
  //    backstop that does not depend on the controller being right.
  const issued = turns.length;
  if (budget.hardStopTurns != null && issued >= budget.hardStopTurns) {
    return halt('hard stop', `${issued} turns issued, hardStopTurns is ${budget.hardStopTurns}`);
  }

  // 3. THE DAILY GAUGE. Rolling 24h, not calendar-day: a calendar boundary lets
  //    a run at 23:50 and another at 00:10 spend two days' budget in twenty
  //    minutes, which is exactly the shape of an overnight runaway.
  const cutoff = Date.parse(now) - 24 * 3600 * 1000;
  const today = turns.filter((t) => t.at && Date.parse(t.at) >= cutoff).length;
  if (budget.turnsPerDay != null && today >= budget.turnsPerDay) {
    return halt('daily budget spent', `${today} turns in the last 24h, turnsPerDay is ${budget.turnsPerDay}`);
  }

  // 4. CONCURRENCY. Work orders on disk count as well as in-progress beads: an
  //    order written but not yet picked up is committed spend.
  const inFlight = graph.nodes.filter((n) => n.status === 'in_progress').length + openOrders.length;
  const maxConc = budget.maxConcurrentWork ?? 1;
  if (inFlight >= maxConc) {
    return halt('at concurrency', `${inFlight} in flight, maxConcurrentWork is ${maxConc}`);
  }

  // 5. REPEATED GATE FAILURE. Consecutive, from the tail — a run that failed a
  //    gate three weeks ago is history, three in a row right now is a loop
  //    banging on a door.
  if (stop.repeatedGateFailures != null) {
    let streak = 0;
    for (let i = runs.length - 1; i >= 0 && runs[i].gateFailed; i--) streak++;
    if (streak >= stop.repeatedGateFailures) {
      return halt('repeated gate failure', `${streak} consecutive runs failed a gate`);
    }
  }

  // 6. THE EMPTY QUEUE. Nothing schedulable is a stop condition and NOT an
  //    invitation to promote proposals. A loop that promotes its own backlog
  //    has no gate; see beads.mjs on why `proposed` is not `ready`.
  if (!queue.length) {
    const readyButNotDispatchable = readyQueue(graph).length;
    const why = readyButNotDispatchable
      ? `${readyButNotDispatchable} bead(s) are ready but none is class A — the fleet may only take class A (LOOP-WBS §2.3)`
      : 'nothing is schedulable';
    // ── BACKPRESSURE: a starved queue staffs the PLAN seat ──────────────────
    // The allocator's first real behaviour (LOOP-WBS §3.4). Starved and idle
    // look identical from outside, and the difference is the whole supply
    // problem: a loop halting on an empty queue is not finished, it is hungry.
    // So instead of merely stopping, say that work is needed — and note this
    // does NOT dispatch a turn. The planner proposes; a human promotes; only
    // then does the fleet get anything. Gain stays where it was.
    // STARVED MEANS NO DISPATCHABLE WORK — not "no work at all". A queue full
    // of ready class-B beads is a queue full of things a HUMAN must do; it
    // feeds the fleet nothing. Gating the planner on an entirely empty queue
    // meant the loop could sit at zero throughput indefinitely while looking
    // busy, which is the starved-vs-idle confusion in its most misleading form.
    const planSeats = config.seats?.roles?.plan?.max ?? 0;
    const wantsPlan = planSeats > 0;
    return { act: 'halt', reason: stop.emptyReadyQueue === false ? 'nothing to do' : 'empty ready queue',
      detail: why + (wantsPlan
        ? ' — no dispatchable work, so a plan seat is being staffed to make some'
        : ' — promote a proposal by hand, or the run is over'),
      dispatch: [], needsPlan: wantsPlan };
  }

  // 7. THE PLATEAU. The measurement this programme exists to take, wired up as
  //    a brake. Per artifact: if its best judge score has not improved in the
  //    last K turns, that artifact is retired — not the whole loop, because
  //    another artifact may still be climbing.
  const K = stop.noImprovementTurns;
  const trends = trend(runs);
  const retired = new Set();
  if (K != null) {
    for (const [artifact, t] of trends) {
      // Untagged runs land under the null key: those are the programme's own
      // work (build the judge, seed the graph), not an artifact under
      // measurement. Retiring them would mean a flat stretch of infrastructure
      // turns silently halting the loop with the reason "plateau" — a stop that
      // is both wrong and hard to read. The plateau brake applies only to the
      // things whose quality curve is the deliverable.
      if (artifact === null) continue;
      if (t.sinceImprovement >= K) retired.add(artifact);
    }
  }

  const live = queue.filter((b) => !retired.has(artifactOf(b)));
  if (!live.length) {
    return halt('plateau', `every schedulable bead belongs to a retired artifact (${[...retired].join(', ')})`);
  }

  const want = Math.max(0, Math.min(budget.turnsPerRun ?? 1, maxConc - inFlight, live.length));
  if (!want) return halt('no capacity this run', `turnsPerRun ${budget.turnsPerRun}, ${maxConc - inFlight} slot(s) free`);

  const dispatch = rank(live, trends).slice(0, want).map((b) => ({
    bead: b.id,
    title: b.title,
    artifact: artifactOf(b),
    priority: b.priority,
    unblocks: b.unblocks,
    turn: issued + 1,
  }));

  return {
    act: 'dispatch',
    reason: 'capacity and work available',
    detail: `${issued} turns issued, ${today} in the last 24h, ${live.length} dispatchable${retired.size ? `, ${retired.size} artifact(s) retired` : ''}`,
    dispatch,
    retired: [...retired],
  };
}

/** An artifact is a tag: `artifact:<slug>`. Untagged work belongs to the
 *  programme itself, which never plateaus and is never retired. */
export function artifactOf(bead) {
  const t = (bead.tags ?? []).find((x) => x.startsWith('artifact:'));
  return t ? t.slice('artifact:'.length) : null;
}

/** Per-artifact: best score so far, and how many turns since it last improved. */
export function trend(runs) {
  const out = new Map();
  for (const r of runs) {
    if (typeof r.score !== 'number') continue;
    const key = r.artifact ?? null;
    const cur = out.get(key) ?? { best: -Infinity, sinceImprovement: 0, turns: 0, last: null };
    cur.turns++;
    cur.last = r.score;
    // Strictly greater: equal is not improvement. A judge that saturates at its
    // own ceiling would otherwise read as endless progress.
    if (r.score > cur.best) { cur.best = r.score; cur.sinceImprovement = 0; }
    else cur.sinceImprovement++;
    out.set(key, cur);
  }
  return out;
}

/**
 * Where does the marginal turn pay?
 *
 * Climbing artifacts first, then whatever unblocks the most, then priority.
 * Note the deliberate inversion against `readyQueue`, which is priority-first:
 * the queue answers "what is most important", this answers "what is the best
 * use of ONE more turn", and those are different questions. An urgent bead on
 * a plateaued artifact is a bad marginal turn even though it is a good bead.
 */
export function rank(candidates, trends) {
  const climb = (b) => {
    const t = trends.get(artifactOf(b));
    if (!t) return 0;                    // no history — unknown, treat as neutral
    return t.sinceImprovement === 0 ? -1 : t.sinceImprovement;
  };
  return [...candidates].sort((a, b) =>
    climb(a) - climb(b) ||
    b.unblocks - a.unblocks ||
    a.priority - b.priority ||
    a.id.localeCompare(b.id));
}

// ------------------------------------------------------------------ driver --
// Guarded, because the selftest imports `decide` and a driver that ran on
// import would read the real ledger and write real work orders from a test.

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();

function main() {
const config = JSON.parse(read(join(LOOP_DIR, 'config.json')) || '{}');
const { beads } = parseLedger(read(join(LOOP_DIR, 'beads.jsonl')));
const turns = jsonl(read(TURNS));
const runs = jsonl(read(join(LOOP_DIR, 'runs.jsonl')));
// The bead ids that already have a work order on disk — not just how many.
// The count bounds concurrency; the identities stop a re-dispatch.
const openOrders = existsSync(WORK_DIR)
  ? readdirSync(WORK_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
  : [];

const decision = decide({ config, beads, turns, runs, openOrders, now: process.env.LOOP_NOW || undefined });

// PROGRESS GOES TO STDERR, ALWAYS. Under --json, stdout is a machine channel
// the workflow redirects into a file and parses — one stray human sentence
// after the closing brace and the parse dies, which is exactly how the plan
// seat's first halt printed "Loop halted — " with no reason.
const note = (msg) => process.stderr.write(`${msg}\n`);

if (asJson) console.log(JSON.stringify(decision, null, 2));
else {
  console.log(`\n${decision.act === 'halt' ? '⏹ HALT' : '▶ DISPATCH'} — ${decision.reason}`);
  if (decision.detail) console.log(`  ${decision.detail}`);
  for (const d of decision.dispatch) console.log(`  → turn ${d.turn}: ${d.bead}  ${d.title}`);
  console.log('');
}

// A STARVED QUEUE STAFFS THE PLANNER. Writing this file is what wakes
// loop-plan; nothing else creates one. Note what it is NOT: a dispatch. The
// planner proposes, a human promotes, and only then does the fleet get work —
// so this path adds supply without touching gain.
if (write && decision.needsPlan) {
  const dir = join(LOOP_DIR, 'plan');
  mkdirSync(dir, { recursive: true });
  const at = process.env.LOOP_NOW || new Date().toISOString();
  writeFileSync(join(dir, 'request.json'),
    JSON.stringify({ reason: decision.reason, detail: decision.detail, at }, null, 2) + '\n');
  note('wrote .github/loop/plan/request.json — staffing a plan seat');
}

if (write && decision.act === 'dispatch') {
  mkdirSync(WORK_DIR, { recursive: true });
  const at = process.env.LOOP_NOW || new Date().toISOString();
  for (const d of decision.dispatch) {
    // The work order is the chain-reaction token: committing it under
    // .github/loop/work/ is what wakes loop-work.yml. Nothing else creates one.
    writeFileSync(join(WORK_DIR, `${d.bead}.json`), JSON.stringify({ ...d, issued: at }, null, 2) + '\n');
    note(`wrote .github/loop/work/${d.bead}.json`);

    // ── THE METER, AT THE POINT OF SPEND ──────────────────────────────────
    // Written here, in the same breath as the work order, because this is the
    // moment the money is committed. It must not depend on the judge, on the
    // turn succeeding, or on anything downstream running at all — every one of
    // those is allowed to fail, and none of them may take the brake with it.
    const cur = read(TURNS);
    appendFileSync(TURNS, (cur.length && !cur.endsWith('\n') ? '\n' : '')
      + JSON.stringify({ turn: d.turn, bead: d.bead, at, artifact: d.artifact ?? null }) + '\n');
    note(`metered turn ${d.turn} → .github/loop/turns.jsonl`);
  }
}

// The exit code is the workflow's branch. 0 = dispatch, 3 = halt-by-design.
// NOT 1: a halt is a CORRECT outcome — a red run every time a stop condition
// works is how a team learns to ignore red runs.
process.exitCode = decision.act === 'halt' ? 3 : 0;
}
