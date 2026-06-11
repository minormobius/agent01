// pod/prod — the editing room.
//
// Loads a com.minomobi.podcast.session, pulls every participant's chunked track
// across PDSes, reassembles + decodes each, and lays them on one aligned
// timeline (by the captured localStartOffsetMs). From there: per-track levels +
// mute/solo, a master in/out trim, an 8-bit MUSIC BED rendered from /music's
// chiptune engine, live preview, and a render-down to WAV.

import { getRecord, getBlob, blobCid, parseAtUri } from '../lib/atproto-read.js';
import { BEDS, bedById, renderBed } from '../lib/chiptune.js';

const $ = (id) => document.getElementById(id);
function log(...a) {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  $('log').textContent += line + '\n';
  $('log').scrollTop = $('log').scrollHeight;
}

// ---- state -----------------------------------------------------------------
let tracks = [];          // { did, handle, offsetMs, durationMs, buffer, gain, muted, solo, blobUrl }
let minOffset = 0;
let timelineMs = 0;
let sessionRkey = '';
let audioCtx = null;

let trimInMs = 0;
let trimOutMs = 0;

const bed = { enabled: false, id: BEDS[0].id, gain: 0.22, buffer: null, bufferFor: null };

let activeNodes = [];
let rafId = 0;
let playAnchorCtx = 0; // ctx time at which the trim-in point plays

// ---- boot ------------------------------------------------------------------
const params = new URLSearchParams(location.search);
if (params.get('s')) { $('sessionInput').value = params.get('s'); }

$('loadBtn').addEventListener('click', loadSession);
$('playBtn').addEventListener('click', playMix);
$('stopBtn').addEventListener('click', stopMix);
$('renderBtn').addEventListener('click', renderDownload);
$('trimIn').addEventListener('input', onTrim);
$('trimOut').addEventListener('input', onTrim);
$('bedToggle').addEventListener('click', toggleBed);
$('bedPreview').addEventListener('click', previewBed);
$('bedGain').addEventListener('input', () => {
  bed.gain = +$('bedGain').value / 100;
  $('bedGainVal').textContent = $('bedGain').value + '%';
});
BEDS.forEach((b) => {
  const o = document.createElement('option');
  o.value = b.id; o.textContent = `${b.name} · ${b.mood}`;
  $('bedSelect').appendChild(o);
});
$('bedSelect').addEventListener('change', () => { bed.id = $('bedSelect').value; bed.buffer = null; });

if (params.get('s')) loadSession();

function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// ---- load ------------------------------------------------------------------
async function loadSession() {
  const uri = $('sessionInput').value.trim();
  if (!uri) return;
  $('editorPanel').style.display = $('mixPanel').style.display = $('transportPanel').style.display = 'none';
  tracks = [];
  bed.buffer = null;
  try {
    sessionRkey = parseAtUri(uri).rkey;
  } catch { sessionRkey = 'mix'; }

  try {
    log('loading session', uri);
    const sess = await getRecord(uri);
    const trackUris = sess.value.tracks || [];
    log(`session has ${trackUris.length} track(s); epoch ${sess.value.epochMs}`);
    if (!trackUris.length) { log('no tracks referenced — finalize the session in /room first.'); return; }

    ensureAudioCtx();
    for (const tUri of trackUris) {
      try { await loadTrack(tUri); }
      catch (e) { log('  track failed:', tUri, '—', e.message || e); }
    }
    if (!tracks.length) { log('no playable tracks decoded.'); return; }

    minOffset = Math.min(...tracks.map((t) => t.offsetMs));
    timelineMs = Math.max(...tracks.map((t) => t.offsetMs - minOffset + t.durationMs));
    trimInMs = 0;
    trimOutMs = timelineMs;
    $('trimIn').value = 0;
    $('trimOut').value = 1000;
    renderTimeline();
    onTrim();
    $('editorPanel').style.display = $('mixPanel').style.display = $('transportPanel').style.display = '';
  } catch (e) {
    log('ERROR:', e.message || e);
  }
}

async function loadTrack(tUri) {
  const { did } = parseAtUri(tUri);
  const rec = await getRecord(tUri);
  const v = rec.value;
  const refs = v.chunks || [];
  log(`  track ${v.participant?.handle || did}: ${refs.length} chunk(s), offset ${v.localStartOffsetMs} ms`);

  const parts = [];
  for (const ref of refs) parts.push(await getBlob(did, blobCid(ref)));
  const blob = new Blob(parts, { type: (v.mimeType || 'audio/webm').split(';')[0] });
  const buf = await blob.arrayBuffer();

  let buffer = null;
  try { buffer = await audioCtx.decodeAudioData(buf.slice(0)); }
  catch (e) { log('    decodeAudioData failed (' + (e.message || e) + ')'); }

  tracks.push({
    did,
    handle: v.participant?.handle || shortDid(did),
    offsetMs: v.localStartOffsetMs || 0,
    durationMs: v.durationMs || (buffer ? buffer.duration * 1000 : 0),
    buffer,
    gain: 1,
    muted: false,
    solo: false,
  });
}

// ---- timeline / controls ---------------------------------------------------
function renderTimeline() {
  const el = $('tracks');
  el.innerHTML = tracks
    .map((t, i) => {
      const left = ((t.offsetMs - minOffset) / timelineMs) * 100;
      const width = Math.max(1, (t.durationMs / timelineMs) * 100);
      return `<div class="track" data-i="${i}">
        <div class="head">
          <span class="name">@${escapeHtml(t.handle)}</span>
          <button class="tiny muted-btn" data-act="mute" data-i="${i}">M</button>
          <button class="tiny muted-btn" data-act="solo" data-i="${i}">S</button>
          <span class="off">+${Math.round(t.offsetMs - minOffset)} ms · ${(t.durationMs / 1000).toFixed(1)} s${t.buffer ? '' : ' · decode failed'}</span>
          <span class="grow"></span>
          <input type="range" min="0" max="150" value="100" data-act="gain" data-i="${i}" />
        </div>
        <div class="lane">
          <div class="trim-shade shade-l" data-i="${i}" style="left:0; width:0"></div>
          <div class="bar" style="left:${left}%; width:${width}%"></div>
          <div class="trim-shade shade-r" data-i="${i}" style="right:0; width:0"></div>
        </div>
      </div>`;
    })
    .join('');
  el.querySelectorAll('button[data-act]').forEach((b) => b.addEventListener('click', onTrackBtn));
  el.querySelectorAll('input[data-act="gain"]').forEach((s) => s.addEventListener('input', onGain));
}

function onTrackBtn(e) {
  const i = +e.target.dataset.i;
  const act = e.target.dataset.act;
  if (act === 'mute') tracks[i].muted = !tracks[i].muted;
  if (act === 'solo') tracks[i].solo = !tracks[i].solo;
  e.target.classList.toggle('on', act === 'mute' ? tracks[i].muted : tracks[i].solo);
}
function onGain(e) {
  const i = +e.target.dataset.i;
  tracks[i].gain = +e.target.value / 100;
}

function onTrim() {
  const a = +$('trimIn').value, b = +$('trimOut').value;
  let inMs = (a / 1000) * timelineMs;
  let outMs = (b / 1000) * timelineMs;
  if (outMs <= inMs) { outMs = Math.min(timelineMs, inMs + timelineMs * 0.02); }
  trimInMs = inMs; trimOutMs = outMs;
  $('trimInVal').textContent = (inMs / 1000).toFixed(1) + ' s';
  $('trimOutVal').textContent = (outMs / 1000).toFixed(1) + ' s';
  $('meta').textContent = `${tracks.length} tracks · mix ${((outMs - inMs) / 1000).toFixed(1)} s of ${(timelineMs / 1000).toFixed(1)} s`;
  // shade the trimmed regions on every lane
  const lp = (inMs / timelineMs) * 100;
  const rp = (1 - outMs / timelineMs) * 100;
  document.querySelectorAll('.shade-l').forEach((d) => { d.style.width = lp + '%'; });
  document.querySelectorAll('.shade-r').forEach((d) => { d.style.width = rp + '%'; });
}

// ---- mixing ----------------------------------------------------------------
function gainFor(t) {
  const anySolo = tracks.some((x) => x.solo);
  if (t.muted) return 0;
  if (anySolo && !t.solo) return 0;
  return t.gain;
}

// Schedule the whole mix (audible voice tracks + bed) into `ctx`, for the window
// [fromMs,toMs], with the window's t=0 anchored at `startAt` (ctx time).
function scheduleMix(ctx, dest, fromMs, toMs, startAt) {
  const spanSec = (toMs - fromMs) / 1000;
  const nodes = [];
  for (const t of tracks) {
    const g = gainFor(t);
    if (g <= 0 || !t.buffer) continue;
    const trackStartMs = t.offsetMs - minOffset;
    const delayMs = trackStartMs - fromMs;
    let when = 0, bufOff = 0;
    if (delayMs >= 0) when = delayMs / 1000; else bufOff = -delayMs / 1000;
    if (bufOff >= t.buffer.duration || when >= spanSec) continue;
    const playDur = Math.min(t.buffer.duration - bufOff, spanSec - when);
    if (playDur <= 0) continue;
    const src = ctx.createBufferSource(); src.buffer = t.buffer;
    const gn = ctx.createGain(); gn.gain.value = g;
    src.connect(gn); gn.connect(dest);
    src.start(startAt + when, bufOff, playDur);
    nodes.push(src);
  }
  if (bed.enabled && bed.buffer) {
    const src = ctx.createBufferSource(); src.buffer = bed.buffer;
    const gn = ctx.createGain(); gn.gain.value = bed.gain;
    src.connect(gn); gn.connect(dest);
    const bufOff = Math.min(fromMs / 1000, Math.max(0, bed.buffer.duration - spanSec));
    src.start(startAt, bufOff, Math.min(spanSec, bed.buffer.duration - bufOff));
    nodes.push(src);
  }
  return nodes;
}

async function ensureBed(sampleRate) {
  if (!bed.enabled) return;
  const key = bed.id + '@' + Math.round(timelineMs);
  if (bed.buffer && bed.bufferFor === key) return;
  const b = bedById(bed.id);
  log('rendering 8-bit bed:', b.name);
  bed.buffer = await renderBed(b.comp, timelineMs / 1000 + 1, sampleRate || 44100);
  bed.bufferFor = key;
}

async function playMix() {
  stopMix();
  ensureAudioCtx();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  await ensureBed(audioCtx.sampleRate);
  const startAt = audioCtx.currentTime + 0.15;
  playAnchorCtx = startAt;
  activeNodes = scheduleMix(audioCtx, audioCtx.destination, trimInMs, trimOutMs, startAt);
  $('playBtn').disabled = true; $('stopBtn').disabled = false;
  $('playHead').style.display = 'block';
  animateHead();
  log('playing mix', `${(trimInMs / 1000).toFixed(1)}–${(trimOutMs / 1000).toFixed(1)} s`, bed.enabled ? `+ ${bedById(bed.id).name}` : '');
}

function stopMix() {
  for (const n of activeNodes) { try { n.stop(); } catch {} }
  activeNodes = [];
  cancelAnimationFrame(rafId);
  $('playBtn').disabled = false; $('stopBtn').disabled = true;
  $('playHead').style.display = 'none';
}

async function renderDownload() {
  if (!tracks.length) return;
  $('renderBtn').disabled = true;
  try {
    const sr = 44100;
    const spanSec = (trimOutMs - trimInMs) / 1000;
    await ensureBed(sr);
    log('rendering mixdown…', spanSec.toFixed(1), 's');
    const off = new OfflineAudioContext(2, Math.ceil(spanSec * sr) + Math.ceil(0.2 * sr), sr);
    scheduleMix(off, off.destination, trimInMs, trimOutMs, 0);
    const rendered = await off.startRendering();
    const wav = encodeWav(rendered);
    const name = `pod-${sessionRkey}.wav`;
    downloadBlob(wav, name);
    log('mixdown ready:', name, `(${(wav.size / 1024 / 1024).toFixed(1)} MB)`);
  } catch (e) {
    log('render error:', e.message || e);
  } finally {
    $('renderBtn').disabled = false;
  }
}

// ---- music bed -------------------------------------------------------------
function toggleBed() {
  bed.enabled = !bed.enabled;
  bed.id = $('bedSelect').value || bed.id;
  $('bedToggle').textContent = 'Music bed: ' + (bed.enabled ? 'on' : 'off');
  $('bedToggle').classList.toggle('on', bed.enabled);
  if (!bed.enabled) bed.buffer = null;
}

async function previewBed() {
  ensureAudioCtx();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  const b = bedById($('bedSelect').value || bed.id);
  const buf = await renderBed(b.comp, 6, audioCtx.sampleRate);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const g = audioCtx.createGain(); g.gain.value = Math.max(0.4, bed.gain);
  src.connect(g); g.connect(audioCtx.destination);
  src.start();
  log('previewing bed:', b.name);
}

// ---- playhead --------------------------------------------------------------
function animateHead() {
  const lane = document.querySelector('.lane');
  if (!lane) return;
  const tracksEl = $('tracks');
  const step = () => {
    const elapsedMs = (audioCtx.currentTime - playAnchorCtx) * 1000;
    if (elapsedMs > trimOutMs - trimInMs) { stopMix(); return; }
    const pct = Math.max(0, Math.min(1, (trimInMs + elapsedMs) / timelineMs));
    const rect = lane.getBoundingClientRect();
    const tr = tracksEl.getBoundingClientRect();
    const head = $('playHead');
    head.style.left = rect.left + pct * rect.width + 'px';
    head.style.top = tr.top + 'px';
    head.style.height = tr.height + 'px';
    rafId = requestAnimationFrame(step);
  };
  step();
}

// ---- wav encode ------------------------------------------------------------
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

function shortDid(did) { return did.length > 16 ? did.slice(0, 12) + '…' : did; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
