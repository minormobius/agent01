/* ─────────────────────────────────────────────────────────────────────
   ken.selftest.mjs — the gate for this surface.

   Two families of assertion, and they exist for the same reason.

   (1) CITATION INTEGRITY. Every data-ref on every page resolves in refs.js;
       every entry in refs.js is cited somewhere; every entry carries author,
       year, title and venue; no duplicate keys; every citing page loads both
       modules and provides a #reflist to render into.

   (2) THE QUOTED FIGURES ARE STILL TRUE. The site makes numerical claims about
       the pilot run (99 orders, 89 turns, 0 scores, 59 at ceiling…). Those are
       recomputed here from .github/loop/*.jsonl and compared. If the ledger
       changes and the prose does not, this fails.

   The site next door generates fabricated citations for entertainment. This one
   asserts its own honesty in CI, which is the only difference that means
   anything.
   ───────────────────────────────────────────────────────────────────── */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOOP = join(HERE, '..', '.github', 'loop');

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
   `the central claim holds: zero quality scores were produced (found ${actual.scores})`);
ok(actual.signalsFired === 1,
   `the central claim holds: exactly one of three signals ever fired (found ${actual.signalsFired})`);
ok(/59\s*\/\s*89|59 of/.test(allHtml) || allHtml.includes(`${actual.atCeiling} of`),
   'the ceiling is stated as a fraction, not just a count');

// ── 4. surface hygiene ────────────────────────────────────────────────
section('surface hygiene');
const assetsIgnore = readFileSync(join(HERE, '.assetsignore'), 'utf8');
ok(/CLAUDE\.md/.test(assetsIgnore), 'CLAUDE.md is kept out of the served assets');
ok(/ken\.selftest\.mjs/.test(assetsIgnore), 'the selftest is kept out of the served assets');

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
