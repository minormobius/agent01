/* Magnetic fields in plasma in four dimensions, as toys. The physics is ../atom/js/mhd.js (a bivector's canonical form
   and halves, a parcel carried by a flow), which ATOM⁴'s selftest checks; this file only draws. */
import { fromSix, canonical, halves, turn, carry, FLOWS } from "../atom/js/mhd.js";

const $ = (id) => document.getElementById(id);
const CA = "#6fe0ff", CB = "#c79bff", CL = "#7dffb0", CR = "#ff8fa3", DIM = "#9a958c", TXT = "#e9e4da";
const NAMES = ["xy", "xz", "xw", "yz", "yw", "zw"];
const sizeCanvas = (cv) => { const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); return { g, w, h }; };
const fmt = (x, k = 2) => (Math.abs(x) < 5e-4 ? "0" : x.toFixed(k)).replace("-", "−");

/* ---------------------------------------------------------------- 1 · anatomy */
let six = [1, 0, 0, 0, 0, 0.4];
const PRESETS = [
  ["one plane (xy)", [1, 0, 0, 0, 0, 0]],
  ["two planes (xy 1, zw 0.4)", [1, 0, 0, 0, 0, 0.4]],
  ["all left", [0.7, 0, 0, 0, 0, 0.7]],
  ["all right", [0.7, 0, 0, 0, 0, -0.7]],
  ["six numbers, one plane", [0, 0.5, 0.5, 0.5, 0.5, 0]],
  ["random", null],
];
function buildControls() {
  $("six").innerHTML = NAMES.map((n, i) => `<div class="ctl"><span class="k">${n}</span><input id="s${i}" type="range" min="-1" max="1" step="0.01" value="${six[i]}" /><b id="s${i}v"></b></div>`).join("");
  NAMES.forEach((_, i) => $(`s${i}`).addEventListener("input", (e) => { six[i] = +e.target.value; anatomy(); }));
  $("presets").innerHTML = PRESETS.map(([n], i) => `<button type="button" data-p="${i}">${n}</button>`).join("");
  $("presets").addEventListener("click", (e) => { const i = e.target.dataset?.p; if (i == null) return; const p = PRESETS[+i][1]; six = p ? p.slice() : six.map(() => +(Math.random() * 2 - 1).toFixed(2)); NAMES.forEach((_, k) => ($(`s${k}`).value = six[k])); anatomy(); });
}
// the 4D view: a rotation built from turns in three planes, the first two rows the screen, the third depth
const view = { p: 0.5, q: 0.35, r: 0.25 };
function viewRows() {
  const R = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => +(i === j)));
  const rot = (i, j, t) => { const c = Math.cos(t), s = Math.sin(t); for (const row of R) { const a = row[i], b = row[j]; row[i] = c * a - s * b; row[j] = s * a + c * b; } };
  rot(0, 2, view.p); rot(1, 3, view.q); rot(0, 3, view.r); rot(1, 2, 0.3 * view.p);
  return R;
}
let cf = null, clock = 0, last = 0;
function anatomy() {
  NAMES.forEach((_, i) => ($(`s${i}v`).textContent = fmt(six[i])));
  const F = fromSix(six); cf = canonical(F); const { l, r } = halves(F), L = Math.hypot(...l), Rr = Math.hypot(...r);
  const kind = cf.a < 1e-9 ? ["no field", DIM] : cf.simple ? ["simple: one plane", CA] : Rr < 1e-3 * cf.a ? ["all left", CL] : L < 1e-3 * cf.a ? ["all right", CR] : ["two planes", CB];
  $("kAnat").innerHTML = `rates <b style="color:${CA}">a ${fmt(cf.a)}</b> · <b style="color:${CB}">b ${fmt(cf.b)}</b><br>|left| <b style="color:${CL}">${fmt(L)}</b> · |right| <b style="color:${CR}">${fmt(Rr)}</b><br>F∧F = 2ab = <b>${fmt(2 * cf.pf, 3)}</b><br><span class="badge" style="color:${kind[1]}">${kind[0]}</span>`;
  const ratio = cf.a > 1e-9 ? Math.abs(cf.b) / cf.a : 0;
  $("rAnat").innerHTML = cf.a < 1e-9 ? "No field: nothing turns." : cf.simple
    ? `<b>One plane</b>, turning at ${fmt(cf.a)}: the point circles in it, and the plane at right angles to it doesn't move. Its halves are equal in size (${fmt(L)} each), which is what makes it simple${six.filter((x) => Math.abs(x) > 1e-3).length > 2 ? `, even though ${six.filter((x) => Math.abs(x) > 1e-3).length} of its six numbers are non-zero: a single plane, tilted` : ""}. Every field in our world is like this.`
    : Math.abs(ratio - 1) < 1e-3 ? `<b>All ${cf.b > 0 ? "left" : "right"}</b>: both planes turn at ${fmt(cf.a)}, and the point goes round a great circle. So does every point, each on its own circle, the circles of Hopf's fibration. A field like this has no planes of its own: any plane through a point and its image will do.`
    : `<b>Two planes</b>, turning at ${fmt(cf.a)} and ${fmt(Math.abs(cf.b))}: the point winds round a torus${Math.abs(ratio * 6 - Math.round(ratio * 6)) < 1e-6 ? `, closing after ${Math.round(6 / gcd(Math.round(ratio * 6), 6))} turns of the first plane, since the rates' ratio is a simple fraction` : ", never closing unless the rates' ratio is a fraction"}. The halves differ in size (${fmt(L)} and ${fmt(Rr)}), and their difference is F∧F.`;
  drawHalves(l, r);
}
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.max(1, a));
function drawView(t) {
  const cv = $("cView"); if (!cv.clientWidth) return; const { g, w, h } = sizeCanvas(cv), R = viewRows(), S = Math.min(w, h) * 0.36, cx = w / 2, cy = h / 2;
  const P = (p) => { const s = R.map((row) => row.reduce((a, x, k) => a + x * p[k], 0)); return [cx + S * s[0], cy - S * s[1], s[2]]; };
  // the axes, faint
  g.font = "11px ui-monospace, monospace";
  ["x", "y", "z", "w"].forEach((n, k) => { const e = [0, 0, 0, 0]; e[k] = 1.15; const [X, Y] = P(e), [X0, Y0] = P(e.map((v) => -v)); g.strokeStyle = "rgba(255,255,255,0.12)"; g.beginPath(); g.moveTo(X0, Y0); g.lineTo(X, Y); g.stroke(); g.fillStyle = "rgba(255,255,255,0.35)"; g.fillText(n, X + 3, Y - 3); });
  if (!cf || cf.a < 1e-9) return;
  // the two planes as rings, brightness by rate, with an arrow for the sense of turning
  for (const [e1, e2, rate, col] of [[cf.u, cf.v, cf.a, CA], [cf.w, cf.x, cf.b, CB]]) {
    const pts = Array.from({ length: 97 }, (_, i) => { const th = (2 * Math.PI * i) / 96; return P(e1.map((x, k) => x * Math.cos(th) + e2[k] * Math.sin(th))); });
    g.strokeStyle = col; g.globalAlpha = Math.abs(rate) < 1e-6 ? 0.18 : 0.35 + 0.55 * Math.abs(rate) / cf.a; g.lineWidth = 2; g.setLineDash(Math.abs(rate) < 1e-6 ? [4, 4] : []);
    g.beginPath(); pts.forEach(([X, Y], i) => (i ? g.lineTo(X, Y) : g.moveTo(X, Y))); g.stroke(); g.setLineDash([]);
    if (Math.abs(rate) > 1e-6) for (const i0 of [10, 58]) { const i1 = rate > 0 ? i0 + 3 : i0 - 3, [X0, Y0] = pts[i0], [X1, Y1] = pts[i1], ang = Math.atan2(Y1 - Y0, X1 - X0); g.fillStyle = col; g.beginPath(); g.moveTo(X1, Y1); g.lineTo(X1 - 9 * Math.cos(ang - 0.45), Y1 - 9 * Math.sin(ang - 0.45)); g.lineTo(X1 - 9 * Math.cos(ang + 0.45), Y1 - 9 * Math.sin(ang + 0.45)); g.fill(); }
    g.globalAlpha = 1; g.lineWidth = 1;
  }
  // a point turned by the field: its trail (fading) and where it is now
  const p0 = Math.abs(cf.b) > 1e-6 ? cf.u.map((x, k) => (x + cf.w[k] * 0.8) / Math.hypot(1, 0.8)) : cf.u.map((x, k) => (x + cf.w[k] * 0.6) / Math.hypot(1, 0.6));
  const span = (2 * Math.PI * 6) / cf.a, n = 420;
  for (let i = 1; i <= n; i++) { const t1 = t - (span * (i - 1)) / n, t0 = t - (span * i) / n, [X1, Y1] = P(turn(cf, p0, t1)), [X0, Y0] = P(turn(cf, p0, t0)); g.strokeStyle = `rgba(233,228,218,${0.85 * (1 - i / n)})`; g.beginPath(); g.moveTo(X0, Y0); g.lineTo(X1, Y1); g.stroke(); }
  const [X, Y] = P(turn(cf, p0, t)); g.fillStyle = TXT; g.beginPath(); g.arc(X, Y, 4, 0, 2 * Math.PI); g.fill();
}
function drawHalves(l, r) {
  const cv = $("cHalves"), { g, w, h } = sizeCanvas(cv), half = w / 2, S = Math.min(half, h) * 0.32;
  const iso = (v, ox) => [ox + S * (v[0] - v[1]) * 0.87, h * 0.58 - S * (v[2] - (v[0] + v[1]) * 0.5)];
  g.font = "11px ui-monospace, monospace";
  [[l, CL, "left", 0], [r, CR, "right", half]].forEach(([v, col, name, ox0]) => {
    const ox = ox0 + half / 2;
    ["1", "2", "3"].forEach((n, k) => { const e = [0, 0, 0]; e[k] = 1.25; const [X, Y] = iso(e, ox), [X0, Y0] = iso([0, 0, 0], ox); g.strokeStyle = "rgba(255,255,255,0.15)"; g.beginPath(); g.moveTo(X0, Y0); g.lineTo(X, Y); g.stroke(); });
    const [X0, Y0] = iso([0, 0, 0], ox), [X, Y] = iso(v, ox), len = Math.hypot(X - X0, Y - Y0);
    if (len > 1) { const ang = Math.atan2(Y - Y0, X - X0); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(X0, Y0); g.lineTo(X, Y); g.stroke(); g.lineWidth = 1; g.beginPath(); g.moveTo(X + 3 * Math.cos(ang), Y + 3 * Math.sin(ang)); g.lineTo(X - 10 * Math.cos(ang - 0.4), Y - 10 * Math.sin(ang - 0.4)); g.lineTo(X - 10 * Math.cos(ang + 0.4), Y - 10 * Math.sin(ang + 0.4)); g.fill(); }
    g.fillStyle = col; g.fillText(`${name} ${fmt(Math.hypot(...v))}`, ox0 + 8, 16);
  });
}
function bindDrag() {
  const cv = $("cView"); let drag = null;
  cv.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing"; });
  cv.addEventListener("pointermove", (e) => { if (!drag) return; view.p += (e.clientX - drag[0]) * 0.01; view.q += (e.clientY - drag[1]) * 0.01; drag = [e.clientX, e.clientY]; });
  const up = () => { drag = null; cv.style.cursor = "grab"; }; cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
}
let onScreen = true;
function loop(ts) {
  const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
  if (onScreen) { if (cf && cf.a > 1e-9) clock += dt * (1.2 / Math.max(cf.a, 0.15)) * 0.6; view.r += dt * 0.05; drawView(clock); }
  requestAnimationFrame(loop);
}

/* ---------------------------------------------------------------- 2 · frozen in */
const STARTS = { two: [1, 0, 0, 0, 0, 0.4], simple: [0, 0.6, 0.6, 0.2, 0.2, 0], left: [0.7, 0, 0, 0, 0, 0.7] }, STARTLAB = { two: "a 1, b 0.4", simple: "one plane, a 0.85", left: "a = b = 0.7" };
function plotLog(cv, { x, y, series, xl, yl }) {
  const { g, w, h } = sizeCanvas(cv), L = 46, R = 12, T = 12, B = 30, ly = (v) => Math.log10(v);
  const X = (v) => L + ((w - L - R) * (v - x[0])) / (x[1] - x[0]), Y = (v) => h - B - ((h - B - T) * (ly(v) - ly(y[0]))) / (ly(y[1]) - ly(y[0]));
  g.font = "10px ui-monospace, monospace"; g.strokeStyle = "rgba(255,255,255,0.18)"; g.fillStyle = DIM;
  g.beginPath(); g.moveTo(L, T); g.lineTo(L, h - B); g.lineTo(w - R, h - B); g.stroke();
  for (let e = Math.ceil(ly(y[0])); e <= ly(y[1]); e++) { const yy = Y(10 ** e); g.strokeStyle = "rgba(255,255,255,0.06)"; g.beginPath(); g.moveTo(L, yy); g.lineTo(w - R, yy); g.stroke(); g.fillText(e === 0 ? "1" : `10${String(e).replace("-", "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d])}`, 6, yy + 3); }
  for (const v of [x[0], (x[0] + x[1]) / 2, x[1]]) g.fillText(String(v), X(v) - 6, h - B + 14);
  g.fillText(xl, w - R - g.measureText(xl).width, h - 4);
  let ly0 = T + 16;
  for (const s of series) {
    g.strokeStyle = s.c; g.lineWidth = s.w ?? 2; g.setLineDash(s.dash ?? []); g.beginPath(); let on = false;
    for (const [a, b] of s.pts) { if (!(b > 0)) { on = false; continue; } const yy = Math.max(T, Math.min(h - B, Y(b))); if (on) g.lineTo(X(a), yy); else { g.moveTo(X(a), yy); on = true; } }
    g.stroke(); g.setLineDash([]); g.lineWidth = 1;
    g.fillStyle = s.c; g.fillRect(w - R - 190, ly0 - 7, 12, 3); g.fillStyle = TXT; g.fillText(s.label, w - R - 172, ly0 - 3); ly0 += 14;
  }
}
function frozen() {
  const flow = $("flow").value, c = +$("comp").value, st = $("start").value; $("compv").textContent = c.toFixed(2);
  const run = carry(FLOWS[flow], c, [0.3, -0.5, 0.8, 0.1], fromSix(STARTS[st]), 8, 240, 12);
  const s0 = run[0].s, a0 = run[0].a, b0 = Math.abs(run[0].b), drift = Math.max(...run.map((r) => Math.abs(r.s - s0))) / Math.max(Math.abs(s0), 1e-30);
  const series = [
    { pts: run.map((r) => [r.t, r.a]), c: CA, label: "rate a (the larger plane)" },
    { pts: run.map((r) => [r.t, Math.abs(r.b)]), c: CB, label: "rate |b| (the other)" },
    { pts: run.map((r) => [r.t, r.rho]), c: DIM, dash: [5, 4], label: "density ρ" },
  ];
  if (Math.abs(s0) > 1e-12) series.push({ pts: run.map((r) => [r.t, r.s / s0]), c: TXT, w: 2.5, dash: [2, 3], label: "(F∧F/ρ) ÷ its start" });
  plotLog($("cFrozen"), { x: [0, 8], y: [1e-4, 1e3], series, xl: "time" }); $("capFrozen").textContent = `log scale · the parcel started with the field at ${STARTLAB[st]} and density 1`;
  const amax = Math.max(...run.map((r) => r.a)) / a0, amin = Math.min(...run.map((r) => r.a)) / a0, rmin = Math.min(...run.map((r) => r.rho)), bmax = Math.max(...run.map((r) => Math.abs(r.b) / r.a));
  $("rFrozen").innerHTML = Math.abs(s0) > 1e-12
    ? `The field's larger rate ranged ×${amin.toFixed(2)}–${amax.toFixed(1)} of its start, the smaller ${(Math.min(...run.map((r) => Math.abs(r.b))) / b0).toFixed(3)}–${(Math.max(...run.map((r) => Math.abs(r.b))) / b0).toFixed(2)}, and the gas was squeezed to ${rmin.toFixed(2)} of its density and back. <b>F∧F/ρ held to ${drift.toExponential(0)} of its start</b>, the integration's own error.`
    : `A simple field: the larger rate ranged ×${amin.toFixed(2)}–${amax.toFixed(1)} of its start, but <b>the second plane never woke</b>: |b| stayed under ${Math.max(bmax, 1e-16).toExponential(0)} of a, the integration's own error. The field stayed a single plane, its sheet carried with the gas.`;
}

/* ---------------------------------------------------------------- wiring */
buildControls(); bindDrag(); anatomy();
for (const id of ["flow", "start", "comp"]) $(id).addEventListener("input", frozen);
frozen();
new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); }).observe($("cView"));
addEventListener("resize", () => { anatomy(); frozen(); });
requestAnimationFrame(loop);
