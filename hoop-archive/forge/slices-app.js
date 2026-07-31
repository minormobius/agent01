// slices-app.js — presenting a 3D bounded chunk to the player as PLAN + SECTION (histology + architecture).
// The hex-prism chunk is a stack of 2D floor slices; you read one floor at a time (a trivial map) and move
// between floors through the lift (the portal). A SECTION strip on the left is the localizer — the strata,
// the lift threading them, and you-are-here. This is how the 3D complexity stays legible: N 2D maps + a cut.

import { solveForgeChunk, pickChunkEngines } from './facility.js';
import { regionWalk } from './floor.js';
import { formFactory } from './formation3d.js';
import { ENGINES } from './engines.js';
import { ambientOf, materialOf, fixtureOf } from './fixtures.js';
import { drawCore, drawMachine, drawCarrier, ambientGlow } from './sprites.js';
import { pathFind, nearestNode } from '../v099/v8/manager.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 7;
const W = 760, H = 600;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
const SECW = 200;                     // the section (elevation) strip width on the left
let floors = [], cur = 0, clock = 0;  // floors[i] = { rec, walk, lift, label, color, engines }
let player = -1, pp = { x: 0, y: 0 }, route = [], rseg = 0, view = { s: 1, ox: 0, oy: 0 };

const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
function shadeMix(b, c, a) { const x = parseInt(b.slice(1), 16), y = parseInt(c.slice(1), 16), m = (s, t) => Math.round(s + (t - s) * a); return `rgb(${m((x >> 16) & 255, (y >> 16) & 255)},${m((x >> 8) & 255, (y >> 8) & 255)},${m(x & 255, y & 255)})`; }

const STRATA = ['reclaim · raw', 'fluid', 'foundry · smelt', 'refine', 'assembly · finish'];

function build() {
  // the strata (which engines on which floor) from the tower formation — bounded now to ONE hex chunk
  const form = formFactory(seed);
  const poly = hexPoly(W / 2, H / 2, 250);
  floors = form.byFloor.map((ring, fl) => {
    const engs = [...new Set(ring.map((f) => f.engine))].slice(0, 3);
    const rec = solveForgeChunk({ poly, seed: (seed ^ (fl * 0x9e37 + 7)) >>> 0, foamSeed: 0x5e, W, H, engines: engs.length ? engs : ['fluid'] });
    rec.id = 0; const walk = regionWalk({ recs: [rec] });
    const lift = liftCell(rec, walk);   // the chunk-centre cell = the lift portal (same x,y on every floor)
    const dom = ring[0] ? ring[0].engine : 'fluid';
    return { rec, walk, lift, label: STRATA[fl] || ('floor ' + fl), color: ENGINES[dom].color, engines: engs };
  });
  cur = floors.length - 1;            // start at the top (assembly, by the nave) and descend
  enterFloor(cur, true);
  const u = new URL(location); u.searchParams.set('seed', seed); history.replaceState(null, '', u);
}
function hexPoly(cx, cy, R) { const p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; p.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }); } return p; }
function liftCell(rec, walk) { let best = 0, bd = Infinity; for (let i = 0; i < rec.cells.length; i++) { const d = (rec.cells[i].x - W / 2) ** 2 + (rec.cells[i].y - H / 2) ** 2; if (d < bd && rec.road[i]) { bd = d; best = i; } } if (bd === Infinity) for (let i = 0; i < rec.cells.length; i++) { const d = (rec.cells[i].x - W / 2) ** 2 + (rec.cells[i].y - H / 2) ** 2; if (d < bd) { bd = d; best = i; } } return best; }

function enterFloor(fl, keepLift) {
  cur = fl; const F = floors[cur];
  player = keepLift ? F.lift : nearestNode(F.walk, pp.x, pp.y);   // arrive at the lift (took the lift) or nearest
  pp.x = F.walk.pos[2 * player]; pp.y = F.walk.pos[2 * player + 1]; route = [];
  fitPlan(); whereAmI();
}
function fitPlan() {
  const F = floors[cur]; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of F.rec.poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const pw = CW - SECW, pad = 26, s = Math.min((pw - 2 * pad) / (x1 - x0 || 1), (CH - 2 * pad) / (y1 - y0 || 1));
  view = { s, ox: SECW + (pw - (x1 - x0) * s) / 2 - x0 * s, oy: (CH - (y1 - y0) * s) / 2 - y0 * s };
}
const SX = (x) => x * view.s + view.ox, SY = (y) => y * view.s + view.oy;
const wX = (sx) => (sx - view.ox) / view.s, wY = (sy) => (sy - view.oy) / view.s;

function whereAmI() {
  const F = floors[cur], atLift = player === F.lift;
  $('where').innerHTML = `floor <b>${cur + 1}/${floors.length}</b> · <b style="color:${F.color}">${esc(F.label)}</b><br>` +
    `<span class="note">${F.engines.map((e) => ENGINES[e].glyph + ' ' + esc(ENGINES[e].label)).join(' · ')}</span><br>` +
    `<span class="note">${atLift ? '⇅ at the lift — ▲▼ to change floor' : 'walk to the lift (centre) or use ▲▼'}</span>`;
}

function render() {
  if (!floors.length) return;
  ctx.clearRect(0, 0, CW, CH);
  drawPlan();
  drawSection();
}

function drawPlan() {
  const F = floors[cur], rec = F.rec, facCol = rec.facilities.map((f) => f.color), facEng = rec.facilities.map((f) => f.engine);
  // clip to the plan pane
  ctx.save(); ctx.beginPath(); ctx.rect(SECW, 0, CW - SECW, CH); ctx.clip();
  for (let i = 0; i < rec.cells.length; i++) {
    const poly = rec.cells[i].poly; if (poly.length < 3) continue;
    const rid = rec.roomOf[i]; let fill;
    if (rec.road[i]) fill = '#0c111b';
    else if (rid >= 0 && rec.rooms[rid] && rec.rooms[rid].facility >= 0) fill = shadeMix(ambientOf(facEng[rec.rooms[rid].facility]).floor, facCol[rec.rooms[rid].facility] || '#444', 0.18);
    else if (rid >= 0) fill = '#0e1219'; else fill = '#08090d';
    ctx.fillStyle = fill; ctx.beginPath(); const s0 = SX(poly[0][0]); ctx.moveTo(SX(poly[0][0]), SY(poly[0][1])); for (let k = 1; k < poly.length; k++) ctx.lineTo(SX(poly[k][0]), SY(poly[k][1])); ctx.closePath(); ctx.fill();
    if (!rec.road[i] && rid >= 0) { ctx.strokeStyle = 'rgba(4,7,11,.5)'; ctx.lineWidth = 0.5; ctx.stroke(); }
  }
  for (const f of rec.facilities) { if (!f.rooms.length || f.core < 0) continue; const c = rec.rooms[f.core]; ambientGlow(ctx, SX(c.x), SY(c.y), Math.max(40, f.rooms.length ** 0.5 * view.s * 3.6), ambientOf(f.engine).light); }
  for (const r of rec.rooms) { if (r.facility < 0) continue; const eng = facEng[r.facility], p = { x: SX(r.x), y: SY(r.y) }, rr = Math.max(7, Math.sqrt(r.cells.length) * view.s * 0.8); if (r.isCore) drawCore(ctx, fixtureOf(eng, r.step), p.x, p.y, rr * 1.25, ambientOf(eng).light, clock); else drawMachine(ctx, '', p.x, p.y, rr * 0.75, ambientOf(eng).light); }
  // material carriers on this floor
  for (const e of rec.flow) { const a = rec.rooms[e.from], b = rec.rooms[e.to]; if (!a || !b) continue; const mat = materialOf(e.engine), col = ambientOf(e.engine).light; for (let k = 0; k < 2; k++) { const ph = (clock * mat.speed * 0.5 + e.from * 0.13 + k * 0.5) % 1; drawCarrier(ctx, mat.shape, SX(a.x + (b.x - a.x) * ph), SY(a.y + (b.y - a.y) * ph), Math.max(2.4, view.s * 1.6), col, mat.hot); } }
  // the LIFT portal at chunk centre (the through-line) + up/down affordance
  const lc = rec.cells[F.lift], lp = { x: SX(lc.x), y: SY(lc.y) };
  ctx.strokeStyle = 'rgba(203,211,224,.9)'; ctx.fillStyle = 'rgba(203,211,224,.14)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(lp.x, lp.y, 15, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#cbd3e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '15px ui-monospace,monospace'; ctx.fillText('⇅', lp.x, lp.y);
  ctx.font = '9px ui-monospace,monospace'; ctx.fillText(cur < floors.length - 1 ? 'lift ↑' : 'lift', lp.x, lp.y - 22); if (cur > 0) ctx.fillText('↓', lp.x, lp.y + 22);
  // the route + the player @
  if (route.length > rseg) { ctx.strokeStyle = 'rgba(244,191,98,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(SX(pp.x), SY(pp.y)); for (let i = rseg; i < route.length; i++) ctx.lineTo(SX(F.walk.pos[2 * route[i]]), SY(F.walk.pos[2 * route[i] + 1])); ctx.stroke(); }
  ambientGlow(ctx, SX(pp.x), SY(pp.y), 24, '#f4bf62'); ctx.fillStyle = '#0a0c10'; ctx.beginPath(); ctx.arc(SX(pp.x), SY(pp.y), 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#f4bf62'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px ui-monospace,monospace'; ctx.fillText('@', SX(pp.x), SY(pp.y) + 0.5);
  ctx.restore();
  // a PLAN label
  ctx.fillStyle = 'rgba(135,148,166,.7)'; ctx.textAlign = 'left'; ctx.font = '10px ui-monospace,monospace'; ctx.fillText('PLAN · floor ' + (cur + 1), SECW + 12, 18);
}

// the SECTION (elevation): the strata stacked, the lift threading them, you-are-here. The localizer.
function drawSection() {
  ctx.fillStyle = 'rgba(8,10,15,.9)'; ctx.fillRect(0, 0, SECW, CH);
  ctx.strokeStyle = '#1e2636'; ctx.beginPath(); ctx.moveTo(SECW, 0); ctx.lineTo(SECW, CH); ctx.stroke();
  ctx.fillStyle = 'rgba(135,148,166,.7)'; ctx.textAlign = 'left'; ctx.font = '10px ui-monospace,monospace'; ctx.fillText('SECTION', 12, 18);
  const n = floors.length, top = 54, bot = CH - 40, h = (bot - top) / n, cxC = SECW * 0.5;
  // the nave on top
  ctx.fillStyle = '#cbd3e0'; ctx.textAlign = 'center'; ctx.font = '11px ui-monospace,monospace'; ctx.fillText('⌂ the nave', cxC, top - 14);
  // the lift line through every floor
  ctx.strokeStyle = 'rgba(203,211,224,.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cxC, top - 4); ctx.lineTo(cxC, bot); ctx.stroke();
  sectionRects = [];
  for (let i = 0; i < n; i++) {
    const fl = n - 1 - i;            // draw top floor first (highest)
    const y = top + i * h, F = floors[fl], on = fl === cur;
    ctx.fillStyle = on ? tint(F.color, 0.5) : tint(F.color, 0.16); ctx.strokeStyle = on ? '#fff' : tint(F.color, 0.6); ctx.lineWidth = on ? 2 : 1;
    ctx.beginPath(); ctx.rect(14, y + 3, SECW - 28, h - 6); ctx.fill(); ctx.stroke();
    sectionRects.push({ fl, x: 14, y: y + 3, w: SECW - 28, h: h - 6 });
    ctx.fillStyle = on ? '#fff' : 'rgba(230,235,242,.8)'; ctx.textAlign = 'left'; ctx.font = (on ? 'bold ' : '') + '10px ui-monospace,monospace';
    ctx.fillText(F.label, 22, y + h / 2 + 0.5);
    if (on) { ctx.fillStyle = '#f4bf62'; ctx.beginPath(); ctx.arc(cxC, y + h / 2, 4.5, 0, 7); ctx.fill(); }   // you-are-here on the lift
  }
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(135,148,166,.6)'; ctx.font = '9px ui-monospace,monospace'; ctx.fillText('raw ↓ falls · product ↑ rises', cxC, bot + 16);
}
let sectionRects = [];

// ── nav ──
cv.addEventListener('pointerdown', (e) => {
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  if (mx < SECW) { for (const sr of sectionRects) if (mx >= sr.x && mx <= sr.x + sr.w && my >= sr.y && my <= sr.y + sr.h) { enterFloor(sr.fl, true); return; } return; }
  const F = floors[cur], dst = nearestNode(F.walk, wX(mx), wY(my)); if (dst < 0) return;
  // clicking the lift cell → offer to change floor handled by buttons; here just walk
  const p = pathFind(F.walk, player, dst); if (p && p.length > 1) { route = p; rseg = 1; }
});
$('up').addEventListener('click', () => { if (cur < floors.length - 1) enterFloor(cur + 1, true); });
$('down').addEventListener('click', () => { if (cur > 0) enterFloor(cur - 1, true); });
$('roll').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; build(); });

let _last = 0;
function frame(ts) {
  const dt = _last ? Math.min(0.05, (ts - _last) / 1000) : 0; _last = ts; clock += dt;
  const F = floors[cur];
  if (F && route.length > rseg) { let step = 95 * dt; while (route.length > rseg && step > 0) { const t = route[rseg], tx = F.walk.pos[2 * t], ty = F.walk.pos[2 * t + 1], dx = tx - pp.x, dy = ty - pp.y, d = Math.hypot(dx, dy); if (d <= step) { pp.x = tx; pp.y = ty; player = t; rseg++; step -= d; } else { pp.x += dx / d * step; pp.y += dy / d * step; step = 0; } } if (rseg >= route.length) { route = []; whereAmI(); } }
  render(); requestAnimationFrame(frame);
}
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); if (floors.length) fitPlan(); }
addEventListener('resize', resize);
resize(); build(); requestAnimationFrame(frame);
