/* Tempest's score records (com.minomobi.lab.score, in the player's own repo).

   One board: the score of a run, from the level it started at to the wave
   that broke it (or the end of the pack). A run is everything between two
   resets of the score: it starts at whatever level you began or restarted
   on, keeps its score through the waves you retake, and ends when the web
   wins or the whole pack holds.

   Scoring is deterministic: a cleared wave is worth
   100 + its certified slack + 25 per threat, and every wave in levels.json
   is fixed. So the board doesn't trust the number at all. It recomputes it
   from where the run says it went (detail "epoch=… start=… level=… wave=…":
   the level indices it started at and ended on, and how many waves of the
   last one it cleared), and refuses a record whose value isn't exactly that.

   WAVES is that table, one row per level index. The selftest rebuilds it
   from levels.json and the formula in game.js, so a regenerated pack can't
   leave it behind: if the epoch moves, bump VERSION and the table together.
   No imports, so the selftest reads this in node. */
export const VERSION = "v1";
export const EPOCH = 1;
export const GAME = "score-" + VERSION;
export const WAVES = {
  1: [302, 320, 325],
  2: [342, 298, 271],
  3: [307, 348, 323],
  4: [326, 282, 321],
  5: [368, 346, 365],
  6: [383, 407, 371, 412],
  7: [416, 336, 350, 405],
  8: [347, 405, 357, 416],
  9: [402, 436, 433, 433],
  10: [401, 350, 422, 386, 343],
  11: [387, 387, 369, 398, 427],
  12: [434, 407, 371, 432, 424],
  13: [400, 362, 366, 439, 387],
  14: [404, 424, 380, 429, 384],
};
const LEVELS = Object.keys(WAVES).map(Number).sort((a, b) => a - b);

/* what a run from level `start` to wave `wave` of level `level` is worth; -1 if it can't have happened */
export function worth(start, level, wave) {
  const i = LEVELS.indexOf(start), j = LEVELS.indexOf(level);
  if (i < 0 || j < i || !Number.isInteger(wave) || wave < 0 || wave > WAVES[level].length) return -1;
  let s = 0;
  for (let k = i; k < j; k++) s += WAVES[LEVELS[k]].reduce((a, b) => a + b, 0);
  return s + WAVES[level].slice(0, wave).reduce((a, b) => a + b, 0);
}

export function detail(r) { return `epoch=${EPOCH} start=${r.start} level=${r.level} wave=${r.wave}`; }
const field = (d, k) => { const m = new RegExp("(?:^| )" + k + "=(\\d{1,6})(?: |$)").exec(d || ""); return m ? +m[1] : -1; };

/* one run's record */
export function records(r) {
  return r.value > 0 ? [{ game: GAME, value: r.value, unit: "points", higherIsBetter: true, detail: detail(r) }] : [];
}

export function accept(v) {
  if (!v || v.site !== "tempest" || v.game !== GAME || v.unit !== "points" || v.higherIsBetter !== true) return false;
  if (!Number.isInteger(v.value) || v.value <= 0) return false;
  if (typeof v.createdAt !== "string" || isNaN(Date.parse(v.createdAt))) return false;
  if (field(v.detail, "epoch") !== EPOCH) return false;
  return worth(field(v.detail, "start"), field(v.detail, "level"), field(v.detail, "wave")) === v.value;
}
