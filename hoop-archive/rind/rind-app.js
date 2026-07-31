// rind-app.js — the /rind controller: roll the four-chunk rind floor, render it three ways (station · verb ·
// full in the v99 skin), with pan + zoom. No build step; the page only draws what buildRind() returns. A
// near-clone of nave-app.js — the rind is the nave's structural sibling, so the view machinery is shared.

import { buildRind, RIND_CHUNKS, rindBiome, rindRoles } from './rind.js';
import { ROLES } from '../v099/econ/econ.js';
import { paintChunk, SKIN_DEFAULTS } from '../v099/skin.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cv = $('cv'), ctx = cv.getContext('2d');
const SKIN = { ...SKIN_DEFAULTS, playerW: 7 };   // a touch coarser than the live game — a floor overview

let seed = 7, view = 'biome', rind = null;
let painted = [];   // the full view's per-chunk skin cache: a paintChunk result, an {error}, or null
let DPR = 1, CW = 0, CH = 0, cam = { s: 1, ox: 0, oy: 0 };
const SX = (x) => x * cam.s + cam.ox, SY = (y) => y * cam.s + cam.oy;

// THE FULL VIEW runs the real game-engine skin per chunk (skin.js#paintChunk): seeded walls along the real
// membranes, the coarse "bones" hidden, the concourse retiled, lighting baked in. Painting all at once
// chokes the tab, so we paint ON DEMAND: the hub first, then any station you CLICK. Each paint is wrapped so
// a failure can't silently bail the view — it's recorded as an {error} and surfaced on screen.
let lastErr = '';
function paintOne(ci) {
  if (!rind || painted[ci]) return painted[ci];
  try { painted[ci] = paintChunk(rind.world.chunks[ci], SKIN); }
  catch (e) { lastErr = `station ${ci}: ${e && e.message || e}`; painted[ci] = { error: lastErr }; console.error('[rind] paintChunk #' + ci + ' failed', e); }
  return painted[ci];
}
function paintWardSoon(ci) {
  if (!rind || painted[ci]) return;
  paintStatus(`rendering ${labelOf(ci)}…`);
  setTimeout(() => { paintOne(ci); if (view === 'full') render(); paintStatus(); }, 20);
}
const paintedCount = () => painted.reduce((n, p) => n + (p && p.paintCells ? 1 : 0), 0);
const labelOf = (ci) => ci === 0 ? 'the shaft foot' : (rind.meta[ci] || {}).label || ('station ' + ci);
function paintStatus(busy) {
  const el = $('pstat'); if (!el) return;
  if (view !== 'full' || !rind) { el.style.display = 'none'; return; }
  el.style.display = '';
  if (lastErr) { el.innerHTML = `<span style="color:#e0635a">render failed — ${esc(lastErr)}</span><br><span style="color:#7d8597">(reported to the console too)</span>`; return; }
  if (busy) { el.innerHTML = `<span style="color:var(--gold)">${esc(busy)}</span>`; return; }
  const n = paintedCount(), tot = rind.world.chunks.length;
  el.innerHTML = `<b style="color:var(--ink)">${n}/${tot}</b> stations rendered · <span style="color:#7d8597">click a station to render it</span>`;
}

// ── build + fit ──
function roll(newSeed) {
  if (newSeed != null) seed = newSeed;
  rind = buildRind(seed); painted = new Array(rind.world.chunks.length).fill(null); lastErr = '';
  fit(); render(); sidebar();
  if (view === 'full') paintWardSoon(0); else paintStatus();   // render the hub first
}
function fit() {
  if (!rind) return;
  const b = rind.bbox, pad = 36, sw = (CW - 2 * pad) / (b.x1 - b.x0 || 1), sh = (CH - 2 * pad) / (b.y1 - b.y0 || 1), s = Math.min(sw, sh);
  cam = { s, ox: (CW - (b.x1 - b.x0) * s) / 2 - b.x0 * s, oy: (CH - (b.y1 - b.y0) * s) / 2 - b.y0 * s };
}
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); if (!cam.s || cam.s === 1) fit(); render(); }

// the station/verb cell colour (the record's coarse cells). station = station tint; verb = role colour.
function cellFill(ch, i, ci) {
  if (ch.road[i]) return '#0a1018';
  const rid = ch.roomOf[i];
  if (rid < 0) return '#05080c';
  if (view === 'biome') return rind.meta[ci].color;
  const room = ch.rooms[rid];
  return (room && room.color) || (ROLES[room && room.role] || {}).color || '#2a2f35';   // verb: by role
}

// ── render ──
function render() {
  if (!rind) return;
  ctx.clearRect(0, 0, CW, CH);
  if (view === 'full') renderFull(); else renderFlat();
  // chunk outlines (the hub teal; the stations faint)
  ctx.lineJoin = 'round';
  rind.world.chunks.forEach((ch, ci) => {
    const p = ch.poly;
    ctx.strokeStyle = ci === 0 ? 'rgba(95,208,192,.5)' : 'rgba(255,255,255,.10)'; ctx.lineWidth = ci === 0 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(SX(p[0].x), SY(p[0].y)); for (let k = 1; k < p.length; k++) ctx.lineTo(SX(p[k].x), SY(p[k].y)); ctx.closePath(); ctx.stroke();
  });
  // room glyphs (full view) + station labels (all views)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (view === 'full') {
    for (const ch of rind.world.chunks) for (const r of ch.rooms) {
      const fs = Math.max(7, Math.min(16, 5 + Math.sqrt(r.cells.length) * cam.s * 0.55)); if (fs < 8) continue;
      ctx.font = `${fs}px ui-monospace,monospace`;
      ctx.fillStyle = 'rgba(6,9,12,.55)'; ctx.fillText(r.glyph || '·', SX(r.x) + 0.6, SY(r.y) + 0.6);
      ctx.fillStyle = 'rgba(232,240,244,.9)'; ctx.fillText(r.glyph || '·', SX(r.x), SY(r.y));
    }
  }
  ctx.font = '11px ui-monospace,monospace';
  rind.world.chunks.forEach((ch, ci) => {
    let x = 0, y = 0; for (const p of ch.poly) { x += p.x; y += p.y; } x /= ch.poly.length; y /= ch.poly.length;
    const lbl = ci === 0 ? '★ shaft foot' : rind.meta[ci].label;
    ctx.fillStyle = 'rgba(6,9,12,.8)'; ctx.fillText(lbl, SX(x) + 0.6, SY(y) + 0.6);
    ctx.fillStyle = ci === 0 ? '#5fd0c0' : '#e8eef4'; ctx.fillText(lbl, SX(x), SY(y));
  });
}

// station + verb: the record's coarse cells, flat-filled.
function renderFlat() {
  rind.world.chunks.forEach((ch, ci) => {
    for (let i = 0; i < ch.cells.length; i++) {
      const poly = ch.cells[i].poly; if (poly.length < 3) continue;
      ctx.fillStyle = cellFill(ch, i, ci);
      ctx.beginPath(); ctx.moveTo(SX(poly[0][0]), SY(poly[0][1])); for (let k = 1; k < poly.length; k++) ctx.lineTo(SX(poly[k][0]), SY(poly[k][1])); ctx.closePath(); ctx.fill();
    }
  });
}

// full: the real game-engine skin per chunk. A PAINTED chunk draws its retiled seeded-wall mesh; an unpainted
// (or failed) one draws as a dim flat placeholder — so the view is always whole, never a choking paint.
function renderFull() {
  const seamW = Math.max(0.35, 0.6 * cam.s);
  rind.world.chunks.forEach((ch, ci) => {
    const P = painted[ci];
    if (!P || !P.paintCells) {
      ctx.globalAlpha = 0.42;
      for (let i = 0; i < ch.cells.length; i++) { const poly = ch.cells[i].poly; if (poly.length < 3) continue; ctx.fillStyle = ch.road[i] ? '#0a1018' : (ch.roomOf[i] >= 0 ? ((ch.rooms[ch.roomOf[i]] || {}).color || '#2a2f35') : '#05080c'); ctx.beginPath(); ctx.moveTo(SX(poly[0][0]), SY(poly[0][1])); for (let k = 1; k < poly.length; k++) ctx.lineTo(SX(poly[k][0]), SY(poly[k][1])); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (P && P.error) { const c = ch.poly.reduce((a, p) => ({ x: a.x + p.x / ch.poly.length, y: a.y + p.y / ch.poly.length }), { x: 0, y: 0 }); ctx.fillStyle = '#e0635a'; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText('⚠ render failed', SX(c.x), SY(c.y) + 16); }
      return;
    }
    for (const c of P.paintCells) {
      const poly = c.poly; if (poly.length < 3) continue;
      ctx.fillStyle = c.color || '#04060a';
      ctx.beginPath(); ctx.moveTo(SX(poly[0][0]), SY(poly[0][1])); for (let k = 1; k < poly.length; k++) ctx.lineTo(SX(poly[k][0]), SY(poly[k][1])); ctx.closePath(); ctx.fill();
      if (!c.wall) { ctx.strokeStyle = 'rgba(5,8,11,0.5)'; ctx.lineWidth = seamW; ctx.stroke(); }
    }
  });
  // seam ports (the chunk-to-chunk crossings)
  for (const ch of rind.world.chunks) for (const p of ch.ports) { if (p.cell == null || p.cell < 0) continue; ctx.fillStyle = p.inherited ? '#5fd0c0' : '#d8b25a'; ctx.beginPath(); ctx.arc(SX(p.x), SY(p.y), 2.4, 0, 7); ctx.fill(); }
}

// ── sidebar: legend (per view) + readout ──
function sidebar() {
  if (view === 'biome') {
    $('legend-title').textContent = 'stations';
    const principal = (c) => (c.grand && c.grand[0]) || (c.mix[0] && c.mix[0][0]);
    $('legend').innerHTML = RIND_CHUNKS.map((c) => `<div class="row"><span class="sw" style="background:${c.color}"></span><b>${esc(c.label)}</b> — ${esc(c.station === 'hub' ? 'transit · control' : principal(c))}</div>`).join('');
  } else {
    $('legend-title').textContent = 'verbs (roles)';
    $('legend').innerHTML = `<div class="roles">` + rindRoles().map((k) => `<span style="color:${(ROLES[k] || {}).color}">${(ROLES[k] || {}).glyph} ${k}</span>`).join('') + `</div>`;
  }
  const totalRooms = rind.world.chunks.reduce((a, ch) => a + ch.rooms.length, 0);
  $('readout').innerHTML =
    `<b style="color:var(--ink)">${rind.world.chunks.length}</b> chunks · <b style="color:var(--ink)">${totalRooms}</b> rooms · seed <b style="color:var(--ink)">${seed}</b><br>` +
    `<span style="color:#7d8597">the shaft-foot hub (★) links to all three stations on alternating sides; the stations never touch each other — a clean star. The shaft rises to the nave commons.</span><br>` +
    `<span style="color:var(--cold)">infrastructure only</span> <span style="color:#7d8597">— no grow (farms) · no play (arcades). make · mend · store · move · govern, and the Signal (worship · learn).</span>`;
}

// ── view toggle ──
function setView(v) {
  view = v; for (const [b, vv] of [['v-biome', 'biome'], ['v-verb', 'verb'], ['v-full', 'full']]) $(b).classList.toggle('primary', vv === v);
  render(); sidebar();
  if (v === 'full') paintWardSoon(0); else paintStatus();
}
$('v-biome').addEventListener('click', () => setView('biome'));
$('v-verb').addEventListener('click', () => setView('verb'));
$('v-full').addEventListener('click', () => setView('full'));
$('roll').addEventListener('click', () => roll((Math.random() * 1e9) | 0));
$('fit').addEventListener('click', () => { fit(); render(); });

// click a station (full view) → paint it now, jumping the paced queue.
function chunkAt(clientX, clientY) {
  const r = cv.getBoundingClientRect(), mx = (clientX - r.left - cam.ox) / cam.s, my = (clientY - r.top - cam.oy) / cam.s;
  let best = -1, bd = Infinity;
  rind.world.chunks.forEach((ch, ci) => { let x = 0, y = 0; for (const p of ch.poly) { x += p.x; y += p.y; } x /= ch.poly.length; y /= ch.poly.length; const d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = ci; } });
  return best;
}

// ── pan + zoom (+ click-to-paint in full view) ──
let dragging = false, last = null, down = null, moved = false;
cv.addEventListener('pointerdown', (e) => { dragging = true; moved = false; last = down = { x: e.clientX, y: e.clientY }; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!dragging) return; if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) moved = true; cam.ox += e.clientX - last.x; cam.oy += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; render(); });
cv.addEventListener('pointerup', (e) => {
  dragging = false; cv.classList.remove('drag');
  if (!moved && view === 'full' && rind) { const ci = chunkAt(e.clientX, e.clientY); if (ci >= 0 && !painted[ci]) paintWardSoon(ci); }
});
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const f = Math.exp(-e.deltaY * 0.0014), ns = Math.max(0.15, Math.min(12, cam.s * f));
  cam.ox = mx - (mx - cam.ox) * (ns / cam.s); cam.oy = my - (my - cam.oy) * (ns / cam.s); cam.s = ns;
  render();
}, { passive: false });

addEventListener('error', (e) => { lastErr = (e.message || 'error') + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : ''); paintStatus(); });
addEventListener('unhandledrejection', (e) => { lastErr = 'promise: ' + ((e.reason && e.reason.message) || e.reason); paintStatus(); });

addEventListener('resize', resize);
resize(); roll();
