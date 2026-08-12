// themes.selftest.mjs — the skin kernel. Run: node farm/test/themes.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SKINS, TILE_KINDS, skinById, skinUnlocked, currentSkin, setSkin, groundFill } from '../js/themes.js';
import { newFarm } from '../js/state.js';

const here = dirname(fileURLToPath(import.meta.url));
const ark = JSON.parse(readFileSync(join(here, '../vendor/ark.json'), 'utf8'));

let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error('✗', msg); process.exit(1); } };

const T0 = 1_700_000_000_000;
const fresh = newFarm('did:plc:skintester0001', ark, T0);

ok(SKINS.length >= 6, 'a respectable wardrobe');
ok(new Set(SKINS.map((s) => s.id)).size === SKINS.length, 'skin ids unique');
// every skin paints every tile kind + the derived bits the renderer reads
for (const sk of SKINS) {
  for (const k of TILE_KINDS) {
    ok(sk.ground[k] && sk.ground[k].base && sk.ground[k].base.length === 3, sk.id + ' paints ' + k);
    ok(/^rgb\(\d+,\d+,\d+\)$/.test(groundFill(sk.ground, k, 0.5)), sk.id + '/' + k + ' fill parses');
  }
  for (const key of ['sky', 'hillSkirtL', 'hillSkirtR', 'boulder', 'furrow', 'sheen', 'rim', 'survey', 'fogSale', 'fogFar']) {
    ok(key in sk.ground, sk.id + ' defines ' + key);
  }
  ok(sk.unlock && typeof sk.unlock.test === 'function' && sk.unlock.label, sk.id + ' has a legible unlock');
  ok(sk.css && sk.css['--gold'] && sk.css['--green'], sk.id + ' styles the chrome');
}

// a fresh farm owns exactly the default
ok(skinUnlocked(fresh, 'verdant'), 'verdant is free');
ok(SKINS.filter((s) => skinUnlocked(fresh, s.id)).length === 1, 'everything else is earned');
ok(currentSkin(fresh).id === 'verdant', 'fresh farm wears verdant');

// unlock predicates fire on doctored saves
const doc = (fn) => { const f = JSON.parse(JSON.stringify(fresh)); fn(f); return f; };
ok(skinUnlocked(doc((f) => { f.stats.harvests = 25; }), 'harvest'), 'harvest unlocks at 25 harvests');
ok(skinUnlocked(doc((f) => { f.parcels = ['0,0', '1,0', '0,1', '1,1']; }), 'seaside'), 'seaside unlocks at 4 parcels');
ok(skinUnlocked(doc((f) => { f.mine.depth = 12; }), 'umbra'), 'umbra unlocks at depth 12');
ok(skinUnlocked(doc((f) => { f.stats.bestGrade = 'S'; }), 'rose'), 'rose unlocks on grade A/S');
ok(skinUnlocked(doc((f) => { f.coins = 1000; }), 'gilt'), 'gilt unlocks at 1000 coins');
ok(!skinUnlocked(doc((f) => { f.stats.harvests = 24; }), 'harvest'), 'no early harvest skin');

// setSkin: guards + stamp; a save claiming an unearned skin renders default
ok(!setSkin(fresh, 'gilt', T0).ok, 'cannot wear what is not earned');
ok(!setSkin(fresh, 'nope', T0).ok, 'unknown skin refused');
const richFarm = doc((f) => { f.coins = 1000; });
const worn = setSkin(richFarm, 'gilt', T0);
ok(worn.ok && worn.farm.skin === 'gilt' && currentSkin(worn.farm).id === 'gilt', 'gilt equips');
const cheat = doc((f) => { f.skin = 'gilt'; });   // claims it, never earned it
ok(currentSkin(cheat).id === 'verdant', 'an unearned claim renders the default — viewers cannot be lied to');

console.log(`themes.selftest: ${n} assertions passed`);
