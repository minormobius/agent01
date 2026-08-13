// council.selftest.mjs — the moat's pure logic + the constitution's artifacts under assertion.
// Run: node farm/test/council.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ALLOWED, checkScope, checkAppendOnly } from '../sim/petition-scope.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error('✗', msg); process.exit(1); } };

// ── the moat: what the council may and may not touch ──
ok(checkScope(['farm/js/themes.js']).ok, 'skins are in bounds');
ok(checkScope(['farm/js/achievements.js', 'farm/council/ledger.json']).ok, 'deeds + ledger in bounds');
ok(checkScope(['farm/commons/crops.json', 'farm/knobs.json']).ok, 'commons pack + knobs in bounds');
for (const forbidden of [
  'farm/js/state.js',                    // the kernel and the save shape
  'farm/js/store.js',                    // scopes and sync
  'farm/lexicons/com.minomobi.farm.plot.json',   // public contracts
  'farm/vendor/gacha.js',                // COPY-NEVER-FORK
  'farm/sim/thresholds.json',            // the examinee never edits the examiner
  'farm/sim/gate.mjs',
  'farm/sim/petition-scope.mjs',
  'farm/PETITIONS.md',                   // nor its own constitution
  '.github/workflows/farm-council.yml',  // nor the promotion rails
  '.github/workflows/deploy-farm.yml',
  'farm/wrangler.jsonc',
  'workers/auth/src/oauth/scope.ts',
  'time/posts/anything.md',              // the repo's danger zone stays far away
]) {
  const r = checkScope([forbidden]);
  ok(!r.ok && r.denied.includes(forbidden), forbidden + ' is out of bounds');
}
const mixed = checkScope(['farm/js/themes.js', 'farm/js/state.js']);
ok(!mixed.ok && mixed.denied.length === 1, 'one bad file poisons the diff, good files stay named');

// ── deeds append-only ──
const base = "  { id: 'first-seed', x: 1 },\n  { id: 'first-harvest' },";
ok(checkAppendOnly(base, base + "\n  { id: 'new-deed' },").ok, 'adding a deed is fine');
ok(!checkAppendOnly(base, "  { id: 'first-seed' },").ok, 'removing a deed is refused');
ok(checkAppendOnly(base, "  { id: 'first-harvest' },\n  { id: 'first-seed', y: 2 },").ok, 'reorder + edit keeps ids — fine');
const gone = checkAppendOnly(base, "  { id: 'renamed-seed' },\n  { id: 'first-harvest' },");
ok(!gone.ok && gone.missing.includes('first-seed'), 'renaming an id is a removal');

// ── the artifacts parse and agree with each other ──
const T = JSON.parse(readFileSync(join(here, '../sim/thresholds.json'), 'utf8'));
ok(T.oracle.unlockGapMax > 0 && T.oracle.deadMax >= 0 && Array.isArray(T.oracle.coinsRange), 'thresholds: oracle bounds shaped right');
ok(T.diversity.hGreedyMin > 0 && T.diversity.hGreedyMin < 1, 'thresholds: entropy bound sane');
const lex = JSON.parse(readFileSync(join(here, '../lexicons/com.minomobi.farm.petition.json'), 'utf8'));
ok(lex.id === 'com.minomobi.farm.petition' && lex.defs.main.key === 'tid', 'petition lexicon: id + tid key');
ok(lex.defs.main.record.required.includes('text'), 'petition lexicon: text required');
const led = JSON.parse(readFileSync(join(here, '../council/ledger.json'), 'utf8'));
ok(Array.isArray(led.entries) && led.entries.every((e) => e.date && e.change && e.by), 'ledger entries carry date/change/credit');
// the store asks for the scope the lexicon defines
const storeSrc = readFileSync(join(here, '../js/store.js'), 'utf8');
ok(storeSrc.includes('PETITION_COLLECTION'), 'store carries the petition scope');
// the constitution's moat matches the code's moat
const constitution = readFileSync(join(here, '../PETITIONS.md'), 'utf8');
for (const re of ALLOWED) {
  const sample = String(re).includes('themes') ? 'themes.js' : String(re).includes('achievements') ? 'achievements.js'
    : String(re).includes('commons') ? 'commons' : String(re).includes('knobs') ? 'knobs.json' : 'council';
  ok(constitution.includes(sample), 'PETITIONS.md names the sandbox: ' + sample);
}

console.log('council.selftest: ' + n + ' assertions passed');
