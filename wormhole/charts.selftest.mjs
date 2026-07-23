// wormhole charts selftest — run before touching charts.js:
//   node wormhole/charts.selftest.mjs
//
// The charting library is the reusable, un-fictional part, so it gets its own
// test: every chart type returns a well-formed, deterministic <svg> with no NaN
// coordinates, on representative inputs.

import "./stats.js";
import "./charts.js";
const C = globalThis.WORMHOLE_CHARTS;

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
