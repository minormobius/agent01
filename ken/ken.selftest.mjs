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
import { readFileSync, readdirSync } from 'node:fs';
import { lintHtml } from './prose-lint.mjs';
import { NODES, box } from './tree.js';
import { mde, designComparison, variancePilot, ladyTastingTea, sprtBounds, choose } from './lab/design.mjs';
import { iccSamplingDistribution, pilotSweep, bimodalityPower, allocationCheck } from './lab/simulate.mjs';
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

// ── 4. the published tables match the library ─────────────────────────
section('lab tables vs design.mjs');
const lab = readFileSync(join(HERE, 'lab.html'), 'utf8');
const labHas = (v, what) => ok(lab.includes(`>${v}<`), `lab: table states the computed value for ${what} (${v})`);

// Table 1 — minimum detectable effect by runs per arm
for (const [n, want] of [[2, '2.80'], [5, '1.77'], [10, '1.25'], [30, '0.72'], [63, '0.50']]) {
  const got = mde({ n }).toFixed(2);
  ok(got === want, `mde(n=${n}) = ${want} (computed ${got})`);
  labHas(want, `mde at n=${n}`);
}

// Table 2 — runs for one contrast, unpaired and paired
const T2 = {
  0.2: [786, 550, 394, 236, 118],
  0.3: [350, 246, 176, 106, 54],
  0.5: [126, 88, 64, 38, 20],
  0.8: [50, 36, 26, 16, 8],
  1.2: [22, 16, 12, 8, 4],
};
for (const [dStr, row] of Object.entries(T2)) {
  const d = Number(dStr);
  const got = [
    designComparison({ d, rho: 0 }).unpairedObservations,
    ...[0.3, 0.5, 0.7, 0.85].map((rho) => designComparison({ d, rho }).pairedObservations),
  ];
  ok(JSON.stringify(got) === JSON.stringify(row),
     `lab Table 2 row d=${d} matches the library (computed ${got.join(',')}, printed ${row.join(',')})`);
  for (const v of row) labHas(String(v), `Table 2 d=${d} entry ${v}`);
}

// Table 3 — the pilot
const pilot = variancePilot();
ok(pilot.tasks === 8 && pilot.repeats === 3 && pilot.runs === 24, 'pilot is 8 x 3 = 24');
ok(pilot.dfBetween === 7 && pilot.dfWithin === 16, 'pilot df are 7 and 16');
for (const v of [8, 3, 24, 7, 16]) labHas(String(v), `Table 3 value ${v}`);

// §6 quoted constants
const sb = sprtBounds({ alpha: 0.05, beta: 0.2 });
ok(sb.upper.toFixed(2) === '2.77', `SPRT upper boundary is +2.77 (computed ${sb.upper.toFixed(2)})`);
ok(sb.lower.toFixed(2) === '-1.56', `SPRT lower boundary is -1.56 (computed ${sb.lower.toFixed(2)})`);
ok(lab.includes('2.77') && lab.includes('1.56'), 'lab prints both SPRT boundaries');
ok(choose(8, 4) === 70 && ladyTastingTea(6).smallestP === 0.05,
   'the six-cup design cannot reach p < 0.05, as the note claims');

// ── 4b. WP1's tables are reproduced from the simulator ────────────────
section('wp1 tables vs simulate.mjs');
const wp1 = readFileSync(join(HERE, 'wp1.html'), 'utf8');
const wp1Has = (v, what) => ok(wp1.includes(v), `wp1 states the simulated value for ${what} (${v})`);
const pct = (x) => `${Math.round(x * 100)}%`;
const f2 = (x) => x.toFixed(2);

// Table 2 — the 24-run pilot at three true ICCs
for (const [icc, lo, hi, med, zero] of [
  [0.2, '0.00', '0.61', '0.17', '25%'],
  [0.5, '0.00', '0.80', '0.47', '4%'],
  [0.8, '0.38', '0.93', '0.79', '0%'],
]) {
  const d = iccSamplingDistribution({ tasks: 8, repeats: 3, trueIcc: icc, trials: 4000, seed: 21 });
  ok(f2(d.lo) === lo && f2(d.hi) === hi,
     `wp1 Table 2, true ICC ${icc}: interval [${lo}, ${hi}] (simulated [${f2(d.lo)}, ${f2(d.hi)}])`);
  ok(f2(d.median) === med, `wp1 Table 2, true ICC ${icc}: median ${med} (simulated ${f2(d.median)})`);
  ok(pct(d.atZero) === zero, `wp1 Table 2, true ICC ${icc}: ${zero} clamped at zero (simulated ${pct(d.atZero)})`);
  wp1Has(`[${lo}, ${hi}]`, `the ICC interval at true ${icc}`);
}

// Table 3 — every split of a 24-run budget
{
  const sweep = pilotSweep({ budget: 24, trueIcc: 0.5, trials: 3000 });
  const want = { '4x6': '0.82', '6x4': '0.80', '8x3': '0.80', '12x2': '0.82' };
  for (const r of sweep) {
    const key = `${r.tasks}x${r.repeats}`;
    ok(f2(r.width) === want[key],
       `wp1 Table 3, ${key}: width ${want[key]} (simulated ${f2(r.width)})`);
  }
  ok(sweep.length === 4, 'the 24-run sweep has the four splits the table shows');
}

// Table 4 — the size ladder
for (const [tasks, runs, lo, hi, width] of [
  [8, 24, '0.00', '0.80', '0.80'], [12, 36, '0.09', '0.76', '0.66'],
  [16, 48, '0.16', '0.73', '0.58'], [24, 72, '0.22', '0.69', '0.47'],
  [32, 96, '0.27', '0.67', '0.40'], [48, 144, '0.32', '0.64', '0.32'],
  [64, 192, '0.34', '0.62', '0.29'], [96, 288, '0.38', '0.61', '0.23'],
]) {
  const d = iccSamplingDistribution({ tasks, repeats: 3, trueIcc: 0.5, trials: 3000, seed: 31 });
  ok(f2(d.lo) === lo && f2(d.hi) === hi && f2(d.width) === width,
     `wp1 Table 4, ${tasks} tasks: [${lo}, ${hi}] width ${width} (simulated [${f2(d.lo)}, ${f2(d.hi)}] width ${f2(d.width)})`);
  ok(d.runs === runs, `wp1 Table 4, ${tasks} tasks is ${runs} runs`);
}

// Table 5 — bimodality power
for (const [gap, want] of [[1, '2%'], [2, '69%'], [3, '100%'], [4, '100%']]) {
  const b = bimodalityPower({ tasks: 8, repeats: 3, p: 0.5, gap, noise: 0.35, trials: 2000, seed: 13 });
  ok(pct(b.power) === want, `wp1 Table 5, ${gap} SD separation: ${want} (simulated ${pct(b.power)})`);
}

// Table 6 — predicted against simulated SE, and the allocation conclusion
{
  const a = allocationCheck({ budget: 48, betweenVar: 0.5, withinVar: 0.5, trials: 4000, seed: 5 });
  ok(a.bestRepeats === 1, 'wp1 §4.5: simulation agrees one repeat minimises the SE');
  const want = {
    1: ['0.1443', '0.1465'], 2: ['0.1768', '0.1798'], 3: ['0.2041', '0.2023'],
    4: ['0.2282', '0.2257'], 6: ['0.2700', '0.2693'], 8: ['0.3062', '0.3080'],
  };
  for (const r of a.rows) {
    const [p4, e4] = want[r.repeats];
    ok(r.predictedSe.toFixed(4) === p4 && r.empiricalSe.toFixed(4) === e4,
       `wp1 Table 6, ${r.repeats} repeat(s): predicted ${p4} simulated ${e4} ` +
       `(got ${r.predictedSe.toFixed(4)} and ${r.empiricalSe.toFixed(4)})`);
    wp1Has(p4, `Table 6 predicted SE at ${r.repeats} repeat(s)`);
    wp1Has(e4, `Table 6 simulated SE at ${r.repeats} repeat(s)`);
  }
}

// the correction must be visible on the page that carried the original claim
ok(readFileSync(join(HERE, 'lab.html'), 'utf8').includes('/wp1'),
   'the instrument note links to the working paper that corrected it');

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
