// sync.selftest — the cross-device save race. updatedAt is wall-clock and a stale device that
// merely BOOTS later re-stamps an old world (streak commit on open); progressMarks/saveAhead are
// what keeps that lie from burying a real session. These tests encode the 2026-08-14 incident:
// a computer's flurry of play never flushed, the phone re-stamped the pre-flurry cloud copy, and
// the flurry lost every timestamp comparison it should have won.
import { newFarm, saveAhead, progressMarks, toPlotRecord, fromPlotRecord } from '../js/state.js';
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

console.log(`sync selftest: ${n} checks passed`);
