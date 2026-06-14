// story-director.selftest.mjs — pins the GLOBAL lane's pure fold kernel (hoop/story/director.js).
// Folds synthetic player saves into the cross-player pulse; proves idempotency-per-player, the
// aggregates, and the pulse ⇄ record round-trip. No network.
//   node hoop/test/story-director.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MemoryStore, flattenPool, interact } from '../story/engine.js';
import { emptyPulse, foldSave, summarize, pulseToRecord, recordToPulse, readSummary } from '../story/director.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const content = flattenPool(JSON.parse(readFileSync(join(HERE, '../story/pool.json'), 'utf8')));
const WORLD = JSON.parse(readFileSync(join(HERE, '../story/world.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } };

// helper: a player's snapshot after meeting some chamber-addressed residents
function playSnapshot(did, residents) {
  const s = new MemoryStore(content, WORLD);
  for (const r of residents) { s.addFeature({ key: r.addr, type: 'npc', tag: r.role }); interact(s, did, r.addr); }
  return s.snapshot();
}
const alice = playSnapshot('did:alice', [{ addr: '17|775|6#0', role: 'govern' }, { addr: '18|775|6#0', role: 'heal' }]);
const bob   = playSnapshot('did:bob',   [{ addr: '17|775|6#0', role: 'govern' }, { addr: '20|400|6#0', role: 'make' }]);

// 1. fold two players → travellers + content/chamber aggregates
let pulse = emptyPulse();
foldSave(pulse, 'did:alice', alice);
foldSave(pulse, 'did:bob', bob);
let sum = summarize(pulse);
ok('two travellers', sum.travellers === 2);
ok('chamber 17|775|6 visited by both', (sum.topChambers.find(([g]) => g === '17|775|6') || [])[1] === 2);
ok('the govern NPC (Keeper) met by both', (sum.topContent.find(([id]) => id === 'np-keeper') || [])[1] === 2);
ok('totalMet counts every placement', sum.totalMet === 4);

// 2. idempotency — re-folding alice's SAME save doesn't double-count
foldSave(pulse, 'did:alice', alice);
ok('re-fold same player is idempotent', summarize(pulse).travellers === 2 && summarize(pulse).totalMet === 4);

// 3. a player's NEWER save replaces their old contribution (latest-wins)
const alice2 = playSnapshot('did:alice', [{ addr: '17|775|6#0', role: 'govern' }]);   // alice now only met the Keeper
foldSave(pulse, 'did:alice', alice2);
sum = summarize(pulse);
ok('newer save replaces, not adds', sum.travellers === 2 && sum.totalMet === 3);

// 4. pulse ⇄ record round-trip (what the consumer writes / v3 reads)
const rec = pulseToRecord(pulse);
ok('record carries readable summary', readSummary(rec).travellers === 2);
const back = recordToPulse(rec);
ok('record restores working state', Object.keys(back.players).length === 2);
ok('restored pulse re-summarizes identically', JSON.stringify(summarize(back)) === JSON.stringify(summarize(pulse)));

// 5. empty pulse is safe
ok('empty pulse summarizes to zero', summarize(emptyPulse()).travellers === 0);
ok('null record → empty pulse', Object.keys(recordToPulse(null).players).length === 0);

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
