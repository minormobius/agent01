/* node games/twelve/test/twelve.selftest.mjs
 *
 * Twelve's promises, checked:
 *   - every board has twelve drains, and from every hex there is a way
 *     downhill to each one;
 *   - a pour conserves the total, never puts a tile on a drain, merges each
 *     tile at most once, leaves the tiles packed, and its trails are real
 *     walks; the classic cases come out as in 2048;
 *   - games are deterministic from their seed, and save/restore round-trips;
 *   - the balance claim: on C60, random play stays near 2048's floor while
 *     greedy play gets far past it (the skill gap is the point).
 */
import { loadTwelve, gridEnv, play, random, greedy } from "./harness.mjs";
const T = await loadTwelve();
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log("  ✗ " + msg); } };

console.log("drains");
for (const k of Object.keys(T.MODES)) {
  const env = T.setup(T.MODES[k].sphere), s = env.s;
  ok(env.drains.length === 12, `${k}: twelve drains`);
  env.drains.forEach((D) => {
    for (let i = 0; i < s.n; i++) {
      if (s.pent[i]) { ok(D.d[i] === -1, `${k}: a pentagon holds no distance`); continue; }
      ok(D.d[i] >= 0, `${k}: hex ${i} reaches drain ${D.p}`);
      if (D.d[i] === 0) ok(s.nbrs[i].includes(D.p) && D.down[i] === -1, `${k}: rim hexes touch the drain and stop there`);
      else ok(s.nbrs[i].includes(D.down[i]) && D.d[D.down[i]] === D.d[i] - 1 && !s.pent[D.down[i]], `${k}: downhill is one hex nearer`);
    }
    ok(D.order.length === env.hexes && D.order.every((c, q) => !q || D.d[D.order[q - 1]] <= D.d[c]), `${k}: pour order is nearest first`);
  });
  console.log(`  ${k}: ${env.hexes} hexes, 12 drains, deepest hex ${Math.max(...env.drains.map((D) => Math.max(...D.d)))} steps from a rim`);
}

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
    ok(r.g.every((v, i) => !v || D.d[i] === 0 || r.g[D.down[i]] !== 0), "after a pour the tiles are packed downhill");
    const ends = r.trails.filter((x) => x.merge).map((x) => x.path[x.path.length - 1]);
    ok(new Set(ends).size === ends.length, "each tile merges at most once a pour");
    ok(r.score === ends.reduce((acc, c) => acc + r.g[c], 0), "the score is the sum of the merged tiles");
    ok(r.trails.every((x) => x.path.every((c, q) => !q || D.down[x.path[q - 1]] === c)), "trails walk downhill");
    checked++;
  }
  // the classic cases, on one downhill lane a ← b ← c ← e
  const D = env.drains[0], a = s.nbrs[D.p].find((v) => true);
  const up = (x) => { for (let i = 0; i < s.n; i++) if (D.down[i] === x) return i; return -1; };
  const b = up(a), c = up(b), e = up(c);
  const lane = (vals) => { const g = new Array(s.n).fill(0); [a, b, c, e].forEach((x, q) => (g[x] = vals[q])); const r = T.pull(env, g, 0); return [a, b, c, e].map((x) => r.g[x]); };
  if (b >= 0 && c >= 0 && e >= 0) {
    ok(lane([2, 2, 2, 0]).join() === "4,2,0,0", "2 2 2 → 4 2 (nearest pair first)");
    ok(lane([2, 2, 2, 2]).join() === "4,4,0,0", "2 2 2 2 → 4 4 (not 8)");
    ok(lane([0, 0, 0, 4]).join() === "4,0,0,0", "a lone tile falls to the rim");
    ok(lane([4, 2, 2, 0]).join() === "4,4,0,0", "4 2 2 → 4 4");
  } else ok(false, "found a lane of four");
  console.log(`  ${checked} random pours checked, lane cases as 2048`);
}

console.log("deterministic, and saves");
{
  const play1 = () => { const G = new T.Game("c60", "det"); for (let k = 0; k < 30; k++) G.move(k % 12); return G; };
  const A = play1(), B = play1();
  ok(JSON.stringify(A.save()) === JSON.stringify(B.save()), "same seed, same moves, same ball");
  const C = T.Game.restore(A.save()); ok(C && C.g.join() === A.g.join() && C.score === A.score && C.moves === A.moves, "restore round-trips");
  ok(T.Game.restore({ k: "nope" }) === null, "a bad save is refused");
  const H = new T.Game("c80", "x"); ok(H.g.filter(Boolean).length === 4, "C80 starts with drop+1 tiles");
  const r = H.move(0) || H.move(1); ok(r && r.spawned.length === 3, "C80 drops three a move");
}

console.log("the balance claim");
{
  const env = T.setup("c60"), N = 24, med = (R) => R.map((x) => x.top).sort((p, q) => p - q)[R.length >> 1];
  const rnd = [], grd = [], classic = [];
  for (let i = 0; i < N; i++) { rnd.push(play(T, env, random, "r" + i, 1, 6000)); grd.push(play(T, env, greedy, "g" + i, 1, 6000)); classic.push(play(T, gridEnv(4), random, "c" + i, 1, 6000)); }
  ok(med(classic) >= 64 && med(classic) <= 256, `calibration: classic 4×4 random median ${med(classic)} (expect ~128)`);
  ok(med(rnd) <= 256, `C60 random median ${med(rnd)} stays near 2048's floor`);
  ok(med(grd) >= 512, `C60 greedy median ${med(grd)} gets far past it`);
  console.log(`  C60: random median top ${med(rnd)}, greedy ${med(grd)} · classic 4×4 random ${med(classic)}`);
}

console.log(fails ? `\n✗ ${fails} failed` : "\n✓ twelve selftest passed");
process.exit(fails ? 1 : 0);
