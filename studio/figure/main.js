// main.js — the mannequin: a figure in head units, posed by intent, drawn in ink.
//
// The library is packages/figure (copied to ../vendor/figure: a static site
// cannot import across directories). The page poses the figure, turns it with
// a drag, walks it, dresses it in a face and hair made of anime's own
// vocabulary, and re-runs the library's checks whenever the character changes.
//
//   ?cast=curvy&pose=walk&yaw=0.6&close&still&expression=smile

import { makeRig, solve } from '../vendor/figure/lib/rig.js';
import { buildBody } from '../vendor/figure/lib/body.js';
import { walk } from '../vendor/figure/lib/gait.js';
import { POSES } from '../vendor/figure/lib/poses.js';
import { makeRenderer, camera, project, STYLE } from '../vendor/figure/lib/shader.js';
import { checkAll } from '../vendor/figure/lib/check.js';
import { PREDICATES, EXPRESSIONS } from '../vendor/figure/lib/face.js';
import { HAIR_PREDICATES, COLORS as HAIR_COLORS } from '../vendor/figure/lib/hair.js';
import { add, apply, dot } from '../vendor/figure/lib/vec.js';

const qs = new URLSearchParams(location.search);

// the cast: the same characters packages/figure/specs holds and the selftest checks
const CAST = {
  petite: { heads: 6, femme: 1, build: 0.2, bust: 0.3, waist: 0.5, hips: 0.45, mass: 0.35, legs: 0.5, headWidth: 0.82, face: { eyes: 'round', brows: 'thin', irisColor: 'blue', extras: ['blush'] }, hair: { length: 'bob', bangs: 'blunt', color: 'black', extras: ['ahoge'] } },
  curvy: { heads: 7, femme: 1, build: 0.3, bust: 0.85, waist: 0.7, hips: 0.9, mass: 0.6, legs: 0.6, face: { eyes: 'tareme', brows: 'arched', lashes: 'heavy', irisColor: 'amber', extras: ['mole'] }, hair: { length: 'long', bangs: 'parted', color: 'chestnut' } },
  athletic: { heads: 7.3, femme: 0.8, build: 0.5, bust: 0.35, waist: 0.4, hips: 0.45, mass: 0.62, legs: 0.6, face: { eyes: 'tsurime', brows: 'straight', irisColor: 'green', mouth: 'fang' }, hair: { length: 'shoulder', bangs: 'parted', tails: 'ponytail', color: 'brown' } },
  model: { heads: 8.5, femme: 1, build: 0.2, bust: 0.35, waist: 0.6, hips: 0.5, mass: 0.2, legs: 1, headWidth: 0.76, neck: 0.9, face: { eyes: 'narrow', brows: 'thin', lashes: 'heavy', irisColor: 'violet' }, hair: { length: 'waist', bangs: 'blunt', color: 'purple' } },
  plus: { heads: 6.8, femme: 1, build: 0.35, bust: 0.9, waist: 0.15, hips: 1, mass: 1, legs: 0.4, headWidth: 0.84, face: { eyes: 'round', brows: 'arched', irisColor: 'brown', extras: ['blush'] }, hair: { length: 'shoulder', bangs: 'blunt', tails: 'twintails', color: 'pink' } },
  chibi: { heads: 3, build: 0.3, legs: 0.2, mass: 0.7, headWidth: 0.9, face: { eyes: 'round', brows: 'thin', mouth: 'cat', irisColor: 'amber', extras: ['blush'] }, hair: { length: 'bob', bangs: 'blunt', color: 'orange', extras: ['ahoge'] } },
  teen: { heads: 5.8, build: 0.25, legs: 0.7, mass: 0.3, headWidth: 0.82, face: { eyes: 'tareme', brows: 'arched', irisColor: 'green', extras: ['blush'] }, hair: { length: 'short', bangs: 'spiky', color: 'blonde' } },
  adult: { heads: 7, build: 0.5, legs: 0.5, mass: 0.5, headWidth: 0.8, face: { eyes: 'round', brows: 'thin', irisColor: 'violet' }, hair: null },
  heroic: { heads: 8.2, build: 0.95, legs: 0.6, mass: 0.85, headWidth: 0.74, face: { eyes: 'narrow', brows: 'thick', mouth: 'wide', nose: 'dot', irisColor: 'blue' }, hair: { length: 'short', bangs: 'spiky', color: 'black' } },
  fashion: { heads: 8.5, build: 0.1, legs: 1, mass: 0.2, headWidth: 0.76, face: { eyes: 'tsurime', brows: 'thin', lashes: 'heavy', irisColor: 'red', extras: ['mole'] }, hair: { length: 'bob', bangs: 'swept', color: 'silver' } },
};
const BODY_KEYS = ['heads', 'build', 'legs', 'mass', 'headWidth', 'neck', 'femme', 'bust', 'waist', 'hips'];
const SLIDERS = [['heads', 2.5, 9, 0.1], ['femme', 0, 1, 0.01], ['bust', 0, 1, 0.01], ['waist', 0, 1, 0.01], ['hips', 0, 1, 0.01], ['build', 0, 1, 0.01], ['legs', 0, 1, 0.01], ['mass', 0, 1, 0.01], ['headWidth', 0.65, 0.95, 0.01]];
const POSE_NAMES = ['walk', 'stand', 'contrapposto', 'handOnHip', 'reachUp', 'crouch', 'run', 'sit', 'lookBack'];
const LABEL = { handOnHip: 'hand on hip', reachUp: 'reach up', lookBack: 'look back', jitome: 'jito-me', headWidth: 'head w' };
const IRIS = { violet: '#8b7bd4', blue: '#6fb0e8', green: '#72c58f', amber: '#f0b24a', red: '#e0505e', brown: '#9a6a44' };

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const start = CAST[qs.get('cast')] ? qs.get('cast') : 'curvy';
const state = {
  body: pick(CAST[start], BODY_KEYS), face: { ...CAST[start].face }, hair: CAST[start].hair ? { ...CAST[start].hair } : null,
  faceOn: !qs.has('mannequin'), hairOn: !qs.has('mannequin'), lastHair: CAST[start].hair || { length: 'bob', bangs: 'blunt', color: 'black' },
  pose: qs.get('pose') || 'walk', expression: qs.get('expression') || 'smile',
  yaw: qs.has('yaw') ? Number(qs.get('yaw')) : 0.6, close: qs.has('close'), grid: true, skeleton: false, turn: false,
  tab: 'pose',
};
const still = qs.has('still');
const fullSpec = () => ({ ...state.body, ...(state.faceOn ? { face: state.face } : {}), ...(state.hairOn && state.hair ? { hair: state.hair } : {}) });

// ---------------------------------------------------------------- drawing --
const host = document.getElementById('stage');
const glc = document.createElement('canvas'), over = document.createElement('canvas');
host.append(glc, over);
const dpr = Math.min(2, window.devicePixelRatio || 1);
let R = null;
try { R = makeRenderer(glc, { supersample: dpr >= 2 ? 1 : 2 }); }
catch { document.getElementById('badge').textContent = 'This browser has no WebGL2, which the mannequin is drawn with.'; }

let rig = makeRig(fullSpec()), posed = new Map();
const poseFor = (name) => { if (!posed.has(name)) posed.set(name, POSES[name](rig)); return posed.get(name); };
function size() { const w = host.clientWidth, h = host.clientHeight; for (const c of [glc, over]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); } }
size();

const t0 = performance.now();
let dirty = true;
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
    cam = camera({ target: hc, yaw: state.yaw, pitch: 0.05, height: Math.max(1.7, 1.7 / (W / H)), aspect: W / H });
  } else {
    const top = Math.max(rig.m.H + 0.2, ...Object.values(P.J).map((j) => j[1] + 0.2));
    const view = Math.max(top * 1.22, (rig.m.shoulderHalf * 2 + 2.2) * H / W);
    cam = camera({ target: [0, view / 2 - 0.35 * view / rig.m.H, follow], yaw: state.yaw, pitch: 0.06, height: view, aspect: W / H });
  }
  // the eyes find the viewer: the camera's direction, in the head's frame
  if (P.face) {
    const toCam = cam.f.map((x) => -x);
    const gx = Math.max(-1, Math.min(1, dot(toCam, P.F.head.x) * 2.2)), gy = Math.max(-1, Math.min(1, dot(toCam, P.F.head.y) * 2.2));
    P = solve(rig, { ...pose, gaze: [gx, gy] });
  }
  R.draw(buildBody(P), P, cam, { ...STYLE, paperFill: true });
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
  if (!state.close) {
    const [, gy] = project(cam, [0, 0, follow], W, H);
    x.strokeStyle = 'rgba(42,34,48,0.7)'; x.lineWidth = 1.5 * dpr;
    x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke();
    if (state.pose === 'walk') {
      x.fillStyle = 'rgba(42,34,48,0.45)';
      for (let z = Math.floor(follow) - 14; z < follow + 14; z++) { const [px, py] = project(cam, [0, 0, z], W, H); x.fillRect(px - dpr, py + 3 * dpr, 2 * dpr, 7 * dpr); }
    }
    if (feet) for (const [s, f] of Object.entries(feet)) if (f.contact) {
      const [px, py] = project(cam, f.point, W, H);
      x.fillStyle = s === 'l' ? '#d2412f' : '#2f6fd2'; x.beginPath(); x.arc(px, py, 4 * dpr, 0, Math.PI * 2); x.fill();
    }
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
      : `<b class="ok">${res.length}/${res.length} checks</b> · feet never slide · no limb through another · the eyes show through the bangs`;
  }, 350);
}

// -------------------------------------------------------------------- UI --
const panel = document.getElementById('panel');
const content = document.getElementById('content');
const syncs = [];
function row(label, parent = content) { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<span class="lab">${label}</span>`; parent.append(r); return r; }
function chips(r, names, isOn, onPick, opt = {}) {
  const btns = names.map((n) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.textContent = opt.swatch ? '' : (LABEL[n] || n);
    if (opt.swatch) { b.style.background = opt.swatch(n); b.style.width = '30px'; b.style.padding = '0'; b.setAttribute('aria-label', n); b.title = n; }
    b.addEventListener('click', () => { onPick(n); sync(); });
    r.append(b);
    return [n, b];
  });
  syncs.push(() => btns.forEach(([n, b]) => b.setAttribute('aria-pressed', String(!!isOn(n)))));
}
const rebuild = () => { rig = makeRig(fullSpec()); posed = new Map(); dirty = true; recheck(); };
const setFace = (k, v) => { state.faceOn = true; state.face = { ...state.face, [k]: state.face[k] === v && k !== 'eyes' ? undefined : v }; rebuild(); };
const toggleIn = (obj, key, x) => { const e = new Set(obj[key] || []); e.has(x) ? e.delete(x) : e.add(x); return { ...obj, [key]: [...e] }; };
const setHair = (k, v) => { state.hairOn = true; state.hair = { ...(state.hair || state.lastHair), [k]: v }; state.lastHair = state.hair; rebuild(); };

const TABS = {
  pose: () => {
    chips(row('pose'), POSE_NAMES, (n) => state.pose === n, (n) => { state.pose = n; dirty = true; });
    chips(row('feel'), Object.keys(EXPRESSIONS), (n) => state.expression === n, (n) => { state.expression = n; dirty = true; });
  },
  body: () => {
    const same = (n) => BODY_KEYS.every((k) => Math.abs((state.body[k] ?? NaN) - (CAST[n][k] ?? NaN)) < 1e-9 || (state.body[k] === undefined && CAST[n][k] === undefined));
    chips(row('cast'), Object.keys(CAST), same, (n) => { const c = CAST[n]; state.body = pick(c, BODY_KEYS); state.face = { ...c.face }; state.hair = c.hair ? { ...c.hair } : null; if (c.hair) state.lastHair = c.hair; state.hairOn = !!c.hair; rebuild(); });
    const box = document.createElement('div'); box.className = 'sliders'; content.append(box);
    for (const [k, lo, hi, step] of SLIDERS) {
      const l = document.createElement('label'); l.className = 'sl';
      l.innerHTML = `<span>${LABEL[k] || k}</span><input type="range" min="${lo}" max="${hi}" step="${step}"><output></output>`;
      const inp = l.querySelector('input'), out = l.querySelector('output');
      inp.addEventListener('input', () => { state.body = { ...state.body, [k]: Number(inp.value) }; rebuild(); syncs.forEach((f) => f()); });
      box.append(l);
      syncs.push(() => { const v = state.body[k] ?? (k === 'femme' ? 0 : k === 'bust' ? 0.5 * (state.body.femme || 0) : k === 'waist' ? 0.6 * (state.body.femme || 0) : k === 'hips' ? 0.55 * (state.body.femme || 0) : 0.5); inp.value = v; out.textContent = k === 'heads' ? Number(v).toFixed(1) : Number(v).toFixed(2); });
    }
  },
  face: () => {
    chips(row('eyes'), Object.keys(PREDICATES.eyes), (n) => state.faceOn && state.face.eyes === n, (n) => setFace('eyes', n));
    chips(row('brows'), Object.keys(PREDICATES.brows), (n) => state.face.brows === n, (n) => setFace('brows', n));
    chips(row('mouth'), Object.keys(PREDICATES.mouth), (n) => state.face.mouth === n, (n) => setFace('mouth', n));
    const r = row('marks');
    chips(r, Object.keys(IRIS), (n) => state.face.irisColor === n, (n) => setFace('irisColor', n), { swatch: (n) => IRIS[n] });
    chips(r, ['blush', 'mole'], (n) => (state.face.extras || []).includes(n), (n) => { state.face = toggleIn(state.face, 'extras', n); rebuild(); });
  },
  hair: () => {
    chips(row('length'), HAIR_PREDICATES.length, (n) => state.hairOn && state.hair?.length === n, (n) => setHair('length', n));
    chips(row('bangs'), HAIR_PREDICATES.bangs, (n) => state.hairOn && state.hair?.bangs === n, (n) => setHair('bangs', n));
    chips(row('tails'), HAIR_PREDICATES.tails, (n) => state.hairOn && (state.hair?.tails || 'none') === n, (n) => setHair('tails', n));
    const r = row('colour');
    chips(r, Object.keys(HAIR_COLORS), (n) => state.hairOn && state.hair?.color === n, (n) => setHair('color', n), { swatch: (n) => HAIR_COLORS[n][0] });
    chips(row('extras'), HAIR_PREDICATES.extras, (n) => state.hairOn && (state.hair?.extras || []).includes(n), (n) => { state.hairOn = true; state.hair = toggleIn(state.hair || state.lastHair, 'extras', n); state.lastHair = state.hair; rebuild(); });
  },
  view: () => {
    chips(row('show'), ['close', 'face', 'hair', 'grid', 'skeleton', 'turn'], (n) => (n === 'face' ? state.faceOn : n === 'hair' ? state.hairOn && !!state.hair : state[n]), (n) => {
      if (n === 'face') { state.faceOn = !state.faceOn; rebuild(); return; }
      if (n === 'hair') { state.hairOn = !(state.hairOn && state.hair); if (state.hairOn && !state.hair) state.hair = { ...state.lastHair }; rebuild(); return; }
      state[n] = !state[n]; dirty = true;
    });
    syncs.at(-1);
  },
};
const tabs = document.getElementById('tabs');
const tabBtns = Object.keys(TABS).map((name) => {
  const b = document.createElement('button');
  b.className = 'tab'; b.type = 'button'; b.textContent = name; b.setAttribute('role', 'tab');
  b.addEventListener('click', () => { state.tab = name; showTab(); });
  tabs.append(b);
  return [name, b];
});
function showTab() {
  content.innerHTML = ''; syncs.length = 0;
  TABS[state.tab]();
  tabBtns.forEach(([n, b]) => b.setAttribute('aria-selected', String(n === state.tab)));
  sync();
}
function sync() { syncs.forEach((f) => f()); }

// drag to turn
let drag = null;
host.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, yaw: state.yaw }; host.setPointerCapture(e.pointerId); });
host.addEventListener('pointermove', (e) => { if (!drag) return; state.yaw = drag.yaw + (e.clientX - drag.x) * 0.012; dirty = true; });
host.addEventListener('pointerup', () => { drag = null; });
new ResizeObserver(() => { document.documentElement.style.setProperty('--panelH', `${panel.offsetHeight}px`); size(); dirty = true; }).observe(panel);
window.addEventListener('resize', () => { size(); dirty = true; });

showTab(); recheck();
requestAnimationFrame(frame);
window.__mannequin = { state, ready: true };
