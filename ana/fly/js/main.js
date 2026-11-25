// FLY's page: the Voxel Space view (480×270, drawn pixelated), the overlay (ghost skylines, beacons, the HUD), and the
// map of the 3D floor. Controls: a stick (pitch, turn), the ana/kata lever, the swing buttons, keys.
import * as Y from './fly.js';

const $ = (id) => document.getElementById(id);
const view = $('view'), vctx = view.getContext('2d'), ov = $('ov'), octx = ov.getContext('2d'), mapc = $('map'), mctx = mapc.getContext('2d');
const img = vctx.createImageData(Y.W, Y.H), px = new Uint32Array(img.data.buffer);
const S = { seed: 1, wd: null, c: null, beacons: [], next: 0, t0: 0, ghosts: true, tint: false, map: true, paused: false, ghost: null, frame: 0, myaw: 0.6, mpitch: 0.5, best: null, done: false };

function newWorld(seed) {
  $('loading').hidden = false;
  setTimeout(() => { S.seed = seed; S.wd = Y.buildWorld(seed); newCourse(); $('loading').hidden = true; }, 30);
}
function newCourse() {
  S.c = Y.aircraft(S.wd); S.beacons = Y.course(S.wd, S.c.p, 8, Math.floor(Math.random() * 1e6)); S.next = 0; S.t0 = performance.now(); S.done = false; S.c.trail = [];
  $('spd').value = S.c.speed; info();
}

// ------------------------------------------------------------------ the overlay
const SKY_ANA = '#38f2e0', SKY_KATA = '#ff66b8';
function overlay(fr) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, w, h);
  // the view canvas is scaled to cover the stage (object-fit: fill): screen = frame × (w/W, h/H)
  const sx = w / Y.W, sy = h / Y.H, c = S.c;
  // ghost skylines: the land 150 m ana (teal) and kata (rose) of you
  if (S.ghosts && S.ghost) for (const [g, col] of [[S.ghost.ana, SKY_ANA], [S.ghost.kata, SKY_KATA]]) {
    octx.strokeStyle = col; octx.globalAlpha = 0.85; octx.lineWidth = 1.5; octx.beginPath(); let pen = false;
    for (let x = 0; x < Y.W; x += 2) { const y = g[x]; if (y >= Y.H) { pen = false; continue; } if (pen) octx.lineTo(x * sx, y * sy); else octx.moveTo(x * sx, y * sy); pen = true; }
    octx.stroke(); octx.globalAlpha = 1;
  }
  // the beacons: each a ball in 4D; in your slice, the disc it cuts (radius √(r² − ana²)), else a dashed ring
  S.beacons.forEach((b, i) => {
    if (i < S.next) return;
    const r = Y.relative(c, b); if (r.ahead < 5) return;
    const X = (Y.W / 2 + (r.right / r.ahead) * Y.FOCAL) * sx, Yp = (fr.horizon - (r.up / r.ahead) * Y.FOCAL) * sy, R = (b.r / r.ahead) * Y.FOCAL * sx;
    if (X < -R || X > w + R || Yp < -R || Yp > h + R) return;
    const cur = i === S.next, inSlice = Math.abs(r.ana) < b.r;
    octx.globalAlpha = cur ? 1 : 0.45;
    if (inSlice) {
      const rs = (Math.sqrt(b.r * b.r - r.ana * r.ana) / r.ahead) * Y.FOCAL * sx, g = octx.createRadialGradient(X, Yp, 0, X, Yp, Math.max(2, rs));
      g.addColorStop(0, 'rgba(255,240,200,0.95)'); g.addColorStop(0.6, 'rgba(255,210,122,0.8)'); g.addColorStop(1, 'rgba(255,210,122,0.1)');
      octx.fillStyle = g; octx.beginPath(); octx.arc(X, Yp, Math.max(2, rs), 0, 7); octx.fill();
    }
    octx.setLineDash(inSlice ? [] : [4, 4]); octx.strokeStyle = r.ana > 0 ? SKY_ANA : SKY_KATA; octx.lineWidth = cur ? 2 : 1; octx.beginPath(); octx.arc(X, Yp, Math.max(3, R), 0, 7); octx.stroke(); octx.setLineDash([]);
    if (cur) { octx.fillStyle = '#fff'; octx.font = '600 11px ui-monospace, Menlo, monospace'; octx.textAlign = 'center'; octx.fillText(`${i + 1}`, X, Yp - Math.max(3, R) - 6); }
    octx.globalAlpha = 1;
  });
  // the next beacon off screen: an arrow at the edge toward it (its right and up)
  const b = S.beacons[S.next];
  if (b) {
    const r = Y.relative(c, b), X = Y.W / 2 + (r.right / Math.max(1, r.ahead)) * Y.FOCAL, Yp = fr.horizon - (r.up / Math.max(1, r.ahead)) * Y.FOCAL;
    if (r.ahead < 5 || X < 0 || X > Y.W || Yp < 0 || Yp > Y.H) {
      const a = Math.atan2(-r.up, r.ahead < 5 ? r.right || 1e-6 : r.right), cx = w / 2 + Math.cos(a) * (Math.min(w, h) * 0.42), cy = h / 2 + Math.sin(a) * (Math.min(w, h) * 0.42);
      octx.fillStyle = '#ffd27a'; octx.save(); octx.translate(cx, cy); octx.rotate(a); octx.beginPath(); octx.moveTo(12, 0); octx.lineTo(-6, -7); octx.lineTo(-6, 7); octx.fill(); octx.restore();
    }
    // the ana gauge: how far ana (up, teal) or kata (down, rose) the next beacon is, ±600 m full scale
    const gx = w - 26, gy = h * 0.6, gh = Math.min(90, h * 0.16), v = Math.max(-1, Math.min(1, r.ana / 600));
    octx.fillStyle = 'rgba(7,8,12,0.55)'; octx.fillRect(gx - 7, gy - gh - 4, 14, 2 * gh + 8);
    octx.fillStyle = 'rgba(255,255,255,0.35)'; octx.fillRect(gx - 7, gy - (b.r / 600) * gh, 14, (2 * b.r / 600) * gh);
    octx.fillStyle = r.ana > 0 ? SKY_ANA : SKY_KATA; octx.fillRect(gx - 5, Math.min(gy, gy - v * gh), 10, Math.abs(v * gh));
    octx.fillStyle = '#e9e4da'; octx.font = '600 10px ui-monospace, Menlo, monospace'; octx.textAlign = 'right';
    octx.fillText(`${r.ana >= 0 ? 'ana' : 'kata'} ${Math.abs(Math.round(r.ana))} m`, gx + 7, gy + gh + 18);
  }
  // HUD: altitude above ground, speed, pitch
  const agl = Math.round(c.alt - Y.heightAt(S.wd, ...c.p));
  const hud = `${Math.round(c.speed)} m/s · ${agl} m up · ${Math.round((c.pitch * 180) / Math.PI)}°`; octx.font = '600 12px ui-monospace, Menlo, monospace'; const tw = octx.measureText(hud).width;
  octx.fillStyle = 'rgba(7,8,12,0.55)'; octx.fillRect(w / 2 - tw / 2 - 8, h - 34, tw + 16, 22); octx.fillStyle = '#e9e4da'; octx.textAlign = 'center'; octx.fillText(hud, w / 2, h - 19);
}

// ------------------------------------------------------------------ the map: the 3D floor round you
function drawMap() {
  if (!S.map) { mapc.hidden = true; return; } mapc.hidden = false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = mapc.clientWidth, h = mapc.clientHeight;
  if (mapc.width !== Math.round(w * dpr)) { mapc.width = Math.round(w * dpr); mapc.height = Math.round(h * dpr); }
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0); mctx.clearRect(0, 0, w, h);
  const c = S.c, HALF = 2000, sc = (w * 0.42) / HALF, cy = Math.cos(S.myaw), sy = Math.sin(S.myaw), cp = Math.cos(S.mpitch), sp = Math.sin(S.mpitch);
  const rel = (q) => q.map((x, i) => { let v = x - c.p[i]; v -= Math.round(v / Y.L) * Y.L; return v; });
  const pr = (d) => { const x1 = cy * d[0] + sy * d[2], z1 = -sy * d[0] + cy * d[2], y2 = cp * d[1] - sp * z1, z2 = sp * d[1] + cp * z1; return [w / 2 + x1 * sc, h / 2 - y2 * sc, z2]; };
  // the box
  mctx.strokeStyle = 'rgba(255,255,255,0.12)'; mctx.lineWidth = 1;
  for (const [a, b] of [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]]) { const P = [a, b].map((k) => pr([(k & 1 ? 1 : -1) * HALF, (k & 2 ? 1 : -1) * HALF, (k & 4 ? 1 : -1) * HALF])); mctx.beginPath(); mctx.moveTo(P[0][0], P[0][1]); mctx.lineTo(P[1][0], P[1][1]); mctx.stroke(); }
  // peaks inside the box: dots, brighter and bigger the higher
  for (const pk of S.wd.peaks) { const d = rel(pk); if (Math.abs(d[0]) > HALF || Math.abs(d[1]) > HALF || Math.abs(d[2]) > HALF) continue; const q = pr(d), t = Math.min(1, (pk[3] - S.wd.sea - 450) / 500); mctx.fillStyle = `rgba(${200 + 55 * t},${190 + 50 * t},${180 + 60 * t},${0.35 + 0.5 * t})`; mctx.beginPath(); mctx.arc(q[0], q[1], 1 + 2 * t, 0, 7); mctx.fill(); }
  // the plane you see: the square spanned by forward and right
  const sq = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => pr(c.F.map((x, i) => x * a * 1400 + c.R[i] * b * 1400)));
  mctx.fillStyle = 'rgba(255,210,122,0.12)'; mctx.strokeStyle = 'rgba(255,210,122,0.5)'; mctx.beginPath(); sq.forEach((q, i) => (i ? mctx.lineTo(q[0], q[1]) : mctx.moveTo(q[0], q[1]))); mctx.closePath(); mctx.fill(); mctx.stroke();
  // your track
  mctx.strokeStyle = 'rgba(255,255,255,0.7)'; mctx.lineWidth = 1.5; mctx.beginPath(); let pen = false, prev = null;
  for (const tp of c.trail) { const d = rel(tp); if (prev && Math.hypot(d[0] - prev[0], d[1] - prev[1], d[2] - prev[2]) > 500) pen = false; prev = d; const q = pr(d); if (pen) mctx.lineTo(q[0], q[1]); else mctx.moveTo(q[0], q[1]); pen = true; }
  mctx.stroke();
  // beacons
  S.beacons.forEach((b, i) => { if (i < S.next) return; const d = rel(b.p); if (Math.max(...d.map(Math.abs)) > HALF) return; const q = pr(d); mctx.fillStyle = i === S.next ? '#ffd27a' : 'rgba(255,210,122,0.45)'; mctx.beginPath(); mctx.arc(q[0], q[1], i === S.next ? 4 : 2.5, 0, 7); mctx.fill(); });
  // you: forward (gold), right (white), ana (teal)
  const o = pr([0, 0, 0]);
  for (const [v, col] of [[c.F, '#ffd27a'], [c.R, '#e9e4da'], [c.A, SKY_ANA]]) { const q = pr(v.map((x) => x * 600)); mctx.strokeStyle = col; mctx.lineWidth = 2; mctx.beginPath(); mctx.moveTo(o[0], o[1]); mctx.lineTo(q[0], q[1]); mctx.stroke(); }
  mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(o[0], o[1], 3, 0, 7); mctx.fill();
  mctx.fillStyle = '#9a958c'; mctx.font = '9px ui-monospace, Menlo, monospace'; mctx.textAlign = 'left'; mctx.fillText('the floor, 4 km', 6, h - 6);
}

// ------------------------------------------------------------------ the panel
function info() {
  const el = $('facts'); el.textContent = ''; const row = (k, v) => { const a = document.createElement('i'), b = document.createElement('span'); a.textContent = k; b.textContent = v; el.append(a, b); };
  const n = S.beacons.length, t = ((S.doneAt || performance.now()) - S.t0) / 1000;
  row('beacon', S.done ? `all ${n}` : `${S.next + 1} of ${n}`); row('time', `${t.toFixed(1)} s`); if (S.best) row('best', `${S.best.toFixed(1)} s`);
  row('world', `seed ${S.seed}, 8 km a side, wrapping`);
  $('title').textContent = S.done ? 'course flown' : 'the course';
  $('cap').textContent = S.done ? `All ${n} beacons in ${t.toFixed(1)} s. New course, or just fly.` : 'Fly through the beacons. A beacon shows only as the slice of it you are in: turn ana or kata (the lever, or A and D) until it fills, then fly through.';
}
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1800); }
$('ghostB').onclick = () => { S.ghosts = !S.ghosts; $('ghostB').classList.toggle('on', S.ghosts); };
$('tintB').onclick = () => { S.tint = !S.tint; $('tintB').classList.toggle('on', S.tint); };
$('mapB').onclick = () => { S.map = !S.map; $('mapB').classList.toggle('on', S.map); };
$('pauseB').onclick = () => { S.paused = !S.paused; $('pauseB').classList.toggle('on', S.paused); $('pauseB').textContent = S.paused ? 'fly' : 'pause'; };
$('newB').onclick = () => newCourse();
$('worldB').onclick = () => newWorld(Math.floor(Math.random() * 1e6));
$('homeB').onclick = () => { S.c.pitch = 0; };
$('spd').oninput = () => { S.c.speed = +$('spd').value; };
$('cap').onclick = () => $('cap').classList.toggle('min');

// ------------------------------------------------------------------ controls
const stick = { x: 0, y: 0 }, lever = { y: 0 }, keys = new Set(); let roll = 0;
{
  const pad = $('twist'), knob = $('twistKnob'), lv = $('ana'), lk = $('anaKnob');
  const padMove = (e) => { const r = pad.getBoundingClientRect(); let x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } stick.x = x; stick.y = -y; knob.style.transform = `translate(${x * 30}px, ${y * 30}px)`; };
  const padEnd = () => { stick.x = stick.y = 0; knob.style.transform = ''; pad.classList.remove('live'); };
  pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); pad.classList.add('live'); padMove(e); }); pad.addEventListener('pointermove', (e) => { if (pad.classList.contains('live')) padMove(e); }); pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd);
  const lvMove = (e) => { const r = lv.getBoundingClientRect(); const y = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1)); lever.y = -y; lk.style.transform = `translateY(${y * 40}px)`; };
  const lvEnd = () => { lever.y = 0; lk.style.transform = ''; lv.classList.remove('live'); };
  lv.addEventListener('pointerdown', (e) => { lv.setPointerCapture(e.pointerId); lv.classList.add('live'); lvMove(e); }); lv.addEventListener('pointermove', (e) => { if (lv.classList.contains('live')) lvMove(e); }); lv.addEventListener('pointerup', lvEnd); lv.addEventListener('pointercancel', lvEnd);
  for (const [id, v] of [['rollL', -1], ['rollR', 1]]) { const b = $(id); b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); roll = v; }); const off = () => { roll = 0; }; b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); }
  addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; keys.add(e.key.toLowerCase()); if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault(); });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  // the map turns by dragging
  let md = null; mapc.addEventListener('pointerdown', (e) => { mapc.setPointerCapture(e.pointerId); md = [e.clientX, e.clientY]; });
  mapc.addEventListener('pointermove', (e) => { if (!md) return; S.myaw += (e.clientX - md[0]) * 0.01; S.mpitch = Math.max(-1.4, Math.min(1.4, S.mpitch + (e.clientY - md[1]) * 0.01)); md = [e.clientX, e.clientY]; });
  mapc.addEventListener('pointerup', () => { md = null; });
}

// ------------------------------------------------------------------ the loop
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.wd && S.c) {
    if (!S.paused) {
      const k = { yaw: stick.x, pitch: stick.y, ana: lever.y, roll, throttle: 0 };
      if (keys.has('arrowleft')) k.yaw -= 1; if (keys.has('arrowright')) k.yaw += 1; if (keys.has('arrowup')) k.pitch += 1; if (keys.has('arrowdown')) k.pitch -= 1;
      if (keys.has('d')) k.ana += 1; if (keys.has('a')) k.ana -= 1; if (keys.has('e')) k.roll += 1; if (keys.has('q')) k.roll -= 1;
      if (keys.has('w')) k.throttle += 1; if (keys.has('s')) k.throttle -= 1;
      if (Y.fly(S.wd, S.c, k, dt)) toast('pull up!');
      if (k.throttle) $('spd').value = S.c.speed;
      if (++S.frame % 6 === 0) { S.c.trail.push(S.c.p.slice()); if (S.c.trail.length > 400) S.c.trail.shift(); }
      const b = S.beacons[S.next];
      if (b && Y.inside(S.c, b)) { S.next++; if (S.next === S.beacons.length) { S.done = true; S.doneAt = now; const t = (now - S.t0) / 1000; if (!S.best || t < S.best) S.best = t; toast(`course flown: ${t.toFixed(1)} s`); } else toast(`beacon ${S.next} ✓`); info(); }
      if (S.frame % 30 === 0) info();
    }
    const fr = Y.render(S.wd, S.c, px, { tint: S.tint ? 1 : 0 });
    vctx.putImageData(img, 0, 0);
    // the ghosts, every other frame (each is a skyline pass of its own)
    if (S.ghosts && (S.frame % 2 === 0 || !S.ghost)) S.ghost = { ana: Y.skyline(S.wd, S.c, 150, 4).out, kata: Y.skyline(S.wd, S.c, -150, 4).out };
    overlay(fr); if (S.frame % 3 === 0) drawMap();
    if (!S.paused && S.frame % 2 === 0) S.myaw += 0.002;
  }
  requestAnimationFrame(tick);
}
addEventListener('resize', () => {});
newWorld(+(location.hash.match(/seed(\d+)/)?.[1] || 1));
window.fly = { S, Y };
requestAnimationFrame(tick);
