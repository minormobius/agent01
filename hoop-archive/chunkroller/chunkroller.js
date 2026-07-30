// chunkroller.js — the controller: roll a chunk, render a total top-down view, civic readout, NPC stats,
// and biome sliders that bias room creation (via the engine's additive roleMix override). No build.

import { solveChunk } from '../v099/v8/chunkgen.js';
import { ROLES, DOMAINS } from '../v099/econ/econ.js';
import { TRAFFIC_FOOTPRINT, GRAND_ROLES, GRAND_MIN, MIN_ROOM } from '../v099/rooms.js';
import { TRIAD, TRIAD_ORDER } from '../v099/stats.js';
import { SLIDERS, NEUTRAL, SLIDER_MAX, BIOMES, BIOME_COLOR, BIOME_GRAND, mixFromSliders, mixShares } from './biomes.js';
import { scoreChunk, npcRoster, roomShock } from './civic.js';
import { createBuild, growSide, toggleWall, sealFrontier, frontier, bbox as buildBbox, biomeOf as wardBiome, histogram as wardHistogram, closedWallCount, setPlan } from './builder.js';
import { SAMPLE_SHAPE, shapePoly, shapeSideOf } from './shapes.js';
import { evaluateMix, solveStableSliders, themeOf } from './stability.js';

const W = 900, H = 600;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TIER_COLOR = { Thriving: '#5fd08a', Healthy: '#8fd06a', Stable: '#d8c45a', Fragile: '#e0a05a', Failing: '#e0635a' };
const domHue = {}; DOMAINS.forEach((d, i) => { domHue[d.id] = Math.round((i / DOMAINS.length) * 320); });

let seed = 7, biome = 'wild', sliders = { ...NEUTRAL }, lens = 'role', mode = 'chunk', portsMax = 1, csize = 1, useShape = false, tension = 0, v2 = false;
const ONE_OF_EACH = Object.fromEntries(Object.keys(ROLES).map((r) => [r, 1]));   // role floors: at least one of each building type
let chunk = null, civic = null, roster = null, sel = -1, view = { s: 1, ox: 0, oy: 0 };
let build = null, selChunk = -1, wallMode = false;   // the interactive bounded-floor builder + per-edge wall toggle
let planSet = new Set();   // the NEXT-TILE boundary plan: side directions to leave OPEN (gates) on the next grown ward

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;

// ── build the controls ──
$('biome').innerHTML = Object.entries(BIOMES).map(([k, b]) => `<option value="${k}">${esc(b.label)}</option>`).join('');
$('sliders').innerHTML = SLIDERS.map((s) => `<label class="row" title="${esc(s.hint)}"><span class="l">${esc(s.label)}</span><input type="range" data-sl="${s.key}" min="0" max="${SLIDER_MAX}" step="0.1" value="${sliders[s.key]}"><b data-slv="${s.key}">${sliders[s.key].toFixed(1)}</b></label>`).join('');
function syncSliders() { for (const s of SLIDERS) { const r = document.querySelector(`[data-sl="${s.key}"]`); const b = document.querySelector(`[data-slv="${s.key}"]`); if (r) r.value = sliders[s.key]; if (b) b.textContent = sliders[s.key].toFixed(1); } }

$('biome').addEventListener('change', (e) => { biome = e.target.value; sliders = { ...(BIOMES[biome].sliders) }; syncSliders(); if (mode === 'floor') { renderFloor(); floorReadout(); } else generate(); });
$('sliders').addEventListener('input', (e) => { const k = e.target.getAttribute('data-sl'); if (!k) return; sliders[k] = +e.target.value; document.querySelector(`[data-slv="${k}"]`).textContent = sliders[k].toFixed(1); biome = 'wild'; $('biome').value = matchBiome() || ''; generate(); });
$('by').addEventListener('change', (e) => { lens = e.target.value; render(); });
$('roll').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; generate(); });
$('reseed').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; generate(); });
$('t-web').addEventListener('change', () => render());
$('t-fab').addEventListener('change', () => render());
function matchBiome() { for (const [k, b] of Object.entries(BIOMES)) if (SLIDERS.every((s) => Math.abs((b.sliders[s.key] ?? 1) - sliders[s.key]) < 0.05)) return k; return null; }

// view mode (one chunk ↔ the interactive bounded-floor builder)
function setMode(m) { mode = m; $('m-chunk').classList.toggle('primary', m === 'chunk'); $('m-floor').classList.toggle('primary', m === 'floor'); $('builder-tools').style.display = m === 'floor' ? '' : 'none'; generate(); }
$('m-chunk').addEventListener('click', () => setMode('chunk'));
$('m-floor').addEventListener('click', () => setMode('floor'));
// builder toolbar
$('b-wall').addEventListener('click', () => { wallMode = !wallMode; $('b-wall').classList.toggle('primary', wallMode); cv.style.cursor = wallMode ? 'crosshair' : ''; });
function deferBtn(btn, busy, work) { const t = btn.textContent; btn.disabled = true; btn.textContent = busy; setTimeout(() => { try { work(); } finally { btn.disabled = false; btn.textContent = t; } }, 20); }
$('b-seal').addEventListener('click', () => { if (!build) return; deferBtn($('b-seal'), '⊟ sealing…', () => { sealFrontier(build); selChunk = -1; renderFloor(); floorReadout(); }); });
$('b-reset').addEventListener('click', () => { generateFloor(); });
$('b-auto').addEventListener('click', () => { if (!build) return; deferBtn($('b-auto'), '🎲 growing…', () => autoGrow()); });
$('portsMax').addEventListener('input', (e) => { portsMax = +e.target.value; $('portsMaxv').textContent = portsMax; generate(); });
$('csize').addEventListener('input', (e) => { csize = +e.target.value; $('csizev').textContent = csize.toFixed(2).replace(/0$/, '') + '×'; generate(); });
$('useShape').addEventListener('change', (e) => { useShape = e.target.checked; generate(); });
$('tension').addEventListener('input', (e) => { tension = +e.target.value; $('tensionv').textContent = tension.toFixed(1); generate(); });
// ⚡ v2 chunk — ONE toggle bundles the four: tessellation shape + 25% bigger + one-of-each + rooms-first.
$('v2').addEventListener('change', (e) => {
  v2 = e.target.checked;
  if (v2) {
    useShape = true; $('useShape').checked = true;
    csize = 1.25; $('csize').value = 1.25; $('csizev').textContent = '1.25×';
    if (tension === 0) { tension = 0.6; $('tension').value = 0.6; $('tensionv').textContent = '0.6'; }
  }
  generate();
});
$('stabilize').addEventListener('click', () => {
  const btn = $('stabilize'); btn.disabled = true; btn.textContent = '⚖ solving…';
  setTimeout(() => {
    const res = solveStableSliders(sliders, { theme: themeOf(sliders), seed });
    sliders = res.sliders; biome = 'wild'; $('biome').value = matchBiome() || ''; syncSliders();
    btn.disabled = false; btn.textContent = '⚖ solve for stability';
    generate();
  }, 20);
});

// ── generate ──
function generate() { if (mode === 'floor') generateFloor(); else generateChunk(); }
function generateChunk() {
  const roleMix = mixFromSliders(sliders);
  const grand = BIOME_GRAND[biome] || GRAND_ROLES;
  const Wc = Math.round(W * csize), Hc = Math.round(H * csize);
  const shapeOpt = useShape ? { poly: shapePoly(SAMPLE_SHAPE, Wc / 2, Hc / 2, Math.min(Wc, Hc) * 0.46), sideOf: shapeSideOf(SAMPLE_SHAPE) } : { shape: 'hex' };
  chunk = solveChunk({ ...shapeOpt, seed, W: Wc, H: Hc, roomSize: 14, footprint: TRAFFIC_FOOTPRINT, grand, grandMin: GRAND_MIN, minRoom: MIN_ROOM, roleMix, portRange: [1, portsMax], tension, v2, roleFloors: v2 ? ONE_OF_EACH : null });
  civic = scoreChunk(chunk.rooms, Wc, Hc, seed);
  roster = npcRoster(civic.society);
  sel = -1; $('dossier').classList.remove('on');
  fitView(); render(); readout();
}
function generateFloor() {
  build = createBuild(seed, { W, H, v2: true, portsMax, biome });   // the bounded floor is v2 (rooms-first + role floors)
  setPlan(build, [...planSet]);                                     // carry the next-tile boundary plan onto the new floor
  selChunk = -1; $('dossier').classList.remove('on');
  fitFloor(); renderFloor(); floorReadout(); drawPlanHex();
}

// the NEXT-TILE BOUNDARY widget: a mini hexagon whose 6 sides you toggle open (gate) / wall, establishing
// the boundary conditions the next grown ward will take. Side k spans world angle [60k°, 60(k+1)°], drawn
// y-down so the widget matches the floor's orientation.
function drawPlanHex() {
  const c = $('planhex'); if (!c) return;
  const x = c.getContext('2d'), W = c.width, H = c.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.38;
  x.clearRect(0, 0, W, H);
  const V = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; V.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
  x.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    const a = V[k], b = V[(k + 1) % 6], open = planSet.has(k);
    x.strokeStyle = open ? 'rgba(244,191,98,.9)' : '#3a4254'; x.lineWidth = open ? 3 : 6;
    if (open) x.setLineDash([4, 3]); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); x.setLineDash([]);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    x.fillStyle = open ? '#f4bf62' : '#6b7280'; x.beginPath(); x.arc(mx, my, 2.4, 0, 7); x.fill();
  }
  x.fillStyle = '#7d8597'; x.font = '9px ui-monospace,monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('next', cx, cy - 5); x.fillText('tile', cx, cy + 5);
}
$('planhex').addEventListener('click', (e) => {
  const c = $('planhex'), r = c.getBoundingClientRect();
  const px = (e.clientX - r.left) * (c.width / r.width), py = (e.clientY - r.top) * (c.height / r.height);
  let deg = Math.atan2(py - c.height / 2, px - c.width / 2) * 180 / Math.PI; if (deg < 0) deg += 360;
  const k = Math.floor(deg / 60) % 6;
  if (planSet.has(k)) planSet.delete(k); else planSet.add(k);
  if (build) setPlan(build, [...planSet]);
  drawPlanHex();
});
// auto-grow a compact hand off the current floor: repeatedly grow the open side whose neighbour would land
// nearest the floor centroid (so the floor stays a clump, not a line).
function autoGrow() {
  if (!build) return;
  const TARGET = build.world.chunks.length + 6;
  let guard = 0;
  while (build.world.chunks.length < TARGET && guard++ < 80) {
    const fe = frontier(build).filter((f) => !f.closed);
    if (!fe.length) break;
    const b = buildBbox(build), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    let best = null, bd = Infinity;
    for (const f of fe) { const T = build.T[f.sideK], nx = centroidX(f.chunkId) + T.x, ny = centroidY(f.chunkId) + T.y, d = (nx - cx) ** 2 + (ny - cy) ** 2; if (d < bd) { bd = d; best = f; } }
    if (!best) break;
    growSide(build, best.chunkId, best.sideK, randomBiome());
  }
  selChunk = -1; fitFloor(); renderFloor(); floorReadout();
}
const centroidX = (ci) => { const p = build.world.chunks[ci].poly; let x = 0; for (const v of p) x += v.x; return x / p.length; };
const centroidY = (ci) => { const p = build.world.chunks[ci].poly; let y = 0; for (const v of p) y += v.y; return y / p.length; };
function randomBiome() { const ks = Object.keys(BIOMES).filter((k) => k !== 'wild'); return ks[(Math.random() * ks.length) | 0]; }

// ── view fit (chunk poly bbox → canvas) ──
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); if (mode === 'floor') { fitFloor(); } else { fitView(); } render(); }
function fitFloor() {
  if (!build) return;
  const b = buildBbox(build), pad = 34, sw = (CW - 2 * pad) / (b.x1 - b.x0 || 1), sh = (CH - 2 * pad) / (b.y1 - b.y0 || 1), s = Math.min(sw, sh);
  view = { s, ox: (CW - (b.x1 - b.x0) * s) / 2 - b.x0 * s, oy: (CH - (b.y1 - b.y0) * s) / 2 - b.y0 * s };
}
// ── render the bounded floor: chunks painted by their ward biome + the closed walls + grow handles ──
function renderFloor() {
  if (!build) return;
  ctx.clearRect(0, 0, CW, CH);
  build.world.chunks.forEach((ch, ci) => {
    const tint = BIOME_COLOR[wardBiome(build, ci)] || '#555', dim = (selChunk < 0 || selChunk === ci) ? 1 : 0.4;
    for (let i = 0; i < ch.cells.length; i++) {
      const c = ch.cells[i], poly = c.poly; if (poly.length < 3) continue;
      ctx.globalAlpha = dim;
      ctx.fillStyle = ch.road[i] ? '#0c0f18' : (ch.roomOf[i] >= 0 ? tint : '#0a0b10');
      ctx.beginPath(); ctx.moveTo(SX(poly[0][0]), SY(poly[0][1])); for (let k = 1; k < poly.length; k++) ctx.lineTo(SX(poly[k][0]), SY(poly[k][1])); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  // FRONTIER SIDES: the boundary is CLOSED WALLS by default (a priori) — drawn as a thick slate wall along
  // the side's wiggly polyline. A manually-opened side (a port-stub to nowhere) is gold dashed. Either way a
  // grow handle sits at the side midpoint: ＋ to grow a ward off it (normal), or a toggle in wall mode.
  const sides = frontier(build); _floorHandles = sides;
  const strokeSide = (f) => { ctx.beginPath(); for (const [ax, ay, bx, by] of f.segs) { ctx.moveTo(SX(ax), SY(ay)); ctx.lineTo(SX(bx), SY(by)); } ctx.stroke(); };
  ctx.lineCap = 'round';
  for (const f of sides) {
    if (f.closed) { ctx.strokeStyle = '#3a4254'; ctx.lineWidth = 6; strokeSide(f); ctx.strokeStyle = '#11151f'; ctx.lineWidth = 1.4; strokeSide(f); }
    else { ctx.strokeStyle = 'rgba(244,191,98,.5)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); strokeSide(f); ctx.setLineDash([]); }
  }
  for (const f of sides) {
    const r = 8; ctx.fillStyle = wallMode ? 'rgba(224,99,90,.92)' : 'rgba(244,191,98,.92)'; ctx.beginPath(); ctx.arc(SX(f.mx), SY(f.my), r, 0, 7); ctx.fill();
    // normal mode: ＋ (grow here). wall mode: ○ to open a wall, ✕ to re-close an opened side.
    ctx.fillStyle = '#11151f'; ctx.font = 'bold 12px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(wallMode ? (f.closed ? '○' : '✕') : '＋', SX(f.mx), SY(f.my) + 0.5);
  }
  // per-chunk biome label
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '11px ui-monospace,monospace';
  build.world.chunks.forEach((ch, ci) => {
    let x = 0, y = 0; for (const p of ch.poly) { x += p.x; y += p.y; } x /= ch.poly.length; y /= ch.poly.length;
    const lbl = BIOMES[wardBiome(build, ci)].label;
    ctx.fillStyle = 'rgba(8,10,14,.7)'; ctx.fillText(lbl, SX(x) + 0.6, SY(y) + 0.6);
    ctx.fillStyle = selChunk === ci ? '#fff' : 'rgba(240,238,228,.9)'; ctx.fillText(lbl, SX(x), SY(y));
  });
}
function floorReadout() {
  const n = build.world.chunks.length, walls = closedWallCount(build), open = frontier(build).filter((f) => !f.closed).length;
  $('vital').innerHTML = `<b class="big" style="color:#f4bf62">bounded floor · ${n} ward${n === 1 ? '' : 's'}</b><br><span style="color:#9aa3b5">☮ floor 1 — no baddies · next ward: <b style="color:${BIOME_COLOR[biome] || '#ccc'}">${BIOMES[biome].label}</b></span>`;
  $('signals').innerHTML = '';
  $('metrics').innerHTML = `wards <b>${n}</b> · closed walls <b>${walls}</b>${open ? ` · open sides <b>${open}</b>` : ''}<br><span style="color:#7d8597">the boundary is portless walls (no concourse) · click ＋ to grow a ward · ✎ wall mode opens/closes a side · click a ward to read it</span>`;
  const h = wardHistogram(build);
  $('rolecounts').innerHTML = Object.entries(h).sort((a, b) => b[1] - a[1]).map(([bk, c]) => `<span style="color:${BIOME_COLOR[bk]}">▣ ${BIOMES[bk].label} <b style="color:#e6e8ee">${c}</b></span>`).join('');
  $('npc').innerHTML = 'pick a ward →'; $('triadbar').innerHTML = ''; $('casts').innerHTML = '';
  $('mix').innerHTML = '';
}
let _floorHandles = [];
function fitView() {
  if (!chunk) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of chunk.poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const pad = 24, sw = (CW - 2 * pad) / (x1 - x0 || 1), sh = (CH - 2 * pad) / (y1 - y0 || 1), s = Math.min(sw, sh);
  view = { s, ox: (CW - (x1 - x0) * s) / 2 - x0 * s, oy: (CH - (y1 - y0) * s) / 2 - y0 * s };
}
const SX = (x) => x * view.s + view.ox, SY = (y) => y * view.s + view.oy;

// ── cell colour by lens ──
function lensColor(roomId) {
  const room = chunk.rooms[roomId]; if (!room) return '#0a0c11';
  if (lens === 'role') return room.color || '#2a2f35';
  if (lens === 'domain') return room.domain ? `hsl(${domHue[room.domain] || 0} 52% 44%)` : '#23272f';
  if (lens === 'tier') { const t = (ROLES[room.role] || {}).tier || 1; return ['#2a2f35', '#6a5a2e', '#a8552c', '#33408f'][t] || '#444'; }
  if (lens === 'social') { const m = civic.society.placeMembers.get(roomId); const k = m ? m.length : 0; const t = Math.min(1, Math.log2(1 + k) / 4); return `hsl(28 ${(20 + t * 60) | 0}% ${(11 + t * 38) | 0}%)`; }
  if (lens === 'bridging') { if (room.role === 'dwell') return '#161d2a'; const br = civic.metrics.bridging.get(roomId); if (!br || br.members < 2) return '#13171c'; const v = br.bridging; return `hsl(${(212 - v * 182) | 0} ${(34 + v * 38) | 0}% ${(20 + v * 24) | 0}%)`; }
  return room.color;
}

// ── render (dispatch by mode) ──
function render() { if (mode === 'floor') renderFloor(); else renderChunk(); }
function renderChunk() {
  if (!chunk) return;
  ctx.clearRect(0, 0, CW, CH);
  const cells = chunk.cells, roomOf = chunk.roomOf, road = chunk.road;
  // cells
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i], poly = c.poly; if (poly.length < 3) continue;
    let fill;
    if (road[i]) fill = '#0e1220';
    else if (roomOf[i] >= 0) fill = lensColor(roomOf[i]);
    else fill = '#07080c';
    if (sel >= 0 && roomOf[i] === sel) { ctx.fillStyle = fill; }
    else ctx.fillStyle = fill;
    ctx.beginPath(); ctx.moveTo(SX(poly[0][0]), SY(poly[0][1])); for (let k = 1; k < poly.length; k++) ctx.lineTo(SX(poly[k][0]), SY(poly[k][1])); ctx.closePath(); ctx.fill();
    if (!road[i] && roomOf[i] >= 0) { ctx.strokeStyle = 'rgba(6,9,13,.45)'; ctx.lineWidth = 0.5; ctx.stroke(); }
    if (sel >= 0 && roomOf[i] === sel) { ctx.strokeStyle = 'rgba(244,191,98,.85)'; ctx.lineWidth = 1.1; ctx.stroke(); }
  }
  // supply web
  if ($('t-web').checked) { ctx.strokeStyle = 'rgba(127,176,216,.28)'; ctx.lineWidth = 0.8; for (const e of civic.field.edges) { ctx.beginPath(); ctx.moveTo(SX(e.fx), SY(e.fy)); ctx.lineTo(SX(e.tx), SY(e.ty)); ctx.stroke(); } }
  // social fabric (home → each non-home hat)
  if ($('t-fab').checked) { ctx.strokeStyle = 'rgba(196,120,216,.22)'; ctx.lineWidth = 0.7; for (const p of civic.society.people) for (const h of p.hats) { if (h.place === p.home) continue; ctx.beginPath(); ctx.moveTo(SX(p.x), SY(p.y)); ctx.lineTo(SX(h.x), SY(h.y)); ctx.stroke(); } }
  // ports (chunk seams / links)
  for (const p of chunk.ports) { ctx.fillStyle = p.inherited ? '#5fd0c0' : '#d8b25a'; ctx.beginPath(); ctx.arc(SX(p.x), SY(p.y), 3, 0, 7); ctx.fill(); }
  // room glyphs
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const r of chunk.rooms) {
    const fp = r.cells.length, fs = Math.max(8, Math.min(20, 7 + Math.sqrt(fp) * view.s * 0.7));
    ctx.font = `${fs}px ui-monospace,monospace`;
    ctx.fillStyle = 'rgba(8,10,14,.55)'; ctx.fillText(r.glyph || '·', SX(r.x) + 0.6, SY(r.y) + 0.6);
    ctx.fillStyle = '#0c0f15'; ctx.globalAlpha = 0.0; ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(244,240,228,.92)'; ctx.fillText(r.glyph || '·', SX(r.x), SY(r.y));
  }
}

// ── readout ──
function bar(v, color, w = 1) { return `<span class="bar"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%;background:${color}"></i></span>`; }
// per-room PCA aspect ratio (long axis / short) — the skinniness metric the tension knob lowers.
function roomAspects() {
  const A = [];
  for (const r of chunk.rooms) {
    if (r.cells.length < 5) { A.push(1); continue; }   // tiny rooms can't be meaningfully "skinny" (and PCA is degenerate)
    let mx = 0, my = 0; for (const c of r.cells) { mx += chunk.cells[c].x; my += chunk.cells[c].y; } mx /= r.cells.length; my /= r.cells.length;
    let xx = 0, yy = 0, xy = 0; for (const c of r.cells) { const dx = chunk.cells[c].x - mx, dy = chunk.cells[c].y - my; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
    xx /= r.cells.length; yy /= r.cells.length; xy /= r.cells.length;
    const tr = xx + yy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - (xx * yy - xy * xy)));
    A.push(Math.min(20, Math.sqrt((tr / 2 + disc) / Math.max(1e-6, (tr / 2 - disc), tr * 0.0025))));   // clamp + floor λ2 so 3-collinear cells don't blow up
  }
  return { avg: A.length ? A.reduce((s, x) => s + x, 0) / A.length : 0, max: A.length ? Math.max(...A) : 0, skinny: A.filter((x) => x > 4).length };
}
function readout() {
  const v = civic.vital, soc = civic.society, met = civic.metrics, f = civic.field;
  $('vital').innerHTML = `<b class="big" style="color:${TIER_COLOR[v.tier] || '#ccc'}">${v.vitality} · ${v.tier}</b><br><span style="color:#9aa3b5">${esc(v.headline || '')}</span>`;
  const SIGS = [['closes', 'closure'], ['thick', 'thickness'], ['weave', 'weave'], ['bridges', 'bridges'], ['thirds', 'third-places'], ['employ', 'employed'], ['resilient', 'resilience']];
  $('signals').innerHTML = SIGS.map(([k, lab]) => `<div class="sig"><span class="l">${lab}</span>${bar(v.signals[k], '#7fb0d8')}<b style="color:#b9c0cf;width:30px;text-align:right">${Math.round((v.signals[k] || 0) * 100)}</b></div>`).join('');
  const asp = roomAspects();
  $('metrics').innerHTML = `cells <b>${chunk.cells.length}</b> · rooms <b>${chunk.rooms.length}</b> · ports <b>${chunk.ports.length}</b> · closure <b>${Math.round(f.closure * 100)}%</b><br>room aspect avg <b>${asp.avg.toFixed(2)}</b> · max <b>${asp.max.toFixed(1)}</b> · skinny(&gt;4) <b>${asp.skinny}</b><br>people <b>${soc.people.length}</b> · avg hats <b>${soc.avgHats.toFixed(2)}</b> · third-place <b>${Math.round(soc.thirdsFrac * 100)}%</b> · reach <b>~${Math.round(met.avgReach)}</b>`;
  const counts = f.counts;
  $('rolecounts').innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([role, n]) => `<span title="${role}" style="color:${(ROLES[role] || {}).color || '#999'}">${(ROLES[role] || {}).glyph || '·'} ${role} <b style="color:#e6e8ee">${n}</b></span>`).join('');
  // people
  const employed = roster.people.filter((p) => p.work).length;
  $('npc').innerHTML = `<b>${roster.count}</b> residents · <b>${roster.count ? Math.round(100 * employed / roster.count) : 0}%</b> employed · mean triad:`;
  const ta = roster.triadAvg;
  $('triadbar').innerHTML = TRIAD_ORDER.map((k) => `<i title="${TRIAD[k].label} ${(ta[k] * 100 | 0)}%" style="flex:${Math.max(1, ta[k] * 100 | 0)};background:${TRIAD[k].accent}"></i>`).join('');
  $('casts').innerHTML = Object.entries(roster.casts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([lbl, n]) => `${esc(lbl)} <b style="color:#e6e8ee">${n}</b>`).join(' · ');
  // resulting mix
  $('mix').innerHTML = 'mix → ' + mixShares(sliders).slice(0, 6).map(([role, v2]) => `${(ROLES[role] || {}).glyph || ''}${role} ${Math.round(v2 * 100)}%`).join(' · ');
  // the stability MODEL's estimate for this distribution (sampled over several seeds, not just this chunk)
  const em = evaluateMix(mixFromSliders(sliders));
  $('model').innerHTML = `model: <b style="color:${TIER_COLOR[em.tier] || '#ccc'}">${Math.round(em.vitality)} · ${em.tier}</b> <span style="color:#7d8597">· fragile ${Math.round(em.fragility * 100)}% of rolls</span>`;
}

// ── click → room dossier ──
cv.addEventListener('click', (e) => {
  const r = cv.getBoundingClientRect(), mx = (e.clientX - r.left - view.ox) / view.s, my = (e.clientY - r.top - view.oy) / view.s;
  if (mode === 'floor') {
    if (!build) return;
    // 1) a frontier-edge handle? (grow off it, or seal it in wall mode) — handles take click priority.
    const hitR = 13 / view.s; let hf = null, hd = Infinity;
    for (const f of _floorHandles) { const d = (f.mx - mx) ** 2 + (f.my - my) ** 2; if (d < hd) { hd = d; hf = f; } }
    if (hf && Math.sqrt(hd) < hitR) {
      if (wallMode) toggleWall(build, hf.chunkId, hf.sideK);
      else growSide(build, hf.chunkId, hf.sideK, biome);
      selChunk = -1; $('dossier').classList.remove('on'); fitFloor(); renderFloor(); floorReadout();
      return;
    }
    // 2) otherwise select the nearest ward and read it
    let best = -1, bd = Infinity;
    build.world.chunks.forEach((ch, ci) => { let x = 0, y = 0; for (const p of ch.poly) { x += p.x; y += p.y; } x /= ch.poly.length; y /= ch.poly.length; const d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = ci; } });
    if (best < 0) return;
    selChunk = best; showWard(best); renderFloor();
    return;
  }
  if (!chunk) return;
  let best = -1, bd = Infinity;
  chunk.rooms.forEach((room, id) => { const d = (room.x - mx) ** 2 + (room.y - my) ** 2; if (d < bd) { bd = d; best = id; } });
  if (best < 0) return;
  sel = best; showDossier(best); render();
});
// a ward (floor chunk) clicked → its biome + civic vitality + people, in the rail readout.
function showWard(ci) {
  const ch = build.world.chunks[ci], bk = wardBiome(build, ci);
  const sc = scoreChunk(ch.rooms, W, H, seed ^ ci);
  $('vital').innerHTML = `<b class="big" style="color:${TIER_COLOR[sc.vital.tier] || '#ccc'}">${sc.vital.vitality} · ${sc.vital.tier}</b><br><span style="color:#9aa3b5">▣ ${BIOMES[bk].label} ward · ${sc.society.people.length} residents</span>`;
  const SIGS = [['closes', 'closure'], ['thick', 'thickness'], ['weave', 'weave'], ['bridges', 'bridges'], ['thirds', 'third-places'], ['employ', 'employed'], ['resilient', 'resilience']];
  $('signals').innerHTML = SIGS.map(([k, lab]) => `<div class="sig"><span class="l">${lab}</span>${bar(sc.vital.signals[k], BIOME_COLOR[bk] || '#7fb0d8')}<b style="color:#b9c0cf;width:30px;text-align:right">${Math.round((sc.vital.signals[k] || 0) * 100)}</b></div>`).join('');
  $('metrics').innerHTML = `ward <b>${ci}</b> · rooms <b>${ch.rooms.length}</b> · closure <b>${Math.round(sc.field.closure * 100)}%</b><br>people <b>${sc.society.people.length}</b> · avg hats <b>${sc.society.avgHats.toFixed(2)}</b> · third-place <b>${Math.round(sc.society.thirdsFrac * 100)}%</b>`;
}
function showDossier(id) {
  const room = chunk.rooms[id], R = ROLES[room.role] || {};
  const members = (civic.society.placeMembers.get(id) || []);
  const br = civic.metrics.bridging.get(id);
  const shock = roomShock(civic.field, civic.society, civic.metrics, id);
  const sampleIdx = members.slice(0, 4);
  const npcs = sampleIdx.map((i) => roster.people[i]).filter(Boolean);
  let html = `<span class="x" data-x>✕</span><h3>${R.glyph || '·'} ${esc(room.role)}${room.domain ? ` · ${esc(room.domain)}` : ''}</h3>`;
  html += `<div class="read">footprint <b>${room.cells.length}</b> cells · tier <b>${R.tier || 1}</b> · members <b>${members.length}</b></div>`;
  if (br && br.members >= 2) html += `<div class="read">weave <b>${Math.round(br.bridging * 100)}%</b> (${br.bridging > 0.5 ? 'a bridge' : 'a bond'})</div>`;
  html += `<div class="read">⚠ remove: <b>${shock.orphaned}</b> orphaned · <b>${shock.ties}</b> ties cut · <b>${shock.needsAtRisk}</b> needs at risk (${shock.rerouted} reroute)</div>`;
  if (npcs.length) {
    html += `<div class="np"><b>who's here</b>`;
    for (const n of npcs) {
      const triad = TRIAD_ORDER.map((k) => `${TRIAD[k].glyph}${Math.round((n.triad[k] || 0) * 100)}`).join(' ');
      const att = n.attrs;
      html += `<div style="margin-top:6px"><b style="color:#e6e8ee">${esc(n.name)}</b> <span style="color:#8a93a6">· ${esc(n.vocTag || n.vocation)} · ${esc((n.cast && n.cast.label) || '')}</span><div class="read" style="margin:2px 0">${triad}</div>`;
      html += `<div class="att">${Object.entries(att).map(([k, v]) => `<span>${k} <b style="color:#cfd4de">${v}</b></span>`).join('')}</div></div>`;
    }
    html += `</div>`;
  }
  const d = $('dossier'); d.innerHTML = html; d.classList.add('on');
  d.querySelector('[data-x]').addEventListener('click', () => { d.classList.remove('on'); sel = -1; render(); });
}

addEventListener('resize', resize);
resize(); generate();
