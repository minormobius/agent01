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

import { Field, hsv2rgb } from './field.mjs';
import { sense, ruleTurn, evalRule, DEFAULT_CFG, matchedBrush } from './rule.mjs';
import { readDescriptors, order } from './probe.mjs';

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
 * The one constant that could NOT be ported, so it was calibrated and frozen.
 *
 * fluoddity's GPU blends alpha into an 8-bit canvas; this accumulates float
 * into a buffer. There is no constant to carry across. It was fitted once, on
 * the DETERMINISTIC arm only, so the field lands inside fluoddity's own
 * healthy band rather than saturated white — and then frozen, before any arm
 * that involves the model was run. Tuning the substrate after seeing which
 * arm won would be the most obvious way to fake this result.
 */
export const INK_SCALE = 0.01;

/** Deterministic PRNG so every arm starts from byte-identical conditions. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function makeSwarm({ n = 256, dim = 128, seed = 7, cfg = DEFAULT_CFG,
  baseBrush = 0.0015 * 2, baseCount = 55000, inkScale = INK_SCALE } = {}) {
  const r = rng(seed);
  const field = new Field(dim, { ...cfg, inkScale, brush: matchedBrush(baseBrush, baseCount, n) });
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, sp = 0.002 + r() * 0.004;
    parts.push({ i, x: r() * 2 - 1, y: r() * 2 - 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
  }
  return { field, parts, cfg, n, t: 0, prevLum: null };
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
  for (let k = 0; k < senses.length; k++) {
    const { p, s } = senses[k];
    const det = ruleTurn(s, cfg);
    const turn = turns[k];
    const fx = s.fwd[0] * det.axial * cfg.axial_force + s.lft[0] * turn * cfg.lateral_force;
    const fy = s.fwd[1] * det.axial * cfg.axial_force + s.lft[1] * turn * cfg.lateral_force;
    const m = cfg.global_force_mult / 400;
    p.vx = p.vx * cfg.drag + fx * m;
    p.vy = p.vy * cfg.drag + fy * m;
    p.x += p.vx; p.y += p.vy;
    // The torus, exactly as the shader wraps it.
    p.x = 2 * (((p.x * 0.5 - 0.5) % 1 + 1) % 1 - 0.5);
    p.y = 2 * (((p.y * 0.5 - 0.5) % 1 + 1) % 1 - 0.5);
    const raw = evalRule(0.5, cfg.mutation_scale, 0, s.sig);
    const hue = ((Math.atan2(raw[1], raw[0]) / (2 * Math.PI) + 0.5) % 1 + 1) % 1;
    const mag = Math.max(0.06, Math.min(1.1, Math.hypot(raw[0], raw[1]) * 0.55));
    field.deposit(p.x, p.y, hsv2rgb(hue, 0.85, mag));
  }
  field.settle();
  sw.t++;
}

/** Descriptors for the field as it stands, with motion against the last read. */
export function probe(sw) {
  const lum = sw.field.probeLum();
  const v = readDescriptors(lum, sw.prevLum);
  sw.prevLum = lum;
  return v;
}

export const orderOf = (sw) => order(sw.parts);

/** The deterministic arm, and the reference every other arm is scored against. */
export const ruleDecider = (sw, senses) => senses.map(({ s }) => ruleTurn(s, sw.cfg).turn);

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
