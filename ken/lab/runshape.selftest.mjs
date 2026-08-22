/* ken/lab/runshape.selftest.mjs — the standard run's arithmetic, and the
   language test's measurement. */
import { shapeSummary, costInRuns, reachWithin, budgetLadder, MEASURED_RHO, STANDARD_RUN } from './runshape.mjs';
import { lintSte, isPassive, nounClusters, LIMITS } from './ste-lint.mjs';
import { lintHtml, registerOf } from '../prose-lint.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0, failures = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.error(`  ✗ ${m}`); } };
const section = (t) => console.log(`\n${t}`);
const page = (f) => readFileSync(join(HERE, f), 'utf8');

section('the shape');
const sh = shapeSummary();
ok(sh.turns === 6, `six turns (got ${sh.turns})`);
ok(sh.stages === 4, `four stages (got ${sh.stages})`);
ok(sh.maxWidth === 2, `width two (got ${sh.maxWidth})`);
ok(sh.pairedSlots === 4, 'four paired slots across the two waves');
ok(sh.blockTurns === 2 && sh.treatmentTurns === 4, 'two block turns, four treatment turns');
ok(STANDARD_RUN.stages.filter((s) => s.paired).length === 2, 'exactly two waves are paired');

section('cost');
ok(MEASURED_RHO === 0.413, 'the default rho is the one measured value');
for (const [d, paired, turns] of [[0.3, 206, 1236], [0.5, 74, 444], [0.8, 30, 180], [1.2, 14, 84]]) {
  const c = costInRuns({ d });
  ok(c.pairedRuns === paired && c.pairedTurns === turns,
     `d=${d} costs ${paired} runs / ${turns} turns (got ${c.pairedRuns} / ${c.pairedTurns})`);
}
ok(costInRuns({ d: 0.5 }).unpairedRuns > costInRuns({ d: 0.5 }).pairedRuns, 'pairing is cheaper');
ok(costInRuns({ d: 0.5, rho: 0 }).saving === 1, 'and buys nothing at rho 0');
const ladder = budgetLadder();
ok(ladder.find((r) => r.turns === 96).detectableD.toFixed(2) === '1.07', '96 turns reaches d 1.07');
ok(ladder.find((r) => r.turns === 480).detectableD.toFixed(2) === '0.48', '480 turns reaches d 0.48');
ok(reachWithin({ turns: 12 }).feasible === false, 'two runs is refused as no comparison');

section('the ste lint');
ok(LIMITS.procedureSentenceWords === 20, 'procedural sentence limit is 20 words');
ok(isPassive('This page was written to the rules.'), 'a real passive is caught');
ok(!isPassive('Then the wave is a matched pair.'), 'an attributive participle is not');
ok(!isPassive('The numeric limits are the commonly cited ones.'), 'nor is a predicate nominative');
ok(nounClusters('One run costs six turns').length === 0, 'a clause with a verb is not a noun cluster');
ok(nounClusters('hydraulic system pressure sensor unit').length === 1, 'a real cluster is');
// known limitation: the -ing filter removes gerund nouns, which are common in
// real clusters. "main landing gear door actuator" is missed for that reason.
ok(nounClusters('main landing gear door actuator').length === 0,
   'and a cluster containing an -ing noun is MISSED, which is a known limitation');

section('the language test');
const run = page('run.html');
ok(registerOf(run) === 'procedure', 'the procedure page declares its register');
const ste = lintSte(run, { mode: 'procedure' });
ok(ste.violations === 0, `the procedure page has no structural violations (got ${ste.violations})`);
ok(ste.longestSentence <= 20, `its longest sentence is within the limit (got ${ste.longestSentence})`);
ok(lintHtml(run, 'run').findings.length === 0, 'and it passes the tic lint under its register');

// the comparison the page publishes must be the one the lint gives
for (const [file, per100] of [['methods.html', 27], ['lab.html', 29], ['log.html', 17], ['wp1.html', 19]]) {
  const r = lintSte(page(file), { mode: 'descriptive' });
  ok(Math.round(r.perHundredSentences) === per100,
     `${file} is ${per100} violations per 100 (got ${Math.round(r.perHundredSentences)})`);
  ok(run.includes(`<td class="num">${per100}</td>`), `run.html publishes ${per100} for ${file}`);
}

// the conflict, asserted so it cannot be quietly lost
{
  const stripped = run.replace('<body data-register="procedure">', '<body>');
  const asProse = lintHtml(stripped, 'run-as-prose');
  ok(asProse.findings.some((f) => f.rule === 'monotony'),
     'without the register the procedure page fails the monotony rule — the two standards conflict');
}

console.log('');
if (failures) { console.error(`✗ runshape + ste FAILED — ${failures} of ${checks} checks`); process.exit(1); }
console.log(`✓ runshape + ste passed — ${checks} checks`);
