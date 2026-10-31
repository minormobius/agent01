/* Fathom's score records (com.minomobi.lab.score, in the player's own repo):
   pure clears only (no guesses, no hints), the fastest time per board.
     { site: "fathom", game: "<goal>-<cells>-<mines>", value: ms, unit: "ms",
       higherIsBetter: false, detail: "seed=… first=… guesses=0", createdAt }
   As in Orb, a board's cell and mine counts are its id: retune a size and
   its old times stop being compared. No imports: the selftest reads this. */
export function gameId(goal, cells, mines) { return goal + "-" + cells + "-" + mines; }
export function accept(v) {
  return !!v && v.site === "fathom" && /^(dive|clear)-\d{2,5}-\d{1,5}$/.test(v.game) && v.unit === "ms" && v.higherIsBetter === false &&
    Number.isInteger(v.value) && v.value >= 1000 && v.value <= 86400e3 && typeof v.createdAt === "string" && !isNaN(Date.parse(v.createdAt));
}
