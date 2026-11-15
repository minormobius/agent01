/* Paper 2's surface test (Carter's, made 4D): does a Sun-like 4D star stir its outer layers? For every 4D main sequence
   (mainseq.mjs net files in <dir>: window C's and run gravity-1's), every star cooler than 7000 K and every Sun analogue
   (papers/p2/data/gravity.json) gets its envelope from atom/js/surface.js (Saha gas, ∇_ad, Rosseland opacity, the
   Schwarzschild criterion): the neutral fraction at its photosphere and its deepest convective zone. Per sequence: the
   heaviest star with a zone of ≥ 1e-6 of its mass, against the analogue's mass. Writes papers/p2/data/surface.json.
     node four/fusion/tools/surface4.mjs <dir of net-*.json>      (~1.5 h in the sandbox; a runner job if rerun often) */
import * as S from "../../atom/js/surface.js";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const dir = process.argv[2], G0 = 6.6743e-11, w = S.world(4), out = [];
const D = JSON.parse(readFileSync(new URL("../../papers/p2/data/gravity.json", import.meta.url)));
for (const f of readdirSync(dir)) { const R = JSON.parse(readFileSync(`${dir}/${f}`)); if (!R.rows?.length) continue;
  const stars = R.rows.filter((r) => r.Teff < 7000).sort((a, b) => a.m - b.m), res = [];
  for (const st of stars) { try { const e = w.envelope({ M: st.M, R: st.R, L: st.L, G: G0 * R.Grel, Tstop: 2e6, rStop: 0.05 }), ph = e.rows.find((x) => x.T >= e.Teff), z = e.zones.reduce((a, b) => (b.mass > (a?.mass ?? -1) ? b : a), null);
      res.push({ m: st.m, Teff: st.Teff, neutral: 1 - w.state(ph.T, ph.rho).xH, mass: z?.mass ?? 0, rBot: z?.rBot ?? 1, open: z?.open ?? false }); }
    catch (err) { res.push({ m: st.m, Teff: st.Teff, error: String(err.message).slice(0, 80) }); } }
  const sun = D.runs.find((x) => x.G === R.Grel && x.s === R.s)?.sun;
  let sunEnv = null; if (sun) { const e = w.envelope({ M: sun.Mkg, R: sun.R, L: sun.L, G: G0 * R.Grel }), ph = e.rows.find((x) => x.T >= e.Teff), z = e.zones.reduce((a, b) => (b.mass > (a?.mass ?? -1) ? b : a), null);
    sunEnv = { Teff: e.Teff, neutral: 1 - w.state(ph.T, ph.rho).xH, rhoPh: ph.rho, mass: z?.mass ?? 0, rBot: z?.rBot ?? 1 }; }
  out.push({ G: R.Grel, s: R.s, sunM: sun?.m ?? null, sunTeff: sun?.Teff ?? null, sunEnv, stars: res });
  const conv = res.filter((x) => x.mass > 1e-6), mc = conv.length ? Math.max(...conv.map((x) => x.m)) : null;
  console.log(`G ${R.Grel} s ${R.s}: ${res.length} stars < 7000 K; heaviest with an envelope zone ≥ 1e-6 M: ${mc ?? "none"}${mc && sun ? ` (Sun analogue ${sun.m.toFixed(2)} M_Ch, ratio ${(sun.m / mc).toFixed(1)})` : ""}${res.some((x) => x.error) ? ` [${res.filter((x) => x.error).length} errors]` : ""}`); }
writeFileSync(new URL("../../papers/p2/data/surface.json", import.meta.url), JSON.stringify({ about: "fusion/tools/surface4.mjs: per 4D main sequence (G × ours, s), every star under 7000 K and the Sun analogue: the neutral fraction of hydrogen at the photosphere and the deepest convective zone (mass fraction, r_bot/R), from atom/js/surface.js", runs: out }));
