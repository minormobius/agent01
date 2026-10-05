// account.selftest.mjs — the door refuses everything it doesn't grant, without touching the network.
import assert from 'node:assert/strict';
import { allow, merged, xrpc, graphemes, DID, PROFILE } from './account.mjs';
import { readFileSync } from 'node:fs';

let net = 0;
const fake = async () => { net++; return { ok: true, json: async () => ({}) }; };
for (const [nsid, body] of [
  ['com.atproto.repo.createRecord', { repo: 'did:plc:someoneelse', collection: 'town.delve.feed.post', record: {} }],
  ['com.atproto.repo.createRecord', { repo: 'did:plc:someoneelse', collection: 'town.delve.feed.like', record: {} }],
  ['com.atproto.repo.deleteRecord', { repo: 'did:plc:someoneelse', collection: 'town.delve.graph.follow', rkey: 'x' }],
  ['com.atproto.repo.listRecords', { repo: 'did:plc:someoneelse', collection: 'town.delve.graph.follow' }],
  ['com.atproto.repo.listRecords', { repo: DID, collection: 'town.delve.feed.post' }],
  ['com.atproto.repo.createRecord', { repo: DID, collection: 'town.delve.feed.repost', record: {} }],
  ['com.atproto.repo.createRecord', { repo: DID, collection: 'town.delve.graph.block', record: {} }],
  ['com.atproto.repo.createRecord', { repo: DID, collection: 'town.delve.graph.list', record: {} }],
  ['town.delve.graph.muteActor', {}],
  ['com.atproto.repo.deleteRecord', { repo: DID, collection: PROFILE, rkey: 'self' }],
  ['com.atproto.repo.putRecord', { repo: DID, collection: 'town.delve.feed.post', rkey: 'x' }],
  ['com.atproto.repo.putRecord', { repo: 'did:plc:someoneelse', collection: PROFILE, rkey: 'self' }],
  ['com.atproto.server.createAppPassword', {}],
  ['com.atproto.repo.uploadBlob', { contentType: 'text/html', size: 100 }],
  ['com.atproto.repo.uploadBlob', { contentType: 'image/png', size: 2_000_000 }],
]) await assert.rejects(() => xrpc(nsid, { method: 'POST', body, fetchImpl: fake }), /refused before the network/, nsid);
assert.equal(net, 0, 'nothing refused reached the network');
for (const c of ['town.delve.graph.follow', 'town.delve.feed.like']) for (const m of ['createRecord', 'deleteRecord', 'listRecords']) assert.doesNotThrow(() => allow(`com.atproto.repo.${m}`, { repo: DID, collection: c }), `${m} ${c} in our own repo`);
assert.doesNotThrow(() => allow('town.delve.graph.getFollows', { actor: 'modalmobius.delve.town' }));
assert.doesNotThrow(() => allow('com.atproto.repo.putRecord', { repo: DID, collection: PROFILE, rkey: 'self' }));
assert.doesNotThrow(() => allow('com.atproto.repo.uploadBlob', { contentType: 'image/png', size: 10896 }));
const face = readFileSync(new URL('./avatar.png', import.meta.url));
assert.equal(face.slice(1, 4).toString(), 'PNG'); assert.equal(face.readUInt32BE(16), face.readUInt32BE(20), 'square');
assert.ok(face.length < 1_000_000);

const current = { $type: PROFILE, labels: { $type: 'com.atproto.label.defs#selfLabels', values: [{ val: 'bot' }] }, avatar: { ref: 'x' } };
const want = JSON.parse(readFileSync(new URL('./profile.json', import.meta.url), 'utf8'));
const rec = merged(current, want);
assert.deepEqual(rec.labels, current.labels, 'the bot label is kept');
assert.deepEqual(rec.avatar, current.avatar, 'the avatar is kept');
assert.ok(graphemes(rec.description) <= 256 && graphemes(rec.displayName) <= 64);
assert.throws(() => merged(current, { ...want, description: 'x'.repeat(257) }), /limit is 256/);
assert.match(want.description, /modalmobius\.delve\.town/);
assert.match(want.description, /No person reviews posts/);
const withFace = merged(current, want, { $type: 'blob', ref: { $link: 'bafkface' }, mimeType: 'image/png', size: face.length });
assert.equal(withFace.avatar.ref.$link, 'bafkface'); assert.deepEqual(withFace.labels, current.labels);
console.log('miniphim account selftest: the door refuses 15 kinds of call before the network; the profile fits and keeps the bot label');
