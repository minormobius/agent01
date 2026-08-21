// engine.mjs — post records in, the chart's data file out.
//
// Pure: no filesystem, no DOM, no network. That is the point — the same code
// produces the committed data.json under node and runs inside a Web Worker on
// whatever handle a visitor types in, so the picture a stranger gets is built by
// the same rules as the one on the front page rather than by a second
// implementation that drifts.
//
// The steps, in order, with the mistake each one exists to avoid:
//
//   tokenise   URLs stripped, curly apostrophes normalised, contractions folded
//              — without these the top of any Bluesky vocabulary is "bsky",
//              "app", "profile" and "don".
//   sessions   the context unit is a posting session, not a post. At ~6 content
//              words a post, post-level co-occurrence is all zeros and ones.
//   PPMI       context-distribution smoothing with the RIGHT normaliser; the
//              wrong constant is an additive shift inside a log and PPMI clips
//              at zero, which silently empties the matrix.
//   eigen      throw away component 1: it is the frequency axis, and keeping it
//              makes every "topic" a frequency band.
//   k-means    spherical, log-count weighted.
//   assign     the tail votes by LIFT over each wedge's prior, not by raw count.

import { STOPWORDS } from './stopwords.mjs';

const DAY = 86400000;

// ─── tokenizer ──────────────────────────────────────────────────────────────

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
        for (let j = 0; j < n; j++) { const x = M[row + j]; if (x) s += x * v[j]; }
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

const hash01 = (str) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 8) / 0xffffff;
};

// ─── the whole pipeline ─────────────────────────────────────────────────────

export const MIN_POSTS = 60;

export function analyze(records, { handle, did, K = 12, onProgress = () => {} } = {}) {
  const say = (stage, frac) => onProgress({ stage, frac });

  say('reading posts', 0);
  const posts = records
    .filter((r) => typeof r.text === 'string' && r.text.trim() && r.createdAt)
    .map((r) => ({
      ws: tokenize(r.text),
      t: Date.parse(r.createdAt),
      root: r.reply?.root?.uri || null,
      isReply: !!r.reply,
    }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  const withWords = posts.filter((p) => p.ws.length);

  if (withWords.length < MIN_POSTS) {
    const e = new Error(`only ${withWords.length} posts with words — needs at least ${MIN_POSTS} to find any structure`);
    e.code = 'TOO_SMALL';
    e.posts = withWords.length;
    throw e;
  }

  // ── sessions ──────────────────────────────────────────────────────────────
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

  // ── counts and dates ──────────────────────────────────────────────────────
  say('counting words', 0.1);
  const freq = new Map();
  const docFreq = new Map();
  const first = new Map();
  const sumT = new Map();
  let tokens = 0;
  const heaps = [];
  const step = Math.max(1, Math.floor(withWords.length / 130));
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
    if (i % step === 0 || i === withWords.length - 1) heaps.push([tokens, freq.size]);
  }
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

  // ── co-occurrence over the top V ──────────────────────────────────────────
  say('finding topics', 0.2);
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

  const M = new Float32Array(n * n);
  if (pairs > 0) {
    let Z = 0;
    for (let k = 0; k < n; k++) Z += Math.pow(marg[k], 0.75);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const c = C[i * n + j];
        if (!c || !marg[i] || !marg[j]) continue;
        const pmi = Math.log((c / pairs) / ((marg[i] / pairs) * (Math.pow(marg[j], 0.75) / Z)));
        if (pmi > 0) M[i * n + j] = pmi;
      }
    }
  }

  say('reducing', 0.35);
  const DIM = 17;
  const { vecs, vals } = topEigen(M, n, DIM);
  const SKIP = 1;                                  // component 1 is frequency
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

  // ── spherical k-means ─────────────────────────────────────────────────────
  say('clustering', 0.6);
  const KK = Math.max(3, Math.min(K, Math.floor(n / 25)));
  let seed = 99991;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cent = [emb[Math.floor(rnd() * n)].slice()];
  while (cent.length < KK) {
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
      for (let k = 0; k < KK; k++) { let s = 0; for (let d = 0; d < DE; d++) s += cent[k][d] * emb[i][d]; if (s > bs) { bs = s; bk = k; } }
      assign[i] = bk;
    }
    const nc = Array.from({ length: KK }, () => new Float64Array(DE));
    for (let i = 0; i < n; i++) {
      const w = Math.log(1 + freq.get(vocab[i]));
      for (let d = 0; d < DE; d++) nc[assign[i]][d] += emb[i][d] * w;
    }
    for (let k = 0; k < KK; k++) {
      let nn = 0;
      for (let d = 0; d < DE; d++) nn += nc[k][d] * nc[k][d];
      nn = Math.sqrt(nn) || 1;
      for (let d = 0; d < DE; d++) cent[k][d] = nc[k][d] / nn;
    }
  }

  // ── every other word gets a wedge by the company it keeps ────────────────
  say('placing the tail', 0.75);
  const sectorOf = new Map();
  const tailVotes = new Map();
  const prior = new Float64Array(KK);
  for (let i = 0; i < n; i++) sectorOf.set(vocab[i], assign[i]);
  {
    let priorTotal = 0;
    for (const doc of docs) {
      const tally = new Float64Array(KK);
      let any = 0;
      for (const w of doc) { const s = sectorOf.get(w); if (s !== undefined) { tally[s] += 1; any++; } }
      if (!any) continue;
      for (let k = 0; k < KK; k++) { prior[k] += tally[k]; priorTotal += tally[k]; }
      for (const w of new Set(doc)) {
        if (sectorOf.has(w)) continue;
        let v = tailVotes.get(w);
        if (!v) { v = new Float64Array(KK); tailVotes.set(w, v); }
        for (let k = 0; k < KK; k++) v[k] += tally[k] / any;
      }
    }
    for (let k = 0; k < KK; k++) prior[k] = (prior[k] / priorTotal) || 1e-9;
    for (const [w, v] of tailVotes) {
      let bk = 0, bs = -Infinity;
      for (let k = 0; k < KK; k++) { const lift = v[k] / prior[k]; if (lift > bs) { bs = lift; bk = k; } }
      sectorOf.set(w, bk);
    }
    const mass0 = new Float64Array(KK);
    for (const [w, c] of freq) { const s = sectorOf.get(w); if (s !== undefined) mass0[s] += c; }
    let big = 0;
    for (let k = 1; k < KK; k++) if (mass0[k] > mass0[big]) big = k;
    for (const [w] of freq) if (!sectorOf.has(w)) sectorOf.set(w, big);
  }

  // ── ring order, labels, within-wedge order ───────────────────────────────
  say('laying out', 0.88);
  const cos = (a, b) => { let s = 0; for (let d = 0; d < DE; d++) s += cent[a][d] * cent[b][d]; return s; };
  const sectorMass = new Float64Array(KK);
  const sectorTypes = new Int32Array(KK);
  for (const [w, c] of freq) { sectorMass[sectorOf.get(w)] += c; sectorTypes[sectorOf.get(w)]++; }

  const order = [];
  {
    let curK = 0;
    for (let k = 1; k < KK; k++) if (sectorMass[k] > sectorMass[curK]) curK = k;
    const used = new Set([curK]);
    order.push(curK);
    while (order.length < KK) {
      let best = -1, bs = -2;
      for (let k = 0; k < KK; k++) {
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

  const withinScore = new Map();
  for (let oi = 0; oi < KK; oi++) {
    const k = order[oi];
    const nk = order[(oi + 1) % KK];
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
        const own = v[k] / prior[k];
        const nex = v[nk] / prior[nk];
        const t = own + nex > 0 ? nex / (own + nex) : 0.5;
        withinScore.set(w, t - 0.5 + (hash01(w) - 0.5) * 0.22);
      } else {
        withinScore.set(w, hash01(w) - 0.5);
      }
    }
  }

  // ── emit ─────────────────────────────────────────────────────────────────
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

  const bySector = Array.from({ length: KK }, () => []);
  for (const rec of words) bySector[rec.s].push(rec);
  for (const list of bySector) list.sort((x, y) => x.a - y.a);
  for (const list of bySector) list.forEach((rec, i) => { rec.i = i; });

  const months = new Map();
  for (const p of withWords) {
    const key = new Date(p.t).toISOString().slice(0, 7);
    if (!months.has(key)) months.set(key, { posts: 0, tokens: 0, fresh: 0 });
    const mm = months.get(key);
    mm.posts++;
    mm.tokens += p.ws.length;
  }
  for (const [, t] of first) {
    const key = new Date(t).toISOString().slice(0, 7);
    if (months.has(key)) months.get(key).fresh++;
  }

  let general = 0;
  let bs = -1;
  for (let k = 0; k < KK; k++) {
    const ratio = sectorTypes[k] ? sectorMass[k] / sectorTypes[k] : 0;
    if (ratio > bs) { bs = ratio; general = k; }
  }

  // DROP EMPTY WEDGES BEFORE ANYONE HAS TO DRAW ONE. k-means on a thin
  // vocabulary can leave a cluster with nothing in it, and the client turns a
  // wedge into an angular span and then divides by its member count — so an
  // empty wedge is a span nobody occupies at best, and a division by zero at
  // worst. Compacting here means the contract the client is written against
  // ("K wedges, all non-empty, indices 0..K-1") is one the engine guarantees
  // rather than one the example data happens to satisfy.
  const keep = [];
  for (let k = 0; k < KK; k++) if (sectorTypes[k] > 0) keep.push(k);
  const remap = new Map(keep.map((k, i) => [k, i]));

  say('done', 1);
  return {
    handle: handle || '', did: did || '',
    built: new Date().toISOString().slice(0, 10),
    posts: posts.length,
    postsWithWords: withWords.length,
    replies: posts.filter((p) => p.isReply).length,
    span: [new Date(t0).toISOString().slice(0, 10), new Date(tN).toISOString().slice(0, 10)],
    days: day(tN),
    tokens,
    types: freq.size,
    hapax: ranked.filter(([, c]) => c === 1).length,
    sessions: docs.length,
    K: keep.length,
    order: order.filter((k) => remap.has(k)).map((k) => remap.get(k)),
    general: remap.get(general) ?? 0,
    sectors: order.filter((k) => remap.has(k)).map((k) => ({
      k: remap.get(k), label: labelFor(k), mass: sectorMass[k], types: sectorTypes[k],
    })),
    heaps,
    months: [...months.entries()].sort().map(([k, v]) => [k, v.posts, v.tokens, v.fresh]),
    cols: {
      w: words.map((r) => r.w),
      c: words.map((r) => r.c),
      d: words.map((r) => r.d),
      f: words.map((r) => r.f),
      m: words.map((r) => r.m),
      s: words.map((r) => remap.get(r.s)),
      i: words.map((r) => r.i),
    },
    sectorCounts: keep.map((k) => bySector[k].length),
  };
}

// ─── identity, shared by the CLI and the worker ─────────────────────────────

export async function resolveHandle(handle, fetchImpl = fetch) {
  const h = handle.trim().replace(/^@/, '');
  if (h.startsWith('did:')) return h;
  const r = await fetchImpl(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(h)}`);
  if (!r.ok) {
    const e = new Error(`no such handle: ${h}`);
    e.code = 'NO_HANDLE';
    throw e;
  }
  return (await r.json()).did;
}

export async function pdsFor(did, fetchImpl = fetch) {
  const base = did.startsWith('did:web:')
    ? `https://${did.slice(8)}/.well-known/did.json`
    : `https://plc.directory/${did}`;
  const r = await fetchImpl(base);
  if (!r.ok) {
    const e = new Error(`could not resolve ${did}`);
    e.code = 'NO_DID_DOC';
    throw e;
  }
  const doc = await r.json();
  const svc = (doc.service || []).find((s) => s.type === 'AtprotoPersonalDataServer');
  if (!svc) {
    const e = new Error('that DID has no personal data server');
    e.code = 'NO_PDS';
    throw e;
  }
  return svc.serviceEndpoint;
}
