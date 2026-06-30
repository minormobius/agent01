// 3d-app.js — the OPS WEAVE in 3D, two ways to read it:
//   ORBIT — the global woven hyperboloid: the volumetric foam + the 6 white / 8 production helices counter-
//           rotating in the rind shell, white hub at the top pole, production hub at the bottom. The tangle.
//   INHABIT THREAD — the mapping tech: pick a white thread and the shell UNROLLS around it. Your thread becomes
//           a straight vertical spine; the other white threads are parallel verticals; the production threads
//           SLANT across and cross your spine at 8 stations (the engines you meet, top→bottom). Switch threads
//           and the whole map re-organises around the new one — the puzzle box.

import { buildFoam3D } from './foam3d.js';
import { buildChamber } from './chamber.js';
import { buildNav, route } from './wayfind.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 1;
let sel = Q.has('w') ? (Q.get('w') | 0) % 6 : 0;
let view = ['thread', 'map'].includes(Q.get('view')) ? Q.get('view') : 'orbit';
let spin = true, yaw = 0.3, pitch = 1.0, zoom = 1, travel = 0;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0, now = 0;
let m = buildFoam3D(seed);
let pickList = [], chamber = null;     // click a chamber → its generated room
let nav = buildNav(m), routeA = -1, routeB = -1, theRoute = null;   // museum-map wayfinding

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244], BG = [6, 7, 12];
const SELC = [255, 224, 122], HUBW = [210, 226, 240], HUBP = [236, 210, 150];
// white arms coloured by FACTION (the nave lobes) — the two arms of a faction as two shades = representation
const warpCol = (w) => { if (w === sel) return SELC; const a = m.warps[w]; return mix(hex(a.factionColor), INK, (w % 2) * 0.22); };
const ownerColor = (o) => o.kind === 'warp' ? warpCol(o.idx) : o.kind === 'weft' ? hex(m.wefts[o.idx].color) : o.kind === 'whub' ? HUBW : HUBP;

// thread spines, sorted along the axis (for drawing tubes)
let spines = null;
function precompute() { spines = { white: m.whiteThreads.map((t) => ({ ...t, pts: t.cells.map((i) => m.nuclei[i]).sort((a, b) => a.zc - b.zc) })), prod: m.prodThreads.map((t) => ({ ...t, pts: t.cells.map((i) => m.nuclei[i]).sort((a, b) => a.zc - b.zc) })) }; }
precompute();

// ── ORBIT projection ──
function proj(x, y, z, s) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw); let x1 = x * cy - y * sy, y1 = x * sy + y * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch); let y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
  return { X: CW / 2 + x1 * s, Y: CH / 2 - z2 * s, depth: y2 };
}
function drawOrbit() {
  const s = Math.min(CW, CH) / (m.R * 2.7) * zoom;
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  // chambers back→front (the pancake foam, two layers)
  const pts = m.nuclei.map((n) => { const p = proj(n.x, n.y, n.z, s); return { n, p }; }).sort((a, b) => a.p.depth - b.p.depth);
  pickList = pts.map((o) => ({ i: o.n.i, X: o.p.X, Y: o.p.Y }));
  for (const { n, p } of pts) {
    const col = ownerColor(n.owner), sh = 0.55 + 0.45 * (p.depth / m.R + 1) / 2;   // far = dimmer
    const selR = (n.owner.kind === 'warp' && n.owner.idx === sel);
    ctx.fillStyle = rgba(mix(col, BG, n.over ? 0.12 : 0.46), (selR ? 0.97 : 0.78) * sh);
    ctx.beginPath(); ctx.arc(p.X, p.Y, (selR ? 4 : n.over ? 3 : 2.2) * Math.max(0.6, sh), 0, 7); ctx.fill();
  }
  // thread spines as ANALYTIC SPIRALS that WEAVE between the two planes (height = the over/under undulation)
  const spiral = (thFn, zFn, idx, col, lw, a) => {
    ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath();
    const SAMP = 130; for (let k = 0; k <= SAMP; k++) { const rf = k / SAMP, th = thFn(idx, rf), rad = rf * m.R, p = proj(rad * Math.cos(th), rad * Math.sin(th), zFn(idx, rf), s); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }
    ctx.stroke();
  };
  for (const t of m.wefts) spiral(m.thP, m.zProd, t.f, hex(t.color), 2.4, 0.5);
  for (const t of m.warps) if (t.w !== sel) spiral(m.thW, m.zWhite, t.w, warpCol(t.w), 2.2, 0.4);
  spiral(m.thW, m.zWhite, sel, SELC, 4.5, 0.98);
  // the 8 stations on the selected arm (where it crosses each production), at its woven height
  for (const st of m.tours[sel].stops) { const th = m.thW(sel, st.rf), rad = st.rf * m.R, p = proj(rad * Math.cos(th), rad * Math.sin(th), m.zWhite(sel, st.rf), s); ctx.fillStyle = rgba(SELC, 0.95); ctx.beginPath(); ctx.arc(p.X, p.Y, 4.5, 0, 7); ctx.fill(); }
  // the two centre hubs — white ABOVE production (six starts above eight), disconnected
  const hub = (z, col, label, dy) => { const p = proj(0, 0, z, s); ctx.fillStyle = rgba(col, 0.97); ctx.beginPath(); ctx.arc(p.X, p.Y, 9, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(INK, 0.5); ctx.lineWidth = 1.4; ctx.stroke(); ctx.fillStyle = rgba(col, 0.95); ctx.textAlign = 'center'; ctx.font = '11px ui-sans-serif'; ctx.fillText(label, p.X, p.Y + dy); };
  hub(m.T / 2, HUBW, '△ white hub (6, upper)', -14); hub(-m.T / 2, HUBP, '▽ production hub (8, lower)', 20);
}

// ── INHABIT THREAD: unroll the disc around white arm `sel` (centre/hub at top → rim at bottom) ──
function drawThread() {
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  const topY = 58, botY = CH - 34, Hh = botY - topY, spineX = CW * 0.40, latScale = (CW * 0.42) / Math.PI * zoom;
  const sY = (rf) => topY + rf * Hh;                              // rf=0 (centre/hub) at top, rf=1 (rim) at bottom
  const X = (lat) => spineX + lat * latScale;

  // foam texture: every chamber, placed by (lateral offset from your arm, radius), coloured by owner
  pickList = [];
  for (const n of m.nuclei) {
    if (n.hub) continue;
    const lat = m.swrap(n.th - m.thW(sel, n.rf)), x = X(lat) + (n.over ? 4 : -4), y = sY(n.rf);
    if (x < -20 || x > CW + 20) continue;
    pickList.push({ i: n.i, X: x, Y: y });
    const col = ownerColor(n.owner), selR = (n.owner.kind === 'warp' && n.owner.idx === sel);
    ctx.fillStyle = rgba(mix(col, BG, n.over ? 0.2 : 0.5), selR ? 0.95 : 0.66);
    ctx.beginPath(); ctx.arc(x, y, selR ? 3.4 : n.over ? 2.6 : 1.9, 0, 7); ctx.fill();
  }
  // production arms SLANT across (counter-twist) — polyline, split on wrap
  const SAMP = 60;
  for (const t of m.prodThreads) { const col = hex(t.color); ctx.strokeStyle = rgba(col, 0.72); ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); let px = null; for (let k = 0; k <= SAMP; k++) { const rf = k / SAMP, lat = m.swrap(m.thP(t.f, rf) - m.thW(sel, rf)), x = X(lat), y = sY(rf); if (px !== null && Math.abs(x - px) > CW * 0.5) { ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y); } else if (px === null) ctx.moveTo(x, y); else ctx.lineTo(x, y); px = x; } ctx.stroke();
  }
  // other white arms = parallel verticals (same twist → fixed lateral offset)
  for (const t of m.whiteThreads) { if (t.w === sel) continue; const x = X(m.swrap((t.w - sel) * 2 * Math.PI / 6)); ctx.strokeStyle = rgba(warpCol(t.w), 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, sY(0)); ctx.lineTo(x, sY(1)); ctx.stroke(); }
  // YOUR arm = the bright vertical spine
  ctx.strokeStyle = rgba(SELC, 0.97); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(spineX, sY(0)); ctx.lineTo(spineX, sY(1)); ctx.stroke();

  // the 8 stations: where each production arm crosses your spine (centre → rim)
  m.tours[sel].stops.forEach((st, n2) => { const y = sY(st.rf);
    ctx.fillStyle = rgba(SELC, 1); ctx.beginPath(); ctx.arc(spineX, y, 10, 0, 7); ctx.fill(); ctx.strokeStyle = rgba([245, 248, 255], 0.95); ctx.lineWidth = 1.8; ctx.stroke();
    ctx.fillStyle = '#1a1406'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 10px ui-monospace'; ctx.fillText(String(n2 + 1), spineX, y); ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgba(hex(m.wefts[st.f].color), 0.95); ctx.textAlign = 'left'; ctx.font = '11px ui-monospace'; ctx.fillText(`${m.wefts[st.f].glyph} ${st.label}  ${st.over ? '△ over' : '▽ under'}`, spineX + 16, y + 4);
  });
  // the centre hub (you enter here, top), the rim (bottom), the traveller
  ctx.fillStyle = rgba(HUBW, 0.97); ctx.beginPath(); ctx.arc(spineX, sY(0), 9, 0, 7); ctx.fill(); ctx.fillStyle = rgba(INK, 0.9); ctx.textAlign = 'center'; ctx.font = '11px ui-sans-serif'; ctx.fillText('△ white hub — centre, you enter here', spineX, sY(0) - 13);
  ctx.fillStyle = rgba(HUBP, 0.85); ctx.textAlign = 'center'; ctx.font = '10px ui-monospace'; ctx.fillText('(production hub is the same centre, lower layer — only reached by crossing the weave)', spineX, sY(0) + 30);
  ctx.fillStyle = rgba(INK, 0.6); ctx.fillText('▽ rim', spineX, sY(1) + 18);
  const ty = sY(travel); ctx.fillStyle = rgba([245, 248, 255], 1); ctx.beginPath(); ctx.arc(spineX, ty, 5.5, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(BG, 0.7); ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = rgba(INK, 0.7); ctx.textAlign = 'right'; ctx.font = '10px ui-monospace'; ctx.fillText('lateral ← unrolled ring →', CW - 12, topY - 8);
}

// ── MAKE A CHAMBER: draw the generated room of the clicked chamber as an inset plan ──
function drawChamberInset(ch) {
  const PW = 296, PH = 300, PX = 14, PY = CH - PH - 12;
  ctx.fillStyle = 'rgba(8,9,14,0.92)'; ctx.strokeStyle = rgba([40, 48, 66], 1); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.rect(PX, PY, PW, PH); ctx.fill(); ctx.stroke();
  // fit the room footprint into the upper area
  let minu = 1e9, maxu = -1e9, minv = 1e9, maxv = -1e9; for (const p of ch.poly) { minu = Math.min(minu, p[0]); maxu = Math.max(maxu, p[0]); minv = Math.min(minv, p[1]); maxv = Math.max(maxv, p[1]); }
  const w = (maxu - minu) || 1, h = (maxv - minv) || 1, cx = PX + PW / 2, cy = PY + 116, sc = Math.min((PW - 64) / w, 150 / h);
  const T = (u, v) => [cx + (u - (minu + maxu) / 2) * sc, cy + (v - (minv + maxv) / 2) * sc];
  const aCol = ch.arm.kind === 'white' || ch.arm.kind === 'whub' ? [150, 200, 220] : ch.arm.color ? hex(ch.arm.color) : [200, 180, 120];
  // floor
  ctx.fillStyle = rgba(mix(aCol, BG, ch.layer === 'upper' ? 0.62 : 0.74), 0.5); ctx.beginPath(); ch.poly.forEach((p, i) => { const s = T(p[0], p[1]); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.closePath(); ctx.fill();
  // walls = structural edges, split around each door gap
  for (let k = 0; k < ch.poly.length; k++) {
    const a = ch.poly[k], b = ch.poly[(k + 1) % ch.poly.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const door = ch.doors.find((d) => { const t = ((d.mid[0] - a[0]) * dir[0] + (d.mid[1] - a[1]) * dir[1]); const px = a[0] + dir[0] * t, py = a[1] + dir[1] * t; return t > 0 && t < len && Math.hypot(d.mid[0] - px, d.mid[1] - py) < 2; });
    ctx.strokeStyle = rgba([150, 162, 186], 0.95); ctx.lineWidth = 3; ctx.lineCap = 'butt';
    if (!door) { const s1 = T(a[0], a[1]), s2 = T(b[0], b[1]); ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.stroke(); }
    else { const g1 = [door.mid[0] - dir[0] * door.width / 2, door.mid[1] - dir[1] * door.width / 2], g2 = [door.mid[0] + dir[0] * door.width / 2, door.mid[1] + dir[1] * door.width / 2];
      const s1 = T(a[0], a[1]), sg1 = T(g1[0], g1[1]), sg2 = T(g2[0], g2[1]), s2 = T(b[0], b[1]);
      ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(sg1[0], sg1[1]); ctx.moveTo(sg2[0], sg2[1]); ctx.lineTo(s2[0], s2[1]); ctx.stroke();
      // door label to the neighbour
      const dc = ch.arm.kind, nc = door.to.kind === 'white' ? [150, 200, 220] : door.to.color ? hex(door.to.color) : [180, 180, 190]; void dc;
      ctx.fillStyle = rgba(nc, 0.9); ctx.font = '8px ui-monospace'; ctx.textAlign = 'center'; const mid = T(door.mid[0], door.mid[1]); ctx.fillText('▸' + door.to.label.split(' ')[0], mid[0], mid[1] - 3);
    }
  }
  // structural columns at the corners (where doors must never reach)
  for (const p of ch.poly) { const s = T(p[0], p[1]); ctx.fillStyle = rgba([90, 100, 120], 0.95); ctx.fillRect(s[0] - 2.2, s[1] - 2.2, 4.4, 4.4); }
  // the fixture at the centre
  ctx.fillStyle = rgba(aCol, 0.95); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '18px ui-monospace'; ctx.fillText(ch.fixture.glyph, cx, cy); ctx.textBaseline = 'alphabetic';
  // the stair (facility) to the other layer
  if (ch.stair) { const sx = cx + 34, sy = cy - 30; ctx.strokeStyle = rgba([235, 235, 245], 0.8); ctx.lineWidth = 1; ctx.strokeRect(sx - 8, sy - 8, 16, 16); for (let g = -6; g <= 6; g += 4) { ctx.beginPath(); ctx.moveTo(sx - 8, sy + g); ctx.lineTo(sx + 8, sy + g); ctx.stroke(); }
    ctx.fillStyle = rgba([235, 235, 245], 0.95); ctx.font = '9px ui-monospace'; ctx.textAlign = 'left'; ctx.fillText(ch.stair.dir === 'up' ? '▲' : '▼', sx + 11, sy + 3); }
  // caption
  ctx.textAlign = 'left'; let ty = PY + PH - 78;
  ctx.fillStyle = rgba(INK, 0.95); ctx.font = 'bold 11px ui-sans-serif'; ctx.fillText(ch.fixture.label, PX + 12, ty); ty += 16;
  ctx.fillStyle = rgba([150, 160, 184], 0.95); ctx.font = '10px ui-monospace';
  ctx.fillText(`${ch.layer} layer · on the ${ch.arm.label} ${ch.arm.kind === 'white' ? 'arm' : ch.arm.kind === 'prod' ? 'line' : 'hub'}`, PX + 12, ty); ty += 14;
  ctx.fillText(`${ch.doors.length} doors (mid-wall, columns intact)`, PX + 12, ty); ty += 14;
  if (ch.stair) ctx.fillStyle = rgba(ch.stair.facility ? [110, 207, 138] : [150, 160, 184], 0.95), ctx.fillText(`stair ${ch.stair.dir} → ${ch.stair.to.label}${ch.stair.facility ? '  (the facility)' : ''}`, PX + 12, ty);
  else ctx.fillStyle = rgba([224, 122, 106], 0.95), ctx.fillText('no stair — a hub, kept disconnected', PX + 12, ty);
  ty += 16; ctx.fillStyle = rgba([110, 120, 144], 0.9); ctx.font = '9px ui-monospace'; ctx.fillText('click another chamber · ✕ to close', PX + 12, ty);
  ch._close = { x: PX + PW - 22, y: PY + 8, w: 14, h: 14 };
  ctx.strokeStyle = rgba([150, 160, 184], 0.8); ctx.strokeRect(ch._close.x, ch._close.y, 14, 14); ctx.fillStyle = rgba([150, 160, 184], 0.9); ctx.textAlign = 'center'; ctx.fillText('✕', ch._close.x + 7, ch._close.y + 11);
}

// ── MUSEUM MAP: the two layers exploded apart; click two chambers → a wayfinding route across the weave ──
function drawMap() {
  const s = Math.min(CW, CH) / (m.R * 2.7) * zoom, G = m.R * 0.52;
  const zMap = (n) => n.z * (G / (m.T / 2));      // amplify the weave undulation to the exploded gap
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  // the two layer discs (faint rings)
  for (const lz of [-G, G]) { ctx.strokeStyle = rgba([60, 72, 96], 0.4); ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0; k <= 64; k++) { const a = k / 64 * Math.PI * 2, p = proj(m.R * Math.cos(a), m.R * Math.sin(a), lz, s); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); } ctx.stroke(); }
  // chambers back→front
  const pts = m.nuclei.map((n) => { const p = proj(n.x, n.y, zMap(n), s); return { n, p }; }).sort((a, b) => a.p.depth - b.p.depth);
  pickList = pts.filter((o) => !o.n.hub).map((o) => ({ i: o.n.i, X: o.p.X, Y: o.p.Y }));
  for (const { n, p } of pts) {
    const col = n.hub === 'whub' ? HUBW : n.hub === 'phub' ? HUBP : ownerColor(n.owner);
    ctx.fillStyle = rgba(mix(col, BG, n.over ? 0.12 : 0.42), 0.82);
    ctx.beginPath(); ctx.arc(p.X, p.Y, n.hub ? 6 : (n.over ? 2.6 : 2.1), 0, 7); ctx.fill();
  }
  // the route
  if (theRoute) {
    ctx.strokeStyle = rgba([245, 246, 255], 0.95); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
    theRoute.path.forEach((i, k) => { const n = m.nuclei[i], p = proj(n.x, n.y, zMap(n), s); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }); ctx.stroke();
    // highlight the stair crossings (where the route changes layer = goes through the weave)
    for (let k = 1; k < theRoute.path.length; k++) { const u = m.nuclei[theRoute.path[k - 1]], v = m.nuclei[theRoute.path[k]]; if (u.over !== v.over) { const pu = proj(u.x, u.y, zMap(u), s), pv = proj(v.x, v.y, zMap(v), s); ctx.strokeStyle = rgba(SELC, 0.97); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(pu.X, pu.Y); ctx.lineTo(pv.X, pv.Y); ctx.stroke(); ctx.fillStyle = rgba(SELC, 1); ctx.beginPath(); ctx.arc((pu.X + pv.X) / 2, (pu.Y + pv.Y) / 2, 3.5, 0, 7); ctx.fill(); } }
  }
  // endpoints
  for (const [id, col, lab] of [[routeA, [110, 207, 138], 'start'], [routeB, [230, 120, 200], 'end']]) if (id >= 0) { const n = m.nuclei[id], p = proj(n.x, n.y, zMap(n), s); ctx.fillStyle = rgba(col, 1); ctx.beginPath(); ctx.arc(p.X, p.Y, 7, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(BG, 0.6); ctx.lineWidth = 1.6; ctx.stroke(); ctx.fillStyle = rgba(col, 0.95); ctx.textAlign = 'center'; ctx.font = '10px ui-sans-serif'; ctx.fillText(lab, p.X, p.Y - 11); }
  // layer captions
  const up = proj(0, -m.R * 1.12, G, s), lo = proj(0, m.R * 1.12, -G, s);
  ctx.fillStyle = rgba([150, 170, 200], 0.85); ctx.textAlign = 'center'; ctx.font = '12px ui-monospace'; ctx.fillText('△ upper layer — over', up.X, up.Y);
  ctx.fillStyle = rgba([186, 152, 110], 0.85); ctx.fillText('▽ lower layer — under', lo.X, lo.Y);
}

function frame(ts) {
  const dt = (ts - now) || 16; now = ts;
  if (view === 'orbit' && spin) yaw += dt * 0.00018;
  if (view === 'map' && spin) yaw += dt * 0.00010;
  if (view === 'thread') { travel += dt * 0.00010; if (travel > 1) travel = 0; }   // ride the arm centre→rim
  (view === 'orbit' ? drawOrbit : view === 'thread' ? drawThread : drawMap)();
  if (chamber && view !== 'map') drawChamberInset(chamber);
  requestAnimationFrame(frame);
}

function panels() {
  const title = view === 'orbit' ? 'orbit — the woven pancake' : view === 'thread' ? 'inhabit thread — the map from your arm' : 'museum map — wayfinding across the exploded layers';
  const blurb = view === 'orbit' ? 'drag to orbit, scroll/pinch to zoom. 6 white arms spiral from the upper-centre hub, 8 production from the lower-centre hub — the six starts sit above the eight. Click a chamber to make its room.'
    : view === 'thread' ? 'your arm is the bright spine (centre/hub at top → rim at bottom); production arms slant across and cross it at the 8 stations. Pick another surface — the map re-organises around it.'
      : (theRoute ? `route: <b>${theRoute.doors}</b> doors + <b style="color:#ffe07a">${theRoute.stairs}</b> stair(s). Every stair is the route crossing the weave (upper↔lower) — the only way to join the two hubs.` : 'the two layers exploded apart. Click a <b style="color:#6ecf8a">start</b> chamber then an <b style="color:#e678c8">end</b> — the route threads doors and climbs stairs (each stair = crossing the weave). Pinch/scroll to zoom, drag to turn.');
  $('read').innerHTML = `<b>${title}</b> · 3D pancake foam ${m.nuclei.length} chambers, two layers · <span class="ok">${m.contactPairs}/48 (K(6,8))</span> · seed ${seed}<br><span>${blurb}</span>`;
  $('wsel').innerHTML = m.factions.map((fac) => {
    const arms = m.warps.filter((w) => w.faction === fac.id);
    return `<div style="font-size:10px;color:${fac.color};text-transform:uppercase;letter-spacing:.08em;margin:7px 0 3px">${fac.label} · ${fac.verbs.join(' · ')}</div>` +
      arms.map((w) => `<div class="w ${w.w === sel ? 'sel' : ''}" data-w="${w.w}"><div class="k" ${w.w === sel ? '' : `style="background:${fac.color};color:#0a0d14"`}>${w.w + 1}</div><div class="lab">${w.label}</div></div>`).join('');
  }).join('');
  for (const el of $('wsel').querySelectorAll('.w')) el.addEventListener('click', () => { sel = +el.dataset.w; sync(); });
  const t = m.tours[sel];
  $('itin').innerHTML = t.stops.map((st, n) => `<div class="stop"><span class="n">${n + 1}.</span><span class="g">${st.glyph}</span><span>${st.label}</span><span class="ou">${st.over ? '△ over' : '▽ under'}</span></div>`).join('');
  $('elist').innerHTML = m.wefts.map((e) => `<div class="e"><span class="sw" style="background:${e.color}"></span><span><span class="nm">${e.glyph} ${e.label}</span> — <span class="nt">${e.note}</span></span></div>`).join('');
  $('note').innerHTML = `<b>Representation:</b> the 6 ops surfaces are two per faction — Rindwalker (health-keepers), Continuant (planners/stewards), Drift (circulators) — the nave's three lobes. Inhabiting <b>${m.warps[sel].label}</b> (${m.warps[sel].factionLabel}): you ride your arm out from the centre hub, meeting all 8 production lines. The two hubs never touch directly — only through the weave.`;
}

function sync() {
  $('orbit').classList.toggle('on', view === 'orbit'); $('thread').classList.toggle('on', view === 'thread'); $('map').classList.toggle('on', view === 'map'); $('spin').classList.toggle('on', spin);
  const u = new URLSearchParams(); if (seed !== 1) u.set('seed', seed); u.set('w', sel); u.set('view', view); history.replaceState(null, '', '?' + u.toString());
  panels();
}

$('orbit').addEventListener('click', () => { view = 'orbit'; sync(); });
$('thread').addEventListener('click', () => { view = 'thread'; sync(); });
$('map').addEventListener('click', () => { view = 'map'; chamber = null; sync(); });
$('spin').addEventListener('click', () => { spin = !spin; sync(); });
$('reseed').addEventListener('click', () => { seed = (seed + 1) >>> 0; m = buildFoam3D(seed); nav = buildNav(m); chamber = null; routeA = routeB = -1; theRoute = null; precompute(); sync(); });
$('reset').addEventListener('click', () => { yaw = 0.3; pitch = 1.0; zoom = 1; travel = 0; routeA = routeB = -1; theRoute = null; });
addEventListener('keydown', (e) => { const k = '123456'.indexOf(e.key); if (k >= 0) { sel = k; sync(); } if (e.key === 'v') { view = view === 'orbit' ? 'thread' : 'orbit'; sync(); } });
let drag = false, lx = 0, ly = 0, moved = 0;
const ptrs = new Map(); let pinchD = 0;
cv.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); drag = true; lx = e.clientX; ly = e.clientY; moved = 0; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); if (ptrs.size === 2) { const v = [...ptrs.values()]; pinchD = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); } });
cv.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { const v = [...ptrs.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); if (pinchD) { zoom = Math.max(0.5, Math.min(3.5, zoom * d / pinchD)); } pinchD = d; moved += 99; return; }   // pinch
  if (!drag) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
  if (view === 'thread') travel = Math.max(0, Math.min(1, travel - dy * 0.002));
  else { yaw += dx * 0.008; pitch = Math.max(-1.4, Math.min(1.4, pitch + dy * 0.006)); }
});
cv.addEventListener('pointerup', (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinchD = 0; drag = ptrs.size > 0; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
  if (moved > 6) return;                                          // a drag/pinch, not a click
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (chamber && chamber._close && px >= chamber._close.x && px <= chamber._close.x + 14 && py >= chamber._close.y && py <= chamber._close.y + 14) { chamber = null; return; }
  let best = -1, bd = 16 * 16; for (const p of pickList) { const d = (p.X - px) ** 2 + (p.Y - py) ** 2; if (d < bd) { bd = d; best = p.i; } }
  if (best < 0) return;
  if (view === 'map') { if (routeA < 0 || routeB >= 0) { routeA = best; routeB = -1; theRoute = null; } else { routeB = best; theRoute = route(nav, routeA, routeB); } panels(); }
  else chamber = buildChamber(m, best);
});
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.5, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
addEventListener('resize', resize);
resize(); sync(); requestAnimationFrame(frame);
