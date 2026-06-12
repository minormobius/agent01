// iris/sim/ratchet.mjs — the inner-rim topography, as seen end-on.
//
// On a spinning floor "level" means CONSTANT RADIUS (the effective potential Φ=−½ω²r² makes
// equipotentials circles concentric with the axis), so a lake surface is an ARC, never a
// chord, and a perfectly smooth rim holds no lakes — only a uniform film. To hold water you
// carve a RATCHET into the rim: one asymmetric tooth per lake — a short steep SCARP up to a
// crest, then a long gentle GLIDE down into the next basin. Built INWARD (toward the axis),
// because "up" is inward, so the ground radius is R_floor − elevation(θ).
//
// The asymmetry is the point: the fountain throws water inward, Coriolis drifts the sheet
// prograde, it lands on the glide past the crest and runs downhill into the NEXT basin — a
// river that ratchets once around the rim and closes. Here we render only the topography and
// the lakes that sit in the basins.
//
// Pure, zero-dep, deterministic. Angles in rad, θ=0 at a lake centre, +θ prograde.

export function defaultParams() {
  return {
    R_floor: 4000,     // rim radius, m
    teeth: 3,          // ratchet teeth = lakes = forests = jets
    crest: 150,        // crest height above the basin floor, m
    basinFrac: 0.10,   // fraction of a tooth that is flat basin floor (centred on the lake)
    scarpFrac: 0.01,   // fraction that is the steep prograde scarp — near-vertical: this is a
                       // cliff cut in hard structure, not a ramp (steeper = sharper cliff)
    lakeDepth: 40,     // lake water depth at the basin centre, m
  };
}

export const toothAngle = (p) => (2 * Math.PI) / p.teeth;
// crest azimuth, prograde from a lake centre
export const crestTheta = (p) => (p.basinFrac / 2 + p.scarpFrac) * toothAngle(p);

// Terrain elevation e(θ) ≥ 0 above the structural rim. Periodic sawtooth:
//   basin floor (0) → steep scarp up to the crest → long glide back down to the next basin.
export function elevation(p, theta) {
  const Tn = toothAngle(p);
  let u = (theta / Tn) % 1; if (u < 0) u += 1;            // position within the tooth, 0..1
  const b = p.basinFrac / 2, s = p.scarpFrac;
  if (u < b || u >= 1 - b) return 0;                      // basin floor (this lake / the next)
  if (u < b + s) return p.crest * ((u - b) / s);          // scarp (steep, short)
  return p.crest * (1 - (u - b - s) / (1 - 2 * b - s));   // glide (gentle, long)
}

// Ground radius at azimuth θ — terrain builds inward, so smaller r is "higher".
export const groundRadius = (p, theta) => p.R_floor - elevation(p, theta);

// Is this azimuth inside a basin (where a lake can sit)?
export function inBasin(p, theta) {
  const Tn = toothAngle(p);
  let u = (theta / Tn) % 1; if (u < 0) u += 1;
  const b = p.basinFrac / 2;
  return u < b || u >= 1 - b;
}

// The lake free surface is an equipotential arc: a single constant radius across each basin.
export const lakeRadius = (p) => p.R_floor - p.lakeDepth;

// Fill ONE basin with a water cross-section `area` (m² per metre of axial length) and let the
// topology decide the shape. The free surface is an equipotential ARC at constant radius r_w,
// solved by bisection on  area(r_w) = ∫ ½(r_g(θ)² − r_w²) dθ  over θ where the ground r_g(θ)
// lies below the surface (r_g > r_w). Returns the surface radius, the angular span of open
// water, the max depth, the surface arc length (m per m of length — the lake's WIDTH), and an
// overflow flag: once the surface tops the crest the basins join into one annular sea.
//
// This is why topology matters: the basin's shape (its flat floor, its steep scarp, its long
// glide) sets how fast surface area grows with volume, and exactly where it overflows.
export function fillBasin(p, area) {
  const Tn = toothAngle(p);
  const n = 600;
  const dth = Tn / n;
  // one tooth centred on the basin: θ ∈ [−Tn/2, +Tn/2)
  const rg = new Float64Array(n);
  for (let i = 0; i < n; i++) rg[i] = groundRadius(p, -Tn / 2 + (i + 0.5) * dth);
  const areaAt = (rw) => {
    let A = 0;
    for (let i = 0; i < n; i++) if (rg[i] > rw) A += 0.5 * (rg[i] * rg[i] - rw * rw) * dth;
    return A;
  };
  // bracket the surface radius between "dry" (R_floor) and "brim-full at the crest"
  let lo = p.R_floor - p.crest, hi = p.R_floor;
  const areaFull = areaAt(lo);                 // most this basin can hold before overflow
  const overflow = area >= areaFull;
  const target = Math.min(area, areaFull);
  for (let it = 0; it < 64; it++) { const mid = 0.5 * (lo + hi); if (areaAt(mid) > target) lo = mid; else hi = mid; }
  const rw = 0.5 * (lo + hi);
  // angular span of open water (where the ground is below the surface)
  let span = 0;
  for (let i = 0; i < n; i++) if (rg[i] > rw) span += dth;
  const surfaceArc = rw * span;                // m of surface per m of axial length (the width)
  return {
    rw, depthMax: p.R_floor - rw, span, surfaceArc, overflow,
    areaTarget: target, areaSolved: areaAt(rw), areaFull,
  };
}

export default {
  defaultParams, toothAngle, crestTheta, elevation, groundRadius, inBasin, lakeRadius, fillBasin,
};
