// brains.mjs — the genomes this page can run, and where they came from.
//
// `defaultConfig()` sets `rule_seed: Math.random()`. THERE IS NO DEFAULT
// BRAIN — fluoddity has a continuum of them, and `engine.js` says outright
// that the seed "dominates whether a given draw is alive" and that a caller
// wanting a lively one should reject-sample on fitness. This port ran
// `evalRule(0.5, …)`: the literal 0.5, picked by nobody and never looked at.
// On the corrected field it reads `dead`, fill 0.000, where wurms01 on the
// identical substrate reads `alive` at fill 0.55.
//
// So the genomes below are not ours. They are records people published to
// `com.minomobi.fluoddity.organism`, pulled from ATProto into
// `lab/fluoddity-gallery.json` and scored by `eval/swarm-brains.mjs` on
// fluoddity's own `fitness2`. Each one here is a human's pick that also
// survives being run at 256 particles.
//
// Look at what `wurms01` actually is. It is `defaultConfig()` with TWO fields
// changed — `cohorts` and `rule_seed`. Every other knob is the default. The
// difference between a black canvas and the thing on fluoddity's front page is
// the brain and the number of species, and nothing else.

export const BRAINS = [
  {
    id: 'wurms01',
    name: 'wurms01',
    note: 'defaultConfig() with two fields changed: 64 cohorts and this seed',
    rkey: '3mmtu3afsth2i',
    cfg: {
      cohorts: 64, rule_seed: 0.9712491059092194,
      sensor_gain: 4, sensor_angle: -0.14, sensor_distance: 1.2,
      mutation_scale: 0.02, global_force_mult: 0.6, drag: 0.9,
      strafe_power: 0.17, axial_force: 0.04, lateral_force: -0.25,
      hazard_rate: 0, trail_persistence: 0.95, trail_diffusion: 0.6,
      initial_conditions: 0, ink: 3, hue: 0,
    },
  },
  {
    id: 'seed05',
    name: 'the old seed 0.5',
    note: 'what this page ran for three revisions — last of 121, dead',
    rkey: null,
    cfg: {
      cohorts: 16, rule_seed: 0.5,
      sensor_gain: 4, sensor_angle: -0.14, sensor_distance: 1.2,
      mutation_scale: 0.02, global_force_mult: 0.6, drag: 0.9,
      strafe_power: 0.17, axial_force: 0.04, lateral_force: -0.25,
      hazard_rate: 0, trail_persistence: 0.95, trail_diffusion: 0.6,
      initial_conditions: 0, ink: 3, hue: 0,
    },
  },
];

export const brainById = (id) => BRAINS.find((b) => b.id === id) || BRAINS[0];
export const DEFAULT_BRAIN = BRAINS[0];
