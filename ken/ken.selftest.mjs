/* ─────────────────────────────────────────────────────────────────────
   ken.selftest.mjs — the gate for this surface.

   Two families of assertion, and they exist for the same reason.

   (1) CITATION INTEGRITY. Every data-ref on every page resolves in refs.js;
       every entry in refs.js is cited somewhere; every entry carries author,
       year, title and venue; no duplicate keys; every citing page loads both
       modules and provides a #reflist to render into.

   (2) THE QUOTED FIGURES ARE STILL TRUE. The site makes numerical claims about
       three prior runs: the loop (99 orders, 89 turns, 0 scores, 59 at ceiling)
       and the two bake-offs (11 and 12 runs, all passing every check, judge
       panel null in both). Every one of those is recomputed here from
       .github/loop ledgers and the bakeoff results files. If the record
       changes and the prose does not, this fails.

   (3) THE PUBLISHED TABLES MATCH THE LIBRARY. /lab prints numbers produced by
       ken/lab/design.mjs. Every one is recomputed here and compared, so the
       note cannot drift from the code it documents.

   (3b) WP1'S SIMULATION TABLES ARE REPRODUCED. Every interval, width and
       detection rate printed in the working paper is regenerated from the
       recorded seed and compared digit for digit.

   (4) THE ROADMAP IS A VALID DAG. Every `needs` id exists, the graph is
       acyclic, no two nodes occupy the same cell, no boxes overlap, and every
       href resolves to a page that exists and an anchor that is on it.

   (5) THE PROSE PASSES THE TIC LINT. ken/prose-lint.mjs is a density lint for
       the constructions catalogued in the declauding register: em-dashes,
       negation-first reveals, significance designation, coy headers, fragment
       cadence. It is a density check rather than a ban, because prose stripped
       to satisfy every rule is worse than prose with a few tics in it.

   The site next door generates fabricated citations for entertainment. This one
   asserts its own honesty in CI, which is the only difference that means
   anything.
   ───────────────────────────────────────────────────────────────────── */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { lintHtml } from './prose-lint.mjs';
import { NODES, box } from './tree.js';
import { mde, designComparison, variancePilot, ladyTastingTea, sprtBounds, choose } from './lab/design.mjs';
import { iccSamplingDistribution, pilotSweep, bimodalityPower, allocationCheck } from './lab/simulate.mjs';
import { buildFigures, blocksCurrent } from './lab/figures.mjs';
import { HYPOTHESES, HYPOTHESIS_IDS, auditHypotheses, statusCounts } from './graph/hypotheses.mjs';
import { ROLES } from './graph/roles.mjs';
import { depthKenDesign, collinearity, effectiveReplication, chainBriefedContrast, priceH5, shapeNames } from './graph/shapes.mjs';
import { loadRuns, partition, orderEffect, globalDrift } from './lab/h4.mjs';
import { loadBakeoff, factorialAnova, cellComponents, contrastSensitivity } from './lab/factorial.mjs';
import { fitBradleyTerry, swapRate } from './lab/bt.mjs';
import { costToPin, simulateFit, fitLambda } from './lab/probe.mjs';
import { exchangeRate, residue, density, bandFor, PARAMETERS } from './graph/equivalence.mjs';
import { costLadder } from './lab/seeded.mjs';
import {
  ungated, specifyFirst, stoppingPoint, unsoundnessCeiling, agreementFloor,
  strategies, VERIFICATION_FIRST, CHOICE,
} from './graph/gate.mjs';
import { audit, auditAll, ADMISSION } from './lab/taskbank.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOOP = join(HERE, '..', '.github', 'loop');
const BAKEOFF = join(HERE, '..', 'bakeoff', 'results');

let checks = 0, failures = 0;
const ok = (cond, msg) => {
  checks++;
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
};
const section = (t) => console.log(`\n${t}`);

// ── load ──────────────────────────────────────────────────────────────
const refsSrc = readFileSync(join(HERE, 'refs.js'), 'utf8');
const REFS = (await import(join(HERE, 'refs.js'))).default
  ?? (new Function(`${refsSrc}; return globalThis.KEN_REFS;`))();

const pages = readdirSync(HERE).filter((f) => f.endsWith('.html'));

// ── 1. bibliography wellformedness ────────────────────────────────────
section('bibliography');
const keys = Object.keys(REFS);
ok(keys.length > 0, 'refs.js exports entries');
console.log(`  · ${keys.length} entries, ${pages.length} pages`);

for (const [k, r] of Object.entries(REFS)) {
  ok(typeof r.a === 'string' && r.a.length > 2, `${k}: has authors`);
  ok(Number.isInteger(r.y) && r.y >= 1900 && r.y <= 2100, `${k}: has a plausible year (got ${r.y})`);
  ok(typeof r.t === 'string' && r.t.length > 5, `${k}: has a title`);
  ok(typeof r.v === 'string' && r.v.length > 3, `${k}: has a venue`);
  ok(!/lorem|TODO|FIXME|xxx/i.test(`${r.a}${r.t}${r.v}`), `${k}: no placeholder text`);
}

// duplicate keys survive in source but not in the object — check the source
const declared = [...refsSrc.matchAll(/^\s{4}([a-z][a-z0-9]+\d{4}):\s*\{/gm)].map((m) => m[1]);
const dupes = declared.filter((k, i) => declared.indexOf(k) !== i);
ok(dupes.length === 0, `no duplicate keys declared in refs.js (found: ${dupes.join(', ')})`);
ok(declared.length === keys.length,
   `every declared key survives into the object (${declared.length} declared, ${keys.length} exported)`);

// ── 2. citation integrity across every page ───────────────────────────
section('citations');
const cited = new Set();
for (const page of pages) {
  const html = readFileSync(join(HERE, page), 'utf8');
  const refAttrs = [...html.matchAll(/data-ref="([^"]+)"/g)].map((m) => m[1]);
  const pageKeys = refAttrs.flatMap((a) => a.split(/[,\s]+/).filter(Boolean));

  for (const k of pageKeys) {
    ok(Object.hasOwn(REFS, k), `${page}: citation "${k}" resolves in refs.js`);
    cited.add(k);
  }

  if (pageKeys.length > 0) {
    ok(/id="reflist"/.test(html), `${page}: cites ${pageKeys.length} works and has a #reflist to render them`);
    ok(/src="refs\.js"/.test(html), `${page}: loads refs.js`);
    ok(/src="cite\.js"/.test(html), `${page}: loads cite.js`);
  }
  console.log(`  · ${page}: ${pageKeys.length} citations, ${new Set(pageKeys).size} distinct`);
}

const uncited = keys.filter((k) => !cited.has(k));
ok(uncited.length === 0, `every work in refs.js is cited somewhere (uncited: ${uncited.join(', ')})`);

// no page should render a bare "[?]" — that would mean cite.js hit a bad key
for (const page of pages) {
  const html = readFileSync(join(HERE, page), 'utf8');
  ok(!/class="cite"[^>]*>\[/.test(html), `${page}: citation text is rendered by cite.js, not hand-written`);
}

// ── 3. the quoted pilot figures still match the ledger ────────────────
section('quoted figures vs the ledger');
const jsonl = (f) => readFileSync(join(LOOP, f), 'utf8')
  .split('\n').map((l) => l.trim())
  .filter((l) => l && !l.startsWith('//'))
  .map((l) => JSON.parse(l));

const turns = jsonl('turns.jsonl');
const runs = jsonl('runs.jsonl');

const actual = {
  orders: turns.length,
  runs: runs.length,
  gateFailures: runs.filter((r) => r.gateFailed).length,
  scores: runs.filter((r) => r.score !== null && r.score !== undefined).length,
  atCeiling: runs.filter((r) => r.signals?.probes === 1).length,
  probeValues: new Set(runs.map((r) => r.signals?.probes)).size,
  signalsFired: ['probes', 'rubric', 'adversarial']
    .filter((s) => runs.some((r) => r.signals?.[s] !== null && r.signals?.[s] !== undefined)).length,
};
console.log('  ·', JSON.stringify(actual));

// every page that states a figure must state the true one
const allHtml = pages.map((p) => readFileSync(join(HERE, p), 'utf8')).join('\n');
const claims = [
  [`${actual.orders}`, 'work orders issued'],
  [`${actual.runs}`, 'turns with a recorded outcome'],
  [`${actual.gateFailures}`, 'gate failures'],
  [`${actual.atCeiling}`, 'turns at the probe ceiling'],
  [`${actual.probeValues}`, 'distinct probe values'],
];
for (const [n, what] of claims) {
  ok(allHtml.includes(n), `the site states the true figure for ${what} (${n})`);
}
ok(actual.scores === 0,
   `loop: zero quality scores were produced (found ${actual.scores})`);
ok(actual.signalsFired === 1,
   `loop: exactly one of three signals ever fired (found ${actual.signalsFired})`);
ok(/59\s*\/\s*89|59 of|fifty-nine of/i.test(allHtml),
   'loop: the ceiling is stated as a fraction, not just a count');

// ── the two bake-offs ─────────────────────────────────────────────────
let totalRuns = 0, totalPass = 0;
for (const runId of ['race-01', 'race-02']) {
  const r = JSON.parse(readFileSync(join(BAKEOFF, runId, 'results.json'), 'utf8'));
  const e = r.entries;
  const gatePass = e.filter((x) => x.gate?.passed).length;
  const primFull = e.filter((x) => {
    const c = x.skeleton?.checks || {};
    const v = Object.values(c);
    return v.length > 0 && v.every((y) => y.passed);
  }).length;
  const zeroPatch = e.filter((x) => x.patchBytes === 0 && x.hasEntry).length;
  totalRuns += e.length; totalPass += gatePass;

  console.log(`  · ${runId}: ${e.length} runs, gate ${gatePass}/${e.length}, ` +
              `primitives ${primFull}/${e.length}, judges ${r.judges === null ? 'null' : 'present'}, ` +
              `zero-patch-with-entry ${zeroPatch}`);

  ok(allHtml.includes(String(e.length)),
     `${runId}: the site states the true run count (${e.length})`);
  ok(gatePass === e.length,
     `${runId}: the saturation claim holds, every run passed the gate (${gatePass}/${e.length})`);
  ok(primFull === e.length,
     `${runId}: the saturation claim holds, every run scored full primitives (${primFull}/${e.length})`);
  ok(r.judges === null,
     `${runId}: the claim that the judge panel never returned a verdict holds`);
  if (runId === 'race-01') {
    ok(zeroPatch === 2,
       `race-01: the collection-failure finding holds, 2 entries have a zero patch but a real entry (found ${zeroPatch})`);
  }
}
ok(totalRuns === 23 && totalPass === 23,
   `the headline claim holds: ${totalPass} of ${totalRuns} bake-off runs passed every automated check`);
ok(/23 of 23|twenty-three of twenty-three/i.test(allHtml),
   'the site states the 23-of-23 figure in words or digits');

// ── 4. published numbers and figures match the code that made them ────
section('published values vs the code');
const lab = readFileSync(join(HERE, 'lab.html'), 'utf8');
const wp1 = readFileSync(join(HERE, 'wp1.html'), 'utf8');
const f2 = (x) => x.toFixed(2);
const pct = (x) => `${Math.round(x * 100)}%`;

// (a) the library computes what we think it does
for (const [n, want] of [[2, '2.80'], [5, '1.77'], [10, '1.25'], [30, '0.72'], [63, '0.50']]) {
  ok(f2(mde({ n })) === want, `mde(n=${n}) = ${want} (computed ${f2(mde({ n }))})`);
}
const T2 = { 0.2: [786, 550, 394, 236, 118], 0.3: [350, 246, 176, 106, 54],
             0.5: [126, 88, 64, 38, 20], 0.8: [50, 36, 26, 16, 8], 1.2: [22, 16, 12, 8, 4] };
for (const [dStr, row] of Object.entries(T2)) {
  const d = Number(dStr);
  const got = [designComparison({ d, rho: 0 }).unpairedObservations,
    ...[0.3, 0.5, 0.7, 0.85].map((rho) => designComparison({ d, rho }).pairedObservations)];
  ok(JSON.stringify(got) === JSON.stringify(row),
     `runs for d=${d}: ${row.join(',')} (computed ${got.join(',')})`);
}
const pilot = variancePilot();
ok(pilot.runs === 24 && pilot.dfBetween === 7 && pilot.dfWithin === 16, 'pilot is 8x3, df 7 and 16');
const sb = sprtBounds({ alpha: 0.05, beta: 0.2 });
ok(sb.upper.toFixed(2) === '2.77' && sb.lower.toFixed(2) === '-1.56', 'SPRT boundaries +2.77 / -1.56');
ok(choose(8, 4) === 70 && ladyTastingTea(6).smallestP === 0.05,
   'six cups cannot reach p < 0.05, as the note claims');

// (b) simulation values quoted in WP1's prose
{
  const d = iccSamplingDistribution({ tasks: 8, repeats: 3, trueIcc: 0.5, trials: 4000, seed: 21 });
  ok(`[${f2(d.lo)}, ${f2(d.hi)}]` === '[0.00, 0.80]',
     `the 24-run ICC interval is [0.00, 0.80] (simulated [${f2(d.lo)}, ${f2(d.hi)}])`);
  ok(wp1.includes('[0.00, 0.80]'), 'wp1 quotes the 24-run interval');
  ok(lab.includes('[0.00, 0.80]'), 'lab quotes it in the correction notice');
}
{
  const widths = pilotSweep({ budget: 24, trueIcc: 0.5, trials: 3000 }).map((r) => f2(r.width));
  ok(JSON.stringify(widths) === JSON.stringify(['0.82', '0.80', '0.80', '0.82']),
     `the four 24-run splits give widths 0.82/0.80/0.80/0.82 (simulated ${widths.join('/')})`);
  ok(wp1.includes('0.82, 0.80, 0.80 and 0.82'), 'wp1 quotes all four split widths');
}
{
  const b = bimodalityPower({ tasks: 8, repeats: 3, p: 0.5, gap: 2, noise: 0.35, trials: 2000, seed: 13 });
  ok(pct(b.power) === '69%', `bimodality power at 2 SD is 69% (simulated ${pct(b.power)})`);
  ok(wp1.includes('69%') && lab.includes('69%'), 'both pages quote the 69% figure');
}
{
  const a = allocationCheck({ budget: 48, betweenVar: 0.5, withinVar: 0.5, trials: 4000, seed: 5 });
  ok(a.bestRepeats === 1, 'simulation agrees one repeat minimises the SE');
  const first = a.rows.find((r) => r.repeats === 1), last = a.rows.find((r) => r.repeats === 8);
  for (const [v, what] of [[first.predictedSe.toFixed(4), 'predicted SE at 1 repeat'],
                           [first.empiricalSe.toFixed(4), 'simulated SE at 1 repeat'],
                           [last.predictedSe.toFixed(4), 'predicted SE at 8 repeats'],
                           [last.empiricalSe.toFixed(4), 'simulated SE at 8 repeats']]) {
    ok(wp1.includes(v), `wp1 quotes the ${what} (${v})`);
  }
}
ok(lab.includes('/wp1'), 'the instrument note links to the paper that corrected it');

// (a9) the hypothesis register is the single source of hypothesis status.
{
  const problems = auditHypotheses();
  ok(problems.length === 0, `the register is internally consistent (${problems.join('; ') || 'clean'})`);
  ok(HYPOTHESIS_IDS.length >= 7, `at least seven hypotheses are registered (${HYPOTHESIS_IDS.length})`);

  const reg = readFileSync(join(HERE, 'register.html'), 'utf8');
  const b = blocksCurrent('register.html');
  ok(b.stale.length === 0,
    `the register's generated blocks are current (${b.stale.join(', ') || 'none'})`);

  for (const h of Object.values(HYPOTHESES)) {
    ok(reg.includes(`>${h.id}</b>`), `the register renders ${h.id}`);
    // the owning page must exist and must actually mention the hypothesis
    const ownerFile = h.owner === '/log' ? 'log.html' : `${h.owner.slice(1)}.html`;
    ok(existsSync(join(HERE, ownerFile)), `${h.id} names an owner page that exists (${ownerFile})`);
    ok(readFileSync(join(HERE, ownerFile), 'utf8').includes(h.id),
      `${h.id}'s owner ${h.owner} mentions it`);
    // a decided hypothesis must carry its evidence into the rendered page
    if (h.evidence) ok(reg.includes(h.evidence.slice(0, 60)), `${h.id}'s evidence reaches the page`);
  }

  // no page may assert a status that disagrees with the register
  const counts = statusCounts();
  ok(reg.includes(`>${counts.supported}</td>`) || reg.includes(`${counts.supported}</td>`),
    'the register publishes its own status counts');

  // H2 is the one that went unrecorded; assert WP1 now carries the addendum
  const wp1b = readFileSync(join(HERE, 'wp1.html'), 'utf8');
  ok(HYPOTHESES.H2.status === 'undecided', 'H2 is undecided rather than refuted or supported');
  ok(wp1b.includes('0.413') && /addendum/i.test(wp1b),
    'WP1 carries the addendum recording H2\'s first measurement');
}

// (b0) the roadmap's states must be internally coherent.
// This is the check that was missing: u4 read `blocked` while wp2, which
// needs it, read `active`. Nothing objected, because every existing check
// was about geometry and links rather than about the claim the states make.
{
  const RANK = { blocked: 0, ready: 1, active: 2, done: 3 };
  const byId = new Map(NODES.map((n) => [n.id, n]));
  for (const n of NODES) {
    ok(RANK[n.state] !== undefined, `roadmap: "${n.id}" has a known state`);
    for (const dep of n.needs || []) {
      const d = byId.get(dep);
      if (!d) continue;
      // a node cannot have started before something it depends on is at
      // least started; and it cannot be done while a prerequisite is not.
      if (RANK[n.state] >= RANK.active) {
        ok(RANK[d.state] >= RANK.active,
          `roadmap: "${n.id}" is ${n.state} but its prerequisite "${dep}" is only ${d.state}`);
      }
      if (n.state === 'done') {
        ok(d.state === 'done',
          `roadmap: "${n.id}" is done but "${dep}" is ${d.state}`);
      }
    }
    // a node with every prerequisite done is at least ready, never blocked
    if ((n.needs || []).length && (n.needs || []).every((d) => byId.get(d)?.state === 'done')) {
      ok(n.state !== 'blocked',
        `roadmap: "${n.id}" has every prerequisite done, so it is not blocked`);
    }
  }
}

// (b1a) ken/graph/ is served to the browser, so it must stay import-clean.
// The widget on /shapes runs these modules directly rather than a copy, which
// is only safe while none of them reaches for node. lab/ stays unserved.
{
  const graphDir = join(HERE, 'graph');
  const mods = readdirSync(graphDir).filter((f) => f.endsWith('.mjs'));
  ok(mods.length >= 6, `ken/graph holds the browser-loadable modules (${mods.length})`);
  for (const f of mods) {
    const src = readFileSync(join(graphDir, f), 'utf8');
    ok(!/from '(node:|\.\.\/lab\/)/.test(src),
      `graph/${f} imports neither node nor lab — it is served to the browser`);
    ok(!/require\(/.test(src), `graph/${f} is an ES module`);
  }
  // and the ignore file must not be hiding them
  const ignore = readFileSync(join(HERE, '.assetsignore'), 'utf8');
  ok(!/^graph\/?$/m.test(ignore), 'ken/graph is not assetsignored');
  ok(/^lab\/?$/m.test(ignore), 'ken/lab still is');
  // the page imports them by absolute path, which must resolve
  const sh = readFileSync(join(HERE, 'shapes.html'), 'utf8');
  for (const m of sh.matchAll(/from '\/graph\/([a-z]+\.mjs)'/g)) {
    ok(existsSync(join(graphDir, m[1])), `/shapes imports /graph/${m[1]}, which exists`);
  }
  ok(/from '\/graph\//.test(sh), '/shapes loads the real modules rather than a copy');
}

// (b1b) WP2's numbers, recomputed from roles.mjs and shapes.mjs
function numberWord(n) { return ['zero', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n); }
{
  const wp2 = readFileSync(join(HERE, 'wp2.html'), 'utf8');

  // the generated blocks cannot be stale: the page carries no typed table
  const b = blocksCurrent();
  ok(b.stale.length === 0,
     `wp2's generated blocks are current (stale: ${b.stale.join(', ') || 'none'}) — regenerate with node ken/lab/figures.mjs --write`);

  // the role basis is total and complete, and the page states the count
  ok(ROLES.length === 9 && wp2.includes('nine roles'), 'wp2 states the nine-role basis');
  for (const r of ROLES) ok(wp2.includes(`<code>${r}</code>`), `wp2 names the ${r} role`);

  // every headline number, against the function that produced it
  const design = depthKenDesign();
  ok(design.crossed, 'the depth-by-ken design is still crossed');
  ok(wp2.includes(`r = ${design.correlation}`), `wp2 quotes the across-shape correlation (${design.correlation})`);

  const col = Object.fromEntries(collinearity().map((c) => [c.shape, c]));
  ok(wp2.includes(String(col.briefed.vif)), `wp2 quotes briefed's VIF (${col.briefed.vif})`);
  ok(wp2.includes(String(col.chain.vif)), `wp2 quotes the chain's VIF (${col.chain.vif})`);
  ok(wp2.includes(String(col.chain.r)), `wp2 quotes the chain's within-run r (${col.chain.r})`);

  const star = effectiveReplication('star');
  ok(wp2.includes(String(star.effective)), `wp2 quotes the star's effective replication (${star.effective})`);
  ok(wp2.includes('1.79'), 'wp2 states the 1.79x replication result in the abstract');
  ok(star.rawReplicates === 4 && effectiveReplication('chain').rawReplicates === 1,
     'a star holds four replicates by symmetry and a chain holds one');

  const cb = chainBriefedContrast();
  ok(cb.differingTurns === 1 && cb.extraTurns === 0,
     'chain and briefed still differ at exactly one turn and cost the same');
  ok(wp2.includes(`${cb.extraEdges} added edges`) || wp2.includes(`by ${numberWord(cb.extraEdges)} added edges`),
     `wp2 states the number of added edges (${cb.extraEdges})`);

  const price = priceH5({ d: 0.8 });
  ok(wp2.includes(String(price.paired.turns)), `wp2 quotes the paired cost (${price.paired.turns} turns)`);

  // H6's prediction is arithmetic and must match the ladder it came from
  const predicted = (Math.sqrt(1 / star.effective)).toFixed(2);
  ok(wp2.includes(predicted), `wp2 quotes H6's predicted SE ratio (${predicted})`);

  // the shapes named in the prose are the shapes in the catalogue
  for (const n of shapeNames()) ok(wp2.includes(`<code>${n}</code>`), `wp2 names the ${n} shape`);

  // the literature this replicates is cited, not implied
  for (const k of ['bavelas1950', 'leavitt1951', 'shaw1964', 'orbanz2015', 'mckay2014'])
    ok(wp2.includes(`data-ref="${k}"`), `wp2 cites ${k}`);

  // the selftest count the page advertises is the real one
  ok(wp2.includes('189 known-answer checks'), 'wp2 states the roles selftest size');

  /* §12 quotes the simulator that priced H8. Tables 9 and 10 are generated
     and cannot drift, but the prose around them is typed, and it is the
     prose that carries the correction. A minus sign here is U+2212, so the
     page is checked against the number with the sign it renders. */
  const minus = (x) => String(x).replace('-', '−');
  const cost = costToPin({ target: 0.25 });
  const byChains = Object.fromEntries(cost.rows.map((r) => [r.chains, r]));
  ok(wp2.includes(`${byChains[1].width} wide`), `wp2 quotes the single-chain width (${byChains[1].width})`);
  ok(wp2.includes(`${byChains[1].unidentified} of 1500`),
     `wp2 quotes how often one chain fails to identify lambda (${byChains[1].unidentified})`);
  ok(wp2.includes(String(byChains[8].width)), `wp2 quotes the eight-chain width (${byChains[8].width})`);

  const six = simulateFit({ k: 40, chains: 6, floorK: 240, trials: 1500, seed: 13 });
  ok(six.settings.chains * six.settings.depth === 36 && wp2.includes('<b>36 turns</b>'),
     'wp2 prices H8 at the 36 turns the six-chain design costs');
  ok(wp2.includes(`width of ${six.width}`) && wp2.includes(`bias of ${minus(six.bias)}`),
     `wp2 quotes the six-chain width and bias (${six.width}, ${six.bias})`);
  ok(six.width < byChains[8].width,
     'and more residue per chain really is cheaper than more chains, which is why the page says so');

  const d6 = simulateFit({ k: 20, chains: 3, depth: 6, floorK: 60, trials: 1500, seed: 9 });
  const d12 = simulateFit({ k: 20, chains: 3, depth: 12, floorK: 60, trials: 1500, seed: 9 });
  ok(wp2.includes(`${d6.width} at depth 6 to\n  ${d12.width} at depth 12`)
     || (wp2.includes(`${d6.width} at depth 6`) && wp2.includes(`${d12.width} at depth 12`)),
     `wp2 quotes the depth penalty (${d6.width} to ${d12.width})`);
  ok(wp2.includes(`${minus(d6.bias)} to +${d12.bias}`),
     `wp2 quotes the depth bias (${d6.bias} to ${d12.bias})`);

  const low = simulateFit({ lambda: 0.2, k: 20, chains: 3, floorK: 60, trials: 1500, seed: 7 });
  const high = simulateFit({ lambda: 0.95, k: 20, chains: 3, floorK: 60, trials: 1500, seed: 7 });
  ok(wp2.includes(`interval is ${high.width} wide`), `wp2 quotes the width at high lambda (${high.width})`);
  ok(wp2.includes(`median estimate is ${low.median}`), `wp2 quotes the median at low lambda (${low.median})`);
  ok(wp2.includes(`biased up by ${low.bias}`), `wp2 quotes the bias at low lambda (${low.bias})`);
  ok(wp2.includes(`${low.unidentified} of\n  1500`) || wp2.includes(`${low.unidentified} of 1500`),
     `wp2 quotes the failure rate at low lambda (${low.unidentified})`);
}

/* (b1d) WP3. Its tables and figures are generated, so what is gated here
   is the prose around them plus the two structural claims the paper is
   built on: that an unattended chain has a floor and a directed one does
   not, and that a third of the plausible parameter space is unreachable. */
{
  const wp3 = readFileSync(join(HERE, 'wp3.html'), 'utf8');

  const b3 = blocksCurrent('wp3.html');
  ok(b3.stale.length === 0,
     `wp3's generated blocks are current (stale: ${b3.stale.join(', ') || 'none'})`);

  // the asymmetry the paper turns on, asserted here as well as in the lab selftest
  ok(residue({ q: 0.5, lambda: 1 }) === 0 && residue({ q: 0.5, lambda: 0.6 }) > 0,
     'the floor is zero for a directed chain and positive for an unattended one');

  // the never share
  let never = 0, total = 0;
  for (let i = 1; i <= 19; i++) {
    for (let j = 1; j <= 19; j++) {
      total++;
      if (!exchangeRate({ lambda: Number((i * 0.05).toFixed(2)), g: Number((j * 0.05).toFixed(2)) }).reachable) never++;
    }
  }
  const share = `${(Math.round((never / total) * 1000) / 10).toFixed(1)}%`;
  ok(wp3.includes(share), `wp3 quotes the share of the grid that is never (${share})`);
  ok(wp3.includes(`${total} cells`) || wp3.includes('19 × 19'), 'and says how big the sweep was');

  // where six is the answer
  const band = bandFor();
  ok(wp3.includes(`g only from ${band.gRange[0].toFixed(2)} to ${band.gRange[1].toFixed(2)}`),
     `wp3 quotes the g range of the five-to-seven band (${band.gRange.join('-')})`);
  const six = band.hits.filter((x) => x.n === 6).map((x) => x.g);
  ok(wp3.includes(`g from ${Math.min(...six).toFixed(2)} to ${Math.max(...six).toFixed(2)}`),
     `wp3 quotes the g range for exactly six (${Math.min(...six)}-${Math.max(...six)})`);

  // the substitution claim, which is the paper's engineering conclusion
  const weak = exchangeRate({ lambda: 0.4, g: 0.35 });
  const briefed = exchangeRate({ lambda: 0.8, g: 0.35 });
  ok(weak.n === null && briefed.n !== null,
     'raising lambda at a fixed gate really does move a design from never to finite');
  ok(wp3.includes(`raised to 0.8 it is ${numberWord(briefed.n)} turns`)
     || wp3.includes(`raised to 0.8 it is ${briefed.n} turns`),
     `wp3 quotes what briefing rescues (${briefed.n} turns)`);

  // the R13 result, and that the page reports the band rather than the number
  const big = costLadder().rows.at(-1);
  ok(wp3.includes(`${Math.round(big.hardVerdict * 1000) / 10}%`),
     `wp3 quotes the near-boundary band accuracy (${big.hardVerdict})`);
  ok(wp3.includes(`${Math.round(big.hardNumeric * 1000) / 10}%`),
     `wp3 quotes the near-boundary rate accuracy (${big.hardNumeric})`);
  ok(big.hardVerdict > big.hardNumeric,
     'and the band really is the more attainable of the two, which is why the design reports it');

  // the widget runs the real module rather than a copy
  ok(/from '\/graph\/equivalence\.mjs'/.test(wp3), 'wp3 loads graph/equivalence.mjs in the page');
  ok(PARAMETERS.length === 4, 'the parameter table has four rows, one of which cancels');
}

/* (b1e) WP4. Same discipline as WP3: the tables are generated, so what is
   gated is the prose and the three structural claims. The role table is
   the one worth guarding — its first version invented role names that
   roles.mjs does not produce for this shape. */
{
  const wp4 = readFileSync(join(HERE, 'wp4.html'), 'utf8');

  const b4 = blocksCurrent('wp4.html');
  ok(b4.stale.length === 0, `wp4's generated blocks are current (stale: ${b4.stale.join(', ') || 'none'})`);

  // the shape is the catalogue's, and the paper says so
  ok(VERIFICATION_FIRST.sameShapeAs === 'standard' && wp4.includes('<code>standard</code>'),
     'wp4 names the shape it reuses');
  const changed = VERIFICATION_FIRST.duties.filter((d) => d.roleLanes !== d.roleBriefed).length;
  ok(changed === 4 && wp4.includes('four of the six roles change'),
     `wp4 states how many roles the first wiring decision moves (${changed})`);
  for (const r of ['relay', 'delegate', 'funnel'])
    ok(wp4.includes(`<code>${r}</code>`), `wp4 names the ${r} role it actually derives`);

  // a check does not attenuate: the two corners
  ok(specifyFirst({ coverage: 1, unsoundness: 0 }).density === 0,
     'a complete sound check leaves nothing, which no chain length can do');
  const M = ungated();
  ok(Math.abs(specifyFirst({ coverage: 0 }).density - M) < 5e-5,
     'and at zero coverage the model is WP3 unchanged');

  // the inversion, which is the paper's least comfortable claim
  const cs = [0.2, 0.4, 0.6, 0.8, 0.95].map((lambda) => stoppingPoint({ lambda }).coverage);
  ok(cs.every((c, i) => i === 0 || c < cs[i - 1]),
     `raising lambda lowers the stopping point (${cs.join(' > ')})`);
  ok(wp4.includes('reduces the optimal amount of specification'), 'and wp4 states it');
  ok(Math.abs(unsoundnessCeiling().ceiling - M) < 5e-5 && wp4.includes('u &lt; M'),
     'wp4 states the bare inequality, u under M');

  // the crossing: neither strategy wins everywhere
  const lo = strategies({ correlation: 0.02 }).best;
  const hi = strategies({ correlation: 0.8 }).best;
  ok(lo !== hi, `the strategies cross (${lo} at low correlation, ${hi} at high)`);
  ok(wp4.includes('build-twice') && wp4.includes('specify-first') && wp4.includes('Ungated'),
     'and wp4 names all three');
  ok(Math.abs(agreementFloor({ p: M, correlation: 1 }) - M) < 5e-5,
     'at correlation 1 two versions buy nothing, which is the table`s last row');
  ok(wp4.includes('buy nothing at all'), 'and wp4 says so');

  ok(CHOICE.length === 3 && CHOICE.every((c) => /nothing/.test(c.standing)),
     'all three deciding quantities are recorded as unmeasured');
  ok(/from '\/graph\/gate\.mjs'/.test(wp4), 'wp4 loads graph/gate.mjs in the page');
}

// (b2) the findings log's H4 numbers, recomputed from the ledger
{
  const log = readFileSync(join(HERE, 'log.html'), 'utf8');
  const part = partition(loadRuns());
  ok(part.knownInfra === 12 && part.suspectedInfra === 5 && part.clean === 72,
     `H4 partition is 12 known infra, 5 suspected, 72 clean (got ${part.knownInfra}/${part.suspectedInfra}/${part.clean})`);
  for (const v of ['12 of 89', '61s', '597s', '11 of the 12', '2 of 32', '5 more'])
    ok(log.includes(v), `log states "${v}"`);

  const naive = orderEffect(part.cleanRuns, { perms: 20000, seed: 4242 });
  const dropped = orderEffect(part.cleanRuns.filter((r) => r.bead !== 'lp-16d590'), { perms: 20000, seed: 4242 });
  ok(naive.slope.toFixed(2) === '-0.47' && naive.p.toFixed(3) === '0.012',
     `L12 slope -0.47 at p 0.012 (got ${naive.slope.toFixed(2)}, ${naive.p.toFixed(3)})`);
  ok(dropped.slope.toFixed(2) === '-0.10' && dropped.p.toFixed(2) === '0.17',
     `L12 collapses to -0.10 at p 0.17 (got ${dropped.slope.toFixed(2)}, ${dropped.p.toFixed(2)})`);
  ok(log.includes('−0.47') && log.includes('−0.10') && log.includes('p = 0.012') && log.includes('p = 0.17'),
     'the log states both slopes and both p-values');

  const noGate = globalDrift(part.cleanRuns.filter((r) => !r.gateFailed));
  ok(noGate.t.toFixed(2) === '6.19', `L13 t is 6.19 excluding gate failures (got ${noGate.t.toFixed(2)})`);
  ok(noGate.gateVaries === false, 'and the singular-fit guard fired on that subset');
  ok(log.includes('213 → 500 → 798 → 546 → 550'), 'the log states the block medians');
  ok(log.includes('t = 6.19'), 'and the t statistic');

  // (b3) the factorial and judging findings
  const rows = loadBakeoff();
  const dur = factorialAnova(rows, { outcome: 'seconds' });
  const T = (n) => dur.table.find((r) => r.term === n);
  ok(T('model').F.toFixed(2) === '8.80', `L15 model F is 8.80 (got ${T('model').F.toFixed(2)})`);
  ok(T('harness').F < 0.005, `L15 harness F is essentially zero (got ${T('harness').F.toFixed(3)})`);
  ok(dur.residual.df === 16 && dur.residual.sd.toFixed(3) === '0.378', 'L17 residual SD 0.378 on 16 df');
  ok(contrastSensitivity(dur).detectableRatio.toFixed(2) === '2.88', 'L17 resolvable ratio 2.88x');
  ok(cellComponents(rows, { outcome: 'seconds' }).pooled.icc.toFixed(3) === '0.436', 'L18 duration ICC 0.436');
  for (const v of ['8.80', '0.999', '2897', '1449', '1.46', '2.88', '0.436'])
    ok(log.includes(v), `log states "${v}"`);

  const jd = JSON.parse(readFileSync(join(HERE, 'lab', 'judging', 'race-02.verdicts.json'), 'utf8'));
  const key = JSON.parse(readFileSync(join(HERE, 'lab', 'judging', 'race-02.mapping.json'), 'utf8')).map;
  const sw = swapRate(jd.verdicts);
  ok(sw.flipped === 5 && sw.pairsShownBothWays === 28, 'L20 swap rate is 5 of 28');
  const btFit = fitBradleyTerry(jd.verdicts, { prior: 0.5 });
  const spread = btFit[0].theta - btFit[btFit.length - 1].theta;
  ok(spread.toFixed(2) === '2.63', `L21 the scale spans 2.63 (got ${spread.toFixed(2)})`);
  const cells = {};
  for (const r of btFit) { const c = key[r.item].split('__').slice(0, 2).join('|'); (cells[c] ||= []).push(r.theta); }
  const q = (await import('./lab/design.mjs')).varianceComponents(Object.values(cells));
  ok(q.icc.toFixed(3) === '0.413', `L23 judged-quality ICC is 0.413 (got ${q.icc.toFixed(3)})`);
  for (const v of ['2.63', '0.413', '0.710', '18%', '[0.00, 0.88]'])
    ok(log.includes(v), `log states "${v}"`);

  // verdicts must have been committed before the mapping was read
  ok(jd.verdicts.length === 56, '56 verdicts on record');
  ok(typeof jd.caveat === 'string' && /lower bound/i.test(jd.caveat),
     'the verdicts file states the swap rate is a lower bound');

  /* the log's probe entries quote the estimator, so they are recomputed
     here rather than trusted. The inflated value is the one that matters:
     it is what fitting against zero when the floor is real actually does. */
  {
    const f = 0.3, lam = 0.4;
    const pts = [1, 2, 3, 4, 5, 6].map((d) => ({ depth: d, recall: f + (1 - f) * lam ** (d - 1) }));
    const right = fitLambda(pts, f).lambda;
    const wrong = fitLambda(pts, 0).lambda;
    ok(log.includes(`from ${right} to ${wrong}`),
       `the log quotes what ignoring the floor does to lambda (${right} to ${wrong})`);
    const one = costToPin({ target: 0.25 }).rows[0];
    ok(log.includes(`${one.width} wide`) && log.includes(`${one.unidentified} of 1500`),
       `the log quotes the single-chain width and failure count (${one.width}, ${one.unidentified})`);
  }

  /* the log's task-bank entries quote the bank and the reference, so both
     are recomputed here. The interval was quoted wrong once already:
     [0.9509, 0.9736] against the true [0.9511, 0.9732]. */
  {
    const r = audit('tb-001-binomial-interval');
    ok(log.includes(`scores ${r.coverage}`), `the log quotes tb-001's mutation score (${r.coverage})`);

    /* tb-002's headline is the redundancy contrast: splitting the two
       efforts by kind rather than by subject is what bought detection
       diversity, and the log states both numbers. */
    const r2 = audit('tb-002-summon-solids');
    ok(log.includes(`1.00 to
      ${r2.redundancy}`) || log.includes(`1.00 to ${r2.redundancy}`),
       `the log quotes the redundancy contrast (1 to ${r2.redundancy})`);
    ok(r2.redundancy < r.redundancy, 'and tb-002 really is the less redundant of the two');
    ok(r2.sound && r2.admissible && r2.coverage === 0.875,
       `tb-002 is sound, admissible and scores 0.875 (got ${r2.coverage})`);
    ok(auditAll().tasks === 2, 'the bank holds two tasks');
    ok(r.survivors.length === 1 && log.includes(r.survivors[0].replace('.mjs', '')),
       `and names the survivor (${r.survivors.join(', ')})`);
    ok(log.includes(`redundancy ${r.redundancy.toFixed(2)}`),
       `and the check redundancy (${r.redundancy})`);
    ok(r.sound && r.admissible, 'and the task is sound and admissible, as the log says');
    ok(r.coverage >= ADMISSION.minCoverage, 'and clears the admission bar');

    const ref = await import('./lab/tasks/tb-001-binomial-interval/reference.mjs');
    const acc = ref.interval(1156, 1200);
    ok(log.includes(`[${acc.lower.toFixed(4)}, ${acc.upper.toFixed(4)}]`),
       `the log quotes the interval on WP3's verdict accuracy ([${acc.lower.toFixed(4)}, ${acc.upper.toFixed(4)}])`);
    const zero = ref.interval(0, 12);
    ok(log.includes(`[0, ${zero.upper.toFixed(3)}]`),
       `and on 0 of 12 ([0, ${zero.upper.toFixed(3)}])`);

    // the live ticket graph's gate coverage, recomputed from the ledger
    const beads = new Map();
    for (const b of readFileSync(join(LOOP, 'beads.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))) beads.set(b.id, b);
    const all = [...beads.values()];
    const gated = all.filter((b) => b.gate && b.gate.length);
    const pctGated = `${(Math.round((gated.length / all.length) * 1000) / 10).toFixed(1)}%`;
    const word = ['zero', 'One', 'Two', 'Three', 'Four', 'Five'][gated.length] ?? String(gated.length);
    ok(log.includes(pctGated)
       && (log.includes(`${gated.length} of ${all.length} beads`) || log.includes(`${word} of ${all.length} beads`)),
       `the log quotes the ticket graph's gate coverage (${gated.length} of ${all.length}, ${pctGated})`);
  }

  /* the runner's guarantees, asserted here as well as in its own
     selftest, because the log makes claims about them. */
  {
    const { plan, blindTo, MARKER_TURN, MARKER_BLIND } = await import('./lab/runner.mjs');
    const p = plan();
    ok(p.turns.length === 6 && p.shape === 'standard',
       'the runner executes the six-turn standard shape');
    ok(blindTo(p, MARKER_TURN).includes(MARKER_BLIND),
       `${MARKER_BLIND} has no path from ${MARKER_TURN}, which is what makes the marker a test`);
    ok(log.includes('demonstrated per run'), 'the log states that isolation is demonstrated per run');
    ok(log.includes('bank-run'), 'and records why the job is not called run');
  }

  // the log must keep saying the honest thing about its own provenance
  {
    const counts = [...log.matchAll(/<td>(?:<b>)?([^<]+?)(?:<\/b>)?(?: \(the judging pass\))?<\/td><td class="num">(?:<b>)?(\d+)/g)]
      .map((m) => Number(m[2]));
    const entries = (log.match(/<li><b>/g) || []).length;
    ok(counts.reduce((a, b) => a + b, 0) === entries,
       `the ledger's rows sum to the number of entries (${counts.join('+')} vs ${entries})`);
  }
}

// (c) the committed figures are current
const figs = buildFigures();
for (const [name, svg] of Object.entries(figs)) {
  const path = join(HERE, 'fig', `${name}.svg`);
  const onDisk = existsSync(path) ? readFileSync(path, 'utf8') : null;
  ok(onDisk === svg,
     `fig/${name}.svg is current${onDisk === null ? ' (missing)' : ''} — regenerate with node ken/lab/figures.mjs --write`);
  ok(lab.includes(`aria-label`) || wp1.includes('aria-label'), `${name}: figures carry an aria-label`);
}
console.log(`  · ${Object.keys(figs).length} figures checked against a fresh render`);

// (d) the bibliography links somewhere real
{
  const linked = Object.entries(REFS).filter(([, r]) => r.u);
  const bad = linked.filter(([, r]) => !/^https:\/\/(doi\.org|arxiv\.org|openlibrary\.org)\//.test(r.u));
  ok(bad.length === 0, `every link points at doi.org, arxiv.org or openlibrary.org (bad: ${bad.map(([k]) => k).join(', ')})`);
  ok(linked.length >= 70, `at least 70 of ${keys.length} entries resolve to a registry record (have ${linked.length})`);
  console.log(`  · bibliography: ${linked.length} of ${keys.length} linked`);
  const dupes = {};
  for (const [k, r] of linked) (dupes[r.u] ||= []).push(k);
  const shared = Object.entries(dupes).filter(([, ks]) => ks.length > 1);
  ok(shared.length === 0, `no two entries share a URL (${shared.map(([u, ks]) => ks.join('=')).join('; ')})`);
}

// ── 5. the roadmap is a valid DAG ─────────────────────────────────────
section('roadmap graph');
const ids = new Set(NODES.map((n) => n.id));
ok(ids.size === NODES.length, 'every node id is unique');

for (const n of NODES) {
  for (const d of n.needs || []) ok(ids.has(d), `node "${n.id}" needs "${d}", which exists`);
  ok(['done', 'active', 'ready', 'blocked'].includes(n.state), `node "${n.id}" has a known state`);
}

// acyclic, by depth-first search over needs
{
  const byId = new Map(NODES.map((n) => [n.id, n]));
  const colour = new Map();
  let cyclic = null;
  const visit = (id, path) => {
    if (colour.get(id) === 'black') return;
    if (colour.get(id) === 'grey') { cyclic = [...path, id].join(' -> '); return; }
    colour.set(id, 'grey');
    for (const d of byId.get(id).needs || []) visit(d, [...path, id]);
    colour.set(id, 'black');
  };
  for (const n of NODES) visit(n.id, []);
  ok(cyclic === null, `the roadmap is acyclic${cyclic ? ` (found ${cyclic})` : ''}`);
}

// a prerequisite must sit on a lower row than the node needing it
for (const n of NODES) {
  for (const d of n.needs || []) {
    const from = NODES.find((x) => x.id === d);
    ok(from.row < n.row, `"${d}" (row ${from.row}) sits below "${n.id}" (row ${n.row}), so the edge points up`);
  }
}

// no two boxes overlap
{
  const boxes = NODES.map((n) => ({ id: n.id, ...box(n) }));
  const hits = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      if (A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h) {
        hits.push(`${A.id} overlaps ${B.id}`);
      }
    }
  }
  ok(hits.length === 0, `no two roadmap boxes overlap${hits.length ? ` (${hits.join('; ')})` : ''}`);
}

// every href resolves: a real page, and an anchor that is actually on it
for (const n of NODES) {
  const [path, frag] = n.href.split('#');
  const file = path === '/' ? 'index.html'
    : path.replace(/^\//, '') + (path.endsWith('.html') ? '' : '.html');
  ok(pages.includes(file), `node "${n.id}" links to ${file}, which exists`);
  if (frag && pages.includes(file)) {
    const target = readFileSync(join(HERE, file), 'utf8');
    ok(target.includes(`id="${frag}"`), `node "${n.id}" anchor #${frag} exists on ${file}`);
  }
}

// ── 6. prose tic lint ─────────────────────────────────────────────────
section('prose');
for (const page of pages) {
  const r = lintHtml(readFileSync(join(HERE, page), 'utf8'), page);
  const over = r.findings.map((f) => `${f.rule} ${f.count}>${f.budget}`).join(', ');
  console.log(`  · ${page}: ${r.words} words, ${r.paragraphs} paragraphs${over ? ' — ' + over : ''}`);
  for (const f of r.findings) {
    ok(false, `${page}: ${f.label} — ${f.count} against a budget of ${f.budget}. ${f.note}`);
  }
  ok(true, `${page}: prose lint`);
}

// ── 7. surface hygiene ────────────────────────────────────────────────
section('surface hygiene');
const assetsIgnore = readFileSync(join(HERE, '.assetsignore'), 'utf8');
ok(/CLAUDE\.md/.test(assetsIgnore), 'CLAUDE.md is kept out of the served assets');
ok(/ken\.selftest\.mjs/.test(assetsIgnore), 'the selftest is kept out of the served assets');
ok(/prose-lint\.mjs/.test(assetsIgnore), 'the prose lint is kept out of the served assets');
ok(/^lab\/$/m.test(assetsIgnore), 'the node-only lab/ directory is kept out of the served assets');

// The worker must not carry a route map. One drifted silently for four edits;
// Static Assets resolves clean URLs itself, so a map is dead weight that the
// next person has to guess about.
{
  const worker = readFileSync(join(HERE, 'worker.js'), 'utf8');
  ok(!/const clean\s*=/.test(worker),
     'worker.js carries no clean-URL map — Static Assets already resolves them');
  const routed = pages.map((p) => `/${p.replace(/\.html$/, '')}`).filter((r) => r !== '/index');
  for (const r of routed) {
    ok(!worker.includes(`'${r}'`), `worker.js does not hand-route ${r}`);
  }
}

const wrangler = readFileSync(join(HERE, 'wrangler.jsonc'), 'utf8');
ok(/"name":\s*"ken"/.test(wrangler), 'worker name is ken');
ok(/ken\.mino\.mobi/.test(wrangler) && /custom_domain/.test(wrangler),
   'the custom domain is declared in routes (the golden rule)');

for (const page of pages) {
  const html = readFileSync(join(HERE, page), 'utf8');
  ok(/<title>[^<]{10,}<\/title>/.test(html), `${page}: has a real <title>`);
  ok(/name="description"/.test(html), `${page}: has a meta description`);
  ok(/viewport/.test(html), `${page}: has a viewport tag`);
  ok(/journal\.css/.test(html), `${page}: loads the shared stylesheet`);
}

// ── report ────────────────────────────────────────────────────────────
console.log('');
if (failures) {
  console.error(`✗ ken selftest FAILED — ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`✓ ken selftest passed — ${checks} checks`);
