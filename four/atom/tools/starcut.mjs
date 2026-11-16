/* The star cutaway's data (four/star/): every computed main-sequence star, ours and 4D, with its layers at their real
   radii. From each star's compact interior (mainseq.mjs keeps 40 points: r/R, m/M, T, ρ, L/L, the actual gradient):
     · where the light is made: the radii holding 50% and 90% of the luminosity;
     · the convective core: out to where the gradient first falls below the adiabatic one (2/(d + 2));
     · the radiative zone between;
   and from atom/js/surface.js (the paper's surface test, ours checked against Bell & Berrington and Pols) the outer
   convective zones near the photosphere, their top and bottom radii and the mass they hold; the photosphere's colour by
   each world's blackbody (lumen/js/optics.js starColour, ν^d). 4D's Sun analogue per gravity and strength is marked from
   papers/p2/data/gravity.json. No star here has aged: every one is zero-age.
     node four/atom/tools/starcut.mjs bake <ours.json> <dir of 4D net-*.json>   → **generated** four/star/data.js (~20 min)
     node four/atom/tools/starcut.mjs aged <dir of evolve-*.json> [ours' file tag, -X0.687]   → **generated** four/star/aged.js (minutes) */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import * as S from "../js/surface.js";
import { starColour } from "../../lumen/js/optics.js";
import { rhoOf, teff } from "../js/mainseq.js";
import * as NET3 from "../../fusion/js/net.js";

const MSUN = 1.98847e30, G0 = 6.6743e-11, GYR = 3.15576e16, LSUN = 3.828e26;
const surf = { 3: S.world(3, { hm: 1 }), 4: S.world(4, { hm: 1 }) };
function layers(d, st, M, G) {
  const p = st.prof, gad = 2 / (d + 2); let cc = 0;
  for (const q of p) { if (q.nab != null && q.nab >= 0.98 * gad) cc = q.x + 0.5 / 40; else break; }
  const at = (frac) => { for (let i = 1; i < p.length; i++) if (p[i].l >= frac) { const a = p[i - 1], b = p[i]; return a.x + ((frac - a.l) / (b.l - a.l || 1)) * (b.x - a.x); } return 1; };
  let env = null, envNote = null;
  try { const e = surf[d].envelope({ M, R: st.R, L: st.L, G, Tstop: 3e6, rStop: 0.3 }); env = e.zones.filter((z) => z.mass > 0).map((z) => ({ top: +z.rTop.toFixed(5), bot: +z.rBot.toFixed(5), mass: +z.mass.toPrecision(3), Ttop: Math.round(z.Ttop), Tbot: Math.round(z.Tbot), deep: z.mass > 0.3 || z.open })); }
  catch (err) { envNote = "outside the surface model (a photosphere too dense for it: no molecules)"; }
  return { cc: +cc.toFixed(4), b50: +at(0.5).toFixed(4), b90: +at(0.9).toFixed(4), env, envNote };
}
function starOf(d, st, unitMass, G, extra = {}) {
  const M = st.M ?? st.m * unitMass, L = layers(d, st, M, G), col = starColour(st.Teff, d);
  return { m: +st.m.toPrecision(4), Mkg: M, R: +st.R.toPrecision(4), L: +st.L.toPrecision(4), Teff: Math.round(st.Teff), Tc: Math.round(st.Tc), rhoc: st.rhoc ? +st.rhoc.toPrecision(3) : null,
    thGyr: st.th == null ? null : +(st.th / GYR).toPrecision(3), qcc: +(st.qcc ?? 0).toFixed(3), colour: col, layers: L,
    prof: st.prof.filter((_, i) => i % 2 === 1).map((q) => [q.x, +Math.log10(q.T).toFixed(3), q.rho > 0 ? +Math.log10(q.rho).toFixed(3) : null, +q.l.toFixed(4), q.nab]), ...extra };
}
/* aged stars (atom/tools/evolve.mjs): each kept profile as a star object like starOf's, its layers read off the run's own
   stirred flags (the central run of stirred shells is the convective core) and its light, the outer zones from
   surface.js as above; the prof rows carry the shell's hydrogen too. Each track carries its own summary (L, Teff, the
   centre) and, for ours, MIST's track at the same mass (papers/p2/data/mist.json) as the published yardstick. */
function agedStar(d, G, M, unit, snap, compX) {
  const rows = snap.rows, gad = 2 / (d + 2), R = snap.R, L = snap.L, Teff = teff(d, { L, R });
  let cc = 0; for (const q of rows) { if (q.stir) cc = q.r; else break; }
  const at = (frac) => { for (let i = 1; i < rows.length; i++) if (rows[i].l >= frac) { const a = rows[i - 1], b = rows[i]; return a.r + ((frac - a.l) / (b.l - a.l || 1)) * (b.r - a.r); } return 1; };
  let qcc = 0; for (const q of rows) { if (q.stir) qcc = q.q; else break; }
  let env = null, envNote = null;
  try { const e = surf[d].envelope({ M, R, L, G, Tstop: 3e6, rStop: 0.3 }); env = e.zones.filter((z) => z.mass > 0).map((z) => ({ top: +z.rTop.toFixed(5), bot: +z.rBot.toFixed(5), mass: +z.mass.toPrecision(3), Ttop: Math.round(z.Ttop), Tbot: Math.round(z.Tbot), deep: z.mass > 0.3 || z.open })); }
  catch (err) { envNote = "outside the surface model (a photosphere too dense for it: no molecules)"; }
  return { m: unit, Mkg: M, R: +R.toPrecision(4), L: +L.toPrecision(4), Teff: Math.round(Teff), Tc: Math.round(rows[0].T), rhoc: +rows[0].rho.toPrecision(3), thGyr: null, qcc: +qcc.toFixed(3), colour: starColour(Teff, d),
    t: +snap.tGyr.toPrecision(4), Xc: +rows[0].H.toPrecision(3), layers: { cc: +cc.toFixed(4), b50: +at(0.5).toFixed(4), b90: +at(0.9).toFixed(4), env, envNote },
    prof: rows.filter((q) => q.r > 0).map((q) => [+q.r.toFixed(4), +Math.log10(q.T).toFixed(3), q.rho > 0 ? +Math.log10(q.rho).toFixed(3) : null, +q.l.toFixed(4), q.stir ? +gad.toFixed(4) : null, +q.H.toFixed(4)]) };
}
function agedTrack(d, G, unitMass, m, run, ref) {
  const M = m * unitMass, snaps = run.profiles.slice().sort((a, b) => a.tGyr - b.tGyr).filter((p, i, a) => i === 0 || p.tGyr - a[i - 1].tGyr > 1e-6).map((p) => agedStar(d, G, M, m, p));
  const tr = run.track, step = Math.max(1, Math.floor(tr.length / 150));
  return { m, X0: run.X0 ?? 0.75, stopped: run.stopped, tEnd: +tr.at(-1).tGyr.toPrecision(4), snaps,
    track: tr.filter((_, i) => i % step === 0 || i === tr.length - 1).map((r) => ({ t: +r.tGyr.toPrecision(5), L: +r.L.toPrecision(4), Teff: Math.round(r.Teff), Tc: +r.Tc.toPrecision(4), Xc: +r.Xc.toPrecision(4), qcc: +r.qcc.toFixed(3) })), ref };
}
if (process.argv[2] === "aged") {
  // node four/atom/tools/starcut.mjs aged <dir of evolve-*.json>   → **generated** four/star/aged.js
  const dir = process.argv[3], tag = process.argv[4] ?? "-X0.687", files = readdirSync(dir), MIST = JSON.parse(readFileSync(new URL("../../papers/p2/data/mist.json", import.meta.url), "utf8")), out = { about: "generated by four/atom/tools/starcut.mjs aged: stars aged by atom/tools/evolve.mjs, each kept profile with its layers at real radii (r/R), and for ours MIST v1.2's track at the same mass as the published yardstick (papers/p2/data/mist.json)", mist: { X: MIST.X, Y: MIST.Y, Z: MIST.Z, about: MIST.about }, ours: {}, four: {} };
  for (const f of files.filter((x) => x.startsWith("evolve-ours-") && x.endsWith(`${tag}.json`) && /^evolve-ours-[\d.]+-/.test(x) && x.slice(12, -tag.length - 5).match(/^[\d.]+$/))) { const run = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")), m = run.m, mt = MIST.tracks[String(m)];
    if (!run.profiles?.length) continue; const ref = mt ? { name: "MIST v1.2", mistM: mt.mistM, tmsGyr: mt.tmsGyr, rows: mt.rows.map((r) => ({ t: r.t, L: r.L * LSUN, Teff: r.Teff, Tc: r.Tc, Xc: r.Xc, qcc: +(r.Mcc / mt.mistM).toFixed(3) })) } : null;
    out.ours[m] = agedTrack(3, G0, MSUN, m, run, ref); console.log(`ours ${m} M☉: ${out.ours[m].snaps.length} snapshots to ${out.ours[m].tEnd} Gyr (${run.stopped})${ref ? `; MIST ${ref.tmsGyr} Gyr` : ""}`); }
  for (const f of files.filter((x) => /^evolve-four-/.test(x) && !/ckpt|-to/.test(x))) { const run = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); if (!run.profiles?.length) continue;
    ((out.four[run.Grel] ??= {})[run.s] ??= {})[+run.m.toPrecision(4)] = agedTrack(4, G0 * run.Grel, run.Mch, +run.m.toPrecision(4), run, null); console.log(`4D G ${run.Grel} s ${run.s} ${run.m.toPrecision(4)} M_Ch: ${run.profiles.length} snapshots (${run.stopped})`); }
  writeFileSync(new URL("../../star/aged.js", import.meta.url), `// generated by four/atom/tools/starcut.mjs aged — stars aged by atom/tools/evolve.mjs, with MIST's tracks for ours (four/star/)\nexport const AGED = ${JSON.stringify(out)};\n`);
  console.log("wrote four/star/aged.js");
}
if (process.argv[2] === "bake") {
  const t0 = Date.now(), ours = JSON.parse(readFileSync(process.argv[3], "utf8")).filter((r) => r.prof && r.m <= 10).sort((a, b) => a.m - b.m);
  // ours' core clocks: each zero-age centre burnt by REACLIB at fixed T, ρ to half its hydrogen (as lifetimes4 does for the Sun)
  for (const r of ours) { const rho = rhoOf(3, r.Pc, r.Tc, { X: 0.7, Y: 0.28, Z: 0.02 }) / 1000; r.rhoc = rho * 1000; try { r.th = NET3.run({ T: r.Tc, rho, X0: NET3.SUN_X, fuel: "p", until: 0.5, tmax: 1e22, maxSteps: 6000 }).t; } catch { r.th = null; } }
  const out = { about: "generated by four/atom/tools/starcut.mjs bake: zero-age main-sequence stars, ours and 4D, with their layers at real radii (r/R) and their photospheres' colours. 4D masses are in Chandrasekhar masses at that gravity; ours in solar masses.", ours: { unit: "M☉", stars: ours.map((r) => starOf(3, r, MSUN, G0)) }, four: {} };
  console.log(`ours: ${out.ours.stars.length} stars (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  const GR = JSON.parse(readFileSync(new URL("../../papers/p2/data/gravity.json", import.meta.url), "utf8")).runs, dir = process.argv[4];
  for (const f of readdirSync(dir).filter((x) => /^net-.*-ladder-ff1\.json$/.test(x))) { const R = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); if (!R.rows?.length || !R.rows[0].prof) continue;
    const sun = GR.find((x) => x.G === R.Grel && x.s === R.s)?.sun, G = G0 * R.Grel;
    (out.four[R.Grel] ??= {})[R.s] = { Mch: R.Mch, sunM: sun ? +sun.m.toPrecision(4) : null, sunKind: sun?.kind ?? null, stars: R.rows.slice().sort((a, b) => a.m - b.m).map((r) => starOf(4, r, R.Mch, G)) };
    console.log(`4D G ${R.Grel} s ${R.s}: ${R.rows.length} stars (${((Date.now() - t0) / 1000).toFixed(0)} s)`); }
  writeFileSync(new URL("../../star/data.js", import.meta.url), `// generated by four/atom/tools/starcut.mjs bake — zero-age stars with their layers (four/star/)\nexport const STARS = ${JSON.stringify(out)};\n`);
  console.log("wrote four/star/data.js");
}
