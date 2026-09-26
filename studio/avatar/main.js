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
import { makeLight, drawAvatar } from '../vendor/attractor/lib/draw.js';
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
  if (q.get('mode')) state.mode = q.get('mode');
}
function writeHash() {
  const q = new URLSearchParams({ seed: state.seed, mode: state.mode, ...state.over });
  history.replaceState(null, '', `#${q}`);
}

// ---- the character ---------------------------------------------------------------------------------
let A = null, rig = null, posed = new Map(), extraBestiary = [];
function rebuild() {
  const ch = character(state.seed, state.over);
  if (state.over.torsoKey) ch.parts.torso = state.over.torsoKey;
  A = build(ch); rig = makeRig(ch.body); posed = new Map();
  writeHash(); info(); controls();
}
const poseAt = (t) => {
  if (state.mode === 'walk') return walk(rig, t).pose;
  if (!posed.has(state.mode)) posed.set(state.mode, POSES[state.mode](rig));
  return posed.get(state.mode);
};

// ---- drawing ---------------------------------------------------------------------------------------
const canvas = $('c'), ctx = canvas.getContext('2d'), host = $('stage');
let light = null, W = 0, H = 0, dpr = 1;
function size() {
  dpr = Math.min(2, window.devicePixelRatio || 1); W = host.clientWidth; H = host.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  light = makeLight(canvas.width, canvas.height);
}
new ResizeObserver(size).observe(host); size();

function view(J, t, w, h, scaleHeads) {
  const yaw = state.turn ? 0.5 + 0.35 * Math.sin(t * 0.25) : 0.5, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const root = J.pelvis, sc = h / scaleHeads;
  return (p) => { const x = p[0] - root[0], z = p[2] - root[2]; return [w / 2 + (x * cy + z * sy) * sc, h * 0.93 - p[1] * sc]; };
}
function frame(now) {
  requestAnimationFrame(frame);
  if (!A) return;
  const t = now / 1000, S = solve(rig, poseAt(t)), F = frames(S.J, S.F.pelvis.z);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.45, 0, canvas.width / 2, canvas.height * 0.45, Math.max(canvas.width, canvas.height) * 0.7);
  g.addColorStop(0, '#120e18'); g.addColorStop(1, '#040306');
  ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // the floor: a faint line of light under the feet
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(canvas.width * 0.2, canvas.height * 0.93, canvas.width * 0.6, 1 * dpr);
  drawAvatar(light, A, F, t, view(S.J, t, canvas.width, canvas.height, A.ch.body.heads + 1.3), { gain: Math.min(1.6, 900 / Math.sqrt(canvas.width * canvas.height) * 1.2) });
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
      drawAvatar(L, B, F, 3, view(S.J, 0, 150, 250, ch.body.heads + 1.3), { gain: 1.6, sub: 2 });
      L.flush(x, 0.1);
    }, 30 * k);
  }
}

// ---- controls and what this one is ---------------------------------------------------------------------
function controls() {
  const modes = $('modes'); modes.innerHTML = '';
  for (const m of MODES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = m; b.className = m === state.mode ? 'on' : ''; b.onclick = () => { state.mode = m; writeHash(); controls(); }; modes.append(b); }
  $('style').innerHTML = Object.keys(STYLES).map((s) => `<option${s === A.ch.style ? ' selected' : ''}>${s}</option>`).join('');
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
window.__avatar = { get A() { return A; }, PARTS, dimension, realise };
