// foam3d.js — the OPS WEAVE as a 3D PANCAKE: a wide, flat, two-layer voronoi foam disc, woven from
// counter-rotating SPIRALS in the disc plane.
//
//   • The disc is WIDE (radius R) and THIN (two layers — vaguely two floors): an UPPER layer (over) and a
//     LOWER layer (under). A jittered polar lattice of nuclei + lattice adjacency = the volumetric foam.
//   • 6 WHITE spiral-arms wind out from the centre one way; all 6 converge at the centre on the UPPER layer →
//     the white hub. 8 PRODUCTION arms wind the OTHER way; all 8 converge at the centre on the LOWER layer →
//     the production hub. So the SIX STARTS SIT ABOVE THE EIGHT STARTS (white hub upper-centre, production hub
//     lower-centre), and the two hubs are disconnected except by threading the woven body.
//   • counter-rotation ⇒ every white arm crosses every production arm (K(6,8)); upper/lower layer = over/under
//     by plain-weave parity ⇒ every chamber owned (100% of both layers).
//   • the world is made of THREADS, so you can inhabit one: `crossingRad()` + the band-centre helpers let a
//     renderer unroll the disc around any arm (the mapping tech) — your arm straightens to a spine (centre→rim)
//     and the 8 production crossings become stations along it.
//
// A seedable FAMILY (spiral turns + phases per seed; turns-sum ≥ 1 ⇒ K(6,8)). Pure, deterministic, node-tested.

import { ENGINE_RING, ENGINES, supplyChain } from './engines.js';
import { WHITE, warpOver } from './weave.js';

export const DEFAULTS = { R: 320, T: 84, Nrad: 21, Nth: 54, Nz: 2, jitter: 0.5, hubRf: 0.10, maxGrade: 0.32, rings: 2, seed: 1 };
// a weave-cell is a HEXAGON of chunks — `rings` hex-rings around the centre ⇒ a CENTERED HEXAGONAL NUMBER of
// chunks: rings 1 → 7, rings 2 → 19, rings 3 → 37 (the forge tiling). It is the tiling unit (see tessellation
// in WEAVE.md): hexagons honeycomb the rind shell, and 7-chunk cells nest aperture-7 like H3. More rings ⇒ a
// bigger cell ⇒ more windings to fill it.
export const chunkCount = (rings) => 3 * rings * rings + 3 * rings + 1;
// the three factions — two white-collar roles each (the nave's lobes + exclusive verbs); gives representation
export const FACTIONS = [
  { id: 'rindwalker', label: 'Rindwalker', color: '#9b6b3a', verbs: ['mend', 'worship'], roleIds: ['perfusion', 'telemetry'], creed: 'maintenance is meaning — the floor\'s health-keepers' },
  { id: 'continuant', label: 'Continuant', color: '#5566b8', verbs: ['govern', 'grow'], roleIds: ['schedule', 'inventory'], creed: 'the voyage must continue — the planners & stewards' },
  { id: 'drift', label: 'Drift', color: '#3bb0c9', verbs: ['move', 'trade'], roleIds: ['dispatch', 'gate'], creed: 'a floor lives only if things move — the circulators' },
];
const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;
const swrap = (a) => { a = wrap(a); return a > Math.PI ? a - TAU : a; };
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function buildFoam3D(seed = DEFAULTS.seed, opts = {}) {
  const o = { ...DEFAULTS, ...opts, seed: (seed >>> 0) };
  const { R, T, Nrad, Nth, Nz, hubRf, rings } = o;
  const NW = WHITE.length, NF = ENGINE_RING.length;
  const rng = mulberry32((o.seed ^ 0x3d0f) >>> 0);
  // a bigger cell (more chunk-rings) wants more windings to fill it; explicit `windings` overrides
  const windings = opts.windings != null ? opts.windings : 1.0 + 0.8 * rings;

  // seeded family: counter-rotating spiral WINDINGS (more turns ⇒ more horizontal run ⇒ a gentle slope can still
  // complete a full weave, and the extra passes fill the rim) + phases + spin direction
  const turnsW = windings * (0.85 + 0.3 * rng()), turnsP = windings * (0.85 + 0.3 * rng()), phaseW = rng() * TAU, phaseP = rng() * TAU, dir = rng() < 0.5 ? 1 : -1;
  // FACTIONS — two white-collar roles each (representation), mapped to the nave's three lobes + their exclusive
  // verbs. The arms are placed faction-contiguous so each faction owns a 120° sector of the rosette.
  const byId = Object.fromEntries(WHITE.map((w) => [w.id, w]));
  const warps = FACTIONS.flatMap((fac) => fac.roleIds.map((rid) => ({ ...byId[rid], faction: fac.id, factionLabel: fac.label, factionColor: fac.color, verbs: fac.verbs })))
    .map((wc, w) => ({ ...wc, w }));
  const wefts = ENGINE_RING.map((id, f) => ({ id, f, ...ENGINES[id] }));

  // the spiral band centres (in-plane), as a function of radial fraction rf ∈ [0,1]
  const thW = (w, rf) => wrap((w + 0.5) * TAU / NW + phaseW - dir * turnsW * TAU * rf);
  const thP = (f, rf) => wrap((f + 0.5) * TAU / NF + phaseP + dir * turnsP * TAU * rf);
  const bandW = (th, rf) => Math.min(NW - 1, Math.max(0, Math.floor(NW * wrap(th - phaseW + dir * turnsW * TAU * rf) / TAU)));
  const bandF = (th, rf) => Math.min(NF - 1, Math.max(0, Math.floor(NF * wrap(th - phaseP - dir * turnsP * TAU * rf) / TAU)));
  // ALL crossings of a thread (with windings, two threads cross several times). Over/under ALTERNATES along the
  // winding index K so it reads as a true plain weave, and white-over ⟺ production-under at every shared crossing.
  const S = turnsW + turnsP, ph = (phaseW - phaseP) / TAU, Kmax = Math.ceil(Math.abs(S)) + 2;
  const parityOver = (w, f, K) => (((w + f + K) % 2) + 2) % 2 === 0;
  const crossRfs = (w, f) => { const out = []; for (let K = -Kmax; K <= Kmax; K++) { const rf = (((w + 0.5) / NW - (f + 0.5) / NF) + ph - K) / (dir * S); if (rf > 0.02 && rf < 0.999) out.push({ rf, K }); } return out; };
  const crossW = warps.map((wc) => { const out = []; for (let f = 0; f < NF; f++) for (const c of crossRfs(wc.w, f)) out.push({ rf: c.rf, f, over: parityOver(wc.w, f, c.K) }); return out.sort((a, b) => a.rf - b.rf); });
  const crossP = wefts.map((wf) => { const out = []; for (let w = 0; w < NW; w++) for (const c of crossRfs(w, wf.f)) out.push({ rf: c.rf, w, over: !parityOver(w, wf.f, c.K) }); return out.sort((a, b) => a.rf - b.rf); });
  const crossingRad = (w, f) => { const c = crossW[w].find((x) => x.f === f); return c ? c.rf : 0.5; };

  // ── the chunk tiling this cell is laid over: a hexagon of `rings` hex-rings (a centered-hexagonal number of
  // chunks), inscribed in the disc, centred at the origin. Pure overlay geometry — the weave fills the disc
  // regardless; the chunks show the tessellation unit. hexSize set so the outermost chunk just reaches the rim. ──
  const SQRT3 = Math.sqrt(3), hexSize = R / (1.5 * rings + 1);
  const hexCenter = (q, r) => ({ x: hexSize * 1.5 * q, y: hexSize * SQRT3 * (r + q / 2) });
  const hexVerts = (cx, cy) => { const v = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; v.push([cx + hexSize * Math.cos(a), cy + hexSize * Math.sin(a)]); } return v; };
  const chunks = [];
  for (let q = -rings; q <= rings; q++) for (let r = -rings; r <= rings; r++) if (Math.abs(q + r) <= rings) { const c = hexCenter(q, r); chunks.push({ q, r, cx: c.x, cy: c.y, verts: hexVerts(c.x, c.y), ring: (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2 }); }
  const macroHex = hexVerts(0, 0).map(([x, y]) => [x / hexSize * (R), y / hexSize * (R)]); // the cell's own hex boundary (circumradius R)

  // ── the WEAVE undulation, as a ZERO-LADDER object: a thread's height has a ZERO-GRADE flat exactly AT each
  // crossing — a peak where it passes OVER, a trough where UNDER — so the crossing IS the flat landing where a
  // door belongs. Between crossings it RAMPS at controlled grade (smoothstep ⇒ zero grade at every flat for
  // free); no stairs, one continuous walkable surface. We undulate over the EIGHT PRINCIPAL crossings of a
  // thread (one flat per engine, ordered centre→rim) — not the dense multi-winding cloud, whose near-coincident
  // crossings would pin every flat to a hair's amplitude. The amplitude at each flat is the FULL plane (±A)
  // unless the run to a neighbour is too short to ramp there within maxGrade — then it shrinks (never steepens),
  // so the hills are tiny where crossings crowd the centre and grow to the full two-floor swing toward the rim. ──
  const A = T / 2, grade = o.maxGrade, M = 256;
  const interp = (pts, rf) => { if (rf <= pts[0].rf) return pts[0].z; if (rf >= pts[pts.length - 1].rf) return pts[pts.length - 1].z; let i = 0; while (i < pts.length - 1 && pts[i + 1].rf < rf) i++; const a = pts[i], b = pts[i + 1], t = (rf - a.rf) / ((b.rf - a.rf) || 1); return a.z + (b.z - a.z) * (t * t * (3 - 2 * t)); };
  const arcLUT = (turns) => { const a = new Float64Array(M + 1); let s = 0; for (let i = 1; i <= M; i++) { const rf = i / M; s += Math.hypot(R, rf * R * turns * TAU) / M; a[i] = s; } return a; };
  const arcAt = (lut, rf) => { const x = Math.max(0, Math.min(1, rf)) * M, i = Math.floor(x), t = x - i; return i >= M ? lut[M] : lut[i] + (lut[i + 1] - lut[i]) * t; };
  const wArc = arcLUT(turnsW), pArc = arcLUT(turnsP);
  // collapse crossings nearer than ~half a chamber in rf into one shared flat (windings can stack two crossings
  // almost on top of each other; one landing serves both) so no ramp is pinned to a hair's amplitude
  const collapse = (cl) => { const out = []; for (const c of cl) { const p = out[out.length - 1]; if (p && c.rf - p.rf < 0.4 / Nrad) continue; out.push({ rf: c.rf, over: c.over }); } return out; };
  // build control points: hub flat (signed toward its floor) + EVERY crossing (these span centre→rim, evenly in
  // rf ⇒ growing in arc-length, so hills spread outward) + rim, each flat's amplitude capped so a smoothstep ramp
  // to its neighbours holds ≤ maxGrade (smoothstep's peak slope = 1.5·Δz/d; opposite-floor Δz ≈ 2·amp ⇒ amp ≤ grade·d/3)
  const capCtl = (flats, arcL, hubSign) => {
    const Sf = (rf) => arcAt(arcL, rf);
    const seq = [{ rf: 0, s: hubSign }, ...flats.map((c) => ({ rf: c.rf, s: c.over ? 1 : -1 })), { rf: 1, s: flats.length ? (flats[flats.length - 1].over ? 1 : -1) : hubSign }];
    const amp = seq.map((c, k) => {
      const dP = k > 0 ? Sf(c.rf) - Sf(seq[k - 1].rf) : Infinity, dN = k < seq.length - 1 ? Sf(seq[k + 1].rf) - Sf(c.rf) : Infinity;
      return Math.min(A, (grade / 3) * Math.min(dP, dN));
    });
    return seq.map((c, k) => ({ rf: c.rf, z: c.s * amp[k] }));
  };
  const wCtl = warps.map((wc) => capCtl(collapse(crossW[wc.w]), wArc, 1)), pCtl = wefts.map((wf) => capCtl(collapse(crossP[wf.f]), pArc, -1));
  const zWhite = (w, rf) => interp(wCtl[w], rf), zProd = (f, rf) => interp(pCtl[f], rf);

  // ── the volumetric foam: jittered polar lattice. iz 1 = the WHITE chamber (rides the white thread's weave),
  // iz 0 = the PRODUCTION chamber (rides the production thread). Their heights undulate — the over/under weave. ──
  const id = (ir, ith, iz) => ir * Nth * Nz + ((ith % Nth + Nth) % Nth) * Nz + iz;
  const nuclei = [];
  for (let ir = 0; ir < Nrad; ir++) for (let ith = 0; ith < Nth; ith++) for (let iz = 0; iz < Nz; iz++) {
    const rf = (ir + 0.5 + (rng() - 0.5) * o.jitter) / Nrad;
    const th = wrap((ith + 0.5 + (rng() - 0.5) * o.jitter) / Nth * TAU);
    const rad = rf * R, x = rad * Math.cos(th), y = rad * Math.sin(th);
    const w = bandW(th, rf), f = bandF(th, rf);
    let owner, z, hub = null;
    if (iz === 1) { owner = { kind: 'warp', idx: w }; z = zWhite(w, rf); }
    else { owner = { kind: 'weft', idx: f }; z = zProd(f, rf); }
    if (rf < hubRf) { if (iz === 1) { hub = 'whub'; owner = { kind: 'whub' }; z = A; } else { hub = 'phub'; owner = { kind: 'phub' }; z = -A; } }
    nuclei.push({ i: id(ir, ith, iz), ir, ith, iz, rf, th, x, y, z, rad, over: z > 0, w, f, owner, hub });
  }
  for (const n of nuclei) n.neighbors = [];
  const add = (a, b) => { if (nuclei[a] && nuclei[b]) { nuclei[a].neighbors.push(b); nuclei[b].neighbors.push(a); } };
  for (let ir = 0; ir < Nrad; ir++) for (let ith = 0; ith < Nth; ith++) for (let iz = 0; iz < Nz; iz++) {
    const a = id(ir, ith, iz);
    if (ir + 1 < Nrad) add(a, id(ir + 1, ith, iz));
    add(a, id(ir, ith + 1, iz));                                 // azimuth wraps (the ring closes)
    if (iz + 1 < Nz) add(a, id(ir, ith, iz + 1));               // upper↔lower
  }
  for (const n of nuclei) n.neighbors = [...new Set(n.neighbors)];

  const whiteThreads = warps.map((wc) => ({ ...wc, kind: 'white', cells: nuclei.filter((n) => !n.hub && n.owner.kind === 'warp' && n.w === wc.w).map((n) => n.i) }));
  const prodThreads = wefts.map((wf) => ({ ...wf, kind: 'prod', cells: nuclei.filter((n) => !n.hub && n.owner.kind === 'weft' && n.f === wf.f).map((n) => n.i) }));
  const pairs = new Set(); for (const n of nuclei) if (!n.hub) pairs.add(n.w + ':' + n.f);

  // tours: enter a white arm at the centre hub, ride OUT, meeting all 8 engines once. A thread crosses each
  // engine several times (once per relative lap), and ALL eight first-meetings happen inside the first lap (the
  // inner fifth) — so instead of the innermost crossing we SPREAD the tour: engine k is met at the crossing
  // nearest its slot (k+0.5)/8 of the radius, so the 8 stations march centre→rim, each landing on a woven flat.
  const tours = warps.map((wc) => ({
    w: wc.w, label: wc.label,
    stops: wefts.map((wf) => {
      const cs = crossW[wc.w].filter((x) => x.f === wf.f), target = (wf.f + 0.5) / NF;
      const c = cs.length ? cs.reduce((best, x) => (Math.abs(x.rf - target) < Math.abs(best.rf - target) ? x : best)) : null;
      return { f: wf.f, engine: wf.id, label: wf.label, glyph: wf.glyph, over: c ? c.over : warpOver(wc.w, wf.f), rf: c ? c.rf : 0.5 };
    }).sort((a, b) => a.rf - b.rf),                            // centre (hub) → rim
  }));
  const supply = supplyChain().filter((e) => e.from !== 'fulfillment' && e.to !== 'fulfillment').map((e) => ({ ...e, fa: ENGINE_RING.indexOf(e.from), fb: ENGINE_RING.indexOf(e.to), color: ENGINES[e.from].color }));

  return {
    R, T, Nrad, Nth, Nz, seed: o.seed, NW, NF, warps, wefts, factions: FACTIONS, nuclei, whiteThreads, prodThreads,
    tours, supply, contactPairs: pairs.size, contact: { everyTouchesEvery: pairs.size === NW * NF },
    family: { turnsW, turnsP, phaseW, phaseP, dir }, maxGrade: grade, windings, rings, chunkCount: chunkCount(rings), chunks, macroHex, hexSize,
    thW, thP, bandW, bandF, crossingRad, zWhite, zProd, swrap,
  };
}

if (typeof globalThis !== 'undefined') globalThis.RindFoam3D = { buildFoam3D };
