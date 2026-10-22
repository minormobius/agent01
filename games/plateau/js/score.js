/* PLATEAU's score records (com.minomobi.lab.score, in the player's own repo):
     { site: "plateau", game, value: metres, unit: "m", higherIsBetter: true,
       detail: "seed=… time=… phase=…", createdAt }
   Two boards: daily-v1-YYYY-MM-DD (one foam for everyone, new each UTC day)
   and open-v1 (any foam). A cell of the foam is 10 m. The "v1" is the rules'
   version: change anything that moves distances (the speeds, the phases,
   the coupling, the sizes of things) and bump it.

   The board trusts the record but refuses the impossible: you never fly
   faster than VMAX cells a second, so a run of `time` seconds covers at
   most VMAX × time cells. No imports, so the selftest reads this in node;
   VMAX is checked against flight.js there. */
export const VERSION = "v1";
export const OPEN = "open-" + VERSION;
export const VMAX = 4.2, METRES = 10;
export const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const dailyId = (d = day()) => "daily-" + VERSION + "-" + d;
const GAME = new RegExp("^(open-" + VERSION + "|daily-" + VERSION + "-\\d{4}-\\d{2}-\\d{2})$");

/* the daily foam's seed: the same number for everyone on that date */
export function dailySeed(d = day()) {
  let h = 2166136261;
  for (const c of "plateau/" + VERSION + "/" + d) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const label = (id) => (id === OPEN ? "any foam" : "today's foam");

export function detail(r) { return `seed=${r.seed >>> 0} time=${Math.round(r.time * 10) / 10} phase=${r.phase}`; }
export function record(r) { return { value: Math.floor(r.cells * METRES), unit: "m", higherIsBetter: true, detail: detail(r) }; }
const num = (d, k) => { const m = new RegExp("(?:^| )" + k + "=([0-9.]{1,12})(?: |$)").exec(d || ""); return m ? +m[1] : -1; };

export function accept(v) {
  if (!v || v.site !== "plateau" || !GAME.test(v.game || "") || v.unit !== "m" || v.higherIsBetter !== true) return false;
  if (!Number.isInteger(v.value) || v.value <= 0 || v.value > 1e7 || typeof v.createdAt !== "string" || isNaN(Date.parse(v.createdAt))) return false;
  const seed = num(v.detail, "seed"), time = num(v.detail, "time");
  if (seed < 0 || !(time > 0) || time > 6 * 3600) return false;
  return v.value <= Math.ceil(VMAX * METRES * (time + 0.1)) + 1;
}
