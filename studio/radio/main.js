// main.js — Duende Radio: the dials, the stations, the drift, the link; the worker's chunks laid on
// the audio clock; and what is heard handed, as it sounds, to the piano roll and the duende.
//
//   #st=feria                                  a station
//   #k=25,15,20,45,30,45,30,80&seed=7&drift=1  the dials (0–100, in KNOBS order), the seed, drifting
import { KNOBS, STATIONS, DEFAULT } from './composer.js';
import { Duende } from './duende.js';

const $ = (id) => document.getElementById(id);
const ENDS = {
  light: ['dark', 'bright'], energy: ['still', 'driving'], pace: ['slow', 'quick'], tension: ['settled', 'restless'],
  journey: ['home', 'wandering'], duende: ['jazz', 'flamenco'], conversation: ['alone', 'duel'], air: ['close', 'open'],
};
const TEXTURE = {
  lake: 'the lake: pedalled arpeggios', stars: 'stars: sparse and high', sea: 'the sea: a barcarolle', river: 'the river: an ostinato',
  falls: 'the falls: tremolo', mountains: 'mountains: rolled chords', swing: 'swing: a walking bass', ballad: 'a ballad',
  buleria: 'compás: rasgueado', falseta: 'a falseta: picado',
};
const MANNER = { solo: 'alone', accompany: 'accompanied', trade: 'trading phrases', duel: 'a duel' };
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const LEAD = 1.6;                                        // seconds rendered ahead of what is heard

// ---- state: the link is the truth ------------------------------------------------------------------
const state = { k: { ...DEFAULT }, seed: 1 + Math.floor(Math.random() * 9999), station: STATIONS[0][0], drift: false };
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const st = STATIONS.find(([n]) => slug(n) === q.get('st'));
  if (st) { state.station = st[0]; KNOBS.forEach((k, i) => (state.k[k] = st[1][i])); }
  const ks = (q.get('k') || '').split(',').map(Number);
  if (ks.length === 8 && ks.every(Number.isFinite)) { KNOBS.forEach((k, i) => (state.k[k] = Math.min(1, Math.max(0, ks[i] / 100)))); state.station = nearest(); }
  if (Number(q.get('seed'))) state.seed = Number(q.get('seed'));
  state.drift = q.get('drift') === '1';
}
function writeHash() {
  const st = STATIONS.find(([n]) => n === state.station), exact = st && KNOBS.every((k, i) => Math.abs(state.k[k] - st[1][i]) < 0.005);
  const q = exact ? new URLSearchParams({ st: slug(st[0]) }) : new URLSearchParams({ k: KNOBS.map((k) => Math.round(state.k[k] * 100)).join(',') });
  q.set('seed', state.seed); if (state.drift) q.set('drift', '1');
  history.replaceState(null, '', `#${q.toString().replace(/%2C/g, ',')}`);
}
// the station these dials are nearest (named "near …" unless they are on it)
function nearest() {
  let best = null, bd = Infinity;
  for (const [n, v] of STATIONS) { const d = KNOBS.reduce((s, k, i) => s + (state.k[k] - v[i]) ** 2, 0); if (d < bd) { bd = d; best = n; } }
  return bd < 1e-4 ? best : `near ${best}`;
}

// ---- the panel -------------------------------------------------------------------------------------
const inputs = {};
function panel() {
  const box = $('dials');
  for (const k of KNOBS) {
    const d = document.createElement('div'); d.className = 'dial';
    d.innerHTML = `<div class="top"><span>${k}</span><output></output></div><input type="range" min="0" max="100" step="1" aria-label="${k}"><div class="ends"><span>${ENDS[k][0]}</span><span>${ENDS[k][1]}</span></div>`;
    const inp = d.querySelector('input');
    inp.addEventListener('input', () => { glide = null; state.k[k] = inp.value / 100; if (state.drift) anchor[k] = state.k[k]; changed(); });
    inputs[k] = { inp, out: d.querySelector('output') };
    box.append(d);
  }
  const sb = $('stations');
  for (const [n, v] of STATIONS) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.dataset.st = n;
    b.addEventListener('click', () => tuneTo(n, v));
    sb.append(b);
  }
  $('drift').addEventListener('click', () => { state.drift = !state.drift; Object.assign(anchor, state.k); changed(); });
  $('share').addEventListener('click', async () => { writeHash(); try { await navigator.clipboard.writeText(location.href); $('share').textContent = 'copied'; } catch { $('share').textContent = 'link in the address bar'; } setTimeout(() => ($('share').textContent = 'copy link'), 1600); });
  $('playpause').addEventListener('click', toggle);
  $('tune').addEventListener('click', toggle);
}
function show() {
  for (const k of KNOBS) { inputs[k].inp.value = Math.round(state.k[k] * 100); inputs[k].out.textContent = Math.round(state.k[k] * 100); }
  for (const b of $('stations').children) b.classList.toggle('on', b.dataset.st === state.station);
  $('drift').classList.toggle('on', state.drift);
  $('station').textContent = state.station + (state.drift ? ' · drifting' : '');
}
let hashTimer = 0;
function changed(rename = true) {
  if (rename) state.station = nearest();
  show(); sendKnobs();
  clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 400);
}
// a station is tuned to by gliding there over a second and a half, so it is a turn and not a cut
let glide = null;
function tuneTo(name, v) {
  glide = { from: { ...state.k }, to: Object.fromEntries(KNOBS.map((k, i) => [k, v[i]])), t0: performance.now(), name };
  state.station = name; Object.assign(anchor, glide.to); show();
}

// ---- drift: each dial a slow random walk, tethered to where it was set ------------------------------
const anchor = { ...state.k };
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function driftStep(dt) {
  for (const k of KNOBS) {
    const x = state.k[k] + 0.03 * (anchor[k] - state.k[k]) * dt + 0.03 * Math.sqrt(dt) * gauss();
    state.k[k] = Math.min(1, Math.max(0, x));
  }
}

// ---- sound -----------------------------------------------------------------------------------------
let ctx = null, worker = null, t0 = null, sr = 44100, wanted = 0, playing = false, out = null, chunks = 0, late = 0;
const sources = new Set(), pending = [];                  // pending: notes and bars, by audio time
function sendKnobs() { if (worker) worker.postMessage({ type: 'knobs', knobs: { ...state.k } }); }
function start() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  sr = ctx.sampleRate; out = ctx.createGain(); out.gain.value = 0.9; out.connect(ctx.destination);
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === 'error') { $('playing').textContent = `the radio would not start: ${m.message}`; return; }
    if (m.type !== 'chunk') return;
    if (t0 === null) t0 = ctx.currentTime + 0.25;           // the stream begins when it first arrives
    const pcm = new Float32Array(m.pcm), buf = ctx.createBuffer(2, m.frames, sr), L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (let i = 0; i < m.frames; i++) { L[i] = pcm[i * 2]; R[i] = pcm[i * 2 + 1]; }
    const when = t0 + m.frame / sr, lateBy = ctx.currentTime - when;
    if (lateBy > 0) late++;
    if (lateBy < buf.duration) {
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(out);
      s.onended = () => { sources.delete(s); s.disconnect(); };
      s.start(Math.max(when, ctx.currentTime), Math.max(0, lateBy)); sources.add(s);
    }
    chunks++; document.body.dataset.radio = `${chunks} chunks, ${late} late`;
    for (const n of m.notes) pending.push({ at: t0 + n.t, note: n });
    for (const b of m.bars) pending.push({ at: t0 + b.t, bar: b });
    pending.sort((a, b) => a.at - b.at);
    for (const n of m.notes) roll.push({ ...n, at: t0 + n.t });
  };
  worker.postMessage({ type: 'start', seed: state.seed, sampleRate: sr, knobs: { ...state.k }, want: Math.round(LEAD * sr) });
  wanted = Math.round(LEAD * sr);
}
function toggle() {
  if (!ctx) { start(); playing = true; }
  else if (playing) { ctx.suspend(); playing = false; }
  else { ctx.resume(); playing = true; }
  $('tune').hidden = true;
  $('playpause').textContent = playing ? 'pause' : 'play';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}
// keep the worker ahead of the ear (further ahead when the tab is hidden and the timers slow)
function feed() {
  if (!ctx || t0 === null || !playing) return;
  const ahead = document.hidden ? 4 : LEAD, want = Math.round((ctx.currentTime - t0 + ahead) * sr);
  if (want > wanted + sr / 8) { wanted = want; worker.postMessage({ type: 'want', want }); }
}
setInterval(feed, 120);

// ---- what is heard: the roll, the figure, the words -------------------------------------------------
const roll = [], bars = [];
const rc = $('roll'), rctx = rc.getContext('2d'), figure = new Duende($('fig'), state.seed);
let bar = null;
function heard(now) {
  while (pending.length && pending[0].at <= now) {
    const e = pending.shift();
    if (e.note) figure.hear(e.note);
    else { bar = e.bar; figure.barBegins(bar, e.at); bars.push({ ...bar, at: e.at }); words(bar); }
  }
}
function words(b) {
  const who = b.manner === 'solo' ? `<span class="${b.lead === 'piano' ? 'p' : 'g'}">${b.lead} ${MANNER[b.manner]}</span>` : `<span class="${b.lead === 'piano' ? 'p' : 'g'}">${b.lead} sings</span>, ${MANNER[b.manner]}`;
  $('playing').innerHTML = `${b.key} ${b.mode}${b.home ? '' : ' (away)'} · <b>${b.chord}</b> · ${b.bpm} bpm<br>${TEXTURE[b.texture] || b.texture} · ${who}`;
  if ('mediaSession' in navigator && window.MediaMetadata) {
    const title = `${state.station} — ${b.key} ${b.mode}`;
    if (navigator.mediaSession.metadata?.title !== title) navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'Duende Radio', album: 'studio.mino.mobi' });
  }
}
// the piano roll: the last few seconds to the left of the line, what is about to sound to the right
function drawRoll(now) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(rc.clientWidth * dpr), h = Math.round(rc.clientHeight * dpr);
  if (rc.width !== w || rc.height !== h) { rc.width = w; rc.height = h; }
  rctx.fillStyle = '#050407'; rctx.fillRect(0, 0, w, h);
  const span = 9, x0 = w * 0.78, px = w / span, lo = 28, hi = 100;
  const X = (t) => x0 + (t - now) * px, Y = (m) => h - ((m - lo) / (hi - lo)) * (h - 8) - 4;
  while (roll.length && roll[0].at + roll[0].dur < now - span) roll.shift();
  while (bars.length > 1 && bars[1].at < now - span) bars.shift();
  rctx.font = `${10 * dpr}px ui-monospace, monospace`; rctx.textBaseline = 'top';
  for (const b of bars) { const x = X(b.at); rctx.fillStyle = 'rgba(236,235,245,0.08)'; rctx.fillRect(x, 0, dpr, h); rctx.fillStyle = 'rgba(236,235,245,0.35)'; rctx.fillText(b.chord, x + 3 * dpr, 3 * dpr); }
  const nh = Math.max(2, (h / (hi - lo)) * 1.1);
  for (const n of roll) {
    const x = X(n.at), x2 = X(n.at + n.dur); if (x > w || x2 < 0) continue;
    const future = n.at > now, a = (future ? 0.28 : 0.45 + 0.55 * Math.min(1, n.v * 1.3)) * (n.at <= now && now < n.at + 0.15 ? 1.4 : 1);
    rctx.fillStyle = n.inst === 0 ? `rgba(255,154,90,${a})` : `rgba(107,212,255,${a})`;
    rctx.fillRect(x, Y(n.midi) - nh / 2, Math.max(2 * dpr, x2 - x), nh);
  }
  rctx.fillStyle = 'rgba(255,255,255,0.35)'; rctx.fillRect(x0, 0, dpr, h);
}

let lastFrame = performance.now(), lastSend = 0;
function frame(ms) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (ms - lastFrame) / 1000); lastFrame = ms;
  if (glide) {
    const u = Math.min(1, (ms - glide.t0) / 1500), e = u * u * (3 - 2 * u);
    for (const k of KNOBS) state.k[k] = glide.from[k] + (glide.to[k] - glide.from[k]) * e;
    if (u >= 1) { glide = null; state.station = nearest(); }
    show(); if (ms - lastSend > 150 || !glide) { lastSend = ms; sendKnobs(); writeHash(); }
  } else if (state.drift && playing) {
    driftStep(dt); show();
    if (ms - lastSend > 400) { lastSend = ms; state.station = nearest(); sendKnobs(); writeHash(); }
  }
  const now = ctx && t0 !== null ? ctx.currentTime : ms / 1000;
  if (ctx && t0 !== null) heard(now);
  figure.frame(now, playing || !ctx ? dt : 0);
  drawRoll(now);
}

readHash(); writeHash(); Object.assign(anchor, state.k); panel(); show();
addEventListener('hashchange', () => { readHash(); show(); sendKnobs(); });
new ResizeObserver(() => figure.size()).observe($('stage'));
requestAnimationFrame(frame);
document.body.dataset.ready = '1';
