/* node games/twelve/test/twelve.selftest.mjs
 *
 * Twelve's promises, checked:
 *   - each board has the drains it claims (12 pentagons; plus 20 face-centre
 *     drains on C180, 30 edge drains on C240), and every cell can fall to each;
 *   - in vortex flow every drain is a whirlpool: five congruent arms that
 *     partition the cells, end on the rim, and never feed one cell from two;
 *   - a pour conserves the total, never puts a tile on a drain, merges each
 *     tile at most once, leaves the tiles packed, and its trails are real
 *     walks; each arm is exactly a row of 2048;
 *   - gravity is the default, contested cells go to the nearer tile, rain
 *     rises every 100 moves, games are deterministic and saves round-trip;
 *   - the balance claim: on C60 (both flows) random play stays near 2048's
 *     floor while greedy gets well past it; on C180/C240 rain ends every game.
 */
import { loadTwelve, gridEnv, play, random, greedy } from "./harness.mjs";
const T = await loadTwelve();
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log("  ✗ " + msg); } };

console.log("drains");
const FOLDS = { c60: { 5: 12 }, c80: { 5: 12 }, c180: { 5: 12, 3: 20 }, c240: { 5: 12, 2: 30 } };
for (const k of Object.keys(T.MODES)) {
  const env = T.setup(k), s = env.s, folds = {};
  env.drains.forEach((D) => (folds[D.fold] = (folds[D.fold] || 0) + 1));
  ok(JSON.stringify(folds) === JSON.stringify(FOLDS[k]), `${k}: drains by symmetry ${JSON.stringify(folds)}`);
  ok(env.drains.every((D) => env.hole[D.p]) && env.cells === s.n - env.drains.length, `${k}: drains are exactly the holes`);
  env.drains.forEach((D) => {
    const G = D.gravity;
    for (let i = 0; i < s.n; i++) {
      if (env.hole[i]) continue;
      ok(D.d[i] >= 0, `${k}: cell ${i} can fall to drain ${D.p}`);
      if (D.d[i] === 0) ok(s.nbrs[i].includes(D.p) && G.down[i] === -1, `${k}: rim cells touch their drain and stop`);
      else ok(s.nbrs[i].includes(G.down[i]) && D.d[G.down[i]] === D.d[i] - 1 && !env.hole[G.down[i]], `${k}: gravity steps one cell nearer`);
    }
    ok(G.order.length === env.cells && G.order.every((c, q) => !q || D.d[G.order[q - 1]] <= D.d[c]), `${k}: gravity pours nearest first`);
  });
  console.log(`  ${k}: ${env.cells} cells, ${env.drains.length} drains ${JSON.stringify(folds)}, flows ${T.flows(k).join("/")}`);
}

console.log("whirlpools (vortex flow)");
for (const k of Object.keys(T.MODES)) {
  const env = T.setup(k), s = env.s;
  if (T.flows(k).indexOf("vortex") < 0) { ok(env.drains.every((D) => !D.vortex), `${k}: no vortex where drains aren't all pentagons`); continue; }
  const shape = new Set();
  env.drains.forEach((D) => {
    const V = D.vortex, all = V.lanes.flat();
    ok(V.lanes.length === 5 && all.length === env.cells && new Set(all).size === env.cells && all.every((c) => !env.hole[c]), `${k}: five arms cover every cell exactly once`);
    ok(V.lanes.every((L) => s.nbrs[D.p].includes(L[0])), `${k}: every arm ends on the drain's rim`);
    ok(V.lanes.every((L) => L.every((c, q) => !q || s.nbrs[L[q - 1]].includes(c))), `${k}: every arm is a chain of neighbours`);
    const into = new Int32Array(s.n); for (let i = 0; i < s.n; i++) if (V.down[i] >= 0) into[V.down[i]]++;
    ok(into.every((x) => x <= 1), `${k}: no cell has two tiles flowing into it (no contention)`);
    const prof = V.lanes.map((L) => L.map((c) => D.d[c]).join(""));
    ok(new Set(prof).size === 1, `${k}: the five arms are congruent`);
    shape.add(prof[0]);
  });
  ok(shape.size === 1, `${k}: every drain swirls alike`);
  console.log(`  ${k}: 12 whirlpools of 5 arms × ${env.cells / 5}, ring depths along an arm ${[...shape][0]}`);
}
{ const D = T.setup("c60").drains[0]; ok(D.vortex.lanes.every((L) => L.every((c, q) => D.d[c] === q)), "c60: arms climb ring by ring (0,1,2,3)"); }

console.log("pours");
{
  const rnd = T.rngFrom("pours");
  let checked = 0;
  for (let t = 0; t < 800; t++) {
    const k = Object.keys(T.MODES)[t % 4], flows = T.flows(k), flow = flows[(t >> 2) % flows.length], env = T.setup(k), s = env.s;
    const g = new Array(s.n).fill(0);
    for (let i = 0; i < s.n; i++) if (!env.hole[i] && rnd() < 0.6) g[i] = 2 ** (1 + Math.floor(rnd() * 4));
    const w = Math.floor(rnd() * env.drains.length), D0 = env.drains[w], D = flow === "vortex" ? { d: D0.d, down: D0.vortex.down } : { d: D0.d, down: D0.gravity.down }, r = T.pull(env, g, w, flow);
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    ok(sum(r.g) === sum(g), "a pour conserves the total");
    ok(r.g.every((v, i) => !env.hole[i] || v === 0), "nothing sits on a drain");
    ok(r.g.every((v, i) => !v || D.d[i] === 0 || r.g[D.down[i]] !== 0), "after a pour the tiles are packed along their arms");
    const ends = r.trails.filter((x) => x.merge).map((x) => x.path[x.path.length - 1]);
    ok(new Set(ends).size === ends.length, "each tile merges at most once a pour");
    ok(r.score === ends.reduce((acc, c) => acc + r.g[c], 0), "the score is the sum of the merged tiles");
    ok(r.trails.every((x) => x.path.every((c, q) => !q || D.down[x.path[q - 1]] === c)), "trails walk along their arms");
    checked++;
  }
  // the classic cases, on one vortex arm (rim first) — each arm is a row of 2048
  const env = T.setup("c60"), s = env.s, L = env.drains[0].vortex.lanes[0];
  const lane = (vals) => { const g = new Array(s.n).fill(0); L.forEach((x, q) => (g[x] = vals[q])); const r = T.pull(env, g, 0, "vortex"); return L.map((x) => r.g[x]); };
  ok(lane([2, 2, 2, 0]).join() === "4,2,0,0", "2 2 2 → 4 2 (nearest pair first)");
  ok(lane([2, 2, 2, 2]).join() === "4,4,0,0", "2 2 2 2 → 4 4 (not 8)");
  ok(lane([0, 0, 0, 4]).join() === "4,0,0,0", "a lone tile slides to the rim");
  ok(lane([4, 2, 2, 0]).join() === "4,4,0,0", "4 2 2 → 4 4");
  ok(lane([2, 0, 2, 4]).join() === "4,4,0,0", "2 _ 2 4 → 4 4");
  // arms don't interact: a pour equals the five arms poured one by one
  { const g = new Array(s.n).fill(0); for (let i = 0; i < s.n; i++) if (!env.hole[i] && rnd() < 0.7) g[i] = 2 ** (1 + Math.floor(rnd() * 3));
    const r = T.pull(env, g, 3, "vortex"); let same = true;
    for (const A of env.drains[3].vortex.lanes) { const row = A.map((c) => g[c]).filter(Boolean), out = []; for (let q = 0; q < row.length; q++) { if (q + 1 < row.length && row[q] === row[q + 1]) { out.push(2 * row[q]); q++; } else out.push(row[q]); }
      while (out.length < A.length) out.push(0); if (A.map((c) => r.g[c]).join() !== out.join()) same = false; }
    ok(same, "a pour is 2048's row rule on each arm independently"); }
  // gravity: a contested cell goes to the nearer tile
  { const D = env.drains[0], G = D.gravity, into = {}; for (let i = 0; i < s.n; i++) if (G.down[i] >= 0) (into[G.down[i]] = into[G.down[i]] || []).push(i);
    const c = Object.keys(into).find((x) => into[x].length >= 2 && G.down[x] >= -1), feeders = into[c];
    if (c != null) { const g = new Array(s.n).fill(0); feeders.slice(0, 2).forEach((f) => (g[f] = 2)); g[c] = 0;
      const P = (i) => [s.pos[3 * i], s.pos[3 * i + 1], s.pos[3 * i + 2]], dd = (i) => { const a = P(i), b = P(D.p); return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
      const [f1, f2] = feeders.slice(0, 2), nearer = D.d[f1] !== D.d[f2] ? (D.d[f1] < D.d[f2] ? f1 : f2) : (dd(f1) > dd(f2) ? f1 : f2);
      const r = T.pull(env, g, 0, "gravity"), tr = r.trails.find((x) => x.path[0] === nearer);
      ok(tr && tr.path.includes(+c), "gravity: the nearer of two tiles takes the contested cell"); } else ok(false, "found a contested cell"); }
  console.log(`  ${checked} random pours checked (every board, both flows), arm cases as 2048`);
}

console.log("deterministic, and saves");
{
  const play1 = () => { const G = new T.Game("c60", "det"); for (let k = 0; k < 30; k++) G.move(k % 12); return G; };
  const A = play1(), B = play1();
  ok(JSON.stringify(A.save()) === JSON.stringify(B.save()), "same seed, same moves, same ball");
  const C = T.Game.restore(A.save()); ok(C && C.g.join() === A.g.join() && C.score === A.score && C.moves === A.moves, "restore round-trips");
  ok(T.Game.restore({ k: "nope" }) === null, "a bad save is refused");
  ok(new T.Game("c60", "f").flow === "gravity", "gravity is the default flow");
  ok(new T.Game("c180", "f", "vortex").flow === "gravity", "vortex falls back to gravity where it isn't offered");
  const V = new T.Game("c60", "v", "vortex"); V.move(0); const V2 = T.Game.restore(V.save()); ok(V2.flow === "vortex" && V2.g.join() === V.g.join(), "a vortex game restores as vortex");
  const H = new T.Game("c80", "x"); ok(H.g.filter(Boolean).length === 2 && H.rain() === 1, "C80 starts with two tiles, one a move");
  H.moves = 100; ok(H.rain() === 2, "rain: one more a move after 100 moves"); H.moves = 250; ok(H.rain() === 3, "rain: three after 200");
  const C6 = new T.Game("c60", "x"); C6.moves = 1000; ok(C6.rain() === 1, "C60 has no rain");
  // the spawn stream survives a save mid-rain
  const Rn = new T.Game("c180", "rain"); for (let m = 0; m < 160 && Rn.canMove(); m++) { for (let w = 0; w < Rn.env.drains.length; w++) if (Rn.move(w)) break; }
  const Rs = T.Game.restore(Rn.save()), Rc = T.Game.restore(Rn.save());
  for (let w = 0; w < Rn.env.drains.length; w++) if (Rs.preview(w).moved) { Rs.move(w); Rn.move(w); break; }
  ok(Rs.g.join() === Rn.g.join(), "a restored game deals the same new tiles as the original");
}

console.log("the balance claim");
{
  const { playGame } = await import("./harness.mjs");
  const N = 20, med = (R) => R.map((x) => x.top).sort((p, q) => p - q)[R.length >> 1];
  const classic = []; for (let i = 0; i < N; i++) classic.push(play(T, gridEnv(4), random, "c" + i, 1, 6000));
  ok(med(classic) >= 64 && med(classic) <= 256, `calibration: classic 4×4 random median ${med(classic)} (expect ~128)`);
  const line = [];
  for (const flow of ["gravity", "vortex"]) {
    const rnd = [], grd = []; for (let i = 0; i < N; i++) { rnd.push(playGame(T, "c60", flow, random, "r" + i)); grd.push(playGame(T, "c60", flow, greedy, "g" + i)); }
    ok(med(rnd) <= 256, `C60 ${flow}: random median ${med(rnd)} stays near 2048's floor`);
    ok(med(grd) >= 2 * med(rnd), `C60 ${flow}: greedy median ${med(grd)} gets well past random (${med(rnd)})`);
    line.push(`${flow} random ${med(rnd)} / greedy ${med(grd)}`);
  }
  // with rain, every game on the big boards ends, and greedy outlasts random
  for (const k of ["c180", "c240"]) {
    const rnd = [], grd = []; for (let i = 0; i < 6; i++) { rnd.push(playGame(T, k, "gravity", random, "R" + i, 4000)); grd.push(playGame(T, k, "gravity", greedy, "G" + i, 4000)); }
    ok(grd.every((x) => !x.capped) && rnd.every((x) => !x.capped), `${k}: rain ends every game`);
    ok(med(grd) >= 4 * med(rnd), `${k}: greedy median ${med(grd)} ≥ 4× random ${med(rnd)}`);
    line.push(`${k} random ${med(rnd)} / greedy ${med(grd)}`);
  }
  console.log("  C60 " + line.join(" · ") + ` · classic 4×4 random ${med(classic)}`);
}

console.log(fails ? `\n✗ ${fails} failed` : "\n✓ twelve selftest passed");
process.exit(fails ? 1 : 0);
