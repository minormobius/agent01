// state.selftest.mjs — the farm kernel under assertion. Run: node farm/test/state.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  newFarm, plantSeed, growthOf, harvestPlant, sellProduce, pullSeeds, claimGift, giveSeed,
  applyBrew, usePreparation, toPlotRecord, fromPlotRecord, cropById, DAY_MS, FRESH_SPD, START_COINS, PREP_METAL,
  touchStreak, recordShare, STREAK_CAP, STREAK_DEW_MIN, SHARE_COINS,
} from '../js/state.js';
import { prepare } from '../vendor/alchemy.js';
import { bedKeepouts, plantable } from '../vendor/garden.js';

const here = dirname(fileURLToPath(import.meta.url));
const ark = JSON.parse(readFileSync(join(here, '../vendor/ark.json'), 'utf8'));

let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error('✗', msg); process.exit(1); } };

const DID = 'did:plc:selftestfarmer0001';
const T0 = 1_700_000_000_000;

// ── determinism: same DID → same farm ──
const f1 = newFarm(DID, ark, T0), f2 = newFarm(DID, ark, T0);
ok(JSON.stringify(f1) === JSON.stringify(f2), 'newFarm is deterministic');
ok(f1.biomeId, 'home biome assigned');
ok(Object.keys(f1.seeds).length === 2, 'starter bag holds two crops');
ok(f1.coins === START_COINS, 'starter coins');
const otherBiome = newFarm('did:plc:someoneelse9999xyz', ark, T0).biomeId;
ok(typeof otherBiome === 'string', 'other farmer gets a biome too');

// ── planting: find a plantable spot deterministically ──
const starterCrop = Object.keys(f1.seeds)[0];
function findSpot(farm) {
  const keep = bedKeepouts(farm.bed.seed);
  for (let gy = 1; gy < 20; gy++) for (let gx = 1; gx < 20; gx++) {
    const x = gx / 20, y = gy / 20;
    if (plantable(farm.bed, x, y, keep)) return { x, y };
  }
  throw new Error('no plantable spot');
}
const s1 = findSpot(f1);
const p1 = plantSeed(f1, s1.x, s1.y, starterCrop, ark, T0);
ok(p1.ok, 'plant lands');
ok(p1.spd === FRESH_SPD, 'fresh-soil speed on a new farm');
ok(p1.farm.seeds[starterCrop] === 2 || !(starterCrop in p1.farm.seeds), 'seed decremented');
const pBad = plantSeed(p1.farm, s1.x, s1.y, starterCrop, ark, T0);
ok(!pBad.ok, 'crowding rejected');
ok(!plantSeed(f1, 0.001, 0.001, starterCrop, ark, T0).ok, 'edge rejected');
ok(!plantSeed(f1, s1.x, s1.y, 'no-such-crop', ark, T0).ok, 'unknown crop rejected');

// ── growth on the wall clock ──
const crop = cropById(ark, starterCrop);
const plant = p1.farm.bed.plants[0];
const g0 = growthOf(plant, crop, T0);
ok(g0.stage === 0 && !g0.ready, 'freshly planted is stage 0');
const needMs = crop.growthDays * DAY_MS;
const gHalf = growthOf(plant, crop, T0 + needMs / (2 * FRESH_SPD));
ok(Math.abs(gHalf.stage - 0.5) < 1e-6, 'fresh-soil 4x: halfway at need/(2*spd)');
const gDone = growthOf(plant, crop, T0 + needMs / FRESH_SPD + 1);
ok(gDone.ready, 'ripe after need/spd');
// tends cut total time: 3 friends → 30% off
const gTend = growthOf(plant, crop, T0 + needMs * 0.7 / FRESH_SPD + 1, 3);
ok(gTend.ready, 'three tends → ripe at 70% of the time');
ok(!growthOf(plant, crop, T0 + needMs * 0.65 / FRESH_SPD, 3).ready, '…but not at 64%');

// ── harvest ──
const tRipe = T0 + needMs / FRESH_SPD + 5;
ok(!harvestPlant(p1.farm, plant.id, ark, T0 + 1000).ok, 'green plant refuses harvest');
const h1 = harvestPlant(p1.farm, plant.id, ark, tRipe);
ok(h1.ok, 'ripe plant harvests');
ok(h1.farm.pantry[starterCrop] === h1.yield && h1.yield >= 1, 'yield lands in pantry');
ok(h1.farm.seeds[starterCrop] >= 3, 'seeds come back');
ok(h1.farm.stats.harvests === 1, 'harvest counted');
ok(h1.farm.bed.plants.length === 0, 'bed cleared');

// ── market (+ ward) ──
const sell1 = sellProduce(h1.farm, starterCrop, 2, ark, tRipe);
ok(sell1.ok && sell1.coins >= 4, 'produce sells');
const warded = JSON.parse(JSON.stringify(h1.farm)); warded.effects.wardUntil = tRipe + 1000;
const sell2 = sellProduce(warded, starterCrop, 2, ark, tRipe);
ok(sell2.coins > sell1.coins, 'market ward raises the price');
ok(!sellProduce(h1.farm, starterCrop, 0, ark, tRipe).ok, 'zero sale rejected');

// ── gacha: deterministic, first pull free ──
const g1 = pullSeeds(f1, ark, T0), g1b = pullSeeds(f1, ark, T0);
ok(g1.ok && g1.cost === 0, 'first pull free');
ok(g1.crop.id === g1b.crop.id, 'pull is deterministic (same index → same crop)');
const g2 = pullSeeds(g1.farm, ark, T0);
ok(g2.ok && g2.cost > 0, 'second pull costs');
const broke = JSON.parse(JSON.stringify(g1.farm)); broke.coins = 0;
ok(!pullSeeds(broke, ark, T0).ok, 'no pull without coins');

// ── gifts ──
const gift = claimGift(f1, 'at://did:plc:x/com.minomobi.farm.gift/3abc', { kind: 'seed', id: starterCrop, qty: 2 }, T0);
ok(gift.ok && gift.farm.seeds[starterCrop] === f1.seeds[starterCrop] + 2, 'gift claimed');
ok(!claimGift(gift.farm, 'at://did:plc:x/com.minomobi.farm.gift/3abc', { kind: 'seed', id: starterCrop, qty: 2 }, T0).ok, 'double-claim refused');
const give = giveSeed(gift.farm, starterCrop, 1, T0);
ok(give.ok && give.farm.stats.giftsSent === 1, 'giving decrements + counts');
ok(!giveSeed(f1, 'no-such', 1, T0).ok, 'cannot give what you lack');

// ── the bench: brew sage+betony+hyssop (all hot&dry Jupiter-ish) → coherent draught ──
const rich = JSON.parse(JSON.stringify(f1));
rich.pantry = { sage: 2, betony: 1, hyssop: 1 };
const prepped = prepare(['Salvia officinalis', 'Betonica officinalis', 'Hyssopus officinalis'], 'draught');
ok(prepped.ok && prepped.grade, 'alchemy kernel prepares');
const brewed = applyBrew(rich, prepped, ['sage', 'betony', 'hyssop'], 'draught', false, T0);
ok(brewed.ok, 'brew applies');
ok(brewed.farm.pantry.sage === 1 && !brewed.farm.pantry.betony, 'reagents consumed');
ok(brewed.farm.preparations.length === 1, 'preparation stored');
// vessel tax: an elixir needs gold
const noGold = applyBrew(rich, prepare(['Salvia officinalis', 'Betonica officinalis'], 'elixir'), ['sage', 'betony'], 'elixir', false, T0);
ok(!noGold.ok && /gold/.test(noGold.reason), 'elixir without gold refused');
rich.metals = { gold: 1 };
const golden = applyBrew(rich, prepare(['Salvia officinalis', 'Betonica officinalis'], 'elixir'), ['sage', 'betony'], 'elixir', false, T0);
ok(golden.ok && !golden.farm.metals.gold, 'elixir consumes the gold');
ok(Object.keys(PREP_METAL).length === 5, 'five vessels carry a metal tax');

// ── using preparations: each humour → its farm utility ──
const mk = (use) => { const f = JSON.parse(JSON.stringify(brewed.farm)); f.preparations = [{ id: 'z', use, vessel: 'T', grade: 'B', label: '', reagents: [], at: T0 }]; return f; };
const dew = usePreparation(mk({ deliver: 'self', combat: { kind: 'heal', amount: 4 } }), 'z', T0);
ok(dew.ok && /dew/.test(dew.effect), 'cooling → dew');
const vig = usePreparation(mk({ deliver: 'self', combat: { kind: 'buff', amount: 2, stat: 'atk' } }), 'z', T0);
ok(vig.ok && vig.farm.effects.yieldBoost === 2, 'rousing → yield boost');
const bomb = usePreparation(mk({ deliver: 'self', combat: { kind: 'attack', damage: 6 } }), 'z', T0);
ok(bomb.ok && bomb.farm.mine.bombs >= 1, 'caustic → bombs');
const ward = usePreparation(mk({ deliver: 'self', combat: { kind: 'debuff', turns: 2 } }), 'z', T0);
ok(ward.ok && ward.farm.effects.wardUntil > T0, 'sedate → market ward');
const oil = usePreparation(mk({ deliver: 'touch', lubricant: { chassis: 'servo' } }), 'z', T0);
ok(oil.ok && oil.farm.mine.picksBonus === 1, 'oil → tempered picks');

// ── streaks: one grant per UTC day, consecutive days extend, gaps reset, dew capped ──
const DAY = 86400000;
const st1 = touchStreak(p1.farm, T0);
ok(st1.ok && st1.streak === 1, 'first visit starts the streak');
ok(st1.farm.bed.plants[0].boost >= STREAK_DEW_MIN * 60000, 'streak settles dew on the plant');
ok(!touchStreak(st1.farm, T0 + 1000).ok, 'same-day repeat is a no-op');
const st2 = touchStreak(st1.farm, T0 + DAY);
ok(st2.ok && st2.streak === 2, 'next day extends');
const stGap = touchStreak(st2.farm, T0 + 4 * DAY);
ok(stGap.ok && stGap.streak === 1, 'a gap resets the run');
let stLong = st1.farm;
for (let d = 1; d <= 10; d++) { const r = touchStreak(stLong, T0 + d * DAY); if (r.ok) stLong = r.farm; }
ok(stLong.streak.run === 11 && (function () {
  const r = touchStreak(stLong, T0 + 11 * DAY);
  return r.dewMin === STREAK_CAP * STREAK_DEW_MIN;
})(), 'dew grant caps at a week even as the run grows');

// ── post-to-progress: one payout per deed, ever ──
const sh1 = recordShare(f1, 'first-seed', T0);
ok(sh1.ok && sh1.farm.coins === f1.coins + SHARE_COINS, 'sharing a deed pays the town crier');
ok(!recordShare(sh1.farm, 'first-seed', T0 + 99).ok, 'a deed pays only once');
ok(recordShare(sh1.farm, 'first-pull', T0).ok, 'a different deed pays fresh');

// ── record round-trip ──
const rec = toPlotRecord(h1.farm, tRipe);
ok(rec.$type === 'com.minomobi.farm.plot', 'record typed');
ok(JSON.stringify(fromPlotRecord(rec)) === JSON.stringify(h1.farm), 'plot record round-trips');
ok(JSON.stringify(rec).length < 900 * 1024, 'record far under the PDS ceiling');

console.log(`state.selftest: ${n} assertions passed`);
