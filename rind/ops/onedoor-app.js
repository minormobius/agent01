// onedoor-app.js — the ONE-DOOR view. Same prism + Voronoi + weave as prism.html, but the chambers are coloured by
// which of the TWO concourses they belong to (white / production), the 48 K(6,8) crossings are drawn as zero-grade
// DOORS, and the route tool proves the headline live: pick ANY two chambers and it is always ≤ 1 door — 0 inside a
// concourse, exactly 1 across. The certificate panel is the offline proof (onedoor.selftest.mjs), recomputed per build.

import { buildGeometry, weaveLines, layWeave } from './weave3d.js';
import { buildCells } from './cells3d.js';
import { certify, routeGraded } from './onedoor.js';
import { buildCurveModel } from './curveseed.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 1;
let width = 6, spacing = 30, flatR = 0.16, rings = 1, layers = 8, NW = 6, NF = 8;
let spin = true, byConcourse = true, showDoors = true, routeMode = false, peel = 0, solid = true, substrate = 'curve', showCurves = true, ownership = 'watershed', gradeMode = 'overunder';
let yaw = 0.4, pitch = 0.95, zoom = 1;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let geo = null, cellsModel = null, geomKey = '', m = null, cert = null;
let routeA = -1, routeB = -1, theRoute = null, routeSet = null, pickCells = [];

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244], BG = [6, 7, 12], GOLD = [255, 224, 122], WHITE_C = [225, 229, 240], PROD_C = [72, 150, 208], STEEP = [230, 120, 120];
geo = buildGeometry(seed, { rings, spacing, layers, NW, NF });
const warpCol = (w) => mix(hex(geo.warps[w].color), INK, (w % 2) * 0.28);
const prodCol = (f) => hex(geo.wefts[f].color);
// concourse colour (2 colours, default) OR each thread's own colour (the N×M = 6+8 = 14-colour map). In arm mode
// every chamber is coloured — matrix cells inherit their nearest arm (cert stamps c.armFill), so no cell reads grey.
function cellColor(c) {
  if (byConcourse) return cert && cert.color[c.gi] === 'white' ? WHITE_C : PROD_C;
  const a = c.owner || c.armFill;
  return a ? (a.kind === 'white' ? warpCol(a.idx) : prodCol(a.idx)) : [70, 80, 100];
}

function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}

function proj(x, y, z, s) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw); const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch); const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
  return { X: CW / 2 + x1 * s, Y: CH / 2 - z2 * s, depth: y2 };
}

function recomputeRoute() { theRoute = (cert && routeA >= 0 && routeB >= 0) ? routeGraded(cert.graph, routeA, routeB, m.maxGrade || 0.6) : null; routeSet = theRoute ? new Set(theRoute.path) : null; }

function draw() {
  const s = Math.min(CW, CH) / (m.R * 2.5) * zoom, zc = m.thickness / 2;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  const cutoff = (1 - peel) * m.thickness + m.thickness * 1e-3;

  const faceHex = (z, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); m.footprint.forEach((v, i) => { const p = proj(v[0], v[1], z - zc, s); i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }); ctx.closePath(); ctx.stroke(); };
  faceHex(0, rgba([90, 106, 140], 0.4), 1.2); faceHex(peel > 0 ? cutoff : m.thickness, rgba([120, 138, 178], 0.5), 1.2);
  ctx.strokeStyle = rgba([70, 84, 112], 0.3); ctx.lineWidth = 1; for (const v of m.footprint) { const a = proj(v[0], v[1], -zc, s), b = proj(v[0], v[1], (peel > 0 ? cutoff : m.thickness) - zc, s); ctx.beginPath(); ctx.moveTo(a.X, a.Y); ctx.lineTo(b.X, b.Y); ctx.stroke(); }
  if (peel > 0) faceHex(cutoff, rgba(GOLD, 0.45), 1.3);

  pickCells = [];
  if (cellsModel) {
    const drawn = [];
    for (const c of cellsModel.cells) { if (c.z > cutoff) continue; const pc = proj(c.x, c.y, c.z - zc, s); drawn.push({ c, depth: pc.depth, X: pc.X, Y: pc.Y }); }
    drawn.sort((a, b) => a.depth - b.depth);
    for (const d of drawn) {
      const c = d.c, col = cellColor(c), sh = 0.55 + 0.45 * (d.depth / m.R + 1) / 2, inRoute = routeSet && routeSet.has(c.gi);
      const isW = byConcourse && cert && cert.color[c.gi] === 'white';
      // SOLID (opaque, for inspecting the polyhedra — peel to see inside) vs ghost (translucent, see the whole weave)
      const bgMix = solid ? (isW ? 0.02 : 0.06) : (isW ? 0.04 : 0.2);
      const alpha = inRoute ? 0.99 : solid ? 0.985 : byConcourse ? (isW ? 0.9 : 0.5) : 0.66;
      const hull = convexHull(c.verts.map((v) => { const p = proj(v[0], v[1], v[2] - zc, s); return [p.X, p.Y]; }));
      if (hull.length >= 3) {
        ctx.beginPath(); hull.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
        ctx.fillStyle = rgba(mix(col, BG, bgMix), alpha * sh); ctx.fill();
        ctx.strokeStyle = rgba(solid ? mix(col, BG, 0.62) : mix(col, BG, 0.5), (solid ? 0.85 : 0.4) * sh); ctx.lineWidth = solid ? 0.8 : 0.6; ctx.stroke();
        if (inRoute) { ctx.strokeStyle = rgba(GOLD, 0.95); ctx.lineWidth = 1.8; ctx.stroke(); }
      }
      pickCells.push({ gi: c.gi, X: d.X, Y: d.Y });
    }
  }

  // the 48 doors — a gold gate spanning the white cell and its production partner, at the zero-grade flat
  if (showDoors && cert) {
    for (const dr of cert.doors) {
      const a = cellsModel.cells[dr.a], b = cellsModel.cells[dr.b];
      if (a.z > cutoff || b.z > cutoff) continue;
      const pa = proj(a.x, a.y, a.z - zc, s), pb = proj(b.x, b.y, b.z - zc, s);
      const steep = dr.grade > (cert.gradeCap || 0.6), col = steep ? STEEP : GOLD;
      ctx.strokeStyle = rgba(col, steep ? 0.75 : 0.9); ctx.lineWidth = steep ? 1.6 : 2.4; ctx.setLineDash(steep ? [3, 3] : []);
      ctx.beginPath(); ctx.moveTo(pa.X, pa.Y); ctx.lineTo(pb.X, pb.Y); ctx.stroke(); ctx.setLineDash([]);
      const mx = (pa.X + pb.X) / 2, my = (pa.Y + pb.Y) / 2;
      ctx.fillStyle = rgba(col, 0.95); ctx.beginPath(); ctx.arc(mx, my, steep ? 2.4 : 3.4, 0, 7); ctx.fill();
    }
  }

  // the ANALYTIC SEEDING CURVES — the 14 thread centrelines (lineW / lineP) the nuclei are placed along. Drawn on
  // top so you can read the ideal curve against the grown cells, and a dot at each rim exit so all 14 are visible on
  // the outer surface. Coloured by thread.
  if (showCurves && m.lineW) {
    const spine = (lineFn, idx, col) => {
      ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 2.1; ctx.lineCap = 'round'; ctx.beginPath();
      const N = 140; let last = null;
      for (let k = 0; k <= N; k++) { const rf = 0.014 + 0.986 * k / N, p = lineFn(idx, rf); if (p[2] > cutoff) { last = null; continue; } const P = proj(p[0], p[1], p[2] - zc, s); last ? ctx.lineTo(P.X, P.Y) : ctx.moveTo(P.X, P.Y); last = P; }
      ctx.stroke();
      const e = lineFn(idx, 1); if (e[2] <= cutoff) { const P = proj(e[0], e[1], e[2] - zc, s); ctx.fillStyle = rgba(col, 1); ctx.beginPath(); ctx.arc(P.X, P.Y, 3.4, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(BG, 0.9); ctx.lineWidth = 1; ctx.stroke(); }
    };
    for (let f = 0; f < m.NF; f++) spine(m.lineP, f, prodCol(f));
    for (let w = 0; w < m.NW; w++) spine(m.lineW, w, warpCol(w));
  }

  if (theRoute && cellsModel) {
    ctx.strokeStyle = rgba(GOLD, 0.97); ctx.lineWidth = 2.8; ctx.lineCap = 'round'; ctx.beginPath();
    theRoute.path.forEach((gi, i) => { const c = cellsModel.cells[gi], p = proj(c.x, c.y, c.z - zc, s); i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }); ctx.stroke();
  }
  [[routeA, [110, 220, 140]], [routeB, [230, 120, 200]]].forEach(([gi, col]) => { if (gi < 0 || !cellsModel) return; const c = cellsModel.cells[gi], p = proj(c.x, c.y, c.z - zc, s); ctx.fillStyle = rgba(col, 0.98); ctx.beginPath(); ctx.arc(p.X, p.Y, 6, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(INK, 0.8); ctx.lineWidth = 1.4; ctx.stroke(); });
}

function panels() {
  $('widthV').textContent = width; $('densV').textContent = `${m.cells.length} rooms`; $('flatV').textContent = flatR.toFixed(2);
  $('chunks').textContent = `⬡ ${geo.chunkCount}`;
  const cls = (bad) => bad ? 'v bad' : 'v ok', pc = (x) => `${(x * 100).toFixed(0)}%`;
  $('cert').innerHTML = `
    <span class="k">★ spirals continuous (Voronoi)</span><span class="${cls(!cert.spiralsContinuous)}">${cert.threadsContinuous}/${cert.threadCount}${cert.spiralsContinuous ? '' : ' · worst ' + cert.worstThreadComps + ' pieces'}</span>
    <span class="k">★ any → any (measured max)</span><span class="${cls(cert.measuredMax > 1)}">${cert.measuredMax} door${cert.measuredMax === 1 ? '' : 's'}</span>
    <span class="k">white concourse</span><span class="${cls(cert.whiteComps !== 1)}">${cert.whiteComps === 1 ? '✓ 1 region' : cert.whiteComps + ' pieces'} · ${cert.whiteCells}</span>
    <span class="k">production concourse</span><span class="${cls(cert.prodComps !== 1)}">${cert.prodComps === 1 ? '✓ 1 region' : cert.prodComps + ' pieces'} · ${cert.prodCells}</span>
    <span class="k">partition (no third region)</span><span class="${cls(!cert.noMatrix)}">${cert.noMatrix ? '✓ complete' : '✗ gap'}</span>
    <span class="k">K(${geo.NW},${geo.NF}) doors opened</span><span class="${cls(!cert.k48)}">${cert.doorPairs}/${geo.NW * geo.NF}</span>
    <span class="k">of them, zero-grade (walkable)</span><span class="${cls(cert.steepDoors > 0)}">${cert.atGradeDoors}/${cert.doorCount}${cert.steepDoors ? ' · ' + cert.steepDoors + ' stair' : ''}</span>
    <span class="k">★ zero-ladder world</span><span class="${cls(cert.steepDoors > 0)}">${cert.steepDoors === 0 ? '✓ no stairs' : '✗ ' + cert.steepDoors + ' stair' + (cert.steepDoors === 1 ? '' : 's') + ' — fewer threads'}</span>
    <span class="k">central hubs → each other</span><span class="${cls(!cert.hubsOneDoor)}">${cert.hubRoute ? cert.hubRoute.doors + ' door' : '—'}</span>
    <span class="k">inside a hub (max doors)</span><span class="${cls(cert.hubInternalMax !== 0)}">${cert.hubInternalMax}</span>`;
  $('verdict').className = cert.oneDoorOk ? 'verdict ok' : 'verdict bad';
  const caveats = [];
  if (!cert.k48) caveats.push(`${cert.doorPairs}/${geo.NW * geo.NF} K-crossings open a door (the rest have no adjacency here — widen or add decks)`);
  if (cert.steepDoors > 0) caveats.push(`${cert.steepDoors} door${cert.steepDoors === 1 ? ' is a' : 's are'} over/under stair${cert.steepDoors === 1 ? '' : 's'}, not zero-grade`);
  $('verdict').innerHTML = cert.oneDoorOk
    ? `✓ any point → any point is ONE door — including the two hubs. Two door-free concourses, joined only by the K-doors.${caveats.length ? `<ul style="color:var(--dim)">${caveats.map((c) => `<li style="color:var(--dim)">${c}</li>`).join('')}</ul>` : ''}`
    : `✗ the one-door thesis broke:<ul>${cert.breaks.map((b) => `<li>${b}</li>`).join('')}</ul>`;
  const sub = substrate === 'curve'
    ? `<span class="k">substrate</span><span class="v">on-curve · ${m.curveCount} on curves + ${m.fillerCount} fill</span>
       <span class="k">rooms · pitch</span><span class="v">${m.cells.length} · ${m.pitch | 0}</span>`
    : `<span class="k">substrate</span><span class="v">HCP lattice · flood</span>
       <span class="k">rooms · path width</span><span class="v">${m.cells.length} · ${width} wide</span>`;
  $('levers').innerHTML = `
    ${sub}
    <span class="k">areal density</span><span class="v">a=${spacing}</span>
    <span class="k">decks (thickness)</span><span class="v">${geo.layers} · ${geo.thickness.toFixed(0)}</span>
    <span class="k">flat core</span><span class="v">${flatR.toFixed(2)}·R</span>
    <span class="k">chunks</span><span class="v">${geo.chunkCount} · hexR ${geo.hexR | 0}</span>
    <span class="k">avg doors (any→any)</span><span class="v">${cert.avgDoors.toFixed(2)} · ${cert.sampledPairs} pairs</span>`;
  routePanel();
  const subNote = substrate === 'curve'
    ? `<b>On-curve substrate:</b> the Voronoi nuclei are seeded ALONG the analytic thread curves (pitch ${m.pitch | 0}) with a sparse filler, then the polyhedra grow to fill the prism. Concourses are assigned by a geodesic flood from the two hubs (guaranteeing one connected region each). This substrate lands the full K(${geo.NW},${geo.NF}) with every door at grade.`
    : `<b>HCP substrate:</b> a homogeneous lattice claimed by the fair watershed; concourses hard-bind the arms + flood the matrix.`;
  $('note').innerHTML = `The 6 white arms + the <b>nave hub</b> are ONE door-free concourse; the 8 production arms + the bottom hub are another. Every other white↔production plate is a wall — the only doors are the ${cert.doorPairs} K(${geo.NW},${geo.NF}) crossings, each a <b>zero-grade</b> gate at the flat the weave lands. So walking your concourse is free, and any crossing is a single door. <b>⇆ route</b>: click any two rooms. seed ${seed}. ${subNote}`;
}
function routePanel() {
  if (routeA >= 0 && routeB < 0) { $('routeRead').innerHTML = `<span class="hint">start set — click the <b style="color:#e678c8">end</b> room.</span>`; return; }
  if (theRoute) { const d = theRoute.doors, g = theRoute.maxGrade, steep = g > (cert.gradeCap || 0.6) * 1.05; $('routeRead').innerHTML = `<span class="big">${d} door${d === 1 ? '' : 's'}</span><br><span class="sub">${d === 0 ? 'same concourse — a free walk' : 'across the concourses — one zero-grade door'} · ${theRoute.path.length} rooms · <b style="color:${steep ? 'var(--bad)' : 'var(--ok)'}">grade ${g.toFixed(2)}</b> ${steep ? '(steep!)' : '(walkable)'}</span>`; return; }
  $('routeRead').innerHTML = routeMode ? `<span class="hint">click a <b style="color:#6ecf8a">start</b> room, then an <b style="color:#e678c8">end</b> room — it is always ≤ 1 door.</span>` : `<span class="hint">click <b>⇆ route</b>, then any two rooms.</span>`;
}

function rebuild() {
  if (substrate === 'curve') {
    // nuclei seeded ALONG the analytic curves, polyhedra grown to fill (curveseed.js). Each build is self-contained.
    const pitch = Math.max(24, spacing);
    const key = `curve|${seed}|${rings}|${pitch}|${layers}|${NW}|${NF}|${flatR}|${width}|${ownership}|${gradeMode}`;
    if (key !== geomKey) { routeA = routeB = -1; theRoute = routeSet = null; }
    geomKey = key;
    m = buildCurveModel(seed, { rings, layers, NW, NF, flatR, pitch, width, ownership, grade: gradeMode === 'overunder' ? undefined : gradeMode }); geo = m; cellsModel = m.cellsModel;
    cert = certify(m);
  } else {
    const key = `hcp|${seed}|${rings}|${spacing}|${layers}|${NW}|${NF}`;
    if (key !== geomKey || !cellsModel) { geo = buildGeometry(seed, { rings, spacing, layers, NW, NF }); cellsModel = buildCells(geo); geomKey = key; routeA = routeB = -1; theRoute = routeSet = null; }
    const lines = weaveLines(geo, { flatR }), lay = layWeave(geo, cellsModel, lines, { width });
    m = { ...geo, ...lines, flatR: lines.flatR, width, cells: cellsModel.cells, cellsModel, metrics: lay.metrics };
    cert = certify(m);
  }
  if (routeA >= 0 && routeB >= 0) recomputeRoute();
  panels();
}

function frame() { if (spin) yaw += 0.0035; draw(); requestAnimationFrame(frame); }

$('width').addEventListener('change', (e) => { width = +e.target.value; rebuild(); });
$('dens').addEventListener('change', (e) => { spacing = 104 - +e.target.value; rebuild(); });
$('decks').addEventListener('change', (e) => { layers = +e.target.value; $('decksV').textContent = layers; rebuild(); });
$('nw').addEventListener('change', (e) => { NW = +e.target.value; $('nwnfV').textContent = `${NW}×${NF}`; rebuild(); });
$('nf').addEventListener('change', (e) => { NF = +e.target.value; $('nwnfV').textContent = `${NW}×${NF}`; rebuild(); });
$('flat').addEventListener('change', (e) => { flatR = (+e.target.value) / 100; rebuild(); });
$('peel').addEventListener('input', (e) => { peel = (+e.target.value) / 100; $('peelV').textContent = `${((1 - peel) * geo.layers).toFixed(1)} decks`; });
$('chunks').addEventListener('click', () => { rings = (rings + 1) % 3; rebuild(); });
$('substrate').addEventListener('click', () => { substrate = substrate === 'hcp' ? 'curve' : 'hcp'; $('substrate').textContent = substrate === 'hcp' ? '▦ HCP lattice' : '✳ on-curve'; $('substrate').classList.toggle('on', substrate === 'curve'); const cs = substrate === 'curve' ? '' : 'none'; $('ownership').style.display = cs; $('grademode').style.display = cs; geomKey = ''; rebuild(); });
$('ownership').addEventListener('click', () => { ownership = ownership === 'watershed' ? 'nearest' : 'watershed'; $('ownership').textContent = ownership === 'watershed' ? '◐ watershed' : '◑ nearest'; $('ownership').classList.toggle('on', ownership === 'nearest'); geomKey = ''; rebuild(); });
$('grademode').addEventListener('click', () => { gradeMode = gradeMode === 'overunder' ? 'flat' : gradeMode === 'flat' ? 'meet' : 'overunder'; $('grademode').textContent = { overunder: '≋ over/under', flat: '≋ flat', meet: '≋ meet-grade' }[gradeMode]; $('grademode').classList.toggle('on', gradeMode !== 'overunder'); geomKey = ''; rebuild(); });
$('mode').addEventListener('click', () => { byConcourse = !byConcourse; $('mode').classList.toggle('on', byConcourse); $('mode').textContent = byConcourse ? '◧ 2 concourses' : `◧ ${NW + NF} threads`; });
$('solid').addEventListener('click', () => { solid = !solid; $('solid').classList.toggle('on', solid); $('solid').textContent = solid ? '⬢ solid' : '⬡ ghost'; });
$('doors').addEventListener('click', () => { showDoors = !showDoors; $('doors').classList.toggle('on', showDoors); });
$('curves').addEventListener('click', () => { showCurves = !showCurves; $('curves').classList.toggle('on', showCurves); });
$('route').addEventListener('click', () => { routeMode = !routeMode; $('route').classList.toggle('on', routeMode); if (!routeMode) { routeA = routeB = -1; theRoute = routeSet = null; } routePanel(); });
$('spin').addEventListener('click', () => { spin = !spin; $('spin').classList.toggle('on', spin); });
$('reseed').addEventListener('click', () => { seed = (seed + 1) >>> 0; rebuild(); });
$('reset').addEventListener('click', () => { yaw = 0.4; pitch = 0.95; zoom = 1; });

let drag = false, lx = 0, ly = 0, moved = 0; const ptrs = new Map(); let pinchD = 0;
cv.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); drag = true; lx = e.clientX; ly = e.clientY; moved = 0; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); if (ptrs.size === 2) { const v = [...ptrs.values()]; pinchD = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); } });
cv.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { const v = [...ptrs.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); if (pinchD) zoom = Math.max(0.5, Math.min(3, zoom * d / pinchD)); pinchD = d; moved += 99; return; }
  if (!drag) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy); yaw += dx * 0.008; pitch = Math.max(-1.4, Math.min(1.4, pitch + dy * 0.006));
});
cv.addEventListener('pointerup', (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinchD = 0; drag = ptrs.size > 0; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
  if (moved > 6 || !routeMode) return;
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  let best = -1, bd = 18 * 18; for (const p of pickCells) { const d = (p.X - px) ** 2 + (p.Y - py) ** 2; if (d < bd) { bd = d; best = p.gi; } }
  if (best < 0) return;
  if (routeA < 0 || routeB >= 0) { routeA = best; routeB = -1; theRoute = routeSet = null; } else { routeB = best; recomputeRoute(); }
  routePanel();
});
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.5, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; }
addEventListener('resize', resize);
$('width').value = width; $('decks').value = layers; $('decksV').textContent = layers; $('nw').value = NW; $('nf').value = NF; $('nwnfV').textContent = `${NW}×${NF}`; $('peelV').textContent = `${geo.layers.toFixed(1)} decks`;
$('substrate').textContent = substrate === 'hcp' ? '▦ HCP lattice' : '✳ on-curve'; $('substrate').classList.toggle('on', substrate === 'curve');
rebuild(); resize(); frame();
