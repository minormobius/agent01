// PARTICLE-CHORA's page: the particle system stepping live, drawn on one 2D canvas (particles as discs, depth-sorted;
// each tier's edges in its colour). 3D presets are drawn straight; 4D ones as a shadow from an eye out in w (tilted 35°
// off w, as PRISM's) or a slice. The pad, lever and ⊞ are CAD⁴'s.
import * as P from './particles.js';

const $ = (id) => document.getElementById(id);
const cv = $('ov'), ctx = cv.getContext('2d');
const S = { preset: 0, n: 12, sim: null, run: true, settled: false, view: 'shadow', spin: true, frame: 0, ids: [], edges: [], union: true, scaleR: 1.5 };
let E = null, off = 0, yaw = 0.5, pitch = 0.35, zoom = 1;
const TILT = (35 * Math.PI) / 180;
const homeE = () => (S.view === 'shadow' ? [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, Math.cos(TILT), Math.sin(TILT)], [0, 0, -Math.sin(TILT), Math.cos(TILT)]] : [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
function turn(a, n, th) { const c = Math.cos(th) - 1, s = Math.sin(th); E = E.map((v) => { const va = dot(v, a), vn = dot(v, n); return v.map((x, i) => x + c * (va * a[i] + vn * n[i]) + s * (va * n[i] - vn * a[i])); }); for (let i = 0; i < 4; i++) { for (let j = 0; j < i; j++) { const d = dot(E[i], E[j]); E[i] = E[i].map((x, k) => x - d * E[j][k]); } const l = Math.hypot(...E[i]); E[i] = E[i].map((x) => x / l); } }
const pr = () => P.PRESETS[S.preset], is4 = () => pr().dim === 4;

// ------------------------------------------------------------------ the system
function start() {
  const p = pr(); S.sim = P.create(p.make(S.n), Math.random); S.settled = false; S.run = true; $('pauseB').textContent = 'pause';
  S.ids = []; S.edges = []; S.frame = 0; info();
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
  const inSlice = (i) => (S.view === 'slice' && four ? Math.max(0, 1 - Math.abs(P3[i][3]) / (0.18 * S.scaleR)) : 1);
  // edges, then particles back to front
  ctx.lineWidth = 1.4;
  for (const [a, b, col] of S.edges) {
    const al = S.view === 'slice' && four ? Math.min(inSlice(a), inSlice(b)) : 0.75; if (al < 0.03) continue;
    ctx.strokeStyle = col; ctx.globalAlpha = al * 0.8; ctx.beginPath(); ctx.moveTo(C[a][0], C[a][1]); ctx.lineTo(C[b][0], C[b][1]); ctx.stroke();
  }
  const order = C.map((c, i) => [c[2], i]).sort((p, q) => p[0] - q[0]);
  for (const [, i] of order) {
    const al = inSlice(i); if (al < 0.03) continue;
    const col = s.preset.types[s.type[i]].col, r = Math.max(2, 5.5 * C[i][3] * Math.min(1.4, zoom));
    ctx.globalAlpha = al; const g = ctx.createRadialGradient(C[i][0] - r * 0.3, C[i][1] - r * 0.3, r * 0.1, C[i][0], C[i][1], r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, col); g.addColorStop(1, 'rgba(0,0,0,0.6)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(C[i][0], C[i][1], r, 0, 7); ctx.fill();
  }
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
$('shakeB').onclick = () => { P.shake(S.sim, 0.6); S.settled = false; S.run = true; $('pauseB').textContent = 'pause'; info(); };
$('pauseB').onclick = () => { S.run = !S.run; $('pauseB').textContent = S.run ? 'pause' : 'run'; };
for (const b of $('view').children) b.onclick = () => { S.view = b.dataset.v; for (const x of $('view').children) x.classList.toggle('on', x === b); E = homeE(); };
$('squareB').onclick = () => { E = homeE(); off = 0; };
$('spinB').onclick = () => { S.spin = !S.spin; $('spinB').classList.toggle('on', S.spin); };
$('cap').onclick = () => $('cap').classList.toggle('min');

// ------------------------------------------------------------------ controls
{
  const pts = new Map(); let pinch = 0;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; $('cap').classList.add('min'); });
  cv.addEventListener('pointermove', (e) => { const p = pts.get(e.pointerId); if (!p) return; if (pts.size === 1) { yaw += (e.clientX - p[0]) * 0.008; pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - p[1]) * 0.008)); } pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoom = Math.max(0.3, Math.min(6, (zoom * d) / pinch)); pinch = d; } });
  const up = (e) => { pts.delete(e.pointerId); pinch = 0; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
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
    if (v < 1e-9 && S.sim.steps > 100) { S.settled = true; read(); }
    else if (++S.frame % 15 === 0) read();
  }
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
window.chora = { S, P, setPreset, start, pose: (p) => { if (p.E) E = p.E; if (p.off !== undefined) off = p.off; if (p.yaw !== undefined) yaw = p.yaw; if (p.pitch !== undefined) pitch = p.pitch; } };
requestAnimationFrame(tick);
