/* "Where we are": the argument in eleven steps, each with a toy. Every number here comes from the same code as the
   chapters: the shell potential from ../atom/js/fields.js, hydrogen from ../atom/js/atom.js, the elements from the
   solved table, the pairs from the full pair search. The estimates are labelled as estimates. */
import { shellPotential, SHELL_CENTRE_OVER_WALL } from "../atom/js/fields.js";
import { hydrogen } from "../atom/js/atom.js";
import { TABLE } from "../atom/js/table.js";
import { IE_REAL, layout, role } from "../atom/js/periodic.js";
import { names, OURS } from "../atom/js/names.js";
import { PAIRMIN } from "../atom/js/pairmin.js";
import { lineColour } from "../lumen/js/optics.js";
import { svg as fillSvg, ourOccupancy, parseConfig, nobles } from "../table/filling.js";

const $ = (id) => document.getElementById(id), EV = 27.2114, KCAL = 627.509;
const C3 = "#ffb46b", C4 = "#6fe0ff", PIN = "#c79bff", DIM = "#9a958c";

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
  for (const v of ticks(y[0], y[1], logy)) g.fillText(String(+v.toPrecision(2)), 2, Y(v) + 3);
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
const seg = (id, on) => $(id).addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; for (const x of $(id).children) x.classList.toggle("on", x === b); on(b.dataset.v); });
const range = (lo, hi, n, log = false) => Array.from({ length: n }, (_, i) => (log ? lo * (hi / lo) ** (i / (n - 1)) : lo + ((hi - lo) * i) / (n - 1)));

/* 1 · squeeze an electron. An estimate of an atom's energy at size r: the outer electron's kinetic energy is about
   ν²/2r² (ν = n + (d − 3)/2, n its shell: hydrogen's own ladder) and its pull g/r, or g/r² under 4D's Gauss's law.
   Scanning the elements, g is each one's effective pull, set so the best size's energy is its ionization energy
   (measured in ours, the solver's in 4D): g = ν √(2 IE). The best size that gives is rough (within a factor of about
   two of the solver's outer electron in ours, three in 4D) but it follows the pattern: loosely held is big. */
let world1 = "3", g1 = 1, z1 = { 3: 3, "4p": 3 };
const N4s = names(TABLE, 4), cells = { 3: layout(TABLE, 3).cells, 4: layout(TABLE, 4).cells };
function element1(Z, d) {
  const el = TABLE[d][Z - 1], n = +el.top.match(/^\d+/)[0], nu = n + (d - 3) / 2, IE = d === 3 ? IE_REAL[Z - 1] / EV : el.ion;
  const g = nu * Math.sqrt(2 * IE), r = el.orb.find((o) => o.s === el.top).r, cell = cells[d].find((c) => c.el.Z === Z);
  return { el, nu, IE, g, rBest: (nu * nu) / g, rSolver: r, kind: role(el, d, cell), name: d === 3 ? OURS[Z - 1].name : N4s.get(Z).name ?? `element ${Z}`, isNew: d === 4 && N4s.get(Z).isNew };
}
function toy1() {
  const rs = range(0.05, 40, 320, true), col = { 3: C3, "4g": C4, "4p": PIN }[world1];
  $("g1row").hidden = world1 !== "4g"; $("z1row").hidden = world1 === "4g";
  if (world1 === "4g") {
    const E = (r) => 1 / (2 * r * r) - g1 / (r * r);
    plot($("c1"), { x: [0.05, 40], y: [-1, 1], logx: true, xl: "size r (bohr)", yl: "energy (hartree)", hline: 0, series: [
      { pts: rs.map((r) => [r, 1 / (2 * r * r)]), c: "#ffffff40", w: 1.2, dash: [4, 3], label: "squeezing ~ 1/2r²" },
      { pts: rs.map((r) => [r, -g1 / (r * r)]), c: "#ffffff40", w: 1.2, dash: [1, 3], label: "pull ~ g/r²" },
      { pts: rs.map((r) => [r, E(r)]), c: col, label: "the sum" }] });
    $("r1").innerHTML = g1 > 0.5 ? `<b>No best size: the electron falls in.</b> Both terms go as 1/r², and the pull is the bigger one at every size, so the energy keeps dropping as r shrinks, without end. <b>No element survives here</b>, whatever its charge: that's the point.`
      : `<b>No best size: the electron leaves.</b> Both terms go as 1/r², and squeezing costs more than the pull gives at every size, so it's better off far away. <b>No element survives here</b>, whatever its charge: that's the point.`;
    $("g1v").textContent = g1.toFixed(2); return;
  }
  const d = world1 === "3" ? 3 : 4, Z = z1[world1], e = element1(Z, d), E = (r) => (e.nu * e.nu) / (2 * r * r) - e.g / r;
  plot($("c1"), { x: [0.05, 40], y: [-1, 1], logx: true, xl: "size r (bohr)", yl: "energy (hartree)", hline: 0, series: [
    { pts: rs.map((r) => [r, (e.nu * e.nu) / (2 * r * r)]), c: "#ffffff40", w: 1.2, dash: [4, 3], label: "squeezing ~ ν²/2r²" },
    { pts: rs.map((r) => [r, -e.g / r]), c: "#ffffff40", w: 1.2, dash: [1, 3], label: "pull ~ g/r" },
    { pts: rs.map((r) => [r, E(r)]), c: col, label: "the sum" }],
    marks: [{ x: e.rBest, y: -e.IE, c: col, below: true, label: "best size" }],
    vlines: [{ x: e.rSolver, c: "#e9e4da99", label: "the solver's outer electron" }] });
  const cap = (t) => t[0].toUpperCase() + t.slice(1);
  $("z1v").textContent = `${Z} · ${e.isNew ? `element ${Z}, new` : cap(e.name)}`;
  const src = d === 3 ? "measured" : "from our solver", world = d === 3 ? "ours" : "4D";
  $("r1").innerHTML = `<b>${cap(e.name)}</b> (${world}${e.isNew ? ", new: nothing of ours does what it does" : `, element ${Z}`}), ${e.kind}. Its outer electron, ${e.el.top}, feels a pull of about <b>g = ${e.g.toFixed(2)}</b>, set by its ionization energy, ${(e.IE * EV).toFixed(2)} eV ${src}. The balance puts it at about <b>${e.rBest.toFixed(1)} bohr</b>; the solver puts it at ${e.rSolver.toFixed(1)}. ${e.IE * EV < 6 ? "Held loosely: a big atom that gives its electron up easily." : e.IE * EV > 15 ? "Held hard: a small atom that keeps its electrons." : ""}`;
}
/* 2 · how a field thins out: its strength, and strength × the area it crosses */
function toy2() {
  const rs = range(0.1, 10, 100, true), A3 = (r) => 4 * Math.PI * r * r, A4 = (r) => 2 * Math.PI * Math.PI * r ** 3;
  plot($("c2a"), { x: [0.1, 10], y: [1e-3, 1e3], logx: true, logy: true, xl: "r", yl: "field strength", series: [
    { pts: rs.map((r) => [r, 1 / (r * r)]), c: C3, label: "3D: 1/r²" }, { pts: rs.map((r) => [r, 1 / r ** 3]), c: C4, label: "4D, spread evenly: 1/r³" },
    { pts: rs.map((r) => [r, 1 / (r * r)]), c: PIN, dash: [5, 4], label: "4D, pinned: 1/r², as ours" }] });
  plot($("c2b"), { x: [0.1, 10], y: [0.1, 1000], logx: true, logy: true, xl: "r", yl: "field × area crossed", series: [
    { pts: rs.map((r) => [r, A3(r) / (r * r)]), c: C3, label: "3D: the same at every r" }, { pts: rs.map((r) => [r, A4(r) / r ** 3]), c: C4, label: "4D spread evenly: the same" },
    { pts: rs.map((r) => [r, A4(r) / (r * r)]), c: PIN, dash: [5, 3], label: "4D pinned: grows with r" }] });
}

/* 4 · inside a charged shell: the potential across it, as a share of the wall's */
function toy4() {
  const ss = range(0, 3, 241), wall3 = shellPotential(1, 1, 3), wall4 = shellPotential(1, 1, 4);
  plot($("c4"), { x: [0, 3], y: [0, 1.3], xl: "distance from the centre (shell radius 1)", yl: "potential ÷ the wall's", series: [
    { pts: ss.map((s) => [s, shellPotential(s, 1, 3) / wall3]), c: C3, label: "3D: flat inside, no push" },
    { pts: ss.map((s) => [s, shellPotential(s, 1, 4) / wall4]), c: PIN, label: "4D pinned: a hill inside" }],
    marks: [{ x: 0, y: SHELL_CENTRE_OVER_WALL, c: PIN, below: true, label: `centre: 3π/8 = ${SHELL_CENTRE_OVER_WALL.toFixed(3)} of the wall` }] });
}

/* 7 · hydrogen's ladder and its lines to n = 2, in both worlds (exact: E = −1/2(n + (d − 3)/2)²) */
function toy7() {
  const lines = (d) => [3, 4, 5, 6, 7, 8, 9, 10, 14, 20].map((n) => 1239.84 / ((hydrogen(1, n, d) - hydrogen(1, 2, d)) * EV));
  const cv = $("c7"), dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const X = (l) => 20 + ((w - 40) * (l - 330)) / (1250 - 330);
  g.font = "10px ui-monospace, monospace";
  [[3, 18, "ours"], [4, 90, "4D"]].forEach(([d, y, lab]) => {
    g.fillStyle = "#0b0d13"; g.fillRect(20, y, w - 40, 34); g.fillStyle = DIM; g.fillText(lab, 22, y - 4);
    for (const l of lines(d)) { const c = l > 380 && l < 780 ? `rgb(${lineColour(l).join(",")})` : "#555a66"; g.fillStyle = c; g.fillRect(X(l) - 1, y, 2.5, 34); }
    const first = lines(d)[0], lim = 1239.84 / (-hydrogen(1, 2, d) * EV); g.fillStyle = "#c9c3b8";
    g.fillText(`${first.toFixed(0)} nm`, X(first) - 18, y + 46); g.fillText(`ends ${lim.toFixed(0)}`, Math.max(20, X(lim) - 30), y + 46);
  });
  for (const l of [400, 500, 600, 700, 800, 1000, 1200]) { g.fillStyle = DIM; g.fillText(String(l), X(l) - 10, h - 4); }
  $("r7").innerHTML = `Bound by <b>${(-hydrogen(1, 1, 3) * EV).toFixed(1)} eV</b> in ours and <b>${(-hydrogen(1, 1, 4) * EV).toFixed(2)} eV</b> in 4D: 4D's iydrogen holds its electron less than half as hard. Its lines to n = 2 run from the infrared and end at ${(1239.84 / (-hydrogen(1, 2, 4) * EV)).toFixed(0)} nm, in the yellow, where ours end in the near-ultraviolet. These energies are exact: E = −1/2(n + (d − 3)/2)².`;
}

/* 8 · fill the boxes: drag through the elements, both worlds side by side */
const N4 = names(TABLE, 4);
function toy8(Z) {
  const el = TABLE[4][Z - 1], e = N4.get(Z), occ4 = parseConfig(el.config), occ3 = ourOccupancy(Z);
  const last = [...occ3.keys()].filter((k) => occ3.get(k) > 0).at(-1), o = OURS[Z - 1];
  $("f8").innerHTML = `<figure><figcaption class="d3">ours: ${o ? o.name : `element ${Z}`}</figcaption>${fillSvg(3, occ3, last, C3)}</figure><figure><figcaption class="d4">4D: ${e.name ?? `element ${Z}, new`}</figcaption>${fillSvg(4, occ4, el.top, C4)}</figure>`;
  const n4 = nobles(4, 5), n3 = nobles(3, 6);
  $("z8v").textContent = Z;
  $("r8").innerHTML = `Element ${Z}. ${n4.includes(Z) ? `<b>A 4D row closes here</b>: ${e.name}, a noble gas.` : ""} ${n3.includes(Z) ? `<b>One of our rows closes here</b>: ${o.name}.` : ""} 4D's rows close at ${n4.join(", ")}; ours at ${n3.slice(0, 5).join(", ")}.${e.isNew ? ` <b class="newt">Element ${Z} is new:</b> nothing of ours does what it does.` : ` It does what our ${e.ours.name} does, so it's ${e.name}.`}`;
}

/* 10 · which water: a pair's binding, searched over every pose (Hartree–Fock, counterpoise-corrected) */
function toy10() {
  const rows = [["our water, H₂O", -PAIRMIN[3].best.E * KCAL, C3], ["Xater, H₂Px", -PAIRMIN[4].best.E * KCAL, C4], ["bmmonia, element 9's XH₃", -PAIRMIN["4.9"].best.E * KCAL, PIN]];
  const max = Math.max(...rows.map((r) => r[1]));
  $("b10").innerHTML = rows.map(([n, v, c]) => `<div class="bar"><span class="bl">${n}</span><span class="bt"><i style="width:${(100 * v) / max}%;background:${c}"></i></span><span class="bv">${v.toFixed(1)}</span></div>`).join("") + `<div class="kv small">kcal/mol to pull a pair apart, the best of every way two can sit together</div>`;
}

/* 11 · an ideal gas in 2, 3 and 4 dimensions: count the momentum hitting one wall, compare with NkT/V */
const gases = [2, 3, 4].map((d) => {
  const N = 160, L = 10, kT = 1, rnd = mulberry(7 + d), x = [], v = [];
  for (let i = 0; i < N; i++) { x.push(Array.from({ length: d }, () => rnd() * L)); v.push(Array.from({ length: d }, () => gauss(rnd))); }
  for (let k = 0; k < d; k++) { const m2 = v.reduce((s, q) => s + q[k] * q[k], 0) / N, f = Math.sqrt(kT / m2); for (const q of v) q[k] *= f; } // each direction holds exactly kT
  return { d, N, L, kT, x, v, impulse: 0, time: 0, hits: 0 };
});
function mulberry(a) { return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(rnd) { return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); }
function stepGas(G, dt) {
  for (let i = 0; i < G.N; i++) for (let k = 0; k < G.d; k++) {
    let p = G.x[i][k] + G.v[i][k] * dt;
    if (p < 0) { p = -p; G.v[i][k] = -G.v[i][k]; }
    if (p > G.L) { p = 2 * G.L - p; if (k === 0) { G.impulse += 2 * Math.abs(G.v[i][k]); G.hits++; } G.v[i][k] = -G.v[i][k]; }
    G.x[i][k] = p;
  }
  G.time += dt;
}
function drawGas() {
  for (const G of gases) {
    for (let s = 0; s < 6; s++) stepGas(G, 0.02);
    const cv = $(`g${G.d}`), dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.strokeStyle = "#262833"; g.strokeRect(0.5, 0.5, w - 1, h - 1); g.fillStyle = "#ffd166"; g.fillRect(w - 3, 0, 3, h);
    const col = G.d === 3 ? C3 : G.d === 4 ? C4 : "#e9e4da";
    for (const q of G.x) { g.fillStyle = col; g.globalAlpha = G.d > 2 ? 0.35 + 0.65 * (q[2] / G.L) : 0.9; g.fillRect((q[0] / G.L) * (w - 4), (q[1] / G.L) * (h - 4), 2.5, 2.5); }
    g.globalAlpha = 1;
    const P = G.impulse / (G.time * G.L ** (G.d - 1)), ideal = (G.N * G.kT) / G.L ** G.d;
    $(`p${G.d}`).innerHTML = `${G.d}D: P ÷ (NkT/V) = <b>${(P / ideal).toFixed(3)}</b> · ${G.hits} hits · energy per atom ${(G.d / 2).toFixed(1)} kT`;
  }
  if (document.visibilityState === "visible") requestAnimationFrame(drawGas); else setTimeout(drawGas, 500);
}

// wiring
seg("w1", (v) => { world1 = v; if (v !== "4g") { $("z1").max = v === "3" ? 36 : 78; $("z1").value = z1[v]; } toy1(); });
$("g1").addEventListener("input", (e) => { g1 = +e.target.value; toy1(); });
$("z1").addEventListener("input", (e) => { z1[world1] = +e.target.value; toy1(); });
$("z8").addEventListener("input", (e) => toy8(+e.target.value));
const all = () => { toy1(); toy2(); toy4(); toy7(); toy10(); };
all(); toy8(12); requestAnimationFrame(drawGas);
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(all, 150); });
