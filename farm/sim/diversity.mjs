// diversity.mjs — THE ORACLE'S SECOND INSTRUMENT: content diversity, measured instead of guessed.
//
//   node farm/sim/diversity.mjs [--days 28 --seeds 4]
//
// Three questions, three measurements:
//
// 1. NOVELTY DEPLETION (supply side): novelty is a depletable resource. Track the FIRST-SEEN time
//    of every distinct element (crop species, deed, tech, skin, animal kind, biome) across a run →
//    the novelty curve. Where it flattens is where the content runs out; the flat tail is churn.
//
// 2. COLLECTION MATH (coupon collector): for each biome, simulate the real gacha (weights ×
//    NEW_BIAS) to get expected pulls-to-close → coins-to-close → days-to-close at the measured
//    income rate. A set that can't close inside the retention horizon never triggers completion
//    hunger; one that closes in a day wastes its species.
//
// 3. CHOICE ENTROPY (demand side): variety is only real if it changes decisions. Measure the
//    normalized Shannon entropy of which crops actually get planted (a GREEDY value-per-hour
//    player, not the random planter) — near 0 = one dominant crop, the rest is wallpaper;
//    near 1 = the roster genuinely differentiates.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as S from '../js/state.js';
import * as Mine from '../js/mine.js';
import { evaluate as evalAch, markEarned, ACHIEVEMENTS } from '../js/achievements.js';
import { SKINS, skinUnlocked } from '../js/themes.js';
import { pull as gachaPull, pullRng, biomeList, progress } from '../vendor/gacha.js';

const here = dirname(fileURLToPath(import.meta.url));
const ark = JSON.parse(readFileSync(join(here, '../vendor/ark.json'), 'utf8'));

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? +args[i + 1] : d; };
const DAYS = arg('days', 28);
const SEEDS = arg('seeds', 4);

function rngFor(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// ── 2. coupon-collector on the REAL gacha (weights + NEW_BIAS), per biome ─────────────────────────
console.log('━━━ COLLECTION MATH — pulls to close each biome (real gacha weights, 400 trials) ━━━');
const completion = [];
for (const biome of biomeList(ark)) {
  let total = 0;
  const TRIALS = 400;
  for (let t = 0; t < TRIALS; t++) {
    const owned = new Set();
    let pulls = 0;
    const rng = rngFor(t * 7919 + biome.crops.length);
    while (owned.size < biome.crops.length && pulls < 2000) {
      const r = gachaPull(biome, owned, rng);
      owned.add(r.crop.id); pulls++;
    }
    total += pulls;
  }
  const ePulls = total / TRIALS;
  const coins = Math.max(0, (ePulls - 1)) * S.PULL_COST;   // first pull free
  completion.push({ id: biome.id, name: biome.name, n: biome.crops.length, ePulls, coins });
  console.log('  ' + biome.name.padEnd(24) + String(biome.crops.length).padStart(3) + ' crops → E[' +
    ePulls.toFixed(1) + ' pulls] ≈ ' + coins.toFixed(0) + '◈ to close');
}

// ── the standard check-in player, instrumented for first-seens + a greedy planter ────────────────
function run(playerSeed, greedy) {
  const rng = rngFor(playerSeed * 2654435761);
  const T0 = 1_760_000_000_000;
  let farm = S.newFarm('did:plc:div' + playerSeed + 'padpadpad', ark, T0);
  const firstSeen = {};                              // 'class:id' → day
  const plantCounts = {};                            // cropId → times planted (for entropy)
  const see = (cls, id, day) => { const k = cls + ':' + id; if (!(k in firstSeen)) firstSeen[k] = day; };
  const income = { coins: 0 };

  const day0 = (t) => (t - T0) / 86400000;
  for (const id of farm.owned) see('crop', id, 0);

  for (let day = 0; day < DAYS; day++) {
    const st = S.touchStreak(farm, T0 + day * 86400000 + 8 * 3600000);
    if (st.ok) farm = st.farm;
    for (const h of [9, 13, 20]) {
      const now = T0 + day * 86400000 + h * 3600000 + Math.floor(rng() * 1800000);
      // forage
      for (const spot of S.forageSpots(farm, now)) {
        const r = S.forage(farm, spot.i, now);
        if (r.ok) { farm = r.farm; if (r.prize.kind === 'coins') income.coins += r.prize.qty; if (r.prize.kind === 'seed') { const g = S.grantWildseed(farm, ark, now); if (g.ok) { farm = g.farm; if (g.crop) see('crop', g.crop.id, day); } } }
      }
      // animals
      for (const a of [...(farm.animals || [])]) {
        const c = S.collectAnimal(farm, a.id, now); if (c.ok) farm = c.farm;
        const p = S.petAnimal(farm, a.id, now); if (p.ok) farm = p.farm;
        if (S.animalHungry(farm, a.id, now)) {
          const feedable = Object.keys(farm.pantry).concat(Object.keys(farm.pantryC || {}));
          if (feedable.length) { const f = S.feedAnimal(farm, a.id, feedable[0], now); if (f.ok) farm = f.farm; }
        }
      }
      // harvest + water
      for (const p of [...farm.bed.plants]) {
        const crop = S.cropById(ark, p.seedId);
        if (S.growthOf(farm, p, crop, now).ready) { const r = S.harvestPlant(farm, p.id, ark, now); if (r.ok) farm = r.farm; }
      }
      for (const p of [...farm.bed.plants]) { const r = S.waterPlant(farm, p.id, now); if (r.ok) farm = r.farm; }
      // plant — GREEDY planter picks best value/hour among held seeds; random planter picks any
      let guard = 0;
      while (farm.bed.plants.length < 10 && Object.keys(farm.seeds).length && guard++ < 20) {
        const ids = Object.keys(farm.seeds);
        let seedId;
        if (greedy) {
          seedId = ids.sort((a, b) => {
            const ca = S.cropById(ark, a), cb = S.cropById(ark, b);
            const va = ca ? S.sellPriceOrganic(ca) * Math.max(1, ca.yield | 0) / Math.max(1, ca.growthDays | 0) : 0;
            const vb = cb ? S.sellPriceOrganic(cb) * Math.max(1, cb.yield | 0) / Math.max(1, cb.growthDays | 0) : 0;
            return vb - va;
          })[0];
        } else seedId = ids[Math.floor(rng() * ids.length)];
        let planted = false;
        for (let t = 0; t < 30 && !planted; t++) {
          const tx = Math.floor(rng() * S.FIELD_T * 2) - 3, ty = Math.floor(rng() * S.FIELD_T * 2) - 3;
          const r = S.plantSeed(farm, (tx + 0.5) / S.FIELD_T, (ty + 0.5) / S.FIELD_T, seedId, ark, now);
          if (r.ok) { farm = r.farm; planted = true; plantCounts[seedId] = (plantCounts[seedId] || 0) + 1; }
        }
        if (!planted) break;
      }
      // sell
      for (const [id, n] of Object.entries({ ...farm.pantry })) if (n > 3) { const r = S.sellProduce(farm, id, n - 3, ark, now, 'organic'); if (r.ok) { income.coins += r.coins; farm = r.farm; } }
      for (const pool of ['goods', 'goodsC']) for (const [k, n] of Object.entries({ ...(farm[pool] || {}) })) if (n > 0) { const r = S.sellGood(farm, k, n, now, pool === 'goods' ? 'organic' : 'conv'); if (r.ok) { income.coins += r.coins; farm = r.farm; } }
      // mine
      farm = Mine.enterMine(farm, now).farm;
      let dug = 0;
      while (farm.mine.picks > 0 && dug++ < 20) {
        const tiles = Mine.levelFor(farm.seed, farm.mine.runDepth);
        const fresh = tiles.map((t, i) => ({ t, i })).filter(({ i }) => !farm.mine.dug[farm.mine.runDepth + ':' + i]);
        if (!fresh.length) break;
        const r = Mine.dig(farm, fresh[Math.floor(rng() * fresh.length)].i, now);
        if (!r.ok) break; farm = r.farm;
      }
      // pull with goal-saving (as the main sim)
      const cheap = S.buyableParcels(farm).sort((a, b) => a.price - b.price)[0];
      const goal = cheap ? cheap.price : null;
      while (farm.pulls === 0 || (goal == null ? farm.coins >= 60 : farm.coins >= goal + 60)) {
        const r = S.pullSeeds(farm, ark, now);
        if (!r.ok) break;
        farm = r.farm;
        if (r.isNew) see('crop', r.crop.id, day);
        if (farm.coins < 30) break;
      }
      // big spends
      const pk = S.packList(farm, ark).find((p) => p.canUnlock);
      if (pk) { const r = S.unlockPack(farm, pk.id, ark, now); if (r.ok) { farm = r.farm; see('biome', pk.id, day); } }
      const t = S.TECHS.find((t) => !S.hasTech(farm, t.id) && S.techChecks(farm, t).every((c) => c.met));
      if (t) { const r = S.research(farm, t.id, now); if (r.ok) { farm = r.farm; see('tech', t.id, day); } }
      if ((farm.animals || []).length < S.animalCap(farm)) {
        const kind = Object.entries(S.ANIMALS).filter(([, a]) => !a.needsPond && farm.coins >= a.cost + 40).sort((a, b) => a[1].cost - b[1].cost)[0];
        if (kind) { const r = S.buyAnimal(farm, kind[0], now); if (r.ok) { farm = r.farm; see('animal', kind[0], day); } }
      }
      if (cheap && farm.coins >= cheap.price + 40) { const r = S.buyParcel(farm, cheap.px, cheap.py, now); if (r.ok) { farm = r.farm; see('parcel', farm.parcels.length, day); } }
      // deeds + skins
      const fresh = evalAch(farm, ark);
      if (fresh.length) { farm = markEarned(farm, fresh.map((a) => a.id), now); for (const a of fresh) see('deed', a.id, day); }
      for (const sk of SKINS) if (skinUnlocked(farm, sk.id)) see('skin', sk.id, day);
    }
  }
  return { firstSeen, plantCounts, farm, income };
}

// ── 1. NOVELTY DEPLETION ──────────────────────────────────────────────────────────────────────────
const runs = [];
for (let s = 1; s <= SEEDS; s++) runs.push(run(s, false));

console.log('\n━━━ NOVELTY DEPLETION — new elements first seen per week (avg of ' + SEEDS + ' players, ' + DAYS + ' days) ━━━');
const CLASSES = ['crop', 'deed', 'tech', 'skin', 'animal', 'biome', 'parcel'];
const TOTALS = { crop: S.allCrops(ark).length, deed: ACHIEVEMENTS.length, tech: S.TECHS.length, skin: SKINS.length, animal: Object.keys(S.ANIMALS).length, biome: ark.biomes.length, parcel: 25 };
for (const cls of CLASSES) {
  const weeks = [0, 0, 0, 0];
  let totalSeen = 0;
  for (const r of runs) {
    for (const [k, day] of Object.entries(r.firstSeen)) {
      if (!k.startsWith(cls + ':')) continue;
      totalSeen++;
      weeks[Math.min(3, Math.floor(day / 7))]++;
    }
  }
  const per = weeks.map((w) => (w / SEEDS).toFixed(1));
  const seen = totalSeen / SEEDS;
  console.log('  ' + cls.padEnd(7) + ' w1:' + per[0].padStart(6) + '  w2:' + per[1].padStart(6) + '  w3:' + per[2].padStart(6) + '  w4:' + per[3].padStart(6) +
    '   seen ' + seen.toFixed(1) + '/' + TOTALS[cls] + ' (' + (100 * seen / TOTALS[cls]).toFixed(0) + '% of stock)');
}

// skins: exact arrival days (the day-one question)
const skinDays = {};
for (const r of runs) for (const [k, d] of Object.entries(r.firstSeen)) if (k.startsWith('skin:')) { const id = k.slice(5); (skinDays[id] = skinDays[id] || []).push(d); }
console.log('\n  skin unlock arrival (avg day): ' + SKINS.map((sk) => sk.id + '=' + (skinDays[sk.id] ? (skinDays[sk.id].reduce((a, b) => a + b, 0) / skinDays[sk.id].length).toFixed(1) : '>' + DAYS)).join(' · '));

// ── 3. CHOICE ENTROPY — does the roster change decisions? ────────────────────────────────────────
const greedyRun = run(99, true);
function entropy(counts) {
  const vals = Object.values(counts), total = vals.reduce((a, b) => a + b, 0);
  if (!total || vals.length < 2) return { H: 0, n: vals.length };
  let H = 0;
  for (const v of vals) { if (!v) continue; const p = v / total; H -= p * Math.log2(p); }
  return { H: H / Math.log2(vals.length), n: vals.length };   // normalized 0..1
}
const eRand = entropy(runs[0].plantCounts);
const eGreedy = entropy(greedyRun.plantCounts);
console.log('\n━━━ CHOICE ENTROPY — is crop variety REAL? (normalized Shannon H over planted species) ━━━');
console.log('  random planter   H = ' + eRand.H.toFixed(2) + ' over ' + eRand.n + ' species (upper bound — what the roster offers)');
console.log('  greedy planter   H = ' + eGreedy.H.toFixed(2) + ' over ' + eGreedy.n + ' species (what VALUE differences leave standing)');
console.log('  → gap = wallpaper. H_greedy near 0 means one crop dominates on value/hour and the rest');
console.log('    of the roster is cosmetic for an optimizing player; near H_random means real trade-offs.');
