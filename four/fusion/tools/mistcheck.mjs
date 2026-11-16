/* Our aged stars against MIST v1.2's published tracks, mass by mass (papers/p2 section 4; the /star/ widget's card).
     node four/fusion/tools/mistcheck.mjs <dir of evolve-ours-*.json> <set name>:<file tag>:<mist file> …
       e.g. kramers:-X0.687:mist  opal:-X0.7068-Z0.0143-opal-a1.61-s1e6:mist  free-opal:-X0.751-Z1.43e-6-opal-a1.61-s1e6:mist-m4
     → papers/p2/data/mistcheck.json
   For each set and mass: the zero-age star (L, R, Teff, Tc), the star when the centre's hydrogen is half gone, and the
   main-sequence life to a central hydrogen of 10⁻³ (MIST's rows interpolated in log Xc; MIST's own end, EEP 454, is
   Xc 10⁻⁴), each as ours over MIST. MIST includes diffusion and overshoot; ours has neither. */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const [dir, ...sets] = process.argv.slice(2);
if (!dir || !sets.length) { console.error("usage: mistcheck.mjs <dir> <name>:<tag>:<mist file> …"); process.exit(1); }
const LSUN = 3.828e26, RSUN = 6.957e8;
/* a track's value at central hydrogen Xc = x (rows ordered in time, Xc falling), by log Xc */
const atXc = (rows, x, key) => { for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i]; if (a.Xc >= x && b.Xc <= x && a.Xc > b.Xc) { const t = (Math.log(a.Xc) - Math.log(x)) / (Math.log(a.Xc) - Math.log(b.Xc)); return a[key] * (1 - t) + b[key] * t; } } return null; };
const out = { about: "fusion/tools/mistcheck.mjs: ours (atom/tools/evolve.mjs) against MIST v1.2 (papers/p2/data/mist*.json), each ratio ours/MIST. zams: the first model after settling; half: when the centre's hydrogen is half its start; life: the age at central hydrogen 10⁻³. Ours has no diffusion and no overshoot.", sets: {} };
for (const spec of sets) {
  const [name, tag, mfile] = spec.split(":"), M = JSON.parse(readFileSync(new URL(`../../papers/p2/data/${mfile}.json`, import.meta.url), "utf8")), set = { tag, mist: mfile, feh: M.feh ?? "+0.00", stars: {} };
  for (const f of readdirSync(dir).filter((x) => x.startsWith("evolve-ours-") && x.endsWith(`${tag}.json`) && /^[\d.]+$/.test(x.slice(12, -tag.length - 5)))) {
    const run = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")), mt = M.tracks[String(run.m)]; if (!mt) continue;
    const ours = run.track.map((r) => ({ t: r.tGyr, L: r.L / LSUN, R: r.R / RSUN, Teff: r.Teff, Tc: r.Tc, Xc: r.Xc })), X0 = ours[0].Xc, MX0 = mt.rows[0].Xc;
    const z = ours[0], mz = mt.rows[0], half = (rows, x0, k) => atXc(rows, x0 / 2, k), life = atXc(ours, 1e-3, "t"), mlife = atXc(mt.rows, 1e-3, "t");
    const row = { stopped: run.stopped, zams: { L: z.L, R: z.R, Teff: z.Teff, Tc: z.Tc, mist: { L: mz.L, R: mz.R, Teff: mz.Teff, Tc: mz.Tc } },
      half: Object.fromEntries(["t", "L", "R", "Teff"].map((k) => [k, half(ours, X0, k)])), mistHalf: Object.fromEntries(["t", "L", "R", "Teff"].map((k) => [k, half(mt.rows, MX0, k)])), life, mistLife: mlife };
    row.ratio = { zamsL: z.L / mz.L, zamsR: z.R / mz.R, zamsTeff: z.Teff / mz.Teff, halfL: row.half.L / row.mistHalf.L, halfR: row.half.R / row.mistHalf.R, halfTeff: row.half.Teff / row.mistHalf.Teff, halfT: row.half.t / row.mistHalf.t, life: life && mlife ? life / mlife : null };
    for (const k in row.ratio) if (row.ratio[k] != null) row.ratio[k] = +row.ratio[k].toFixed(4);
    set.stars[run.m] = row;
    const r = row.ratio; console.log(`${name} ${run.m} M☉: ZAMS L ${r.zamsL} R ${r.zamsR} Teff ${r.zamsTeff}; half-H L ${r.halfL} R ${r.halfR} Teff ${r.halfTeff} age ${r.halfT}; life ${r.life} (${run.stopped})`);
  }
  out.sets[name] = set;
}
writeFileSync(new URL("../../papers/p2/data/mistcheck.json", import.meta.url), JSON.stringify(out, null, 1));
console.log("wrote papers/p2/data/mistcheck.json");
