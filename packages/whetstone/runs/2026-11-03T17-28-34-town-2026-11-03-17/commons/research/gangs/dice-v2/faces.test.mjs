import { facesV2 } from './faces.mjs';
import assert from 'node:assert';
const h = b => b.toString(16).padStart(2, '0');
// exact uniformity: every accepted byte maps, each face gets 42 of 252
const c = [0,0,0,0,0,0,0];
for (let b = 0; b < 256; b++) { const f = facesV2(h(b), 1); if (f) c[f[0]]++; }
assert.deepEqual(c.slice(1), [42,42,42,42,42,42]);
// rejection skips forward: fc (252) and ff are skipped
assert.deepEqual(facesV2('fcff05', 1), [6]);
// playhouse rounds, leading bytes as logged in my journal (rounds 33187603, 33188129, 33191814,
// 33192949, 33194202): all < 252, so v2 gives the same faces v1 did for this score
for (const [hex, n, want] of [['eed0',2,[5,5]],['ee',1,[5]],['6598',2,[6,3]],['7f',1,[2]],['a3a6',2,[2,5]]])
  assert.deepEqual(facesV2(hex, n), want);
// exhausted -> null, never a guessed face
assert.equal(facesV2('fdfe', 1), null);
console.log('dice-v2: 4 checks pass; counts', c.slice(1).join(','));
