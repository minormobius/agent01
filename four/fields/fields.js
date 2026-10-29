/* Fields in four dimensions: the electrostatics and magnetism of the pinned 1/r, as toys. The physics is
   ../atom/js/fields.js (the shell's potential, a loop's field by Biot–Savart, a charge's turning in a uniform field),
   which ATOM⁴'s selftest checks; this file only draws. */
import { shellPotential, neutralShell, loopField, bivectorSize, cyclotronPath, cyclotronRates } from "../atom/js/fields.js";

const $ = (id) => document.getElementById(id);
const C3 = "#ffb46b", C4 = "#6fe0ff", PIN = "#c79bff", DIM = "#9a958c";
const range = (lo, hi, n, log = false) => Array.from({ length: n }, (_, i) => (log ? lo * (hi / lo) ** (i / (n - 1)) : lo + ((hi - lo) * i) / (n - 1)));
const sizeCanvas = (cv) => { const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { g, w, h }; };

/* a small line chart on a canvas: x and y ranges (log optional), series of points, labels */
function plot(cv, { x, y, logx = false, logy = false, xl = "", yl = "", series = [], hline = null, marks = [], vlines = [] }) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const L = 44, R = 10, T = 10, B = 30, tx = (v) => (logx ? Math.log10(v) : v), ty = (v) => (logy ? Math.log10(v) : v);
  const X = (v) => L + ((w - L - R) * (tx(v) - tx(x[0]))) / (tx(x[1]) - tx(x[0])), Y = (v) => h - B - ((h - B - T) * (ty(v) - ty(y[0]))) / (ty(y[1]) - ty(y[0]));
  g.font = "10px ui-monospace, monospace"; g.strokeStyle = "rgba(255,255,255,0.18)"; g.fillStyle = DIM;
  g.beginPath(); g.moveTo(L, T); g.lineTo(L, h - B); g.lineTo(w - R, h - B); g.stroke();
  if (hline != null) { g.setLineDash([3, 3]); g.beginPath(); g.moveTo(L, Y(hline)); g.lineTo(w - R, Y(hline)); g.stroke(); g.setLineDash([]); }
  const ticks = (lo, hi, log) => (log ? [...Array(Math.round(Math.log10(hi / lo)) + 1)].map((_, i) => lo * 10 ** i) : [lo, (lo + hi) / 2, hi]);
  for (const v of ticks(x[0], x[1], logx)) g.fillText(String(+v.toPrecision(2)), X(v) - 8, h - B + 13);
  const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹", lab = (v, log) => (log && (v >= 1e4 || v < 1e-2) ? "10" + String(Math.round(Math.log10(v))).replace("-", "⁻").replace(/\d/g, (c) => SUP[c]) : String(+v.toPrecision(2)));
  for (const v of ticks(y[0], y[1], logy)) g.fillText(lab(v, logy), 2, Y(v) + 3);
  g.fillText(xl, w - R - g.measureText(xl).width, h - 4); g.save(); g.translate(10, T + 4); g.fillText(yl, 26, 6); g.restore();
  for (const s of series) {
    g.strokeStyle = s.c; g.lineWidth = s.w ?? 2; g.setLineDash(s.dash ?? []); g.beginPath(); let on = false;
    // a curve that leaves the chart is drawn to its edge and stops there, rather than running along it
    for (const [a, b] of s.pts) { if (!isFinite(b)) { on = false; continue; } const out = b < y[0] || b > y[1], py = Math.max(T, Math.min(h - B, Y(b))); if (out) { if (on) g.lineTo(X(a), py); on = false; continue; } on ? g.lineTo(X(a), py) : g.moveTo(X(a), py); on = true; }
    g.stroke(); g.setLineDash([]); g.lineWidth = 1;
  }
  for (const v of vlines) { g.strokeStyle = v.c; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(X(v.x), T); g.lineTo(X(v.x), h - B); g.stroke(); g.setLineDash([]); g.fillStyle = v.c; if (v.label) g.fillText(v.label, Math.min(X(v.x) + 5, w - R - g.measureText(v.label).width), T + 34); }
  for (const m of marks) { g.fillStyle = m.c; g.beginPath(); g.arc(X(m.x), Y(m.y), 4, 0, 7); g.fill(); if (m.label) g.fillText(m.label, X(m.x) + 8, Y(m.y) + (m.below ? 16 : -6)); }
  let ly = T + 12; for (const s of series.filter((s) => s.label)) { g.fillStyle = s.c; g.fillText(s.label, w - R - 6 - g.measureText(s.label).width, ly); ly += 13; }
}

/* 1 · two point charges in a slice: the potential, coloured, with equipotentials. Pinned 4D and ours are the same
   function of distance, so they draw the same; Gauss's law is 1/r² */
let law = "3", lift = 0;
const charges = [{ x: -1, y: 0, q: 1 }, { x: 1, y: 0, q: -1 }], SPAN = 3;
function potential(x, y) {
  let s = 0;
  for (const c of charges) { const r2 = (x - c.x) ** 2 + (y - c.y) ** 2 + (c.q > 0 ? lift * lift : 0) + 1e-4; s += c.q * (law === "g" ? 0.6 / r2 : 1 / Math.sqrt(r2)); }
  return s;
}
function drawMap() {
  const cv = $("cMap"), { g, w, h } = sizeCanvas(cv), n = 260, img = g.createImageData(n, n), band = (v) => Math.floor(Math.sign(v) * Math.log1p(Math.abs(v) * 6) * 3);
  const val = Array.from({ length: n * n }, (_, k) => potential(((k % n) / (n - 1) - 0.5) * 2 * SPAN, -((Math.floor(k / n)) / (n - 1) - 0.5) * 2 * SPAN));
  for (let k = 0; k < n * n; k++) {
    const v = val[k], t = Math.min(1, Math.log1p(Math.abs(v) * 3) / 2.2), edge = (k % n < n - 1 && band(val[k + 1]) !== band(v)) || (k + n < n * n && band(val[k + n]) !== band(v));
    const [r, gg, b] = v > 0 ? [255, 180, 107] : [111, 224, 255], bg = [11, 13, 19];
    for (let c = 0; c < 3; c++) img.data[4 * k + c] = edge ? 233 : bg[c] + ([r, gg, b][c] - bg[c]) * t * 0.85;
    img.data[4 * k + 3] = 255;
  }
  const off = new OffscreenCanvas(n, n); off.getContext("2d").putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.drawImage(off, 0, 0, w, h);
  for (const c of charges) { const X = ((c.x / SPAN + 1) / 2) * w, Y = ((1 - c.y / SPAN) / 2) * h; g.fillStyle = c.q > 0 ? C3 : C4; g.globalAlpha = c.q > 0 ? Math.max(0.35, 1 - lift / 2) : 1; g.beginPath(); g.arc(X, Y, 7, 0, 7); g.fill(); g.globalAlpha = 1; g.fillStyle = "#07080c"; g.font = "bold 11px ui-monospace, monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(c.q > 0 ? "+" : "−", X, Y + 0.5); }
  $("liftv").textContent = lift ? `${lift.toFixed(2)} into ${law === "3" ? "z" : "w"}` : "in the slice";
  $("rMap").innerHTML = law === "3" ? `Our electrostatics: 1/distance. Lifting the charge into z, out of the slice, fades its pull here as 1/√(r² + z²).`
    : law === "p" ? `<b>Pixel for pixel the same picture as ours.</b> The pinned potential is 1/distance, and lifting into w is no different from lifting into z.`
    : `Gauss's law in 4D: 1/distance². The colours crowd close to each charge and fade sooner. This is the law under which no atom has a size.`;
}
function setupMap() {
  const cv = $("cMap"); let drag = null;
  const at = (e) => { const b = cv.getBoundingClientRect(); return [((e.clientX - b.left) / b.width * 2 - 1) * SPAN, (1 - (e.clientY - b.top) / b.height * 2) * SPAN]; };
  cv.addEventListener("pointerdown", (e) => { const [x, y] = at(e); drag = charges.reduce((best, c) => (Math.hypot(c.x - x, c.y - y) < Math.hypot(best.x - x, best.y - y) ? c : best)); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (!drag) return; const [x, y] = at(e); drag.x = Math.max(-SPAN, Math.min(SPAN, x)); drag.y = Math.max(-SPAN, Math.min(SPAN, y)); drawMap(); });
  cv.addEventListener("pointerup", () => (drag = null));
  $("law").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; for (const x of $("law").children) x.classList.toggle("on", x === b); law = b.dataset.v; drawMap(); });
  $("lift").addEventListener("input", (e) => { lift = +e.target.value; drawMap(); });
}

/* 2 · field lines as flux: under Gauss, a fixed number crossing every circle; pinned in 4D, the count grows with r,
   so lines start in empty space. Line k is born at the radius where the flux first needs it */
function drawLines(id, grows) {
  const { g, w, h } = sizeCanvas($(id)), cx = w / 2, cy = h / 2, R = w / 2 - 6, r0 = R * 0.12, base = 10, lines = [];
  g.fillStyle = "#0b0d13"; g.fillRect(0, 0, w, h);
  const total = grows ? base * (R / r0) : base;
  for (let k = 0; k < total; k++) { const born = grows ? Math.max(r0, (k / base) * r0) : r0, ang = (k * 2.399963) % (2 * Math.PI); lines.push({ born, ang }); }
  g.strokeStyle = grows ? C4 : C3; g.lineWidth = 1;
  for (const { born, ang } of lines) { g.globalAlpha = born > r0 ? 0.7 : 1; g.beginPath(); g.moveTo(cx + born * Math.cos(ang), cy + born * Math.sin(ang)); g.lineTo(cx + R * Math.cos(ang), cy + R * Math.sin(ang)); g.stroke(); if (born > r0) { g.fillStyle = C4; g.beginPath(); g.arc(cx + born * Math.cos(ang), cy + born * Math.sin(ang), 1.6, 0, 7); g.fill(); } }
  g.globalAlpha = 1; g.strokeStyle = "#ffffff22"; for (const f of [0.3, 0.6, 0.9]) { g.beginPath(); g.arc(cx, cy, R * f, 0, 7); g.stroke(); }
  g.fillStyle = grows ? C4 : C3; g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill();
}
function drawFlux() {
  const rs = range(0.1, 5, 100);
  plot($("cFlux"), { x: [0, 5], y: [0, 5.5], xl: "radius of the sphere", yl: "flux ÷ the charge", series: [
    { pts: rs.map((r) => [r, 1]), c: C3, label: "ours, and 4D Gauss: the charge" },
    { pts: rs.map((r) => [r, r]), c: C4, label: "4D pinned: grows as r" }] });
}

/* 3 · a nucleus in a shell of electron charge: felt from outside (zero in 3D), and a lone shell inside (no cage) */
function drawNeutral() {
  const a = +$("shellA").value, ss = range(0.02, 6, 300);
  $("shellAv").textContent = a.toFixed(2);
  plot($("cNeutral"), { x: [0, 6], y: [-0.005, 0.05], xl: "distance from the atom's centre", yl: "felt by a + charge", hline: 0, vlines: [{ x: a, c: "#e9e4da66", label: "shell" }], series: [
    { pts: ss.filter((s) => s > a).map((s) => [s, neutralShell(s, a, 3)]), c: C3, label: "ours: nothing" },
    { pts: ss.filter((s) => s > a).map((s) => [s, neutralShell(s, a, 4)]), c: C4, label: "4D pinned" },
    { pts: ss.filter((s) => s > a).map((s) => [s, (a * a) / (8 * s ** 3)]), c: "#ffffff66", w: 1, dash: [3, 3], label: "a²/8s³" }] });
  const ins = range(0, a, 100);
  plot($("cCage"), { x: [0, a], y: [0, 1.4 / a], xl: "inside a lone charged shell", yl: "potential", vlines: [], series: [
    { pts: ins.map((s) => [s, shellPotential(s, a, 3)]), c: C3, label: "ours: flat, a Faraday cage" },
    { pts: ins.map((s) => [s, shellPotential(s, a, 4)]), c: C4, label: "4D pinned: a hill" }] });
  const s = 3 * a;
  $("rNeutral").innerHTML = `At three shell radii out, the 4D atom's leak is <b>${neutralShell(s, a, 4).toExponential(2)}</b>, against a²/8s³ = ${((a * a) / (8 * s ** 3)).toExponential(2)}, and ours is exactly 0. Inside a lone shell, 4D's centre sits <b>${(shellPotential(0, a, 4) / shellPotential(a, a, 4)).toFixed(3)}</b> times its wall's potential (3π/8); ours is flat.`;
}

/* 4 · a current loop's field along a line at right angles through its centre, each law's kernel */
function drawLoop() {
  const zs = range(0.3, 30, 60, true), B = (d, p, z) => bivectorSize(loopField(d === 3 ? [0, 0, z] : [0, 0, z, 0], p, 360));
  const s3 = zs.map((z) => [z, B(3, 1, z)]), s4p = zs.map((z) => [z, B(4, 1, z)]), s4g = zs.map((z) => [z, B(4, 2, z)]);
  const lg = (pts) => pts.map(([x, y]) => [x, Math.log10(y)]);
  plot($("cLoop"), { x: [0.3, 30], y: [-6, 1.5], logx: true, xl: "distance along the loop's axis (loop radius 1)", yl: "log₁₀ of the field", series: [
    { pts: lg(s3), c: C3, label: "ours" }, { pts: lg(s4p), c: C4, label: "4D pinned" }, { pts: lg(s4g), c: DIM, dash: [4, 3], label: "4D Maxwell (Gauss)" }] });
  const slope = (s) => Math.log(s.at(-1)[1] / s.at(-8)[1]) / Math.log(s.at(-1)[0] / s.at(-8)[0]);
  $("rLoop").innerHTML = `Far out, the field falls as r^<b>${slope(s3).toFixed(2)}</b> for ours, r^<b>${slope(s4p).toFixed(2)}</b> for pinned 4D, and r^${slope(s4g).toFixed(2)} for plain 4D Maxwell. Ours and pinned 4D lie exactly on top of each other here: every piece of the loop is at the same distance from this line in both worlds, and the kernel is the same 1/distance. Along this line only one of the field's planes is nonzero: the loop's own, xy. That's what we call a field along the axis. In 4D the loop has a whole plane of such lines (every direction in zw), and away from them the other planes join in.`;
}

/* 5 · a charge in a uniform field with parts in xy and zw: its path's two shadows */
let path = [], t0 = 0;
function setCyc() {
  const a = +$("bxy").value, b = +$("bzw").value, B = [[0, a, 0, 0], [-a, 0, 0, 0], [0, 0, 0, b], [0, 0, -b, 0]];
  $("bxyv").textContent = a.toFixed(2); $("bzwv").textContent = b.toFixed(2);
  path = cyclotronPath(B, [0.9, 0, 0.6, 0.25], 60, 2400); t0 = performance.now();
  const r = cyclotronRates(B), eq = (u, v) => Math.abs(u - v) < 0.02;
  const kind = eq(r.right, 0) && r.left > 0.02 ? "<b>All left half.</b> One rate, closed circles in both planes, and an electron's spin feels the whole field."
    : eq(r.left, 0) && r.right > 0.02 ? "<b>All right half.</b> The path still turns, but an electron's spin doesn't feel this field at all."
    : Math.abs(b) < 0.02 || Math.abs(a) < 0.02 ? "<b>One plane only</b>, like our magnets: a circle there, free drift across it, now in two directions instead of one."
    : "<b>Two planes at two rates</b>: the path winds round a torus, closing only if the rates' ratio is a fraction.";
  $("rCyc").innerHTML = `Turning rates ${r.fast.toFixed(2)} and ${r.slow.toFixed(2)}. Left half ${r.left.toFixed(2)}, right half ${r.right.toFixed(2)}: an electron's spin feels the left half only. ${kind}`;
}
function drawOrbit(id, i, j, col, n) {
  const { g, w, h } = sizeCanvas($(id)), sc = w / 2 / 3.6;
  g.clearRect(0, 0, w, h); g.strokeStyle = "#ffffff14"; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath();
  for (let k = 0; k < n; k++) { const p = path[k], X = w / 2 + p[i] * sc, Y = h / 2 - p[j] * sc; k ? g.lineTo(X, Y) : g.moveTo(X, Y); }
  g.stroke(); const p = path[n - 1]; g.fillStyle = "#e9e4da"; g.beginPath(); g.arc(w / 2 + p[i] * sc, h / 2 - p[j] * sc, 3.5, 0, 7); g.fill();
}
function animate() {
  const n = Math.min(path.length, 2 + Math.floor(((performance.now() - t0) / 6000) * path.length));
  if ($("cXY").getBoundingClientRect().bottom > 0 && $("cXY").getBoundingClientRect().top < innerHeight) { drawOrbit("cXY", 0, 1, C3, n); drawOrbit("cZW", 0, 2, C4, n); }
  requestAnimationFrame(animate);
}

/* 6 · an atom in a magnet (js/magnet.js on the solver's atoms): diamagnetism from both halves, the spin's Curie pull
   from the left half only, against how the field splits between its xy and zw planes */
let MG = null, TAB = null;
function drawMag() {
  if (!MG) return;
  const atom = TAB[4][+$("magAtom").value - 1], t = +$("magT").value, kT = 10 ** +$("magK").value * MG.KELVIN;
  const F = (b) => [[0, 1, 0, 0], [-1, 0, 0, 0], [0, 0, 0, b], [0, 0, -b, 0]], dia = -MG.diamagnetic(atom, 4), S = MG.spinOf(atom, 4), cu = MG.curie(S, kT);
  const ts = range(-1, 1, 201), spin = ts.map((b) => [b, MG.fieldShape(F(b)) * cu]);
  $("magTv").textContent = t.toFixed(2); $("magKv").textContent = `${Math.round(10 ** +$("magK").value)} K`;
  plot($("cMag"), { x: [-1, 1], y: [0.1, 1e6], logy: true, xl: "field in zw: −1 all right · 0 one plane · +1 all left", yl: "", series: [
    { pts: spin, c: C4, label: "the spin's pull in" }, { pts: ts.map((b) => [b, dia]), c: C3, dash: [5, 4], label: "diamagnetism's push out" }], vlines: [{ x: t, c: DIM }] });
  const sh = MG.fieldShape(F(t)), net = sh * cu - dia, r = cyclotronRates(F(t)), fmt = (n) => (n >= 100 ? Math.round(n).toLocaleString("en") : n.toPrecision(2));
  $("rMag").innerHTML = `Left half ${r.left.toFixed(2)}, right half ${r.right.toFixed(2)}: the spin feels ${sh.toFixed(2)} times what a field in one plane gives. Strength in atomic units. Spin S = ${S}${S ? `, its pull ${fmt(sh * cu)}` : " (no pull)"}; diamagnetism's push ${dia.toFixed(2)}. ` +
    (net > 0 ? `<b>Drawn in</b>, ${S && dia ? `${fmt((sh * cu) / dia)} times harder than it's pushed` : ""}.` : `<b>Pushed out.</b>`);
}
Promise.all([import("../atom/js/magnet.js"), import("../atom/js/table.js")]).then(([m, t]) => { MG = m; TAB = t.TABLE; drawMag(); });
for (const id of ["magAtom", "magT", "magK"]) $(id).addEventListener("input", drawMag);

setupMap();
for (const id of ["bxy", "bzw"]) $(id).addEventListener("input", setCyc);
$("shellA").addEventListener("input", drawNeutral);
const all = () => { drawMap(); drawLines("cLines3", false); drawLines("cLines4", true); drawFlux(); drawNeutral(); drawLoop(); drawMag(); };
setCyc(); all(); requestAnimationFrame(animate);
let rt = 0; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(all, 150); });
