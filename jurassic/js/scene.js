/* jurassic — laying out a hectare of Middle Jurassic forest.
 *
 * Seeded and deterministic, in the house style: a plot number is a permalink.
 * The same seed puts the same insects under the same trees on any machine, so
 * "listen to plot 12 from the north-east corner" is a thing one person can say
 * to another.
 *
 * Individuals are not clones of their species record. Each gets a small
 * perturbation of carrier frequency and chirp period, because a chorus of
 * identical oscillators sounds like a fault condition rather than an animal —
 * and because real conspecifics do vary, which is what makes a chorus a
 * chorus instead of a single loud insect.
 */

import { SPECIES, FLORA, PLOT_M } from "./fauna.js";

/** mulberry32 — small, fast, and good enough that plots do not visibly repeat. */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a plot. Returns the trees to draw and the voices to sing, the latter in
 * exactly the flat shape the Rust kernel's `add_voice` wants.
 */
export function buildPlot(seed) {
  const r = rng(seed);
  const half = PLOT_M / 2;

  // Scenery first, so the plants are a stable function of the seed whatever we
  // later do to the roster.
  const weightTotal = FLORA.reduce((n, f) => n + f.w, 0);
  const plants = [];
  // Enough to read as forest, few enough to see through. The map's job is the
  // insects; the vegetation is context and must never win an argument with a
  // singer for a pixel.
  const plantCount = 165;
  for (let i = 0; i < plantCount; i++) {
    let pick = r() * weightTotal;
    let kind = FLORA[FLORA.length - 1];
    for (const f of FLORA) {
      pick -= f.w;
      if (pick <= 0) {
        kind = f;
        break;
      }
    }
    plants.push({
      kind: kind.id,
      name: kind.name,
      layer: kind.kind,
      x: (r() * 2 - 1) * half,
      y: (r() * 2 - 1) * half,
      r: kind.r * (0.65 + r() * 0.8),
      tilt: r() * Math.PI,
    });
  }
  // Draw the canopy last so it sits over the ground cover.
  const order = { ground: 0, shrub: 1, tree: 2 };
  plants.sort((a, b) => order[a.layer] - order[b.layer]);

  const voices = [];
  for (const sp of SPECIES) {
    for (let i = 0; i < sp.count; i++) {
      // ±2 % on the carrier: individual variation, small enough that the
      // species is still recognisable by ear.
      const detune = 1 + (r() * 2 - 1) * 0.02;
      const carrier = sp.carrierHz * detune;
      voices.push({
        speciesId: sp.id,
        individual: i,
        x: (r() * 2 - 1) * half,
        y: (r() * 2 - 1) * half,
        carrierHz: carrier,
        // A resonant stridulator drives its mirror at its own frequency, so
        // the strike rate detunes with it.
        toothRate: sp.toothRate * detune,
        q: sp.q,
        teeth: sp.teeth,
        sweep: sp.sweep,
        jitter: sp.jitter,
        syllables: sp.syllables,
        gapS: sp.gapS,
        // ±15 % on the repeat interval, so the chorus drifts in and out of
        // phase with itself the way a real one does.
        periodS: sp.periodS * (1 + (r() * 2 - 1) * 0.15),
        splDb: sp.splDb + (r() * 2 - 1) * 2,
        seed: Math.floor(r() * 0xffffff) + 1,
      });
    }
  }

  return { seed, plants, voices, half };
}

/** The species record behind a voice. */
export function speciesOf(voice) {
  return SPECIES.find((s) => s.id === voice.speciesId);
}
