// micro-app.js — the chunk floor a nave-dweller walks. Plan view, top = inner (the nave side, where the white
// collars sit), down = outward (toward the lower rind). Renders the directional gradient (office → transit →
// portal) with its two barriers, the two capillary beds (material arterial on deck 0, white-collar crew on
// deck 1 — the crew offset up/left with a soft shadow so it reads as a deck above), and the gated walk.

import { buildMicroChunk, edgesOf, lavaLamp, WHITE_COLLAR } from './micro.js';
import { ENGINES } from './engines.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 3;
let mc = null;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let panx = 0, pany = 0, Z = 1, scale = 1, padX = 0, padY = 0;
const show = { arterial: true, crew: true, walk: true };
const ART = [232, 150, 74], CREW = [110, 210, 228], WALK = [240, 200, 110];
const DECK1 = { dx: -9, dy: -11 };     // the crew bed floats a deck up — drawn offset with a shadow
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function build() { mc = buildMicroChunk(seed); fit(); readout(); renderJobs(); }
function readout() {
  const ll = lavaLamp(mc);
  $('read').innerHTML = `seed <b>${seed}</b> · <b>${ll.anastomoses}/${ll.total} machines</b> reached by BOTH fields (the white collar touches every machine)<br>` +
    `<span style="color:#566173">a lava lamp — material rises, oversight descends, they meet (Rayleigh–Taylor)</span>`;
}
function renderJobs() { $('joblist').innerHTML = WHITE_COLLAR.map((w) => `<div class="j"><b>${w.label}</b>${w.blurb}</div>`).join(''); }

function fit() {
  const m = 54; scale = Math.min((CW - 2 * m) / mc.W, (CH - 2 * m) / mc.H) * Z;
  padX = (CW - mc.W * scale) / 2 + panx; padY = (CH - mc.H * scale) / 2 + pany;
}
const sx = (x) => padX + x * scale, sy = (y) => padY + y * scale;

// draw a space-colonization bed as a tapered tree (thick trunk near the root → thin capillaries), cull-light
function drawBed(bed, col, off) {
  const depth = new Int32Array(bed.nodes.length);
  for (let i = 0; i < bed.nodes.length; i++) depth[i] = bed.nodes[i].parent < 0 ? 0 : depth[bed.nodes[i].parent] + 1;
  ctx.lineCap = 'round';
  for (let i = 0; i < bed.nodes.length; i++) { const n = bed.nodes[i]; if (n.parent < 0) continue; const p = bed.nodes[n.parent];
    const w = Math.max(0.7, (5.4 - depth[i] * 0.42)) * scale * 0.5;
    ctx.strokeStyle = rgba(col, 0.34 + Math.max(0, 0.4 - depth[i] * 0.03));
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx(p.x) + off.dx, sy(p.y) + off.dy); ctx.lineTo(sx(n.x) + off.dx, sy(n.y) + off.dy); ctx.stroke();
  }
}

function render() {
  if (!mc) return;
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  const { office, transit, portal } = mc.bands, W = mc.W;

  // band fills (the gradient): office cool/clean → transit industrial → portal hazard
  const bandFill = (b, c) => { ctx.fillStyle = c; ctx.fillRect(sx(0), sy(b.y0), W * scale, (b.y1 - b.y0) * scale); };
  bandFill(office, 'rgba(74,96,128,0.12)'); bandFill(transit, 'rgba(120,92,52,0.11)'); bandFill(portal, 'rgba(150,62,56,0.16)');
  // band labels (left margin, rotated-feel via small caps)
  ctx.textAlign = 'left'; ctx.font = '10px ui-monospace,monospace';
  ctx.fillStyle = 'rgba(127,151,192,.8)'; ctx.fillText('OFFICE · white collar', sx(8), sy(office.y0) + 16);
  ctx.fillStyle = 'rgba(232,150,74,.85)'; ctx.fillText('PRODUCTION FLOOR · material transit · where they meet', sx(8), sy(transit.y0) + 16);
  { const mid = (transit.y0 + transit.y1) / 2; ctx.strokeStyle = 'rgba(180,170,150,.12)'; ctx.lineWidth = 1; ctx.setLineDash([1, 6]); ctx.beginPath(); ctx.moveTo(sx(0), sy(mid)); ctx.lineTo(sx(W), sy(mid)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(180,170,150,.4)'; ctx.textAlign = 'right'; ctx.font = '8.5px ui-monospace,monospace'; ctx.fillText('↑ material rises · oversight descends ↓', sx(W - 8), sy(mid) - 4); }
  ctx.fillStyle = 'rgba(224,122,106,.9)'; ctx.fillText('LOWER-RIND PORTAL', sx(8), sy(portal.y0) + 16);
  ctx.fillStyle = 'rgba(135,148,166,.55)'; ctx.fillText('inner · nave ↑', sx(W - 92), sy(4) + 12); ctx.fillText('↓ outward · lower rind', sx(W - 128), sy(mc.H) - 8);

  // barriers: a wall across the floor with a GATE gap (the checkpoint)
  for (const b of mc.barriers) {
    const gy = sy(b.y), gx = sx(b.gate), gw = 34 * scale;
    ctx.strokeStyle = 'rgba(150,170,200,.6)'; ctx.lineWidth = 2.4; ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(sx(0), gy); ctx.lineTo(gx - gw, gy); ctx.moveTo(gx + gw, gy); ctx.lineTo(sx(W), gy); ctx.stroke(); ctx.setLineDash([]);
    // gate posts
    ctx.strokeStyle = 'rgba(240,200,110,.8)'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(gx - gw, gy - 5); ctx.lineTo(gx - gw, gy + 5); ctx.moveTo(gx + gw, gy - 5); ctx.lineTo(gx + gw, gy + 5); ctx.stroke();
    ctx.fillStyle = 'rgba(150,170,200,.7)'; ctx.textAlign = 'center'; ctx.font = '9px ui-monospace,monospace'; ctx.fillText('▮ ' + b.name + ' ▮', gx, gy - 9);
  }

  // chambers (foam rooms) — colored by engine
  for (const c of mc.chambers) { const col = ENGINES[c.engine] ? hex(ENGINES[c.engine].color) : [180, 160, 120];
    const r = 7 * scale; ctx.fillStyle = rgba(col, 0.9); ctx.beginPath(); ctx.arc(sx(c.x), sy(c.y), r, 0, 7); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx(c.x), sy(c.y), r + 3 * scale, 0, 7); ctx.stroke();
    if (ENGINES[c.engine] && r > 5) { ctx.fillStyle = 'rgba(8,8,10,.85)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.max(7, r)}px ui-monospace,monospace`; ctx.fillText(ENGINES[c.engine].glyph || '•', sx(c.x), sy(c.y)); ctx.textBaseline = 'alphabetic'; }
  }

  // the two capillary beds. crew (deck 1) first, offset + shadowed → reads as a mezzanine above the floor.
  if (show.crew) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 6 * scale; drawBed(mc.crew, CREW, DECK1); ctx.restore();
    // the per-chamber drop connecting the decks (the exchange)
    ctx.strokeStyle = rgba(CREW, 0.3); ctx.lineWidth = 1; for (const c of mc.chambers) { ctx.beginPath(); ctx.moveTo(sx(c.x), sy(c.y)); ctx.lineTo(sx(c.x) + DECK1.dx, sy(c.y) + DECK1.dy); ctx.stroke(); }
  }
  if (show.arterial) { drawBed(mc.arterial, ART, { dx: 0, dy: 0 });
    // the arterial root RISES from below (the lower rind) + drain (waste back down)
    ctx.fillStyle = rgba(ART, 0.95); ctx.beginPath(); ctx.arc(sx(mc.artRoot.x), sy(mc.artRoot.y), 5 * scale, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(224,122,106,.95)'; ctx.beginPath(); ctx.arc(sx(mc.drain.x), sy(mc.drain.y), 5 * scale, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(232,150,74,.85)'; ctx.textAlign = 'center'; ctx.font = '9px ui-monospace,monospace'; ctx.fillText('supply ▲ rises from the lower rind', sx(mc.artRoot.x), sy(mc.artRoot.y) + 16);
    ctx.fillStyle = 'rgba(224,122,106,.8)'; ctx.fillText('waste ▾', sx(mc.drain.x), sy(mc.drain.y) + 28);
  }
  if (show.crew) { ctx.fillStyle = rgba(CREW, 0.95); ctx.beginPath(); ctx.arc(sx(mc.crewRoot.x) + DECK1.dx, sy(mc.crewRoot.y) + DECK1.dy, 5 * scale, 0, 7); ctx.fill();
    ctx.fillStyle = rgba(CREW, 0.85); ctx.textAlign = 'center'; ctx.font = '9px ui-monospace,monospace'; ctx.fillText('oversight ▼ descends from the office', sx(mc.crewRoot.x) + DECK1.dx, sy(mc.crewRoot.y) + DECK1.dy - 9); }

  // offices (the white collar) along the office band
  for (const o of mc.offices) { const x = sx(o.x), y = sy(o.y);
    ctx.fillStyle = 'rgba(127,151,192,.9)'; ctx.fillRect(x - 5 * scale, y - 5 * scale, 10 * scale, 10 * scale);
    ctx.strokeStyle = 'rgba(127,151,192,.5)'; ctx.lineWidth = 1; ctx.strokeRect(x - 8 * scale, y - 8 * scale, 16 * scale, 16 * scale);
    ctx.fillStyle = 'rgba(180,195,220,.85)'; ctx.textAlign = 'center'; ctx.font = '8.5px ui-monospace,monospace'; ctx.fillText(o.label, x, y - 12 * scale);
  }

  // the gated walk: nave → office → barrier 1 → transit → barrier 2 → portal
  if (show.walk) {
    ctx.strokeStyle = rgba(WALK, 0.9); ctx.lineWidth = 2.4; ctx.setLineDash([6, 5]); ctx.lineCap = 'round';
    ctx.beginPath(); mc.walk.forEach((w, i) => { const x = sx(w.x), y = sy(w.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
    for (const w of mc.walk) { const x = sx(w.x), y = sy(w.y); ctx.fillStyle = rgba(WALK, 0.95); ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(240,200,110,.9)'; ctx.textAlign = 'left'; ctx.font = '9px ui-monospace,monospace'; ctx.fillText(' ' + w.label, x + 4, y + 3); }
  }
}

// ── interaction ──
const LAYERS = ['arterial', 'crew', 'walk'];
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
