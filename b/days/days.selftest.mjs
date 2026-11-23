// days.selftest.mjs — node b/days/days.selftest.mjs
// The calendar must put every record on the right square, count streaks the way
// GitHub does, and say who someone was on a given day. The reader must count
// every key, keep only posts, and never mistake a like for a post.
import { yearGrids, levels, summary, cumulative, handleHistory, neighbours, countFor, addDays, weekday, daysBetween } from './calendar.js';
import { tidTime, tidAt, plausible, createIndexer } from './repoindex.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.error('✗ ' + m); } };

// ── TIDs ─────────────────────────────────────────────────────────────────────
ok(new Date(tidTime('3n27roebvf223')).toISOString().startsWith('2026-11-13T20:02'), 'a real TID decodes to its time');
for (const t of [Date.parse('2023-04-13T18:47:34.226Z'), Date.parse('2026-11-23T00:00:00Z'), 1700000000123]) {
  ok(tidTime(tidAt(t)) === t, `tidAt round-trips ${new Date(t).toISOString()}`);
}
ok(tidAt(1000) < tidAt(2000) && tidAt(Date.parse('2024-01-01')) < tidAt(Date.parse('2025-01-01')), 'tidAt sorts as time does (the cursor depends on it)');
ok(Number.isNaN(tidTime('self')) && Number.isNaN(tidTime('3n27roebvf22')) && Number.isNaN(tidTime('zzzzzzzzzzzzz')), 'non-TIDs are NaN');
ok(!plausible(Date.parse('2001-01-01')) && plausible(Date.parse('2024-06-01')), 'implausible times are rejected');

// ── dates ────────────────────────────────────────────────────────────────────
ok(addDays('2024-02-28', 1) === '2024-02-29' && addDays('2024-02-29', 1) === '2024-03-01', 'leap day');
ok(addDays('2024-12-31', 1) === '2025-01-01', 'year boundary');
ok(addDays('2025-03-09', 1) === '2025-03-10' && addDays('2025-11-02', 1) === '2025-11-03', 'DST days step by one');
ok(weekday('2026-11-22') === 0 && weekday('2026-11-23') === 1, 'weekday: 22 Nov 2026 is a Sunday');
ok(daysBetween('2023-04-13', '2023-04-14') === 1 && daysBetween('2024-01-01', '2025-01-01') === 366, 'daysBetween');

// ── the grid ─────────────────────────────────────────────────────────────────
const L = 'app.bsky.feed.like', P = 'app.bsky.feed.post', F = 'app.bsky.graph.follow';
const days = new Map([
  ['2025-12-30', { [P]: 2, [L]: 10 }],
  ['2025-12-31', { [P]: 1 }],
  ['2026-01-01', { [L]: 4, [F]: 1 }],
  ['2026-01-02', { [P]: 5 }],
  ['2026-01-05', { [P]: 1, [L]: 1 }],
]);
const G = yearGrids(days, '2025-12-30', '2026-01-05');
ok(G.length === 2 && G[0].year === 2026 && G[1].year === 2025, 'one grid per year, newest first');
ok(G[1].cells.length === 2 && G[0].cells.length === 5, 'only days in range get a cell (before the account existed is not a quiet day)');
const jan1 = G[0].cells.find((c) => c.day === '2026-01-01');
ok(jan1.row === 4 && jan1.col === 0, '1 Jan 2026 is a Thursday, in week 0');
ok(G[0].cells.find((c) => c.day === '2026-01-04').row === 0 && G[0].cells.find((c) => c.day === '2026-01-04').col === 1, 'Sunday starts a new column');
ok(jan1.n === 5, 'everything counts every collection');
ok(yearGrids(days, '2025-12-30', '2026-01-05', 'posts')[0].cells.find((c) => c.day === '2026-01-01').n === 0, 'a metric filters collections');
ok(G[0].months[0].label === 'Jan' && G[0].months[0].col === 0, 'month labels sit on their first week');
const full = yearGrids(new Map(), '2024-01-01', '2024-12-31')[0];
ok(full.cells.length === 366 && full.weeks === 53, '2024: 366 cells in 53 weeks');
ok(countFor(undefined) === 0 && countFor({ [P]: 3 }, 'likes') === 0, 'countFor on nothing');

// ── levels ───────────────────────────────────────────────────────────────────
const lv = levels(new Map(Array.from({ length: 100 }, (_, i) => [`d${i}`, { [P]: i + 1 }])));
ok(lv.level(0) === 0 && lv.level(1) === 1 && lv.level(100) === 4, 'levels span 0–4');
ok(lv.level(lv.cuts[0]) === 1 && lv.level(lv.cuts[0] + 1) === 2, 'quartile cuts');
const viral = levels(new Map([['a', { [P]: 1 }], ['b', { [P]: 2 }], ['c', { [P]: 3 }], ['d', { [P]: 10000 }]]));
ok(viral.level(1) === 1 && viral.level(3) === 3 && viral.level(10000) === 4, 'one viral day does not wash the rest out (a linear scale would put 3 at level 1)');
ok([1, 2, 3, 4, 5].every((k) => levels(new Map(Array.from({ length: k }, (_, i) => [`d${i}`, { [P]: i + 1 }]))).level(k) === 4), 'the busiest day is always the darkest square, however few active days');

// ── summary and streaks ──────────────────────────────────────────────────────
const S = summary(days, '2025-12-30', '2026-01-05', 'all', '2026-01-05');
ok(S.total === 25 && S.active === 5, 'total and active days');
ok(S.busiest.day === '2025-12-30' && S.busiest.n === 12, 'busiest day');
ok(S.longest === 4 && S.longestFrom === '2025-12-30', 'longest streak, across a year boundary');
ok(S.current === 1, 'current streak counts today');
ok(summary(days, '2025-12-30', '2026-01-06', 'all', '2026-01-06').current === 1, 'a streak ending yesterday is still current');
ok(summary(days, '2025-12-30', '2026-01-08', 'all', '2026-01-08').current === 0, 'two quiet days end it');

// ── on that day ──────────────────────────────────────────────────────────────
const C = cumulative(days);
ok(C.asOf('2026-01-01')[P] === 3 && C.asOf('2026-01-01')[L] === 14 && C.asOf('2026-01-01')[F] === 1, 'cumulative counts at the end of a day');
ok(C.asOf('2026-01-03')[P] === 8, 'a quiet day carries the last totals forward');
ok(Object.keys(C.asOf('2025-01-01')).length === 0, 'before the first record: nothing');
const N = neighbours(days, '2026-01-02');
ok(N.prev === '2026-01-01' && N.next === '2026-01-05', 'prev/next active day');
ok(neighbours(days, '2026-01-02', 'follows').prev === '2026-01-01' && neighbours(days, '2026-01-02', 'follows').next === null, 'neighbours respect the metric');

const H = handleHistory([
  { createdAt: '2023-04-13T18:46:07Z', operation: { alsoKnownAs: ['at://first.bsky.social'] } },
  { createdAt: '2023-05-07T04:45:01Z', operation: { alsoKnownAs: ['at://second.example'] } },
  { createdAt: '2023-06-01T00:00:00Z', nullified: true, operation: { alsoKnownAs: ['at://never.example'] } },
  { createdAt: '2023-11-17T00:00:00Z', operation: { alsoKnownAs: ['at://second.example'] } },     // key rotation, same handle
  { createdAt: '2024-09-18T17:40:25Z', operation: { alsoKnownAs: ['at://third.example'] } },
  { createdAt: '2022-12-01T00:00:00Z', operation: { handle: 'legacy.bsky.social' } },             // oldest op format
]);
ok(H.changes.map((c) => c.handle).join() === 'legacy.bsky.social,first.bsky.social,second.example,third.example', 'handle history: order, legacy format, no nullified, no repeats');
ok(H.at(Date.parse('2023-05-01')) === 'first.bsky.social' && H.at(Date.parse('2024-01-01')) === 'second.example' && H.at(Date.parse('2026-01-01')) === 'third.example', 'handle on a day');
ok(H.at(Date.parse('2020-01-01')) === null, 'before the account: no handle');

// ── the reader, on a hand-built CAR ──────────────────────────────────────────
// DAG-CBOR, minimal: enough for an MST node and two records.
const enc = (v) => {
  const out = [];
  const head = (major, n) => {
    if (n < 24) out.push((major << 5) | n);
    else if (n < 256) out.push((major << 5) | 24, n);
    else if (n < 65536) out.push((major << 5) | 25, n >> 8, n & 255);
    else out.push((major << 5) | 26, (n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255);
  };
  const go = (x) => {
    if (x === null) out.push(0xf6);
    else if (typeof x === 'number') head(0, x);
    else if (typeof x === 'string') { const b = new TextEncoder().encode(x); head(3, b.length); out.push(...b); }
    else if (x instanceof Uint8Array) { head(2, x.length); out.push(...x); }
    else if (Array.isArray(x)) { head(4, x.length); x.forEach(go); }
    else if (x && x.$cid) { out.push(0xd8, 42); head(2, x.$cid.length + 1); out.push(0, ...x.$cid); }
    else { const ks = Object.keys(x); head(5, ks.length); for (const k of ks) { go(k); go(x[k]); } }
  };
  go(v);
  return Uint8Array.from(out);
};
const cid = (n) => Uint8Array.from([1, 0x71, 0x12, 0x20, ...Array(31).fill(0), n]);   // CIDv1 dag-cbor sha256
const varint = (n) => { const o = []; while (n >= 128) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
const block = (c, body) => Uint8Array.from([...varint(c.length + body.length), ...c, ...body]);
const tPost = tidAt(Date.parse('2026-01-02T10:00:00Z')), tLike = tidAt(Date.parse('2026-01-02T11:00:00Z')), tLike2 = tidAt(Date.parse('2026-01-03T09:00:00Z'));
const mst = { e: [
  { k: new TextEncoder().encode(`app.bsky.feed.like/${tLike}`), p: 0, t: null, v: { $cid: cid(2) } },
  { k: new TextEncoder().encode(tLike2), p: 19, t: null, v: { $cid: cid(3) } },                 // prefix-compressed
  { k: new TextEncoder().encode(`app.bsky.feed.post/${tPost}`), p: 0, t: null, v: { $cid: cid(1) } },
  { k: new TextEncoder().encode('app.bsky.actor.profile/self'), p: 0, t: null, v: { $cid: cid(4) } },
], l: null };
const post = { $type: 'app.bsky.feed.post', text: 'hello days', createdAt: '2026-01-02T10:00:00Z' };
// the trap palm documents: a like's subject contains app.bsky.feed.post
const like = { $type: 'app.bsky.feed.like', subject: { uri: 'at://did:plc:x/app.bsky.feed.post/3abc', cid: 'bafy' }, createdAt: '2026-01-02T11:00:00Z' };
const header = enc({ version: 1, roots: [] });
const car = Uint8Array.from([...varint(header.length), ...header,
  ...block(cid(9), enc(mst)), ...block(cid(1), enc(post)), ...block(cid(2), enc(like)), ...block(cid(3), enc(like))]);
const utcDay = (t) => new Date(t).toISOString().slice(0, 10);
const one = (() => { const ix = createIndexer({ dayOf: utcDay }); ix.push(car); return ix.finish(); })();
ok(one.days.get('2026-01-02')?.[P] === 1 && one.days.get('2026-01-02')?.[L] === 1 && one.days.get('2026-01-03')?.[L] === 1, 'every key counted into its day (including a prefix-compressed one)');
ok(one.undated['app.bsky.actor.profile'] === 1, "a non-TID key ('self') is counted as undated, not dropped");
ok(one.posts.length === 1 && one.posts[0].text === 'hello days' && one.posts[0].rkey === tPost, 'the post is kept, joined to its key');
ok(one.posts.every((p) => p.text !== null), 'the likes (whose subject names app.bsky.feed.post) are not mistaken for posts');
// chunk boundaries must not matter
const chunked = (() => { const ix = createIndexer({ dayOf: utcDay }); for (let i = 0; i < car.length; i += 7) ix.push(car.subarray(i, i + 7)); return ix.finish(); })();
ok(JSON.stringify([...chunked.days]) === JSON.stringify([...one.days]) && chunked.posts[0].text === 'hello days', 'any chunking gives the same index');

console.log(fails ? `✗ ${fails} failed, ${passes} passed` : `✓ days selftest: ${passes} passed`);
process.exit(fails ? 1 : 0);
