// state.selftest.mjs — the farm kernel under assertion. Run: node farm/test/state.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  newFarm, plantSeed, growthOf, harvestPlant, sellProduce, pullSeeds, claimGift, giveSeed,
  applyBrew, usePreparation, toPlotRecord, fromPlotRecord, cropById, DAY_MS, FRESH_SPD, START_COINS, PREP_METAL,
  touchStreak, recordShare, STREAK_CAP, STREAK_DEW_MIN, SHARE_COINS,
  baseTile, tileAt, plantableTile, terraform, moveBuilding, buildingAt, TERRA_COST,
  packList, unlockPack, setActiveBiome, defaultBuildings, FIELD_T, WORLD_MIN, WORLD_MAX,
  PARCEL_R, parcelTerrain, buyParcel, buyableParcels, ownsTile,
  WATER_MS, DRY_RATE, waterPlant, isWatered, irrigated, isInfested, pestWindow, treatPest,
  fertilizePlant, buySupply, research, TECHS, hasTech, techChecks, placeSprinkler,
  SPRINKLER_COST, SUPPLY_COST, ORGANIC_PREMIUM, sellPriceOrganic, FERT_BUMP, FERT_MAX,
  PEST_WINDOW_MS, PEST_BITE, SPRAY_IMMUNE_W,
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
const g0 = growthOf(p1.farm, plant, crop, T0);
ok(g0.stage === 0 && !g0.ready, 'freshly planted is stage 0');
ok(g0.watered, 'a fresh planting is watered in');
const needMs = crop.growthDays * DAY_MS;
const gHalf = growthOf(p1.farm, plant, crop, T0 + needMs / (2 * FRESH_SPD));
ok(Math.abs(gHalf.stage - 0.5) < 1e-6, 'fresh-soil 4x: halfway at need/(2*spd) (inside the water window)');
const gDone = growthOf(p1.farm, plant, crop, T0 + needMs / FRESH_SPD + 1);
ok(gDone.ready, 'ripe after need/spd');
// tends cut total time: 3 friends → 30% off
const gTend = growthOf(p1.farm, plant, crop, T0 + needMs * 0.7 / FRESH_SPD + 1, 3);
ok(gTend.ready, 'three tends → ripe at 70% of the time');
ok(!growthOf(p1.farm, plant, crop, T0 + needMs * 0.65 / FRESH_SPD, 3).ready, '…but not at 64%');

// ── IRRIGATION: the watering task, piecewise dry rate, the settle model ──
{
  // a slow crop planted with spd 1 in a doctored farm (skip fresh-soil to keep the math bare)
  const slow = JSON.parse(JSON.stringify(f1));
  slow.stats.harvests = 5;   // no fresh-soil multiplier
  const spot2 = findSpot(slow);
  const pr = plantSeed(slow, spot2.x, spot2.y, starterCrop, ark, T0);
  ok(pr.ok && pr.spd === 1, 'veteran planting runs at spd 1');
  const wf = pr.farm, wp = wf.bed.plants.at(-1);
  ok(isWatered(wf, wp, T0 + WATER_MS - 1) && !isWatered(wf, wp, T0 + WATER_MS + 1), 'water holds exactly WATER_MS');
  // growth: full rate inside the window, DRY_RATE after
  const inWin = growthOf(wf, wp, crop, T0 + WATER_MS);
  ok(Math.abs(inWin.stage - Math.min(1, WATER_MS / needMs)) < 1e-6, 'full rate while watered');
  const dryHrs = 4 * 3600 * 1000;
  const after = growthOf(wf, wp, crop, T0 + WATER_MS + dryHrs);
  ok(Math.abs((after.stage - inWin.stage) - Math.min(1 - inWin.stage, dryHrs * DRY_RATE / needMs)) < 1e-6 || after.stage === 1, 'dry time counts at DRY_RATE');
  // watering again settles the dry spell and restarts the window
  ok(!waterPlant(wf, wp.id, T0 + 1000).ok, 'still damp — no rewater inside the window');
  const rw = waterPlant(wf, wp.id, T0 + WATER_MS + dryHrs);
  ok(rw.ok, 'a dry plant takes water');
  const wp2 = rw.farm.bed.plants.at(-1);
  ok(Math.abs(wp2.grownMs - (WATER_MS + dryHrs * DRY_RATE)) < 2, 'settle banked wet window + dry spell at half rate');
  const g2 = growthOf(rw.farm, wp2, crop, T0 + WATER_MS + dryHrs + 60000);
  ok(g2.watered, 'watered again after the can');
}

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
ok(wet.ok && irrigated(wet.farm, wet.farm.bed.plants.at(-1)), 'plant beside the dug pond is naturally irrigated');
ok(isWatered(wet.farm, wet.farm.bed.plants.at(-1), T0 + WATER_MS * 10), 'irrigated plants never dry out');
ok(!waterPlant(wet.farm, wet.farm.bed.plants.at(-1).id, T0 + WATER_MS * 10).ok, 'no point watering the shore row');
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
ok(stations.length === 6, 'six stations (waterworks joined)');
ok(stations.every((b) => b.tx >= 0 && b.tx < FIELD_T && b.ty >= 0 && b.ty < FIELD_T), 'stations start on home land');
ok(new Set(stations.map((b) => b.tx + ',' + b.ty)).size === 6, 'stations never stack');
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
ok(migrated.v === 4 && migrated.buildings.length === 6 && migrated.packs[0] === f1.biomeId && migrated.parcels[0] === '0,0', 'v1 record migrates all the way to the irrigated parcel world');
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
ok(mig2.v === 4, 'v2 record migrates');
ok(mig2.buildings.every((b) => ownsTile(mig2, b.tx, b.ty)), 'stranded desk pulled back onto home land');
ok(!('13,6' in mig2.terra) && mig2.coins === 100 + TERRA_COST.till, 'outside terraform dropped, till price refunded');
ok(!mig2.bed.plants.some((p) => p.id === 'pX') && (mig2.seeds[starterCrop] | 0) === seedsBefore + 1, 'outside plant returns to the seed bag');

// ── streaks: one grant per UTC day, consecutive days extend, gaps reset, dew capped ──
const DAY = 86400000;
const st1 = touchStreak(p1.farm, T0);
ok(st1.ok && st1.streak === 1, 'first visit starts the streak');
ok(st1.farm.bed.plants[0].grownMs >= STREAK_DEW_MIN * 60000, 'streak settles dew straight into banked growth');
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

// ── SUPPLIES, FERTILIZER & THE ORGANIC FORK ──
{
  const base = JSON.parse(JSON.stringify(p1.farm)); base.coins = 500;
  ok(!fertilizePlant(base, plant.id, ark, T0).ok, 'no fertilizer in the shed yet');
  const bought = buySupply(base, 'fert', 2, T0);
  ok(bought.ok && bought.farm.supplies.fert === 2 && bought.farm.coins === 500 - 2 * SUPPLY_COST.fert, 'desk sells fertilizer');
  const fed = fertilizePlant(bought.farm, plant.id, ark, T0 + 1000);
  ok(fed.ok, 'fertilizer applies');
  const fp = fed.farm.bed.plants[0];
  ok(fp.syn === true, 'one dose marks the plant conventional for life');
  ok(fp.grownMs >= FERT_BUMP * needMs - 2, 'a dose banks 25% of base growth');
  let fed2 = fertilizePlant(fed.farm, plant.id, ark, T0 + 2000);
  ok(fed2.ok, 'second dose fine');
  ok(!fertilizePlant(fed2.farm, plant.id, ark, T0 + 3000).ok, 'the soil can take no more (FERT_MAX)');
  // synthetic harvest → conventional pantry; organic harvest → premium pantry
  const ripeAt = T0 + needMs / FRESH_SPD + 5;
  const synH = harvestPlant(fed.farm, plant.id, ark, ripeAt);
  ok(synH.ok && !synH.organic, 'synthetic-touched harvest is conventional');
  ok((synH.farm.pantryC[starterCrop] | 0) === synH.yield && !(starterCrop in synH.farm.pantry), 'conventional produce lands in its own pantry');
  const orgH = harvestPlant(p1.farm, plant.id, ark, ripeAt);
  ok(orgH.ok && orgH.organic && (orgH.farm.pantry[starterCrop] | 0) === orgH.yield, 'untouched harvest stays organic');
  // organic premium at market
  ok(sellPriceOrganic(crop) === Math.round(Math.max(2, Math.round((crop.seedCost || 10) * 0.5)) * ORGANIC_PREMIUM), 'organic price is the premium');
  const sOrg = sellProduce(orgH.farm, starterCrop, orgH.yield, ark, ripeAt, 'organic');
  const sConv = sellProduce(synH.farm, starterCrop, synH.yield, ark, ripeAt, 'conv');
  ok(sOrg.ok && sConv.ok, 'both pantries sell');
  ok(sOrg.coins / Math.max(1, orgH.yield) > sConv.coins / Math.max(1, synH.yield), 'organic beats conventional per unit');
  ok(!sellProduce(orgH.farm, starterCrop, 1, ark, ripeAt, 'conv').ok, 'grades do not cross-sell');
}

// ── PESTS: deterministic windows, the two treatments ──
{
  const base = JSON.parse(JSON.stringify(p1.farm)); base.coins = 500;
  const pl = base.bed.plants[0];
  ok(!isInfested(base, pl, T0 + PEST_WINDOW_MS / 2), 'window 0 is always safe');
  ok(isInfested(base, pl, T0 + 5 * PEST_WINDOW_MS) === isInfested(base, pl, T0 + 5 * PEST_WINDOW_MS), 'verdicts are deterministic');
  // find an infested window for this plant (PEST_RATE means one turns up fast)
  let w = 0;
  for (let i = 1; i < 60 && !w; i++) if (isInfested(base, pl, T0 + i * PEST_WINDOW_MS + 1)) w = i;
  ok(w > 0, 'somewhere the beetles arrive (window ' + w + ')');
  const tBug = T0 + w * PEST_WINDOW_MS + 1;
  ok(!treatPest(base, pl.id, 'spray', T0 + PEST_WINDOW_MS / 2).ok, 'nothing to treat in a clean window');
  ok(!treatPest(base, pl.id, 'spray', tBug).ok, 'spray needs pesticide in the shed');
  const withPest = buySupply(base, 'pest', 1, tBug).farm;
  const sprayed = treatPest(withPest, pl.id, 'spray', tBug);
  ok(sprayed.ok && !sprayed.organic, 'spray works and is synthetic');
  ok(sprayed.farm.bed.plants[0].syn === true, 'spray marks the plant conventional');
  ok(!isInfested(sprayed.farm, sprayed.farm.bed.plants[0], tBug), 'sprayed window is clear');
  ok(!isInfested(sprayed.farm, sprayed.farm.bed.plants[0], tBug + (SPRAY_IMMUNE_W - 1) * PEST_WINDOW_MS), 'spray immunity holds its windows');
  // the organic road: a caustic brew
  ok(!treatPest(base, pl.id, 'remedy', tBug).ok, 'remedy needs a caustic preparation');
  const withBrew = JSON.parse(JSON.stringify(base));
  withBrew.preparations = [{ id: 'zz', vessel: 'Draught', grade: 'B', label: '', reagents: [], use: { deliver: 'self', combat: { kind: 'attack', damage: 4 } }, at: T0 }];
  const remedied = treatPest(withBrew, pl.id, 'remedy', tBug);
  ok(remedied.ok && remedied.organic, 'caustic remedy treats organically');
  ok(remedied.farm.bed.plants[0].syn === false && remedied.farm.preparations.length === 0, 'remedy consumes the brew, plant stays organic');
  ok(remedied.farm.stats.pestsTreated === 1, 'treatment counted');
  // harvesting through an infestation costs PEST_BITE
  const bitten = JSON.parse(JSON.stringify(base));
  bitten.bed.plants[0].grownMs = needMs + 1;   // force ripe
  const hB = harvestPlant(bitten, pl.id, ark, tBug);
  ok(hB.ok && hB.bitten && hB.yield === Math.max(1, Math.max(1, crop.yield | 0) - PEST_BITE), 'the beetles take their share');
}

// ── THE WATERWORKS: research ladder + sprinklers ──
{
  const lab = JSON.parse(JSON.stringify(p1.farm));   // has the one planted crop
  ok(!research(lab, 'sprinklers', T0).ok, 'a fresh farm cannot afford sprinklers');
  ok(!research(lab, 'channels', T0).ok, 'the ladder respects req order');
  lab.coins = 5000; lab.metals = { copper: 2, iron: 3, tin: 4, silver: 2, gold: 1, quicksilver: 1 };
  const r1 = research(lab, 'sprinklers', T0);
  ok(r1.ok && hasTech(r1.farm, 'sprinklers') && !(r1.farm.metals.copper | 0), 'sprinklers researched — coins AND copper spent');
  ok(!research(r1.farm, 'sprinklers', T0).ok, 'no double research');
  // place a sprinkler beside a plant → irrigated forever
  const pl = r1.farm.bed.plants[0];
  const ptx = Math.floor(pl.x * FIELD_T), pty = Math.floor(pl.y * FIELD_T);
  ok(!placeSprinkler(f1, ptx + 1, pty, T0).ok, 'no sprinklers without the tech');
  let target = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const t = tileAt(r1.farm, ptx + dx, pty + dy);
    if (t !== 'pond' && t !== 'hill' && !buildingAt(r1.farm, ptx + dx, pty + dy)) { target = [ptx + dx, pty + dy]; break; }
  }
  const placed = placeSprinkler(r1.farm, target[0], target[1], T0);
  ok(placed.ok && placed.farm.fixtures.length === 1, 'sprinkler placed (coins + tin)');
  ok(irrigated(placed.farm, placed.farm.bed.plants[0]), 'the sprinkler waters the neighbouring plant');
  const pulled = placeSprinkler(placed.farm, target[0], target[1], T0 + 1);
  ok(pulled.ok && pulled.removed && pulled.farm.fixtures.length === 0, 'tapping again pulls it up (half refund)');
  // the full ladder → deep well waters everything
  let deep = r1.farm;
  for (const id of ['channels', 'windpump', 'deepwell']) {
    deep.stats.brews = 5; deep.stats.organicHarvests = 20;
    const r = research(deep, id, T0); ok(r.ok, id + ' researches in order'); deep = r.farm;
  }
  ok(irrigated(deep, deep.bed.plants[0]), 'the deep well waters everything, everywhere');
  // organic-side techs: compost needs organic harvests; ladybugs halve pest windows for organic plants
  const eco = JSON.parse(JSON.stringify(f1)); eco.coins = 1000; eco.stats.organicHarvests = 12; eco.stats.brews = 3;
  const c1 = research(eco, 'compost', T0);
  ok(c1.ok, 'compost lore researches on organic credentials');
  const c2 = research(c1.farm, 'ladybugs', T0);
  ok(c2.ok, 'ladybug husbandry follows');
  // compost: organic harvest returns +1 seed
  const compostFarm = JSON.parse(JSON.stringify(c1.farm));
  compostFarm.bed = JSON.parse(JSON.stringify(p1.farm.bed));
  compostFarm.bed.plants[0].grownMs = needMs + 1;
  const hC = harvestPlant(compostFarm, plant.id, ark, T0 + PEST_WINDOW_MS / 2);
  ok(hC.ok && hC.seeds === Math.max(1, Math.min(3, crop.yield | 0)) + 1, 'compost lore: organic ground gives back an extra seed');
}

// ── v3 → v4: plants normalize to the settle model ──
{
  const v3rec = { $type: 'com.minomobi.farm.plot', v: 3, farm: JSON.parse(JSON.stringify(f1)), updatedAt: 'x' };
  const vf = v3rec.farm; vf.v = 3;
  delete vf.pantryC; delete vf.supplies; delete vf.tech; delete vf.fixtures;
  vf.buildings = vf.buildings.filter((b) => b.id !== 'mill');
  vf.updatedAt = T0 + 3600 * 1000;
  vf.bed.plants = [{ id: 'pOld', x: s1.x, y: s1.y, seedId: starterCrop, at: T0, spd: 2, boost: 60000 }];
  const m4 = fromPlotRecord(v3rec);
  ok(m4.v === 4 && m4.buildings.some((b) => b.id === 'mill'), 'v3 record gains the waterworks');
  const mp = m4.bed.plants[0];
  ok(mp.grownMs === 3600 * 1000 * 2 + 60000 && mp.calcAt === vf.updatedAt && mp.wateredAt === vf.updatedAt, 'old growth banks fully-watered; everyone wakes up freshly watered');
  ok(mp.boost === undefined && mp.syn === false, 'boost retired; grandfathered plants are organic');
}

// ── record round-trip ──
const rec = toPlotRecord(h1.farm, tRipe);
ok(rec.$type === 'com.minomobi.farm.plot', 'record typed');
ok(JSON.stringify(fromPlotRecord(rec)) === JSON.stringify(h1.farm), 'plot record round-trips');
ok(JSON.stringify(rec).length < 900 * 1024, 'record far under the PDS ceiling');

console.log(`state.selftest: ${n} assertions passed`);
