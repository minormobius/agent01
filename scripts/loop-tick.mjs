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

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { parseLedger, computeGraph, readyQueue } from './lib/beads.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const write = argv.includes('--write');

const LOOP_DIR = join(ROOT, '.github', 'loop');
const WORK_DIR = join(LOOP_DIR, 'work');

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
export function decide({ config, beads, runs, now = new Date().toISOString(), openWorkOrders = 0 }) {
  const halt = (reason, detail = '') => ({ act: 'halt', reason, detail, dispatch: [] });

  // 1. THE MASTER SWITCH, first and unconditional.
  if (config.enabled !== true) {
    return halt('disabled', 'enabled is false in .github/loop/config.json — this is the default and turning it on is a signed commit');
  }

  const budget = config.budget ?? {};
  const stop = config.stop ?? {};
  const graph = computeGraph(beads);
  const queue = readyQueue(graph);

  // 2. THE HARD STOP. A controller with a bug is still a loop; this is the
  //    backstop that does not depend on the controller being right.
  const turns = runs.length;
  if (budget.hardStopTurns != null && turns >= budget.hardStopTurns) {
    return halt('hard stop', `${turns} turns recorded, hardStopTurns is ${budget.hardStopTurns}`);
  }

  // 3. THE DAILY GAUGE. Rolling 24h, not calendar-day: a calendar boundary lets
  //    a run at 23:50 and another at 00:10 spend two days' budget in twenty
  //    minutes, which is exactly the shape of an overnight runaway.
  const cutoff = Date.parse(now) - 24 * 3600 * 1000;
  const today = runs.filter((r) => r.at && Date.parse(r.at) >= cutoff).length;
  if (budget.turnsPerDay != null && today >= budget.turnsPerDay) {
    return halt('daily budget spent', `${today} turns in the last 24h, turnsPerDay is ${budget.turnsPerDay}`);
  }

  // 4. CONCURRENCY. Work orders on disk count as well as in-progress beads: an
  //    order written but not yet picked up is committed spend.
  const inFlight = graph.nodes.filter((n) => n.status === 'in_progress').length + openWorkOrders;
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
    return stop.emptyReadyQueue === false
      ? halt('nothing to do', 'ready queue is empty')
      : halt('empty ready queue', 'nothing is schedulable — promote a proposal by hand, or the run is over');
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
    turn: turns + 1,
  }));

  return {
    act: 'dispatch',
    reason: 'capacity and work available',
    detail: `${turns} turns so far, ${today} in the last 24h, ${live.length} schedulable${retired.size ? `, ${retired.size} artifact(s) retired` : ''}`,
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
const runs = jsonl(read(join(LOOP_DIR, 'runs.jsonl')));
const openWorkOrders = existsSync(WORK_DIR) ? readdirSync(WORK_DIR).filter((f) => f.endsWith('.json')).length : 0;

const decision = decide({ config, beads, runs, openWorkOrders, now: process.env.LOOP_NOW || undefined });

if (asJson) console.log(JSON.stringify(decision, null, 2));
else {
  console.log(`\n${decision.act === 'halt' ? '⏹ HALT' : '▶ DISPATCH'} — ${decision.reason}`);
  if (decision.detail) console.log(`  ${decision.detail}`);
  for (const d of decision.dispatch) console.log(`  → turn ${d.turn}: ${d.bead}  ${d.title}`);
  console.log('');
}

if (write && decision.act === 'dispatch') {
  mkdirSync(WORK_DIR, { recursive: true });
  for (const d of decision.dispatch) {
    // The work order is the chain-reaction token: committing it under
    // .github/loop/work/ is what wakes loop-work.yml. Nothing else creates one.
    writeFileSync(join(WORK_DIR, `${d.bead}.json`), JSON.stringify({ ...d, issued: process.env.LOOP_NOW || new Date().toISOString() }, null, 2) + '\n');
    console.log(`wrote .github/loop/work/${d.bead}.json`);
  }
}

// The exit code is the workflow's branch. 0 = dispatch, 3 = halt-by-design.
// NOT 1: a halt is a CORRECT outcome — a red run every time a stop condition
// works is how a team learns to ignore red runs.
process.exitCode = decision.act === 'halt' ? 3 : 0;
}
