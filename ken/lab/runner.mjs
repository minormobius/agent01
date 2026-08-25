/* ─────────────────────────────────────────────────────────────────────
   ken/lab/runner.mjs — a six-turn verification-first run, executed.

   ── WHY THIS IS NOT loop-work.yml ────────────────────────────────────

   The loop's turns are granted Read, Write, Edit, Glob and Grep, and
   denied Bash, WebSearch, WebFetch and subagents. That is not timidity
   about the model. It is about the PROVENANCE OF THE PROMPT: the loop
   assembles its brief from a ticket graph that outside parties can push
   into, so the grant has to survive a brief nobody in this repo wrote.

   A bank run has the opposite provenance. Its brief is `statement.md`,
   a committed file with an author and a diff, and the run is started by
   hand. Same model, different threat model, so a different grant is the
   correct answer rather than an inconsistency:

       TOOL GRANT FOLLOWS THE PROVENANCE OF THE PROMPT, NOT THE MODEL.

   So a turn here gets what `bakeoff/run-cell.sh` already gives a cell —
   bash, network, subagents — because that is the instrument H10 needs.
   A turn that cannot execute cannot re-run a check, and a check that is
   read rather than run is a REMEMBERED check, which attenuates like
   everything else and would make H10 untestable by construction.

   ── ISOLATION IS THE EXPERIMENT ──────────────────────────────────────

   R16, and WP2 §10b: under `lineage` or `shared` the ken ratio is 1 for
   every turn of every shape and the whole question dissolves. So each
   turn gets a FRESH tree holding exactly what its in-edges hand it and
   nothing else. No repository, no history, no other lane's work.

   And the demonstration is not optional. `plantMarker` puts a token in
   one turn's output that a later turn has no edge from; if that token
   appears downstream, the run leaked and its numbers are void rather
   than null.

   ── WHAT A RUN MEASURES ──────────────────────────────────────────────

   The integrated artefact is scored by the BANK's checks, which nobody
   in the run has seen — the held-out scorer H11 requires. But the more
   interesting measurement is of the run's OWN checks, because the bank
   can score those too:

     the run's check against the bank's reference   -> SOUNDNESS, u
     the run's check against the bank's mutants     -> COVERAGE,  c

   That is a direct measurement of WP4's two unmeasured parameters, from
   a real turn, and it costs nothing beyond the run itself.

   ── RUNNING IT ───────────────────────────────────────────────────────

     node ken/lab/runner.mjs --task tb-001-binomial-interval --dry-run
     node ken/lab/runner.mjs --task tb-001-binomial-interval   # spends money

   `--dry-run` executes the whole plan with a scripted agent: the trees,
   the isolation, the leak demonstration, the scoring and the ledger all
   run for real. Only the model call is replaced, which is what makes the
   harness testable without an API key.
   ───────────────────────────────────────────────────────────────────── */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTask, runCheck, TASKS_DIR } from './taskbank.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The six turns, their duties, and — the part that makes this a run
 * rather than a script — what each one's tree contains.
 *
 * `reads` names artefacts by the turn that produced them, so the tree is
 * derived from the graph rather than declared twice. `briefBuilder`
 * toggles WP4's first open question: whether a builder sees the original
 * problem beside its check. It is a flag because it changes four of the
 * six derived roles, so the two settings are different designs.
 */
export function plan({ briefBuilder = false } = {}) {
  const turns = [
    { id: 'setup', duty: 'split', reads: [], writes: ['brief-a.md', 'brief-b.md'], statement: true },
    { id: 'specA', duty: 'specify', reads: ['brief-a.md'], writes: ['check-a.mjs'] },
    { id: 'specB', duty: 'specify', reads: ['brief-b.md'], writes: ['check-b.mjs'] },
    { id: 'buildA', duty: 'build', reads: ['check-a.mjs'], writes: ['solution-a.mjs'] },
    { id: 'buildB', duty: 'build', reads: ['check-b.mjs'], writes: ['solution-b.mjs'] },
    {
      id: 'integrate',
      duty: 'integrate',
      reads: ['solution-a.mjs', 'solution-b.mjs', 'check-a.mjs', 'check-b.mjs'],
      writes: ['solution.mjs'],
    },
  ];
  if (briefBuilder) {
    turns.find((t) => t.id === 'buildA').reads.unshift('brief-a.md');
    turns.find((t) => t.id === 'buildB').reads.unshift('brief-b.md');
  }
  return { turns, briefBuilder, shape: 'standard', profile: [1, 2, 2, 1] };
}

/** Which turn produced which artefact, for the isolation check. */
export function producerOf(p) {
  const m = new Map();
  for (const t of p.turns) for (const w of t.writes) m.set(w, t.id);
  return m;
}

/**
 * The marker a turn plants so isolation can be DEMONSTRATED rather than
 * asserted. specA plants it; buildB has no path from specA, so if the
 * token reaches buildB's output the plan was not enforced.
 */
export const MARKER_TURN = 'specA';
export const MARKER_BLIND = 'buildB';
export const marker = (runId) => `KEN-ISOLATION-${runId}`;

/** Turns with no path from `from`, by the plan's own edges. */
export function blindTo(p, from) {
  const producer = producerOf(p);
  const reach = new Set([from]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of p.turns) {
      if (reach.has(t.id)) continue;
      if (t.reads.some((r) => reach.has(producer.get(r)))) { reach.add(t.id); grew = true; }
    }
  }
  return p.turns.map((t) => t.id).filter((id) => !reach.has(id));
}

/**
 * The brief handed to one turn: the task statement, its duty, and the
 * artefacts its in-edges supply. Nothing about the run, the other lanes,
 * or the bank.
 */
export function brief(p, turn, { statement, runId, artefacts }) {
  const lines = [`# Your job: ${turn.duty}`, ''];
  if (turn.statement) lines.push('## The task', '', statement, '');
  else lines.push('## Context', '', 'You are one turn of a larger effort. What you have been given below is',
    'everything you get. Do not ask for more; nobody will answer.', '');

  if (turn.reads.length) {
    lines.push('## What you have been handed', '');
    for (const r of turn.reads) {
      lines.push(`### ${r}`, '', '```', artefacts[r] ?? '(missing)', '```', '');
    }
  }
  lines.push('## What to produce', '');
  for (const w of turn.writes) lines.push(`- \`${w}\``);
  lines.push('',
    'Write those files in the working directory. Node ES modules, no dependencies,',
    'no network access needed by the artefact itself. You may run anything you like',
    'while working.', '');
  if (turn.id === MARKER_TURN) {
    lines.push(`Record the token ${marker(runId)} in a comment at the top of every file you write.`, '');
  }
  lines.push('You are running non-interactively. Make the call, do the work, and stop.');
  return lines.join('\n');
}

/**
 * Invoke one turn. Replaced wholesale in a dry run, which is how the
 * plan, the isolation and the scoring get tested without a key.
 */
export function realAgent({ dir, promptFile, model, maxTurns, budgetUsd }) {
  const r = spawnSync('claude', [
    '-p', '--dangerously-skip-permissions',
    '--model', model,
    '--max-turns', String(maxTurns),
    '--max-budget-usd', String(budgetUsd),
    '--output-format', 'stream-json', '--verbose',
  ], { cwd: dir, input: readFileSync(promptFile, 'utf8'), encoding: 'utf8', timeout: 1800000 });
  return { code: r.status, log: (r.stdout ?? '') + (r.stderr ?? '') };
}

/**
 * Execute the plan.
 *
 * `agent` defaults to the real one. Pass a function to script it; the
 * signature is the same, and everything else in this file behaves
 * identically, which is the point.
 */
export function execute({
  taskId, root, runId = 'dry', agent = realAgent, briefBuilder = false,
  model = 'claude-opus-5', maxTurns = 60, budgetUsd = 5,
} = {}) {
  const task = readTask(taskId);
  const statement = readFileSync(join(task.dir, 'statement.md'), 'utf8');
  const p = plan({ briefBuilder });
  const producer = producerOf(p);

  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });

  const artefacts = {};                  // name -> contents, the run's whole memory
  const turnLog = [];

  for (const turn of p.turns) {
    const dir = join(root, turn.id);
    mkdirSync(dir, { recursive: true });

    /* THE TREE IS THE IN-EDGES AND NOTHING ELSE. A missing artefact is
       recorded rather than silently skipped: it means an upstream turn
       did not produce what the plan says it produces, which is a run
       fault and not a turn's fault. */
    const missing = turn.reads.filter((r) => artefacts[r] === undefined);
    for (const r of turn.reads) {
      if (artefacts[r] !== undefined) writeFileSync(join(dir, r), artefacts[r]);
    }

    const promptFile = join(dir, '_brief.md');
    writeFileSync(promptFile, brief(p, turn, { statement, runId, artefacts }));

    const started = Date.now();
    const res = agent({ dir, promptFile, model, maxTurns, budgetUsd, turn, artefacts, runId });
    const elapsed = Math.round((Date.now() - started) / 1000);

    const produced = {};
    for (const w of turn.writes) {
      const f = join(dir, w);
      if (existsSync(f)) { produced[w] = readFileSync(f, 'utf8'); artefacts[w] = produced[w]; }
    }
    turnLog.push({
      turn: turn.id, duty: turn.duty, reads: [...turn.reads], writes: [...turn.writes],
      missingInputs: missing, produced: Object.keys(produced),
      wrote: turn.writes.filter((w) => produced[w] !== undefined).length,
      exit: res.code, seconds: elapsed,
    });
  }

  return {
    taskId, runId, plan: p, artefacts, turns: turnLog,
    isolation: auditIsolation(p, artefacts, runId),
    scores: score(taskId, artefacts),
  };
}

/**
 * DEMONSTRATE isolation rather than assert it. The marker planted in
 * specA's output must not appear in any turn the plan gives no path
 * from. A leak voids the run.
 */
export function auditIsolation(p, artefacts, runId) {
  const tok = marker(runId);
  const blind = blindTo(p, MARKER_TURN);
  const producer = producerOf(p);
  const leaks = [];
  for (const [name, body] of Object.entries(artefacts)) {
    const by = producer.get(name);
    if (blind.includes(by) && String(body).includes(tok)) leaks.push({ artefact: name, producedBy: by });
  }
  const planted = Object.entries(artefacts)
    .some(([n, b]) => producer.get(n) === MARKER_TURN && String(b).includes(tok));
  return {
    marker: tok, blindTurns: blind, planted, leaks,
    clean: leaks.length === 0,
    demonstrated: planted && leaks.length === 0,
    note: planted ? null : 'the marker was never planted, so isolation is UNDEMONSTRATED rather than clean',
  };
}

/**
 * Score the run against the bank, which nobody in it has seen.
 *
 * Two quantities, and the second is the one WP4 has been waiting for:
 * the run's own checks, graded for soundness and coverage by the bank's
 * reference and mutants.
 */
export function score(taskId, artefacts) {
  const task = readTask(taskId);
  const tmp = join(HERE, '.runscore');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  // (1) the integrated artefact against the bank's held-out checks
  let held = null;
  if (artefacts['solution.mjs'] !== undefined) {
    writeFileSync(join(tmp, 'candidate.mjs'), artefacts['solution.mjs']);
    held = task.checks.map((c) => {
      const r = runCheck(task.dir, c, join(tmp, 'candidate.mjs'));
      return { check: c, passed: r.passed };
    });
  }

  // (2) the run's OWN checks, graded by the bank's reference and mutants
  const own = [];
  for (const name of Object.keys(artefacts).filter((n) => /^check-[a-z]\.mjs$/.test(n))) {
    const cf = join(tmp, name);
    writeFileSync(cf, artefacts[name]);
    const sound = runCheck(tmp, name, join(task.dir, 'reference.mjs')).passed;
    const kills = task.mutants.map((m) => ({
      mutant: m,
      killed: !runCheck(tmp, name, join(task.dir, 'mutants', m)).passed,
    }));
    const stubRejected = existsSync(join(task.dir, 'stub.mjs'))
      ? !runCheck(tmp, name, join(task.dir, 'stub.mjs')).passed : null;
    own.push({
      check: name,
      sound,                                     // WP4's u, inverted, per check
      coverage: task.mutants.length ? round(kills.filter((k) => k.killed).length / task.mutants.length) : null,
      stubRejected,
      kills,
    });
  }
  rmSync(tmp, { recursive: true, force: true });

  return {
    heldOut: held,
    heldOutPassed: held === null ? null : held.every((h) => h.passed),
    ownChecks: own,
    /* The measurement this whole apparatus exists for. */
    measuredSoundness: own.length ? round(own.filter((o) => o.sound).length / own.length) : null,
    measuredCoverage: own.length ? round(own.reduce((a, o) => a + (o.coverage ?? 0), 0) / own.length) : null,
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

/**
 * A scripted agent for the dry run: it produces the plan's artefacts
 * from the bank, so the harness exercises every path with known content.
 * It is NOT a solver and must never be mistaken for one — it copies the
 * answers in, which is exactly why a dry run measures the harness and
 * reports nothing about agents.
 */
export function scriptedAgent(taskId) {
  const task = readTask(taskId);
  return ({ dir, turn, runId }) => {
    const put = (name, body) => writeFileSync(join(dir, name), body);
    const head = turn.id === MARKER_TURN ? `/* ${marker(runId)} */\n` : '';
    if (turn.id === 'setup') {
      put('brief-a.md', '# effort A\n\nThe estimator.\n');
      put('brief-b.md', '# effort B\n\nThe property.\n');
    } else if (turn.id === 'specA') {
      put('check-a.mjs', head + readFileSync(join(task.dir, 'check-a.mjs'), 'utf8'));
    } else if (turn.id === 'specB') {
      put('check-b.mjs', readFileSync(join(task.dir, 'check-b.mjs'), 'utf8'));
    } else if (turn.id === 'buildA' || turn.id === 'buildB') {
      put(turn.writes[0], readFileSync(join(task.dir, 'reference.mjs'), 'utf8'));
    } else if (turn.id === 'integrate') {
      put('solution.mjs', readFileSync(join(task.dir, 'reference.mjs'), 'utf8'));
    }
    return { code: 0, log: `scripted: ${turn.id}` };
  };
}

// ── CLI ───────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (n, d) => {
    const i = process.argv.indexOf(`--${n}`);
    return i === -1 ? d : (process.argv[i + 1]?.startsWith('--') ? true : process.argv[i + 1]);
  };
  const taskId = arg('task', 'tb-001-binomial-interval');
  const dry = process.argv.includes('--dry-run');
  const runId = String(arg('run-id', dry ? 'dry' : `r${process.pid}`));
  const root = String(arg('root', join(HERE, '.run', runId)));

  if (!dry && !process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    console.error('runner: no credential in the environment. Use --dry-run to exercise the harness.');
    process.exit(2);
  }

  const out = execute({
    taskId, root, runId,
    agent: dry ? scriptedAgent(taskId) : realAgent,
    briefBuilder: process.argv.includes('--brief-builder'),
    model: String(arg('model', 'claude-opus-5')),
    maxTurns: Number(arg('max-turns', 60)),
    budgetUsd: Number(arg('budget', 5)),
  });

  /* THE RECORD IS WRITTEN BEFORE ANYTHING IS DECIDED. A run whose
     verdict step fails must still leave its ledger, or a leaked run and
     a crashed one look the same afterwards, which is the failure the
     loop's empty-transcript guard was added for. */
  const ledger = arg('ledger', null);
  if (ledger && ledger !== true) {
    mkdirSync(dirname(String(ledger)), { recursive: true });
    writeFileSync(String(ledger), JSON.stringify(out, null, 2));
    console.log(`\n  record     ${ledger}`);
  }

  console.log(`\n${taskId} · run ${runId}${dry ? ' · DRY (scripted agent, measures the harness only)' : ''}`);
  for (const t of out.turns) {
    console.log(`  ${t.turn.padEnd(10)} ${t.duty.padEnd(10)} reads ${t.reads.length}  wrote ${t.wrote}/${t.writes.length}  ${t.seconds}s  exit ${t.exit}`);
  }
  const i = out.isolation;
  console.log(`\n  isolation  ${i.demonstrated ? 'DEMONSTRATED' : i.clean ? 'clean but undemonstrated' : 'LEAKED'}`);
  console.log(`             marker planted: ${i.planted}; blind turns: ${i.blindTurns.join(', ') || 'none'}; leaks: ${i.leaks.length}`);
  const s = out.scores;
  console.log(`\n  held-out   ${s.heldOutPassed === null ? 'no solution produced' : s.heldOutPassed ? 'PASSED' : 'failed'}`);
  for (const o of s.ownChecks) {
    console.log(`  ${o.check.padEnd(12)} sound ${o.sound}  coverage ${o.coverage}  stub rejected ${o.stubRejected}`);
  }
  console.log(`\n  MEASURED   soundness ${s.measuredSoundness}  coverage ${s.measuredCoverage}`);
  if (dry) console.log('  (a dry run copies the bank in, so these are the harness working, not a result)');

  const ok = out.isolation.clean && out.turns.every((t) => t.wrote === t.writes.length);
  process.exit(ok ? 0 : 1);
}
