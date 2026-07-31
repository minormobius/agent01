/* Shared test harness for Outbound.
 *
 * Same job as The Ratchet's harness — the solver already knows the optimum, so
 * the bots do not measure "how good is good play", they measure **how far ahead
 * of the wreck the mistake was**. What is new here is that a policy can fail two
 * different ways: run out of fuel, or run out of people. A spread that only
 * measures one of those would let half the game go unmeasured, so every policy
 * below is deliberately biased toward one of the two resources.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function loadOutbound() {
  await import(path.join(here, "../js/prng.js"));
  await import(path.join(here, "../js/config.js"));
  await import(path.join(here, "../js/rules.js"));
  await import(path.join(here, "../js/solve.js"));
  await import(path.join(here, "../js/generate.js"));
  return globalThis.OUTBOUND;
}

/* Least-worn qualified hand, or null. Ties broken by id so bots are
   deterministic across runs. */
function freshest(O, s) {
  const acts = O.legalActions(s).filter((a) => a.type === "send");
  if (!acts.length) return null;
  const rank = acts.map((a) => ({ a, c: O.crewById(s, a.crew) }));
  rank.sort((x, y) => x.c.strain - y.c.strain || x.c.id - y.c.id);
  return rank[0].a;
}

export const POLICIES = {
  /* Sends whoever fits, always. Burns nothing, rests never. Works beautifully
     for two systems and then starts burying people. */
  eager(O, s) {
    return freshest(O, s) || { type: "burn" };
  },

  /* Never spends a person while there is fuel in the tanks. The mirror error —
     arrives at the far end with a rested crew and an empty tank. */
  miser(O, s) {
    if (s.fuel >= O.tollAt(s)) return { type: "burn" };
    return freshest(O, s) || { type: "burn" };
  },

  /* Never spends a life it can buy: sends the freshest hand who will survive
     the trip, and pays the toll rather than send someone at the edge.

     This is the heuristic a thoughtful player actually converges on, and
     writing it wrong is instructive. The first version burned the cheap trouble
     and sent people at the expensive trouble, which sounds sensible and finished
     BELOW `eager` — burning is priced so that doing it by preference empties the
     tanks inside one leg. Fuel here is for emergencies, not for economising. */
  thrifty(O, s) {
    const toll = O.tollAt(s);
    const send = freshest(O, s);
    const fresh = send && O.crewById(s, send.crew).strain === 0;
    if (fresh) return send;
    // Nobody fresh is qualified. Buy the crossing while the tanks are healthy;
    // once they are not, someone has to go out. Refusing outright to spend a
    // worn hand collapses this into `miser` and it dies in the first leg.
    if (s.fuel >= toll && s.fuel > s.maxFuel / 2) return { type: "burn" };
    return send || { type: "burn" };
  },

  /* Thrifty, plus it will pay for a layover rather than burn a hand out. Tests
     whether `rest` is a real move or decoration — if this ties `thrifty`, the
     whole strain economy is cosmetic. */
  careful(O, s) {
    const send = freshest(O, s);
    const toll = O.tollAt(s);
    // Rest only when everyone qualified for THIS system is at the edge, and the
    // tanks can carry both the layover and the toll that follows it. A layover
    // relieves one person, so it picks the person it is about to spend.
    const spent = send && O.crewById(s, send.crew).strain >= O.MAX_STRAIN - 1;
    const rest = O.legalActions(s).find((a) => a.type === "rest" && send && a.crew === send.crew);
    if (rest && spent && s.fuel >= O.REST_COST + toll) return rest;
    return POLICIES.thrifty(O, s);
  },

  /* Any move that leaves the haul finishable. Perfect play. */
  optimal(O, s, memo) {
    const a = O.analyseChoice(s, memo);
    const good = a.options.filter((o) => o.viable);
    if (!good.length) return { type: "burn" };
    /* Among moves that all keep the haul alive the preference cannot change
       survival — but it does change what the run COSTS, and reporting that
       honestly matters. Preferring `send` blindly made perfect play bury 23
       people over twelve legs, which reads as a damning number and is really
       just a tie-break. So: spend a hand who will survive it, then fuel, then a
       layover, and only kill someone when nothing else keeps the haul alive. */
    const cost = (o) => {
      if (o.action.type !== "send") return o.action.type === "burn" ? 1 : 2;
      const c = O.crewById(s, o.action.crew);
      return c.strain + 1 >= O.MAX_STRAIN ? 3 : 0;
    };
    good.sort((x, y) => cost(x) - cost(y));
    return good[0].action;
  },
};

/* Fly one leg to its end. Returns the outcome plus, if it went wrong, the
   post-mortem: where the haul actually died. */
export function playLeg(O, state, policy, memo) {
  let s = O.cloneState(state);
  const initial = O.cloneState(state);
  let guard = 0;
  while (s.phase === "travel" && guard++ < 600) {
    const a = POLICIES[policy](O, s, memo);
    if (!O.applyAction(s, a)) break;
  }
  const pm = s.phase === "lost" ? O.postMortem(initial, s.history, memo) : null;
  const lost = s.crew.filter((c) => !c.alive).length;
  return {
    phase: s.phase,
    diedAt: s.phase === "lost" ? s.at : null,
    fatalAt: pm ? pm.stage : null,
    // How many systems you kept flying after the haul was already unwinnable.
    foresight: pm ? s.at - pm.stage : null,
    fuel: s.fuel,
    buried: lost,
    crew: O.alive(s).length,
    stages: s.stages.length,
    history: s.history,
    state: s,
  };
}

/* Legs back to back until one is failed — one haul, start to wreck. */
export function playHaul(O, seed, policy, maxLeg = 12) {
  let s = O.newGame(seed);
  let legs = 0;
  const foresights = [];
  let buried = 0;
  let guard = 0;
  while (guard++ < 40 && s.leg <= maxLeg) {
    const memo = O.newMemo();
    const out = playLeg(O, s, policy, memo);
    buried += out.buried;
    if (out.phase !== "arrived") {
      if (out.foresight !== null) foresights.push(out.foresight);
      return { legs, seed: String(seed), foresights, buried, lastLeg: s.leg };
    }
    legs++;
    s = O.nextLeg(out.state);
  }
  return { legs, seed: String(seed), foresights, buried, lastLeg: s.leg, capped: true };
}

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
