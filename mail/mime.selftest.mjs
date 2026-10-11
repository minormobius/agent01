#!/usr/bin/env node
// mime.selftest.mjs — known answers for mail/src/mime.mjs. node mail/mime.selftest.mjs
import assert from 'node:assert/strict';
import { textOf, codesOf, decodeWords, dmarcOf, addrOf, stripHtml, senderMatches, sealedSenders } from './src/mime.mjs';
import { keyFor } from './client.mjs';
import { townTick, requestFor, summonTick, addressesUs, MINIPHIM_DID } from './src/clock.mjs';

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}\n${e.stack}`); process.exit(1); } };

const signup = [
  'From: Bluesky <noreply@bsky.app>',
  'To: modulo@mino.mobi',
  'Subject: =?utf-8?B?Q29uZmlybSB5b3VyIGVtYWls?=',
  'Authentication-Results: mx.cloudflare.net; dkim=pass; spf=pass; dmarc=pass header.from=bsky.app',
  'Content-Type: multipart/alternative; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Your verification code is: ABC12-DE3F4',
  'It expires in 15 minutes. Caf=C3=A9.',
  '--b1',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Your code is <b>ABC12-DE3F4</b></p>',
  '--b1--',
  '',
].join('\r\n');

t('multipart: the text/plain part, quoted-printable and utf-8 decoded', () => {
  const { headers, text } = textOf(signup);
  assert.match(text, /verification code is: ABC12-DE3F4/);
  assert.match(text, /Café\./);
  assert.equal(decodeWords(headers.subject), 'Confirm your email');
  assert.equal(dmarcOf(headers), 'pass');
  assert.equal(addrOf(headers.from), 'noreply@bsky.app');
});
t('codes: the hyphenated code, the six-digit code, verify links; not ordinary numbers', () => {
  assert.deepEqual(codesOf('Your verification code is: ABC12-DE3F4').codes, ['ABC12-DE3F4']);
  assert.deepEqual(codesOf('Enter this code to confirm\n\n  483920  \n').codes, ['483920']);
  const l = codesOf('Click https://bsky.app/verify?token=abc123 or visit https://bsky.app/about').links;
  assert.deepEqual(l, ['https://bsky.app/verify?token=abc123']);
  assert.deepEqual(codesOf('We met 2026 people at 1400 events.').codes, []);
});
t('html only: tags out, link targets kept', () => {
  const raw = 'Content-Type: text/html\r\n\r\n<p>Hi<br>there <a href="https://x.test/confirm?c=1">confirm</a></p><script>x()</script>';
  const { text } = textOf(raw);
  assert.equal(text, 'Hi\nthere confirm (https://x.test/confirm?c=1)');
});
t('base64 body', () => {
  const raw = `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('code: 918273 ✓').toString('base64')}`;
  assert.equal(textOf(raw).text, 'code: 918273 ✓');
});
t('sender lists match domains, subdomains and exact addresses', () => {
  assert.ok(senderMatches('@delve.town', 'noreply@delve.town'));
  assert.ok(senderMatches('@delve.town', 'pm_bounces@pm-bounces.delve.town'));
  assert.ok(!senderMatches('@delve.town', 'x@notdelve.town'));
  assert.ok(!senderMatches('@delve.town', 'delve.town@evil.test'));
  assert.ok(senderMatches('a@b.test, @c.test', 'A@B.test'));
});
t('sealed senders are per being', () => {
  const spec = 'miniphim:@delve.town,@groveresearch.com;modulo:@x.test';
  assert.equal(sealedSenders(spec, 'miniphim'), '@delve.town,@groveresearch.com');
  assert.equal(sealedSenders(spec, 'morphyx'), '');
  assert.ok(senderMatches(sealedSenders(spec, 'miniphim'), 'hi@groveresearch.com'));
});
t('no dmarc header reads as none', () => assert.equal(dmarcOf({}), 'none'));
t('stripHtml entities', () => assert.equal(stripHtml('a &amp; b &lt;c&gt;'), 'a & b <c>'));

t('a being\'s key is standard HMAC-SHA256, as the Worker computes it with WebCrypto', () => {
  // RFC 4231-style known answer (Wikipedia's HMAC example).
  assert.equal(keyFor('key', 'The quick brown fox jumps over the lazy dog'), 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  assert.notEqual(keyFor('lab', 'modulo'), keyFor('lab', 'morphyx'));
});

// The clock: off unless the template says so; one commit per slot; the request it writes.
{
  const tmpl = { enabled: true, $comment: 'x', souls: 'modulo,morphyx', kinds: 'town', kinds_by_hour: { '13': 'sweep,town,evening' }, net: true };
  const r = requestFor(tmpl, new Date('2026-10-06T13:23:00Z'));
  assert.equal(r.path, 'packages/whetstone/requests/2026-10-06-town-2026-10-06-13.json');
  assert.equal(r.body.kinds, 'sweep,town,evening'); assert.equal(r.body.enabled, undefined); assert.equal(r.body.net, true);
  assert.equal(requestFor(tmpl, new Date('2026-10-06T07:23:00Z')).body.kinds, 'town');
  const calls = [];
  const gh = (files) => async (url, o = {}) => { calls.push([o.method || 'GET', url]);
    const p = decodeURIComponent(url.split('/contents/')[1].split('?')[0]);
    if ((o.method || 'GET') === 'PUT') return { ok: true, json: async () => ({}) };
    return p in files ? { ok: true, json: async () => ({ content: Buffer.from(files[p]).toString('base64') }) } : { ok: false, status: 404 }; };
  const env = { GH_TOKEN: 't', CLOCK_REPO: 'o/r', CLOCK_BRANCH: 'b' };
  const on = await townTick(env, new Date('2026-10-06T13:23:00Z'), gh({ 'packages/whetstone/town-day.json': JSON.stringify(tmpl) }));
  assert.match(on.committed, /2026-10-06-town-2026-10-06-13\.json$/); assert.equal(calls.at(-1)[0], 'PUT');
  assert.match((await townTick(env, new Date(), gh({ 'packages/whetstone/town-day.json': JSON.stringify({ ...tmpl, enabled: false }) }))).skipped, /off/);
  { const { requestFor } = await import('./src/clock.mjs');
    const seeds = [1, 5, 9, 13, 17, 21].map((h) => requestFor(tmpl, new Date(`2026-10-08T${String(h).padStart(2, '0')}:23:00Z`)).body.seed);
    assert.equal(new Set(seeds).size, 6, 'every four-hour day gets its own seed (and so its own turn order)'); }
  const again = await townTick(env, new Date('2026-10-06T13:23:00Z'), gh({ 'packages/whetstone/town-day.json': JSON.stringify(tmpl), [r.path]: '{}' }));
  assert.match(again.skipped, /already exists/);
  assert.match((await townTick({}, new Date())).skipped, /no token/);
  n++;
}

// The summon: a post of the person's that addresses the account, newer than the last answered.
{
  const D = MINIPHIM_DID;
  assert.ok(addressesUs({ record: { text: 'hey @miniphim.delve.town look' } }));
  assert.ok(addressesUs({ record: { text: 'x', facets: [{ features: [{ $type: 'town.delve.richtext.facet#mention', did: D }] }] } }));
  assert.ok(addressesUs({ record: { text: 'yes', reply: { parent: { uri: `at://${D}/town.delve.feed.post/3x` } } } }));
  assert.ok(!addressesUs({ record: { text: 'about miniphims in general' } }));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  const tpl = { enabled: false, souls: 'modulo,morphyx', kinds: 'town', summon: { enabled: true, from: 'modalmobius.delve.town', request: { kinds: 'town' } } };
  const now = new Date('2026-10-06T10:00:00Z');
  const post = (rkey, at, text, handle = 'modalmobius.delve.town') => ({ post: { uri: `at://did:plc:me/town.delve.feed.post/${rkey}`, author: { handle }, record: { text, createdAt: at } } });
  let feed = [post('a1', '2026-10-06T09:58:00Z', '@miniphim are you there'), post('a0', '2026-10-06T09:00:00Z', '@miniphim old'), post('b1', '2026-10-06T09:59:00Z', 'not for them'), post('c1', '2026-10-06T09:59:30Z', '@miniphim', 'someone.delve.town')];
  const puts = [];
  const fake = async (url, init = {}) => {
    if (String(url).includes('town-day.json')) return { ok: true, json: async () => ({ content: b64(tpl) }) };
    if (String(url).includes('getAuthorFeed')) return { ok: true, json: async () => ({ feed }) };
    if (init.method === 'PUT') { puts.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 201 }; }
    return { ok: false, status: 404 };
  };
  const kv = new Map(); const state = { get: async (k) => kv.get(k) ?? null, set: async (k, v) => kv.set(k, v) };
  const env = { GH_TOKEN: 't', CLOCK_REPO: 'o/r', CLOCK_BRANCH: 'b' };
  const r = await summonTick(env, now, fake, state);
  assert.match(r.committed, /requests\/2026-10-06-summon-a1\.json$/);
  const body = JSON.parse(Buffer.from(puts[0].body.content, 'base64').toString());
  assert.deepEqual(body.summoned_by, ['at://did:plc:me/town.delve.feed.post/a1'], 'only the person, only addressed, only inside the window');
  assert.equal(body.kinds, 'town'); assert.equal(body.summon, undefined); assert.match(body.notice, /summoned you/);
  assert.match((await summonTick(env, now, fake, state)).skipped, /no new mention/, 'a mention is answered once');
  feed = [post('a2', '2026-10-06T10:01:00Z', 'reply', 'modalmobius.delve.town')]; feed[0].post.record.reply = { parent: { uri: `at://${D}/town.delve.feed.post/3x` } };
  assert.match((await summonTick(env, new Date('2026-10-06T10:02:00Z'), fake, state)).committed, /summon-a2/, 'a reply in our thread summons too');
  tpl.summon.enabled = false;
  assert.match((await summonTick(env, now, fake, state)).skipped, /summon is off/);
  n++;
}

// Mutuals (2026-10-11): whoever miniphim follows that follows it back can summon; strangers can't;
// each mention once; paced by mutual_gap_min and mutual_per_day; a held one goes out later.
{
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  const tpl = { enabled: true, souls: 'modulo,morphyx', kinds: 'town', summon: { enabled: true, from: 'modalmobius.delve.town', mutuals: true, mutual_gap_min: 30, mutual_per_day: 2, request: { kinds: 'town' } } };
  const P = (did, handle, rkey, at, text) => ({ post: { uri: `at://${did}/town.delve.feed.post/${rkey}`, author: { did, handle }, record: { text, createdAt: at } } });
  const feeds = { 'modalmobius.delve.town': [], 'did:plc:deep': [], 'did:plc:stranger': [] };
  const puts = [];
  const fake = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('town-day.json')) return { ok: true, json: async () => ({ content: b64(tpl) }) };
    if (u.includes('getFollows')) return { ok: true, json: async () => ({ follows: [{ did: 'did:plc:deep', handle: 'deepfates.delve.town' }, { did: 'did:plc:one', handle: 'oneway.delve.town' }] }) };
    if (u.includes('getFollowers')) return { ok: true, json: async () => ({ followers: [{ did: 'did:plc:deep', handle: 'deepfates.delve.town' }, { did: 'did:plc:stranger', handle: 's.delve.town' }] }) };
    if (u.includes('getAuthorFeed')) { const a = decodeURIComponent(u.match(/actor=([^&]+)/)[1]); return { ok: true, json: async () => ({ feed: feeds[a] || [] }) }; }
    if (init.method === 'PUT') { puts.push(JSON.parse(Buffer.from(JSON.parse(init.body).content, 'base64').toString())); return { ok: true, status: 201 }; }
    return { ok: false, status: 404 };
  };
  const kv = new Map(); const state = { get: async (k) => kv.get(k) ?? null, set: async (k, v) => kv.set(k, String(v)) };
  const env = { GH_TOKEN: 't', CLOCK_REPO: 'o/r', CLOCK_BRANCH: 'b' };
  const t = (m) => new Date(Date.parse('2026-10-11T12:00:00Z') + m * 60000);
  feeds['did:plc:deep'] = [P('did:plc:deep', 'deepfates.delve.town', 'd1', t(-1).toISOString(), '@miniphim want to play?')];
  feeds['did:plc:stranger'] = [P('did:plc:stranger', 's.delve.town', 's1', t(-1).toISOString(), '@miniphim hi')];
  let r = await summonTick(env, t(0), fake, state);
  assert.match(r.committed, /summon-d1/); assert.equal(r.by_mutuals, 1);
  assert.match(puts[0].notice, /deepfates\.delve\.town \(a mutual\)/); assert.match(puts[0].notice, /guest list/);
  assert.deepEqual(puts[0].summoned_by, ['at://did:plc:deep/town.delve.feed.post/d1'], 'a follower we don\'t follow back, and a one-way follow, summon nothing');
  assert.match((await summonTick(env, t(2), fake, state)).skipped, /no new mention/, 'answered once');
  feeds['did:plc:deep'].unshift(P('did:plc:deep', 'deepfates.delve.town', 'd2', t(3).toISOString(), '@miniphim again'));
  assert.match((await summonTick(env, t(4), fake, state)).skipped, /waits: the last was under 30 min/, 'paced');
  r = await summonTick(env, t(31), fake, state);
  assert.match(r.committed, /summon-d2/, 'the held mention goes out once the gap has passed');
  feeds['did:plc:deep'].unshift(P('did:plc:deep', 'deepfates.delve.town', 'd3', t(62).toISOString(), '@miniphim third'));
  assert.match((await summonTick(env, t(63), fake, state)).skipped, /2 today already/, 'a daily cap for mutuals');
  feeds['modalmobius.delve.town'] = [P('did:plc:me', 'modalmobius.delve.town', 'p1', t(64).toISOString(), '@miniphim hello')];
  r = await summonTick(env, t(65), fake, state);
  assert.match(r.committed, /summon-p1/, 'the person is never paced'); assert.equal(puts.at(-1).summoned_by.length, 2, 'and a waiting mutual rides along');
  n++;
}

console.log(`mail mime selftest: ${n} passed`);
