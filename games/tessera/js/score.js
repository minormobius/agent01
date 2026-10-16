/* Tessera's score records (com.minomobi.lab.score, in the player's own repo):
     { site: "tessera", game, value: points, unit: "points", higherIsBetter: true,
       detail: "seed=… steps=… longest=… cuts=…", createdAt }
   Two boards:
     daily-v1-YYYY-MM-DD   one seed for everyone, a new one each UTC day
     open-v1               any seed
   The "v1" is the rules' version: change the game in a way that moves scores
   (the clock, the tick, what food is worth) and bump it, so old scores stop
   being compared with new ones.

   The board trusts the record (anyone can write anything to their own repo),
   but it does refuse the impossible: food is worth at most FOOD_PTS a step, so
   a score above FOOD_PTS × steps can't have been played. No imports, so the
   selftest reads this in node; FOOD_PTS is checked against snake.js there. */
export const VERSION = "v1";
export const OPEN = "open-" + VERSION;
export const FOOD_PTS = 5;
export const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const dailyId = (d = day()) => "daily-" + VERSION + "-" + d;
const GAME = new RegExp("^(open-" + VERSION + "|daily-" + VERSION + "-\\d{4}-\\d{2}-\\d{2})$");

/* the daily board's seed: the same 31-bit number for everyone on that date */
export function dailySeed(d = day()) {
  let h = 2166136261;
  for (const c of "tessera/" + VERSION + "/" + d) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 2147483646) + 1;
}

export function detail(r) { return `seed=${r.seed} steps=${r.steps} longest=${r.longest} cuts=${r.cuts}`; }
function steps(d) { const m = /(?:^| )steps=(\d{1,7})(?: |$)/.exec(d || ""); return m ? +m[1] : 0; }

export function accept(v) {
  if (!v || v.site !== "tessera" || !GAME.test(v.game || "") || v.unit !== "points" || v.higherIsBetter !== true) return false;
  if (!Number.isInteger(v.value) || v.value <= 0 || v.value > 1e7) return false;
  if (typeof v.createdAt !== "string" || isNaN(Date.parse(v.createdAt))) return false;
  const n = steps(v.detail);
  return n > 0 && v.value <= FOOD_PTS * n;
}

/* the board's label for a game id */
export function label(game) {
  if (game === OPEN) return "open play";
  const m = /(\d{4})-(\d{2})-(\d{2})$/.exec(game);
  if (!m) return game;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return "daily · " + (+m[3]) + " " + months[+m[2] - 1];
}
