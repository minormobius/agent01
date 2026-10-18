/* Twelve's score records (com.minomobi.lab.score, in the player's own repo).
   One board per slot the game already keeps a best for, a board and a flow:
     score-<mode>-<flow>-v1      points (the sum of every merged tile)   unit "points"
   with detail "seed=… moves=… top=…". The version is the rules': change
   anything that moves the score (spawn odds, rain, drains) and bump it. Only a
   finished ball posts: one with no pour left.

   The boards trust the record but refuse the impossible. Every tile on the ball
   came from spawns of 2 or 4, and a ball that has made m moves has dealt at
   most drop + 1 + Σ rain(k) of them (rain(k) = drop + ⌊k / rain⌋, as the
   engine deals), so the tiles sum to at most 4 × that. A tile of 2^k built
   from twos scores (k − 1) · 2^k on its way up, so the score is at most that
   sum times (log2 top − 1); the top tile is a power of two no bigger than the
   sum. No imports, so the selftest reads this in node; the constants are
   checked against engine.js there. */
export const VERSION = "v1";
export const MODES = { c60: { drop: 1, rain: 0 }, c80: { drop: 1, rain: 100 }, c180: { drop: 1, rain: 100 }, c240: { drop: 1, rain: 100 } };
export const FLOWS = { c60: ["gravity", "vortex"], c80: ["gravity", "vortex"], c180: ["gravity"], c240: ["gravity"] };
export const NAMES = { c60: "C60", c80: "C80", c180: "C180", c240: "C240" };
/* the slots, in the order the board's tabs show them */
export const SLOTS = [];
Object.keys(FLOWS).forEach((m) => FLOWS[m].forEach((f) => SLOTS.push(m + "-" + f)));
export const gameId = (slot) => "score-" + slot + "-" + VERSION;
export const label = (slot) => { const [m, f] = slot.split("-"); return NAMES[m] + (FLOWS[m].length > 1 ? (f === "vortex" ? " ◎" : " ⇣") : ""); };

/* the most tiles a ball of this mode can have dealt after `moves` moves */
export function dealt(mode, moves) {
  const M = MODES[mode]; let n = M.drop + 1 + M.drop * moves;
  if (M.rain) { const q = Math.floor(moves / M.rain), r = moves % M.rain; n += M.rain * q * (q - 1) / 2 + q * r; }
  return n;
}

export function detail(r) { return `seed=${r.seed} moves=${r.moves} top=${r.top}`; }
const field = (d, k) => { const m = new RegExp("(?:^| )" + k + "=(\\d{1,9})(?: |$)").exec(d || ""); return m ? +m[1] : -1; };

/* one finished ball's record */
export function records(r) {
  const slot = r.sel.board;
  return r.value > 0 ? [{ game: gameId(slot), value: r.value, unit: "points", higherIsBetter: true, detail: detail(r) }] : [];
}

export function accept(v) {
  if (!v || v.site !== "twelve" || v.higherIsBetter !== true || v.unit !== "points" || !Number.isInteger(v.value) || v.value <= 0 || v.value > 1e9) return false;
  if (typeof v.createdAt !== "string" || isNaN(Date.parse(v.createdAt))) return false;
  const slot = SLOTS.find((s) => gameId(s) === v.game);
  if (!slot) return false;
  const mode = slot.split("-")[0], moves = field(v.detail, "moves"), top = field(v.detail, "top");
  if (moves <= 0 || moves > 1e6 || top < 4 || (top & (top - 1)) !== 0) return false;
  const most = 4 * dealt(mode, moves);
  if (top > most) return false;
  return v.value <= most * (Math.log2(top) - 1);
}
