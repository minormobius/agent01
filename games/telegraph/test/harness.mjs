/* Shared test harness for Telegraph.
 *
 * Loads the engine (plain IIFEs attaching to globalThis.TELEGRAPH) and provides
 * bots that play whole runs.
 *
 * The bots matter less here than in Hold the Line, because the solver already
 * knows the optimum exactly. What they measure is different: how deep a
 * *perfect* player gets before the boards outrun even the best available line.
 * That is the real difficulty ceiling of a perfect-information game.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function loadTelegraph() {
  await import(path.join(here, "../js/prng.js"));
  await import(path.join(here, "../js/rules.js"));
  await import(path.join(here, "../js/generate.js"));
  await import(path.join(here, "../js/solve.js"));
  return globalThis.TELEGRAPH;
}

/* Policies.
   - `optimal` adopts the best line the solver found every single turn.
   - `greedy`  only ever shoves whatever is closest, ignoring the forecast — the
     control. If it keeps pace with `optimal`, the boards are not asking
     anything and the game is decorative.
   - `idle`    never acts. The floor: how much damage a board deals unopposed. */
export const POLICIES = {
  optimal(T, s) {
    const a = T.analyseTurn(s);
    return a.bestState || s;
  },

  greedy(T, s) {
    let cur = T.cloneState(s);
    for (const u of cur.units.filter((x) => x.alive)) {
      const targets = T.abilityTargets(cur, T.getUnit(cur, u.id));
      if (targets.length) {
        T.useAbility(cur, u.id, targets[0].x, targets[0].y);
        continue;
      }
      // Nothing in range — step toward the nearest enemy and hope.
      const spots = T.reachable(cur, T.getUnit(cur, u.id));
      let best = spots[0], bestD = Infinity;
      for (const p of spots) {
        for (const e of cur.enemies.filter((x) => x.alive)) {
          const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
          if (d < bestD) { bestD = d; best = p; }
        }
      }
      if (best) T.moveUnit(cur, u.id, best.x, best.y);
    }
    return cur;
  },

  idle(T, s) { return s; },
};

/* Play one run: encounters back to back until integrity runs out or we hit
   `maxLevel` (so a broken build cannot hang CI). */
export function playRun(T, seed, opts = {}) {
  const policy = POLICIES[opts.policy || "optimal"];
  const maxLevel = opts.maxLevel || 15;
  let s = T.newGame(seed);
  const trace = [];
  let guard = 0;

  while (s.phase !== "lost" && s.level <= maxLevel && guard++ < 400) {
    const before = s.integrity;
    let turns = 0;
    while (s.phase === "plan" && turns++ < 40) {
      s = policy(T, s);
      s = T.endTurn(s);
    }
    trace.push({ level: s.level, integrityAfter: s.integrity, lost: before - s.integrity });
    if (s.phase === "lost") break;
    if (s.phase === "won") s = T.nextEncounter(s);
  }

  return {
    seed: String(seed),
    reachedLevel: s.level,
    integrity: s.integrity,
    died: s.phase === "lost",
    trace,
  };
}

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
