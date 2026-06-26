// chunkroller.js — the controller: roll a chunk, render a total top-down view, civic readout, NPC stats,
// and biome sliders that bias room creation (via the engine's additive roleMix override). No build.

import { solveChunk } from '../v099/v8/chunkgen.js';
import { ROLES, DOMAINS } from '../v099/econ/econ.js';
import { TRAFFIC_FOOTPRINT, GRAND_ROLES, GRAND_MIN, MIN_ROOM } from '../v099/rooms.js';
import { TRIAD, TRIAD_ORDER } from '../v099/stats.js';
import { SLIDERS, NEUTRAL, SLIDER_MAX, BIOMES, BIOME_GRAND, mixFromSliders, mixShares } from './biomes.js';
import { scoreChunk, npcRoster, roomShock } from './civic.js';

const W = 900, H = 600;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TIER_COLOR = { Thriving: '#5fd08a', Healthy: '#8fd06a', Stable: '#d8c45a', Fragile: '#e0a05a', Failing: '#e0635a' };
const domHue = {}; DOMAINS.forEach((d, i) => { domHue[d.id] = Math.round((i / DOMAINS.length) * 320); });

let seed = 7, biome = 'wild', sliders = { ...NEUTRAL }, lens = 'role';
let chunk = null, civic = null, roster = null, sel = -1, view = { s: 1, ox: 0, oy: 0 };

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;

// ── build the controls ──
$('biome').innerHTML = Object.entries(BIOMES).map(([k, b]) => `<option value="${k}">${esc(b.label)}</option>`).join('');
$('sliders').innerHTML = SLIDERS.map((s) => `<label class="row" title="${esc(s.hint)}"><span class="l">${esc(s.label)}</span><input type="range" data-sl="${s.key}" min="0" max="${SLIDER_MAX}" step="0.1" value="${sliders[s.key]}"><b data-slv="${s.key}">${sliders[s.key].toFixed(1)}</b></label>`).join('');
function syncSliders() { for (const s of SLIDERS) { const r = document.querySelector(`[data-sl="${s.key}"]`); const b = document.querySelector(`[data-slv="${s.key}"]`); if (r) r.value = sliders[s.key]; if (b) b.textContent = sliders[s.key].toFixed(1); } }

$('biome').addEventListener('change', (e) => { biome = e.target.value; sliders = { ...(BIOMES[biome].sliders) }; syncSliders(); generate(); });
$('sliders').addEventListener('input', (e) => { const k = e.target.getAttribute('data-sl'); if (!k) return; sliders[k] = +e.target.value; document.querySelector(`[data-slv="${k}"]`).textContent = sliders[k].toFixed(1); biome = 'wild'; $('biome').value = matchBiome() || ''; generate(); });
$('by').addEventListener('change', (e) => { lens = e.target.value; render(); });
$('roll').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; generate(); });
$('reseed').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; generate(); });
$('t-web').addEventListener('change', render);
$('t-fab').addEventListener('change', render);
function matchBiome() { for (const [k, b] of Object.entries(BIOMES)) if (SLIDERS.every((s) => Math.abs((b.sliders[s.key] ?? 1) - sliders[s.key]) < 0.05)) return k; return null; }

// ── generate ──
function generate() {
  const roleMix = mixFromSliders(sliders);
  const grand = BIOME_GRAND[biome] || GRAND_ROLES;
  chunk = solveChunk({ seed, W, H, roomSize: 14, footprint: TRAFFIC_FOOTPRINT, grand, grandMin: GRAND_MIN, minRoom: MIN_ROOM, roleMix });
  civic = scoreChunk(chunk.rooms, W, H, seed);
  roster = npcRoster(civic.society);
  sel = -1; $('dossier').classList.remove('on');
  fitView(); render(); readout();
}

// ── view fit (chunk poly bbox → canvas) ──
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); fitView(); render(); }
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

// ── render the chunk ──
function render() {
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
function readout() {
  const v = civic.vital, soc = civic.society, met = civic.metrics, f = civic.field;
  $('vital').innerHTML = `<b class="big" style="color:${TIER_COLOR[v.tier] || '#ccc'}">${v.vitality} · ${v.tier}</b><br><span style="color:#9aa3b5">${esc(v.headline || '')}</span>`;
  const SIGS = [['closes', 'closure'], ['thick', 'thickness'], ['weave', 'weave'], ['bridges', 'bridges'], ['thirds', 'third-places'], ['employ', 'employed'], ['resilient', 'resilience']];
  $('signals').innerHTML = SIGS.map(([k, lab]) => `<div class="sig"><span class="l">${lab}</span>${bar(v.signals[k], '#7fb0d8')}<b style="color:#b9c0cf;width:30px;text-align:right">${Math.round((v.signals[k] || 0) * 100)}</b></div>`).join('');
  $('metrics').innerHTML = `cells <b>${chunk.cells.length}</b> · rooms <b>${chunk.rooms.length}</b> · closure <b>${Math.round(f.closure * 100)}%</b><br>people <b>${soc.people.length}</b> · avg hats <b>${soc.avgHats.toFixed(2)}</b> · third-place <b>${Math.round(soc.thirdsFrac * 100)}%</b> · reach <b>~${Math.round(met.avgReach)}</b>`;
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
}

// ── click → room dossier ──
cv.addEventListener('click', (e) => {
  if (!chunk) return;
  const r = cv.getBoundingClientRect(), mx = (e.clientX - r.left - view.ox) / view.s, my = (e.clientY - r.top - view.oy) / view.s;
  let best = -1, bd = Infinity;
  chunk.rooms.forEach((room, id) => { const d = (room.x - mx) ** 2 + (room.y - my) ** 2; if (d < bd) { bd = d; best = id; } });
  if (best < 0) return;
  sel = best; showDossier(best); render();
});
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
