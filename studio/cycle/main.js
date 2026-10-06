// main.js — the page: one generated scene, its palette turned every frame, its music on the same beat.
import { generate, palette, light, W, H } from './scene.js';
import { Sound, modeAt } from './sound.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c'), g = canvas.getContext('2d');
canvas.width = W; canvas.height = H;
const img = g.createImageData(W, H), px = new Uint32Array(img.data.buffer), lut = new Uint32Array(256);

const params = new URLSearchParams(location.hash.slice(1));
let scene, sound, notes = [];
const SPEEDS = [['real time', 0], ['1 day = 4 min', 240], ['1 day = 1 min', 60], ['held', -1]];
let speed = params.has('speed') ? Number(params.get('speed')) : 240;

// ---- the clock: scene seconds drive the cycles; the hour follows the day speed (or the wall clock)
const clock = {
  offset: performance.now() / -1000, audio: false, hourBase: 0, tBase: 0, beatSec: 1,
  now() { return this.audio ? sound.ctx.currentTime + this.offset : performance.now() / 1000 + this.offset; },
  /** switch to (or from) the audio clock without a jump */
  use(audio) { const t = this.now(); this.audio = audio; this.offset = 0; this.offset = t - this.now(); },
  beat() { return this.now() / this.beatSec; },
  audioTimeOfBeat(b) { return b * this.beatSec - this.offset; },
  hourAt(t) {
    if (speed === 0) { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
    if (speed < 0) return this.hourBase;
    return (((this.hourBase + (t - this.tBase) * 24 / speed) % 24) + 24) % 24;
  },
  hourAtBeat(b) { return this.hourAt(b * this.beatSec); },
  setHour(h) { this.hourBase = h; this.tBase = this.now(); },
};

function load(seed) {
  const was = sound && sound.on;
  if (sound) { sound.stop(); clock.use(false); if (sound.ctx) sound.ctx.close(); }
  scene = generate(seed);
  clock.beatSec = 60 / scene.bpm;
  sound = new Sound(scene, { onNote: (at, m) => notes.push({ t: at + clock.offset, m }) });
  if (was) { sound.start(clock); clock.use(true); }
  notes = [];
  history.replaceState(null, '', `#seed=${seed}`);
  $('info').textContent = `seed ${seed} · ${scene.biome} · ${scene.used} colours · ${scene.cycles.length} cycles · ♩ = ${scene.bpm}`;
  focus = scene.waterfall.x * 0.5 + scene.cabin.x * 0.5;
  layout();
}

// ---- the music's light: each bell flares a star at night, a glint under the sun by day, a firefly at dusk
function flares(t, hour) {
  const lt = light(hour, scene), out = [];
  notes = notes.filter((n) => t - n.t < 3);
  for (const n of notes) {
    const age = t - n.t;
    if (age < 0) continue;
    const amount = Math.exp(-age * 2.4) * 0.9;
    if (lt.night > 0.5) out.push({ lo: scene.slots.stars, i: n.m % 8, amount });
    else if (lt.el > 0.05) out.push({ lo: scene.slots.glitter, i: Math.max(0, Math.min(scene.arc.NH - 1, Math.round(lt.sunPos / scene.arc.GROUP))), amount: amount * 0.7 });
    else out.push({ lo: scene.slots.fireflies, i: n.m % 6, amount });
  }
  return out;
}

// ---- drawing: the index map never changes; only the 256-entry table does
let showPal = false;
function frame() {
  const t = clock.now(), hour = clock.hourAt(t);
  const pal = palette(scene, hour, t, flares(t, hour));
  for (let i = 0; i < 256; i++) lut[i] = 0xff000000 | (pal[i * 3 + 2] << 16) | (pal[i * 3 + 1] << 8) | pal[i * 3];
  const idx = scene.index;
  for (let i = 0; i < idx.length; i++) px[i] = lut[idx[i]];
  g.putImageData(img, 0, 0);
  if (showPal) drawPalette(pal);
  const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
  $('time').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${modeAt(hour)}`;
  if (!scrubbing) $('hour').value = hour.toFixed(2);
  requestAnimationFrame(frame);
}
function drawPalette(pal) {
  const pc = $('pal'), pg = pc.getContext('2d');
  pc.width = 256 * 3; pc.height = 30;
  for (let i = 0; i < 256; i++) { pg.fillStyle = `rgb(${pal[i * 3]},${pal[i * 3 + 1]},${pal[i * 3 + 2]})`; pg.fillRect(i * 3, 0, 3, 22); }
  pg.fillStyle = '#ff9a5a';
  for (const c of scene.cycles) pg.fillRect(c.lo * 3, 25, c.len * 3 - 1, 3);
}

// ---- fitting the picture: cover the stage, pixels kept square and hard; drag to pan when cropped
let focus = W / 2, scrubbing = false;
function layout() {
  const st = $('stage'), sw = st.clientWidth, sh = st.clientHeight;
  const k = Math.max(sw / W, sh / H), cw = W * k, ch = H * k;
  const x = Math.min(0, Math.max(sw - cw, sw / 2 - focus * k)), y = (sh - ch) / 2;
  Object.assign(canvas.style, { width: `${cw}px`, height: `${ch}px`, left: `${x}px`, top: `${y}px` });
}
addEventListener('resize', layout);
{
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, f: focus }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = canvas.clientWidth / W; focus = drag.f - (e.clientX - drag.x) / k; layout();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
}

// ---- controls
for (const [label, s] of SPEEDS) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
  b.onclick = () => { clock.setHour(clock.hourAt(clock.now())); speed = s; clock.setHour(clock.hourAt(clock.now())); for (const x of $('speeds').children) x.classList.toggle('on', x === b); };
  if (s === speed) b.classList.add('on');
  $('speeds').append(b);
}
$('hour').addEventListener('input', () => {
  scrubbing = true;
  if (speed === 0) { speed = 240; for (const x of $('speeds').children) x.classList.toggle('on', x.textContent === SPEEDS[1][0]); }
  clock.setHour(Number($('hour').value));
});
$('hour').addEventListener('change', () => { scrubbing = false; });
$('new').onclick = () => load(1 + Math.floor(Math.random() * 99999));
$('sound').onclick = () => {
  if (sound.on) { sound.stop(); clock.use(false); $('sound').classList.remove('on'); $('sound').textContent = 'sound'; return; }
  sound.start(clock); clock.use(true);
  $('sound').classList.add('on'); $('sound').textContent = 'sound on';
};
$('palbtn').onclick = () => { showPal = !showPal; $('pal').hidden = !showPal; $('palbtn').classList.toggle('on', showPal); };
$('about').onclick = () => { $('notes').hidden = !$('notes').hidden; };

const seed = Number(params.get('seed')) || 1 + Math.floor(Math.random() * 99999);
const startHour = params.has('h') ? Number(params.get('h')) : (() => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; })();
load(seed);
clock.setHour(startHour);
requestAnimationFrame(frame);
