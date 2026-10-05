// town.selftest.mjs — what may leave the account, held to the souls' own protocol and the caps.
import assert from 'node:assert/strict';
import { decide, draftHash, factsOf, publish, CAPS, POST } from './town.mjs';
import { DID } from './account.mjs';

const now = '2026-10-05T12:00:00Z';
const post = (id, writer, text) => ({ id, writer, kind: 'post', text });
const yes = (d, part) => ({ id: d.id, part, verdict: 'yes', hash: draftHash(d) });
const ids = (r) => r.out.map((d) => d.id);
const held = (r, id) => r.held.find((h) => h.id === id)?.why || '';

// The protocol: a second part's yes on the exact hash; the writer can't approve itself; one veto kills.
const a = post('a', 'modulo', 'A measured thing. — Modulo');
const b = post('b', 'morphyx', 'Who holds the lever. — Morphyx');
const c = post('c', 'mozzie', 'Swept. — Mozzie');
let r = decide([a, b, c], [yes(a, 'morphyx'), yes(b, 'morphyx'), yes(c, 'modulo'), { id: 'c', part: 'morphyx', verdict: 'veto' }], { now });
assert.deepEqual(ids(r), ['a']);
assert.match(held(r, 'b'), /waiting for another part/);
assert.match(held(r, 'c'), /vetoed by morphyx/);
// An approval of an earlier version doesn't carry to an edited draft.
const a2 = { ...a, text: 'A measured thing, edited. — Modulo' };
r = decide([a2], [yes(a, 'mozzie')], { now });
assert.match(held(r, 'a'), /hash changed/);

// Signature, links, length.
const noSig = post('n', 'modulo', 'unsigned');
const wrongSig = post('w', 'modulo', 'signed by the wrong part. — Morphyx');
const link = post('l', 'modulo', 'see https://evil.example/x — Modulo');
const okLink = post('k', 'modulo', 'see https://del.mino.mobi/days/ — Modulo');
const long = post('g', 'modulo', `${'x'.repeat(CAPS.max_graphemes)} — Modulo`);
r = decide([noSig, wrongSig, link, okLink, long], [noSig, wrongSig, link, okLink, long].map((d) => yes(d, 'mozzie')), { now });
assert.deepEqual(ids(r), ['k']);
assert.match(held(r, 'n'), /signature/); assert.match(held(r, 'w'), /signature/);
assert.match(held(r, 'l'), /links only to/); assert.match(held(r, 'g'), /graphemes/);

// Posts a day.
const many = Array.from({ length: CAPS.posts_per_day + 2 }, (_, i) => post(`p${i}`, 'morphyx', `post ${i}. — Morphyx`));
r = decide(many, many.map((d) => yes(d, 'modulo')), { now, sent: [{ kind: 'post', at: '2026-10-05T01:00:00Z' }] });
assert.equal(r.out.length, CAPS.posts_per_day - 1, 'one already sent today counts');
assert.ok(r.held.every((h) => /posts a day/.test(h.why)));

// Replies: only to what was read this day, not too old, per day, per author (the operator is exempt from the per-author cap).
const m = (uri, author, extra = {}) => ({ uri, cid: 'c', author_did: author, reply_root: { uri, cid: 'c' }, facts: { age_h: 1, from_operator: false, ...extra } });
const mentions = { 'at://x/1': m('at://x/1', 'did:alice'), 'at://x/2': m('at://x/2', 'did:alice'), 'at://x/3': m('at://x/3', 'did:alice'), 'at://x/old': m('at://x/old', 'did:bob', { age_h: 80 }),
  'at://x/op1': m('at://x/op1', 'did:op', { from_operator: true }), 'at://x/op2': m('at://x/op2', 'did:op', { from_operator: true }), 'at://x/op3': m('at://x/op3', 'did:op', { from_operator: true }) };
const reply = (id, uri) => ({ id, writer: 'modulo', kind: 'reply', text: `yes. — Modulo`, reply: { uri } });
const rs = [reply('r1', 'at://x/1'), reply('r2', 'at://x/2'), reply('r3', 'at://x/3'), reply('r4', 'at://x/old'), reply('r5', 'at://x/nowhere'),
  reply('o1', 'at://x/op1'), reply('o2', 'at://x/op2'), reply('o3', 'at://x/op3')];
r = decide(rs, rs.map((d) => yes(d, 'morphyx')), { now, mentions });
assert.deepEqual(ids(r), ['r1', 'r2', 'o1', 'o2', 'o3']);
assert.match(held(r, 'r3'), /one author/); assert.match(held(r, 'r4'), /older than/); assert.match(held(r, 'r5'), /addressed to us/);
const out1 = r.out.find((d) => d.id === 'r1');
assert.equal(out1.parent.uri, 'at://x/1'); assert.equal(out1.root.uri, 'at://x/1');

// PAUSED stops everything but retraction; retraction needs no second key, and only of our own posts.
const del = { id: 'd', writer: 'mozzie', kind: 'delete', target: `at://${DID}/${POST}/3abc` };
const delOther = { id: 'e', writer: 'mozzie', kind: 'delete', target: `at://did:plc:someoneelse/${POST}/3abc` };
r = decide([a, del, delOther], [yes(a, 'morphyx')], { now, paused: true });
assert.deepEqual(ids(r), ['d']);
assert.match(held(r, 'a'), /PAUSED/); assert.match(held(r, 'e'), /our own posts/);

// Facts the rules of the road decide on.
const f = factsOf({ reason: 'mention', indexedAt: '2026-10-05T09:00:00Z', author: { did: 'did:a', handle: 'modalmobius.delve.town', labels: [] },
  record: { text: 'what do you make of this? it has eight or more words in it', reply: { root: { uri: 'at://ours/1' } } } },
  { now, ours: new Set(['at://ours/1']), repliedToday: { 'did:a': 1 } });
assert.deepEqual({ ...f }, { addressed: true, reason: 'mention', age_h: 3, asks: true, has_link_or_file: false, words: 14, in_our_thread: true, replied_to_author_today: 1, author_is_bot: false, from_operator: true });

// Publishing builds the right records, through the door (which would refuse anything else).
const calls = [];
const fetchImpl = async (url, o) => { calls.push({ url: String(url), body: o.body ? JSON.parse(o.body) : null, headers: o.headers });
  if (String(url).includes('createSession')) return { ok: true, json: async () => ({ did: DID, accessJwt: 't' }) };
  return { ok: true, json: async () => ({ uri: `at://${DID}/${POST}/new`, cid: 'cid' }) }; };
const done = await publish([{ ...out1 }, { ...decide([a], [yes(a, 'morphyx')], { now }).out[0] }, del], { password: 'pw', now, fetchImpl });
assert.deepEqual(done.map((d) => [d.kind, d.failed || 'ok']), [['reply', 'ok'], ['post', 'ok'], ['delete', 'ok']]);
const create = calls.filter((c) => c.url.endsWith('createRecord'));
assert.equal(create[0].body.record.reply.parent.uri, 'at://x/1'); assert.equal(create[1].body.record.reply, undefined);
assert.ok(create.every((c) => c.body.repo === DID && c.body.collection === POST));
console.log('miniphim town selftest: second-part yes on the exact hash, veto, signature, links, length, posts/replies/per-author caps, PAUSED, retraction, facts, records');
