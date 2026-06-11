// tide/ratchet/sim/ratchet.mjs — the ratchet topology: why a lake on a rotating cylinder
// is NOT a secant line, and the carved terrain that makes lakes possible at all.
//
// In the rotating frame the effective potential is Φ(r) = −½ω²r², so equipotentials are
// circles CONCENTRIC WITH THE AXIS. A liquid free surface is an equipotential ⇒ a lake
// surface is an ARC of constant radius — never a chord. A chord is "level" only in the
// uniform gravity of a flat world; here a chord's midpoint sits r·(1−cos φ) closer to the
// axis than its endpoints (φ = the shoreline half-angle), which is spurious HEAD — for a
// 3 km lake that's ~140 m of it, and the water runs off the ends. Corollary: on a
// perfectly smooth cylinder there are no lakes at all — any water relaxes into a uniform
// annular film. Lakes need topology.
//
// The topology is a RATCHET: `teeth` asymmetric teeth carved into the floor, one per
// lake/forest/jet. Going PROGRADE (with the spin) from each lake: a short steep SCARP up
// to the crest, then a long gentle GLIDE descending into the next basin. The fountain at
// each lake throws water inward; Coriolis drifts the sheet prograde; it lands past the
// crest on the glide and runs downhill — into the NEXT lake. Irrigation water ratchets
// around the rim (lake → forest slope → next lake), a circulating river that closes after
// one full turn. The grade that collects the runoff and the asymmetry that makes the
// water circulate are the same design choice.
//
// Pure, zero-dep, deterministic; node + browser. SI units (m, s, Pa); angles in rad,
// θ = 0 at a lake centre, +θ prograde.

import { CYLINDER } from '../../shared/geometry.mjs';
import { simulate as fountainSim, defaultParams as fountainDefaults } from '../../fountain/sim/fountain.mjs';

const RHO_W = 1000;

export function defaultParams() {
  const R = CYLINDER.R_hab;
  return {
    R, omega: CYLINDER.omega,
    teeth: 3,                  // ratchet teeth = lakes = forests = jets
    crest: 250,                // crest height above the basin floor, m
    basinFrac: 0.06,           // fraction of a tooth that is flat basin floor (centred on the lake)
    scarpFrac: 0.06,           // fraction of a tooth that is the steep prograde scarp
    lakeArea_m2pm: 1.5e5,      // water cross-section per lake, m² per metre of axial length
    nTheta: 1440,              // azimuthal samples for the fill integral
  };
}

// Tooth arc angle (rad) and the crest azimuth measured prograde from the lake centre.
export const toothAngle = (p) => (2 * Math.PI) / p.teeth;
export const crestTheta = (p) => (p.basinFrac / 2 + p.scarpFrac) * toothAngle(p);

// Terrain elevation e(θ) ≥ 0 above the structural floor at r = R (ground radius is
// R − e: terrain is built INWARD — "up" is toward the axis). Periodic sawtooth:
//   basin floor (e = 0) → steep scarp up to the crest → long glide back down to the
//   next basin. θ = 0 is a lake centre; +θ is prograde.
export function elevation(p, theta) {
  const T = toothAngle(p);
  let u = (theta / T) % 1; if (u < 0) u += 1;          // position within the tooth, 0..1
  const b = p.basinFrac / 2, s = p.scarpFrac;
  if (u < b || u >= 1 - b) return 0;                   // basin floor (this lake / the next)
  if (u < b + s) return p.crest * ((u - b) / s);       // the scarp (steep, short)
  return p.crest * (1 - (u - b - s) / (1 - 2 * b - s)); // the glide (gentle, long)
}

export const groundRadius = (p, theta) => p.R - elevation(p, theta);

// Fill one lake with a water cross-section `area` (m² per metre of axial length): solve
// the free-surface radius r_w — an equipotential ARC, constant r — by bisection on
//   area(r_w) = ∫ ½ (r_g(θ)² − r_w²) dθ   over θ where r_g(θ) > r_w.
// Returns the surface, shorelines, depths, the secant-fallacy sag, and the overflow/film
// flag (surface above the crest ⇒ the "lake" is a connected annular sea, not a lake).
export function fillLake(p = defaultParams(), area = p.lakeArea_m2pm) {
  const T = toothAngle(p);
  const n = Math.max(96, Math.round(p.nTheta / p.teeth));
  const dth = T / n;
  // one tooth, centred on the basin: θ ∈ [−T/2, +T/2)
  const thetas = Array.from({ length: n }, (_, i) => -T / 2 + (i + 0.5) * dth);
  const rg = thetas.map((th) => groundRadius(p, th));
  const areaAt = (rw) => {
    let A = 0;
    for (let i = 0; i < n; i++) if (rg[i] > rw) A += 0.5 * (rg[i] * rg[i] - rw * rw) * dth;
    return A;
  };
  // bracket: surface between "spread over everything" and "bone dry"
  let lo = p.R - p.crest - (2 * area) / (p.R * T) - 1, hi = p.R;
  const target = Math.min(area, areaAt(lo) * 0.999999);
  for (let it = 0; it < 64; it++) { const mid = 0.5 * (lo + hi); if (areaAt(mid) > target) lo = mid; else hi = mid; }
  const rw = 0.5 * (lo + hi);
  const overflow = p.R - rw > p.crest;                 // surface above the crest ⇒ annular film/sea
  // shoreline: walk outward from the basin centre to the first dry sample on each side
  const mid = Math.floor(n / 2);
  let iRetro = 0, iPro = n - 1;
  for (let i = mid; i >= 0; i--) { if (rg[i] <= rw) { iRetro = i + 1; break; } }
  for (let i = mid; i < n; i++) { if (rg[i] <= rw) { iPro = i - 1; break; } }
  const shoreRetro = overflow ? -T / 2 : thetas[Math.max(0, iRetro)];
  const shorePro = overflow ? T / 2 : thetas[Math.min(n - 1, iPro)];
  const span = shorePro - shoreRetro;                  // angular width of the surface
  const halfSpan = span / 2;
  // depths: basin floor is the structural floor at r = R
  const depthMax = p.R - rw;
  const surfaceArc_m = rw * span;
  const meanDepth = target / Math.max(surfaceArc_m, 1e-9);
  // the secant fallacy: a chord between the two shoreline points sags rw(1−cos φ) toward
  // the axis at mid-span — spurious head a real (equipotential-arc) surface doesn't have
  const secantSag_m = rw * (1 - Math.cos(halfSpan));
  const gFloor = p.omega * p.omega * p.R;
  return {
    rw, depthMax, meanDepth, overflow,
    shoreRetro, shorePro, span, surfaceArc_m,
    secantSag_m,
    bedPressure_Pa: 0.5 * RHO_W * p.omega * p.omega * (p.R * p.R - rw * rw), // exact rotating-frame hydrostatic
    bedPressure_kPa: 0.5 * RHO_W * p.omega * p.omega * (p.R * p.R - rw * rw) / 1000,
    gFloor,
    areaTarget: target, areaSolved: areaAt(rw),
  };
}

// Where does water landing at azimuth θ (prograde from a lake centre) drain to?
// Returns the basin index relative to the launch lake: 0 = back into its own lake,
// 1 = the next lake prograde, etc. On the scarp it runs back down into its own basin;
// past the crest it's on the glide and runs prograde into the next.
export function drainsTo(p, theta) {
  const T = toothAngle(p);
  const k = Math.floor((theta + T / 2) / T);           // which tooth the landing is in
  const local = theta - k * T;                         // −T/2 .. +T/2 around basin k
  if (local <= crestTheta(p)) return k;                // basin or scarp → its own lake
  return k + 1;                                        // the glide → next lake prograde
}

// THE RATCHET RIVER — couple the fountain to the terrain. Run the jet from a lake
// centre, take each stream's landing azimuth (driftArc / R), and ask the terrain which
// basin it drains into. hopFraction is the share of the irrigation water that ratchets
// forward into the NEXT lake (the circulating river); the rest runs back home.
export function ratchetFlow(p = defaultParams(), fp = fountainDefaults()) {
  const sim = fountainSim(fp);
  const lands = sim.streams.map((st) => {
    const theta = st.driftArc / p.R;                   // landing azimuth, prograde +
    const target = drainsTo(p, theta);
    return { theta, arc: st.driftArc, elev: elevation(p, theta), target };
  });
  const hops = lands.filter((l) => l.target >= 1).length;
  return {
    lands, sim,
    hopFraction: hops / lands.length,
    crestArc_m: crestTheta(p) * p.R,
    meanLandingArc_m: lands.reduce((a, l) => a + l.arc, 0) / lands.length,
    circulates: hops / lands.length > 0.5,             // most of the water moves forward
  };
}

export const KNOWN_SIMPLIFICATIONS = [
  'Terrain is a piecewise-linear sawtooth per tooth (basin / scarp / glide); real grading would be smoothed and have axial structure.',
  'The free surface is exact rotating-frame hydrostatics (an equipotential arc); waves, Coriolis circulation inside the lake, and seiches are not modelled.',
  'Runoff routing is topological (which side of the crest you land on), not a resolved shallow-water flow; infiltration/soil storage is Module 4’s box model.',
  'The fountain coupling reuses the 2-D ballistic streams; landing is read at the rim radius, not intersected with the raised terrain (crest ≪ apex, a small error).',
];

const Ratchet = {
  defaultParams, toothAngle, crestTheta, elevation, groundRadius,
  fillLake, drainsTo, ratchetFlow, KNOWN_SIMPLIFICATIONS,
};
if (typeof globalThis !== 'undefined') globalThis.Ratchet = Ratchet;
export default Ratchet;
