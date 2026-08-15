// playtest.mjs — THE ORACLE. Plays Harvestople through simulated weeks in node, straight against the
// real kernels (state/mine/achievements — zero mocks), and scores the experience with fun proxies.
// This is the machine the design gets annealed against: change the game, re-run, watch the curves.
//
//   node farm/sim/playtest.mjs                # one 21-day run, session log + metric table
//   node farm/sim/playtest.mjs --days 14 --seeds 5   # aggregate over 5 player seeds
//
// THE PLAYER MODEL. A "check-in" player: 3 sessions a day (morning / lunch / evening, jittered),
// each session doing what an engaged-but-casual player does, in priority order: collect the fun
// stuff first (forage, animals, ripe crops), then chores (water), then spend (plant, pull, dig,
// brew, buy land/tech/animals when affordable). Deliberately NOT an optimizer — it plays like a
// person with 4 minutes.
//
// FUN PROXIES (per session, aggregated):
//   rewards   — events that feel good (harvest, new-crop pull, gem, deed, unlock, collect, forage)
//   actions   — meaningful taps taken
//   variety   — distinct action kinds
//   DEAD      — sessions with <2 meaningful actions available (arrive, shrug, leave) ← the killer
//   unlockGap — longest stretch (days) with no new unlock/deed/tech/pack/parcel ← the churn window
//
// Determinism: the sim uses its own seeded rng for jitter; kernels are already deterministic.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as S from '../js/state.js';
import * as Mine from '../js/mine.js';
import { evaluate as evalAch, markEarned, ACHIEVEMENTS } from '../js/achievements.js';

const here = dirname(fileURLToPath(import.meta.url));
const ark = JSON.parse(readFileSync(join(here, '../vendor/ark.json'), 'utf8'));

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? +args[i + 1] : d; };
const DAYS = arg('days', 21);
const SEEDS = arg('seeds', 3);
const VERBOSE = args.includes('-v');

function rngFor(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// ── one session: the casual player's 4 minutes ────────────────────────────────────────────────────
function playSession(ctx, now) {
  let { farm } = ctx;
  const ev = { rewards: 0, actions: 0, kinds: new Set(), notes: [] };
  const note = (k, reward = 0) => { ev.actions++; ev.kinds.add(k); ev.rewards += reward; if (VERBOSE) ev.notes.push(k); };
  const R = ctx.rng;

  const deeds = () => {   // achievements fire like the app does
    const fresh = evalAch(farm, ark);
    if (fresh.length) { farm = markEarned(farm, fresh.map((a) => a.id), now); ev.rewards += fresh.length; fresh.forEach((a) => ctx.unlocks.push({ day: ctx.day, what: 'deed:' + a.id })); }
  };

  // 0) FORAGE — the arrival scavenger hunt (if the mechanic exists in this build)
  if (S.forageSpots) {
    for (const spot of S.forageSpots(farm, now)) {
      const r = S.forage(farm, spot.i, now);
      if (r.ok) {
        farm = r.farm; note('forage', 1);
        if (r.prize.kind === 'seed' && S.grantWildseed) { const g = S.grantWildseed(farm, ark, now); if (g.ok) farm = g.farm; }
      }
    }
  }

  // 1) ANIMALS — collect, feed, pet (if livestock exists in this build)
  if (S.collectAnimal) {
    for (const a of [...(farm.animals || [])]) {
      const c = S.collectAnimal(farm, a.id, now);
      if (c.ok) { farm = c.farm; note('collect', 1); }
      const p = S.petAnimal(farm, a.id, now);
      if (p.ok) { farm = p.farm; note('pet', 1); }   // petting IS a reward — that's the point of pets
      if (S.animalHungry && S.animalHungry(farm, a.id, now)) {
        const feedable = Object.keys(farm.pantry).concat(Object.keys(farm.pantryC || {}));
        if (feedable.length) {
          const f = S.feedAnimal(farm, a.id, feedable[0], now);
          if (f.ok) { farm = f.farm; note('feed'); }
        }
      }
    }
  }

  // 2) HARVEST everything ripe
  for (const p of [...farm.bed.plants]) {
    const crop = S.cropById(ark, p.seedId);
    if (!S.growthOf(farm, p, crop, now).ready) continue;
    const r = S.harvestPlant(farm, p.id, ark, now);
    if (r.ok) { farm = r.farm; note('harvest', 1); }
  }

  // 3) WATER the dry
  for (const p of [...farm.bed.plants]) {
    const r = S.waterPlant(farm, p.id, now);
    if (r.ok) { farm = r.farm; note('water'); }
  }

  // 3.5) INFRASTRUCTURE — when watered ground runs short, players dig a pond by the beds.
  // The water stakes made this the load-bearing habit; the sim keeps it or starves like round 1.
  if (S.terraform && S.waterSourceWithin && farm.coins > 90) {
    let nearOpen = 0;
    for (let ty = 0; ty < S.FIELD_T && nearOpen < 4; ty++) for (let tx = 0; tx < S.FIELD_T && nearOpen < 4; tx++) {
      if (S.tileAt(farm, tx, ty) !== 'soil') continue;
      if (!S.waterSourceWithin(farm, tx, ty, S.WATER_RANGE)) continue;
      if (farm.bed.plants.some((p) => Math.floor(p.x * S.FIELD_T) === tx && Math.floor(p.y * S.FIELD_T) === ty)) continue;
      nearOpen++;
    }
    if (nearOpen < 4) {
      outer: for (let ty = 0; ty < S.FIELD_T; ty++) for (let tx = 0; tx < S.FIELD_T; tx++) {
        if (S.tileAt(farm, tx, ty) !== 'meadow') continue;
        if (S.waterSourceWithin(farm, tx, ty, 2)) continue;    // spread the water, don't puddle it
        const r = S.terraform(farm, tx, ty, 'pond', now);
        if (r.ok) { farm = r.farm; note('terra'); break outer; }
      }
    }
  }

  // 4) PLANT into free soil (keep ~10 plants going, seeds permitting)
  let guard = 0;
  while (farm.bed.plants.length < 10 && Object.keys(farm.seeds).length && guard++ < 20) {
    const seedId = Object.keys(farm.seeds)[Math.floor(R() * Object.keys(farm.seeds).length)];
    let planted = false;
    for (let t = 0; t < 30 && !planted; t++) {
      const tx = Math.floor(R() * S.FIELD_T * 2) - 3, ty = Math.floor(R() * S.FIELD_T * 2) - 3;
      // a player reads the far-from-water warning: early tries insist on watered ground,
      // late tries take what the land gives (and accept the can-carrying that follows)
      if (t < 22 && S.waterSourceWithin && !S.waterSourceWithin(farm, tx, ty, S.WATER_RANGE)) continue;
      const x = (tx + 0.5) / S.FIELD_T, y = (ty + 0.5) / S.FIELD_T;
      const r = S.plantSeed(farm, x, y, seedId, ark, now);
      if (r.ok) { farm = r.farm; note('plant'); planted = true; }
    }
    if (!planted) break;
  }

  // 5) SELL surplus (keep a few of each for the bench/feed)
  for (const [id, n] of Object.entries({ ...farm.pantry })) {
    if (n > 3) { const r = S.sellProduce(farm, id, n - 3, ark, now, 'organic'); if (r.ok) { farm = r.farm; note('sell'); } }
  }
  for (const [id, n] of Object.entries({ ...(farm.pantryC || {}) })) {
    if (n > 0) { const r = S.sellProduce(farm, id, n, ark, now, 'conv'); if (r.ok) { farm = r.farm; note('sell'); } }
  }
  if (S.sellGood) {
    for (const pool of ['goods', 'goodsC']) for (const [kind, n] of Object.entries({ ...(farm[pool] || {}) })) {
      if (n > 0) { const r = S.sellGood(farm, kind, n, now, pool === 'goods' ? 'organic' : 'conv'); if (r.ok) { farm = r.farm; note('sell'); } }
    }
  }

  // 6) MINE if picks are up
  {
    const e = S.hasTech ? Mine.enterMine(farm, now) : Mine.enterMine(farm, now);
    farm = e.farm;
    let dug = 0;
    while (farm.mine.picks > 0 && dug < 20) {
      const tiles = Mine.levelFor(farm.seed, farm.mine.runDepth);
      const fresh = tiles.map((t, i) => ({ t, i })).filter(({ i }) => !farm.mine.dug[farm.mine.runDepth + ':' + i]);
      if (!fresh.length) break;
      const pick = fresh[Math.floor(R() * fresh.length)];
      const r = Mine.dig(farm, pick.i, now);
      if (!r.ok) break;
      farm = r.farm; dug++;
      note('dig', ['ore', 'gem', 'shard', 'coin'].includes(r.found.kind) ? 1 : 0);
    }
  }

  // 6.5) THE FORGE — the metals vertical: raise it once the mine has shown you depth, keep the
  // crucible warm, walk the Chaldean week toward whatever charm your ore pile favours.
  if (S.buildForge) {
    if (!farm.forge && (farm.mine.depth | 0) >= S.FORGE_REQ.depth && farm.coins >= S.FORGE_REQ.coins + 40) {
      outer: for (let ty = 0; ty < S.FIELD_T; ty++) for (let tx = 0; tx < S.FIELD_T; tx++) {
        const r = S.buildForge(farm, tx, ty, now);
        if (r.ok) { farm = r.farm; note('forge', 3); ctx.unlocks.push({ day: ctx.day, what: 'forge' }); break outer; }
      }
    }
    if (farm.forge) {
      if (S.smeltReady(farm, now)) { const c = S.collectSmelt(farm, now); if (c.ok) { farm = c.farm; note('alloy', 1); } }
      // aim at the unowned charm whose metal the ore pile favours most
      const wanted = Object.entries(S.CHARM_DEFS).filter(([p]) => !farm.forge.charms[p])
        .sort((a, b) => (farm.metals[b[1].metal] | 0) - (farm.metals[a[1].metal] | 0))[0] || null;
      if (!farm.forge.queue) {
        const pourOrder = wanted ? [wanted[1].alloy, ...Object.keys(S.ALLOYS)] : Object.keys(S.ALLOYS);
        for (const a of pourOrder) { const r = S.smeltAlloy(farm, a, now); if (r.ok) { farm = r.farm; note('smelt'); break; } }
      }
      if (wanted) {
        const r = S.forgeCharm(farm, wanted[0], now);
        if (r.ok) { farm = r.farm; note('charm', 2); ctx.unlocks.push({ day: ctx.day, what: 'charm:' + wanted[0] }); }
      }
      // alloys no future charm wants are stock for the market — the mine's own income line
      for (const [a, cnt] of Object.entries({ ...farm.forge.alloys })) {
        const needed = Object.entries(S.CHARM_DEFS).some(([p, d]) => !farm.forge.charms[p] && d.alloy === a);
        if (cnt > (needed ? 1 : 0)) { const r = S.sellAlloy(farm, a, cnt - (needed ? 1 : 0), now); if (r.ok) { farm = r.farm; note('sell'); } }
      }
    }
  }

  // 7) PULL seeds — but SAVE toward the nearest visible goal (a player with a FOR SALE sign on
  // screen does not gamble the deed money away)
  const goalCost = (() => {
    const costs = [];
    const cheap = S.buyableParcels(farm).sort((a, b) => a.price - b.price)[0];
    if (cheap) costs.push(cheap.price);
    const pack = S.packList(farm, ark).find((p) => p.isNext);
    if (pack && pack.checks.filter((c) => !c.met).every((c) => c.label.endsWith('◈'))) costs.push(pack.req.coins);
    if (S.TECHS) {
      const t = S.TECHS.find((t) => !S.hasTech(farm, t.id) && S.techChecks(farm, t).filter((c) => !c.met).every((c) => c.label.endsWith('◈')));
      if (t) costs.push(t.cost.coins);
    }
    if (S.ANIMALS && (farm.animals || []).length < S.animalCap(farm)) {
      const owned = new Set((farm.animals || []).map((x) => x.kind));
      const a = Object.entries(S.ANIMALS).filter(([k]) => !owned.has(k)).sort((x, y) => x[1].cost - y[1].cost)[0];
      if (a) costs.push(a[1].cost);
    }
    return costs.length ? Math.min(...costs) : null;
  })();
  while (farm.pulls === 0 || (goalCost == null ? farm.coins >= 60 : farm.coins >= goalCost + 60)) {
    const r = S.pullSeeds(farm, ark, now);
    if (!r.ok) break;
    farm = r.farm; note('pull', r.isNew ? 1 : 0.5);
    if (farm.coins < 30) break;
  }

  // 8) BREW when the pantry allows (first coherent-ish pair of live herbs)
  if ((farm.stats.brews | 0) < 40) {
    const names = Object.keys(farm.pantry).map((id) => { const c = S.cropById(ark, id); return c && c.sciName; }).filter(Boolean);
    if (names.length >= 2 && ctx.prepare) {
      const prepped = ctx.prepare(names.slice(0, 2), 'draught');
      if (prepped.ok) {
        const ids = Object.keys(farm.pantry).slice(0, 2);
        const r = S.applyBrew(farm, prepped, ids, 'draught', false, now);
        if (r.ok) { farm = r.farm; note('brew', 1); }
      }
    }
  }

  // 9) BIG SPENDS — every category gets its chance each session; buy at goal + a small cushion.
  {
    const pack = S.packList(farm, ark).find((p) => p.canUnlock);
    if (pack) { const r = S.unlockPack(farm, pack.id, ark, now); if (r.ok) { farm = r.farm; note('pack', 2); ctx.unlocks.push({ day: ctx.day, what: 'pack' }); } }
    if (S.TECHS) {
      const t = S.TECHS.find((t) => !S.hasTech(farm, t.id) && S.techChecks(farm, t).every((c) => c.met));
      if (t) { const r = S.research(farm, t.id, now); if (r.ok) { farm = r.farm; note('tech', 2); ctx.unlocks.push({ day: ctx.day, what: 'tech:' + t.id }); } }
    }
    if (S.buyAnimal && (farm.animals || []).length < S.animalCap(farm)) {
      // novelty-seeking, like a real player: the cheapest kind you DON'T own yet comes first
      // (cheapest-first bought a fifth hen while a goat sat affordable, and misread the whole
      // animal class as depleted after day one). buyAnimal itself refuses ducks without ponds.
      const owned = new Set((farm.animals || []).map((a) => a.kind));
      const kinds = Object.entries(S.ANIMALS).filter(([, a]) => farm.coins >= a.cost + 40)
        .sort((a, b) => (owned.has(a[0]) - owned.has(b[0])) || (a[1].cost - b[1].cost));
      for (const [k] of kinds) {
        const r = S.buyAnimal(farm, k, now);
        if (r.ok) { farm = r.farm; note('animal', 2); ctx.unlocks.push({ day: ctx.day, what: 'animal:' + k }); break; }
      }
    }
    const cheap = S.buyableParcels(farm).sort((a, b) => a.price - b.price)[0];
    if (cheap && farm.coins >= cheap.price + 40) {
      const r = S.buyParcel(farm, cheap.px, cheap.py, now);
      if (r.ok) { farm = r.farm; note('parcel', 2); ctx.unlocks.push({ day: ctx.day, what: 'parcel' }); }
    }
  }

  deeds();
  ctx.farm = farm;
  return ev;
}

// ── a full run ────────────────────────────────────────────────────────────────────────────────────
async function run(playerSeed) {
  const { prepare } = await import('../vendor/alchemy.js');
  const rng = rngFor(playerSeed * 2654435761);
  const T0 = 1_760_000_000_000;
  const ctx = { farm: S.newFarm('did:plc:sim' + playerSeed + 'padpadpad', ark, T0), rng, prepare, unlocks: [], day: 0 };
  const sessions = [];
  const SESSION_TIMES = [9, 13, 20];   // hours

  for (let day = 0; day < DAYS; day++) {
    ctx.day = day;
    const st = S.touchStreak(ctx.farm, T0 + day * 86400000 + 8 * 3600000);
    if (st.ok) ctx.farm = st.farm;
    for (const h of SESSION_TIMES) {
      const t = T0 + day * 86400000 + h * 3600000 + Math.floor(rng() * 1800000);
      const ev = playSession(ctx, t);
      sessions.push({ day, h, ...ev, kinds: ev.kinds.size, coins: ctx.farm.coins });
    }
  }

  // metrics
  const dead = sessions.filter((s) => s.actions < 2).length;
  const rewards = sessions.reduce((a, s) => a + s.rewards, 0) / sessions.length;
  const actions = sessions.reduce((a, s) => a + s.actions, 0) / sessions.length;
  const variety = sessions.reduce((a, s) => a + s.kinds, 0) / sessions.length;
  // unlock cadence: longest gap in days between unlock events (day 0 counts as an unlock — arrival)
  const unlockDays = [0, ...ctx.unlocks.map((u) => u.day)].sort((a, b) => a - b);
  let unlockGap = DAYS - unlockDays[unlockDays.length - 1];
  for (let i = 1; i < unlockDays.length; i++) unlockGap = Math.max(unlockGap, unlockDays[i] - unlockDays[i - 1]);
  const f = ctx.farm;
  return {
    dead: dead / sessions.length, rewards, actions, variety, unlockGap,
    unlocks: ctx.unlocks.length,
    endState: {
      coins: f.coins, harvests: f.stats.harvests, packs: f.packs.length, parcels: f.parcels.length,
      techs: Object.keys(f.tech || {}).length, deeds: Object.keys(f.achievements).length,
      animals: (f.animals || []).length, brews: f.stats.brews, depth: f.mine.depth,
    },
    timeline: ctx.unlocks,
  };
}

const runs = [];
for (let s = 1; s <= SEEDS; s++) runs.push(await run(s));
const avg = (k) => (runs.reduce((a, r) => a + r[k], 0) / runs.length);
const avgEnd = (k) => (runs.reduce((a, r) => a + r.endState[k], 0) / runs.length);

console.log('━━━ THE ORACLE SPEAKS — ' + DAYS + ' days × 3 sessions × ' + SEEDS + ' players ━━━');
console.log('dead sessions      ' + (avg('dead') * 100).toFixed(1) + '%   (arrive, <2 things to do — the churn signal)');
console.log('rewards / session  ' + avg('rewards').toFixed(2));
console.log('actions / session  ' + avg('actions').toFixed(2));
console.log('variety / session  ' + avg('variety').toFixed(2) + ' distinct verbs');
console.log('longest unlock gap ' + avg('unlockGap').toFixed(1) + ' days without ANYTHING new');
console.log('unlock events      ' + avg('unlocks').toFixed(1));
console.log('end state          coins ' + avgEnd('coins').toFixed(0) + ' · harvests ' + avgEnd('harvests').toFixed(0) +
  ' · packs ' + avgEnd('packs').toFixed(1) + ' · parcels ' + avgEnd('parcels').toFixed(1) +
  ' · techs ' + avgEnd('techs').toFixed(1) + ' · deeds ' + avgEnd('deeds').toFixed(1) +
  ' · animals ' + avgEnd('animals').toFixed(1) + ' · brews ' + avgEnd('brews').toFixed(1) + ' · depth ' + avgEnd('depth').toFixed(1));
if (VERBOSE) console.log('timeline (player 1):', JSON.stringify(runs[0].timeline));

// machine-readable tail — farm/sim/gate.mjs (the executable scales) parses this line
console.log('METRICS ' + JSON.stringify({
  days: DAYS, seeds: SEEDS,
  dead: avg('dead'), rewards: avg('rewards'), actions: avg('actions'), variety: avg('variety'),
  unlockGap: avg('unlockGap'), unlocks: avg('unlocks'),
  coins: avgEnd('coins'), harvests: avgEnd('harvests'), parcels: avgEnd('parcels'), techs: avgEnd('techs'),
}));
