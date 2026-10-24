/* Lumen⁴ — the page: six experiments, each drawing 3D (warm) beside 4D (ice). The physics is ./optics.js. */
import * as O from "./optics.js";

const $ = (id) => document.getElementById(id);
const C3 = "#ffb46b", C4 = "#6fe0ff", DIM = "#9a958c", GRID = "#262833", DEG = Math.PI / 180;
const fmt = (v, d = 2) => (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-2 && v !== 0) ? v.toExponential(1) : v.toFixed(d));

/* ------------------------------------------------------------- a canvas, sized to its box */
function ctx2d(cv) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return { g, w, h };
}
/* a chart: o = { x: [a, b], y: [a, b], logx, logy, xl, yl, series: [{ pts, c, w, dash, label }], vlines: [{ x, c, label }], bands } */
function chart(cv, o) {
  const { g, w, h } = ctx2d(cv), L = 46, R = 12, T = 12, B = 30;
  const tx = (v) => (o.logx ? Math.log10(v) : v), ty = (v) => (o.logy ? Math.log10(v) : v);
  const [x0, x1] = o.x.map(tx), [y0, y1] = o.y.map(ty);
  const X = (v) => L + ((tx(v) - x0) / (x1 - x0)) * (w - L - R), Y = (v) => T + (1 - (ty(v) - y0) / (y1 - y0)) * (h - T - B);
  g.font = "11px ui-monospace, Menlo, monospace"; g.fillStyle = DIM; g.strokeStyle = GRID; g.lineWidth = 1;
  for (const b of o.bands || []) { const a = X(b.x0), z = X(b.x1); if (b.grad) { const gr = g.createLinearGradient(a, 0, z, 0); b.grad.forEach(([t, c]) => gr.addColorStop(t, c)); g.fillStyle = gr; } else g.fillStyle = b.fill; g.fillRect(a, T, z - a, h - T - B); }
  const ticks = (lo, hi, log) => { if (log) { const out = []; for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) out.push(10 ** e); return out; } const span = hi - lo, step = 10 ** Math.floor(Math.log10(span / 4)), s = [1, 2, 5, 10].map((k) => k * step).find((k) => span / k <= 6); const out = []; for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(+v.toFixed(10)); return out; };
  g.fillStyle = DIM; g.textAlign = "center"; g.textBaseline = "top";
  for (const v of ticks(x0, x1, o.logx)) { const x = X(v); g.strokeStyle = GRID; g.beginPath(); g.moveTo(x, T); g.lineTo(x, h - B); g.stroke(); g.fillText(o.logx ? "1e" + Math.round(Math.log10(v)) : String(v), x, h - B + 4); }
  g.textAlign = "right"; g.textBaseline = "middle";
  for (const v of ticks(y0, y1, o.logy)) { const y = Y(v); g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke(); g.fillText(o.logy ? "1e" + Math.round(Math.log10(v)) : String(v), L - 4, y); }
  g.textAlign = "right"; g.textBaseline = "bottom"; g.fillText(o.xl || "", w - R, h - 2);
  g.save(); g.translate(11, T); g.rotate(-Math.PI / 2); g.textAlign = "right"; g.textBaseline = "top"; g.fillText(o.yl || "", 0, 0); g.restore();
  g.save(); g.beginPath(); g.rect(L, T, w - L - R, h - T - B); g.clip();
  for (const v of o.vlines || []) { g.strokeStyle = v.c; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(v.x), T); g.lineTo(X(v.x), h - B); g.stroke(); g.setLineDash([]); if (v.label) { g.fillStyle = v.c; g.textAlign = "left"; g.textBaseline = "top"; g.fillText(v.label, X(v.x) + 4, T + 2 + (v.dy || 0)); } }
  for (const s of o.series) {
    g.strokeStyle = s.c; g.lineWidth = s.w || 2; g.setLineDash(s.dash || []); g.beginPath(); let on = false;
    for (const [a, b] of s.pts) { if (!isFinite(b) || (o.logy && b <= 0)) { on = false; continue; } const x = X(a), y = Y(Math.max(o.logy ? 1e-300 : -1e300, b)); if (on) g.lineTo(x, y); else g.moveTo(x, y); on = true; }
    g.stroke(); g.setLineDash([]);
  }
  g.restore();
  // the legend, top right
  let ly = T + 4; const lx = o.legendLeft ? L + 6 : w - R - 4; g.textAlign = o.legendLeft ? "left" : "right"; g.textBaseline = "top";
  for (const s of o.series) if (s.label) { g.fillStyle = s.c; g.fillText(s.label, lx, ly); ly += 14; }
}
const range = (a, b, n, log = false) => Array.from({ length: n }, (_, i) => (log ? a * (b / a) ** (i / (n - 1)) : a + ((b - a) * i) / (n - 1)));

/* ------------------------------------------------------------- 1 · falloff, and the laser */
let srcK = 0;
function drawFall() {
  const rs = range(0.1, 100, 200, true), s = [];
  for (const n of [3, 4]) { const p = O.falloff(n, srcK); if (p < 0) continue; s.push({ pts: rs.map((r) => [r, r ** -p]), c: n === 3 ? C3 : C4, label: `${n}D: 1/r${p === 0 ? "⁰ (constant)" : p === 1 ? "" : "^" + p}` }); }
  chart($("cFall"), { x: [0.1, 100], y: [1e-6, 1e3], logx: true, logy: true, xl: "distance r", yl: "intensity", series: s });
  const name = ["a point", "a line", "a plane", "a 3-flat"][srcK], p3 = O.falloff(3, srcK), p4 = O.falloff(4, srcK);
  $("rFall").innerHTML = `${name}: in 3D ${p3 < 0 ? "<b>fills the space</b> (there's nowhere left to spread)" : `<b>1/r^${p3}</b>`}; in 4D <b>1/r^${p4}</b>. Light from ${name} is spread over a sphere of dimension n − k − 1 round it.`;
}
function drawBeam() {
  const z = range(0.01, 100, 200, true);
  chart($("cBeam"), { x: [0.01, 100], y: [1e-6, 2], logx: true, logy: true, xl: "distance along the beam, in Rayleigh ranges (z / z_R)", yl: "on-axis intensity",
    series: [{ pts: z.map((u) => [u, O.beamOnAxis(u, 1, Math.PI, 3)]), c: C3, label: "3D: (w₀/w)²" }, { pts: z.map((u) => [u, O.beamOnAxis(u, 1, Math.PI, 4)]), c: C4, label: "4D: (w₀/w)³" }, { pts: z.map((u) => [u, O.beamWidth(u, 1, Math.PI) / 40]), c: DIM, w: 1, dash: [3, 3], label: "the width (both), /40" }],
    vlines: [{ x: 1, c: DIM, label: "z_R" }] });
}

/* ------------------------------------------------------------- 2 · a flash */
let flashT = 0, flashLast = 0;
function stripRow(g, w, y0, hh, vals) {
  const m = Math.max(1e-30, ...vals.map(Math.abs)), cw = w / vals.length;
  vals.forEach((v, i) => { const a = Math.min(1, Math.abs(v) / m) ** 0.6; g.fillStyle = v >= 0 ? `rgba(255,205,120,${a})` : `rgba(170,120,255,${a})`; g.fillRect(i * cw, y0, cw + 0.6, hh); });
}
function drawStrip(now) {
  const dt = Math.min(0.05, (now - flashLast) / 1000 || 0); flashLast = now; flashT += dt * 4; if (flashT > 26) flashT = -1;
  const { g, w, h } = ctx2d($("cStrip")), P = O.gauss(+$("sig").value), N = 140, rs = range(0.3, 22, N);
  const t = flashT;
  stripRow(g, w, 4, h / 2 - 8, rs.map((r) => O.u3(r, t, P)));
  stripRow(g, w, h / 2 + 4, h / 2 - 8, rs.map((r) => O.u4(r, t, P, 160)));
  g.font = "11px ui-monospace, Menlo, monospace"; g.textBaseline = "top"; g.textAlign = "left";
  g.fillStyle = C3; g.fillText("3D", 6, 6); g.fillStyle = C4; g.fillText("4D", 6, h / 2 + 6);
  g.fillStyle = DIM; g.textAlign = "right"; g.fillText(`t = ${Math.max(0, t).toFixed(1)}   r → 22`, w - 6, 6);
  const rd = +$("rDet").value, x = ((rd - 0.3) / (22 - 0.3)) * w; g.strokeStyle = "rgba(255,255,255,0.35)"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.setLineDash([]);
}
function drawTrace() {
  const sig = +$("sig").value, rd = +$("rDet").value, P = O.gauss(sig);
  $("sigV").textContent = sig.toFixed(2); $("rDetV").textContent = rd.toFixed(1);
  const ts = range(rd - 4 * sig, rd + 12, 500), a3 = ts.map((t) => O.u3(rd, t, P)), a4 = ts.map((t) => O.u4(rd, t, P, 800));
  const m3 = Math.max(...a3.map(Math.abs)), m4 = Math.max(...a4.map(Math.abs));
  chart($("cTrace"), { x: [ts[0], ts[ts.length - 1]], y: [-0.7, 1.05], xl: "time t at the detector (c = 1)", yl: "field, scaled to its peak",
    series: [{ pts: ts.map((t, i) => [t, a3[i] / m3]), c: C3, label: "3D: the pulse, then dark" }, { pts: ts.map((t, i) => [t, a4[i] / m4]), c: C4, label: "4D: the front, then a wake" }],
    vlines: [{ x: rd, c: DIM, label: "t = r" }] });
  // how much of the light arrives late: the energy (field²) after t = r + 3σ
  const late = (a) => { let all = 0, aft = 0; ts.forEach((t, i) => { const e = a[i] * a[i]; all += e; if (t > rd + 4 * sig) aft += e; }); return aft / all; };
  const tl = rd + 8, tail = O.u4(rd, tl, P, 800), pred = sig * Math.sqrt(2 * Math.PI) * O.wake4(rd, tl);
  $("rFlash").innerHTML = `Light arriving more than 4 pulse-widths after the front: 3D <b>${(100 * late(a3)).toExponential(1)}%</b>, 4D <b>${(100 * late(a4)).toFixed(1)}%</b>. At t = r + 8 the 4D field is ${fmt(tail, 3)}. The wake of an instant flash, scaled by the pulse's area, predicts ${fmt(pred, 3)}.`;
}

/* ------------------------------------------------------------- 3 · a round hole */
function drawPattern(cv, n) {
  const { g, w, h } = ctx2d(cv), dpr = cv.width / w, W = cv.width, H = cv.height, img = g.createImageData(W, H), XM = 16;
  const col = n === 3 ? [255, 180, 107] : [111, 224, 255];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = Math.hypot(i - W / 2, j - H / 2) * ((2 * XM) / W), v = O.airy(x, n), b = Math.max(0, 1 + Math.log10(Math.max(v, 1e-12)) / 4.5), k = 4 * (j * W + i);
    img.data[k] = col[0] * b; img.data[k + 1] = col[1] * b; img.data[k + 2] = col[2] * b; img.data[k + 3] = 255;
  }
  g.setTransform(1, 0, 0, 1, 0, 0); g.putImageData(img, 0, 0); void dpr; void h;
}
function drawHole() {
  drawPattern($("pat3"), 3); drawPattern($("pat4"), 4);
  const xs = range(0.001, 16, 600), z3 = O.firstDark(3), z4 = O.firstDark(4);
  chart($("cAiry"), { x: [0, 16], y: [1e-5, 1.2], logy: true, xl: "x = (πD/λ) sin θ", yl: "intensity",
    series: [{ pts: xs.map((x) => [x, O.airy(x, 3)]), c: C3, label: "3D: (2J₁(x)/x)²" }, { pts: xs.map((x) => [x, O.airy(x, 4)]), c: C4, label: "4D: (3j₁(x)/x)²" }],
    vlines: [{ x: z3, c: C3, label: "1.22 λ/D" }, { x: z4, c: C4, label: "1.43 λ/D", dy: 14 }] });
  const xe = range(0, 16, 160);
  chart($("cEnc"), { x: [0, 16], y: [0, 1], xl: "x", yl: "light inside x",
    series: [{ pts: xe.map((x) => [x, O.encircled(x, 3, 400)]), c: C3, label: "3D" }, { pts: xe.map((x) => [x, O.encircled(x, 4, 400)]), c: C4, label: "4D" }],
    vlines: [{ x: z3, c: C3 }, { x: z4, c: C4 }] });
  $("rHole").innerHTML = `First dark ring: 3D at x = <b>${z3.toFixed(4)}</b> (sin θ = ${(z3 / Math.PI).toFixed(3)} λ/D), 4D at x = <b>${z4.toFixed(4)}</b> (${(z4 / Math.PI).toFixed(3)} λ/D, where tan x = x). The central spot holds <b>${(100 * O.encircled(z3, 3)).toFixed(1)}%</b> of the light in 3D and <b>${(100 * O.encircled(z4, 4)).toFixed(1)}%</b> in 4D. The rest goes into rings, or in 4D into shells.`;
}

/* ------------------------------------------------------------- 4 · glare */
function drawGlare() {
  const n2 = +$("nGl").value; $("nGlV").textContent = n2.toFixed(2);
  const th = range(0, 89.9, 300), b = O.brewster(1, n2) / DEG;
  chart($("cGlare"), { legendLeft: true, x: [0, 90], y: [0, 1], xl: "angle of incidence (°)", yl: "reflected",
    series: [{ pts: th.map((t) => [t, O.fresnel(t * DEG, 1, n2).Rs]), c: DIM, w: 1, dash: [2, 3], label: "R_s (each s direction)" }, { pts: th.map((t) => [t, O.fresnel(t * DEG, 1, n2).Rp]), c: DIM, w: 1, dash: [6, 3], label: "R_p" },
      { pts: th.map((t) => [t, O.reflectUnpolarized(t * DEG, 1, n2, 3)]), c: C3, label: "3D unpolarized: (R_s + R_p)/2" }, { pts: th.map((t) => [t, O.reflectUnpolarized(t * DEG, 1, n2, 4)]), c: C4, label: "4D unpolarized: (2R_s + R_p)/3" }],
    vlines: [{ x: b, c: "#ffd27a", label: `Brewster ${b.toFixed(1)}°` }] });
  const f = O.fresnel(b * DEG, 1, n2);
  $("rGlare").innerHTML = `At Brewster's angle (tan θ = n) glare is <b>${(100 * O.reflectUnpolarized(b * DEG, 1, n2, 3)).toFixed(1)}%</b> of the light in 3D and <b>${(100 * O.reflectUnpolarized(b * DEG, 1, n2, 4)).toFixed(1)}%</b> in 4D, with R_p ${f.Rp < 1e-12 ? "exactly 0" : "= " + f.Rp.toExponential(1)}. Ours is polarized along one line, and sunglasses that pass only p block it all. 4D glare fills the two s directions, so a polarizer passing one direction lets half of it through, and only one passing just p blocks it. Unpolarized light through a polarizer: 3D passes <b>1/2</b>; 4D passes <b>1/3</b> through a line polarizer and <b>2/3</b> through a plane polarizer.`;
}

/* ------------------------------------------------------------- 5 · hot things */
function drawHot() {
  const T = +$("T").value; $("TV").textContent = `${T} K`;
  const ls = range(100, 2500, 400), p3 = Math.max(...ls.map((l) => O.planck(l, T, 3))), p4 = Math.max(...ls.map((l) => O.planck(l, T, 4)));
  const vis = [[0, "rgba(120,60,255,0.18)"], [0.17, "rgba(40,80,255,0.18)"], [0.35, "rgba(40,220,255,0.18)"], [0.5, "rgba(60,255,90,0.18)"], [0.68, "rgba(255,240,40,0.18)"], [0.82, "rgba(255,130,30,0.18)"], [1, "rgba(255,30,30,0.18)"]];
  chart($("cPlanck"), { x: [100, 2500], y: [0, 1.05], xl: "wavelength (nm)", yl: "brightness, scaled to its peak", bands: [{ x0: 380, x1: 750, grad: vis }],
    series: [{ pts: ls.map((l) => [l, O.planck(l, T, 3) / p3]), c: C3, label: "3D: λ⁻⁵/(eˣ − 1)" }, { pts: ls.map((l) => [l, O.planck(l, T, 4) / p4]), c: C4, label: "4D: λ⁻⁶/(eˣ − 1)" }],
    vlines: [{ x: O.peakNm(T, 3), c: C3 }, { x: O.peakNm(T, 4), c: C4 }] });
  const c3 = O.starColour(T, 3), c4 = O.starColour(T, 4), css = (c) => `rgb(${c.join(",")})`;
  $("sw3").style.background = css(c3); $("sw4").style.background = css(c4);
  $("rHot").innerHTML = `At ${T} K the peak is at <b>${O.peakNm(T, 3).toFixed(0)} nm</b> in 3D and <b>${O.peakNm(T, 4).toFixed(0)} nm</b> in 4D (Wien's x = ${O.wienX(5).toFixed(3)} and ${O.wienX(6).toFixed(3)}). Total light ∝ T⁴ × ${O.planckTotal(3).toFixed(3)} (= π⁴/15) in 3D, ∝ T⁵ × ${O.planckTotal(4).toFixed(3)} (= 24ζ(5)) in 4D.`;
}

/* ------------------------------------------------------------- 6 · the rainbow */
const BOW = [400, 440, 480, 520, 560, 600, 650, 700].map((l) => ({ l, th: O.rainbowAngle(O.waterN(l)), c: O.lineColour(l) }));
function drawBow() {
  const beta = +$("beta").value * DEG; $("betaV").textContent = `${(beta / DEG).toFixed(1)}°`;
  // the sky: your slice's directions round the antisolar point's shadow, out to 60°, angle from it as distance
  const { g, w, h } = ctx2d($("cSky")), cx = w / 2, cy = h / 2, sc = (Math.min(w, h) / 2 - 10) / (60 * DEG);
  for (const a of [20, 40, 60]) { g.strokeStyle = "rgba(255,255,255,0.08)"; g.beginPath(); g.arc(cx, cy, a * DEG * sc, 0, 2 * Math.PI); g.stroke(); }
  g.lineWidth = Math.max(2, 3 * DEG * sc / BOW.length * 2);
  for (const b of BOW) { const rho = O.rainbowInSlice(b.th, beta); if (rho === null) continue; g.strokeStyle = `rgba(${b.c.join(",")},0.85)`; g.beginPath(); g.arc(cx, cy, rho * sc, 0, 2 * Math.PI); g.stroke(); }
  g.lineWidth = 1; g.fillStyle = "rgba(255,255,255,0.5)"; g.beginPath(); g.arc(cx, cy, 3, 0, 2 * Math.PI); g.fill();
  g.font = "11px ui-monospace, Menlo, monospace"; g.fillStyle = "#9fb3d9"; g.textAlign = "center";
  g.fillText(beta > 0.001 ? "• the antisolar point's shadow (it's off in w)" : "• the antisolar point", cx, h - 12);
  // the bow's radius against the lean
  const bs = range(0, 50, 300);
  chart($("cBow"), { x: [0, 50], y: [0, 45], xl: "sun's lean into w, β (°)", yl: "bow's radius in your slice (°)",
    series: [BOW[BOW.length - 1], BOW[0]].map((b) => ({ pts: bs.map((x) => { const r = O.rainbowInSlice(b.th, x * DEG); return [x, r === null ? NaN : r / DEG]; }), c: `rgb(${b.c.join(",")})`, label: `${b.l} nm: ${(b.th / DEG).toFixed(1)}°` })),
    vlines: [{ x: beta / DEG, c: C4 }] });
  const red = O.rainbowInSlice(BOW[BOW.length - 1].th, beta), vio = O.rainbowInSlice(BOW[0].th, beta);
  $("rBow").innerHTML = red === null ? `At β = ${(beta / DEG).toFixed(1)}° there's no rainbow in your slice at all. It's still in the sky, all of it off in w.` :
    `Red's circle: <b>${(red / DEG).toFixed(1)}°</b>; violet's: <b>${vio === null ? "gone (it leans out first)" : (vio / DEG).toFixed(1) + "°"}</b>. The bow is the same width of colour in the sky, but your slice cuts it at a slant: as it shrinks, its colours spread apart.`;
}

/* ------------------------------------------------------------- wiring */
for (const b of document.querySelectorAll("#srcK button")) b.onclick = () => { srcK = +b.dataset.k; for (const x of document.querySelectorAll("#srcK button")) x.classList.toggle("on", x === b); drawFall(); };
$("sig").oninput = $("rDet").oninput = drawTrace; $("nGl").oninput = drawGlare; $("T").oninput = drawHot; $("beta").oninput = drawBow;
const all = () => { drawFall(); drawBeam(); drawTrace(); drawHole(); drawGlare(); drawHot(); drawBow(); };
let rt = 0; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(all, 120); });
all();
// the flash runs only while it's on screen
let flashOn = false; new IntersectionObserver((es) => { flashOn = es[0].isIntersecting; }).observe($("cStrip"));
(function loop(now) { if (flashOn) drawStrip(now); else flashLast = now; requestAnimationFrame(loop); })(performance.now());
window.LUMEN4 = { O, all, get t() { return flashT; } };
