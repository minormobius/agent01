/* Ziggurat's score records (com.minomobi.lab.score, in the player's own repo):
   { site: "ziggurat", game: GAME, value: points, unit: "points",
     higherIsBetter: true, detail: "level=… round=… cleared=… hops=… lures=… catches=… seed=…" }.
   GAME carries a version: change anything that moves scores (points, the
   bonus, the pile's size, the colour rules) and bump it.

   The board trusts the record but refuses the impossible. A run ends in the
   round after the last one it cleared, so level and round fix `cleared`
   exactly. Every cleared round took a landing on every cube for every stage
   of its colour rule (less the discs, which land you on the summit), every
   point is a colour change (one a landing), a coil lured off a disc, a
   catch, or a cleared round's bonus, and there are two discs a round. No
   imports, so the selftest reads this in node; the constants are checked
   against zig.js there. */
export const VERSION = "v1";
export const GAME = "score-" + VERSION;
export const ROUNDS = 4, DISCS = 2, BONUS0 = 1000, BONUS_STEP = 250;
export const PTS = { colour: 25, lure: 500, slick: 300, green: 100 };
export const sideFor = (level) => (level <= 2 ? 5 : 6);
export const stagesFor = (level) => (level === 1 || level === 3 ? 1 : 2);
const tet = (n) => (n * (n + 1) * (n + 2)) / 6; // cubes in a pile of side n

export function detail(r) { return `level=${r.level} round=${r.round} cleared=${r.cleared} hops=${r.hops} lures=${r.lures} catches=${r.catches} seed=${r.seed >>> 0}`; }
export function record(r) { return { value: r.value, unit: "points", higherIsBetter: true, detail: detail(r) }; }
const field = (d, k) => { const m = new RegExp("(?:^| )" + k + "=(\\d{1,9})(?: |$)").exec(d || ""); return m ? +m[1] : -1; };

export function accept(v) {
  if (!v || v.site !== "ziggurat" || v.game !== GAME || v.unit !== "points" || v.higherIsBetter !== true) return false;
  if (!Number.isInteger(v.value) || v.value <= 0 || v.value > 1e8 || typeof v.createdAt !== "string" || isNaN(Date.parse(v.createdAt))) return false;
  const level = field(v.detail, "level"), round = field(v.detail, "round"), cleared = field(v.detail, "cleared");
  const hops = field(v.detail, "hops"), lures = field(v.detail, "lures"), catches = field(v.detail, "catches");
  if (field(v.detail, "seed") < 0 || level < 1 || round < 1 || round > ROUNDS || hops < 0 || lures < 0 || catches < 0) return false;
  if ((level - 1) * ROUNDS + (round - 1) !== cleared) return false;
  let landings = 0, bonus = 0;
  for (let ri = 0; ri < cleared; ri++) { const lv = 1 + Math.floor(ri / ROUNDS); landings += tet(sideFor(lv)) * stagesFor(lv); bonus += BONUS0 + BONUS_STEP * ri; }
  const rides = DISCS * (cleared + 1);
  if (hops + rides < landings || lures > rides || catches > hops + 10 * (cleared + 1)) return false;
  return v.value >= bonus && v.value <= bonus + PTS.colour * (hops + rides) + PTS.lure * lures + PTS.slick * catches;
}
