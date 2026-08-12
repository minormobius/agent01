// state.selftest.mjs — the farm kernel under assertion. Run: node farm/test/state.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  newFarm, plantSeed, growthOf, harvestPlant, sellProduce, pullSeeds, claimGift, giveSeed,
  applyBrew, usePreparation, toPlotRecord, fromPlotRecord, cropById, DAY_MS, FRESH_SPD, START_COINS, PREP_METAL,
  touchStreak, recordShare, STREAK_CAP, STREAK_DEW_MIN, SHARE_COINS,
  baseTile, tileAt, plantableTile, terraform, moveBuilding, buildingAt, TERRA_COST, POND_CUT,
  packList, unlockPack, setActiveBiome, pondAdjacent, defaultBuildings, FIELD_T, WORLD_MIN, WORLD_MAX,
  PARCEL_R, parcelTerrain, buyParcel, buyableParcels, ownsTile,
} from '../js/state.js';
import { prepare } from '../vendor/alchemy.js';

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

// ── planting: find a plantable spot deterministically (tile-world rules) ──
const starterCrop = Object.keys(f1.seeds)[0];
function findSpot(farm) {
  for (let ty = 0; ty < FIELD_T; ty++) for (let tx = 0; tx < FIELD_T; tx++) {
    const x = (tx + 0.5) / FIELD_T, y = (ty + 0.5) / FIELD_T;
    if (plantableTile(farm, x, y)) return { x, y };
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
ok(!plantSeed(f1, (WORLD_MIN - 3) / FIELD_T, 0.5, starterCrop, ark, T0).ok, 'beyond the world rejected');
ok(!plantSeed(f1, s1.x, s1.y, 'no-such-crop', ark, T0).ok, 'unknown crop rejected');
// meadow is not plantable until tilled
const meadowX = (FIELD_T + 1.5) / FIELD_T;
ok(!plantSeed(f1, meadowX, 0.5, starterCrop, ark, T0).ok, 'raw meadow refuses a seed');

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

// ── the parcel world: baseline, purchase, terraforming, buildings ──
ok(['soil', 'path', 'pond', 'stone'].includes(baseTile(f1.seed, 5, 5)), 'inside the home field the seed decides');
ok(tileAt(f1, 5, 5) === baseTile(f1.seed, 5, 5), 'no override → baseline');
ok(f1.parcels.length === 1 && f1.parcels[0] === '0,0', 'a fresh farm owns the home parcel only');
// terrain rolls: deterministic, varied, mostly workable
const seen = new Set();
for (let px = -PARCEL_R; px <= PARCEL_R; px++) for (let py = -PARCEL_R; py <= PARCEL_R; py++) {
  if (px === 0 && py === 0) continue;
  const t = parcelTerrain(f1.seed, px, py);
  ok(JSON.stringify(t.map) === JSON.stringify(parcelTerrain(f1.seed, px, py).map), 'terrain is deterministic');
  seen.add(t.archetype);
  const meadow = t.map.filter((k) => k === 'meadow').length;
  ok(meadow >= FIELD_T * FIELD_T * 0.4, 'a parcel is mostly workable (' + t.archetype + ': ' + meadow + ' meadow)');
}
ok(seen.size >= 3, 'terrain archetypes vary across the estate (' + [...seen].join(', ') + ')');
// buying: adjacency, price scaling, funds
ok(!buyParcel(f1, 2, 2, T0).ok, 'a far corner is not adjacent — refused');
ok(!buyParcel(JSON.parse(JSON.stringify(f1)), 1, 0, T0).ok, '30◈ does not buy land');
const rich2 = JSON.parse(JSON.stringify(f1)); rich2.coins = 5000;
const buy1 = buyParcel(rich2, 1, 0, T0);
ok(buy1.ok && buy1.price === 200 && buy1.farm.coins === 4800, 'first neighbour costs 200◈');
ok(buy1.farm.parcels.includes('1,0'), 'the deed is recorded');
ok(!buyParcel(buy1.farm, 1, 0, T0).ok, 'cannot buy it twice');
const buy2 = buyParcel(buy1.farm, 0, 1, T0);
ok(buy2.ok && buy2.price === 400, 'second purchase costs more (200 × n)');
const buyRing2 = buyParcel(buy1.farm, 2, 0, T0);
ok(buyRing2.ok && buyRing2.price === 800, 'ring-2 land costs double its row (200 × n × ring)');
// terraforming: only on owned land
ok(!terraform(rich2, FIELD_T + 1, 6, 'till', T0).ok, 'no terraforming on unowned land');
ok(!plantSeed(rich2, (FIELD_T + 1.5) / FIELD_T, 6.5 / FIELD_T, starterCrop, ark, T0).ok, 'no planting on unowned land');
ok(!moveBuilding(rich2, 'desk', FIELD_T + 1, 6, T0).ok, 'no buildings on unowned land');
// on the bought parcel: find meadow, till it, plant in it
const owned1 = buy1.farm;
const terr1 = parcelTerrain(f1.seed, 1, 0);
const mIdx = terr1.map.findIndex((k) => k === 'meadow');
const mTx = FIELD_T + (mIdx % FIELD_T), mTy = Math.floor(mIdx / FIELD_T);
const till = terraform(owned1, mTx, mTy, 'till', T0);
ok(till.ok && till.farm.coins === owned1.coins - TERRA_COST.till, 'tilling bought meadow costs its price');
ok(tileAt(till.farm, mTx, mTy) === 'soil', 'tilled tile reads soil');
const outPlant = plantSeed(till.farm, (mTx + 0.5) / FIELD_T, (mTy + 0.5) / FIELD_T, starterCrop, ark, T0);
ok(outPlant.ok, 'a seed goes into the new parcel');
ok(!terraform(outPlant.farm, mTx, mTy, 'pond', T0).ok, 'no terraforming under a plant');
ok(!terraform(owned1, WORLD_MAX + 1, 0, 'till', T0).ok, 'no terraforming beyond the world');
ok(!terraform(owned1, mTx, mTy, 'clear', T0).ok, 'clear needs a stone');
// hills: find one across the estate, flatten it (after buying everything)
let allLand = JSON.parse(JSON.stringify(rich2)); allLand.coins = 1e9;
for (let guard = 0; guard < 30; guard++) {
  const market = buyableParcels(allLand);
  if (!market.length) break;
  const r = buyParcel(allLand, market[0].px, market[0].py, T0);
  ok(r.ok, 'an on-market parcel always sells (' + market[0].px + ',' + market[0].py + ')');
  allLand = r.farm;
}
ok(allLand.parcels.length === (2 * PARCEL_R + 1) ** 2, 'buying outward reaches the whole map');
let hillTile = null;
for (let ty = WORLD_MIN; ty <= WORLD_MAX && !hillTile; ty++) for (let tx = WORLD_MIN; tx <= WORLD_MAX && !hillTile; tx++) {
  if (tileAt(allLand, tx, ty) === 'hill') hillTile = { tx, ty };
}
ok(!!hillTile, 'somewhere on the estate there are hills');
ok(!plantSeed(allLand, (hillTile.tx + 0.5) / FIELD_T, (hillTile.ty + 0.5) / FIELD_T, starterCrop, ark, T0).ok, 'hills refuse the plough');
ok(!moveBuilding(allLand, 'desk', hillTile.tx, hillTile.ty, T0).ok, 'buildings refuse hills');
const flat = terraform(allLand, hillTile.tx, hillTile.ty, 'flatten', T0);
ok(flat.ok && tileAt(flat.farm, hillTile.tx, hillTile.ty) === 'meadow' && allLand.coins - flat.farm.coins === TERRA_COST.flatten, 'flatten levels a hill for 60◈');
// roads: tillable straight over
let roadTile = null;
for (let ty = WORLD_MIN; ty <= WORLD_MAX && !roadTile; ty++) for (let tx = WORLD_MIN; tx <= WORLD_MAX && !roadTile; tx++) {
  if (tileAt(allLand, tx, ty) === 'road') roadTile = { tx, ty };
}
ok(!!roadTile, 'somewhere an old road crosses the estate');
const overRoad = terraform(allLand, roadTile.tx, roadTile.ty, 'till', T0);
ok(overRoad.ok && tileAt(overRoad.farm, roadTile.tx, roadTile.ty) === 'soil', 'an old road tills over');
// ponds water the neighbours (dig beside the tilled tile — pick a diggable neighbour)
const digAt = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [mTx + dx, mTy + dy])
  .find(([x, y]) => ownsTile(till.farm, x, y) && ['soil', 'meadow', 'path', 'road'].includes(tileAt(till.farm, x, y)));
ok(!!digAt, 'a diggable neighbour exists');
const pond = terraform(till.farm, digAt[0], digAt[1], 'pond', T0);
ok(pond.ok, 'pond digs on owned land');
const wet = plantSeed(pond.farm, (mTx + 0.5) / FIELD_T, (mTy + 0.5) / FIELD_T, starterCrop, ark, T0);
ok(wet.ok && pondAdjacent(wet.farm, wet.farm.bed.plants.at(-1)), 'plant beside the dug pond is watered');
const dryG = growthOf(wet.farm.bed.plants.at(-1), cropById(ark, starterCrop), T0 + 1, 0, false);
const wetG = growthOf(wet.farm.bed.plants.at(-1), cropById(ark, starterCrop), T0 + 1, 0, true);
ok(Math.abs(wetG.needMs - dryG.needMs * (1 - POND_CUT)) < 2, 'pond adjacency cuts growth need by POND_CUT');
// reverting to baseline drops the override key
const t3 = terraform(owned1, mTx, mTy, 'till', T0), t3b = terraform(t3.farm, mTx, mTy, 'meadow', T0 + 1);
ok(t3b.ok && !((mTx + ',' + mTy) in t3b.farm.terra), 'reverting to baseline drops the override');
// buildings: move rules (inside the home parcel)
const bTile = f1.buildings[0];
ok(!terraform(rich2, bTile.tx, bTile.ty, 'pond', T0).ok, 'no terraforming under a building');
let spot = null;
for (let ty = 0; ty < FIELD_T && !spot; ty++) for (let tx = 0; tx < FIELD_T && !spot; tx++) {
  const t = tileAt(f1, tx, ty);
  if (t !== 'pond' && !buildingAt(f1, tx, ty) && !f1.bed.plants.some((p) => Math.floor(p.x * FIELD_T) === tx && Math.floor(p.y * FIELD_T) === ty)) spot = { tx, ty };
}
const mv = moveBuilding(rich2, 'desk', spot.tx, spot.ty, T0);
ok(mv.ok && buildingAt(mv.farm, spot.tx, spot.ty), 'building moves');
ok(moveBuilding(rich2, 'desk', bTile.tx, bTile.ty, T0).ok, 'setting a building back on its own tile is fine');
ok(!moveBuilding(mv.farm, 'mine', spot.tx, spot.ty, T0).ok, 'two buildings cannot share a tile');
const stations = defaultBuildings(f1.seed);
ok(stations.length === 5, 'five stations');
ok(stations.every((b) => b.tx >= 0 && b.tx < FIELD_T && b.ty >= 0 && b.ty < FIELD_T), 'stations start on home land');
ok(new Set(stations.map((b) => b.tx + ',' + b.ty)).size === 5, 'stations never stack');
ok(stations.every((b) => !['pond', 'stone'].includes(baseTile(f1.seed, b.tx, b.ty))), 'stations avoid water and boulders');

// ── ecosystem packs: visible ladder, ordered unlocks ──
const pl0 = packList(f1, ark);
ok(pl0.length === ark.biomes.length, 'every biome on the shelf');
ok(pl0[0].unlocked && pl0[0].id === f1.biomeId, 'home pack unlocked first');
ok(pl0.filter((p) => p.isNext).length === 1, 'exactly one next pack');
ok(!unlockPack(f1, pl0[1].id, ark, T0).ok, 'fresh farm cannot afford the next pack');
const veteran = JSON.parse(JSON.stringify(f1));
veteran.coins = 120; veteran.stats.harvests = 12;
const un1 = unlockPack(veteran, pl0[1].id, ark, T0);
ok(un1.ok && un1.farm.packs.length === 2 && un1.farm.coins === 20, 'pack 2 unlocks on 100◈ + 10 harvests');
ok(un1.farm.activeBiome === pl0[1].id, 'new pack becomes the dealing pool');
ok(!unlockPack(veteran, pl0[2].id, ark, T0).ok, 'cannot skip the ladder');
const pull2 = pullSeeds(un1.farm, ark, T0);
ok(pull2.ok && ark.biomes.find((b) => b.id === pl0[1].id).crops.some((c) => c.id === pull2.crop.id), 'pulls now deal from the new pack');
const swap = setActiveBiome(un1.farm, f1.biomeId, T0);
ok(swap.ok && swap.farm.activeBiome === f1.biomeId, 'switch back to home pool');
ok(!setActiveBiome(f1, pl0[2].id, T0).ok, 'cannot deal from a locked pack');

// ── migrations: v1 → v3 and v2 → v3 ──
const v1rec = { $type: 'com.minomobi.farm.plot', v: 1, farm: JSON.parse(JSON.stringify(f1)), updatedAt: 'x' };
v1rec.farm.v = 1; delete v1rec.farm.terra; delete v1rec.farm.buildings; delete v1rec.farm.packs; delete v1rec.farm.activeBiome; delete v1rec.farm.parcels;
const migrated = fromPlotRecord(v1rec);
ok(migrated.v === 3 && migrated.buildings.length === 5 && migrated.packs[0] === f1.biomeId && migrated.parcels[0] === '0,0', 'v1 record migrates all the way to the parcel world');
ok(migrated.buildings.every((b) => ownsTile(migrated, b.tx, b.ty)), 'migrated stations stand on owned land');
// v2 save with the old outside-the-field furniture: stranded building, outside terra, outside plant
const v2rec = { $type: 'com.minomobi.farm.plot', v: 2, farm: JSON.parse(JSON.stringify(f1)), updatedAt: 'x' };
const vf = v2rec.farm; vf.v = 2; delete vf.parcels;
vf.buildings = [{ id: 'desk', kind: 'desk', tx: 13, ty: 3 }, ...vf.buildings.slice(1)];
vf.terra = { '13,6': 'soil' };
vf.coins = 100;
vf.bed.plants.push({ id: 'pX', x: 13.5 / FIELD_T, y: 6.5 / FIELD_T, seedId: starterCrop, at: T0, spd: 1, boost: 0 });
const seedsBefore = vf.seeds[starterCrop] | 0;
const mig2 = fromPlotRecord(v2rec);
ok(mig2.v === 3, 'v2 record migrates');
ok(mig2.buildings.every((b) => ownsTile(mig2, b.tx, b.ty)), 'stranded desk pulled back onto home land');
ok(!('13,6' in mig2.terra) && mig2.coins === 100 + TERRA_COST.till, 'outside terraform dropped, till price refunded');
ok(!mig2.bed.plants.some((p) => p.id === 'pX') && (mig2.seeds[starterCrop] | 0) === seedsBefore + 1, 'outside plant returns to the seed bag');

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
