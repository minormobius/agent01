/* phylofiction — the simulation core (SPEC §4).
 *
 * A forward birth–death process where speciation/extinction rates are functions
 * of each lineage's traits and the current environment, NOT constants. The tree
 * topology is the by-product; the scars emerge. The keystone is environmental
 * feedback (SPEC §4.5): living lineages change the world (oxygenic phototrophs
 * pump an oxidant), and the changed world selects against the anaerobes that
 * used to dominate. Nobody scripts the mass extinction — it falls out.
 *
 * Budding cladogenesis: a lineage persists through time and *buds* daughter
 * lineages at speciation events, so the result is a clean rectangular tree
 * whose internal nodes are budding points. Each lineage carries an `abundance`
 * (biomass proxy) governed logistically by its fitness and a shared carrying
 * capacity; a lineage whose abundance falls to ~zero is extinct.
 *
 * Everything is a pure function of the seed `n`. Stable iteration order (by
 * integer id) + per-lineage forked RNG for mutation keeps it deterministic.
 */

import { Rand } from "./prng.js";
import { rootGenome, mutate, fitness, dominantCap, CAPS } from "./genome.js";

// ── tunables ────────────────────────────────────────────────────────────────
const EPOCHS      = 72;     // geological steps
const K           = 100;    // carrying capacity (total abundance units)
const LMAX        = 46;     // max simultaneously-living lineages (keeps trees legible)
const START_A     = 6;      // root lineage starting abundance
const EXTINCT_A   = 0.2;    // abundance floor → extinction
const G_POS       = 0.55;   // growth coefficient when a lineage is fit (density-limited)
const G_NEG       = 0.8;    // decline coefficient when a lineage is misfit (density-INDEPENDENT)
const SPEC_BASE   = 0.16;   // base per-lineage speciation propensity
const OXY_RATE    = 0.12;   // oxidant produced per unit oxygenic-phototroph abundance
const OXY_SINK    = 2.0;    // mineral/ocean sink that must fill before oxidant breaks through
const OXY_DECAY   = 0.004;  // slow abiotic oxidant loss
const CONSUME     = 0.06;   // nutrient drawdown per unit total abundance
const NUTR_REGEN  = 0.012;  // nutrient resupply per epoch
const PULSE_FRAC  = 0.2;    // deaths ≥ this fraction of living → logged as a mass-extinction pulse

// ── the engine ───────────────────────────────────────────────────────────────
export function evolveWorld(n, opts = {}) {
  const epochs = opts.epochs || EPOCHS;
  const rng = Rand("phylofiction::" + n);

  // environment state — an anoxic, nutrient-rich, temperate young ocean
  const env = { oxidant: 0, nutrient: 1, light: 0.95, temperature: 0.45 + 0.25 * rng.f() };
  let sinkRemaining = OXY_SINK;

  // lineages: id, parentId, birth, last, genome, abundance, peakA, alive, deathCause
  const lineages = [];
  let nextId = 0;
  const spawn = (parentId, genome, birth, a) => {
    const L = { id: nextId++, parentId, birth, last: birth, genome, abundance: a, peakA: a, alive: true, deathCause: null };
    lineages.push(L);
    return L;
  };
  spawn(null, rootGenome(rng), 0, START_A);

  const env_series = [];   // per-epoch snapshot for the chart
  const events = [];       // the scars ledger (SPEC §7 layer 4)
  const capFirstSeen = {}; // capability → epoch of first appearance (innovation events)
  capFirstSeen.chemo = 0;
  const capOrigins = {};   // capability → count of independent origins (for convergence)

  for (let e = 1; e <= epochs; e++) {
    const living = lineages.filter((L) => L.alive);
    const totalA = living.reduce((s, L) => s + L.abundance, 0);

    // 1 ── growth / shrinkage. Positive fitness grows but is taxed by crowding
    //      (competitive exclusion → background turnover once near capacity);
    //      negative fitness (misfit / oxidant poisoning) declines *regardless*
    //      of crowding — poison kills you whether or not the pond is full. That
    //      asymmetry is what lets the oxygenation register as a sharp dying
    //      rather than a slow fade (the bug in the first cut).
    const crowd = totalA / K;
    let deaths = 0;
    const deadAnaerobes = [];
    for (const L of living) {
      const fit = fitness(L.genome, env);
      const r = fit >= 0 ? G_POS * fit * (1 - crowd) : G_NEG * fit;
      L.abundance *= Math.max(0, 1 + r);
      if (L.abundance < 0) L.abundance = 0;
      L.last = e;
      L.peakA = Math.max(L.peakA, L.abundance);
      if (L.abundance < EXTINCT_A) {
        L.alive = false;
        // cause attribution: dying while oxidant exceeds your tolerance = poisoned
        const poisoned = env.oxidant > L.genome.oxidantTolerance + 0.02;
        L.deathCause = poisoned ? "oxidant" : "competition";
        if (poisoned) deadAnaerobes.push(L);
        deaths++;
      }
    }

    // 2 ── speciation (budding), capped at LMAX live lineages
    const stillLiving = lineages.filter((L) => L.alive);
    const liveCount = stillLiving.length;
    const room = LMAX - liveCount;
    if (room > 0) {
      // deterministic order
      const tNow = stillLiving.reduce((s, L) => s + L.abundance, 0) || 1;
      let budded = 0;
      for (const L of stillLiving) {
        if (budded >= room) break;
        const fit = Math.max(0, fitness(L.genome, env));
        const p = SPEC_BASE * fit * (L.abundance / tNow) * 3;
        if (rng.chance(Math.min(0.9, p))) {
          const mr = rng.fork("mut::" + e + "::" + L.id);
          const { genome, gained } = mutate(L.genome, mr);
          const share = L.abundance * 0.32;
          L.abundance -= share;
          const child = spawn(L.id, genome, e, share);
          budded++;
          // innovation + convergence bookkeeping
          if (gained) {
            capOrigins[gained] = (capOrigins[gained] || 0) + 1;
            if (capFirstSeen[gained] === undefined) {
              capFirstSeen[gained] = e;
              events.push({ epoch: e, kind: "innovation", cap: gained, lineage: child.id,
                gloss: `${CAPS[gained].label} first appears` });
            }
          }
        }
      }
    }

    // 3 ── environmental feedback: life edits the world (SPEC §4.5)
    const oxyAbundance = lineages
      .filter((L) => L.alive && L.genome.caps.has("photoOxy"))
      .reduce((s, L) => s + L.abundance, 0);
    const production = OXY_RATE * (oxyAbundance / K) * 6;
    const absorbed = Math.min(production, sinkRemaining);
    sinkRemaining -= absorbed;
    const netO2 = production - absorbed;
    const oxBefore = env.oxidant;
    env.oxidant = Math.max(0, Math.min(1, env.oxidant + netO2 - OXY_DECAY));
    const liveNow = lineages.filter((L) => L.alive);
    const consumed = CONSUME * (liveNow.reduce((s, L) => s + L.abundance, 0) / K);
    env.nutrient = Math.max(0.05, Math.min(1, env.nutrient - consumed + NUTR_REGEN));

    // 4 ── event detection
    if (deaths >= Math.max(3, Math.ceil(living.length * PULSE_FRAC))) {
      const byOxidant = deadAnaerobes.length >= deaths * 0.5;
      events.push({ epoch: e, kind: "extinction", count: deaths,
        cause: byOxidant ? "oxidant" : "competition",
        gloss: byOxidant
          ? `Mass dying — ${deaths} anaerobic lineages poisoned by the rising oxidant`
          : `Turnover — ${deaths} lineages lost to competition` });
    }
    // the breakthrough: oxidant crosses 0.5 for the first time
    if (oxBefore < 0.5 && env.oxidant >= 0.5 && !events.some((v) => v.kind === "great-oxygenation")) {
      events.push({ epoch: e, kind: "great-oxygenation",
        gloss: "The Great Oxygenation — the oxidant overwhelms its sinks and floods the world" });
    }

    env_series.push({ epoch: e, oxidant: env.oxidant, nutrient: env.nutrient,
      living: liveNow.length, totalA: liveNow.reduce((s, L) => s + L.abundance, 0) });
  }

  // close out: lineages still alive at the end "survive to the present"
  for (const L of lineages) if (L.alive) L.last = epochs;

  // ── assemble the artifact (SPEC §7) ────────────────────────────────────────
  const nodes = lineages.map((L) => ({
    id: L.id,
    parentId: L.parentId,
    birth: L.birth,
    last: L.last,
    extinct: !L.alive,
    deathCause: L.deathCause,
    caps: [...L.genome.caps],
    dominant: dominantCap(L.genome),
    genome: { growthRate: L.genome.growthRate, oxidantTolerance: L.genome.oxidantTolerance,
      thermalOptimum: L.genome.thermalOptimum },
    peakA: Math.round(L.peakA * 100) / 100,
  }));

  // convergence events: a capability with ≥2 independent origins (SPEC §6.1)
  for (const [cap, count] of Object.entries(capOrigins)) {
    if (count >= 2) {
      events.push({ epoch: capFirstSeen[cap], kind: "convergence", cap, count,
        gloss: `${CAPS[cap].label} evolved independently ${count}×` });
    }
  }
  // proper, stable comparator (kept identical in the Rust port for parity):
  // by epoch ascending, then innovations before other kinds at the same epoch.
  const rank = (k) => (k === "innovation" ? 0 : 1);
  events.sort((a, b) => a.epoch - b.epoch || rank(a.kind) - rank(b.kind));

  const survivors = nodes.filter((nd) => !nd.extinct).length;
  const score = scoreWorld(nodes, events, env_series);

  return {
    n,
    seed: "phylofiction::" + n,
    epochs,
    tree: { nodes },
    env: env_series,
    events,
    summary: {
      lineages: nodes.length,
      survivors,
      maxOxidant: Math.round(Math.max(...env_series.map((s) => s.oxidant)) * 100) / 100,
      oxygenated: events.some((v) => v.kind === "great-oxygenation"),
    },
    score,
  };
}

/* Interestingness proxies (SPEC §6.1). Light version for this slice — disparity,
 * convergence, survivorship reversal, innovation, oxygenation. Computed *after*
 * the run; never fed back as an objective (SPEC §2.1). */
export function scoreWorld(nodes, events, env_series) {
  const capSet = new Set();
  nodes.forEach((nd) => nd.caps.forEach((c) => capSet.add(c)));
  const innovations = events.filter((e) => e.kind === "innovation").length;
  const convergences = events.filter((e) => e.kind === "convergence").length;
  const extinctions = events.filter((e) => e.kind === "extinction").length;
  const oxygenated = events.some((e) => e.kind === "great-oxygenation") ? 1 : 0;

  // survivorship reversal: did the metabolic profile of the *survivors* differ
  // from the early dominant? (anaerobic world → aerobic world is the canonical one)
  const early = nodes.filter((nd) => nd.birth <= 6);
  const survivors = nodes.filter((nd) => !nd.extinct);
  const earlyAerobic = frac(early, (nd) => nd.caps.includes("respireOx"));
  const survAerobic = frac(survivors, (nd) => nd.caps.includes("respireOx"));
  const reversal = Math.round(Math.abs(survAerobic - earlyAerobic) * 100) / 100;

  return {
    disparity: capSet.size,           // capabilities realised across the tree
    convergence: convergences,
    reversal,                         // 0..1 shift in dominant metabolism across deep time
    innovation: innovations,
    extinctionPulses: extinctions,
    oxygenated,
  };
}

function frac(arr, pred) { return arr.length ? arr.filter(pred).length / arr.length : 0; }

// Convenience for the "find an interesting seed" filter (a taste of SPEC §6.2).
export function findSeed(predicate, start = 0, limit = 500) {
  for (let n = start; n < start + limit; n++) {
    const w = evolveWorld(n);
    if (predicate(w)) return { n, world: w };
  }
  return null;
}
