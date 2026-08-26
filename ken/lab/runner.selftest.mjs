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
  scriptedAgent, marker, MARKER_TURN, MARKER_BLIND, SHAPES,
  ENGINES, PAID_ENGINES, FREE_MODELS, ZEN_BASE, opencodeConfig,
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

// ── 8. THE SOLO SHAPE, which is H12's other arm ───────────────────────
section('solo');

{
  const p = plan({ shape: 'solo' });
  ok(p.shape === 'solo' && p.turns.length === 1, 'solo is one turn');
  ok(p.turns[0].writes.length === 3, 'and it produces everything the six-turn shape does');
  ok(p.turns[0].reads.length === 0, 'reading nothing, because there is no predecessor');
  ok(p.turns[0].mayFanOut === true, 'and it is permitted to fan out');
  ok(SHAPES.includes('solo') && SHAPES.includes('standard'), 'both shapes are declared');

  let threw = false;
  try { plan({ shape: 'chain' }); } catch { threw = true; }
  ok(threw, 'and an unknown shape is REFUSED rather than silently treated as standard');

  /* THE BRIEF MUST SAY IT MAY DELEGATE. H12 requires it: a solo turn
     that does not fan out is a chain of one and tests nothing. */
  const task = readTask(TASK);
  const statement = readFileSync(join(task.dir, 'statement.md'), 'utf8');
  const b = brief(p, p.turns[0], { statement, runId: 'x', artefacts: {} });
  ok(/subagent/i.test(b) && /Delegate freely/.test(b), 'the solo brief tells it to delegate');
  ok(!brief(plan(), plan().turns[0], { statement, runId: 'x', artefacts: {} }).includes('Delegate freely'),
    'and no standard turn is told that, because a standard turn is one stage');
  ok(!b.includes(marker('x')), 'the solo turn is never told the marker exists');
}

{
  /* BUDGET IS HELD AT THE RUN. Comparing shapes at a per-turn budget
     would give the six-turn arm six times the money, and the contrast
     would be about spend rather than about shape. */
  clean();
  const solo = execute({ taskId: TASK, root: ROOT, runId: 'solo', shape: 'solo',
    agent: scriptedAgent(TASK), totalBudgetUsd: 30, totalMaxTurns: 360 });
  clean();
  const std = execute({ taskId: TASK, root: ROOT, runId: 'std', shape: 'standard',
    agent: scriptedAgent(TASK), totalBudgetUsd: 30, totalMaxTurns: 360 });
  clean();

  ok(solo.spend.totalBudgetUsd === std.spend.totalBudgetUsd,
    `both arms spend the same total (${solo.spend.totalBudgetUsd} against ${std.spend.totalBudgetUsd})`);
  ok(solo.spend.perTurnBudget === 30 && std.spend.perTurnBudget === 5,
    'divided across the turns each shape has');
  ok(solo.spend.perTurnSteps === 360 && std.spend.perTurnSteps === 60, 'and so are the steps');

  ok(solo.turns.length === 1 && std.turns.length === 6, 'one turn against six');
  ok(solo.turns[0].wrote === 3, 'the solo turn produced all three artefacts');
  ok(solo.scores.heldOutPassed === true, 'and its artefact passes the held-out checks');
  ok(solo.scores.ownChecks.length === 2, 'and it wrote two checks, so redundancy is measurable');

  /* ISOLATION IS INAPPLICABLE, NOT CLEAN. A one-turn shape never had
     the opportunity to leak, and crediting it with a property it could
     not have lost is how a regime gets recorded as tested when it was
     not. */
  ok(solo.isolation.applicable === false, 'solo isolation is INAPPLICABLE');
  ok(solo.isolation.demonstrated === false, 'and therefore not demonstrated');
  ok(/INAPPLICABLE/.test(solo.isolation.note), 'and the note says so rather than implying a pass');
  ok(std.isolation.applicable === true && std.isolation.demonstrated,
    'while the six-turn arm demonstrates it, which is what makes the arms comparable');
}

// ── 9. THE FREE ARM. Asserted without touching the network. ───────────
section('the free arm');

{
  /* This repo's rule is that a gate never reaches out, so nothing here
     calls Zen. What is checked is the config the arm WRITES, because
     every property that matters about it is a property of that file. */
  ok(Object.keys(ENGINES).join(',') === 'claude,opencode', 'two engines are registered');
  ok(PAID_ENGINES.includes('claude') && !PAID_ENGINES.includes('opencode'),
    'and only the claude one is marked as costing money');
  ok(FREE_MODELS.length >= 5, `at least five verified free models (${FREE_MODELS.length})`);

  const cfg = opencodeConfig({ model: FREE_MODELS[0], steps: 40 });

  /* THE EMPTY STRING IS THE WHOLE TRICK, and it is the opposite of what
     a careful person writes. Measured against the live endpoint: no
     header and an empty Bearer both return 200 with cost 0, while
     `Bearer none` returns 401. bakeoff's run-cell.sh writes a real key
     reference here, which is correct there and fatal here. */
  ok(cfg.provider.zenfree.options.apiKey === '',
    'the api key is the EMPTY STRING, because a bad key 401s where no key succeeds');
  ok(cfg.provider.zenfree.options.apiKey !== 'none' && !/\{env:/.test(String(cfg.provider.zenfree.options.apiKey)),
    'and is neither a placeholder word nor an env reference');
  ok(cfg.provider.zenfree.options.baseURL === ZEN_BASE, 'it points at the Zen base');

  /* STEPS ARE THE CEILING. `opencode run` has no --max-turns and no
     budget flag, so a run with no steps set would have no stopping rule
     at all — and the stopping rule is the base case of this design, not
     a check beside it. */
  ok(cfg.agent.build.steps === 40, 'the step ceiling reaches agent.build.steps');
  ok(cfg.subagent_depth === 1, 'and the fan-out depth is explicit rather than defaulted');
  ok(cfg.model === `zenfree/${FREE_MODELS[0]}` && cfg.small_model === cfg.model,
    'both model slots are pinned, so no turn silently falls back to a paid one');

  /* THE REFUSALS. A free arm that accepted a paid model id would either
     fail with a confusing 401 or, worse, quietly bill somebody. */
  let threw = false;
  try { opencodeConfig({ model: 'claude-opus-5', steps: 10 }); } catch { threw = true; }
  ok(threw, 'a model outside the verified free list is REFUSED');
  threw = false;
  try { opencodeConfig({ model: FREE_MODELS[0], steps: 0 }); } catch { threw = true; }
  ok(threw, 'and so is a step ceiling of zero, which would be no ceiling');

  threw = false;
  try { execute({ taskId: TASK, root: ROOT, engine: 'gpt' }); } catch { threw = true; }
  ok(threw, 'an unknown engine is refused before any turn runs');
  threw = false;
  try { execute({ taskId: TASK, root: ROOT, engine: 'opencode', model: 'claude-opus-5' }); } catch { threw = true; }
  ok(threw, 'and so is the free engine pointed at a paid model');
  clean();
}

{
  /* THE LEDGER MUST NOT IMPLY A DOLLAR CEILING IT NEVER APPLIED. A free
     run reporting totalBudgetUsd 0 reads as "budgeted at zero and came
     in under", which is not what happened: no dollar ceiling existed
     and the arms were matched on steps instead. */
  clean();
  const free = execute({ taskId: TASK, root: ROOT, runId: 'free', engine: 'opencode',
    model: FREE_MODELS[0], shape: 'solo', agent: scriptedAgent(TASK), totalMaxTurns: 120 });
  clean();
  const paid = execute({ taskId: TASK, root: ROOT, runId: 'paid', engine: 'claude',
    shape: 'solo', agent: scriptedAgent(TASK), totalBudgetUsd: 30, totalMaxTurns: 120 });
  clean();

  ok(free.spend.currency === 'steps' && paid.spend.currency === 'usd',
    'each run records WHICH quantity was held equal');
  ok(free.spend.totalBudgetUsd === null && free.spend.perTurnBudget === null,
    'the free run reports no dollar ceiling rather than a ceiling of zero');
  ok(paid.spend.totalBudgetUsd === 30, 'while the paid run still reports its own');
  ok(free.spend.totalSteps === 120 && paid.spend.totalSteps === 120,
    'and both report total steps, which is what a free comparison matches on');
  ok(free.engine === 'opencode' && free.model === FREE_MODELS[0],
    'the record names the engine and model that produced it');
  ok(paid.engine === 'claude', 'and so does the paid one, so two ledgers cannot be confused');
}

// ── 10. the harness leaves nothing behind ─────────────────────────────
section('hygiene');

ok(!existsSync(ROOT), 'no scratch tree survives the selftest');
ok(!existsSync(join(HERE, '.runscore')), 'and the scorer cleans up after itself');

console.log(`\n${fail === 0 ? '✓' : '✗'} runner ${fail === 0 ? 'passed' : 'FAILED'} — ${fail === 0 ? pass : `${fail} of ${pass + fail}`} checks`);
process.exit(fail === 0 ? 0 : 1);
