/* Shared test harness for Hold the Line.
 *
 * Loads the engine (plain IIFEs that attach to globalThis.HORDE — importing
 * them for side effects is enough) and provides bot policies that can play a
 * complete run headlessly.
 *
 * The bots exist because the balance question in this game is not "how much
 * damage does a walker take" but "can a competent player rotate fast enough".
 * Only something that actually plays can answer that, and it has to play the
 * same runs a phone would — which the seeded sim guarantees.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function loadHorde() {
  await import(path.join(here, "../js/prng.js"));
  await import(path.join(here, "../js/config.js"));
  await import(path.join(here, "../js/sim.js"));
  return globalThis.HORDE;
}

/* ------------------------------------------------------------------ bots ----

   Three policies, because a single one tells you almost nothing. If `panic`
   (the worst reasonable play) and `rotate` (decent play) die on the same wave,
   the wave is not testing skill — it is a wall. The gap between them is the
   game's actual skill headroom, and that gap is what I tune. */

const POLICIES = {
  // Always stares at the single scariest arc. No heat awareness at all — this
  // is a new player, and it should be survivable for a while but not far.
  panic(H, run) {
    let best = 0, bestScore = -1;
    for (let i = 0; i < H.CONFIG.ARCS; i++) {
      const s = H.arcThreat(run, i);
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return best;
  },

  // Reads heat as well as threat, and abandons an arc before it jams. This is
  // the play the mechanic is trying to teach.
  rotate(H, run) {
    let best = run.focus, bestScore = -Infinity;
    for (let i = 0; i < H.CONFIG.ARCS; i++) {
      const arc = run.arcs[i];
      const threat = H.arcThreat(run, i);
      if (threat <= 0) continue;
      // Discount an arc for being hot, and write off a jammed one entirely.
      let score = threat * (1 - 0.65 * arc.heat);
      if (arc.jam > 0) score *= 0.05;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  },

  // Sweeps the ring on a fixed cadence regardless of what is happening. A
  // control: if this beats `rotate`, my threat metric is wrong.
  sweep(H, run) {
    return Math.floor(run.t / 1.5) % H.CONFIG.ARCS;
  },
};

/* Card policies. `greedy` takes the highest-weight card; `survival` buys wall
   when the wall is the thing about to end the run. */
const CARD_POLICIES = {
  greedy(H, run) {
    const o = run.gate.offers;
    let best = 0;
    for (let i = 1; i < o.length; i++) if (o[i].weight > o[best].weight) best = i;
    return best;
  },
  survival(H, run) {
    const o = run.gate.offers;
    if (run.wall.hp <= Math.max(3, run.wall.max * 0.4)) {
      const heal = o.findIndex((u) => u.id === "patch" || u.id === "wall" || u.id === "medic");
      if (heal !== -1) return heal;
    }
    return CARD_POLICIES.greedy(H, run);
  },
  worst(H, run) { return H.weakestOffer(run.gate); },
};

/* Play one run to death (or to `maxWaves`, so a broken build can't hang CI).
   Returns the finished run plus a per-wave trace. */
export function playRun(H, seed, opts = {}) {
  const policy = POLICIES[opts.policy || "rotate"];
  const cards = CARD_POLICIES[opts.cards || "survival"];
  const maxWaves = opts.maxWaves || 40;
  const dt = H.CONFIG.dt;

  const run = H.newRun(seed, { quiet: true });
  const trace = [];
  let lastWave = 0;
  let guard = 0;
  const guardMax = Math.ceil((60 * 60) / dt); // one hour of sim time, hard stop

  while (run.phase !== "dead" && run.wave <= maxWaves && guard++ < guardMax) {
    if (run.phase === "gate") {
      // A real player takes about a second and a half to read three cards.
      // Burning that time matters: it is time the heat spends cooling.
      const think = opts.instantCards ? 0 : Math.min(1.5, H.CONFIG.gateTime - dt);
      for (let e = 0; e < Math.floor(think / dt); e++) H.step(run, dt);
      if (run.phase === "gate") H.pickGate(run, cards(H, run));
      continue;
    }

    if (run.wave !== lastWave) {
      lastWave = run.wave;
      trace.push({ wave: run.wave, wallAtStart: run.wall.hp, dps: run.mods.dps });
    }

    if (run.phase === "wave") {
      H.setFocus(run, policy(H, run));
      // Throw when the focused arc is genuinely crowded — that is what the
      // grenade is for, and a bot that hoards it under-reports its value.
      if (H.grenadeReady(run)) {
        const here = run.zombies.filter((z) => z.arc === run.focus);
        const crowded = here.length >= 3;
        const brute = here.some((z) => z.type === "brute" && z.r < 0.55);
        if (crowded || brute) H.throwGrenade(run);
      }
    }
    H.step(run, dt);
  }

  return {
    run,
    trace,
    seed: String(seed),
    reachedCap: run.wave > maxWaves,
    // Wave you *died on*; cleared is the last one you finished.
    diedOn: run.phase === "dead" ? run.wave : null,
    cleared: run.stats.wavesCleared,
    seconds: run.t,
    kills: run.stats.kills,
    leaks: run.stats.leaks,
    taken: run.taken.slice(),
  };
}

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export { POLICIES, CARD_POLICIES };
