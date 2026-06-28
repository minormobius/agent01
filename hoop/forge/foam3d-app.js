// foam3d-app.js — the volumetric foamview: a rotatable 3D chamber foam with two physarum species (material +
// pedestrian) drawn as disjoint networks that visibly weave past each other without ever sharing a chamber.
// Orthographic turntable camera, painter's-sorted. Canvas (no WebGPU needed — the factory foam is small).

import { buildFoam3D, twoSpecies } from './foam3d.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 7;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let foam = null, sp = null, cx = 0, cy = 0, cz = 0;
let yaw = 0.6, pitch = -0.5, Z = 1, pan = { x: 0, y: 0 }, clock = 0;
const MAT = '#f4bf62', PED = '#5fd0e0';

function build() {
  foam = buildFoam3D(seed);
  sp = twoSpecies(foam, { pedMode: $('pedmode').value, reach: 2 });
  const N = foam.nuclei; cx = cy = cz = 0; for (const p of N) { cx += p.x; cy += p.y; cz += p.z; } cx /= N.length; cy /= N.length; cz /= N.length;
  // fit zoom to the volume
  let rmax = 1; for (const p of N) rmax = Math.max(rmax, Math.hypot(p.x - cx, p.y - cy, p.z - cz));
  Z = Math.min(CW, CH) * 0.42 / rmax; pan = { x: 0, y: 0 };
  const st = sp.stats;
  const cov = st.pedestrian.coverage != null ? ` · <b style="color:#5fd0e0">coverage ${(st.pedestrian.coverage * 100 | 0)}%</b>` : '';
  $('verdict').innerHTML = `<b>feasible in 3D: ${st.feasibleIn3D ? 'YES' : 'no'}</b><br>` +
    `<span style="color:#8794a6"><b style="color:#f4bf62">bots · physarum</b> reach ${st.material.reached}/${st.facilities} · <b style="color:#5fd0e0">peds · ${st.pedestrian.method}</b> reach ${st.pedestrian.reached}/${st.facilities}${cov}<br>disjoint <b>${st.disjoint ? '✓' : '✗'}</b> · ${foam.n} chambers · ${st.material.cells}+${st.pedestrian.cells} in the two nets · interface ${(st.interfaceFrac * 100 | 0)}%</span>`;
  const u = new URL(location); u.searchParams.set('seed', seed); history.replaceState(null, '', u);
}

// rotate + orthographic project a world point → { x, y (screen), d (depth) }
function proj(p) {
  const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
  const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
  const xa = dx * cyaw - dy * syaw, ya = dx * syaw + dy * cyaw, za = dz;
  const cp = Math.cos(pitch), spp = Math.sin(pitch);
  const yb = ya * cp - za * spp, zb = ya * spp + za * cp;
  return { x: CW / 2 + xa * Z + pan.x, y: CH / 2 - zb * Z * 0.92 + pan.y, d: yb };
}

function render() {
  if (!foam) return;
  ctx.clearRect(0, 0, CW, CH);
  const P = foam.nuclei.map(proj);
  const showCells = $('t-cells').checked, showFoam = $('t-foam').checked;
  const isMat = sp.isMat, isPed = sp.isPed, facSet = new Set(foam.fac);

  // collect drawables with depth, painter-sort (far first)
  const items = [];
  if (showFoam) for (const e of foam.edges) { if (isMat[e.a] && isMat[e.b]) continue; if (isPed[e.a] && isPed[e.b]) continue; items.push({ t: 'fe', a: e.a, b: e.b, d: (P[e.a].d + P[e.b].d) / 2 }); }
  // species network edges (same-species adjacency)
  for (const e of foam.edges) {
    if (isMat[e.a] && isMat[e.b]) items.push({ t: 'me', a: e.a, b: e.b, d: (P[e.a].d + P[e.b].d) / 2 });
    else if (isPed[e.a] && isPed[e.b]) items.push({ t: 'pe', a: e.a, b: e.b, d: (P[e.a].d + P[e.b].d) / 2 });
  }
  if (showCells) for (let i = 0; i < foam.n; i++) items.push({ t: 'c', i, d: P[i].d });
  for (let i = 0; i < foam.n; i++) if (isMat[i] || isPed[i] || facSet.has(i)) items.push({ t: 'n', i, d: P[i].d + 0.1 });
  items.sort((a, b) => a.d - b.d);

  for (const it of items) {
    if (it.t === 'fe') { const a = P[it.a], b = P[it.b]; ctx.strokeStyle = 'rgba(120,135,160,.07)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    else if (it.t === 'me' || it.t === 'pe') { const a = P[it.a], b = P[it.b], col = it.t === 'me' ? MAT : PED; ctx.strokeStyle = col; ctx.lineWidth = it.t === 'me' ? 2.4 : 2; ctx.globalAlpha = 0.92; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (it.t === 'c') { const p = P[it.i], r = Math.max(1, foam.nuclei[it.i].r * Z * 0.5); const owned = isMat[it.i] || isPed[it.i]; ctx.fillStyle = owned ? 'rgba(0,0,0,0)' : 'rgba(150,168,196,.06)'; if (!owned) { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); } }
    else if (it.t === 'n') { const p = P[it.i], fac = facSet.has(it.i); const col = isMat[it.i] ? MAT : isPed[it.i] ? PED : '#9aa6b8';
      if (fac) { ctx.fillStyle = '#fff'; ctx.strokeStyle = isMat[it.i] ? MAT : PED; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, 7); ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, 7); ctx.fill(); } }
  }

  // a few couriers gliding each network (spiderbots / technicians)
  drawCouriers(P, foam.edges.filter((e) => isMat[e.a] && isMat[e.b]), MAT, 'rect');
  drawCouriers(P, foam.edges.filter((e) => isPed[e.a] && isPed[e.b]), PED, 'dot');
}
function drawCouriers(P, netEdges, col, shape) {
  if (!netEdges.length) return;
  const M = Math.min(10, netEdges.length);
  for (let k = 0; k < M; k++) {
    const e = netEdges[(k * 7919) % netEdges.length], ph = (clock * 0.35 + k * 0.27) % 1;
    const a = P[e.a], b = P[e.b], x = a.x + (b.x - a.x) * ph, y = a.y + (b.y - a.y) * ph;
    ctx.fillStyle = col; if (shape === 'rect') ctx.fillRect(x - 2, y - 2, 4, 4); else { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill(); }
  }
}

// ── controls ──
$('t-cells').addEventListener('change', render);
$('t-foam').addEventListener('change', render);
$('pedmode').addEventListener('change', build);
$('roll').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; build(); });
$('reset').addEventListener('click', () => { yaw = 0.6; pitch = -0.5; pan = { x: 0, y: 0 }; build(); });
let drag = false, lx = 0, ly = 0;
cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; yaw += (e.clientX - lx) * 0.01; pitch = Math.max(-1.4, Math.min(0.2, pitch + (e.clientY - ly) * 0.008)); lx = e.clientX; ly = e.clientY; });
cv.addEventListener('pointerup', (e) => { drag = false; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); Z = Math.max(0.2, Z * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });

let _last = 0;
function frame(ts) { const dt = _last ? Math.min(0.05, (ts - _last) / 1000) : 0; _last = ts; clock += dt; if ($('t-spin').checked && !drag) yaw += dt * 0.25; render(); requestAnimationFrame(frame); }
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); if (foam) { let rmax = 1; for (const p of foam.nuclei) rmax = Math.max(rmax, Math.hypot(p.x - cx, p.y - cy, p.z - cz)); Z = Math.min(CW, CH) * 0.42 / rmax; } }
addEventListener('resize', resize);
resize(); build(); requestAnimationFrame(frame);
