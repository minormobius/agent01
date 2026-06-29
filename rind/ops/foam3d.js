// foam3d.js — the OPS WEAVE in 3D: a volumetric voronoi foam in the RIND SHELL, woven from counter-rotating
// helices (the rind's own Shukhov hyperboloid). This is the 3D resolution of the polar weave.
//
//   • The shell is a cylinder (gentle hyperboloid waist): azimuth θ WRAPS, axial z runs pole→pole, radius is
//     a few chambers thick (the rind is a THIN shell — that's canonical). A jittered cylindrical lattice of
//     nuclei + lattice adjacency = the 3D chamber foam (the foamview discipline).
//   • 6 WHITE helices wind one way from the TOP cap (the white hub); 8 PRODUCTION helices wind the OTHER way
//     from the BOTTOM cap (the production hub). Counter-rotation ⇒ every white helix crosses every production
//     helix (K(6,8)). Radially the shell splits into an OUTER ("over") and INNER ("under") half: at each
//     (θ,z) the over thread rides the outer chambers, the under thread the inner — so every chamber is owned
//     (100%). The two hubs sit at opposite poles, joined only by threading the woven body.
//   • Because the world is made of THREADS, you can inhabit one: `crossingZ()` + the band-centre helpers let a
//     renderer unroll the foam around any thread (the mapping tech) — your thread straightens to a spine and
//     the 8 production crossings become stations up it.
//
// A seedable FAMILY (helix turns + phases per seed; turns-sum ≥ 1 ⇒ K(6,8)). Pure, deterministic, node-tested.

import { ENGINE_RING, ENGINES, supplyChain } from './engines.js';
import { WHITE, warpOver } from './weave.js';

export const DEFAULTS = { L: 760, R0: 230, waist: 0.34, thick: 96, Nz: 22, Nth: 26, Nr: 4, jitter: 0.5, seed: 1 };
const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;
const swrap = (a) => { a = wrap(a); return a > Math.PI ? a - TAU : a; };     // signed wrap to (-π,π]
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function buildFoam3D(seed = DEFAULTS.seed, opts = {}) {
  const o = { ...DEFAULTS, ...opts, seed: (seed >>> 0) };
  const { L, R0, waist, thick, Nz, Nth, Nr } = o;
  const NW = WHITE.length, NF = ENGINE_RING.length;            // 6 white, 8 production
  const rng = mulberry32((o.seed ^ 0x3d0f) >>> 0);

  // seeded family: counter-rotating helix turns (sum ≥ 1 ⇒ every white sweeps all 8 production) + phases + spin
  const turnsW = 0.6 + 0.4 * rng(), turnsP = 0.6 + 0.4 * rng(), phaseW = rng() * TAU, phaseP = rng() * TAU, dir = rng() < 0.5 ? 1 : -1;
  const warps = WHITE.map((wc, w) => ({ ...wc, w }));
  const wefts = ENGINE_RING.map((id, f) => ({ id, f, ...ENGINES[id] }));

  // hyperboloid radius profile (waist in the middle), and the band-centre helices
  const ringR = (zc) => R0 * (1 + waist * (2 * zc - 1) * (2 * zc - 1));         // wide at the poles
  const thW = (w, zc) => wrap((w + 0.5) * TAU / NW + phaseW - dir * turnsW * TAU * zc);   // white helix centre θ
  const thP = (f, zc) => wrap((f + 0.5) * TAU / NF + phaseP + dir * turnsP * TAU * zc);   // production helix centre θ
  const bandW = (th, zc) => Math.min(NW - 1, Math.max(0, Math.floor(NW * wrap(th - phaseW + dir * turnsW * TAU * zc) / TAU)));
  const bandF = (th, zc) => Math.min(NF - 1, Math.max(0, Math.floor(NF * wrap(th - phaseP - dir * turnsP * TAU * zc) / TAU)));
  // axial height (zc∈[0,1]) where white w crosses production f (band centres coincide) — the station up a thread
  function crossingZc(w, f) {
    const c = ((w + 0.5) / NW - (f + 0.5) / NF) + (phaseW - phaseP) / TAU;     // constant part / TAU turns
    const slope = dir * (turnsW + turnsP);                                     // turns swept over zc 0→1
    for (let n = -2; n <= 2; n++) { const zc = (c - n) / slope; if (zc >= 0 && zc <= 1) return zc; }
    return 0.5;
  }

  // ── the volumetric foam: jittered cylindrical lattice of nuclei + lattice adjacency ──
  const id = (iz, ith, ir) => iz * Nth * Nr + ((ith % Nth + Nth) % Nth) * Nr + ir;   // ith wraps (the ring closes)
  const nuclei = [];
  const hubBand = Math.max(1, Math.round(Nz * 0.10));          // the pole caps = the hubs
  for (let iz = 0; iz < Nz; iz++) for (let ith = 0; ith < Nth; ith++) for (let ir = 0; ir < Nr; ir++) {
    const zc = (iz + 0.5 + (rng() - 0.5) * o.jitter) / Nz;
    const th = wrap((ith + 0.5 + (rng() - 0.5) * o.jitter) / Nth * TAU);
    const rr = ringR(zc), rho = rr - thick + (ir + 0.5 + (rng() - 0.5) * o.jitter) / Nr * thick;
    const z = (zc - 0.5) * L, x = rho * Math.cos(th), y = rho * Math.sin(th);
    const over = ir >= Nr / 2;                                  // outer half = over (upper), inner = under
    const w = bandW(th, zc), f = bandF(th, zc), even = (w + f) % 2 === 0;
    // owner of this chamber: the OVER thread rides outer chambers, UNDER thread inner; parity says who's over
    const ownerKind = (over === even) ? 'warp' : 'weft';        // over&even → white; over&odd → production; etc.
    let owner = ownerKind === 'warp' ? { kind: 'warp', idx: w } : { kind: 'weft', idx: f };
    let hub = null;
    if (iz >= Nz - hubBand) { hub = 'whub'; owner = { kind: 'whub' }; }     // top cap = white hub
    else if (iz < hubBand) { hub = 'phub'; owner = { kind: 'phub' }; }      // bottom cap = production hub
    nuclei.push({ i: id(iz, ith, ir), iz, ith, ir, zc, th, x, y, z, rho, over, w, f, even, owner, hub, neighbors: [] });
  }
  // lattice adjacency (axial ±1, azimuthal ±1 wrapping, radial ±1)
  const add = (a, b) => { if (nuclei[a] && nuclei[b]) { nuclei[a].neighbors.push(b); nuclei[b].neighbors.push(a); } };
  for (let iz = 0; iz < Nz; iz++) for (let ith = 0; ith < Nth; ith++) for (let ir = 0; ir < Nr; ir++) {
    const a = id(iz, ith, ir);
    if (iz + 1 < Nz) add(a, id(iz + 1, ith, ir));
    add(a, id(iz, ith + 1, ir));                                // wraps
    if (ir + 1 < Nr) add(a, id(iz, ith, ir + 1));
  }
  for (const n of nuclei) n.neighbors = [...new Set(n.neighbors)];

  // ── threads: a white thread = the over-shell chambers of its band (a helical tube); production likewise ──
  const whiteThreads = warps.map((wc) => ({ ...wc, kind: 'white', cells: nuclei.filter((n) => !n.hub && n.owner.kind === 'warp' && n.w === wc.w).map((n) => n.i) }));
  const prodThreads = wefts.map((wf) => ({ ...wf, kind: 'prod', cells: nuclei.filter((n) => !n.hub && n.owner.kind === 'weft' && n.f === wf.f).map((n) => n.i) }));

  // realised contacts: white w meets production f wherever a chamber carries both bands
  const pairs = new Set(); for (const n of nuclei) if (!n.hub) pairs.add(n.w + ':' + n.f);

  // ── tours: enter a white thread at the top hub, ride it down; meet each production at its crossing height ──
  const tours = warps.map((wc) => ({
    w: wc.w, label: wc.label,
    stops: wefts.map((wf) => ({ f: wf.f, engine: wf.id, label: wf.label, glyph: wf.glyph, over: warpOver(wc.w, wf.f), zc: crossingZc(wc.w, wf.f) }))
      .sort((a, b) => b.zc - a.zc),                              // top (z=1, the white hub) downward
  }));

  const supply = supplyChain().filter((e) => e.from !== 'fulfillment' && e.to !== 'fulfillment').map((e) => ({ ...e, fa: ENGINE_RING.indexOf(e.from), fb: ENGINE_RING.indexOf(e.to), color: ENGINES[e.from].color }));

  return {
    L, R0, thick, Nz, Nth, Nr, seed: o.seed, NW, NF, warps, wefts, nuclei, whiteThreads, prodThreads,
    tours, supply, contactPairs: pairs.size, contact: { everyTouchesEvery: pairs.size === NW * NF },
    family: { turnsW, turnsP, phaseW, phaseP, dir }, ringR, thW, thP, bandW, bandF, crossingZc, swrap,
  };
}

if (typeof globalThis !== 'undefined') globalThis.RindFoam3D = { buildFoam3D };
