/* Shared test harness for The Ratchet.
 *
 * The bots matter differently here than in the other two games. The solver
 * already knows the optimum exactly, so what the policies measure is not "how
 * good is good play" but **how far ahead of the death the mistake was** — the
 * gap between the move that killed a run and the stage where it stopped.
 * That gap is this game's entire reason to exist.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function loadRatchet() {
  await import(path.join(here, "../js/prng.js"));
  await import(path.join(here, "../js/rules.js"));
  await import(path.join(here, "../js/solve.js"));
  await import(path.join(here, "../js/generate.js"));
  return globalThis.RATCHET;
}

export const POLICIES = {
  /* Spends a tool the moment one fits. The instinct the game is built to
     punish: locally free, globally fatal. */
  eager(R, s) {
    const acts = R.legalActions(s);
    return acts.find((a) => a.type === "use") || { type: "pay" };
  },

  /* Never spends anything until forced. The opposite instinct, and just as
     wrong — it arrives at the hard stages rich in tools and out of supply. */
  hoarder(R, s) {
    const st = R.stageAt(s);
    if (s.supply >= st.toll) return { type: "pay" };
    const acts = R.legalActions(s);
    return acts.find((a) => a.type === "use") || { type: "pay" };
  },

  /* Spends only where the toll is expensive; absorbs the cheap stages. A real
     heuristic, and the one a thoughtful player reaches for first. */
  thrifty(R, s) {
    const st = R.stageAt(s);
    const acts = R.legalActions(s);
    const use = acts.find((a) => a.type === "use");
    if (use && st.toll >= 2) return use;
    if (s.supply >= st.toll) return { type: "pay" };
    return use || { type: "pay" };
  },

  /* Takes any move that keeps the route completable. Perfect play. */
  optimal(R, s, memo) {
    const a = R.analyseChoice(s, memo);
    const good = a.options.filter((o) => o.viable);
    if (!good.length) return { type: "pay" };
    // Prefer solving, then walking, then scrapping — among moves that all keep
    // the run alive, so the preference is cosmetic and cannot change survival.
    const rank = { use: 0, pay: 1, scrap: 2 };
    good.sort((x, y) => rank[x.action.type] - rank[y.action.type]);
    return good[0].action;
  },
};

/* Play one route to its end. Returns the outcome plus, if it went wrong, the
   post-mortem: where the run actually died. */
export function playRoute(R, state, policy, memo) {
  let s = R.cloneState(state);
  const initial = R.cloneState(state);
  let guard = 0;
  while (s.phase === "travel" && guard++ < 400) {
    const a = POLICIES[policy](R, s, memo);
    if (!R.applyAction(s, a)) break;
  }
  const pm = s.phase === "lost" ? R.postMortem(initial, s.history, memo) : null;
  return {
    phase: s.phase,
    diedAt: s.phase === "lost" ? s.at : null,
    fatalAt: pm ? pm.stage : null,
    // How many stages you kept walking after the run was already unwinnable.
    foresight: pm ? s.at - pm.stage : null,
    supply: s.supply,
    stages: s.stages.length,
    history: s.history,
    state: s,
  };
}

/* Play routes back to back until one is failed. */
export function playRun(R, seed, policy, maxRoute = 12) {
  let s = R.newGame(seed);
  let routes = 0;
  const foresights = [];
  let guard = 0;
  while (guard++ < 40 && s.route <= maxRoute) {
    const memo = R.newMemo();
    const out = playRoute(R, s, policy, memo);
    if (out.phase !== "won") {
      if (out.foresight !== null) foresights.push(out.foresight);
      return { routes, seed: String(seed), foresights, lastRoute: s.route };
    }
    routes++;
    s = R.nextRoute(out.state);
  }
  return { routes, seed: String(seed), foresights, lastRoute: s.route, capped: true };
}

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
