// PARTICLE-CHORA's page: the particle system stepping live, drawn on one 2D canvas (particles as discs, depth-sorted;
// each tier's edges in its colour). 3D presets are drawn straight; 4D ones as a shadow from an eye out in w (tilted 35°
// off w, as PRISM's) or a slice. The pad, lever and ⊞ are CAD⁴'s.
import * as P from './particles.js';
import { Bell, HZ, tune } from './sound.js';

const $ = (id) => document.getElementById(id);
const cv = $('ov'), ctx = cv.getContext('2d');
const S = { preset: 0, n: 12, sim: null, run: true, settled: false, view: 'shadow', spin: true, frame: 0, ids: [], edges: [], union: true, scaleR: 1.5,
  thick: 0.025, forces: { a: P.A, f: P.F, rk: 1, mk: 1 }, kickV: 0.25, sel: -1, fling: null, C: [], modes: null, notes: null, sound: false, voice: 'bell', scale: 'true', hiss: true, hissOn: true, Rr: [] };
let E = null, off = 0, yaw = 0.5, pitch = 0.35, zoom = 1;
const TILT = (35 * Math.PI) / 180;
const homeE = () => (S.view === 'shadow' ? [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, Math.cos(TILT), Math.sin(TILT)], [0, 0, -Math.sin(TILT), Math.cos(TILT)]] : [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
function turn(a, n, th) { const c = Math.cos(th) - 1, s = Math.sin(th); E = E.map((v) => { const va = dot(v, a), vn = dot(v, n); return v.map((x, i) => x + c * (va * a[i] + vn * n[i]) + s * (va * n[i] - vn * a[i])); }); for (let i = 0; i < 4; i++) { for (let j = 0; j < i; j++) { const d = dot(E[i], E[j]); E[i] = E[i].map((x, k) => x - d * E[j][k]); } const l = Math.hypot(...E[i]); E[i] = E[i].map((x) => x / l); } }
const pr = () => P.PRESETS[S.preset], is4 = () => pr().dim === 4;

// ------------------------------------------------------------------ the system
function start() {
  const p = pr(); S.sim = P.create(p.make(S.n), Math.random); Object.assign(S.sim, S.forces); S.settled = false; S.run = true; S.modes = null; S.sel = -1; $('pauseB').textContent = 'pause';
  S.ids = []; S.edges = []; S.frame = 0; S.hiss = true; info(); modeInfo();
}
/** The points to draw for each particle (the 24-cell preset can put the tesseract tier on the seed's sphere). */
function shown() {
  const s = S.sim, X = []; for (let i = 0; i < s.n; i++) X.push(P.point(s, i));
  if (pr().union && S.union) { const r = [0, 1].map((t) => { const Y = P.ofType(s, t); return Y.reduce((a, p) => a + Math.hypot(...p), 0) / Y.length; }); for (let i = 0; i < s.n; i++) if (s.type[i] === 1) X[i] = X[i].map((x) => (x * r[0]) / r[1]); }
  return X;
}
/** Read the shapes off: each tier's edges and identity (and, for the 24-cell preset, both tiers together). */
function read() {
  const s = S.sim, X = shown(), types = s.preset.types;
  S.edges = []; S.ids = types.map((t, ti) => {
    const idx = []; for (let i = 0; i < s.n; i++) if (s.type[i] === ti) idx.push(i);
    if (idx.length < 4) return { t, n: idx.length, sh: null };
    const Y = idx.map((i) => X[i]), { E: Ed } = P.edges(Y); for (const [a, b] of Ed) S.edges.push([idx[a], idx[b], t.col]);
    return { t, n: idx.length, sh: P.shapeOf(Y), e: types.length === 1 ? P.energy(Y) : null };
  });
  if (pr().union && S.union) { const Y = X; const sh = P.shapeOf(Y); S.ids.push({ t: { name: 'both together', col: '#ffd27a' }, n: Y.length, sh }); if (sh?.name === '24-cell') { const { E: Ed } = P.edges(Y); S.edges = Ed.map(([a, b]) => [a, b, '#ffd27a']); } }
  info();
}

// ------------------------------------------------------------------ drawing
function draw() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#07080c'; ctx.fillRect(0, 0, w, h);
  const X = shown(), s = S.sim, four = is4(), O = E[3].map((x) => x * off);
  // frame: the swarm's radius, eased
  let R = 0; for (const p of X) R = Math.max(R, Math.hypot(...p)); S.scaleR += (Math.max(0.5, R) - S.scaleR) * 0.08;
  const EYE = 3 * S.scaleR;
  // 4D → 3D (shadow or slice coordinates), then a camera
  const to3 = (x) => { if (!four) return [x[0], x[1], x[2], 0]; const d = x.map((v, i) => v - O[i]), ww = dot(d, E[3]), k = S.view === 'shadow' ? EYE / (EYE - ww) : 1; return [dot(d, E[0]) * k, dot(d, E[1]) * k, dot(d, E[2]) * k, ww]; };
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), F = Math.min(w, h) * 0.42 * zoom / S.scaleR, dist = 4 * S.scaleR;
  const cam = (q) => { const x1 = cy * q[0] + sy * q[2], z1 = -sy * q[0] + cy * q[2], y2 = cp * q[1] - sp * z1, z2 = sp * q[1] + cp * z1, k = dist / (dist - z2); return [w / 2 + x1 * F * k, h / 2 - y2 * F * k, z2, k]; };
  const P3 = X.map(to3), C = P3.map(cam);
  S.C = C;
  // Thick, in all four dimensions: every edge a 4D tube of radius ρ round its segment, every particle a 4D ball of
  // radius 1.7ρ. The shadow draws them their projected width; the slice draws what a 3D slice really cuts from them.
  // A tube's slice is the union of the slices of the 4D balls along it: at each point p(t) of the segment, a 3D ball
  // round p(t)'s place in the slice, radius √(ρ² − s(t)²), s(t) the distance from the slice. So an edge crossing the
  // slice shows as a short tapering stroke, one lying in it as a whole tube, and a ball just off it as a small disc.
  const rho = S.thick * S.scaleR, rhoP = 1.7 * rho, slicing = S.view === 'slice' && four;
  const k4 = (q) => (four && S.view === 'shadow' ? EYE / (EYE - q[3]) : 1);
  ctx.lineCap = 'round';
  for (const [a, b, col] of S.edges) {
    ctx.strokeStyle = col;
    if (!slicing) {
      const wd = 2 * rho * F * ((k4(P3[a]) * C[a][3] + k4(P3[b]) * C[b][3]) / 2); ctx.globalAlpha = 0.8; ctx.lineWidth = Math.max(1, wd);
      ctx.beginPath(); ctx.moveTo(C[a][0], C[a][1]); ctx.lineTo(C[b][0], C[b][1]); ctx.stroke(); continue;
    }
    const sa = P3[a][3], sb = P3[b][3]; if (Math.min(sa, sb) > rho || Math.max(sa, sb) < -rho) continue;
    const N = 14; ctx.globalAlpha = 1;
    for (let k = 0; k < N; k++) {
      const t0 = k / N, t1 = (k + 1) / N, sm = sa + (sb - sa) * (t0 + t1) / 2, r = rho * rho - sm * sm; if (r <= 0) continue;
      const pa = P3[a].map((v, c) => v + (P3[b][c] - v) * t0), pb = P3[a].map((v, c) => v + (P3[b][c] - v) * t1), qa = cam(pa), qb = cam(pb);
      ctx.lineWidth = Math.max(0.8, 2 * Math.sqrt(r) * F * (qa[3] + qb[3]) / 2); ctx.beginPath(); ctx.moveTo(qa[0], qa[1]); ctx.lineTo(qb[0], qb[1]); ctx.stroke();
    }
  }
  const order = C.map((c, i) => [c[2], i]).sort((p, q) => p[0] - q[0]); S.Rr = new Array(C.length).fill(0);
  for (const [, i] of order) {
    let rr = rhoP; if (slicing) { const q = rhoP * rhoP - P3[i][3] ** 2; if (q <= 0) continue; rr = Math.sqrt(q); }
    const col = s.preset.types[s.type[i]].col, r = Math.max(2, rr * F * C[i][3] * k4(P3[i])); S.Rr[i] = r;
    ctx.globalAlpha = 1; const g = ctx.createRadialGradient(C[i][0] - r * 0.3, C[i][1] - r * 0.3, r * 0.1, C[i][0], C[i][1], r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, col); g.addColorStop(1, 'rgba(0,0,0,0.6)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(C[i][0], C[i][1], r, 0, 7); ctx.fill();
    if (i === S.sel) { ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(C[i][0], C[i][1], r + 5, 0, 7); ctx.stroke(); }
  }
  // a fling in progress: the arrow from the particle
  if (S.fling) { const f0 = C[S.fling.i]; ctx.strokeStyle = '#ffd27a'; ctx.globalAlpha = 1; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(f0[0], f0[1]); ctx.lineTo(f0[0] + S.fling.dx, f0[1] + S.fling.dy); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // axes gizmo and label
  const gx = w - 52, gy = 96, L = 34; ctx.font = '600 11px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1.6;
  for (let a = 0; a < (four ? 4 : 3); a++) { const e = four ? [E[0][a], E[1][a], E[2][a]] : [a === 0 ? 1 : 0, a === 1 ? 1 : 0, a === 2 ? 1 : 0], len = Math.hypot(...e); if (len < 0.04) continue; const x1 = cy * e[0] + sy * e[2], z1 = -sy * e[0] + cy * e[2], y2 = cp * e[1] - sp * z1; ctx.globalAlpha = 0.35 + 0.65 * len; ctx.strokeStyle = ctx.fillStyle = a === 3 ? '#ffd27a' : '#e9e4da'; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + x1 * L, gy - y2 * L); ctx.stroke(); ctx.fillText('xyzw'[a], gx + x1 * (L + 9), gy - y2 * (L + 9)); }
  ctx.globalAlpha = 1; ctx.fillStyle = '#9a958c';
  ctx.fillText(!four ? 'three dimensions' : S.view === 'shadow' ? 'shadow: seen from an eye out in w' : `slice at ${off.toFixed(2)} along w: particles near it`, w / 2, h - 14);
}

// ------------------------------------------------------------------ the panel
function info() {
  const p = pr();
  for (const b of $('presets').children) b.classList.toggle('on', +b.dataset.i === S.preset);
  document.body.classList.toggle('is4', p.dim === 4);
  $('title').textContent = p.name; $('note').textContent = p.note;
  $('nKnob').hidden = !p.id.startsWith('one'); $('unionL').hidden = !p.union;
  const el = $('facts'); el.textContent = '';
  const row = (k, v, cls) => { const a = document.createElement('i'), b = document.createElement('span'); a.textContent = k; b.textContent = v; if (cls) b.className = cls; el.append(a, b); };
  row('dimensions', String(p.dim)); row('steps', `${S.sim.steps}${S.settled ? ', settled' : ''}`);
  for (const id of S.ids) {
    if (!id) continue;
    const v = id.n < 4 ? `${id.n} (scaffolding)` : !S.settled && !id.sh ? 'settling…' : id.sh ? (id.sh.exact ? `${id.sh.name} ✓` : `${id.sh.name}'s structure, out of shape`) : 'no known shape';
    row(`${id.t.name} (${id.n})`, v, id.sh ? (id.sh.exact ? 'ok' : 'near') : '');
    if (id.e) row('energy (Σ 1/d, unit sphere)', id.e.toFixed(4));
  }
  const settledMsg = S.ids.some((x) => x?.sh) ? 'Settled.' : 'Settled, into no shape on our list.';
  $('cap').textContent = !S.settled ? 'Particles pulled to the centre and pushing each other apart, settling…' : `${settledMsg} ${p.id === 'one4' && S.n === 24 && S.ids[0]?.sh?.name !== '24-cell' ? 'Shake it: the 24-cell is lower in energy, and a few shakes usually find it.' : p.dim === 4 ? 'Twist into w with the pad, or slice it.' : 'Drag to turn it.'}`;
}
P.PRESETS.forEach((p, i) => { const b = document.createElement('button'); b.dataset.i = i; b.textContent = p.name; b.onclick = () => setPreset(i); $('presets').append(b); });
function setPreset(i) {
  S.preset = i; const p = pr(); if (p.n) S.n = p.n;
  $('n').max = p.dim === 4 ? 130 : 60; $('n').value = S.n; $('nV').textContent = S.n; $('nMin').textContent = '2'; $('nMax').textContent = $('n').max;
  S.view = 'shadow'; for (const x of $('view').children) x.classList.toggle('on', x.dataset.v === 'shadow'); E = homeE(); off = 0;
  history.replaceState(null, '', `#${p.id}${p.id.startsWith('one') ? `-${S.n}` : ''}`);
  start();
}
$('n').oninput = () => { S.n = +$('n').value; $('nV').textContent = S.n; history.replaceState(null, '', `#${pr().id}-${S.n}`); start(); };
$('union').onchange = () => { S.union = $('union').checked; read(); };
$('restartB').onclick = () => start();
/** A screen drag as a direction in the swarm's space: the camera's right and up, lifted into 4D by your frame. */
function screenDir(dx, dy) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), Rv = [cy, 0, sy], Uv = [sp * sy, cp, -sp * cy];
  const v3 = [0, 1, 2].map((k) => Rv[k] * dx - Uv[k] * dy), l = Math.hypot(...v3) || 1;
  return is4() ? [0, 1, 2, 3].map((c) => (v3[0] * E[0][c] + v3[1] * E[1][c] + v3[2] * E[2][c]) / l) : [...v3.map((x) => x / l), 0];
}
/** Kick particle i along unit direction dir (4 numbers), scaled by the kick slider: in the simulation, and, if the
 *  swarm was settled and sound is on, as a ring of its modes. */
function kickAlong(i, dir, scale = 1) {
  const dv = dir.map((x) => x * S.kickV * scale); S.hiss = false;
  if (S.sound && S.modes) playKicks([[i, dv]]);
  P.kick(S.sim, i, dv); S.settled = false; S.run = true; $('pauseB').textContent = 'pause'; info();
}
const pick = () => (S.sel >= 0 && S.sel < S.sim.n ? S.sel : Math.floor(Math.random() * S.sim.n));
$('kickAnaB').onclick = () => kickAlong(pick(), E[3]);
$('kickKataB').onclick = () => kickAlong(pick(), E[3].map((x) => -x));
$('kickB').onclick = () => { const g = () => { let u = 0; for (let k = 0; k < 6; k++) u += Math.random(); return u - 3; }, v = [g(), g(), g(), is4() ? g() : 0], l = Math.hypot(...v); kickAlong(pick(), v.map((x) => x / l)); };
$('chimeB').onclick = () => { ensureSound(); if (S.modes) chime(); else toast('let it settle first'); };
/** The modes of the settled swarm (each tier's own), and its notes. */
function computeModes() {
  if (!S.settled) return; S.modes = P.modes(S.sim); S.notes = P.notes(S.modes, 1e-5); modeInfo();
}
const panOf = (m) => { if (!is4()) return 0; let sh = 0; for (let p = 0; p < m.idx.length; p++) { let c = 0; for (let k = 0; k < 4; k++) c += m.shape[p * 4 + k] * E[3][k]; sh += c * c; } return Math.max(-1, Math.min(1, (sh - 0.25) / 0.25)); };
const decay = () => (1.2 * Math.log(0.97)) / Math.log(S.forces.f);
/** The voices: what strikes the swarm, what damps it, and what listens.
 *  bell:  a strike (a kick to the velocity), air drag (every mode rings equally long), listening to velocity.
 *  wood:  the same strike, but friction inside the swarm, on how fast neighbours move apart: it damps a mode in
 *         proportion to its stiffness, so the high notes die fast and the sound is a knock.
 *  glass: a hard, small hammer and almost no damping: listening to acceleration (each mode × ω), long and bright.
 *  pluck: pull the particle aside and let go (the kick as a displacement), listening to position (each mode ÷ ω):
 *         soft and low.
 *  live:  not the modes at all: the swarm itself, kicked and run with the drag turned almost off, two microphones
 *         listening to the particles. Gentle kicks ring at the modes' pitches; hard ones bend them and spill energy
 *         between modes, because the real forces aren't springs. (Tuning doesn't apply: it's the raw motion.) */
const VOICES = {
  bell: { amp: (a) => a, decay: (m, d) => d },
  wood: { amp: (a) => a, decay: (m, d, lo) => Math.max(0.025, 0.45 * (lo * lo) / (m.lam || lo * lo)) },
  glass: { amp: (a, m) => a * m.omega, decay: (m, d) => d * 3 },
  pluck: { amp: (a, m) => a / Math.max(0.02, m.omega), decay: (m, d) => d * 0.8 },
};
const STEP_RATE = 2 * Math.PI * HZ;          // simulation steps per second of sound, so the live voice and the modes agree on pitch
/** Ring the modes set going by kicks [[particle, dv], ...] (or play the live swarm). */
function playKicks(kicks) {
  if (S.voice === 'live') return playLive(kicks);
  const D = S.sim.dim, amp = new Float64Array(S.modes.length), V = VOICES[S.voice], d = decay();
  for (const [i, dv] of kicks) P.kickModes(S.modes, i, dv.slice(0, D)).forEach((a, k) => { amp[k] += a; });
  const lo = Math.min(...S.modes.filter((m) => !m.zero).map((m) => m.lam));
  S.bell.ring(S.modes.map((m, k) => (m.zero ? { hz: 0 } : { hz: tune(HZ * m.omega, S.scale), amp: V.amp(amp[k], m), pan: panOf(m), decay: V.decay(m, d, lo) })), d);
}
/** The live voice: record the swarm itself after the kicks (drag set so it rings as long as the bell would). */
function playLive(kicks) {
  // up to 2.5 s of sound, but no more than about 6·10⁷ pair checks of work (the 600-cell gets about half a second)
  const n = S.sim.n, steps = Math.round(Math.min(STEP_RATE * 2.5, Math.max(3000, 6e7 / (n * n)))), f = Math.exp(-2 / (decay() * STEP_RATE));
  const own = (i) => { const v = [Math.sin(i * 1.3 + 0.2), Math.cos(i * 2.1), Math.sin(i * 0.7 + 1), 0], l = Math.hypot(...v); return is4() ? [0, 1, 2, 3].map((c) => (v[0] * E[0][c] + v[1] * E[1][c] + v[2] * E[2][c]) / l) : v.map((x) => x / l); };
  const wdir = (i) => (is4() ? E[3] : (() => { const v = [Math.cos(i * 0.9), Math.sin(i * 1.7 + 2), Math.cos(i * 2.9 + 1), 0], l = Math.hypot(...v); return v.map((x) => x / l); })());
  const snap = { ...S.sim, pos: Float64Array.from(S.sim.pos), vel: Float64Array.from(S.sim.vel) };
  if (n > 40) toast('recording the swarm…');
  setTimeout(() => { const { L, R } = P.record(snap, kicks, { steps, f, spaceDirs: own, wDir: wdir }); S.bell.play(L, R, STEP_RATE); }, 20);
}
/** On arriving, or on "ring it": every mode at once, evenly, in the chosen voice and tuning. */
function chime() {
  if (S.voice === 'live') { const kicks = []; for (let i = 0; i < S.sim.n; i++) kicks.push([i, [0, 1, 2, 3].map((c) => (c < S.sim.dim ? (Math.random() * 2 - 1) * 0.004 : 0))]); return playLive(kicks); }
  const V = VOICES[S.voice], d = decay(), lo = Math.min(...S.modes.filter((m) => !m.zero).map((m) => m.lam));
  S.bell.ring(S.modes.map((m) => (m.zero ? { hz: 0 } : { hz: tune(HZ * m.omega, S.scale), amp: V.amp(1, m), pan: panOf(m), decay: V.decay(m, d, lo) })), d);
}
function ensureSound() { if (!S.bell) S.bell = new Bell(); if (S.bell.ctx.state === 'suspended') S.bell.ctx.resume(); S.sound = true; $('soundB').textContent = '♪ sound on'; $('soundB').classList.add('on'); }
$('soundB').onclick = () => { if (S.sound) { S.sound = false; S.bell?.ctx.suspend(); $('soundB').textContent = '♪ sound off'; $('soundB').classList.remove('on'); } else { ensureSound(); if (S.modes) chime(); } };
// the forces: change them and the swarm re-settles from where it is
function setForces() {
  S.forces = { a: +$('fa').value, f: +$('ff').value, rk: 2 ** +$('fr').value, mk: +$('fm').value };
  $('faV').textContent = S.forces.a.toFixed(3); $('ffV').textContent = S.forces.f.toFixed(3); $('frV').textContent = `${S.forces.rk.toFixed(2)}×`; $('fmV').textContent = `${S.forces.mk.toFixed(2)}×`;
  if (S.sim) { Object.assign(S.sim, S.forces); S.settled = false; S.run = true; S.modes = null; info(); modeInfo(); }
}
for (const id of ['fa', 'fr', 'fm', 'ff']) $(id).oninput = setForces;
for (const b of $('voice').children) b.onclick = () => { S.voice = b.dataset.v; for (const x of $('voice').children) x.classList.toggle('on', x === b); $('scaleRow').classList.toggle('dim', S.voice === 'live'); ensureSound(); if (S.modes) chime(); };
for (const b of $('scale').children) b.onclick = () => { S.scale = b.dataset.v; for (const x of $('scale').children) x.classList.toggle('on', x === b); ensureSound(); if (S.modes) chime(); };
$('hissC').onchange = () => { S.hissOn = $('hissC').checked; };
$('kickV').oninput = () => { S.kickV = +$('kickV').value; $('kickVV').textContent = S.kickV.toFixed(2); };
$('thick').oninput = () => { S.thick = +$('thick').value; $('thickV').textContent = `${S.thick.toFixed(3)} × radius`; };
/** The spectrum: each note a bar at its pitch (log scale, 30 Hz to 2 kHz), as tall as the number of modes on it. */
function modeInfo() {
  const el = $('modeFacts'); el.textContent = '';
  const row = (k, v) => { const a = document.createElement('i'), b = document.createElement('span'); a.textContent = k; b.textContent = v; el.append(a, b); };
  const cvs = $('spec'), dpr = Math.min(window.devicePixelRatio || 1, 2), w = cvs.clientWidth, h = cvs.clientHeight; cvs.width = w * dpr; cvs.height = h * dpr;
  const g = cvs.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  if (!S.modes) { row('modes', S.settled ? 'computing…' : 'once it settles'); return; }
  const live = S.modes.filter((m) => !m.zero), zero = S.modes.length - live.length, top = Math.max(...S.notes.map((x) => x.count));
  const x = (hz) => 6 + ((Math.log(hz) - Math.log(30)) / (Math.log(2000) - Math.log(30))) * (w - 12);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.fillStyle = '#9a958c'; g.font = '10px ui-monospace, Menlo, monospace';
  for (const f0 of [50, 100, 200, 500, 1000]) { g.beginPath(); g.moveTo(x(f0), 0); g.lineTo(x(f0), h - 12); g.stroke(); g.fillText(f0 >= 1000 ? `${f0 / 1000}k` : String(f0), x(f0) - 8, h - 2); }
  g.fillStyle = '#ffd27a'; for (const nt of S.notes) { const xx = x(HZ * nt.omega), hh = 6 + ((h - 22) * nt.count) / top; g.fillRect(xx - 1.5, h - 14 - hh, 3, hh); }
  row('modes', `${S.modes.length}: ${live.length} ring, ${zero} silent (turning the whole tier, which nothing holds)`);
  row('distinct notes', `${S.notes.length}`);
  row('modes on the most-shared note', String(top));
  row('pitch range', `${Math.round(HZ * S.notes[0].omega)}–${Math.round(HZ * S.notes[S.notes.length - 1].omega)} Hz`);
}
$('shakeB').onclick = () => { S.hiss = true; if (S.sound && S.modes) { const kicks = []; for (let i = 0; i < S.sim.n; i++) kicks.push([i, [0, 1, 2, 3].map(() => (Math.random() * 2 - 1) * 0.6).map((x, c) => (c < S.sim.dim ? x : 0))]); playKicks(kicks); for (const [i, dv] of kicks) P.kick(S.sim, i, dv); S.settled = false; S.run = true; info(); return; } P.shake(S.sim, 0.6); S.settled = false; S.run = true; $('pauseB').textContent = 'pause'; info(); };
$('pauseB').onclick = () => { S.run = !S.run; $('pauseB').textContent = S.run ? 'pause' : 'run'; };
for (const b of $('view').children) b.onclick = () => { S.view = b.dataset.v; for (const x of $('view').children) x.classList.toggle('on', x === b); E = homeE(); };
$('squareB').onclick = () => { E = homeE(); off = 0; };
$('spinB').onclick = () => { S.spin = !S.spin; $('spinB').classList.toggle('on', S.spin); };
$('cap').onclick = () => $('cap').classList.toggle('min');

// ------------------------------------------------------------------ controls
{
  const pts = new Map(); let pinch = 0;
  const hit = (e) => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = -1, bd = Infinity; S.C.forEach((c, i) => { const d = Math.hypot(c[0] - x, c[1] - y); if (d < (S.Rr[i] || 6) + 5 && d < bd) { bd = d; best = i; } }); return best; };
  let grab = null;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; $('cap').classList.add('min'); const i = pts.size === 1 ? hit(e) : -1; grab = i >= 0 ? { i, x: e.clientX, y: e.clientY } : null; if (grab) { S.sel = i; S.fling = { i, dx: 0, dy: 0 }; } });
  cv.addEventListener('pointermove', (e) => { const p = pts.get(e.pointerId); if (!p) return; if (grab && pts.size === 1) { S.fling = { i: grab.i, dx: e.clientX - grab.x, dy: e.clientY - grab.y }; return; } if (pts.size === 1) { yaw += (e.clientX - p[0]) * 0.008; pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - p[1]) * 0.008)); } pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoom = Math.max(0.3, Math.min(6, (zoom * d) / pinch)); pinch = d; } });
  const up = (e) => { pts.delete(e.pointerId); pinch = 0; if (grab) { const { dx, dy } = S.fling || { dx: 0, dy: 0 }; if (Math.hypot(dx, dy) > 8) kickAlong(grab.i, screenDir(dx, dy), Math.min(1.5, Math.hypot(dx, dy) / 120)); else { const g = () => { let u = 0; for (let k = 0; k < 6; k++) u += Math.random(); return u - 3; }, v = [g(), g(), g(), is4() ? g() : 0], l = Math.hypot(...v); kickAlong(grab.i, v.map((q) => q / l)); } grab = null; S.fling = null; } }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.3, Math.min(6, zoom * Math.exp(-e.deltaY * 0.0015))); }, { passive: false });
}
const stick = { x: 0, y: 0 }, lever = { y: 0 }, keys = new Set();
{
  const pad = $('twist'), knob = $('twistKnob'), lv = $('ana'), lk = $('anaKnob');
  const padMove = (e) => { const r = pad.getBoundingClientRect(); let x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } stick.x = x; stick.y = -y; knob.style.transform = `translate(${x * 30}px, ${y * 30}px)`; };
  const padEnd = () => { stick.x = stick.y = 0; knob.style.transform = ''; pad.classList.remove('live'); };
  pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); pad.classList.add('live'); padMove(e); }); pad.addEventListener('pointermove', (e) => { if (pad.classList.contains('live')) padMove(e); }); pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd);
  const lvMove = (e) => { const r = lv.getBoundingClientRect(); const y = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1)); lever.y = -y; lk.style.transform = `translateY(${y * 40}px)`; };
  const lvEnd = () => { lever.y = 0; lk.style.transform = ''; lv.classList.remove('live'); };
  lv.addEventListener('pointerdown', (e) => { lv.setPointerCapture(e.pointerId); lv.classList.add('live'); lvMove(e); }); lv.addEventListener('pointermove', (e) => { if (lv.classList.contains('live')) lvMove(e); }); lv.addEventListener('pointerup', lvEnd); lv.addEventListener('pointercancel', lvEnd);
  addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; keys.add(e.key); if (e.key.startsWith('Arrow')) e.preventDefault(); });
  addEventListener('keyup', (e) => keys.delete(e.key));
}

// ------------------------------------------------------------------ the loop
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (is4()) {
    let tx = stick.x, ty = stick.y, ly = lever.y;
    if (keys.has('ArrowLeft')) tx -= 1; if (keys.has('ArrowRight')) tx += 1; if (keys.has('ArrowUp')) ty += 1; if (keys.has('ArrowDown')) ty -= 1;
    if (keys.has('q') || keys.has('[')) ly += 1; if (keys.has('e') || keys.has(']')) ly -= 1;
    const r = [Math.cos(yaw), 0, Math.sin(yaw)], u = [0, 1, 0], lift = (v) => [0, 1, 2, 3].map((i) => v[0] * E[0][i] + v[1] * E[1][i] + v[2] * E[2][i]);
    if (tx) turn(lift(r), E[3], tx * 1.1 * dt); if (ty) turn(lift(u), E[3], ty * 1.1 * dt);
    if (ly) off = Math.max(-3, Math.min(3, off + ly * 0.8 * dt * S.scaleR));
  }
  if (S.run && !S.settled) {
    // as many steps a frame as the budget allows (the pair loop is n² a step)
    // small swarms slowly enough to watch; big ones as fast as about 400,000 pair checks a frame allows
    const n = S.sim.n, k = n < 40 ? 6 : Math.max(1, Math.min(30, Math.round(400000 / (n * n)))); let v = 0;
    for (let j = 0; j < k; j++) v = P.step(S.sim);
    // settled: as strict as the selftest's (a looser stop leaves the shape a little off and unrecognised)
    if (v < 1e-9 && S.sim.steps > 100) { S.settled = true; read(); setTimeout(() => { computeModes(); if (S.sound && S.modes) chime(); }, 30); }
    else if (++S.frame % 15 === 0) read();
  }
  if (S.bell) { let v2 = 0; if (S.run && !S.settled && S.hiss && S.hissOn) { for (let i = 0; i < S.sim.n * 4; i++) v2 += S.sim.vel[i] ** 2; v2 /= S.sim.n; } S.bell.hiss(Math.sqrt(v2)); }
  if (S.spin) yaw += dt * 0.25;
  draw();
  requestAnimationFrame(tick);
}
addEventListener('resize', () => draw());
{
  const h = location.hash.slice(1), m = h.match(/^([a-z0-9]+)(?:-(\d+))?$/), i = m ? P.PRESETS.findIndex((p) => p.id === m[1]) : -1;
  if (m && m[2]) S.n = Math.max(2, Math.min(130, +m[2]));
  const keep = S.n; setPreset(i >= 0 ? i : 4); if (m && m[2]) { S.n = keep; $('n').value = keep; $('nV').textContent = keep; start(); }
}
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1800); }
$('kickVV').textContent = S.kickV.toFixed(2); $('thickV').textContent = `${S.thick.toFixed(3)} × radius`; setForces();
window.chora = { S, P, setPreset, start, kickAlong, computeModes, playKicks: (k) => playKicks(k), pose: (p) => { if (p.E) E = p.E; if (p.off !== undefined) off = p.off; if (p.yaw !== undefined) yaw = p.yaw; if (p.pitch !== undefined) pitch = p.pitch; } };
requestAnimationFrame(tick);
