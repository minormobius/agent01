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

export const DEFAULTS = { R: 320, T: 84, Nrad: 21, Nth: 54, Nz: 2, jitter: 0.5, hubRf: 0.10, maxGrade: 0.32, windings: 2.6, seed: 1 };
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
  const { R, T, Nrad, Nth, Nz, hubRf } = o;
  const NW = WHITE.length, NF = ENGINE_RING.length;
  const rng = mulberry32((o.seed ^ 0x3d0f) >>> 0);

  // seeded family: counter-rotating spiral WINDINGS (more turns ⇒ more horizontal run ⇒ a gentle slope can still
  // complete a full weave, and the extra passes fill the rim) + phases + spin direction
  const turnsW = o.windings * (0.85 + 0.3 * rng()), turnsP = o.windings * (0.85 + 0.3 * rng()), phaseW = rng() * TAU, phaseP = rng() * TAU, dir = rng() < 0.5 ? 1 : -1;
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

  // ── the WEAVE undulation: a thread rises to the UPPER plane (+A) where it passes OVER a crossing and dips to
  // the LOWER plane (−A) where UNDER. SLOPE-LIMITED (these hills sit in spin gravity): cap the pedestrian grade
  // (dz/ds). More windings give more horizontal run, so a gentle cap can still reach full ±A and the weave fills. ──
  const A = T / 2, grade = o.maxGrade;
  const interp = (pts, rf) => { if (rf <= pts[0].rf) return pts[0].z; if (rf >= pts[pts.length - 1].rf) return pts[pts.length - 1].z; let i = 0; while (i < pts.length - 1 && pts[i + 1].rf < rf) i++; const a = pts[i], b = pts[i + 1], t = (rf - a.rf) / ((b.rf - a.rf) || 1); return a.z + (b.z - a.z) * (t * t * (3 - 2 * t)); };
  const wCtl = warps.map((wc) => { const p = [{ rf: 0, z: A }]; for (const c of crossW[wc.w]) p.push({ rf: c.rf, z: c.over ? A : -A }); p.push({ rf: 1, z: p[p.length - 1].z }); return p; });
  const pCtl = wefts.map((wf) => { const p = [{ rf: 0, z: -A }]; for (const c of crossP[wf.f]) p.push({ rf: c.rf, z: c.over ? A : -A }); p.push({ rf: 1, z: p[p.length - 1].z }); return p; });
  // SLOPE-LIMITED undulation: these hills sit in spin gravity, so cap the pedestrian GRADE (dz/ds along the
  // path). Near the centre there's little horizontal run, so the cap damps the swing there; only out toward the
  // RIM (where a turn covers more ground) can it reach full ±A — which spreads the undulations outward.
  const M = 256, drf = 1 / M;
  const slew = (ctl, turns) => { const lut = new Float64Array(M + 1); let z = ctl[0].z; lut[0] = z; for (let i = 1; i <= M; i++) { const rf = i * drf, dsH = Math.hypot(R, rf * R * turns * TAU); const cap = grade * dsH * drf, tgt = interp(ctl, rf); z += Math.max(-cap, Math.min(cap, tgt - z)); lut[i] = z; } return lut; };
  const lutAt = (lut, rf) => { const x = Math.max(0, Math.min(1, rf)) * M, i = Math.floor(x), t = x - i; return i >= M ? lut[M] : lut[i] + (lut[i + 1] - lut[i]) * t; };
  const wLUT = warps.map((wc) => slew(wCtl[wc.w], turnsW)), pLUT = wefts.map((wf) => slew(pCtl[wf.f], turnsP));
  const zWhite = (w, rf) => lutAt(wLUT[w], rf), zProd = (f, rf) => lutAt(pLUT[f], rf);

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

  // tours: enter a white arm at the centre hub, ride OUT; meet each production at its crossing radius
  const tours = warps.map((wc) => ({
    w: wc.w, label: wc.label,
    stops: wefts.map((wf) => { const c = crossW[wc.w].find((x) => x.f === wf.f); return { f: wf.f, engine: wf.id, label: wf.label, glyph: wf.glyph, over: c ? c.over : warpOver(wc.w, wf.f), rf: c ? c.rf : 0.5 }; })
      .sort((a, b) => a.rf - b.rf),                              // centre (hub) → rim
  }));
  const supply = supplyChain().filter((e) => e.from !== 'fulfillment' && e.to !== 'fulfillment').map((e) => ({ ...e, fa: ENGINE_RING.indexOf(e.from), fb: ENGINE_RING.indexOf(e.to), color: ENGINES[e.from].color }));

  return {
    R, T, Nrad, Nth, Nz, seed: o.seed, NW, NF, warps, wefts, factions: FACTIONS, nuclei, whiteThreads, prodThreads,
    tours, supply, contactPairs: pairs.size, contact: { everyTouchesEvery: pairs.size === NW * NF },
    family: { turnsW, turnsP, phaseW, phaseP, dir }, maxGrade: grade, windings: o.windings, thW, thP, bandW, bandF, crossingRad, zWhite, zProd, swrap,
  };
}

if (typeof globalThis !== 'undefined') globalThis.RindFoam3D = { buildFoam3D };
