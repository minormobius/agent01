// weavecore.js — THE ANALYTIC WEAVE, prism-free. A trimmed vendored port of rind/ops/weave3d.js
// (buildGeometry + weaveLines) + the FACTIONS constant (rind/ops/foam3d.js) + the seven-district
// helpers (rind/ops/officeweave.js). This is the closed-form layer the pocket dimension runs on:
// spiral centrelines, crossing solutions, over/under parity — no prism nodes, no 3D Voronoi, no
// watershed (those are the structural wing's proof machinery; the game only needs the analytic map).
//
// PROVENANCE (the vendor rule — re-sync, never fork): buildGeometry is rind/ops/weave3d.js's minus
// the buildPrism call (thickness = layers · vpitch is the prism's own formula, computed inline);
// weaveLines is verbatim; FACTIONS is foam3d.js's verbatim; districtCentres/SEVEN are
// officeweave.js's verbatim. If a bug is fixed here that also lives upstream, port it back.

const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;
export function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// the three nave factions, two white-collar ops roles each (rind/ops/foam3d.js verbatim)
export const FACTIONS = [
  { id: 'rindwalker', label: 'Rindwalker', color: '#9b6b3a', verbs: ['mend', 'worship'], roleIds: ['perfusion', 'telemetry'], wards: [{ key: 'rind-mend', exclusive: 'mend', level: 'mild' }, { key: 'rind-worship', exclusive: 'worship', level: 'high' }], creed: 'maintenance is meaning — the floor\'s health-keepers' },
  { id: 'continuant', label: 'Continuant', color: '#5566b8', verbs: ['govern', 'grow'], roleIds: ['schedule', 'inventory'], wards: [{ key: 'cont-govern', exclusive: 'govern', level: 'high' }, { key: 'cont-grow', exclusive: 'grow', level: 'mild' }], creed: 'the voyage must continue — the planners & stewards' },
  { id: 'drift', label: 'Drift', color: '#3bb0c9', verbs: ['move', 'trade'], roleIds: ['dispatch', 'gate'], wards: [{ key: 'drift-learn', exclusive: 'learn', level: 'high' }, { key: 'drift-play', exclusive: 'play', level: 'mild' }], creed: 'a floor lives only if things move — the circulators' },
];

import { ENGINES, ENGINE_RING } from './engines.js';

export const WEAVE_DEFAULTS = { rings: 1, spacing: 30, width: 6, flatR: 0.16, maxGrade: 0.6, jitter: 0.18, layers: 4, NW: 6, NF: 8, seed: 1 };
export const VREF_SPACING = 30;   // reference areal spacing that pins the prism thickness (4 decks, ~98 tall)
export const chunkCount = (rings) => 3 * rings * rings + 3 * rings + 1;
const HEXR_AT = (rings) => 320 * (1.5 * rings + 1) / 2.5;   // rings 0/1/2 → hexR 128 / 320 / 512

// the seven aperture-7 districts (rind/ops/officeweave.js verbatim)
export const SEVEN = Math.sqrt(7);
export const SEVEN_TWIST = Math.atan2(Math.sqrt(3), 5);   // ≈19.1066° — the H3 child-lattice rotation
export function districtCentres(R) {
  const Rc = R / SEVEN, d = Math.sqrt(3) * Rc, out = [[0, 0]];
  for (let k = 0; k < 6; k++) { const a = (Math.PI / 6) + k * (Math.PI / 3) + SEVEN_TWIST; out.push([d * Math.cos(a), d * Math.sin(a)]); }
  return out;
}

// ── STAGE 1 (analytic half): the seeded spiral family — weave3d.js#buildGeometry minus the prism ──
export function buildGeometry(seed = WEAVE_DEFAULTS.seed, opts = {}) {
  const o = { ...WEAVE_DEFAULTS, ...opts, seed: (seed >>> 0) };
  const rings = o.rings, a = o.spacing, hexR = HEXR_AT(rings) * (o.hexScale ?? 1);
  const NWmax = FACTIONS.flatMap((f) => f.roleIds).length, NFmax = ENGINE_RING.length;
  const NW = Math.max(2, Math.min(NWmax, o.NW)), NF = Math.max(2, Math.min(NFmax, o.NF));
  const rng = mulberry32((o.seed ^ 0x77a3) >>> 0);
  const vpitch = VREF_SPACING * Math.sqrt(2 / 3);
  const thickness = o.layers * vpitch;   // prism.js's own T = layers · vpitch, inline (no nodes needed)
  const baseTurns = (1.0 + 0.9 * rings) * (o.turnScale ?? 1);
  const family = { turnsW: baseTurns * (0.85 + 0.3 * rng()), turnsP: baseTurns * (0.85 + 0.3 * rng()), phaseW: rng() * TAU, phaseP: rng() * TAU, spin: rng() < 0.5 ? 1 : -1 };
  // THE FACTION AXES: interleave the factions around the ring (R·C·D·R·C·D) so NO thread neighbours
  // its own faction and each faction's two threads sit ANTIPODAL (w, w+3).
  const shade = (hx, k) => '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hx.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('');
  const warps = Array.from({ length: NW }, (_, w) => {
    const fac = FACTIONS[w % FACTIONS.length], slot = Math.floor(w / FACTIONS.length) % fac.roleIds.length;
    const ward = (fac.wards || [])[slot] || null;
    return { id: fac.roleIds[slot], faction: fac.id, factionLabel: fac.label, facColor: fac.color, ward, color: shade(fac.color, ward && ward.level === 'high' ? 1.24 : 0.86), w, kind: 'white' };
  });
  const wefts = ENGINE_RING.map((id, f) => ({ id, f, kind: 'prod', ...ENGINES[id] })).slice(0, NF);
  return {
    seed: o.seed, rings, chunkCount: chunkCount(rings), spacing: a, jitter: o.jitter, layers: o.layers,
    hexR, R: hexR, thickness, vpitch,
    NW, NF, family, warps, wefts,
  };
}

// ── the centrelines: weave3d.js#weaveLines VERBATIM (a TRUE over/under weave outside a flat core) ──
export function weaveLines(geo, opts = {}) {
  const { family, thickness: T, R, NW, NF } = geo;
  const flatR = Math.max(0, Math.min(0.7, opts.flatR ?? WEAVE_DEFAULTS.flatR));
  const maxGrade = opts.maxGrade ?? WEAVE_DEFAULTS.maxGrade;
  const vp = geo.vpitch, zMid = T / 2, Amin = 0.9 * vp, Amax = Math.min(0.46 * T, 1.7 * vp), zBias = Math.min(0.42 * T, (geo.layers / 2 - 0.5) * vp);
  const { turnsW, turnsP, phaseW, phaseP, spin } = family;
  const S = turnsW + turnsP, ph = (phaseW - phaseP) / TAU, Kmax = Math.ceil(Math.abs(S)) + 2;
  const g = (rf) => (rf <= flatR ? 0 : (rf - flatR) / (1 - flatR));
  const rfOfG = (gg) => flatR + gg * (1 - flatR);
  const aW = (w, rf) => wrap((w + 0.5) * TAU / NW + phaseW - spin * turnsW * TAU * g(rf));
  const aP = (f, rf) => wrap((f + 0.5) * TAU / NF + phaseP + spin * turnsP * TAU * g(rf));
  const parityOver = (w, f, k) => ((((w + f + k) % 2) + 2) % 2) === 0;
  const crossW = (w) => { const out = []; for (let f = 0; f < NF; f++) for (let k = -Kmax; k <= Kmax; k++) { const gg = ((w + 0.5) / NW - (f + 0.5) / NF + ph - k) / (spin * S); if (gg > 0.015 && gg < 0.999) out.push({ rf: rfOfG(gg), over: parityOver(w, f, k) }); } return out.sort((a, b) => a.rf - b.rf); };
  const crossP = (f) => { const out = []; for (let w = 0; w < NW; w++) for (let k = -Kmax; k <= Kmax; k++) { const gg = ((w + 0.5) / NW - (f + 0.5) / NF + ph - k) / (spin * S); if (gg > 0.015 && gg < 0.999) out.push({ rf: rfOfG(gg), over: !parityOver(w, f, k) }); } return out.sort((a, b) => a.rf - b.rf); };
  const arcLUT = (turns) => { const M = 200, a = new Float64Array(M + 1); let s = 0; for (let i = 1; i <= M; i++) { const rf = i / M; s += Math.hypot(R, rf * R * turns * TAU) / M; a[i] = s; } return a; };
  const wArc = arcLUT(turnsW), pArc = arcLUT(turnsP);
  const arcAt = (lut, rf) => { const M = lut.length - 1, x = Math.max(0, Math.min(1, rf)) * M, i = Math.floor(x), t = x - i; return i >= M ? lut[M] : lut[i] + (lut[i + 1] - lut[i]) * t; };
  const collapse = (cl) => { const out = []; for (const c of cl) { const p = out[out.length - 1]; if (p && c.rf - p.rf < 0.6 / geo.layers / 6) continue; out.push(c); } return out; };
  const capCtl = (cl, arc, hubSign) => {
    const flats = collapse(cl), Sf = (rf) => arcAt(arc, rf);
    const seq = [{ rf: flatR, s: hubSign }, ...flats.map((c) => ({ rf: c.rf, s: c.over ? 1 : -1 })), { rf: 1, s: flats.length ? (flats[flats.length - 1].over ? 1 : -1) : hubSign }];
    const amp = seq.map((c, k) => { const dP = k > 0 ? Sf(c.rf) - Sf(seq[k - 1].rf) : Infinity, dN = k < seq.length - 1 ? Sf(seq[k + 1].rf) - Sf(c.rf) : Infinity;
      if (k === 0) return Math.min(zBias, (maxGrade / 3) * dN);
      return Math.min(Amax, Math.max(Amin, (maxGrade / 3) * Math.min(dP, dN))); });
    return seq.map((c, k) => ({ rf: c.rf, z: zMid + c.s * amp[k] }));
  };
  const capCtlMeet = (cl, arc, colorSign) => {
    const flats = collapse(cl), Sf = (rf) => arcAt(arc, rf), xs = [flatR, ...flats.map((c) => c.rf), 1], pts = [];
    for (let i = 0; i < xs.length; i++) {
      pts.push({ rf: xs[i], z: zMid + (i === 0 ? colorSign * zBias : 0) });
      if (i < xs.length - 1) { const run = Sf(xs[i + 1]) - Sf(xs[i]), amp = Math.min(Amax, Math.max(Amin, (maxGrade / 3) * (run / 2)));
        pts.push({ rf: (xs[i] + xs[i + 1]) / 2, z: zMid + colorSign * amp }); }
    }
    return pts;
  };
  const capCtlFlat = (cl, arc, colorSign) => { const flats = collapse(cl), firstRf = flats.length ? flats[0].rf : (flatR + 1) / 2; return [{ rf: flatR, z: zMid + colorSign * zBias }, { rf: (flatR + firstRf) / 2, z: zMid }, { rf: 1, z: zMid }]; };
  const interp = (pts, rf) => { if (rf <= pts[0].rf) return pts[0].z; if (rf >= pts[pts.length - 1].rf) return pts[pts.length - 1].z; let i = 0; while (i < pts.length - 1 && pts[i + 1].rf < rf) i++; const a = pts[i], b = pts[i + 1], t = (rf - a.rf) / ((b.rf - a.rf) || 1); return a.z + (b.z - a.z) * (t * t * (3 - 2 * t)); };
  const pick = (cl, arc, sign) => opts.grade === 'flat' ? capCtlFlat(cl, arc, sign) : opts.grade === 'meet' ? capCtlMeet(cl, arc, sign) : capCtl(cl, arc, sign);
  const wCtl = Array.from({ length: NW }, (_, w) => pick(crossW(w), wArc, 1));
  const pCtl = Array.from({ length: NF }, (_, f) => pick(crossP(f), pArc, -1));
  const zW = (w, rf) => interp(wCtl[w], rf), zP = (f, rf) => interp(pCtl[f], rf);
  const lineW = (w, rf) => [rf * R * Math.cos(aW(w, rf)), rf * R * Math.sin(aW(w, rf)), zW(w, rf)];
  const lineP = (f, rf) => [rf * R * Math.cos(aP(f, rf)), rf * R * Math.sin(aP(f, rf)), zP(f, rf)];
  return { flatR, maxGrade, g, aW, aP, zW, zP, lineW, lineP };
}
