// nave-app.js — the /nave controller: roll the seven-chunk nave, render it three ways (biome · verb · full
// in the v99 style), with pan + zoom. No build step; the page only draws what buildNave() returns.

import { buildNave, FACTIONS, BIOMES, biomeForChunk } from './nave.js';
import { ROLES } from '../v099/econ/econ.js';
import { paintChunk, SKIN_DEFAULTS } from '../v099/skin.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cv = $('cv'), ctx = cv.getContext('2d');
const SKIN = { ...SKIN_DEFAULTS, playerW: 7 };   // a touch coarser than the live game — this is a floor overview

let seed = 7, view = 'biome', nave = null;
let painted = [];   // the full view's per-chunk skin cache: a paintChunk result, an {error}, or null
let DPR = 1, CW = 0, CH = 0, cam = { s: 1, ox: 0, oy: 0 };
const SX = (x) => x * cam.s + cam.ox, SY = (y) => y * cam.s + cam.oy;

// THE FULL VIEW runs the real game-engine skin per chunk (skin.js#paintChunk): seeded walls along the real
// membranes, the coarse generation "bones" hidden, the concourse retiled, lighting baked into each cell's
// colour. Painting all seven at once chokes the tab, so we paint ON DEMAND: the CENTER first (one chunk),
// then any ward you CLICK. Each paint is wrapped so a failure can't silently bail the whole view — it's
// recorded as an {error} and surfaced on screen instead.
let lastErr = '';
function paintOne(ci) {
  if (!nave || painted[ci]) return painted[ci];
  try { painted[ci] = paintChunk(nave.world.chunks[ci], SKIN); }
  catch (e) { lastErr = `ward ${ci}: ${e && e.message || e}`; painted[ci] = { error: lastErr }; console.error('[nave] paintChunk #' + ci + ' failed', e); }
  return painted[ci];
}
// paint a ward off the next tick (so the click/switch feels instant), then redraw + report.
function paintWardSoon(ci) {
  if (!nave || painted[ci]) return;
  paintStatus(`rendering ward ${ci}…`);
  setTimeout(() => { paintOne(ci); if (view === 'full') render(); paintStatus(); }, 20);
}
const paintedCount = () => painted.reduce((n, p) => n + (p && p.paintCells ? 1 : 0), 0);
function paintStatus(busy) {
  const el = $('pstat'); if (!el) return;
  if (view !== 'full' || !nave) { el.style.display = 'none'; return; }
  el.style.display = '';
  if (lastErr) { el.innerHTML = `<span style="color:#e0635a">render failed — ${esc(lastErr)}</span><br><span style="color:#7d8597">(reported to the console too)</span>`; return; }
  if (busy) { el.innerHTML = `<span style="color:var(--gold)">${esc(busy)}</span>`; return; }
  const n = paintedCount(), tot = nave.world.chunks.length;
  el.innerHTML = `<b style="color:var(--ink)">${n}/${tot}</b> wards rendered · <span style="color:#7d8597">click a ward to render it</span>`;
}

// ── build + fit ──
function roll(newSeed) {
  if (newSeed != null) seed = newSeed;
  nave = buildNave(seed); painted = new Array(nave.world.chunks.length).fill(null); lastErr = '';
  fit(); render(); sidebar();
  if (view === 'full') paintWardSoon(0); else paintStatus();   // render the center first
}
function fit() {
  if (!nave) return;
  const b = nave.bbox, pad = 36, sw = (CW - 2 * pad) / (b.x1 - b.x0 || 1), sh = (CH - 2 * pad) / (b.y1 - b.y0 || 1), s = Math.min(sw, sh);
  cam = { s, ox: (CW - (b.x1 - b.x0) * s) / 2 - b.x0 * s, oy: (CH - (b.y1 - b.y0) * s) / 2 - b.y0 * s };
}
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); if (!cam.s || cam.s === 1) fit(); render(); }

// the biome/verb cell colour (the record's coarse cells). biome = faction tint; verb = role colour.
function cellFill(ch, i, ci) {
  if (ch.road[i]) return '#0d1120';
  const rid = ch.roomOf[i];
  if (rid < 0) return '#07080c';
  if (view === 'biome') return nave.meta[ci].color;
  const room = ch.rooms[rid];
  return (room && room.color) || (ROLES[room && room.role] || {}).color || '#2a2f35';   // verb: by role
}

// ── render ──
function render() {
  if (!nave) return;
  ctx.clearRect(0, 0, CW, CH);
  if (view === 'full') renderFull(); else renderFlat();
  // chunk outlines (the commons gold; faction wards faint)
  ctx.lineJoin = 'round';
  nave.world.chunks.forEach((ch, ci) => {
    const p = ch.poly;
    ctx.strokeStyle = ci === 0 ? 'rgba(244,191,98,.5)' : 'rgba(255,255,255,.10)'; ctx.lineWidth = ci === 0 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(SX(p[0].x), SY(p[0].y)); for (let k = 1; k < p.length; k++) ctx.lineTo(SX(p[k].x), SY(p[k].y)); ctx.closePath(); ctx.stroke();
  });
  // room glyphs (full view) + faction/biome labels (all views)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (view === 'full') {
    for (const ch of nave.world.chunks) for (const r of ch.rooms) {
      const fs = Math.max(7, Math.min(16, 5 + Math.sqrt(r.cells.length) * cam.s * 0.55)); if (fs < 8) continue;
      ctx.font = `${fs}px ui-monospace,monospace`;
      ctx.fillStyle = 'rgba(8,10,14,.55)'; ctx.fillText(r.glyph || '·', SX(r.x) + 0.6, SY(r.y) + 0.6);
      ctx.fillStyle = 'rgba(244,240,228,.9)'; ctx.fillText(r.glyph || '·', SX(r.x), SY(r.y));
    }
  }
  ctx.font = '11px ui-monospace,monospace';
  nave.world.chunks.forEach((ch, ci) => {
    let x = 0, y = 0; for (const p of ch.poly) { x += p.x; y += p.y; } x /= ch.poly.length; y /= ch.poly.length;
    const m = nave.meta[ci], lbl = ci === 0 ? '★ commons' : m.label;
    ctx.fillStyle = 'rgba(8,10,14,.78)'; ctx.fillText(lbl, SX(x) + 0.6, SY(y) + 0.6);
    ctx.fillStyle = ci === 0 ? '#f4bf62' : '#eef0f6'; ctx.fillText(lbl, SX(x), SY(y));
  });
}

// biome + verb: the record's coarse cells, flat-filled.
function renderFlat() {
  nave.world.chunks.forEach((ch, ci) => {
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
  nave.world.chunks.forEach((ch, ci) => {
    const P = painted[ci];
    if (!P || !P.paintCells) {
      ctx.globalAlpha = 0.42;   // placeholder: the record's flat role cells, dimmed
      for (let i = 0; i < ch.cells.length; i++) { const poly = ch.cells[i].poly; if (poly.length < 3) continue; ctx.fillStyle = ch.road[i] ? '#0d1120' : (ch.roomOf[i] >= 0 ? ((ch.rooms[ch.roomOf[i]] || {}).color || '#2a2f35') : '#07080c'); ctx.beginPath(); ctx.moveTo(SX(poly[0][0]), SY(poly[0][1])); for (let k = 1; k < poly.length; k++) ctx.lineTo(SX(poly[k][0]), SY(poly[k][1])); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (P && P.error) { const c = ch.poly.reduce((a, p) => ({ x: a.x + p.x / ch.poly.length, y: a.y + p.y / ch.poly.length }), { x: 0, y: 0 }); ctx.fillStyle = '#e0635a'; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText('⚠ render failed', SX(c.x), SY(c.y) + 16); }
      return;
    }
    for (const c of P.paintCells) {
      const poly = c.poly; if (poly.length < 3) continue;
      ctx.fillStyle = c.color || '#05070b';
      ctx.beginPath(); ctx.moveTo(SX(poly[0][0]), SY(poly[0][1])); for (let k = 1; k < poly.length; k++) ctx.lineTo(SX(poly[k][0]), SY(poly[k][1])); ctx.closePath(); ctx.fill();
      if (!c.wall) { ctx.strokeStyle = 'rgba(6,9,12,0.5)'; ctx.lineWidth = seamW; ctx.stroke(); }
    }
  });
  // seam ports (the chunk-to-chunk crossings)
  for (const ch of nave.world.chunks) for (const p of ch.ports) { if (p.cell == null || p.cell < 0) continue; ctx.fillStyle = p.inherited ? '#5fd0c0' : '#d8b25a'; ctx.beginPath(); ctx.arc(SX(p.x), SY(p.y), 2.4, 0, 7); ctx.fill(); }
}

// ── sidebar: legend (per view) + readout ──
function sidebar() {
  if (view === 'biome') {
    $('legend-title').textContent = 'factions';
    const rows = [`<div class="row"><span class="sw" style="background:#c9b07a"></span><b>Commons</b> — one of every building</div>`];
    for (const [k, f] of Object.entries(FACTIONS)) {
      const bs = BIOMES.filter((b) => b.faction === k);
      rows.push(`<div class="row"><span class="sw" style="background:${f.color}"></span><b>${esc(f.label)}</b> — ${bs.map((b) => b.exclusive).join(' · ')}</div>`);
    }
    $('legend').innerHTML = rows.join('');
  } else {
    $('legend-title').textContent = 'verbs (roles)';
    $('legend').innerHTML = `<div class="roles">` + Object.entries(ROLES).map(([k, r]) => `<span style="color:${r.color}">${r.glyph} ${k}</span>`).join('') + `</div>`;
  }
  // readout: per-faction over-bias + exclusive census
  const census = {}; for (let ci = 1; ci < nave.world.chunks.length; ci++) { const f = nave.meta[ci].faction; (census[f] = census[f] || []).push(nave.world.chunks[ci].rooms.length); }
  const totalRooms = nave.world.chunks.reduce((a, ch) => a + ch.rooms.length, 0);
  $('readout').innerHTML =
    `<b style="color:var(--ink)">${nave.world.chunks.length}</b> chunks · <b style="color:var(--ink)">${totalRooms}</b> rooms · seed <b style="color:var(--ink)">${seed}</b><br>` +
    `<span style="color:#7d8597">the commons (★) links to all six wards; each faction’s two wards link only to the commons + each other — three lobes.</span><br>` +
    Object.entries(FACTIONS).map(([k, f]) => `<span style="color:${f.color}">${f.label}</span> overbias <span style="color:#b9c0cf">${f.shared.concat(f.exclusives).join(' ')}</span>`).join('<br>');
}

// ── view toggle ──
function setView(v) {
  view = v; for (const [b, vv] of [['v-biome', 'biome'], ['v-verb', 'verb'], ['v-full', 'full']]) $(b).classList.toggle('primary', vv === v);
  render(); sidebar();
  if (v === 'full') paintWardSoon(0); else paintStatus();   // render the center on entry; other wards on click
}
$('v-biome').addEventListener('click', () => setView('biome'));
$('v-verb').addEventListener('click', () => setView('verb'));
$('v-full').addEventListener('click', () => setView('full'));
$('roll').addEventListener('click', () => roll((Math.random() * 1e9) | 0));
$('fit').addEventListener('click', () => { fit(); render(); });

// click a ward (full view) → paint it now, jumping the paced queue.
function chunkAt(clientX, clientY) {
  const r = cv.getBoundingClientRect(), mx = (clientX - r.left - cam.ox) / cam.s, my = (clientY - r.top - cam.oy) / cam.s;
  let best = -1, bd = Infinity;
  nave.world.chunks.forEach((ch, ci) => { let x = 0, y = 0; for (const p of ch.poly) { x += p.x; y += p.y; } x /= ch.poly.length; y /= ch.poly.length; const d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = ci; } });
  return best;
}

// ── pan + zoom (+ click-to-paint in full view) ──
let dragging = false, last = null, down = null, moved = false;
cv.addEventListener('pointerdown', (e) => { dragging = true; moved = false; last = down = { x: e.clientX, y: e.clientY }; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!dragging) return; if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) moved = true; cam.ox += e.clientX - last.x; cam.oy += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; render(); });
cv.addEventListener('pointerup', (e) => {
  dragging = false; cv.classList.remove('drag');
  if (!moved && view === 'full' && nave) { const ci = chunkAt(e.clientX, e.clientY); if (ci >= 0 && !painted[ci]) paintWardSoon(ci); }
});
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const f = Math.exp(-e.deltaY * 0.0014), ns = Math.max(0.15, Math.min(12, cam.s * f));
  // zoom about the cursor
  cam.ox = mx - (mx - cam.ox) * (ns / cam.s); cam.oy = my - (my - cam.oy) * (ns / cam.s); cam.s = ns;
  render();
}, { passive: false });

// surface any uncaught error on screen (so a silent bail in the skin path is visible, not a blank/sliver).
addEventListener('error', (e) => { lastErr = (e.message || 'error') + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : ''); paintStatus(); });
addEventListener('unhandledrejection', (e) => { lastErr = 'promise: ' + ((e.reason && e.reason.message) || e.reason); paintStatus(); });

addEventListener('resize', resize);
resize(); roll();
