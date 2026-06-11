// pod/room — the recording lobby.
//
// Responsibilities:
//   1. Auth via the shared auth.mino.mobi OAuth worker.
//   2. WebRTC mesh for live monitoring (audio never goes through the server).
//   3. NTP-style clock-offset estimate against the room coordinator.
//   4. Dual recording: a high-quality local MediaRecorder of OUR OWN mic — the
//      "double-ender" keeper track. The mesh audio is throwaway monitoring.
//   5. On stop: slice the recording into byte-range chunks, upload each as an
//      atproto blob, and write a com.minomobi.podcast.track record.
//   6. Host writes/maintains the com.minomobi.podcast.session manifest tying
//      every participant's track together for /prod.

import { AuthClient } from '../lib/auth.js';

// ---- config ----------------------------------------------------------------
const SCOPE = 'atproto transition:generic'; // TODO: tighten to enumerated
//   repo:com.minomobi.podcast.{track,session,episode} blob:audio/* once those
//   collections are added to workers/auth/src/oauth/scope.ts and auth redeploys.
const CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB per blob chunk
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
const REC_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

// ---- state -----------------------------------------------------------------
const auth = new AuthClient();
let me = null;            // { did, handle }
let ws = null;
let roomId = null;
let isHost = false;
let localStream = null;
const peers = new Map();  // did → { pc, identity, audioEl }
let clockOffsetMs = 0;    // serverClock − clientClock

// recording session
let recorder = null;
let recChunks = [];
let recMime = 'audio/webm';
let epochMs = 0;          // server-stamped recording epoch
let recStartClientMs = 0; // Date.now() when our recorder actually started
let localStartOffsetMs = 0;
let sessionUri = null;
let sessionRkey = null;
let sessionResolvers = [];     // promises waiting on session-started
const collectedTracks = [];    // host only: { did, trackUri, ... }
const collectedParticipants = new Map(); // host only: did → identity

// ---- dom -------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
function log(...a) {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  $('log').textContent += line + '\n';
  $('log').scrollTop = $('log').scrollHeight;
  console.log('[pod]', ...a);
}

// ---- auth ------------------------------------------------------------------
async function boot() {
  try {
    me = await auth.init();
  } catch (_) {
    me = null;
  }
  if (me) {
    onSignedIn();
  }
  $('loginBtn').addEventListener('click', doLogin);
  setupTypeahead();
}

// Bluesky handle typeahead via the public actor-search API (no auth, CORS-open).
function setupTypeahead() {
  const input = $('handle');
  const menu = $('handleMenu');
  let timer = null, sel = -1;
  const close = () => { menu.style.display = 'none'; menu.innerHTML = ''; sel = -1; };

  input.addEventListener('input', () => {
    const q = input.value.trim().replace(/^@/, '');
    clearTimeout(timer);
    if (q.length < 2) { close(); return; }
    timer = setTimeout(() => searchActors(q, menu, (handle) => { input.value = handle; close(); }), 200);
  });
  input.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('.ta-item')];
    if (menu.style.display === 'none' || !items.length) {
      if (e.key === 'Enter') doLogin();
      return;
    }
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); paintSel(items, sel); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paintSel(items, sel); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); (sel >= 0 ? items[sel] : items[0]).click(); }
    else if (e.key === 'Escape') { close(); }
  });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== input) close(); });
  function paintSel(items, i) { items.forEach((n, k) => n.classList.toggle('sel', k === i)); }
}

async function searchActors(q, menu, onPick) {
  try {
    const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(q)}&limit=8`);
    if (!res.ok) return;
    const { actors } = await res.json();
    if (!actors || !actors.length) { menu.style.display = 'none'; return; }
    menu.innerHTML = actors
      .map((a) => `<div class="ta-item" data-handle="${esc(a.handle)}"><img src="${esc(a.avatar || '')}" alt="" loading="lazy"><span class="th">@${esc(a.handle)}${a.displayName ? `<span class="dn">${esc(a.displayName)}</span>` : ''}</span></div>`)
      .join('');
    menu.style.display = 'block';
    menu.querySelectorAll('.ta-item').forEach((el) => el.addEventListener('click', () => onPick(el.dataset.handle)));
  } catch (_) { /* offline — silent */ }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function doLogin() {
  const handle = $('handle').value.trim();
  if (!handle) return;
  $('loginErr').textContent = '';
  try {
    await auth.login(handle, { scope: SCOPE }); // redirects away
  } catch (e) {
    $('loginErr').textContent = e.message || String(e);
  }
}

function onSignedIn() {
  $('loginPanel').classList.add('hidden');
  $('studio').classList.remove('hidden');
  $('meLabel').textContent = '@' + (me.handle || me.did);
  startRoom();
}

// ---- room / signaling ------------------------------------------------------
function startRoom() {
  const params = new URLSearchParams(location.search);
  roomId = params.get('r');
  if (!roomId) {
    roomId = randSlug();
    isHost = true;
    const u = new URL(location.href);
    u.searchParams.set('r', roomId);
    history.replaceState({}, '', u.toString());
  }
  $('copyLink').addEventListener('click', () => {
    navigator.clipboard.writeText(location.href).then(() => log('invite link copied'));
  });
  $('armBtn').addEventListener('click', armRecording);
  $('stopBtn').addEventListener('click', stopRecording);
  $('finalizeBtn').addEventListener('click', finalizeSession);

  // host-only controls
  if (!isHost) $('recPanel').querySelector('h2').textContent = 'Recording (host-controlled)';
  $('armBtn').classList.toggle('hidden', !isHost);

  connect();
}

async function connect() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      video: false,
    });
  } catch (e) {
    log('ERROR mic access denied:', e.message || e);
    $('roomState').textContent = 'mic blocked';
    return;
  }

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/api/room/${roomId}/ws`);
  ws.addEventListener('open', () => {
    log('ws open, joining room', roomId, isHost ? '(as host)' : '');
    send({ type: 'join', identity: { did: me.did, handle: me.handle }, asHost: isHost });
    runTimeSync();
  });
  ws.addEventListener('message', (evt) => onWsMessage(JSON.parse(evt.data)));
  ws.addEventListener('close', () => { $('roomState').textContent = 'disconnected'; log('ws closed'); });
  ws.addEventListener('error', () => log('ws error'));
}

function send(obj) { try { ws.send(JSON.stringify(obj)); } catch (e) { log('send failed', e.message); } }

function onWsMessage(msg) {
  switch (msg.type) {
    case 'welcome':
      $('roomState').textContent = 'live';
      $('roomState').classList.add('live');
      if (msg.recording && msg.recording.armed) { epochMs = msg.recording.epochMs; }
      for (const p of msg.peers) addPeer(p, /*initiate*/ shouldInitiate(p.did));
      renderPeers();
      log('joined; peers:', msg.peers.map((p) => p.handle || p.did));
      break;
    case 'peer-joined':
      addPeer(msg.peer, /*initiate*/ shouldInitiate(msg.peer.did));
      renderPeers();
      log('peer joined:', msg.peer.handle || msg.peer.did);
      break;
    case 'peer-left':
      removePeer(msg.did);
      renderPeers();
      log('peer left:', msg.did);
      break;
    case 'sdp-offer': return onRemoteOffer(msg.fromDid, msg.sdp);
    case 'sdp-answer': return onRemoteAnswer(msg.fromDid, msg.sdp);
    case 'ice': return onRemoteIce(msg.fromDid, msg.candidate);
    case 'time-sync-reply': return onTimeSyncReply(msg);
    case 'recording-armed': return onRecordingArmed(msg);
    case 'session-started': return onSessionStarted(msg);
    case 'recording-stopped': return onRecordingStopped();
    case 'track-ready': return onTrackReady(msg);
    case 'error': return log('SERVER ERROR:', msg.message);
  }
}

// Deterministic initiator: the peer with the lexicographically smaller DID
// makes the offer, so each pair connects exactly once.
function shouldInitiate(otherDid) { return me.did < otherDid; }

// ---- WebRTC mesh -----------------------------------------------------------
function addPeer(identity, initiate) {
  if (peers.has(identity.did) || identity.did === me.did) return;
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

  const audioEl = document.createElement('audio');
  audioEl.autoplay = true;
  document.body.appendChild(audioEl);

  pc.addEventListener('icecandidate', (e) => {
    if (e.candidate) send({ type: 'ice', targetDid: identity.did, candidate: JSON.stringify(e.candidate) });
  });
  pc.addEventListener('track', (e) => { audioEl.srcObject = e.streams[0]; markSpeaking(identity.did, true); });
  pc.addEventListener('connectionstatechange', () => {
    log('peer', identity.handle || identity.did, '→', pc.connectionState);
    markSpeaking(identity.did, pc.connectionState === 'connected');
  });

  peers.set(identity.did, { pc, identity, audioEl });

  if (initiate) {
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => send({ type: 'sdp-offer', targetDid: identity.did, sdp: JSON.stringify(pc.localDescription) }))
      .catch((e) => log('offer error', e.message));
  }
}

function removePeer(did) {
  const p = peers.get(did);
  if (!p) return;
  try { p.pc.close(); } catch {}
  try { p.audioEl.remove(); } catch {}
  peers.delete(did);
}

async function onRemoteOffer(fromDid, sdpJson) {
  let p = peers.get(fromDid);
  if (!p) { addPeer({ did: fromDid }, false); renderPeers(); p = peers.get(fromDid); }
  await p.pc.setRemoteDescription(JSON.parse(sdpJson));
  const answer = await p.pc.createAnswer();
  await p.pc.setLocalDescription(answer);
  send({ type: 'sdp-answer', targetDid: fromDid, sdp: JSON.stringify(p.pc.localDescription) });
}

async function onRemoteAnswer(fromDid, sdpJson) {
  const p = peers.get(fromDid);
  if (p) await p.pc.setRemoteDescription(JSON.parse(sdpJson));
}

async function onRemoteIce(fromDid, candJson) {
  const p = peers.get(fromDid);
  if (p) { try { await p.pc.addIceCandidate(JSON.parse(candJson)); } catch (e) { log('ice add error', e.message); } }
}

// ---- clock sync ------------------------------------------------------------
let syncSamples = [];
function runTimeSync() {
  syncSamples = [];
  let n = 0;
  const tick = () => {
    if (n++ >= 7) { applyTimeSync(); return; }
    send({ type: 'time-sync', t0: Date.now() });
    setTimeout(tick, 150);
  };
  tick();
}
function onTimeSyncReply(msg) {
  const t1 = Date.now();
  const rtt = t1 - msg.t0;
  // offset = serverClock − clientClock, estimated at reply midpoint.
  const offset = msg.tServer + rtt / 2 - t1;
  syncSamples.push({ rtt, offset });
}
function applyTimeSync() {
  if (!syncSamples.length) return;
  // Use the sample with the smallest RTT (least jitter) — classic NTP heuristic.
  syncSamples.sort((a, b) => a.rtt - b.rtt);
  clockOffsetMs = Math.round(syncSamples[0].offset);
  $('skewVal').textContent = `${clockOffsetMs} ms (best RTT ${Math.round(syncSamples[0].rtt)} ms)`;
  log('clock offset vs server:', clockOffsetMs, 'ms');
}

// ---- recording -------------------------------------------------------------
function armRecording() {
  if (!isHost) return;
  send({ type: 'arm-recording' });
  log('arming recording…');
}

function onRecordingArmed(msg) {
  epochMs = msg.epochMs;
  $('recState').textContent = 'recording';
  $('recState').classList.add('rec');
  $('armBtn').classList.add('hidden');
  $('stopBtn').classList.toggle('hidden', !isHost);
  startLocalRecording();

  // Host creates the session manifest now that we have the epoch, then tells
  // everyone its URI so guests can stamp their tracks.
  if (isHost) createSession().catch((e) => log('createSession error:', e.message));
}

function startLocalRecording() {
  recChunks = [];
  recMime = REC_MIMES.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  recorder = new MediaRecorder(localStream, recMime ? { mimeType: recMime, audioBitsPerSecond: 128000 } : undefined);
  recorder.addEventListener('dataavailable', (e) => { if (e.data && e.data.size) recChunks.push(e.data); });
  recorder.addEventListener('start', () => {
    recStartClientMs = Date.now();
    // How far after the shared epoch (in server time) our audio begins.
    localStartOffsetMs = Math.max(0, Math.round(recStartClientMs + clockOffsetMs - epochMs));
    $('offsetVal').textContent = `${localStartOffsetMs} ms`;
    log('recording started; local offset from epoch:', localStartOffsetMs, 'ms');
  });
  recorder.addEventListener('stop', onRecorderStopped);
  recorder.start(); // one blob; we byte-slice it into chunks on stop
}

function onRecordingStopped() {
  // host broadcast a stop — stop our recorder, which fires onRecorderStopped.
  $('recState').textContent = 'uploading';
  $('recState').classList.remove('rec');
  $('stopBtn').classList.add('hidden');
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}

function stopRecording() {
  if (!isHost) return;
  send({ type: 'stop-recording' });
  log('stopping recording…');
}

async function onRecorderStopped() {
  const durationMs = Date.now() - recStartClientMs;
  const blob = new Blob(recChunks, { type: recMime || 'audio/webm' });
  log(`recorded ${(blob.size / 1024).toFixed(0)} KB over ${(durationMs / 1000).toFixed(1)} s — uploading…`);
  try {
    const trackUri = await uploadTrack(blob, durationMs);
    log('track published:', trackUri);
    send({ type: 'track-ready', trackUri, durationMs, localStartOffsetMs });
    if (isHost) $('finalizeBtn').classList.remove('hidden');
    $('recState').textContent = 'uploaded';
  } catch (e) {
    log('UPLOAD ERROR:', e.message || e);
    $('recState').textContent = 'upload failed';
  }
}

async function uploadTrack(blob, durationMs) {
  // Wait for the session URI (host sets it ~immediately after arming).
  const sUri = await whenSessionReady();

  const baseMime = (recMime || 'audio/webm').split(';')[0];
  const chunks = [];
  const total = Math.ceil(blob.size / CHUNK_BYTES);
  for (let i = 0; i < blob.size; i += CHUNK_BYTES) {
    const part = blob.slice(i, Math.min(i + CHUNK_BYTES, blob.size));
    const buf = await part.arrayBuffer();
    const ref = await auth.pds.uploadBlob(buf, baseMime);
    chunks.push(ref);
    log(`  uploaded chunk ${chunks.length}/${total} (${(part.size / 1024).toFixed(0)} KB)`);
  }
  // Blob GC protection: the track record below references every chunk
  // (chunks: [...]), which is what keeps the PDS from sweeping them. Abort if
  // any upload didn't return a blob ref rather than write a dangling record.
  if (!chunks.length || chunks.some((r) => !r || !r.ref)) throw new Error('a chunk did not return a blob ref — aborting');

  const record = {
    $type: 'com.minomobi.podcast.track',
    session: sUri,
    participant: { did: me.did, handle: me.handle },
    chunks,
    mimeType: recMime || 'audio/webm',
    sampleRate: 48000,
    channelCount: 1,
    durationMs: Math.round(durationMs),
    epochMs: Math.round(epochMs),
    localStartOffsetMs: Math.round(localStartOffsetMs),
    clockSkewMs: Math.round(clockOffsetMs),
    createdAt: new Date().toISOString(),
  };
  const res = await auth.pds.createRecord('com.minomobi.podcast.track', record);
  return res.uri;
}

// ---- session manifest (host) ----------------------------------------------
async function createSession() {
  const record = {
    $type: 'com.minomobi.podcast.session',
    roomId,
    title: `Room ${roomId}`,
    host: me.did,
    participants: [{ did: me.did, handle: me.handle }],
    tracks: [],
    epochMs: Math.round(epochMs),
    startedAt: new Date().toISOString(),
    status: 'recording',
  };
  const res = await auth.pds.createRecord('com.minomobi.podcast.session', record);
  sessionUri = res.uri;
  sessionRkey = res.uri.split('/').pop();
  collectedParticipants.set(me.did, { did: me.did, handle: me.handle });
  $('sessionUriVal').innerHTML = `<code>${sessionUri}</code>`;
  send({ type: 'session-started', sessionUri });
  resolveSession(sessionUri);
  log('session manifest created:', sessionUri);
}

function onSessionStarted(msg) {
  sessionUri = msg.sessionUri;
  $('sessionUriVal').innerHTML = `<code>${sessionUri}</code>`;
  resolveSession(sessionUri);
}

function whenSessionReady() {
  if (sessionUri) return Promise.resolve(sessionUri);
  return new Promise((resolve) => sessionResolvers.push(resolve));
}
function resolveSession(uri) {
  const rs = sessionResolvers; sessionResolvers = [];
  rs.forEach((r) => r(uri));
}

function onTrackReady(msg) {
  // Everyone gets these (including the host's own). Host accumulates them into
  // the manifest.
  if (!isHost) return;
  collectedTracks.push(msg);
  if (!collectedParticipants.has(msg.did)) {
    const p = peers.get(msg.did);
    collectedParticipants.set(msg.did, { did: msg.did, handle: p && p.identity.handle });
  }
  $('trackCount').textContent = String(collectedTracks.length);
  log('host: collected track from', msg.did, '→', msg.trackUri);
}

async function finalizeSession() {
  if (!isHost || !sessionRkey) return;
  $('finalizeBtn').disabled = true;
  const record = {
    $type: 'com.minomobi.podcast.session',
    roomId,
    title: `Room ${roomId}`,
    host: me.did,
    participants: [...collectedParticipants.values()],
    tracks: collectedTracks.map((t) => t.trackUri),
    epochMs: Math.round(epochMs),
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    status: 'stopped',
  };
  try {
    await auth.pds.putRecord('com.minomobi.podcast.session', sessionRkey, record);
    const prodUrl = `/prod/?s=${encodeURIComponent(sessionUri)}`;
    $('prodLink').innerHTML = `Session finalized with ${record.tracks.length} track(s). → <a class="inline" href="${prodUrl}">Open in /prod to verify sync</a>`;
    log('session finalized with', record.tracks.length, 'tracks');
  } catch (e) {
    log('finalize error:', e.message || e);
    $('finalizeBtn').disabled = false;
  }
}

// ---- ui helpers ------------------------------------------------------------
function renderPeers() {
  const el = $('peers');
  const all = [{ identity: { did: me.did, handle: me.handle }, self: true }, ...[...peers.values()]];
  el.innerHTML = all
    .map((p) => {
      const did = p.identity.did;
      const name = p.self ? '@' + (me.handle || 'you') + ' (you)' : '@' + (p.identity.handle || short(did));
      const role = did === me.did && isHost ? 'host' : '';
      return `<div class="peer"><span class="dotind ${p.self ? 'on' : ''}" data-did="${did}"></span><span class="who">${name}<span class="role">${role}</span></span></div>`;
    })
    .join('');
}
function markSpeaking(did, on) {
  const dot = document.querySelector(`.dotind[data-did="${did}"]`);
  if (dot) dot.classList.toggle('on', on);
}
function short(did) { return did.length > 16 ? did.slice(0, 12) + '…' : did; }
function randSlug() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(36)).join('').slice(0, 8);
}

boot();
