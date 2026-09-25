#!/usr/bin/env node
// voice-fit.mjs — analysis by synthesis: fit the formant voice's phoneme targets to the reference
// voice all at once, by making its speech look like the reference's, spectrum for spectrum.
//
//   node studio/tools/voice-fit.mjs <reference dir> [--passes 2] [--write]
//
// Measuring the reference's formants one phoneme at a time and transplanting them made the voice
// worse (half a set of measured vowels clashed with the textbook rest). Here nothing is measured:
// the synthesiser renders each reference sentence, its frames are aligned to the recording word by
// word (DTW over mean-normalised MFCCs; word spans from the reference's character timings), and the
// aligned spectral distance is the loss. Coordinate descent nudges one target at a time (a vowel's
// F1, a fricative's band, a stop's locus) and keeps a nudge that lowers the loss over the sentences
// that phoneme is in. Timing is NOT fitted: a synthetic voice needs a slower pace than a person's.
// Harvard list 5 (h41–h50) is held out. --write saves lib/chipvoice-fit.js; Whisper (voice.mjs
// --set fit=1) decides whether it ships.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { phonemize, timing, tracks, renderFormant, VOICE, PHONES } from '../lib/chipvoice.js';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2), refDir = argv[0];
const passes = Number(argv.includes('--passes') ? argv[argv.indexOf('--passes') + 1] : 2);
const lex = JSON.parse(readFileSync(join(here, '..', 'voice', 'lexicon.json'), 'utf8')).words;
const SR = 16000, HOP = 80, WIN = 400, NFFT = 512;

// ---- features ---------------------------------------------------------------------------
function readWav(p) {
  const b = readFileSync(p); let o = 12, data = null;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), n = b.readUInt32LE(o + 4); if (id === 'data') { data = b.subarray(o + 8, o + 8 + n); break; } o += 8 + n; }
  const x = new Float64Array(data.length >> 1);
  for (let i = 0; i < x.length; i++) x[i] = data.readInt16LE(i * 2) / 32768;
  return x;
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ar = re[i + k], ai = im[i + k], br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ar + br; im[i + k] = ai + bi; re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
const HAMM = Float64Array.from({ length: WIN }, (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (WIN - 1)));
const MEL = (() => {
  const mel = (f) => 2595 * Math.log10(1 + f / 700), imel = (m) => 700 * (10 ** (m / 2595) - 1), n = 26;
  const pts = Array.from({ length: n + 2 }, (_, i) => imel(mel(60) + ((mel(7600) - mel(60)) * i) / (n + 1)));
  const bins = pts.map((f) => Math.floor(((NFFT + 1) * f) / SR));
  return Array.from({ length: n }, (_, i) => { const w = new Float64Array(NFFT / 2 + 1); for (let k = bins[i]; k < bins[i + 1]; k++) w[k] = (k - bins[i]) / Math.max(1, bins[i + 1] - bins[i]); for (let k = bins[i + 1]; k < bins[i + 2]; k++) w[k] = (bins[i + 2] - k) / Math.max(1, bins[i + 2] - bins[i + 1]); return w; });
})();
const DCT = Array.from({ length: 12 }, (_, c) => Float64Array.from({ length: 26 }, (_, j) => Math.cos((Math.PI / 26) * (j + 0.5) * (c + 1))));
function mfcc(x) {
  const n = Math.max(1, 1 + Math.floor((x.length - WIN) / HOP)), out = [];
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT), E = new Float64Array(26);
  for (let f = 0; f < n; f++) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < WIN; i++) { const k = f * HOP + i, v = (x[k] || 0) - 0.97 * (x[k - 1] || 0); re[i] = v * HAMM[i]; }
    fft(re, im);
    for (let m = 0; m < 26; m++) { let s = 0; const w = MEL[m]; for (let k = 0; k <= NFFT / 2; k++) if (w[k]) s += w[k] * (re[k] * re[k] + im[k] * im[k]); E[m] = Math.log(s + 1e-10); }
    out.push(DCT.map((d) => { let s = 0; for (let j = 0; j < 26; j++) s += d[j] * E[j]; return s; }));
  }
  const mean = out[0].map((_, c) => out.reduce((s, v) => s + v[c], 0) / out.length);
  return out.map((v) => v.map((x, c) => x - mean[c]));
}
const d2 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };
/** For each of A's frames, the B frame the best monotonic path pairs it with. */
function dtwPath(A, B) {
  const n = A.length, m = B.length, acc = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
  acc[0][0] = 0;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) acc[i][j] = d2(A[i - 1], B[j - 1]) + Math.min(acc[i - 1][j - 1], acc[i - 1][j], acc[i][j - 1]);
  const to = new Int32Array(n);
  let i = n, j = m;
  while (i > 0 && j > 0) { to[i - 1] = j - 1; const a = acc[i - 1][j - 1], b = acc[i - 1][j], c = acc[i][j - 1]; if (a <= b && a <= c) { i--; j--; } else if (b <= c) i--; else j--; }
  return to;
}
/** Aligned distance: the mean cost along the best monotonic path from A's frames through B's. */
function dtwCost(A, B) {
  const n = A.length, m = B.length; let prev = new Float64Array(m + 1).fill(Infinity), cur = new Float64Array(m + 1);
  prev[0] = 0;
  const len = new Float64Array(m + 1), plen = new Float64Array(m + 1);
  for (let i = 1; i <= n; i++) {
    cur[0] = Infinity;
    for (let j = 1; j <= m; j++) {
      const c = d2(A[i - 1], B[j - 1]);
      let best = prev[j - 1], L = plen[j - 1];
      if (prev[j] < best) { best = prev[j]; L = plen[j]; }
      if (cur[j - 1] < best) { best = cur[j - 1]; L = len[j - 1]; }
      cur[j] = best + c; len[j] = L + 1;
    }
    [prev, cur] = [cur, prev]; plen.set(len);
  }
  return prev[m] / Math.max(1, plen[m]);
}

// ---- the data ----------------------------------------------------------------------------
const TOK = /[A-Za-z]+(?:'[A-Za-z]+)?|[.,!?;:]/g;
const utts = readdirSync(refDir).filter((f) => f.endsWith('.json')).map((f) => {
  const id = f.replace('.json', ''), j = JSON.parse(readFileSync(join(refDir, f), 'utf8'));
  const a = j.alignment, text = a.characters.join(''), R = mfcc(readWav(join(refDir, `${id}.wav`)));
  const spans = {};
  let m, ti = 0;
  TOK.lastIndex = 0;
  while ((m = TOK.exec(text))) { if (/[A-Za-z]/.test(m[0][0])) spans[ti] = [Math.max(0, Math.floor((a.character_start_times_seconds[m.index] * SR) / HOP) - 2), Math.min(R.length, Math.ceil((a.character_end_times_seconds[m.index + m[0].length - 1] * SR) / HOP) + 2)]; ti++; }
  const ph = phonemize(j.text, lex);
  return { id, text: j.text, R, spans, phones: new Set(ph.filter((x) => x.p).map((x) => x.p)), held: /^h(4[1-9]|50)$/.test(id) };
});
console.log(`${utts.length} reference utterances; held out: ${utts.filter((u) => u.held).map((u) => u.id).join(' ')}`);

/** The loss of one utterance: the synthesiser's rendering against the recording, word by word. */
function lossOf(u, voice) {
  const tm = timing(phonemize(u.text, lex), voice), tr = tracks(tm, voice);
  const A = mfcc(renderFormant(tr, { rate: SR, voice }));
  const byWord = {};
  tr.forEach((t, k) => { const w = tm[t.seg].word; if (w !== undefined && k < A.length) (byWord[w] = byWord[w] || []).push(k); });
  let s = 0, n = 0;
  for (const [w, ks] of Object.entries(byWord)) {
    const sp = u.spans[w];
    if (!sp || sp[1] - sp[0] < 2) continue;
    const c = dtwCost(ks.map((k) => A[k]), u.R.slice(sp[0], sp[1]));
    s += c * ks.length; n += ks.length;
  }
  return n ? s / n : 0;
}
// --loss classify: a stand-in listener. The reference's frames, labelled once by aligning the
// textbook voice's rendering onto them, give each phoneme a centroid; the loss is how badly a
// nearest-centroid classifier trained on the REFERENCE recognises the SYNTHESISER's phonemes (the
// mean negative log-probability of the right one, over the middle half of each phoneme). Likeness
// on average rewarded blurring phonemes together; this punishes it.
const LOSS = argv.includes('--loss') ? argv[argv.indexOf('--loss') + 1] : 'likeness';
let CENT = null, TAU = 1;
function middles(tm, tr) {
  const spans = {};
  tr.forEach((t, k) => { if (tm[t.seg].p) (spans[t.seg] = spans[t.seg] || []).push(k); });
  return Object.entries(spans).map(([seg, ks]) => ({ p: tm[seg].p, ks: ks.slice(Math.floor(ks.length / 4), Math.max(Math.floor(ks.length / 4) + 1, Math.ceil((3 * ks.length) / 4))) }));
}
function buildCentroids(set, voice) {
  const acc = {};
  for (const u of set) {
    const tm = timing(phonemize(u.text, lex), voice), tr = tracks(tm, voice), A = mfcc(renderFormant(tr, { rate: SR, voice }));
    const byWord = {};
    tr.forEach((t, k) => { const w = tm[t.seg].word; if (w !== undefined && k < A.length) (byWord[w] = byWord[w] || []).push(k); });
    const refOf = new Map();
    for (const [w, ks] of Object.entries(byWord)) { const sp = u.spans[w]; if (!sp || sp[1] - sp[0] < 2) continue; const to = dtwPath(ks.map((k) => A[k]), u.R.slice(sp[0], sp[1])); ks.forEach((k, i) => refOf.set(k, sp[0] + to[i])); }
    for (const { p, ks } of middles(tm, tr)) for (const k of ks) if (refOf.has(k)) { const a = (acc[p] = acc[p] || { s: new Float64Array(12), n: 0 }); const r = u.R[refOf.get(k)]; for (let c = 0; c < 12; c++) a.s[c] += r[c]; a.n++; }
  }
  CENT = Object.fromEntries(Object.entries(acc).filter(([, a]) => a.n >= 8).map(([p, a]) => [p, Array.from(a.s, (x) => x / a.n)]));
  // a temperature: the typical distance between centroids
  const cs = Object.values(CENT); let s = 0, n = 0;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { s += d2(cs[i], cs[j]); n++; }
  TAU = s / n / 3;
  console.log(`classifier: ${cs.length} phoneme centroids from the reference, temperature ${TAU.toFixed(2)}`);
}
function classifyLoss(u, voice) {
  const tm = timing(phonemize(u.text, lex), voice), tr = tracks(tm, voice), A = mfcc(renderFormant(tr, { rate: SR, voice }));
  const names = Object.keys(CENT); let s = 0, n = 0;
  for (const { p, ks } of middles(tm, tr)) {
    if (!CENT[p]) continue;
    for (const k of ks) {
      if (k >= A.length) continue;
      const z = names.map((q) => -d2(A[k], CENT[q]) / TAU), mx = Math.max(...z);
      const lse = mx + Math.log(z.reduce((a, b) => a + Math.exp(b - mx), 0));
      s += lse - z[names.indexOf(p)]; n++;
    }
  }
  return n ? s / n : 0;
}
const total = (set, voice) => set.reduce((s, u) => s + (LOSS === 'classify' ? classifyLoss(u, voice) : lossOf(u, voice)), 0) / set.length;

// ---- the parameters: every target the textbook sets, within ±35% of it ---------------------------------
const FIT = {};
const params = [];
for (const [p, P] of Object.entries(PHONES)) {
  if (p === 'L' || P.kind === 'h' || P.kind === 'a') continue;          // L's targets are the light/dark rule's; HH takes its vowel's
  if (P.F) for (let k = 0; k < 3; k++) if (!(P.kind === 's' && k === 0) && !(P.kind === 'f' && k === 0)) params.push({ p, key: 'F', k });
  if (P.F2) for (let k = 0; k < 3; k++) params.push({ p, key: 'F2', k });
  if (P.fr) for (let k = 0; k < 2; k++) params.push({ p, key: 'fr', k });
  if (P.burst) params.push({ p, key: 'burst', k: 0 });
}
const get = (q) => { const src = { ...PHONES[q.p], ...(FIT[q.p] || {}) }; return q.key === 'fr' ? src.fr[q.k][0] : q.key === 'burst' ? src.burst.fr[0][0] : src[q.key][q.k]; };
const base = (q) => (q.key === 'fr' ? PHONES[q.p].fr[q.k][0] : q.key === 'burst' ? PHONES[q.p].burst.fr[0][0] : PHONES[q.p][q.key][q.k]);
function set(q, v) {
  const cur = FIT[q.p] || {};
  const P = { ...PHONES[q.p], ...cur };
  const next = { ...cur };
  if (q.key === 'fr') { next.fr = P.fr.map((b, i) => (i === q.k ? [v, b[1], b[2]] : [...b])); }
  else if (q.key === 'burst') { next.burst = { ...P.burst, fr: P.burst.fr.map((b, i) => (i === 0 ? [v, b[1], b[2]] : [...b])) }; }
  else { next[q.key] = P[q.key].map((f, i) => (i === q.k ? v : f)); }
  FIT[q.p] = next;
}
// the fit writes into chipvoice's FIT table, which phone() reads when voice.fit is 1
const NAME = argv.includes('--loss') && argv[argv.indexOf('--loss') + 1] === 'classify' ? 'classify' : 'likeness';
const { FITS } = await import('../lib/chipvoice-fit.js');
const LIVE = FITS[NAME];
const sync = () => { for (const k of Object.keys(LIVE)) delete LIVE[k]; Object.assign(LIVE, FIT); };
const voice = { ...VOICE, fit: NAME === 'classify' ? 2 : 1 };
const train = utts.filter((u) => !u.held), held = utts.filter((u) => u.held);
const subset = (p) => { const s = train.filter((u) => u.phones.has(p)); return s.length > 14 ? s.filter((_, i) => i % Math.ceil(s.length / 14) === 0) : s; };

sync();
if (LOSS === 'classify') buildCentroids(train, { ...VOICE, fit: 0 });
let t0 = Date.now();
console.log(`${params.length} parameters. loss: train ${total(train, voice).toFixed(3)}, held out ${total(held, voice).toFixed(3)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
for (const step of [0.1, 0.05, 0.025].slice(0, passes + 1)) {
  let moved = 0;
  for (const q of params) {
    const set_ = subset(q.p);
    if (!set_.length) continue;
    const v0 = get(q), b = base(q), before = total(set_, voice);
    let best = before, bestV = v0;
    for (const dir of [1, -1]) {
      const v = Math.min(b * 1.35, Math.max(b * 0.65, v0 * (1 + dir * step)));
      if (v === v0) continue;
      set(q, v); sync();
      const l = total(set_, voice);
      if (l < best - 1e-4) { best = l; bestV = v; }
    }
    set(q, bestV); sync();
    if (bestV !== v0) moved++;
  }
  console.log(`step ${step}: ${moved} moved. loss: train ${total(train, voice).toFixed(3)}, held out ${total(held, voice).toFixed(3)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)));
const out = Object.fromEntries(Object.entries(FIT).map(([p, f]) => [p, round(Object.fromEntries(Object.entries(f).filter(([k]) => ['F', 'F2', 'fr', 'burst'].includes(k))))]));
for (const [p, f] of Object.entries(out)) if (f.F) console.log(`${p.padEnd(3)} F ${PHONES[p].F.map(Math.round).join('/')} → ${f.F.map(Math.round).join('/')}${f.F2 ? `   F2 ${PHONES[p].F2.map(Math.round).join('/')} → ${f.F2.map(Math.round).join('/')}` : ''}`);
if (argv.includes('--write')) {
  // both fits live in one file; this run replaces its own
  const all = { ...FITS, [NAME]: out };
  for (const k of Object.keys(all)) if (k !== NAME) all[k] = JSON.parse(JSON.stringify(all[k]));
  writeFileSync(join(here, '..', 'lib', 'chipvoice-fit.js'), `// chipvoice-fit.js — GENERATED by studio/tools/voice-fit.mjs: phoneme targets fitted to the reference voice by\n// analysis by synthesis. VOICE.fit 1 uses \`likeness\` (spectra like the reference's), 2 \`classify\` (phonemes a\n// reference-trained classifier recognises). Each replaces PHONES' targets where it has them. Last run: ${NAME}, ${new Date().toISOString().slice(0, 10)}.\nexport const FITS = {\n${Object.entries(all).map(([k, v]) => `${k}: ${JSON.stringify(v)},`).join('\n')}\n};\n`);
  console.log('wrote studio/lib/chipvoice-fit.js');
}
