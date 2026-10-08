// main.js — the page: a generated scene under the real sky, its palette turned every frame, its music
// on the same beat. Two ways to see it: the painting (one view, nothing redrawn but the sky) and the
// flight (fly.js: the same palette over a 3D world, flown in a loop).
import { generate, palette, paintSunPath, useSky, light, unproject, W, H } from './scene.js';
import { auroraAt, paintAurora, compass } from './aurora.js';
import { sky, solarHour } from './astro.js';
import { drawNight } from './night.js';
import { Precip } from './precip.js';
import { Life } from './life.js';
import { lightning, thunderDelay, KINDS } from './weather.js';
import { Sound, modeAt } from './sound.js';

useSky(sky);
const $ = (id) => document.getElementById(id);
const canvas = $('c'), g = canvas.getContext('2d');
canvas.width = W; canvas.height = H;
const img = g.createImageData(W, H), px32 = new Uint32Array(img.data.buffer), lut = new Uint32Array(256);

const params = new URLSearchParams(location.hash.slice(1));
const SPEEDS = [['real time', 0], ['1 day = 4 min', 240], ['1 day = 1 min', 60], ['held', -1]];
let speed = params.has('speed') ? Number(params.get('speed')) : 240;
let scene, sound, life, notes = [], fly = null, mode = params.get('mode') === 'fly' ? 'fly' : 'painting';
// the city (cityworld.js) is a world to fly, with no painting of its own: `world=city` flies it
let cityMode = params.get('world') === 'city';
if (cityMode) mode = 'fly';
const flyKind = () => (cityMode ? 'city' : scene.kind);

// ---- the place: from the link, else a guess from the time zone (longitude) at a middling latitude
const tzLon = -new Date().getTimezoneOffset() / 4;
const view = {
  lat: params.has('lat') ? Number(params.get('lat')) : 40.7,
  lon: params.has('lon') ? Number(params.get('lon')) : Math.round(tzLon * 10) / 10,
  facing: 0,
};
view.facing = params.has('face') ? Number(params.get('face')) : view.lat >= 0 ? 180 : 0;   // toward the sun's side

// ---- the clock: scene seconds turn the cycles; the moment (ms) follows the day speed or the wall clock
const clock = {
  offset: performance.now() / -1000, audio: false, msBase: Date.now(), tBase: 0, beatSec: 1,
  now() { return this.audio ? sound.ctx.currentTime + this.offset : performance.now() / 1000 + this.offset; },
  /** switch to (or from) the audio clock without a jump */
  use(audio) { const t = this.now(); this.audio = audio; this.offset = 0; this.offset = t - this.now(); },
  beat() { return this.now() / this.beatSec; },
  audioTimeOfBeat(b) { return b * this.beatSec - this.offset; },
  msAt(t) {
    if (speed === 0) return Date.now();
    if (speed < 0) return this.msBase;
    return this.msBase + (t - this.tBase) * 86400000 / speed;
  },
  setMs(ms) { this.msBase = ms; this.tBase = this.now(); },
  audioTimeOf(t) { return t - this.offset; },
  speed() { return speed; },
  view,
  lightAtBeat(b) {
    const sk = sky(this.msAt(b * this.beatSec), view.lat, view.lon);
    return { el: Math.sin(sk.sun.alt * Math.PI / 180), rising: sk.sun.az < 180 };
  },
};

function load(seed, kind = 'lake') {
  const was = sound && sound.on;
  if (sound) { sound.close(); clock.use(false); }
  scene = generate(seed, kind);
  life = new Life(scene);
  clock.beatSec = 60 / scene.bpm;
  sound = new Sound(scene, { onNote: (at, m) => notes.push({ t: at + clock.offset, m }) });
  sound.place = mode === 'fly' && fly ? fly.place() : null;
  sound.setAmbience(ambience);
  if (was) { sound.start(clock); clock.use(true); }
  notes = [];
  scene.path.day = null;
  if (fly) fly.load(seed, scene.bpm, flyKind());
  $('info').textContent = `seed ${seed} · ${scene.kind} · ${scene.biome} · ${scene.used} colours · ${scene.cycles.length} cycles · ♩ = ${scene.bpm}`;
  focus = scene.kind === 'coast' ? (scene.lighthouse.x + W / 2) / 2 : scene.waterfall.x * 0.5 + scene.cabin.x * 0.5;
  layout(); remember();
}
function remember() {
  const ms = clock.msAt(clock.now());
  const q = new URLSearchParams({ seed: scene.seed, ...(scene.kind === 'coast' ? { kind: 'coast' } : {}), lat: view.lat, lon: view.lon, face: view.facing, date: new Date(ms).toISOString().slice(0, 10), h: solarHour(ms, view.lon).toFixed(2) });
  if (speed !== 240) q.set('speed', speed);
  if (mode === 'fly') q.set('mode', 'fly');
  if (cityMode) q.set('world', 'city');
  if (!ambience) q.set('amb', '0');
  if (view.wx) q.set('wx', view.wx);
  if (view.aurora) q.set('aur', '1');
  history.replaceState(null, '', `#${q}`);
}

// ---- the music's light: a bell flares a real star at night, a glint under the sun by day, a firefly at dusk
function flares(t, lt) {
  const out = [];
  let star = null;
  notes = notes.filter((n) => t - n.t < 3);
  for (const n of notes) {
    const age = t - n.t;
    if (age < 0) continue;
    const amount = Math.exp(-age * 2.4) * 0.9;
    if (lt.night > 0.5) { if (!star || amount > star.amount) star = { k: (n.m * 37) % 97, amount }; }
    else if (lt.el > 0.05 && lt.sunCol$ > -2) out.push({ lo: scene.slots.glitter, i: Math.max(0, Math.min(scene.path.NH - 1, Math.round(lt.sunCol$))), amount: amount * 0.7 });
    else out.push({ lo: scene.slots.fireflies, i: n.m % 6, amount });
  }
  return { palette: out, star };
}

// ---- drawing the painting: the index map never changes, but for the sun's path once a day
let showPal = false, figures = params.get('fig') === '1', lastStars = 1, lastAurora = null, auPeak = 0;
const auCache = {};
function paint(t, ms) {
  const sk = sky(ms, view.lat, view.lon);
  const day = Math.floor((ms / 3600000 + view.lon / 15) / 24), pv = scene.path.view;
  if (scene.path.day !== day || !pv || pv.lat !== view.lat || pv.lon !== view.lon || pv.facing !== view.facing) paintSunPath(scene, view, ms);
  const lt = light(scene, view, sk, t), f = flares(t, lt);
  const pal = palette(scene, view, sk, t, f.palette);
  for (let i = 0; i < 256; i++) lut[i] = 0xff000000 | (pal[i * 3 + 2] << 16) | (pal[i * 3 + 1] << 8) | pal[i * 3];
  const idx = scene.index;
  for (let i = 0; i < idx.length; i++) px32[i] = lut[idx[i]];
  // the aurora, where and when this place would see it: behind the stars, mirrored on the water
  const au = auroraAt(scene.seed, ms, view.lat, view.lon, sk.sun.alt, view.aurora ? 7 : null);
  lastAurora = au; auPeak = 0;
  if (au) { auCache.want = `${scene.seed}|${scene.kind}|${view.facing}`; auPeak = paintAurora(img.data, scene, au, t, { cover: lt.cover, overcast: lt.wx.overcast, dir: (x, y) => unproject(scene, view, x, y), cache: auCache }); }
  const star = f.star && lastStars ? { k: f.star.k % lastStars, amount: f.star.amount } : null;
  lastStars = drawNight(img.data, scene, view, sk, t, { night: lt.night * (1 - 0.95 * lt.wx.overcast), figures, flare: star, cover: lt.cover, overcast: lt.wx.overcast }).length || 1;
  life.draw(img.data, { t, lt });                     // boats and gulls, geese and a hawk
  // what the weather draws: rain and its rings, snow, fog on the lake, the bolt
  if (!precip || precip.seed !== scene.seed) precip = new Precip(W, H, scene.seed);
  const L = scene.layer, LA = scene.LAYER, fl = lightning(scene.seed, t, lt.wx.storm);
  precip.draw(img.data, {
    t, wx: lt.wx, lt, flash: fl, horizon: scene.yH, fogTop: scene.yH - 70, fogBottom: scene.yH + 60, fogLine: scene.yH + 4,
    boltTop: scene.yH * 0.18, boltBottom: scene.yH - 8,
    water: (x, y) => x >= 0 && x < W && y >= 0 && y < H && L[y * W + x] === LA.lake,
    sky: (x, y) => x >= 0 && x < W && y >= 0 && y < H && (L[y * W + x] === LA.sky || L[y * W + x] === LA.cloud),
    veil: (i) => (L[i] === LA.far || L[i] === LA.snow ? 0.6 : L[i] === LA.mid ? 0.35 : scene.kind === 'coast' && (L[i] === LA.cliff || L[i] === LA.cabin) ? 0.3 : 0),
  });
  thunderFrom(fl);
  g.putImageData(img, 0, 0);
  if (showPal) drawPalette(pal);
  return { sk, lt };
}

// ---- thunder: each strike, once, handed to the sound after the delay its distance gives it
let precip = null, lastStrike = -1;
function thunderFrom(fl) {
  const st = fl && fl.strike;
  if (!st || st.t0 === lastStrike) return;
  lastStrike = st.t0;
  if (sound && sound.on) sound.thunder(clock.audioTimeOf(st.t0 + thunderDelay(st.dist)), st.dist);
}

function frame() {
  const t = clock.now(), ms = clock.msAt(t);
  const r = mode === 'fly' && fly ? fly.frame(t, ms, { figures, notes }) : paint(t, ms), { sk, lt } = r;
  if (r.fl) thunderFrom(r.fl);
  if (mode === 'fly' && fly) { lastAurora = r.au || null; auPeak = r.auPeak || 0; }
  if (sound) { sound.place = mode === 'fly' && fly ? fly.place() : null; if (lt.wx) sound.setWeather(lt.wx); }
  const hr = solarHour(ms, view.lon), hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60);
  const date = new Date(ms + view.lon / 15 * 3600000).toISOString().slice(0, 10);
  const el = Math.sin(sk.sun.alt * Math.PI / 180);
  const playing = sound && sound.on && sound.describe;
  $('time').textContent = `${date} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${playing ? '' : ` · ${modeAt(el, sk.sun.az < 180)}`} · moon ${Math.round(sk.moonLit * 100)}%${lt.wx ? ` · ${lt.wx.kind} ${Math.round(lt.wx.temp)}°` : ''}${lastAurora && auPeak > 0.06 ? ` · aurora Kp ${lastAurora.kp.toFixed(0)}, ${compass(lastAurora.bearing)}` : ''}${sound && sound.on && sound.describe ? ` · ♪ ${sound.describe}` : ''}`;
  if (!scrubbing) $('hour').value = hr.toFixed(2);
  if (Math.floor(t) % 5 === 0 && Math.floor(t) !== lastRemember) { lastRemember = Math.floor(t); remember(); }
  requestAnimationFrame(frame);
}
let lastRemember = -1;
function drawPalette(pal) {
  const pc = $('pal'), pg = pc.getContext('2d');
  pc.width = 256 * 3; pc.height = 30;
  for (let i = 0; i < 256; i++) { pg.fillStyle = `rgb(${pal[i * 3]},${pal[i * 3 + 1]},${pal[i * 3 + 2]})`; pg.fillRect(i * 3, 0, 3, 22); }
  pg.fillStyle = '#ff9a5a';
  for (const c of (mode === 'fly' && fly ? fly.cycles() : scene.cycles)) pg.fillRect(c.lo * 3, 25, c.len * 3 - 1, 3);
}

// ---- fitting the picture: cover the stage, pixels kept square and hard; drag to pan when cropped
let focus = W / 2, scrubbing = false;
function layout() {
  const st = $('stage'), sw = st.clientWidth, sh = st.clientHeight;
  const k = Math.max(sw / W, sh / H), cw = W * k, ch = H * k;
  const f = mode === 'fly' ? W / 2 : focus;
  const x = Math.min(0, Math.max(sw - cw, sw / 2 - f * k)), y = (sh - ch) / 2;
  Object.assign(canvas.style, { width: `${cw}px`, height: `${ch}px`, left: `${x}px`, top: `${y}px` });
}
addEventListener('resize', layout);
{
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, f: focus }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || mode === 'fly') return;
    const k = canvas.clientWidth / W; focus = drag.f - (e.clientX - drag.x) / k; layout();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
}

// ---- controls
const setSpeed = (s) => { clock.setMs(clock.msAt(clock.now())); speed = s; clock.setMs(clock.msAt(clock.now())); for (const x of $('speeds').children) x.classList.toggle('on', Number(x.dataset.s) === s); remember(); };
for (const [label, s] of SPEEDS) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.s = s;
  b.onclick = () => setSpeed(s);
  if (s === speed) b.classList.add('on');
  $('speeds').append(b);
}
const moveTo = (ms) => { if (speed === 0) setSpeed(240); clock.setMs(ms); remember(); };
$('hour').addEventListener('input', () => {
  scrubbing = true;
  const ms = clock.msAt(clock.now()), h = Number($('hour').value);
  moveTo(ms + (h - solarHour(ms, view.lon)) * 3600000);
});
$('hour').addEventListener('change', () => { scrubbing = false; });
$('date').addEventListener('change', () => {
  const v = $('date').value; if (!v) return;
  const ms = clock.msAt(clock.now()), h = solarHour(ms, view.lon);
  moveTo(Date.parse(`${v}T00:00:00Z`) + (h - view.lon / 15) * 3600000);
});
const PLACES = { here: null, 'New York': [40.71, -74.0], Reykjavík: [64.15, -21.94], Quito: [-0.18, -78.47], Sydney: [-33.87, 151.21], Tromsø: [69.65, 18.96] };
for (const name of Object.keys(PLACES)) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = name;
  b.onclick = () => {
    if (name === 'here') {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((p) => place(p.coords.latitude, p.coords.longitude), () => {});
      return;
    }
    place(...PLACES[name]);
  };
  $('places').append(b);
}
// the weather: the forecast (auto), or one kind held
view.wx = params.get('wx') || null;
view.aurora = params.get('aur') === '1';
$('aurbtn').classList.toggle('on', view.aurora);
$('aurbtn').onclick = () => { view.aurora = !view.aurora; $('aurbtn').classList.toggle('on', view.aurora); remember(); };
for (const k of ['auto', ...KINDS]) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = k; b.dataset.k = k;
  b.onclick = () => { view.wx = k === 'auto' ? null : k; syncWx(); remember(); };
  $('wxs').append(b);
}
function syncWx() { for (const b of $('wxs').children) b.classList.toggle('on', (b.dataset.k === 'auto' && !view.wx) || b.dataset.k === view.wx); }
syncWx();

function place(lat, lon) {
  view.lat = Math.round(lat * 100) / 100; view.lon = Math.round(lon * 100) / 100;
  view.facing = view.lat >= 0 ? 180 : 0; syncFacing(); remember();
  $('where').textContent = `${Math.abs(view.lat).toFixed(2)}°${view.lat >= 0 ? 'N' : 'S'} ${Math.abs(view.lon).toFixed(2)}°${view.lon >= 0 ? 'E' : 'W'}`;
}
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
for (let i = 0; i < 8; i++) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = DIRS[i]; b.dataset.a = i * 45;
  b.onclick = () => { view.facing = i * 45; syncFacing(); remember(); };
  $('facing').append(b);
}
function syncFacing() { for (const b of $('facing').children) b.classList.toggle('on', Number(b.dataset.a) === view.facing); }
$('new').onclick = () => load(1 + Math.floor(Math.random() * 99999), Math.random() < 0.5 ? 'coast' : 'lake');
$('sound').onclick = () => {
  if (sound.on) { sound.stop(); clock.use(false); $('sound').classList.remove('on'); $('sound').textContent = 'sound'; return; }
  sound.start(clock); clock.use(true);
  $('sound').classList.add('on'); $('sound').textContent = 'sound on';
};
$('citybtn').classList.toggle('on', cityMode);
$('citybtn').onclick = async () => {
  cityMode = !cityMode;
  $('citybtn').classList.toggle('on', cityMode);
  if (mode !== 'fly') { if (cityMode) $('flybtn').click(); else remember(); return; }
  if (fly) {
    $('citybtn').textContent = cityMode ? 'building the city…' : 'building the world…';
    await new Promise((r) => setTimeout(r, 30));
    fly.load(scene.seed, scene.bpm, flyKind());
    $('citybtn').textContent = 'city';
  }
  remember();
};
$('figbtn').onclick = () => { figures = !figures; $('figbtn').classList.toggle('on', figures); };
$('figbtn').classList.toggle('on', figures);
let ambience = params.get('amb') !== '0';
$('ambbtn').classList.toggle('on', ambience);
$('ambbtn').onclick = () => { ambience = !ambience; $('ambbtn').classList.toggle('on', ambience); if (sound) sound.setAmbience(ambience); remember(); };
$('palbtn').onclick = () => { showPal = !showPal; $('pal').hidden = !showPal; $('palbtn').classList.toggle('on', showPal); };
$('about').onclick = () => { $('notes').hidden = !$('notes').hidden; };
$('more').onclick = () => { $('sky').hidden = !$('sky').hidden; $('more').classList.toggle('on', !$('sky').hidden); };
$('flybtn').onclick = async () => {
  mode = mode === 'fly' ? 'painting' : 'fly';
  if (mode === 'fly' && !fly) {
    $('flybtn').textContent = cityMode ? 'building the city…' : 'building the world…';
    await new Promise((r) => setTimeout(r, 30));
    const { Flight } = await import('./fly.js');
    fly = new Flight(img, g, view);
    fly.load(scene.seed, scene.bpm, flyKind());
  }
  $('flybtn').textContent = mode === 'fly' ? 'back to the painting' : 'fly';
  $('flybtn').classList.toggle('on', mode === 'fly');
  $('facingRow').hidden = mode === 'fly';
  layout(); remember();
};

const seed = Number(params.get('seed')) || 1 + Math.floor(Math.random() * 99999);
load(seed, params.get('kind') === 'coast' ? 'coast' : 'lake');
place(view.lat, view.lon);
if (params.has('face')) { view.facing = Number(params.get('face')); syncFacing(); }
if (params.has('date')) {
  const h = params.has('h') ? Number(params.get('h')) : 21;
  clock.setMs(Date.parse(`${params.get('date')}T00:00:00Z`) + (h - view.lon / 15) * 3600000);
}
$('date').value = new Date(clock.msAt(clock.now())).toISOString().slice(0, 10);
if (mode === 'fly') { mode = 'painting'; $('flybtn').click(); }
requestAnimationFrame(frame);
