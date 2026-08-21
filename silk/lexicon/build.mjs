// silk/lexicon/build.mjs — turn an ATProto repo CAR into the web's data file.
//
//   node silk/lexicon/build.mjs <handle-or-did> [--car path] [--k 12]
//
// Fetches (or reads) the repo, tokenises every post, works out the topic
// structure from the corpus itself, and writes data.json. There is no API key
// and no embedding service in here: the co-occurrence structure of the person's
// own posting is the only dictionary used.
//
// WHAT GOES IN THE OUTPUT, AND WHAT DOES NOT. Word types, their counts, their
// first and mean dates, and a topic assignment. NOT ONE SENTENCE OF POST TEXT.
// The chart is about a vocabulary, and a vocabulary is a bag of words — shipping
// the prose would be a different and much more exposing artefact for no gain.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readCar } from './car.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

// ─── tokenizer ──────────────────────────────────────────────────────────────
//
// The stopword list is rite/lexicon's, read from source so the two surfaces
// cannot drift. Three fixes on top of that tokenizer, each of which changed the
// answer materially on this corpus:
//
//   · STRIP URLS. Pasted bsky.app links put "bsky", "app" and "profile" into
//     the top ten. They are a link format, not vocabulary.
//   · NORMALISE U+2019. [a-z'] does not match a curly apostrophe, so every
//     phone-typed "don't" split into "don" + "t" — "don" ranked 7th.
//   · FOLD CONTRACTIONS onto their stems, so the stopword list gets to see the
//     `it` in `it's`. Without it the top of the list is clitics.

const lexSrc = readFileSync(join(ROOT, 'rite', 'lexicon', 'lexicons.js'), 'utf8');
const STOPWORDS = new Set(
  lexSrc.match(/STOPWORDS\s*=\s*new Set\(\s*`([\s\S]*?)`/)[1].split(/\s+/).filter(Boolean));

const IRREGULAR = { "can't": 'can', "won't": 'will', "shan't": 'shall', "ain't": 'be' };
const stem = (w) => IRREGULAR[w] || w.replace(/n't$/, '').replace(/'(s|m|re|ve|ll|d)$/, '');
const clean = (t) => t
  .replace(/https?:\/\/\S+/g, ' ')
  .replace(/\b[\w.-]+\.(?:com|net|org|social|app|io|xyz|bsky)\b\S*/gi, ' ')
  .replace(/[’ʼ]/g, "'");

export function tokenize(text) {
  const out = [];
  const re = /[a-z'][a-z']+/g;
  const lower = clean(text).toLowerCase();
  let m;
  while ((m = re.exec(lower)) !== null) {
    let w = m[0].replace(/^'+|'+$/g, '');
    if (w.includes("'")) w = stem(w);
    if (w.length < 3 || STOPWORDS.has(w)) continue;
    out.push(w);
  }
  return out;
}

// ─── fetch ──────────────────────────────────────────────────────────────────

async function resolve(handle) {
  if (handle.startsWith('did:')) return handle;
  const r = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  if (!r.ok) throw new Error(`resolveHandle ${r.status}`);
  return (await r.json()).did;
}

async function pdsFor(did) {
  const r = await fetch(`https://plc.directory/${did}`);
  if (!r.ok) throw new Error(`plc ${r.status}`);
  const doc = await r.json();
  const svc = (doc.service || []).find((s) => s.type === 'AtprotoPersonalDataServer');
  if (!svc) throw new Error('no PDS in DID document');
  return svc.serviceEndpoint;
}

// ─── linear algebra, such as it is ──────────────────────────────────────────

function topEigen(M, n, D) {
  const vecs = [];
  const vals = [];
  const tmp = new Float64Array(n);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let d = 0; d < D; d++) {
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = rnd() - 0.5;
    let lambda = 0;
    for (let it = 0; it < 60; it++) {
      tmp.fill(0);
      for (let i = 0; i < n; i++) {
        const row = i * n;
        let s = 0;
        for (let j = 0; j < n; j++) { const m = M[row + j]; if (m) s += m * v[j]; }
        tmp[i] = s;
      }
      for (const pv of vecs) {
        let dot = 0;
        for (let i = 0; i < n; i++) dot += tmp[i] * pv[i];
        for (let i = 0; i < n; i++) tmp[i] -= dot * pv[i];
      }
      let norm = 0;
      for (let i = 0; i < n; i++) norm += tmp[i] * tmp[i];
      norm = Math.sqrt(norm);
      if (norm < 1e-12) break;
      lambda = norm;
      for (let i = 0; i < n; i++) v[i] = tmp[i] / norm;
    }
    vecs.push(v);
    vals.push(lambda);
  }
  return { vecs, vals };
}

// ─── main ───────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const handle = argv.find((a) => !a.startsWith('--')) || 'minormobius.bsky.social';
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const K = +arg('k', 12);
const carPath = arg('car', join(HERE, '.cache', 'repo.car'));

const did = await resolve(handle);
if (!existsSync(carPath)) {
  const pds = await pdsFor(did);
  console.log(`fetching ${pds}/xrpc/com.atproto.sync.getRepo?did=${did}`);
  const r = await fetch(`${pds}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`);
  if (!r.ok) throw new Error(`getRepo ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dirname(carPath), { recursive: true });
  writeFileSync(carPath, buf);
  console.log(`  ${(buf.length / 1e6).toFixed(1)} MB → ${carPath}`);
}

console.log(`reading ${carPath}`);
const { records, blocks } = readCar(carPath, new Set(['app.bsky.feed.post']));
const posts = records
  .filter((r) => typeof r.text === 'string' && r.text.trim() && r.createdAt)
  .map((r) => ({ ws: tokenize(r.text), t: Date.parse(r.createdAt), root: r.reply?.root?.uri || null, isReply: !!r.reply }))
  .filter((p) => Number.isFinite(p.t))
  .sort((a, b) => a.t - b.t);
const withWords = posts.filter((p) => p.ws.length);
console.log(`${blocks.toLocaleString()} blocks → ${posts.length.toLocaleString()} posts`);

// ── sessions: the context unit ──────────────────────────────────────────────
//
// At ~6 content words a post, post-level co-occurrence is almost all zeros and
// ones — the first build of this produced a flat eigenvalue spectrum and
// k-means collapsed to two clusters. A session (a run of posts with no gap over
// 45 minutes, plus everything sharing a thread root) is the unit a topic lives
// in, and it is what makes the structure appear at all.
const SESSION_GAP = 45 * 60 * 1000;
const docs = [];
{
  const byRoot = new Map();
  let cur = null;
  let lastT = -Infinity;
  for (const p of withWords) {
    let target = p.root ? byRoot.get(p.root) : null;
    if (!target) {
      if (!cur || p.t - lastT > SESSION_GAP) { cur = []; docs.push(cur); }
      target = cur;
      if (p.root) byRoot.set(p.root, target);
    }
    target.push(...p.ws);
    lastT = p.t;
  }
}

// ── counts, dates ───────────────────────────────────────────────────────────
const freq = new Map();
const docFreq = new Map();
const first = new Map();
const sumT = new Map();
let tokens = 0;
const heaps = [];
const DAY = 86400000;
for (let i = 0; i < withWords.length; i++) {
  const p = withWords[i];
  const here = new Set();
  for (const w of p.ws) {
    tokens++;
    freq.set(w, (freq.get(w) || 0) + 1);
    if (!first.has(w)) first.set(w, p.t);
    sumT.set(w, (sumT.get(w) || 0) + p.t);
    if (!here.has(w)) { here.add(w); docFreq.set(w, (docFreq.get(w) || 0) + 1); }
  }
  if (i % 400 === 0 || i === withWords.length - 1) heaps.push([tokens, freq.size]);
}
const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
console.log(`${tokens.toLocaleString()} content tokens, ${freq.size.toLocaleString()} types`);

// ── PPMI + eigen + spherical k-means over the top V ─────────────────────────
const V = Math.min(900, ranked.length);
const vocab = ranked.slice(0, V).map(([w]) => w);
const idx = new Map(vocab.map((w, i) => [w, i]));
const n = vocab.length;

const C = new Float32Array(n * n);
const marg = new Float64Array(n);
let pairs = 0;
for (const doc of docs) {
  const ids = [...new Set(doc.map((w) => idx.get(w)).filter((i) => i !== undefined))];
  if (ids.length > 120) ids.length = 120;
  for (let a = 0; a < ids.length; a++) {
    for (let b = a + 1; b < ids.length; b++) {
      C[ids[a] * n + ids[b]] += 1;
      C[ids[b] * n + ids[a]] += 1;
      marg[ids[a]] += 1; marg[ids[b]] += 1; pairs += 2;
    }
  }
}

// Context-distribution smoothing, alpha = 0.75. Z = Σ marg^a is NOT optional:
// the first build used pairs^0.25 in its place, which is a constant factor, but
// inside a log that is an additive shift and PPMI clips at zero — so the wrong
// constant silently emptied the matrix. The tell was eigenvalues coming out
// non-monotone, which power iteration cannot produce on a real matrix.
const M = new Float32Array(n * n);
let Z = 0;
for (let k = 0; k < n; k++) Z += Math.pow(marg[k], 0.75);
for (let i = 0; i < n; i++) {
  for (let j = 0; j < n; j++) {
    const c = C[i * n + j];
    if (!c) continue;
    const pmi = Math.log((c / pairs) / ((marg[i] / pairs) * (Math.pow(marg[j], 0.75) / Z)));
    if (pmi > 0) M[i * n + j] = pmi;
  }
}

const DIM = 17;
const { vecs, vals } = topEigen(M, n, DIM);
// Drop component 1: the leading eigenvector of a PPMI matrix is the frequency
// axis. Keeping it made every "topic" a frequency band.
const SKIP = 1;
const DE = DIM - SKIP;
const emb = [];
for (let i = 0; i < n; i++) {
  const e = new Float64Array(DE);
  for (let d = SKIP; d < DIM; d++) e[d - SKIP] = vecs[d][i] * Math.sqrt(vals[d]);
  let nn = 0;
  for (let d = 0; d < DE; d++) nn += e[d] * e[d];
  nn = Math.sqrt(nn) || 1;
  for (let d = 0; d < DE; d++) e[d] /= nn;
  emb.push(e);
}

let seed = 99991;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const cent = [emb[Math.floor(rnd() * n)].slice()];
while (cent.length < K) {
  let best = 0, bestW = -1;
  for (let i = 0; i < n; i++) {
    let closest = -1;
    for (const c of cent) { let s = 0; for (let d = 0; d < DE; d++) s += c[d] * emb[i][d]; if (s > closest) closest = s; }
    const w = (1 - closest) * Math.log(1 + freq.get(vocab[i]));
    if (w > bestW) { bestW = w; best = i; }
  }
  cent.push(emb[best].slice());
}
const assign = new Int32Array(n);
for (let it = 0; it < 60; it++) {
  for (let i = 0; i < n; i++) {
    let bk = 0, bs = -2;
    for (let k = 0; k < K; k++) { let s = 0; for (let d = 0; d < DE; d++) s += cent[k][d] * emb[i][d]; if (s > bs) { bs = s; bk = k; } }
    assign[i] = bk;
  }
  const nc = Array.from({ length: K }, () => new Float64Array(DE));
  for (let i = 0; i < n; i++) {
    const w = Math.log(1 + freq.get(vocab[i]));
    for (let d = 0; d < DE; d++) nc[assign[i]][d] += emb[i][d] * w;
  }
  for (let k = 0; k < K; k++) {
    let nn = 0;
    for (let d = 0; d < DE; d++) nn += nc[k][d] * nc[k][d];
    nn = Math.sqrt(nn) || 1;
    for (let d = 0; d < DE; d++) cent[k][d] = nc[k][d] / nn;
  }
}

// ── every OTHER word gets a sector by the company it keeps ──────────────────
//
// 900 words carry the embedding; 39,000 do not. Rather than dump the tail into
// an "other" bin, each tail word votes: across the sessions it appears in, sum
// the sector membership of the embedded words it sits beside, and take the
// argmax. Cheap, and it means every type in the corpus has a home on the chart.
const sectorOf = new Map();
const tailVotes = new Map();
const sectorPrior = new Float64Array(K);
for (let i = 0; i < n; i++) sectorOf.set(vocab[i], assign[i]);
{
  const votes = tailVotes;
  const prior = new Float64Array(K);
  let priorTotal = 0;
  for (const doc of docs) {
    const tally = new Float64Array(K);
    let any = 0;
    for (const w of doc) { const s = sectorOf.get(w); if (s !== undefined) { tally[s] += 1; any++; } }
    if (!any) continue;
    for (let k = 0; k < K; k++) { prior[k] += tally[k]; priorTotal += tally[k]; }
    for (const w of new Set(doc)) {
      if (sectorOf.has(w)) continue;
      let v = votes.get(w);
      if (!v) { v = new Float64Array(K); votes.set(w, v); }
      for (let k = 0; k < K; k++) v[k] += tally[k] / any;
    }
  }
  // LIFT, NOT RAW COUNT. The general sector is by construction the one whose
  // words turn up everywhere, so on a raw vote it wins every tail word: the
  // first build put 37,829 of 39,554 types into it and the other eleven sectors
  // held only the 900 embedded words each. Dividing by the sector's own share
  // of all company asks the right question — not "who was this word next to"
  // but "who was it next to MORE THAN USUAL".
  for (let k = 0; k < K; k++) prior[k] = (prior[k] / priorTotal) || 1e-9;
  sectorPrior.set(prior);
  for (const [w, v] of votes) {
    let bk = 0, bs = -Infinity;
    for (let k = 0; k < K; k++) {
      const lift = v[k] / prior[k];
      if (lift > bs) { bs = lift; bk = k; }
    }
    sectorOf.set(w, bk);
  }
  // words that never shared a session with an embedded word: give them the
  // largest sector rather than inventing a thirteenth
  let big = 0;
  const mass = new Float64Array(K);
  for (const [w, c] of freq) { const s = sectorOf.get(w); if (s !== undefined) mass[s] += c; }
  for (let k = 1; k < K; k++) if (mass[k] > mass[big]) big = k;
  for (const [w] of freq) if (!sectorOf.has(w)) sectorOf.set(w, big);
}

// ── sector order around the circle, and labels ──────────────────────────────
//
// Adjacent sectors should be related, so the angular axis reads as a gradient
// rather than a shuffle. Greedy nearest-neighbour over centroid cosine, seeded
// at the largest sector — a 12-node TSP done properly would be prettier and
// would not change what anyone sees.
const cos = (a, b) => { let s = 0; for (let d = 0; d < DE; d++) s += cent[a][d] * cent[b][d]; return s; };
const sectorMass = new Float64Array(K);
const sectorTypes = new Int32Array(K);
for (const [w, c] of freq) { sectorMass[sectorOf.get(w)] += c; sectorTypes[sectorOf.get(w)]++; }

const order = [];
{
  let curK = 0;
  for (let k = 1; k < K; k++) if (sectorMass[k] > sectorMass[curK]) curK = k;
  const used = new Set([curK]);
  order.push(curK);
  while (order.length < K) {
    let best = -1, bs = -2;
    for (let k = 0; k < K; k++) {
      if (used.has(k)) continue;
      const s = cos(order[order.length - 1], k);
      if (s > bs) { bs = s; best = k; }
    }
    used.add(best);
    order.push(best);
  }
}

const labelFor = (k) => {
  const members = [];
  for (let i = 0; i < n; i++) {
    if (assign[i] !== k) continue;
    let s = 0;
    for (let d = 0; d < DE; d++) s += cent[k][d] * emb[i][d];
    members.push({ w: vocab[i], score: s * Math.log(1 + freq.get(vocab[i])) });
  }
  members.sort((a, b) => b.score - a.score);
  return members.slice(0, 6).map((m) => m.w);
};

// ── within-sector angular order ─────────────────────────────────────────────
//
// Inside a sector, order by similarity to the NEXT sector's centroid, so the
// boundary between two sectors is a blend rather than a seam.
// EVERY word needs a real position here, not just the embedded 900. The first
// build gave the 38,654 tail words a constant 0.5, which sorted them by their
// insertion order — which is frequency order — so angle became a function of
// frequency and each wedge collapsed into a single thin thread spiralling out.
//
// A tail word's position comes from the same votes that chose its wedge: how
// much more than usual does it keep company with the NEXT wedge along, relative
// to its own. Words with no votes at all get a hash, because we genuinely do
// not know and a stable arbitrary spread is more honest than a pile.
const hash01 = (str) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 8) / 0xffffff;
};
const withinScore = new Map();
for (let oi = 0; oi < K; oi++) {
  const k = order[oi];
  const nk = order[(oi + 1) % K];
  const nxt = cent[nk];
  for (const [w] of freq) {
    if (sectorOf.get(w) !== k) continue;
    const i = idx.get(w);
    if (i !== undefined) {
      let s = 0;
      for (let d = 0; d < DE; d++) s += nxt[d] * emb[i][d];
      withinScore.set(w, s);
      continue;
    }
    const v = tailVotes.get(w);
    if (v) {
      const own = v[k] / sectorPrior[k];
      const nex = v[nk] / sectorPrior[nk];
      const t = own + nex > 0 ? nex / (own + nex) : 0.5;
      // spread inside the band, deterministically, so ties do not stack
      withinScore.set(w, t - 0.5 + (hash01(w) - 0.5) * 0.22);
    } else {
      withinScore.set(w, hash01(w) - 0.5);
    }
  }
}

// ── emit ────────────────────────────────────────────────────────────────────
const t0 = withWords[0].t;
const tN = withWords[withWords.length - 1].t;
const day = (t) => Math.round((t - t0) / DAY);

const words = ranked.map(([w, c]) => ({
  w, c,
  d: docFreq.get(w),
  f: day(first.get(w)),
  m: day(sumT.get(w) / c),
  s: sectorOf.get(w),
  a: withinScore.get(w) ?? 0.5,
}));

// sort within each sector by the blend score so the client can lay them out by
// index alone
const bySector = Array.from({ length: K }, () => []);
for (const rec of words) bySector[rec.s].push(rec);
for (const list of bySector) list.sort((x, y) => x.a - y.a);
for (const list of bySector) list.forEach((rec, i) => { rec.i = i; rec.n = list.length; });

// monthly acquisition + volume
const months = new Map();
for (const p of withWords) {
  const key = new Date(p.t).toISOString().slice(0, 7);
  if (!months.has(key)) months.set(key, { posts: 0, tokens: 0, fresh: 0 });
  const m = months.get(key);
  m.posts++;
  m.tokens += p.ws.length;
}
for (const [w, t] of first) {
  const key = new Date(t).toISOString().slice(0, 7);
  if (months.has(key)) months.get(key).fresh++;
}

const out = {
  handle, did,
  built: new Date().toISOString().slice(0, 10),
  posts: posts.length,
  // 1,688 posts here are pure emoji, links or stopwords and contribute no
  // content token. They are still posts, so they count above — but the monthly
  // series is built from the ones that have a word in them, and conflating the
  // two makes the bars silently disagree with the total.
  postsWithWords: withWords.length,
  replies: posts.filter((p) => p.isReply).length,
  span: [new Date(t0).toISOString().slice(0, 10), new Date(tN).toISOString().slice(0, 10)],
  days: day(tN),
  tokens,
  types: freq.size,
  hapax: ranked.filter(([, c]) => c === 1).length,
  sessions: docs.length,
  K,
  order,
  // THE HUB IS NOT A TOPIC. One sector always comes out as the words that turn
  // up everywhere — few types, enormous mass, ~90 tokens per type against ~6
  // for every other sector. Giving it an angular wedge like the rest would
  // squeeze its 686 very frequent words into a thin dense smear at small
  // radius. It is the free zone of a real orb: the part with no capture spiral,
  // where the animal sits. The client lays it out as the hub disc.
  general: (() => {
    let best = 0, bs = -1;
    for (let k = 0; k < K; k++) {
      const ratio = sectorTypes[k] ? sectorMass[k] / sectorTypes[k] : 0;
      if (ratio > bs) { bs = ratio; best = k; }
    }
    return best;
  })(),
  sectors: order.map((k) => ({
    k,
    label: labelFor(k),
    mass: sectorMass[k],
    types: sectorTypes[k],
  })),
  heaps,
  months: [...months.entries()].sort().map(([k, v]) => [k, v.posts, v.tokens, v.fresh]),
  // columnar: one array per field, index-aligned
  cols: {
    w: words.map((r) => r.w),
    c: words.map((r) => r.c),
    d: words.map((r) => r.d),
    f: words.map((r) => r.f),
    m: words.map((r) => r.m),
    s: words.map((r) => r.s),
    i: words.map((r) => r.i),
  },
  sectorCounts: Array.from({ length: K }, (_, k) => bySector[k].length),
};

const path = join(HERE, 'data.json');
writeFileSync(path, JSON.stringify(out));
const kb = (readFileSync(path).length / 1024).toFixed(0);
console.log(`\nwrote ${path} (${kb} KB)`);
console.log(`sectors, in ring order:`);
for (const s of out.sectors) {
  console.log(`  [${String(s.k).padStart(2)}] ${String(s.types).padStart(6)} types ${String(s.mass).padStart(7)} tokens  ${s.label.join(' ')}`);
}
