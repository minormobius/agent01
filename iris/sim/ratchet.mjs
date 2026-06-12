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
    teeth: 4,          // ratchet teeth = lakes = forests = jets
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

export default { defaultParams, toothAngle, crestTheta, elevation, groundRadius, inBasin, lakeRadius };
