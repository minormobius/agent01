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
//
// AND THE DEFAULT IS NOT THE TOP OF THE RANKING, deliberately. `wurms01` sits
// 67th of 121 on `fitness2` at 256 particles; the first-placed organism is
// four big smeared streaks. That is not `fitness2` being wrong, it is
// `fitness2` being read off a substrate it was not tuned on: at 55,000
// particles a fill of 0.31 is hundreds of thin filaments, and at 256 with a
// brush 13x wider the same fill is four fat ones. The score is a good
// aliveness filter and a poor "looks like fluoddity" filter here — so the
// ranking chose the shortlist and a person chose from it, which is what
// fluoddity's own gallery is. Both are in the picker; look at them.

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
    id: 'topfit',
    name: 'the highest-scoring one',
    note: 'first of 121 on fluoddity\'s own fitness2 at this density — and it does not look like fluoddity',
    rkey: '3mn6eqxz57s2i',
    cfg: {
      cohorts: 16, rule_seed: 0.7176702601092934,
      sensor_gain: 5.748574876623875, sensor_angle: 0.02919530063332424,
      sensor_distance: 2.1220172719630317, mutation_scale: 0,
      global_force_mult: 1.0877424827092645, drag: 0.8870157384110665,
      strafe_power: 0.3183687200091831, axial_force: -0.10436695887029632,
      lateral_force: -0.3568329203737653, hazard_rate: 0,
      trail_persistence: 0.96616088908138, trail_diffusion: 0.6917741793687451,
      initial_conditions: 0, ink: 3.3623021196973815, hue: 0.08426413194280369,
    },
  },
  {
    id: 'fivepoints',
    name: 'fivepoints_addstrafe',
    note: 'spawned as a ring (initial_conditions 2) — second of 121',
    rkey: '3mmtzy62hqk2c',
    cfg: {
      cohorts: 64, rule_seed: 0.9910210665516854,
      sensor_gain: 4, sensor_angle: -0.14, sensor_distance: 1.2,
      mutation_scale: 0.02, global_force_mult: 0.6, drag: 0.9,
      strafe_power: 0.232, axial_force: 0.04, lateral_force: -0.25,
      hazard_rate: 0, trail_persistence: 0.95, trail_diffusion: 0.6,
      initial_conditions: 2, ink: 3, hue: 0,
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
