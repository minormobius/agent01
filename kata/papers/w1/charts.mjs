#!/usr/bin/env node
/* W1's figures, as SVG, from the data (node kata/papers/w1/charts.mjs; < 1 s). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nu, wire } from "../../wire4/js/anem.js";
import { TH, cyl, RIB } from "./values.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)), D = path.join(here, "../../wire4/data"), J = (f) => JSON.parse(fs.readFileSync(path.join(D, f), "utf8"));
const X_ = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;"), INK = "#1c1c1c", DIM = "#777", C = ["#1f6fb4", "#c0392b", "#2e8b57", "#8e44ad"];
function chart({ w = 620, h = 380, xl, yl, xr, yr, logx = false, xt, yt, series, notes = [] }) { const L = 62, R = 16, T = 14, B = 48, fx = (x) => (logx ? Math.log(x / xr[0]) / Math.log(xr[1] / xr[0]) : (x - xr[0]) / (xr[1] - xr[0])), X = (x) => L + fx(x) * (w - L - R), Y = (y) => T + (1 - (y - yr[0]) / (yr[1] - yr[0])) * (h - T - B);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="${INK}"><rect width="${w}" height="${h}" fill="#fff"/>`;
  for (const x of xt) s += `<line x1="${X(x)}" y1="${T}" x2="${X(x)}" y2="${h - B}" stroke="#e6e6e6"/><text x="${X(x)}" y="${h - B + 17}" text-anchor="middle" fill="${DIM}">${x}</text>`;
  for (const y of yt) s += `<line x1="${L}" y1="${Y(y)}" x2="${w - R}" y2="${Y(y)}" stroke="${y === 0 ? "#888" : "#e6e6e6"}"/><text x="${L - 7}" y="${Y(y) + 4}" text-anchor="end" fill="${DIM}">${y}</text>`;
  s += `<rect x="${L}" y="${T}" width="${w - L - R}" height="${h - T - B}" fill="none" stroke="#999"/><text x="${L + (w - L - R) / 2}" y="${h - 8}" text-anchor="middle">${xl}</text><text transform="translate(15 ${T + (h - T - B) / 2}) rotate(-90)" text-anchor="middle">${yl}</text>`;
  for (const q of series) { const pts = q.pts.filter((p) => p[1] >= yr[0] - 1e-9 && p[1] <= yr[1] + 1e-9);
    if (q.line !== false) s += `<polyline fill="none" stroke="${q.col}" stroke-width="2" ${q.dash ? `stroke-dasharray="${q.dash}"` : ""} points="${pts.map((p) => X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join(" ")}"/>`;
    if (q.dots) for (const p of pts) s += `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="${q.r || 4}" fill="${q.hollow ? "#fff" : q.col}" stroke="${q.col}" stroke-width="1.5"/>`;
    if (q.label) s += `<text x="${X(q.at[0])}" y="${Y(q.at[1])}" fill="${q.col}" text-anchor="${q.anchor || "start"}">${X_(q.label)}</text>`; }
  for (const n of notes) s += `<text x="${X(n[0])}" y="${Y(n[1])}" fill="${n[4] || DIM}" text-anchor="${n[3] || "start"}">${X_(n[2])}</text>`;
  return s + "</svg>"; }
const out = (name, svg) => { fs.mkdirSync(path.join(here, "fig"), { recursive: true }); fs.writeFileSync(path.join(here, "fig", name + ".svg"), svg); console.error("wrote fig/" + name + ".svg"); };
/* 1: growth rate against wavenumber along the wire at Re 200 (the ladder's grid), and against Re at beta = 2.5 */
{ const L = J("ladder-200.json").rows, m = (k) => L.filter((r) => r.m === k && r.beta <= 6).sort((a, b) => a.beta - b.beta).map((r) => [r.beta, r.growth]);
  out("growth-beta", chart({ xl: "wavenumber along the wire, β (1/diameters)", yl: "growth rate at Re 200", xr: [0, 4.2], yr: [-0.2, 0.05], xt: [0, 1, 2, 3, 4], yt: [-0.2, -0.15, -0.1, -0.05, 0, 0.05],
    series: [{ pts: m(0).filter((q) => q[0] >= 1), col: C[0], dots: true, label: "m = 0 (symmetric)", at: [2.9, 0.035] }, { pts: m(0).filter((q) => q[0] < 1), col: C[0], dots: true, hollow: true, line: false }, { pts: m(1), col: C[1], dots: true, label: "m = 1 (one lobe)", at: [1.6, -0.055] }], notes: [[0.12, -0.192, "open: not on the wake mode's branch"]] }));
  const blocks = [...new Set(TH.map((r) => r.mesh))], g = (b, mm) => TH.filter((r) => r.mesh === blocks[b] && r.m === mm).map((r) => [r.Re, Math.max(...r.g)]);
  out("growth-re", chart({ xl: "Reynolds number", yl: "growth rate of the fastest mode", xr: [170, 212], yr: [-0.06, 0.045], xt: [170, 180, 190, 200, 210], yt: [-0.06, -0.04, -0.02, 0, 0.02, 0.04],
    series: [{ pts: g(0, 0), col: C[0], dots: true, hollow: true, label: "m = 0, β ≈ 2.5, coarse mesh", at: [171, -0.005] }, { pts: g(2, 0), col: C[0], dots: true, line: false, r: 4.5 }, { pts: g(4, 1), col: C[1], dots: true, hollow: true, label: "m = 1, β ≈ 1.5", at: [196, -0.045] }], notes: [[188.4, 0.018, "filled: fine mesh", "end"]] })); }
/* 2: Nusselt number against Reynolds number */
{ const T = J("nu-table.json").rows.filter((r) => r[0] >= 0.1), pub = [[50, 5.4], [100, 6.91], [100, 6.92], [200, 9.12], [200, 9.17], [250, 9.95], [250, 9.96]], ax = [25, 50, 100, 150, 200, 250].map((Re) => [Re, J(`heat-${Re}-R5.json`).Q[0][0] / Math.PI]), cy = []; for (let i = 0; i <= 60; i++) { const Re = 0.1 * Math.pow(400, i / 60); cy.push([Re, cyl(Re)]); }
  out("nusselt", chart({ xl: "Reynolds number", yl: "Nusselt number", xr: [0.1, 250], yr: [0, 10.5], logx: true, xt: [0.1, 1, 10, 100], yt: [0, 2, 4, 6, 8, 10],
    series: [{ pts: T, col: C[0], label: "sphere = 4D wire", at: [1.2, 3.1] }, { pts: cy, col: C[2], dash: "7 5", label: "cylinder = 4D ribbon (computed to Re 40)", at: [0.75, 0.45] }, { pts: pub, col: INK, dots: true, line: false, hollow: true, r: 5 }, { pts: ax, col: C[1], dots: true, line: false, r: 3 }],
    notes: [[0.12, 9.6, "○ published sphere simulations"], [0.12, 8.8, "● the wire in the tube, on the axis"], [0.12, 2.25, "conduction floor, Nu = 2"]] })); }
/* 3: the calibration, three wires */
{ const cal = (R, Lam) => { const p = [], P0 = wire({ R, Lam, Re: 0.25, N: 300 }).at(0.5).P; for (let i = 0; i <= 40; i++) { const Re = 0.25 * Math.pow(160, i / 40); p.push([Re, wire({ R, Lam, Re, N: 300 }).at(0.5).P / P0]); } return p; }, sph = [], cy = [], rib = (R) => { const r = RIB.cal.filter((q) => q.R === R && q.Lam === 4500); return r.map((q) => [q.Re, q.P / r[0].P]); }; for (let i = 0; i <= 40; i++) { const Re = 0.25 * Math.pow(160, i / 40); sph.push([Re, nu(Math.min(Re, 250)) / nu(0.25)]); cy.push([Re, cyl(Re) / cyl(0.25)]); }
  out("calibration", chart({ xl: "Reynolds number of the wire or ribbon", yl: "reading over its value at Re 0.25", xr: [0.25, 40], yr: [1, 6.2], logx: true, xt: [0.25, 1, 5, 10, 40], yt: [1, 2, 3, 4, 5, 6],
    series: [{ pts: cal(5, 3000), col: C[1] }, { pts: cal(100, 3000), col: C[0] }, { pts: sph, col: C[0], dash: "2 4" }, { pts: cy, col: C[2], dash: "7 5" }, { pts: rib(100), col: C[2] }, { pts: rib(250), col: C[3] }],
    notes: [[0.29, 5.85, "– – a cylinder (our hot wire), heat loss alone", "start", C[2]], [0.29, 5.5, "—— 4D ribbon spanning a pipe 500 thicknesses across", "start", C[3]], [0.29, 5.15, "—— 4D ribbon spanning a pipe 200 across", "start", C[2]], [0.29, 4.8, "· · · a sphere, heat loss alone", "start", C[0]], [0.29, 4.45, "—— 4D wire 200 diameters long, across the pipe", "start", C[0]], [0.29, 4.1, "—— 4D wire 10 diameters long", "start", C[1]]] })); }
/* 4: the ribbon's station Nusselt numbers against distance from the rim */
{ const T = J("ribbon-strip-R100.json").rows, ser = [["0.25", C[0]], ["1", C[2]], ["10", C[3]], ["40", C[1]]].map(([k, col]) => ({ pts: T[k].s.map((s, i) => [Math.max(100 - s, 0.004), T[k].Nu[i]]).sort((a, b) => a[0] - b[0]), col, dots: true, r: 3, label: "Re " + k, at: [70, T[k].Nu[T[k].s.indexOf(0)] + (k === "0.25" ? -0.28 : 0.12)], anchor: "end" }));
  out("ribbon-stations", chart({ xl: "distance from the rim, in ribbon thicknesses (the axis is at 100)", yl: "local Nusselt number", xr: [0.004, 100], yr: [0, 3.5], logx: true, xt: [0.01, 0.1, 1, 10, 100], yt: [0, 1, 2, 3], series: ser })); }
