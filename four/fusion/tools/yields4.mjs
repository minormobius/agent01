/* What 4D stars give back, and the gas a galaxy of them leaves (the 4D metals route, step two; papers/p2 section 4,
   OUTLINE item 14): from the aged mass ladders (evolve.mjs four … -lp; the further record of each run, as ages4.mjs),
     · each star's main-sequence life: the age at central hydrogen 10⁻³, or past the run's end the last stretch's burning
       rate carried on (flagged "extrapolated");
     · its processed core at the run's end: everything burning has touched, out to where the hydrogen is still within 0.05
       of its start and elements past helium are under 1% (a stirred core that shrank leaves its ash behind in the
       layers it once stirred, so the stirred core alone is too small);
     · what it returns, under the post-main-sequence choices nothing here computes yet, declared and carried as a band
       (nuclei.mjs cores used the same kind on zero-age stars): shell burning grows the core by g = 1, 1.25 or 1.5 (the
       processed core already holds what partial burning above the stirred core has done, so g is taken smaller here
       than cores' 1–2 on the stirred core alone); a grown
       core under the Chandrasekhar mass is a dead star that returns its envelope (everything outside g × core, as the
       last profile holds it) and a share w = 3% or 30% of its core's ash by winds; one that reaches M_Ch explodes and
       returns everything, its core burnt to this world's iron, the rock row or left unburnt by nuclei.mjs explode's
       shares (expansion f = 30 or 100; ash of elements 9–12 there, others taken as the nearest);
     · a one-zone galaxy: gas that starts primordial makes stars at gas/τ (τ = 1 or 3 Gyr) on a mass function m^(−α)
       (α = 2.35, ours; or 1.9, top-heavy) over the ladder's masses, each star returning its gas when its life ends, with
       what it made plus the metals it was born with (instant mixing, no infall, no outflow). Out: the gas's share of
       elements past helium, and their mix by element, against time.
   What a star made is its last kept profile's (ash4.mjs); a cut run's profile can lag its track, flagged.
     node four/fusion/tools/yields4.mjs <dir of evolve-four-*-lp*.json> [G=1e-17]   → papers/p2/data/yields4.json */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { NUCLEI } from "../../atom/js/nucleidata.js";

const args = process.argv.slice(2), dir = args.find((a) => !a.includes("=")), kv = Object.fromEntries(args.filter((a) => a.includes("=")).map((a) => a.split("="))), GSEL = +(kv.G ?? 1e-17);
const recs = new Map();
for (const f of readdirSync(dir).filter((x) => /^evolve-four-.*-lp(\.ckpt)?\.json$/.test(x))) { const key = f.replace(".ckpt", ""), j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")), end = j.track?.at(-1)?.tGyr ?? -1, o = recs.get(key);
  if (!o || end > o.end + 1e-9 || (Math.abs(end - o.end) <= 1e-9 && !f.includes("ckpt"))) recs.set(key, { f, j, end }); }
const byZ = (row) => { const o = {}; for (const [k, v] of Object.entries(row)) { const m = k.match(/^(\d+)-\d+$/); if (m) o[m[1]] = (o[m[1]] ?? 0) + v; } return o; };
/* ∫ X_Z dq over q in [a, b] on the profile's rows (trapezoid, a row's composition held to the cut) */
const integ = (rows, a, b) => { const out = {}; for (let i = 1; i < rows.length; i++) { const q0 = Math.max(a, rows[i - 1].q), q1 = Math.min(b, rows[i].q); if (q1 <= q0) continue;
  const A = byZ(rows[i - 1]), B = byZ(rows[i]), t0 = (q0 - rows[i - 1].q) / (rows[i].q - rows[i - 1].q), t1 = (q1 - rows[i - 1].q) / (rows[i].q - rows[i - 1].q);
  for (const z of new Set([...Object.keys(A), ...Object.keys(B)])) { const x0 = (A[z] ?? 0) * (1 - t0) + (B[z] ?? 0) * t0, x1 = (A[z] ?? 0) * (1 - t1) + (B[z] ?? 0) * t1; out[z] = (out[z] ?? 0) + 0.5 * (x0 + x1) * (q1 - q0); } } return out; };
const add = (a, b, k = 1) => { for (const [z, v] of Object.entries(b)) a[z] = (a[z] ?? 0) + k * v; return a; };
const heavyOf = (o) => Object.entries(o).filter(([z]) => +z >= 3).reduce((t, [, v]) => t + v, 0);
const EX = NUCLEI.explode.rows, exShares = (Z, mc, f) => { const zs = [...new Set(EX.map((r) => r.Z))], z = zs.reduce((p, q) => (Math.abs(q - Z) < Math.abs(p - Z) ? q : p)), ms = [...new Set(EX.map((r) => r.m))], mm = ms.reduce((p, q) => (Math.abs(q - Math.min(mc, 1.1)) < Math.abs(p - Math.min(mc, 1.1)) ? q : p)), r = EX.find((x) => x.Z === z && x.m === mm && x.f === f);
  const mid = (v) => (v[0] + v[1]) / 2, i = mid(r.iron), k = mid(r.rock), u = mid(r.unburnt), n = i + k + u; return { iron: i / n, rock: k / n, unburnt: u / n, ashZ: z }; };

const stars = [];
for (const [key, { f, j }] of recs) {
  const [, G, s, m] = key.match(/^evolve-four-([^-]+e-\d+)-([\d.]+)-([\d.]+)-lp\.json$/) ?? []; if (!G || +G !== GSEL) continue;
  const T = j.track, P = j.profiles?.at(-1); if (!T?.length || !P) continue;
  // the life: to Xc 10⁻³, or carried on at the last stretch's rate
  let life = null, flag = "reached"; for (let i = 1; i < T.length; i++) if (T[i].Xc <= 1e-3 && T[i - 1].Xc > 1e-3) { const a = T[i - 1], b = T[i]; life = a.tGyr + ((b.tGyr - a.tGyr) * (a.Xc - 1e-3)) / (a.Xc - b.Xc); break; }
  if (life == null) { const last = T.at(-1), k = Math.max(0, Math.floor(T.length * 0.8)), a = T[k], rate = (a.Xc - last.Xc) / Math.max(1e-9, last.tGyr - a.tGyr); life = rate > 0 ? last.tGyr + (last.Xc - 1e-3) / rate : Infinity; flag = "extrapolated"; }
  const rows = P.rows, X0 = T[0].Xc, touched = rows.filter((r) => X0 - (r["1-1"] ?? r.H ?? X0) > 0.05 || heavyOf(byZ(r)) > 0.01), stirred = rows.filter((r) => r.stir === 1 && r.q < 0.6);
  const qcore = Math.max(touched.length ? touched.at(-1).q : 0, stirred.length ? stirred.at(-1).q : 0), core = integ(rows, 0, qcore), ashCore = heavyOf(core), ashAll = heavyOf(integ(rows, 0, 1));
  const lead = Object.entries(core).filter(([z]) => +z >= 3).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, choices = [];
  for (const g of [1, 1.25, 1.5]) for (const w of [0.03, 0.3]) for (const fx of [30, 100]) {
    const qg = Math.min(1, g * qcore), mcore = qg * +m, ret = integ(rows, qg, 1); let remnant, iron = 0, rock = 0, fate;
    if (mcore >= 1 && lead) { const x = exShares(+lead, mcore, fx), cg = integ(rows, 0, qg), ash = heavyOf(cg); fate = "explodes"; remnant = 0;
      for (const [z, v] of Object.entries(cg)) { if (+z >= 3) ret[z] = (ret[z] ?? 0) + v * x.unburnt; else ret[z] = (ret[z] ?? 0) + v; } iron = ash * x.iron; rock = ash * x.rock; }
    else { fate = "dead"; const wind = {}; for (const [z, v] of Object.entries(core)) if (+z >= 3) wind[z] = w * v; add(ret, wind); remnant = qg - w * ashCore; }
    choices.push({ g, w, f: fx, fate, remnant: +remnant.toFixed(5), returned: Object.fromEntries(Object.entries(ret).map(([z, v]) => [z, +v.toFixed(6)])), iron: +iron.toFixed(6), rock: +rock.toFixed(6) }); }
  stars.push({ G: +G, s: +s, m: +m, life: +life.toFixed(3), lifeFlag: flag, runEnd: +T.at(-1).tGyr.toFixed(2), XcEnd: +T.at(-1).Xc.toFixed(4), profileXc: +(rows[0]["1-1"] ?? rows[0].H).toFixed(4), X0: +X0.toFixed(4), qcore: +qcore.toFixed(4), ashCore: +ashCore.toFixed(5), ashAll: +ashAll.toFixed(5), lead: lead && +lead, choices });
}
stars.sort((a, b) => a.s - b.s || a.m - b.m);

/* the one-zone galaxy at one strength: its ladder's stars (at least three), interpolated in ln m */
function galaxy(ladder, { alpha, tau, g, w, f, tEnd = 60, dt = 0.02 }) {
  const ms = ladder.map((x) => x.m), lo = Math.log(ms[0]), hi = Math.log(ms.at(-1)), NB = 40, bins = [];
  for (let b = 0; b < NB; b++) { const lm = lo + ((hi - lo) * (b + 0.5)) / NB, m = Math.exp(lm), i = Math.max(1, ms.findIndex((x) => x >= m)), A = ladder[i - 1], B = ladder[Math.min(i, ladder.length - 1)], t = B === A ? 0 : (lm - Math.log(A.m)) / (Math.log(B.m) - Math.log(A.m));
    const ca = A.choices.find((c) => c.g === g && c.w === w && c.f === f), cb = B.choices.find((c) => c.g === g && c.w === w && c.f === f), made = {};
    for (const z of new Set([...Object.keys(ca.returned), ...Object.keys(cb.returned)])) if (+z >= 3) made[z] = (ca.returned[z] ?? 0) * (1 - t) + (cb.returned[z] ?? 0) * t;
    made.iron = ca.iron * (1 - t) + cb.iron * t; made.rock = ca.rock * (1 - t) + cb.rock * t;
    const life = Math.exp(Math.log(A.life) * (1 - t) + Math.log(B.life) * t), rem = ca.remnant * (1 - t) + cb.remnant * t;
    bins.push({ m, life, rem, made, wt: m ** (1 - alpha) * m * ((hi - lo) / NB) }); } // mass formed per ln m ∝ m · m^(1−α)
  const W = bins.reduce((t, b) => t + b.wt, 0); for (const b of bins) b.wt /= W;
  const N = Math.round(tEnd / dt), sfr = new Float64Array(N), zb = []; let gas = 1, metals = {}, out = [];
  for (let n = 0; n < N; n++) { const t = n * dt, Zg = Object.values(metals).reduce((a, v) => a + v, 0) / gas, form = (gas / tau) * dt; sfr[n] = form; zb.push(Object.fromEntries(Object.entries(metals).map(([z, v]) => [z, v / gas])));
    gas -= form; for (const z in metals) metals[z] -= form * (zb[n][z] ?? 0);
    // stars born at step k with life L return now
    for (const b of bins) { const k = n - Math.round(b.life / dt); if (k < 0 || !(b.life < tEnd)) continue; const born = sfr[k] * b.wt, back = born * (1 - b.rem); gas += back;
      for (const [z, v] of Object.entries(b.made)) metals[z] = (metals[z] ?? 0) + born * v; for (const [z, v] of Object.entries(zb[k])) metals[z] = (metals[z] ?? 0) + back * v; }
    if (n % Math.round(1 / dt) === 0) { const tot = Object.values(metals).reduce((a, v) => a + v, 0); out.push({ t: +t.toFixed(2), gas: +gas.toFixed(5), Z: +(tot / gas).toExponential(4), mix: Object.fromEntries(Object.entries(metals).filter(([, v]) => v > 1e-3 * tot).map(([z, v]) => [z, +(v / tot).toFixed(4)])) }); } }
  return out;
}
/* the net yield (the standard closed-box measure; Z = p ln(1/μ) at gas fraction μ with instant recycling, whatever τ):
   elements past helium returned, per mass locked away in remnants and in stars still living at tg, on the mass function
   over the ladder (ln m, linear between its stars), and what share of it each element or burnt group is */
function netYield(ladder, { alpha, g, w, f, tg }) { const ms = ladder.map((x) => x.m), lo = Math.log(ms[0]), hi = Math.log(ms.at(-1)), NB = 200; let made = 0, locked = 0; const by = {};
  for (let b = 0; b < NB; b++) { const lm = lo + ((hi - lo) * (b + 0.5)) / NB, m = Math.exp(lm), i = Math.max(1, ms.findIndex((x) => x >= m)), A = ladder[i - 1], B = ladder[Math.min(i, ladder.length - 1)], t = B === A ? 0 : (lm - Math.log(A.m)) / (Math.log(B.m) - Math.log(A.m)), wt = m ** (2 - alpha);
    const ca = A.choices.find((c) => c.g === g && c.w === w && c.f === f), cb = B.choices.find((c) => c.g === g && c.w === w && c.f === f), life = Math.exp(Math.log(A.life) * (1 - t) + Math.log(B.life) * t);
    if (!(life < tg)) { locked += wt; continue; } locked += wt * (ca.remnant * (1 - t) + cb.remnant * t);
    const part = {}; for (const z of new Set([...Object.keys(ca.returned), ...Object.keys(cb.returned)])) if (+z >= 3) part[z] = (ca.returned[z] ?? 0) * (1 - t) + (cb.returned[z] ?? 0) * t;
    part.iron = ca.iron * (1 - t) + cb.iron * t; part.rock = ca.rock * (1 - t) + cb.rock * t; for (const [z, v] of Object.entries(part)) { made += wt * v; by[z] = (by[z] ?? 0) + wt * v; } }
  return { p: made / locked, mix: Object.fromEntries(Object.entries(by).filter(([, v]) => v > 1e-3 * made).map(([z, v]) => [z, +(v / made).toFixed(4)])) }; }
const byS = {}; for (const x of stars) (byS[x.s] ??= []).push(x);
const yields = [];
for (const [s, all] of Object.entries(byS)) { const lad = all.filter((x) => isFinite(x.life)).sort((a, b) => a.m - b.m); if (lad.length < 3) continue;
  for (const alpha of [2.35, 1.9]) for (const g of [1, 1.25, 1.5]) for (const w of [0.03, 0.3]) for (const f of [30, 100]) for (const tg of [10, 30]) { const y = netYield(lad, { alpha, g, w, f, tg }); yields.push({ s: +s, alpha, g, w, f, tg, p: +y.p.toExponential(4), mix: y.mix }); } }
const galaxies = [];
for (const [s, all] of Object.entries(byS)) { const lad = all.filter((x) => isFinite(x.life)).sort((a, b) => a.m - b.m); if (lad.length < 3) continue;
  for (const alpha of [2.35, 1.9]) for (const tau of [1, 3]) for (const g of [1, 1.25, 1.5]) for (const w of [0.03, 0.3]) for (const f of [30, 100]) galaxies.push({ s: +s, alpha, tau, g, w, f, masses: lad.map((x) => x.m), track: galaxy(lad, { alpha, tau, g, w, f }) }); }
writeFileSync(new URL("../../papers/p2/data/yields4.json", import.meta.url), JSON.stringify({ about: "fusion/tools/yields4.mjs: at G " + GSEL + ", each aged 4D star's life, burning core and what it returns (as shares of its mass, by element; iron and rock: an exploding core's burnt ash) under the declared choices g (core growth), w (wind share of a dead star's core ash), f (an explosion's expansion); and one-zone galaxies on each strength's ladder (alpha: mass function, tau: Gyr of star formation), the gas's share Z of elements past helium and their mix against time t (Gyr). Profiles lag a cut run's track (profileXc against XcEnd).", G: GSEL, stars, yields, galaxies }, null, 1));
for (const x of stars) { const c = x.choices.find((c) => c.g === 1.25 && c.w === 0.03 && c.f === 100); console.log(`s ${x.s} ${x.m} M_Ch: life ${x.life} Gyr (${x.lifeFlag}), core ${x.qcore} holding ${(100 * x.ashCore).toFixed(1)}% of the star in ash (of ${(100 * x.ashAll).toFixed(1)}% in all) (lead ${x.lead}); g 1.25 w 3%: ${c.fate}, returns ${(100 * (1 - c.remnant)).toFixed(0)}%, ash ${(100 * (heavyOf(c.returned) + c.iron + c.rock)).toFixed(2)}%`); }
for (const s of Object.keys(byS)) { const ys = yields.filter((y) => y.s === +s); if (!ys.length) continue; for (const tg of [10, 30]) { const ps = ys.filter((y) => y.tg === tg).map((y) => y.p); console.log(`net yield s ${s}, stars dying within ${tg} Gyr: p ${Math.min(...ps).toExponential(2)}–${Math.max(...ps).toExponential(2)}`); } }
for (const gx of galaxies.filter((x) => x.alpha === 2.35 && x.tau === 1 && x.g === 1.25 && x.w === 0.03 && x.f === 100)) console.log(`galaxy s ${gx.s}: Z at 10/30/60 Gyr ${[10, 30, 59].map((t) => gx.track.find((r) => r.t >= t)?.Z).join(" / ")}, mix at 30 Gyr ${JSON.stringify(gx.track.find((r) => r.t >= 30)?.mix)}`);
