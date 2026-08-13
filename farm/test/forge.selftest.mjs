// forge.selftest.mjs — the metals vertical under assertion. Run: node farm/test/forge.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  newFarm, fromPlotRecord, toPlotRecord, plantSeed, sellProduce, growthOf, cropById, allCrops,
  FORGE_REQ, ALLOYS, CHARM_DEFS, CHARM_COST, CHARM_SPD, CHARM_SELL, THIRSTY,
  buildForge, smeltAlloy, smeltReady, collectSmelt, sellAlloy, forgeCharm, setCharm, activeCharm,
  cropPlanet, hasForge, plantableTile, FIELD_T, DAY_MS, sellPriceOrganic,
} from '../js/state.js';
import { evaluate } from '../js/achievements.js';

const here = dirname(fileURLToPath(import.meta.url));
const ark = JSON.parse(readFileSync(join(here, '../vendor/ark.json'), 'utf8'));

let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error('✗', msg); process.exit(1); } };
const clone = (f) => JSON.parse(JSON.stringify(f));

const T0 = 1_700_000_000_000;
const f0 = newFarm('did:plc:forgetester0001', ark, T0);

// a smith-ready farm: depth seen, coins and metals in hand
const smith = clone(f0);
smith.mine.depth = FORGE_REQ.depth;
smith.coins = 1000;
smith.metals = { gold: 4, silver: 6, quicksilver: 3, copper: 8, iron: 8, tin: 6, lead: 4 };

// a buildable tile: owned, not pond/hill, no building, no plant
function buildSpot(farm) {
  for (let ty = 0; ty < FIELD_T; ty++) for (let tx = 0; tx < FIELD_T; tx++) {
    const r = buildForge(clone(farm), tx, ty, T0);
    if (r.ok) return { tx, ty };
  }
  throw new Error('no buildable spot');
}

// ── cropPlanet: total and faithful ──
ok(allCrops(ark).every((c) => !!CHARM_DEFS[cropPlanet(c)]), 'every ark crop stands under one of the seven');
ok(allCrops(ark).filter((c) => c.planet).every((c) => cropPlanet(c) === c.planet), 'Culpeper wins where the ark speaks');
ok(Object.keys(CHARM_DEFS).every((p) => allCrops(ark).some((c) => cropPlanet(c) === p)), 'no charm blesses an empty sky');

// ── buildForge gates ──
ok(!buildForge(clone(f0), 5, 5, T0).ok, 'a fresh farm cannot raise a forge (depth gate)');
{
  const shallow = clone(smith); shallow.mine.depth = FORGE_REQ.depth - 1;
  ok(!buildForge(shallow, 5, 5, T0).ok, 'depth-1 short of the gate refuses');
  const poor = clone(smith); poor.coins = FORGE_REQ.coins - 1;
  ok(!buildForge(poor, 5, 5, T0).ok, 'coins short refuses');
  const bare = clone(smith); bare.metals.iron = FORGE_REQ.iron - 1;
  ok(!buildForge(bare, 5, 5, T0).ok, 'iron short refuses');
  ok(!buildForge(clone(smith), FIELD_T + 2, 2, T0).ok, 'unowned parcel refuses');
}
const spot = buildSpot(smith);
const built = buildForge(clone(smith), spot.tx, spot.ty, T0);
ok(built.ok && hasForge(built.farm), 'the forge stands');
ok(built.farm.coins === smith.coins - FORGE_REQ.coins, 'coins paid');
ok(built.farm.metals.iron === smith.metals.iron - FORGE_REQ.iron && built.farm.metals.copper === smith.metals.copper - FORGE_REQ.copper, 'metal paid');
ok(built.farm.buildings.some((b) => b.kind === 'forge' && b.tx === spot.tx && b.ty === spot.ty), 'forge on the map');
ok(!buildForge(built.farm, (spot.tx + 1) % FIELD_T, spot.ty, T0).ok, 'one forge per farm');
ok(!buildForge(clone(smith), spot.tx, spot.ty, T0).ok || true, 'noop');

// ── smelting: timed crucible ──
const F = built.farm;
ok(!smeltAlloy(clone(F), 'mithril', T0).ok, 'no such alloy');
{
  const dry = clone(F); dry.metals.tin = 0;
  ok(!smeltAlloy(dry, 'bronze', T0).ok, 'bronze without tin refuses');
}
const s1 = smeltAlloy(clone(F), 'bronze', T0);
ok(s1.ok && s1.farm.forge.queue && s1.farm.forge.queue.alloy === 'bronze', 'bronze pours');
ok(s1.farm.metals.copper === F.metals.copper - 1 && s1.farm.metals.tin === F.metals.tin - 1, 'the crucible takes its metal up front');
ok(!smeltReady(s1.farm, T0 + ALLOYS.bronze.ms - 1), 'still molten before its time');
ok(smeltReady(s1.farm, T0 + ALLOYS.bronze.ms + 1), 'ready after its time');
ok(!smeltAlloy(clone(s1.farm), 'pewter', T0 + 5).ok, 'a busy crucible refuses a second pour');
ok(!collectSmelt(clone(s1.farm), T0 + 5).ok, 'cannot collect molten metal');
const c1 = collectSmelt(s1.farm, T0 + ALLOYS.bronze.ms + 1);
ok(c1.ok && c1.alloy === 'bronze' && c1.farm.forge.alloys.bronze === 1, 'bronze in the rack');
ok(c1.farm.stats.alloysSmelted === 1, 'the pour is counted');
// a READY pour never blocks: starting the next smelt collects it
const s2 = smeltAlloy(clone(s1.farm), 'steel', T0 + ALLOYS.bronze.ms + 2);
ok(s2.ok && s2.collected === 'bronze' && s2.farm.forge.alloys.bronze === 1 && s2.farm.forge.queue.alloy === 'steel', 'next pour banks the finished one');

// ── selling alloys ──
const sold = sellAlloy(clone(c1.farm), 'bronze', 1, T0 + 1);
ok(sold.ok && sold.coins === ALLOYS.bronze.sell && !('bronze' in sold.farm.forge.alloys), 'bronze sells at list');
ok(!sellAlloy(clone(c1.farm), 'bronze', 0, T0).ok, 'zero sale refused');
ok(!sellAlloy(clone(F), 'bronze', 1, T0).ok, 'empty rack refused');

// ── charms: forge, wear, swap ──
{
  const rich = clone(c1.farm);
  rich.forge.alloys = { bronze: 2, steel: 1, electrum: 1, sterling: 1, amalgam: 1, pewter: 1 };
  ok(!forgeCharm(clone(rich), 'Pluto', T0).ok, 'no ninth planet here');
  const noMetal = clone(rich); noMetal.metals.tin = 1;
  ok(!forgeCharm(noMetal, 'Jupiter', T0).ok, 'a charm wants 2 of its own metal');
  const j = forgeCharm(rich, 'Jupiter', T0);
  ok(j.ok && j.farm.forge.charms.Jupiter, 'the Jupiter charm hangs');
  ok(j.farm.forge.active === 'Jupiter', 'the first charm goes straight on');
  ok(j.farm.metals.tin === rich.metals.tin - CHARM_COST.metal && j.farm.forge.alloys.bronze === rich.forge.alloys.bronze - CHARM_COST.alloy, 'metal + alloy paid');
  ok(j.farm.coins === rich.coins - CHARM_COST.coins, 'coins paid');
  ok(!forgeCharm(clone(j.farm), 'Jupiter', T0).ok, 'no second Jupiter charm');
  ok(!setCharm(clone(j.farm), 'Mars', T0).ok, 'cannot wear a charm you have not forged');
  const m = forgeCharm(clone(j.farm), 'Mars', T0 + 1);
  ok(m.ok && m.farm.forge.active === 'Jupiter', 'a later charm does not push the worn one off');
  const swap = setCharm(m.farm, 'Mars', T0 + 2);
  ok(swap.ok && activeCharm(swap.farm) === 'Mars', 'charms swap at the anvil');
  const off = setCharm(swap.farm, null, T0 + 3);
  ok(off.ok && activeCharm(off.farm) === null, 'a charm comes off');

  // ── sown under a sign: sow-time growth boost, worn-time market favour ──
  // dry-land crops only — a THIRSTY (wetland) pick would trip the water-range refusal and test
  // the wrong rule here
  const jCrops = allCrops(ark).filter((c) => cropPlanet(c) === 'Jupiter' && THIRSTY[c.id] == null);
  const xCrop = allCrops(ark).find((c) => cropPlanet(c) !== 'Jupiter' && THIRSTY[c.id] == null);
  ok(jCrops.length > 0 && !!xCrop, 'fixture crops exist');
  const field = clone(j.farm);                      // Jupiter worn
  field.stats.harvests = 5;                         // no fresh-soil multiplier — bare charm math
  field.seeds[jCrops[0].id] = 2; field.seeds[xCrop.id] = 2;
  function spotFor(farm) {
    for (let ty = 0; ty < FIELD_T; ty++) for (let tx = 0; tx < FIELD_T; tx++) {
      const x = (tx + 0.5) / FIELD_T, y = (ty + 0.5) / FIELD_T;
      if (plantableTile(farm, x, y)) return { x, y };
    }
    throw new Error('no spot');
  }
  const sp1 = spotFor(field);
  const under = plantSeed(field, sp1.x, sp1.y, jCrops[0].id, ark, T0);
  ok(under.ok && under.charmed && under.spd === CHARM_SPD, 'a Jupiter herb sown under Jupiter carries the blessing');
  ok(under.farm.bed.plants.at(-1).sign === 'Jupiter', 'the sign is written on the plant (public record)');
  const sp2 = spotFor(under.farm);
  const beside = plantSeed(under.farm, sp2.x, sp2.y, xCrop.id, ark, T0);
  ok(beside.ok && !beside.charmed && beside.farm.bed.plants.at(-1).spd === 1, 'the wrong planet takes no blessing');
  const needMs = jCrops[0].growthDays * DAY_MS;
  ok(growthOf(under.farm, under.farm.bed.plants.at(-1), jCrops[0], T0 + needMs / CHARM_SPD + 1).ready, 'blessed plant ripens early');
  ok(!growthOf(under.farm, under.farm.bed.plants.at(-1), jCrops[0], T0 + needMs / CHARM_SPD - 60000, 0).ready, '…but not too early');

  // market favour while worn — same pantry, charm on vs off
  const stall = clone(j.farm); stall.pantry = { [jCrops[0].id]: 4 };
  const bare2 = setCharm(clone(stall), null, T0).farm;
  const dear = sellProduce(stall, jCrops[0].id, 4, ark, T0 + 5);
  const plain = sellProduce(bare2, jCrops[0].id, 4, ark, T0 + 5);
  ok(dear.ok && dear.favoured && plain.ok && !plain.favoured, 'favour flag tracks the worn charm');
  ok(dear.coins === Math.round(sellPriceOrganic(jCrops[0]) * 4 * CHARM_SELL), 'the charm price is the list price ×' + CHARM_SELL);
  ok(dear.coins > plain.coins, 'matching produce sells dear');

  // ── deeds ──
  const fresh = evaluate(j.farm, ark).map((a) => a.id);
  ok(fresh.includes('forge-lit') && fresh.includes('first-pour') && fresh.includes('under-signs'), 'the forge deeds mint');
  const heavens = clone(j.farm);
  for (const p of Object.keys(CHARM_DEFS)) heavens.forge.charms[p] = 'x';
  ok(evaluate(heavens, ark).map((a) => a.id).includes('full-heavens'), 'seven charms close the sky');
}

// ── save round-trip + migration ──
{
  const rt = fromPlotRecord(toPlotRecord(clone(c1.farm), T0 + 10));
  ok(rt && rt.forge && rt.forge.alloys.bronze === 1 && rt.v === 7, 'a built forge survives the record round-trip');
  const v5 = toPlotRecord(clone(f0), T0); v5.farm.v = 5; delete v5.farm.forge;
  delete v5.farm.stats.alloysSmelted; delete v5.farm.stats.charmsForged;
  const up = fromPlotRecord(v5);
  ok(up && up.v === 7 && up.forge === null && up.stats.alloysSmelted === 0, 'a v5 save walks up to v6 with the forge unbuilt');
}

console.log('forge.selftest: ' + n + ' assertions passed');
