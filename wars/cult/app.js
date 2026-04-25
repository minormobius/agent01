// cult — decompose a cultural work into a signed combination of famous ones.
//
// Pipeline:
//   1. Fast path: fetch precomputed ./basis.json + ./basis.bin (built by CI).
//   2. Slow path: import BASIS from ./basis.js and embed in-browser, cached in IndexedDB.
//   3. Either way, lazy-load all-MiniLM-L6-v2 (384-dim) via transformers.js for the
//      query embedding only.
//   4. Run matching pursuit picking up to N basis vectors with the largest |dot product|;
//      signed coefficients yield "+ A − B + C" style equations.

// Pin a transformers.js version + a quantized model for fast download in browser.
//
// We use esm.sh rather than jsdelivr's /+esm transform: jsdelivr's bundler
// tree-shakes too aggressively and drops the side-effect imports that register
// ONNX Runtime Web's WASM backend, producing "null is not an object
// (evaluating 'o.registerBackend')" at pipeline init. esm.sh preserves them.
//
// We still pin the WASM asset path to jsdelivr (transformers.js bundles its
// own ORT WASM blobs in dist/) so the runtime can locate them at fetch time.
const TRANSFORMERS_VERSION = '2.17.2';
const TRANSFORMERS_URL = `https://esm.sh/@xenova/transformers@${TRANSFORMERS_VERSION}`;
const ORT_WASM_PATHS = `https://cdn.jsdelivr.net/npm/@xenova/transformers@${TRANSFORMERS_VERSION}/dist/`;
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const EMBED_DIM = 384;
const CACHE_VERSION = 2;
const DB_NAME = 'cult-embeddings';
const DB_STORE = 'kv';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const barEl = $('bar');
const eqEl = $('equation');
const metaEl = $('meta');
const mFitEl = $('m-fit');
const mTermsEl = $('m-terms');
const inputEl = $('q');
const goEl = $('go');

let extractor = null;
let basisDeduped = [];   // [{ t, k }]
let basisMatrix = null;  // Float32Array length N*EMBED_DIM, row-major, L2-normalized

function setStatus(text, pct) {
  statusEl.firstChild.textContent = text;
  if (pct == null) {
    barEl.parentElement.style.display = 'none';
  } else {
    barEl.parentElement.style.display = 'inline-block';
    barEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }
}

function dedupeBasis(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item.t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// ---- IndexedDB helpers ----
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbPut(key, value) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Caching failed (private mode, quota, etc.) — proceed without persistence.
  }
}

// ---- Embedding ----
async function loadModel({ background = false } = {}) {
  if (extractor) return extractor;
  const prefix = background ? 'loading model in background' : 'loading model';
  setStatus(`${prefix}…`, 5);
  const mod = await import(TRANSFORMERS_URL);
  // Don't try to load local files first — go straight to the HF CDN.
  mod.env.allowLocalModels = false;
  mod.env.useBrowserCache = true;
  // Pin the ORT WASM file location so the runtime can register its backend.
  // Without this, transformers.js tries to resolve onnxruntime-web's WASM
  // relative to its own bundle, which fails when loaded from a CDN.
  if (mod.env.backends?.onnx?.wasm) {
    mod.env.backends.onnx.wasm.wasmPaths = ORT_WASM_PATHS;
  }
  extractor = await mod.pipeline('feature-extraction', MODEL_ID, {
    quantized: true,
    progress_callback: (p) => {
      if (p.status === 'progress' && p.total) {
        const pct = (p.loaded / p.total) * 100;
        setStatus(`${prefix} · ${p.file ?? 'weights'}…`, 5 + pct * 0.9);
      }
    },
  });
  if (basisMatrix) {
    setStatus(`ready · ${basisDeduped.length} basis works · model loaded`, null);
  }
  return extractor;
}

async function embedOne(text) {
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  // out.data is Float32Array length EMBED_DIM (already L2-normalized by transformers.js).
  return new Float32Array(out.data);
}

async function embedBatch(texts, onProgress) {
  // The pipeline supports arrays — it batches internally. For a small basis (~750)
  // this is fast enough. We chunk so the UI thread can update.
  const dim = EMBED_DIM;
  const matrix = new Float32Array(texts.length * dim);
  const CHUNK = 16;
  for (let i = 0; i < texts.length; i += CHUNK) {
    const slice = texts.slice(i, i + CHUNK);
    const out = await extractor(slice, { pooling: 'mean', normalize: true });
    // out.data is Float32Array length slice.length*dim, row-major.
    matrix.set(out.data, i * dim);
    onProgress?.(Math.min(i + CHUNK, texts.length), texts.length);
    // Yield to event loop so the bar repaints.
    await new Promise((r) => setTimeout(r, 0));
  }
  return matrix;
}

// ---- Basis loading ----
// Fast path: a CI-built basis.json + basis.bin sits next to this script.
async function tryFetchPrebuilt() {
  try {
    setStatus('loading basis…', 5);
    const [metaRes, binRes] = await Promise.all([
      fetch('./basis.json'),
      fetch('./basis.bin'),
    ]);
    if (!metaRes.ok || !binRes.ok) return false;
    const meta = await metaRes.json();
    if (meta.model !== MODEL_ID || meta.dim !== EMBED_DIM) {
      console.warn('basis.json model/dim mismatch, falling back', meta);
      return false;
    }
    setStatus('loading basis…', 40);
    const buf = await binRes.arrayBuffer();
    const expected = meta.count * EMBED_DIM * 4;
    if (buf.byteLength !== expected) {
      console.warn(`basis.bin size mismatch: ${buf.byteLength} vs ${expected}`);
      return false;
    }
    basisDeduped = meta.items;
    basisMatrix = new Float32Array(buf);
    setStatus(`ready · ${basisDeduped.length} basis works`, null);
    return true;
  } catch (err) {
    console.warn('prebuilt basis fetch failed, will embed in-browser', err);
    return false;
  }
}

// Slow path: dedupe in-memory list, embed each title in the browser, cache to IDB.
async function buildBasisInBrowser() {
  const { BASIS } = await import('./basis.js');
  basisDeduped = dedupeBasis(BASIS);
  const cacheKey = `basis-v${CACHE_VERSION}-n${basisDeduped.length}-${MODEL_ID}`;
  const cached = await idbGet(cacheKey);
  if (cached?.matrix && cached.matrix.byteLength === basisDeduped.length * EMBED_DIM * 4) {
    basisMatrix = new Float32Array(cached.matrix);
    setStatus(`ready · ${basisDeduped.length} basis works (cached locally)`, null);
    return;
  }
  await loadModel();
  setStatus(`embedding ${basisDeduped.length} basis works…`, 50);
  const titles = basisDeduped.map((b) => b.t);
  basisMatrix = await embedBatch(titles, (done, total) => {
    const pct = 50 + (done / total) * 50;
    setStatus(`embedding ${done}/${total}…`, pct);
  });
  await idbPut(cacheKey, { matrix: basisMatrix.buffer, ts: Date.now() });
  setStatus(`ready · ${basisDeduped.length} basis works (cached locally)`, null);
}

async function ensureBasis() {
  if (basisMatrix) return;
  if (await tryFetchPrebuilt()) return;
  await buildBasisInBrowser();
}

// ---- Decomposition ----
function dot(a, b, aOffset = 0, bOffset = 0, len = EMBED_DIM) {
  let s = 0;
  for (let i = 0; i < len; i++) s += a[aOffset + i] * b[bOffset + i];
  return s;
}

function l2Normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s);
  if (s === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / s;
  return out;
}

// Matching pursuit on a unit-norm dictionary. Returns up to maxTerms entries
// with signed coefficients. Excludes near-self matches (cos > selfThreshold).
// Greedily stops if the best |dot| with residual drops below minCoef.
function matchingPursuit(query, queryTitle, opts = {}) {
  const {
    maxTerms = 4,
    selfThreshold = 0.92,
    minCoef = 0.12,
    diversityCos = 0.85,
  } = opts;
  const N = basisDeduped.length;
  const dim = EMBED_DIM;

  // Make a working copy of the query (residual). No further normalization needed.
  const r = new Float32Array(query);

  // Pre-compute cos similarity with each basis to detect near-self matches.
  const initial = new Float32Array(N);
  for (let i = 0; i < N; i++) initial[i] = dot(query, basisMatrix, 0, i * dim);

  const blocked = new Uint8Array(N);
  const qLower = (queryTitle || '').trim().toLowerCase();
  for (let i = 0; i < N; i++) {
    if (initial[i] >= selfThreshold) blocked[i] = 1;
    if (basisDeduped[i].t.toLowerCase() === qLower) blocked[i] = 1;
  }

  const chosen = []; // [{ idx, coef }]
  for (let step = 0; step < maxTerms; step++) {
    let bestIdx = -1, bestAbs = -1, bestCoef = 0;
    for (let i = 0; i < N; i++) {
      if (blocked[i]) continue;
      const c = dot(r, basisMatrix, 0, i * dim);
      const a = Math.abs(c);
      if (a > bestAbs) { bestAbs = a; bestIdx = i; bestCoef = c; }
    }
    if (bestIdx < 0 || bestAbs < minCoef) break;
    // Subtract projection: r -= coef * b_i (b_i is unit-norm so no division).
    const off = bestIdx * dim;
    for (let j = 0; j < dim; j++) r[j] -= bestCoef * basisMatrix[off + j];
    chosen.push({ idx: bestIdx, coef: bestCoef });
    // Block this and any near-duplicate so we don't pick "Star Wars" twice
    // through different surface forms.
    for (let i = 0; i < N; i++) {
      if (blocked[i]) continue;
      if (dot(basisMatrix, basisMatrix, off, i * dim) > diversityCos) blocked[i] = 1;
    }
  }

  // Reconstruct and report fit (cosine of reconstruction vs query).
  const recon = new Float32Array(dim);
  for (const { idx, coef } of chosen) {
    const off = idx * dim;
    for (let j = 0; j < dim; j++) recon[j] += coef * basisMatrix[off + j];
  }
  const reconNorm = Math.sqrt(dot(recon, recon));
  const fit = reconNorm === 0 ? 0 : dot(recon, query) / reconNorm; // query is unit-norm

  return { chosen, fit };
}

// ---- Render ----
function renderEquation(query, chosen, fit) {
  if (!chosen.length) {
    eqEl.classList.remove('empty');
    eqEl.innerHTML = `<span class="lhs">${escapeHtml(query)}</span> <span class="eq">=</span> <span style="color:var(--dim)">(no decomposition found)</span>`;
    metaEl.style.display = 'none';
    return;
  }
  // Sort chosen by |coef| desc so the equation reads from strongest to weakest.
  const sorted = [...chosen].sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef));
  const parts = [`<span class="lhs">${escapeHtml(query)}</span>`, `<span class="eq">≈</span>`];
  sorted.forEach((c, i) => {
    const item = basisDeduped[c.idx];
    const sign = c.coef >= 0;
    if (i === 0) {
      if (!sign) parts.push(`<span class="op minus">−</span>`);
    } else {
      parts.push(`<span class="op ${sign ? 'plus' : 'minus'}">${sign ? '+' : '−'}</span>`);
    }
    parts.push(
      `<span class="term" data-q="${escapeAttr(item.t)}" title="${item.k} · weight ${c.coef.toFixed(3)}">${escapeHtml(item.t)}</span>`
    );
  });
  eqEl.classList.remove('empty');
  eqEl.innerHTML = parts.join(' ');
  mFitEl.textContent = (fit * 100).toFixed(1) + '%';
  mTermsEl.textContent = `${sorted.length}/${4}`;
  metaEl.style.display = 'grid';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

// ---- Main flow ----
async function decompose(query) {
  const text = query.trim();
  if (!text) return;
  goEl.disabled = true;
  try {
    if (!basisMatrix) await ensureBasis();
    if (!extractor) {
      setStatus('loading model…', null);
      await preloadModel();
    }
    setStatus('embedding query…', null);
    const qVec = await embedOne(text);
    // qVec is unit-norm (transformers.js normalize:true), but enforce again defensively.
    const q = l2Normalize(qVec);
    const { chosen, fit } = matchingPursuit(q, text);
    renderEquation(text, chosen, fit);
    setStatus(`ready · ${basisDeduped.length} basis works (cached)`, null);
  } catch (err) {
    console.error(err);
    setStatus(`error: ${err.message ?? err}`, null);
  } finally {
    goEl.disabled = false;
  }
}

// ---- Wire up ----
goEl.addEventListener('click', () => decompose(inputEl.value));
inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') decompose(inputEl.value); });

// Click a term in the equation to drill in.
eqEl.addEventListener('click', (e) => {
  const t = e.target.closest('.term');
  if (!t) return;
  const q = t.dataset.q;
  inputEl.value = q;
  decompose(q);
});

// Click an example to populate.
document.querySelectorAll('.examples a').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const q = a.dataset.q;
    inputEl.value = q;
    decompose(q);
  });
});

// Kick off basis loading immediately. Once the basis is ready, also start the
// model download in the background so the first user query has zero latency.
let modelPromise = null;
function preloadModel(opts) {
  if (!modelPromise) modelPromise = loadModel(opts);
  return modelPromise;
}

ensureBasis()
  .then(() => preloadModel({ background: true }))
  .catch((err) => {
    console.error(err);
    setStatus(`init failed: ${err.message ?? err}`, null);
  });
