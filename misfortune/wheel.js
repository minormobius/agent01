// misfortune/wheel.js — the physics of a game-show wheel. Pure: no DOM, so the
// landing rule can be tested in node (misfortune.selftest.mjs).
//
// The wheel turns clockwise. Angle θ (radians) is how far it has turned. The
// needle sits at the top (screen angle −90°). Wedge i spans [i·w, (i+1)·w) of
// the wheel's own angle, starting at the top when θ = 0, so the wedge under
// the needle is the one at wheel-angle (−θ) mod 2π.
//
// Pegs ("separation rods") sit on every wedge boundary. Each time one passes
// the needle it knocks the flapper aside and steals a little speed — which is
// what makes a real wheel tick, slow, and sometimes rock back off a peg.

export const TAU = Math.PI * 2;
export const mod = (a, m) => ((a % m) + m) % m;

/** Index of the wedge under the needle at wheel angle θ. */
export function wedgeAt(theta, n) {
  return Math.floor(mod(-theta, TAU) / (TAU / n)) % n;
}

/**
 * Advance the wheel by dt seconds.
 * state: { theta, omega, needle, needleV, lastPeg }
 * Returns the number of pegs that passed the needle in this step (for clicks).
 */
export function step(s, dt, n, {
  drag = 0.42,          // proportional loss, 1/s
  friction = 0.55,      // constant loss, rad/s²
  pegLoss = 0.012,      // fraction of ω lost per peg
  pegWidth = 0.055,     // fraction of a wedge where the peg touches the flapper
  stiffness = 340, damping = 22, kick = 0.85,
} = {}) {
  const w = TAU / n;
  const before = Math.floor(mod(-s.theta, TAU) / w);
  s.omega -= s.omega * drag * dt + Math.sign(s.omega) * friction * dt;
  if (Math.abs(s.omega) < 0.02) s.omega = 0;
  s.theta += s.omega * dt;

  // pegs crossed (boundaries are at wheel angles k·w; the needle reads −θ)
  const pos = mod(-s.theta, TAU) / w;
  const after = Math.floor(pos);
  let crossed = 0;
  if (after !== before) {
    crossed = Math.max(1, Math.min(n, Math.abs(Math.round(s.omega * dt / w))));
    s.omega *= Math.pow(1 - pegLoss, crossed);
  }
  // flapper: bent by a peg in contact, spring-damped back to rest
  const frac = pos - Math.floor(pos);                // 0 at a boundary
  const dist = Math.min(frac, 1 - frac);             // in wedges
  let target = 0;
  if (dist < pegWidth) target = -Math.sign(s.omega || 1) * kick * (1 - dist / pegWidth);
  // Stopped with a peg pressing the flapper: the bent flapper springs back and
  // rocks the wheel off the peg into the wedge it was entering — the little
  // back-step that makes the last half-second of a real spin agonising.
  if (s.omega === 0 && dist < pegWidth) s.omega = frac < 0.5 ? -0.25 : 0.25;
  const a = stiffness * (target - s.needle) - damping * s.needleV;
  s.needleV += a * dt;
  s.needle += s.needleV * dt;
  if (crossed && Math.abs(s.needle) < 0.2) s.needleV -= Math.sign(s.omega || 1) * 9;
  return crossed;
}

/** Run a spin to rest; returns { theta, index, pegs, seconds }. */
export function simulate(theta0, omega0, n, opts) {
  const s = { theta: theta0, omega: omega0, needle: 0, needleV: 0 };
  let pegs = 0, t = 0;
  const dt = 1 / 120;
  while ((s.omega !== 0 || Math.abs(s.needle) > 1e-3) && t < 60) { pegs += step(s, dt, n, opts); t += dt; }
  return { theta: s.theta, index: wedgeAt(s.theta, n), pegs, seconds: t };
}

/** A pleasing random launch speed: 2.5–5 turns' worth of energy. */
export function launchSpeed(rand = Math.random) {
  return 9 + rand() * 7;   // rad/s
}
