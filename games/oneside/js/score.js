/* One Side's score records (com.minomobi.lab.score, in the player's own
   repo): { site: "oneside", game: GAME, value: points, unit: "points",
   higherIsBetter: true, detail: "seed=… level=…", createdAt }. GAME carries
   a version: change the rules in a way that moves scores and bump it, so
   old scores stop being compared with new ones. No imports: the selftest
   reads this in node. */
export const GAME = "score-v1";
export function accept(v) {
  return !!v && v.site === "oneside" && v.game === GAME && v.unit === "points" && v.higherIsBetter === true &&
    Number.isInteger(v.value) && v.value > 0 && v.value <= 1e7 && typeof v.createdAt === "string" && !isNaN(Date.parse(v.createdAt));
}
