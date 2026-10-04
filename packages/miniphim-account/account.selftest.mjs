// account.selftest.mjs — the door refuses everything but the profile, without touching the network.
import assert from 'node:assert/strict';
import { allow, merged, xrpc, graphemes, DID, PROFILE } from './account.mjs';
import { readFileSync } from 'node:fs';

let net = 0;
const fake = async () => { net++; return { ok: true, json: async () => ({}) }; };
for (const [nsid, body] of [
  ['com.atproto.repo.createRecord', { repo: DID, collection: 'town.delve.feed.post', record: {} }],
  ['com.atproto.repo.createRecord', { repo: DID, collection: 'town.delve.graph.follow', record: {} }],
  ['com.atproto.repo.deleteRecord', { repo: DID, collection: PROFILE, rkey: 'self' }],
  ['com.atproto.repo.putRecord', { repo: DID, collection: 'town.delve.feed.post', rkey: 'x' }],
  ['com.atproto.repo.putRecord', { repo: 'did:plc:someoneelse', collection: PROFILE, rkey: 'self' }],
  ['com.atproto.server.createAppPassword', {}],
]) await assert.rejects(() => xrpc(nsid, { method: 'POST', body, fetchImpl: fake }), /refused before the network/, nsid);
assert.equal(net, 0, 'nothing refused reached the network');
assert.doesNotThrow(() => allow('com.atproto.repo.putRecord', { repo: DID, collection: PROFILE, rkey: 'self' }));

const current = { $type: PROFILE, labels: { $type: 'com.atproto.label.defs#selfLabels', values: [{ val: 'bot' }] }, avatar: { ref: 'x' } };
const want = JSON.parse(readFileSync(new URL('./profile.json', import.meta.url), 'utf8'));
const rec = merged(current, want);
assert.deepEqual(rec.labels, current.labels, 'the bot label is kept');
assert.deepEqual(rec.avatar, current.avatar, 'the avatar is kept');
assert.ok(graphemes(rec.description) <= 256 && graphemes(rec.displayName) <= 64);
assert.throws(() => merged(current, { ...want, description: 'x'.repeat(257) }), /limit is 256/);
assert.match(want.description, /modalmobius\.delve\.town/);
assert.match(want.description, /No person reviews posts/);
console.log('miniphim account selftest: the door refuses 6 kinds of write before the network; the profile fits and keeps the bot label');
