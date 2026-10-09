// main.js — Duende Radio: the dials, the stations, the drift, the link; the worker's chunks laid on
// the audio clock; the scale streaming past with the notes on it; and "that bit", a link that replays
// the last half minute exactly.
//
//   #st=feria                                  a station
//   #k=25,15,20,45,30,45,30,80&seed=7&drift=1  the dials (0–100, in KNOBS order), the seed, drifting
//   #clip=…                                    a saved moment (clip.js): it plays first, then the radio goes on
import { KNOBS, STATIONS, DEFAULT } from './composer.js';
import { encodeClip, decodeClip } from './clip.js';

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
const BACK = 30;                                         // "that bit": how far back it reaches

// ---- state: the link is the truth ------------------------------------------------------------------
const state = { k: { ...DEFAULT }, seed: 1 + Math.floor(Math.random() * 9999), station: STATIONS[0][0], drift: false, clip: null };
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
  if (state.clip) return;                                // a saved moment keeps its link until the dials move
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
    inp.addEventListener('input', () => { glide = null; state.k[k] = inp.value / 100; if (state.drift) anchor[k] = state.k[k]; leaveClip(); changed(); });
    inputs[k] = { inp, out: d.querySelector('output') };
    box.append(d);
  }
  const sb = $('stations');
  for (const [n, v] of STATIONS) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.dataset.st = n;
    b.addEventListener('click', () => { leaveClip(); tuneTo(n, v); });
    sb.append(b);
  }
  $('drift').addEventListener('click', () => { state.drift = !state.drift; Object.assign(anchor, state.k); leaveClip(); changed(); });
  $('share').addEventListener('click', async () => { writeHash(); flash($('share'), (await copy(location.href)) ? 'copied' : 'in the address bar', 'copy link'); });
  $('bit').addEventListener('click', saveBit);
  $('playpause').addEventListener('click', toggle);
  $('tune').addEventListener('click', toggle);
}
const copy = async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };
const flash = (el, text, back) => { el.textContent = text; setTimeout(() => (el.textContent = back), 1800); };
function show() {
  for (const k of KNOBS) { inputs[k].inp.value = Math.round(state.k[k] * 100); inputs[k].out.textContent = Math.round(state.k[k] * 100); }
  for (const b of $('stations').children) b.classList.toggle('on', b.dataset.st === state.station);
  $('drift').classList.toggle('on', state.drift);
  $('station').textContent = state.clip ? 'a saved moment' : state.station + (state.drift ? ' · drifting' : '');
}
let hashTimer = 0;
function changed(rename = true) {
  if (rename) state.station = nearest();
  show(); sendKnobs();
  clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 400);
}
function leaveClip() { if (state.clip) { state.clip = null; writeHash(); } }
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
  for (const k of KNOBS) state.k[k] = Math.min(1, Math.max(0, state.k[k] + 0.03 * (anchor[k] - state.k[k]) * dt + 0.03 * Math.sqrt(dt) * gauss()));
}

// ---- sound -----------------------------------------------------------------------------------------
let ctx = null, worker = null, t0 = null, sr = 44100, wanted = 0, playing = false, out = null, chunks = 0, late = 0;
const sources = new Set(), pending = [];                  // pending: bars by audio time, for the words
function sendKnobs() { if (worker) worker.postMessage({ type: 'knobs', knobs: { ...state.k } }); }
function start() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  sr = ctx.sampleRate; out = ctx.createGain(); out.gain.value = 0.9; out.connect(ctx.destination);
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === 'error') { $('playing').textContent = `the radio would not start: ${m.message}`; return; }
    if (m.type === 'clip') { gotBit(m.clip); return; }
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
    for (const n of m.notes) notes.push({ ...n, at: t0 + n.t });
    for (const b of m.bars) { const x = { ...b, at: t0 + b.t }; bars.push(x); pending.push(x); }
  };
  worker.postMessage({ type: 'start', seed: state.seed, sampleRate: sr, knobs: { ...state.k }, want: Math.round(LEAD * sr), clip: state.clip });
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

// ---- "that bit": the last half minute, as a link that plays it again --------------------------------
function saveBit() {
  if (!ctx || t0 === null) return flash($('bit'), 'play first', 'that bit');
  const now = ctx.currentTime, heard = bars.filter((b) => b.at <= now);
  if (!heard.length) return;
  const from = (heard.find((b) => b.at >= now - BACK) || heard[heard.length - 1]).bar, to = heard[heard.length - 1].bar;
  worker.postMessage({ type: 'clip', from, to });
}
async function gotBit(clip) {
  if (!clip) return flash($('bit'), 'too far back', 'that bit');
  const url = `${location.origin}${location.pathname}#clip=${await encodeClip(clip)}`;
  const ok = await copy(url);
  flash($('bit'), ok ? 'link copied' : 'see below', 'that bit');
  const box = $('bitlink'); box.hidden = false; box.value = url;
  $('bitnote').hidden = false;
}

// ---- what is heard: the words, and the scale streaming past ----------------------------------------
const notes = [], bars = [];
const sc = $('stream'), g = sc.getContext('2d');
function words(b) {
  const who = b.manner === 'solo' ? `<span class="${b.lead === 'piano' ? 'p' : 'g'}">${b.lead} ${MANNER[b.manner]}</span>` : `<span class="${b.lead === 'piano' ? 'p' : 'g'}">${b.lead} sings</span>, ${MANNER[b.manner]}`;
  $('playing').innerHTML = `${b.key} ${b.mode}${b.home ? '' : ' (away)'}${b.theme ? ' · the theme' : ''} · <b>${b.chord}</b> · ${b.bpm} bpm<br>${TEXTURE[b.texture] || b.texture} · ${who}`;
  if ('mediaSession' in navigator && window.MediaMetadata) {
    const title = `${state.station} — ${b.key} ${b.mode}`;
    if (navigator.mediaSession.metadata?.title !== title) navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'Duende Radio', album: 'studio.mino.mobi' });
  }
}
// the mode's light as a hue: violet in Phrygian, through blue and green, to amber in Lydian
const hue = (bright) => 268 - 228 * bright;
/**
 * The picture: time runs right to left past a line at three quarters of the width (what is about to
 * sound is to its right); pitch climbs. Each bar lays down its scale as bars of light, one per note of
 * the mode in every octave, the chord's notes brighter and the key's root brightest, in the mode's
 * colour; the notes are drawn over them, the piano orange and the guitar blue, the tune bolder.
 */
function draw(now) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(sc.clientWidth * dpr), h = Math.round(sc.clientHeight * dpr);
  if (sc.width !== w || sc.height !== h) { sc.width = w; sc.height = h; }
  g.fillStyle = '#07060a'; g.fillRect(0, 0, w, h);
  const span = w > h ? 12 : 8, x0 = w * 0.74, px = w / span, lo = 33, hi = 96, top = Math.max(h * 0.16, 100 * dpr), bot = h - 8 * dpr;
  const lane = (bot - top) / (hi - lo), X = (t) => x0 + (t - now) * px, Y = (m) => bot - (m - lo + 0.5) * lane;
  while (notes.length && notes[0].at + notes[0].dur < now - span) notes.shift();
  while (bars.length > 1 && bars[1].at + bars[1].sec < now - span) bars.shift();
  g.font = `${11 * dpr}px ui-monospace, monospace`; g.textBaseline = 'top';
  for (const b of bars) {
    const xa = X(b.at), xb = X(b.at + b.sec); if (xb < 0 || xa > w) continue;
    const H = hue(b.bright), chord = new Set(b.pcs.flat()), root = b.root, gap = Math.max(1, dpr);
    for (let m = lo; m <= hi; m++) {
      const pc = m % 12; if (!b.scale.includes(pc)) continue;
      const inC = chord.has(pc), th = inC ? lane * 0.62 : lane * 0.28, a = pc === root ? 0.3 : inC ? 0.17 : 0.07;
      g.fillStyle = `hsla(${H}, 70%, 62%, ${a})`;
      g.fillRect(xa + gap, Y(m) - th / 2, Math.max(0, xb - xa - 2 * gap), th);
    }
    g.fillStyle = `hsla(${H}, 60%, 80%, ${b.at <= now ? 0.55 : 0.3})`;
    g.fillText(b.chord, xa + 4 * dpr, top - 16 * dpr);
  }
  for (const n of notes) {
    const x = X(n.at), x2 = X(n.at + n.dur); if (x > w || x2 < 0) continue;
    const mel = n.role === 'mel', sounding = n.at <= now && now < n.at + Math.min(n.dur, 0.25), future = n.at > now;
    const th = lane * (mel ? 0.95 : 0.6), a = future ? 0.28 : Math.min(1, (mel ? 0.55 : 0.35) + 0.55 * n.v) * (sounding ? 1.25 : 1);
    g.fillStyle = n.inst === 0 ? `rgba(255,154,90,${a})` : `rgba(107,212,255,${a})`;
    g.fillRect(x, Y(n.midi) - th / 2, Math.max(2 * dpr, x2 - x), th);
    if (sounding && mel) { g.fillStyle = n.inst === 0 ? 'rgba(255,190,140,0.35)' : 'rgba(160,230,255,0.35)'; g.fillRect(x - 2 * dpr, Y(n.midi) - th, 4 * dpr, th * 2); }
  }
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0, top - 4 * dpr, Math.max(1, dpr), bot - top + 4 * dpr);
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
  } else if (state.drift && playing && !state.clip) {
    driftStep(dt); show();
    if (ms - lastSend > 400) { lastSend = ms; state.station = nearest(); sendKnobs(); writeHash(); }
  }
  const now = ctx && t0 !== null ? ctx.currentTime : ms / 1000;
  while (pending.length && pending[0].at <= now) words(pending.shift());
  draw(now);
}

readHash();
if (/clip=/.test(location.hash)) {
  // a saved moment: its own seed, and the dials it ends on, so the radio goes on from there
  try {
    state.clip = await decodeClip(location.hash);
    state.seed = state.clip.state.seed; state.station = 'a saved moment';
    const lastK = state.clip.knobs[state.clip.knobs.length - 1][1];
    KNOBS.forEach((k, i) => (state.k[k] = lastK[i] / 100));
  } catch { state.clip = null; }
}
writeHash(); Object.assign(anchor, state.k); panel(); show();
addEventListener('hashchange', () => { if (!/clip=/.test(location.hash)) { readHash(); show(); sendKnobs(); } });
new ResizeObserver(() => draw(ctx && t0 !== null ? ctx.currentTime : performance.now() / 1000)).observe($('stage'));
requestAnimationFrame(frame);
document.body.dataset.ready = '1';
