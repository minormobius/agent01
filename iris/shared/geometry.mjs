// iris/shared/geometry.mjs — the cross-section, one source of truth.
//
// iris looks straight DOWN THE AXIS of an O'Neill cylinder: a circle. This is the design
// the user is staring at — a small ring habitat:
//
//   bore (air)        r ∈ [0, R_floor]   — the breathable interior, axis (r=0) to floor.
//   habitat floor     R_floor = 4 km     — the inner rim: where people stand, max gravity,
//                                           where the ratchet teeth and the lakes live.
//   shell             4 → 5 km           — structure + water reservoirs + the heat pipes
//                                           that carry the habitat's heat outward.
//   radiator skin     R_skin = 5 km      — the outer surface that dumps heat to space.
//
// Gravity is centrifugal: g(r) = ω²r, ZERO at the axis ("up"), MAX at the floor ("down").
// Spin is set so the floor feels a chosen gravity (1 g by default): ω = √(g_floor / R_floor).
//
// Pure data + tiny helpers, zero-dep, node + browser. SI units (m, s, K, Pa, kg).

export const R_FLOOR = 4000;    // inner rim / habitat floor, m
export const R_SKIN = 5000;     // outer radiator skin, m
export const G0 = 9.80665;      // standard gravity, m/s²

// spin rate that puts gravity g at radius R
export const omegaFor = (g, R) => Math.sqrt(g / R);
// centrifugal gravity at radius r
export const gravityAt = (omega, r) => omega * omega * r;
// the speed that just climbs from the floor to the axis (the full centrifugal potential)
export const axisReachSpeed = (omega, R) => omega * R;

export const CIRCLE = {
  R_floor: R_FLOOR,
  R_skin: R_SKIN,
  shell: R_SKIN - R_FLOOR,        // 1 km of structure + reservoirs + heat pipes
  G0,
  omega: omegaFor(G0, R_FLOOR),   // ≈0.0495 rad/s (1 g at the 4 km floor; ~0.47 rpm)
};

export default CIRCLE;
