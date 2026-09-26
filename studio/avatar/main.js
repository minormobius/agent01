// main.js — Attractor Bodies: a sketchbook of creatures made of strange attractors.
//
// packages/attractor (copied to ../vendor/attractor: a static site cannot import across directories)
// makes a character from a seed: a body spec for packages/figure's rig, an attractor for each part
// from the bestiary, a palette and a style. This page walks or poses it, turns the camera, and draws it
// as light. The hash carries the seed and any overrides, so a find can be copied and reopened.
//
//   #seed=42&style=threads&palette=ember&thought=0.8   (any character field)

import { makeRig, solve } from '../vendor/figure/lib/rig.js';
import { walk } from '../vendor/figure/lib/gait.js';
import { POSES } from '../vendor/figure/lib/poses.js';
import { character, build, frames, STYLES, PALETTES, PARTS } from '../vendor/attractor/lib/avatar.js';
import { makeLight, drawAvatar, drawThreads } from '../vendor/attractor/lib/draw.js';
import { handPose, GESTURES } from '../vendor/figure/lib/hand.js';
import { discover, dimension, realise } from '../vendor/attractor/lib/space.js';
import { BESTIARY } from '../vendor/attractor/lib/bestiary.js';

const $ = (id) => document.getElementById(id);
const MODES = ['walk', 'stand', 'contrapposto', 'reachUp', 'lookBack', 'crouch'].filter((m) => m === 'walk' || POSES[m]);
const KNOBS = [['thought', 'thought', 0, 1, 0.01], ['reach', 'reach', 0.5, 2.5, 0.01], ['swirl', 'swirl', 0, 2, 0.01], ['speed', 'speed', 0.2, 2.5, 0.01]];

// ---- state: the hash is the truth ------------------------------------------------------------------
const state = { seed: 1, over: {}, mode: 'walk', turn: true };
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  state.seed = Number(q.get('seed')) || Math.floor(Math.random() * 1e6);
  state.over = {};
  for (const [k, v] of q) if (!['seed', 'mode'].includes(k)) state.over[k] = isNaN(Number(v)) ? v : Number(v);
  const c = String(q.get('cam') || '').split(',').map(Number);
  if (c.length === 5 && c.every(Number.isFinite)) [cam.yaw, cam.pitch, cam.zoom, cam.px, cam.py] = c; else Object.assign(cam, CAM0);
  if (q.get('mode')) state.mode = q.get('mode');
}
function writeHash() {
  const q = new URLSearchParams({ seed: state.seed, mode: state.mode, ...state.over });
  history.replaceState(null, '', `#${q}`);
}

// ---- the character ---------------------------------------------------------------------------------
let A = null, rig = null, posed = new Map(), extraBestiary = [];
function rebuild() {
  const { cam: _c, ...over } = state.over;
  const ch = character(state.seed, over);
  if (state.over.torsoKey) ch.parts.torso = state.over.torsoKey;
  A = build(ch); rig = makeRig(ch.body); posed = new Map();
  writeHash(); info(); controls();
}
// the pose, with the character's hands in their gesture (unless the pose places them itself)
const withHands = (p) => {
  const g = A.ch.gesture, arms = { ...(p.arms || {}) };
  for (const s of ['l', 'r']) if (!arms[s]?.gesture && !arms[s]?.on) arms[s] = { ...(arms[s] || {}), gesture: g };
  return { ...p, arms };
};
const poseAt = (t) => {
  if (state.mode === 'walk') return withHands(walk(rig, t).pose);
  const key = state.mode + ':' + A.ch.gesture;
  if (!posed.has(key)) posed.set(key, withHands(POSES[state.mode](rig)));
  return posed.get(key);
};
// the hands as threads, once they are big enough on screen to be worth it: each finger and the thumb
// a thread along its bones, knuckle to tip; the palm four threads from the wrist to the knuckles
function handLines(S, s) {
  const H = handPose(S, s), lines = [], wrist = S.J[`wrist_${s}`];
  for (const bones of [...Object.values(H.fingers), H.thumb]) lines.push({ pts: [bones[0].a, ...bones.map((b) => b.b)], r: bones[1].ra * 0.8 });
  for (const bones of Object.values(H.fingers)) lines.push({ pts: [wrist, bones[0].a], r: bones[0].ra * 0.7 });
  return lines;
}
const HAND = PARTS.findIndex((p) => p[0] === 'hand_l'), HAND_R = PARTS.findIndex((p) => p[0] === 'hand_r');

// ---- drawing ---------------------------------------------------------------------------------------
const canvas = $('c'), ctx = canvas.getContext('2d'), host = $('stage');
let light = null, W = 0, H = 0, dpr = 1;
function size() {
  dpr = Math.min(2, window.devicePixelRatio || 1); W = host.clientWidth; H = host.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  light = makeLight(canvas.width, canvas.height);
}
new ResizeObserver(size).observe(host); size();

// ---- the camera: orbit (yaw, pitch), zoom about a point, pan. An orthographic view round the pelvis,
// the floor at 93% of the height at zoom 1. `cam.px/py` are the pan in heights of the stage.
const CAM0 = { yaw: 0.5, pitch: 0.12, zoom: 1, px: 0, py: 0 };
const cam = { ...CAM0 };
let lastTouch = -1e9;                                     // the auto-turn waits for hands off the glass
function view(J, t, w, h, scaleHeads, c = cam) {
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const root = J.pelvis, sc = (h / scaleHeads) * c.zoom, ox = w / 2 + c.px * h, oy = h * 0.93 + c.py * h;
  return (p) => {
    const x = p[0] - root[0], z = p[2] - root[2], X = x * cy + z * sy, Z = -x * sy + z * cy;
    return [ox + X * sc, oy - (p[1] * cp - Z * sp) * sc];
  };
}
/** Zoom by k keeping the stage point (x, y) (canvas pixels) where it is. */
function zoomAbout(k, x, y) {
  const z2 = Math.min(12, Math.max(0.5, cam.zoom * k)); k = z2 / cam.zoom;
  const H = canvas.height, ox = canvas.width / 2 + cam.px * H, oy = H * 0.93 + cam.py * H;
  cam.px = (x - (x - ox) * k - canvas.width / 2) / H; cam.py = (y - (y - oy) * k - H * 0.93) / H; cam.zoom = z2;
}
function frame(now) {
  requestAnimationFrame(frame);
  if (!A) return;
  const t = now / 1000, S = solve(rig, poseAt(t)), F = frames(S.J, S.F.pelvis.z);
  const dt = Math.min(0.1, t - (frame.last ?? t)); frame.last = t;
  if (state.turn && t - lastTouch > 4) cam.yaw += 0.18 * dt;          // a slow turn, when left alone
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.45, 0, canvas.width / 2, canvas.height * 0.45, Math.max(canvas.width, canvas.height) * 0.7);
  g.addColorStop(0, '#120e18'); g.addColorStop(1, '#040306');
  ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // the floor: a faint line of light under the feet
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(canvas.width * 0.2, canvas.height * 0.93, canvas.width * 0.6, 1 * dpr);
  const heads = A.ch.body.heads + 1.3, proj = view(S.J, t, canvas.width, canvas.height, heads), gain = Math.min(1.6, (900 / Math.sqrt(canvas.width * canvas.height)) * 1.2);
  // how big a hand is on screen decides its detail: one attractor far off, threads for fingers near
  const handPx = (canvas.height / heads) * cam.zoom * 0.75, near = Math.max(0, Math.min(1, (handPx - 30 * dpr) / (45 * dpr)));
  drawAvatar(light, A, F, t, proj, { gain, partGain: near ? (i) => (i === HAND || i === HAND_R ? 1 - near : 1) : null });
  if (near > 0.01) for (const s of ['l', 'r']) {
    try { drawThreads(light, handLines(S, s), t, A.clouds[s === 'l' ? HAND : HAND_R], A.colours[HAND], proj, { gain: gain * near * 1.4, per: 6, streak: Math.max(8, A.ch.streak) }); } catch { /* a hand that won't solve: keep the attractor */ }
  }
  light.flush(ctx);
}
requestAnimationFrame(frame);

// the neighbours: stills of the next seeds, drawn once
function thumbs() {
  const box = $('thumbs'); box.innerHTML = '';
  for (let k = 1; k <= 8; k++) {
    const seed = state.seed + k * 7919, c = document.createElement('canvas'); c.width = 150; c.height = 250;
    c.title = `seed ${seed}`; c.addEventListener('click', () => { state.seed = seed; state.over = {}; rebuild(); thumbs(); });
    box.append(c);
    setTimeout(() => {
      const ch = character(seed), B = build(ch), r = makeRig(ch.body), S = solve(r, POSES.stand ? POSES.stand(r) : {}), F = frames(S.J, S.F.pelvis.z);
      const x = c.getContext('2d'), L = makeLight(150, 250, 1);
      x.fillStyle = '#050407'; x.fillRect(0, 0, 150, 250);
      drawAvatar(L, B, F, 3, view(S.J, 0, 150, 250, ch.body.heads + 1.3, CAM0), { gain: 1.6, sub: 2 });
      L.flush(x, 0.1);
    }, 30 * k);
  }
}

// ---- controls and what this one is ---------------------------------------------------------------------
function controls() {
  const modes = $('modes'); modes.innerHTML = '';
  for (const m of MODES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = m; b.className = m === state.mode ? 'on' : ''; b.onclick = () => { state.mode = m; writeHash(); controls(); }; modes.append(b); }
  $('style').innerHTML = Object.keys(STYLES).map((s) => `<option${s === A.ch.style ? ' selected' : ''}>${s}</option>`).join('');
  $('gesture').innerHTML = Object.keys(GESTURES).map((g) => `<option${g === A.ch.gesture ? ' selected' : ''}>${g}</option>`).join('');
  $('palette').innerHTML = Object.keys(PALETTES).map((s) => `<option${s === A.ch.palette ? ' selected' : ''}>${s}</option>`).join('');
  const kn = $('knobs'); kn.innerHTML = '';
  for (const [key, label, lo, hi, step] of KNOBS) {
    const row = document.createElement('label'); row.className = 'k';
    row.innerHTML = `<span>${label}</span><input type="range" min="${lo}" max="${hi}" step="${step}" value="${A.ch[key]}"><output>${(+A.ch[key]).toFixed(2)}</output>`;
    const inp = row.querySelector('input');
    inp.addEventListener('input', () => { row.querySelector('output').textContent = (+inp.value).toFixed(2); A.ch[key] = +inp.value; if (key === 'speed' || key === 'swirl') { state.over[key] = +inp.value; rebuild(); } else { state.over[key] = +inp.value; writeHash(); } });
    kn.append(row);
  }
}
$('style').addEventListener('change', (e) => { const { points, streak, lagStep } = STYLES[e.target.value](() => 0.5); state.over = { ...state.over, style: e.target.value, points, streak, lagStep }; rebuild(); });
$('palette').addEventListener('change', (e) => { state.over.palette = e.target.value; rebuild(); });
$('gesture').addEventListener('change', (e) => { state.over.gesture = e.target.value; rebuild(); });
$('turn').addEventListener('click', (e) => { state.turn = !state.turn; e.target.classList.toggle('on', state.turn); });
$('lucky').addEventListener('click', () => { state.seed = Math.floor(Math.random() * 1e6); state.over = {}; rebuild(); thumbs(); });
window.addEventListener('keydown', (e) => { if (e.key === 'l' || e.key === 'L') $('lucky').click(); });
// search the space for a brand-new torso, live (a few hundred codes; well under a second on a laptop)
$('discover').addEventListener('click', () => {
  $('discover').textContent = 'searching…';
  setTimeout(() => {
    const found = discover(Math.floor(Math.random() * 1e9), { n: 16000 });
    $('discover').textContent = 'discover a torso';
    if (!found) return;
    extraBestiary.push(found.code);
    state.over.torsoKey = found.code; rebuild();
  }, 20);
});

function info() {
  const ch = A.ch, b = ch.body, meta = (key) => BESTIARY.find((x) => x.key === key) || { dim: '?', lyap: '?' };
  const line = (cls) => { const k = ch.parts[cls], m = meta(k); return `<b>${cls.padEnd(6)}</b> ${k.length > 12 ? k.slice(0, 12) + '…' : k}  D ${m.dim}  λ ${m.lyap}`; };
  $('info').innerHTML = [
    `<b>seed</b>   ${ch.seed}   <b>style</b> ${ch.style}   <b>palette</b> ${ch.palette}${ch.kin ? '   (one attractor for every limb)' : ''}`,
    `<b>body</b>   ${b.heads.toFixed(1)} heads, build ${b.build.toFixed(2)}, mass ${b.mass.toFixed(2)}, legs ${b.legs.toFixed(2)}`,
    ...['torso', 'head', 'arm', 'leg', 'end'].map(line),
  ].join('\n');
  // the checks: every part's attractor is strange (dimension ≥ 1.5, Lyapunov > 0), and the two sides match
  const keys = [...new Set(Object.values(ch.parts))];
  const strange = keys.every((k) => { const m = meta(k); return m.dim === '?' || (m.dim >= 1.35 && m.lyap > 0); });
  $('checks').innerHTML = `<span class="${strange ? 'ok' : 'no'}">${strange ? '✓' : '✗'} every part is a strange attractor</span>\n<span class="ok">✓ left and right share their attractors, mirrored</span>`;
}

readHash(); rebuild(); thumbs();
window.addEventListener('hashchange', () => { readHash(); rebuild(); thumbs(); });
/** Centre the camera on a joint (say 'wrist_r') at a zoom. */
function focusOn(joint, zoom = 4) {
  const S = solve(rig, poseAt(performance.now() / 1000)), heads = A.ch.body.heads + 1.3;
  cam.zoom = zoom;
  const q = view(S.J, 0, canvas.width, canvas.height, heads)(S.J[joint]);
  cam.px += (canvas.width / 2 - q[0]) / canvas.height; cam.py += (canvas.height * 0.5 - q[1]) / canvas.height;
}
window.__avatar = { get A() { return A; }, PARTS, dimension, realise, focusOn, cam };

// ---- touch and mouse: one finger orbits, two pinch (zoom about their middle) and pan; the wheel zooms
// about the cursor; shift-drag or a right-drag pans; a double tap puts the camera back
{
  const pts = new Map();
  let pinch = null, tapAt = 0;
  const xy = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };
  const saveCam = () => { state.over.cam = [cam.yaw, cam.pitch, cam.zoom, cam.px, cam.py].map((v) => +v.toFixed(3)).join(','); writeHash(); };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* a synthetic or already-gone pointer */ }
    pts.set(e.pointerId, { p: xy(e), pan: e.shiftKey || e.button === 2 }); lastTouch = performance.now() / 1000;
    if (pts.size === 2) { const [a, b] = [...pts.values()].map((q) => q.p); pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; }
    if (pts.size === 1) { const now = performance.now(); if (now - tapAt < 300) { Object.assign(cam, CAM0); delete state.over.cam; writeHash(); } tapAt = now; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const q = pts.get(e.pointerId); if (!q) return;
    const p = xy(e), d = [p[0] - q.p[0], p[1] - q.p[1]]; q.p = p; lastTouch = performance.now() / 1000;
    if (pts.size === 1) {
      if (q.pan) { cam.px += d[0] / canvas.height; cam.py += d[1] / canvas.height; }
      else { cam.yaw += d[0] * 0.006 / dpr; cam.pitch = Math.max(-1.2, Math.min(1.35, cam.pitch + d[1] * 0.005 / dpr)); }
    } else if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()].map((v) => v.p), dist = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      cam.px += (m[0] - pinch.m[0]) / canvas.height; cam.py += (m[1] - pinch.m[1]) / canvas.height;
      zoomAbout(dist / pinch.d, m[0], m[1]);
      pinch = { d: dist, m };
    }
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) saveCam(); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = xy(e); zoomAbout(Math.exp(-e.deltaY * 0.0015), x, y); lastTouch = performance.now() / 1000; clearTimeout(canvas.__w); canvas.__w = setTimeout(saveCam, 300); }, { passive: false });
}
