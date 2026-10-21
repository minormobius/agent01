// node house/feeds/human-thread.test.mjs : no network; a fake store and a fake PDS.
import assert from 'node:assert/strict';
import skeleton, { refresh, verdict, NAMED } from './human-thread.mjs';
import { NAMED as HUMANS_NAMED } from './humans.mjs';

// one rule for "person" across both feeds
assert.deepEqual(NAMED, HUMANS_NAMED);

const m = new Map();
const store = { get: async (k) => m.get(k), put: async (k, v) => m.set(k, v), delete: async (k) => m.delete(k),
  list: async (p) => [...m].filter(([k]) => k.startsWith(p)) };
const now = '2026-10-14T02:00:00Z';
const P = (d, n) => `at://${d}/town.delve.feed.post/${n}`;
const A = 'did:plc:ann', B = 'did:plc:bea', BOT = 'did:plc:bot', OFF = 'did:plc:offpds';
const rev = { [A]: 'r1', [B]: 'r1', [BOT]: 'r1' };
const profiles = { [A]: { displayName: 'Ann' }, [B]: { displayName: 'Bea' }, [BOT]: { labels: { values: [{ val: 'bot' }] } } };
const rp = (parent, root, at) => ({ createdAt: at, reply: { parent: { uri: parent }, root: { uri: root } } });
const posts = {
  [A]: [
    { uri: P(A, 'top'), value: { createdAt: '2026-10-14T00:00:00Z' } },                         // top-level: out
    { uri: P(A, 'self'), value: rp(P(A, 'top'), P(A, 'top'), '2026-10-14T00:05:00Z') },          // own thread, to self: out
  ],
  [B]: [
    { uri: P(B, 'hh'), value: rp(P(A, 'top'), P(A, 'top'), '2026-10-14T01:00:00Z') },            // H->H root H: IN
    { uri: P(B, 'hm'), value: rp(P(BOT, 'x'), P(A, 'top'), '2026-10-14T01:01:00Z') },            // to a bot: out
    { uri: P(B, 'hhm'), value: rp(P(A, 'y'), P(BOT, 'root'), '2026-10-14T01:02:00Z') },          // under a bot's post: out
    { uri: P(B, 'off'), value: rp(P(OFF, 'z'), P(OFF, 'z'), '2026-10-14T01:03:00Z') },           // unknown account: out
    { uri: P(B, 'old'), value: rp(P(A, 'top'), P(A, 'top'), '2026-09-01T00:00:00Z') },           // past 7 days: out
    { uri: P(B, 'own'), value: rp(P(B, 'q'), P(A, 'top'), '2026-10-14T01:04:00Z') },             // to self, in Ann's thread: IN
  ],
  [BOT]: [{ uri: P(BOT, 'mh'), value: rp(P(A, 'top'), P(A, 'top'), '2026-10-14T01:05:00Z') }],    // bot replying: out
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

assert.equal(verdict('did:plc:x', { displayName: 'x (bot)' }), 'name');
const r1 = await refresh({ store, now, fetch: fake });
assert.deepEqual([r1.repos, r1.read, r1.out], [3, 3, 1]);
assert.equal(calls, 1 + 3 + 2); // the bot's posts are never fetched
const ids = async () => (await skeleton({ store, limit: 50 })).feed.map((x) => x.post);
assert.deepEqual(await ids(), [P(B, 'own'), P(B, 'hh')]);

// paging
const p1 = await skeleton({ store, limit: 1 });
assert.deepEqual([p1.feed[0].post, p1.cursor], [P(B, 'own'), '1']);
assert.equal((await skeleton({ store, limit: 1, cursor: '1' })).cursor, undefined);

// Ann takes the bot label: every thread she started or was replied to in leaves at the next round
profiles[A].labels = { values: [{ val: 'bot' }] }; rev[A] = 'r2';
await refresh({ store, now: '2026-10-14T02:05:00Z', fetch: fake });
assert.deepEqual(await ids(), []);

// she drops it again and comes back
delete profiles[A].labels; rev[A] = 'r3';
await refresh({ store, now: '2026-10-14T02:10:00Z', fetch: fake });
assert.deepEqual(await ids(), [P(B, 'own'), P(B, 'hh')]);

// an account named in code after its posts were stored (a deploy between rounds) is out at once
const named = Object.keys(NAMED)[0];
m.set(`acct:${named}`, { rev: 'r1', out: null, posts: [{ u: P(named, 'n'), c: '2026-10-14T01:30:00Z', s: now, p: A, r: A }] });
assert.deepEqual(await ids(), [P(B, 'own'), P(B, 'hh')]);

// quiet round: one call
calls = 0; await refresh({ store, now: '2026-10-14T02:15:00Z', fetch: fake }); assert.equal(calls, 1);

// a failed read leaves the rev unstored, so it's tried again
rev[B] = 'r9';
await refresh({ store, now: '2026-10-14T02:20:00Z', fetch: async (u) => (u.includes('listRecords') ? { ok: false, status: 502 } : fake(u)) });
assert.equal(m.get(`acct:${B}`).rev, 'r1');
console.log('human-thread: ok');
