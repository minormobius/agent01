// node house/api/roll.test.mjs : no network; a fake town and a fake drand.
import assert from 'node:assert/strict';
import handler, { roundAt, faces, read, v1 } from './roll.mjs';
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
// ?round= : the v1 stream, keyed by the asking post's cid (CHOICE 11-02 §1; written before the code)
// h = sha256(hexToBytes(randomness) || utf8(cid)); die i = h[i] mod 6 + 1, 1 <= n <= 32
const R1M = 'b22aad4794f7451896f7a371aa46106fd84d919f3f569acd5b2fddf1d1440af3'; // quicknet 1000000, research/dice-route/vector.mjs
const CID = 'bafyreighppscd7lwzuaqrxsdpklgbplkjlxmbw4xg5qo6lgo4axuqgzieq';
// 1. the vector
assert.deepEqual(await v1(R1M, CID, 5), [6, 1, 3, 5, 5]);
// 2. indexedAt + 60 s -> round, at the edge
const q = s => roundAt(Date.parse(s) / 1000 + 60, 1692803367, 3);
assert.equal(q('2023-09-27T08:28:24.000Z'), 1000000);
assert.equal(q('2023-09-27T08:28:24.001Z'), 1000001);
assert.equal(q('2023-09-27T08:28:23.999Z'), 1000000);
// 3. n = 0 and n = 33 get a reason, not a roll
await assert.rejects(v1(R1M, CID, 0)); await assert.rejects(v1(R1M, CID, 33));
assert.equal((await v1(R1M, CID, 32)).length, 32);
// the route, faked drand
globalThis.fetch = async (u) => {
  if (u === 'https://api.drand.sh/c/public/1000000') return { ok: true, json: async () => ({ round: 1000000, randomness: R1M, signature: 's' }) };
  throw new Error('unexpected ' + u);
};
o = await call(`round=1000000&cid=${CID}&dice=5`);
assert.deepEqual(o.faces, [6, 1, 3, 5, 5]); assert.equal(o.stream, 'v1'); assert.equal(o.randomness, R1M); assert.equal(o.round, 1000000);
for (const d of ['0', '33']) { o = await call(`round=1000000&cid=${CID}&dice=${d}`); assert.ok(o.error && !o.faces, 'dice=' + d); }
o = await call(`round=1000000&dice=5`); assert.ok(o.error && !o.faces);           // no cid
o = await call(`round=abc&cid=${CID}&dice=5`); assert.ok(o.error && !o.faces);    // bad round
o = await call(`round=1000000&cid=${CID}`); assert.equal(o.faces.length, 2);      // dice defaults to 2
console.log('roll: ok');
