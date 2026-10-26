/* ATOM⁴'s live search: two molecules finding how best to sit together, from random starts, on the force field fitted
   to Hartree–Fock pairs (js/forcefields.js). Our water beside Xater: 6 numbers to search in 3D, 10 in 4D. Each start
   tumbles and slides down to the nearest minimum (BFGS, js/landscape.js); each minimum found is a basin, coloured and
   counted; the discovery curve shows how many basins the starts have turned up. The energies are the model's; the
   basins Hartree–Fock has scored (js/pairmin.js) carry its number. */
import { posed, poseSteps, rng, planes } from "./landscape.js";
import { modelEnergy } from "./ffmodel.js";
import { FORCEFIELDS } from "./forcefields.js";
import { CENSUS } from "./census.js";
import { PAIRMIN } from "./pairmin.js";
import { CLUSTERS } from "./clusters.js";
import { randomRotation } from "./md.js";
import { makeTile, eye, turn } from "./tile.js";

const $ = (id) => document.getElementById(id);
const KCAL = 627.509, SCALE = 1 / 8.5;
const PALETTE = ["#ffd166", "#6fe0ff", "#ff7aa8", "#7dffb0", "#c79bff", "#ff9f43", "#9ad0ff", "#e9e4da", "#b8f28b", "#ffb3c7"];
const WORLD = { 3: { name: "our water", colour: "#d9483b", hfLabel: "H₂O" }, 4: { name: "Xater", colour: "#c79bff", hfLabel: "Xater" } };

/* a world's search: its molecule, the model, the census's pair (the reference line), and the run's tallies */
function makeSearch(d) {
  const ff = FORCEFIELDS[d], m = CENSUS[d].find((x) => x.Z === ff.Z), th = (m.param * Math.PI) / 180, pad = (v) => [...v, ...new Array(d - v.length).fill(0)];
  const A = [pad([0, 0]), pad([m.R * Math.cos(th / 2), m.R * Math.sin(th / 2)]), pad([m.R * Math.cos(th / 2), -m.R * Math.sin(th / 2)])];
  const pm = PAIRMIN[d], E = (B) => modelEnergy(ff.p, A, B), census = modelEnergy(ff.p, pm.censusPair.A, pm.censusPair.B);
  return { d, A, E, census, pm, rnd: rng(1234 + d), basins: [], curve: [0], starts: 0, apart: 0, unfinished: 0, cur: null, trace: [] };
}
function newStart(S) {
  const { d, A, rnd } = S, R0 = randomRotation(d, rnd), dir = Array.from({ length: d }, () => rnd() - 0.5), n = Math.hypot(...dir), D = S.pm.best.dXX * (0.9 + 0.6 * rnd());
  const x0 = [...new Array(planes(d).length).fill(0), ...dir.map((v) => (v / n) * D)];
  S.cur = { R0, gen: poseSteps(S.E, A, R0, x0, d), x: x0, f: S.E(posed(A, R0, x0, d)), g: 1 }; S.trace = [S.cur.f];
}
/* where a finished descent ended: a basin (the same within 0.3 kcal/mol and 0.15 bohr; its Hartree–Fock score if
   scored), or apart (the two drifted out of each other's reach), or unfinished (out of steps with the slope not yet
   gone: not a minimum, so not counted as one) */
function settle(S) {
  const B = posed(S.A, S.cur.R0, S.cur.x, S.d), dXX = Math.hypot(...S.A[0].map((v, i) => v - B[0][i])), e = S.cur.f; S.starts++;
  if (S.cur.g > 2e-5) { S.unfinished++; S.last = null; }
  else if (e > -0.1 / KCAL) { S.apart++; S.last = null; }
  else {
    let b = S.basins.find((q) => Math.abs(q.E - e) < 0.3 / KCAL && Math.abs(q.dXX - dXX) < 0.15);
    if (!b) { const hf = S.pm.modelMinima.find((q) => Math.abs(q.model - e) < 0.3 / KCAL && Math.abs(q.dXX - dXX) < 0.15); b = { E: e, dXX, hits: 0, colour: PALETTE[S.basins.length % PALETTE.length], hf: hf ? hf.hf : null }; S.basins.push(b); }
    b.hits++; S.last = b;
  }
  S.curve.push(S.basins.length);
}
/* advance: in "watch" a few descent steps a frame; in "race" whole descents */
function advance(S, mode) {
  if (!S.cur || S.next) { S.next = false; newStart(S); }
  const take = (v) => { S.cur.R0 = v.R0; S.cur.x = v.x; S.cur.f = v.f; S.cur.g = v.g; };
  if (mode === "race") { for (let k = 0; k < 4; k++) { let r; while (!(r = S.cur.gen.next()).done) take(r.value); settle(S); newStart(S); } return; }
  // the first steps, where the molecules swing round, at an easy pace; the long fine-tuning after them faster. A
  // finished descent holds its pair, in its basin's colour, before the next start
  for (let k = 0, n = Math.min(16, 2 + (S.trace.length >> 4)); k < n; k++) { const r = S.cur.gen.next(); if (r.done) { settle(S); S.hold = 45; S.next = true; return; } take(r.value); S.trace.push(r.value.f); }
}
function sceneOf(S) {
  const balls = [], bonds = [];
  for (const mol of [0, 1]) { const o = balls.length; balls.push({ p: [0, 0, 0, 0], c: WORLD[S.d].colour, r: 0.07 }, { p: [0, 0, 0, 0], el: "H", r: 0.04 }, { p: [0, 0, 0, 0], el: "H", r: 0.04 }); bonds.push([o, o + 1], [o, o + 2]); }
  return { balls, bonds };
}
function place(S, scene) {
  const B = posed(S.A, S.cur.R0, S.cur.x, S.d), mid = S.A[0].map((v, i) => (v + B[0][i]) / 2), put = (b, p) => { for (let k = 0; k < 4; k++) b.p[k] = k < S.d ? (p[k] - mid[k]) * SCALE : 0; };
  S.A.forEach((p, i) => put(scene.balls[i], p)); B.forEach((p, i) => put(scene.balls[3 + i], p));
  scene.balls[3].c = S.hold > 0 && S.last ? S.last.colour : WORLD[S.d].colour;
}
/* drawn over the tile: this descent's energy, the census's pair and the best basin found so far */
function overlay(S) {
  return (g, w, h) => {
    const x0 = 10, y0 = h - 76, W = w - 20, H = 64, lo = 1.15 * Math.min(S.census, ...S.basins.map((b) => b.E), ...S.trace), hi = -0.2 * lo; // above zero clipped: the starts' repulsion isn't the story
    const Y = (e) => y0 + H * (1 - (Math.min(hi, e) - lo) / (hi - lo));
    g.fillStyle = "rgba(5,6,10,0.75)"; g.fillRect(x0 - 4, y0 - 4, W + 8, H + 8);
    g.strokeStyle = "rgba(255,255,255,0.18)"; g.beginPath(); g.moveTo(x0, Y(0)); g.lineTo(x0 + W, Y(0)); g.stroke();
    g.setLineDash([4, 3]); g.strokeStyle = "#ffd166"; g.beginPath(); g.moveTo(x0, Y(S.census)); g.lineTo(x0 + W, Y(S.census)); g.stroke(); g.setLineDash([]);
    g.strokeStyle = "#e9e4da"; g.lineWidth = 2; g.beginPath(); S.trace.forEach((e, i) => { const x = x0 + (W * i) / Math.max(40, S.trace.length - 1); i ? g.lineTo(x, Y(e)) : g.moveTo(x, Y(e)); }); g.stroke(); g.lineWidth = 1;
    g.font = "10px ui-monospace, monospace"; g.fillStyle = "#ffd166"; g.fillText(`census's pair ${(S.census * KCAL).toFixed(1)}`, x0 + 2, Y(S.census) - 3);
    g.fillStyle = "#e9e4da"; g.fillText(`now ${(S.cur.f * KCAL).toFixed(1)} kcal/mol`, x0 + W - 120, y0 + 10);
  };
}
/* the basins, best first, and the discovery curves of both worlds */
function report(runs) {
  for (const S of runs) {
    const el = $(`searchBasins${S.d}`); if (!el) continue; const bs = S.basins.slice().sort((a, b) => a.E - b.E).slice(0, 8);
    el.innerHTML = `<b>${WORLD[S.d].name}</b>: ${S.starts} starts, ${S.basins.length} ${S.basins.length === 1 ? "basin" : "basins"}${S.apart ? `, ${S.apart} drifted apart` : ""}${S.unfinished ? `, ${S.unfinished} unfinished` : ""}` + bs.map((b) => `<span class="basin"><i style="background:${b.colour}"></i>${(b.E * KCAL).toFixed(1)}${b.hf != null ? ` <small>(HF ${(b.hf * KCAL).toFixed(1)})</small>` : ""} ×${b.hits}</span>`).join("");
  }
  const cv = $("searchCurve"); if (!cv) return;
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const nMax = Math.max(50, ...runs.map((S) => S.starts)), bMax = Math.max(5, ...runs.map((S) => S.basins.length)) * 1.15, X = (n) => 40 + ((w - 50) * n) / nMax, Y = (b) => h - 24 - ((h - 34) * b) / bMax;
  g.strokeStyle = "rgba(255,255,255,0.25)"; g.beginPath(); g.moveTo(40, 10); g.lineTo(40, h - 24); g.lineTo(w - 10, h - 24); g.stroke();
  g.font = "10px ui-monospace, monospace"; g.fillStyle = "#9aa"; g.fillText("starts", w - 50, h - 8); g.fillText("basins", 2, 18); g.fillText(String(nMax), w - 30, h - 12);
  for (const S of runs) { g.strokeStyle = S.d === 3 ? "#ff9f6b" : "#9fe3ff"; g.lineWidth = 1.6; g.beginPath(); S.curve.forEach((b, n) => (n ? g.lineTo(X(n), Y(b)) : g.moveTo(X(n), Y(b)))); g.stroke(); g.lineWidth = 1; g.fillStyle = g.strokeStyle; g.fillText(`${WORLD[S.d].name} ${S.basins.length}`, X(S.curve.length - 1) - 70, Y(S.curve[S.curve.length - 1]) + (S.d === 3 ? 13 : -5)); }
}

export function buildSearch() {
  const host = $("searchTiles"); if (!host) return;
  let mode = "watch";
  const runs = [3, 4].map((d) => {
    const S = makeSearch(d), scene = sceneOf(S); newStart(S); place(S, scene);
    makeTile(host, scene, {
      title: d === 3 ? "our water: 6 numbers" : "Xater: 10 numbers", sub: d === 3 ? "3 to move, 3 to turn" : "4 to move, 6 to turn: turn it through w, or slice it",
      R: 1.2, spin: [0.0009, 0.0006], start: d === 3 ? turn(eye(), 1, 2, -0.3) : turn(turn(eye(), 0, 3, 0.45), 1, 2, 0.3),
      step: () => { if (S.hold > 0) S.hold--; else advance(S, mode); place(S, scene); }, overlay: overlay(S),
    });
    return S;
  });
  const modes = $("searchMode");
  if (modes) modes.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; mode = b.dataset.m; for (const x of modes.children) x.classList.toggle("on", x === b); });
  setInterval(() => report(runs), 400);
  return runs;
}

/* crowds: how many minima clusters of n molecules have, by world (js/clusters.js; n = 2 is the pair search's funnel).
   Solid: minima found, told apart by energy and shape; the bar below each point runs down to the count when minima
   are merged under a test three times looser (a floor); dashed: the Chao1 estimate of how many there are, drawn only
   where it can be trusted (fewer than half the minima seen just once) */
const CL = { 3: { name: "our water", colour: "#ff9f6b" }, 4: { name: "Xater", colour: "#9fe3ff" }, 4.9: { name: "XH₃ (element 9)", colour: "#c79bff" } };
export function drawClusters() {
  const cv = $("clusterChart"), tab = $("clusterTab"); if (!cv) return;
  const keys = Object.keys(CL).filter((k) => CLUSTERS[k]), series = keys.map((k) => ({ k, pts: [{ n: 2, found: 1, floor: 1, chao: 1, ok: true }, ...Object.values(CLUSTERS[k]).map((r) => ({ n: r.n, found: r.minima, floor: r.floor, chao: r.chao1, ok: r.chaoTrusted }))] }));
  const draw = () => {
    const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const nMax = Math.max(...series.flatMap((s) => s.pts.map((p) => p.n))), top = Math.max(10, ...series.flatMap((s) => s.pts.map((p) => (p.ok ? p.chao : p.found)))), L = 46, B = h - 28, X = (n) => L + ((w - L - 16) * (n - 2)) / (nMax - 2), Y = (v) => B - ((B - 14) * Math.log10(v)) / Math.log10(top * 1.3);
    g.font = "10px ui-monospace, monospace"; g.strokeStyle = "rgba(255,255,255,0.25)"; g.fillStyle = "#9aa";
    g.beginPath(); g.moveTo(L, 10); g.lineTo(L, B); g.lineTo(w - 10, B); g.stroke();
    for (let n = 2; n <= nMax; n++) g.fillText(String(n), X(n) - 3, B + 14);
    g.fillText("molecules", w - 70, B + 24);
    for (const v of [1, 10, 100, 1000]) if (v <= top * 1.3) { g.fillText(String(v), 8, Y(v) + 3); g.strokeStyle = "rgba(255,255,255,0.07)"; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(w - 10, Y(v)); g.stroke(); }
    g.fillStyle = "#9aa"; g.fillText("minima", 4, 10);
    series.forEach((s, i) => {
      const c = CL[s.k].colour; g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 2;
      g.beginPath(); s.pts.forEach((p, j) => (j ? g.lineTo(X(p.n), Y(p.found)) : g.moveTo(X(p.n), Y(p.found)))); g.stroke();
      g.setLineDash([4, 3]); g.lineWidth = 1.2; g.beginPath(); s.pts.filter((p) => p.ok).forEach((p, j) => (j ? g.lineTo(X(p.n), Y(p.chao)) : g.moveTo(X(p.n), Y(p.chao)))); g.stroke(); g.setLineDash([]); g.lineWidth = 1;
      for (const p of s.pts) { g.beginPath(); g.arc(X(p.n), Y(p.found), 3, 0, 7); g.fill(); const dx = (i - 1) * 4; g.lineWidth = 2; g.beginPath(); g.moveTo(X(p.n) + dx, Y(p.found)); g.lineTo(X(p.n) + dx, Y(p.floor)); g.stroke(); g.lineWidth = 1; }
      g.fillText(CL[s.k].name, L + 10, 22 + 13 * i);
    });
  };
  draw(); addEventListener("resize", draw);
  if (tab) tab.innerHTML = `<table><tr><th>molecules</th>${keys.map((k) => `<th colspan="3">${CL[k].name}</th>`).join("")}</tr><tr><th></th>${keys.map(() => "<th>minima found</th><th>best (kcal/mol)</th><th>starts finding it</th>").join("")}</tr>${[3, 4, 5, 6, 7].map((n) => `<tr><td>${n}</td>${keys.map((k) => { const r = CLUSTERS[k][n]; return r ? `<td>${r.floor < r.minima ? `${r.floor}–` : ""}${r.minima}${!r.chaoTrusted ? ` <small>(still climbing)</small>` : r.chao1 > r.minima + 0.5 ? ` <small>(≈${Math.round(r.chao1)})</small>` : ""}</td><td>${(r.best[0].E * KCAL).toFixed(1)}</td><td>${((100 * r.best[0].hits) / r.starts).toFixed(0)}%</td>` : "<td>–</td><td></td><td></td>"; }).join("")}</tr>`).join("")}</table>`;
}
