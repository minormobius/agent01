// 3d-app.js — the OPS WEAVE in 3D, two ways to read it:
//   ORBIT — the global woven hyperboloid: the volumetric foam + the 6 white / 8 production helices counter-
//           rotating in the rind shell, white hub at the top pole, production hub at the bottom. The tangle.
//   INHABIT THREAD — the mapping tech: pick a white thread and the shell UNROLLS around it. Your thread becomes
//           a straight vertical spine; the other white threads are parallel verticals; the production threads
//           SLANT across and cross your spine at 8 stations (the engines you meet, top→bottom). Switch threads
//           and the whole map re-organises around the new one — the puzzle box.

import { buildFoam3D } from './foam3d.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 1;
let sel = Q.has('w') ? (Q.get('w') | 0) % 6 : 0;
let view = Q.get('view') === 'thread' ? 'thread' : 'orbit';
let spin = true, yaw = 0.3, pitch = 1.0, zoom = 1, travel = 0;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0, now = 0;
let m = buildFoam3D(seed);

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244], BG = [6, 7, 12];
const WARPCOLS = ['#8fd0e6', '#9aa6e0', '#79c6b4', '#b79ad8', '#7fb6cf', '#a7c1e0'].map(hex);
const SELC = [255, 224, 122], HUBW = [210, 226, 240], HUBP = [236, 210, 150];
const warpCol = (w) => (w === sel ? SELC : WARPCOLS[w % WARPCOLS.length]);
const ownerColor = (o) => o.kind === 'warp' ? warpCol(o.idx) : o.kind === 'weft' ? hex(m.wefts[o.idx].color) : o.kind === 'whub' ? HUBW : HUBP;

// thread spines, sorted along the axis (for drawing tubes)
let spines = null;
function precompute() { spines = { white: m.whiteThreads.map((t) => ({ ...t, pts: t.cells.map((i) => m.nuclei[i]).sort((a, b) => a.zc - b.zc) })), prod: m.prodThreads.map((t) => ({ ...t, pts: t.cells.map((i) => m.nuclei[i]).sort((a, b) => a.zc - b.zc) })) }; }
precompute();

// ── ORBIT projection ──
function proj(x, y, z, s) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw); let x1 = x * cy - y * sy, y1 = x * sy + y * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch); let y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
  return { X: CW / 2 + x1 * s, Y: CH / 2 - z2 * s, depth: y2 };
}
function drawOrbit() {
  const s = Math.min(CW, CH) / (m.R * 2.7) * zoom;
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  // chambers back→front (the pancake foam, two layers)
  const pts = m.nuclei.map((n) => { const p = proj(n.x, n.y, n.z, s); return { n, p }; }).sort((a, b) => a.p.depth - b.p.depth);
  for (const { n, p } of pts) {
    const col = ownerColor(n.owner), sh = 0.55 + 0.45 * (p.depth / m.R + 1) / 2;   // far = dimmer
    const selR = (n.owner.kind === 'warp' && n.owner.idx === sel);
    ctx.fillStyle = rgba(mix(col, BG, n.over ? 0.12 : 0.46), (selR ? 0.97 : 0.78) * sh);
    ctx.beginPath(); ctx.arc(p.X, p.Y, (selR ? 4 : n.over ? 3 : 2.2) * Math.max(0.6, sh), 0, 7); ctx.fill();
  }
  // thread spines as ANALYTIC SPIRALS in the disc plane (band-centre, mid-layer) — counter-rotating
  const spiral = (thFn, idx, col, lw, a) => {
    ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath();
    const SAMP = 96; for (let k = 0; k <= SAMP; k++) { const rf = k / SAMP, th = thFn(idx, rf), rad = rf * m.R, p = proj(rad * Math.cos(th), rad * Math.sin(th), 0, s); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }
    ctx.stroke();
  };
  for (const t of m.wefts) spiral(m.thP, t.f, hex(t.color), 2.4, 0.5);
  for (const t of m.warps) if (t.w !== sel) spiral(m.thW, t.w, WARPCOLS[t.w % 6], 2.2, 0.4);
  spiral(m.thW, sel, SELC, 4.5, 0.98);
  // the 8 stations on the selected arm (where each production spiral crosses it)
  for (const st of m.tours[sel].stops) { const th = m.thW(sel, st.rf), rad = st.rf * m.R, p = proj(rad * Math.cos(th), rad * Math.sin(th), 0, s); ctx.fillStyle = rgba(SELC, 0.95); ctx.beginPath(); ctx.arc(p.X, p.Y, 4.5, 0, 7); ctx.fill(); }
  // the two centre hubs — white ABOVE production (six starts above eight), disconnected
  const hub = (z, col, label, dy) => { const p = proj(0, 0, z, s); ctx.fillStyle = rgba(col, 0.97); ctx.beginPath(); ctx.arc(p.X, p.Y, 9, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(INK, 0.5); ctx.lineWidth = 1.4; ctx.stroke(); ctx.fillStyle = rgba(col, 0.95); ctx.textAlign = 'center'; ctx.font = '11px ui-sans-serif'; ctx.fillText(label, p.X, p.Y + dy); };
  hub(m.T / 2, HUBW, '△ white hub (6, upper)', -14); hub(-m.T / 2, HUBP, '▽ production hub (8, lower)', 20);
}

// ── INHABIT THREAD: unroll the disc around white arm `sel` (centre/hub at top → rim at bottom) ──
function drawThread() {
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  const topY = 58, botY = CH - 34, Hh = botY - topY, spineX = CW * 0.40, latScale = (CW * 0.42) / Math.PI * zoom;
  const sY = (rf) => topY + rf * Hh;                              // rf=0 (centre/hub) at top, rf=1 (rim) at bottom
  const X = (lat) => spineX + lat * latScale;

  // foam texture: every chamber, placed by (lateral offset from your arm, radius), coloured by owner
  for (const n of m.nuclei) {
    if (n.hub) continue;
    const lat = m.swrap(n.th - m.thW(sel, n.rf)), x = X(lat) + (n.over ? 4 : -4), y = sY(n.rf);
    if (x < -20 || x > CW + 20) continue;
    const col = ownerColor(n.owner), selR = (n.owner.kind === 'warp' && n.owner.idx === sel);
    ctx.fillStyle = rgba(mix(col, BG, n.over ? 0.2 : 0.5), selR ? 0.95 : 0.66);
    ctx.beginPath(); ctx.arc(x, y, selR ? 3.4 : n.over ? 2.6 : 1.9, 0, 7); ctx.fill();
  }
  // production arms SLANT across (counter-twist) — polyline, split on wrap
  const SAMP = 60;
  for (const t of m.prodThreads) { const col = hex(t.color); ctx.strokeStyle = rgba(col, 0.72); ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); let px = null; for (let k = 0; k <= SAMP; k++) { const rf = k / SAMP, lat = m.swrap(m.thP(t.f, rf) - m.thW(sel, rf)), x = X(lat), y = sY(rf); if (px !== null && Math.abs(x - px) > CW * 0.5) { ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y); } else if (px === null) ctx.moveTo(x, y); else ctx.lineTo(x, y); px = x; } ctx.stroke();
  }
  // other white arms = parallel verticals (same twist → fixed lateral offset)
  for (const t of m.whiteThreads) { if (t.w === sel) continue; const x = X(m.swrap((t.w - sel) * 2 * Math.PI / 6)); ctx.strokeStyle = rgba(WARPCOLS[t.w % 6], 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, sY(0)); ctx.lineTo(x, sY(1)); ctx.stroke(); }
  // YOUR arm = the bright vertical spine
  ctx.strokeStyle = rgba(SELC, 0.97); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(spineX, sY(0)); ctx.lineTo(spineX, sY(1)); ctx.stroke();

  // the 8 stations: where each production arm crosses your spine (centre → rim)
  m.tours[sel].stops.forEach((st, n2) => { const y = sY(st.rf);
    ctx.fillStyle = rgba(SELC, 1); ctx.beginPath(); ctx.arc(spineX, y, 10, 0, 7); ctx.fill(); ctx.strokeStyle = rgba([245, 248, 255], 0.95); ctx.lineWidth = 1.8; ctx.stroke();
    ctx.fillStyle = '#1a1406'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 10px ui-monospace'; ctx.fillText(String(n2 + 1), spineX, y); ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgba(hex(m.wefts[st.f].color), 0.95); ctx.textAlign = 'left'; ctx.font = '11px ui-monospace'; ctx.fillText(`${m.wefts[st.f].glyph} ${st.label}  ${st.over ? '△ over' : '▽ under'}`, spineX + 16, y + 4);
  });
  // the centre hub (you enter here, top), the rim (bottom), the traveller
  ctx.fillStyle = rgba(HUBW, 0.97); ctx.beginPath(); ctx.arc(spineX, sY(0), 9, 0, 7); ctx.fill(); ctx.fillStyle = rgba(INK, 0.9); ctx.textAlign = 'center'; ctx.font = '11px ui-sans-serif'; ctx.fillText('△ white hub — centre, you enter here', spineX, sY(0) - 13);
  ctx.fillStyle = rgba(HUBP, 0.85); ctx.textAlign = 'center'; ctx.font = '10px ui-monospace'; ctx.fillText('(production hub is the same centre, lower layer — only reached by crossing the weave)', spineX, sY(0) + 30);
  ctx.fillStyle = rgba(INK, 0.6); ctx.fillText('▽ rim', spineX, sY(1) + 18);
  const ty = sY(travel); ctx.fillStyle = rgba([245, 248, 255], 1); ctx.beginPath(); ctx.arc(spineX, ty, 5.5, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(BG, 0.7); ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = rgba(INK, 0.7); ctx.textAlign = 'right'; ctx.font = '10px ui-monospace'; ctx.fillText('lateral ← unrolled ring →', CW - 12, topY - 8);
}

function frame(ts) {
  const dt = (ts - now) || 16; now = ts;
  if (view === 'orbit' && spin) yaw += dt * 0.00018;
  if (view === 'thread') { travel += dt * 0.00010; if (travel > 1) travel = 0; }   // ride the arm centre→rim
  (view === 'orbit' ? drawOrbit : drawThread)();
  requestAnimationFrame(frame);
}

function panels() {
  $('read').innerHTML =
    `<b>${view === 'orbit' ? 'orbit — the woven pancake' : 'inhabit thread — the map from your arm'}</b> · ` +
    `3D pancake foam ${m.nuclei.length} chambers, two layers · <span class="ok">${m.contactPairs}/48 (K(6,8))</span> · counter-rotating spirals (seed ${seed}: ${m.family.turnsW.toFixed(2)}/${m.family.turnsP.toFixed(2)} turns)<br>` +
    `<span>${view === 'orbit' ? 'drag to orbit, scroll to zoom. A wide thin disc: 6 white arms spiral from the upper-centre hub, 8 production from the lower-centre hub — the six starts sit above the eight. Click ⟳ to stop the spin; “inhabit thread” to enter one.' : 'your arm is the bright spine (centre/hub at top → rim at bottom); production arms slant across and cross it at the 8 numbered stations. The other white arms are parallel verticals. Pick another surface — the whole map re-organises around it.'}</span>`;
  $('wsel').innerHTML = m.warps.map((w) => `<div class="w ${w.w === sel ? 'sel' : ''}" data-w="${w.w}"><div class="k">${w.w + 1}</div><div class="lab">${w.label}</div></div>`).join('');
  for (const el of $('wsel').querySelectorAll('.w')) el.addEventListener('click', () => { sel = +el.dataset.w; sync(); });
  const t = m.tours[sel];
  $('itin').innerHTML = t.stops.map((st, n) => `<div class="stop"><span class="n">${n + 1}.</span><span class="g">${st.glyph}</span><span>${st.label}</span><span class="ou">${st.over ? '△ over' : '▽ under'}</span></div>`).join('');
  $('elist').innerHTML = m.wefts.map((e) => `<div class="e"><span class="sw" style="background:${e.color}"></span><span><span class="nm">${e.glyph} ${e.label}</span> — <span class="nt">${e.note}</span></span></div>`).join('');
  $('note').innerHTML = `Inhabiting <b>${m.warps[sel].label}</b>: you enter at the white hub (top) and ride your thread down. It weaves over/under the shell, meeting all 8 production lines once each. The production hub (bottom) is reachable only by crossing onto a production thread mid-weave — the two hubs never touch directly.`;
}

function sync() {
  $('orbit').classList.toggle('on', view === 'orbit'); $('thread').classList.toggle('on', view === 'thread'); $('spin').classList.toggle('on', spin);
  const u = new URLSearchParams(); if (seed !== 1) u.set('seed', seed); u.set('w', sel); u.set('view', view); history.replaceState(null, '', '?' + u.toString());
  panels();
}

$('orbit').addEventListener('click', () => { view = 'orbit'; sync(); });
$('thread').addEventListener('click', () => { view = 'thread'; sync(); });
$('spin').addEventListener('click', () => { spin = !spin; sync(); });
$('reseed').addEventListener('click', () => { seed = (seed + 1) >>> 0; m = buildFoam3D(seed); precompute(); sync(); });
$('reset').addEventListener('click', () => { yaw = 0.6; pitch = 0.5; zoom = 1; travel = 1; });
addEventListener('keydown', (e) => { const k = '123456'.indexOf(e.key); if (k >= 0) { sel = k; sync(); } if (e.key === 'v') { view = view === 'orbit' ? 'thread' : 'orbit'; sync(); } });
let drag = false, lx = 0, ly = 0;
cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; if (view === 'orbit') { yaw += dx * 0.008; pitch = Math.max(-1.4, Math.min(1.4, pitch + dy * 0.006)); } else { travel = Math.max(0, Math.min(1, travel - dy * 0.002)); } });
cv.addEventListener('pointerup', (e) => { drag = false; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.5, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
addEventListener('resize', resize);
resize(); sync(); requestAnimationFrame(frame);
