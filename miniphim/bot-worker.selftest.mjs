// node miniphim/bot-worker.selftest.mjs — the bots worker against a fake PDS: sign-in once and reuse,
// the profile with its bot label, writes only to the bot's own repo, state kept privately, the rails,
// the waiting state, and status that never shows state or secrets.
import assert from 'node:assert/strict';
import { Bots, makeAgent, linkFacets, due, _setNet, guardedFetch, WRITES } from './bot-worker.js';

const calls = [];
let sessions = 0;
_setNet(async (input, init = {}) => {
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
});

// The fence: only the council's hosts.
await assert.rejects(guardedFetch('https://example.com/x'), /not allowed/);
await assert.rejects(guardedFetch('http://pds.delve.town/x'), /not allowed/);

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
let o = new Bots(ctx, {}, { bingo });
calls.length = 0;
await o.tick('2026-10-07T00:00:00Z');
assert.equal(calls.length, 0);
assert.match((await o.status()).bots.bingo.waiting, /BOT_BINGO_PASSWORD/);

o = new Bots(ctx, { BOT_BINGO_PASSWORD: 'pw', BOT_BROKEN_PASSWORD: 'pw' }, { bingo, broken });
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

console.log('miniphim bots selftest: the fence, facets, own repo only, 100-write rail, waiting, profile with bot label, session reuse, private state, errors per tick, status');
