/* ken/lab/runner.selftest.mjs — the harness must fail on a leak.

   This file gates the thing that will spend money, so what it checks is
   not that a good run passes. It is that a BAD run is caught:

     a turn handed something the plan does not give it
     a marker reaching a turn with no path from where it was planted
     an isolation audit that says "clean" when nothing was ever planted
     a check that grades a correct solution wrong
     a turn that writes nothing

   Every one of those is exercised against a scripted agent that commits
   the fault on purpose, because a guard nobody has seen say no is a
   guard nobody has tested. */

import {
  plan, producerOf, blindTo, brief, execute, score, auditIsolation,
  scriptedAgent, marker, MARKER_TURN, MARKER_BLIND,
} from './runner.mjs';
import { readTask } from './taskbank.mjs';
import { rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '.selftest-run');
const TASK = 'tb-001-binomial-interval';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`  ✗ ${m}`); } };
const section = (s) => console.log(`\n${s}`);
const clean = () => rmSync(ROOT, { recursive: true, force: true });

// ── 1. the plan is the shape WP2 catalogued ───────────────────────────
section('the plan');

{
  const p = plan();
  ok(p.turns.length === 6, 'six turns');
  ok(p.shape === 'standard' && p.profile.join(',') === '1,2,2,1', 'and it is standard, [1,2,2,1]');
  ok(p.turns.filter((t) => t.duty === 'specify').length === 2, 'two specify turns');
  ok(p.turns.filter((t) => t.duty === 'build').length === 2, 'two build turns');

  /* EVERY ARTEFACT A TURN READS MUST BE PRODUCED BY AN EARLIER TURN. A
     plan that reads something nobody writes would hand a turn "(missing)"
     and carry on, which is how a run reports work that never happened. */
  const producer = producerOf(p);
  const seen = new Set();
  for (const t of p.turns) {
    for (const r of t.reads) {
      ok(producer.has(r), `${t.id} reads ${r}, which some turn produces`);
      ok(seen.has(r), `${t.id} reads ${r}, which an EARLIER turn produces`);
    }
    for (const w of t.writes) seen.add(w);
  }
  ok(producer.size === 7, 'seven artefacts across the run');
}

{
  // the wiring flag really is a different graph
  const a = plan(), b = plan({ briefBuilder: true });
  const readsA = a.turns.find((t) => t.id === 'buildA').reads;
  const readsB = b.turns.find((t) => t.id === 'buildA').reads;
  ok(readsA.length === 1 && readsB.length === 2, 'briefBuilder gives the builder a second in-edge');
  ok(blindTo(a, MARKER_TURN).includes(MARKER_BLIND), `${MARKER_BLIND} has no path from ${MARKER_TURN}`);
  ok(!blindTo(a, MARKER_TURN).includes('integrate'), 'while the integrator does have one');
  ok(blindTo(a, MARKER_TURN).includes('setup'), 'and setup, being upstream, is blind to it');
}

// ── 2. the brief hands over the in-edges and NOTHING else ─────────────
section('the brief');

{
  const p = plan();
  const task = readTask(TASK);
  const statement = readFileSync(join(task.dir, 'statement.md'), 'utf8');
  const artefacts = { 'brief-a.md': 'AAA', 'brief-b.md': 'BBB', 'check-a.mjs': 'CHECKA', 'check-b.mjs': 'CHECKB' };

  const specA = brief(p, p.turns.find((t) => t.id === 'specA'), { statement, runId: 'x', artefacts });
  ok(specA.includes('AAA'), 'specA is handed brief-a');
  ok(!specA.includes('BBB'), 'and NOT brief-b, which it has no edge from');
  ok(!specA.includes('Clopper'), 'and not the task statement, which only setup gets');
  ok(specA.includes(marker('x')), 'and it is told to plant the marker');

  const buildB = brief(p, p.turns.find((t) => t.id === 'buildB'), { statement, runId: 'x', artefacts });
  ok(buildB.includes('CHECKB') && !buildB.includes('CHECKA'), 'buildB sees its own check and not the other lane`s');
  ok(!buildB.includes(marker('x')), 'and is never told the marker exists');

  const setup = brief(p, p.turns[0], { statement, runId: 'x', artefacts });
  ok(setup.includes('Clopper'), 'setup gets the statement');
  ok(!/reference|mutant|stub/i.test(setup), 'and no brief mentions the reference, the mutants or the stub');
}

// ── 3. A CLEAN RUN, end to end ────────────────────────────────────────
section('a clean run');

let CLEAN;
{
  clean();
  CLEAN = execute({ taskId: TASK, root: ROOT, runId: 'clean', agent: scriptedAgent(TASK) });
  ok(CLEAN.turns.length === 6, 'six turns executed');
  ok(CLEAN.turns.every((t) => t.wrote === t.writes.length), 'every turn produced what the plan says');
  ok(CLEAN.turns.every((t) => t.missingInputs.length === 0), 'and every input was there when needed');
  ok(CLEAN.isolation.demonstrated, 'isolation is DEMONSTRATED, not merely asserted');
  ok(CLEAN.isolation.planted && CLEAN.isolation.leaks.length === 0, 'the marker was planted and did not travel');
  ok(CLEAN.scores.heldOutPassed === true, 'the artefact passes the bank`s held-out checks');
  ok(CLEAN.scores.measuredSoundness === 1, 'the run`s own checks are sound against the bank reference');
  ok(CLEAN.scores.measuredCoverage === 0.833, `and score ${CLEAN.scores.measuredCoverage} against its mutants`);
  ok(CLEAN.scores.ownChecks.every((o) => o.stubRejected), 'and reject the do-nothing stub');
  clean();
}

// ── 4. A LEAK MUST BE CAUGHT. The reason this file exists. ────────────
section('the leak');

{
  clean();
  /* An agent that smuggles the marker into a turn with no path from
     where it was planted. Under a correct harness this cannot happen;
     the harness must NOTICE when it does. */
  const base = scriptedAgent(TASK);
  const leaky = (ctx) => {
    const r = base(ctx);
    if (ctx.turn.id === MARKER_BLIND) {
      const f = join(ctx.dir, ctx.turn.writes[0]);
      writeFileSync(f, `/* ${marker(ctx.runId)} */\n` + readFileSync(f, 'utf8'));
    }
    return r;
  };
  const leaked = execute({ taskId: TASK, root: ROOT, runId: 'leak', agent: leaky });
  ok(!leaked.isolation.clean, 'a leaked run is NOT reported clean');
  ok(!leaked.isolation.demonstrated, 'nor demonstrated');
  ok(leaked.isolation.leaks.length === 1, `and the leak is counted (${leaked.isolation.leaks.length})`);
  ok(leaked.isolation.leaks[0].producedBy === MARKER_BLIND,
    `and attributed to the turn that leaked (${leaked.isolation.leaks[0]?.producedBy})`);
  ok(leaked.scores.heldOutPassed === true,
    'and the artefact still passes, which is exactly why passing is not enough on its own');
  clean();
}

// ── 5. an unplanted marker is UNDEMONSTRATED, not clean ───────────────
section('the silent case');

{
  const p = plan();
  const a = auditIsolation(p, { 'check-a.mjs': 'no token here', 'solution-b.mjs': 'nor here' }, 'q');
  ok(a.clean, 'with no leak the run is clean');
  ok(!a.demonstrated, 'but NOT demonstrated, because nothing was planted');
  ok(/UNDEMONSTRATED/.test(a.note), 'and the report says so rather than implying a pass');
}

// ── 6. a turn that writes nothing is recorded as such ─────────────────
section('the silent turn');

{
  clean();
  const base = scriptedAgent(TASK);
  const lazy = (ctx) => (ctx.turn.id === 'specB' ? { code: 0, log: 'wrote nothing' } : base(ctx));
  const r = execute({ taskId: TASK, root: ROOT, runId: 'lazy', agent: lazy });
  const specB = r.turns.find((t) => t.turn === 'specB');
  ok(specB.wrote === 0, 'a turn that produced nothing is recorded as producing nothing');
  const buildB = r.turns.find((t) => t.turn === 'buildB');
  ok(buildB.missingInputs.includes('check-b.mjs'), 'and its successor records the missing input');
  ok(r.scores.ownChecks.length === 1, 'only the one check that exists is scored');
  clean();
}

// ── 7. THE SCORER MUST REJECT A WRONG SOLUTION ────────────────────────
section('the scorer');

{
  const task = readTask(TASK);
  const stub = readFileSync(join(task.dir, 'stub.mjs'), 'utf8');
  const good = readFileSync(join(task.dir, 'reference.mjs'), 'utf8');
  const checkA = readFileSync(join(task.dir, 'check-a.mjs'), 'utf8');

  const bad = score(TASK, { 'solution.mjs': stub, 'check-a.mjs': checkA });
  ok(bad.heldOutPassed === false, 'the do-nothing stub FAILS the held-out checks');

  const fine = score(TASK, { 'solution.mjs': good });
  ok(fine.heldOutPassed === true, 'and a correct solution passes');
  ok(fine.ownChecks.length === 0 && fine.measuredCoverage === null,
    'a run that wrote no checks has no measured coverage, rather than a coverage of zero');

  /* AN UNSOUND CHECK IS THE FAILURE WP4 IS ABOUT: one that fails a
     correct solution. The scorer must report it rather than treat it as
     a strong check. */
  const unsound = score(TASK, { 'check-a.mjs': 'process.exit(1);' });
  ok(unsound.ownChecks[0].sound === false, 'a check that rejects the reference is reported UNSOUND');
  ok(unsound.ownChecks[0].coverage === 1,
    'even though it "kills" every mutant, which is why soundness is reported beside coverage');
  ok(unsound.measuredSoundness === 0, 'and the run`s measured soundness is 0');

  // a check that passes everything is the probe ceiling in miniature
  const useless = score(TASK, { 'check-a.mjs': 'process.exit(0);' });
  ok(useless.ownChecks[0].sound === true, 'a check that passes everything looks sound');
  ok(useless.ownChecks[0].coverage === 0, 'but has coverage 0');
  ok(useless.ownChecks[0].stubRejected === false, 'and does not reject the stub, which is what catches it');
}

// ── 8. the harness leaves nothing behind ──────────────────────────────
section('hygiene');

ok(!existsSync(ROOT), 'no scratch tree survives the selftest');
ok(!existsSync(join(HERE, '.runscore')), 'and the scorer cleans up after itself');

console.log(`\n${fail === 0 ? '✓' : '✗'} runner ${fail === 0 ? 'passed' : 'FAILED'} — ${fail === 0 ? pass : `${fail} of ${pass + fail}`} checks`);
process.exit(fail === 0 ? 0 : 1);
