// days/search.js — keyword search over an account's posts. Pure: no DOM.
//
// An inverted index (term → posting list of post indices + term frequencies),
// ranked with BM25. Query grammar, kept to what people already type:
//
//   bread oven        both words (AND)
//   "sour dough"      an exact phrase, word-bounded
//   -yeast            must not contain
//   bre               the LAST bare word, while still being typed, matches as a
//                     prefix (bre → bread, brew, breakfast), capped at 64 terms
//
// Words are lowercased, accent-stripped and split on anything that is not a
// letter or digit; apostrophes are dropped first so "don't" is one word.
// days.selftest.mjs holds every rule to an answer.

const K1 = 1.2, B = 0.75, PREFIX_CAP = 64;

export function words(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/['’]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
}

/** Build the index over `texts` (array of strings). */
export function buildIndex(texts) {
  const n = texts.length;
  const lens = new Uint16Array(n);
  const post = new Map();                       // term -> { docs: number[], tfs: number[] }
  let total = 0;
  for (let i = 0; i < n; i++) {
    const ws = words(texts[i]);
    lens[i] = Math.min(65535, ws.length);
    total += ws.length;
    const tf = new Map();
    for (const w of ws) tf.set(w, (tf.get(w) || 0) + 1);
    for (const [w, c] of tf) {
      let p = post.get(w);
      if (!p) { p = { docs: [], tfs: [] }; post.set(w, p); }
      p.docs.push(i); p.tfs.push(Math.min(65535, c));
    }
  }
  const terms = [...post.keys()].sort();
  const lists = new Map();
  for (const t of terms) { const p = post.get(t); lists.set(t, { docs: Uint32Array.from(p.docs), tfs: Uint16Array.from(p.tfs) }); }
  return { n, lens, avg: n ? total / n : 0, lists, terms, texts };
}

/** Parse a query into { terms, phrases, not, prefix }. */
export function parse(q) {
  const out = { terms: [], phrases: [], not: [], prefix: null };
  let s = String(q || '');
  s = s.replace(/"([^"]*)"?/g, (_, p) => { const w = words(p); if (w.length > 1) out.phrases.push(w); else if (w.length === 1) out.terms.push(w[0]); return ' '; });
  const toks = s.split(/\s+/).filter(Boolean);
  const trailingSpace = /\s$/.test(String(q || ''));
  toks.forEach((tok, i) => {
    const neg = tok.startsWith('-') && tok.length > 1;
    const ws = words(neg ? tok.slice(1) : tok);
    if (!ws.length) return;
    if (neg) { out.not.push(...ws); return; }
    const last = i === toks.length - 1 && !trailingSpace && ws.length === 1;
    if (last) out.prefix = ws[0];
    else out.terms.push(...ws);
  });
  return out;
}

/** Terms in the index beginning with `p`, most frequent first, capped. */
export function expandPrefix(ix, p) {
  let lo = 0, hi = ix.terms.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ix.terms[m] < p) lo = m + 1; else hi = m; }
  const hits = [];
  for (let i = lo; i < ix.terms.length && ix.terms[i].startsWith(p); i++) hits.push(ix.terms[i]);
  return hits.sort((a, b) => ix.lists.get(b).docs.length - ix.lists.get(a).docs.length).slice(0, PREFIX_CAP);
}

const idf = (ix, df) => Math.log(1 + (ix.n - df + 0.5) / (df + 0.5));

/**
 * Run a query. Returns every matching post as { ids: Uint32Array, scores:
 * Float32Array } in BM25 order (best first), plus the terms that matched (for
 * highlighting). AND across terms and phrases; a prefix counts as one term.
 */
export function search(ix, q) {
  const Q = parse(q);
  const groups = [];                                   // each: Map doc -> bm25 contribution
  const hl = new Set();
  const bm = (list, docTf, i) => {
    const tf = docTf, len = ix.lens[i];
    return list.idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * len / (ix.avg || 1)));
  };
  const group = (termList) => {
    const g = new Map();
    for (const t of termList) {
      const L = ix.lists.get(t);
      if (!L) continue;
      hl.add(t);
      const meta = { idf: idf(ix, L.docs.length) };
      for (let k = 0; k < L.docs.length; k++) {
        const d = L.docs[k], s = bm(meta, L.tfs[k], d);
        if (s > (g.get(d) || 0)) g.set(d, s);         // a prefix group scores by its best term
      }
    }
    return g;
  };
  for (const t of Q.terms) groups.push(group([t]));
  if (Q.prefix) groups.push(group(expandPrefix(ix, Q.prefix)));
  for (const ph of Q.phrases) {
    const g = group([ph[0]]);
    for (const w of ph) hl.add(w);
    // a phrase also needs every word, so start from the rarest one's postings
    for (const w of ph.slice(1)) { const gw = group([w]); for (const d of g.keys()) if (!gw.has(d)) g.delete(d); else g.set(d, g.get(d) + gw.get(d)); }
    const pat = ' ' + ph.join(' ') + ' ';
    for (const d of [...g.keys()]) if (!(' ' + words(ix.texts[d]).join(' ') + ' ').includes(pat)) g.delete(d);
    groups.push(g);
  }
  if (!groups.length) return { ids: new Uint32Array(0), scores: new Float32Array(0), terms: [], phrases: Q.phrases };
  groups.sort((a, b) => a.size - b.size);
  const nots = new Set();
  for (const w of Q.not) { const L = ix.lists.get(w); if (L) for (const d of L.docs) nots.add(d); }
  const hits = [];
  for (const [d, s0] of groups[0]) {
    if (nots.has(d)) continue;
    let s = s0, ok = true;
    for (let k = 1; k < groups.length; k++) { const v = groups[k].get(d); if (v === undefined) { ok = false; break; } s += v; }
    if (ok) hits.push([d, s]);
  }
  hits.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return { ids: Uint32Array.from(hits.map((h) => h[0])), scores: Float32Array.from(hits.map((h) => h[1])), terms: [...hl], phrases: Q.phrases };
}
