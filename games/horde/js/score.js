/* Hold the Line's score records (com.minomobi.lab.score, in the player's own
   repo). One run posts one:
     wave-v1    the wave the wall fell on              unit "wave"
   with detail "seed=… wave=… kills=… leaks=… t=… taken=…". The wave you died
   on is the number the game already keeps as your best, and the one people
   say out loud ("I got to wave 14"). The version is the rules': change
   anything that moves how far a run gets (the director, the bestiary, the
   cards) and bump it.

   The board trusts the record but refuses the impossible, from the game's own
   constants (the selftest checks them against config.js):
     · one card per cleared wave, so a run that died on wave n took n − 1;
     · the wall starts at WALL_MAX and a leak does at most MAX_DMG, so a fall
       needs at least ⌈WALL_MAX / MAX_DMG⌉ leaks;
     · every wave opens with a BRIEF-second beat, and a wave can't last longer
       than its spawns plus the slowest walk in; the gate times out at GATE;
     · every zombie of a cleared wave was killed or leaked, and a wave's
       budget buys between ¼ and 1.43 zombies a point.
   No imports, so the selftest reads this in node. */
export const VERSION = "v1";
export const GAME = "wave-" + VERSION;
export const UNIT = "wave";
export const WALL_MAX = 10, MAX_DMG = 3, BRIEF = 2.2, GATE = 6.0;
export const SLOWEST = 0.048 * 0.55;                    // brute speed × the TAR floor: the longest walk in
export const MIN_PER_PT = 1 / 4, MAX_PER_PT = 4 / 2.8;  // zombies a spawn point buys: brute … swarm
export const MAX_WAVE = 500;
export const budget = (w) => 5 + 3.2 * w;               // config.waveBudget
export const duration = (w) => Math.min(26, 12 + 0.6 * w); // config.waveDuration

const sd = (s) => encodeURIComponent(String(s)).slice(0, 64);
export function detail(r) { return `seed=${sd(r.seed)} wave=${r.value} kills=${r.kills} leaks=${r.leaks} t=${Math.floor(r.t)} taken=${r.taken}`; }
const field = (d, k) => { const m = new RegExp("(?:^| )" + k + "=(\\d{1,9})(?: |$)").exec(d || ""); return m ? +m[1] : -1; };

/* one run's record */
export function record(r) { return { value: r.value, unit: UNIT, higherIsBetter: true, detail: detail(r) }; }

/* what a run that died on wave n must look like */
export function possible(n, kills, leaks, t, taken) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_WAVE) return false;
  if (taken !== n - 1) return false;
  if (leaks < Math.ceil(WALL_MAX / MAX_DMG)) return false;
  let tMin = 0, tMax = 0, zMin = 0, zMax = 0;
  for (let w = 1; w <= n; w++) {
    tMin += BRIEF;
    tMax += BRIEF + duration(w) * 0.8 + 1.2 / SLOWEST + GATE; // 1.2: a clump starts a little further out
    if (w < n) zMin += Math.floor(budget(w) * MIN_PER_PT);
    zMax += Math.ceil((budget(w) + 4) * MAX_PER_PT) + 4;
  }
  if (t < Math.floor(tMin) || t > Math.ceil(tMax)) return false;
  return kills + leaks >= zMin && kills + leaks <= zMax;
}

export function accept(v) {
  if (!v || v.site !== "horde" || v.game !== GAME || v.unit !== UNIT || v.higherIsBetter !== true) return false;
  if (typeof v.createdAt !== "string" || isNaN(Date.parse(v.createdAt))) return false;
  const d = typeof v.detail === "string" ? v.detail : "";
  if (!/(?:^| )seed=[^\s=]{1,64}(?: |$)/.test(d)) return false;
  if (field(d, "wave") !== v.value) return false;
  return possible(v.value, field(d, "kills"), field(d, "leaks"), field(d, "t"), field(d, "taken"));
}
