// region-app.js — a coherent forge region: many chunks on one foam, the concourse GROWN by physarum (no
// imposed solver). Chambers tinted by facility; the carved conduit network drawn by tier; a fulfillment
// center bridges to the NAVE node above (product up / waste down); trunk arterials span seams.

import { buildForgeRegion } from './floor.js';
import { ENGINES } from './engines.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 7;
let count = Q.has('n') ? Math.max(3, Math.min(37, Q.get('n') | 0)) : 19;
let mu = Q.has('mu') ? Math.max(0.6, Math.min(1.8, +Q.get('mu'))) : 1.35;
let optimize = Q.has('opt') ? Q.get('opt') === '1' : true;
let reg = null, sel = -1, view = { s: 1, ox: 0, oy: 0 };
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;

const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const TIER = { 1: { col: 'rgba(150,170,200,.34)', w: 0.8, label: 'capillary' }, 2: { col: 'rgba(224,176,98,.72)', w: 1.8, label: 'street' }, 3: { col: 'rgba(244,191,98,.97)', w: 3.2, label: 'arterial (trunk)' } };

function syncURL() { const u = new URL(location); u.searchParams.set('seed', seed); u.searchParams.set('n', count); u.searchParams.set('mu', mu); u.searchParams.set('opt', optimize ? 1 : 0); history.replaceState(null, '', u); }

$('count').value = count; $('countv').textContent = count; $('mu').value = mu; $('muv').textContent = mu.toFixed(2); $('opt').checked = optimize;
$('count').addEventListener('input', (e) => { count = +e.target.value; $('countv').textContent = count; generate(); });
$('mu').addEventListener('input', (e) => { mu = +e.target.value; $('muv').textContent = mu.toFixed(2); generate(); });
$('opt').addEventListener('change', (e) => { optimize = e.target.checked; generate(); });
$('roll').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; generate(); });
$('reseed').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; generate(); });
for (const id of ['t-cond', 't-supply', 't-tint', 't-seam']) $(id).addEventListener('change', render);
$('zin').addEventListener('click', () => zoomAt(CW / 2, CH / 2, 1.25));
$('zout').addEventListener('click', () => zoomAt(CW / 2, CH / 2, 0.8));
$('zfit').addEventListener('click', () => { fitView(); render(); });

function generate() {
  reg = buildForgeRegion(seed, { count, mu, optimize });
  sel = -1; $('info').classList.remove('on'); syncURL();
  fitView(); render(); readout();
}

function fitView() {
  if (!reg) return; const b = reg.bbox, pad = 26;
  const s = Math.min((CW - 2 * pad) / (b.x1 - b.x0 || 1), (CH - 2 * pad) / (b.y1 - b.y0 || 1));
  view = { s, ox: (CW - (b.x1 - b.x0) * s) / 2 - b.x0 * s, oy: (CH - (b.y1 - b.y0) * s) / 2 - b.y0 * s };
}
const SX = (x) => x * view.s + view.ox, SY = (y) => y * view.s + view.oy;

function render() {
  if (!reg) return;
  ctx.clearRect(0, 0, CW, CH);
  const tintOn = $('t-tint').checked;
  const selFac = sel >= 0 ? reg.facilities[sel] : null;
  const selRooms = selFac ? new Set(selFac.rooms) : null;

  // chambers, per chunk (road cells dark = the GROWN concourse; room cells facility-tinted)
  for (let ci = 0; ci < reg.recs.length; ci++) {
    const rec = reg.recs[ci];
    const facCol = rec.facilities.map((f) => f.color);
    for (let i = 0; i < rec.cells.length; i++) {
      const poly = rec.cells[i].poly; if (poly.length < 3) continue;
      const rid = rec.roomOf[i]; let fill;
      if (rec.road[i]) fill = '#0b0f17';
      else if (rid >= 0 && rec.rooms[rid] && rec.rooms[rid].facility >= 0) { const room = rec.rooms[rid], col = facCol[room.facility] || '#444'; const gid = roomGid(ci, rid); fill = tintOn ? tint(col, selRooms ? (selRooms.has(gid) ? 0.62 : 0.16) : 0.34) : '#10141c'; }
      else if (rid >= 0) fill = '#0e1219';
      else fill = '#07080c';
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.moveTo(SX(poly[0][0]), SY(poly[0][1])); for (let k = 1; k < poly.length; k++) ctx.lineTo(SX(poly[k][0]), SY(poly[k][1])); ctx.closePath(); ctx.fill();
    }
  }

  // chunk seams
  if ($('t-seam').checked) { ctx.strokeStyle = 'rgba(120,140,170,.22)'; ctx.lineWidth = 1; for (const poly of reg.polys) { ctx.beginPath(); ctx.moveTo(SX(poly[0].x), SY(poly[0].y)); for (let k = 1; k < poly.length; k++) ctx.lineTo(SX(poly[k].x), SY(poly[k].y)); ctx.closePath(); ctx.stroke(); } }

  // inter-engine supply graph (faint long dashed edges between facility rooms)
  if ($('t-supply').checked) {
    ctx.setLineDash([5, 5]);
    for (const s of reg.supply) { const a = reg.rooms[s.fromRoom], b = reg.rooms[s.toRoom]; ctx.strokeStyle = s.cross ? 'rgba(143,208,106,.55)' : 'rgba(143,208,106,.26)'; ctx.lineWidth = s.cross ? 1.4 : 0.9; ctx.beginPath(); ctx.moveTo(SX(a.x), SY(a.y)); ctx.lineTo(SX(b.x), SY(b.y)); ctx.stroke(); }
    ctx.setLineDash([]);
  }

  // the GROWN conduit network, tier order (capillary first, trunks on top; nave conduits glow)
  if ($('t-cond').checked) {
    for (const t of [1, 2, 3]) {
      ctx.strokeStyle = TIER[t].col; ctx.lineWidth = TIER[t].w; ctx.beginPath();
      for (const c of reg.conduits) { if (c.tier !== t || c.nave) continue; ctx.moveTo(SX(c.ax), SY(c.ay)); ctx.lineTo(SX(c.bx), SY(c.by)); }
      ctx.stroke();
    }
    // nave lift conduits (the vertical trunk to the deck above)
    ctx.strokeStyle = 'rgba(203,211,224,.92)'; ctx.lineWidth = 3.4; ctx.beginPath();
    for (const c of reg.conduits) if (c.nave) { ctx.moveTo(SX(c.ax), SY(c.ay)); ctx.lineTo(SX(c.bx), SY(c.by)); }
    ctx.stroke();
  }

  // the NAVE node (the living deck above)
  const nv = reg.nave;
  ctx.fillStyle = 'rgba(203,211,224,.14)'; ctx.strokeStyle = 'rgba(203,211,224,.8)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(SX(nv.x), SY(nv.y), 16, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#cbd3e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '13px ui-monospace,monospace'; ctx.fillText('⌂', SX(nv.x), SY(nv.y));
  ctx.fillStyle = 'rgba(203,211,224,.85)'; ctx.font = '10px ui-monospace,monospace'; ctx.fillText(`the nave ↑ (~${nv.pop} crew)`, SX(nv.x), SY(nv.y) - 24);

  // facility cores + glyph
  for (const f of reg.facilities) {
    const e = ENGINES[f.engine], on = selFac && selFac.id === f.id;
    ctx.strokeStyle = tint(f.color, on ? 1 : 0.72); ctx.lineWidth = on ? 2.4 : 1.4;
    ctx.beginPath(); ctx.arc(SX(f.x), SY(f.y), Math.max(7, (f.navePort ? 11 : 9) * Math.min(1.6, view.s)), 0, 7); ctx.stroke();
    const fs = Math.max(10, Math.min(20, 11 * Math.min(1.6, view.s))); ctx.font = `${fs}px ui-monospace,monospace`;
    ctx.fillStyle = 'rgba(6,8,12,.6)'; ctx.fillText(e.glyph, SX(f.x) + 0.7, SY(f.y) + 0.7);
    ctx.fillStyle = on ? '#fff' : tint(f.color, 0.95); ctx.fillText(e.glyph, SX(f.x), SY(f.y));
  }
}
const roomGid = (chunk, localRoomId) => { // map a chunk-local room id to its global id (facilities use global ids)
  let base = 0; for (let i = 0; i < chunk; i++) base += reg.recs[i].rooms.length; return base + localRoomId;
};

function readout() {
  const nf = reg.facilities.length, cross = reg.supply.filter((s) => s.cross).length;
  const trunk = reg.conduits.filter((c) => c.tier === 3).length;
  const seamAll = reg.conduits.filter((c) => c.chunkA !== c.chunkB && c.chunkA >= 0 && c.chunkB >= 0).length;
  const roadCells = reg.recs.reduce((s, r) => s + r.road.reduce((a, b) => a + b, 0), 0);
  const L = reg.layout;
  const layoutLine = L.optimized
    ? `<span style="color:#8fd06a">⚙ optimised layout · transport <b>${Math.round(L.cost)}</b> · <b>${Math.round(L.reduction * 100)}%</b> below random</span>`
    : `<span style="color:#e0905a">⚙ random layout · transport <b>${Math.round(L.cost || 0)}</b> · tick "optimise" to cut it</span>`;
  $('metrics').innerHTML = `chunks <b>${reg.count}</b> · facilities <b>${nf}</b> · chambers <b>${reg.rooms.length}</b><br>` +
    `<span style="color:#cbd3e0">grown concourse <b>${roadCells}</b> cells · physarum-pathed</span><br>` +
    `supply edges <b>${reg.supply.length}</b> · cross-chunk <b>${cross}</b><br>` +
    `conduits <b>${reg.conduits.length}</b> · trunk (tier-3) <b>${trunk}</b> · cross-seam <b>${seamAll}</b><br>` +
    `${layoutLine}<br>` +
    `<span style="color:#cbd3e0">⌂ fulfillment <b>${reg.nave.fulfillment}</b> → supplies a nave of <b>~${reg.nave.pop}</b> crew</span>`;
  $('tierlegend').innerHTML = [3, 2, 1].map((t) => `<div class="row"><span class="ln" style="border-top-width:${TIER[t].w}px;border-color:${TIER[t].col}"></span>${TIER[t].label}</div>`).join('') +
    `<div class="row"><span class="ln" style="border-top:3px solid rgba(203,211,224,.92)"></span>nave lift (up/down)</div>` +
    `<div class="row" style="margin-top:4px"><span class="ln" style="border-top:1.4px dashed rgba(143,208,106,.7)"></span>supply (when shown)</div>`;
}

cv.addEventListener('click', (e) => {
  if (dragMoved || !reg) return;
  const r = cv.getBoundingClientRect(), mx = (e.clientX - r.left - view.ox) / view.s, my = (e.clientY - r.top - view.oy) / view.s;
  let best = -1, bd = Infinity;
  reg.facilities.forEach((f, i) => { const d = (f.x - mx) ** 2 + (f.y - my) ** 2; if (d < bd) { bd = d; best = i; } });
  if (best < 0 || Math.sqrt(bd) > 60 / view.s) { sel = -1; $('info').classList.remove('on'); render(); return; }
  sel = best; showInfo(best); render();
});
function showInfo(id) {
  const f = reg.facilities[id], e = ENGINES[f.engine];
  const feeds = reg.supply.filter((s) => s.from === id).map((s) => `${esc(s.tag)} → ${ENGINES[reg.facilities[s.to].engine].label}${s.cross ? ' ⬡' : ''}`);
  const fedBy = reg.supply.filter((s) => s.to === id).map((s) => `${ENGINES[reg.facilities[s.from].engine].label} → ${esc(s.tag)}${s.cross ? ' ⬡' : ''}`);
  const d = $('info');
  d.innerHTML = `<span class="x" data-x>✕</span><h3 style="color:${f.color}">${e.glyph} ${esc(e.label)}</h3>` +
    `<div class="note" style="color:#b9c0cf">${e.family} ${f.logistics ? 'conduit' : 'engine'} · chunk ${f.chunk} · ${f.rooms.length} chambers</div>` +
    `<div class="note">${esc(e.note)}</div>` +
    (f.navePort ? `<div class="note" style="color:#cbd3e0">⌂ rides up to the nave — product up, waste down</div>` : '') +
    `<div class="note">intake ${(e.intake || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` +
    `<div class="note">output ${(e.output || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` +
    (feeds.length ? `<div class="note" style="color:#8fd06a">feeds: ${feeds.map(esc).join(' · ')}</div>` : '') +
    (fedBy.length ? `<div class="note" style="color:#8fd06a">fed by: ${fedBy.map(esc).join(' · ')}</div>` : '') +
    `<div class="note" style="color:#566173">⬡ = across a chunk seam (trans-rind)</div>`;
  d.classList.add('on');
  d.querySelector('[data-x]').addEventListener('click', () => { d.classList.remove('on'); sel = -1; render(); });
}

let dragging = false, dragMoved = false, lastX = 0, lastY = 0;
function zoomAt(px, py, k) { const wx = (px - view.ox) / view.s, wy = (py - view.oy) / view.s; view.s *= k; view.ox = px - wx * view.s; view.oy = py - wy * view.s; render(); }
cv.addEventListener('pointerdown', (e) => { dragging = true; dragMoved = false; lastX = e.clientX; lastY = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!dragging) return; const dx = e.clientX - lastX, dy = e.clientY - lastY; if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true; view.ox += dx; view.oy += dy; lastX = e.clientX; lastY = e.clientY; render(); });
cv.addEventListener('pointerup', (e) => { dragging = false; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 0.89); }, { passive: false });

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); fitView(); render(); }
addEventListener('resize', resize);
resize(); generate();
