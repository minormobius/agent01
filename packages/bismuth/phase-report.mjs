#!/usr/bin/env node
// bismuth — render the phase-space experiments (phase.mjs) as a page.
//
//   node packages/bismuth/phase-report.mjs A.json B.json C.json C2.json D.json --out report.html
//
// Reads any number of phase.json files (each holds some of the experiments),
// merges them, and writes one HTML document with the figures inline as SVG.
// No library; the charts are drawn to scale here.

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1] : "phase-report.html";
const files = args.filter((a, i) => a.endsWith(".json") && i !== outIdx + 1);
const EX = {};
for (const f of files) { const j = JSON.parse(readFileSync(f, "utf8")); Object.assign(EX, j.experiments); }
const fmt = (n) => Number(n).toLocaleString("en-US");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ── fates: a diverging scale from "the crystal wins" to "the worms win" ──
const FATE = {
  grew: { cls: "f-grew", label: "reached its budget" },
  growing: { cls: "f-growing", label: "still growing" },
  steady: { cls: "f-steady", label: "steady" },
  eroding: { cls: "f-eroding", label: "eroding" },
  "grew-then-eaten": { cls: "f-eroding", label: "grew, then eaten" },
  stalled: { cls: "f-eroding", label: "masons stalled" },
  collapse: { cls: "f-collapse", label: "collapsed" },
  bloom: { cls: "f-collapse", label: "worm bloom" },
};

// a grid of outcomes: rows × cols, each cell a run; cell text = the mass at the end
function heatmap({ rows, cols, cell, rowLabel, colLabel, rowTitle, colTitle, title, note }) {
  const W = 84, H = 46, L = 92, T = 44, R = 12, B = 46;
  const w = L + cols.length * W + R, h = T + rows.length * H + B;
  let s = `<figure class="fig"><figcaption><b>${esc(title)}</b>${note ? ` — ${esc(note)}` : ""}</figcaption><div class="scroll"><svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">`;
  s += `<text class="ax-title" x="${L + (cols.length * W) / 2}" y="14" text-anchor="middle">${esc(colTitle)}</text>`;
  s += `<text class="ax-title" transform="translate(14 ${T + (rows.length * H) / 2}) rotate(-90)" text-anchor="middle">${esc(rowTitle)}</text>`;
  cols.forEach((c, j) => { s += `<text class="ax" x="${L + j * W + W / 2}" y="${T - 10}" text-anchor="middle">${esc(colLabel(c))}</text>`; });
  rows.forEach((r, i) => {
    s += `<text class="ax" x="${L - 8}" y="${T + i * H + H / 2 + 4}" text-anchor="end">${esc(rowLabel(r))}</text>`;
    cols.forEach((c, j) => {
      const run = cell(r, c);
      if (!run) return;
      const f = FATE[run.outcome] || FATE.steady;
      const x = L + j * W, y = T + i * H;
      const tip = `${f.label} · mass ${fmt(run.mass)} of a peak ${fmt(run.peak)} · laid ${fmt(run.laid)}, eaten ${fmt(run.eaten)}${run.repairs !== undefined ? `, ${fmt(run.repairs)} repaired` : ""}${run.wormPeak > 4 ? ` · worms peaked at ${fmt(run.wormPeak)}` : ""}`;
      s += `<g class="cell ${f.cls}" data-tip="${esc(tip)}"><rect x="${x + 1}" y="${y + 1}" width="${W - 2}" height="${H - 2}" rx="3"/><text class="v" x="${x + W / 2}" y="${y + H / 2 + 4}" text-anchor="middle">${fmt(run.mass)}</text></g>`;
    });
  });
  s += `</svg></div></figure>`;
  return s;
}

// a line chart of one measure over ticks, several runs as series; one scale
function lines({ title, note, series, xmax, ymax, xLabel, yLabel, unit }) {
  const W = 560, H = 220, L = 58, T = 16, R = 16, B = 40;
  const pw = W - L - R, ph = H - T - B;
  const xs = (t) => L + (t / xmax) * pw, ys = (v) => T + ph - (v / ymax) * ph;
  let s = `<figure class="fig"><figcaption><b>${esc(title)}</b>${note ? ` — ${esc(note)}` : ""}</figcaption><div class="scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}">`;
  const yt = 4;
  for (let i = 0; i <= yt; i++) { const v = (ymax * i) / yt, y = ys(v); s += `<line class="grid" x1="${L}" x2="${L + pw}" y1="${y}" y2="${y}"/><text class="ax" x="${L - 6}" y="${y + 4}" text-anchor="end">${fmt(Math.round(v))}</text>`; }
  for (let i = 0; i <= 5; i++) { const t = (xmax * i) / 5; s += `<text class="ax" x="${xs(t)}" y="${T + ph + 16}" text-anchor="middle">${fmt(Math.round(t / 1000))}k</text>`; }
  s += `<text class="ax-title" x="${L + pw / 2}" y="${H - 6}" text-anchor="middle">${esc(xLabel)}</text>`;
  s += `<text class="ax-title" transform="translate(12 ${T + ph / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>`;
  series.forEach((sr, k) => {
    const pts = sr.points.filter((p) => p[0] <= xmax).map((p) => `${xs(p[0]).toFixed(1)},${ys(Math.min(ymax, p[1])).toFixed(1)}`).join(" ");
    s += `<polyline class="ln s${(k % 4) + 1}" points="${pts}"/>`;
    const last = sr.points[sr.points.length - 1];
    s += `<circle class="dot s${(k % 4) + 1}" cx="${xs(Math.min(xmax, last[0]))}" cy="${ys(Math.min(ymax, last[1]))}" r="3.5"/>`;
  });
  s += `</svg></div><ul class="legend">${series.map((sr, k) => `<li><i class="sw s${(k % 4) + 1}"></i>${esc(sr.label)}</li>`).join("")}</ul></figure>`;
  return s;
}

const A = EX.A, B = EX.B, C = EX.C, C2 = EX.C2, D = EX.D, L = EX.L, Gz = EX.G;
const find = (runs, pred) => runs.find(pred);
const Pof = (bite) => (3 * 0.04 * bite);

let figA = "", figB = "", figC2 = "", tableC2 = "", figL = "", figG = "";

// ── long runs: {runs: [{label, series: [[t, mass, worms, ...]]}], note} — a worms panel and a crystal panel on one time axis ──
function longFigs(X, title) {
  const xmax = Math.max(...X.runs.map((r) => r.series[r.series.length - 1][0]));
  const wmax = Math.max(...X.runs.map((r) => Math.max(...r.series.map((s) => s[2]))));
  const mmax = Math.max(...X.runs.map((r) => Math.max(...r.series.map((s) => s[1]))));
  const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / p) * p; };
  return lines({ title: title + " — worms", note: X.note || "", xmax, ymax: nice(wmax), xLabel: "ticks after release", yLabel: "worms alive", series: X.runs.map((r) => ({ label: r.label, points: r.series.map((s) => [s[0], s[2]]) })) })
    + lines({ title: title + " — crystal", note: "the same runs: the crystal's mass", xmax, ymax: nice(mmax), xLabel: "ticks after release", yLabel: "bricks in the crystal", series: X.runs.map((r) => ({ label: r.label, points: r.series.map((s) => [s[0], s[1]]) })) });
}
if (L) figL = longFigs(L, "C2 · the same worms, run on");
if (Gz) figG = longFigs(Gz, "C3 · grazers");

// ── A ──
if (A) {
  const rows = A.masonsList, cols = A.bites;
  for (const recycle of [false, true]) {
    figA += heatmap({
      rows, cols,
      cell: (m, b) => find(A.runs, (r) => r.params.masons === m && r.params.worms.bite === b && r.params.recycle === recycle),
      rowLabel: (m) => `${m} mason${m === 1 ? "" : "s"}`, colLabel: (b) => (b === 0 ? "no worms" : `P ${Pof(b).toFixed(3)}`),
      rowTitle: "producer", colTitle: "worm pressure, bricks a tick (3 worms × speed 0.04 × bite)",
      title: recycle ? "A · the sink, recycling on" : "A · the sink, recycling off",
      note: "budget 4,000; worms released at 600 bricks; the number is the crystal's mass after 300k ticks",
    });
  }
}

// ── B ──
if (B) {
  figB += heatmap({
    rows: B.M0s, cols: B.bites,
    cell: (m, b) => find(B.runs, (r) => r.params.release === m && r.params.worms.bite === b),
    rowLabel: (m) => `M₀ ${fmt(m)}`, colLabel: (b) => `P ${Pof(b).toFixed(3)}`,
    rowTitle: "mass at release", colTitle: "worm pressure, bricks a tick",
    title: "B · released at mass M₀", note: "8 masons (capacity ≈ 0.06 a tick), budget 20,000, no recycling, 150k ticks",
  });
}

// ── C2 series ──
if (C2) {
  const pick = (masons, bite, spawn, starve) => find(C2.runs, (r) => r.params.masons === masons && r.params.worms.bite === bite && r.params.worms.spawnAfter === spawn && r.params.worms.starve === starve);
  const chem = [[16, 0.01, 15, 400, "16 masons"], [32, 0.01, 15, 400, "32 masons"]].map(([m, b, s, st, label]) => ({ run: pick(m, b, s, st), label })).filter((x) => x.run);
  if (chem.length) {
    figC2 += lines({ title: "C2 · the chemostat — worms", note: "appetite 0.0004 a tick each (speed 0.04 × bite 0.01), split after 15 bricks, fade after 400 unfed moves, recycling on", xmax: 300000, ymax: 120, xLabel: "ticks after release", yLabel: "worms alive", series: chem.map((x) => ({ label: x.label, points: x.run.series.map((s) => [s[0], s[2]]) })) });
    figC2 += lines({ title: "C2 · the chemostat — crystal", note: "the same two runs: the crystal's mass, bricks", xmax: 300000, ymax: 10000, xLabel: "ticks after release", yLabel: "bricks in the crystal", series: chem.map((x) => ({ label: x.label, points: x.run.series.map((s) => [s[0], s[1]]) })) });
  }
  const boom = [[32, 0.03, 15, 150, "32 masons · bite 0.03 · fade after 150"], [16, 0.03, 15, 400, "16 masons · bite 0.03 · fade after 400"]].map(([m, b, s, st, label]) => ({ run: pick(m, b, s, st), label })).filter((x) => x.run);
  if (boom.length) {
    figC2 += lines({ title: "C2 · a bloom", note: "appetite 0.0012 a tick each: the worms outrun the producer", xmax: 300000, ymax: 820, xLabel: "ticks after release", yLabel: "worms alive", series: boom.map((x) => ({ label: x.label, points: x.run.series.map((s) => [s[0], s[2]]) })) });
    figC2 += lines({ title: "C2 · a bloom — crystal", note: "the same runs: the crystal's mass", xmax: 300000, ymax: 4200, xLabel: "ticks after release", yLabel: "bricks in the crystal", series: boom.map((x) => ({ label: x.label, points: x.run.series.map((s) => [s[0], s[1]]) })) });
  }
  // the table
  tableC2 += `<div class="scroll"><table><thead><tr><th>masons</th><th>bite</th><th>split after</th><th>fade after</th><th>fate</th><th>worms peak</th><th>left</th><th>born</th><th>faded</th><th>eaten</th><th>mass</th></tr></thead><tbody>`;
  for (const r of C2.runs) tableC2 += `<tr><td>${r.params.masons}</td><td>${r.params.worms.bite}</td><td>${r.params.worms.spawnAfter}</td><td>${r.params.worms.starve}</td><td class="${(FATE[r.outcome] || FATE.steady).cls}-t">${(FATE[r.outcome] || FATE.steady).label}</td><td>${fmt(r.wormPeak)}</td><td>${fmt(r.wormsLeft)}</td><td>${fmt(r.births)}</td><td>${fmt(r.deaths)}</td><td>${fmt(r.eaten)}</td><td>${fmt(r.mass)}</td></tr>`;
  tableC2 += `</tbody></table></div>`;
}

// ── D table ──
let dTable = "";
if (D) {
  dTable = `<div class="scroll"><table><thead><tr><th>masons</th><th>ticks to 2,000 bricks</th><th>ticks a brick</th><th>fed sites</th><th>terraces on the midline</th><th>box</th></tr></thead><tbody>`;
  for (const r of D.runs) dTable += `<tr><td>${r.masons}</td><td>${fmt(r.ticks)}</td><td>${r.perBrick.toFixed(1)}</td><td>${fmt(r.fed)}</td><td>${r.terraces}</td><td>${r.box.join("×")}</td></tr>`;
  dTable += `</tbody></table></div>`;
}

// ── A repair table: healing fraction ──
let repairNote = "";
if (A) {
  const rs = A.runs.filter((r) => r.params.worms.bite > 0 && !r.params.recycle && r.repairs !== undefined);
  const rows = rs.map((r) => `<tr><td>${r.params.masons}</td><td>${Pof(r.params.worms.bite).toFixed(3)}</td><td>${fmt(r.eaten)}</td><td>${fmt(r.repairs)}</td><td>${(100 * r.repairs / Math.max(1, r.eaten)).toFixed(0)}%</td><td>${fmt(r.laid)}</td><td>${(100 * r.repairs / Math.max(1, r.laid)).toFixed(0)}%</td></tr>`).join("");
  repairNote = `<div class="scroll"><table><thead><tr><th>masons</th><th>P</th><th>eaten</th><th>healed</th><th>of the wounds</th><th>laid</th><th>of the laying</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

const html = `<title>Masons and Worms</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root {
  --bg: #f6f4f9; --paper: #fdfcfe; --ink: #1c1730; --ink-2: #4d4763; --ink-3: #7d7790; --line: #d9d4e4;
  --accent: #8a5cf5; --gold: #b07b1d;
  --grew: #2a78d6; --growing: #86b6ef; --steady: #d8d4e2; --eroding: #f0a39a; --collapse: #e34948;
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #4a3aa7;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #100d18; --paper: #17131f; --ink: #ece8f4; --ink-2: #b9b2c9; --ink-3: #857e97; --line: #2b2638;
  --accent: #a98cff; --gold: #d9a54a;
  --grew: #3987e5; --growing: #1c5cab; --steady: #383547; --eroding: #8f3b34; --collapse: #e66767;
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #9085e9;
  color-scheme: dark;
} }
:root[data-theme="dark"] {
  --bg: #100d18; --paper: #17131f; --ink: #ece8f4; --ink-2: #b9b2c9; --ink-3: #857e97; --line: #2b2638;
  --accent: #a98cff; --gold: #d9a54a;
  --grew: #3987e5; --growing: #1c5cab; --steady: #383547; --eroding: #8f3b34; --collapse: #e66767;
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #9085e9;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.55 "Source Serif 4", Georgia, "Times New Roman", serif; }
main { max-width: 74ch; margin: 0 auto; padding: 48px 24px 96px; }
h1, h2, h3 { font-family: "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; text-wrap: balance; line-height: 1.1; margin: 0; }
h1 { font-size: 44px; font-weight: 700; letter-spacing: -0.01em; }
h2 { font-size: 26px; font-weight: 700; margin-top: 56px; }
h3 { font-size: 19px; font-weight: 600; margin-top: 28px; }
.eyebrow { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 14px; }
.lede { font-size: 20px; color: var(--ink-2); margin: 18px 0 0; }
p { margin: 14px 0 0; }
p + p { margin-top: 12px; }
em { font-style: italic; }
b { font-weight: 600; }
code, .mono { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 0.86em; }
.abstract { margin: 36px 0 0; padding: 22px 26px; border-left: 3px solid var(--accent); background: var(--paper); }
.abstract p { margin: 0; }
.abstract p + p { margin-top: 10px; }
.claim { display: grid; grid-template-columns: auto 1fr; gap: 6px 18px; margin: 24px 0 0; padding: 0; list-style: none; }
.claim li { display: contents; }
.claim .k { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold); padding-top: 5px; }
.fig { margin: 26px 0 0; padding: 18px 18px 14px; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; }
figcaption { font-family: "Bricolage Grotesque", sans-serif; font-size: 14px; color: var(--ink-2); margin-bottom: 12px; }
figcaption b { color: var(--ink); font-weight: 600; }
.scroll { overflow-x: auto; }
svg { display: block; max-width: 100%; height: auto; }
svg .ax { font: 12px "IBM Plex Mono", ui-monospace, monospace; fill: var(--ink-2); }
svg .ax-title { font: 12px "Bricolage Grotesque", sans-serif; fill: var(--ink-3); }
svg .cell rect { fill: var(--steady); stroke: var(--paper); stroke-width: 2; }
svg .cell text.v { font: 12px "IBM Plex Mono", ui-monospace, monospace; fill: var(--ink); }
svg .f-grew rect { fill: var(--grew); } svg .f-grew text { fill: #fff; }
svg .f-growing rect { fill: var(--growing); }
svg .f-eroding rect { fill: var(--eroding); }
svg .f-collapse rect { fill: var(--collapse); } svg .f-collapse text { fill: #fff; }
svg .cell { cursor: default; }
svg .cell:hover rect { stroke: var(--ink); }
svg .grid { stroke: var(--line); stroke-width: 1; }
svg .ln { fill: none; stroke-width: 2; stroke-linejoin: round; }
svg .s1 { stroke: var(--s1); } svg .s2 { stroke: var(--s2); } svg .s3 { stroke: var(--s3); } svg .s4 { stroke: var(--s4); }
svg .dot { stroke: var(--paper); stroke-width: 2; }
svg .dot.s1 { fill: var(--s1); } svg .dot.s2 { fill: var(--s2); } svg .dot.s3 { fill: var(--s3); } svg .dot.s4 { fill: var(--s4); }
.legend { display: flex; gap: 18px; flex-wrap: wrap; margin: 10px 0 0; padding: 0; list-style: none; font: 13px "Bricolage Grotesque", sans-serif; color: var(--ink-2); }
.legend .sw { display: inline-block; width: 18px; height: 3px; vertical-align: middle; margin-right: 6px; border-radius: 2px; }
.sw.s1 { background: var(--s1); } .sw.s2 { background: var(--s2); } .sw.s3 { background: var(--s3); } .sw.s4 { background: var(--s4); }
.key { display: flex; gap: 14px; flex-wrap: wrap; margin: 14px 0 0; font: 13px "Bricolage Grotesque", sans-serif; color: var(--ink-2); }
.key i { display: inline-block; width: 14px; height: 14px; border-radius: 3px; vertical-align: -2px; margin-right: 6px; }
table { border-collapse: collapse; width: 100%; margin: 18px 0 0; font: 13.5px/1.4 "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: 6px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { font-family: "Bricolage Grotesque", sans-serif; font-weight: 600; color: var(--ink-2); font-size: 12.5px; }
th:first-child, td:first-child { text-align: left; }
.f-grew-t, .f-growing-t { color: var(--grew); } .f-eroding-t { color: var(--s2); } .f-collapse-t { color: var(--collapse); }
#tip { position: fixed; z-index: 9; pointer-events: none; background: var(--ink); color: var(--bg); font: 12.5px/1.4 "Bricolage Grotesque", sans-serif; padding: 7px 10px; border-radius: 5px; max-width: 320px; display: none; }
.note { color: var(--ink-3); font-size: 15px; }
hr { border: 0; border-top: 1px solid var(--line); margin: 48px 0 0; }
a { color: var(--accent); }
@media (prefers-reduced-motion: no-preference) { svg .cell rect { transition: stroke 0.12s; } }
</style>
<main>
<div class="eyebrow">bismuth · packages/bismuth/phase.mjs · seed 48112 · deterministic</div>
<h1>Masons and Worms</h1>
<p class="lede">What one producer and one consumer do to a crystal, measured. The masons carry bricks from the melt to the crystal; the worms carry them out, or, with recycling, back. A budget, a lay rate, a bite rate: three numbers, and the fates they buy.</p>

<div class="abstract">
<p><b>The masons are a rate, not a front.</b> One mason or sixteen lay the same crystal with the same terraces; sixteen lay it seventeen times faster. Fronts are the terrace rule's; masons are flux.</p>
<p><b>Without recycling every worm wins eventually.</b> The budget is a finite potential and the worms are a constant drain; the crystal's life is budget ÷ pressure. With recycling the melt is a closed pool and the crystal becomes a living steady state: a thousand bricks standing while twenty-five thousand pass through.</p>
<p><b>The crystal heals, but only at its edges.</b> A worm's bite leaves a kink, and kinks fill first; up to half the wounds close. Bites in the middle of a face starve like everything else in the middle of a face: the Berg effect is the immune system's blind spot.</p>
<p><b>Worms that breed have two fates, and neither is a cycle.</b> Below a threshold appetite they starve out; above it they bloom and eat the crystal to nothing, however slowly they start (a run that looked steady at 300k ticks hit a thousand worms by 700k). No cycles anywhere, because a worm inside a crystal always has a brick under it: its intake does not fall with the crystal's density until the crystal is nearly gone. Restricting worms to exposed bricks, so the surface bounds intake, buys long coexistence, 480k ticks on a capped crystal, that ends in the grazers' own extinction: eating edges smooths the crystal and removes their food.</p>
</div>

<h2>What the two agents are</h2>
<p>A mason moves one brick from the melt into the crystal, at a site the three laws allow: bonds set the rate (Kossel), the rim feeds and the face centre starves (Berg), the anisotropy weights the faces. A worm moves through bricks along the bond graph and, on leaving one, takes it with probability <code>bite</code>. Neither eats the other. The worm eats the <em>product</em>, the standing structure, not the producer, so it is not a predator of masons. It is a decomposer: a fungus in a log, a termite in a beam. With recycling on, the bricks it takes return to the melt as budget, and the pair is a nutrient cycle: producer, structure, decomposer, pool.</p>
<p>That is also why "first derivative" is right for the masons and wrong for the worms. The masons are <em>d</em>(crystal)/<em>dt</em>; the worms are a second flux on the same quantity, of opposite sign, with a different dependence on the crystal: masons lay where the terrace rule feeds (rims: roughly the crystal's edge length), worms bite wherever they stand (anywhere the crystal is). The potential is the budget, and it is exactly the terminal mass in the absence of worms: <code>budget × (1 + coolExtra)</code>. The natural size scale you sense is that number; the shape at that size is the terrace rule's.</p>

<h2>D · One mason or sixteen</h2>
<p>The observation that thinning the colony to one mason did not change the number of growth fronts is correct, and it is the cleanest fact in the system. A mason lays a brick, returns to the melt, and arrives again along a straight ray from outside, striking a random corner or edge. One mason therefore samples every front in turn; sixteen sample them sixteen times as often. The set of fronts is the terrace rule's verdict on the shape, which does not know how many masons there are.</p>
${dTable}
<p class="note">Fed sites: empty sites next to a brick that the terrace rule would feed, counted at 2,000 bricks. The count and the terrace count do not move with the colony; the time does, almost exactly in inverse proportion.</p>

<h2>A · The sink</h2>
<p>Three worms at speed 0.04 and a bite between 0 and 1: a drain of <em>P</em> = 3 × 0.04 × bite bricks a tick at most. Against one to sixteen masons, whose free-running lay rates measure 0.006, 0.018, 0.028, 0.061 and 0.103 bricks a tick. Budget 4,000, worms released once the crystal has 600 bricks.</p>
${A ? "" : "<p class='note'>(experiment A not loaded)</p>"}
${figA}
<div class="key"><span><i style="background:var(--grew)"></i>reached its budget</span><span><i style="background:var(--growing)"></i>still growing at 300k</span><span><i style="background:var(--steady)"></i>steady</span><span><i style="background:var(--eroding)"></i>eroding, or grew then eaten</span><span><i style="background:var(--collapse)"></i>collapsed</span></div>
<p>Two regimes, and the switch is recycling. Without it, every cell with any worms at all is on its way to zero: the masons stop when the budget is spent, and the drain does not. What looks like survival on the right of the top panel is a clock that has not run out (a budget of 4,000 against a drain of 0.012 needs 330k ticks). With recycling the same drain feeds the same masons, and the crystal settles at a mass where laying matches biting: 16 masons against <em>P</em> 0.12 hold about 900 bricks while 25,000 bricks pass through them in 300k ticks. That is the ouroboros, and it is a steady state, not perpetual motion: the engine still stops a colony after its cool-down, and the refund only reaches a colony that is still live.</p>
<p>The collapse boundary sits close to <em>P</em> ≈ lay rate, as it should, but the masons under attack lay well below their free rate. Eight masons free-running lay 0.06 a tick; the same eight against <em>P</em> 0.012 lay 0.018. The rest of their effort is the next section.</p>

<h3>The crystal heals at its edges</h3>
<p>A bite leaves a hole with four or five bonds around it, which is exactly the site the Kossel rule fills first. So the masons repair. The experiment counts a brick laid into a site a worm had emptied as a repair:</p>
${repairNote}
<p>Between a tenth and a half of the wounds close, and repairs are a growing share of everything the masons lay as pressure rises. The half that never closes is the half the terrace rule will not feed: a hole in the middle of a face, or deep inside, where no arrival ray lands and no walk reaches. The Berg effect starves face centres of growth, and it starves them of repair too. A worm that grazes (<code>depth −1</code>) is healed; a worm that mines (<code>depth +1</code>) is not.</p>

<h2>B · Released at mass M₀</h2>
<p>Is there an Allee threshold: a mass below which a crystal cannot outgrow a given drain? With a constant drain and a lay rate that scales with the crystal's edge length, mean-field says yes, at <em>M*</em> ≈ (<em>P</em>/<em>a</em>)<sup>3/2</sup>. Eight masons, budget 20,000 so the cap is out of reach in the window, worms released at 100 to 1,600 bricks.</p>
${figB}
<p>The threshold is there in the columns (the crystal survives <em>P</em> 0.006 and 0.012 at every M₀, and dies at 0.096 at most), but it is not monotone in M₀. A crystal released at 800 bricks outlived one released at 1,600 under the heaviest drain, because the 800-brick crystal healed at 0.07 a tick and the 1,600-brick one at 0.019. The difference is geometry: a bigger hopper has a bigger pit, more face, and more of its wounds where the terrace rule does not feed. So the potential is not a scalar. The crystal's shape, not just its mass, decides whether it can defend itself, and the hopper habit, which spends its mass on faces, is a bad shape to defend.</p>

<h2>C · Worms that breed</h2>
<p>Give the worms the two things a predator has, reproduction from eating (<code>spawnAfter</code>: split after that many bricks) and death from not eating (<code>starve</code>: fade after that many unfed moves), and ask the classical question: do the populations cycle?</p>
<p>The first attempt (four worms at speed 0.08, bite 0.2, splitting after 2 to 8 bricks) blooms in every cell: 400 worms in a few thousand ticks and a crystal eaten to nothing. Per-capita appetite 0.016 a tick against eight masons laying 0.06 means eight worms already exceed the producer. So the second grid uses small appetites (speed 0.04, bite 0.01 or 0.03) against producers with real capacity (16 or 32 masons), a closed melt (recycling on), and a budget of 30,000.</p>
${figC2}
${figL}
${tableC2}
<p>Two fates. <b>Extinction</b> when a worm cannot eat its split quota before it fades (bite 0.01, fade after 150: the four founders die having eaten 33 bricks between them, and the crystal grows on as if nothing happened). <b>A bloom</b> otherwise, fast or slow. The two cells the 300k-tick grid labelled "steady" (59 worms on 16 masons, 110 on 32) were slow blooms caught early: run on, the population keeps doubling every 60k ticks or so and the crystal turns over; the 16-mason run reaches a thousand worms at 700k ticks with the crystal eaten to nothing, no remnant, no second act. The producer's capacity sets how big the crystal gets before the bloom catches it, not whether it does.</p>
${figL}
<p>No cycles, in any cell, and no interior equilibrium, and the mechanism is plain once seen. A worm tunnelling inside a crystal has a brick under it at every step, so its intake per move is the bite probability, full stop, whatever the crystal's mass. Its numbers grow on a <em>stock</em>, not a flux, and nothing tells it to slow down until the stock is gone and it finds itself drifting on skin. That is overshoot, the Easter Island shape, not Lotka–Volterra. Lotka–Volterra needs the prey to reproduce in proportion to its own numbers and the predator's intake to fall with prey density; the crystal does neither. It is laid at a rate the masons set, and eaten at a rate the worms set.</p>

<h3>C3 · Grazers: intake bounded by the surface</h3>
<p>So give the worm a functional response: let it eat only exposed bricks, those with three bonds or fewer (<code>exposed 3</code>), and keep it near the surface (<code>depth −1</code>). Now its food is the crystal's surface, which grows more slowly than its mass and, on a capped crystal, stops growing.</p>
${figG}
<p>On an uncapped crystal the grazers hold at six to sixteen for 700k ticks while the crystal grows to 13,000 bricks, then bloom and eat it, because the surface grew with the crystal until it could feed a bloom: the crystal grows itself into its own consumer. On a crystal capped at 6,000 the same grazers hold at four to twelve for 480k ticks, 35 born and 39 faded, and then die out with the crystal intact at 5,980 bricks. They ate the corners and edges, the masons healed what they could while the colony was live, and when it cooled the grazers were left smoothing a crystal that had fewer and fewer edges to give. A grazer erodes its own niche. On a crystal capped at 3,000 the surface-to-mass ratio is high enough that the same grazers win and the crystal collapses; at twice the bite, so does the 6,000 one.</p>
<p>That is the phase space of the breeding worm, then: extinction, bloom, and, for a consumer that can only eat what the geometry exposes, a long coexistence that ends one way or the other. Long relative to everything else in the system (the crystal's whole growth takes 60k ticks), but not a fixed point. Cycles would need one more thing this system lacks: a prey that breeds. The colony's <code>birthEvery</code> can give the masons that; nothing yet lets a worm eat a mason.</p>

<h2>Where this sits</h2>
<p>The nearest relatives are not Life-like automata but the growth models: the Eden model and diffusion-limited aggregation for the masons (an Eden cluster with a Berg rule is close to what a hopper is), and etching or corrosion models for the worms. Growth plus a constant sink is harvested logistic growth, which has the Allee-like collapse seen in A and B. Growth plus a consumer that breeds on a stock is overshoot; a consumer whose intake is bounded by the surface is a consumer–resource system with a functional response, which here gives long transients rather than a fixed point; a consumer that breeds <em>and</em> a producer that breeds is where the oscillations live. In the language of the lab: the masons' colony has <code>birthEvery</code> and <code>retireAfter</code>, so the producer can be made to breed today; the missing law is worms that eat masons.</p>

<h2>Next experiments, if these were the first</h2>
<ul>
<li><b>Shape as potential.</b> Repeat B across habits (hopper, plate, tower, staircase) at equal mass. The prediction from the healing result is that towers defend themselves and plates do not.</li>
<li><b>Miners.</b> The same drain with <code>depth +1</code>: they should hollow the crystal into a shell that fails all at once, a different collapse from the grazers' smoothing.</li>
<li><b>The grazers' fixed point.</b> A budget the masons never finish (a colony that never cools) with <code>exposed 3</code>: healing then never stops, and the grazers might hold. The engine can do this today with a budget beyond the window.</li>
<li><b>The producer breeds.</b> <code>birthEvery</code> on the masons with recycling and breeding worms: the first place cycles could appear without a new agent.</li>
<li><b>Tilings.</b> The bond graph differs: kagome triangles have three edge-neighbours, Penrose rhombs four, hexagons six. The worm's random walk and the healing rule both change with coordination number; the chemostat ratio should not.</li>
</ul>
<hr>
<p class="note">Everything here is <code>node packages/bismuth/phase.mjs</code> against the engine at the commit that shipped it, seed 48112. The runs are deterministic; the tables and figures regenerate from the JSON with <code>phase-report.mjs</code>. Ticks are engine ticks; a tick is every mason and every worm moving once.</p>
</main>
<div id="tip"></div>
<script>
(function(){
  var tip = document.getElementById('tip');
  document.querySelectorAll('.cell').forEach(function(c){
    c.addEventListener('mousemove', function(e){ tip.textContent = c.getAttribute('data-tip'); tip.style.display = 'block'; tip.style.left = Math.min(window.innerWidth - 340, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; });
    c.addEventListener('mouseleave', function(){ tip.style.display = 'none'; });
  });
})();
</script>
`;
writeFileSync(OUT, html);
console.log("wrote " + OUT);
