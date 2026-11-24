// main.js — Walk: the colour cycle's lake world on the GPU (gpu.js), in colour or in type.
//
// The world, its light and its palette are the flight's own (cycle/world.js, cycle/fly.js): Flight
// builds the world and lights the palette for this moment exactly as it does for the Voxel Space view,
// and gpu.js draws it. Two ways to move: GLIDE flies the flight's own loop; WALK puts you on the ground
// (keys or touch), eye 1.7 m up, and the water holds you.

import { Flight } from '../cycle/fly.js';
import { cameraAt, heightAt } from '../cycle/world.js';
import { sky } from '../cycle/astro.js';
import { add3, scale3 } from '../cycle/scene.js';
import { GPUWorld } from './gpu.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.hash.slice(1));
const num = (k, d) => (params.has(k) && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : d);

// ---- the world, lit by the flight's own code
const view = { lat: num('lat', 40.7), lon: num('lon', 0), wx: params.get('wx') || null, aurora: false };
const seed = num('seed', 1 + Math.floor(Math.random() * 99999));
const flight = new Flight(null, null, view);
$('status').textContent = 'building the world…';
await new Promise((r) => setTimeout(r, 20));
flight.load(seed, null, 'lake');
const world = flight.world;

const canvas = $('stage');
let gpu;
try { gpu = new GPUWorld(canvas); gpu.load(world, flight.cloud); }
catch (e) { $('status').textContent = `this page needs WebGL2 (${e.message})`; throw e; }

// ---- the clock: scene time, and the moment it shows (a day in 4 minutes, or held)
const date = params.get('date') || new Date().toISOString().slice(0, 10);
let hour = num('h', 10), speed = num('speed', 360);           // speed: scene seconds per real second (0: held)
let ms0 = Date.parse(`${date}T00:00:00Z`) + (hour - view.lon / 15) * 3600000, t0 = performance.now() / 1000;
const msNow = () => ms0 + (performance.now() / 1000 - t0) * speed * 1000;

// ---- the camera: glide the loop, or walk
const EYE = 1.7, LOOP_S = 1200;
let mode = params.get('mode') === 'walk' ? 'walk' : 'glide';
let u = num('at', 0.08), uT = performance.now() / 1000;
const me = { x: num('x', 0), y: num('y', 0), yaw: num('yaw', 0), pitch: 0 };
const ground = (x, y) => Math.max(0, heightAt(world, x, y));
function cam() {
  if (mode === 'glide') {
    const c = cameraAt(world, ((u + (performance.now() / 1000 - uT) / LOOP_S) % 1 + 1) % 1);
    return { x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: Math.atan(c.pitch) };
  }
  return { x: me.x, y: me.y, z: ground(me.x, me.y) + EYE, yaw: me.yaw, pitch: me.pitch };
}
function setMode(m) {
  if (m === 'walk' && mode !== 'walk') { const c = cam(); Object.assign(me, { x: c.x, y: c.y, yaw: c.yaw, pitch: 0 }); }
  if (m === 'glide' && mode !== 'glide') { u = 0.08; uT = performance.now() / 1000; }
  mode = m; $('modebtn').textContent = mode === 'walk' ? 'glide the loop' : 'walk';
  $('help').hidden = mode !== 'walk';
  remember();
}
if (mode === 'walk' && !params.has('x')) { mode = 'glide'; setMode('walk'); }
$('modebtn').onclick = () => setMode(mode === 'walk' ? 'glide' : 'walk');

// keys: WASD / arrows move, Q E (or ←→ with shift) turn, shift runs
const keys = new Set();
addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; keys.add(e.key.toLowerCase()); if (mode === 'glide' && /^(w|a|s|d|arrow)/.test(e.key.toLowerCase())) setMode('walk'); });
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
// pointer: drag to look; on a touch screen the left half of the picture moves, the right half looks
const drags = new Map();
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, move: e.pointerType === 'touch' && e.clientX < innerWidth / 2 }); if (mode === 'glide') setMode('walk'); });
canvas.addEventListener('pointermove', (e) => {
  const d = drags.get(e.pointerId); if (!d) return;
  if (!d.move) { me.yaw += (e.clientX - d.x) * 0.005; me.pitch = Math.max(-1.2, Math.min(1.2, me.pitch - (e.clientY - d.y) * 0.005)); }
  d.x = e.clientX; d.y = e.clientY;
});
const end = (e) => { drags.delete(e.pointerId); remember(); };
canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

function walk(dt) {
  if (mode !== 'walk') return;
  let f = 0, s = 0, turn = 0;
  if (keys.has('w') || keys.has('arrowup')) f += 1;
  if (keys.has('s') || keys.has('arrowdown')) f -= 1;
  if (keys.has('d')) s += 1; if (keys.has('a')) s -= 1;
  if (keys.has('arrowright') || keys.has('e')) turn += 1; if (keys.has('arrowleft') || keys.has('q')) turn -= 1;
  for (const d of drags.values()) if (d.move) { f += Math.max(-1, Math.min(1, -(d.y - d.y0) / 60)); s += Math.max(-1, Math.min(1, (d.x - d.x0) / 60)); }
  me.yaw += turn * dt * 1.6;
  const v = (keys.has('shift') ? 28 : 5) * dt;
  me.x += (Math.sin(me.yaw) * f + Math.cos(me.yaw) * s) * v;
  me.y += (Math.cos(me.yaw) * f - Math.sin(me.yaw) * s) * v;
}

// ---- type, and its two sliders
let type = params.get('type') !== '0';
gpu.tune({ dens: num('dens', 1), glyph: params.has('glyph') ? num('glyph', 7) : null });
const densOf = (v) => 0.25 * Math.pow(24, v), vOfDens = (d) => Math.log(d / 0.25) / Math.log(24);
function syncType() {
  $('typebtn').classList.toggle('on', type); $('typeRow').hidden = !type;
  $('adens').value = vOfDens(gpu.dens).toFixed(3); $('adensV').textContent = `×${gpu.dens.toFixed(2)}`;
  const g = gpu.glyphCss ?? Math.min(9, Math.max(5, canvas.clientHeight / 100));
  $('aglyph').value = g; $('aglyphV').textContent = `${(+g).toFixed(1)} px${gpu.glyphCss == null ? ' (auto)' : ''}`;
}
$('typebtn').onclick = () => { type = !type; syncType(); remember(); };
$('adens').addEventListener('input', () => { gpu.tune({ dens: densOf(Number($('adens').value)) }); syncType(); });
$('aglyph').addEventListener('input', () => { gpu.tune({ glyph: Number($('aglyph').value) }); syncType(); });
for (const id of ['adens', 'aglyph']) $(id).addEventListener('change', () => remember());
// the hour, and the day's speed
function syncHour() { const h = (((msNow() / 3600000 + view.lon / 15) % 24) + 24) % 24; $('hour').value = h.toFixed(2); $('hourV').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; return h; }
$('hour').addEventListener('input', () => { const now = msNow(), h = Number($('hour').value), cur = (((now / 3600000 + view.lon / 15) % 24) + 24) % 24; ms0 += (h - cur) * 3600000; remember(); });
$('heldbtn').onclick = () => { const now = msNow(); speed = speed ? 0 : 360; ms0 = now; t0 = performance.now() / 1000; $('heldbtn').textContent = speed ? 'hold the hour' : 'let the day run'; remember(); };
$('heldbtn').textContent = speed ? 'hold the hour' : 'let the day run';
$('newbtn').onclick = () => { location.hash = `seed=${1 + Math.floor(Math.random() * 99999)}&h=${syncHour().toFixed(2)}${type ? '' : '&type=0'}`; location.reload(); };

function remember() {
  const q = new URLSearchParams({ seed, date: new Date(msNow()).toISOString().slice(0, 10), h: syncHour().toFixed(2) });
  if (!speed) q.set('speed', '0');
  if (!type) q.set('type', '0');
  if (Math.abs(gpu.dens - 1) > 0.005) q.set('dens', gpu.dens.toFixed(2));
  if (gpu.glyphCss != null) q.set('glyph', String(gpu.glyphCss));
  if (mode === 'walk') { q.set('mode', 'walk'); q.set('x', me.x.toFixed(1)); q.set('y', me.y.toFixed(1)); q.set('yaw', me.yaw.toFixed(3)); }
  history.replaceState(null, '', `#${q}`);
}

// ---- size: the canvas fills the window at the screen's density; the world pass follows the frame time
let scale = 0.6;
const fixedRes = params.has('res') ? Math.max(0.1, Math.min(1, num('res', 0.6))) : null;   // res=: hold the world pass's resolution
function resize() {
  const dpr = Math.min(3, devicePixelRatio || 1);
  canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr);
  gpu.dpr = dpr;
}
addEventListener('resize', resize); resize();

let last = performance.now(), slow = 0, fast = 0, frames = 0, fpsT = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  walk(dt);
  const ms = msNow(), sk = sky(ms, view.lat, view.lon);
  flight.t = (now - t0 * 1000) / 1000;
  const lt = flight.light(sk, ms), pal = flight.palette(lt, flight.t);
  const wx = lt.wx || { fog: 0, rain: 0, overcast: 0 };
  const env = {
    timeS: flight.t, drift: ms / 86400000 * 900,
    fogK: 1 / Math.max(260, 3600 - 1400 * lt.cover - 3100 * wx.fog - 1100 * wx.rain),
    cloudThr: 0.66 - 0.2 * lt.cover - 0.28 * wx.overcast, cloudA: Math.min(1, 0.35 + 0.65 * lt.cover + 0.3 * wx.overcast),
    cloudLit: add3(add3(scale3(lt.amb, 0.95), lt.sunCol, 0.85), lt.moonCol, 0.6), cloudDark: add3(scale3(lt.amb, 0.75), lt.sunCol, 0.25),
  };
  // the world pass's resolution follows the time between frames: a slow device draws it smaller
  if (dt > 0.034) { slow++; fast = 0; } else if (dt < 0.019) { fast++; slow = 0; }
  if (slow > 8) { scale = Math.max(0.2, scale * 0.85); slow = 0; }
  if (fast > 40) { scale = Math.min(type ? 0.6 : 1, scale * 1.1); fast = 0; }
  if (fixedRes) scale = fixedRes;
  gpu.frame(cam(), lt, pal, env, type, fixedRes ?? Math.min(scale, type ? 0.6 : 1, 1600 / canvas.width));
  frames++;
  if (now - fpsT > 1000) {
    const h = syncHour();
    $('status').textContent = `seed ${seed} · ${world.biome} · ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} · ${frames} fps · world at ${Math.round(Math.min(scale, type ? 0.6 : 1) * 100)}%`;
    frames = 0; fpsT = now;
  }
}
syncType(); syncHour(); setMode(mode); remember();
requestAnimationFrame(frame);
