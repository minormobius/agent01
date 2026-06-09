// hoop/test/ship.selftest.mjs — headless proof of the ship engine's invariants.
// Run: node hoop/test/ship.selftest.mjs   (no deps; loads ship.js via eval)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// ship.js is a classic global script; eval it to populate globalThis.HoopShip.
(0, eval)(readFileSync(join(here, '..', 'js', 'ship.js'), 'utf8'));
const S = globalThis.HoopShip;

let pass = 0, fail = 0;
const ok = (name, cond) => { (cond ? pass++ : fail++); console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}`); };

const SEED = S.FLAGSHIP_SEED;
const flat = (g) => g.snapshot().join(',');

// 1. Determinism — same inputs ⇒ byte-identical chunk.
{
  const a = S.generateChunk(SEED, 3, -2, null);
  const b = S.generateChunk(SEED, 3, -2, null);
  ok('deterministic tiles', Buffer.from(a.tiles).equals(Buffer.from(b.tiles)));
  ok('deterministic gravity', Buffer.from(a.grav).equals(Buffer.from(b.grav)));
  ok('deterministic rooms', JSON.stringify(a.rooms) === JSON.stringify(b.rooms));
}

// 2. Seamless borders — adjacent chunks agree on the shared door offset.
{
  const c = S.generateChunk(SEED, 5, 5, null);
  const e = S.generateChunk(SEED, 6, 5, null);   // east neighbour
  const sth = S.generateChunk(SEED, 5, 6, null);  // south neighbour
  ok('E/W seam ports match', c.ports.E === e.ports.W);
  ok('N/S seam ports match', c.ports.S === sth.ports.N);
  // and the actual door tiles line up on the shared boundary row/col
  const CH = S.CHUNK, doorOf = S.TILE.DOOR;
  ok('E door tile present', c.tiles[c.ports.E * CH + (CH - 1)] === doorOf);
  ok('W door tile present (neighbour)', e.tiles[e.ports.W * CH + 0] === doorOf);
}

// 3. The feedback loop — nudging the genome toward gardens makes the frontier
//    sample more gardens. Count garden rooms over a frontier strip, neutral vs
//    garden-biased genome.
function countType(weights, id, n = 120) {
  let hits = 0, total = 0;
  for (let i = 0; i < n; i++) {
    const ch = S.generateChunk(SEED, 1000 + i, 0, weights);
    for (const r of ch.rooms) { total++; if (r.type === id) hits++; }
  }
  return hits / total;
}
{
  const neutral = new S.ShipGenome().snapshot();
  const garden = new S.ShipGenome().nudge('garden', 14).snapshot();
  const f0 = countType(neutral, 'garden');
  const f1 = countType(garden, 'garden');
  console.log(`   garden share: neutral ${(f0 * 100).toFixed(1)}%  →  garden-biased ${(f1 * 100).toFixed(1)}%`);
  ok('genome nudge increases garden frontier share', f1 > f0 * 1.5);
  // and it replays deterministically from an action log
  const fromLog = S.genomeFromLog([{ type: 'garden', amt: 14 }]).snapshot();
  ok('genomeFromLog == manual nudge', fromLog.join(',') === garden.join(','));
}

// 4. Gravity is a varied, sector-coherent texture (not all one regime).
{
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const ch = S.generateChunk(SEED, i, (i * 7) % 13, null);
    for (const r of ch.rooms) seen.add(r.gravity);
  }
  ok('multiple gravity regimes appear', seen.size >= 3);
  console.log(`   regimes seen: ${[...seen].join(', ')}`);
  // a side-format room shows up somewhere in the frontier
  let sideSeen = false;
  for (let i = 0; i < 400 && !sideSeen; i++)
    for (const r of S.generateChunk(SEED, 2000 + i, 0, null).rooms)
      if (r.format === 'side') sideSeen = true;
  ok('some rooms flip to side format', sideSeen);
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
