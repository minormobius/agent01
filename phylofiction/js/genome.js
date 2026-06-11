/* phylofiction — the metabolic genome (microbial register).
 *
 * Per the design spec (phylofiction/SPEC.md §4.2): a lineage's genome is a
 * *repertoire of metabolic capabilities* (presence/absence — the structural
 * genes) plus continuous efficiency parameters. The fluoddity pattern carries
 * over verbatim: every continuous param is [lo, hi, sigma], mutation is a
 * truncated Gaussian nudge plus rare structural jumps, and the [lo,hi] clamp
 * *is the viability boundary* — a genome cannot wander into a dead corner
 * (no growth, infinite oxidant tolerance) because those corners don't exist.
 *
 * Capabilities are deliberately abstract: "oxygenic phototrophy", not a
 * biochemical pathway. Plausibility here is statistical, not mechanistic
 * (SPEC §10). This is the microbe-first substrate (SPEC §1.2): metabolism is a
 * cleaner trait space than morphology, and one capability — producesOxidant —
 * drives the first unauthored mass extinction (the Great-Oxidation analogue).
 */

// The capability atlas. `color` is used by the renderer; the flags are read by
// fitness() and the environmental feedback loop.
export const CAPS = {
  chemo:       { label: "Chemotrophy",            color: "#8a8f98", light: false },
  photoAnox:   { label: "Anoxygenic phototrophy", color: "#6fae8f", light: true  },
  photoOxy:    { label: "Oxygenic phototrophy",   color: "#57b36a", light: true, producesOxidant: true },
  respireOx:   { label: "Oxidant respiration",    color: "#cf8a3a", needsOxidant: true },
  methanogen:  { label: "Methanogenesis",         color: "#9a7fd0", obligateAnaerobe: true },
  fixN:        { label: "Nitrogen fixation",      color: "#c97f9a" },
  thermophile: { label: "Thermophily",            color: "#cf6a5a" },
};
export const CAP_IDS = Object.keys(CAPS);

// Which capability "defines" a lineage for colouring, most-derived first.
const CAP_PRIORITY = ["respireOx", "photoOxy", "photoAnox", "methanogen", "thermophile", "fixN", "chemo"];

// Continuous params: [lo, hi, sigma]. lo/hi = viable phenotype space.
export const PARAMS = {
  growthRate:       [0.2, 1.3, 0.12],
  oxidantTolerance: [0.0, 1.0, 0.08], // ← the trait the oxygenation event selects on
  thermalOptimum:   [0.0, 1.0, 0.08], // 0 = cold-loving, 1 = hot-loving
};
const PARAM_IDS = Object.keys(PARAMS);

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

// The root organism: a plain chemotroph in an anoxic world.
export function rootGenome(rng) {
  const g = { caps: new Set(["chemo"]) };
  for (const k of PARAM_IDS) {
    const [lo, hi] = PARAMS[k];
    g[k] = lo + (hi - lo) * (0.3 + 0.4 * rng.f()); // start mid-ish, not at an edge
  }
  g.oxidantTolerance = 0.05 + 0.1 * rng.f(); // anaerobes: low tolerance by default
  return g;
}

export function cloneGenome(g) {
  const c = { caps: new Set(g.caps) };
  for (const k of PARAM_IDS) c[k] = g[k];
  return c;
}

/* Mutation along a speciation event (fluoddity mutate(), adapted).
 *   - 70% chance per continuous param of a Gaussian nudge, clamped to [lo,hi].
 *   - rare structural jumps: gain a capability, or lose one (if >1).
 * Returns { genome, gained, lost } so the engine can log innovations. */
export function mutate(g, rng, rate = 1) {
  const c = cloneGenome(g);
  for (const k of PARAM_IDS) {
    if (rng.chance(0.7)) {
      const [lo, hi, sigma] = PARAMS[k];
      c[k] = clamp(c[k] + rng.randn() * rate * sigma, lo, hi);
    }
  }
  let gained = null, lost = null;
  // gain a new capability — weighted so the metabolic order is believable:
  // chemotrophy → anoxygenic phototrophy → oxygenic phototrophy → aerobic
  // respiration. Aerobic respiration is reachable mainly *from* oxygen
  // metabolism, so the lineages that breathe the new oxidant descend from the
  // ones that made it — the survivorship reversal has an ancestor to come from.
  if (rng.chance(0.22)) {
    const candidates = CAP_IDS.filter((id) => !c.caps.has(id));
    if (candidates.length) {
      const id = rng.pickWeighted(candidates, (cid) => {
        if (cid === "respireOx") {
          const w = (c.caps.has("photoOxy") || c.caps.has("photoAnox")) ? 4 : 0.5;
          return w * (1 + 2 * c.oxidantTolerance);
        }
        if (cid === "photoOxy")  return c.caps.has("photoAnox") ? 3 : 1.1; // oxygenic from anoxygenic
        if (cid === "photoAnox") return 1.6;
        return 1;
      });
      c.caps.add(id);
      gained = id;
      // acquiring oxidant respiration comes with real tolerance — aerobes can
      // live in the world they created.
      if (id === "respireOx") c.oxidantTolerance = clamp(c.oxidantTolerance + 0.4, 0.4, 1);
    }
  }
  // lose a capability (never the last one)
  if (rng.chance(0.06) && c.caps.size > 1) {
    const id = rng.pick([...c.caps]);
    c.caps.delete(id);
    lost = id;
  }
  return { genome: c, gained, lost };
}

/* Fitness = a growth multiplier in an environment. Can go negative (misfit →
 * the lineage shrinks → extinction). This is where traits meet the world:
 * energy sources add, oxidant toxicity subtracts, and obligate anaerobes are
 * poisoned by *any* oxidant. The oxygenation extinction falls out of the last
 * two lines — nobody scripts it (SPEC §4.5). */
export function fitness(g, env) {
  let f = g.growthRate;
  if (g.caps.has("chemo"))     f += 0.6 * env.nutrient;
  if (g.caps.has("photoAnox")) f += 0.7 * env.light;
  if (g.caps.has("photoOxy"))  f += 0.9 * env.light;        // efficient primary production
  if (g.caps.has("respireOx")) f += 1.4 * env.oxidant;      // huge payoff — once oxidant exists
  if (g.caps.has("fixN"))      f += 0.3;                    // relieves nutrient limitation
  if (g.caps.has("thermophile")) f += 0.5 * (1 - Math.abs(env.temperature - g.thermalOptimum));

  // oxidant toxicity: anything above your tolerance hurts
  const excess = Math.max(0, env.oxidant - g.oxidantTolerance);
  let poison = 1.7 * excess;
  if (g.caps.has("methanogen")) poison += 2.6 * env.oxidant; // obligate anaerobe, poisoned by any O2
  f -= poison;
  return f;
}

// The defining capability of a lineage (for colour + label).
export function dominantCap(g) {
  for (const id of CAP_PRIORITY) if (g.caps.has(id)) return id;
  return [...g.caps][0] || "chemo";
}

export function capColor(g) { return CAPS[dominantCap(g)].color; }
