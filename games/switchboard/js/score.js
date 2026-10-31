/* Switchboard's score records (com.minomobi.lab.score, in the player's own
   repo). A run never ends on its own: NEXT SHIFT goes on for as long as you
   do, so a run is posted as it stands when a shift closes, and the board
   keeps each player's best. One post writes up to two records:

     points-v1    the run's total points (what the game calls "best run")
                  unit "points"
     sharp-v1     the run's points as thousandths of the exact optimum of the
                  shifts it played: 1000 is a run with nothing left on the
                  table. Only for runs of SHARP_MIN shifts or more, so one
                  lucky shift can't top it.          unit "per-mille"

   Why two. Points are the arcade number, but they grow with every shift you
   sit through, so on their own they measure stamina. The thing Switchboard
   is about is the gap between what you got and the best possible shift,
   which the solver knows exactly; sharp-v1 ranks that.

   detail is "seed=<seed, URI-encoded> shifts=<n> score=<points> optimum=<the
   exact optimum summed over those n shifts>". The boards trust the record but
   refuse the impossible: score ≤ optimum ≤ what n shifts of the generator can
   even hold (every call worth at most MAX_VALUE, shift k holds at most
   min(JOBS_CAP, JOBS_BASE + k) calls), and the value has to be what the
   detail says. Recomputing the optimum from the seed would make the claim
   exact, but it costs several milliseconds a shift, for every record in the
   corpus, so it isn't done here.

   No imports, so the selftest reads this in node; the constants are checked
   against generate.js there. Change the rules in a way that moves scores and
   bump VERSION. */
export const VERSION = "v1";
export const MAX_VALUE = 6, JOBS_BASE = 7, JOBS_CAP = 14, SHARP_MIN = 3;
export const BOARDS = { points: "points-" + VERSION, sharp: "sharp-" + VERSION };
const UNIT = { points: "points", sharp: "per-mille" };
export const label = { points: "points", sharp: "sharpest" };

/* the most points n shifts can hold, from the generator's plan */
export function ceiling(n) {
  let c = 0;
  for (let k = 1; k <= n; k++) c += Math.min(JOBS_CAP, JOBS_BASE + k) * MAX_VALUE;
  return c;
}
export const sharpness = (score, optimum) => Math.floor((1000 * score) / optimum);

export function detail(r) { return `seed=${encodeURIComponent(r.seed)} shifts=${r.shifts} score=${r.score} optimum=${r.optimum}`; }
const DETAIL = /^seed=([A-Za-z0-9%._~!*'()-]{1,96}) shifts=(\d{1,4}) score=(\d{1,7}) optimum=(\d{1,7})$/;
export function parse(d) {
  const m = DETAIL.exec(d || "");
  return m ? { seed: m[1], shifts: +m[2], score: +m[3], optimum: +m[4] } : null;
}

/* one run's records: r = { seed, shifts, score, optimum } */
export function records(r) {
  const d = detail(r), out = [];
  if (r.score > 0) out.push({ game: BOARDS.points, value: r.score, unit: UNIT.points, higherIsBetter: true, detail: d });
  if (r.score > 0 && r.shifts >= SHARP_MIN && r.optimum > 0)
    out.push({ game: BOARDS.sharp, value: sharpness(r.score, r.optimum), unit: UNIT.sharp, higherIsBetter: true, detail: d });
  return out;
}

export function accept(v) {
  if (!v || v.site !== "switchboard" || v.higherIsBetter !== true || !Number.isInteger(v.value) || v.value <= 0) return false;
  if (typeof v.createdAt !== "string" || isNaN(Date.parse(v.createdAt))) return false;
  const kind = Object.keys(BOARDS).find((k) => BOARDS[k] === v.game);
  if (!kind || v.unit !== UNIT[kind]) return false;
  const d = parse(v.detail);
  if (!d || d.shifts < 1 || d.score < 1 || d.score > d.optimum || d.optimum > ceiling(d.shifts)) return false;
  if (kind === "points") return v.value === d.score;
  return d.shifts >= SHARP_MIN && v.value === sharpness(d.score, d.optimum);
}
export const format = (v, sel) => (sel && sel.metric === "sharp" ? (v / 10).toFixed(1) + "%" : v.toLocaleString("en"));
