// OCR — pull text (e.g. activation codes) off images, entirely client-side.
//
// Flow: load image(s) or a whole folder. For each image you draw a box around
// the text you want (or "Whole image" / "Skip"). Drawing a box dispatches that
// image to OCR and IMMEDIATELY advances to the next one — so boxing never waits
// on compute. OCR runs one-at-a-time in a Web Worker; results fill in below as
// they finish. Box everything, then walk away.
//
// The OCR itself (decode + neural detect/recognize, all Rust/WASM) lives in
// ocr.worker.js → engine.js. This file is the queue + selection UI + export.

// ---- OCR transport: worker, with a main-thread fallback ----
let worker = null;
let fallback = null;
const pending = new Map(); // id → { resolve, reject, onProgress }

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
    const err = new Error(e.message || 'OCR worker error');
    for (const [id, entry] of pending) { entry.reject(err); pending.delete(id); }
    worker = null; // future scans fall back to the main thread
  };
  worker.postMessage({ type: 'warmup' }); // load wasm + models eagerly
} catch {
  worker = null;
}

async function ocrScan(file, rect, jobId, onProgress) {
  const buf = await file.arrayBuffer();
  if (worker) {
    return new Promise((resolve, reject) => {
      pending.set(jobId, { resolve, reject, onProgress });
      worker.postMessage({ type: 'scan', id: jobId, buf, mime: file.type, rect }, [buf]);
    });
  }
  if (!fallback) fallback = await import('./engine.js');
  return fallback.scanBytes(buf, file.type, { rect, onProgress });
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

function copy(value, el) {
  navigator.clipboard?.writeText(value).then(() => {
    if (!el) return;
    const tag = el.querySelector('.copy');
    if (tag) { const prev = tag.textContent; tag.textContent = '✓'; setTimeout(() => (tag.textContent = prev), 1400); }
    else { const was = el.textContent; el.textContent = 'Copied!'; setTimeout(() => (el.textContent = was), 1400); }
  });
}

// ---- DOM ----
const $ = (id) => document.getElementById(id);
const drop = $('drop'), fileInput = $('file'), folderInput = $('folder'), cameraInput = $('camera');
const preview = $('preview'), hint = $('hint'), selbox = $('selbox');
const stagebar = $('stagebar'), stageinfo = $('stageinfo'), stagedone = $('stagedone');
const wholeBtn = $('wholeBtn'), skipBtn = $('skipBtn');
const errorEl = $('error'), results = $('results'), rowsEl = $('rows'), statsEl = $('stats');
const fmtOn = $('fmtOn'), fmtGroups = $('fmtGroups'), fmtSize = $('fmtSize'),
  fmtSep = $('fmtSep'), fmtAlpha = $('fmtAlpha'), fmtFix = $('fmtFix');
const aiOn = $('aiOn');

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ---- AI reader (vision model via /api/read) ----
// Crop on the main thread (createImageBitmap decodes off-thread), then POST the
// JPEG to the worker, which asks the vision model — told the format so it fixes
// look-alikes at read time. Returns an ocrs-shaped { text, lines }.
const AI_MAX = 1600, AI_MIN_CROP = 1000;
async function cropToBlob(file, rect) {
  const buf = await file.arrayBuffer();
  const bmp = await createImageBitmap(new Blob([buf], { type: file.type }), { imageOrientation: 'from-image' });
  const W = bmp.width, H = bmp.height;
  let sx = 0, sy = 0, sw = W, sh = H;
  if (rect) {
    sx = Math.round(clamp01(rect.x) * W);
    sy = Math.round(clamp01(rect.y) * H);
    sw = Math.min(Math.max(8, Math.round(clamp01(rect.w) * W)), W - sx);
    sh = Math.min(Math.max(8, Math.round(clamp01(rect.h) * H)), H - sy);
  }
  const long = Math.max(sw, sh);
  let scale = 1;
  if (long > AI_MAX) scale = AI_MAX / long;
  else if (rect && long < AI_MIN_CROP) scale = Math.min(AI_MIN_CROP / long, 4);
  const tw = Math.max(1, Math.round(sw * scale)), th = Math.max(1, Math.round(sh * scale));
  const canvas = new OffscreenCanvas(tw, th);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, tw, th);
  bmp.close?.();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}

async function aiRead(file, rect, onProgress) {
  onProgress?.({ stage: 'ai' });
  const blob = await cropToBlob(file, rect);
  const cfg = readFmt();
  const params = new URLSearchParams();
  if (cfg.on) { params.set('groups', cfg.groups); params.set('size', cfg.size); params.set('alpha', cfg.alphabet); }
  const res = await fetch(`/api/read?${params}`, { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || `AI read failed (${res.status})`);
  const text = j.text != null ? j.text : (j.chars || '');
  return { text, lines: text ? text.split('\n') : [], _ai: true, confidence: j.confidence };
}

function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }

// ---- expected-format (post-processing for known keys) ----
// Confusable groups. When the chosen alphabet contains exactly ONE member of a
// group, the others are mapped to it (e.g. alphabet has 0 but not O → O maps to
// 0). If it contains 0 or >1 members, that group is left untouched — so the
// default full A–Z0–9 alphabet changes nothing.
const CONFUSE = [['0', 'O'], ['1', 'I', 'L'], ['2', 'Z'], ['5', 'S'], ['6', 'G'], ['8', 'B']];

function clampInt(v, lo, hi, dflt) { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; }

function readFmt() {
  return {
    on: fmtOn.checked,
    groups: clampInt(fmtGroups.value, 1, 50, 5),
    size: clampInt(fmtSize.value, 1, 50, 5),
    sep: fmtSep.value.length ? fmtSep.value : ' ',
    alphabet: (fmtAlpha.value || '').toUpperCase(),
    fix: fmtFix.checked,
  };
}

function confuseMap(alphabet) {
  const set = new Set(alphabet);
  const map = {};
  for (const grp of CONFUSE) {
    const allowed = grp.filter((c) => set.has(c));
    if (allowed.length === 1) for (const c of grp) if (c !== allowed[0]) map[c] = allowed[0];
  }
  return map;
}

// Clean OCR text to the expected key: uppercase, fix look-alikes, keep only
// alphabet chars, regroup. Returns { formatted, n, expected, ok }.
function formatKey(text, cfg) {
  const set = new Set(cfg.alphabet);
  const cmap = cfg.fix ? confuseMap(cfg.alphabet) : {};
  let chars = '';
  for (let ch of (text || '').toUpperCase()) {
    if (cmap[ch]) ch = cmap[ch];
    if (set.has(ch)) chars += ch;
  }
  const expected = cfg.groups * cfg.size;
  const groups = [];
  for (let i = 0; i < chars.length; i += cfg.size) groups.push(chars.slice(i, i + cfg.size));
  return { formatted: groups.join(cfg.sep), n: chars.length, expected, ok: chars.length === expected };
}

// ---- the queue ----
// item: { id, file, name, rect, status, result, error, rowEl }
//   status: waiting → (queued | running | done | error | skipped)
const queue = [];
let cursor = 0;       // index of the image currently shown for selection
let nextId = 1;
let previewUrl = null;
const CONCURRENCY = 1; // single wasm engine — one OCR at a time

const baseName = (p) => (p || '').split('/').pop();

function addFiles(list) {
  const imgs = [...list]
    .filter((f) => f.type ? f.type.startsWith('image/') : /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name))
    .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
  if (!imgs.length) { showError('No images found in that selection.'); return; }
  errorEl.hidden = true;
  for (const f of imgs) {
    queue.push({ id: nextId++, file: f, name: f.webkitRelativePath || f.name, rect: null, status: 'waiting', result: null, error: null, rowEl: null });
  }
  results.hidden = false;
  refreshStage();
  updateStats();
}

function hasCurrent() {
  return cursor < queue.length && queue[cursor].status === 'waiting';
}

function showImage(item) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(item.file);
  preview.src = previewUrl;
  preview.classList.add('show');
  clearSelection();
}

function refreshStage() {
  while (cursor < queue.length && queue[cursor].status !== 'waiting') cursor++;
  if (cursor < queue.length) {
    const item = queue[cursor];
    showImage(item);
    hint.hidden = true;
    drop.classList.add('has-image');
    const total = queue.length;
    stageinfo.textContent = total > 1 ? `Image ${cursor + 1} of ${total}` : 'Draw a box';
    stagebar.hidden = false;
    stagedone.hidden = true;
  } else {
    // nothing waiting
    stagebar.hidden = true;
    drop.classList.remove('has-image');
    clearSelection();
    if (queue.length) {
      preview.classList.remove('show');
      const anyOpen = queue.some((q) => q.status === 'queued' || q.status === 'running');
      stagedone.textContent = anyOpen
        ? 'All set — OCR is finishing in the background. You can walk away; results fill in below.'
        : 'Done. Add more images or a folder to keep going.';
      stagedone.hidden = false;
    }
  }
}

// ---- selection (drag a box over the current image) ----
let selecting = false;
let selStart = null;
let selRect = null;

function clearSelection() { selRect = null; selbox.hidden = true; }

function pointerFrac(ev) {
  const r = preview.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)),
  };
}
function drawSelbox(a, b) {
  const r = preview.getBoundingClientRect();
  const d = drop.getBoundingClientRect();
  const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x), y2 = Math.max(a.y, b.y);
  selbox.style.left = `${(r.left - d.left) + x1 * r.width}px`;
  selbox.style.top = `${(r.top - d.top) + y1 * r.height}px`;
  selbox.style.width = `${(x2 - x1) * r.width}px`;
  selbox.style.height = `${(y2 - y1) * r.height}px`;
  selbox.hidden = false;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

drop.addEventListener('pointerdown', (ev) => {
  if (!hasCurrent()) return;
  const r = preview.getBoundingClientRect();
  if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
  ev.preventDefault();
  selecting = true;
  selStart = pointerFrac(ev);
  drop.setPointerCapture?.(ev.pointerId);
  drawSelbox(selStart, selStart);
});
drop.addEventListener('pointermove', (ev) => { if (selecting) selRect = drawSelbox(selStart, pointerFrac(ev)); });
function endSelect(ev) {
  if (!selecting) return;
  selecting = false;
  drop.releasePointerCapture?.(ev.pointerId);
  const cur = drawSelbox(selStart, pointerFrac(ev));
  if (cur.w < 0.02 || cur.h < 0.02) { clearSelection(); return; } // ignore taps
  decide('region', cur);
}
drop.addEventListener('pointerup', endSelect);
drop.addEventListener('pointercancel', () => { selecting = false; clearSelection(); });

// ---- decide what to do with the current image, then advance ----
function decide(action, rect) {
  if (!hasCurrent()) return;
  const item = queue[cursor];
  if (action === 'skip') {
    item.status = 'skipped';
  } else {
    item.rect = action === 'region' ? rect : null;
    item.status = 'queued';
    pump();
  }
  renderRow(item);
  updateStats();
  refreshStage();
}

// ---- OCR pump: at most CONCURRENCY jobs in flight ----
let running = 0;
function pump() {
  while (running < CONCURRENCY) {
    const item = queue.find((q) => q.status === 'queued');
    if (!item) break;
    item.status = 'running';
    running++;
    renderRow(item);
    const prog = (p) => {
      item._progress = p.stage === 'ai' ? 'asking the model…'
        : (p.stage === 'detection' || p.stage === 'recognition') ? 'loading models…'
        : 'reading…';
      renderRow(item);
    };
    const job = aiOn.checked ? aiRead(item.file, item.rect, prog) : ocrScan(item.file, item.rect, item.id, prog);
    job
      .then((res) => { item.result = res; item.status = 'done'; })
      .catch((err) => { item.error = err?.message || String(err); item.status = 'error'; })
      .finally(() => { running--; item._progress = null; renderRow(item); updateStats(); refreshStage(); pump(); });
  }
}

// ---- results rendering ----
function pill(item) {
  if (item.status === 'done') {
    if (item.result?._ai) {
      const c = item.result.confidence;
      const cstr = typeof c === 'number' ? ` ${Math.round(c * 100)}%` : '';
      return [`AI${cstr}`, 'done'];
    }
    return ['done', 'done'];
  }
  if (item.status === 'error') return ['error', 'error'];
  if (item.status === 'skipped') return ['skipped', 'skipped'];
  if (item.status === 'running') return [item._progress || 'reading…', 'running'];
  return ['queued', ''];
}

function renderRow(item) {
  let row = item.rowEl;
  if (!row) {
    row = document.createElement('div');
    row.className = 'row';
    item.rowEl = row;
    rowsEl.appendChild(row);
  }
  const [label, cls] = pill(item);
  row.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'row-head';
  const name = document.createElement('span');
  name.className = 'row-name';
  name.textContent = baseName(item.name);
  name.title = item.name;
  const badge = document.createElement('span');
  badge.className = `pill ${cls}`;
  badge.textContent = label;
  head.append(name, badge);
  row.appendChild(head);

  if (item.status === 'done') {
    const text = item.result?.text || '';

    // Expected-format key (when enabled) — the formatted/validated answer.
    const cfg = readFmt();
    if (cfg.on) {
      const fk = formatKey(text, cfg);
      const wrap = document.createElement('div');
      wrap.className = 'row-key';
      const key = document.createElement('code');
      key.className = 'key';
      key.textContent = fk.formatted || '—';
      key.title = 'Click to copy';
      if (fk.formatted) key.addEventListener('click', () => copy(fk.formatted, key));
      const flag = document.createElement('span');
      flag.className = `key-flag ${fk.ok ? 'ok' : 'warn'}`;
      flag.textContent = fk.ok ? `✓ ${fk.expected}` : `⚠ ${fk.n}/${fk.expected}`;
      flag.title = fk.ok ? 'Length matches expected' : 'Character count does not match — check this one';
      wrap.append(key, flag);
      row.appendChild(wrap);
    }

    const codes = findCodes(text);
    if (codes.length) {
      const wrap = document.createElement('div');
      wrap.className = 'row-codes';
      for (const c of codes) {
        const btn = document.createElement('button');
        btn.className = 'code';
        btn.title = 'Click to copy';
        btn.innerHTML = `<span></span><span class="copy">⧉</span>`;
        btn.firstChild.textContent = c;
        btn.addEventListener('click', () => copy(c, btn));
        wrap.appendChild(btn);
      }
      row.appendChild(wrap);
    }
    if (text) {
      const det = document.createElement('details');
      det.className = 'row-text';
      const sum = document.createElement('summary');
      const n = item.result?.lines?.length || 0;
      sum.textContent = codes.length ? `Full text (${n} line${n === 1 ? '' : 's'})` : `Text (${n} line${n === 1 ? '' : 's'})`;
      const pre = document.createElement('pre');
      pre.textContent = text;
      det.append(sum, pre);
      if (!codes.length) det.open = true;
      row.appendChild(det);
    } else {
      const e = document.createElement('div');
      e.className = 'row-empty';
      e.textContent = 'No text found — try a tighter box or a sharper shot.';
      row.appendChild(e);
    }
  } else if (item.status === 'error') {
    const e = document.createElement('div');
    e.className = 'row-empty';
    e.textContent = item.error || 'failed';
    row.appendChild(e);
  }
}

function updateStats() {
  if (!queue.length) { statsEl.textContent = ''; return; }
  const c = { done: 0, skipped: 0, error: 0, busy: 0, waiting: 0 };
  for (const q of queue) {
    if (q.status === 'done') c.done++;
    else if (q.status === 'skipped') c.skipped++;
    else if (q.status === 'error') c.error++;
    else if (q.status === 'waiting') c.waiting++;
    else c.busy++; // queued | running
  }
  const parts = [`${c.done} done`];
  if (c.busy) parts.push(`${c.busy} working`);
  if (c.waiting) parts.push(`${c.waiting} to box`);
  if (c.skipped) parts.push(`${c.skipped} skipped`);
  if (c.error) parts.push(`${c.error} failed`);
  statsEl.textContent = `· ${parts.join(' · ')} of ${queue.length}`;
}

// ---- export ----
function csvCell(s) { return `"${String(s ?? '').replace(/"/g, '""')}"`; }
function buildCsv() {
  const cfg = readFmt();
  const header = cfg.on ? ['file', 'status', 'formatted', 'valid', 'text'] : ['file', 'status', 'codes', 'text'];
  const lines = [header.join(',')];
  for (const q of queue) {
    if (q.status === 'waiting') continue;
    const text = q.result?.text || '';
    const tail = q.status === 'done' ? text : (q.error || '');
    let cols;
    if (cfg.on) {
      const fk = q.status === 'done' ? formatKey(text, cfg) : { formatted: '', ok: false };
      cols = [q.name, q.status, fk.formatted, q.status === 'done' ? (fk.ok ? 'ok' : 'check') : '', tail];
    } else {
      cols = [q.name, q.status, q.status === 'done' ? findCodes(text).join(' ') : '', tail];
    }
    lines.push(cols.map(csvCell).join(','));
  }
  return lines.join('\r\n');
}

// Re-render existing rows when the format settings change (live preview).
for (const el of [fmtOn, fmtGroups, fmtSize, fmtSep, fmtAlpha, fmtFix]) {
  el.addEventListener('input', () => { for (const q of queue) if (q.rowEl) renderRow(q); });
}

$('copyCsvBtn').addEventListener('click', (e) => { copy(buildCsv(), e.currentTarget); });
$('downloadCsvBtn').addEventListener('click', () => {
  const blob = new Blob([buildCsv()], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ocr-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---- entry points ----
drop.addEventListener('click', () => { if (!hasCurrent() && !queue.some((q) => q.status === 'waiting')) fileInput.click(); });
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('dragging');
  if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
});
wholeBtn.addEventListener('click', () => decide('whole'));
skipBtn.addEventListener('click', () => decide('skip'));
$('chooseBtn').addEventListener('click', () => fileInput.click());
$('folderBtn').addEventListener('click', () => folderInput.click());
$('cameraBtn').addEventListener('click', () => cameraInput.click());
fileInput.addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
folderInput.addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
cameraInput.addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
window.addEventListener('paste', (e) => {
  const imgs = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean);
  if (imgs.length) addFiles(imgs);
});
window.addEventListener('resize', () => { if (selRect) drawSelbox(selRect, { x: selRect.x + selRect.w, y: selRect.y + selRect.h }); });
