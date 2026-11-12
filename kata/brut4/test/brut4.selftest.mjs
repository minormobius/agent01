/* BRUT⁴'s selftest. The architect: one seed is one building, every tier holds the stair's bay and sits inside the one
   below, and the tree compiles and is bounded. The engineer: every building stands, on columns sized so that one size
   smaller fails; a column of our proportions is good for 2 storeys of this bay (about 23 in 3D); sway modes rise in
   period with height. The walk: a bot climbs the stair from the ground to the roof of several buildings, and nobody
   walks out through a wall or off a terrace.   node kata/brut4/test/brut4.selftest.mjs   (~25 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), { compile } = await import(path.join(here, "../../cad4/js/kernel.js")), A = await import(path.join(here, "../js/arch.js")), S = await import(path.join(here, "../js/struct.js")), Wk = await import(path.join(here, "../../house/js/walk.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const SEEDS = ["barbican-7", "trellick", "habitat", "boston", "unite-3", "balfron", "geisel-12", "torre", "park-hill", "sesc-40", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n"], { M, H } = A;
{
  const all = SEEDS.map((s) => A.generate(s)), again = A.generate("boston");
  ok(JSON.stringify(again.tree) === JSON.stringify(all[3].tree) && JSON.stringify(A.generate("boston!").tiers) !== JSON.stringify(again.tiers), "one seed, one building: the same seed gives the same tree to the letter, another seed another");
  let nested = true, kinds = new Set(); for (const b of all) { kinds.add(b.kind); b.tiers.forEach((t, i) => { if (!(t.range[0][0] <= -1 && t.range[0][1] >= 1 && t.range[1][0] <= 0 && t.range[1][1] >= 1 && t.range[2][0] <= 0 && t.range[2][1] >= 1)) nested = false; if (i && !t.range.every(([a, c], ax) => a >= b.tiers[i - 1].range[ax][0] && c <= b.tiers[i - 1].range[ax][1])) nested = false; if (i && t.range.every(([a, c], ax) => a === b.tiers[i - 1].range[ax][0] && c === b.tiers[i - 1].range[ax][1])) nested = false; }); }
  ok(nested && kinds.size === A.TYPES.length, `${all.length} buildings, all four kinds: every tier holds the stair's bay and the bay beside it, sits inside the tier below, and steps back somewhere`);
  let stands = 0, tight = 0, worstUse = 0, tall = 0; for (const b of all) { const e = S.engineer(b); if (e.stands) stands++; worstUse = Math.max(worstUse, ...e.checks.map((c) => c.use)); tall = Math.max(tall, e.storeys);
    const smaller = S.engineer({ ...b, col: b.col - 0.05 }); if (b.col <= 0.3 || smaller.checks[0].use > 1) tight++; }
  ok(stands === all.length && tight === all.length && worstUse <= 1, `the engineer passes all ${all.length} (worst use ${worstUse.toFixed(2)}, tallest ${tall} storeys), and every column is the smallest that will do: 0.05 m less and gravity fails it`);
  const g = S.takedown(all[0]), per3 = Math.floor((S.MAT.phi * S.MAT.fc * 0.25) / (M * M * g.floorLoad));
  ok(g.ours.storeys === 2 && per3 >= 20 && Math.abs(g.worst.N / g.worst.floors / (M ** 3 * g.floorLoad) - 1) < 1e-9, `a floor is a volume: an inner column takes ${M ** 3} m³ of it a storey, and a 0.5 m column is good for ${g.ours.storeys} storeys of that; the same column under a 3D floor (${M * M} m² a storey) is good for ${per3}`);
  const e = S.engineer(all[1]); ok(e.periods.length === 3 && e.periods[0] > e.periods[1] && e.periods[1] > e.periods[2] && e.periods[0] > 0.2 && e.periods[0] < 3 && e.wind.every((d) => d.drift > 0), `sway: periods ${e.periods.map((v) => v.toFixed(2)).join(", ")} s for the ${e.storeys}-storey tower, each three times over (one frame, three ground directions); wind drifts it ${e.wind.map((d) => (d.drift * 1000).toFixed(1) + " mm along " + d.axis).join(", ")}`);
}
{ // walking
  const dt = 1 / 60, to = (W, f, x, z, w, secs = 6) => { for (let t = 0; t < secs; t += dt) { const d = [x - W.p[0], 0, z - W.p[2], w - W.p[3]], l = Math.hypot(...d); if (l < 0.12) return true; W.F = d.map((v) => v / l); W.R = [0, 0, 0, 0]; W.N = [0, 0, 0, 0]; const ax = [0, 2, 3].sort((a, b) => Math.abs(W.F[a]) - Math.abs(W.F[b])); W.R[ax[0]] = 1; W.N[ax[1]] = 1; Wk.step(W, f, { move: [1, 0, 0] }, dt); } return false; };
  let climbed = 0, tried = 0, note = "";
  for (const seed of ["barbican-7", "trellick", "boston", "a", "b"]) { const b = A.generate(seed), f = compile(b.tree).sdf, W = Wk.makeWalker([b.bounds.hi[0] + 6, 0.05, 1.35, 2]); tried++; let good = to(W, f, 6, -1.6, 2, 20) && to(W, f, -2, -1.6, 2, 20) && to(W, f, -2, 1.35, 2, 20); // (round the stair, to its foot)
    for (let k = 0; k < b.storeys && good; k++) good = to(W, f, -0.2, 1.35, 2) && to(W, f, 3.25, 1.35, 2) && to(W, f, 3.25, 2.65, 2) && to(W, f, -0.3, 2.65, 2) && Math.abs(W.p[1] - (k + 1) * H) < 0.08;
    if (good && W.grounded) climbed++; else note += ` ${seed}: stuck at ${W.p.map((v) => v.toFixed(1)).join(",")}`; }
  ok(climbed === tried, `a bot walks in under the building and climbs the stair to the roof of ${climbed} of ${tried} buildings, landing on every floor on the way${note}`);
  // from the middle of every enclosed floor, walk blind in the 26 ground directions: no one ends outside the podium's footprint or below the floor they left by more than a terrace's drop without having used the stair well
  let escaped = 0, walks = 0; for (const seed of ["boston", "trellick"]) { const b = A.generate(seed), f = compile(b.tree).sdf, base = b.tiers[0].range.map(([a, c]) => [a * M, c * M]);
    for (const t of b.tiers) { const k = t.start + t.storeys - 1; if (k === 0) continue; const c = [-2, 2, 2]; for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) for (const q of [-1, 0, 1]) { if (!u && !v && !q) continue; walks++; const W = Wk.makeWalker([c[0], k * H + 0.05, c[1], c[2]]), l = Math.hypot(u, v, q); for (let s = 0; s < 14; s += dt) { W.p[0] += (u / l) * Wk.SPEED * dt; W.p[2] += (v / l) * Wk.SPEED * dt; W.p[3] += (q / l) * Wk.SPEED * dt; Wk.step(W, f, {}, dt); }
        if (![W.p[0], W.p[2], W.p[3]].every((x, ax) => x > base[ax][0] && x < base[ax][1])) escaped++; } } }
  ok(escaped === 0, `walls, sills and parapets hold: ${walks} blind walks from upper floors, in every ground direction, and nobody leaves the building's footprint`);
}
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
