// node house/feeds/welcome-desk.test.mjs : no network; a fake store.
import assert from 'node:assert/strict';
import skeleton, { sortAt } from './welcome-desk.mjs';

const m = new Map();
const store = { get: async (k) => m.get(k), put: async (k, v) => m.set(k, v), delete: async (k) => m.delete(k),
  list: async (p) => [...m].filter(([k]) => k.startsWith(p)) };
const U = (d) => `at://did:plc:${d}/town.delve.feed.post/1`;
const seen = '2026-10-08T21:00:00Z';
m.set('acct:a', { first: { uri: U('a'), at: '2026-10-01T00:00:00Z' }, checked: seen });
m.set('acct:b', { first: { uri: U('b'), at: '2026-10-06T00:00:00Z' }, checked: seen });
m.set('acct:liar', { first: { uri: U('liar'), at: '2099-01-01T00:00:00Z' }, checked: '2026-10-02T00:00:00Z' });
m.set('acct:nodate', { first: { uri: U('nodate'), at: null }, checked: '2026-10-03T00:00:00Z' });
m.set('acct:empty', { first: null, checked: seen });
m.set('accounts', { at: seen, dids: [] });

assert.equal(sortAt({ at: '2099-01-01T00:00:00Z' }, seen), Date.parse(seen));
assert.equal(sortAt({ at: '2026-10-01T00:00:00Z' }, seen), Date.parse('2026-10-01T00:00:00Z'));
assert.equal(sortAt({ at: 'garbage' }, seen), Date.parse(seen));

const all = await skeleton({ store, limit: 50 });
assert.deepEqual(all.feed.map((x) => x.post), [U('b'), U('nodate'), U('liar'), U('a')]);
assert.equal(all.cursor, undefined);

const p1 = await skeleton({ store, limit: 3 });
assert.equal(p1.feed.length, 3); assert.equal(p1.cursor, '3');
const p2 = await skeleton({ store, limit: 3, cursor: p1.cursor });
assert.deepEqual(p2.feed.map((x) => x.post), [U('a')]); assert.equal(p2.cursor, undefined);
console.log('welcome-desk: ok');
