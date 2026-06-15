// photo.mino.mobi/dm — sign in, pick the group chat(s) you share with morphyx,
// pick one picture, and morphyx posts it to Bluesky (no commentary) and drops
// it into each selected group DM. All posting/DMing happens server-side in the
// worker (see ../dm-worker.js); this page authenticates the user, lets them
// choose targets, and ships the (compressed) image bytes.

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
  convosList: $('convos-list'),
  refreshConvos: $('refresh-convos'),
  drop: $('drop'),
  file: $('file'),
  previewWrap: $('preview-wrap'),
  previewImg: $('preview-img'),
  changeBtn: $('change-btn'),
  sendBtn: $('send-btn'),
  status: $('status'),
};

let selectedFile = null;
const selectedConvos = new Set();
let sending = false;

function show(el, on) { el.classList.toggle('hidden', !on); }

function setStatus(kind, html) {
  if (!html) { show(els.status, false); return; }
  els.status.className = `status ${kind}`;
  els.status.innerHTML = html;
  show(els.status, true);
}

function updateSendEnabled() {
  els.sendBtn.disabled = sending || !selectedFile || selectedConvos.size === 0;
}

function renderAuth(user) {
  show(els.boot, false);
  if (user) {
    els.who.textContent = '@' + (user.handle || user.did);
    show(els.authCard, false);
    show(els.appCard, true);
    loadConvos();
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
  selectedConvos.clear();
  renderAuth(null);
}

// ── Group chats (the whitelist) ───────────────────────────────────
function authHeaders() {
  const headers = {};
  const token = auth.getToken();
  if (token) headers['authorization'] = `Bearer ${token}`;
  return headers;
}

async function loadConvos() {
  els.convosList.innerHTML = '<div class="muted">Loading your group chats…</div>';
  try {
    const res = await fetch('/api/dm/convos', { credentials: 'include', headers: authHeaders() });
    if (res.status === 401) { await auth.logout(); renderAuth(null); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `request failed (${res.status})`);
    renderConvos(data.convos || []);
  } catch (e) {
    els.convosList.innerHTML = `<div class="status err">Couldn’t load chats: ${escapeHtml(e.message)}</div>`;
  }
}

function renderConvos(convos) {
  // Drop selections that no longer exist.
  const ids = new Set(convos.map((c) => c.id));
  for (const id of [...selectedConvos]) if (!ids.has(id)) selectedConvos.delete(id);

  if (convos.length === 0) {
    els.convosList.innerHTML =
      '<div class="muted">No group chats with morphyx yet. Add <strong>@morphyxmino.bsky.social</strong> to a Bluesky group DM, then hit Refresh.</div>';
    updateSendEnabled();
    return;
  }

  // Convenience: if there's exactly one and nothing chosen yet, pre-select it.
  if (convos.length === 1 && selectedConvos.size === 0) selectedConvos.add(convos[0].id);

  els.convosList.innerHTML = '';
  for (const c of convos) {
    const row = document.createElement('label');
    row.className = 'convo' + (selectedConvos.has(c.id) ? ' on' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedConvos.has(c.id);
    cb.addEventListener('change', () => {
      if (cb.checked) selectedConvos.add(c.id);
      else selectedConvos.delete(c.id);
      row.classList.toggle('on', cb.checked);
      updateSendEnabled();
    });

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = c.label;

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${c.memberCount} members`;

    row.append(cb, label, count);
    els.convosList.appendChild(row);
  }
  updateSendEnabled();
}

// ── Image selection ───────────────────────────────────────────────
function pickFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { setStatus('err', 'That’s not an image file.'); return; }
  selectedFile = file;
  els.previewImg.src = URL.createObjectURL(file);
  show(els.drop, false);
  show(els.previewWrap, true);
  updateSendEnabled();
  setStatus(null);
}

function clearFile() {
  selectedFile = null;
  els.file.value = '';
  if (els.previewImg.src) URL.revokeObjectURL(els.previewImg.src);
  els.previewImg.removeAttribute('src');
  show(els.previewWrap, false);
  show(els.drop, true);
  updateSendEnabled();
}

// Decode, downscale, and compress to stay under Bluesky's blob ceiling.
// Small images that already fit are sent untouched (preserves PNG/GIF/quality).
async function prepareImage(file) {
  const bitmap = await loadImage(file);
  const natW = bitmap.naturalWidth || bitmap.width;
  const natH = bitmap.naturalHeight || bitmap.height;

  if (file.size <= TARGET_BYTES && Math.max(natW, natH) <= MAX_DIM) {
    return { blob: file, width: natW, height: natH };
  }

  let scale = Math.min(1, MAX_DIM / Math.max(natW, natH));
  let quality = 0.92;
  for (let attempt = 0; attempt < 9; attempt++) {
    const w = Math.max(1, Math.round(natW * scale));
    const h = Math.max(1, Math.round(natH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (blob && blob.size <= TARGET_BYTES) return { blob, width: w, height: h };
    if (quality > 0.5) quality -= 0.12;
    else scale *= 0.82;
  }
  throw new Error('could not compress this image small enough — try a smaller one');
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not read that image')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// ── Send ──────────────────────────────────────────────────────────
async function doSend() {
  if (!selectedFile || selectedConvos.size === 0 || sending) return;
  sending = true;
  updateSendEnabled();
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
    fd.append('convoIds', JSON.stringify([...selectedConvos]));

    const res = await fetch('/api/dm/post', {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
      body: fd,
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      setStatus('err', 'Your session expired — please sign in again.');
      await auth.logout();
      renderAuth(null);
      return;
    }
    if (!res.ok || !data.ok) throw new Error(data.error || `request failed (${res.status})`);

    const n = (data.sent || []).length;
    let msg = `Done — sent to ${n} group${n === 1 ? '' : 's'}. <a href="${data.post.url}" target="_blank" rel="noopener">View the post →</a>`;
    if ((data.failed || []).length) msg += `<br><span class="muted">${data.failed.length} couldn’t be delivered.</span>`;
    setStatus('ok', msg);
    clearFile();
  } catch (e) {
    setStatus('err', `Couldn’t send: ${escapeHtml(e.message)}`);
  } finally {
    sending = false;
    els.changeBtn.disabled = false;
    els.sendBtn.textContent = 'Send to the group';
    updateSendEnabled();
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
  els.refreshConvos.addEventListener('click', loadConvos);

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
