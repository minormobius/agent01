// social.selftest.mjs — the PURE half of the friend wire. Run: node farm/test/social.selftest.mjs
import { tendCounts, unclaimedGifts, tendsToday } from '../js/social.js';

let n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.error('✗', msg); process.exit(1); } };

const ME = 'did:plc:me';
const T0 = Date.parse('2026-08-01T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const plants = [
  { id: 'p0', at: T0, seedId: 'sage' },
  { id: 'p1', at: T0 + 1000, seedId: 'rue' },
];

// ── tendCounts: distinct friends, my plants only, after planting only ──
const tends = [
  { did: 'did:plc:alice', records: [
    { value: { subject: ME, plantId: 'p0', createdAt: iso(T0 + 5000) } },
    { value: { subject: ME, plantId: 'p0', createdAt: iso(T0 + 6000) } },   // same friend twice → counts once
    { value: { subject: ME, plantId: 'p1', createdAt: iso(T0 + 7000) } },
  ] },
  { did: 'did:plc:bob', records: [
    { value: { subject: ME, plantId: 'p0', createdAt: iso(T0 + 8000) } },
    { value: { subject: 'did:plc:other', plantId: 'p0', createdAt: iso(T0 + 8000) } },  // not about me
    { value: { subject: ME, plantId: 'p0', createdAt: iso(T0 - 5000) } },   // BEFORE planting → a past life, ignored
    { value: { subject: ME, plantId: 'pX', createdAt: iso(T0 + 8000) } },   // no such plant
  ] },
];
const counts = tendCounts(ME, plants, tends);
ok(counts.p0 === 2, 'p0 tended by two distinct friends');
ok(counts.p1 === 1, 'p1 tended by one');
ok(!('pX' in counts), 'unknown plant ignored');
ok(Object.keys(tendCounts(ME, plants, [])).length === 0, 'no tends → no counts');

// ── unclaimedGifts: addressed to me, minus the claim ledger ──
const gifts = [
  { did: 'did:plc:alice', records: [
    { uri: 'at://a/g/1', value: { to: ME, item: { kind: 'seed', id: 'barley', qty: 2 }, createdAt: iso(T0 + 1) } },
    { uri: 'at://a/g/2', value: { to: 'did:plc:other', item: { kind: 'seed', id: 'rue', qty: 1 }, createdAt: iso(T0 + 2) } },
    { uri: 'at://a/g/3', value: { to: ME, item: { kind: 'coins', qty: 5 }, createdAt: iso(T0 + 3) } },
    { uri: 'at://a/g/4', value: { to: ME, createdAt: iso(T0 + 4) } },       // malformed: no item
  ] },
];
const un = unclaimedGifts(ME, ['at://a/g/3'], gifts);
ok(un.length === 1 && un[0].uri === 'at://a/g/1', 'one gift unclaimed, addressed to me, well-formed');
ok(unclaimedGifts(ME, [], gifts).length === 2, 'claim ledger is the only filter beyond addressing');

// ── tendsToday: my courtesy budget per friend, midnight UTC ──
const mine = [
  { value: { subject: 'did:plc:carol', createdAt: '2026-08-01T00:10:00Z' } },
  { value: { subject: 'did:plc:carol', createdAt: '2026-08-01T11:00:00Z' } },
  { value: { subject: 'did:plc:carol', createdAt: '2026-07-31T23:59:00Z' } },   // yesterday
  { value: { subject: 'did:plc:dave', createdAt: '2026-08-01T11:00:00Z' } },
];
ok(tendsToday(mine, 'did:plc:carol', T0) === 2, 'two tends today for carol');
ok(tendsToday(mine, 'did:plc:dave', T0) === 1, 'one for dave');
ok(tendsToday(mine, 'did:plc:erin', T0) === 0, 'none for erin');

console.log(`social.selftest: ${n} assertions passed`);
