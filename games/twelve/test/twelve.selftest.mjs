/* node games/twelve/test/twelve.selftest.mjs
 *
 * Twelve's promises, checked:
 *   - every drain is a whirlpool: five congruent arms that partition the
 *     hexes, end on the rim, and never feed one cell from two (no coin tosses);
 *   - a pour conserves the total, never puts a tile on a drain, merges each
 *     tile at most once, leaves the tiles packed, and its trails are real
 *     walks; each arm is exactly a row of 2048;
 *   - games are deterministic from their seed, and save/restore round-trips;
 *   - the balance claim: on C60, random play stays near 2048's floor while
 *     greedy play gets well past it (the skill gap is the point).
 */
import { loadTwelve, gridEnv, play, random, greedy } from "./harness.mjs";
const T = await loadTwelve();
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log("  ✗ " + msg); } };

console.log("whirlpools");
for (const k of Object.keys(T.MODES)) {
  const env = T.setup(T.MODES[k].sphere), s = env.s;
  ok(env.drains.length === 12, `${k}: twelve drains`);
  const shape = new Set();
  env.drains.forEach((D) => {
    const all = D.lanes.flat();
    ok(D.lanes.length === 5 && all.length === env.hexes && new Set(all).size === env.hexes && all.every((c) => !s.pent[c]), `${k}: five arms cover every hex exactly once`);
    ok(D.lanes.every((L) => s.nbrs[D.p].includes(L[0])), `${k}: every arm ends on the drain's rim`);
    ok(D.lanes.every((L) => L.every((c, q) => !q || s.nbrs[L[q - 1]].includes(c))), `${k}: every arm is a chain of neighbours`);
    const into = new Int32Array(s.n); for (let i = 0; i < s.n; i++) if (D.down[i] >= 0) into[D.down[i]]++;
    ok(into.every((x) => x <= 1), `${k}: no cell has two tiles flowing into it (no contention)`);
    ok(D.order.every((c, q) => !q || D.lanes.find((L) => L.includes(D.order[q - 1])).indexOf(D.order[q - 1]) <= D.lanes.find((L) => L.includes(c)).indexOf(c)), `${k}: pour order is rim first`);
    // the five arms are rotations of one another: same ring-depth profile
    const prof = D.lanes.map((L) => L.map((c) => D.d[c]).join(""));
    ok(new Set(prof).size === 1, `${k}: the five arms are congruent`);
    shape.add(prof[0]);
  });
  ok(shape.size === 1, `${k}: every drain swirls alike`);
  console.log(`  ${k}: ${env.hexes} hexes, 12 whirlpools of 5 arms × ${env.hexes / 5}, ring depths along an arm ${[...shape][0]} (${env.drains[0].arms} candidate arms)`);
}
if (true) { const D = T.setup("c60").drains[0]; ok(D.lanes.every((L) => L.every((c, q) => D.d[c] === q)), "c60: arms climb ring by ring (0,1,2,3)"); }

console.log("pours");
{
  const env = T.setup("c60"), s = env.s, rnd = T.rngFrom("pours");
  let checked = 0;
  for (let t = 0; t < 400; t++) {
    const g = new Array(s.n).fill(0);
    for (let i = 0; i < s.n; i++) if (!s.pent[i] && rnd() < 0.6) g[i] = 2 ** (1 + Math.floor(rnd() * 4));
    const w = Math.floor(rnd() * 12), D = env.drains[w], r = T.pull(env, g, w);
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    ok(sum(r.g) === sum(g), "a pour conserves the total");
    ok(r.g.every((v, i) => !s.pent[i] || v === 0), "nothing sits on a drain");
    ok(r.g.every((v, i) => !v || D.d[i] === 0 || r.g[D.down[i]] !== 0), "after a pour the tiles are packed along their arms");
    const ends = r.trails.filter((x) => x.merge).map((x) => x.path[x.path.length - 1]);
    ok(new Set(ends).size === ends.length, "each tile merges at most once a pour");
    ok(r.score === ends.reduce((acc, c) => acc + r.g[c], 0), "the score is the sum of the merged tiles");
    ok(r.trails.every((x) => x.path.every((c, q) => !q || D.down[x.path[q - 1]] === c)), "trails walk along their arms");
    checked++;
  }
  // the classic cases, on one arm (rim first) — each arm is a row of 2048
  const L = env.drains[0].lanes[0];
  const lane = (vals) => { const g = new Array(s.n).fill(0); L.forEach((x, q) => (g[x] = vals[q])); const r = T.pull(env, g, 0); return L.map((x) => r.g[x]); };
  ok(lane([2, 2, 2, 0]).join() === "4,2,0,0", "2 2 2 → 4 2 (nearest pair first)");
  ok(lane([2, 2, 2, 2]).join() === "4,4,0,0", "2 2 2 2 → 4 4 (not 8)");
  ok(lane([0, 0, 0, 4]).join() === "4,0,0,0", "a lone tile slides to the rim");
  ok(lane([4, 2, 2, 0]).join() === "4,4,0,0", "4 2 2 → 4 4");
  ok(lane([2, 0, 2, 4]).join() === "4,4,0,0", "2 _ 2 4 → 4 4");
  // arms don't interact: a pour equals the five arms poured one by one
  { const g = new Array(s.n).fill(0); for (let i = 0; i < s.n; i++) if (!s.pent[i] && rnd() < 0.7) g[i] = 2 ** (1 + Math.floor(rnd() * 3));
    const r = T.pull(env, g, 3); let same = true;
    for (const A of env.drains[3].lanes) { const row = A.map((c) => g[c]).filter(Boolean), out = []; for (let q = 0; q < row.length; q++) { if (q + 1 < row.length && row[q] === row[q + 1]) { out.push(2 * row[q]); q++; } else out.push(row[q]); }
      while (out.length < A.length) out.push(0); if (A.map((c) => r.g[c]).join() !== out.join()) same = false; }
    ok(same, "a pour is 2048's row rule on each arm independently"); }
  console.log(`  ${checked} random pours checked, lane cases as 2048`);
}

console.log("deterministic, and saves");
{
  const play1 = () => { const G = new T.Game("c60", "det"); for (let k = 0; k < 30; k++) G.move(k % 12); return G; };
  const A = play1(), B = play1();
  ok(JSON.stringify(A.save()) === JSON.stringify(B.save()), "same seed, same moves, same ball");
  const C = T.Game.restore(A.save()); ok(C && C.g.join() === A.g.join() && C.score === A.score && C.moves === A.moves, "restore round-trips");
  ok(T.Game.restore({ k: "nope" }) === null, "a bad save is refused");
  const H = new T.Game("c80", "x"); ok(H.g.filter(Boolean).length === 5, "C80 starts with drop+1 tiles");
  let r = null; for (let w = 0; w < 12 && !r; w++) r = H.move(w); ok(r && r.spawned.length === 4, "C80 drops four a move");
}

console.log("the balance claim");
{
  const env = T.setup("c60"), N = 24, med = (R) => R.map((x) => x.top).sort((p, q) => p - q)[R.length >> 1];
  const rnd = [], grd = [], classic = [];
  for (let i = 0; i < N; i++) { rnd.push(play(T, env, random, "r" + i, 1, 6000)); grd.push(play(T, env, greedy, "g" + i, 1, 6000)); classic.push(play(T, gridEnv(4), random, "c" + i, 1, 6000)); }
  ok(med(classic) >= 64 && med(classic) <= 256, `calibration: classic 4×4 random median ${med(classic)} (expect ~128)`);
  ok(med(rnd) <= 256, `C60 random median ${med(rnd)} stays near 2048's floor`);
  ok(med(grd) >= 256 && med(grd) >= 2 * med(rnd), `C60 greedy median ${med(grd)} gets well past random (${med(rnd)})`);
  console.log(`  C60: random median top ${med(rnd)}, greedy ${med(grd)} · classic 4×4 random ${med(classic)}`);
}

console.log(fails ? `\n✗ ${fails} failed` : "\n✓ twelve selftest passed");
process.exit(fails ? 1 : 0);
