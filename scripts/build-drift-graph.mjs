#!/usr/bin/env node
// Build the SEMANTIC SUBSTRATE for fable/drift: the word-embedding graph that
// the games walk on. Follows the wars/cult precedent (committed MiniLM
// embeddings, Xenova/all-MiniLM-L6-v2 via transformers.js in node/CI).
//
//   1. vocabulary  — google-10000-english (frequency-ordered), filtered to
//                    clean alphabetic words, ranks ~100..N (skip pure function
//                    words at the very top).
//   2. embeddings  — MiniLM 384-dim, L2-normalised.
//   3. kNN graph   — top-K cosine neighbours per word: this IS the game board.
//   4. PCA         — top-64 components → compact int8 vectors for in-browser
//                    similarity; components 1–2 → a 2D map of meaning-space.
//
// Outputs:
//   fable/drift/data/graph.json — { model, dim, count, k, words, nbr, sim, xy }
//   fable/drift/data/vec64.bin  — Int8 count×64 PCA-projected (renormalised)
//
// Run locally:  npm install --no-save @xenova/transformers@2.17.2
//               node scripts/build-drift-graph.mjs
// CI:           .github/workflows/build-drift-graph.yml

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'fable', 'drift', 'data');

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const DIM = 384;
const K = 12;            // neighbours per word — the board's branching factor
const TARGET = 7000;     // vocabulary size
const SKIP_TOP = 120;    // skip the most frequent function words
const PCA_DIMS = 64;

const VOCAB_URL = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt';

async function loadVocab() {
  const res = await fetch(VOCAB_URL);
  if (!res.ok) throw new Error('vocab fetch failed: ' + res.status);
  const text = await res.text();
  const all = text.split('\n').map((w) => w.trim().toLowerCase()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (let i = SKIP_TOP; i < all.length && out.length < TARGET; i++) {
    const w = all[i];
    if (!/^[a-z]{3,12}$/.test(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

async function embedAll(words) {
  const { pipeline } = await import('@xenova/transformers');
  const fe = await pipeline('feature-extraction', MODEL_ID, { quantized: true });
  const mat = new Float32Array(words.length * DIM);
  const BS = 64;
  for (let i = 0; i < words.length; i += BS) {
    const batch = words.slice(i, i + BS);
    const out = await fe(batch, { pooling: 'mean', normalize: true });
    mat.set(out.data, i * DIM);
    if ((i / BS) % 20 === 0) process.stdout.write(`  embedded ${i}/${words.length}\r`);
  }
  console.log(`  embedded ${words.length}/${words.length}`);
  return mat;
}

// top-K cosine neighbours (vectors are L2-normalised ⇒ cosine = dot)
function knn(mat, n) {
  const nbr = new Int32Array(n * K);
  const sim = new Float32Array(n * K);
  const heapIdx = new Int32Array(K), heapSim = new Float32Array(K);
  for (let a = 0; a < n; a++) {
    let count = 0;
    const av = a * DIM;
    for (let b = 0; b < n; b++) {
      if (b === a) continue;
      let d = 0;
      const bv = b * DIM;
      for (let k = 0; k < DIM; k++) d += mat[av + k] * mat[bv + k];
      if (count < K) {
        heapIdx[count] = b; heapSim[count] = d; count++;
        if (count === K) { // build min at 0 by simple sort (K small)
          sortHeap(heapIdx, heapSim, count);
        }
      } else if (d > heapSim[0]) {
        heapIdx[0] = b; heapSim[0] = d;
        sortHeap(heapIdx, heapSim, K);
      }
    }
    sortHeap(heapIdx, heapSim, K);
    // store descending
    for (let k = 0; k < K; k++) { nbr[a * K + k] = heapIdx[K - 1 - k]; sim[a * K + k] = heapSim[K - 1 - k]; }
    if (a % 500 === 0) process.stdout.write(`  knn ${a}/${n}\r`);
  }
  console.log(`  knn ${n}/${n}      `);
  return { nbr, sim };
}
function sortHeap(idx, sim, n) {  // ascending by sim (slot 0 = weakest)
  for (let i = 1; i < n; i++) {
    const s = sim[i], j0 = idx[i];
    let j = i - 1;
    while (j >= 0 && sim[j] > s) { sim[j + 1] = sim[j]; idx[j + 1] = idx[j]; j--; }
    sim[j + 1] = s; idx[j + 1] = j0;
  }
}

// PCA top-`comps` via covariance power iteration with deflation.
function pca(mat, n, comps) {
  const mean = new Float64Array(DIM);
  for (let i = 0; i < n; i++) for (let k = 0; k < DIM; k++) mean[k] += mat[i * DIM + k];
  for (let k = 0; k < DIM; k++) mean[k] /= n;
  // covariance (DIM×DIM)
  const C = new Float64Array(DIM * DIM);
  for (let i = 0; i < n; i++) {
    const off = i * DIM;
    for (let a = 0; a < DIM; a++) {
      const va = mat[off + a] - mean[a];
      for (let b = a; b < DIM; b++) C[a * DIM + b] += va * (mat[off + b] - mean[b]);
    }
  }
  for (let a = 0; a < DIM; a++) for (let b = 0; b < a; b++) C[a * DIM + b] = C[b * DIM + a];
  const comps_ = [];
  const work = C.slice();
  for (let c = 0; c < comps; c++) {
    let v = new Float64Array(DIM).fill(1 / Math.sqrt(DIM));
    for (let it = 0; it < 120; it++) {
      const nv = new Float64Array(DIM);
      for (let a = 0; a < DIM; a++) { let s = 0; for (let b = 0; b < DIM; b++) s += work[a * DIM + b] * v[b]; nv[a] = s; }
      let norm = 0; for (let a = 0; a < DIM; a++) norm += nv[a] * nv[a];
      norm = Math.sqrt(norm) || 1;
      for (let a = 0; a < DIM; a++) nv[a] /= norm;
      v = nv;
    }
    // eigenvalue + deflate
    let lam = 0;
    { const cv = new Float64Array(DIM);
      for (let a = 0; a < DIM; a++) { let s = 0; for (let b = 0; b < DIM; b++) s += work[a * DIM + b] * v[b]; cv[a] = s; }
      for (let a = 0; a < DIM; a++) lam += v[a] * cv[a]; }
    for (let a = 0; a < DIM; a++) for (let b = 0; b < DIM; b++) work[a * DIM + b] -= lam * v[a] * v[b];
    comps_.push({ v, lam });
    if (c % 16 === 0) process.stdout.write(`  pca ${c}/${comps}\r`);
  }
  console.log(`  pca ${comps}/${comps}    `);
  return { mean, comps: comps_ };
}

async function main() {
  console.log('vocab…');
  const words = await loadVocab();
  console.log(`  ${words.length} words`);
  console.log('embeddings…');
  const mat = await embedAll(words);
  const n = words.length;
  console.log('knn graph…');
  const { nbr, sim } = knn(mat, n);
  console.log('pca…');
  const P = pca(mat, n, PCA_DIMS);

  // project to PCA_DIMS, renormalise, quantise int8
  const vec64 = new Int8Array(n * PCA_DIMS);
  const xy = new Int16Array(n * 2);
  let xMin = 1e9, xMax = -1e9, yMin = 1e9, yMax = -1e9;
  const proj = new Float64Array(PCA_DIMS);
  const projAll = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    let norm = 0;
    for (let c = 0; c < PCA_DIMS; c++) {
      let s = 0;
      for (let k = 0; k < DIM; k++) s += (mat[i * DIM + k] - P.mean[k]) * P.comps[c].v[k];
      proj[c] = s; norm += s * s;
    }
    norm = Math.sqrt(norm) || 1;
    for (let c = 0; c < PCA_DIMS; c++) vec64[i * PCA_DIMS + c] = Math.max(-127, Math.min(127, Math.round((proj[c] / norm) * 127)));
    projAll[i * 2] = proj[0]; projAll[i * 2 + 1] = proj[1];
    xMin = Math.min(xMin, proj[0]); xMax = Math.max(xMax, proj[0]);
    yMin = Math.min(yMin, proj[1]); yMax = Math.max(yMax, proj[1]);
  }
  for (let i = 0; i < n; i++) {
    xy[i * 2] = Math.round(((projAll[i * 2] - xMin) / (xMax - xMin)) * 10000);
    xy[i * 2 + 1] = Math.round(((projAll[i * 2 + 1] - yMin) / (yMax - yMin)) * 10000);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const simQ = Array.from(sim, (s) => Math.max(0, Math.min(127, Math.round(s * 127))));
  const graph = {
    model: MODEL_ID, dim: DIM, count: n, k: K, pcaDims: PCA_DIMS,
    generated_at: new Date().toISOString(),
    words,
    nbr: Array.from(nbr),
    sim: simQ,
    xy: Array.from(xy),
  };
  writeFileSync(join(OUT_DIR, 'graph.json'), JSON.stringify(graph));
  writeFileSync(join(OUT_DIR, 'vec64.bin'), Buffer.from(vec64.buffer));
  console.log(`wrote graph.json (${(JSON.stringify(graph).length / 1024 / 1024).toFixed(1)}MB) + vec64.bin (${(vec64.length / 1024).toFixed(0)}KB)`);
  // sanity: show a few neighbourhoods
  for (const probe of ['music', 'ocean', 'king', 'doctor']) {
    const i = words.indexOf(probe);
    if (i < 0) continue;
    console.log(`  ${probe}: ${Array.from({ length: 8 }, (_, k) => words[nbr[i * K + k]]).join(', ')}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
