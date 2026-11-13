/* Window C (paper 2): do 4D stars live long, and what does a star that does burn? Reads the main sequences that burn by
   the network's own energy law (atom/tools/mainseq.mjs net …, files net-<G>-<s>-<mass>-ff<ff>.json in a directory) and
   for each gravity G, strength s and mass model:
     · every star's core hydrogen half-life t½ at its central T and ρ (the table fusion/eps4.json, computed by the network)
     · the star whose core halves in 4.6 Gyr (our Sun's centre's pace, the convention it replaces): its mass, by
       interpolating ln t½ in ln M between the two stars around it, and its central T, ρ, luminosity and surface
     · that star's centre burnt through the network to the end of its hydrogen at its own T and ρ (the run windows4 does
       at the convention's temperature and the network's reference density): helium, helium-3 or past helium
     · the longest-lived star computed and the most massive one that still halves its core in 4.6 Gyr
   Writes papers/p2/data/lifetimes.json.
     node four/fusion/tools/lifetimes4.mjs <dir of net-*.json> [ALT=<a copy of four/ baked under MASS=grid>] */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { logRate, KB_MEV, gamow } from "../../atom/js/stars.js";

const dir = process.argv[2]; if (!dir) throw new Error("usage: lifetimes4.mjs <dir of net-*.json>");
const YR = 3.15576e7, GYR = 1e9 * YR, PACE = 4.6 * GYR, X0 = { "1-1": 0.75, "2-4": 0.25 };
const AMU = 931.494, HBC = 197.327, MU = 1.66053906660e-27, C = 2.99792458e8, AL = 1 / 137.035999;
const op = (d, Z1, A1, Z2, A2, r0) => ({ Z1, Z2, mu: ((A1 * A2) / (A1 + A2)) * AMU, rn: r0 * (A1 ** (1 / d) + A2 ** (1 / d)), d }), pp3 = op(3, 1, 1, 1, 1, 1.2);
const St3 = (S, E, o) => { const eta = o.Z1 * o.Z2 * AL * Math.sqrt(o.mu / (2 * E)), k2 = (2 * o.mu * E) / HBC ** 2; return ((S / 1000) * 100 / E) * Math.exp(-2 * Math.PI * eta) * k2 * Math.exp(gamow(E, o)); };
const SPP = St3(4.01e-22, 0.01, pp3), opp4 = { ...op(4, 1, 1, 1, 1, 1.0), rn: 4 };
const svpp = (T, f) => { const kT = KB_MEV * T; return ((SPP * f * C * HBC ** 3 * 1e-45) / (2 * opp4.mu ** 2 * kT * kT)) * Math.exp(logRate(T, opp4)); };
// each mass model's network, as eps4.mjs reaches it (the same ρ_ref(T))
const here = new URL("../../..", import.meta.url).pathname.replace(/\/$/, ""), NETS = {};
async function net(mass) {
  if (NETS[mass]) return NETS[mass];
  const base = mass === "ladder" ? here : process.env.ALT; if (!base) return null;
  const { model } = await import(`${base}/four/fusion/js/net4.js`), { NET4, TGRID } = await import(`${base}/four/fusion/data4.js`);
  return (NETS[mass] = { model, NET4, TGRID });
}
async function burn(mass, s, T, rho) {
  const N = await net(mass); if (!N) return null; const M = N.NET4[s], m = N.model(s), rx = M.reactions.find((r) => r.r.join() === "1-1,1-1" && r.p.join() === "1-2");
  const lt = Math.log(T), g = N.TGRID.map(Math.log); let i = 0; while (i < g.length - 2 && g[i + 1] < lt) i++; const f = (lt - g[i]) / (g[i + 1] - g[i]);
  const k = Math.exp(Math.log(rx.k[i]) * (1 - f) + Math.log(rx.k[i + 1]) * f), rhoRef = (MU * k) / svpp(T, M.ppx * (M.weak?.ppR ?? 1));
  const r = m.run({ T, rhoX: rho / rhoRef, X0, fuel: "1-1", until: 1e-3, tmax: 1e23 }), X = m.toX(r.Y);
  const he4 = X[m.idx["2-4"]], he3 = X[m.idx["2-3"]], past = m.species.reduce((t, x, j) => t + (x.A >= 8 ? X[j] : 0), 0), left = X[m.idx["1-1"]];
  const kind = left > 0.5 ? "unburnt" : he3 > 0.5 ? "helium-3" : he4 > 0.5 ? "helium" : past > 0.5 ? "past helium" : "mixed";
  const top = m.species.map((x, j) => [x.key, +X[j].toFixed(3)]).sort((p, q) => q[1] - p[1]).slice(0, 3);
  return { kind, he4: +he4.toFixed(3), he3: +he3.toFixed(3), past: +past.toFixed(3), top, t: r.t / GYR };
}

const files = readdirSync(dir).filter((f) => /^net-.*\.json$/.test(f)), out = [];
for (const f of files) {
  const R = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); if (!R.rows?.length) { out.push({ G: R.Grel, s: R.s, mass: R.mass, fail: R.fail ?? "no stars" }); continue; }
  const rows = R.rows.filter((r) => r.th != null).sort((a, b) => a.m - b.m), longest = R.rows.reduce((a, b) => ((b.th ?? Infinity) > (a.th ?? Infinity) ? b : a));
  // the pace star: t½ falls with mass, so find the pair that brackets 4.6 Gyr
  let pace = null; for (let i = 0; i + 1 < rows.length; i++) { const a = rows[i], b = rows[i + 1];
    if ((a.th - PACE) * (b.th - PACE) <= 0) { const w = Math.log(PACE / a.th) / Math.log(b.th / a.th), li = (x, y) => Math.exp(Math.log(x) * (1 - w) + Math.log(y) * w);
      pace = { m: li(a.m, b.m), Tc: li(a.Tc, b.Tc), rhoc: li(a.rhoc, b.rhoc), L: li(a.L, b.L), Teff: li(a.Teff, b.Teff), R: li(a.R, b.R) }; break; } }
  if (pace) pace.burn = await burn(R.mass, R.s, pace.Tc, pace.rhoc);
  const e = { G: R.Grel, s: R.s, mass: R.mass, ff: R.ff, Mch: R.Mch, stars: R.rows.map((r) => ({ m: r.m, Tc: r.Tc, rhoc: r.rhoc, L: r.L, Teff: r.Teff, thGyr: r.th == null ? null : r.th / GYR })),
    pace, longest: { m: longest.m, thGyr: longest.th == null ? null : longest.th / GYR }, mMin: R.rows[0].m, mMax: R.rows.at(-1).m };
  out.push(e);
  console.log(`G ${R.Grel} s ${R.s} ${R.mass}: ${R.rows.length} stars ${e.mMin}–${e.mMax} M_Ch; ${pace ? `4.6-Gyr core at ${pace.m.toFixed(2)} M_Ch, ${(pace.Tc / 1e6).toFixed(1)} MK, ρ ${pace.rhoc.toExponential(1)} kg/m⁴, Teff ${pace.Teff.toFixed(0)} K → ${pace.burn?.kind ?? "?"} ${pace.burn ? JSON.stringify(pace.burn.top) : ""}` : "no star's core halves in 4.6 Gyr in the range computed"}`);
}
out.sort((a, b) => b.G - a.G || a.s - b.s || String(a.mass).localeCompare(String(b.mass)));
mkdirSync(new URL("../../papers/p2/data/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../papers/p2/data/lifetimes.json", import.meta.url), JSON.stringify({ about: "fusion/tools/lifetimes4.mjs: 4D main sequences burning by the network (mainseq.mjs net), per G, s, mass model: each star's core hydrogen half-life; the star whose core halves in 4.6 Gyr, and what its centre burns to at its own T and rho", runs: out }));
console.log(`wrote papers/p2/data/lifetimes.json (${out.length} sequences)`);
