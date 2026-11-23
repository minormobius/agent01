/* Paper 2's text: each section's source (text/*.md) has every number as a {{token}}, read here from the computed data
   (data/windows.json from fusion/tools/windows4.mjs, data/masscheck.json from fusion/tools/masscheck.mjs) and from the
   solvers themselves (atom/js/weak.js, nuclear.js, bbn.js), so the text says what the code does; an unknown token stops
   the build. Writes draft/<section>.md and, with pandoc, draft/<section>.html on paper 1's stylesheet.
     node four/papers/p2/build.mjs            fill and render every section
     node four/papers/p2/build.mjs --check    exit 1 if a draft is missing or older than its source and data */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deuteron, MN } from "../../atom/js/nuclear.js";
import * as W from "../../atom/js/weak.js";
import { firstMinutes, OURS } from "../../atom/js/bbn.js";
import { NAME4 } from "../../fusion/js/world.js";
import * as NET3 from "../../fusion/js/net.js";

const here = path.dirname(fileURLToPath(import.meta.url)), TEXT = path.join(here, "text"), DRAFT = path.join(here, "draft");
const J = (f) => JSON.parse(readFileSync(path.join(here, "data", f), "utf8"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const pct = (x) => `${Math.round(100 * x)}%`, f = (x, n = 2) => x.toFixed(n);
const sci = (x, n = 2) => { const e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e; return `${m.toFixed(n - 1)} × 10^${String(e).replace("-", "−")}^`; };
const range = (xs, n = 1) => `${f(Math.min(...xs), n)}–${f(Math.max(...xs), n)}`;

export function numbers() {
  const D = J("windows.json"), M = J("masscheck.json"), t = {}, oL = D.burn.find((b) => b.asOurs), oG = D.burnAlt?.find((b) => b.asOurs);
  D.burn = D.burn.filter((b) => !b.asOurs); if (D.burnAlt) D.burnAlt = D.burnAlt.filter((b) => !b.asOurs); // the grid's points; the star apart
  const bis = (test, a, b) => { for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (test(m)) b = m; else a = m; } return b; };
  const Bd = (s) => deuteron(4, MN, s)?.B ?? 0;
  // the strong window and p + p
  const sOpen = bis((s) => Bd(s) > D.PP_MIN, D.S_DEUT, 1.7), PEP = W.Q_NP - W.ME, sPep = bis((s) => Bd(s) > PEP, D.S_DEUT, 1.7), width = D.S_DIPROTON - D.S_DEUT;
  Object.assign(t, { sDeut: f(D.S_DEUT, 4), sDip: f(D.S_DIPROTON, 4), sOurs: "1.5152", BdOurs: f(Bd(1.5152), 3), BdTop: f(Bd(D.S_DIPROTON - 1e-4), 1),
    ppMin: f(D.PP_MIN, 3), pepMin: f(PEP, 3), sOpen: f(sOpen, 4), sPep: f(sPep, 4), closedShare: pct((sOpen - D.S_DEUT) / width), pepShare: pct((sOpen - sPep) / width),
    nS: String(D.S.length), nGX: String(D.GX.length), gxLo: String(D.GX[0]), gxHi: String(D.GX.at(-1)), gxStep: f(D.GX[1] - D.GX[0], 2),
    sLo: f(D.S[0], 2), sHi: f(D.S.at(-1), 3), clocks: D.CLOCKS.join(", ") });
  // the first minutes, per clock: the share of the plane, the edge where half the hydrogen survives
  const edges = D.rows.map((r) => { const e = []; D.S.forEach((s, i) => { if (!(D.Bd[s] > D.PP_MIN)) return; const g = r.grid[i], j = g.findIndex((c) => c.Y <= 0.5); if (j > 0) { const a = g[j - 1].Y, b = g[j].Y; e.push(D.GX[j - 1] + ((a - 0.5) / (a - b)) * (D.GX[j] - D.GX[j - 1])); } }); return { t1: r.t1, lo: Math.min(...e), hi: Math.max(...e) }; });
  const box = D.S.length * D.GX.length, share = (r, k) => r.grid.flat().filter((c) => (k === "pp" ? c.okPP : c.okPP && c.okH)).length / box;
  t.ppPlane = pct(share(D.rows[0], "pp")); t.halfPlane = `${Math.round(100 * share(D.rows[0], "h"))}–${pct(share(D.rows.at(-1), "h"))}`;
  edges.forEach((e) => { t[`edge_${String(e.t1).replace(".", "p")}`] = f((e.lo + e.hi) / 2, 2); });
  t.edgeSpread = f(Math.max(...edges.map((e) => e.hi - e.lo)), 3);
  const fit = (() => { const xs = edges.map((e) => Math.log10(e.t1)), ys = edges.map((e) => (e.lo + e.hi) / 2), n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    const b = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0); return { b, a: my - b * mx }; })();
  t.edgeSlope = f(-fit.b, 3); t.edgeAt1 = f(fit.a, 2);
  const gx0 = Math.log10(W.GF / W.ME / W.G4_REF), G0 = W.G4_REF * 10 ** gx0; t.gx0 = f(gx0, 2); t.G4ref = sci(W.G4_REF, 3);
  t.clockMin = f(10 ** ((fit.a - gx0) / -fit.b), 3); // the clock below which the electron-matched G₄ leaves less than half the hydrogen
  const Ge = W.G4_REF * 10 ** fit.a, ne = W.neutronFraction(4, Ge, { t1: 1 }); t.TfEdge = f(ne.Tf, 2); t.TfHalf = f(W.Q_NP / Math.log(3), 2);
  t.tauEdge = sci(W.neutronLife(4, Ge)); t.tauEdgeDays = f(W.neutronLife(4, Ge) / 86400, 0);
  const n0 = W.neutronFraction(4, G0, { t1: 1 }), tau0 = W.neutronLife(4, G0);
  t.tau0 = sci(tau0); t.tau0h = f(tau0 / 3600, 1); t.Tf0 = f(n0.Tf, 2); t.Y0 = f(firstMinutes({ d: 4, B: Bd(1.5152), t1: 1, Tf: n0.Tf, tau: tau0 }).Y, 2);
  // ours, the check
  const nf3 = W.neutronFraction(3, W.GF, { t1: 0.74 }), tau3 = W.neutronLife(3, W.GF);
  Object.assign(t, { tau3: f(tau3, 0), Tf3: f(nf3.Tf, 3), Y3: f(firstMinutes({ d: 3, B: 2.224566, Tf: nf3.Tf, tau: tau3 }).Y, 3), eta: sci(OURS.eta), t1ours: String(OURS.t1) });
  // p + p's weak factor across the network's strengths
  const SN = [...new Set(D.burn.map((b) => b.s))].sort((a, b) => a - b), ppR = SN.map((s) => W.weakRatio(4, G0, Bd(s) - W.Q_NP - W.ME));
  Object.assign(t, { nStrengths: String(SN.length), sNet: SN.join(", "), ppRlo: ppR[0].toPrecision(2), ppRhi: ppR.at(-1).toPrecision(2), BdNet: range(SN.map(Bd), 1) });
  const gxNet = [...new Set(D.burn.map((b) => b.gx))].sort((a, b) => a - b); t.gxNet = gxNet.join(", "); t.nPoints = String(D.burn.length);
  t.gxNetLo = f(gxNet[0] - gx0, 1); t.gxNetHi = f(gxNet.at(-1) - gx0, 1);
  // hydrogen burning at the network's points, under each mass model
  const tally = (B) => { const o = {}; for (const b of B) (o[b.kind] ??= []).push(b); return o; }, L = tally(D.burn), G = tally(D.burnAlt ?? []);
  const cnt = (o, k) => String(o[k]?.length ?? 0), Tr = (o, k) => (o[k] ? range(o[k].map((b) => b.T / 1e6), 1) : "—");
  Object.assign(t, { nHeL: cnt(L, "helium"), nHe3L: cnt(L, "helium-3"), nPastL: cnt(L, "past helium"), nHeG: cnt(G, "helium"), nHe3G: cnt(G, "helium-3"), nPastG: cnt(G, "past helium"),
    THeL: Tr(L, "helium"), THe3L: Tr(L, "helium-3"), TPastL: Tr(L, "past helium"), TPastG: Tr(G, "past helium"), THeG: Tr(G, "helium") });
  const dis = D.burn.filter((b) => { const a = D.burnAlt?.find((x) => x.s === b.s && x.gx === b.gx); return a && a.kind !== b.kind; });
  t.nDisagree = String(dis.length); t.sDisagreeMax = String(Math.max(...dis.map((b) => b.s)));
  const lowL = D.burn.filter((b) => b.s <= 1.55), lowG = (D.burnAlt ?? []).filter((b) => b.s <= 1.55 && b.kind === "past helium");
  t.TlowL = range(lowL.map((b) => b.T / 1e6), 1); t.TlowG = range(lowG.map((b) => b.T / 1e6), 1); t.massMain = D.mass; t.massAlt = D.massAlt ?? "—";
  // the mass model's check on ours and the ceryllium cycle's Q
  const cl = (k) => M.clusters.find((c) => c.k === k);
  for (const k of [3, 4, 5, 6]) { const c = cl(k); t[`cl${k}real`] = f(c.real, 1); t[`cl${k}lad`] = f(c.ladder, 1); t[`cl${k}grid`] = f(c.grid, 1); }
  Object.assign(t, { medL: pct(M.medianError.ladder), medG: pct(M.medianError.grid), nSep: String(M.medianError.n), q11real: f(M.q11B.real, 2), q11lad: f(M.q11B.ladder, 1), q11grid: f(M.q11B.grid, 1), q11off: f(M.offset, 1), BaMC3: f(M.BaMC, 2), BaG3: f(M.BaGrid, 2) });
  // the ceryllium cycle's step, decided: the free-cluster bound (fusion/qbound4.json)
  const QB = JSON.parse(readFileSync(path.join(here, "../../fusion/qbound4.json"), "utf8")).bounds, best = (d, sv) => QB.filter((q) => q.d === d && Math.abs(q.s - sv) < 1e-4).sort((a, b) => b.K - a.K)[0];
  const q4 = SN.map((sv) => best(4, sv)), fq = (v) => `${v < 0 ? "−" : "+"}${f(Math.abs(v), 1)}`;
  Object.assign(t, { qbK: "480", qbList: SN.map((sv) => fq(QB.find((q) => q.d === 4 && Math.abs(q.s - sv) < 1e-4 && q.K === 480).Qupper)).join(", "), qbNegL: f(-q4[0].Qupper, 0), qbNegH: f(-q4.at(-1).Qupper, 0),
    qb480: fq(QB.find((q) => q.d === 4 && q.s === 1.5152 && q.K === 480).Qupper), qb960: fq(QB.find((q) => q.d === 4 && q.s === 1.5152 && q.K === 960).Qupper), qb3: f(best(3, 1).Qupper, 2) });
  // our world's point: both forces carried over (the deuteron as ours, G₄ = G_F/m_e)
  const nameOf = (key) => { const [Z, A] = key.split("-").map(Number); return `${Z === 1 ? "hydrogen" : Z === 2 ? "helium" : NAME4[Z] ?? `element ${Z}`}-${A}`; };
  if (!oL || !D.asOurs) throw new Error("windows.json has no as-ours point: rerun fusion/tools/windows4.mjs");
  const desc = (o) => `${o.kind === "past helium" ? `past helium (${o.top.filter(([k]) => +k.split("-")[1] >= 8).slice(0, 2).map(([k, x]) => `${nameOf(k)} ${pct(x)}`).join(", ")})` : `${o.kind} (${pct(o.kind === "helium" ? o.he4 : o.he3)})`}`;
  Object.assign(t, { oursKindL: desc(oL), oursTL: f(oL.T / 1e6, 1), oursKindG: oG ? desc(oG) : "—", oursTG: oG ? f(oG.T / 1e6, 1) : "—",
    oursY: D.CLOCKS.map((c) => f(D.asOurs.Y[c], 2)).join(", "), oursY1: f(D.asOurs.Y[1], 2), oursGx: f(D.asOurs.gx, 2) });
  // window C: the lifetimes (data/lifetimes.json from fusion/tools/lifetimes4.mjs) and the energy law (fusion/eps4.json)
  Object.assign(t, lifeNumbers(t, SN, nameOf));
  // stars that age: our Sun by atom/tools/evolve.mjs against standard solar models (data/evolvecheck.json, fusion/tools/suncheck.mjs)
  Object.assign(t, ageNumbers(), opacityNumbers(), ages4Numbers(), ash4Numbers(), yields4Numbers(), egravNumbers(), statusNumbers(), methodNumbers());
  for (const k of Object.keys(t)) if (typeof t[k] === "string") t[k] = t[k].replace(/(\d)-(\d)/g, "$1–$2").replace(/^-/, "−");
  // the provenance ledger, checked against the data (the supplement's S1); after the dash pass, which would turn its
  // nuclide names (5-11), dates and run names into ranges
  Object.assign(t, provenance());
  return t;
}

const sup = (e) => `10^${String(e).replace("-", "−")}^`, Gs = (g) => sup(Math.round(Math.log10(g)));
function lifeNumbers(t0, SN, nameOf) {
  const LT = J("lifetimes.json"), E = JSON.parse(readFileSync(path.join(here, "../../fusion/eps4.json"), "utf8")), t = {};
  const L = LT.runs.filter((r) => r.mass === "ladder" && !r.fail), Gr = LT.runs.filter((r) => r.mass !== "ladder" && !r.fail), GS = [...new Set(L.map((r) => r.G))].sort((a, b) => b - a);
  const all = L.flatMap((r) => r.stars), ths = (r) => r.stars.map((x) => x.thGyr).filter((x) => x != null);
  Object.assign(t, { nSeq: String(LT.runs.length), nSeqL: String(LT.runs.filter((r) => r.mass === "ladder").length), nSeqG: String(LT.runs.filter((r) => r.mass !== "ladder").length), nOK: String(L.length + Gr.length), nG: String(GS.length), GList: GS.map(Gs).join(", "), GHi: Gs(GS[0]), GLo: Gs(GS.at(-1)),
    mLo: String(Math.min(...all.map((x) => x.m))), mHi: String(Math.max(...all.map((x) => x.m))), nStars: String(all.length),
    oTc: f(LT.ours.Tc / 1e6, 1), oRho: f(LT.ours.rho_gcc, 0), oTh: f(LT.ours.thGyr, 1) });
  const fails = LT.runs.filter((r) => r.fail); t.nFail = String(fails.length); t.failAt = fails.map((r) => `G = ${Gs(r.G)}, s = ${r.s}`).join("; ") || "none";
  // per gravity: the analogue's mass and centre, the longest and the shortest core
  for (const g of GS) { const R = L.filter((r) => r.G === g && r.sun), k = String(Math.round(-Math.log10(g)));
    t[`sunM${k}`] = R.length ? range(R.map((r) => r.sun.m), 2) : "—"; t[`sunT${k}`] = R.length ? range(R.map((r) => r.sun.Tc / 1e6), 0) : "—"; t[`nSun${k}`] = String(R.length);
    const th = L.filter((r) => r.G === g).flatMap(ths); t[`thMax${k}`] = sci(Math.max(...th), 1); t[`thMin${k}`] = sci(Math.min(...th), 1); }
  const mid = L.filter((r) => r.G <= 1e-14 && r.G >= 1e-20), longs = mid.map((r) => Math.max(...ths(r)));
  const dec = GS.filter((g) => g !== GS.at(-1)).map((g) => { const th = L.filter((r) => r.G === g).flatMap(ths); return Math.log10(Math.max(...th) / Math.min(...th)); }); t.decLo = f(Math.min(...dec), 0); t.decHi = f(Math.max(...dec), 0);
  t.longLo = sci(Math.min(...longs), 1); t.longHi = sci(Math.max(...longs), 1); t.nMid = String(mid.length); t.nMidSun = String(mid.filter((r) => r.sun).length);
  t.minTh23 = f(Math.min(...L.filter((r) => r.G === GS.at(-1)).flatMap(ths)), 0); t.shortYr11 = f(Math.min(...L.filter((r) => r.G === GS[0]).flatMap(ths)) * 1e9, 0);
  const noSun = L.filter((r) => !r.sun && r.G !== GS.at(-1)); t.noSunAt = noSun.map((r) => `$s = ${r.s}$ at ${Gs(r.G)}`).join(" and ");
  t.noSunMin = noSun.length ? f(Math.min(...noSun.map((r) => r.mMin)), 1) : "—"; t.noSunMax = noSun.length ? f(Math.max(...noSun.flatMap(ths)), 2) : "—";
  // what an analogue's centre burns to (figure 2b), and whether the mass models agree
  const S = L.filter((r) => r.sun), kinds = (k) => S.filter((r) => r.sun.burn.kind === k);
  Object.assign(t, { nSunAll: String(S.length), nBPast: String(kinds("past helium").length), nBHe: String(kinds("helium").length), nBHe3: String(kinds("helium-3").length),
    TBPast: range(kinds("past helium").map((r) => r.sun.Tc / 1e6), 0), TBHe: range(kinds("helium").map((r) => r.sun.Tc / 1e6), 0), TBHe3: range(kinds("helium-3").map((r) => r.sun.Tc / 1e6), 1) });
  const Zs = kinds("past helium").map((r) => +r.sun.burn.top.find(([k]) => +k.split("-")[1] >= 8)[0].split("-")[0]); t.ZPastLo = String(Math.min(...Zs)); t.ZPastHi = String(Math.max(...Zs));
  const sPast = [...new Set(kinds("past helium").map((r) => r.s))]; t.sPastMax = String(Math.max(...sPast));
  const dis = Gr.filter((r) => { const l = L.find((x) => x.G === r.G && x.s === r.s); return l && (l.sun?.burn?.kind ?? null) !== (r.sun?.burn?.kind ?? null); }); t.nLifeDis = String(dis.length);
  if (dis.length) throw new Error(`lifetimes: the mass models disagree at ${dis.length} points; section 3 says they agree everywhere`);
  const pairs = Gr.filter((r) => r.sun && L.find((x) => x.G === r.G && x.s === r.s)?.sun), dm = pairs.map((r) => Math.abs(r.sun.m / L.find((x) => x.G === r.G && x.s === r.s).sun.m - 1));
  t.nPairs = String(pairs.length); t.dmMax = pct(Math.max(...dm));
  const he3to = (s) => GS.find((g) => L.find((r) => r.G === g && r.s === s)?.sun?.burn.kind === "helium"); t.he3GoneAt = Gs(he3to(1.85));
  const o15 = (g) => L.find((r) => r.G === g && r.s === 1.5152)?.sun; t.s15T = GS.filter((g) => o15(g)).map((g) => f(o15(g).Tc / 1e6, 1)).join(", "); t.s15G = GS.filter((g) => o15(g)).map(Gs).join(", ");
  const o17 = o15(1e-17); t.s15top17 = o17.burn.top.filter(([k]) => +k.split("-")[1] >= 8).slice(0, 2).map(([k, x]) => `${nameOf(k)} ${pct(x)}`).join(", ");
  // the analogue's density against the network's reference density
  const rr = E.models.ladder["1.5152"].rhoRef, Ti = (T) => E.T.findIndex((x) => x >= T); t.rhoRefLo = sci(rr[Ti(1e7)], 1); t.rhoRefHi = sci(rr[Ti(5e7) - 1] ?? rr.at(-1), 1);
  const rc = S.map((r) => r.sun.rhoc); t.rhocLo = sci(Math.min(...rc), 1); t.rhocHi = sci(Math.max(...rc), 1);
  // temperature sensitivity: ν = −d ln t½ / d ln T of a fresh core, 4D from the table (two grid steps, at 10¹⁶ kg/m⁴), ours from REACLIB at our zero-age centre's density
  const j = E.rho.findIndex((x) => x >= 1e16), nu4 = (s, T) => { const g = E.models.ladder[s].grid, i = Ti(T), a = g[i - 1]?.[j]?.th, b = g[i + 1]?.[j]?.th; return a && b ? -Math.log(b / a) / Math.log(E.T[i + 1] / E.T[i - 1]) : NaN; };
  const band = (s, lo, hi) => E.T.filter((T) => T >= lo && T <= hi).map((T) => nu4(s, T)).filter(Number.isFinite);
  const pp4 = SN.flatMap((s) => band(String(s), 3e6, 9e6)), hot = band("1.5152", 1.8e7, 4e7), hi85 = band("1.85", 1.8e7, 4e7);
  Object.assign(t, { nuPP4: range(pp4, 0), nuHot4: range(hot, 0), nuHot85: range(hi85, 0) });
  const th3 = (T, X0) => NET3.run({ T, rho: LT.ours.rho_gcc, X0, fuel: "p", until: 0.5, tmax: 1e22, maxSteps: 6000 }).t, nu3 = (T, X0) => -Math.log(th3(T * 1.1, X0) / th3(T, X0)) / Math.log(1.1);
  t.nuPP3 = f(nu3(1.5e7, { p: 0.7, he4: 0.3 }), 1); t.nuCNO3 = range([2e7, 2.5e7, 3e7].map((T) => nu3(T, NET3.SUN_X)), 0);
  // convective cores (the solver's qcc: the mass fraction inside the innermost radiative point) at the heaviest star, G = 10⁻¹⁷
  const q = (s) => { const r = L.find((x) => x.G === 1e-17 && x.s === s), st = r.stars.at(-1); return `${f(st.qcc, 2)}`; }; t.qcc15 = q(1.5152); t.qcc155 = q(1.55); t.qcc185 = q(1.85); t.mTop = f(L.find((x) => x.G === 1e-17 && x.s === 1.5152).stars.at(-1).m, 0);
  const ours = (m) => LT.ours.stars.reduce((a, b) => (Math.abs(Math.log(b.m / m)) < Math.abs(Math.log(a.m / m)) ? b : a)); t.oq1 = f(ours(1).qcc, 2); t.oq25 = f(ours(2.5).qcc, 2); t.oq5 = f(ours(5).qcc, 2); t.oqOn = f(LT.ours.stars.find((x) => x.qcc > 0.01).m, 2);
  t.lowQ = range(L.filter((r) => r.G === 1e-17).map((r) => r.stars.find((x) => x.m >= 0.5)?.qcc ?? NaN).filter(Number.isFinite), 2);
  t.ourS = "1.5152"; return t;
}

/* section 4's opacity: OPAL as measured input, the book's own checked against it (data/kappacheck.json), and the aged
   stars against MIST (data/mistcheck.json; sets: kramers, opal, and the metal-free free-opal, free-book against MIST [Fe/H] = −4) */
function opacityNumbers() {
  const K = J("kappacheck.json").summary, M = J("mistcheck.json").sets, rng = (set, key, ms) => { const v = ms.map((m) => M[set].stars[m]?.ratio?.[key]).filter((x) => x != null); if (v.length !== ms.length) throw new Error(`mistcheck ${set} ${key}: missing masses`); return [Math.min(...v), Math.max(...v)]; };
  const HEAVY = ["1", "1.25", "1.6", "2", "3"], S = M.opal.sun457, two = (a) => a.map((x) => f(x, 2));
  const [mLlo, mLhi] = two(rng("opal", "halfL", HEAVY)), [mRlo, mRhi] = two(rng("opal", "halfR", HEAVY)), [mTlo, mThi] = two(rng("opal", "halfTeff", HEAVY)), [kRlo, kRhi] = two(rng("kramers", "halfR", HEAVY)), [, kThi] = two(rng("kramers", "halfTeff", HEAVY));
  const lifeHeavy = rng("opal", "life", ["1.6", "2", "3"]), free = (set, m, k) => f(M[set].stars[m].ratio[k], 2);
  return { krLo: f(K.kramersOverOpal[0], 2), krHi: f(K.kramersOverOpal[1], 2), opZ: String(S.Z), opX0: f(S.X0, 4), opAlpha: f(S.alpha, 2), opL: f(S.L, 3), opR: f(S.R, 3), opTc: f(S.Tc, 2), opRho: f(S.rhoc, 0), opXc: f(S.Xc, 3),
    mLlo, mLhi, mRlo, mRhi, mTlo, mThi, kRlo, kRhi, kThi, lifeHlo: f(lifeHeavy[0], 2), lifeHhi: f(lifeHeavy[1], 2), lifeSun: f(M.opal.stars["1"].ratio.life, 2),
    bk0lo: f(K.freeOverOpal0[0], 2), bk0hi: f(K.freeOverOpal0[1], 2), bkg1lo: f(K.freeG1OverOpal0[0], 2), bkg1hi: f(K.freeG1OverOpal0[1], 2), bkMlo: pct(K.metShare[0]), bkMhi: pct(K.metShare[1]), bkLo: f(K.bookOverOpal[0], 2), bkHi: f(K.bookOverOpal[1], 2),
    fo1L: free("free-opal", "1", "halfL"), fo1T: free("free-opal", "1", "halfTeff"), fo1life: free("free-opal", "1", "life"), fb1L: free("free-book", "1", "halfL"), fb1T: free("free-book", "1", "halfTeff"), fb1life: free("free-book", "1", "life"),
    fo08L: free("free-opal", "0.8", "halfL"), fb08L: free("free-book", "0.8", "halfL"), fo16L: free("free-opal", "1.6", "halfL"), fb16L: free("free-book", "1.6", "halfL"), fo16life: free("free-opal", "1.6", "life"), fb16life: free("free-book", "1.6", "life") };
}
/* the 4D analogues aged (data/ages4.json, fusion/tools/ages4.mjs) */
/* what the aged first generation holds (fusion/tools/ash4.mjs): elements past helium as a share of each analogue's mass,
   by bands of strength, and the elements carrying it (any with ≥ 1% of a star's mass in the band) */
function ash4Numbers() {
  const A = J("ash4.json"), bands = [["A", (s) => s <= 1.55], ["B", (s) => s >= 1.6 && s <= 1.65], ["C", (s) => s === 1.7], ["D", (s) => s >= 1.75]], t = {};
  const nm = (z) => NAME4[z] ?? `element ${z}`, list = (a) => (a.length < 3 ? a.join(" and ") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`);
  for (const [k, ok] of bands) { const xs = Object.entries(A.byS).filter(([s]) => ok(+s)).flatMap(([, v]) => v); if (!xs.length) throw new Error(`ash4: no analogues in band ${k}`);
    const h = xs.map((x) => x.heavyShare), els = [...new Set(xs.flatMap((x) => x.lead.filter(([, v]) => v >= 0.01).map(([z]) => z)))].sort((a, b) => a - b);
    const p1 = (x) => (100 * x < 0.1 ? f(100 * x, 2) : 100 * x < 1 ? f(100 * x, 1) : f(100 * x, 0)); t[`ash${k}`] = `${p1(Math.min(...h))}–${p1(Math.max(...h))}%`; t[`ash${k}max`] = `${p1(Math.max(...h))}%`; t[`ash${k}el`] = els.length ? list(els.map(nm)) : "none above 1%"; }
  return t;
}
/* what the first generation gives back (data/yields4.json, fusion/tools/yields4.mjs, the G 1e-17 mass ladders): the net
   yield p by bands of strength over every declared choice (g, w, f, alpha) and both cut-offs (stars dying within 10 and
   30 Gyr); the rock row's and iron's shares of it; the lowest exploding mass at g 1.25; how many stars dying within 30 Gyr
   reached central hydrogen 10⁻³ and how far the rest were from it */
function yields4Numbers() {
  const Y = J("yields4.json"), sig = (x) => String(Number(x.toPrecision(2))), t = {};
  const bands = [["A", (s) => s <= 1.55], ["B", (s) => s >= 1.6 && s <= 1.65], ["C", (s) => s === 1.7], ["D", (s) => s >= 1.75]];
  for (const [k, ok] of bands) { const ys = Y.yields.filter((y) => ok(y.s)); if (!ys.length) throw new Error(`yields4: no yields in band ${k}`); const p = ys.map((y) => y.p);
    t[`yP${k}`] = `${sig(Math.min(...p))}–${sig(Math.max(...p))}`;
    const st = Y.stars.filter((x) => ok(x.s)), ex = st.filter((x) => x.choices.find((c) => c.g === 1.25).fate === "explodes").map((x) => x.m); t[`yEx${k}`] = ex.length ? String(Math.min(...ex)) : "none"; }
  // the mix at the middle choice (alpha 2.35, g 1.25, f 100, stars dying within 30 Gyr) at s ≤ 1.65, with winds of 3% and 30%
  const light = (y) => Object.entries(y.mix).filter(([z]) => /^\d+$/.test(z)).reduce((a, [, v]) => a + v, 0), mid = (w) => Y.yields.filter((y) => y.s <= 1.65 && y.alpha === 2.35 && y.g === 1.25 && y.w === w && y.f === 100 && y.tg === 30);
  const M3 = mid(0.03), M30 = mid(0.3), rng = (a) => `${Math.round(100 * Math.min(...a))}–${pct(Math.max(...a))}`, rock = M3.map((y) => y.mix.rock ?? 0);
  Object.assign(t, { yRock: rng(rock), yIronHi: pct(Math.max(...M3.map((y) => y.mix.iron ?? 0))), yLight: rng(M3.map(light)), yLight30: rng(M30.map(light)) });
  // near our strength (s ≤ 1.55) the explosions' iron against the rock row, over every choice; and from 1.6 the rock row alone
  const all = (ok) => Y.yields.filter((y) => ok(y.s) && (y.mix.rock ?? 0) + (y.mix.iron ?? 0) > 0), A = all((s) => s <= 1.55), Bm = M3.filter((y) => y.s >= 1.6);
  Object.assign(t, { yIronA: rng(A.map((y) => y.mix.iron ?? 0)), yRockA: rng(A.map((y) => y.mix.rock ?? 0)), yIronMidA: rng(M3.filter((y) => y.s <= 1.55).map((y) => y.mix.iron ?? 0)), yRockB: rng(Bm.map((y) => y.mix.rock ?? 0)) });
  if (!(Math.min(...M3.map((y) => (y.mix.rock ?? 0) + (y.mix.iron ?? 0))) > 0.8)) throw new Error("yields4: the rock row and iron are no longer most of what is returned at the middle choice; rewrite section 4 and the status page");
  if (!(Math.min(...Bm.map((y) => y.mix.rock ?? 0)) > 0.8)) throw new Error("yields4: from s 1.6 the rock row is no longer most of what is returned at the middle choice; rewrite section 4 and the status page");
  const ladS = new Set(Y.yields.map((y) => y.s)), short = Y.stars.filter((x) => ladS.has(x.s) && x.life < 30), reached = short.filter((x) => x.lifeFlag === "reached"), carried = short.filter((x) => x.lifeFlag !== "reached");
  Object.assign(t, { yN: String(Y.stars.filter((x) => ladS.has(x.s)).length), yNs: ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"][ladS.size], yShort: String(short.length), yReached: String(reached.length), yCarried: String(carried.length), yXcMax: f(Math.max(...carried.map((x) => x.XcEnd)), 2) });
  return t;
}
/* the energy of contraction (data/egrav.json, fusion/tools/egrav4.mjs): the checks on ours, the two stalled analogues
   resumed with it, and the first star past exhaustion (provisional). Stops if the checks on ours stop being small, or a
   stalled analogue no longer gets past its stall */
function egravNumbers() {
  const E = J("egrav.json"), o = E.ours, sig = (x, n = 2) => String(Number(x.toPrecision(n))), pc = (x, n = 2) => `${sig(Math.abs(100 * x), n)}%`;
  if (!(o.sun.maxAbsPct < 0.5 && o.m2.maxAbsPct < 0.5)) throw new Error("egrav: ε_grav moves ours by more than 0.5%: the text says it barely moves them");
  const st = Object.fromEntries(E.stalls.map((x) => [x.G, x])), a = st[1e-14], b = st[1e-11];
  if (!a || !b || !(a.moreMyr > 0 && b.moreMyr > 0)) throw new Error("egrav: a stalled analogue no longer gets past its stall");
  const yrs = (myr) => (myr >= 1000 ? `${sig(myr / 1000)} Gyr` : `${sig(myr)} Myr`), cmax = E.stalls.map((x) => Math.max(Math.abs(x.contraction.min), Math.abs(x.contraction.max)));
  const t = { egSun: sig(o.sun.maxAbsPct), egM2: sig(o.m2.maxAbsPct), egSunC: pc(o.sun.contraction.median, 1), egM2C: pc(o.m2.contractionNearEnd.max),
    egM2life: pc(o.m2.atXc.at(-1).dAge / 100, 1), egMore14: yrs(a.moreMyr), egMore11: yrs(b.moreMyr), egStall14: sig(a.stallGyr, 4), egStall11: sig(b.stallGyr, 4),
    egStop14: sig(a.stopGyr, 4), egStop11: sig(b.stopGyr, 4), egTc14: `${sig(a.TcStall, 3)} to ${sig(a.TcMin, 3)}`, egTc11: `${sig(b.TcStall, 3)} to ${sig(b.TcMin, 3)}`,
    egRho: `${Math.round(100 * (Math.min(a.rhoMaxOverStall, b.rhoMaxOverStall) - 1))}–${Math.round(100 * (Math.max(a.rhoMaxOverStall, b.rhoMaxOverStall) - 1))}%`,
    egC14: pc(cmax[E.stalls.indexOf(a)], 1), egC11: pc(cmax[E.stalls.indexOf(b)], 2) };
  const P = E.past; if (P) Object.assign(t, { egPmyr: sig(P.myr), egPH0: sig(P.Hfree[0]), egPH1: sig(P.Hfree[1]), egPproc: sig(P.processed[1]), egPR: sig(P.R), egPL: sig(P.L),
    egPT0: (Math.round(P.Teff[0] / 100) * 100).toLocaleString("en-GB"), egPT1: (Math.round(P.Teff[1] / 100) * 100).toLocaleString("en-GB"), egPTc0: sig(P.Tc[0], 2), egPTc1: sig(P.Tc[1], 2), egPrho: sig(P.rhoc),
    egPbk0: P.books ? sig(P.books[0], 2) : "—", egPbk1: P.books ? sig(P.books[1], 2) : "—" });
  return t;
}
/* the status page's own numbers (text/status.md): what metals do to 4D opacity (data/metals4.json, fusion/tools/metals4.mjs)
   and the charge law's plasma on the zero-age profiles (data/lensplasma.json) */
function statusNumbers() {
  const M4 = J("metals4.json"), M = M4.summary, P = J("lensplasma.json").byG, sg = (x) => `${x >= 0 ? "+" : "−"}${f(Math.abs(100 * x), 1)}%`, span = (k, i) => Object.values(P).map((g) => g[k][i]);
  const hl = Math.min(M["held0.01"][0], M["held0.02"][0]) - 1, hh = Math.max(M["held0.01"][1], M["held0.02"][1]) - 1;
  // the rock row by depth: at the centre and at the outermost sampled point (q ≈ 0.9), over both Z and every analogue
  const qs = [...new Set(M4.rows.map((r) => r.q))].sort((a, b) => a - b), at = (q) => M4.rows.filter((r) => r.q === q).flatMap((r) => [r["rock0.01"], r["rock0.02"]]).filter((x) => x != null);
  const xr = (v) => `×${f(Math.min(...v), 2)}–${Math.max(...v) < 10 ? f(Math.max(...v), 1) : f(Math.max(...v), 0)}`;
  // the second generation's first look (data/gen2.json, fusion/tools/gen2.mjs): both effects on, by mix
  const G2 = J("gen2.json"), both = (mix) => { const c = G2.cases.find((x) => x.mix === mix && x.seeds && x.kappa); if (!c) throw new Error(`gen2: no ${mix} case with seeds and opacity`); return c; };
  const pc = (x) => `${Math.round(Math.abs(100 * (x - 1)))}%`, rk = both("rock"), hd = both("held"), hmax = Math.max(...["L", "R", "Teff", "Tc", "burnt"].map((k) => Math.abs(hd[k] - 1)));
  if (!(rk.L < 1 && rk.R > 1 && rk.Teff < 1 && rk.burnt < 1)) throw new Error("gen2: the rock-row star no longer comes out fainter, larger, cooler and slower: rewrite the status page");
  return { g2Gyr: String(G2.runGyr), g2L: pc(rk.L), g2R: pc(rk.R), g2T: pc(rk.Teff), g2B: pc(rk.burnt), g2Held: `${Math.round(100 * hmax)}%`, g2Q: f(rk.qcc, 2), g2Q0: f(G2.qcc0, 2),
    m4HeldLo: sg(hl), m4HeldHi: sg(hh), m4RockCore: xr(at(qs[0])), m4RockOut: xr(at(qs.at(-1))), m4OutQ: f(qs.at(-1), 1), lpPPlo: f(Math.min(...span("ppScreen", 0)), 2), lpPPhi: f(Math.max(...span("ppScreen", 1)), 2),
    lpOpHi: f(Math.max(...span("factor", 1)), 2), lpDPlo: f(100 * Math.min(...span("dPgas", 0)), 1).replace("-", "−"), lpDPhi: f(100 * Math.max(...span("dPgas", 1)), 1).replace("-", "−") };
}
/* the methods page's numbers (text/methods.md), read from the code that runs, so the page can't drift from it: a pattern
   that stops matching stops the build */
function methodNumbers() {
  const src = (rel) => readFileSync(path.join(here, rel), "utf8"), grab = (rel, re, what) => { const m = src(rel).match(re); if (!m) throw new Error(`methods: ${what} not found in ${rel}`); return m[1]; };
  const ev = "../../atom/tools/evolve.mjs", y4 = "../../fusion/tools/yields4.mjs", list = (a) => (a.length < 3 ? a.join(" and ") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`);
  const arr = (rel, name) => JSON.parse(grab(rel, new RegExp(`for \\(const ${name} of (\\[[^\\]]+\\])`), `the ${name} choices`));
  const nq = +grab(ev, /const NQ = (\d+)/, "NQ"), bal = +grab(ev, /BALTOL = \+\(process\.env\.BALTOL \?\? ([\d.]+)\)/, "BALTOL");
  const four = grab(ev, /(Tburn: [^,]+, loose: [^,]+, fit: [^,]+),/, "the 4D world's constants"), tb = +four.match(/Tburn: ([\d.e+-]+)/)[1], lo = +four.match(/loose: ([\d.e+-]+)/)[1], fit4 = +four.match(/fit: ([\d.]+)/)[1];
  const fit3 = +grab("../../atom/js/mainseq.js", /opts\.fit \?\? ([\d.]+)/, "ours' fit"), settle = +grab(ev, /settle: \+\(kv\.settle \?\? ([\d.e+]+)\)/, "the 4D settle");
  const sci = (x) => { const e = Math.floor(Math.log10(x)), m = x / 10 ** e; return `${m === 1 ? "" : `${+m.toPrecision(3)} × `}10${String(e).replace("-", "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d])}`; };
  const pc = (x) => `${+(100 * x).toPrecision(3)}%`;
  return { mNQ: String(nq), mNQ1: String(nq + 1), mBal: pc(bal), mTburn: String(tb / 1e6), mLoose: sci(lo), mFit4: String(fit4), mFit3: String(fit3), mSettle: sci(settle),
    mGs: list(arr(y4, "g")), mWs: list(arr(y4, "w").map(pc)), mFs: list(arr(y4, "fx")), mAlphas: list(arr(y4, "alpha")), mTaus: list(JSON.parse(grab(y4, /for \(const tau of (\[[^\]]+\])/, "the tau choices"))), mTgs: list(arr(y4, "tg")) };
}
function ages4Numbers() {
  const A = J("ages4.json"), S = A.summary, s15 = A.stars.filter((x) => x.s === 1.5152 && x.half && (x.G !== 1e-17 || Math.abs(x.m - 0.7812) < 0.01)).sort((a, b) => b.G - a.G);
  // an analogue not yet halved must be one still running (a cut run), and the text then says where it got to
  const unhalved = A.stars.filter((x) => !x.half && S.notHalved.includes(`${x.G}/${x.s}`));
  // an unhalved analogue is either still running (cut) or stopped in the stall the text describes (with its record)
  if (unhalved.some((x) => x.state !== "cut" && !x.stall)) throw new Error(`ages4: an analogue stopped before halving, not in the described stall: ${S.notHalved}`);
  const st = A.stars.find((x) => x.stall && x.half), word = ["no", "one", "two", "three", "four", "five", "six"], who = (k) => { const [g, s] = k.split("/"); return `G = ${Gs(+g)} at s = ${s}`; };
  if (!st) throw new Error("ages4: the text describes a stalled analogue and there is none: rewrite it");
  const rest = (S.notAged.length ? ` The other ${word[S.notAged.length] ?? S.notAged.length} (${S.notAged.map(who).join("; ")}) never started on the earlier solver and are being aged now.` : "")
    + unhalved.filter((x) => x.stall).map((x) => ` The ${S.analogues === S.inGravity ? "last" : "other"}, at G = ${Gs(x.G)}, s = ${x.s}, burns far faster than the rest and stops ${f(100 * x.stall.short, 1)}% short of half, at ${f(x.lastGyr, 1)} Gyr, in the stall described below.`).join("")
    + unhalved.filter((x) => !x.stall).map((x) => ` One is still burning: at G = ${Gs(x.G)}, s = ${x.s}, the centre is down to ${f(x.lastXc, 2)} of its hydrogen after ${f(x.lastGyr, 1)} Gyr, from ${f(0.75, 2)}, faster than any other, and the run goes on.`).join("");
  const stalls = A.stars.filter((x) => x.stall), rng = (k, n = 2) => { const v = stalls.map((x) => x.stall.centre[k] ?? 0), lo = Math.min(...v), hi = Math.max(...v); return f(lo, n) === f(hi, n) ? f(lo, n) : `${f(lo, n)}–${f(hi, n)}`; };
  if (stalls.some((x) => x.s !== st.s || (x.stall.centre["2"] ?? 0) > 1e-3)) throw new Error("ages4: a stall the text doesn't describe (another s, or helium left at the centre)");
  return { a4grid: String(S.inGravity), a4rest: rest, a4nStall: word[stalls.length], a4stGs: stalls.map((x) => Gs(x.G)).sort().join(" and "), a4cH: rng("1"), a4cPx: rng("10"), a4cOx: rng("9"), a4stG: Gs(st.G), a4stS: String(st.s), a4stHalf: f(st.half, 1), a4stEnd: f(st.lastGyr, 1), a4stQ0: f(st.stall.qccPeak, 2), a4stQ1: f(st.stall.qccEnd, 2), a4stDt: f(st.stall.overGyr, 0), a4stRho: pct(st.stall.rhoUp - 1), a4stTc: pct(1 - st.stall.TcDown), a4stL: pct(st.stall.LUp - 1),
    a4n: String(S.halved), a4min: f(S.halfMin, 1), a4max: f(S.halfMax, 0), a4rlo: f(S.halfMin / A.convention, 1), a4rhi: f(S.halfMax / A.convention, 0), a4s15: s15.map((x) => f(x.half, 0)).join(", ") };
}
function ageNumbers() {
  const E = J("evolvecheck.json"), b = E.burning, P = E.present, R = E.refs, C = E.clock, H = E.history, c3 = E.machinery.steps, by = (d) => c3.find((x) => x.dX === d);
  const p1 = (x) => f(100 * x, 1);
  return { epsLo: f(Math.min(...b.map((x) => x.ratio)), 2), epsHi: f(Math.max(...b.map((x) => x.ratio)), 2), epsUnLo: f(Math.min(...b.map((x) => x.unscreened)), 2), epsUnHi: f(Math.max(...b.map((x) => x.unscreened)), 2),
    stL: f(E.structure.L, 2), stTc: f(E.structure.Tc, 2), stTcS: f(E.structure.modelS.Tc, 2), stRho: f(E.structure.rhoc, 0), stRhoS: f(E.structure.modelS.rhoc, 0), stRhoPct: pct(1 - E.structure.rhoc / E.structure.modelS.rhoc),
    stQ50: f(E.structure.q50, 3), msQ50: f(E.structure.modelS.q50, 3),
    X0cal: f(E.calibration.X0, 3), X0bp: f(E.calibration.bahcall2001X0, 3), X0run: f(E.calibration.runX0, 3),
    nowL: f(P.L, 3), nowTc: f(P.Tc, 2), bpTc: f(R.bahcall2001.Tc, 2), msTc: f(R.modelS.Tc, 2), nowRho: f(P.rhoc, 0), bpRho: f(R.bahcall2001.rhoc, 0), msRho: f(R.modelS.rhoc, 0), nowRhoPct: pct(1 - P.rhoc / R.bahcall2001.rhoc),
    nowXc: f(P.Xc, 3), bpXc: f(R.bahcall2001.Xc, 3), msXc: f(R.modelS.Xc, 3), b16Xc: f(R.vinyoles2017.Xc, 3), nowQ50: f(P.q50, 3), nowQ90: f(P.q90, 3), msQ90: f(R.modelS.q90, 3),
    relEarly: p1(H.relEarly), relLate: p1(H.relLate), L8: f(H.L.find((x) => x.t === 8).ours, 2), L8bp: f(H.L.find((x) => x.t === 8).bp, 2),
    tX008: f(H.tXc008, 1), tX001: f(H.tXc001, 1), polsX001: String(H.polsXc001Gyr), Xc65: f(H.Xc.find((x) => x.t === 6.5).ours, 3), Xc65bp: f(H.Xc.find((x) => x.t === 6.5).bp, 3),
    balLo: f(E.machinery.balance[0], 3), balHi: f(E.machinery.balance[1], 3), nMod: String(by(0.01).models), nModFine: String(by(0.005).models), dLfine: p1(Math.abs(by(0.005).L / by(0.01).L - 1)), dXfine: f(Math.abs(by(0.005).Xc - by(0.01).Xc), 4),
    clockAged: f(C.agedHalfGyr, 2), clockFresh: f(C.fresh.fixedHalfGyr, 1), clockFreshR: f(C.fresh.ratio, 2), freshTc: f(C.fresh.Tc, 1), clockSet: f(C.settled.fixedHalfGyr, 1), clockSetR: f(C.settled.ratio, 2), setTc: f(C.settled.Tc, 1), clockS3R: f(C.sectionThree.ratio, 2) };
}

/* the provenance ledger (provenance.json): every 'now' with a check recomputed here from the committed data; a mismatch
   stops the build, so the ledger can't drift from the results. The supplement section renders it (text/stages.md) */
const PCHECKS = {
  ash4Heavy: () => ash4Numbers().ashA,
  yields4P: () => yields4Numbers().yPA,
  egravOurs: () => { const o = J("egrav.json").ours; return `${o.sun.maxAbsPct.toPrecision(2)}/${o.m2.maxAbsPct.toPrecision(2)}`; },
  ages4Half: () => { const S = J("ages4.json").summary; return `${S.halfMin.toFixed(1)}–${S.halfMax.toFixed(0)}`; },
  opalSunRho: () => J("mistcheck.json").sets.opal.sun457.rhoc,
  opalHalfR: () => { const M = J("mistcheck.json").sets, v = ["1", "1.25", "1.6", "2", "3"].map((m) => M.opal.stars[m].ratio.halfR); return `${Math.min(...v).toFixed(2)}–${Math.max(...v).toFixed(2)}`; },
  metShareLo: () => +J("kappacheck.json").summary.metShare[0].toFixed(2),
  freeOverOpal0: () => J("kappacheck.json").summary.freeOverOpal0.map((x) => x.toFixed(2)).join("–"),
  windowSplits: () => { const w = J("windows.json"), B = w.burn.filter((b) => !b.asOurs), A = w.burnAlt.filter((b) => !b.asOurs); return B.filter((b) => { const a = A.find((x) => x.s === b.s && x.gx === b.gx); return a && a.kind !== b.kind; }).length; },
  windowKinds: () => { const B = J("windows.json").burn.filter((b) => !b.asOurs), n = (k) => B.filter((b) => b.kind === k).length; return `${n("past helium")}/${n("helium")}/${n("helium-3")}`; },
  qboundMax4: () => { const by = {}; for (const b of JSON.parse(readFileSync(path.join(here, "../../fusion/qbound4.json"), "utf8")).bounds) { const k = `${b.d}/${b.s}`; if (!by[k] || b.K > by[k].K) by[k] = b; } return Math.max(...Object.values(by).filter((b) => b.d === 4).map((b) => b.Qupper)); },
  qboundOurs: () => { const q = JSON.parse(readFileSync(path.join(here, "../../fusion/qbound4.json"), "utf8")).bounds.filter((b) => b.d === 3); return q.reduce((a, b) => (b.K > a.K ? b : a)).Qupper; },
  oursFixedHalf: () => J("lifetimes.json").ours.thGyr,
  ffRange: () => { const ff = J("surfacecheck.json").ff.map((x) => x.ratio); return `${f(Math.min(...ff), 2)}–${f(Math.max(...ff), 2)}`; },
  analogueStirs: () => ["surface.json", "surface-hm043.json"].reduce((n, file) => n + J(file).runs.filter((r) => r.sunEnv && r.sunEnv.mass > 1e-6).length, 0),
  clockSettled: () => J("evolvecheck.json").clock.settled.ratio,
  oursTcNow: () => J("evolvecheck.json").present.Tc,
  oursExhaust: () => J("evolvecheck.json").history.tXc001,
};
function provenance() {
  const P = JSON.parse(readFileSync(path.join(here, "provenance.json"), "utf8")), bad = [];
  const verify = (e, where) => { if (!e.check) return; const fn = PCHECKS[e.check]; if (!fn) throw new Error(`provenance ${where}: unknown check ${e.check}`); const v = fn();
    const ok = typeof e.now === "number" ? Math.abs(v - e.now) <= (e.tol ?? 0) : String(v) === String(e.now); if (!ok) bad.push(`${where} (${e.check}): the ledger says ${e.now}, the data ${v}`); };
  for (const s of P.stages) { for (const e of [...(s.moved ?? []), ...(s.held ?? [])]) verify(e, `${s.id}: ${e.claim}`); if (s.convention) verify(s.convention, `${s.id}: convention`); }
  if (bad.length) throw new Error(`provenance.json disagrees with the data:\n  ${bad.join("\n  ")}`);
  const mark = (e) => (e.check ? " ✓" : e.pending ? " ⧗" : "");
  const md = P.stages.map((s, i) => {
    const lines = [`### S1.${i + 1} ${s.title} (${s.date})`, "", `**Replaced:** ${s.replaced}. **By:** ${s.by}.${s.runs.length ? ` **Runs:** ${s.runs.map((r) => `\`${r}\``).join(", ")}.` : ""}`, "",
      s.rule ? `**Decision rule, fixed before the results:** ${s.rule}.` : "**Decision rule:** none was fixed in advance; the stage's results were read as they came.", ""];
    if (s.moved?.length) { lines.push("| what moved | before | after |", "|---|---|---|"); for (const e of s.moved) lines.push(`| ${e.claim} | ${e.before} | ${e.after}${mark(e)} |`); lines.push(""); }
    if (s.held?.length) { lines.push("| what held | |", "|---|---|"); for (const e of s.held) lines.push(`| ${e.claim} | ${e.value}${mark(e)} |`); lines.push(""); }
    if (s.convention) lines.push(`**Convention introduced:** ${s.convention.claim}: ${s.convention.value}${mark(s.convention)}.${s.convention.replacedBy ? ` Replaced in S1.${P.stages.findIndex((x) => x.id === s.convention.replacedBy) + 1}.` : ""}`, "");
    return lines.join("\n"); }).join("\n");
  const all = P.stages.flatMap((s) => [...(s.moved ?? []), ...(s.held ?? []), ...(s.convention ? [s.convention] : [])]);
  return { provenanceLedger: md, provStages: String(P.stages.length), provChecked: String(all.filter((e) => e.check).length), provAll: String(all.length), provPending: String(all.filter((e) => e.pending).length),
    provNoRule: String(P.stages.filter((s) => !s.rule).length), provFirst: P.stages[0].date, provLast: P.stages.at(-1).date };
}

/* the sources: refs.json (each with its status and what it supports) over the Crossref cache → CSL JSON for citeproc */
function references() {
  const R = JSON.parse(readFileSync(path.join(here, "refs.json"), "utf8")).refs, C = JSON.parse(readFileSync(path.join(here, "data", "crossref.json"), "utf8"));
  return R.map((r) => { const base = r.doi ? C[r.doi] : {}; if (r.doi && !base) throw new Error(`${r.key}: no Crossref record (node four/papers/p2/refs-crossref.mjs)`);
    const FIELDS = ["type", "title", "author", "container-title", "volume", "issue", "page", "issued", "publisher", "collection-title"], keep = {};
    for (const f of FIELDS) { let v = base?.[f]; if (v == null) continue; if (Array.isArray(v) && f !== "author") v = v[0]; if (f === "author") v = v.map(({ given, family, literal }) => ({ given, family, literal })); keep[f] = v; }
    if (base && !keep.page && base["article-number"]) keep.page = base["article-number"];
    return { ...keep, ...(r.csl ?? {}), id: r.key, ...(r.doi ? { DOI: r.doi } : {}) }; });
}
const CSL = path.join(DRAFT, "references.json");
const fill = (src, t) => src.replace(/\{\{(\w+)\}\}/g, (m, k) => { if (!(k in t)) throw new Error(`unknown token {{${k}}}`); return t[k]; });
const sections = () => readdirSync(TEXT).filter((x) => x.endsWith(".md")).sort();
const stamp = (name, md) => sha(md + ["windows.json", "masscheck.json", "lifetimes.json", "evolvecheck.json", "crossref.json"].map((f) => readFileSync(path.join(here, "data", f), "utf8")).join("") + readFileSync(path.join(here, "provenance.json"), "utf8") + readFileSync(path.join(here, "refs.json"), "utf8"));

function page(name, md) {
  let body = execFileSync("pandoc", ["-f", "markdown", "-t", "html5", "--mathml", "--citeproc", `--bibliography=${CSL}`, "-M", "link-citations=true", "-M", "link-bibliography=true", "-M", "reference-section-title=References"], { input: md.replace(/<!--[\s\S]*?-->\n?/g, ""), encoding: "utf8" });
  // say how far each source has been checked, as paper 1 does: a source checked only as another cites it is marked
  for (const r of JSON.parse(readFileSync(path.join(here, "refs.json"), "utf8")).refs.filter((x) => x.status === "secondary"))
    body = body.replace(new RegExp(`(<div id="ref-${r.key}"[^>]*>[\\s\\S]*?)(</div>)`), `$1 <em class="unchecked">(Checked as ${r.via.replace(/ \(.*$/, "")} cites it; the chapter itself is not online.)</em>$2`);
  const title = (md.match(/^# (.+)$/m) || [, name])[1];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="source-sha256" content="${stamp(name, md)}" />
<title>Paper 2 · ${title.replace(/[<>&]/g, "")}</title>
<link rel="icon" href="data:," />
<link rel="stylesheet" href="../../p1/paper.css" />
</head>
<body>
<div class="toolbar"><span class="brand"><a href="../../">four · papers</a></span><span>paper 2 · draft section</span><span class="grow" style="flex:1"></span><a href="../OUTLINE.md">outline</a></div>
<article class="sheet">
<div class="p-venue">four.mino.mobi · paper 2 · in preparation</div>
<div class="p-body single">
${body}
</div>
<div class="p-source">Generated from <code>papers/p2/text/${name}</code>: every number in it is read by <code>build.mjs</code> from the computed data or the solvers, so this text says what the code does.</div>
</article>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t = numbers(); mkdirSync(DRAFT, { recursive: true }); const stale = [], refs = references(), keys = new Set(refs.map((r) => r.id));
  if (!process.argv.includes("--check")) writeFileSync(CSL, JSON.stringify(refs, null, 1));
  for (const name of sections()) for (const [, k] of readFileSync(path.join(TEXT, name), "utf8").matchAll(/@([a-z]+\d{4}[a-z]?)/g)) if (!keys.has(k)) throw new Error(`${name}: unknown source @${k} (add it to refs.json)`);
  for (const name of sections()) { const md = fill(readFileSync(path.join(TEXT, name), "utf8"), t), out = path.join(DRAFT, name), html = out.replace(/\.md$/, ".html");
    if (process.argv.includes("--check")) { const ok = existsSync(out) && readFileSync(out, "utf8") === md && existsSync(html) && readFileSync(html, "utf8").includes(stamp(name, md)); if (!ok) stale.push(name); continue; }
    writeFileSync(out, md); writeFileSync(html, page(name, md)); console.log(`wrote draft/${name} and .html`); }
  if (process.argv.includes("--check")) { if (stale.length) { console.error(`papers/p2 drafts stale: ${stale.join(", ")} (node four/papers/p2/build.mjs)`); process.exit(1); } console.log("papers/p2 drafts current"); }
}
