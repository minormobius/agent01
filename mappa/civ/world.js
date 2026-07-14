// mappa/civ/world.js — the world adapter (M0).
//
// Takes a mappa world (either a full engine object from generateWorld, or the
// parallel-array JSON from GET /api/world) and normalises it into the civ
// substrate: a flat CSR adjacency (WASM-portable, no array-of-arrays on the hot
// path), spherical cell areas, per-cell habitability, and a per-cell × per-package
// SUBSISTENCE VIABILITY table generalised from mappa's Ethno classifier. From those
// we get carrying capacity K(cell, culture) — the quantity the whole demography and
// dispersal engine runs on. We consume mappa's geology; we never recompute it.

import { BIOMES, mulberry32 } from '../engine.js';
import { NPKG, PKG_ID, subMult, pkgUnlocked } from './caps.js';

// ---- named resources (mappa's mineral logic, ported compact) --------------------
// Ore follows plate context (mappa/viewer.js computeMinerals): porphyry copper/iron on
// the volcanic subduction arcs, tin in granite highlands, gold as river placers below
// the ore, gems deep in the stable craton, salt in arid basins, and fertile deltas at
// big river mouths. These become NAMED nodes that concentrate carrying capacity and
// accelerate the tech they feed — objects worth settling on and (later) fighting over.
export const RESOURCES = ['none', 'copper', 'iron', 'tin', 'gold', 'gems', 'salt', 'delta'];
export const RES = Object.fromEntries(RESOURCES.map((r, i) => [r, i]));
export const RES_METAL = new Set([RES.copper, RES.iron, RES.tin]);   // → metallurgy / industry
export const RES_WEALTH = new Set([RES.gold, RES.gems, RES.salt]);    // → trade / connectivity
// which tech a metal accelerates (bit index handled in engine)
function toponym(seed) {
  const r = mulberry32(seed >>> 0);
  const on = 'ktrmnvbsldpghy', vo = 'aeiouae';
  const pick = s => s[Math.floor(r() * s.length)];
  let n = pick(on).toUpperCase() + pick(vo);
  const syl = 1 + Math.floor(r() * 2);
  for (let i = 0; i < syl; i++) n += pick(on) + pick(vo);
  if (r() < 0.4) n += pick(on);
  return n;
}

const BI = Object.fromEntries(BIOMES.map((b, i) => [b.id, i]));
// habitability weight per biome index (parallel to engine BIOMES order) — same
// table projection.js uses, so the civ layer and the atlas agree on "livable".
const HAB = [0, 0, 0, 0.02, 0.22, 0.5, 0.16, 0.72, 0.92, 0.82, 0.12, 0.66, 0.78, 0.62, 0.05, 0, 0, 0];

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
function unitFromLonLat(lonDeg, latDeg) {
  const lo = lonDeg * Math.PI / 180, la = latDeg * Math.PI / 180, c = Math.cos(la);
  return [c * Math.cos(lo), c * Math.sin(lo), Math.sin(la)];
}

// Build adjacency + a river-cell mask when the input is API-JSON (no adj/area).
// We reconstruct adjacency the same way the engine does: stereographic projection
// of the unit points, planar Delaunay, then dedupe neighbours. Kept internal so a
// data-only fixture (or a live /api/world pull) still runs offline.
function reconstructMesh(V) {
  // planar Bowyer–Watson on the stereographic projection (south-pole ghost).
  const N = V.length, proj = V.map(p => [p[0] / (1 - p[2] + 1e-9), p[1] / (1 - p[2] + 1e-9)]);
  let mnX = 1e9, mnY = 1e9, mxX = -1e9, mxY = -1e9;
  for (const p of proj) { if (p[0] < mnX) mnX = p[0]; if (p[1] < mnY) mnY = p[1]; if (p[0] > mxX) mxX = p[0]; if (p[1] > mxY) mxY = p[1]; }
  const dm = Math.max(mxX - mnX, mxY - mnY) || 1, mx = (mnX + mxX) / 2, my = (mnY + mxY) / 2;
  const P = proj.slice(); P.push([mx - 20 * dm, my - dm], [mx, my + 20 * dm], [mx + 20 * dm, my - dm]);
  const circum = (a, b, c) => {
    const ax = P[a][0], ay = P[a][1], bx = P[b][0], by = P[b][1], cx = P[c][0], cy = P[c][1];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-15) return { x: 0, y: 0, r2: Infinity };
    const A = ax * ax + ay * ay, B = bx * bx + by * by, C = cx * cx + cy * cy;
    const ux = (A * (by - cy) + B * (cy - ay) + C * (ay - by)) / d, uy = (A * (cx - bx) + B * (ax - cx) + C * (bx - ax)) / d;
    return { x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let T = [[N, N + 1, N + 2]]; T[0].cc = circum(N, N + 1, N + 2);
  for (let i = 0; i < N; i++) {
    const p = P[i], bad = [];
    for (const t of T) { const cc = t.cc; if ((p[0] - cc.x) ** 2 + (p[1] - cc.y) ** 2 < cc.r2 - 1e-9) bad.push(t); }
    const ed = []; for (const t of bad) ed.push([t[0], t[1]], [t[1], t[2]], [t[2], t[0]]);
    const poly = [];
    for (let a = 0; a < ed.length; a++) { let sh = false; for (let b = 0; b < ed.length; b++) { if (a !== b && ed[a][0] === ed[b][1] && ed[a][1] === ed[b][0]) { sh = true; break; } } if (!sh) poly.push(ed[a]); }
    const bs = new Set(bad); T = T.filter(t => !bs.has(t));
    for (const e of poly) { const nt = [e[0], e[1], i]; nt.cc = circum(nt[0], nt[1], nt[2]); T.push(nt); }
  }
  const adjS = Array.from({ length: N }, () => new Set());
  for (const t of T) {
    for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      if (a < N && b < N) { adjS[a].add(b); adjS[b].add(a); }
    }
  }
  return adjS.map(s => [...s].sort((x, y) => x - y));
}

// Normalise ANY mappa world into the civ substrate.
export function loadCivWorld(world) {
  // detect shape: engine object has V (unit vectors) + adj; API-JSON has points (lonlat).
  const N = world.N ?? (world.points ? world.points.length : (world.elev ? world.elev.length : 0));
  if (!N) throw new Error('civ world: empty or unrecognised world');
  const water = world.water, elev = world.elev, biome = world.biome, meta = world.meta || {};
  // unit vectors
  let V = world.V;
  if (!V) { V = new Array(N); for (let i = 0; i < N; i++) { const p = world.points[i]; V[i] = unitFromLonLat(p[0], p[1]); } }
  // adjacency (array-of-arrays) — from engine, else reconstruct
  const adjArr = world.adj || reconstructMesh(V);

  // ---- CSR adjacency: nbrOff[i]..nbrOff[i+1] indexes into nbrIdx ----------------
  let E = 0; for (let i = 0; i < N; i++) E += adjArr[i].length;
  const nbrOff = new Int32Array(N + 1), nbrIdx = new Int32Array(E);
  for (let i = 0, k = 0; i < N; i++) { nbrOff[i] = k; const a = adjArr[i]; for (let j = 0; j < a.length; j++) nbrIdx[k++] = a[j]; nbrOff[N] = E; }

  // ---- area (spherical Voronoi from engine, else uniform proxy) -----------------
  let area = world.area;
  if (!area) { area = new Float32Array(N); const mean = (4 * Math.PI) / N; for (let i = 0; i < N; i++) area[i] = mean; }
  // normalise to mean-cell = 1 (raw steradians are ~4π/N ≈ 0.007, too tiny for K);
  // K then reads as "people per average cell" scaled by popScale.
  let areaSum = 0; for (let i = 0; i < N; i++) areaSum += area[i];
  const meanArea = areaSum / N || 1;
  const areaNorm = new Float32Array(N); for (let i = 0; i < N; i++) areaNorm[i] = area[i] / meanArea;

  // ---- climate proxies: use engine T/M if present, else derive from biome+lat ---
  const temperature = world.temperature || deriveTemp(N, V, biome);
  const moisture = world.moisture || deriveMoist(N, biome);

  // ---- per-cell masks: land, coast, lake-adjacent, river ------------------------
  const land = new Uint8Array(N), coast = new Uint8Array(N), lakeAdj = new Uint8Array(N), river = new Uint8Array(N), slope = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    land[i] = water[i] === 0 ? 1 : 0;
    if (!land[i]) continue;
    let oc = 0, lk = 0, mx = 0;
    for (let k = nbrOff[i]; k < nbrOff[i + 1]; k++) {
      const j = nbrIdx[k];
      if (water[j] === 1) oc = 1; else if (water[j] === 2) lk = 1;
      const d = Math.abs(elev[i] - elev[j]); if (d > mx) mx = d;
    }
    coast[i] = oc; lakeAdj[i] = lk; slope[i] = mx;
  }
  // river cells: match river-segment endpoints to cell positions (as viewer does)
  if (world.rivers) {
    const key = p => Math.round(p[0] * 2048) + ',' + Math.round(p[1] * 2048) + ',' + Math.round(p[2] * 2048);
    const idx = new Map(); for (let i = 0; i < N; i++) idx.set(key(V[i]), i);
    for (const r of world.rivers) {
      if (r.a) { const i = idx.get(key(r.a)); if (i != null) river[i] = 1; const j = idx.get(key(r.b)); if (j != null) river[j] = 1; }
      else if (Array.isArray(r)) { // API-JSON rivers: [lon,lat,lon,lat,flow]
        const a = idx.get(key(unitFromLonLat(r[0], r[1]))); if (a != null) river[a] = 1;
        const b = idx.get(key(unitFromLonLat(r[2], r[3]))); if (b != null) river[b] = 1;
      }
    }
  }

  // ---- habitability + per-package subsistence viability --------------------------
  const hab = new Float32Array(N);
  const subViab = new Float32Array(N * NPKG); // row-major [cell*NPKG + pkg]
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    hab[i] = HAB[biome[i]] * (1 - Math.min(0.55, Math.max(0, elev[i]) * 0.45));
    subViabilityCell(i, subViab, biome[i], temperature[i], moisture[i], elev[i], slope[i], river[i], coast[i], lakeAdj[i]);
  }

  // ---- landmass id per cell (connected land components) — for independent-origin --
  // detection: agriculture/industry arising on SEPARATED landmasses is the jackpot.
  const landmass = new Int32Array(N).fill(-1);
  { let m = 0;
    for (let s = 0; s < N; s++) {
      if (!land[s] || landmass[s] >= 0) continue;
      const q = [s]; landmass[s] = m;
      for (let h = 0; h < q.length; h++) { const i = q[h]; for (let k = nbrOff[i]; k < nbrOff[i + 1]; k++) { const j = nbrIdx[k]; if (land[j] && landmass[j] < 0) { landmass[j] = m; q.push(j); } } }
      m++;
    }
  }

  // ---- sea-crossing links: coast land cell → coast land cells reachable across ----
  // ≤ maxSeaHops ocean cells. Only sail/maritime cultures use these (island hopping,
  // the Austronesian signature). Built once as a CSR; empty for interior cells.
  const maxSeaHops = 3;
  const seaLinkArr = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) {
    if (!coast[i]) continue;
    const dist = new Map(); dist.set(i, 0); const q = [i];
    for (let h = 0; h < q.length; h++) {
      const cur = q[h], d = dist.get(cur);
      for (let k = nbrOff[cur]; k < nbrOff[cur + 1]; k++) {
        const j = nbrIdx[k];
        if (land[j] && j !== i) { if (coast[j] && !dist.has(j)) seaLinkArr[i].push(j); continue; }
        if (water[j] === 1 && d < maxSeaHops && !dist.has(j)) { dist.set(j, d + 1); q.push(j); }
      }
    }
  }
  let SE = 0; for (let i = 0; i < N; i++) SE += seaLinkArr[i].length;
  const seaOff = new Int32Array(N + 1), seaIdx = new Int32Array(SE);
  for (let i = 0, k = 0; i < N; i++) { seaOff[i] = k; for (const j of seaLinkArr[i]) seaIdx[k++] = j; } seaOff[N] = SE;

  // ---- named resources + carrying-capacity bonus ---------------------------------
  const { resource, resourceNodes, resBonusK } = computeResources({
    N, V, land, coast, lakeAdj, river, elev, moisture, biome, nbrOff, nbrIdx,
    volc: world.volc, plate: world.plate, seed: (meta.seed >>> 0) || 1,
  });

  return {
    N, V, water, elev, biome, temperature, moisture, meta,
    nbrOff, nbrIdx, area, areaNorm, land, coast, lakeAdj, river, slope, hab, subViab,
    landmass, nLandmass: landmass.reduce((a, b) => Math.max(a, b), -1) + 1,
    seaOff, seaIdx, resource, resourceNodes, resBonusK,
    rivers: world.rivers || [], plates: world.plates || [],
    cells: world.cells || null,   // spherical-Voronoi polygon (vertex unit-vectors) per cell — for map rendering
  };
}

// Classify per-cell resources from geology + pick the prominent NAMED nodes. Mirrors
// mappa/viewer.js computeMinerals: plate-boundary distance separates arc (volcanic) from
// craton (interior); volcanism marks the ore arcs; rivers carry placers.
function computeResources(w) {
  const { N, land, coast, lakeAdj, river, elev, moisture, biome, nbrOff, nbrIdx, volc, plate, seed } = w;
  const resource = new Uint8Array(N), resBonusK = new Float32Array(N).fill(1);
  if (!volc || !plate) return { resource, resourceNodes: [], resBonusK }; // data-fixture path: no geology → no minerals
  // hop-distance from a plate boundary over land → craton interior is far
  const bdist = new Int32Array(N).fill(-1); const q = [];
  for (let i = 0; i < N; i++) { if (!land[i]) continue; let bnd = false; for (let k = nbrOff[i]; k < nbrOff[i + 1]; k++) if (plate[nbrIdx[k]] !== plate[i]) { bnd = true; break; } if (bnd) { bdist[i] = 0; q.push(i); } }
  for (let h = 0; h < q.length; h++) { const i = q[h]; for (let k = nbrOff[i]; k < nbrOff[i + 1]; k++) { const j = nbrIdx[k]; if (land[j] && bdist[j] < 0) { bdist[j] = bdist[i] + 1; q.push(j); } } }
  let bmax = 1; for (let i = 0; i < N; i++) if (bdist[i] > bmax) bmax = bdist[i];
  const craton = i => (bdist[i] < 0 ? 0 : bdist[i] / bmax);
  // per-cell classification (first match wins; a cell holds at most one headline resource)
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    const v = volc[i] || 0, cr = craton(i), e = elev[i], M = moisture[i];
    let r = RES.none;
    if (river[i] && coast[i]) r = RES.delta;                         // fertile river-mouth
    else if (v > 0.45) r = RES.copper;                              // strong arc → porphyry copper
    else if (v > 0.22) r = RES.iron;                               // weaker arc / ophiolite → iron
    else if (e > 0.5 && cr > 0.45) r = RES.tin;                     // granite highland → tin
    else if (river[i] && cr > 0.5) r = RES.gold;                    // cratonic river placer → gold
    else if (M < 0.16 && (lakeAdj[i] || e < 0.12)) r = RES.salt;    // arid basin → salt
    else if (cr > 0.85 && e > 0.35) r = RES.gems;                  // deep craton highland → gems
    resource[i] = r;
  }
  // pick prominent, spatially-separated NAMED nodes per type (like viewer's labelling)
  const CAP_PER = { copper: 4, iron: 4, tin: 3, gold: 4, gems: 2, salt: 3, delta: 4 };
  const nodes = [];
  for (let t = 1; t < RESOURCES.length; t++) {
    const cand = [];
    for (let i = 0; i < N; i++) if (resource[i] === t) cand.push(i);
    // score: metals by volcanism/craton, delta by river presence — favour the strongest
    cand.sort((a, b) => scoreRes(t, b, w, craton) - scoreRes(t, a, w, craton));
    let placed = 0;
    for (const i of cand) {
      let ok = true;
      for (const nd of nodes) { const d = w.V[i][0] * w.V[nd.cell][0] + w.V[i][1] * w.V[nd.cell][1] + w.V[i][2] * w.V[nd.cell][2]; if (d > 0.985) { ok = false; break; } }
      if (!ok) continue;
      nodes.push({ cell: i, type: t, kind: RESOURCES[t], name: toponym(seed * 131 + i) });
      resBonusK[i] = t === RES.delta ? 1.6 : 1.25; // resource sites hold denser populations
      if (++placed >= (CAP_PER[RESOURCES[t]] || 3)) break;
    }
  }
  return { resource, resourceNodes: nodes, resBonusK };
}
function scoreRes(t, i, w, craton) {
  const v = w.volc[i] || 0;
  if (t === RES.copper || t === RES.iron) return v;
  if (t === RES.tin || t === RES.gems) return craton(i) + w.elev[i];
  if (t === RES.gold || t === RES.salt) return craton(i);
  return (w.river[i] ? 1 : 0) + (w.coast[i] ? 1 : 0);
}

// Generalise the Ethno single-mode classifier into a CONTINUOUS 0..1 viability for
// EACH package, per cell. The engine picks a dominant belt; the sim needs the whole
// vector so a culture can weigh switching packages (the phase-transition lever).
// Written to subViab at row cell*NPKG. Uses only fields the API also exposes.
function subViabilityCell(i, out, b, T, M, e, s, riv, cst, lakeAdj) {
  const base = i * NPKG;
  const frozen = (b === BI.ice || b === BI.glacier || b === BI.snow || T < -8);
  // forager — broadly viable on any non-frozen land; best in mixed temperate/tropical.
  let forage = frozen ? 0.04 : 0.30 + 0.35 * clamp01((M - 0.1) / 0.6) - 0.15 * clamp01((e - 0.4) / 0.4);
  // pastoral — grassland/steppe, semi-arid, cold open country; poor in dense forest/desert core.
  let pastoral = frozen ? 0.03 : clamp01(
    (M > 0.14 && M < 0.5 ? 0.55 : 0.15) + (T < 8 && M > 0.2 ? 0.25 : 0) - (M > 0.7 ? 0.35 : 0) - (M < 0.08 ? 0.4 : 0));
  // horticulture (hoe) — warm-wet or broken wet uplands.
  let hoe = frozen ? 0 : clamp01(((T > 15 && M > 0.45) ? 0.6 : 0.1) + (s > 0.07 && M > 0.4 ? 0.25 : 0) - (T < 8 ? 0.4 : 0));
  // plough — temperate, arable, gentle slope, moderate moisture (the breadbasket).
  let plough = frozen ? 0 : clamp01(
    (T > 4 && T < 24 ? 0.55 : 0.05) * (M > 0.32 && M < 0.78 ? 1 : 0.3) - (s > 0.12 ? 0.35 : 0) - (M < 0.2 ? 0.3 : 0));
  // irrigation — arid/semi-arid land WITH a river (or lake) + warmth (river-valley civ).
  let irrig = frozen ? 0 : clamp01(((riv || lakeAdj) ? 0.5 : 0.02) + (M < 0.4 && T > 8 ? 0.4 : 0) + (riv && M < 0.3 ? 0.2 : 0) - (T < 3 ? 0.3 : 0));
  // maritime — coast cells, more valuable where the hinterland is poor.
  let maritime = cst ? clamp01(0.35 + (M < 0.35 || T < 4 ? 0.35 : 0.1) + 0.1 * clamp01((e - 0.3))) : 0.0;
  out[base + PKG_ID.forager] = forage;
  out[base + PKG_ID.pastoral] = pastoral;
  out[base + PKG_ID.horticulture] = hoe;
  out[base + PKG_ID.plough] = plough;
  out[base + PKG_ID.irrigation] = irrig;
  out[base + PKG_ID.maritime] = maritime;
}

// climate proxies when consuming lossy API-JSON that omits T/M (biome + latitude).
function deriveTemp(N, V, biome) {
  const T = new Float32Array(N);
  for (let i = 0; i < N; i++) { const lat = Math.asin(Math.max(-1, Math.min(1, V[i][2]))); T[i] = 28 - 45 * Math.pow(Math.abs(lat) / (Math.PI / 2), 1.25); }
  return T;
}
function deriveMoist(N, biome) {
  // rough moisture per biome index (parallel to engine BIOMES order)
  const MB = [1, 1, 1, 0.3, 0.4, 0.6, 0.15, 0.35, 0.6, 0.85, 0.08, 0.35, 0.5, 0.9, 0.2, 0.3, 1, 0.3];
  const M = new Float32Array(N); for (let i = 0; i < N; i++) M[i] = MB[biome[i]] ?? 0.4; return M;
}

// ---- carrying capacity K(cell, package) — the engine of expansion ---------------
// K = area × hab × subMult(package) × subViability(cell, package). Scaled by a
// global POP_SCALE so a filled homeland lands in the 10²–10⁴ range (compute-tractable
// individuals), not literal billions. Passability (climate valve) multiplies in.
export function cellK(w, cell, pkg, popScale) {
  const v = w.subViab[cell * NPKG + pkg];
  if (v <= 0) return 0;
  const resB = w.resBonusK ? w.resBonusK[cell] : 1; // resource sites hold denser populations
  return w.areaNorm[cell] * w.hab[cell] * subMult(pkg) * v * popScale * resB;
}
