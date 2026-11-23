/* The energy of contraction (ε_grav, evolve.mjs grav=1) and what it changed (papers/p2 section 4): from the runs with it
   and the same runs without,
     · ours, the check: the Sun to 4.57 Gyr and 2 M☉ to central hydrogen 10⁻³ on OPAL (X0 0.7068, Z 0.0143, α 1.61,
       settle 10⁶ yr), with and without: how far L, R, Tc, ρc and the life move, and contraction's share of L;
     · the two stalled 4D Sun analogues (s 1.5152, G 10⁻¹⁴ and 10⁻¹¹), resumed with it from their checkpoints at the stall
       (the first row carrying Lgrav is the first model with it): how much further they live, what the centre does,
       contraction's share, and where they stop again;
     · a ladder star past the end of its central hydrogen (the further of its -Hs runs): how far its cores grow and how
       the star changes. Provisional while that run goes on.
     node four/fusion/tools/egrav4.mjs <dir> [dir …]   → papers/p2/data/egrav.json */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
const dirs = process.argv.slice(2), find = (re) => { const out = []; for (const d of dirs) for (const f of readdirSync(d)) if (re.test(f)) out.push(`${d}/${f}`); return out; };
const load = (p) => JSON.parse(readFileSync(p, "utf8")), one = (re, what) => { const f = find(re); if (!f.length) throw new Error(`egrav4: no ${what}`); return load(f[0]); };
const r4 = (x) => +x.toPrecision(4), pct = (a, b) => r4(100 * (b / a - 1));
const atT = (T, t) => { const i = T.findIndex((r) => r.tGyr >= t); if (i < 1) return T.at(-1); const p = T[i - 1], q = T[i], u = (t - p.tGyr) / (q.tGyr - p.tGyr), o = {}; for (const k of ["L", "R", "Tc", "rhoc", "Xc", "Teff"]) o[k] = p[k] + (q[k] - p[k]) * u; return o; };
const atX = (T, X) => { const i = T.findIndex((r) => r.Xc <= X); if (i < 1) return null; const p = T[i - 1], q = T[i], u = (p.Xc - X) / (p.Xc - q.Xc), o = {}; for (const k of ["tGyr", "L", "R", "Tc", "rhoc", "Teff"]) o[k] = p[k] + (q[k] - p[k]) * u; return o; };
const share = (T, ok = () => true) => { const v = T.filter((r) => r.Lgrav != null && ok(r)).map((r) => r.Lgrav / r.L).sort((a, b) => a - b); return { min: r4(v[0]), max: r4(v.at(-1)), median: r4(v[v.length >> 1]) }; };
const TAG = "X0\\.7068-Z0\\.0143-opal-a1\\.61-s1e6";

// ours: the Sun and 2 M☉
const sun0 = one(new RegExp(`^evolve-ours-1-${TAG}-to4\\.6\\.json$`), "Sun without ε_grav").track, sun1 = one(new RegExp(`^evolve-ours-1-${TAG}-eg-to4\\.6\\.json$`), "Sun with ε_grav").track;
const sunAges = [1, 2, 3, 4, 4.57].map((t) => { const a = atT(sun0, t), b = atT(sun1, t); return { tGyr: t, dL: pct(a.L, b.L), dR: pct(a.R, b.R), dTc: pct(a.Tc, b.Tc), drhoc: pct(a.rhoc, b.rhoc), Xc: [r4(a.Xc), r4(b.Xc)] }; });
const m20 = one(new RegExp(`^evolve-ours-2-${TAG}\\.json$`), "2 M☉ without ε_grav").track, m21 = one(new RegExp(`^evolve-ours-2-${TAG}-eg\\.json$`), "2 M☉ with ε_grav").track;
const m2X = [0.35, 0.1, 0.01, 0.001].map((X) => { const a = atX(m20, X), b = atX(m21, X); return { Xc: X, dAge: pct(a.tGyr, b.tGyr), dL: pct(a.L, b.L), dR: pct(a.R, b.R), dTeff: pct(a.Teff, b.Teff), dTc: pct(a.Tc, b.Tc), drhoc: pct(a.rhoc, b.rhoc) }; });
const maxAbs = (rows) => r4(Math.max(...rows.flatMap((r) => Object.entries(r).filter(([k]) => k.startsWith("d")).map(([, v]) => Math.abs(v)))));
const ours = { sun: { ages: sunAges, maxAbsPct: maxAbs(sunAges), contraction: share(sun1, (r) => r.tGyr > 0.05) },
  m2: { atXc: m2X, maxAbsPct: maxAbs(m2X), contractionNearEnd: share(m21, (r) => r.Xc < 0.05) } };

// the stalls
const stalls = find(/^evolve-four-[^-]+e-\d+-1\.5152-[\d.]+-lp-eg\.json$/).map(load).map((j) => { const T = j.track, k = T.findIndex((r) => "Lgrav" in r), pre = T[k - 1], post = T.slice(k), end = T.at(-1);
  const minTc = post.reduce((a, r) => (r.Tc < a.Tc ? r : a)), maxRho = post.reduce((a, r) => (r.rhoc > a.rhoc ? r : a));
  return { G: j.Grel, s: j.s, m: j.m, stallGyr: r4(pre.tGyr), stopGyr: r4(end.tGyr), moreMyr: r4(1000 * (end.tGyr - pre.tGyr)), XcStall: r4(pre.Xc), XcStop: r4(end.Xc), qccStall: r4(pre.qcc), qccMin: r4(Math.min(...post.map((r) => r.qcc))), qccStop: r4(end.qcc),
    TcStall: r4(pre.Tc / 1e6), TcMin: r4(minTc.Tc / 1e6), TcStop: r4(end.Tc / 1e6), rhoMaxOverStall: r4(maxRho.rhoc / pre.rhoc), contraction: share(post), stopped: j.stopped }; }).sort((a, b) => b.G - a.G);
if (stalls.length !== 2) throw new Error(`egrav4: expected the two stalled analogues, found ${stalls.length}`);

// past exhaustion: the further of the -Hs runs
const past = find(/^evolve-four-1e-17-1\.5152-1\.250-lp-eg-Hs[^.]+(\.\d+)?(\.ckpt)?\.json$/).map(load).filter((j) => j.track?.length).sort((a, b) => b.track.at(-1).tGyr - a.track.at(-1).tGyr)[0];
let pastOut = null;
if (past) { const T = past.track, X0 = T[0].Xc, a = T.find((r) => r.Xc < 1e-3), b = T.at(-1), m = 1.25;
  const heavy = (r) => Object.entries(r).filter(([k]) => /^\d+-\d+$/.test(k) && +k.split("-")[0] >= 3).reduce((s, [, v]) => s + v, 0);
  const cores = past.profiles.slice().sort((p, q) => p.tGyr - q.tGyr).filter((p) => p.tGyr >= a.tGyr - 1e-6).map((p) => { const t = p.rows.filter((r) => X0 - (r.H ?? X0) > 0.05 || heavy(r) > 0.01), h = p.rows.filter((r) => (r.H ?? 1) < 0.01); return { tGyr: r4(p.tGyr), processed: r4((t.length ? t.at(-1).q : 0) * m), Hfree: r4((h.length ? h.at(-1).q : 0) * m) }; });
  pastOut = { G: 1e-17, s: 1.5152, m, fromGyr: r4(a.tGyr), toGyr: r4(b.tGyr), myr: r4(1000 * (b.tGyr - a.tGyr)), Hfree: [cores[0].Hfree, cores.at(-1).Hfree], processed: [cores[0].processed, cores.at(-1).processed], explodesAt: 1,
    R: r4(b.R / a.R), L: r4(b.L / a.L), Teff: [r4(a.Teff), r4(b.Teff)], Tc: [r4(a.Tc / 1e6), r4(b.Tc / 1e6)], rhoc: r4(b.rhoc / a.rhoc), contraction: share(T, (r) => r.tGyr >= a.tGyr), stopped: past.stopped ?? "cut", provisional: true,
    // the energy books over the last 100 models: the shells' burn against the structure's own nuclear luminosity
    // (evolve.mjs eBal); far from 1, the burning shell is under-resolved (evolve.mjs balmax=)
    books: (() => { const e = T.slice(-100).map((r) => r.eBal).filter((x) => x != null); return e.length ? [r4(Math.min(...e)), r4(Math.max(...e))] : null; })(), cores }; }

const out = { about: "fusion/tools/egrav4.mjs: the energy of contraction (ε_grav, evolve.mjs grav=1). ours: the Sun (1 M☉, to 4.57 Gyr) and 2 M☉ (to Xc 1e-3) on OPAL with it against without, differences in per cent; contraction = Lgrav/L. stalls: the two stalled s 1.5152 analogues resumed with it from the stall. past: a ladder star past central-hydrogen exhaustion (cores in M_Ch; provisional while its run goes on).", ours, stalls, past: pastOut };
writeFileSync(new URL("../../papers/p2/data/egrav.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify({ sun: ours.sun.maxAbsPct, m2: ours.m2.maxAbsPct, sunContr: ours.sun.contraction, stalls: stalls.map((x) => [x.G, x.stallGyr, x.stopGyr, x.moreMyr]), past: pastOut && [pastOut.myr, pastOut.Hfree, pastOut.processed, pastOut.books] }));
