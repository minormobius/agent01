/* Tessera's score records (com.minomobi.lab.score, in the player's own repo):
     { site: "tessera", game, value, unit, higherIsBetter: true,
       detail: "seed=… steps=… longest=… cuts=…", createdAt }
   Two boards, each ranked two ways, so a run posts two records:
     daily-v1-YYYY-MM-DD       points; one seed for everyone, new each UTC day
     open-v1                   points; any seed
     len-daily-v1-…, len-open-v1   the longest the snake got, in cells
   The "v1" is the rules' version: change the game in a way that moves scores
   (the clock, the tick, what food is worth) and bump it, so old scores stop
   being compared with new ones.

   The board trusts the record (anyone can write anything to their own repo),
   but it does refuse the impossible: food is worth at most FOOD_PTS a step, so
   a score above FOOD_PTS × steps can't have been played; a snake starts START
   long and grows at most a cell a step, and can't be longer than the board.
   No imports, so the selftest reads this in node; the constants are checked
   against snake.js and the page there. */
export const VERSION = "v1";
export const OPEN = "open-" + VERSION;
export const FOOD_PTS = 5, START = 4, BOARD = [24, 10], CELLS = BOARD[0] * BOARD[1];
export const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const dailyId = (d = day()) => "daily-" + VERSION + "-" + d;
export const lenId = (game) => "len-" + game;
const GAME = new RegExp("^(len-)?(open-" + VERSION + "|daily-" + VERSION + "-\\d{4}-\\d{2}-\\d{2})$");

/* the daily board's seed: the same 31-bit number for everyone on that date */
export function dailySeed(d = day()) {
  let h = 2166136261;
  for (const c of "tessera/" + VERSION + "/" + d) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 2147483646) + 1;
}

export function detail(r) { return `seed=${r.seed} steps=${r.steps} longest=${r.longest} cuts=${r.cuts}`; }
const field = (d, k) => { const m = new RegExp("(?:^| )" + k + "=(\\d{1,7})(?: |$)").exec(d || ""); return m ? +m[1] : 0; };

/* one run's two records: its score, and its longest snake */
export function records(r, board) {
  const d = detail(r);
  return [
    { game: board, value: r.value, unit: "points", higherIsBetter: true, detail: d },
    { game: lenId(board), value: r.longest, unit: "cells", higherIsBetter: true, detail: d },
  ];
}

export function accept(v) {
  if (!v || v.site !== "tessera" || !GAME.test(v.game || "") || v.higherIsBetter !== true) return false;
  if (!Number.isInteger(v.value) || v.value <= 0 || v.value > 1e7) return false;
  if (typeof v.createdAt !== "string" || isNaN(Date.parse(v.createdAt))) return false;
  const n = field(v.detail, "steps");
  if (n <= 0) return false;
  if (v.game.startsWith("len-")) return v.unit === "cells" && v.value <= Math.min(CELLS, START + n) && field(v.detail, "longest") === v.value;
  return v.unit === "points" && v.value <= FOOD_PTS * n;
}

/* the board's label for a game id */
export function label(game) {
  if (game === OPEN) return "open play";
  const m = /(\d{4})-(\d{2})-(\d{2})$/.exec(game);
  if (!m) return game;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return "daily · " + (+m[3]) + " " + months[+m[2] - 1];
}
