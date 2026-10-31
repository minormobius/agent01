/* Telegraph's score records (com.minomobi.lab.score, in the player's own repo).
   One board, the number the game already keeps as your best:
     sectors-v1   sectors held before the grid went     unit "sectors"
   with detail "seed=… turns=… flawless=… clean=… missed=… forced=…". The
   version is the rules': change how long a sector lasts (levelPlan's turns) or
   how a run ends, and bump it.

   The board trusts the record but refuses the impossible. A sector is held only
   by surviving every one of its turns, and a run always ends inside the sector
   after the last one held, so the turns played pin the sectors held exactly:
   more than the turns of the first `held` sectors, no more than the first
   `held + 1`. Every turn gets exactly one grade, so the four counts add up to
   the turns. No imports, so the selftest reads this in node; SECTOR_TURNS is
   checked against generate.js's levelPlan there. */
export const VERSION = "v1";
export const GAME = "sectors-" + VERSION, UNIT = "sectors", SITE = "telegraph";
export const MAX_SECTORS = 1000;
/* how many turns sector `level` lasts (generate.js levelPlan(level).turns) */
export const sectorTurns = (level) => Math.min(7, 4 + Math.floor((level - 1) / 3));
/* the turns it takes to hold the first n sectors */
export function turnsToHold(n) { let t = 0; for (let l = 1; l <= n; l++) t += sectorTurns(l); return t; }

const safeSeed = (s) => String(s).replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 64);
export function detail(r) {
  return `seed=${safeSeed(r.seed)} turns=${r.turns} flawless=${r.flawless} clean=${r.clean} missed=${r.missed} forced=${r.forced}`;
}
const field = (d, k) => { const m = new RegExp("(?:^| )" + k + "=(\\d{1,8})(?: |$)").exec(d || ""); return m ? +m[1] : -1; };

/* one finished run → its record */
export function record(r) {
  return { value: r.value, unit: UNIT, higherIsBetter: true, detail: detail(r) };
}

export function accept(v) {
  if (!v || v.site !== SITE || v.game !== GAME || v.unit !== UNIT || v.higherIsBetter !== true) return false;
  if (!Number.isInteger(v.value) || v.value <= 0 || v.value > MAX_SECTORS) return false;
  if (typeof v.createdAt !== "string" || isNaN(Date.parse(v.createdAt))) return false;
  if (!/(?:^| )seed=[A-Za-z0-9_.-]{1,64}(?: |$)/.test(v.detail || "")) return false;
  const turns = field(v.detail, "turns"), f = field(v.detail, "flawless"), c = field(v.detail, "clean"),
    m = field(v.detail, "missed"), x = field(v.detail, "forced");
  if (turns <= 0 || f < 0 || c < 0 || m < 0 || x < 0 || f + c + m + x !== turns) return false;
  return turns > turnsToHold(v.value) && turns <= turnsToHold(v.value + 1);
}
