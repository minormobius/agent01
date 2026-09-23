// rule.mjs — fluoddity's per-particle rule, ported to the CPU.
//
// WHY THIS SUBSTRATE. Fluoddity's particle rule is already the exact shape a
// typed question takes. Each particle senses the trail field at two points off
// its own heading, projects both readings into its own body frame, and gets
// FOUR SCALARS: (left·forward, left·lateral, right·forward, right·lateral).
// A nonlinear "brain" maps those four numbers to a force. That is
// compute-first by construction — the caller already does all the arithmetic,
// and what is left is a decision over a small vector. We did not have to bend
// the simulation to fit the model; it was already this shape.
//
// WHAT THIS FILE IS NOT. It is a port of `fluoddity/engine.js`'s GLSL
// `FRAG_ENTITY`, written from the shader source. It is NOT the WebGL2 engine
// and has not been compared against it — no GPU in this sandbox. It
// reproduces the shader's arithmetic; whether its trajectories match the live
// site's to any precision is UNVERIFIED and the page says so. Float64 here
// against the shader's float32 alone guarantees divergence in a chaotic
// system. What the port has to be is a *fair* opponent — the same rule for
// every arm — and that it is, because every arm runs this file.
//
// THE SUBSTRATE TRAP, which fluoddity already documented and we would have
// walked into. From engine.js: "The genome is NOT scale-invariant — (dim,
// count, brush) form a hidden substrate axis". Field energy goes as
// count·brush², so a 256-particle run is not a small version of a
// 55,000-particle run, it is a different system. `matchedBrush` below is the
// same correction fluoddity's own `viewcontrols.js` applies. Without it the
// comparison would have been between two things neither of which was
// fluoddity.

/**
 * Fluoddity's `defaultConfig()`, copied field for field — INCLUDING the field
 * that decides everything, which two earlier versions of this file dropped.
 *
 * `rule_seed` is the brain. It seeds ten Gaussian centres that make up the
 * whole nonlinear map from sensors to force, and `defaultConfig()` sets it to
 * `Math.random()` — so **fluoddity has no default brain**. It has a
 * continuum of them, and its own engine says which ones are worth running:
 *
 *   "The rule_seed (a 10-term Fourier black box) still dominates whether a
 *    given draw is alive, so callers that want a guaranteed-lively organism
 *    should reject-sample on fitness on top."   — engine.js, PARAMS
 *
 * This port hard-coded `evalRule(0.5, …)`. Not a seed fluoddity chose, not a
 * seed anyone looked at — the literal 0.5, picked because a port needs some
 * number. Every swarm run so far drove **one arbitrary brain out of a
 * continuum, selected by nobody**, and the operator's "it still doesn't look
 * right on fluoddity" is what that looks like from outside.
 *
 * `DEFAULT_SEED` below is chosen the way fluoddity says to choose one — see
 * `eval/swarm-brains.mjs`, which scores the 120 organisms published to
 * fluoddity's gallery and reports which are alive at this particle count.
 *
 * (The nine-field correction that preceded this got one thing wrong in the
 * other direction: `mutation_scale: 0.02` is NOT an invention of the port, it
 * is in `defaultConfig()`. Dropping it left this running at 0. Restored.)
 */
export const DEFAULT_CFG = {
  cohorts: 16, rule_seed: 0.5, sensor_gain: 4.0, sensor_angle: -0.14,
  sensor_distance: 1.2, mutation_scale: 0.02, global_force_mult: 0.6,
  drag: 0.9, strafe_power: 0.17, axial_force: 0.04,
  lateral_force: -0.25, hazard_rate: 0.0, trail_persistence: 0.95,
  trail_diffusion: 0.6, initial_conditions: 0, ink: 3.0, hue: 0.0,
};

// ---------------------------------------------------------------- hashing ---
// The shader's PCG, reproduced exactly. It runs on the float's BIT PATTERN,
// so the port needs the same reinterpretation — hence the typed-array view
// rather than anything arithmetic.
const _f32 = new Float32Array(1);
const _u32 = new Uint32Array(_f32.buffer);
const bits = (x) => { _f32[0] = x; return _u32[0]; };

function pcg(v) {
  const s = Math.imul(v, 747796405) + 2891336453 >>> 0;
  const shift = (s >>> 28) + 4;
  const w = Math.imul((s >>> shift) ^ s, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}
/** `h1(vec2)` — the shader's scalar hash. */
export function h1(x, y) {
  return pcg(bits(x) ^ pcg(bits(y))) / 4294967295;
}
const h4 = (x, y) => [h1(x, y), h1(x * -1 + 5, y * -1 + 5), h1(y - 100, x - 100), h1(y * -1 + 25, x * -1 + 25)];

/** One of the ten Gaussian centres that make up the rule's brain. */
function genCenter(seed, i) {
  const fs = 1 + 2 * Math.pow(h1(seed, i * 8 + 0), 2);
  return {
    f: [(h1(seed, i * 8 + 0) * 2 - 1) * fs, (h1(seed, i * 8 + 1) * 2 - 1) * fs,
      (h1(seed, i * 8 + 2) * 2 - 1) * fs, (h1(seed, i * 8 + 3) * 2 - 1) * fs],
    a: [h1(seed, i * 8 + 4) * 2 - 1, h1(seed, i * 8 + 5) * 2 - 1,
      h1(seed, i * 8 + 6) * 2 - 1, h1(seed, i * 8 + 7) * 2 - 1],
  };
}

/**
 * The brain: four sensor scalars in, four rule outputs out.
 *
 * Ten centres, each contributing a sinusoidal basis of the projection of the
 * signal onto its own frequency vector. It is not trying to be sensible — it
 * is an arbitrary point in rule space that happened to look alive. That
 * distinction is the whole experiment: Jev will try to be sensible, and
 * "sensible" and "interesting" are not the same objective.
 */
export function evalRule(seed, mut, cohort, sig) {
  const ms = h1(seed * 1.7 + 3.1, cohort * 2.3 + 0.7) + cohort;
  const res = [0, 0, 0, 0];
  for (let i = 0; i < 10; i++) {
    const c = genCenter(seed, i);
    const hh = h4(-0.5 + (-i + ms), -0.5 + i);
    const a = [c.a[0] + mut * (-1 + 2 * hh[0]), c.a[1] + mut * (-1 + 2 * hh[1]),
      c.a[2] + mut * (-1 + 2 * hh[2]), c.a[3] + mut * (-1 + 2 * hh[3])];
    const fm = 1 + mut * 0.5 * (h1(ms, i) - 0.5);
    const f = [c.f[0] * fm, c.f[1] * fm, c.f[2] * fm, c.f[3] * fm];
    const phase = f[0] * sig[0] + f[1] * sig[1] + f[2] * sig[2] + f[3] * sig[3];
    const off = 2 * i * 0.6283 + a[3] * 3.14159;
    res[0] += a[0] * Math.sin(phase + off);
    res[1] += a[1] * Math.cos(phase + off * 0.7);
    res[2] += a[2] * Math.sin(phase * 2 + off * 1.3);
    res[3] += a[3] * Math.cos(phase * 2 + off * 0.5);
  }
  return res;
}

const snorm = (x, y) => { const L = Math.hypot(x, y); return L === 0 ? [0, 0] : [x / L, y / L]; };
const rot = (x, y, a) => [Math.cos(a) * x + Math.sin(a) * y, Math.cos(a) * y - Math.sin(a) * x];

/**
 * WHAT A PARTICLE KNOWS. Four numbers in its own body frame, plus its speed.
 *
 * This is the entire decision input, and it is the same four numbers the
 * deterministic brain gets — so the arms differ only in who decides, which is
 * the one thing that makes the comparison mean anything.
 */
export function sense(p, field, cfg) {
  const sd = 0.005 * cfg.sensor_distance;
  const [hx, hy] = snorm(p.vx, p.vy);
  const [lox, loy] = rot(hx * sd, hy * sd, cfg.sensor_angle * Math.PI);
  const [rox, roy] = rot(hx * sd, hy * sd, -cfg.sensor_angle * Math.PI);
  const gain = 38.855 * cfg.sensor_gain;
  const L = field.sample(p.x + lox, p.y + loy);
  const R = field.sample(p.x + rox, p.y + roy);
  const fwd = [hx, hy], lft = [hy, -hx];
  const Lx = L[0] * gain, Ly = L[1] * gain, Rx = R[0] * gain, Ry = R[1] * gain;
  return {
    sig: [Lx * fwd[0] + Ly * fwd[1], Lx * lft[0] + Ly * lft[1],
      Rx * fwd[0] + Ry * fwd[1], Rx * lft[0] + Ry * lft[1]],
    fwd, lft, speed: Math.hypot(p.vx, p.vy),
  };
}

const yref = (v) => [v[0], -v[1]];

/**
 * The deterministic decision, as a TURN — the same quantity every arm returns.
 *
 * The shader computes a force and a strafe; this returns the lateral
 * component the brain asks for, normalised, because that is the axis the
 * experiment hands over. Axial thrust stays on the deterministic rule in
 * every arm, so only steering is under test. Changing two things at once and
 * then asking which one mattered is not an experiment.
 */
export function ruleTurn(s, cfg, cohort = 0) {
  const mut = cfg.mutation_scale ?? 0;
  const seed = cfg.rule_seed ?? 0.5;          // the brain — see DEFAULT_CFG
  const base = evalRule(seed, mut, Math.floor(cohort), s.sig);
  const m = evalRule(seed, mut, Math.floor(cohort),
    [...yref([s.sig[2], s.sig[3]]), ...yref([s.sig[0], s.sig[1]])]);
  // `evalRule` returns FOUR numbers and the shader uses all four:
  //   base.xy + yref(mirr.xy) = force   — goes through velocity and drag
  //   base.zw + yref(mirr.zw) = STRAFE  — displaces position DIRECTLY
  // The first port used components 0 and 1 and threw 2 and 3 away, which
  // dropped the strafe term entirely. Strafe is scaled by
  // `global_force_mult/20` against force's `/400` — twenty times larger — and
  // it bypasses drag, so leaving it out is not a detail. It is most of how a
  // fluoddity particle moves, and without it the swarm barely travels.
  const lateral = base[1] + -m[1];
  const axial = base[0] + m[0];
  const strafeAxial = base[2] + m[2];
  const strafeLateral = base[3] + -m[3];
  // `lateral` is RAW — it is `force.y` in the shader, which is multiplied by
  // `lateral_force` and nothing else. The first port returned `tanh(lateral)`
  // and called the result "the turn, in units of the rule's own scale". It was
  // not: `tanh` is only a unit conversion when the argument is already O(1),
  // and on the CORRECT field it is not. Measured on a published organism at
  // 256 particles, the rule's own |lateral| is ~2e-3, so `tanh` returned ~2e-3
  // while the model's ladder spans ±1 — the arms were steering in units that
  // differed by three orders of magnitude, and only the old field's 1000×
  // over-strength hid it by driving the brain into saturation.
  // `turnScale` in swarm.mjs converts, and it is MEASURED from the rule arm
  // before any other arm runs.
  return { turn: lateral, lateral, axial, strafeAxial, strafeLateral };
}

/**
 * Field energy goes as count·brush², so matching it is how a 256-particle run
 * stays the same SYSTEM as a 55,000-particle one rather than a different one
 * wearing its genome.
 */
export const matchedBrush = (baseBrush, baseCount, count) =>
  baseBrush * Math.sqrt(baseCount / Math.max(1, count));

/**
 * COHORTS: the same swarm is SIXTEEN SPECIES, not one.
 *
 * `cohortOf` spreads an index over `cohorts`, and the integer part is fed to
 * `evalRule` as its third argument — so each cohort gets a DIFFERENT brain
 * out of the same rule seed. The first port passed 0 for every particle and
 * therefore ran one species where fluoddity runs sixteen.
 */
export const cohortOf = (idx, count, cohorts) => cohorts * idx / Math.max(1, count);

/**
 * WHERE THE PARTICLES START, and this is the one that changes the regime.
 *
 * `initial_conditions: 0` — the default — lays the cohorts out on a grid and
 * spawns each one as a TIGHT BLOB: the jitter is 0.019 on a torus spanning 2,
 * so a cohort is about 1% of the world across. Thousands of particles begin
 * on top of each other.
 *
 * That density is the whole of fluoddity's interaction. A trail field is
 * stigmergic — a particle can only steer on what other particles have already
 * laid down — so particles that start packed together immediately have a
 * strong local gradient to read, and particles scattered uniformly over the
 * torus have nothing and never will. The first port scattered them uniformly.
 * It was not a weaker version of fluoddity; it was a non-interacting one.
 *
 * Mode 1 is uniform-random, mode 2 is a ring of cohorts at radius 0.6.
 */
export function resetState(idx, count, cfg) {
  const cohorts = cfg.cohorts ?? 16;
  const cv = cohortOf(idx, count, cohorts);
  const jx = 0.019 * (h1(cv, cv) - 0.5);
  const jy = 0.019 * (h1(cv + idx + 2.142, cv + idx + 2.142) - 0.5);
  const vx = 0.00005 * (h1(cv, idx) * 2 - 1);
  const vy = 0.00005 * (h1(cv, jy) * 2 - 1);
  let x, y;
  const mode = cfg.initial_conditions ?? 0;
  if (mode === 1) { x = h1(cv, 1) * 2 - 1; y = h1(cv, 2) * 2 - 1; }
  else if (mode === 2) {
    const ang = (cv / cohorts) * 2 * Math.PI;
    x = jx + Math.cos(ang) * 0.6; y = jy + Math.sin(ang) * 0.6;
  } else {
    const rows = Math.ceil(Math.sqrt(cohorts));
    const gx = Math.floor(cv) % rows, gy = Math.floor(Math.floor(cv) / rows);
    x = jx + 1.8 * (gx / rows + 0.5 * (1 / rows - 1));
    y = jy + 1.8 * (gy / rows + 0.5 * (1 / rows - 1));
  }
  return { i: idx, x, y, vx, vy, cohort: Math.floor(cv) };
}
