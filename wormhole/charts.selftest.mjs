// wormhole charts selftest — run before touching charts.js:
//   node wormhole/charts.selftest.mjs
//
// The charting library is the reusable, un-fictional part, so it gets its own
// test: every chart type returns a well-formed, deterministic <svg> with no NaN
// coordinates, on representative inputs.

import "./stats.js";
import "./charts.js";
const C = globalThis.WORMHOLE_CHARTS;
const ST = globalThis.WORMHOLE_STATS;

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error("  ✗ " + msg); } }

// deterministic synthetic data
function series(n, f) { return Array.from({ length: n }, (_, i) => f(i)); }
const pts = series(80, i => ({ x: i / 8, y: 0.6 * (i / 8) + Math.sin(i) * 0.5 + 2, g: i % 3 }));
const groups = [
  { label: "A", values: series(60, i => 2 + Math.sin(i) + i * 0.01) },
  { label: "B", values: series(60, i => 3 + Math.cos(i) * 1.2) },
  { label: "C", values: series(60, i => 1.5 + Math.sin(i * 0.7)) },
];
const matrix = [
  [1, 0.7, -0.2, 0.1, -0.5], [0.7, 1, -0.1, 0.3, -0.4], [-0.2, -0.1, 1, 0.2, 0.1],
  [0.1, 0.3, 0.2, 1, -0.3], [-0.5, -0.4, 0.1, -0.3, 1],
];

const cases = {
  scatterFit: () => C.scatterFit({ points: pts, groups: ["A", "B", "C"], xlabel: "x", ylabel: "y", annot: "r = .61" }),
  violin: () => C.violin({ groups: groups, ylabel: "y" }),
  box: () => C.box({ groups: groups, ylabel: "y" }),
  ridgeline: () => C.ridgeline({ groups: groups, xlabel: "y" }),
  histogram: () => C.histogram({ values: groups[0].values, xlabel: "y" }),
  groupedBar: () => C.groupedBar({ categories: ["P", "Q", "R"], series: [{ name: "s1", values: [3, 5, 2] }, { name: "s2", values: [4, 1, 6] }], ylabel: "n" }),
  heatmap: () => C.heatmap({ matrix: matrix, labels: ["Index", "Cov", "Riv", "T4", "T5"], diverging: true, domain: [-1, 1], cblabel: "r" }),
  waterfall: () => C.waterfall({ items: [{ label: "A", value: 40 }, { label: "B", value: 15 }, { label: "Sub", value: 10 }, { label: "Unexpl.", value: 35, kind: "residual" }], ylabel: "%" }),
  forest: () => C.forest({ rows: [{ label: "Cov", est: 0.6, lo: 0.5, hi: 0.7 }, { label: "Riv", est: 0.1, lo: -0.02, hi: 0.22 }, { label: "S2", est: -0.3, lo: -0.45, hi: -0.15 }], xlabel: "effect", ref: 0 }),
  qq: () => C.qq({ values: groups[0].values }),
  line: () => C.line({ series: [{ name: "a", points: series(50, i => ({ x: i, y: Math.sin(i / 5) + 2 })) }, { name: "b", points: series(50, i => ({ x: i, y: Math.cos(i / 5) + 2 })) }], xlabel: "t", ylabel: "y", markers: false }),
  spectrum: () => { const s = series(120, t => Math.sin(2 * Math.PI * t / 12) + 0.3 * Math.sin(2 * Math.PI * t / 5) + 1); const pg = ST.periodogram(s); return C.spectrum({ freq: pg.freq, power: pg.power, period: pg.period }); },
  scree: () => C.scree({ explained: [0.52, 0.24, 0.13, 0.07, 0.04] }),
  biplot: () => { const rows = series(120, i => [Math.sin(i), Math.sin(i) * 0.9 + 0.1 * Math.cos(i), Math.cos(i * 2.1)]); const p = ST.pca(rows); return C.biplot({ scores: p.scores.map((s, i) => ({ x: s[0], y: s[1], g: i % 3 })), loadings: [0, 1, 2].map(j => ({ x: p.loadings[0][j], y: p.loadings[1][j], label: "V" + j })), groups: ["A", "B", "C"], xlabel: "PC1", ylabel: "PC2" }); },
  clusterScatter: () => C.clusterScatter({ points: series(90, i => ({ x: Math.sin(i) * 3 + (i % 3), y: Math.cos(i) * 3, g: i % 3 })), centroids: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: -1 }], groups: ["c1", "c2", "c3"], xlabel: "f1", ylabel: "f2" }),
  dendrogram: () => { const rows = series(12, i => [Math.sin(i), Math.cos(i * 1.3)]); const hc = ST.hclust(rows); return C.dendrogram({ root: hc.root, order: hc.order, labels: rows.map((_, i) => "i" + i), ylabel: "distance" }); },
  roc: () => { const sc = series(80, i => Math.sin(i)), lb = sc.map(v => v > 0 ? 1 : 0); const r = ST.roc(sc, lb); return C.roc({ points: r.points, auc: r.auc }); },
  kaplanMeier: () => { const km = ST.kaplanMeier(series(60, i => 1 + (i % 17)), series(60, i => i % 4 ? 1 : 0)); return C.kaplanMeier({ points: km.points, median: km.median }); },
  kaplanMeierMulti: () => {
    const a = ST.kaplanMeier(series(40, i => 1 + (i % 11)), series(40, () => 1));
    const b = ST.kaplanMeier(series(40, i => 4 + (i % 15)), series(40, () => 1));
    return C.kaplanMeier({ curves: [{ name: "low", points: a.points }, { name: "high", points: b.points }] });
  },
  lollipop: () => C.lollipop({ items: [{ label: "aa", value: 3 }, { label: "bb", value: -1.2 }, { label: "cc", value: 5 }], xlabel: "score" }),
  logisticCurve: () => C.logisticCurve({ points: series(70, i => ({ x: i / 7, y: i > 35 ? 1 : 0 })), curve: series(30, i => ({ x: i / 3, p: 1 / (1 + Math.exp(-(i / 3 - 5))) })), xlabel: "x" }),
  stem: () => { const s = series(100, t => Math.sin(2 * Math.PI * t / 10)); const a = ST.acf(s, 20); return C.stem({ values: a.values, ci: a.ci }); },
  stackedBar: () => C.stackedBar({ categories: ["P", "Q", "R"], series: [{ name: "s1", values: [3, 5, 2] }, { name: "s2", values: [4, 1, 6] }, { name: "s3", values: [2, 2, 2] }] }),
  network: () => {
    const nodes = series(14, i => ({ id: "n" + i, g: i % 2, deg: 3 }));
    const edges = series(18, i => ({ s: "n" + (i % 14), t: "n" + ((i * 3 + 1) % 14) }));
    return C.network({ nodes: nodes, edges: edges, groups: ["A", "B"] });
  },
  hexbin: () => C.hexbin({ points: series(300, i => ({ x: Math.sin(i) * 3 + Math.sin(i * 0.7), y: Math.cos(i * 1.1) * 3 })), xlabel: "x", ylabel: "y" }),
  lineSegments: () => C.line({ series: [{ name: "y", points: series(60, i => ({ x: i, y: i < 30 ? 1 : 4 })) }], vlines: [{ x: 30, label: "cp" }], segments: [{ x0: 0, x1: 30, y: 1 }, { x0: 30, x1: 59, y: 4 }], xlabel: "t", ylabel: "y" }),
};

for (const name of Object.keys(cases)) {
  let svg;
  try { svg = cases[name](); } catch (e) { failures++; console.error("  ✗ " + name + " threw: " + e.message); continue; }
  ok(typeof svg === "string" && svg.indexOf("<svg") === 0, name + ": returns an <svg> string");
  ok(svg.indexOf("viewBox") > 0, name + ": has a viewBox");
  ok(svg.indexOf("NaN") < 0, name + ": no NaN coordinates");
  ok(svg.indexOf("undefined") < 0, name + ": no undefined in output");
  ok(svg.trim().endsWith("</svg>"), name + ": closes the svg");
  ok(cases[name]() === svg, name + ": deterministic");
}

// colour helpers
ok(/^#[0-9a-f]{6}$/i.test(C.seq(0.5)), "sequential colour is a hex");
ok(/^#[0-9a-f]{6}$/i.test(C.div(-0.3)), "diverging colour is a hex");
ok(C.CAT.length >= 6, "categorical palette has >= 6 colours");

if (failures === 0) {
  console.log("✓ wormhole charts selftest passed");
  process.exit(0);
} else {
  console.error(`\n✗ ${failures} check(s) failed`);
  process.exit(1);
}
