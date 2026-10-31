/* Outbound's score records (com.minomobi.lab.score, in the player's own repo).
   One board, the number the game already keeps as your best:

     depots-v1    depots made before the convoy was stranded    unit "depots"

   with detail "seed=… depots=… crossings=… sent=… rested=… lost=…", the
   run's own tally from the end screen. The version is the rules': change
   anything in config.js that moves these numbers (the road's length, strain,
   what a lay-up relieves) and bump it.

   The board trusts the record but refuses the impossible, using the game's
   own rules (the constants here are checked against config.js by the
   selftest):
     - every depot is a finished leg, and no leg is shorter than 3 crossings
       (the generator never cuts one below that), so crossings ≥ 3 × depots;
     - no leg is longer than its plan plus the generator's padding, and the
       run's last, stranded leg is at most one more, so crossings has a ceiling;
     - every crossing was a send or a burn, so sent ≤ crossings;
     - strain only comes from sends: everyone lost took MAX_STRAIN of them net
       of their lay-ups, and every lay-up relieved strain somebody earned, so
       sent ≥ lost × MAX_STRAIN + rested × REST_RELIEF.
   No imports, so the selftest reads this in node. */
export const VERSION = "v1";
export const GAME = "depots-" + VERSION;
export const UNIT = "depots";
export const MIN_STAGES = 3, BASE_STAGES = 7, STAGES_PER_LEG = 0.9, MAX_STAGES = 14, MAX_PADDING = 5;
export const MAX_STRAIN = 2, REST_RELIEF = 1;
const MAX_DEPOTS = 999;

/* the most crossings a leg can have: its plan, padded as far as the generator pads */
export const legCeiling = (leg) => Math.min(MAX_STAGES, BASE_STAGES + Math.floor(leg * STAGES_PER_LEG)) + MAX_PADDING;
export function crossingCeiling(depots) { let n = 0; for (let l = 1; l <= depots + 1; l++) n += legCeiling(l); return n; }

/* a seed is whatever was in ?seed=, so it goes in encoded and capped */
const seedOf = (s) => encodeURIComponent(String(s)).slice(0, 64);
export function detail(r) {
  return `seed=${seedOf(r.seed)} depots=${r.value} crossings=${r.crossings} sent=${r.sent} rested=${r.rested} lost=${r.lost}`;
}
export function record(r) {
  return { value: r.value, unit: UNIT, higherIsBetter: true, detail: detail(r) };
}

const field = (d, k) => { const m = new RegExp("(?:^| )" + k + "=(\\d{1,7})(?: |$)").exec(d || ""); return m ? +m[1] : -1; };

export function accept(v) {
  if (!v || v.site !== "outbound" || v.game !== GAME || v.unit !== UNIT || v.higherIsBetter !== true) return false;
  if (!Number.isInteger(v.value) || v.value < 1 || v.value > MAX_DEPOTS) return false;
  if (typeof v.createdAt !== "string" || isNaN(Date.parse(v.createdAt))) return false;
  if (typeof v.detail !== "string" || !/(?:^| )seed=[A-Za-z0-9%._~!*'()-]{1,64}(?: |$)/.test(v.detail)) return false;
  const depots = field(v.detail, "depots"), crossings = field(v.detail, "crossings"), sent = field(v.detail, "sent"),
    rested = field(v.detail, "rested"), lost = field(v.detail, "lost");
  if (depots !== v.value || crossings < 0 || sent < 0 || rested < 0 || lost < 0) return false;
  if (crossings < MIN_STAGES * depots || crossings > crossingCeiling(depots)) return false;
  if (sent > crossings) return false;
  return sent >= lost * MAX_STRAIN + rested * REST_RELIEF;
}
