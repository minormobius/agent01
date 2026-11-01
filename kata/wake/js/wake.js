/* WAKE's wake, no DOM: Kelvin's construction, in one more dimension.

   A boat moving at U through deep water keeps making waves. Those that keep up with it (stationary in its frame) are the
   ones whose phase speed U cos θ matches its speed along their direction n, at angle θ to its heading; deep-water waves
   carry their energy at HALF their phase speed. So what the boat stirred at s, a time a ago, has spread to
       s + (U a / 2) cos θ · n        over every direction n,
   which is a SPHERE (in the 3D surface, x, z and w) through s, of radius U a / 4, centred U a / 4 ahead of s. The boat is
   U a ahead of s by now, so the sphere subtends sin α = (U a / 4) / (U a − U a / 4) = 1/3 from it, at every age. On our
   water those spheres are circles and their envelope is a wedge of half-angle 19.47°, Kelvin's; here the envelope
   turns about the track into a CONE of the same half-angle. Your slice cuts the cone: a V when the boat heads along
   your slice, a pair of curves, or a ring ahead when it heads out of it.

   The page draws each remembered moment's sphere as a crest (a ridge on the water) that fades with age and is stronger
   the faster the boat went, strongest where the sphere touches the cone (70.5° from the heading, cos ψ = 1/3: Kelvin's
   cusp waves), weaker behind (the transverse waves), so the cone's edge is what shows. That's the
   construction drawn as it goes, not a solution of the water's equations: the crest pattern inside is stylised. */
export const ALPHA = Math.asin(1 / 3), N_SHELLS = 32, EVERY = 0.3, MAX_AGE = N_SHELLS * EVERY;
/* the remembered moments: push one every EVERY seconds */
export function remember(hist, boat, t) {
  if (!hist.length || t - hist[hist.length - 1].t >= EVERY) { hist.push({ p: boat.pos.slice(), T: boat.T.slice(), u: Math.max(0, boat.u), t }); if (hist.length > N_SHELLS) hist.shift(); }
}
/* the spheres now: centre (x, z, w), radius, and the crest's height */
export function shells(hist, t) {
  return hist.map((m) => { const a = t - m.t, r = (m.u * a) / 4; return { c: m.p.map((x, i) => x + r * m.T[i]), r, T: m.T, A: (0.007 * m.u * m.u) / (1 + 0.35 * a) * Math.min(1, a / 0.6) * (1 - a / MAX_AGE) }; }).filter((s) => s.A > 1e-4);
}
