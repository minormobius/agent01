// micro-app.js — the chunk floor a nave-dweller walks, in SECTION (elevation). x across the floor, z up — top
// of screen = inner (the nave / office side), bottom = outward (the lower rind). The two systems are not pipe
// networks: they're broad SURFACES (sheets) seen edge-on, that WEAVE over-under, bounding three phase layers
// (white-collar / the production weave / material). Because each sheet is one broad continuous surface, every
// office touches every production facility. A facility sits at every weave crossing.

import { buildMicroChunk, contact, weaveStats, WHITE_COLLAR } from './micro.js';
import { ENGINES } from './engines.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 3;
let mc = null;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let panx = 0, pany = 0, Z = 1, scale = 1, padX = 0, padY = 0;
const show = { white: true, material: true, walk: true };
const WHITE = [110, 210, 228], MAT = [232, 150, 74], WALK = [240, 200, 110];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function build() { mc = buildMicroChunk(seed); fit(); readout(); renderJobs(); }
function readout() {
  const c = contact(mc), w = weaveStats(mc);
  $('read').innerHTML = `seed <b>${seed}</b> · two broad sheets weave (<b>${w.crossings}</b> over-under crossings) · <b>${mc.facilities.length} facilities</b><br>` +
    `<span style="color:#566173">every office touches every facility (${c.pairs} pairs) · 3 layers · broad, not deep</span>`;
}
function renderJobs() { $('joblist').innerHTML = WHITE_COLLAR.map((w) => `<div class="j"><b>${w.label}</b>${w.blurb}</div>`).join(''); }

function fit() { const m = 56; scale = Math.min((CW - 2 * m) / mc.W, (CH - 2 * m) / mc.H) * Z; padX = (CW - mc.W * scale) / 2 + panx; padY = (CH - mc.H * scale) / 2 + pany; }
const sx = (x) => padX + x * scale, sy = (z) => padY + (mc.H - z) * scale;   // z UP (top of screen = inner/office)

// a broad sheet seen edge-on = a thick ribbon. Draw one interval's segment.
function seg(surf, i, col, w) { const a = surf[i], b = surf[i + 1]; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.z)); ctx.lineTo(sx(b.x), sy(b.z)); ctx.stroke(); }

function render() {
  if (!mc) return;
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  const { office, floor, portal } = mc.bands, W = mc.W, white = mc.surfaces.white, material = mc.surfaces.material;

  // three layers as background phase tints: office (cool) on top, the weave floor (industrial), portal (hazard)
  const band = (b, c) => { ctx.fillStyle = c; ctx.fillRect(sx(0), sy(b.z1), W * scale, (b.z1 - b.z0) * scale); };
  band(office, 'rgba(74,96,128,0.13)'); band(floor, 'rgba(120,92,52,0.08)'); band(portal, 'rgba(150,62,56,0.16)');
  ctx.textAlign = 'left'; ctx.font = '10px ui-monospace,monospace';
  ctx.fillStyle = 'rgba(127,151,192,.85)'; ctx.fillText('OFFICE · white-collar phase', sx(8), sy(office.z1) + 15);
  ctx.fillStyle = 'rgba(200,180,150,.7)'; ctx.fillText('THE PRODUCTION WEAVE · where the sheets meet', sx(8), sy(floor.z1) + 15);
  ctx.fillStyle = 'rgba(224,122,106,.9)'; ctx.fillText('LOWER-RIND PORTAL · material phase', sx(8), sy(portal.z1) + 15);
  ctx.fillStyle = 'rgba(135,148,166,.5)'; ctx.textAlign = 'right'; ctx.fillText('inner · nave ↑', sx(W - 8), sy(office.z1) + 15); ctx.fillText('↓ outward · lower rind', sx(W - 8), sy(portal.z0) + 26);

  // the two PHASES the sheets bound: white-collar phase fills ABOVE the white sheet (office reaching down in
  // broad lobes); material phase fills BELOW the material sheet (the rind reaching up). Where they interleave is
  // the weave. This is the broad-surface read — not pipes.
  if (show.white) { ctx.beginPath(); ctx.moveTo(sx(0), sy(office.z1)); for (const p of white) ctx.lineTo(sx(p.x), sy(p.z)); ctx.lineTo(sx(W), sy(office.z1)); ctx.closePath(); ctx.fillStyle = rgba(WHITE, 0.1); ctx.fill(); }
  if (show.material) { ctx.beginPath(); ctx.moveTo(sx(0), sy(portal.z0)); for (const p of material) ctx.lineTo(sx(p.x), sy(p.z)); ctx.lineTo(sx(W), sy(portal.z0)); ctx.closePath(); ctx.fillStyle = rgba(MAT, 0.1); ctx.fill(); }

  // the WEAVE, over-under: draw the lower sheet's segment first, then the higher one on top → at each crossing
  // the sheet that's "over" occludes the one that's "under". Thick strokes = broad surfaces seen edge-on.
  const T = Math.max(4, 9 * scale), TH = Math.max(2, 4 * scale);
  for (let i = 0; i < white.length - 1; i++) {
    const wHi = (white[i].z + white[i + 1].z) >= (material[i].z + material[i + 1].z);
    const lo = wHi ? ['material', material, MAT] : ['white', white, WHITE], hi = wHi ? ['white', white, WHITE] : ['material', material, MAT];
    if (show[lo[0]]) { seg(lo[1], i, rgba(lo[2], 0.5), T); seg(lo[1], i, rgba(lo[2], 0.9), TH); }
    if (show[hi[0]]) { seg(hi[1], i, '#06070c', T + 2.5); seg(hi[1], i, rgba(hi[2], 0.62), T); seg(hi[1], i, rgba(hi[2], 1), TH); }   // dark halo = the over sheet lifting above the under one
  }

  // a production facility at every weave crossing — touched by BOTH sheets
  for (const f of mc.facilities) { const col = ENGINES[f.engine] ? hex(ENGINES[f.engine].color) : [180, 160, 120], r = 8 * scale;
    ctx.fillStyle = rgba(col, 0.95); ctx.beginPath(); ctx.arc(sx(f.x), sy(f.z), r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(235,235,245,.6)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(sx(f.x), sy(f.z), r + 2.5 * scale, 0, 7); ctx.stroke();
    if (ENGINES[f.engine] && r > 6) { ctx.fillStyle = 'rgba(8,8,10,.9)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.max(8, r)}px ui-monospace,monospace`; ctx.fillText(ENGINES[f.engine].glyph || '•', sx(f.x), sy(f.z)); ctx.textBaseline = 'alphabetic'; }
  }

  // barriers: a gate line across the section with a gap
  for (const b of mc.barriers) { const gy = sy(b.z), gx = sx(W * 0.5), gw = 30 * scale;
    ctx.strokeStyle = 'rgba(150,170,200,.55)'; ctx.lineWidth = 2; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(sx(0), gy); ctx.lineTo(gx - gw, gy); ctx.moveTo(gx + gw, gy); ctx.lineTo(sx(W), gy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(150,170,200,.65)'; ctx.textAlign = 'center'; ctx.font = '9px ui-monospace,monospace'; ctx.fillText('▮ ' + b.name + ' ▮', gx, gy - 6);
  }

  // offices on the white-collar sheet (each a job). One broad sheet → every office reaches every facility.
  for (const o of mc.offices) { const x = sx(o.x), y = sy(o.z);
    ctx.fillStyle = 'rgba(150,200,220,.95)'; ctx.fillRect(x - 5 * scale, y - 5 * scale, 10 * scale, 10 * scale);
    ctx.fillStyle = 'rgba(190,220,235,.9)'; ctx.textAlign = 'center'; ctx.font = '8.5px ui-monospace,monospace'; ctx.fillText(o.label, x, y - 11 * scale);
  }

  // the gated walk: nave → office → barrier 1 → the weave floor → barrier 2 → lower-rind portal
  if (show.walk) {
    ctx.strokeStyle = rgba(WALK, 0.9); ctx.lineWidth = 2.4; ctx.setLineDash([6, 5]); ctx.lineCap = 'round';
    ctx.beginPath(); mc.walk.forEach((w, i) => { const x = sx(w.x), y = sy(w.z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
    for (const w of mc.walk) { const x = sx(w.x), y = sy(w.z); ctx.fillStyle = rgba(WALK, 0.95); ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(240,200,110,.9)'; ctx.textAlign = 'left'; ctx.font = '9px ui-monospace,monospace'; ctx.fillText(' ' + w.label, x + 4, y + 3); }
  }
}

// ── interaction ──
const LAYERS = ['white', 'material', 'walk'];
function toggle(l) { show[l] = !show[l]; sync(); }
function sync() { for (const l of LAYERS) { const el = $('chip-' + l); if (el) el.style.opacity = show[l] ? '1' : '0.32'; } render(); }
for (const l of LAYERS) { const el = $('chip-' + l); if (el) el.addEventListener('click', () => toggle(l)); }
addEventListener('keydown', (e) => { const d = '123'.indexOf(e.key); if (d >= 0) toggle(LAYERS[d]); });
let drag = false, lx = 0, ly = 0;
cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; panx += e.clientX - lx; pany += e.clientY - ly; lx = e.clientX; ly = e.clientY; fit(); render(); });
cv.addEventListener('pointerup', (e) => { drag = false; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); Z = Math.max(0.5, Math.min(4, Z * (e.deltaY < 0 ? 1.1 : 0.9))); fit(); render(); }, { passive: false });
$('reseed').addEventListener('click', () => { seed = (seed + 1) >>> 0; build(); render(); });
$('reset').addEventListener('click', () => { panx = pany = 0; Z = 1; fit(); render(); });

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); fit(); render(); }
addEventListener('resize', resize);
build(); resize(); sync();
