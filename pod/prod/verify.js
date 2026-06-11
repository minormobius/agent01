// pod/prod — sync verifier.
//
// Proves the recording slice: load a com.minomobi.podcast.session, fetch every
// referenced track (each may live on a different participant's PDS), reassemble
// each track from its byte-range chunks, decode, and play them aligned by the
// captured localStartOffsetMs. If the server-epoch + clock-offset sync works,
// the voices overlap naturally.

import { getRecord, getBlob, blobCid, parseAtUri } from '../lib/atproto-read.js';

const $ = (id) => document.getElementById(id);
function log(...a) {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  $('log').textContent += line + '\n';
  $('log').scrollTop = $('log').scrollHeight;
}

let loaded = [];      // [{ did, handle, offsetMs, durationMs, buffer }]
let audioCtx = null;
let sources = [];
let rafId = 0;
let playStartCtxTime = 0;
let timelineMs = 0;
let minOffset = 0;

const params = new URLSearchParams(location.search);
if (params.get('s')) { $('sessionInput').value = params.get('s'); loadSession(); }

$('loadBtn').addEventListener('click', loadSession);
$('playBtn').addEventListener('click', playAligned);
$('stopBtn').addEventListener('click', stopAligned);

async function loadSession() {
  const uri = $('sessionInput').value.trim();
  if (!uri) return;
  $('timelinePanel').style.display = 'none';
  loaded = [];
  try {
    log('loading session', uri);
    const sess = await getRecord(uri);
    const v = sess.value;
    const trackUris = v.tracks || [];
    log(`session has ${trackUris.length} track(s); epoch ${v.epochMs}`);
    if (!trackUris.length) { log('no tracks referenced — finalize the session in /room first.'); return; }

    for (const tUri of trackUris) {
      try {
        await loadTrack(tUri);
      } catch (e) {
        log('  track failed:', tUri, '—', e.message || e);
      }
    }
    if (!loaded.length) { log('no playable tracks decoded.'); return; }

    minOffset = Math.min(...loaded.map((t) => t.offsetMs));
    timelineMs = Math.max(...loaded.map((t) => t.offsetMs - minOffset + t.durationMs));
    renderTimeline();
    $('timelinePanel').style.display = '';
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

  // Reassemble: fetch each chunk blob and concatenate the raw bytes.
  const parts = [];
  for (const ref of refs) {
    const cid = blobCid(ref);
    const bytes = await getBlob(did, cid);
    parts.push(bytes);
  }
  const blob = new Blob(parts, { type: (v.mimeType || 'audio/webm').split(';')[0] });
  const buf = await blob.arrayBuffer();

  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  let buffer = null;
  try {
    buffer = await audioCtx.decodeAudioData(buf.slice(0));
  } catch (e) {
    log('    decodeAudioData failed (' + (e.message || e) + ') — using <audio> fallback for this track');
  }

  loaded.push({
    did,
    handle: v.participant?.handle || shortDid(did),
    offsetMs: v.localStartOffsetMs || 0,
    durationMs: v.durationMs || (buffer ? buffer.duration * 1000 : 0),
    buffer,
    blobUrl: buffer ? null : URL.createObjectURL(blob),
  });
}

function renderTimeline() {
  $('meta').textContent = `${loaded.length} tracks · ${(timelineMs / 1000).toFixed(1)} s · spread ${Math.round(
    Math.max(...loaded.map((t) => t.offsetMs)) - minOffset
  )} ms`;
  const el = $('tracks');
  el.innerHTML = loaded
    .map((t, i) => {
      const left = ((t.offsetMs - minOffset) / timelineMs) * 100;
      const width = Math.max(1, (t.durationMs / timelineMs) * 100);
      return `<div class="track">
        <div class="name">@${escapeHtml(t.handle)}<span class="off">+${Math.round(t.offsetMs - minOffset)} ms · ${(t.durationMs / 1000).toFixed(1)} s${t.buffer ? '' : ' · fallback'}</span></div>
        <div class="lane"><div class="bar" data-i="${i}" style="left:${left}%; width:${width}%"></div></div>
      </div>`;
    })
    .join('');
}

function playAligned() {
  if (!audioCtx) return;
  stopAligned();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const base = audioCtx.currentTime + 0.15;
  playStartCtxTime = base;
  sources = [];
  for (const t of loaded) {
    const at = base + (t.offsetMs - minOffset) / 1000;
    if (t.buffer) {
      const src = audioCtx.createBufferSource();
      src.buffer = t.buffer;
      src.connect(audioCtx.destination);
      src.start(at);
      sources.push(src);
    } else if (t.blobUrl) {
      // Fallback: schedule an <audio> element with setTimeout (coarser).
      const a = new Audio(t.blobUrl);
      const delayMs = (at - audioCtx.currentTime) * 1000;
      setTimeout(() => a.play().catch(() => {}), Math.max(0, delayMs));
      sources.push({ stop: () => { a.pause(); } });
    }
  }
  $('playBtn').disabled = true;
  $('stopBtn').disabled = false;
  $('playHead').style.display = 'block';
  animateHead();
  log('playing', loaded.length, 'tracks aligned');
}

function stopAligned() {
  for (const s of sources) { try { s.stop(); } catch {} }
  sources = [];
  cancelAnimationFrame(rafId);
  $('playBtn').disabled = false;
  $('stopBtn').disabled = true;
  $('playHead').style.display = 'none';
}

function animateHead() {
  const lane = document.querySelector('.lane');
  if (!lane) return;
  const step = () => {
    const elapsedMs = (audioCtx.currentTime - playStartCtxTime) * 1000;
    if (elapsedMs > timelineMs) { stopAligned(); return; }
    const pct = Math.max(0, Math.min(1, elapsedMs / timelineMs));
    const rect = lane.getBoundingClientRect();
    const tracksRect = $('tracks').getBoundingClientRect();
    const head = $('playHead');
    // position:fixed → viewport coordinates (no scroll offset).
    head.style.left = rect.left + pct * rect.width + 'px';
    head.style.top = tracksRect.top + 'px';
    head.style.height = tracksRect.height + 'px';
    rafId = requestAnimationFrame(step);
  };
  step();
}

function shortDid(did) { return did.length > 16 ? did.slice(0, 12) + '…' : did; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
