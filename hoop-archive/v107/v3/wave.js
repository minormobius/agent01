// sprite/wave.js — the shared TRAVELING-PHASE-WAVE primitive. The single idea under three body-plan
// locomotions: radial arm-pulses, polypod metachronal legs, and (next) axial undulation are all the
// same thing — a phase that advances in time and lags along an ordered set of parts. Pure, no DOM.

export const TAU = Math.PI * 2;

// phase of part `i` at time `t`. `lag` is the per-part spatial offset (→ a wave travels along the set);
// `base` an absolute offset (e.g. π to put left legs antiphase to right). speed in cycles/sec.
export function travelingPhase(i, t, { speed = 1, lag = 0, base = 0 } = {}) {
  return base + t * TAU * speed + i * lag;
}

// a leg's gait from its phase: swing ∈ [-1,1] (fore/aft drive) and lift ∈ [0,1] (the recovery stroke,
// when the foot is off the ground and swinging forward). The classic insect duty cycle.
export function gaitStep(phase) {
  const s = Math.sin(phase);
  return { swing: s, lift: Math.max(0, s) };
}

// metachronal leg phase: pair `p` of `pairs`, side ∈ {-1 left, +1 right}. Left/right antiphase; a
// wave (or, for ≤3 pairs, the alternating tripod) runs front→back. Returns the phase for gaitStep.
export function legPhase(p, side, pairs, t, { speed = 1 } = {}) {
  const lag = Math.PI * (pairs <= 3 ? 1 : 0.55);
  return travelingPhase(p, t, { speed, lag, base: side < 0 ? Math.PI : 0 });
}
