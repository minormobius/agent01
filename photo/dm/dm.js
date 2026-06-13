// photo.mino.mobi/dm — sign in, pick one picture, and morphyx posts it to
// Bluesky (no commentary) and drops it into the group DM. All the posting and
// DMing happens server-side in the worker (see ../dm-worker.js); this page only
// authenticates the user and ships the (compressed) image bytes.

import { AuthClient } from '../../packages/oauth-client/auth.js';

const auth = new AuthClient();

// Bluesky rejects image blobs > 1,000,000 bytes; keep a margin.
const TARGET_BYTES = 950_000;
const MAX_DIM = 1920;

const $ = (id) => document.getElementById(id);
const els = {
  boot: $('boot'),
  authCard: $('auth-card'),
  appCard: $('app-card'),
  handle: $('handle'),
  loginBtn: $('login-btn'),
  logoutBtn: $('logout-btn'),
  who: $('who'),
  drop: $('drop'),
  file: $('file'),
  previewWrap: $('preview-wrap'),
  previewImg: $('preview-img'),
  changeBtn: $('change-btn'),
  sendBtn: $('send-btn'),
  status: $('status'),
};

let selectedFile = null;
let sending = false;

function show(el, on) { el.classList.toggle('hidden', !on); }

function setStatus(kind, html) {
  if (!html) { show(els.status, false); return; }
  els.status.className = `status ${kind}`;
  els.status.innerHTML = html;
  show(els.status, true);
}

function renderAuth(user) {
  show(els.boot, false);
  if (user) {
    els.who.textContent = '@' + (user.handle || user.did);
    show(els.authCard, false);
    show(els.appCard, true);
  } else {
    show(els.appCard, false);
    show(els.authCard, true);
    els.handle.focus();
  }
}

// ── Auth ──────────────────────────────────────────────────────────
async function doLogin() {
  const handle = els.handle.value.trim().replace(/^@/, '');
  if (!handle) { els.handle.focus(); return; }
  els.loginBtn.disabled = true;
  els.loginBtn.textContent = 'Redirecting…';
  try {
    // Identity-only scope: this page never writes to the user's repo.
    await auth.login(handle, { scope: 'atproto' });
  } catch (e) {
    els.loginBtn.disabled = false;
    els.loginBtn.textContent = 'Sign in with Bluesky';
    setStatus('err', `Sign-in failed: ${escapeHtml(e.message)}`);
  }
}

async function doLogout() {
  await auth.logout();
  selectedFile = null;
  renderAuth(null);
}

// ── Image selection ───────────────────────────────────────────────
function pickFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    setStatus('err', 'That’s not an image file.');
    return;
  }
  selectedFile = file;
  els.previewImg.src = URL.createObjectURL(file);
  show(els.drop, false);
  show(els.previewWrap, true);
  els.sendBtn.disabled = false;
  setStatus(null);
}

function clearFile() {
  selectedFile = null;
  els.file.value = '';
  if (els.previewImg.src) URL.revokeObjectURL(els.previewImg.src);
  els.previewImg.removeAttribute('src');
  show(els.previewWrap, false);
  show(els.drop, true);
  els.sendBtn.disabled = true;
}

// Decode, downscale, and compress to stay under Bluesky's blob ceiling.
// Small images that already fit are sent untouched (preserves PNG/GIF/quality).
async function prepareImage(file) {
  const bitmap = await loadImage(file);
  const natW = bitmap.naturalWidth || bitmap.width;
  const natH = bitmap.naturalHeight || bitmap.height;

  const fitsRaw = file.size <= TARGET_BYTES && Math.max(natW, natH) <= MAX_DIM;
  if (fitsRaw) {
    return { blob: file, mime: file.type, width: natW, height: natH };
  }

  let scale = Math.min(1, MAX_DIM / Math.max(natW, natH));
  let quality = 0.92;
  for (let attempt = 0; attempt < 9; attempt++) {
    const w = Math.max(1, Math.round(natW * scale));
    const h = Math.max(1, Math.round(natH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (blob && blob.size <= TARGET_BYTES) {
      return { blob, mime: 'image/jpeg', width: w, height: h };
    }
    // Too big: drop quality first, then dimensions.
    if (quality > 0.5) quality -= 0.12;
    else scale *= 0.82;
  }
  throw new Error('could not compress this image small enough — try a smaller one');
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not read that image')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// ── Send ──────────────────────────────────────────────────────────
async function doSend() {
  if (!selectedFile || sending) return;
  sending = true;
  els.sendBtn.disabled = true;
  els.changeBtn.disabled = true;
  els.sendBtn.innerHTML = '<span class="spinner"></span>Preparing…';
  setStatus(null);

  try {
    const { blob, width, height } = await prepareImage(selectedFile);
    els.sendBtn.innerHTML = '<span class="spinner"></span>Posting & sending…';

    const fd = new FormData();
    fd.append('image', blob, 'image');
    fd.append('width', String(width));
    fd.append('height', String(height));

    const headers = {};
    const token = auth.getToken();
    if (token) headers['authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/dm/post', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: fd,
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      setStatus('err', 'Your session expired — please sign in again.');
      await auth.logout();
      renderAuth(null);
      return;
    }
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `request failed (${res.status})`);
    }

    setStatus('ok', `Done — it’s in the group chat. <a href="${data.post.url}" target="_blank" rel="noopener">View the post →</a>`);
    clearFile();
  } catch (e) {
    setStatus('err', `Couldn’t send: ${escapeHtml(e.message)}`);
  } finally {
    sending = false;
    els.changeBtn.disabled = false;
    els.sendBtn.textContent = 'Send to the group';
    els.sendBtn.disabled = !selectedFile;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Wiring ────────────────────────────────────────────────────────
function bindUI() {
  els.loginBtn.addEventListener('click', doLogin);
  els.handle.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  els.logoutBtn.addEventListener('click', doLogout);

  els.drop.addEventListener('click', () => els.file.click());
  els.changeBtn.addEventListener('click', () => els.file.click());
  els.file.addEventListener('change', (e) => pickFile(e.target.files[0]));

  els.drop.addEventListener('dragover', (e) => { e.preventDefault(); els.drop.classList.add('hot'); });
  els.drop.addEventListener('dragleave', () => els.drop.classList.remove('hot'));
  els.drop.addEventListener('drop', (e) => {
    e.preventDefault();
    els.drop.classList.remove('hot');
    pickFile(e.dataTransfer.files[0]);
  });

  els.sendBtn.addEventListener('click', doSend);
}

async function main() {
  bindUI();
  try {
    const user = await auth.init();
    renderAuth(user);
  } catch {
    renderAuth(null);
  }
}

main();
