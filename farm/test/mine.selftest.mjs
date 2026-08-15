// mine.selftest.mjs — the mine kernel under assertion. Run: node farm/test/mine.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { levelFor, orePool, enterMine, dig, useBomb, LEVEL_W, LEVEL_H, PICKS_BASE, REFILL_MS, BOMB_PICKS, METALS } from '../js/mine.js';
import { newFarm } from '../js/state.js';

const here = dirname(fileURLToPath(import.meta.url));
const ark = JSON.parse(readFileSync(join(here, '../vendor/ark.json'), 'utf8'));

let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error('✗', msg); process.exit(1); } };

const T0 = 1_700_000_000_000;

// ── layout invariants across many (seed, depth) pairs ──
for (let seed = 1; seed <= 40; seed++) {
  for (const depth of [0, 1, 5, 13, 30]) {
    const tiles = levelFor(seed * 2654435761 >>> 0, depth);
    ok(tiles.length === LEVEL_W * LEVEL_H, 'level is full-size');
    const ladders = tiles.filter((t) => t.kind === 'ladder');
    ok(ladders.length === 1, 'exactly one ladder');
    ok(tiles[0].kind !== 'ladder', 'ladder never at the entry corner');
    for (const t of tiles) {
      ok(t.cover === 'dirt' || t.cover === 'rock', 'cover is dirt or rock');
      if (t.kind === 'ore') ok(METALS.includes(t.metal) && orePool(depth).includes(t.metal), 'ore metal in the depth band');
    }
  }
}
// determinism
ok(JSON.stringify(levelFor(1234, 7)) === JSON.stringify(levelFor(1234, 7)), 'levelFor is deterministic');
ok(JSON.stringify(levelFor(1234, 7)) !== JSON.stringify(levelFor(1234, 8)), 'depths differ');

// nobility gradient: quicksilver never in the shallows, lead never in the deeps' pool
ok(!orePool(0).includes('quicksilver') && !orePool(0).includes('gold'), 'no noble metals at the surface');
ok(!orePool(20).includes('lead'), 'lead left behind in the deeps');

// ── run flow ──
let farm = newFarm('did:plc:minerselftest01', ark, T0);
let e = enterMine(farm, T0);
ok(e.ok && e.farm.mine.picks === PICKS_BASE, 'first entry fills picks');
farm = e.farm;

// dig every tile we can afford; the ladder must be reachable in principle (dig it directly)
const tiles = levelFor(farm.seed, farm.mine.runDepth);
const ladderIdx = tiles.findIndex((t) => t.kind === 'ladder');
const before = farm.mine.runDepth;
let d = dig(farm, ladderIdx, T0 + 1);
ok(d.ok && d.found.kind === 'ladder', 'digging the ladder tile finds it');
ok(d.farm.mine.runDepth === before + 1 && d.farm.mine.depth === before + 1, 'ladder descends + records depth');
farm = d.farm;

// loot accounting: dig ore/coin/gem/shard tiles on this floor
const t2 = levelFor(farm.seed, farm.mine.runDepth);
for (let i = 0; i < t2.length && farm.mine.picks > 2; i++) {
  const r = dig(farm, i, T0 + 10 + i);
  if (!r.ok) continue;
  const t = t2[i];
  if (t.kind === 'ore') ok(r.farm.metals[t.metal] >= t.amount, 'ore banked');
  if (t.kind === 'coin') ok(r.farm.coins > farm.coins, 'coins banked');
  if (t.kind === 'shard') ok(r.farm.shards > farm.shards, 'shard banked');
  farm = r.farm;
}
const dugHere = Object.keys(farm.mine.dug).find((k) => k.startsWith(farm.mine.runDepth + ':'));
ok(dugHere && !dig(farm, +dugHere.split(':')[1], T0 + 999).ok, 'already-dug refused on the same floor');

// picks exhaust → refuse; bomb refunds
const broke = JSON.parse(JSON.stringify(farm)); broke.mine.picks = 0;
const freshIdx = t2.findIndex((_, i) => !broke.mine.dug[broke.mine.runDepth + ':' + i]);
ok(!dig(broke, freshIdx, T0).ok, 'no picks → no dig');
ok(!useBomb(broke, T0).ok, 'no bombs → refused');
broke.mine.bombs = 1;
const boom = useBomb(broke, T0);
ok(boom.ok && boom.farm.mine.picks === BOMB_PICKS && boom.farm.mine.bombs === 0, 'bomb grants picks');

// refill window: re-entry before REFILL_MS keeps the run; after it, refills and resumes at deepest
const early = enterMine(farm, T0 + 1000);
ok(early.farm.mine.picks === farm.mine.picks, 're-entry inside the window keeps picks');
const later = enterMine(farm, T0 + REFILL_MS + 1);
ok(later.farm.mine.picks === PICKS_BASE + (farm.mine.picksBonus | 0), 'refill after the window');
ok(later.farm.mine.runDepth === farm.mine.depth, 'resume at deepest floor');

console.log(`mine.selftest: ${n} assertions passed`);
