/* MIST's published tracks (Choi et al. 2016, Dotter 2016; v1.2, [Fe/H] = 0, [α/Fe] = 0, non-rotating), the yardstick our
   aged stars are judged against (papers/p2 section 4; the /star/ widget's comparison line). Reads the EEP track files of
   MIST_v1.2_feh_p0.00_afe_p0.0_vvcrit0.0_EEPS.txz (waps.cfa.harvard.edu/MIST, packaged model grids) and keeps, for each
   mass, the main sequence (EEP 202, the zero-age main sequence, to 454, the terminal-age main sequence) sampled to ~60
   points: age since the ZAMS, L, Teff, R, the centre's T, ρ and hydrogen, the convective core's mass, and the pp and CNO
   shares of the burning. An extract for comparison, cited, not the grid itself.
     node four/fusion/tools/mist.mjs <dir of *.track.eep>   → papers/p2/data/mist.json */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const dir = process.argv[2], MASSES = [0.6, 0.8, 1.0, 1.25, 1.6, 2.0, 3.0], out = { about: "MIST v1.2 tracks ([Fe/H] = 0, [α/Fe] = 0, v/v_crit = 0; Choi et al. 2016, Dotter 2016), main sequence only (EEP 202–454), sampled by four/fusion/tools/mist.mjs from the packaged EEP files at waps.cfa.harvard.edu/MIST. Ages in Gyr since the ZAMS; L, R in solar units; T in K; ρ in g/cm³; Mcc in M☉. MIST includes element diffusion, convective overshoot, OPAL opacities and a mixing-length envelope; ours has none of the first two.", tracks: {} };
for (const m of MASSES) {
  // the grid's nearest mass (it steps 0.02 M☉ here, so 1.25 is taken from 1.24 or 1.26; recorded as mistM)
  const f = readdirSync(dir).filter((x) => /^\d{5}M\.track\.eep$/.test(x)).reduce((a, x) => (Math.abs(+x.slice(0, 5) / 100 - m) < Math.abs(+a.slice(0, 5) / 100 - m) ? x : a)), mistM = +f.slice(0, 5) / 100;
  const L = readFileSync(`${dir}/${f}`, "utf8").split("\n"), hdr = L[4].replace(/^#/, "").trim().split(/\s+/).map(Number), cols = L.find((l) => /star_age/.test(l)).replace(/^#/, "").trim().split(/\s+/), ix = Object.fromEntries(cols.map((c, i) => [c, i]));
  const rows = L.filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.trim().split(/\s+/).map(Number)), ms = rows.slice(201, 454), a0 = ms[0][ix.star_age], step = Math.max(1, Math.floor(ms.length / 60));
  out.Y = hdr[0]; out.Z = hdr[1]; out.X = +(1 - hdr[0] - hdr[1]).toFixed(4);
  out.tracks[m] = { mistM, tmsGyr: +((ms.at(-1)[ix.star_age] - a0) / 1e9).toPrecision(5), rows: ms.filter((_, i) => i % step === 0 || i === ms.length - 1).map((r) => ({ t: +((r[ix.star_age] - a0) / 1e9).toPrecision(5), L: +(10 ** r[ix.log_L]).toPrecision(5), Teff: Math.round(10 ** r[ix.log_Teff]), R: +(10 ** r[ix.log_R]).toPrecision(5),
    Tc: +(10 ** r[ix.log_center_T]).toPrecision(5), rhoc: +(10 ** r[ix.log_center_Rho]).toPrecision(5), Xc: +r[ix.center_h1].toPrecision(4), Mcc: +r[ix.mass_conv_core].toPrecision(4), pp: +(10 ** r[ix.pp]).toPrecision(4), cno: +(10 ** r[ix.cno]).toPrecision(4) })) };
  console.log(`${m} M☉: ZAMS L ${out.tracks[m].rows[0].L} Teff ${out.tracks[m].rows[0].Teff} Tc ${(out.tracks[m].rows[0].Tc / 1e6).toFixed(2)} MK, main sequence ${out.tracks[m].tmsGyr} Gyr, ${out.tracks[m].rows.length} points`);
}
writeFileSync(new URL("../../papers/p2/data/mist.json", import.meta.url), JSON.stringify(out));
console.log(`wrote papers/p2/data/mist.json (X ${out.X}, Y ${out.Y}, Z ${out.Z})`);
