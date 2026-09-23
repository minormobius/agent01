// swarm.mjs — one simulation, four possible deciders, identical everything else.
//
// THE COMPARISON ONLY MEANS SOMETHING IF ONE THING VARIES. Every arm shares
// the same genome, the same field, the same integration, the same axial
// thrust, the same seed and the same initial conditions. The ONLY difference
// is who answers "how hard should this particle turn?".
//
// Arms:
//   rule    — fluoddity's own brain. The system as it actually is.
//   jev     — one typed question per particle per tick, all in one call.
//   random  — uniform over the identical rungs. Without this, any structure
//             at all would read as the model producing structure, and a
//             stigmergic field produces structure on its own.
//   frozen  — turn 0 for everyone. The floor: what the field does with no
//             steering whatsoever.
//
// The turn is an ORDERED, BOUNDED quantity — hard left through straight to
// hard right — so it is asked as a `score` over a ladder, not a `choice`.
// That follows the shape table: heading is circular and would need a choice,
// but a turn RATE is a bounded ordered scalar and `score` returns the
// expectation across the rungs, which is a continuous turn from discrete
// options. This is the same reasoning the exposure ladder uses in the lab.

import { Field, matchSubstrate } from './field.mjs';
import { sense, ruleTurn, DEFAULT_CFG, resetState } from './rule.mjs';
import { readDescriptors, order, cohortOrder } from './probe.mjs';

/** The turn ladder: five rungs, symmetric, in units of the rule's own scale. */
export const TURN_RUNGS = [-1, -0.5, 0, 0.5, 1];
export const TURN_WORDS = [
  'turn hard toward the left',
  'bear gently left',
  'hold this heading, do not turn',
  'bear gently right',
  'turn hard toward the right',
];

/**
 * THE CALIBRATED CONSTANT IS GONE, and its absence is the point.
 *
 * This page used to carry a caveat — "one constant was calibrated, not
 * ported: the GPU blends alpha into an 8-bit canvas, this accumulates float,
 * so there is no constant to carry across." That was true of a deposit that
 * ACCUMULATED. fluoddity's does not: `canvas = blur(canvas)·persistence +
 * (1 − persistence)·brush` is a lerp between two velocity fields, in the same
 * units on both sides, with nothing free to fit. The fudge factor existed to
 * hold up a blend that was wrong. See the header of `field.mjs`.
 */

/** Deterministic PRNG so every arm starts from byte-identical conditions. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * `substrate` defaults to fluoddity's OWN normalisation — `viewcontrols.js`'s
 * `sqrt(M_REF / (count·baseBrush²))` — which is how fluoddity makes the same
 * organism read at the same field energy on a surface with a different
 * particle count. At 256 particles on a 480 field that comes out at ×13.1.
 * Pass `substrate: 1` for fluoddity's raw brush at this dim instead.
 */
export function makeSwarm({ n = 256, dim = 128, seed = 7, cfg = DEFAULT_CFG,
  substrate = null, turnScale = null } = {}) {
  const field = new Field(dim, { ...cfg, substrate: substrate ?? matchSubstrate(dim, n) });
  // Fluoddity's own `resetState`, not a uniform scatter. The cohorts spawn as
  // tight blobs, which is where ALL of the interaction comes from: a
  // stigmergic swarm can only steer on trail other particles have already
  // laid down, so starting packed is the difference between a system and a
  // field of loners. `seed` no longer does anything here — the spawn is a
  // deterministic function of the index, as it is on the GPU.
  const parts = [];
  for (let i = 0; i < n; i++) {
    const p = resetState(i, n, cfg);
    p.x0 = p.x; p.y0 = p.y;          // its own spawn point, for dispersal
    parts.push(p);
  }
  const sw = { field, parts, cfg, n, t: 0, prevLum: null, seed, turnScale: turnScale ?? 1 };
  if (turnScale === null) sw.turnScale = calibrateTurn({ n, dim, cfg, substrate });
  return sw;
}

/**
 * THE LADDER HAS TO BE IN THE RULE'S UNITS, and this measures them.
 *
 * Every arm answers on the same ±1 ladder, and `step` multiplies that by
 * `turnScale` to get the lateral the shader would apply. If the scale is
 * wrong the comparison is not between deciders, it is between step sizes —
 * which is exactly the trap the sign-shuffle control already showed this
 * experiment falling into, one level down.
 *
 * So it is MEASURED, not chosen: run the deterministic rule alone for a short
 * warm-up and take the RMS of its own |lateral|. Two properties make that
 * legitimate rather than a fitted constant. It is computed from the rule arm
 * only, so no arm involving the model can influence it; and it is computed
 * BEFORE any arm runs, from the genome, so it cannot be tuned to a result.
 * A ±1 answer then means "as hard as this brain itself ever turns".
 */
export function calibrateTurn({ n, dim, cfg, substrate = null, steps = 120 }) {
  const sw = makeSwarm({ n, dim, cfg, substrate, turnScale: 1 });
  let sq = 0, m = 0;
  for (let t = 1; t <= steps; t++) {
    const senses = senseAll(sw);
    const lat = senses.map(({ p, s }) => ruleTurn(s, cfg, p.cohort || 0).lateral);
    if (t > steps / 2) for (const x of lat) { sq += x * x; m++; }
    step(sw, senses, lat.map((x) => x));     // turnScale 1 → raw, as the rule
  }
  const rms = m ? Math.sqrt(sq / m) : 0;
  return rms > 0 ? rms : 1;
}

/**
 * Read every particle's four sensor numbers. The caller computes; whoever
 * decides only ever sees the result.
 */
export function senseAll(sw) {
  return sw.parts.map((p) => ({ p, s: sense(p, sw.field, sw.cfg) }));
}

/**
 * Advance one tick given a turn per particle. `turns[i]` is in [-1, 1].
 *
 * Axial thrust always comes from the deterministic rule, in every arm — if
 * the model controlled speed as well, a difference in the outcome could not
 * be attributed to steering.
 */
export function step(sw, senses, turns) {
  const { cfg, field } = sw;
  field.clearBrush();          // its framebuffer is cleared every frame
  for (let k = 0; k < senses.length; k++) {
    const { p, s } = senses[k];
    const det = ruleTurn(s, cfg, p.cohort || 0);
    // A decider answers on the normalised ladder; `turnScale` puts it back in
    // the rule's own units, so every arm applies a lateral of the same kind.
    const turn = turns[k] * sw.turnScale;
    const fx = s.fwd[0] * det.axial * cfg.axial_force + s.lft[0] * turn * cfg.lateral_force;
    const fy = s.fwd[1] * det.axial * cfg.axial_force + s.lft[1] * turn * cfg.lateral_force;
    const m = cfg.global_force_mult / 400;
    p.vx = p.vx * cfg.drag + fx * m;
    p.vy = p.vy * cfg.drag + fy * m;
    p.x += p.vx; p.y += p.vy;
    // STRAFE: a direct position displacement, scaled by global_force_mult/20
    // against force's /400, and not subject to drag. Its LATERAL component is
    // steering, so it is handed to whoever is deciding — `turn` scales it the
    // same way it scales the force term. Its axial component stays on the
    // deterministic rule, like axial thrust.
    const sm = (cfg.global_force_mult / 20) * cfg.strafe_power;
    const sx = s.fwd[0] * det.strafeAxial * cfg.axial_force + s.lft[0] * turn * Math.abs(det.strafeLateral) * cfg.lateral_force;
    const sy = s.fwd[1] * det.strafeAxial * cfg.axial_force + s.lft[1] * turn * Math.abs(det.strafeLateral) * cfg.lateral_force;
    p.x += sx * sm; p.y += sy * sm;
    // The torus, exactly as the shader wraps it.
    p.x = 2 * (((p.x * 0.5 - 0.5) % 1 + 1) % 1 - 0.5);
    p.y = 2 * (((p.y * 0.5 - 0.5) % 1 + 1) % 1 - 0.5);
    // WHAT GETS DEPOSITED IS THE PARTICLE'S VELOCITY. `FRAG_BRUSH` writes
    // `vec4(v_vel*k, 0, 0)` and nothing else. The first port invented a colour
    // here — hue from `atan2` of the brain's force output, value from its
    // magnitude — and deposited that, so the field the swarm sensed was a hue
    // pattern rather than a velocity field. It also called `evalRule(0.5, …)`
    // a second time, with the hard-coded seed, purely to make up that colour.
    field.splat(p.x, p.y, p.vx, p.vy);
  }
  field.settle();
  sw.t++;
}

/**
 * Hold one decision across several physics steps — fluoddity's own `substeps`.
 *
 * A tick here is ONE physics step. Fluoddity's playground runs `substeps: 8`
 * per rendered frame at 60fps, so a second of watching it is ~480 steps and
 * the 200-step gate is about four tenths of a second of fluoddity. On a page
 * that spends a model call per step, that is the difference between watching
 * an organism form and watching sixteen blobs sit still for ten minutes.
 *
 * So a decision can be held while the physics runs on. The sensors are re-read
 * every step — only the TURN is held — and it is held for every arm equally,
 * so the comparison is untouched. It is still a deviation and is flagged as
 * one: fluoddity's shader re-evaluates its rule on every step, inside the
 * substep loop. What this buys is reach per call, and the gate is measured at
 * `steps = 1` so the published numbers are not quietly resting on it.
 */
export function advance(sw, turns, steps = 1) {
  for (let i = 0; i < steps; i++) step(sw, senseAll(sw), turns);
}

/** Descriptors for the field as it stands, with motion against the last read. */
export function probe(sw) {
  const lum = sw.field.probeLum();
  const v = readDescriptors(lum, sw.prevLum);
  sw.prevLum = lum;
  return v;
}

export const orderOf = (sw) => ({ ...order(sw.parts), ...cohortOrder(sw.parts) });

/**
 * The deterministic arm, and the reference every other arm is scored against.
 * Reported on the same normalised ladder as every other arm — its own lateral
 * divided by the scale measured from it — and clamped, so "turn hard" is the
 * hardest this brain turns rather than an unbounded outlier.
 */
export const ruleDecider = (sw, senses) => senses.map(({ p, s }) => {
  const x = ruleTurn(s, sw.cfg, p.cohort || 0).lateral / (sw.turnScale || 1);
  return x < -1 ? -1 : x > 1 ? 1 : x;
});

/** The random control, on the identical rung set. */
export function randomDecider(seedRef) {
  const r = rng(seedRef);
  return (sw, senses) => senses.map(() => TURN_RUNGS[Math.floor(r() * TURN_RUNGS.length)]);
}

export const frozenDecider = (sw, senses) => senses.map(() => 0);

/** Which rung a continuous turn falls on — how the arms are compared move by move. */
export const rungOf = (turn) => {
  let best = 0, bd = Infinity;
  for (let i = 0; i < TURN_RUNGS.length; i++) {
    const d = Math.abs(turn - TURN_RUNGS[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
};
