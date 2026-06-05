// OCR — pull text (e.g. an activation code) off an image, entirely client-side.
//
// The actual OCR (image decode + neural detect/recognize, all Rust/WASM) runs
// in a Web Worker (ocr.worker.js → engine.js) so the synchronous inference
// never blocks the UI thread — the page stays responsive while it computes.
// If module workers aren't available, we fall back to running the same engine
// on the main thread (works, just not as smooth).

// ---- OCR transport: worker, with a main-thread fallback ----
let worker = null;
let fallback = null; // lazily-imported engine.js for the no-worker path
const pending = new Map(); // id → { resolve, reject, onProgress }
let nextId = 1;

try {
  worker = new Worker(new URL('./ocr.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data || {};
    const entry = m.id != null ? pending.get(m.id) : null;
    if (m.type === 'progress') { entry?.onProgress?.(m); return; }
    if (m.type === 'result') { entry?.resolve(m.result); pending.delete(m.id); return; }
    if (m.type === 'error') { entry ? (entry.reject(new Error(m.message)), pending.delete(m.id)) : showError(m.message); return; }
  };
  worker.onerror = (e) => {
    // A worker-level failure rejects whatever's in flight; future scans fall
    // back to the main thread.
    const err = new Error(e.message || 'OCR worker error');
    for (const [id, entry] of pending) { entry.reject(err); pending.delete(id); }
    worker = null;
  };
  // Warm up wasm + models so the first real scan is quicker.
  worker.postMessage({ type: 'warmup' });
} catch {
  worker = null;
}

async function ocrScan(file, onProgress) {
  const buf = await file.arrayBuffer();
  if (worker) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      worker.postMessage({ type: 'scan', id, buf, mime: file.type }, [buf]);
    });
  }
  // Fallback: same engine, on the main thread.
  if (!fallback) fallback = await import('./engine.js');
  return fallback.scanBytes(buf, file.type, onProgress);
}

// Heuristic: pull out activation/license/serial-looking tokens.
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

function statusFor(p) {
  if (p.stage === 'detection' || p.stage === 'recognition') {
    const pct = p.total ? Math.round((p.received / p.total) * 100) : null;
    return `Loading ${p.stage} model… ${pct != null ? pct + '%' : fmtBytes(p.received)} (one-time, then cached)`;
  }
  if (p.stage === 'init') return 'Warming up the engine…';
  return 'Reading the image…'; // scan
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
  if (label != null) statusEl.textContent = label;
  for (const b of document.querySelectorAll('.actions button')) b.disabled = on;
}

function copy(value, el) {
  navigator.clipboard?.writeText(value).then(() => {
    if (!el) return;
    const tag = el.querySelector('.copy');
    if (tag) { const prev = tag.textContent; tag.textContent = '✓'; setTimeout(() => (tag.textContent = prev), 1400); }
    else { const was = el.textContent; el.textContent = 'Copied!'; setTimeout(() => (el.textContent = was), 1400); }
  });
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function render(result) {
  lastText = result.text || '';
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
  const n = result.lines?.length || 0;
  textHeading.textContent = `All text${n ? ` (${n} line${n === 1 ? '' : 's'})` : ''}`;
  textEl.textContent = lastText;
  textEl.hidden = !lastText;
  emptyEl.hidden = !!lastText;
  textSection.hidden = false;
  copyAllBtn.hidden = !lastText;
}

async function run(file) {
  if (!file || busy) return;
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

  setBusy(true, 'Reading the image…');
  try {
    const result = await ocrScan(file, (p) => setBusy(true, statusFor(p)));
    setBusy(false);
    render(result);
  } catch (err) {
    setBusy(false);
    showError(err?.message || String(err));
  }
}

drop.addEventListener('click', () => { if (!busy) fileInput.click(); });
drop.addEventListener('dragover', (e) => { e.preventDefault(); if (!busy) drop.classList.add('dragging'); });
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
