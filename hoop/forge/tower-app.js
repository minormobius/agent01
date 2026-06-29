// tower-app.js — factory formation in 3D, rotatable: the supply chain stratified into a tower (raw low,
// product high), with floor plates, the fulfillment lift axis (product up / waste down), and the nave on
// top. Toggle to the flat 2D disc to see what 3D buys (compact column vs wide disc). Canvas turntable.

import { formFactory } from './formation3d.js';
import { ENGINES } from './engines.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 7;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let F = null, yaw = 0.7, pitch = -0.42, Z = 1, pan = { x: 0, y: 0 }, clock = 0;
let kVert = 2, gap = 100, flat = false;
const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

function build() {
  F = formFactory(seed, { kVert, floorH: gap });
  const s = F.stats;
  $('read').innerHTML = `<b>${s.floors} floors · ${s.facilities} facilities</b><br>` +
    `<span class="win">footprint −${(s.footprintShrink * 100 | 0)}%</span> (R ${s.tower.footprintR} vs flat ${s.flat.footprintR}) — a column, not a disc<br>` +
    `<span class="cost">transport ×${s.costRatio.toFixed(2)}</span> — the climb (${s.tower.climb} units). On a ship, volume is the scarce thing: build up.`;
  const u = new URL(location); u.searchParams.set('seed', seed); history.replaceState(null, '', u);
}
function fit() {
  if (!F) return; let rmax = 1; const pts = (flat ? F.flat : F.facs).concat([F.nave]);
  for (const p of pts) rmax = Math.max(rmax, Math.hypot(p.x, p.y, (p.z || 0) - F.nave.z / 2));
  Z = Math.min(CW, CH) * 0.4 / rmax; pan = { x: 0, y: 0 };
}

// rotate + orthographic project (z = up)
function proj(p) {
  const z = flat ? 0 : (p.z || 0);
  const dx = p.x, dy = p.y, dz = z - (flat ? 0 : F.nave.z / 2);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), xa = dx * cy - dy * sy, ya = dx * sy + dy * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), zb = ya * sp + dz * cp;
  return { x: CW / 2 + xa * Z + pan.x, y: CH / 2 - zb * Z * 0.95 + pan.y, d: ya * cp - dz * sp };
}

function render() {
  if (!F) return;
  ctx.clearRect(0, 0, CW, CH);
  const list = flat ? F.flat : F.facs;

  // floor plates (tower only) — translucent discs at each z, back to front
  if (!flat) {
    const floors = F.byFloor.map((ring, fl) => ({ fl, z: fl * F.floorH, R: Math.max(60, 70 * Math.sqrt(ring.length)) , d: proj({ x: 0, y: 0, z: fl * F.floorH }).d }));
    floors.sort((a, b) => a.d - b.d);
    for (const fp of floors) {
      ctx.strokeStyle = 'rgba(140,160,190,.22)'; ctx.fillStyle = 'rgba(140,160,190,.04)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 0; k <= 40; k++) { const a = k / 40 * Math.PI * 2, p = proj({ x: Math.cos(a) * fp.R, y: Math.sin(a) * fp.R, z: fp.z }); if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  // the lift axis (product up / waste down) — tower only
  if (!flat) {
    const a = proj(F.lift.x !== undefined ? { x: 0, y: 0, z: F.lift.z0 } : { x: 0, y: 0, z: 0 }), b = proj({ x: 0, y: 0, z: F.lift.z1 });
    ctx.strokeStyle = 'rgba(203,211,224,.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const up = (clock * 0.25) % 1, dn = (clock * 0.25 + 0.5) % 1;
    const pu = proj({ x: 0, y: 0, z: F.lift.z0 + (F.lift.z1 - F.lift.z0) * up }); ctx.fillStyle = '#f4bf62'; ctx.fillRect(pu.x - 3, pu.y - 3, 6, 6);     // product rising
    const pd = proj({ x: 0, y: 0, z: F.lift.z1 - (F.lift.z1 - F.lift.z0) * dn }); ctx.fillStyle = '#8a7d6a'; ctx.fillRect(pd.x - 2, pd.y - 2, 4, 4); // waste falling
  }

  // supply edges (the chain) — drawn faint, behind nodes
  const P = list.map(proj);
  for (const e of F.supply) { const a = P[e.from], b = P[e.to]; if (!a || !b) continue; ctx.strokeStyle = 'rgba(244,191,98,.28)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

  // facilities (depth-sorted) + the nave
  const order = list.map((f, i) => ({ i, d: P[i].d })).sort((a, b) => a.d - b.d);
  for (const { i } of order) {
    const f = list[i], p = P[i], e = ENGINES[f.engine];
    ctx.fillStyle = tint(f.color, 0.9); ctx.strokeStyle = 'rgba(8,10,14,.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0a0c10'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '10px ui-monospace,monospace'; ctx.fillText(e.glyph, p.x, p.y + 0.5);
  }
  const np = proj(F.nave);
  ctx.fillStyle = 'rgba(203,211,224,.16)'; ctx.strokeStyle = 'rgba(203,211,224,.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(np.x, np.y, 13, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#cbd3e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '13px ui-monospace,monospace'; ctx.fillText('⌂', np.x, np.y);
  ctx.font = '10px ui-monospace,monospace'; ctx.fillText('the nave ↑', np.x, np.y - 20);

  // floor labels (tower) — the strata, by stage
  if (!flat) { ctx.textAlign = 'left'; ctx.font = '10px ui-monospace,monospace';
    const names = ['reclaim · raw', 'fluid', 'foundry · smelt', 'mill·chem·fab·weave · refine', 'assembly · finish'];
    for (let fl = 0; fl < F.byFloor.length; fl++) { const R = Math.max(60, 70 * Math.sqrt(F.byFloor[fl].length)); const p = proj({ x: R * 1.15, y: 0, z: fl * F.floorH }); ctx.fillStyle = 'rgba(150,168,196,.7)'; ctx.fillText(names[fl] || ('floor ' + fl), p.x + 6, p.y); } }
}

$('kvert').addEventListener('input', (e) => { kVert = +e.target.value; $('kvertv').textContent = kVert.toFixed(1); build(); });
$('gap').addEventListener('input', (e) => { gap = +e.target.value; $('gapv').textContent = gap; build(); fit(); });
$('t-flat').addEventListener('change', (e) => { flat = e.target.checked; fit(); });
$('roll').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; build(); fit(); });
$('reset').addEventListener('click', () => { yaw = 0.7; pitch = -0.42; pan = { x: 0, y: 0 }; fit(); });
let drag = false, lx = 0, ly = 0;
cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; yaw += (e.clientX - lx) * 0.01; pitch = Math.max(-1.4, Math.min(0.3, pitch + (e.clientY - ly) * 0.008)); lx = e.clientX; ly = e.clientY; });
cv.addEventListener('pointerup', (e) => { drag = false; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); Z = Math.max(0.2, Z * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });

let _last = 0;
function frame(ts) { const dt = _last ? Math.min(0.05, (ts - _last) / 1000) : 0; _last = ts; clock += dt; if ($('t-spin').checked && !drag) yaw += dt * 0.22; render(); requestAnimationFrame(frame); }
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); fit(); }
addEventListener('resize', resize);
build(); resize(); requestAnimationFrame(frame);
