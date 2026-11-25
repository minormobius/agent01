// FLY's page: the Voxel Space view (480×270, drawn pixelated), the overlay (ghost skylines, beacons, the HUD), and the
// map of the 3D floor. Controls: a stick (pitch, turn), the ana/kata lever, the swing buttons, keys.
import * as Y from './fly.js';

const $ = (id) => document.getElementById(id);
const view = $('view'), vctx = view.getContext('2d'), ov = $('ov'), octx = ov.getContext('2d'), mapc = $('map'), mctx = mapc.getContext('2d');
const img = vctx.createImageData(Y.W, Y.H), px = new Uint32Array(img.data.buffer);
const S = { seed: 1, wd: null, c: null, beacons: [], next: 0, t0: 0, ghosts: true, tint: false, map: true, path: true, k: {}, pred: null, paused: false, ghost: null, frame: 0, myaw: 0.6, mpitch: 0.5, best: null, done: false };

function newWorld(seed) {
  $('loading').hidden = false;
  setTimeout(() => { S.seed = seed; S.wd = Y.buildWorld(seed); newCourse(); $('loading').hidden = true; }, 30);
}
function newCourse() {
  S.c = Y.aircraft(S.wd); S.beacons = Y.course(S.wd, S.c.X, 8, Math.floor(Math.random() * 1e6)); S.next = 0; S.t0 = performance.now(); S.done = false; S.c.trail = [];
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
  // the predicted path: where you'll be, controls held, every 0.1 s for 10 s. Gold where it stays in your slice; as it
  // drifts ana it turns teal (kata: rose) and fades (gone by 120 m out of the slice); a dot each second; ✕ at impact
  if (S.path && S.pred) {
    const P = S.pred.pts, pt = (p) => { const r = Y.relative(c, p); return r.ahead < 4 ? null : { x: (Y.W / 2 + (r.right / r.ahead) * Y.FOCAL) * sx, y: (fr.horizon - (r.up / r.ahead) * Y.FOCAL) * sy, ana: r.ana, ahead: r.ahead }; };
    const col = (ana) => { const a = Math.min(1, Math.abs(ana) / 60); if (a < 0.12) return 'rgb(255,210,122)'; const T = ana > 0 ? [56, 242, 224] : [255, 102, 184]; return `rgb(${Math.round(255 + (T[0] - 255) * a)},${Math.round(210 + (T[1] - 210) * a)},${Math.round(122 + (T[2] - 122) * a)})`; };
    // its shadow on the ground first (on a planet this small the camera looks well below your own height, so the
    // shadow is what's usually in view), then a post each second up to the path, then the path
    let sh = null; octx.lineCap = 'round';
    for (let i = 1; i < P.length; i++) {
      const q = pt({ X: P[i].X, alt: P[i].ground, F: 0 }); if (!q) { sh = null; continue; }
      if (sh) { octx.globalAlpha = Math.max(0.06, 0.75 - Math.abs(q.ana) / 160); octx.strokeStyle = col(q.ana); octx.lineWidth = Math.max(1, Math.min(4, 200 / q.ahead)); octx.setLineDash([2, 4]); octx.beginPath(); octx.moveTo(sh.x, sh.y); octx.lineTo(q.x, q.y); octx.stroke(); }
      sh = q;
      if (Math.abs(P[i].t - Math.round(P[i].t)) < 1e-6) { const up = pt(P[i]); if (up) { octx.setLineDash([]); octx.globalAlpha = 0.45; octx.lineWidth = 1; octx.beginPath(); octx.moveTo(q.x, q.y); octx.lineTo(up.x, up.y); octx.stroke(); } }
    }
    let prev = null;
    for (let i = 1; i < P.length; i++) {
      const q = pt(P[i]); if (!q) { prev = null; continue; }
      if (prev) { octx.globalAlpha = Math.max(0.08, 1 - Math.abs(q.ana) / 120) * 0.95; octx.strokeStyle = col(q.ana); octx.lineWidth = Math.max(1.2, Math.min(5, 260 / q.ahead)); octx.setLineDash(Math.abs(q.ana) > 12 ? [5, 5] : []); octx.beginPath(); octx.moveTo(prev.x, prev.y); octx.lineTo(q.x, q.y); octx.stroke(); }
      if (Math.abs(P[i].t - Math.round(P[i].t)) < 1e-6 && !P[i].hit) { octx.setLineDash([]); octx.globalAlpha = Math.max(0.15, 1 - Math.abs(q.ana) / 120); octx.fillStyle = col(q.ana); octx.beginPath(); octx.arc(q.x, q.y, Math.max(2, Math.min(4.5, 300 / q.ahead)), 0, 7); octx.fill(); if (Math.round(P[i].t) % 2 === 0) { octx.font = '600 10px ui-monospace, Menlo, monospace'; octx.textAlign = 'left'; octx.fillText(`${Math.round(P[i].t)}s${Math.abs(q.ana) > 12 ? ` ${q.ana > 0 ? 'ana' : 'kata'} ${Math.round(Math.abs(q.ana))}` : ''}`, q.x + 7, Math.max(12, q.y - 5)); } }
      prev = q;
    }
    octx.setLineDash([]); octx.globalAlpha = 1;
    const imp = S.pred.impact != null && pt(P[P.length - 1]);
    if (imp) { octx.strokeStyle = '#ff4d4d'; octx.lineWidth = 3; const r = 8; octx.beginPath(); octx.moveTo(imp.x - r, imp.y - r); octx.lineTo(imp.x + r, imp.y + r); octx.moveTo(imp.x + r, imp.y - r); octx.lineTo(imp.x - r, imp.y + r); octx.stroke(); }
    // the closest approach to the next beacon: a ring on the path there
    const ca = S.close; if (ca) { const q = pt(P[ca.i]); if (q) { octx.strokeStyle = ca.through ? '#7dffa0' : '#ffd27a'; octx.lineWidth = 2; octx.beginPath(); octx.arc(q.x, q.y, 9, 0, 7); octx.stroke(); } }
  }
  if (S.path && S.pred) scope(w, h);
  // the flight-path marker: where you are going this instant (along F, climbing at your pitch)
  { const fx = w / 2, fy0 = (fr.horizon - Math.tan(c.pitch) * Y.FOCAL) * sy, fy = Math.max(112, fy0); octx.strokeStyle = '#ffffff'; octx.globalAlpha = 0.9;
    if (fy0 < 112) { octx.fillStyle = '#ffffff'; octx.font = '600 10px ui-monospace, Menlo, monospace'; octx.textAlign = 'center'; octx.fillText('▲ heading (above the view)', fx, fy + 24); } octx.lineWidth = 1.8; octx.beginPath(); octx.arc(fx, fy, 6, 0, 7); octx.moveTo(fx - 18, fy); octx.lineTo(fx - 6, fy); octx.moveTo(fx + 6, fy); octx.lineTo(fx + 18, fy); octx.moveTo(fx, fy - 6); octx.lineTo(fx, fy - 13); octx.stroke(); octx.globalAlpha = 1; }
  // the call-outs: terrain ahead, and what the path does at the next beacon
  {
    const lines = [];
    if (S.pred && S.pred.impact != null) lines.push(['#ff6b6b', `terrain in ${S.pred.impact.toFixed(1)} s: pull up`]);
    const ca = S.close, bb = S.beacons[S.next];
    if (ca && bb) {
      if (ca.through) lines.push(['#7dffa0', `on course: through beacon ${S.next + 1} in ${ca.t.toFixed(1)} s`]);
      else if (ca.t > 0.2 && ca.t < 9.9 && Math.abs(ca.ahead) < 60 && ca.dist < 300) { const parts = []; if (Math.abs(ca.right) > 5) parts.push(`${Math.round(Math.abs(ca.right))} m ${ca.right > 0 ? 'right' : 'left'}`); if (Math.abs(ca.up) > 5) parts.push(`${Math.round(Math.abs(ca.up))} m ${ca.up > 0 ? 'up' : 'down'}`); if (Math.abs(ca.ana) > 5) parts.push(`${Math.round(Math.abs(ca.ana))} m ${ca.ana > 0 ? 'ana' : 'kata'}`); lines.push(['#ffd27a', `beacon ${S.next + 1} passes in ${ca.t.toFixed(1)} s: ${parts.join(' · ')} of you`]); }
    }
    octx.font = '600 11px ui-monospace, Menlo, monospace'; octx.textAlign = 'center';
    lines.forEach(([cl, tx], i) => { const tw = octx.measureText(tx).width, y = h - 62 - i * 22; octx.fillStyle = 'rgba(7,8,12,0.6)'; octx.fillRect(w / 2 - tw / 2 - 8, y - 14, tw + 16, 20); octx.fillStyle = cl; octx.fillText(tx, w / 2, y); });
  }
  // HUD: altitude above ground, speed, pitch
  const agl = Math.round(c.alt - Y.heightAt(S.wd, c.X));
  const hud = `${Math.round(c.speed)} m/s · ${agl} m up · ${Math.round((c.pitch * 180) / Math.PI)}°`; octx.font = '600 12px ui-monospace, Menlo, monospace'; const tw = octx.measureText(hud).width;
  octx.fillStyle = 'rgba(7,8,12,0.55)'; octx.fillRect(w / 2 - tw / 2 - 8, h - 34, tw + 16, 22); octx.fillStyle = '#e9e4da'; octx.textAlign = 'center'; octx.fillText(hud, w / 2, h - 19);
}

// ------------------------------------------------------------------ the path scope
/** The predicted path in three strips against time (0–10 s): left/right and ana/kata of you now, and height above
 *  the datum with the ground under the path. The next beacon sits in each at the moment the path comes closest to
 *  it, drawn its own size: you go through only if the path meets it in all three. */
function scope(w, h) {
  const P = S.pred.pts, c = S.c, x0 = 10, wd = Math.min(190, w * 0.3), sh = 46, gap = 6, y0 = Math.max(110, h * 0.36), T = 10;
  const ca = S.close, b = S.beacons[S.next], rb = b ? Y.relative(c, b) : null;
  const rel = P.map((p) => Y.relative(c, p));
  const strips = [
    { name: 'right', lo: 'left', get: (i) => rel[i].right, beacon: rb && rb.right, col: '#e9e4da' },
    { name: 'ana', lo: 'kata', get: (i) => rel[i].ana, beacon: rb && rb.ana, col: SKY_ANA },
    { name: 'height', lo: '', get: (i) => P[i].alt, ground: (i) => P[i].ground, beacon: b && b.alt, col: '#ffd27a' },
  ];
  const X = (t) => x0 + 34 + (t / T) * (wd - 40);
  octx.save(); octx.font = '600 9px ui-monospace, Menlo, monospace';
  strips.forEach((st, k) => {
    const top = y0 + k * (sh + gap), mid = top + sh / 2;
    let vals = P.map((_, i) => st.get(i)); if (st.ground) vals = vals.concat(P.map((_, i) => st.ground(i)));
    if (ca && st.beacon != null) vals.push(st.beacon + b.r, st.beacon - b.r);
    let lo, hi; if (st.ground) { const a = Math.min(...vals), z = Math.max(...vals), sp = Math.max(40, z - a); lo = a - 0.3 * sp; hi = z + 0.1 * sp; } else { const m = Math.max(60, ...vals.map(Math.abs)) * 1.1; lo = -m; hi = m; }
    const Yv = (v) => top + sh - ((v - lo) / (hi - lo)) * sh;
    octx.fillStyle = 'rgba(7,8,12,0.6)'; octx.fillRect(x0, top, wd, sh);
    octx.fillStyle = '#9a958c'; octx.textAlign = 'left'; octx.fillText(st.name, x0 + 4, top + 11); if (st.lo) octx.fillText(st.lo, x0 + 4, top + sh - 4);
    if (!st.ground) { octx.strokeStyle = 'rgba(255,255,255,0.18)'; octx.lineWidth = 1; octx.beginPath(); octx.moveTo(X(0), mid); octx.lineTo(X(T), mid); octx.stroke(); }
    else { octx.fillStyle = 'rgba(96,150,84,0.8)'; octx.beginPath(); octx.moveTo(X(0), top + sh); P.forEach((p, i) => octx.lineTo(X(p.t), Math.min(top + sh, Yv(st.ground(i))))); octx.lineTo(X(P[P.length - 1].t), top + sh); octx.closePath(); octx.fill(); }
    if (ca && st.beacon != null) { const bx = X(ca.t), by = Yv(st.beacon), br = Math.max(2, (b.r / (hi - lo)) * sh); octx.strokeStyle = ca.through ? '#7dffa0' : '#ffd27a'; octx.lineWidth = 1.5; octx.beginPath(); octx.moveTo(bx, Math.max(top, by - br)); octx.lineTo(bx, Math.min(top + sh, by + br)); octx.stroke(); octx.beginPath(); octx.moveTo(bx - 3, Math.max(top, by - br)); octx.lineTo(bx + 3, Math.max(top, by - br)); octx.moveTo(bx - 3, Math.min(top + sh, by + br)); octx.lineTo(bx + 3, Math.min(top + sh, by + br)); octx.stroke(); }
    octx.strokeStyle = st.col; octx.lineWidth = 1.8; octx.beginPath(); P.forEach((p, i) => { const y = Math.max(top, Math.min(top + sh, Yv(st.get(i)))); if (i) octx.lineTo(X(p.t), y); else octx.moveTo(X(p.t), y); }); octx.stroke();
    if (S.pred.impact != null) { const xi = X(S.pred.impact); octx.strokeStyle = '#ff4d4d'; octx.lineWidth = 1.5; octx.beginPath(); octx.moveTo(xi, top); octx.lineTo(xi, top + sh); octx.stroke(); }
  });
  octx.fillStyle = '#9a958c'; octx.textAlign = 'center'; for (const t of [0, 5, 10]) octx.fillText(`${t}s`, X(t), y0 + 3 * (sh + gap) + 6);
  octx.restore();
}

// ------------------------------------------------------------------ the map: the 3D floor round you
function drawMap() {
  if (!S.map) { mapc.hidden = true; return; } mapc.hidden = false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = mapc.clientWidth, h = mapc.clientHeight;
  if (mapc.width !== Math.round(w * dpr)) { mapc.width = Math.round(w * dpr); mapc.height = Math.round(h * dpr); }
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0); mctx.clearRect(0, 0, w, h);
  // the ground round you as it would be laid flat from where you are (the log map at you, along your forward, right
  // and ana): 1.6 km either way, a third of the way round the planet
  const c = S.c, HALF = 1600, sc = (w * 0.42) / HALF, cy = Math.cos(S.myaw), sy = Math.sin(S.myaw), cp = Math.cos(S.mpitch), sp = Math.sin(S.mpitch);
  const pr = (d) => { const x1 = cy * d[1] + sy * d[2], z1 = -sy * d[1] + cy * d[2], y2 = cp * d[0] - sp * z1, z2 = sp * d[0] + cp * z1; return [w / 2 + x1 * sc, h / 2 - y2 * sc, z2]; };
  const inBox = (d) => Math.abs(d[0]) < HALF && Math.abs(d[1]) < HALF && Math.abs(d[2]) < HALF;
  mctx.strokeStyle = 'rgba(255,255,255,0.12)'; mctx.lineWidth = 1;
  for (const [a, b] of [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]]) { const P = [a, b].map((k) => pr([(k & 1 ? 1 : -1) * HALF, (k & 2 ? 1 : -1) * HALF, (k & 4 ? 1 : -1) * HALF])); mctx.beginPath(); mctx.moveTo(P[0][0], P[0][1]); mctx.lineTo(P[1][0], P[1][1]); mctx.stroke(); }
  for (const pk of S.wd.peaks) { if (c.X[0] * pk.P[0] + c.X[1] * pk.P[1] + c.X[2] * pk.P[2] + c.X[3] * pk.P[3] < 0.6) continue; const d = Y.local(c, pk.P); if (!inBox(d)) continue; const q = pr(d), t = Math.min(1, (pk.e - S.wd.sea - 120) / 120); mctx.fillStyle = `rgba(${200 + 55 * t},${190 + 50 * t},${180 + 60 * t},${0.35 + 0.5 * t})`; mctx.beginPath(); mctx.arc(q[0], q[1], 1 + 2 * t, 0, 7); mctx.fill(); }
  // the cities: their plan's square in its plane, and the layers across it
  for (const t of S.wd.cities) { const d = Y.local(c, t.C); if (Math.hypot(...d) > HALF * 1.6) continue; const q = pr(d); mctx.fillStyle = 'rgba(255,140,90,0.85)'; mctx.fillRect(q[0] - 4, q[1] - 4, 8, 8); mctx.fillStyle = '#ff9a6a'; mctx.font = '9px ui-monospace, Menlo, monospace'; mctx.fillText(t.kind === 'native' ? '4D city' : 'layered city', q[0] + 6, q[1] + 3); }
  const sq = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => pr([a * 1200, b * 1200, 0]));
  mctx.fillStyle = 'rgba(255,210,122,0.12)'; mctx.strokeStyle = 'rgba(255,210,122,0.5)'; mctx.beginPath(); sq.forEach((q, i) => (i ? mctx.lineTo(q[0], q[1]) : mctx.moveTo(q[0], q[1]))); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.strokeStyle = 'rgba(255,255,255,0.7)'; mctx.lineWidth = 1.5; mctx.beginPath(); let pen = false;
  for (const X of c.trail) { const d = Y.local(c, X); if (!inBox(d)) { pen = false; continue; } const q = pr(d); if (pen) mctx.lineTo(q[0], q[1]); else mctx.moveTo(q[0], q[1]); pen = true; }
  mctx.stroke();
  if (S.path && S.pred) { mctx.strokeStyle = 'rgba(255,210,122,0.9)'; mctx.setLineDash([4, 3]); mctx.beginPath(); S.pred.pts.forEach((p, i) => { const q = pr(Y.local(c, p.X)); if (i) mctx.lineTo(q[0], q[1]); else mctx.moveTo(q[0], q[1]); }); mctx.stroke(); mctx.setLineDash([]); }
  S.beacons.forEach((b, i) => { if (i < S.next) return; const d = Y.local(c, b.X); if (!inBox(d)) return; const q = pr(d); mctx.fillStyle = i === S.next ? '#ffd27a' : 'rgba(255,210,122,0.45)'; mctx.beginPath(); mctx.arc(q[0], q[1], i === S.next ? 4 : 2.5, 0, 7); mctx.fill(); });
  const o = pr([0, 0, 0]);
  for (const [v, col] of [[[500, 0, 0], '#ffd27a'], [[0, 500, 0], '#e9e4da'], [[0, 0, 500], SKY_ANA]]) { const q = pr(v); mctx.strokeStyle = col; mctx.lineWidth = 2; mctx.beginPath(); mctx.moveTo(o[0], o[1]); mctx.lineTo(q[0], q[1]); mctx.stroke(); }
  mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(o[0], o[1], 3, 0, 7); mctx.fill();
  mctx.fillStyle = '#9a958c'; mctx.font = '9px ui-monospace, Menlo, monospace'; mctx.textAlign = 'left'; mctx.fillText('the ground round you, laid flat', 6, h - 6);
}

// ------------------------------------------------------------------ the panel
function info() {
  const el = $('facts'); el.textContent = ''; const row = (k, v) => { const a = document.createElement('i'), b = document.createElement('span'); a.textContent = k; b.textContent = v; el.append(a, b); };
  const n = S.beacons.length, t = ((S.doneAt || performance.now()) - S.t0) / 1000;
  row('beacon', S.done ? `all ${n}` : `${S.next + 1} of ${n}`); row('time', `${t.toFixed(1)} s`); if (S.best) row('best', `${S.best.toFixed(1)} s`);
  row('world', `seed ${S.seed}: a 3-sphere 8.2 km round (radius ${Math.round(Y.R0)} m), ${S.wd.cities.length} cities`);
  for (const t of S.wd.cities) {
    const st = t.stats;
    if (t.kind === 'native') row('4D city', `${st.plots} plots in a ball ${st.ballR} m round its core; mean ${Math.round(st.mean)} m to the core. The same plots laid flat would need a disc ${Math.round(st.flatR)} m round: mean ${Math.round(st.flatMean)} m`);
    else row('layered city', `a studio plan, ${st.plots} buildings, mean ${Math.round(st.mean)} m to the centre in its own layer, copied 64 m apart across w`);
  }
  $('title').textContent = S.done ? 'course flown' : 'the course';
  $('cap').textContent = S.done ? `All ${n} beacons in ${t.toFixed(1)} s. New course, or just fly.` : 'Fly through the beacons. A beacon shows only as the slice of it you are in: turn ana or kata (the lever, or A and D) until it fills, then fly through.';
}
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1800); }
$('ghostB').onclick = () => { S.ghosts = !S.ghosts; $('ghostB').classList.toggle('on', S.ghosts); };
$('tintB').onclick = () => { S.tint = !S.tint; $('tintB').classList.toggle('on', S.tint); };
$('pathB').onclick = () => { S.path = !S.path; $('pathB').classList.toggle('on', S.path); };
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
      S.k = k; if (Y.fly(S.wd, S.c, k, dt)) toast('pull up!');
      if (k.throttle) $('spd').value = S.c.speed;
      if (++S.frame % 6 === 0) { S.c.trail.push(S.c.X.slice()); if (S.c.trail.length > 400) S.c.trail.shift(); }
      const b = S.beacons[S.next];
      if (b && Y.inside(S.c, b)) { S.next++; if (S.next === S.beacons.length) { S.done = true; S.doneAt = now; const t = (now - S.t0) / 1000; if (!S.best || t < S.best) S.best = t; toast(`course flown: ${t.toFixed(1)} s`); } else toast(`beacon ${S.next} ✓`); info(); }
      if (S.frame % 30 === 0) info();
    }
    if (S.path && (S.frame % 2 === 0 || !S.pred)) { S.pred = Y.predict(S.wd, S.c, S.k, { seconds: 10, dt: 0.1 }); const bb = S.beacons[S.next]; S.close = bb ? Y.closest(S.pred, bb) : null; }
    const fr = Y.render(S.wd, S.c, px, { tint: S.tint ? 1 : 0 });
    vctx.putImageData(img, 0, 0);
    // the ghosts, every other frame (each is a skyline pass of its own)
    if (S.ghosts && (S.frame % 2 === 0 || !S.ghost)) S.ghost = { ana: Y.skyline(S.wd, S.c, 150, 4).out, kata: Y.skyline(S.wd, S.c, -150, 4).out };
    overlay(fr); if (S.frame % 3 === 0) drawMap();

  }
  requestAnimationFrame(tick);
}
addEventListener('resize', () => {});
newWorld(+(location.hash.match(/seed(\d+)/)?.[1] || 1));
window.fly = { S, Y };
requestAnimationFrame(tick);
