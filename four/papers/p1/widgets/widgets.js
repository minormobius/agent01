/* Paper 1's two widgets. Screening: one 4D atom solved with and without the shell theorem, live, in a worker
   (solve.js, on atom/js/atom.js). Far pull: the potential of a neutral 4D atom's baked cloud (table.js's radial
   density) under the 3-sphere kernel, against its far form −S/8s³. Both read the paper's bake; neither changes it. */
import { TABLE, RPLOT, SHELL_COUNTERFACTUAL } from "../../../atom/js/table.js";
import { farPull } from "../far.js";
import { levels, grid, gaussLaw } from "../laws.js";
import { isNoble } from "../../../atom/js/periodic.js";
import { names } from "../../../atom/js/names.js";

const $ = (id) => document.getElementById(id);
const EV = 27.211386245988, C3 = "#ffb46b", C4 = "#6fe0ff", DIM = "#9a958c";
const T4 = TABLE[4], NAMES = names(TABLE, 4);
const label = (Z) => { const n = NAMES.get(Z), el = T4[Z - 1]; return `${Z}${n?.name ? ` · ${n.name} (${n.sym})` : " · no counterpart in ours"} · ${el.config}`; };

/* a line chart on a canvas: series of [x, y] points, log axes optional, a shaded band optional */
function plot(cv, { x, y, logx = false, logy = false, xl = "", yl = "", series = [], band = null, hline = null, marks = [] }) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const L = 46, R = 10, T = 10, B = 30, tx = (v) => (logx ? Math.log10(v) : v), ty = (v) => (logy ? Math.log10(v) : v);
  const X = (v) => L + ((w - L - R) * (tx(v) - tx(x[0]))) / (tx(x[1]) - tx(x[0])), Y = (v) => h - B - ((h - B - T) * (ty(v) - ty(y[0]))) / (ty(y[1]) - ty(y[0]));
  g.font = "10px ui-monospace, monospace"; g.fillStyle = DIM; g.strokeStyle = "rgba(255,255,255,0.18)";
  if (band) { // a shaded profile along the bottom, scaled to the chart's height
    const top = Math.max(...band.map((p) => p[1])) || 1; g.fillStyle = "rgba(111,224,255,0.12)"; g.beginPath(); g.moveTo(X(band[0][0]), h - B);
    for (const [a, b] of band) g.lineTo(X(a), h - B - 0.8 * (h - B - T) * (b / top)); g.lineTo(X(band.at(-1)[0]), h - B); g.fill(); g.fillStyle = DIM;
  }
  g.beginPath(); g.moveTo(L, T); g.lineTo(L, h - B); g.lineTo(w - R, h - B); g.stroke();
  if (hline != null) { g.setLineDash([3, 3]); g.beginPath(); g.moveTo(L, Y(hline)); g.lineTo(w - R, Y(hline)); g.stroke(); g.setLineDash([]); }
  const ticks = (lo, hi, log) => { if (!log) return [lo, (lo + hi) / 2, hi]; const a = Math.ceil(Math.log10(lo) - 1e-9), b = Math.floor(Math.log10(hi) + 1e-9); return Array.from({ length: b - a + 1 }, (_, i) => 10 ** (a + i)); };
  const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹", lab = (v, log) => (log && (v >= 1e4 || v < 1e-2) ? "10" + String(Math.round(Math.log10(v))).replace("-", "⁻").replace(/\d/g, (c) => SUP[c]) : String(+v.toPrecision(3)));
  for (const v of ticks(x[0], x[1], logx)) { const t = lab(v, logx); g.fillText(t, Math.min(X(v) - 8, w - R - g.measureText(t).width), h - B + 13); }
  for (const v of ticks(y[0], y[1], logy)) g.fillText(lab(v, logy), 2, Y(v) + 3);
  g.fillText(xl, w - R - g.measureText(xl).width, h - 4); g.fillText(yl, L + 4, T + 8);
  g.save(); g.beginPath(); g.rect(L, T, w - L - R, h - B - T); g.clip();
  for (const s of series) {
    g.strokeStyle = s.c; g.lineWidth = s.w ?? 2; g.setLineDash(s.dash ?? []); g.beginPath(); let on = false;
    for (const [a, b] of s.pts) { if (!isFinite(b) || (logy && b <= 0)) { on = false; continue; } if (on) g.lineTo(X(a), Y(b)); else { g.moveTo(X(a), Y(b)); on = true; } }
    g.stroke(); g.setLineDash([]);
    if (s.dots) { g.fillStyle = s.c; for (const [a, b] of s.pts) { g.beginPath(); g.arc(X(a), Y(b), 3, 0, 2 * Math.PI); g.fill(); } }
  }
  for (const m of marks) { g.fillStyle = m.c; g.beginPath(); g.arc(X(m.x), Y(m.y), 4, 0, 2 * Math.PI); g.fill(); }
  g.restore();
}

/* ---------------------------------------------------------------------------------------------- 1 · choose a law */
const SHELLS = [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2]], LCOL = ["#6fe0ff", "#ffb46b", "#c79bff"], LG = grid(1e-5, 2000, 5000);
function drawLaw() {
  const p = +$("pp").value, V = (r) => -1 / r ** p; $("ppv").textContent = p.toFixed(2);
  const e = SHELLS.map(([n, l]) => ({ n, l, e: levels(V, l, n - l - 1, 4, LG) })), e1 = e[0].e;
  // each shell's levels as offsets from its own s level, in percent: at p = 1 they all sit on the line
  const cv = $("cLev"), dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.font = "11px ui-monospace, monospace";
  const top = 12, bot = h - 26, SPAN = 30, Y = (pct) => top + ((bot - top) * (SPAN - Math.max(-SPAN, Math.min(SPAN, pct)))) / (2 * SPAN), colW = (w - 60) / 3, col = (n) => 52 + colW * (n - 1);
  g.strokeStyle = "rgba(255,255,255,0.18)"; g.beginPath(); g.moveTo(44, top); g.lineTo(44, bot); g.stroke();
  g.setLineDash([3, 3]); g.beginPath(); g.moveTo(44, Y(0)); g.lineTo(w - 8, Y(0)); g.stroke(); g.setLineDash([]);
  g.fillStyle = DIM; for (const v of [SPAN, 0, -SPAN]) g.fillText(`${v > 0 ? "+" : ""}${v} %`, 2, Y(v) + 4); g.fillText("less bound ↑", 50, top + 8);
  const sOf = (n) => e.find((x) => x.n === n && x.l === 0).e;
  for (const s of e) { if (s.e === null || !isFinite(s.e)) continue; const pct = s.l === 0 ? 0 : (100 * (s.e - sOf(s.n))) / Math.abs(sOf(s.n)), x0 = col(s.n) + s.l * Math.min(52, colW / 3.4), y = Y(pct);
    g.strokeStyle = LCOL[s.l]; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 26, y); g.stroke(); g.lineWidth = 1; g.fillStyle = LCOL[s.l]; g.fillText(`${s.n}${"spd"[s.l]}`, x0 + 2, y + (pct > 0 ? -6 : 14)); }
  g.fillStyle = DIM; for (const n of [1, 2, 3]) g.fillText(`n = ${n}`, col(n), h - 6);
  const sp = (a, b) => (100 * (b.e - a.e)) / Math.abs(a.e), s2 = sp(e[1], e[2]), s3 = sp(e[3], e[5]);
  $("rLev").innerHTML = Math.abs(p - 1) < 0.005 ? `At p = 1 the shells are exact: 2p sits on 2s to ${Math.abs(s2).toExponential(0)} %, 3d on 3s to ${Math.abs(s3).toExponential(0)} %. In 4D the levels are −1/2(n + ½)², and a shell holds 2(l + 1)² electrons per l: 2, then 2 + 8, then 2 + 8 + 18.`
    : `At p = ${p.toFixed(2)}, 2p sits <b>${s2 > 0 ? "above" : "below"}</b> 2s by ${Math.abs(s2).toFixed(1)} % and 3d ${s3 > 0 ? "above" : "below"} 3s by ${Math.abs(s3).toFixed(1)} %: ${p < 1 ? "the order inverts, the most-turning electron the most bound" : "s drops below p and p below d"}, and the shells come apart.`;
}
function drawGauss() {
  const a = +$("ga").value; $("gav").textContent = a.toFixed(2);
  const r0s = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6], res = gaussLaw(a, r0s);
  const pts = res.filter((x) => x.bound && isFinite(x.e)).map((x) => [x.r0, -x.e]);
  if (pts.length) { const c = pts[0][1] * pts[0][0] ** 2; plot($("cGauss"), { x: [1e-6, 1e-2], y: [10 ** Math.floor(Math.log10(Math.min(...pts.map((q) => q[1])) / 3)), 10 ** Math.ceil(Math.log10(Math.max(...pts.map((q) => q[1])) * 3))], logx: true, logy: true, xl: "r₀ (bohr)", yl: "|ε|", series: [{ c: C3, pts: r0s.map((r) => [r, c / r ** 2]), dash: [5, 4] }, { c: C4, pts, dots: true }] }); }
  else { plot($("cGauss"), { x: [1e-6, 1e-2], y: [1e-3, 1], logx: true, logy: true, xl: "r₀ (bohr)", yl: "|ε|", series: [] }); const g = $("cGauss").getContext("2d"); g.fillStyle = C4; g.font = "13px ui-monospace, monospace"; g.fillText("no bound level, on any grid", 120, 60); }
  $("rGauss").innerHTML = pts.length ? `α = ${a.toFixed(2)} is past ½: the electron falls. Its lowest level is ${pts.map((q) => q[1].toExponential(1)).join(", ")} hartree as r₀ goes from 10⁻² to 10⁻⁶ bohr: ×100 for every ×10 closer, so it has no size of its own. No Bohr radius, no atom.`
    : `α = ${a.toFixed(2)} is at or below ½: no level at all, on any grid. The pull never beats the electron's resistance to being squeezed (Hardy's inequality: in 4D the squeeze costs at least ½ × 1/r²). Nothing binds.`;
}
$("pp").addEventListener("input", drawLaw); $("pone").addEventListener("click", () => { $("pp").value = 1; drawLaw(); });
$("ga").addEventListener("input", drawGauss);

/* ------------------------------------------------------------------------------------------------- 2 · screening */
const worker = new Worker(new URL("./solve.js", import.meta.url), { type: "module" });
let pending = null, busy = false, last = null;
const ask = (Z) => { if (busy) { pending = Z; return; } busy = true; const el = T4[Z - 1]; worker.postMessage({ Z, config: el.config, top: el.top }); $("ion4").textContent = $("ionS").textContent = $("ratio").textContent = "solving…"; $("ion4").className = "busy"; };
worker.onmessage = ({ data }) => {
  busy = false; last = data; drawScreen();
  if (pending !== null) { const z = pending; pending = null; if (z !== data.Z) ask(z); }
};
function drawScreen() {
  const d = last; if (!d) return;
  const { four, shell, Z } = d, el = T4[Z - 1];
  $("ion4").className = ""; $("ion4").textContent = `${(four.ion * EV).toFixed(2)} eV`; $("ionS").textContent = `${(shell.ion * EV).toFixed(2)} eV`;
  $("ratio").textContent = Z === 1 ? "1 (nothing to screen)" : `${(four.ion / shell.ion).toFixed(2)}×`;
  // the outer electron's own region: from a third of its ⟨r⟩ out, where the two kernels part
  const rOut = el.orb.find((o) => o.s === el.top).r, x0 = Math.max(0.05, rOut / 3), inView = (p) => p.filter(([r]) => r >= x0);
  const zAt = (zs, r) => { const k = zs.findIndex(([x]) => x >= r); if (k <= 0) return zs[0][1]; const [a, u] = zs[k - 1], [b, v] = zs[k]; return u + ((v - u) * Math.log(r / a)) / Math.log(b / a); };
  const ymax = Math.max(2, ...inView(four.zeff).map((p) => p[1]), ...inView(shell.zeff).map((p) => p[1])) * 1.05;
  plot($("cZeff"), { x: [x0, 40], y: [0, ymax], logx: true, xl: "r (bohr)", yl: "Z_eff", hline: 1, band: inView(four.cloud),
    series: [{ c: C3, pts: inView(shell.zeff) }, { c: C4, pts: inView(four.zeff) }] });
  $("rScreen").innerHTML = Z === 1 ? "Hydrogen has no other electrons, so the shell theorem changes nothing: 6.05 eV either way, Z²/2(n + ½)² hartree."
    : `Element ${label(Z)}. Its outermost electron (${el.top}) is bound by <b class="d4">${(four.ion * EV).toFixed(2)} eV</b>; with the shell theorem it would be <b class="d3">${(shell.ion * EV).toFixed(2)} eV</b>. ` +
      `Where it sits, at ⟨r⟩ = ${rOut.toFixed(2)} bohr, it sees <b class="d4">${zAt(four.zeff, rOut).toFixed(2)}</b> of the nucleus's ${Z} (the shell theorem: <b class="d3">${zAt(shell.zeff, rOut).toFixed(2)}</b>): each inner cloud covers the nucleus only partly, by k(r/s) &lt; 1, so more of it shows through. Far out both go to the bare ion's 1. Solved in ${(d.ms / 1000).toFixed(1)} s.` +
      (four.converged && shell.converged ? "" : " (One of the fields hadn't settled in 120 rounds: read it as approximate.)");
}
const nobleZ = T4.filter((el) => isNoble(el, 4)).map((el) => el.Z);
$("nobles").innerHTML = nobleZ.map((z) => `<button type="button" class="chip" data-z="${z}">${z}</button>`).join(" ");
$("nobles").addEventListener("click", (e) => { const z = e.target.dataset?.z; if (z) { $("z").value = z; onZ(); } });
let tz = null;
const onZ = () => { const Z = +$("z").value; $("zv").textContent = label(Z); clearTimeout(tz); tz = setTimeout(() => ask(Z), 250); };
$("z").addEventListener("input", onZ);
function drawNoble() {
  const pts4 = nobleZ.map((z) => [z, T4[z - 1].ion * EV]), ptsS = SHELL_COUNTERFACTUAL.map((c) => [c.Z, c.ion * EV]);
  plot($("cNoble"), { x: [0, 140], y: [0, 30], xl: "Z", yl: "eV", series: [{ c: C3, pts: ptsS, dots: true }, { c: C4, pts: pts4, dots: true }] });
}

/* -------------------------------------------------------------------------------------------------- 3 · far pull */
const S_MIN = 1, S_MAX = 100, sAt = (u) => S_MIN * (S_MAX / S_MIN) ** u;
function farCurve(Z) {
  const { S, U } = farPull(T4[Z - 1], RPLOT);
  return { S, U, pts: Array.from({ length: 60 }, (_, i) => sAt(i / 59)).map((s) => [s, U(s)]) };
}
let FP = null;
function drawFar() {
  const Z = +$("fz").value, s = sAt(+$("fs").value); $("fzv").textContent = label(Z); $("fsv").textContent = `${s.toFixed(1)} bohr`;
  if (!FP || FP.Z !== Z) FP = { Z, ...farCurve(Z) };
  const far = (x) => FP.S / (8 * x ** 3), u = FP.U(s);
  $("uFull").textContent = `${u.toExponential(3)} Ha`; $("uFar").textContent = `${(-far(s)).toExponential(3)} Ha`; $("sv").textContent = `${FP.S.toFixed(2)} bohr²`;
  const abs = FP.pts.map(([x, v]) => [x, Math.abs(v)]), ymin = Math.max(1e-9, far(S_MAX) / 3);
  plot($("cFar"), { x: [S_MIN, S_MAX], y: [10 ** Math.floor(Math.log10(ymin)), 10 ** Math.ceil(Math.log10(Math.max(...abs.map((p) => p[1]))))], logx: true, logy: true, xl: "s (bohr)", yl: "|U|",
    series: [{ c: C3, pts: FP.pts.map(([x]) => [x, far(x)]), dash: [5, 4] }, { c: C4, pts: abs }], marks: [{ x: s, y: Math.abs(u), c: "#fff" }] });
  plot($("cRatio"), { x: [S_MIN, S_MAX], y: [0, 2], logx: true, xl: "s (bohr)", yl: "U / (−S/8s³)", hline: 1, series: [{ c: C4, pts: FP.pts.map(([x, v]) => [x, v / -far(x)]) }], marks: [{ x: s, y: u / -far(s), c: "#fff" }] });
  const outer = T4[Z - 1].orb.find((o) => o.s === T4[Z - 1].top);
  $("rFar").innerHTML = `At ${s.toFixed(1)} bohr from element ${Z} an electron's energy is <b class="d4">${u.toExponential(2)} hartree</b>; the far form gives <b class="d3">${(-far(s)).toExponential(2)}</b> (${((u / -far(s) - 1) * 100).toFixed(1)} % apart). ` +
    `Its outermost electrons sit at ⟨r⟩ = ${outer.r.toFixed(2)} bohr; well outside that the two agree, and the atom pulls on a passing electron as S/8s³, a pull our neutral atoms don't have at all. ` +
    `The sign is a pull for an electron and a push for a proton: the nucleus shows through the cloud.`;
}
for (const id of ["fz", "fs"]) $(id).addEventListener("input", drawFar);

drawLaw(); drawGauss(); onZ(); drawNoble(); drawFar();
addEventListener("resize", () => { drawLaw(); drawGauss(); drawScreen(); drawNoble(); drawFar(); });
