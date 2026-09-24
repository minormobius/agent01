// main.js — the mannequin: a figure in head units, posed by intent, drawn in ink.
//
// The library is packages/figure (copied to ../vendor/figure: a static site
// cannot import across directories). The page poses the figure, turns it with
// a drag, walks it, and re-runs the library's checks whenever the body changes.
//
//   ?pose=walk&heads=3&yaw=0.6    a starting state; ?still for a frozen frame

import { makeRig, solve } from '../vendor/figure/lib/rig.js';
import { buildBody } from '../vendor/figure/lib/body.js';
import { walk } from '../vendor/figure/lib/gait.js';
import { POSES } from '../vendor/figure/lib/poses.js';
import { makeRenderer, camera, project, STYLE } from '../vendor/figure/lib/shader.js';
import { checkAll } from '../vendor/figure/lib/check.js';
import { PREDICATES, EXPRESSIONS } from '../vendor/figure/lib/face.js';
import { add, apply, dot } from '../vendor/figure/lib/vec.js';

const qs = new URLSearchParams(location.search);
const PRESETS = {
  chibi: { heads: 3, build: 0.3, legs: 0.2, mass: 0.7, headWidth: 0.9 },
  teen: { heads: 5.8, build: 0.25, legs: 0.7, mass: 0.3, headWidth: 0.82 },
  adult: { heads: 7, build: 0.5, legs: 0.5, mass: 0.5, headWidth: 0.8 },
  heroic: { heads: 8.2, build: 0.95, legs: 0.6, mass: 0.85, headWidth: 0.74 },
  fashion: { heads: 8.5, build: 0.1, legs: 1, mass: 0.2, headWidth: 0.76 },
};
// each body comes with a face made of the same vocabulary the checks run over
const FACES = {
  chibi: { eyes: 'round', brows: 'thin', mouth: 'cat', irisColor: 'amber', extras: ['blush'] },
  teen: { eyes: 'tareme', brows: 'arched', irisColor: 'green', extras: ['blush'] },
  adult: { eyes: 'round', brows: 'thin', irisColor: 'violet' },
  heroic: { eyes: 'narrow', brows: 'thick', mouth: 'wide', nose: 'dot', irisColor: 'blue' },
  fashion: { eyes: 'tsurime', brows: 'thin', lashes: 'heavy', irisColor: 'red', extras: ['mole'] },
};
const IRIS = { violet: '#8b7bd4', blue: '#6fb0e8', green: '#72c58f', amber: '#f0b24a', red: '#e0505e', brown: '#9a6a44' };
const SLIDERS = [['heads', 2.5, 9, 0.1], ['build', 0, 1, 0.01], ['legs', 0, 1, 0.01], ['mass', 0, 1, 0.01], ['headWidth', 0.65, 0.95, 0.01]];
const EXPR = Object.keys(EXPRESSIONS);
const POSE_NAMES = ['walk', 'stand', 'contrapposto', 'handOnHip', 'reachUp', 'crouch', 'run', 'sit', 'lookBack'];
const LABEL = { handOnHip: 'hand on hip', reachUp: 'reach up', lookBack: 'look back' };

const state = {
  spec: { ...PRESETS.adult },
  face: { ...FACES.adult }, faceOn: !qs.has('mannequin'), expression: qs.get('expression') || 'smile', close: qs.has('close'), lookAtMe: true,
  pose: qs.get('pose') || 'walk',
  yaw: qs.has('yaw') ? Number(qs.get('yaw')) : 0.6,
  grid: true, skeleton: false, turn: false,
};
for (const [k] of SLIDERS) if (qs.has(k)) state.spec[k] = Number(qs.get(k));
const still = qs.has('still');

// ---------------------------------------------------------------- drawing --
const host = document.getElementById('stage');
const glc = document.createElement('canvas'), over = document.createElement('canvas');
host.append(glc, over);
const dpr = Math.min(2, window.devicePixelRatio || 1);
let R = null;
try { R = makeRenderer(glc, { supersample: dpr >= 2 ? 1 : 2 }); }
catch (e) { document.getElementById('badge').textContent = 'This browser has no WebGL2, which the mannequin is drawn with.'; }

const fullSpec = () => (state.faceOn ? { ...state.spec, face: state.face } : { ...state.spec });
let rig = makeRig(fullSpec()), posed = new Map();
const poseFor = (name) => { if (!posed.has(name)) posed.set(name, POSES[name](rig)); return posed.get(name); };

function size() {
  const w = host.clientWidth, h = host.clientHeight;
  for (const c of [glc, over]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
}
size();

let t0 = performance.now(), dirty = true;
function frame(now) {
  const t = still ? Number(qs.get('t') || 0.4) : (now - t0) / 1000;
  if (state.turn && !still) { state.yaw += 0.006; dirty = true; }
  if ((state.pose === 'walk' && !still) || dirty) draw(t);
  dirty = false;
  requestAnimationFrame(frame);
}

function draw(t) {
  if (!R) return;
  let pose, feet = null;
  if (state.pose === 'walk') { const w = walk(rig, t); pose = w.pose; feet = w.feet; }
  else pose = poseFor(state.pose);
  const W = glc.width, H = glc.height;
  pose = { ...pose, expression: state.expression };
  let P = solve(rig, pose);
  const follow = state.pose === 'walk' ? P.J.pelvis[2] : 0;
  let cam;
  if (state.close) {
    const hc = add(P.J.headPivot, apply(P.F.head, [0, 0.32, 0]));
    cam = camera({ target: hc, yaw: state.yaw, pitch: 0.05, height: Math.max(1.5, 1.5 / (W / H)), aspect: W / H });   // at least 1.5 heads each way
  } else {
    const top = Math.max(rig.m.H, ...Object.values(P.J).map((j) => j[1] + 0.2));
    const view = Math.max(top * 1.22, (rig.m.shoulderHalf * 2 + 2.2) * H / W);
    cam = camera({ target: [0, view / 2 - 0.35 * view / rig.m.H, follow], yaw: state.yaw, pitch: 0.06, height: view, aspect: W / H });
  }
  // the eyes find the viewer: the camera's direction, in the head's frame
  if (state.lookAtMe && P.face) {
    const toCam = cam.f.map((x) => -x);
    const gx = Math.max(-1, Math.min(1, dot(toCam, P.F.head.x) * 2.2)), gy = Math.max(-1, Math.min(1, dot(toCam, P.F.head.y) * 2.2));
    P = solve(rig, { ...pose, gaze: [gx, gy] });
  }
  R.draw(buildBody(P), P, cam, { ...STYLE, paperFill: true });
  // the pencil over it: head units, the ground, the walk's planted feet
  const x = over.getContext('2d');
  x.clearRect(0, 0, W, H);
  if (state.grid && !state.close) {
    x.strokeStyle = 'rgba(80,110,150,0.28)'; x.lineWidth = dpr;
    x.font = `500 ${10 * dpr}px ui-monospace, monospace`; x.fillStyle = 'rgba(80,110,150,0.7)';
    for (let h = 1; h <= Math.ceil(rig.m.H); h++) {
      const [, py] = project(cam, [0, h, follow], W, H);
      x.beginPath(); x.moveTo(0, py); x.lineTo(W, py); x.stroke();
      x.fillText(String(h), 8 * dpr, py - 3 * dpr);
    }
  }
  // the ground: a line, and while walking, marks every head that pass under the figure
  const [, gy] = project(cam, [0, 0, follow], W, H);
  x.strokeStyle = 'rgba(42,34,48,0.7)'; x.lineWidth = 1.5 * dpr;
  x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke();
  if (state.pose === 'walk') {
    x.fillStyle = 'rgba(42,34,48,0.45)';
    for (let z = Math.floor(follow) - 14; z < follow + 14; z++) {
      const [px, py] = project(cam, [0, 0, z], W, H);
      x.fillRect(px - dpr, py + 3 * dpr, 2 * dpr, 7 * dpr);
    }
  }
  if (feet) for (const [s, f] of Object.entries(feet)) if (f.contact) {
    const [px, py] = project(cam, f.point, W, H);
    x.fillStyle = s === 'l' ? '#d2412f' : '#2f6fd2'; x.beginPath(); x.arc(px, py, 4 * dpr, 0, Math.PI * 2); x.fill();
  }
  if (state.skeleton) skeleton(x, P, cam, W, H);
}

function skeleton(x, P, cam, W, H) {
  const J = P.J;
  const bones = [['pelvis', 'waist'], ['waist', 'chest'], ['chest', 'neck'], ['neck', 'headPivot'], ['headPivot', 'crown'],
    ...['l', 'r'].flatMap((s) => [['neck', `shoulder_${s}`], [`shoulder_${s}`, `elbow_${s}`], [`elbow_${s}`, `wrist_${s}`], [`wrist_${s}`, `fingers_${s}`],
      ['pelvis', `hip_${s}`], [`hip_${s}`, `knee_${s}`], [`knee_${s}`, `ankle_${s}`], [`ankle_${s}`, `heel_${s}`], [`heel_${s}`, `ball_${s}`], [`ball_${s}`, `toe_${s}`]])];
  x.strokeStyle = '#1a8f5a'; x.fillStyle = '#1a8f5a'; x.lineWidth = 1.5 * dpr;
  for (const [a, b] of bones) { const p = project(cam, J[a], W, H), q = project(cam, J[b], W, H); x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke(); }
  for (const k of Object.keys(J)) { const p = project(cam, J[k], W, H); x.beginPath(); x.arc(p[0], p[1], 2.5 * dpr, 0, Math.PI * 2); x.fill(); }
}

// ------------------------------------------------------------------ checks --
const badge = document.getElementById('badge');
let checkTimer = null;
function recheck() {
  clearTimeout(checkTimer);
  badge.innerHTML = 'checking…';
  checkTimer = setTimeout(() => {
    const res = Object.values(checkAll(fullSpec())).flat();
    const bad = res.filter((r) => !r.ok);
    badge.innerHTML = bad.length
      ? `<b class="bad">${res.length - bad.length}/${res.length} checks</b> · ${bad.slice(0, 2).map((r) => r.name).join(' · ')}${bad.length > 2 ? ` · +${bad.length - 2}` : ''}`
      : `<b class="ok">${res.length}/${res.length} checks</b> · feet never slide · no limb through another · weight over the feet`;
  }, 350);
}

// -------------------------------------------------------------------- UI --
function chips(rowId, names, isOn, onPick, label = (n) => n) {
  const row = document.getElementById(rowId);
  const btns = names.map((n) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.textContent = label(n);
    b.addEventListener('click', () => { onPick(n); sync(); });
    row.append(b);
    return [n, b];
  });
  return () => btns.forEach(([n, b]) => b.setAttribute('aria-pressed', String(isOn(n))));
}
const syncPoses = chips('poses', POSE_NAMES, (n) => state.pose === n, (n) => { state.pose = n; dirty = true; }, (n) => LABEL[n] || n);
const same = (a, b) => Object.keys(b).every((k) => Math.abs(a[k] - b[k]) < 1e-9);
const syncPresets = chips('presets', Object.keys(PRESETS), (n) => same(state.spec, PRESETS[n]), (n) => { state.face = { ...FACES[n] }; setSpec({ ...PRESETS[n] }); });
const syncEyes = chips('eyes', Object.keys(PREDICATES.eyes), (n) => state.faceOn && state.face.eyes === n, (n) => { state.faceOn = true; state.face = { ...state.face, eyes: n }; setSpec(state.spec); }, (n) => (n === 'jitome' ? 'jito-me' : n));
const syncFeel = chips('feel', EXPR, (n) => state.expression === n, (n) => { state.expression = n; dirty = true; });
const syncIris = chips('iris', Object.keys(IRIS), (n) => state.face.irisColor === n, (n) => { state.face = { ...state.face, irisColor: n }; setSpec(state.spec); }, () => '');
document.querySelectorAll('#iris button').forEach((b, i) => { b.style.background = Object.values(IRIS)[i]; b.style.width = '30px'; b.style.padding = '0'; b.setAttribute('aria-label', Object.keys(IRIS)[i]); });
const toggleExtra = (x) => { const e = new Set(state.face.extras || []); e.has(x) ? e.delete(x) : e.add(x); state.face = { ...state.face, extras: [...e] }; setSpec(state.spec); };
const syncMarks = chips('iris', ['blush', 'mole', 'cat', 'fang'], (n) => n === 'cat' || n === 'fang' ? state.face.mouth === n : (state.face.extras || []).includes(n),
  (n) => { if (n === 'cat' || n === 'fang') { state.face = { ...state.face, mouth: state.face.mouth === n ? undefined : n }; setSpec(state.spec); } else toggleExtra(n); });
const syncView = chips('view', ['close', 'face', 'grid', 'skeleton', 'turn'], (n) => (n === 'face' ? state.faceOn : state[n]), (n) => {
  if (n === 'face') { state.faceOn = !state.faceOn; setSpec(state.spec); return; }
  state[n] = !state[n]; dirty = true;
}, (n) => (n === 'close' ? 'close-up' : n));
const sliders = SLIDERS.map(([k, lo, hi, step]) => {
  const l = document.createElement('label'); l.className = 'sl';
  l.innerHTML = `<span>${k === 'headWidth' ? 'head w' : k}</span><input type="range" min="${lo}" max="${hi}" step="${step}"><output></output>`;
  const inp = l.querySelector('input'), out = l.querySelector('output');
  inp.addEventListener('input', () => setSpec({ ...state.spec, [k]: Number(inp.value) }));
  document.getElementById('sliders').append(l);
  return () => { inp.value = state.spec[k]; out.textContent = k === 'heads' ? state.spec[k].toFixed(1) : state.spec[k].toFixed(2); };
});
function setSpec(spec) {
  state.spec = spec; rig = makeRig(fullSpec()); posed = new Map(); dirty = true;
  sync(); recheck();
}
function sync() { syncPoses(); syncPresets(); syncEyes(); syncFeel(); syncIris(); syncMarks(); syncView(); sliders.forEach((f) => f()); }

// drag to turn
let drag = null;
host.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, yaw: state.yaw }; host.setPointerCapture(e.pointerId); });
host.addEventListener('pointermove', (e) => { if (!drag) return; state.yaw = drag.yaw + (e.clientX - drag.x) * 0.012; dirty = true; });
host.addEventListener('pointerup', () => { drag = null; });

const panel = document.getElementById('panel');
new ResizeObserver(() => { document.documentElement.style.setProperty('--panelH', `${panel.offsetHeight}px`); size(); dirty = true; }).observe(panel);
window.addEventListener('resize', () => { size(); dirty = true; });

sync(); recheck();
requestAnimationFrame(frame);
window.__mannequin = { state, ready: true };
