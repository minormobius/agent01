/* The Ratchet's score records (com.minomobi.lab.score, in the player's own
   repo). One board: routes crossed in a run, the number the game already keeps
   as your best. A run posts one record when it ends, stranded:
     routes-v1   routes crossed before you were stranded      unit "routes"
   with detail "seed=… routes=… walked=… spent=… scrapped=…", the counts the
   game-over screen shows. The version is the rules': change anything that
   moves these numbers (supply, refill, tolls, road length, kit size) and bump
   it.

   The board trusts the record but refuses the impossible. Every stage is
   passed by spending a tool or walking (paying its toll); a road is at least
   MIN_STAGES and at most MAX_STAGES long; the only supply there is is the
   start, the refill after each road and what scrapping buys, and a walk costs
   at least MIN_TOLL, so walks are bounded by supply (plus the one walk that
   strands you); and a road hands you at most MAX_KIT tools to spend or scrap.
   No imports, so the selftest reads this in node; the constants are checked
   against the game there. */
export const VERSION = "v1";
export const GAME = "routes-" + VERSION, UNIT = "routes";
export const START_SUPPLY = 8, REFILL_PER_ROUTE = 3, SCRAP_VALUE = 2, MIN_TOLL = 1;
export const MIN_STAGES = 3, MAX_STAGES = 14;
/* a road's kit: at most 8 from its plan, up to 14 more added until it is
   crossable, and a cache reward on at most 2 stages */
export const MAX_KIT = 8 + 14 + 2;

export function detail(r) {
  return `seed=${String(r.seed).replace(/\s+/g, "_")} routes=${r.routes} walked=${r.walked} spent=${r.spent} scrapped=${r.scrapped}`;
}
const field = (d, k) => { const m = new RegExp("(?:^| )" + k + "=(\\d{1,8})(?: |$)").exec(d || ""); return m ? +m[1] : -1; };

/* one run's record; r is { value: routes, routes, seed, walked, spent, scrapped } */
export function record(r) {
  return { value: r.value, unit: UNIT, higherIsBetter: true, detail: detail(r) };
}

export function accept(v) {
  if (!v || v.site !== "ratchet" || v.game !== GAME || v.unit !== UNIT || v.higherIsBetter !== true) return false;
  if (!Number.isInteger(v.value) || v.value <= 0 || v.value > 1000) return false;
  if (typeof v.createdAt !== "string" || isNaN(Date.parse(v.createdAt))) return false;
  if (!/(?:^| )seed=\S+/.test(v.detail || "")) return false;
  const routes = field(v.detail, "routes"), walked = field(v.detail, "walked"), spent = field(v.detail, "spent"), scrapped = field(v.detail, "scrapped");
  if (routes !== v.value || walked < 0 || spent < 0 || scrapped < 0) return false;
  // every stage of every crossed road was passed, and the stranding one got part way (its last walk is the one that stranded you)
  const passed = walked + spent;
  if (passed < MIN_STAGES * routes + 1 || passed > MAX_STAGES * (routes + 1)) return false;
  // walks are paid in supply, and supply only comes from the start, the refills and scrapping
  if ((walked - 1) * MIN_TOLL > START_SUPPLY + REFILL_PER_ROUTE * routes + SCRAP_VALUE * scrapped) return false;
  // tools are spent or scrapped out of kits that are never bigger than MAX_KIT a road
  return spent + scrapped <= MAX_KIT * (routes + 1);
}
