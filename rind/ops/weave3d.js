// weave3d.js — LAY THE WEAVE on the prism, CONTINUOUS BY CONSTRUCTION. Three stages:
//   1. buildGeometry  — the hexagonal prism of homogeneous nodes (pinned 4-deck thickness) + the seeded family.
//   2. buildCells      — the TRUE 3D Voronoi chambers + door graph (in cells3d.js).
//   3. layWeave        — each of the 14 threads is a SPINE (a connected hub→rim path that steps face-adjacent
//                        cell→cell, following the spiral+undulation), then the regions GROW by graph distance from
//                        the spines (geodesic Voronoi on the chamber graph). Geodesic regions from a connected seed
//                        are connected, so EVERY THREAD IS ONE WALKABLE CORRIDOR — no fragments. Pinned by the test.
//
// Levers: width (how far a region grows from its spine, in graph steps — beyond it = interstitial matrix),
// areal density (in-plane spacing, pinned thickness), flat-core radius, chunks (1/7/19). The math isn't softened:
// too-thin corridors don't touch at the crossings ⇒ K(6,8) < 48 (a real break), reported raw.

import { buildPrism } from './prism.js';
import { buildCells, routeMinDoors, ownerKey } from './cells3d.js';
import { FACTIONS } from './foam3d.js';
import { ENGINE_RING, ENGINES } from './engines.js';

const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const WEAVE_DEFAULTS = { rings: 1, spacing: 30, width: 6, flatR: 0.16, maxGrade: 0.6, jitter: 0.18, layers: 4, NW: 6, NF: 8, seed: 1 };
export const VREF_SPACING = 30;   // reference areal spacing that pins the prism thickness (4 decks, ~98 tall)
export const chunkCount = (rings) => 3 * rings * rings + 3 * rings + 1;
const HEXR_AT = (rings) => 320 * (1.5 * rings + 1) / 2.5;   // rings 0/1/2 → hexR 128 / 320 / 512

// ── STAGE 1: the prism + the seeded spiral family ──
export function buildGeometry(seed = WEAVE_DEFAULTS.seed, opts = {}) {
  const o = { ...WEAVE_DEFAULTS, ...opts, seed: (seed >>> 0) };
  const rings = o.rings, a = o.spacing, hexR = HEXR_AT(rings);
  // thread counts are a LEVER (fewer threads ⇒ fewer crossings/lap ⇒ the over/under z-signal is lower-frequency and
  // resolvable by the node grid — Nyquist — and each thread gets more nodes). Default the full K(6,8).
  const NWmax = FACTIONS.flatMap((f) => f.roleIds).length, NFmax = ENGINE_RING.length;
  const NW = Math.max(2, Math.min(NWmax, o.NW)), NF = Math.max(2, Math.min(NFmax, o.NF));
  const rng = mulberry32((o.seed ^ 0x77a3) >>> 0);
  const vpitch = VREF_SPACING * Math.sqrt(2 / 3);
  const prism = buildPrism(o.seed, { hexR, spacing: a, layers: o.layers, jitter: o.jitter, vpitch });
  const baseTurns = 1.0 + 0.9 * rings;
  const family = { turnsW: baseTurns * (0.85 + 0.3 * rng()), turnsP: baseTurns * (0.85 + 0.3 * rng()), phaseW: rng() * TAU, phaseP: rng() * TAU, spin: rng() < 0.5 ? 1 : -1 };
  const warps = FACTIONS.flatMap((fac) => fac.roleIds.map((rid) => ({ id: rid, faction: fac.id, factionLabel: fac.label, color: fac.color }))).map((wc, w) => ({ ...wc, w, kind: 'white' })).slice(0, NW);
  const wefts = ENGINE_RING.map((id, f) => ({ id, f, kind: 'prod', ...ENGINES[id] })).slice(0, NF);
  return {
    seed: o.seed, rings, chunkCount: chunkCount(rings), spacing: a, jitter: o.jitter, layers: o.layers,
    hexR, R: hexR, thickness: prism.thickness, vpitch, prism, nodes: prism.nodes, footprint: prism.footprint,
    NW, NF, family, warps, wefts,
  };
}

// ── the centrelines: a TRUE over/under weave outside a flat no-weave core. Each thread's height has a ZERO-GRADE
// flat AT every crossing (a peak where it passes OVER, a trough where UNDER, by plain-weave parity), grade-limited
// ramps between, amplitude growing toward the rim (crossings crowd the centre) — ported from foam3d. White-over ⟺
// production-under at every shared crossing, so white and production genuinely swap top/bottom as they weave. ──
export function weaveLines(geo, opts = {}) {
  const { family, thickness: T, R, NW, NF } = geo;
  const flatR = Math.max(0, Math.min(0.7, opts.flatR ?? WEAVE_DEFAULTS.flatR));
  const maxGrade = opts.maxGrade ?? WEAVE_DEFAULTS.maxGrade;
  // amplitudes in DECK units (vpitch), decoupled from total thickness: a FLOOR so the weave never flattens to one
  // swirl near the centre, a ceiling so white & production stay close enough (thick threads overlap) to keep contact.
  const vp = geo.vpitch, zMid = T / 2, Amin = 0.9 * vp, Amax = Math.min(0.46 * T, 1.7 * vp), zBias = Math.min(0.42 * T, (geo.layers / 2 - 0.5) * vp);
  const { turnsW, turnsP, phaseW, phaseP, spin } = family;
  const S = turnsW + turnsP, ph = (phaseW - phaseP) / TAU, Kmax = Math.ceil(Math.abs(S)) + 2;
  const g = (rf) => (rf <= flatR ? 0 : (rf - flatR) / (1 - flatR));
  const rfOfG = (gg) => flatR + gg * (1 - flatR);
  const aW = (w, rf) => wrap((w + 0.5) * TAU / NW + phaseW - spin * turnsW * TAU * g(rf));
  const aP = (f, rf) => wrap((f + 0.5) * TAU / NF + phaseP + spin * turnsP * TAU * g(rf));
  const parityOver = (w, f, k) => ((((w + f + k) % 2) + 2) % 2) === 0;   // white-over ⟺ (w+f+k) even
  // all crossings of a thread (solve aW(w,·)=aP(f,·) mod TAU per winding k), as {rf, over}, sorted centre→rim
  const crossW = (w) => { const out = []; for (let f = 0; f < NF; f++) for (let k = -Kmax; k <= Kmax; k++) { const gg = ((w + 0.5) / NW - (f + 0.5) / NF + ph - k) / (spin * S); if (gg > 0.015 && gg < 0.999) out.push({ rf: rfOfG(gg), over: parityOver(w, f, k) }); } return out.sort((a, b) => a.rf - b.rf); };
  const crossP = (f) => { const out = []; for (let w = 0; w < NW; w++) for (let k = -Kmax; k <= Kmax; k++) { const gg = ((w + 0.5) / NW - (f + 0.5) / NF + ph - k) / (spin * S); if (gg > 0.015 && gg < 0.999) out.push({ rf: rfOfG(gg), over: !parityOver(w, f, k) }); } return out.sort((a, b) => a.rf - b.rf); };
  // horizontal arc-length LUT (for grade capping) + collapse crossings closer than a hair so no ramp is pinned tiny
  const arcLUT = (turns) => { const M = 200, a = new Float64Array(M + 1); let s = 0; for (let i = 1; i <= M; i++) { const rf = i / M; s += Math.hypot(R, rf * R * turns * TAU) / M; a[i] = s; } return a; };
  const wArc = arcLUT(turnsW), pArc = arcLUT(turnsP);
  const arcAt = (lut, rf) => { const M = lut.length - 1, x = Math.max(0, Math.min(1, rf)) * M, i = Math.floor(x), t = x - i; return i >= M ? lut[M] : lut[i] + (lut[i + 1] - lut[i]) * t; };
  const collapse = (cl) => { const out = []; for (const c of cl) { const p = out[out.length - 1]; if (p && c.rf - p.rf < 0.6 / geo.layers / 6) continue; out.push(c); } return out; };
  // control points: flat-core hub (signed toward its floor) + each crossing (a zero-grade flat) + rim; every flat's
  // amplitude capped so a smoothstep ramp to its neighbours holds ≤ maxGrade (peak slope = 1.5·Δz/d; Δz≈2·amp ⇒ amp≤grade·d/3)
  const capCtl = (cl, arc, hubSign) => {
    const flats = collapse(cl), Sf = (rf) => arcAt(arc, rf);
    const seq = [{ rf: flatR, s: hubSign }, ...flats.map((c) => ({ rf: c.rf, s: c.over ? 1 : -1 })), { rf: 1, s: flats.length ? (flats[flats.length - 1].over ? 1 : -1) : hubSign }];
    const amp = seq.map((c, k) => { const dP = k > 0 ? Sf(c.rf) - Sf(seq[k - 1].rf) : Infinity, dN = k < seq.length - 1 ? Sf(seq[k + 1].rf) - Sf(c.rf) : Infinity;
      if (k === 0) return Math.min(zBias, (maxGrade / 3) * dN);                 // flat-core hub, capped by run to first crossing
      return Math.min(Amax, Math.max(Amin, (maxGrade / 3) * Math.min(dP, dN))); });   // crossings: floor so it never flattens
    return seq.map((c, k) => ({ rf: c.rf, z: zMid + c.s * amp[k] }));
  };
  const interp = (pts, rf) => { if (rf <= pts[0].rf) return pts[0].z; if (rf >= pts[pts.length - 1].rf) return pts[pts.length - 1].z; let i = 0; while (i < pts.length - 1 && pts[i + 1].rf < rf) i++; const a = pts[i], b = pts[i + 1], t = (rf - a.rf) / ((b.rf - a.rf) || 1); return a.z + (b.z - a.z) * (t * t * (3 - 2 * t)); };
  const wCtl = Array.from({ length: NW }, (_, w) => capCtl(crossW(w), wArc, 1)), pCtl = Array.from({ length: NF }, (_, f) => capCtl(crossP(f), pArc, -1));
  const zW = (w, rf) => interp(wCtl[w], rf), zP = (f, rf) => interp(pCtl[f], rf);
  const lineW = (w, rf) => [rf * R * Math.cos(aW(w, rf)), rf * R * Math.sin(aW(w, rf)), zW(w, rf)];
  const lineP = (f, rf) => [rf * R * Math.cos(aP(f, rf)), rf * R * Math.sin(aP(f, rf)), zP(f, rf)];
  return { flatR, maxGrade, g, aW, aP, zW, zP, lineW, lineP };
}

// ── STAGE 3: spines (connected paths) + geodesic grow ⇒ continuous regions ──
export function layWeave(geo, cellsModel, lines, opts = {}) {
  const { cells } = cellsModel, { R, spacing: a, NW, NF } = geo;
  const width = opts.width ?? WEAVE_DEFAULTS.width, tubeR = width * a / 2;
  const threads = [...Array.from({ length: NW }, (_, w) => ({ kind: 'white', idx: w })), ...Array.from({ length: NF }, (_, f) => ({ kind: 'prod', idx: f }))];

  // each thread's centreline, sampled into a 3D polyline; a cell's "tube distance" = min distance to that polyline
  const samplesOf = (lineFn) => { const s = []; for (let i = 0; i <= 80; i++) s.push(lineFn(0.012 + 0.988 * i / 80)); return s; };
  const tubeDist2 = (c, S) => { let bd = Infinity; for (const p of S) { const d = (c.x - p[0]) ** 2 + (c.y - p[1]) ** 2 + (c.z - p[2]) ** 2; if (d < bd) bd = d; } return bd; };

  // CONTINUITY BY CONSTRUCTION, FAIRLY. A priority watershed: every thread starts from one seed cell near its hub
  // (seeds distinct), then all 14 grow at once — the globally nearest unclaimed cell (by tube distance) is claimed
  // next and expands only from cells already in its own thread. Growing only from claimed cells ⇒ each region is
  // connected; the shared min-distance frontier ⇒ threads split contested space FAIRLY instead of one eating all.
  const claimed = new Array(cells.length).fill(null), tR2 = tubeR * tubeR;
  const Sof = threads.map((t) => samplesOf(t.kind === 'white' ? (rf) => lines.lineW(t.idx, rf) : (rf) => lines.lineP(t.idx, rf)));
  const heap = []; // min-heap of [tubeDist², gi, ti]
  const hpush = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const hpop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
  // seed each thread at a separated point just past the flat core (where the spokes fan apart), nearest UNCLAIMED cell
  threads.forEach((t, ti) => { const S = Sof[ti], rf0 = Math.min(0.3, Math.max(0.1, lines.flatR + 0.03)), p = t.kind === 'white' ? lines.lineW(t.idx, rf0) : lines.lineP(t.idx, rf0);
    let seed = -1, bd = Infinity; for (const c of cells) { if (claimed[c.gi]) continue; const d = (c.x - p[0]) ** 2 + (c.y - p[1]) ** 2 + (c.z - p[2]) ** 2; if (d < bd) { bd = d; seed = c.gi; } }
    if (seed < 0) return; claimed[seed] = t; for (const nb of cells[seed].adj) if (!claimed[nb]) { const nd = tubeDist2(cells[nb], S); if (nd <= tR2) hpush([nd, nb, ti]); } });
  while (heap.length) { const [d2, gi, ti] = hpop(); if (claimed[gi] || d2 > tR2) continue; claimed[gi] = threads[ti];
    for (const nb of cells[gi].adj) if (!claimed[nb]) { const nd = tubeDist2(cells[nb], Sof[ti]); if (nd <= tR2) hpush([nd, nb, ti]); } }

  const tIndex = (o) => o ? (o.kind === 'white' ? o.idx : NW + o.idx) : -1;
  for (const c of cells) { c.owner = claimed[c.gi]; c.ownerKey = ownerKey(c.owner); c.flat = Math.hypot(c.x, c.y) / R <= lines.flatR; }

  // ── K(6,8) REPAIR: the fair partition can leave a few crossings unrealised (a third region sits on the boundary).
  // For each missing (w,f), BRIDGE it: find a short chain (≤2 cells) from a white-w cell to a prod-f cell and flip
  // those cells to white-w — but only if every donor region stays connected once its cells are removed. So we close
  // K(6,8) WITHOUT fragmenting any thread. Iterate: a flip can open the next bridge. ──
  const adjHas = (gi, key) => { for (const nb of cells[gi].adj) if (cells[nb].ownerKey === key) return true; return false; };
  const hasContact = (w, f) => { for (const c of cells) if (c.ownerKey === 'w' + w && adjHas(c.gi, 'p' + f)) return true; return false; };
  const donorsStayConnected = (drop) => { const byKey = new Map(); for (const gi of drop) { const k = cells[gi].ownerKey; if (!cells[gi].owner) continue; (byKey.get(k) || byKey.set(k, new Set()).get(k)).add(gi); }
    for (const [key, gone] of byKey) { const set = new Set(); for (const c of cells) if (c.ownerKey === key && !gone.has(c.gi)) set.add(c.gi); if (!set.size) continue;
      const start = set.values().next().value, seen = new Set([start]), q = [start]; for (let h = 0; h < q.length; h++) for (const nb of cells[q[h]].adj) if (set.has(nb) && !seen.has(nb)) { seen.add(nb); q.push(nb); } if (seen.size !== set.size) return false; } return true; };
  // bridge from `srcKey`'s frontier (depth ≤ 3) through neutral cells to one adjacent to `dstKey`, then flip the
  // chain to srcKey — if every donor stays connected. Returns true if it closed the contact.
  const tryBridge = (srcKey, dstKey, srcOwner) => {
    const prev = new Map(), depth = new Map(), q = [];
    for (const c of cells) if (c.ownerKey === srcKey) for (const nb of cells[c.gi].adj) if (cells[nb].ownerKey !== srcKey && !depth.has(nb)) { depth.set(nb, 1); prev.set(nb, -1); q.push(nb); }
    let target = -1;
    for (let h = 0; h < q.length && target < 0; h++) { const cur = q[h]; if (adjHas(cur, dstKey)) { target = cur; break; }
      if (depth.get(cur) < 3) for (const nb of cells[cur].adj) if (cells[nb].ownerKey !== srcKey && cells[nb].ownerKey !== dstKey && !depth.has(nb)) { depth.set(nb, depth.get(cur) + 1); prev.set(nb, cur); q.push(nb); } }
    if (target < 0) return false;
    const path = []; for (let c = target; c !== -1; c = prev.get(c)) path.push(c);
    if (!donorsStayConnected(path)) return false;
    for (const gi of path) { cells[gi].owner = { ...srcOwner }; cells[gi].ownerKey = srcKey; } return true;
  };
  for (let round = 0; round < 5; round++) { let changed = false;
    for (let w = 0; w < NW; w++) for (let f = 0; f < NF; f++) { if (hasContact(w, f)) continue;
      if (tryBridge('w' + w, 'p' + f, { kind: 'white', idx: w }) || tryBridge('p' + f, 'w' + w, { kind: 'prod', idx: f })) changed = true;
    }
    if (!changed) break;
  }
  for (const c of cells) { geo.nodes[c.nodeIndex].nearest = c.owner; geo.nodes[c.nodeIndex].flat = c.flat; }
  const spines = [];   // (spine concept folded into the flood; kept for API shape)

  // ── metrics ──
  const N = cells.length, owned = cells.filter((c) => c.owner).length;
  const counts = threads.map((_, ti) => cells.filter((c) => tIndex(c.owner) === ti).length);
  const deadThreads = counts.filter((c) => c === 0).length;

  // CONTINUITY: each thread must be ONE connected component in the door graph
  let discontinuous = 0, worstComponents = 0;
  threads.forEach((t, ti) => { const key = ownerKey(t), set = new Set(cells.filter((c) => c.ownerKey === key).map((c) => c.gi)); if (!set.size) return;
    let comps = 0; const seen = new Set();
    for (const gi of set) { if (seen.has(gi)) continue; comps++; const qq = [gi]; seen.add(gi); for (let h = 0; h < qq.length; h++) for (const nb of cells[qq[h]].adj) if (set.has(nb) && !seen.has(nb)) { seen.add(nb); qq.push(nb); } }
    worstComponents = Math.max(worstComponents, comps); if (comps > 1) discontinuous++; });

  // K(6,8): a white region and a production region are in contact iff some cell of one shares a face with a cell
  // of the other. Too-thin corridors don't reach the crossings ⇒ missing pairs (a real break).
  const contacts = new Set();
  for (const c of cells) { if (!c.owner || c.owner.kind !== 'white') continue; for (const nb of cells[c.gi].adj) { const m = cells[nb]; if (m.owner && m.owner.kind === 'prod') contacts.add(c.owner.idx + ':' + m.owner.idx); } }

  // anywhere → anywhere: the weave's single-door reach, measured
  let sum = 0, cnt = 0, mx = 0; for (let i = 0; i < 120; i++) { const A = cells[(i * 7) % N].gi, B = cells[(i * 13 + 5) % N].gi; const r = routeMinDoors(cellsModel, A, B); if (r) { sum += r.doors; cnt++; mx = Math.max(mx, r.doors); } }

  const breaks = [];
  if (contacts.size !== NW * NF) breaks.push(`K(6,8) incomplete: ${contacts.size}/${NW * NF} — corridors too thin to touch at every crossing (widen or densify)`);
  if (deadThreads > 0) breaks.push(`${deadThreads} thread(s) have no chambers`);
  if (discontinuous > 0) breaks.push(`${discontinuous} thread(s) BROKE into pieces — continuity failed (worst ${worstComponents} components)`);

  const metrics = {
    nodes: N, width, tubeR, thickness: geo.thickness,
    coverage: owned / N, matrixPct: (N - owned) / N,
    deadThreads, discontinuous, worstComponents, continuous: discontinuous === 0,
    contacts: contacts.size, k68: contacts.size === NW * NF, k68Pairs: `${contacts.size}/${NW * NF}`,
    counts, avgDoors: cnt ? sum / cnt : 0, maxDoors: mx,
    breaks, clean: breaks.length === 0,
  };
  return { metrics, spines };
}

// ── convenience: all three stages (used by selftests + simple callers) ──
export function buildWeave3D(seed = WEAVE_DEFAULTS.seed, opts = {}) {
  const geo = buildGeometry(seed, opts);
  const cellsModel = buildCells(geo);
  const lines = weaveLines(geo, opts);
  const lay = layWeave(geo, cellsModel, lines, opts);
  return { ...geo, ...lines, flatR: lines.flatR, width: opts.width ?? WEAVE_DEFAULTS.width, cells: cellsModel.cells, cellsModel, lines, spines: lay.spines, metrics: lay.metrics };
}

if (typeof globalThis !== 'undefined') globalThis.RindWeave3D = { buildGeometry, weaveLines, layWeave, buildWeave3D };
