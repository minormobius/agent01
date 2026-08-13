// covenant.selftest.mjs — THE SAVE COVENANT under assertion. One plot record serves two worlds:
// mainline (farm.mino.mobi) and the testing table (farm-next.mino.mobi). The covenant that makes
// that safe: experiments keep ALL their state under farm.x.<featureId>, never bump the save
// version, never change an existing field's meaning; mainline preserves x verbatim and never
// reads it. This file runs on BOTH branches — an experiment that breaks it does not deploy.
// Run: node farm/test/covenant.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { newFarm, plantSeed, harvestPlant, sellProduce, toPlotRecord, fromPlotRecord, plantableTile, FIELD_T } from '../js/state.js';

const here = dirname(fileURLToPath(import.meta.url));
const ark = JSON.parse(readFileSync(join(here, '../vendor/ark.json'), 'utf8'));

let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error('✗', msg); process.exit(1); } };

const T0 = 1_700_000_000_000;
const f = newFarm('did:plc:covenanttester01', ark, T0);

// ── the version is FROZEN. An experiment on the testing table must not bump it: a bumped save
// is unreadable to mainline, which then refuses all writes (see store.loadRemote). Graduating a
// feature — and only that, at the merge party, on the mainline branch — moves this number.
const MAINLINE_V = 7;
ok(f.v === MAINLINE_V, 'newFarm writes v' + MAINLINE_V + ' — experiments do not bump the save version');
ok(fromPlotRecord({ farm: { ...JSON.parse(JSON.stringify(f)), v: MAINLINE_V + 1 } }) === null,
  'a future-versioned record is unreadable, never misread');

// ── the pocket exists and arrives on old saves ──
ok(f.x && typeof f.x === 'object', 'newFarm carries the experiment pocket');
{
  const old = toPlotRecord(JSON.parse(JSON.stringify(f)), T0); delete old.farm.x;
  const up = fromPlotRecord(old);
  ok(up && up.x && typeof up.x === 'object', 'records saved before the covenant gain an empty pocket');
}

// ── unknown experiment state survives the full lifecycle: load → mutate → save → load ──
{
  const g = JSON.parse(JSON.stringify(f));
  g.x = { towerdefense: { wave: 3, turrets: [{ tx: 1, ty: 2, kind: 'ballista' }] }, fishing: { rod: 'willow', catches: 17 } };
  // mutate through real kernels (every mutator deep-clones the whole farm)
  const seedId = Object.keys(g.seeds)[0];
  let spot = null;
  for (let ty = 0; ty < FIELD_T && !spot; ty++) for (let tx = 0; tx < FIELD_T && !spot; tx++) {
    const x = (tx + 0.5) / FIELD_T, y = (ty + 0.5) / FIELD_T;
    if (plantableTile(g, x, y)) spot = { x, y };
  }
  const p = plantSeed(g, spot.x, spot.y, seedId, ark, T0);
  ok(p.ok && JSON.stringify(p.farm.x) === JSON.stringify(g.x), 'the pocket survives a mutator');
  const rt = fromPlotRecord(toPlotRecord(p.farm, T0 + 5));
  ok(rt && JSON.stringify(rt.x) === JSON.stringify(g.x), 'the pocket survives the record round-trip');
  ok(rt.x.towerdefense.turrets[0].kind === 'ballista', 'deep experiment state intact');
}

// ── unknown TOP-LEVEL fields also survive the round-trip (an experiment that colors outside the
// pocket is still not destroyed by mainline — the pocket is the rule, this is the seatbelt) ──
{
  const g = JSON.parse(JSON.stringify(f));
  g.someFutureField = { a: 1 };
  const rt = fromPlotRecord(toPlotRecord(g, T0));
  ok(rt && rt.someFutureField && rt.someFutureField.a === 1, 'unknown top-level fields pass through the record layer');
}

console.log('covenant.selftest: ' + n + ' assertions passed');
