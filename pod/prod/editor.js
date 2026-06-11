// pod/prod — clip-based, mobile-first multitrack editor.
//
// Loads a com.minomobi.podcast.session, reassembles + decodes every track, and
// places each as a CLIP on its own lane (positioned by localStartOffsetMs, so
// the recorded alignment is the starting point). Clips can be moved (drag body),
// cropped (drag an edge), duplicated, deleted, gain-adjusted, muted, and — for
// voice — run through a filter. 8-bit music blocks are added the same way and
// placed freely against the voices. Live preview, render-to-WAV, and publish all
// run off one scheduleClips() pass.

import { getRecord, getBlob, blobCid, parseAtUri } from '../lib/atproto-read.js';
import { BEDS, bedById, renderBed } from '../lib/chiptune.js';
import { FILTERS, applyFilterBuffer } from '../lib/filters.js';
import { AuthClient } from '../lib/auth.js';

const SCOPE = 'atproto transition:generic';
const MUSIC_BLOCK_SEC = 8;

const $ = (id) => document.getElementById(id);
function log(...a) {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  $('log').textContent += line + '\n';
  $('log').scrollTop = $('log').scrollHeight;
}

// ---- state -----------------------------------------------------------------
let audioCtx = null;
let lanes = [];   // { id, kind:'voice'|'music', label }
let clips = [];   // see makeClip
let selectedId = null;
let pxPerSec = 60;
let musicLaneId = null;

let minOffset = 0;
let loadedSessionUri = '';
let sessionRkey = '';

const auth = new AuthClient();
let authUser = null;

let activeNodes = [];
let rafId = 0;
let playAnchorCtx = 0;
let drag = null;

// ---- helpers ---------------------------------------------------------------
let _uid = 0;
const uid = () => 'c' + (++_uid);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clipById = (id) => clips.find((c) => c.id === id);
const clipSpanMs = (c) => c.outMs - c.inMs;
const clipEndMs = (c) => c.startMs + clipSpanMs(c);
const effDurMs = (c) => (c.effBuffer ? c.effBuffer.duration * 1000 : 0);
const projectEndMs = () => clips.reduce((m, c) => Math.max(m, clipEndMs(c)), 0);
const ms2px = (ms) => (ms / 1000) * pxPerSec;

function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// ---- boot ------------------------------------------------------------------
const params = new URLSearchParams(location.search);
if (params.get('s')) $('sessionInput').value = params.get('s');

$('loadBtn').addEventListener('click', loadSession);
$('playBtn').addEventListener('click', playMix);
$('stopBtn').addEventListener('click', stopMix);
$('renderBtn').addEventListener('click', renderDownload);
$('zoomIn').addEventListener('click', () => setZoom(pxPerSec * 1.4));
$('zoomOut').addEventListener('click', () => setZoom(pxPerSec / 1.4));
$('addMusicBtn').addEventListener('click', addMusicBlock);
$('publishBtn').addEventListener('click', publishEpisode);
$('pubSignIn').addEventListener('click', pubSignIn);

// inspector controls
$('insGain').addEventListener('input', () => {
  const c = clipById(selectedId); if (!c) return;
  c.gain = +$('insGain').value / 100;
  $('insGainVal').textContent = $('insGain').value + '%';
});
$('insMute').addEventListener('click', () => {
  const c = clipById(selectedId); if (!c) return;
  c.muted = !c.muted; updateInspector(); renderLanes();
});
$('insFilter').addEventListener('change', () => applyFilter(clipById(selectedId), $('insFilter').value));
$('nudgeL').addEventListener('click', () => nudge(-100));
$('nudgeR').addEventListener('click', () => nudge(100));
$('dupBtn').addEventListener('click', duplicateSelected);
$('delBtn').addEventListener('click', deleteSelected);

// populate selects
BEDS.forEach((b) => addOption($('bedSelect'), b.id, `${b.name}`));
FILTERS.forEach((f) => addOption($('insFilter'), f.id, f.label));

// timeline drag
$('tlLanes').addEventListener('pointerdown', onPointerDown);

(async () => { try { authUser = await auth.init(); } catch (_) {} refreshAuthUi(); })();
if (params.get('s')) loadSession();

function addOption(sel, value, text) {
  const o = document.createElement('option');
  o.value = value; o.textContent = text; sel.appendChild(o);
}

// ---- load ------------------------------------------------------------------
async function loadSession() {
  const uri = $('sessionInput').value.trim();
  if (!uri) return;
  loadedSessionUri = uri;
  try { sessionRkey = parseAtUri(uri).rkey; } catch { sessionRkey = 'mix'; }
  $('editor').style.display = $('publishPanel').style.display = 'none';
  lanes = []; clips = []; selectedId = null; musicLaneId = null;

  try {
    log('loading session', uri);
    const sess = await getRecord(uri);
    const trackUris = sess.value.tracks || [];
    log(`session has ${trackUris.length} track(s)`);
    if (!trackUris.length) { log('no tracks referenced — finalize the session in /room first.'); return; }

    ensureAudioCtx();
    const raw = [];
    for (const tUri of trackUris) {
      try { raw.push(await loadTrack(tUri)); }
      catch (e) { log('  track failed:', tUri, '—', e.message || e); }
    }
    if (!raw.length) { log('no playable tracks decoded.'); return; }

    minOffset = Math.min(...raw.map((r) => r.offsetMs));
    for (const r of raw) {
      const lane = { id: uid(), kind: 'voice', label: '@' + r.handle };
      lanes.push(lane);
      clips.push(makeClip({
        laneId: lane.id, kind: 'voice', name: '@' + r.handle,
        sourceBuffer: r.buffer, startMs: Math.round(r.offsetMs - minOffset),
        inMs: 0, outMs: Math.round(r.durationMs),
      }));
    }
    $('editor').style.display = $('publishPanel').style.display = '';
    renderAll(); // editor visible first so tlScroll.clientWidth is correct
    refreshAuthUi();
    log('loaded', clips.length, 'clips. Drag to move; grab an edge to crop.');
  } catch (e) {
    log('ERROR:', e.message || e);
  }
}

async function loadTrack(tUri) {
  const { did } = parseAtUri(tUri);
  const rec = await getRecord(tUri);
  const v = rec.value;
  const refs = v.chunks || [];
  const parts = [];
  for (const ref of refs) parts.push(await getBlob(did, blobCid(ref)));
  const blob = new Blob(parts, { type: (v.mimeType || 'audio/webm').split(';')[0] });
  const buffer = await audioCtx.decodeAudioData((await blob.arrayBuffer()).slice(0));
  log(`  track ${v.participant?.handle || did}: ${refs.length} chunk(s), offset ${v.localStartOffsetMs} ms`);
  return {
    did,
    handle: v.participant?.handle || did.slice(0, 12) + '…',
    buffer,
    offsetMs: v.localStartOffsetMs || 0,
    durationMs: v.durationMs || buffer.duration * 1000,
  };
}

function makeClip(o) {
  return {
    id: uid(),
    laneId: o.laneId,
    kind: o.kind,
    name: o.name,
    sourceBuffer: o.sourceBuffer,
    effBuffer: o.sourceBuffer,   // === source until a filter is applied
    filterId: 'none',
    gain: o.gain ?? 1,
    muted: false,
    startMs: o.startMs || 0,
    inMs: o.inMs || 0,
    outMs: o.outMs,
    bedId: o.bedId || null,
  };
}

// ---- music blocks ----------------------------------------------------------
async function addMusicBlock() {
  ensureAudioCtx();
  const b = bedById($('bedSelect').value) || BEDS[0];
  $('addMusicBtn').disabled = true;
  try {
    const buf = await renderBed(b.comp, MUSIC_BLOCK_SEC, audioCtx.sampleRate);
    if (!musicLaneId) {
      const lane = { id: uid(), kind: 'music', label: 'Music' };
      lanes.push(lane); musicLaneId = lane.id;
    }
    const c = makeClip({
      laneId: musicLaneId, kind: 'music', name: b.name,
      sourceBuffer: buf, startMs: 0, inMs: 0, outMs: MUSIC_BLOCK_SEC * 1000, gain: 0.4, bedId: b.id,
    });
    clips.push(c);
    selectedId = c.id;
    renderAll();
    log('added music block:', b.name, '— drag it where you want it');
  } catch (e) {
    log('music error:', e.message || e);
  } finally {
    $('addMusicBtn').disabled = false;
  }
}

// ---- filters ---------------------------------------------------------------
async function applyFilter(c, id) {
  if (!c) return;
  c.filterId = id;
  if (id === 'none') {
    c.effBuffer = c.sourceBuffer;
  } else {
    $('insName').textContent = c.name + ' · filtering…';
    try { c.effBuffer = await applyFilterBuffer(c.sourceBuffer, id); }
    catch (e) { log('filter error:', e.message || e); c.effBuffer = c.sourceBuffer; c.filterId = 'none'; }
  }
  // a length-changing filter (pitch) can invalidate the crop
  const dur = effDurMs(c);
  if (c.inMs >= dur) c.inMs = 0;
  c.outMs = clamp(c.outMs, c.inMs + 50, dur);
  renderLanes(); updateInspector();
}

// ---- inspector actions -----------------------------------------------------
function nudge(ms) {
  const c = clipById(selectedId); if (!c) return;
  c.startMs = Math.max(0, c.startMs + ms);
  renderLanes(); updateInspector();
}
function duplicateSelected() {
  const c = clipById(selectedId); if (!c) return;
  const copy = makeClip({
    laneId: c.laneId, kind: c.kind, name: c.name, sourceBuffer: c.sourceBuffer,
    startMs: clipEndMs(c), inMs: c.inMs, outMs: c.outMs, gain: c.gain, bedId: c.bedId,
  });
  copy.filterId = c.filterId; copy.effBuffer = c.effBuffer;
  clips.push(copy); selectedId = copy.id; renderAll();
  log('duplicated', c.name);
}
function deleteSelected() {
  const c = clipById(selectedId); if (!c) return;
  clips = clips.filter((x) => x.id !== c.id);
  selectedId = null; renderAll();
}

// ---- pointer drag (move / crop) --------------------------------------------
function onPointerDown(e) {
  const clipEl = e.target.closest('.clip');
  if (!clipEl) { select(null); return; }
  const id = clipEl.dataset.id;
  select(id);
  const c = clipById(id); if (!c) return;
  let mode = 'move';
  if (e.target.classList.contains('handle')) mode = e.target.classList.contains('l') ? 'cropL' : 'cropR';
  drag = { id, mode, startX: e.clientX, orig: { start: c.startMs, in: c.inMs, out: c.outMs }, el: clipEl };
  e.preventDefault();
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragUp, { once: true });
}
function onDragMove(e) {
  if (!drag) return;
  const c = clipById(drag.id); if (!c) return;
  const dms = ((e.clientX - drag.startX) / pxPerSec) * 1000;
  if (drag.mode === 'move') {
    c.startMs = Math.max(0, Math.round(drag.orig.start + dms));
  } else if (drag.mode === 'cropL') {
    const ni = clamp(drag.orig.in + dms, 0, drag.orig.out - 100);
    c.inMs = Math.round(ni);
    c.startMs = Math.max(0, Math.round(drag.orig.start + (ni - drag.orig.in)));
  } else {
    c.outMs = Math.round(clamp(drag.orig.out + dms, c.inMs + 100, effDurMs(c)));
  }
  positionClipEl(drag.el, c);
  growLanes();
  updateInsPos(c);
}
function onDragUp() {
  window.removeEventListener('pointermove', onDragMove);
  drag = null;
  renderLanes(); updateInspector();
}

// ---- rendering -------------------------------------------------------------
function renderAll() { renderGutter(); renderLanes(); updateInspector(); }

function renderGutter() {
  $('tlGutter').innerHTML = lanes
    .map((l) => `<div class="lane-lbl ${l.kind === 'music' ? 'music' : ''}">${escapeHtml(l.label)}</div>`)
    .join('');
}

function renderLanes() {
  const widthPx = Math.max($('tlScroll').clientWidth, ms2px(projectEndMs()) + 48);
  const grid = `repeating-linear-gradient(90deg, transparent 0, transparent ${pxPerSec - 1}px, rgba(255,255,255,.045) ${pxPerSec - 1}px, rgba(255,255,255,.045) ${pxPerSec}px)`;
  const lanesHtml = lanes.map((l) => {
    const inner = clips.filter((c) => c.laneId === l.id).map(clipHtml).join('');
    return `<div class="lane" data-lane="${l.id}" style="background-image:${grid}">${inner}</div>`;
  }).join('');
  $('tlLanes').style.width = widthPx + 'px';
  $('tlLanes').innerHTML = lanesHtml + '<div class="play-head" id="playHead"></div>';
  updateProjMeta();
}

function clipHtml(c) {
  const left = ms2px(c.startMs);
  const width = Math.max(6, ms2px(clipSpanMs(c)));
  const cls = ['clip', c.kind === 'music' ? 'music' : '', c.id === selectedId ? 'sel' : '', c.muted ? 'muted' : ''].join(' ');
  const label = c.name + (c.kind === 'voice' && c.filterId !== 'none' ? ` · ${c.filterId}` : '') + (c.muted ? ' · muted' : '');
  return `<div class="${cls}" data-id="${c.id}" style="left:${left}px; width:${width}px; ${c.muted ? 'opacity:.5' : ''}">
    <div class="handle l"></div>
    <div class="body"><span class="clabel">${escapeHtml(label)}</span></div>
    <div class="handle r"></div>
  </div>`;
}

function positionClipEl(el, c) {
  el.style.left = ms2px(c.startMs) + 'px';
  el.style.width = Math.max(6, ms2px(clipSpanMs(c))) + 'px';
}
function growLanes() {
  const widthPx = Math.max($('tlScroll').clientWidth, ms2px(projectEndMs()) + 48);
  $('tlLanes').style.width = widthPx + 'px';
  updateProjMeta();
}
function updateProjMeta() {
  $('projMeta').textContent = `${clips.length} clips · ${(projectEndMs() / 1000).toFixed(1)}s · ${Math.round(pxPerSec)}px/s`;
}

function setZoom(px) {
  pxPerSec = clamp(px, 16, 260);
  renderLanes();
}

// ---- selection / inspector -------------------------------------------------
function select(id) {
  selectedId = id;
  document.querySelectorAll('.clip').forEach((el) => el.classList.toggle('sel', el.dataset.id === id));
  updateInspector();
}
function updateInspector() {
  const c = clipById(selectedId);
  $('insEmpty').style.display = c ? 'none' : '';
  $('insBody').style.display = c ? '' : 'none';
  if (!c) return;
  $('insName').textContent = c.name + (c.kind === 'music' ? ' · music' : '');
  updateInsPos(c);
  $('insGain').value = Math.round(c.gain * 100);
  $('insGainVal').textContent = Math.round(c.gain * 100) + '%';
  $('insMute').classList.toggle('on', c.muted);
  $('insMute').textContent = c.muted ? 'Unmute' : 'Mute';
  const isVoice = c.kind === 'voice';
  $('insFilterK').style.display = isVoice ? '' : 'none';
  $('insFilterWrap').style.display = isVoice ? '' : 'none';
  if (isVoice) $('insFilter').value = c.filterId;
}
function updateInsPos(c) {
  $('insPos').textContent = `start ${(c.startMs / 1000).toFixed(2)}s · length ${(clipSpanMs(c) / 1000).toFixed(2)}s`;
}

// ---- scheduling / playback -------------------------------------------------
function scheduleClips(ctx, dest, fromMs, toMs, startAt) {
  const nodes = [];
  for (const c of clips) {
    if (c.muted || !c.effBuffer) continue;
    const cStart = c.startMs, cEnd = clipEndMs(c);
    const segStart = Math.max(cStart, fromMs), segEnd = Math.min(cEnd, toMs);
    if (segEnd <= segStart) continue;
    const when = (segStart - fromMs) / 1000;
    const bufOff = (c.inMs + (segStart - cStart)) / 1000;
    if (bufOff >= c.effBuffer.duration) continue;
    const playDur = Math.min((segEnd - segStart) / 1000, c.effBuffer.duration - bufOff);
    if (playDur <= 0) continue;
    const src = ctx.createBufferSource(); src.buffer = c.effBuffer;
    const g = ctx.createGain(); g.gain.value = c.gain;
    src.connect(g); g.connect(dest);
    src.start(startAt + when, bufOff, playDur);
    nodes.push(src);
  }
  return nodes;
}

async function playMix() {
  stopMix();
  ensureAudioCtx();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  const end = projectEndMs();
  if (end <= 0) return;
  const startAt = audioCtx.currentTime + 0.12;
  playAnchorCtx = startAt;
  activeNodes = scheduleClips(audioCtx, audioCtx.destination, 0, end, startAt);
  $('playBtn').disabled = true; $('stopBtn').disabled = false;
  animateHead(end);
}
function stopMix() {
  for (const n of activeNodes) { try { n.stop(); } catch {} }
  activeNodes = [];
  cancelAnimationFrame(rafId);
  $('playBtn').disabled = false; $('stopBtn').disabled = true;
  const head = $('playHead'); if (head) head.style.display = 'none';
}
function animateHead(endMs) {
  const step = () => {
    const head = $('playHead'); if (!head) return;
    const elapsedMs = (audioCtx.currentTime - playAnchorCtx) * 1000;
    if (elapsedMs > endMs) { stopMix(); return; }
    head.style.display = 'block';
    head.style.left = ms2px(Math.max(0, elapsedMs)) + 'px';
    rafId = requestAnimationFrame(step);
  };
  step();
}

// ---- render / export -------------------------------------------------------
async function renderMix() {
  const sr = 44100;
  const end = projectEndMs();
  const off = new OfflineAudioContext(2, Math.ceil((end / 1000) * sr) + Math.ceil(0.2 * sr), sr);
  scheduleClips(off, off.destination, 0, end, 0);
  const rendered = await off.startRendering();
  return { blob: encodeWav(rendered), durationSec: end / 1000 };
}
async function renderDownload() {
  if (!clips.length) return;
  $('renderBtn').disabled = true;
  $('renderStat').textContent = 'rendering…';
  try {
    const { blob } = await renderMix();
    downloadBlob(blob, `pod-${sessionRkey}.wav`);
    $('renderStat').textContent = `${(blob.size / 1024 / 1024).toFixed(1)} MB`;
  } catch (e) {
    $('renderStat').textContent = 'failed';
    log('render error:', e.message || e);
  } finally {
    $('renderBtn').disabled = false;
  }
}

// ---- publish ---------------------------------------------------------------
function refreshAuthUi() {
  const signedIn = !!authUser;
  $('authRow').style.display = signedIn ? 'none' : 'flex';
  $('pubWho').textContent = signedIn ? `publishing as @${authUser.handle || authUser.did}` : '';
}
async function pubSignIn() {
  const handle = $('pubHandle').value.trim();
  if (!handle) return;
  try { await auth.login(handle, { scope: SCOPE }); }
  catch (e) { $('pubStatus').textContent = e.message || String(e); }
}
async function publishEpisode() {
  if (!authUser) { $('authRow').style.display = 'flex'; $('pubStatus').textContent = 'Sign in to publish.'; $('pubHandle').focus(); return; }
  if (!clips.length) return;
  $('publishBtn').disabled = true;
  try {
    $('pubStatus').textContent = 'rendering mixdown…';
    const { blob, durationSec } = await renderMix();
    if (blob.size > 80 * 1024 * 1024) log('⚠️ mixdown is', (blob.size / 1024 / 1024).toFixed(0), 'MB (WAV); MP3/Opus encoding is the next optimization.');

    const CHUNK = 4 * 1024 * 1024;
    const refs = [];
    const total = Math.ceil(blob.size / CHUNK);
    for (let i = 0; i < blob.size; i += CHUNK) {
      const part = blob.slice(i, Math.min(i + CHUNK, blob.size));
      refs.push(await auth.pds.uploadBlob(await part.arrayBuffer(), 'audio/wav'));
      $('pubStatus').textContent = `uploading ${refs.length}/${total}…`;
    }
    const record = {
      $type: 'com.minomobi.podcast.episode',
      title: $('epTitle').value.trim() || 'Episode ' + new Date().toISOString().slice(0, 10),
      description: $('epDesc').value.trim() || '',
      audio: refs, mimeType: 'audio/wav',
      lengthBytes: blob.size, durationSec: Math.round(durationSec),
      pubDate: new Date().toISOString(), createdAt: new Date().toISOString(),
    };
    if (loadedSessionUri) record.session = loadedSessionUri;

    $('pubStatus').textContent = 'writing episode record…';
    const res = await auth.pds.createRecord('com.minomobi.podcast.episode', record);
    $('pubStatus').textContent = 'registering on feed…';
    const pr = await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uri: res.uri }) });
    const pj = await pr.json();
    if (!pr.ok) throw new Error(pj.error || 'publish failed');
    $('pubStatus').textContent = 'published ✓';
    const who = encodeURIComponent(authUser.handle || authUser.did);
    $('pubResult').innerHTML = `Published to your PDS. → <a class="inline" href="/listen?handle=${who}">your show</a> · ` +
      `<a class="inline" href="/u/${who}/feed.xml">your RSS feed</a> (owned by your PDS) · ` +
      `<a class="inline" href="/listen/">communal feed</a>`;
    log('published episode:', res.uri);
    log('your PDS-owned feed: https://pod.mino.mobi/u/' + (authUser.handle || authUser.did) + '/feed.xml');
  } catch (e) {
    $('pubStatus').textContent = 'failed';
    log('publish error:', e.message || e);
  } finally {
    $('publishBtn').disabled = false;
  }
}

// ---- wav / util ------------------------------------------------------------
function encodeWav(buffer) {
  const numCh = buffer.numberOfChannels, length = buffer.length, sampleRate = buffer.sampleRate;
  const bufSize = 44 + length * numCh * 2;
  const ab = new ArrayBuffer(bufSize);
  const view = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); view.setUint32(4, bufSize - 8, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true);
  ws(36, 'data'); view.setUint32(40, length * numCh * 2, true);
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
