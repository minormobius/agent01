// OCR — pull text (e.g. an activation code) off an image, entirely client-side.
//
// All the heavy lifting runs in Rust/WASM (os/crates/codescan-ocr → wasm/
// codescan_ocr*): image decode + neural text detection/recognition via `ocrs`.
// This file boots the wasm, fetches the two ocrs models once (through the
// same-origin /api/model proxy in worker.js), runs OCR, and renders the result.

import init, { init_engine, extract_text, init_panic_hook, is_ready } from '/wasm/codescan_ocr.js';

const WASM_URL = new URL('/wasm/codescan_ocr_bg.wasm', import.meta.url);
const MODEL_URLS = {
  detection: '/api/model?name=text-detection',
  recognition: '/api/model?name=text-recognition',
};

let wasmInit = null;   // Promise — wasm booted
let engineInit = null; // Promise — models loaded

async function ensureWasm() {
  if (!wasmInit) {
    wasmInit = init(WASM_URL).then(() => init_panic_hook());
  }
  return wasmInit;
}

async function fetchModel(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model fetch failed: ${res.status} ${res.statusText}`);
  const total = parseInt(res.headers.get('content-length') || '0', 10);
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.({ received, total: total || null });
  }
  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  return data;
}

// Boot wasm + load both models. Idempotent + concurrency-safe; a failure clears
// the in-flight promise so a later call can retry.
async function ensureEngine(onProgress) {
  await ensureWasm();
  if (is_ready()) return;
  if (!engineInit) {
    engineInit = (async () => {
      onProgress?.({ stage: 'detection' });
      const detection = await fetchModel(MODEL_URLS.detection, (p) => onProgress?.({ stage: 'detection', ...p }));
      onProgress?.({ stage: 'recognition' });
      const recognition = await fetchModel(MODEL_URLS.recognition, (p) => onProgress?.({ stage: 'recognition', ...p }));
      onProgress?.({ stage: 'init' });
      init_engine(detection, recognition);
    })().catch((err) => { engineInit = null; throw err; });
  }
  return engineInit;
}

async function scanImage(file, onProgress) {
  await ensureEngine(onProgress);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return JSON.parse(extract_text(bytes, ''));
}

// Heuristic: pull out activation/license/serial-looking tokens — runs of 4+
// uppercase-alnum, optionally dash/space grouped (e.g. "ABCD-1234-EFGH").
const CODE_RE = /\b[A-Z0-9]{4,}(?:[-\s][A-Z0-9]{3,}){0,6}\b/g;
function findCodes(text) {
  const upper = (text || '').toUpperCase();
  const seen = new Set();
  const out = [];
  for (const m of upper.matchAll(CODE_RE)) {
    const code = m[0].replace(/\s+/g, ' ').trim();
    const looksCodey = /[0-9]/.test(code) || code.replace(/[-\s]/g, '').length >= 6;
    if (looksCodey && !seen.has(code)) { seen.add(code); out.push(code); }
  }
  return out;
}

function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- DOM wiring ----
const $ = (id) => document.getElementById(id);
const drop = $('drop'), fileInput = $('file'), cameraInput = $('camera');
const preview = $('preview'), hint = $('hint'), overlay = $('overlay'), statusEl = $('status');
const errorEl = $('error'), copyAllBtn = $('copyAllBtn');
const codesSection = $('codesSection'), codesEl = $('codes');
const textSection = $('textSection'), textHeading = $('textHeading'), textEl = $('text'), emptyEl = $('empty');

let busy = false;
let previewUrl = null;
let lastText = '';

function setBusy(on, label) {
  busy = on;
  drop.classList.toggle('busy', on);
  overlay.hidden = !on;
  if (label) statusEl.textContent = label;
  for (const b of document.querySelectorAll('.actions button')) b.disabled = on;
}

function copy(value, el) {
  navigator.clipboard?.writeText(value).then(() => {
    if (!el) return;
    const tag = el.querySelector('.copy');
    const prev = tag ? tag.textContent : null;
    if (tag) tag.textContent = '✓';
    else { const was = el.textContent; el.textContent = 'Copied!'; setTimeout(() => (el.textContent = was), 1400); return; }
    setTimeout(() => { if (tag) tag.textContent = prev; }, 1400);
  });
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function render(result) {
  lastText = result.text || '';
  // codes
  const codes = findCodes(lastText);
  codesEl.innerHTML = '';
  if (codes.length) {
    for (const c of codes) {
      const btn = document.createElement('button');
      btn.className = 'code';
      btn.title = 'Click to copy';
      btn.innerHTML = `<span></span><span class="copy">⧉</span>`;
      btn.firstChild.textContent = c;
      btn.addEventListener('click', () => copy(c, btn));
      codesEl.appendChild(btn);
    }
    codesSection.hidden = false;
  } else {
    codesSection.hidden = true;
  }
  // all text
  const n = result.lines?.length || 0;
  textHeading.textContent = `All text${n ? ` (${n} line${n === 1 ? '' : 's'})` : ''}`;
  textEl.textContent = lastText;
  textEl.hidden = !lastText;
  emptyEl.hidden = !!lastText;
  textSection.hidden = false;
  copyAllBtn.hidden = !lastText;
}

async function run(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showError('That doesn’t look like an image. Try a PNG, JPEG, or WebP.');
    return;
  }
  errorEl.hidden = true;
  codesSection.hidden = true;
  textSection.hidden = true;
  copyAllBtn.hidden = true;

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;
  hint.hidden = true;

  setBusy(true, 'Starting…');
  try {
    const result = await scanImage(file, (p) => {
      if (p.stage === 'init') { setBusy(true, 'Reading the image…'); return; }
      const label = p.stage === 'recognition' ? 'recognition' : 'detection';
      const pct = p.total ? Math.round((p.received / p.total) * 100) : null;
      setBusy(true, `Loading ${label} model… ${pct != null ? pct + '%' : fmtBytes(p.received)} (one-time, then cached)`);
    });
    setBusy(false);
    render(result);
  } catch (err) {
    setBusy(false);
    showError(err?.message || String(err));
  }
}

drop.addEventListener('click', () => { if (!busy) fileInput.click(); });
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('dragging');
  const f = e.dataTransfer.files?.[0];
  if (f) run(f);
});
$('chooseBtn').addEventListener('click', () => fileInput.click());
$('cameraBtn').addEventListener('click', () => cameraInput.click());
copyAllBtn.addEventListener('click', () => copy(lastText, copyAllBtn));
fileInput.addEventListener('change', (e) => { const f = e.target.files?.[0]; e.target.value = ''; run(f); });
cameraInput.addEventListener('change', (e) => { const f = e.target.files?.[0]; e.target.value = ''; run(f); });
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) run(item.getAsFile());
});
