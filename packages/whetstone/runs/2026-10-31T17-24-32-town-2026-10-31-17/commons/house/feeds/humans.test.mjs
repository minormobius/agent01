// node house/feeds/humans.test.mjs : no network; a fake store and a fake PDS.
import assert from 'node:assert/strict';
import skeleton, { refresh, verdict, sortAt, NAMED } from './humans.mjs';

const m = new Map();
const store = { get: async (k) => m.get(k), put: async (k, v) => m.set(k, v), delete: async (k) => m.delete(k),
  list: async (p) => [...m].filter(([k]) => k.startsWith(p)) };
const named = Object.keys(NAMED)[0];
const now = '2026-10-13T23:00:00Z';
const P = (d, n) => `at://${d}/town.delve.feed.post/${n}`;
let rev = { 'did:plc:hum': 'r1', 'did:plc:bot': 'r1', 'did:plc:nam': 'r1', [named]: 'r1', 'did:plc:liar': 'r1' };
const profiles = {
  'did:plc:hum': { displayName: 'Ann' },
  'did:plc:bot': { displayName: 'B', labels: { values: [{ val: 'bot' }] } },
  'did:plc:nam': { displayName: 'Gemini (bot)' },
  [named]: { displayName: 'unlabelled agent' },
  'did:plc:liar': { displayName: 'Lia' },
};
const posts = {
  'did:plc:hum': [{ uri: P('did:plc:hum', 2), value: { createdAt: '2026-10-13T22:00:00Z' } }, { uri: P('did:plc:hum', 1), value: { createdAt: '2026-10-13T20:00:00Z' } },
    { uri: P('did:plc:hum', 0), value: { createdAt: '2026-09-01T00:00:00Z' } }],
  'did:plc:bot': [{ uri: P('did:plc:bot', 1), value: { createdAt: '2026-10-13T22:30:00Z' } }],
  'did:plc:nam': [{ uri: P('did:plc:nam', 1), value: { createdAt: '2026-10-13T22:30:00Z' } }],
  [named]: [{ uri: P(named, 1), value: { createdAt: '2026-10-13T22:30:00Z' } }],
  'did:plc:liar': [{ uri: P('did:plc:liar', 1), value: { createdAt: '2099-01-01T00:00:00Z' } }],
};
let calls = 0;
const fake = async (url) => {
  calls++;
  const u = new URL(url), q = u.searchParams;
  const ok = (j) => ({ ok: true, status: 200, json: async () => j });
  if (u.pathname.endsWith('listRepos')) return ok({ repos: Object.entries(rev).map(([did, r]) => ({ did, rev: r, active: true })) });
  if (u.pathname.endsWith('getRecord')) return ok({ value: profiles[q.get('repo')] });
  if (u.pathname.endsWith('listRecords')) return ok({ records: posts[q.get('repo')] || [] });
  return { ok: false, status: 500 };
};

assert.equal(verdict('did:plc:x', { labels: { values: [{ val: 'bot' }] } }), 'label');
assert.equal(verdict(named, {}), 'named');
assert.equal(verdict('did:plc:x', { displayName: 'x (Bot)' }), 'name');
assert.equal(verdict('did:plc:x', { displayName: 'I build bots' }), null);
assert.equal(sortAt('2099-01-01T00:00:00Z', now), Date.parse(now));

const r1 = await refresh({ store, now, fetch: fake });
assert.deepEqual([r1.repos, r1.read, r1.out], [5, 5, 3]);
const f1 = await skeleton({ store, limit: 50 });
// the liar's 2099 post is clamped to when we first saw it (23:00), the human's old post is past 7 days
assert.deepEqual(f1.feed.map((x) => x.post), [P('did:plc:liar', 1), P('did:plc:hum', 2), P('did:plc:hum', 1)]);

// nothing changed: one call (listRepos), nobody re-read
calls = 0;
const r2 = await refresh({ store, now: '2026-10-13T23:05:00Z', fetch: fake });
assert.equal(calls, 1); assert.equal(r2.due, 0);

// the human writes again: only they are re-read, and their old posts keep their first-seen time
posts['did:plc:hum'].unshift({ uri: P('did:plc:hum', 3), value: { createdAt: '2026-10-13T23:09:00Z' } });
rev['did:plc:hum'] = 'r2';
calls = 0;
const r3 = await refresh({ store, now: '2026-10-13T23:10:00Z', fetch: fake });
assert.equal(r3.due, 1); assert.equal(calls, 3);
assert.equal(m.get('acct:did:plc:liar').posts[0].s, now);
const p1 = await skeleton({ store, limit: 2 });
assert.deepEqual(p1.feed.map((x) => x.post), [P('did:plc:hum', 3), P('did:plc:liar', 1)]); assert.equal(p1.cursor, '2');
const p2 = await skeleton({ store, limit: 2, cursor: p1.cursor });
assert.deepEqual(p2.feed.map((x) => x.post), [P('did:plc:hum', 2), P('did:plc:hum', 1)]); assert.equal(p2.cursor, undefined);

// a human who adds the bot label leaves at the next round
profiles['did:plc:hum'].labels = { values: [{ val: 'bot' }] }; rev['did:plc:hum'] = 'r3';
await refresh({ store, now: '2026-10-13T23:15:00Z', fetch: fake });
assert.deepEqual((await skeleton({ store, limit: 50 })).feed.map((x) => x.post), [P('did:plc:liar', 1)]);

// a failed read leaves the rev unstored, so it's tried again
rev['did:plc:liar'] = 'r9';
const broken = async (url) => (url.includes('getRecord') ? { ok: false, status: 502 } : fake(url));
await refresh({ store, now: '2026-10-13T23:20:00Z', fetch: broken });
assert.equal(m.get('acct:did:plc:liar').rev, 'r1');
console.log('humans: ok');
