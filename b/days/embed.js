// days/embed.js — static-embedding semantic search (Model2Vec), in plain JS.
//
// A Model2Vec model is a lookup table: one vector per WordPiece token. A text's
// embedding is the MEAN of its tokens' rows, normalised — no neural network runs
// at query or index time, which is why a whole repo indexes in seconds in a tab.
//
// This file must embed EXACTLY as the Python `model2vec` package does
// (StaticModel.encode with potion-base-8M), so the tokenizer below is a faithful
// port of Hugging Face `tokenizers`' BertNormalizer + BertPreTokenizer +
// WordPiece, and the pooling matches `_encode_batch`: no special tokens, [UNK]
// dropped, mean, L2-normalise, empty → zeros. days.selftest.mjs holds it to
// token ids produced by the real tokenizer.
//
// The model file (model/potion-base-8M.bin) is the table quantised to int8 with
// one scale per row: worst row cosine against float32 is 0.9997. Post vectors
// are int8 too (one scale each): 52k posts × 256 dims = 13 MB rather than 53.

// ── the model file ───────────────────────────────────────────────────────────
// 'M2V1' · u32 vocab · u32 dim · f32 scale[vocab] · i8 rows[vocab × dim]
export function loadModel(buf, vocabText) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'M2V1') throw new Error('not a model file');
  const n = dv.getUint32(4, true), dim = dv.getUint32(8, true);
  const scale = new Float32Array(buf.slice(12, 12 + 4 * n));
  const rows = new Int8Array(buf, 12 + 4 * n, n * dim);
  const tokens = vocabText.split('\n');
  if (tokens.length !== n) throw new Error(`vocab has ${tokens.length} tokens, model ${n}`);
  const vocab = new Map(tokens.map((t, i) => [t, i]));
  return { n, dim, scale, rows, vocab, unk: vocab.get('[UNK]'), cache: new Map() };
}

// ── BertNormalizer (clean_text, handle_chinese_chars, strip_accents, lowercase) ─
const isControl = (c) => {
  if (c === '\t' || c === '\n' || c === '\r') return false;
  return /\p{Cc}|\p{Cf}/u.test(c);
};
const isWhite = (c) => /\s/u.test(c);
function isCJK(cp) {
  return (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0x20000 && cp <= 0x2A6DF)
    || (cp >= 0x2A700 && cp <= 0x2B73F) || (cp >= 0x2B740 && cp <= 0x2B81F) || (cp >= 0x2B820 && cp <= 0x2CEAF)
    || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0x2F800 && cp <= 0x2FA1F);
}
export function normalize(text) {
  let out = '';
  for (const c of text) {
    const cp = c.codePointAt(0);
    if (cp === 0 || cp === 0xFFFD || isControl(c)) continue;          // clean_text
    if (isWhite(c)) { out += ' '; continue; }
    if (isCJK(cp)) { out += ' ' + c + ' '; continue; }                 // handle_chinese_chars
    out += c;
  }
  // strip_accents (null → follows lowercase=true): NFD, drop nonspacing marks
  out = out.normalize('NFD').replace(/\p{Mn}/gu, '');
  return out.toLowerCase();
}

// ── BertPreTokenizer: split on whitespace, isolate each punctuation char ──────
// Punctuation is Rust's is_ascii_punctuation() || Unicode P*: every ASCII symbol
// counts (so $ + < = > ^ ` | ~ split), emoji (So) do not.
const ASCII_PUNCT = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
const isPunct = (c) => ASCII_PUNCT.has(c) || /\p{P}/u.test(c);
export function preTokenize(text) {
  const words = [];
  let cur = '';
  for (const c of text) {
    if (isWhite(c)) { if (cur) { words.push(cur); cur = ''; } }
    else if (isPunct(c)) { if (cur) { words.push(cur); cur = ''; } words.push(c); }
    else cur += c;
  }
  if (cur) words.push(cur);
  return words;
}

// ── WordPiece: greedy longest match, '##' continuation, >100 chars → [UNK] ────
function wordPiece(model, word, out) {
  const hit = model.cache.get(word);
  if (hit) { for (const id of hit) out.push(id); return; }
  const chars = Array.from(word);
  let ids;
  if (chars.length > 100) ids = [model.unk];
  else {
    ids = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length, id = -1;
      while (end > start) {
        let sub = chars.slice(start, end).join('');
        if (start > 0) sub = '##' + sub;
        const v = model.vocab.get(sub);
        if (v !== undefined) { id = v; break; }
        end--;
      }
      if (id < 0) { ids = [model.unk]; break; }      // one unknown piece makes the whole word [UNK]
      ids.push(id);
      start = end;
    }
  }
  if (model.cache.size < 200000) model.cache.set(word, ids);
  for (const id of ids) out.push(id);
}

/** Token ids as model2vec feeds them to pooling: no special tokens, [UNK] dropped. */
export function tokenize(model, text) {
  const ids = [];
  for (const w of preTokenize(normalize(text || ''))) wordPiece(model, w, ids);
  return ids.filter((id) => id !== model.unk).slice(0, 512);
}

/** One text → normalised Float32Array (zeros for an empty or all-[UNK] text). */
export function embed(model, text, out = new Float32Array(model.dim)) {
  out.fill(0);
  const ids = tokenize(model, text);
  const { dim, rows, scale } = model;
  for (const id of ids) {
    const s = scale[id], base = id * dim;
    for (let k = 0; k < dim; k++) out[k] += rows[base + k] * s;
  }
  let norm = 0;
  for (let k = 0; k < dim; k++) norm += out[k] * out[k];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let k = 0; k < dim; k++) out[k] /= norm;
  return out;
}

/**
 * Embed many texts into int8 rows + one scale each. Yields to the caller every
 * `chunk` texts (onProgress) so a worker can report and stay responsive.
 */
export async function embedAll(model, texts, { chunk = 2000, onProgress } = {}) {
  const dim = model.dim, n = texts.length;
  const vecs = new Int8Array(n * dim), scales = new Float32Array(n);
  const tmp = new Float32Array(dim);
  for (let i = 0; i < n; i++) {
    embed(model, texts[i], tmp);
    let mx = 0;
    for (let k = 0; k < dim; k++) { const a = Math.abs(tmp[k]); if (a > mx) mx = a; }
    const s = mx > 0 ? mx / 127 : 1;
    scales[i] = s;
    const base = i * dim;
    for (let k = 0; k < dim; k++) vecs[base + k] = Math.round(tmp[k] / s);
    if (onProgress && (i + 1) % chunk === 0) await onProgress(i + 1, n);
  }
  if (onProgress) await onProgress(n, n);
  return { vecs, scales, dim, n };
}

/** Cosine of a (normalised) query against every row. */
export function scoreAll(index, q) {
  const { vecs, scales, dim, n } = index;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const base = i * dim;
    for (let k = 0; k < dim; k++) s += q[k] * vecs[base + k];
    out[i] = s * scales[i];
  }
  return out;
}

/** Indices of the k best scores, best first. Partial selection, no full sort. */
export function topK(scores, k) {
  const n = scores.length;
  k = Math.min(k, n);
  const heap = new Int32Array(k);                 // min-heap of indices by score
  let size = 0;
  const less = (a, b) => scores[a] < scores[b];
  const down = (i) => {
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < size && less(heap[l], heap[m])) m = l;
      if (r < size && less(heap[r], heap[m])) m = r;
      if (m === i) return;
      const t = heap[i]; heap[i] = heap[m]; heap[m] = t; i = m;
    }
  };
  for (let i = 0; i < n; i++) {
    if (size < k) {
      heap[size] = i; let c = size++;
      while (c > 0) { const p = (c - 1) >> 1; if (less(heap[c], heap[p])) { const t = heap[c]; heap[c] = heap[p]; heap[p] = t; c = p; } else break; }
    } else if (scores[i] > scores[heap[0]]) { heap[0] = i; down(0); }
  }
  return Array.from(heap.subarray(0, size)).sort((a, b) => scores[b] - scores[a]);
}
