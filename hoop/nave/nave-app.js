// nave-app.js — the /nave controller: roll the seven-chunk nave, render it three ways (biome · verb · full
// in the v99 style), with pan + zoom. No build step; the page only draws what buildNave() returns.

import { buildNave, FACTIONS, BIOMES, biomeForChunk } from './nave.js';
import { ROLES } from '../v099/econ/econ.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cv = $('cv'), ctx = cv.getContext('2d');

let seed = 7, view = 'biome', nave = null;
let DPR = 1, CW = 0, CH = 0, cam = { s: 1, ox: 0, oy: 0 };
const SX = (x) => x * cam.s + cam.ox, SY = (y) => y * cam.s + cam.oy;

// ── build + fit ──
function roll(newSeed) {
  if (newSeed != null) seed = newSeed;
  nave = buildNave(seed);
  fit(); render(); sidebar();
}
function fit() {
  if (!nave) return;
  const b = nave.bbox, pad = 36, sw = (CW - 2 * pad) / (b.x1 - b.x0 || 1), sh = (CH - 2 * pad) / (b.y1 - b.y0 || 1), s = Math.min(sw, sh);
  cam = { s, ox: (CW - (b.x1 - b.x0) * s) / 2 - b.x0 * s, oy: (CH - (b.y1 - b.y0) * s) / 2 - b.y0 * s };
}
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); if (!cam.s || cam.s === 1) fit(); render(); }

// ── colour a cell ──
function cellFill(ch, i, ci) {
  if (ch.road[i]) return '#0d1120';
  const rid = ch.roomOf[i];
  if (rid < 0) return '#07080c';
  if (view === 'biome') return nave.meta[ci].color;
  const room = ch.rooms[rid];
  return (room && room.color) || (ROLES[room && room.role] || {}).color || '#2a2f35';   // verb + full: by role
}

// ── render ──
function render() {
  if (!nave) return;
  ctx.clearRect(0, 0, CW, CH);
  // cells
  nave.world.chunks.forEach((ch, ci) => {
    for (let i = 0; i < ch.cells.length; i++) {
      const poly = ch.cells[i].poly; if (poly.length < 3) continue;
      ctx.fillStyle = cellFill(ch, i, ci);
      ctx.beginPath(); ctx.moveTo(SX(poly[0][0]), SY(poly[0][1])); for (let k = 1; k < poly.length; k++) ctx.lineTo(SX(poly[k][0]), SY(poly[k][1])); ctx.closePath(); ctx.fill();
      if (view === 'full' && !ch.road[i] && ch.roomOf[i] >= 0) { ctx.strokeStyle = 'rgba(6,9,13,.4)'; ctx.lineWidth = 0.5; ctx.stroke(); }
    }
  });
  // chunk outlines + the walled boundary
  ctx.lineJoin = 'round';
  nave.world.chunks.forEach((ch, ci) => {
    const p = ch.poly;
    ctx.strokeStyle = ci === 0 ? 'rgba(244,191,98,.5)' : 'rgba(255,255,255,.10)'; ctx.lineWidth = ci === 0 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(SX(p[0].x), SY(p[0].y)); for (let k = 1; k < p.length; k++) ctx.lineTo(SX(p[k].x), SY(p[k].y)); ctx.closePath(); ctx.stroke();
  });
  // full view: ports (seam crossings) + room glyphs
  if (view === 'full') {
    nave.world.chunks.forEach((ch) => { for (const p of ch.ports) { if (p.cell == null || p.cell < 0) continue; ctx.fillStyle = p.inherited ? '#5fd0c0' : '#d8b25a'; ctx.beginPath(); ctx.arc(SX(p.x), SY(p.y), 2.6, 0, 7); ctx.fill(); } });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    nave.world.chunks.forEach((ch) => {
      for (const r of ch.rooms) {
        const fs = Math.max(7, Math.min(17, 6 + Math.sqrt(r.cells.length) * cam.s * 0.6)); if (fs < 8) continue;
        ctx.font = `${fs}px ui-monospace,monospace`;
        ctx.fillStyle = 'rgba(8,10,14,.5)'; ctx.fillText(r.glyph || '·', SX(r.x) + 0.6, SY(r.y) + 0.6);
        ctx.fillStyle = 'rgba(244,240,228,.92)'; ctx.fillText(r.glyph || '·', SX(r.x), SY(r.y));
      }
    });
  }
  // faction/biome labels per chunk
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '11px ui-monospace,monospace';
  nave.world.chunks.forEach((ch, ci) => {
    let x = 0, y = 0; for (const p of ch.poly) { x += p.x; y += p.y; } x /= ch.poly.length; y /= ch.poly.length;
    const m = nave.meta[ci], lbl = ci === 0 ? '★ commons' : m.label;
    ctx.fillStyle = 'rgba(8,10,14,.72)'; ctx.fillText(lbl, SX(x) + 0.6, SY(y) + 0.6);
    ctx.fillStyle = ci === 0 ? '#f4bf62' : '#e8eaf0'; ctx.fillText(lbl, SX(x), SY(y));
  });
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
function setView(v) { view = v; for (const [b, vv] of [['v-biome', 'biome'], ['v-verb', 'verb'], ['v-full', 'full']]) $(b).classList.toggle('primary', vv === v); render(); sidebar(); }
$('v-biome').addEventListener('click', () => setView('biome'));
$('v-verb').addEventListener('click', () => setView('verb'));
$('v-full').addEventListener('click', () => setView('full'));
$('roll').addEventListener('click', () => roll((Math.random() * 1e9) | 0));
$('fit').addEventListener('click', () => { fit(); render(); });

// ── pan + zoom ──
let dragging = false, last = null;
cv.addEventListener('pointerdown', (e) => { dragging = true; last = { x: e.clientX, y: e.clientY }; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!dragging) return; cam.ox += e.clientX - last.x; cam.oy += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; render(); });
cv.addEventListener('pointerup', (e) => { dragging = false; cv.classList.remove('drag'); });
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const f = Math.exp(-e.deltaY * 0.0014), ns = Math.max(0.15, Math.min(12, cam.s * f));
  // zoom about the cursor
  cam.ox = mx - (mx - cam.ox) * (ns / cam.s); cam.oy = my - (my - cam.oy) * (ns / cam.s); cam.s = ns;
  render();
}, { passive: false });

addEventListener('resize', resize);
resize(); roll();
