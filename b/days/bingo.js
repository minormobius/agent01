// days/bingo.js — a bingo card for an account, drawn from its whole history.
// Pure: no DOM, no network. Runs in the search worker beside both indexes.
//
// Twenty-five squares from two kinds of evidence:
//
//   SAYS   a word or two-word phrase this account uses far more than Bluesky
//          does. Scored as weighted log-odds with an informative Dirichlet
//          prior (Monroe, Colaresi & Quinn 2008) against a background of
//          document frequencies sampled from the firehose (bg.json), so a
//          word must be both OVER-represented and seen often enough to be sure.
//
//   ON     a topic they keep coming back to. Post embeddings (Model2Vec) are
//          clustered with spherical k-means; a cluster is a topic. A centroid
//          is not a word, so it is named twice over: the LABEL is the word the
//          cluster's own posts use that sits nearest the centroid in the
//          model's own token space (Model2Vec rows live in the same space as
//          the posts), and the EXAMPLE is the medoid, the real post closest to
//          the centroid.
//
// Everything is deterministic given (posts, seed): the same account rolls the
// same card, and "reroll" is a new seed.

import { tokenize } from './embed.js';
import { words } from './search.js';

// ── a seeded rng ────────────────────────────────────────────────────────────
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hashSeed(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ── terms: words and in-sentence bigrams, URLs and mentions removed ─────────
// A bigram never crosses a sentence end, a comma, a bracket or a line break:
// "bread. Anyway" is not a phrase anyone said.
const URL_RE = /\bhttps?:\/\/\S+|\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|app|social|dev|co|uk|me|xyz|mobi|ai|gov|edu)\b\S*/gi;
const MENTION_RE = /(^|\s)@[\w.-]+/g;
export function clean(text) { return String(text || '').replace(URL_RE, ' ').replace(MENTION_RE, ' '); }
export function terms(text) {
  const out = new Set();
  for (const run of clean(text).split(/[.!?,;:()[\]{}"“”…\n\r–—|/]+/)) {
    const ws = words(run);
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (okWord(w)) out.add(w);
      if (i + 1 < ws.length && okWord(ws[i + 1], true) && okWord(w, true)) out.add(w + ' ' + ws[i + 1]);
    }
  }
  return out;
}
const okWord = (w, inBigram = false) => (inBigram ? w.length >= 1 : w.length >= 3) && w.length <= 24 && !/^\d+$/.test(w);

// ── SAYS: over-represented terms ────────────────────────────────────────────
// A background is { n: posts sampled, df: Map(term → posts containing it),
// floor: the smallest df it kept }. A term missing from it was used by fewer
// than `floor`-many authors-worth of posts there, so it is given half a floor:
// rare on Bluesky, not unseen.
export function parseBackground(text) {
  const lines = text.split('\n');
  const head = Object.fromEntries(lines[0].split('\t').slice(1).map((kv) => kv.split('=')));
  const df = new Map();
  for (let i = 1; i < lines.length; i++) { const l = lines[i]; if (!l) continue; const tab = l.lastIndexOf('\t'); df.set(l.slice(0, tab), +l.slice(tab + 1)); }
  return { n: +head.posts, floor: +head.floor, df };
}

export function accountDf(posts, dayOf) {
  const df = new Map();                         // term -> { n, days:Set }
  for (const p of posts) {
    if (!p.text) continue;
    const d = dayOf(p.t);
    for (const w of terms(p.text)) {
      let e = df.get(w);
      if (!e) df.set(w, e = { n: 0, days: 0, lastDay: null, last: 0 });
      // posts arrive in time order, so a new day is simply a different day
      e.n++; if (e.lastDay !== d) { e.days++; e.lastDay = d; } if (p.t > e.last) e.last = p.t;
    }
  }
  return df;
}

const STOP = new Set('the a an and or but of to in on at for with from by as is are was were be been being it its this that these those i me my we our you your he she they them their his her him us not no so if then than too very can will just do does did have has had im its dont thats whats yes also all about one what how when'.split(' '));

export function logOdds(yA, nA, yB, nB, a0 = 1000, prior) {
  const aw = Math.max(a0 * prior, 1e-3);
  const d = Math.log((yA + aw) / (nA + a0 - yA - aw)) - Math.log((yB + aw) / (nB + a0 - yB - aw));
  return d / Math.sqrt(1 / (yA + aw) + 1 / (yB + aw));
}

// A habit, not a burst: the floors scale with how much there is to read, so a
// 2,000-post account still gets a card and a 50,000-post one is not padded with
// one week's in-joke.
export const floors = (nPosts) => (nPosts > 20000 ? { posts: 10, days: 12, topicDays: 10 } : nPosts > 3000 ? { posts: 6, days: 6, topicDays: 5 } : { posts: 3, days: 3, topicDays: 2 });

export function sayings(df, nPosts, bg, { minDays = floors(nPosts).days, minPosts = floors(nPosts).posts, k = 60 } = {}) {
  const out = [];
  const total = nPosts + bg.n;
  for (const [w, e] of df) {
    if (e.n < minPosts || e.days < minDays) continue;
    const parts = w.split(' ');
    if (parts.every((x) => STOP.has(x))) continue;
    if (parts.length === 2 && (STOP.has(parts[0]) || STOP.has(parts[1]))) continue;   // "yes i", "its all": glue, not a phrase
    const yB = bg.df.get(w) ?? bg.floor / 2;
    const prior = (e.n + yB) / total;
    const z = logOdds(e.n, nPosts, yB, bg.n, 1000, prior);
    const ratio = (e.n / nPosts) / (yB / bg.n);
    if (z < 3 || ratio < 3) continue;
    // z alone ranks by certainty, which favours the merely frequent ("posts");
    // times log-ratio it favours the signature ("frfr" at 150× Bluesky's rate)
    out.push({ kind: 'says', term: w, z, ratio, score: z * Math.log(ratio), posts: e.n, days: e.days, known: bg.df.has(w) });
  }
  out.sort((a, b) => b.score - a.score);
  return prune(out, df).slice(0, k);
}

// One idea, one square: "sour dough" absorbs "sour" and "dough" when most of
// their uses are inside it; "cat" and "cats" are one square (the commoner wins).
function prune(list, df) {
  const kept = [], stems = new Set();
  const stem = (w) => w.split(' ').map((x) => x.replace(/(?:ies)$/, 'y').replace(/(?<=[^s])s$/, '')).join(' ');
  for (const s of list) {
    const st = stem(s.term);
    if (stems.has(st)) continue;
    const parts = s.term.split(' ');
    let absorbed = false;
    for (const k of kept) {
      const kp = k.term.split(' ');
      // a word mostly used inside an already-kept phrase
      if (parts.length === 1 && kp.length === 2 && kp.includes(s.term) && df.get(k.term).n >= 0.5 * df.get(s.term).n) { absorbed = true; break; }
      // a phrase that is mostly an already-kept word's habitual company
      if (parts.length === 2 && kp.length === 1 && parts.includes(k.term) && df.get(s.term).n >= 0.5 * df.get(k.term).n) { absorbed = true; break; }
    }
    if (absorbed) continue;
    kept.push(s); stems.add(st);
  }
  return kept;
}

// ── ON: topics by clustering ────────────────────────────────────────────────
// Model2Vec's own sentence vector is the plain mean of its tokens, and on a
// 20-word post that mean is mostly "yeah", "the", "lol": cluster those and
// every cluster is a register, not a subject. So topics get their own vector,
// a SIF-weighted mean (Arora, Liang & Ma 2017): each word counts a/(a + p(w)),
// p from the Bluesky background, so "the" weighs 0.003 and "earthsea" 1.
// Words under three letters and bare numbers weigh nothing.
export function contentEmbedder(model, bg, a = 1e-3) {
  const dim = model.dim, cache = new Map();
  const wordInfo = (w) => {
    let e = cache.get(w);
    if (e) return e;
    e = { w: 0, v: null };
    if (w.length >= 3 && !/^\d+$/.test(w)) {
      const ids = tokenize(model, w);
      if (ids.length) {
        const v = new Float32Array(dim);
        for (const id of ids) { const s = model.scale[id], b = id * dim; for (let k = 0; k < dim; k++) v[k] += model.rows[b + k] * s; }
        let nn = 0; for (let k = 0; k < dim; k++) nn += v[k] * v[k]; nn = Math.sqrt(nn) || 1;
        for (let k = 0; k < dim; k++) v[k] /= nn;
        const p = (bg.df.get(w) ?? bg.floor / 2) / bg.n;
        e = { w: a / (a + p), v };
      }
    }
    if (cache.size < 300000) cache.set(w, e);
    return e;
  };
  /** text → unit vector in `out`; returns the content mass (sum of weights). */
  const vec = (text, out = new Float32Array(dim)) => {
    out.fill(0);
    let tot = 0;
    for (const w of words(clean(text))) { const e = wordInfo(w); if (!e.v) continue; tot += e.w; for (let k = 0; k < dim; k++) out[k] += e.w * e.v[k]; }
    let nn = 0; for (let k = 0; k < dim; k++) nn += out[k] * out[k]; nn = Math.sqrt(nn);
    if (nn) for (let k = 0; k < dim; k++) out[k] /= nn;
    return tot;
  };
  return { dim, vec, word: wordInfo };
}

/** Content vectors for every post with enough content to mean something, int8. */
export function contentIndex(emb, posts, { minMass = 1.5 } = {}) {
  const dim = emb.dim, n = posts.length;
  const vecs = new Int8Array(n * dim), scales = new Float32Array(n), mass = new Float32Array(n);
  const tmp = new Float32Array(dim);
  for (let i = 0; i < n; i++) {
    const m = posts[i].text ? emb.vec(posts[i].text, tmp) : 0;
    mass[i] = m;
    if (m < minMass) continue;                       // scale 0 = not clusterable
    let mx = 0; for (let k = 0; k < dim; k++) { const x = Math.abs(tmp[k]); if (x > mx) mx = x; }
    const s = mx / 127 || 1; scales[i] = s;
    for (let k = 0; k < dim; k++) vecs[i * dim + k] = Math.round(tmp[k] / s);
  }
  return { vecs, scales, dim, n, mass };
}
function dequant(index, ids) {
  const { vecs, scales, dim } = index;
  const X = new Float32Array(ids.length * dim);
  ids.forEach((id, r) => { const s = scales[id], b = id * dim; let nn = 0; for (let k = 0; k < dim; k++) { const v = vecs[b + k] * s; X[r * dim + k] = v; nn += v * v; } nn = Math.sqrt(nn) || 1; for (let k = 0; k < dim; k++) X[r * dim + k] /= nn; });
  return X;
}
const dot = (A, ai, B, bi, dim) => { let s = 0; const a = ai * dim, b = bi * dim; for (let k = 0; k < dim; k++) s += A[a + k] * B[b + k]; return s; };
// the hot loop of both k-means and assignment: best centroid for row r.
// Unrolled by four; dim is 256 here, so no tail. (Measured: 2.3× the closure.)
const near = { c: 0, s: 0 };
function nearest(X, r, C, K, dim) {
  const a = r * dim;
  let bc = 0, bs = -Infinity;
  for (let c = 0; c < K; c++) {
    const b = c * dim;
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, k = 0;
    for (; k + 3 < dim; k += 4) { s0 += X[a + k] * C[b + k]; s1 += X[a + k + 1] * C[b + k + 1]; s2 += X[a + k + 2] * C[b + k + 2]; s3 += X[a + k + 3] * C[b + k + 3]; }
    for (; k < dim; k++) s0 += X[a + k] * C[b + k];
    const s = s0 + s1 + s2 + s3;
    if (s > bs) { bs = s; bc = c; }
  }
  near.c = bc; near.s = bs;
  return near;
}

function truncate(X, n, dim, D) {
  const Y = new Float32Array(n * D);
  for (let i = 0; i < n; i++) {
    let nn = 0;
    for (let k = 0; k < D; k++) { const v = X[i * dim + k]; Y[i * D + k] = v; nn += v * v; }
    nn = Math.sqrt(nn) || 1;
    for (let k = 0; k < D; k++) Y[i * D + k] /= nn;
  }
  return Y;
}

/** The top `k` singular directions of the rows (power iteration with deflation). */
export function commonComponents(X, n, dim, k, seed = 1) {
  // UNcentred, as SIF does: the top singular vector of the raw rows is the
  // direction they all share. Centring first would remove the top PRINCIPAL
  // component instead, and on an account with three subjects that is the axis
  // that tells two of them apart (the selftest plants exactly that).
  const mu = new Float32Array(dim);
  const U = [];
  const R = rng(seed + 17);
  const xc = new Float32Array(dim);
  for (let c = 0; c < k; c++) {
    let u = Float32Array.from({ length: dim }, () => R() - 0.5);
    for (let it = 0; it < 30; it++) {
      const nu = new Float32Array(dim);
      for (let i = 0; i < n; i++) {
        let p = 0;
        for (let d = 0; d < dim; d++) xc[d] = X[i * dim + d] - mu[d];
        for (const w of U) { let q = 0; for (let d = 0; d < dim; d++) q += xc[d] * w[d]; for (let d = 0; d < dim; d++) xc[d] -= q * w[d]; }
        for (let d = 0; d < dim; d++) p += xc[d] * u[d];
        for (let d = 0; d < dim; d++) nu[d] += p * xc[d];
      }
      let nn = 0; for (let d = 0; d < dim; d++) nn += nu[d] * nu[d]; nn = Math.sqrt(nn) || 1;
      for (let d = 0; d < dim; d++) nu[d] /= nn;
      u = nu;
    }
    U.push(u);
  }
  const apply = (Y, m) => {
    for (let i = 0; i < m; i++) {
      const o = i * dim;
      for (let d = 0; d < dim; d++) Y[o + d] -= mu[d];
      for (const w of U) { let q = 0; for (let d = 0; d < dim; d++) q += Y[o + d] * w[d]; for (let d = 0; d < dim; d++) Y[o + d] -= q * w[d]; }
      let nn = 0; for (let d = 0; d < dim; d++) nn += Y[o + d] ** 2; nn = Math.sqrt(nn) || 1;
      for (let d = 0; d < dim; d++) Y[o + d] /= nn;
    }
  };
  return { mu, U, apply };
}

/** Spherical k-means with k-means++ seeding. X: n×dim unit rows. */
export function kmeans(X, n, dim, K, { iters = 20, seed = 1 } = {}) {
  const R = rng(seed);
  const C = new Float32Array(K * dim);
  const best = new Float32Array(n).fill(-Infinity);
  // ++ seeding on cosine distance
  let first = Math.floor(R() * n);
  C.set(X.subarray(first * dim, first * dim + dim), 0);
  for (let c = 1; c < K; c++) {
    let tot = 0;
    const d2 = new Float32Array(n);
    for (let i = 0; i < n; i++) { const s = dot(X, i, C, c - 1, dim); if (s > best[i]) best[i] = s; const d = Math.max(0, 1 - best[i]); d2[i] = d * d; tot += d2[i]; }
    let r = R() * tot, pick = n - 1;
    for (let i = 0; i < n; i++) { r -= d2[i]; if (r <= 0) { pick = i; break; } }
    C.set(X.subarray(pick * dim, pick * dim + dim), c * dim);
  }
  const assign = new Int32Array(n), sim = new Float32Array(n);
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const { c: bc, s: bs } = nearest(X, i, C, K, dim);
      if (assign[i] !== bc) moved++;
      assign[i] = bc; sim[i] = bs;
    }
    C.fill(0);
    for (let i = 0; i < n; i++) { const c = assign[i]; for (let k = 0; k < dim; k++) C[c * dim + k] += X[i * dim + k]; }
    for (let c = 0; c < K; c++) { let nn = 0; for (let k = 0; k < dim; k++) nn += C[c * dim + k] ** 2; nn = Math.sqrt(nn); if (nn) for (let k = 0; k < dim; k++) C[c * dim + k] /= nn; }
    if (it > 0 && moved < n * 0.002) break;
  }
  return { C, assign, sim };
}

/**
 * Topics over the posts with enough words to have a meaning.
 * Returns clusters { ids (best first), sims, days, cohesion, centroid }.
 */
export function topics(index, posts, dayOf, { K = 64, sample = 6000, seed = 1, pcs = 1, iters = 12, fitDim = 96 } = {}) {
  const dim = index.dim;
  const elig = [];
  for (let i = 0; i < posts.length; i++) if (index.scales[i] > 0) elig.push(i);
  K = Math.min(K, Math.floor(elig.length / 40));      // ~40 posts a cluster at least, or it is a thread, not a topic
  if (K < 4) return [];
  // fit on an even-handed sample (every era, not just the busiest), then assign everything
  const R = rng(seed ^ 0x9e3779b9);
  const fitIds = elig.length <= sample ? elig : elig.filter(() => R() < sample / elig.length);
  const Xf = dequant(index, fitIds);
  // Averaged word vectors share a common direction (how someone talks, not
  // what about). Project it out first (SIF, Arora et al. 2017), fitted on the
  // sample and applied to everything.
  const proj = commonComponents(Xf, fitIds.length, dim, pcs, seed);
  proj.apply(Xf, fitIds.length);
  // Model2Vec's dimensions come out of a PCA, so they arrive ordered by
  // variance: partitioning on the leading `fitDim` costs a third as much and
  // moves few posts. Centroids, cohesion and the medoid are then recomputed at
  // full width from the members, so nothing downstream sees the shortcut.
  const D = Math.min(fitDim, dim);
  const Xs = D === dim ? Xf : truncate(Xf, fitIds.length, dim, D);
  const { C: Cs } = kmeans(Xs, fitIds.length, D, K, { seed, iters });
  const X = dequant(index, elig);
  proj.apply(X, elig.length);
  const XD = D === dim ? X : truncate(X, elig.length, dim, D);
  const assign = new Int32Array(elig.length);
  for (let r = 0; r < elig.length; r++) assign[r] = nearest(XD, r, Cs, K, D).c;
  const C = new Float32Array(K * dim), size = new Int32Array(K);
  for (let r = 0; r < elig.length; r++) { const c = assign[r]; size[c]++; for (let k = 0; k < dim; k++) C[c * dim + k] += X[r * dim + k]; }
  for (let c = 0; c < K; c++) { let nn = 0; for (let k = 0; k < dim; k++) nn += C[c * dim + k] ** 2; nn = Math.sqrt(nn) || 1; for (let k = 0; k < dim; k++) C[c * dim + k] /= nn; }
  const members = Array.from({ length: K }, () => []);
  for (let r = 0; r < elig.length; r++) members[assign[r]].push([elig[r], dot(X, r, C, assign[r], dim)]);
  return members.map((m, c) => {
    m.sort((a, b) => b[1] - a[1]);
    const days = new Set(m.map(([i]) => dayOf(posts[i].t)));
    const cohesion = m.length ? m.reduce((s, x) => s + x[1], 0) / m.length : 0;
    return { c, ids: m.map((x) => x[0]), sims: m.map((x) => x[1]), days: days.size, cohesion, centroid: C.slice(c * dim, c * dim + dim) };
  }).filter((t) => t.ids.length).map((t) => Object.assign(t, { proj }));
}

/**
 * Name a topic with a word its own posts use. Candidates are words concentrated
 * in the cluster (lift over the whole account ≥ 2, in ≥ 4% of its posts); the
 * winner is the one whose own embedding sits nearest the centroid, nudged by
 * how concentrated it is so a near-miss common word does not beat the obvious one.
 */
export function nameTopic(emb, t, posts, acctDf, nPosts, bg, { taken = new Set() } = {}) {
  const cnt = new Map();
  const nT = t.ids.length;
  for (const i of t.ids) for (const w of new Set(words(clean(posts[i].text)))) if (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)) cnt.set(w, (cnt.get(w) || 0) + 1);
  const cands = [];
  const v = new Float32Array(emb.dim);
  for (const [w, c] of cnt) {
    if (c < Math.max(3, nT * 0.04)) continue;
    const all = acctDf.get(w)?.n || c;
    const lift = (c / nT) / (all / nPosts);
    if (lift < 2) continue;
    const wi = emb.word(w);
    if (!wi.v) continue;
    v.set(wi.v);
    t.proj.apply(v, 1);
    // a topic word should be rare on Bluesky at large, not just in this cluster:
    // the same SIF weight the vectors use, so "into" (0.05) cannot name a topic
    // that "water" (0.3) or "earthsea" (1) could
    const rare = wi.w;
    if (rare < 0.12) continue;
    let s = 0; for (let k = 0; k < emb.dim; k++) s += v[k] * t.centroid[k];
    if (!s) continue;
    cands.push({ w, cos: s, lift, share: c / nT, rare, score: s * Math.log(1 + lift) * Math.sqrt(c / nT) * rare });
  }
  cands.sort((a, b) => b.score - a.score);
  const free = cands.filter((x) => !taken.has(x.w));
  return { label: free[0]?.w || null, alts: free.slice(1, 4).map((x) => x.w), cands };
}

function nameCos(emb, a, b) { const x = emb.word(a).v, y = emb.word(b).v; if (!x || !y) return 0; let s = 0; for (let k = 0; k < x.length; k++) s += x[k] * y[k]; return s; }

export function onTopics(emb, index, posts, dayOf, acctDf, bg, { K = 64, seed = 1, minDays = floors(posts.length).topicDays } = {}) {
  const ts = topics(index, posts, dayOf, { K, seed });
  const nPosts = posts.length;
  return ts
    .filter((t) => t.days >= minDays)
    .map((t) => ({ ...t, visit: t.days * t.cohesion * t.cohesion }))
    .sort((a, b) => b.visit - a.visit)
    .map((t) => {
      const nm = nameTopic(emb, t, posts, acctDf, nPosts, bg);
      return { kind: 'on', term: nm.label, alts: nm.alts, medoid: t.ids[0], ids: t.ids, days: t.days, posts: t.ids.length, cohesion: t.cohesion, centroid: t.centroid, proj: t.proj };
    })
    .filter((t) => t.term)
    // one square per idea: a topic whose name means what a better-visited
    // topic's name means ("divine" after "god", cos 0.51) steps aside
    .filter((t, i, all) => !all.slice(0, i).some((u) => u.term === t.term || nameCos(emb, u.term, t.term) >= 0.45));
}

// ── the card ────────────────────────────────────────────────────────────────
/**
 * 25 squares: the centre is the surest SAYS, the rest split ~half and half and
 * dealt into seeded positions. A topic whose label is already a SAYS square
 * takes its next name or steps aside.
 */
export function deal(says, on, { seed = 1, size = 25 } = {}) {
  const R = rng(seed);
  const used = new Set();
  const key = (w) => w.replace(/(?<=[^s])s$/, '');
  const pickSays = [], pickOn = [];
  const nOn = Math.min(on.length, Math.floor((size - 1) / 2));
  const nSays = size - 1 - nOn;
  const centre = says[0];
  if (centre) used.add(key(centre.term));
  // a shuffled top slice so a reroll changes the card but stays characteristic
  const slice = (list, n, extra) => { const top = list.slice(0, n + extra); for (let i = top.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [top[i], top[j]] = [top[j], top[i]]; } return top; };
  // the shuffled top slice first, then on down the list: a topic whose names are
  // all taken must not leave a hole that a saying fills
  const pool = slice(on, nOn, Math.ceil(nOn / 2));
  for (const t of on) if (!pool.includes(t)) pool.push(t);
  for (const t of pool) {
    if (pickOn.length >= nOn) break;
    // a topic may not wear a name that is (part of) a SAYS square: "bsky" next to "bskybc" is one square twice
    // (any of them, not just the ones dealt: a cluster named for a verbal tic like "gotta" is how they talk, not what about)
    const near = says.map((s) => s.term);
    const name = [t.term, ...t.alts].find((w) => !used.has(key(w)) && !near.some((s) => s.split(' ').includes(w) || s.includes(w) || w.includes(s)));
    if (!name) continue;
    used.add(key(name)); pickOn.push({ ...t, term: name });
  }
  for (const s of slice(says.slice(1), nSays + (nOn - pickOn.length), Math.ceil(nSays / 2))) {
    if (pickSays.length >= nSays + (nOn - pickOn.length)) break;
    if (s.term.split(' ').some((w) => used.has(key(w)))) continue;
    used.add(key(s.term)); pickSays.push(s);
  }
  const rest = [...pickSays, ...pickOn];
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const mid = Math.floor(size / 2);
  const cells = rest.slice(0, size - 1);
  while (cells.length < size - 1) cells.push({ kind: 'free', term: 'free' });   // too little history to fill a card: honest blanks, not filler
  if (centre) cells.splice(mid, 0, { ...centre, centre: true }); else cells.splice(mid, 0, { kind: 'free', term: 'free' });
  return cells;
}

/** Which squares does a post land on? (for daubing a window of recent posts) */
export function covers(cell, post, postTerms, postVec, threshold) {
  if (cell.kind === 'says') return postTerms.has(cell.term);
  if (cell.kind === 'on') { if (!postVec) return false; let s = 0; for (let k = 0; k < postVec.length; k++) s += postVec[k] * cell.centroid[k]; return s >= threshold; }
  return false;
}

/** Lines complete on a 5×5 of booleans: rows, columns, both diagonals. */
export function lines(marked, n = 5) {
  const out = [];
  for (let r = 0; r < n; r++) if ([...Array(n)].every((_, c) => marked[r * n + c])) out.push({ kind: 'row', i: r });
  for (let c = 0; c < n; c++) if ([...Array(n)].every((_, r) => marked[r * n + c])) out.push({ kind: 'col', i: c });
  if ([...Array(n)].every((_, i) => marked[i * n + i])) out.push({ kind: 'diag', i: 0 });
  if ([...Array(n)].every((_, i) => marked[i * n + (n - 1 - i)])) out.push({ kind: 'diag', i: 1 });
  return out;
}
