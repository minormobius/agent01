// achievements.selftest.mjs — the ledger of deeds. Run: node farm/test/achievements.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ACHIEVEMENTS, evaluate, markEarned, shareText, byId } from '../js/achievements.js';
import { newFarm } from '../js/state.js';
import { biomeById } from '../vendor/gacha.js';

const here = dirname(fileURLToPath(import.meta.url));
const ark = JSON.parse(readFileSync(join(here, '../vendor/ark.json'), 'utf8'));

let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error('✗', msg); process.exit(1); } };

const T0 = 1_700_000_000_000;
const fresh = newFarm('did:plc:deedster0001', ark, T0);

ok(ACHIEVEMENTS.length >= 15, 'a respectable ledger');
ok(new Set(ACHIEVEMENTS.map((a) => a.id)).size === ACHIEVEMENTS.length, 'ids unique');
ok(evaluate(fresh, ark).length === 0, 'a fresh farm has earned nothing');

// each predicate fires on a doctored save
const doctor = (fn) => { const f = JSON.parse(JSON.stringify(fresh)); fn(f); return f; };
ok(evaluate(doctor((f) => { f.stats.planted = 1; }), ark).some((a) => a.id === 'first-seed'), 'first-seed fires');
ok(evaluate(doctor((f) => { f.stats.harvests = 50; }), ark).some((a) => a.id === 'harvest-50'), 'harvest-50 fires');
ok(evaluate(doctor((f) => { f.stats.bestGrade = 'S'; }), ark).some((a) => a.id === 'grade-s'), 'grade-s fires');
ok(evaluate(doctor((f) => { f.stats.bestGrade = 'A'; }), ark).some((a) => a.id === 'grade-a'), 'grade-a fires on A');
ok(!evaluate(doctor((f) => { f.stats.bestGrade = 'B'; }), ark).some((a) => a.id === 'grade-a'), 'grade-a silent on B');
ok(evaluate(doctor((f) => { f.metals = { gold: 1, silver: 1, quicksilver: 1, copper: 1, iron: 1, tin: 1, lead: 1 }; }), ark).some((a) => a.id === 'seven-metals'), 'seven-metals fires');
const biome = biomeById(ark, fresh.biomeId);
ok(evaluate(doctor((f) => { f.owned = biome.crops.map((c) => c.id); }), ark).some((a) => a.id === 'biome-closed'), 'biome-closed fires');
ok(evaluate(doctor((f) => { f.mine.depth = 12; }), ark).filter((a) => a.id.startsWith('depth')).length === 2, 'both depth tiers fire at 12');

// markEarned is idempotent and evaluate() respects it
const earned = markEarned(fresh, ['first-seed'], T0);
ok(earned.achievements['first-seed'], 'marked');
const withStat = JSON.parse(JSON.stringify(earned)); withStat.stats.planted = 5;
ok(!evaluate(withStat, ark).some((a) => a.id === 'first-seed'), 'earned achievements never re-fire');

// share text: short, carries the viewer link
const txt = shareText(byId('first-harvest'), 'farmer.bsky.social');
ok(txt.length < 300, 'share text under the post limit');
ok(txt.includes('farm.mino.mobi/?u=farmer.bsky.social'), 'share text links the live farm viewer');

console.log(`achievements.selftest: ${n} assertions passed`);
