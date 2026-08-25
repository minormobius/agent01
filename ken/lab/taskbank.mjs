/* ─────────────────────────────────────────────────────────────────────
   ken/lab/taskbank.mjs — the admission gate for a task.

   Every hypothesis on this site is priced in turns spent on "the same
   task" and no task exists. H5 wants 180 turns paired on task; H9 wants
   six chains doing real work; H11 wants three arms over the same tasks.
   None of them can start. THE BANK IS THE BLOCKER, and it is also the
   one artefact whose own quality is measurable without a judge.

   ── WHAT MAKES A TASK ADMISSIBLE ─────────────────────────────────────

   Three conditions, and the second is the instrument.

     SOUND       the reference solution passes every check. A check that
                 fails a correct solution is worse than no check: it
                 certifies the wrong answer. This is WP4's u, per task.
     DISCERNING  every seeded defect fails at least one check. The share
                 that do is the MUTATION SCORE, and it is WP4's c, per
                 task, measured rather than assumed.
     NOT FREE    a solution that does nothing must fail. A check that an
                 empty implementation passes measures nothing, which is
                 the same discipline as the probe's floor arm.

   ── WHY MUTATION SCORE IS THE RIGHT INSTRUMENT ───────────────────────

   It is the only way to know the denominator. The loop ledger records
   17 gate failures over 89 turns, which counts what the gate CAUGHT and
   is silent about what went past it. Seeding the defects yourself is
   what makes the miss rate observable, and it is standard practice:
   DeMillo, Lipton and Sayward proposed it in 1978 and Jia and Harman
   survey four decades of it.

   ── A SURVIVING MUTANT IS A RESULT, NOT A BUG ────────────────────────

   tb-001 ships six mutants and one survives both checks. That is
   reported as a coverage hole rather than hidden, because a bank that
   only admits tasks scoring 1.0 would be a bank of tasks whose mutants
   were chosen to die.

   ── THE PRECONDITION NO CHECK HERE CAN ENFORCE ───────────────────────

   A turn with Read over this repository can open reference.mjs and the
   mutants. THE BANK MUST NOT BE IN THE RUN'S TREE. A run is briefed from
   statement.md copied into a fresh tree, and the checks are executed by
   the harness afterwards, exactly as loop-work.yml already runs a
   ticket's gate outside the turn rather than inside it.

   Nothing in this file can verify that, because it is a property of the
   runner. It is stated here rather than in a footnote because a run that
   gets it wrong measures reading comprehension and reports it as work.

   ── CHECK REDUNDANCY ─────────────────────────────────────────────────

   Two checks that kill the same mutants are two checks with correlated
   detection, which is WP4 §5's rho wearing different clothes. Reported
   per task, because a two-effort split whose checks are perfectly
   redundant has not really been split.
   ───────────────────────────────────────────────────────────────────── */

import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TASKS_DIR = join(HERE, 'tasks');

/** Run one check against one solution. Exit code is the verdict. */
export function runCheck(taskDir, check, solutionRelPath) {
  try {
    execFileSync('node', [join(taskDir, check), solutionRelPath], {
      cwd: taskDir, stdio: 'pipe', timeout: 120000,
    });
    return { passed: true, error: null };
  } catch (e) {
    return { passed: false, error: (e.stdout?.toString() || e.message).slice(0, 400) };
  }
}

/** The files that make up a task, discovered rather than declared. */
export function readTask(id) {
  const dir = join(TASKS_DIR, id);
  if (!existsSync(dir)) throw new Error(`no such task: ${id}`);
  const files = readdirSync(dir);
  const checks = files.filter((f) => /^check-[a-z]\.mjs$/.test(f)).sort();
  const mutantDir = join(dir, 'mutants');
  const mutants = existsSync(mutantDir) ? readdirSync(mutantDir).filter((f) => f.endsWith('.mjs')).sort() : [];
  return {
    id,
    dir,
    checks,
    mutants,
    hasStatement: files.includes('statement.md'),
    hasReference: files.includes('reference.mjs'),
  };
}

/** Every task in the bank. */
export function taskIds() {
  if (!existsSync(TASKS_DIR)) return [];
  return readdirSync(TASKS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

/**
 * The admission report for one task: sound, discerning, not free, plus
 * the kill matrix and the two WP4 parameters it measures.
 */
export function audit(id) {
  const t = readTask(id);
  const problems = [];
  if (!t.hasStatement) problems.push('no statement.md, so no turn could be briefed from it');
  if (!t.hasReference) problems.push('no reference.mjs, so soundness cannot be established');
  if (t.checks.length < 1) problems.push('no checks');
  if (t.mutants.length < 3) problems.push(`only ${t.mutants.length} seeded defects, too few to score coverage`);

  // SOUND: the reference passes every check
  const reference = t.checks.map((c) => ({ check: c, ...runCheck(t.dir, c, './reference.mjs') }));
  const unsound = reference.filter((r) => !r.passed);
  for (const r of unsound) problems.push(`check ${r.check} FAILS the reference solution, so it is unsound`);

  // DISCERNING: each mutant against each check
  const matrix = t.mutants.map((m) => {
    const byCheck = t.checks.map((c) => ({ check: c, killed: !runCheck(t.dir, c, `./mutants/${m}`).passed }));
    return { mutant: m, byCheck, killed: byCheck.some((x) => x.killed) };
  });
  const killed = matrix.filter((m) => m.killed).length;
  const coverage = t.mutants.length ? round(killed / t.mutants.length) : null;

  // NOT FREE: a stub that returns a constant must fail
  const stub = existsSync(join(t.dir, 'stub.mjs'))
    ? t.checks.map((c) => ({ check: c, ...runCheck(t.dir, c, './stub.mjs') }))
    : null;
  if (stub && stub.every((s) => s.passed)) problems.push('the do-nothing stub passes every check, so the checks measure nothing');

  /* REDUNDANCY. Of the mutants some check killed, how many did EVERY
     check kill. 1 means the two efforts detect the same things and the
     split bought nothing. */
  const killedRows = matrix.filter((m) => m.killed);
  const byAll = killedRows.filter((m) => m.byCheck.every((x) => x.killed)).length;
  const redundancy = killedRows.length ? round(byAll / killedRows.length) : null;

  return {
    id,
    checks: t.checks,
    mutants: t.mutants,
    sound: unsound.length === 0,
    coverage,
    survivors: matrix.filter((m) => !m.killed).map((m) => m.mutant),
    redundancy,
    matrix,
    stub: stub ? { checked: true, allPassed: stub.every((s) => s.passed) } : { checked: false },
    admissible: problems.length === 0 && unsound.length === 0 && coverage !== null && coverage >= 0.8,
    problems,
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

/** Audit the whole bank. */
export function auditAll() {
  const reports = taskIds().map((id) => audit(id));
  return {
    tasks: reports.length,
    admissible: reports.filter((r) => r.admissible).length,
    meanCoverage: reports.length
      ? round(reports.reduce((a, r) => a + (r.coverage ?? 0), 0) / reports.length) : null,
    reports,
  };
}

/** The bar a task must clear, stated so it can be argued with. */
export const ADMISSION = {
  minCoverage: 0.8,
  minMutants: 3,
  note: 'A surviving mutant is reported, not hidden. The bar is 0.8 rather than 1.0 because a '
    + 'bank admitting only perfect scores would be a bank whose mutants were chosen to die.',
};

// ── CLI ───────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const all = auditAll();
  for (const r of all.reports) {
    console.log(`\n${r.id}`);
    console.log(`  checks   ${r.checks.join(', ') || 'none'}`);
    console.log(`  sound    ${r.sound ? 'yes — the reference passes every check' : 'NO'}`);
    console.log(`  coverage ${r.coverage} (${r.mutants.length - r.survivors.length} of ${r.mutants.length} seeded defects killed)`);
    if (r.survivors.length) console.log(`  survives ${r.survivors.join(', ')}  ← a coverage hole, reported`);
    console.log(`  redundancy ${r.redundancy} of kills were made by every check`);
    for (const m of r.matrix) {
      console.log(`    ${m.killed ? '·' : '!'} ${m.mutant.padEnd(28)} ${m.byCheck.map((c) => `${c.check[6]}=${c.killed ? 'kill' : 'pass'}`).join(' ')}`);
    }
    if (r.problems.length) for (const p of r.problems) console.log(`  PROBLEM  ${p}`);
    console.log(`  ${r.admissible ? '✓ admissible' : '✗ not admissible'}`);
  }
  console.log(`\n${all.admissible} of ${all.tasks} tasks admissible, mean coverage ${all.meanCoverage}`);
  process.exit(all.admissible === all.tasks ? 0 : 1);
}
