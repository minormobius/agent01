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

const here = path.dirname(fileURLToPath(import.meta.url)), TEXT = path.join(here, "text"), DRAFT = path.join(here, "draft");
const J = (f) => JSON.parse(readFileSync(path.join(here, "data", f), "utf8"));
const sha = (t) => createHash("sha256").update(t).digest("hex");
const pct = (x) => `${Math.round(100 * x)}%`, f = (x, n = 2) => x.toFixed(n);
const sci = (x, n = 2) => { const e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e; return `${m.toFixed(n - 1)} × 10^${String(e).replace("-", "−")}^`; };
const range = (xs, n = 1) => `${f(Math.min(...xs), n)}–${f(Math.max(...xs), n)}`;

export function numbers() {
  const D = J("windows.json"), M = J("masscheck.json"), t = {};
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
  const cq = (s) => M.cycleQ4D.find((x) => x.s === s), open = M.cycleQ4D.filter((x) => x.ladder > 0);
  t.cycOpenTo = String(Math.max(...open.map((x) => x.s))); t.cycQL = open.map((x) => `+${f(x.ladder, 1)}`).join(", ");
  t.cycQoff = [1.5152, 1.55, 1.6].map((s) => { const v = cq(s).ladderLessOffset; return `${v >= 0 ? "+" : "−"}${f(Math.abs(v), 1)}`; }).join(" / ");
  t.cycQG = `${f(Math.max(...M.cycleQ4D.map((x) => x.grid)), 1)} to ${f(Math.min(...M.cycleQ4D.map((x) => x.grid)), 1)}`.replace(/-/g, "−");
  for (const k of Object.keys(t)) if (typeof t[k] === "string") t[k] = t[k].replace(/(\d)-(\d)/g, "$1–$2").replace(/^-/, "−");
  return t;
}

const fill = (src, t) => src.replace(/\{\{(\w+)\}\}/g, (m, k) => { if (!(k in t)) throw new Error(`unknown token {{${k}}}`); return t[k]; });
const sections = () => readdirSync(TEXT).filter((x) => x.endsWith(".md")).sort();
const stamp = (name, md) => sha(md + readFileSync(path.join(here, "data", "windows.json"), "utf8") + readFileSync(path.join(here, "data", "masscheck.json"), "utf8"));

function page(name, md) {
  const body = execFileSync("pandoc", ["-f", "markdown", "-t", "html5", "--mathml"], { input: md.replace(/<!--[\s\S]*?-->\n?/g, ""), encoding: "utf8" });
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
  const t = numbers(); mkdirSync(DRAFT, { recursive: true }); const stale = [];
  for (const name of sections()) { const md = fill(readFileSync(path.join(TEXT, name), "utf8"), t), out = path.join(DRAFT, name), html = out.replace(/\.md$/, ".html");
    if (process.argv.includes("--check")) { const ok = existsSync(out) && readFileSync(out, "utf8") === md && existsSync(html) && readFileSync(html, "utf8").includes(stamp(name, md)); if (!ok) stale.push(name); continue; }
    writeFileSync(out, md); writeFileSync(html, page(name, md)); console.log(`wrote draft/${name} and .html`); }
  if (process.argv.includes("--check")) { if (stale.length) { console.error(`papers/p2 drafts stale: ${stale.join(", ")} (node four/papers/p2/build.mjs)`); process.exit(1); } console.log("papers/p2 drafts current"); }
}
