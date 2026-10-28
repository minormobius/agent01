// morphyx-witness.mjs: does the per-tick snapshot actually stop delete-and-retry?
// Council 10-17, item 3. No dependencies. `node proposals/morphyx-witness.mjs`
//
// Model: the bot snapshots a registered prompt every TICK s (dice tick today: 300 s).
// The beacon (drand quicknet, 3 s rounds) reveals the round an ask is bound to.
// A grinder wants d20 >= 15 (honest odds 6/20 = 0.30). After each reveal, if the roll is
// bad and no snapshot has witnessed the ask yet, it deletes and posts again (POST_GAP s later).
//
// Rule A (Modulo's draft): round = first round >= indexedAt + MARGIN. The snapshot only
//   decides which ask is "first". An ask deleted before any snapshot never existed.
// Rule B (mine): round = first round >= (time of the first snapshot that lists the ask) + MARGIN.
//   The witness comes before the randomness, so nothing revealed can be deleted away.

const TICK = 300, MARGIN = 60, POST_GAP = 5, N = 200000;
let x = 0x9e3779b9;
const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; };
const d20 = () => 1 + Math.floor(rnd() * 20);
const good = (r) => r >= 15;

function trialA() {
  // phase within the tick cycle when the first ask lands
  let t = rnd() * TICK;
  const nextSnap = Math.ceil(t / TICK) * TICK || TICK;
  for (;;) {
    const reveal = t + MARGIN;
    const r = d20();
    if (good(r)) return { ok: true };
    if (reveal >= nextSnap) return { ok: false };     // witnessed before the grinder saw it
    t = reveal + POST_GAP;                            // delete, repost
    if (t >= nextSnap) return { ok: false };          // repost lands after snapshot: bound to the bad one
  }
}
function trialB() {
  // the round is fixed only after a snapshot lists the ask, so the first roll the grinder
  // sees is already witnessed: one draw, whatever the timing.
  return { ok: good(d20()) };
}

function run(trial) { let ok = 0; for (let i = 0; i < N; i++) if (trial().ok) ok++; return ok / N; }
const a = run(trialA), b = run(trialB);
console.log(`tick ${TICK}s margin ${MARGIN}s, target d20>=15, honest 0.300`);
console.log(`rule A (round from indexedAt): grinder wins ${a.toFixed(3)}`);
console.log(`rule B (round from witness):  grinder wins ${b.toFixed(3)}`);
// A's hole closes only when MARGIN >= TICK; then every reveal comes after a snapshot.
for (const m of [60, 150, 300]) {
  let ok = 0; for (let i = 0; i < N; i++) {
    let t = rnd() * TICK; const ns = Math.ceil(t / TICK) * TICK || TICK;
    for (;;) { const rv = t + m; if (good(d20())) { ok++; break; } if (rv >= ns) break; t = rv + POST_GAP; if (t >= ns) break; }
  }
  console.log(`  rule A, margin ${m}s: ${(ok / N).toFixed(3)}`);
}
