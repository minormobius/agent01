// node house/api/roll.test.mjs : no network; a fake town and a fake drand.
import assert from 'node:assert/strict';
import handler, { roundAt, faces, read } from './roll.mjs';
const drand = { url: 'https://api.drand.sh', chainHash: 'c', genesis: 1692803367, period: 3 };
// round r is emitted at genesis + (r-1)*period
assert.equal(roundAt(1692803367, 1692803367, 3), 1);
assert.equal(roundAt(1692803368, 1692803367, 3), 2);
assert.equal(roundAt(1692803370, 1692803367, 3), 2);
assert.equal(roundAt(1692803371, 1692803367, 3), 3);
assert.deepEqual(faces('00ff05', 3), [1, 4, 6]);
assert.deepEqual(faces('0b11', 0), [6, 6]);
assert.deepEqual(read([1, 4, 6], 3), { top: 6, result: 'full' });
assert.deepEqual(read([6, 6], 2), { top: 6, result: 'critical' });
assert.deepEqual(read([6, 2], 0), { top: 2, result: 'bad' });
assert.deepEqual(read([5, 3], 2), { top: 5, result: 'partial' });
// the round is after the deadline, never before it
for (let i = 0; i < 1000; i++) { const t = 1.7e9 + Math.random() * 1e6; const r = roundAt(t, drand.genesis, 3); const rt = drand.genesis + (r - 1) * 3; assert.ok(rt >= t && rt < t + 3); }
// the whole route, faked
const U = 'at://did:plc:abc/town.delve.feed.post/3xyz';
const idx = '2025-10-18T22:40:00.000Z';
const want = roundAt(Date.parse(idx) / 1000 + 60, drand.genesis, 3);
globalThis.fetch = async (u) => {
  if (u.startsWith('https://api.delve.town/')) return { ok: true, json: async () => ({ thread: { post: { indexedAt: idx, author: { handle: 'm.t' } } } }) };
  if (u === `https://api.drand.sh/c/public/${want}`) return { ok: true, json: async () => ({ round: want, randomness: '0305' + 'a'.repeat(60), signature: 's' }) };
  throw new Error('unexpected ' + u);
};
const call = q => handler(new Request('https://miniphim.minomobi.com/api/roll/?' + q), { params: new URLSearchParams(q), drand });
let o = await call('uri=' + encodeURIComponent(U));
assert.equal(o.round, want); assert.deepEqual(o.faces, [4, 6]); assert.equal(o.result, 'full');
assert.ok(Date.parse(o.roundTime) >= Date.parse(idx) + 60000);
o = await call('uri=nope'); assert.ok(o.error);
o = await call('uri=' + encodeURIComponent(U) + '&dice=0'); assert.deepEqual(o.faces, [4, 6]); assert.equal(o.result, 'partial');
o = await call('uri=' + encodeURIComponent('https://delve.town/profile/m.t/post/3xyz')); assert.equal(o.uri, 'at://m.t/town.delve.feed.post/3xyz'); assert.deepEqual(o.faces, [4, 6]);
o = await call('uri=' + encodeURIComponent('https://evil.example/profile/m.t/post/3xyz')); assert.ok(o.error);
console.log('roll: ok');
