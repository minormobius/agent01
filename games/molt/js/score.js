/* Molt's score records (com.minomobi.lab.score, in the player's own repo). One
   run posts three, one per board:
     score-v1    points (food is worth depth + 1)           unit "points"
     length-v1   the longest the snake got, in any world   unit "cells"
     depth-v1    how many times it molted                   unit "molts"  (only if it did)
   each with detail "seed=… steps=… eaten=… longest=… depth=…". The "v1" is the
   rules' version: change anything that moves these numbers (what food is
   worth, how long you must be to molt) and bump it.

   The boards trust the record but refuse the impossible: a snake grows only by
   eating (it starts each world START long), it must be MOLT_MIN long to molt
   (so every molt costs at least MOLT_MIN − START food), and no food is worth
   more than the depth it was eaten at, plus one. No imports, so the selftest
   reads this in node; the constants are checked against game.js there. */
export const VERSION = "v1";
export const START = 3, MOLT_MIN = 8;
export const BOARDS = { score: "score-" + VERSION, length: "length-" + VERSION, depth: "depth-" + VERSION };
const UNIT = { score: "points", length: "cells", depth: "molts" };

export function detail(r) { return `seed=${r.seed} steps=${r.steps} eaten=${r.eaten} longest=${r.longest} depth=${r.depth}`; }
const field = (d, k) => { const m = new RegExp("(?:^| )" + k + "=(\\d{1,8})(?: |$)").exec(d || ""); return m ? +m[1] : -1; };

/* one run's records */
export function records(r) {
  const d = detail(r), out = [];
  if (r.value > 0) out.push({ game: BOARDS.score, value: r.value, unit: UNIT.score, higherIsBetter: true, detail: d });
  if (r.longest > 0) out.push({ game: BOARDS.length, value: r.longest, unit: UNIT.length, higherIsBetter: true, detail: d });
  if (r.depth > 0) out.push({ game: BOARDS.depth, value: r.depth, unit: UNIT.depth, higherIsBetter: true, detail: d });
  return out;
}

export function accept(v) {
  if (!v || v.site !== "molt" || v.higherIsBetter !== true || !Number.isInteger(v.value) || v.value <= 0 || v.value > 1e7) return false;
  if (typeof v.createdAt !== "string" || isNaN(Date.parse(v.createdAt))) return false;
  const kind = Object.keys(BOARDS).find((k) => BOARDS[k] === v.game);
  if (!kind || v.unit !== UNIT[kind]) return false;
  const steps = field(v.detail, "steps"), eaten = field(v.detail, "eaten"), longest = field(v.detail, "longest"), depth = field(v.detail, "depth");
  if (steps <= 0 || eaten < 0 || longest <= 0 || depth < 0 || eaten > steps) return false;
  if (longest > START + eaten || depth * (MOLT_MIN - START) > eaten) return false;   // what the run itself claims must be possible
  if (kind === "score") return v.value <= eaten * (depth + 1);
  if (kind === "length") return v.value === longest;
  return v.value === depth;
}
export const label = { score: "score", length: "longest snake", depth: "deepest" };
