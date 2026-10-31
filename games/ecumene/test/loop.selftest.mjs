/* The claim the game rests on: a line grows the city along it, measured
   against the same planet without it on three worlds.
     node games/ecumene/test/loop.selftest.mjs   (~45 s) */
import { loadEcumene } from "./harness.mjs";
const E = await loadEcumene(), P = E.P_;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };

/* ---- the loop: the same planet with and without a line through its home city, 25 years on.
   One world's 25 years are sensitive to anything (a town founded a year
   apart changes the rest), so it is measured on three. */
function corridor(seed) {
  const s = new E.Sim(E.makeWorld(seed), seed); s.warmup();
  const pt = (i) => [s.P[3 * i], s.P[3 * i + 1], s.P[3 * i + 2]];
  let a = -1; for (let i = 0; i < s.n; i++) if (s.land[i] && s.zoneTown[i] === s.home && (a < 0 || s.pop[i] / s.area[i] > s.pop[a] / s.area[a])) a = i;
  const city = [a], seen = new Set(city);
  for (let h = 0; h < city.length; h++) for (const j of s.nbrs[city[h]]) if (!seen.has(j) && s.pop[j] / s.area[j] > 30) { seen.add(j); city.push(j); }
  let far = [a, a, -1]; for (const i of city) for (const j of city) { const d = E.arc(pt(i), pt(j)); if (d > far[2]) far = [i, j, d]; }
  const st = []; for (let k = 0, ns = Math.max(2, Math.round(far[2] * E.R / 4)); k <= ns; k++) st.push(E.slerp(pt(far[0]), pt(far[1]), k / ns));
  return st;
}
function run(seed, st) {
  const t = new E.Sim(E.makeWorld(seed), seed); t.warmup();
  if (st) t.setLines([{ id: 1, color: "#f00", stops: st, trains: 8 }]);
  for (let y = 0; y < 25; y++) t.step();
  const ref = st || corridor(seed);
  let along = 0; for (let i = 0; i < t.n; i++) { const q = [t.P[3 * i], t.P[3 * i + 1], t.P[3 * i + 2]]; if (t.land[i] && ref.some((p) => E.arc(q, p) * E.R < 5)) along += t.pop[i]; }
  return along;
}
{
  const gains = [3, 11, 896933214].map((seed) => { const st = corridor(seed), w0 = run(seed, null), w1 = run(seed, st); return w1 / w0 - 1; });
  const mean = gains.reduce((x, y) => x + y, 0) / gains.length;
  console.log("the loop: people along a line through the home city after 25 years, against none: " + gains.map((g) => "+" + Math.round(100 * g) + "%").join(", ") + " (worlds 3, 11, 896933214)");
  ok(gains.every((g) => g > 0) && mean > 0.12, "a line grows the city along it, in every world: +" + Math.round(100 * mean) + "% on average in 25 years");
}
console.log(fails ? `ecumene loop: ${fails}/${checks} FAILED` : `ecumene loop: ${checks} checks ok`);
process.exit(fails ? 1 : 0);
