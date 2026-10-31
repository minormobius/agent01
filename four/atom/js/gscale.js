/* What sets G, no DOM. Nothing in physics fixes Newton's constant, in our world or this one; what can be said is what
   each value of it makes. Gravity pinned at 1/r in 4D (the lens, as the stars chapter assumes) keeps the force's units,
   so α_G = G m_p²/ħc is a pure number in both worlds (ours 5.9 × 10⁻³⁹) and every star and planet can be read off it.

   · Stars. Under a 1/r potential a ball of gas holds only if its pressure stiffens faster than γ = 1 + 1/d (stars.js
     criticalGamma). Light, and electrons squeezed to near light speed, sit exactly there in every d, so 4D has a
     Chandrasekhar mass as we do: the index-d polytrope of ultra-relativistic electrons (P = c p_F n/(d + 1)), which in
     pinned 4D closes at a finite radius. N_Ch = c_d α_G^(−d/(d−1)) nucleons: the same window of stars at any G, only
     the count of atoms in a star changing with it.
   · Planets. Escape speed obeys v² = 2gR in any d, so a planet with Earth's g and Earth's hold on air has Earth's
     radius in 4D too, and that fixes G ρ₄ = 2g/(π²R²) (ρ₄ the rock's mass per 4-volume). How dense 4D rock is (which
     elements, which solids) is what pins G. */
import { polytrope } from "./stars.js";

export const SI = { G: 6.6743e-11, hbar: 1.054571817e-34, c: 2.99792458e8, mp: 1.67262192e-27, k: 1.380649e-23, amu: 1.66053907e-27, Msun: 1.98847e30, gEarth: 9.80665, REarth: 6.371e6 };
export const alphaG = (G = SI.G) => (G * SI.mp * SI.mp) / (SI.hbar * SI.c);
const ballVolume = (d) => (d === 3 ? (4 * Math.PI) / 3 : (Math.PI * Math.PI) / 2); // unit d-ball
const LAW = { 3: "newton", 4: "pinned4" };

/* the Chandrasekhar mass in d dimensions: c_d (N_Ch = c_d α_G^(−d/(d−1)) nucleons) and, for a given G, the mass (kg).
   An index-n polytrope with P = K ρ^(1+1/n) has R^(d−1) ∝ K ρ_c^(1/n − 1)/G, so for n = d its mass is M₀ (K/(G K₀))^(d/(d−1))
   whatever its central density (M₀, K₀ the polytrope's in units G = 1, R = 1, ρ_c = 1) */
export function chandrasekhar(d, { mue = 2, N = 400 } = {}) {
  const p = polytrope(LAW[d], d, { N }), { hbar, c, mp } = SI;
  const K = (2 * Math.PI * hbar * c * Math.pow(2 * ballVolume(d), -1 / d)) / (d + 1) / Math.pow(mue * mp, 1 + 1 / d); // n = 2V_d p_F^d/(2πħ)^d
  const mass = (G = SI.G) => p.M * Math.pow(K / (G * p.K), d / (d - 1));
  return { cd: (mass() / mp) * Math.pow(alphaG(), d / (d - 1)), mass, exponent: d / (d - 1), polytrope: { M: p.M, K: p.K, converged: p.converged } };
}

/* the planet like Earth (Earth's g and Earth's escape speed, so Earth's radius) for rock of density rho4 (kg/m⁴): the
   G it needs, its mass, and what that G makes of stars */
export function earthLike(rho4, { g = SI.gEarth, R = SI.REarth } = {}) {
  const G = (2 * g) / (Math.PI * Math.PI * R * R * rho4), M = ballVolume(4) * rho4 * R ** 4, ch = chandrasekhar(4);
  return { G, ratio: G / SI.G, alphaG: alphaG(G), planetMass: M, starMass: ch.mass(G), planetOverStar: M / ch.mass(G) };
}

/* at any G, the smallest 4D planet that holds air (G M m/R ≥ hold·kT for molecules of mass m) and its surface gravity,
   and the size past which a ball of the rock is inside its own 2GM/c² (a dark star, whatever gravity's relativistic form) */
export function planetsAt(G, rho4, { T = 300, m = 30 * SI.amu, hold = 50 } = {}) {
  const k = (Math.PI * Math.PI) / 2, R = Math.cbrt((hold * SI.k * T) / m / (G * rho4 * k)), g = G * rho4 * k * R * R;
  return { airR: R, airG: g, darkR: Math.cbrt((SI.c * SI.c) / (2 * G * rho4 * k)) };
}
