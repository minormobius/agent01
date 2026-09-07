// Genome sampling and mutation, lifted from fluoddity/engine.js so a genome
// minted here is the same object fluoddity breeds — the PARAMS box, the same
// lo/hi viable region, the same sigmas. Two differences, both deliberate:
//
//   1. Every draw comes from a seeded Rand, never Math.random. A roll must be
//      reproducible from its permalink, and that includes which candidates the
//      sampler considered and rejected.
//   2. `ink` and `hue` are carried but mean something else here. On fluoddity
//      they feed a glow shader; here `hue` picks a pigment off a curated
//      palette and `ink` sets how loaded the brushes start. See paper.js.

export const PARAMS = {
  sensor_gain: [0, 12, 1.2], sensor_angle: [-1, 1, 0.12], sensor_distance: [0.05, 4, 0.4],
  mutation_scale: [0, 0.2, 0.02], global_force_mult: [0, 3, 0.3], drag: [0.5, 0.999, 0.04],
  strafe_power: [0, 1, 0.12], axial_force: [-0.6, 0.6, 0.08], lateral_force: [-1, 1, 0.12],
  trail_persistence: [0.5, 0.999, 0.04], trail_diffusion: [0, 2, 0.2], ink: [0.3, 8, 0.6], hue: [0, 1, 0.1],
};

export const PARAM_KEYS = Object.keys(PARAMS);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

export function defaultGenome() {
  return {
    cohorts: 16, rule_seed: 0.5,
    sensor_gain: 4.0, sensor_angle: -0.14, sensor_distance: 1.2,
    mutation_scale: 0.02, global_force_mult: 0.6, drag: 0.9,
    strafe_power: 0.17, axial_force: 0.04, lateral_force: -0.25,
    trail_persistence: 0.95, trail_diffusion: 0.6,
    initial_conditions: 0, ink: 3.0, hue: 0.0,
  };
}

// Snap a genome to the grid its URL encoding uses: 16 bits per parameter over
// its own [lo,hi] box, 24 bits of rule seed. Every genome is minted through
// this, so encodePair/decodePair is an identity rather than a near-miss — which
// matters because the parameters drive a chaotic feedback loop, and a 7.5e-6
// rounding error on re-import is not a slightly different painting, it is a
// completely different one.
export function quantizeGenome(g) {
  for (const k of PARAM_KEYS) {
    const [lo, hi] = PARAMS[k];
    let v = Math.round(((g[k] - lo) / (hi - lo)) * 65535);
    v = v < 0 ? 0 : v > 65535 ? 65535 : v;
    g[k] = lo + (v / 65535) * (hi - lo);
  }
  g.rule_seed = Math.round(g.rule_seed * 16777215) / 16777215;
  g.cohorts = g.cohorts | 0;
  g.initial_conditions = g.initial_conditions | 0;
  return g;
}

export function randomGenome(rand) {
  const g = defaultGenome();
  for (const k of PARAM_KEYS) { const [lo, hi] = PARAMS[k]; g[k] = rand.range(lo, hi); }
  g.rule_seed = rand.float();
  // Fewer cohorts than fluoddity's 8..32. A cohort is an independent variant of
  // the rule, so a high count reads as a crowd; with two populations already on
  // one sheet, a crowd of crowds turns to soup. 3..11 keeps each population
  // legible as a hand.
  g.cohorts = 3 + rand.int(9);
  g.initial_conditions = rand.int(3);
  return quantizeGenome(g);
}

export function mutate(g, rand, rate = 1) {
  const c = { ...g };
  for (const k of PARAM_KEYS) {
    const [lo, hi, step] = PARAMS[k];
    if (rand.float() < 0.7) {
      const x = c[k] + rand.normal() * rate * step;
      c[k] = (k === 'hue') ? ((x % 1) + 1) % 1 : clamp(x, lo, hi);
    }
  }
  if (rand.float() < 0.12) c.rule_seed = rand.float();
  if (rand.float() < 0.10) c.cohorts = clamp((c.cohorts | 0) + (rand.float() < 0.5 ? -1 : 1) * (1 + rand.int(2)), 1, 24) | 0;
  if (rand.float() < 0.06) c.initial_conditions = rand.int(3);
  return quantizeGenome(c);
}

// Genome distance in the normalised PARAMS box, plus rule_seed. Used only to
// skip a candidate that is a near-twin of one already accepted this session —
// a free pre-probe filter, not a substitute for the phenotype novelty in
// probe.js (two distant genomes can behave identically, and often do).
export function genomeDistance(a, b) {
  let s = 0;
  for (const k of PARAM_KEYS) {
    const [lo, hi] = PARAMS[k];
    const d = (a[k] - b[k]) / (hi - lo);
    s += d * d;
  }
  const dr = a.rule_seed - b.rule_seed;
  s += dr * dr * 4;   // the rule seed dominates behaviour, so weight it up
  return Math.sqrt(s);
}

// ---------------------------------------------------------------- codec ----
// A genome pair, packed small enough to live in a URL.
//
// ?s=<seed> re-runs the sampler, which is short and readable but leans on the
// probe scoring identically everywhere — and the probe uses Math.atan2 / pow /
// asinh, which are implementation-approximated. The scores are quantised so a
// threshold flip is vanishingly unlikely, but "vanishingly unlikely" is not the
// same promise as "the same picture". So the share button emits ?g=, the
// accepted genomes themselves, which needs no such argument: decode, load, paint.
//
// 30 bytes per genome — 13 parameters at 16 bits over their own [lo,hi] box,
// the rule seed at 24 bits, then cohorts and the spawn pattern.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toB64u(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    const k = bytes.length - i;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (k > 1) out += B64[(n >> 6) & 63];
    if (k > 2) out += B64[n & 63];
  }
  return out;
}

function fromB64u(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i += 4) {
    const k = Math.min(4, str.length - i);
    let n = 0;
    for (let j = 0; j < 4; j++) n = (n << 6) | (j < k ? B64.indexOf(str[i + j]) : 0);
    bytes.push((n >> 16) & 255);
    if (k > 2) bytes.push((n >> 8) & 255);
    if (k > 3) bytes.push(n & 255);
  }
  return Uint8Array.from(bytes);
}

function packOne(g, out, o) {
  for (const k of PARAM_KEYS) {
    const [lo, hi] = PARAMS[k];
    let v = Math.round(((g[k] - lo) / (hi - lo)) * 65535);
    v = v < 0 ? 0 : v > 65535 ? 65535 : v;
    out[o++] = v >> 8; out[o++] = v & 255;
  }
  const rs = Math.round(g.rule_seed * 16777215);
  out[o++] = (rs >> 16) & 255; out[o++] = (rs >> 8) & 255; out[o++] = rs & 255;
  out[o++] = ((g.cohorts & 63) << 2) | (g.initial_conditions & 3);
  return o;
}

function unpackOne(buf, o) {
  const g = defaultGenome();
  for (const k of PARAM_KEYS) {
    const [lo, hi] = PARAMS[k];
    g[k] = lo + ((buf[o] << 8) | buf[o + 1]) / 65535 * (hi - lo);
    o += 2;
  }
  g.rule_seed = ((buf[o] << 16) | (buf[o + 1] << 8) | buf[o + 2]) / 16777215;
  o += 3;
  g.cohorts = (buf[o] >> 2) & 63 || 1;
  g.initial_conditions = buf[o] & 3;
  if (g.initial_conditions > 2) g.initial_conditions = 0;
  o += 1;
  return [g, o];
}

export const PAIR_BYTES = (PARAM_KEYS.length * 2 + 4) * 2;

export function encodePair(pops) {
  const buf = new Uint8Array(PAIR_BYTES);
  let o = packOne(pops[0], buf, 0);
  packOne(pops[1], buf, o);
  return toB64u(buf);
}

export function decodePair(str) {
  const buf = fromB64u(str);
  if (buf.length < PAIR_BYTES) return null;
  const [a, o] = unpackOne(buf, 0);
  const [b] = unpackOne(buf, o);
  return [a, b];
}
