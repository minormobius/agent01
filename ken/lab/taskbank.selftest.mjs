/* ken/lab/taskbank.selftest.mjs — the bank's gate must itself be gated.

   The instrument here decides whether a task may be used to measure
   anything, so the failure that matters is an admission gate that admits
   everything. Each of the three conditions is therefore checked in both
   directions: it passes what it should, and it REFUSES what it should,
   demonstrated against real files rather than asserted.

   The refusals are the point. A gate nobody has seen say no is a gate
   nobody has tested, which is the probe-ceiling failure in miniature. */

import { audit, auditAll, runCheck, readTask, taskIds, ADMISSION, TASKS_DIR } from './taskbank.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`  ✗ ${m}`); } };
const section = (s) => console.log(`\n${s}`);

const ID = 'tb-001-binomial-interval';
const DIR = join(TASKS_DIR, ID);

/* One audit, reused. Each one spawns a node process per check per
   candidate, so calling it six times took the gate from four seconds to
   seventy. The report is a pure function of the files, so caching it
   weakens nothing. */
const REPORT = audit(ID);

// ── 1. the bank has a task, and it is complete ────────────────────────
section('the bank');

ok(taskIds().length >= 1, 'at least one task exists');
{
  const t = readTask(ID);
  ok(t.hasStatement && t.hasReference, 'tb-001 has a statement and a reference');
  ok(t.checks.length === 2, `two checks, one per effort (got ${t.checks.length})`);
  ok(t.mutants.length >= ADMISSION.minMutants, `at least ${ADMISSION.minMutants} seeded defects (got ${t.mutants.length})`);

  /* THE STATEMENT MUST NOT LEAK. A turn briefed from it would otherwise
     be hunting rather than working, which is the failure H9 and H10 both
     name as voiding the result. */
  const st = readFileSync(join(DIR, 'statement.md'), 'utf8');
  ok(!/mutant|seeded|defect|reference\.mjs|stub/i.test(st),
    'the statement names no mutant, no seed and no reference');
  ok(!/betaInv|lgamma|Lentz|continued fraction/i.test(st),
    'and gives away no part of the implementation');
  ok(/Clopper/.test(st) && /alpha/.test(st), 'while stating the construction and the parameter, which is the task');
}

// ── 2. SOUND: the reference passes, and an unsound check is caught ────
section('soundness');

{
  const r = REPORT;
  ok(r.sound, 'the reference passes every check, so no check is unsound');
  ok(r.problems.length === 0, `and the audit reports no problems (${r.problems.join('; ')})`);

  /* THE REFUSAL. A check that fails a correct solution must be caught,
     so run one against a deliberately wrong "reference": the stub. If
     the checks passed it, the audit would have to say so. */
  const onStub = r.checks.map((c) => runCheck(DIR, c, './stub.mjs'));
  ok(onStub.every((x) => !x.passed), 'both checks REFUSE the do-nothing stub');
  ok(r.stub.checked && r.stub.allPassed === false, 'and the audit records that they did');
}

// ── 3. DISCERNING: the score is measured, and it is not 1 ─────────────
section('coverage');

{
  const r = REPORT;
  ok(r.coverage === 0.833, `mutation score is 0.833 (got ${r.coverage})`);
  ok(r.survivors.length === 1 && r.survivors[0] === 'm6-large-n.mjs',
    `exactly one seeded defect survives, and it is named (${r.survivors.join(', ')})`);

  /* A SURVIVING MUTANT IS A RESULT. The alternative — shipping only
     mutants that die — would report 1.0 for every task and measure
     nothing, so the bank is asserted NOT to score perfectly here. */
  ok(r.coverage < 1, 'the score is under 1, so the instrument can report a coverage hole');
  ok(r.coverage >= ADMISSION.minCoverage, 'and still clears the admission bar');
  ok(r.admissible, 'so tb-001 is admissible');

  // every other mutant is killed by something
  for (const m of r.matrix) {
    if (m.mutant === 'm6-large-n.mjs') continue;
    ok(m.killed, `${m.mutant} is killed`);
    ok(m.byCheck.some((c) => c.killed), `and some named check killed it`);
  }
}

// ── 4. the survivor is genuinely wrong, not a decoy ───────────────────
section('the survivor');

{
  /* A mutant that survives because it is CORRECT would inflate nothing
     and mean nothing. This one is wrong where the checks do not look. */
  const ref = await import(new URL('./tasks/' + ID + '/reference.mjs', import.meta.url).href);
  const mut = await import(new URL('./tasks/' + ID + '/mutants/m6-large-n.mjs', import.meta.url).href);
  const a = ref.interval(20, 200), b = mut.interval(20, 200);
  ok(Math.abs(a.lower - b.lower) > 0.004 && Math.abs(a.upper - b.upper) > 0.004,
    `the survivor differs materially from the reference at n=200 (${a.lower.toFixed(4)}/${a.upper.toFixed(4)} against ${b.lower.toFixed(4)}/${b.upper.toFixed(4)})`);
  ok(b.upper - b.lower < a.upper - a.lower,
    'and is narrower, which is the direction that would overstate precision');
  // and it agrees where the checks DO look, which is why it survives
  const c = ref.interval(3, 40), d = mut.interval(3, 40);
  ok(Math.abs(c.upper - d.upper) < 1e-9, 'while agreeing exactly at n=40, which is why no check catches it');
}

// ── 5. REDUNDANCY: the two efforts detect the same things ─────────────
section('redundancy');

{
  const r = REPORT;
  /* THE FIRST MEASURED RESULT ABOUT THE VERIFICATION-FIRST PATTERN, and
     it is not the flattering one. Both lanes killed every mutant either
     killed. On this task the two-effort split bought no diversity of
     detection, which is WP4 section 5's correlated failure with checks
     in place of implementations. */
  ok(r.redundancy === 1, `every kill was made by BOTH checks (redundancy ${r.redundancy})`);
  ok(r.checks.length === 2, 'and there really were two of them');
}

// ── 6. the reference is worth promoting, which is the point ───────────
section('what a passing task earns');

{
  const ref = await import(new URL('./tasks/' + ID + '/reference.mjs', import.meta.url).href);
  // the two closed-form corners, by hand, with no special functions
  const a = 0.025;
  ok(Math.abs(ref.interval(0, 10).upper - (1 - a ** 0.1)) < 1e-9, 'x=0 n=10 upper is 1-(alpha/2)^(1/n)');
  ok(Math.abs(ref.interval(10, 10).lower - a ** 0.1) < 1e-9, 'x=n n=10 lower is (alpha/2)^(1/n)');
  ok(ref.interval(0, 10).lower === 0 && ref.interval(10, 10).upper === 1, 'and the far ends are exact');
  // the intervals this programme has been printing without
  const acc = ref.interval(1156, 1200);          // WP3's 96.3% verdict accuracy
  ok(acc.lower > 0.95 && acc.upper < 0.975,
    `WP3's 96.3% over 1200 replications is [${acc.lower.toFixed(4)}, ${acc.upper.toFixed(4)}]`);
  const small = ref.interval(0, 12);
  ok(small.upper > 0.2, `and 0 of 12 is [0, ${small.upper.toFixed(3)}], which is why zero needs an interval`);
}

// ── 7. tb-002, and the reason it exists ───────────────────────────────
section('tb-002 · summon solids');

const T2 = 'tb-002-summon-solids';
const R2 = audit(T2);

{
  /* THE REFERENCE IS PINNED TO THE REAL MODULE. A bank task whose
     reference has drifted from the code it was cut from measures a
     snapshot nobody uses. If foam/solids.mjs changes, this goes red and
     somebody re-pins on purpose. */
  const bank = readFileSync(join(TASKS_DIR, T2, 'reference.mjs'), 'utf8');
  const live = readFileSync(join(TASKS_DIR, '..', '..', '..', 'foam', 'solids.mjs'), 'utf8');
  ok(bank === live, 'tb-002`s reference is byte-identical to foam/solids.mjs');

  ok(R2.sound, 'the reference passes both checks');
  ok(R2.admissible, 'and tb-002 is admissible');
  ok(R2.coverage === 0.875, `mutation score 0.875 (got ${R2.coverage})`);
  ok(R2.survivors.length === 1 && R2.survivors[0] === 'm8-extent-anisotropic.mjs',
    `one survivor, named (${R2.survivors.join(', ')})`);

  /* THE POINT OF tb-002. tb-001 split its two efforts by SUBJECT and got
     redundancy 1.00 — both checks killed everything either killed, so
     the split bought no detection diversity. tb-002 splits by KIND, the
     placement against the checker, and the redundancy falls by more than
     half. That is a design rule the bank can carry forward. */
  ok(R2.redundancy < 0.5, `redundancy ${R2.redundancy}, against tb-001's ${REPORT.redundancy}`);
  ok(R2.redundancy < REPORT.redundancy / 2, 'splitting by kind more than halves it');

  const by = Object.fromEntries(R2.matrix.map((m) => [m.mutant, m.byCheck.map((c) => c.killed)]));
  ok(by['m7-no-validation.mjs'][0] && !by['m7-no-validation.mjs'][1],
    'argument validation is caught by A alone');
  for (const only of ['m2-rotate-not-returned.mjs', 'm4-acos-error-measure.mjs', 'm5-tolerance-widened.mjs']) {
    ok(!by[only][0] && by[only][1], `${only} is caught by B alone, because A never looks at the checker`);
  }

  /* TWO MUTANTS ARE NOT INVENTED. They are defects the loop actually
     made on this target and recorded as beads, re-injected. */
  const m1 = readFileSync(join(TASKS_DIR, T2, 'mutants', 'm1-naive-constellation.mjs'), 'utf8');
  const m2 = readFileSync(join(TASKS_DIR, T2, 'mutants', 'm2-rotate-not-returned.mjs'), 'utf8');
  ok(/lp-01d08f/.test(m1), 'm1 names the bead it was harvested from');
  ok(/lp-273253/.test(m2), 'and so does m2');

  // the statement must not give away the algebra it is asking for
  const st = readFileSync(join(TASKS_DIR, T2, 'statement.md'), 'utf8');
  ok(!/mutant|seeded|reference\.mjs|stub/i.test(st), 'the statement names no mutant, seed or reference');
  ok(!/M\^?-1|inverse|22 degree|u\^T/i.test(st), 'and gives away no part of the fix');
  ok(/anisotropic/i.test(st) && /inradius/i.test(st), 'while stating the complication and the parameter, which is the task');
}

// ── 8. the whole-bank audit agrees with the per-task ones ─────────────
section('auditAll');

{
  const all = auditAll();
  ok(all.tasks === taskIds().length && all.tasks === 2, 'both tasks are audited');
  ok(all.admissible === all.tasks, 'and both are admissible');
  ok(all.meanCoverage === Math.round(((REPORT.coverage + R2.coverage) / 2) * 1000) / 1000,
    `mean coverage is the mean of the two (${all.meanCoverage})`);
  ok(existsSync(TASKS_DIR), 'the bank directory exists');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} taskbank ${fail === 0 ? 'passed' : 'FAILED'} — ${fail === 0 ? pass : `${fail} of ${pass + fail}`} checks`);
process.exit(fail === 0 ? 0 : 1);
