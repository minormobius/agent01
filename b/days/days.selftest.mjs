// days.selftest.mjs — node b/days/days.selftest.mjs
// The calendar must put every record on the right square, count streaks the way
// GitHub does, and say who someone was on a given day. The reader must count
// every key, keep only posts, and never mistake a like for a post.
import { yearGrids, levels, summary, cumulative, handleHistory, neighbours, countFor, addDays, weekday, daysBetween } from './calendar.js';
import { tidTime, tidAt, plausible, createIndexer } from './repoindex.js';
import { loadModel, tokenize, embed, embedAll, scoreAll, topK, normalize, preTokenize } from './embed.js';
import { buildIndex, search, parse, words, expandPrefix } from './search.js';
import * as BG from './bingo.js';
import * as EN from './engage.js';
import { readFileSync } from 'node:fs';

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

// ── semantic: the tokenizer must be the real one, token for token ──────────
const here = new URL('.', import.meta.url).pathname;
const binBuf = readFileSync(here + 'model/potion-base-8M.bin');
const model = loadModel(binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.length), readFileSync(here + 'model/potion-base-8M.vocab.txt', 'utf8'));
const FX = JSON.parse(readFileSync(here + 'model/wordpiece.fixture.json', 'utf8'));
ok(model.n === 29528 && model.dim === 256, 'model shape 29528 × 256');
let tokBad = [];
for (const c of FX.cases) { const got = tokenize(model, c.text); if (got.length !== c.ids.length || got.some((x, i) => x !== c.ids[i])) tokBad.push(c.text.slice(0, 30)); }
ok(tokBad.length === 0, `tokenizer matches HF tokenizers on all ${FX.cases.length} tricky cases${tokBad.length ? ': ' + tokBad.join(' | ') : ''}`);
let worstCos = 1;
for (const e of FX.embeddings) {
  const v = embed(model, e.text);
  let d = 0, na = 0, nb = 0;
  for (let k = 0; k < 256; k++) { d += v[k] * e.vec[k]; na += v[k] * v[k]; nb += e.vec[k] * e.vec[k]; }
  if (!na && !nb) continue;
  worstCos = Math.min(worstCos, d / Math.sqrt(na * nb));
}
ok(worstCos > 0.999, `embeddings match python model2vec (worst cosine ${worstCos.toFixed(5)})`);
ok(embed(model, '').every((x) => x === 0) && embed(model, '🍞🍞').every((x) => x === 0), 'an empty or all-unknown text embeds to zeros (as model2vec)');
ok(normalize('Straße ÀÉ') === 'straße ae', 'normalizer: lowercase + strip accents');
ok(preTokenize("a,b c$d").join('|') === 'a|,|b|c|$|d', 'pre-tokenizer isolates ASCII symbols too');

const docs = ['I baked sourdough bread today', 'the oven is broken', 'thinking about four dimensional geometry', 'my rust code compiles', 'bread and butter'];
const idxE = await embedAll(model, docs);
const qv = embed(model, 'baking bread at home');
const scores = scoreAll(idxE, qv);
const order = Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a]);
ok(JSON.stringify(topK(scores, 3)) === JSON.stringify(order.slice(0, 3)), 'topK equals a full sort');
ok(order[0] === 0 || order[0] === 4, `semantic: a bread query finds a bread post first (${docs[order[0]]})`);
ok(topK(new Float32Array([0.1, 0.9, 0.5]), 10).join() === '1,2,0', 'topK with k > n');

// ── keyword ──────────────────────────────────────────────────────────────────
const K = buildIndex([
  'Sourdough bread, again!',            // 0
  'bread and butter',                   // 1
  'the sour dough was too sour',        // 2
  "Don't panic. Café time",             // 3
  'BREADBOARD electronics',             // 4
  'a breakfast of bread',               // 5
]);
const ids = (q) => Array.from(search(K, q).ids).sort((a, b) => a - b).join();
ok(words("Don't Café") .join() === 'dont,cafe', 'words: apostrophes dropped, accents stripped');
ok(ids('bread ') === '0,1,5', 'a whole word (trailing space): exact term');
ok(ids('bread') === '0,1,4,5', 'the word being typed is a prefix (bread → breadboard)');
ok(ids('bread butter ') === '1', 'AND across words');
ok(ids('bread -butter ') === '0,5', 'exclusion');
ok(ids('"sour dough"') === '2', 'a phrase matches the words in order');
ok(ids('"dough sour"') === '', 'a phrase does not match out of order');
ok(ids('cafe ') === '3' && ids('café ') === '3' && ids('dont ') === '3', 'accents and apostrophes fold both ways');
ok(ids('nothinghere ') === '' && ids('') === '', 'no match, no query: nothing');
const QP = parse('alpha "beta gamma" -delta eps');
ok(QP.terms.join() === 'alpha' && QP.phrases[0].join() === 'beta,gamma' && QP.not.join() === 'delta' && QP.prefix === 'eps', 'query grammar');
ok(expandPrefix(K, 'bre').join() === 'bread,breadboard,breakfast', 'prefix expansion, most frequent first');
const bm = search(K, 'sour ');
ok(bm.ids[0] === 2, 'BM25: the post with the word twice ranks first');

// ── bingo ────────────────────────────────────────────────────────────────────
{
  const T = BG.terms('Bread. Anyway sour dough, https://example.com/x @someone.bsky.social is great');
  ok(T.has('sour dough') && !T.has('bread anyway'), 'bingo terms: bigrams never cross a sentence end');
  ok(![...T].some((t) => /example|someone|bsky/.test(t)), 'bingo terms: links and mentions are not words they say');
  ok(BG.logOdds(50, 1000, 10, 100000, 1000, 60 / 101000) > 3 && BG.logOdds(10, 1000, 1000, 100000, 1000, 1010 / 101000) < 1, 'log-odds: over-represented is high, ordinary is not');

  // a planted account: "sourdough" daily for a year, "lol" like everyone, one week of "barbecue"
  const bg = BG.parseBackground('#bingo-bg\tposts=100000\tfloor=5\n' + [['the', 40000], ['lol', 3000], ['bread', 300], ['sour dough', 20], ['barbecue', 100], ['yes', 6000], ['ok', 4000]].map((r) => r.join('\t')).join('\n'));
  ok(bg.n === 100000 && bg.df.get('sour dough') === 20 && bg.floor === 5, 'background parses');
  const day = 86400e3, t0 = Date.parse('2025-01-01');
  const posts = [];
  for (let d = 0; d < 300; d++) {
    posts.push({ t: t0 + d * day, text: d % 2 ? 'the sourdough is rising lol' : 'the sour dough starter again, yes it is' });
    posts.push({ t: t0 + d * day + 1000, text: 'the weather lol ok yes' });
  }
  for (let k = 0; k < 40; k++) posts.push({ t: t0 + 400 * day + k * 3600e3, text: 'barbecue barbecue all week' });
  posts.sort((a, b) => a.t - b.t);
  const df = BG.accountDf(posts, (t) => new Date(t).toISOString().slice(0, 10));
  ok(df.get('sourdough').days === 150, 'account df counts distinct days, in order');
  const S = BG.sayings(df, posts.length, bg).map((x) => x.term);
  ok(S.includes('sourdough') && S.includes('sour dough'), 'sayings: a daily habit is found (as a word and as a phrase)');
  ok(!S.includes('barbecue'), 'sayings: a one-week burst is not a habit');
  ok(!S.includes('lol') && !S.includes('the'), 'sayings: what everyone says is not theirs');
  ok(!S.some((t) => t === 'yes it' || t === 'it is'), 'sayings: glue bigrams are not phrases');
  ok(!S.includes('sour') && !S.includes('dough'), 'sayings: a phrase absorbs its own words');
  ok(BG.floors(2000).days < BG.floors(50000).days, 'floors scale with the size of the history');

  // spherical k-means finds planted directions
  const dim = 8, n = 300, X = new Float32Array(n * dim), R = BG.rng(5);
  for (let i = 0; i < n; i++) { const c = i % 3; for (let k = 0; k < dim; k++) X[i * dim + k] = (k === c ? 1 : 0) + (R() - 0.5) * 0.3; let nn = 0; for (let k = 0; k < dim; k++) nn += X[i * dim + k] ** 2; nn = Math.sqrt(nn); for (let k = 0; k < dim; k++) X[i * dim + k] /= nn; }
  const km = BG.kmeans(X, n, dim, 3, { seed: 2 });
  const pure = [0, 1, 2].every((c) => new Set([...km.assign].filter((_, i) => i % 3 === c)).size === 1) && new Set(km.assign).size === 3;
  ok(pure, 'k-means recovers three planted clusters exactly');
  // common-component removal takes out a direction every row shares
  const Y = new Float32Array(n * dim);
  for (let i = 0; i < n; i++) for (let k = 0; k < dim; k++) Y[i * dim + k] = X[i * dim + k] + (k === 7 ? 3 : 0);
  const cc = BG.commonComponents(Y, n, dim, 1, 1); cc.apply(Y, n);
  const mean7 = [...Array(n)].reduce((s, _, i) => s + Y[i * dim + 7], 0) / n;
  ok(Math.abs(mean7) < 0.05, 'SIF: the shared direction is removed');

  // topics on real vectors: three subjects under the same chatter, named from their own words
  const bg2 = BG.parseBackground('#bingo-bg\tposts=100000\tfloor=5\n' + [['the', 40000], ['really', 9000], ['today', 8000], ['lol', 3000], ['think', 7000], ['just', 12000]].map((r) => r.join('\t')).join('\n'));
  const themes = [['bread', 'yeast', 'oven', 'flour', 'dough', 'loaf', 'crust'], ['rocket', 'orbit', 'launch', 'satellite', 'booster', 'mission', 'payload'], ['kitten', 'purring', 'whiskers', 'litter', 'catnip', 'paws', 'meow']];
  const tp = [];
  const R2 = BG.rng(9);
  for (let i = 0; i < 1200; i++) {
    const th = themes[i % 3], pick = () => th[Math.floor(R2() * th.length)];
    tp.push({ t: t0 + i * day / 4, text: `lol i just really think the ${pick()} and the ${pick()} today, ${pick()} ${pick()}`, th: i % 3 });
  }
  const emb = BG.contentEmbedder(model, bg2);
  ok(emb.word('the').w < 0.01 && emb.word('catnip').w > 0.9, 'SIF weights: "the" nearly nothing, a rare word nearly one');
  const cix = BG.contentIndex(emb, tp);
  const tdf = BG.accountDf(tp, (t) => new Date(t).toISOString().slice(0, 10));
  const on = BG.onTopics(emb, cix, tp, (t) => new Date(t).toISOString().slice(0, 10), tdf, bg2, { K: 6, seed: 3, minDays: 2 });
  const purity = on.map((o) => { const c = [0, 0, 0]; for (const i of o.ids) c[tp[i].th]++; return Math.max(...c) / o.ids.length; });
  ok(on.length >= 3 && purity.every((p) => p > 0.9), `topics: every cluster is one subject (purity ${purity.map((p) => p.toFixed(2)).join(',')})`);
  ok(on.every((o) => themes.flat().includes(o.term)), `topics are named with a subject word, never the chatter (${on.map((o) => o.term).join(',')})`);
  ok(new Set(on.map((o) => themes.findIndex((th) => th.includes(o.term)))).size === 3, 'all three subjects are found');
  ok(on.every((o) => o.ids[0] === o.medoid), 'the example is the post nearest the centre');

  // the deal
  const says = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron'.split(' ').map((w, k) => ({ kind: 'says', term: w, score: 100 - k }));
  const ons = 'sea sky stone tree fire wind rain snow moon star leaf root'.split(' ').map((w) => ({ kind: 'on', term: w, alts: [], ids: [], centroid: [] }));
  const c1 = BG.deal(says, ons, { seed: 1 }), c1b = BG.deal(says, ons, { seed: 1 }), c2 = BG.deal(says, ons, { seed: 2 });
  ok(c1.length === 25 && c1[12].centre && c1[12].term === 'alpha', 'the card: 25 squares, the surest saying in the free centre');
  ok(c1.map((c) => c.term).join() === c1b.map((c) => c.term).join() && c1.map((c) => c.term).join() !== c2.map((c) => c.term).join(), 'the card: the same seed deals the same card, another seed another');
  ok(new Set(c1.map((c) => c.term)).size === 25, 'the card: no square twice');
  ok(c1.filter((c) => c.kind === 'on').length === 12, 'the card: half topics, half sayings');
  const clash = BG.deal([{ kind: 'says', term: 'bskybc' }, ...says], [{ kind: 'on', term: 'bsky', alts: ['book'], ids: [] }], { seed: 1 });
  ok(clash.some((c) => c.term === 'book') && !clash.some((c) => c.term === 'bsky'), 'a topic never wears a name inside a saying; it takes its next name');
  const thin = BG.deal(says.slice(0, 4), ons.slice(0, 2), { seed: 1 });
  ok(thin.length === 25 && thin.filter((c) => c.kind === 'free').length === 19, 'a thin history pads with honest blanks');
  const L = BG.lines(Array.from({ length: 25 }, (_, i) => i % 5 === 2 || i === 0 || i === 6 || i === 18 || i === 24));
  ok(L.some((l) => l.kind === 'col' && l.i === 2) && L.some((l) => l.kind === 'diag' && l.i === 0) && L.length === 2, 'lines: a column and a diagonal');

  // the shipped background: aggregate counts only, and only for terms 5+ authors used
  const head = readFileSync(here + 'bingo-bg.txt', 'utf8').split('\n', 1)[0];
  ok(/posts=\d{5,}/.test(head) && /minAuthors=([5-9]|\d\d)\//.test(head), 'the background states its sample size and its author floor (≥ 5)');
}

// ── top posts ────────────────────────────────────────────────────────────────
{
  const E = EN.emptyCounts(6);
  EN.put(E, 0, { likeCount: 5, repostCount: 1, replyCount: 0, quoteCount: 0 });
  EN.put(E, 1, { likeCount: 2, repostCount: 0, replyCount: 3, quoteCount: -1 });
  EN.put(E, 2, { likeCount: 6, repostCount: 0, replyCount: 0, quoteCount: 0 });
  EN.put(E, 3, { likeCount: 1, repostCount: 0, replyCount: 0, quoteCount: 2 });
  EN.miss(E, 4);
  ok(E.quote[1] === 0 && EN.value(E, 1) === 5, 'a quoteCount of -1 (the AppView sends them) is 0, not 4,294,967,295');
  ok(E.done === 5 && EN.batches(E).flat().join() === '5', 'only unfetched posts are fetched again');
  ok(EN.ranked(E).join() === '2,0,1,3', 'ranked by every interaction; a tie goes to the newer post');
  ok(EN.ranked(E, 'quote')[0] === 3 && EN.ranked(E, 'reply')[0] === 1, 'ranked by one kind');
  ok(!EN.ranked(E).includes(4) && !EN.ranked(E).includes(5), 'a post the AppView would not return is not ranked as a real zero');
  ok(EN.ranked(E, 'all', [1, 3, 4]).join() === '1,3', 'ranking within a search result');
  const posts = [0, 0, 1, 1, 2, 2].map((d) => ({ t: Date.parse('2025-03-0' + (d + 1)) }));
  const ds = EN.daySums(E, posts, (t) => new Date(t).toISOString().slice(0, 10));
  ok(ds.get('2025-03-01').hit === 11 && ds.get('2025-03-02').hit === 9 && !ds.has('2025-03-03'), 'interactions land on the day the post was made');
  const big = EN.emptyCounts(60);
  ok(EN.batches(big).length === 3 && EN.batches(big)[0][0] === 59, 'batches of 25, newest first');
  const back = EN.unpack(structuredClone(EN.pack(E)));
  ok(back.like[2] === 6 && back.seen[4] === 2 && back.done === 5, 'counts survive the cache round trip');
}

console.log(fails ? `✗ ${fails} failed, ${passes} passed` : `✓ days selftest: ${passes} passed`);
process.exit(fails ? 1 : 0);
