// node miniphim/bot-worker.selftest.mjs — the bots worker against a fake PDS: sign-in once and reuse,
// the profile with its bot label, writes only to the bot's own repo, state kept privately, the rails,
// the waiting state, and status that never shows state or secrets.
import assert from 'node:assert/strict';
import { Bots, makeAgent, linkFacets, due, _setNet, guardedFetch, WRITES } from './bot-worker.js';

const calls = [];
let sessions = 0;
const fakeNet = async (input, init = {}) => {
  const url = new URL(String(input)), nsid = url.pathname.split('/').pop().split('.').pop();
  const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  calls.push({ nsid, body, params: Object.fromEntries(url.searchParams), auth: init.headers?.authorization || null, proxy: init.headers?.['atproto-proxy'] || null });
  const ok = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (nsid === 'createSession') { sessions++; return body.password === 'pw' ? ok({ did: 'did:plc:' + body.identifier.split('.')[0], handle: body.identifier, accessJwt: 'A', refreshJwt: 'R' }) : new Response('{"error":"AuthenticationRequired"}', { status: 401 }); }
  if (nsid === 'getRecord') return new Response('{"error":"RecordNotFound"}', { status: 400 });
  if (nsid === 'uploadBlob') return ok({ blob: { $type: 'blob', ref: { $link: 'bafy' }, mimeType: 'image/png', size: 3 } });
  if (nsid === 'resolveHandle') return ok({ did: 'did:plc:op' });
  if (nsid === 'getTimeline') return ok({ feed: [] });
  return ok({ uri: `at://${body?.repo}/${body?.collection}/1`, cid: 'c' });
};
_setNet(fakeNet);

// The fence: only the council's hosts.
await assert.rejects(guardedFetch('https://example.com/x'), /not allowed/);
await assert.rejects(guardedFetch('http://pds.delve.town/x'), /not allowed/);
{ let saw; _setNet(async (u, init) => { saw = init.redirect; return new Response('', { status: 302, headers: { location: 'https://evil.example/' } }); });
  await assert.rejects(guardedFetch('https://pds.delve.town/x'), /redirect/);
  assert.equal(saw, 'manual', "redirect: 'error' does not exist on Workers; 'manual' and a check does"); _setNet(fakeNet); }

// Facets: byte offsets, trailing punctuation dropped.
const f = linkFacets('é see https://del.mino.mobi/days/.');
assert.equal(f[0].features[0].uri, 'https://del.mino.mobi/days/');
assert.equal(f[0].index.byteStart, 7);

// Due: every N minutes, with a minute of slack for cron jitter.
assert.ok(due({ every: 60 }, null, 0));
assert.ok(!due({ every: 60 }, '2026-10-07T00:00:00Z', Date.parse('2026-10-07T00:30:00Z')));
assert.ok(due({ every: 60 }, '2026-10-07T00:00:00Z', Date.parse('2026-10-07T00:59:30Z')));

// The agent writes only to its own repo, whatever the tick says.
const log = [];
const ag = makeAgent({ did: 'did:plc:bingo', handle: 'bingo.delve.town', token: 'A', log });
await ag.repo('createRecord', { repo: 'did:plc:someone-else', collection: 'town.delve.feed.like', record: {} });
assert.equal(calls.at(-1).body.repo, 'did:plc:bingo', 'the repo is always the bot\'s own');
assert.equal(ag.token, undefined, 'the token is not on the agent');
await assert.rejects(ag.repo('deleteAccount', {}), /not one of/);
await assert.rejects(ag.read('com.atproto.server.createAppPassword', {}), /not a town/);
const p = await ag.post('hi @modalmobius.delve.town https://miniphim.minomobi.com/');
assert.equal(p.uri, 'at://did:plc:bingo/town.delve.feed.post/1');
const rec = calls.at(-1).body.record;
assert.deepEqual(rec.facets.map((x) => x.features[0].$type), ['town.delve.richtext.facet#mention', 'town.delve.richtext.facet#link']);
await ag.read('town.delve.feed.getTimeline', { limit: 5 });
assert.equal(calls.at(-1).proxy, 'did:web:api.delve.town#bsky_appview');
const many = makeAgent({ did: 'd', handle: 'h', token: 'A' });
for (let i = 0; i < WRITES; i++) await many.repo('createRecord', { collection: 'x', record: {} });
await assert.rejects(many.repo('createRecord', { collection: 'x', record: {} }), /more than 100 writes/);

// The Durable Object, with in-memory storage.
const store = new Map();
const ctx = { storage: { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)); }, delete: async (k) => store.delete(k) } };
let seen = [];
const bingo = { digest: 'd1', every: 60, secret: 'BOT_BINGO_PASSWORD', signed: ['modulo', 'mozzie'],
  profile: { handle: 'bingo.delve.town', displayName: 'Bingo', description: 'calls numbers · a bot made by @miniphim.delve.town' }, avatar: 'iVBO',
  mod: { default: async ({ agent, state }) => { seen.push(state); const n = (state?.n || 0) + 1; await agent.post(`ball ${n}`); return { n, seed: 'secret' }; } } };
const broken = { ...bingo, digest: 'd2', secret: 'BOT_BROKEN_PASSWORD', profile: { ...bingo.profile, handle: 'broken.delve.town' }, mod: { default: async () => { throw new Error('oops'); } } };

// No password yet: waiting, nothing sent.
let o = new Bots(ctx, {}, { bingo }, {});
calls.length = 0;
await o.tick('2026-10-07T00:00:00Z');
assert.equal(calls.length, 0);
assert.match((await o.status()).bots.bingo.waiting, /BOT_BINGO_PASSWORD/);

o = new Bots(ctx, { BOT_BINGO_PASSWORD: 'pw', BOT_BROKEN_PASSWORD: 'pw' }, { bingo, broken }, {});
await o.tick('2026-10-07T00:00:00Z');
const put = calls.find((c) => c.nsid === 'putRecord' && c.body.collection === 'town.delve.actor.profile');
assert.deepEqual(put.body.record.labels.values, [{ val: 'bot' }], 'the profile carries the bot label');
assert.equal(put.body.record.displayName, 'Bingo'); assert.ok(put.body.record.avatar);
assert.equal(seen[0], null, 'the first tick gets null state');
let st = (await o.status()).bots;
assert.equal(st.bingo.runs, 1); assert.equal(st.bingo.last_error, null); assert.equal(st.bingo.last_writes[0].op, 'createRecord');
assert.match(st.broken.last_error, /oops/, 'an error stops only that tick');
assert.ok(!JSON.stringify(st).includes('secret') && !JSON.stringify(st).includes('"pw"'), 'status shows neither state nor password');

// Not due yet: nothing. Due: one session reused, profile not rewritten, state carried.
const before = sessions;
calls.length = 0;
await o.tick('2026-10-07T00:30:00Z');
assert.equal(calls.length, 0);
await o.tick('2026-10-07T01:00:00Z');
assert.equal(sessions, before, 'the session is reused, not signed in again');
assert.ok(!calls.some((c) => c.nsid === 'putRecord' && c.body.collection === 'town.delve.actor.profile'), 'the profile is set once per digest');
assert.deepEqual(seen.at(-1), { n: 1, seed: 'secret' });
assert.equal(calls.find((c) => c.nsid === 'createRecord').body.record.text, 'ball 2');

// The status route answers GET only and never closes silently.
const { default: worker } = await import('./bot-worker.js');
assert.equal((await worker.fetch(new Request('https://miniphim.minomobi.com/_bots/'), { OPEN: 'false' })).status, 503);
assert.equal((await worker.fetch(new Request('https://miniphim.minomobi.com/_bots/', { method: 'POST' }), { OPEN: 'true' })).status, 405);

// A failure before the tick (here, sign-in refused) doesn't use up the bot's clock: next cron retries.
{ const st2 = new Map(); const c2 = { storage: { get: async (k) => structuredClone(st2.get(k)), put: async (k, v) => { st2.set(k, structuredClone(v)); }, delete: async (k) => st2.delete(k) } };
  const o2 = new Bots(c2, { BOT_BINGO_PASSWORD: 'wrong' }, { bingo }, {});
  await o2.tick('2026-10-07T00:00:00Z');
  const s2 = (await o2.status()).bots.bingo;
  assert.equal(s2.last_tick, null, 'a sign-in failure is not the bot\'s turn'); assert.ok(s2.last_error);
  o2.env.BOT_BINGO_PASSWORD = 'pw'; await o2.tick('2026-10-07T00:05:00Z');
  assert.equal((await o2.status()).bots.bingo.runs, 1, 'and the next cron runs it'); }

// Feeds: the DID document, describe, and the welcome desk against a fake PDS (two accounts with posts,
// one without); refresh stores each first post once, the skeleton pages newest arrivals first.
{
  const { didDoc, FEED_DID } = await import('./bot-worker.js');
  const wd = await import('./lab-feeds/welcome-desk.mjs');
  assert.equal(FEED_DID, 'did:web:miniphim.minomobi.com');
  assert.deepEqual(didDoc().service[0], { id: '#bsky_fg', type: 'BskyFeedGenerator', serviceEndpoint: 'https://miniphim.minomobi.com' });
  const firsts = { 'did:plc:a': { uri: 'at://did:plc:a/town.delve.feed.post/1', value: { createdAt: '2026-10-01T00:00:00Z' } },
    'did:plc:b': { uri: 'at://did:plc:b/town.delve.feed.post/1', value: { createdAt: '2026-10-05T00:00:00Z' } } };
  let reads = 0;
  _setNet(async (input) => {
    const u = new URL(String(input)); reads++;
    if (u.pathname.endsWith('listRepos')) return new Response(JSON.stringify({ repos: [{ did: 'did:plc:a' }, { did: 'did:plc:b' }, { did: 'did:plc:c' }, { did: 'did:plc:gone', active: false }] }));
    if (u.pathname.endsWith('listRecords')) { assert.equal(u.searchParams.get('reverse'), 'true'); const r = firsts[u.searchParams.get('repo')]; return new Response(JSON.stringify({ records: r ? [r] : [] })); }
    return new Response('{}', { status: 404 });
  });
  const st = new Map(); const c3 = { storage: { get: async (k) => structuredClone(st.get(k)), put: async (k, v) => { st.set(k, structuredClone(v)); }, delete: async (k) => st.delete(k),
    list: async ({ prefix }) => new Map([...st].filter(([k]) => k.startsWith(prefix)).sort()) } };
  const o3 = new Bots(c3, {}, {}, { 'welcome-desk': { mod: wd, by: 'lab' } });
  await o3.tick('2026-10-08T00:00:00Z');
  assert.equal(reads, 4, 'the account list once, then each active account once');
  let r = await o3.skeleton('welcome-desk', undefined, 1);
  assert.deepEqual(r.body, { feed: [{ post: 'at://did:plc:b/town.delve.feed.post/1' }], cursor: '1' }, 'newest arrival first, paged');
  r = await o3.skeleton('welcome-desk', '1', 1);
  assert.deepEqual(r.body, { feed: [{ post: 'at://did:plc:a/town.delve.feed.post/1' }] });
  reads = 0; await o3.tick('2026-10-08T00:10:00Z');
  assert.equal(reads, 0, 'a first post is read once; an account without one waits 2 h; the list 30 min');
  assert.equal((await o3.skeleton('nope', undefined, 5)).status, 400);
  assert.deepEqual((await o3.status()).feeds['welcome-desk'].result, { accounts: 3, checked: 0, found: 0 }, 'status shows the last refresh');
  const { default: worker } = await import('./bot-worker.js');
  const env = { OPEN: 'true', BOTS: { idFromName: () => 'id', get: () => ({ fetch: (u) => o3.fetch(new Request(u)) }) } };
  const dd = await (await worker.fetch(new Request('https://miniphim.minomobi.com/.well-known/did.json'), env)).json();
  assert.equal(dd.id, FEED_DID);
  const desc = await (await worker.fetch(new Request('https://miniphim.minomobi.com/xrpc/town.delve.feed.describeFeedGenerator'), env)).json();
  assert.ok(desc.feeds.some((f) => f.uri.endsWith('/town.delve.feed.generator/welcome-desk')));
  const sk = await worker.fetch(new Request('https://miniphim.minomobi.com/xrpc/town.delve.feed.getFeedSkeleton?feed=at://did:plc:a3vq3hjlkz2nbf67bpv5z6qs/town.delve.feed.generator/welcome-desk&limit=5'), env);
  assert.equal(sk.status, 200); assert.equal((await sk.json()).feed.length, 2);
  assert.equal((await worker.fetch(new Request('https://miniphim.minomobi.com/xrpc/town.delve.feed.getFeedSkeleton?feed=nonsense'), env)).status, 400);
  _setNet(fakeNet);
}

console.log('miniphim bots selftest: the fence, facets, own repo only, 100-write rail, waiting, profile with bot label, session reuse, private state, errors per tick, status, feeds (DID doc, describe, welcome desk, skeleton paging)');
