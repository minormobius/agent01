/* Paper 1's figures, as SVG, computed from the bake (atom/js/table.js), the element profiles (data/profiles.json, the
   bake's atoms re-solved with their radial functions kept), the law calculations (laws.js) and the kernel. build.mjs
   writes them into papers/p1/figures/ with the rest of the data, so selftest 67 fails if one goes stale. Each figure's
   caption lives here beside it (CAPTIONS), so the paper page and the process page read the same words. Main text: 1–6;
   appendix: A1, A2. Each figure has to carry an argument the text can't; ones that only illustrated were cut. */
import { panel, series, legend, figure, text, CAT, MUTE, INK } from "./plot.js";
import { gaussLaw, shellSplit } from "../laws.js";
import { farPull } from "../far.js";
import { k4 } from "../../../atom/js/kernel.js";
import { TABLE as BAKE, RPLOT, SHELL_COUNTERFACTUAL } from "../../../atom/js/table.js";
import { readFileSync as readTerm } from "node:fs";
/* the paper's main 4D table is the term-corrected one (data/termtable.json over the bake, as build.mjs's rows): its
   configurations, energies, ionizations and (where the configuration changed) orbitals */
const TERM = new Map(JSON.parse(readTerm(new URL("../data/termtable.json", import.meta.url), "utf8")).rows.map((r) => [r.Z, r]));
const TABLE = { ...BAKE, 4: BAKE[4].map((el) => { const t = TERM.get(el.Z); return t ? { ...el, config: t.config, E: t.E_hartree, ion: t.ion_hartree, top: t.outermost, orb: t.orbitals ? t.orbitals.map((o) => ({ s: o.subshell, o: o.occ, e: o.e_hartree, r: o.r_mean_bohr, r2: o.r2_mean_bohr2 })) : el.orb } : el; }) };
import { SYM, IE_REAL, realConfig, isNoble, layout } from "../../../atom/js/periodic.js";
import { names } from "../../../atom/js/names.js";
import { pngURI } from "./png.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const PROFILES = JSON.parse(readFileSync(fileURLToPath(new URL("../data/profiles.json", import.meta.url)), "utf8"));

const EV = 27.211386245988, B = CAT[0], V = CAT[1], G = CAT[2], P = CAT[3], O = CAT[4], K = CAT[6];
const norm = (c) => c.split(" ").sort().join(" ");

/* L1 · Gauss's law has no atom */
/* 2 · the table itself */
function figTable() {
  const { cells, W } = layout(TABLE, 4), NM = names(TABLE, 4), cw = 25, ch = 30, ox = 8, oy = 26, prof = new Set(PROFILES.atoms.map((a) => a.Z));
  const tint = { s: "#d6e8f5", p: "#fbe0cf", d: "#d3efe5", f: "#f2dcea" }, edge = { s: B, p: V, d: G, f: P };
  const y = (c) => oy + (c.row > 6 ? c.row - 0.45 : c.row) * ch;
  let s = "";
  for (const c of cells) {
    const n = NM.get(c.el.Z), x = ox + (c.col - 1) * cw, yy = y(c), fresh = !n?.ours;
    s += `<g><title>${c.el.Z}${n?.name ? ` ${n.name} (${n.sym})` : " (no counterpart in ours)"}: ${c.el.config}; first ionization ${(c.el.ion * EV).toFixed(2)} eV</title>`;
    s += `<rect x="${x + 0.5}" y="${yy + 0.5}" width="${cw - 1.5}" height="${ch - 1.5}" rx="2.5" fill="${tint[c.block]}" stroke="${c.noble ? K : edge[c.block]}" stroke-width="${c.noble ? 1.6 : 0.6}"/>`;
    s += text(x + cw / 2 - 0.5, yy + 10, String(c.el.Z), { size: 7.5, anchor: "middle", fill: MUTE });
    s += text(x + cw / 2 - 0.5, yy + 23, fresh ? "·" : n.sym, { size: fresh ? 13 : 10, anchor: "middle", weight: 600 });
    if (prof.has(c.el.Z)) s += `<circle cx="${x + cw - 5}" cy="${yy + 5}" r="2.3" fill="${K}"/>`;
    s += "</g>";
  }
  for (let r = 0; r < 7; r++) s += text(ox + W * cw + 6, oy + r * ch + 18, `row ${r + 1}`, { size: 8.5, fill: MUTE });
  s += text(ox, oy + 7.35 * ch, "row 6's f block (81–112), drawn below as ours is", { size: 8.5, fill: MUTE });
  const ly = 12, items = [["s", "s block"], ["p", "p block (8 to a shell)"], ["d", "d block (18)"], ["f", "f block (32)"]];
  items.forEach(([b, t], i) => { s += `<rect x="${ox + i * 128}" y="${ly - 8}" width="11" height="11" rx="2" fill="${tint[b]}" stroke="${edge[b]}" stroke-width="0.8"/>` + text(ox + i * 128 + 16, ly + 1, t, { size: 9.5 }); });
  s += `<rect x="${ox + 512}" y="${ly - 8}" width="11" height="11" rx="2" fill="#fff" stroke="${K}" stroke-width="1.6"/>` + text(ox + 528, ly + 1, "noble gas", { size: 9.5 });
  s += `<circle cx="${ox + 600}" cy="${ly - 2.5}" r="2.3" fill="${K}"/>` + text(ox + 607, ly + 1, "in profile (fig. 5)", { size: 9.5 });
  s += text(ox + 700, ly + 1, "·  no counterpart in ours", { size: 9.5, fill: MUTE });
  return figure(ox + W * cw + 50, oy + 8.55 * ch + 8, [s], "The periodic table of four dimensions, 140 elements, from the self-consistent solution of each atom");
}

/* 1 · the law: Gauss's has no atom, and only 1/r keeps a shell together */
function figLaw() {
  const r0s = [1e-2, 3e-3, 1e-3, 3e-4, 1e-4, 3e-5, 1e-5, 3e-6, 1e-6], alphas = [[0.55, B], [0.7, V], [1.0, G]];
  const a = panel({ w: 390, h: 300, x: [1e-6, 1e-2], y: [1e-2, 1e12], logx: true, logy: true, xl: "grid's inner end r₀ (bohr)", yl: "|ε| of the lowest level (hartree)", tag: "a   V = −α/r² (Gauss's law in 4D)", yticks: [1e-2, 1e1, 1e4, 1e7, 1e10] });
  let s = "";
  for (const [al, c] of alphas) s += series(a, { pts: gaussLaw(al, r0s).filter((g) => g.bound).map((g) => [g.r0, -g.e, `α = ${al}, r₀ = ${g.r0}: ε = ${g.e.toExponential(3)} Ha`]), c, dots: true });
  s += legend(a, alphas.map(([al, c]) => ({ label: `α = ${al}`, c })), "tr");
  s += text(a.sx(1e-6) + 8, a.sy(1e-2) - 8, "α ≤ ½: no level on any grid", { size: 9.5, fill: MUTE });
  const ps = Array.from({ length: 19 }, (_, i) => 0.6 + i * 0.05), sp = ps.map((p) => shellSplit(p));
  const b = panel({ ox: 400, w: 390, h: 300, x: [0.6, 1.5], y: [-20, 80], xl: "exponent η", yl: "splitting within a shell (% of its binding)", tag: " ", zero: true });
  s += `<text x="${400 + 6}" y="14" font-size="12" fill="${INK}" font-weight="700">b   V = −1/r<tspan dy="-5" font-size="9">η</tspan></text>`;
  s += series(b, { pts: sp.map((x) => [x.p, 100 * x.split2, `η = ${x.p.toFixed(2)}: 2p − 2s = ${(100 * x.split2).toFixed(2)} %`]), c: B, dots: true });
  s += series(b, { pts: sp.map((x) => [x.p, 100 * x.split3, `η = ${x.p.toFixed(2)}: 3d − 3s = ${(100 * x.split3).toFixed(2)} %`]), c: V, dots: true });
  s += `<line x1="${b.sx(1)}" y1="${b.sy(-20)}" x2="${b.sx(1)}" y2="${b.sy(80)}" stroke="${MUTE}" stroke-dasharray="4,3"/>` + text(b.sx(1) + 5, b.sy(72), "η = 1: both 0", { size: 10, fill: MUTE });
  s += legend(b, [{ label: "2p − 2s", c: B }, { label: "3d − 3s", c: V }], "tl");
  return figure(800, 300, [a, b, s], "The choice of law: Gauss's 1/r² gives no atom, and only 1/r keeps a shell's levels together");
}

/* 5 · orbitals only four dimensions has, cut through the nucleus by a plane, on the solved atoms' radial functions */
function radialOf(Z, sub) {
  const at = PROFILES.atoms.find((a) => a.Z === Z), sh = at.sub.find((q) => q.name === sub), r = PROFILES.r;
  // |R| = √(P/r³) (P = r³R² per bohr in 4D); the subshells drawn have no radial node, so one sign
  return (x) => {
    if (x <= r[0]) return Math.sqrt(sh.P[0] / r[0] ** 3); if (x >= r.at(-1)) return 0;
    const k = Math.min(r.length - 2, Math.floor(40 * Math.log10(x / r[0]))), u = Math.log(x / r[k]) / Math.log(r[k + 1] / r[k]);
    return Math.sqrt(Math.max(sh.P[k] * (1 - u) + sh.P[k + 1] * u, 0) / x ** 3);
  };
}
function slice(R, ang, plane, L, n = 150) {
  const rgba = new Uint8Array(n * n * 4), vals = new Float64Array(n * n); let mx = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const p = [0, 0, 0, 0]; p[plane[0]] = -L + (2 * L * (i + 0.5)) / n; p[plane[1]] = L - (2 * L * (j + 0.5)) / n;
    const r = Math.hypot(...p), v = r === 0 ? 0 : R(r) * ang(p.map((c) => c / r)); vals[j * n + i] = v; mx = Math.max(mx, Math.abs(v));
  }
  const pos = [0, 114, 178], neg = [213, 94, 0]; // Okabe–Ito blue and vermillion; brightness by |ψ|
  for (let k = 0; k < n * n; k++) { const v = vals[k], t = Math.abs(v) / mx, c = v >= 0 ? pos : neg; for (let q = 0; q < 3; q++) rgba[4 * k + q] = Math.round(255 - t * (255 - c[q])); rgba[4 * k + 3] = 255; }
  return pngURI(n, n, rgba);
}
function figOrbitals() {
  const AX = ["x", "y", "z", "w"], pw = (u) => u[3], dq = (u) => u[0] ** 2 + u[1] ** 2 - u[2] ** 2 - u[3] ** 2;
  const p2 = radialOf(12, "2p"), d3 = radialOf(26, "3d");
  const panels = [
    { R: p2, ang: pw, plane: [0, 3], L: 2.2, tag: "a", t: "p_w, x–w plane", sub: "element 12's 2p" },
    { R: d3, ang: dq, plane: [0, 1], L: 2.2, tag: "b", t: "d(x²+y²−z²−w²), x–y plane", sub: "element 26's 3d" },
    { R: d3, ang: dq, plane: [2, 3], L: 2.2, tag: "c", t: "the same, z–w plane", sub: "" },
    { R: d3, ang: dq, plane: [0, 2], L: 2.2, tag: "d", t: "the same, x–z plane", sub: "" },
  ];
  const sz = 170, gap = 24, top = 34; let s = "";
  panels.forEach((q, k) => {
    const x0 = 10 + k * (sz + gap);
    s += text(x0, 12, q.tag, { size: 12, weight: 700 }) + text(x0 + 14, 12, q.t, { size: 10 }) + (q.sub ? text(x0 + 14, 25, q.sub, { size: 9, fill: MUTE }) : "");
    s += `<image x="${x0}" y="${top}" width="${sz}" height="${sz}" href="${slice(q.R, q.ang, q.plane, q.L)}"/>`;
    s += `<rect x="${x0}" y="${top}" width="${sz}" height="${sz}" fill="none" stroke="#c9c9c9"/>`;
    s += text(x0 + sz - 4, top + sz / 2 - 4, AX[q.plane[0]], { size: 10, anchor: "end", fill: MUTE, italic: true }) + text(x0 + sz / 2 + 4, top + 11, AX[q.plane[1]], { size: 10, fill: MUTE, italic: true });
    s += `<line x1="${x0 + 8}" y1="${top + sz - 8}" x2="${x0 + 8 + sz / (2 * q.L)}" y2="${top + sz - 8}" stroke="${INK}" stroke-width="1.5"/>` + text(x0 + 8, top + sz - 12, "1 bohr", { size: 8.5 });
  });
  s += `<rect x="10" y="${top + sz + 12}" width="11" height="11" fill="rgb(0,114,178)"/>` + text(26, top + sz + 21, "ψ > 0", { size: 9.5 }) + `<rect x="80" y="${top + sz + 12}" width="11" height="11" fill="rgb(213,94,0)"/>` + text(96, top + sz + 21, "ψ < 0   (depth of colour: |ψ|)", { size: 9.5 });
  return figure(10 + 4 * (sz + gap), top + sz + 30, [s], "Orbitals four dimensions has and ours doesn't, cut through the nucleus by a plane, on the solved atoms' own radial functions");
}

/* 3 · first ionization energy against Z */
function figIonization() {
  const t4 = TABLE[4];
  const a = panel({ w: 820, h: 320, x: [0, 140], y: [0, 31], xl: "Z", yl: "first ionization energy (eV)", xticks: [0, 20, 40, 60, 80, 100, 120, 140] });
  let s = series(a, { pts: t4.map((e) => [e.Z, e.ion * EV, `${e.Z}: ${(e.ion * EV).toFixed(2)} eV, ${e.config}`]), c: B, w: 1.4 });
  s += series(a, { pts: t4.filter((e) => isNoble(e, 4)).map((e) => [e.Z, e.ion * EV, `noble gas ${e.Z}: ${(e.ion * EV).toFixed(2)} eV`]), c: B, dots: true, lineOn: false });
  for (const e of t4.filter((q) => isNoble(q, 4))) s += text(a.sx(e.Z), a.sy(e.ion * EV) - 8, String(e.Z), { size: 9.5, anchor: "middle", fill: MUTE });
  const fullD = t4.filter((e) => /d18$/.test(e.config) && !e.config.includes(`${+e.config.match(/(\d)d18$/)[1] + 1}s`));
  s += series(a, { pts: fullD.map((e) => [e.Z, e.ion * EV, `${e.Z} (a full d shell, nothing outside): ${(e.ion * EV).toFixed(2)} eV`]), c: V, dots: true, lineOn: false });
  for (const e of fullD) s += text(a.sx(e.Z), a.sy(e.ion * EV) - 8, String(e.Z), { size: 9.5, anchor: "middle", fill: V });
  s += text(a.sx(96), a.sy(12.2), "row 6's f block", { size: 9.5, anchor: "middle", fill: MUTE });
  s += legend(a, [{ label: "noble gas", c: B, dot: true }, { label: "full d shell, nothing outside (our palladium's kind)", c: V, dot: true }], "tl");
  return figure(820, 320, [a, s], "First ionization energy against Z across the four-dimensional table");
}

/* 4 · elements in profile: each subshell's electrons per unit ln r */
function figProfiles() {
  const NM = names(TABLE, 4), r = PROFILES.r, col = [B, V, G, P], W = 270, Hh = 210, sup = (t) => t.replace(/(\d+)$/, (m) => m.replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]));
  const parts = []; let s = "";
  PROFILES.atoms.forEach((at, k) => {
    const n = NM.get(at.Z), ox = (k % 3) * (W + 8), oy = Math.floor(k / 3) * (Hh + 6);
    const peak = Math.max(...at.sub.map((q) => Math.max(...q.P.map((v, i) => q.occ * v * r[i]))));
    const Pn = panel({ ox, oy, w: W, h: Hh, x: [0.005, 50], y: [0, peak * 1.25], logx: true, xl: "r (bohr)", yl: "electrons per unit ln r", xticks: [1e-2, 1e-1, 1, 10] });
    parts.push(Pn);
    const outer = at.sub.reduce((a, b) => (b.e > a.e ? b : a));
    for (const q of at.sub) s += series(Pn, { pts: q.P.map((v, i) => [r[i], q.occ * v * r[i], `${q.name}${q.occ}: ε = ${q.e} Ha`]), c: col[q.l], w: q === outer ? 2.4 : 1.2 });
    s += text(ox + 64, oy + 24, `${at.Z} · ${n?.name ? `${n.name} (${n.sym})` : "no counterpart in ours"}`, { size: 10.5, weight: 700 });
    s += text(ox + 64, oy + 37, `… ${at.config.split(" ").slice(-3).map(sup).join(" ")}, ${(at.ion * EV).toFixed(2)} eV`, { size: 9.5, fill: MUTE });
  });
  s += legend(parts[5], [{ label: "s", c: B }, { label: "p", c: V }, { label: "d", c: G }, { label: "f", c: P }], "tr");
  return figure(3 * W + 16, 2 * Hh + 6, [...parts, s], "Six four-dimensional atoms in profile: each subshell's electrons against distance, from the solved atoms");
}

/* A2 · the 3D validation */
function A2() {
  const t3 = TABLE[3], rows = t3.map((e) => ({ Z: e.Z, s: SYM[e.Z - 1], c: e.ion * EV, m: IE_REAL[e.Z - 1], hit: norm(e.config) === norm(realConfig(e.Z)) }));
  const a = panel({ w: 400, h: 320, x: [0, 26], y: [0, 26], xl: "measured (eV)", yl: "computed (eV)", tag: "a" });
  let s = series(a, { pts: [[0, 0], [26, 26]], c: MUTE, dash: "4,3", w: 1 });
  s += series(a, { pts: rows.filter((r) => r.hit).map((r) => [r.m, r.c, `${r.s}: ${r.c.toFixed(2)} against ${r.m} eV; configuration right`]), c: B, dots: true, lineOn: false });
  s += series(a, { pts: rows.filter((r) => !r.hit).map((r) => [r.m, r.c, `${r.s}: ${r.c.toFixed(2)} against ${r.m} eV; configuration missed`]), c: V, dots: true, lineOn: false, r: 4.5 });
  rows.filter((q) => !q.hit).sort((p, q) => p.m - q.m).forEach((r, i) => { const lx = a.sx(14) + i * 0, ly = a.sy(4.5) + i * 13; s += `<line x1="${a.sx(r.m) + 4}" y1="${a.sy(r.c)}" x2="${lx - 3}" y2="${ly - 4}" stroke="${V}" stroke-width="0.6"/>` + text(lx, ly, `${r.s} ${r.c.toFixed(2)} / ${r.m}`, { size: 9.5, fill: V }); });
  s += legend(a, [{ label: "configuration right (32)", c: B, dot: true }, { label: "missed (Ti, V, Co, Ni)", c: V, dot: true }], "tl");
  const b = panel({ ox: 410, w: 400, h: 320, x: [0, 36], y: [-20, 20], xl: "Z", yl: "computed − measured (%)", tag: "b", zero: true, xticks: [0, 10, 20, 30] });
  s += series(b, { pts: rows.map((r) => [r.Z, (100 * (r.c - r.m)) / r.m, `${r.s}: ${((100 * (r.c - r.m)) / r.m).toFixed(1)} %`]), c: B, dots: true, w: 1 });
  return figure(810, 320, [a, b, s], "The solver in our three dimensions: first ionization against measured, and its error, with the four missed configurations marked");
}

/* F6 · partial screening */

/* 6 · the table under each law: what changes with the shell theorem forced on */
const SHELL = JSON.parse(readFileSync(fileURLToPath(new URL("../data/shelltable.json", import.meta.url)), "utf8")).rows;
function figCounterfactual() {
  const { cells, W } = layout(TABLE, 4), cw = 25, ch = 26, ox = 8, oy = 24, y = (c) => oy + (c.row > 6 ? c.row - 0.45 : c.row) * ch;
  let s = "";
  for (const c of cells) {
    const r = SHELL[c.el.Z - 1], x = ox + (c.col - 1) * cw, yy = y(c), uns = r.E === null || (r.ion !== null && r.ion < 0), same = !uns && r.sameConfig;
    const fill = uns ? "#ffffff" : same ? "#ececec" : "#fbe0cf", stroke = uns ? "#9a9a9a" : same ? "#c9c9c9" : V;
    s += `<g><title>${c.el.Z}: ${uns ? "not yet settled under the shell theorem" : same ? `the same under both: ${r.config}` : `the law: ${r.real.config}; with the shell theorem: ${r.config}`}</title>`;
    s += `<rect x="${x + 0.5}" y="${yy + 0.5}" width="${cw - 1.5}" height="${ch - 1.5}" rx="2.5" fill="${fill}" stroke="${stroke}" stroke-width="${c.noble ? 1.6 : 0.7}"${uns ? ' stroke-dasharray="2,2"' : ""}/>`;
    s += text(x + cw / 2 - 0.5, yy + 16, uns ? "?" : String(c.el.Z), { size: uns ? 10 : 8, anchor: "middle", fill: uns ? MUTE : INK, weight: c.noble ? 700 : 400 });
    s += "</g>";
  }
  const ly = 11;
  [["#ececec", "#c9c9c9", "same configuration under both laws"], ["#fbe0cf", V, "changes with the shell theorem"], ["#ffffff", "#9a9a9a", "doesn't settle under the shell theorem"]].forEach(([f, st, t], i) => { s += `<rect x="${ox + 18 + i * 230}" y="${ly - 8}" width="11" height="11" rx="2" fill="${f}" stroke="${st}"${i === 2 ? ' stroke-dasharray="2,2"' : ""}/>` + text(ox + 34 + i * 230, ly + 1, t, { size: 9.5 }); });
  const top = oy + 8.6 * ch + 8, a = panel({ oy: top, w: ox + W * cw + 10, h: 260, x: [0, 140], y: [0, 31], xl: "Z", yl: "first ionization (eV)", tag: "b", xticks: [0, 20, 40, 60, 80, 100, 120, 140] });
  const seg = (f) => { const out = []; let cur = []; for (const r of SHELL) { const v = f(r); if (v === null) { if (cur.length) out.push(cur); cur = []; } else cur.push([r.Z, v, `${r.Z}: ${v.toFixed(2)} eV`]); } if (cur.length) out.push(cur); return out; };
  for (const pts of seg((r) => TABLE[4][r.Z - 1].ion * EV)) s += series(a, { pts, c: B, w: 1.4 });
  for (const pts of seg((r) => (r.E === null || r.ion === null || r.ion < 0 ? null : r.ion * EV))) s += series(a, { pts, c: V, w: 1.4 });
  s += legend(a, [{ label: "the pinned 1/r (no shell theorem)", c: B }, { label: "shell theorem forced on (gaps: not yet settled)", c: V }], "tl");
  s += text(ox - 2, ly + 2, "a", { size: 12, weight: 700 });
  return figure(ox + W * cw + 20, top + 262, [a, s], "The four-dimensional table solved under each law: which configurations change when the shell theorem is forced on, and first ionization under both");
}

/* A1 · the 3-sphere kernel */
function A1() {
  const ts = Array.from({ length: 51 }, (_, i) => i / 50);
  const a = panel({ w: 420, h: 280, x: [0, 1], y: [0.8, 1.02], xl: "t = inner radius / outer radius", yl: "κ(t): a shell's pull over a point's" });
  let s = series(a, { pts: ts.map((t) => [t, 1]), c: V, dash: "6,4" }) + series(a, { pts: ts.map((t) => [t, k4(t), `κ(${t.toFixed(2)}) = ${k4(t).toFixed(5)}`]), c: B });
  s += text(a.sx(0.98), a.sy(k4(1)) + 14, "κ(1) = 8/3π", { size: 10, anchor: "end", fill: MUTE });
  s += legend(a, [{ label: "4D, pinned 1/r", c: B }, { label: "shell theorem (ours)", c: V, dash: "6,4" }], "bl");
  return figure(420, 280, [a, s], "The 3-sphere kernel of the pinned 1/r against the shell theorem");
}

export const CAPTIONS = {
  "1": "The choice of law. (a) Gauss's law in four dimensions gives a potential −α/r². One electron in it, solved on grids whose inner end r₀ is moved in: for every α above ½ the lowest level scales as 1/r₀², set by where the calculation stops rather than by the electron (the fall to the centre); at or below ½ there is no level on any grid (Hardy's inequality). Either way there is no Bohr radius and no atom. (b) With a pull −1/r^η instead, the splitting between 2p and 2s (and 3d and 3s) as a fraction of the shell's binding vanishes only at η = 1, to 10⁻¹¹: the hidden SO(5) symmetry of 1/r, which no other exponent has (section 3.1). Shells of 2(l + 1)², and the rows of figure 2, need exactly 1/r.",
  "2": "The periodic table of four dimensions, Z = 1 to 140, each atom solved self-consistently under the pinned 1/r. Rows close at the noble gases 2, 12, 22, 50, 78 and 138, and hold 2, 10, 10, 28, 28 and 60 elements, as Négadi and Kibler's generalized Madelung rule gives when applied to four dimensions. A subshell holds 2(l + 1)² electrons, so the p block is 8 wide, the d block 18 and row 6's f block 32 (drawn below, as ours is). An element takes our element's name with its first letter moved on where its place answers to one of ours; the rest (·) have no counterpart. Dots: the elements in figure 4. Hover a cell for its configuration and ionization.",
  "3": "First ionization energy against Z across the four-dimensional table. The noble gases close their rows, but the hardest-held electron isn't a noble gas's: element 128, a full 18-electron d shell with nothing outside it (our palladium's kind), holds its outermost electron at 29.6 eV against its row's noble gas at 26.7; element 68, the same kind a row up, comes within a volt of its row's. In ours palladium holds far less hard than xenon. Across row 6's 32-wide f block (81–112) the binding barely moves.",
  "4": "Six four-dimensional atoms in profile: each subshell's electrons per unit ln r against distance, from the solved atoms; the area under a curve is its electron count, and the outermost subshell is drawn thick. Darbon (7), our carbon's place, five electrons of a ten-electron shell; element 8, which answers to nothing of ours; oeon (12), the first noble gas past helium, its p shell holding eight; uitanium (26), where the d block starts; element 101, 21 electrons into an f shell that holds 32; and element 128, the hardest-held electron in the table. Every element's profile: four.mino.mobi/table/#Z.",
  "5": "Orbitals four dimensions has and ours doesn't, cut through the nucleus by a plane, on the solved atoms' own radial functions. (a) The fourth p orbital, p_w, in the x–w plane: a dumbbell along w, so any three-dimensional slice through the nucleus misses it entirely. (b–d) One of the nine 4D d orbitals, x² + y² − z² − w², in three planes: positive all the way round the x–y plane, negative all the way round the z–w plane, and a four-leaf clover in a plane that mixes them. The x–y and z–w planes are completely perpendicular and meet only at the nucleus; nothing in three dimensions is positive round one plane and negative round another. Any element's orbitals, in any plane: four.mino.mobi/table/#Z; hydrogen's exact ones, turned live: kata.mino.mobi/orbital.",
  "6": "What the law does. Every 4D atom solved a second time with the shell theorem forced on (the clouds' pull as if each sat at the centre), everything else held. (a) The table: grey, the same ground configuration under both laws; orange, changed; ?, no settled ground state under the shell theorem (row 6's f block, 89–116, after a second, wider search). Every atom up to 88 settles. The first 24 elements and all six noble gases are unchanged: the rows are the geometry's, at least through row 5. Every change starts at the first d element: without the law, p beats d inside each row. (b) First ionization under both: the law holds outer electrons a median 2.5 times harder, and element 128 nearly ten times (29.6 eV against 3.1); with the shell theorem the noble gases hold hardest, as ours do.",
  A1: "The pull of a thin shell of charge on a point at another radius, over a point charge's at the shell's centre, as κ(t) of the ratio t of the two radii. The shell theorem makes it 1; under the pinned 1/r in four dimensions it falls to 8/3π at the shell itself.",
  A2: "The solver in our three dimensions. (a) Computed against measured first ionization energies (NIST), with the four elements whose ground configuration it misses (Ti, V, Co, Ni: one d electron too many against 4s, the known lean of local exchange). (b) The percentage error against Z.",
};

export function figures() {
  const out = new Map();
  for (const [k, f] of Object.entries({ "1": figLaw, "2": figTable, "3": figIonization, "4": figProfiles, "5": figOrbitals, "6": figCounterfactual, A1, A2 })) out.set(`figures/${k}.svg`, f());
  out.set("figures/captions.json", JSON.stringify(CAPTIONS, null, 1) + "\n");
  return out;
}
