/* Molt's score records (com.minomobi.lab.score, in the player's own repo). One
   run posts two, one per board:
     score-v3    points (food is worth depth + 1)           unit "points"
     depth-v3    how many times it molted                   unit "molts"  (only if it did)
   each with detail "seed=… steps=… eaten=… depth=…". The version is the
   rules': change anything that moves these numbers (what food is worth, when
   you molt, the clock) and bump it. v1 was the free-molt game, with a
   longest-snake board; v2 molts you automatically at 8 + depth, which makes
   the longest snake just depth + 7, so that board went. v3 lays out more
   food on deeper levels (2, 2, 3, 3, 3, 4, …) where v2 tied it to the
   world's size, which left levels 2–4 with one.

   The boards trust the record but refuse the impossible: a snake grows only by
   eating (it starts each world START long), molt d happens at MOLT_AT + d (so
   it costs MOLT_AT + d − START food), no food is worth more than the depth it
   was eaten at, plus one, and every step spends at least TICK_MIN of a clock
   that only food refills. No imports, so the selftest reads this in node; the
   constants are checked against game.js there. */
export const VERSION = "v3";
export const START = 3, MOLT_AT = 8, TICK_MIN = 70, CLOCK = 60000, BONUS = 10000;
export const BOARDS = { score: "score-" + VERSION, depth: "depth-" + VERSION };
const UNIT = { score: "points", depth: "molts" };
/* the food it takes to molt d times: (MOLT_AT − START) + (MOLT_AT + 1 − START) + … */
export const foodFor = (d) => d * (MOLT_AT - START) + (d * (d - 1)) / 2;

export function detail(r) { return `seed=${r.seed} steps=${r.steps} eaten=${r.eaten} depth=${r.depth}`; }
const field = (d, k) => { const m = new RegExp("(?:^| )" + k + "=(\\d{1,8})(?: |$)").exec(d || ""); return m ? +m[1] : -1; };

/* one run's records */
export function records(r) {
  const d = detail(r), out = [];
  if (r.value > 0) out.push({ game: BOARDS.score, value: r.value, unit: UNIT.score, higherIsBetter: true, detail: d });
  if (r.depth > 0) out.push({ game: BOARDS.depth, value: r.depth, unit: UNIT.depth, higherIsBetter: true, detail: d });
  return out;
}

export function accept(v) {
  if (!v || v.site !== "molt" || v.higherIsBetter !== true || !Number.isInteger(v.value) || v.value <= 0 || v.value > 1e7) return false;
  if (typeof v.createdAt !== "string" || isNaN(Date.parse(v.createdAt))) return false;
  const kind = Object.keys(BOARDS).find((k) => BOARDS[k] === v.game);
  if (!kind || v.unit !== UNIT[kind]) return false;
  const steps = field(v.detail, "steps"), eaten = field(v.detail, "eaten"), depth = field(v.detail, "depth");
  if (steps <= 0 || eaten < 0 || depth < 0 || eaten > steps) return false;
  // what the run itself claims must be possible: the molts paid for in food, the steps in clock
  if (foodFor(depth) > eaten || steps * TICK_MIN > CLOCK + BONUS * eaten) return false;
  if (kind === "score") return v.value <= eaten * (depth + 1);
  return v.value === depth;
}
export const label = { score: "score", depth: "deepest" };
