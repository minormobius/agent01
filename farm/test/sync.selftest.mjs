// sync.selftest — the cross-device save race. updatedAt is wall-clock and a stale device that
// merely BOOTS later re-stamps an old world (streak commit on open); progressMarks/saveAhead are
// what keeps that lie from burying a real session. These tests encode the 2026-08-14 incident:
// a computer's flurry of play never flushed, the phone re-stamped the pre-flurry cloud copy, and
// the flurry lost every timestamp comparison it should have won.
import { newFarm, saveAhead, progressMarks, toPlotRecord, fromPlotRecord, plantSeed, waterPlant, encodeFloats, decodeFloats } from '../js/state.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ark = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../vendor/ark.json'), 'utf8'));
let n = 0;
const ok = (cond, name) => { n++; if (!cond) { console.error('✗ ' + name); process.exit(1); } console.log('✓ ' + name); };

const T0 = 1_760_000_000_000;
const base = newFarm('did:plc:sync-selftest', ark, T0);

// the incident, in miniature: the computer's copy played (harvests up), the phone's copy only
// re-stamped the clock. The stale-but-newer-stamped copy must LOSE.
const flurry = JSON.parse(JSON.stringify(base));
flurry.stats.harvests = 12; flurry.stats.planted = 20; flurry.coins = 500;
flurry.updatedAt = T0 + 1000;                       // older stamp — the write never flushed
const restamped = JSON.parse(JSON.stringify(base));
restamped.updatedAt = T0 + 60_000;                  // newer stamp — the phone just opened
ok(saveAhead(flurry, restamped), 'a played session beats a re-stamped stale copy, whatever the clocks say');
ok(!saveAhead(restamped, flurry), 'the stale copy never reads as ahead');

// identical progress: neither is ahead — clocks may then break the tie
ok(!saveAhead(base, base), 'a save is never ahead of itself');

// a genuine fork: each device progressed differently — neither is a superset
const forkA = JSON.parse(JSON.stringify(base)); forkA.stats.harvests = 5;
const forkB = JSON.parse(JSON.stringify(base)); forkB.stats.brews = 2;
ok(!saveAhead(forkA, forkB) && !saveAhead(forkB, forkA), 'diverged saves are ahead in neither direction (the attic case)');

// every mark is monotonic in play: spending coins must not flip the verdict
const spent = JSON.parse(JSON.stringify(flurry)); spent.coins = 0;
ok(saveAhead(spent, restamped), 'spending coins does not disguise progress (marks ignore balances)');

// marks survive the record round-trip (the comparison happens on loaded saves)
const rt = fromPlotRecord(JSON.parse(JSON.stringify(toPlotRecord(flurry, T0 + 1000))));
ok(JSON.stringify(progressMarks(rt)) === JSON.stringify(progressMarks(flurry)), 'progress marks survive toPlotRecord/fromPlotRecord');
ok(saveAhead(rt, restamped), 'the round-tripped flurry still wins');

// ── THE FLOAT COVENANT ────────────────────────────────────────────────────────────────────────────
// ATProto records forbid floating-point numbers (atproto.com/specs/data-model). A single float
// anywhere in the plot record — a planted crop's x, banked grownMs, a brew's coherence, anything
// an experiment stows in farm.x — makes the PDS refuse the WHOLE save, and the client saw only
// "sync hiccup" forever. This walk is the executable guarantee: no raw float ever reaches the
// wire again, on either world.
function findFloat(v, path = '$') {
  if (typeof v === 'number') return Number.isInteger(v) ? null : path + ' = ' + v;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const r = findFloat(v[i], path + '[' + i + ']'); if (r) return r; } return null; }
  if (v && typeof v === 'object') { for (const k in v) { const r = findFloat(v[k], path + '.' + k); if (r) return r; } return null; }
  return null;
}

// a farm with every known float source live: planted crops (fractional x/y), a partially-dry
// growth bank (×0.5 rate → fractional grownMs), an x-pocket experiment with its own floats
let wet = newFarm('did:plc:float-covenant', ark, T0);
wet.parcels = ['0,0']; wet.coins = 500;
const cropId = ark.crops[0].id;
wet.seeds[cropId] = 5;
let landed = 0;
for (let ty = 0; ty < 12 && landed < 3; ty++) for (let tx = 0; tx < 12 && landed < 3; tx++) {
  const r = plantSeed(wet, (tx + 0.5) / 12, (ty + 0.5) / 12, cropId, ark, T0);
  if (r.ok) { wet = r.farm; landed++; }
}
ok(landed === 3, 'covenant fixture planted ' + landed + '/3 crops');
// bank fractional growth: let the watering lapse, then water again (settle runs the ×0.5 tail)
wet.bed.plants.forEach((p) => { p.wateredAt = T0 - 10 * 3600 * 1000; });
wet = waterPlant(wet, wet.bed.plants[0].id, T0 + 5 * 3600 * 1000 + 137).farm;
wet.x.experiment = { ratio: 0.371, tuning: [0.5, 1, 2.25], label: 'a council toy' };

const wire = JSON.parse(JSON.stringify(toPlotRecord(wet, T0 + 6 * 3600 * 1000)));
const leak = findFloat(wire);
ok(!leak, 'no raw float reaches the wire (found: ' + (leak || 'none') + ')');
ok(typeof wire.farm.bed.plants[0].x === 'string' && wire.farm.bed.plants[0].x.startsWith('~f'), 'plant x rides as a tagged string');

const back = fromPlotRecord(wire);
ok(back.bed.plants[0].x === wet.bed.plants[0].x && back.bed.plants[0].y === wet.bed.plants[0].y, 'plant position survives the round-trip bit-exact');
ok(back.bed.plants[0].grownMs === wet.bed.plants[0].grownMs, 'fractional grownMs survives bit-exact');
ok(back.x.experiment.ratio === 0.371 && back.x.experiment.tuning[2] === 2.25, 'x-pocket floats survive — experiments cannot brick sync');
ok(back.x.experiment.tuning[1] === 1, 'integers pass through untouched');

// legacy: an old raw-float record (localStorage era) still loads unchanged
const legacy = JSON.parse(JSON.stringify({ $type: 'com.minomobi.farm.plot', v: 1, farm: wet, updatedAt: 'x' }));
const backLegacy = fromPlotRecord(legacy);
ok(backLegacy && backLegacy.bed.plants[0].x === wet.bed.plants[0].x, 'raw-float legacy saves still load');
// and strings that merely LOOK close to the tag are left alone
ok(decodeFloats({ a: '~fine', b: '~f1.5' }).a === '~fine' && decodeFloats({ b: '~f1.5' }).b === 1.5, 'tag matching is strict');
ok(encodeFloats({ n: Infinity }).n === 0, 'non-finite numbers never reach the wire');

console.log(`sync selftest: ${n} checks passed`);
