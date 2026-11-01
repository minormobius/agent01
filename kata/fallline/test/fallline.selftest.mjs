/* FALL LINE's selftest: the trails, the hill baked under them, the physics of going downhill, the eight levels (every
   way down ridden by the oracle, par and difficulty as stored, getting harder), the made hills, and the Kelvin grain.
     node kata/fallline/test/fallline.selftest.mjs */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), J = (f) => import(path.join(here, "../js", f));
const T = await J("trails.js"), D = await J("descent.js"), L = await J("levels.js"), Gn = await J("gen.js"), K = await J("kelvin.js");
const { DS, G } = await import(path.join(here, "../../tailspin/js/course.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* the trails: frames orthonormal, every trail heading downhill at its grade, forks starting on their parent */
{
  const l = L.LEVELS[5], b = T.buildTrails(l);
  let ortho = 0, fall = 0, forkGap = 0;
  for (const t of b.trails) {
    for (const f of t.fr) ortho = Math.max(ortho, Math.abs(dot(f.T, f.e1)), Math.abs(dot(f.T, f.e2)), Math.abs(dot(f.e1, f.e2)), Math.abs(Math.hypot(...f.T) - 1));
    for (let i = 1; i < t.y.length; i++) fall = Math.max(fall, t.y[i] - t.y[i - 1]);
    if (t.from != null) { const p = b.trails[t.from], q = p.pts[Math.round(t.at / DS)]; forkGap = Math.max(forkGap, Math.hypot(...t.pts[0].map((x, j) => x - q[j])), Math.abs(t.y[0] - p.y[Math.round(t.at / DS)])); }
  }
  ok(ortho < 1e-9, "each trail's frame stays orthonormal");
  ok(fall <= 1e-9, "every trail only ever goes down");
  ok(forkGap < 1e-6, "a fork leaves its parent trail exactly where and as high as it says");
  ok(T.routes(b).length === b.trails.length, `every trail is a way down: ${b.trails.length} routes in "${l.name}"`);
}

/* the hill: level across a trail at the trail's height, the slope bound the ray march trusts, the trails' field */
{
  const l = L.LEVELS[3], b = T.buildTrails(l), B = T.bake(l, b, 1), S = T.sampler(B);
  // away from forks; near one the two trails' benches meet and the faster-falling one cuts a bank below the other
  const clear = (t, p) => b.trails.every((o) => o === t || o.pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > 2 * (b.R + T.SHOULDER)));
  let bench = 0, bank = 0, distErr = 0, n = 0;
  for (const t of b.trails) for (let i = 0; i < t.pts.length; i += 25) {
    const f = t.fr[i], p = t.pts[i]; let w = 0;
    for (const e of [f.e1, f.e2]) for (const s of [-0.8, 0, 0.8]) { const q = p.map((x, j) => x + s * b.R * e[j]); w = Math.max(w, Math.abs(S.height(q) - t.y[i])); }
    if (clear(t, p)) { bench = Math.max(bench, w); n++; } else bank = Math.max(bank, w);
    distErr = Math.max(distErr, S.dist(p));
  }
  ok(bench < 0.12, `across a trail the ground is level, at the trail's height (worst ${bench.toFixed(3)} m over ${n} places clear of a fork)`);
  ok(bank < 1, `where two trails part, the bank between them stays under a metre (${bank.toFixed(2)} m)`);
  ok(distErr < 0.6, `the trails' field reads near zero on every centreline (worst ${distErr.toFixed(2)} m)`);
  const [NX, NZ] = T.HN; let Lmax = 0;
  for (let w = 10; w < 70; w += 3) for (let z = 10; z < 150; z += 3) for (let x = 10; x < 230; x += 3) {
    const e = Math.hypot((x - T.BASIN.c[0]) / T.BASIN.a[0], (z - T.BASIN.c[1]) / T.BASIN.a[1], (w - T.BASIN.c[2]) / T.BASIN.a[2]); if (e > 0.8) continue;
    const i = x + NX * (z + NZ * w), H = B.H; Lmax = Math.max(Lmax, Math.hypot((H[i + 1] - H[i - 1]) / 2, (H[i + NX] - H[i - NX]) / 2, (H[i + NX * NZ] - H[i - NX * NZ]) / 2));
  }
  ok(B.L >= Lmax && B.L <= 3, `the slope bound the march uses (${B.L.toFixed(2)}) is above the steepest slope in the valley (${Lmax.toFixed(2)})`);
  ok(B.tan.length === b.trails.length * (T.BINS + 1) * 4 && B.rows === b.trails.length, "a kerb direction row for every trail");
}

/* downhill: the speed settles where gravity meets rolling and drag; off the trail is slower; a climb doesn't stall */
{
  const g = -0.12, vt = T.terminal(0.12); let v = 1.5; for (let i = 0; i < 60 * 60; i++) v = T.speedStep(v, g, true, 1 / 60);
  ok(Math.abs(v - vt) < 0.02, `on a 12% trail the cat settles at ${v.toFixed(2)} m/s (terminal ${vt.toFixed(2)})`);
  let off = 1.5; for (let i = 0; i < 60 * 60; i++) off = T.speedStep(off, g, false, 1 / 60);
  ok(off < v - 0.5, `off the trail, on grass, slower: ${off.toFixed(2)} m/s`);
  let up = 3; for (let i = 0; i < 60 * 30; i++) up = T.speedStep(up, 0.05, true, 1 / 60);
  ok(up >= T.PHYS.vMin && up < 2.4, `up a 5% rise the cat pedals on at ${up.toFixed(2)} m/s, never stopping`);
  ok(T.terminal(0.015) === 0 && T.terminal(0.06) < T.terminal(0.12), "steeper is faster, and a slope under the rolling resistance coasts to nothing");
}

/* the eight levels: each fits the valley, every way down is ridden, par and difficulty are as stored, and they rise */
{
  const got = [];
  for (const [i, l] of L.LEVELS.entries()) {
    const b = T.buildTrails(l), B = T.bake(l, b, 1), s = D.solve(B);
    const routes = s.routes.map((r) => (r.done ? `${r.time.toFixed(1)} s (${r.score})` : "×")).join(", ");
    ok(b.fit.ok && s.solvable && Math.abs(s.par.time - l.par) < 0.06 && Math.abs(s.score - l.score) < 0.006,
      `level ${i + 1}, ${l.name}: fits (${b.fit.inBasin.toFixed(2)} of the valley), ways down ${routes}; par ${s.par.time.toFixed(1)} s (stored ${l.par}), difficulty ${s.score} (stored ${l.score})`);
    got.push(s.score);
  }
  ok(got.every((s, i) => i === 0 || s > got[i - 1]), `the levels get harder, every one: ${got.join(" < ")}`);
  ok(L.LEVELS.slice(3).every((l) => l.trails.length > 1), "from Fork on, every level has more than one way down");
}

/* made hills: the same seed and tier make the same hill, every one is valid, and harder tiers are harder */
{
  const a = Gn.make(7, 0.5), b = Gn.make(7, 0.5);
  ok(a && b && JSON.stringify(a.trails) === JSON.stringify(b.trails) && a.sol.par.time === b.sol.par.time, "the same seed and tier make the same hill");
  const avg = {};
  for (const [name, t] of Object.entries(Gn.TIERS)) {
    let sum = 0, n = 0, bad = 0;
    for (let s = 1; s <= 4; s++) { const m = Gn.make(500 + s, t); if (!m || !m.sol.solvable || !T.buildTrails(m).fit.ok) { bad++; continue; } sum += m.sol.score; n++; }
    avg[name] = n ? sum / n : NaN; ok(bad === 0, `${name}: four made hills, all fitting and every way down ridden (average difficulty ${avg[name].toFixed(2)})`);
  }
  ok(avg.easy < avg.medium && avg.medium < avg.hard, `harder tiers are harder: ${avg.easy.toFixed(2)} < ${avg.medium.toFixed(2)} < ${avg.hard.toFixed(2)}`);
}

/* the Kelvin grain: Foam⁴'s lattice, copied byte for byte; its cell the size asked; as many relevant vectors as the shader holds */
{
  const mine = fs.readFileSync(path.join(here, "../js/foam.js")), lab = fs.readFileSync(path.join(here, "../../../games/foam4/js/foam.js"));
  ok(mine.equals(lab), "js/foam.js is byte-identical to games/foam4/js/foam.js (edit the lab's and copy it over)");
  const k = K.kelvin(), shader = fs.readFileSync(path.join(here, "../../lean/js/render.js"), "utf8"), m = shader.match(/uRel\[(\d+)\]/);
  let id = 0; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) id = Math.max(id, Math.abs([0, 1, 2, 3].reduce((s, c) => s + k.Binv[i][c] * k.B[j][c], 0) - (i === j ? 1 : 0)));
  ok(id < 1e-9, "Binv inverts the grain's basis");
  // every sampler the shader declares gets its own unit in the constructor (one left on unit 0 next to a sampler of
  // another type makes WebGL refuse every draw: a black view in the pages that never call hill())
  const samplers = [...shader.matchAll(/uniform (?:highp )?u?sampler[23]D ([^;]+);/g)].flatMap((x) => x[1].split(",").map((n) => n.trim()));
  const ctor = shader.slice(shader.indexOf("constructor(canvas)"), shader.indexOf("\n  tex(")), units = {};
  for (const x of ctor.matchAll(/\[(\d+), "(u\w+)"\]/g)) units[x[2]] = +x[1];
  if (/uniform1i\(this\.u\.uBinT, 4\)/.test(ctor)) units.uBinT = 4;
  const us = samplers.map((n) => units[n]);
  ok(samplers.length === 6 && us.every((u) => u != null) && new Set(us).size === us.length, `the renderer gives each of its ${samplers.length} samplers its own unit from the start (${samplers.map((n, i) => n + "→" + us[i]).join(", ")})`);
  ok(m && k.rel.length <= +m[1], `the grain's ${k.rel.length} relevant vectors fit the shader's uRel[${m && m[1]}]`);
}
console.log(`\n${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
