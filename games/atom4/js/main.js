/* ATOM⁴ — every chapter's page runs this, and each drawing runs only where its element is on the page. The physics
   is ./atom.js (the solver), ./fields.js (the field theory), ./turning.js (motion and spin) and ./polytopes.js; the
   periodic table is baked into ./table.js by tools/bake.mjs, since solving 114 atoms takes minutes. */
import { hydrogen, orbitals, k4 } from "./atom.js";
import * as F from "./fields.js";
import { TABLE, RPLOT, SHELL_COUNTERFACTUAL } from "./table.js";
import { lineColour, colourOf, planck } from "../../lumen4/js/optics.js";
import { fineSplit, harmonicDim } from "./turning.js";
import * as FF from "./forces.js";
import { RS as PAIR_RS, PAIRS } from "./pairs.js";
import { RESPONSE } from "./response.js";
import { MOLECULES } from "./molecules.js";
import { CENSUS } from "./census.js";
import { PAIRMIN } from "./pairmin.js";
import { buildTurning, tiles as turnTiles } from "./turningTiles.js";
import { SYM, IE_REAL, realConfig, isNoble, layout, role } from "./periodic.js";
import { buildShapes, tiles } from "./shapes.js";
import { buildLiquid } from "./liquid.js";
import { buildSearch, drawClusters } from "./search.js";

const $ = (id) => document.getElementById(id);
const C3 = "#ffb46b", C4 = "#6fe0ff", DIM = "#9a958c", GRID = "#262833", BAD = "#ff6b6b";
const EV = 27.211386, HC_NM = 45.5633525; // a hartree in eV; hc / hartree in nm

/* ------------------------------------------------------------- a canvas, sized to its box, and a chart */
function ctx2d(cv) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return { g, w, h };
}
/* o = { x: [a, b], y: [a, b], logx, xl, yl, series: [{ pts, c, w, dash, label, dots }], vlines: [{ x, c, label }] } */
function chart(cv, o) {
  const { g, w, h } = ctx2d(cv), L = 46, R = 12, T = 12, B = 30;
  const tx = (v) => (o.logx ? Math.log10(v) : v), [x0, x1] = o.x.map(tx), [y0, y1] = o.y;
  const X = (v) => L + ((tx(v) - x0) / (x1 - x0)) * (w - L - R), Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (h - T - B);
  g.font = "11px ui-monospace, Menlo, monospace"; g.strokeStyle = GRID; g.lineWidth = 1;
  const ticks = (lo, hi, log) => { if (log) { const out = []; for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) out.push(10 ** e); return out; } const span = hi - lo, step = 10 ** Math.floor(Math.log10(span / 4)), s = [1, 2, 5, 10].map((k) => k * step).find((k) => span / k <= 6); const out = []; for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(+v.toFixed(10)); return out; };
  g.fillStyle = DIM; g.textAlign = "center"; g.textBaseline = "top";
  for (const v of ticks(x0, x1, o.logx)) { const x = X(v); g.beginPath(); g.moveTo(x, T); g.lineTo(x, h - B); g.stroke(); g.fillText(String(v), x, h - B + 4); }
  g.textAlign = "right"; g.textBaseline = "middle";
  for (const v of ticks(y0, y1, false)) { const y = Y(v); g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke(); g.fillText(String(v), L - 4, y); }
  g.textAlign = "right"; g.textBaseline = "bottom"; g.fillText(o.xl || "", w - R, h - 2);
  g.save(); g.translate(11, T); g.rotate(-Math.PI / 2); g.textAlign = "right"; g.textBaseline = "top"; g.fillText(o.yl || "", 0, 0); g.restore();
  g.save(); g.beginPath(); g.rect(L, T, w - L - R, h - T - B); g.clip();
  for (const v of o.vlines || []) { g.strokeStyle = v.c; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(X(v.x), T); g.lineTo(X(v.x), h - B); g.stroke(); g.setLineDash([]); if (v.label) { g.fillStyle = v.c; g.textAlign = "center"; g.textBaseline = "top"; g.fillText(v.label, X(v.x), T + 2 + (v.dy || 0)); } }
  for (const s of o.series) {
    if (s.dots) { g.fillStyle = s.c; for (const [a, b] of s.pts) { g.beginPath(); g.arc(X(a), Y(b), 2.2, 0, 2 * Math.PI); g.fill(); } continue; }
    g.strokeStyle = s.c; g.lineWidth = s.w || 2; g.setLineDash(s.dash || []); g.beginPath(); let on = false;
    for (const [a, b] of s.pts) { if (!isFinite(b)) { on = false; continue; } const x = X(a), y = Y(Math.max(-1e6, Math.min(1e6, b))); if (on) g.lineTo(x, y); else g.moveTo(x, y); on = true; }
    g.stroke(); g.setLineDash([]);
  }
  g.restore();
  let ly = T + 4; const lx = o.legendLeft ? L + 6 : w - R - 4; g.textAlign = o.legendLeft ? "left" : "right"; g.textBaseline = "top";
  for (const s of o.series) if (s.label) { g.fillStyle = s.c; g.fillText(s.label, lx, ly); ly += 14; }
  return { X, Y };
}
const range = (a, b, n, log = false) => Array.from({ length: n }, (_, i) => (log ? a * (b / a) ** (i / (n - 1)) : a + ((b - a) * i) / (n - 1)));

/* ------------------------------------------------------------- 1 · no ground state under 1/r² */
function drawPin() {
  const rs = range(0.05, 6, 300);
  chart($("cPin"), { x: [0, 6], y: [-1.5, 1.5], xl: "distance from the nucleus r (bohr)", yl: "pull on an s-electron (hartree)", series: [
    { pts: rs.map((r) => [r, F.effective(r, 3, (x) => -1 / x)]), c: C3, label: "3D, 1/r" },
    { pts: rs.map((r) => [r, F.effective(r, 4, (x) => -1 / x)]), c: C4, label: "4D, pinned 1/r" },
    { pts: rs.map((r) => [r, F.effective(r, 4, (x) => -0.25 / (x * x))]), c: DIM, dash: [5, 4], label: "4D, Gauss 1/r², weak" },
    { pts: rs.map((r) => [r, F.effective(r, 4, (x) => -0.7 / (x * x))]), c: BAD, dash: [5, 4], label: "4D, Gauss 1/r², strong" },
  ] });
  $("rPin").innerHTML = `The pinned 4D well has its floor at <b>r = 0.75 bohr</b>: that's a size, so there's an atom. The Gauss curves are the centrifugal 3/8r² against −g/r²: the same shape at every scale. Below g = ½ there's <b>no bound state at all</b>. Above it the electron <b>falls into the nucleus</b>.`;
}

/* ------------------------------------------------------------- 2 · hydrogen */
function drawLevels() {
  const { g, w, h } = ctx2d($("cLevels")), T = 16, B = 24, Y = (e) => T + (e / -0.55) * (h - T - B);
  g.font = "11px ui-monospace, Menlo, monospace"; g.textBaseline = "middle";
  for (const [d, x0, x1, c] of [[3, 0.08, 0.42, C3], [4, 0.58, 0.92, C4]]) {
    for (let n = 1; n <= 7; n++) {
      const e = hydrogen(1, n, d), y = Y(e); g.strokeStyle = c; g.lineWidth = n === 1 ? 2.5 : 1.5;
      g.beginPath(); g.moveTo(x0 * w, y); g.lineTo(x1 * w, y); g.stroke();
      if (n <= 3) { g.fillStyle = c; g.textAlign = "left"; g.fillText(`n=${n}  ${(e * EV).toFixed(2)} eV`, x0 * w, y - 8); }
    }
    g.fillStyle = c; g.textAlign = "center"; g.textBaseline = "bottom"; g.fillText(d === 3 ? "3D" : "4D", ((x0 + x1) / 2) * w, h - 4); g.textBaseline = "middle";
  }
  g.strokeStyle = GRID; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke();
  // the shells, as a table
  const rows = [1, 2, 3, 4, 5].map((n) => { let o3 = 0, o4 = 0; for (let l = 0; l < n; l++) { o3 += orbitals(l, 3); o4 += orbitals(l, 4); } return `<tr><td>${n}</td><td class="d3">${2 * o3}</td><td class="d4">${2 * o4}</td></tr>`; });
  const subs = [0, 1, 2, 3].map((l) => `<tr><td>${"spdf"[l]}</td><td class="d3">${2 * orbitals(l, 3)}</td><td class="d4">${2 * orbitals(l, 4)}</td></tr>`);
  $("shellTab").innerHTML = `<table><tr><th>shell n</th><th class="d3">3D</th><th class="d4">4D</th></tr>${rows.join("")}<tr><th>subshell</th><th></th><th></th></tr>${subs.join("")}</table><p class="read">electrons each holds, two spins per orbital</p>`;
}
function drawSpec() {
  const { g, w, h } = ctx2d($("cSpec")), l0 = 360, l1 = 760, X = (l) => ((l - l0) / (l1 - l0)) * w;
  const rows = [[3, 2, "3D, falling to n = 2 (Balmer)"], [4, 2, "4D, falling to n = 2"]];
  rows.forEach(([d, lo, label], k) => {
    const y0 = 6 + k * (h / 2), hh = h / 2 - 18;
    g.fillStyle = d === 3 ? C3 : C4; g.font = "11px ui-monospace, Menlo, monospace"; g.textAlign = "left"; g.textBaseline = "top"; g.fillText(label, 6, y0);
    for (let n = lo + 1; n <= 40; n++) {
      const lam = HC_NM / (hydrogen(1, n, d) - hydrogen(1, lo, d));
      if (lam < l0 || lam > l1) continue; const c = lineColour(lam);
      g.strokeStyle = `rgb(${c})`; g.lineWidth = n < lo + 6 ? 2 : 1; g.globalAlpha = n < lo + 8 ? 1 : 0.5;
      g.beginPath(); g.moveTo(X(lam), y0 + 14); g.lineTo(X(lam), y0 + 14 + hh); g.stroke(); g.globalAlpha = 1;
    }
    const lim = HC_NM / -hydrogen(1, lo, d); g.strokeStyle = DIM; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(X(lim), y0 + 14); g.lineTo(X(lim), y0 + 14 + hh); g.stroke(); g.setLineDash([]);
  });
  g.fillStyle = DIM; g.textAlign = "center"; g.textBaseline = "bottom"; for (const l of [400, 500, 600, 700]) g.fillText(l + " nm", X(l), h - 1);
  const line = (d, n, lo) => HC_NM / (hydrogen(1, n, d) - hydrogen(1, lo, d));
  $("rSpec").innerHTML = `3D: <b>${line(3, 3, 2).toFixed(0)}</b>, ${line(3, 4, 2).toFixed(0)}, ${line(3, 5, 2).toFixed(0)}, ${line(3, 6, 2).toFixed(0)} … ending at ${(HC_NM / -hydrogen(1, 2, 3)).toFixed(0)} nm. 4D: the first lines are infrared (${line(4, 3, 2).toFixed(0)}, ${line(4, 4, 2).toFixed(0)} nm), then <b>${line(4, 5, 2).toFixed(0)}</b>, ${line(4, 6, 2).toFixed(0)}, ${line(4, 7, 2).toFixed(0)} … crowding to <b>${(HC_NM / -hydrogen(1, 2, 4)).toFixed(0)} nm</b>. Its strongest line, 2 → 1, is at ${line(4, 2, 1).toFixed(0)} nm (ours: ${line(3, 2, 1).toFixed(0)}).`;
}

/* ------------------------------------------------------------- 3 · the table */
let dim = 4, sel = { 3: 6, 4: 7 };
function drawTable() {
  const { W, rows, cells } = layout(TABLE, dim), pt = $("pt");
  const cw = W > 20 ? 26 : 30; pt.style.setProperty("--cw", cw + "px");
  pt.style.gridTemplateColumns = `18px repeat(${W}, ${cw}px)`; pt.innerHTML = "";
  for (let r = 0; r < rows; r++) { const lab = document.createElement("div"); lab.className = "lab"; lab.textContent = r + 1; lab.style.gridRow = r + 1; lab.style.gridColumn = 1; pt.appendChild(lab); }
  for (const c of cells) {
    const b = document.createElement("button"); b.type = "button"; const el = c.el;
    b.className = `el ${c.block}${c.noble ? " noble" : ""}${sel[dim] === el.Z ? " on" : ""}`;
    if (dim === 3 && el.config !== realConfig(el.Z)) b.classList.add("miss");
    b.style.gridRow = c.row + 1; b.style.gridColumn = c.col + 1;
    b.innerHTML = `${el.Z}<small>${dim === 3 ? SYM[el.Z - 1] : el.config.split(" ").at(-1)}</small>`;
    b.title = `${el.Z}: ${el.config}`;
    b.onclick = () => { sel[dim] = el.Z; drawTable(); };
    pt.appendChild(b);
  }
  const lg = [["s", "#2b1d38", "s block"], ["p", "#13283a", "p block"], ["d", "#1d3022", "d block"]];
  $("ptLegend").innerHTML = lg.map(([, c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join("") + `<span><i style="box-shadow: inset 0 0 0 1px #6fe0ff88"></i>noble gas</span>` + (dim === 3 ? `<span><i style="background:${BAD};border-radius:50%"></i>the solver disagrees with reality</span>` : "");
  drawDetail(cells.find((c) => c.el.Z === sel[dim]));
}
function drawDetail(cell) {
  const el = cell.el, d = dim, real = d === 3 ? realConfig(el.Z) : null;
  const top = el.orb.find((o) => o.s === el.top);
  $("detail").innerHTML = `<h5 class="${d === 3 ? "d3" : "d4"}">${d === 3 ? `${SYM[el.Z - 1]}, element ${el.Z}` : `element ${el.Z} of the 4D table`}</h5>
    <div class="cfg">${el.config}</div>
    ${real && real !== el.config ? `<div class="kv" style="color:${BAD}">really ${real}: the solver puts the electron in the wrong shell (no exchange, section 8)</div>` : ""}
    <div class="kv">${role(el, d, cell)}</div>
    <div class="kv">first ionization <b>${(el.ion * EV).toFixed(2)} eV</b>${d === 3 ? ` (measured ${IE_REAL[el.Z - 1]} eV)` : ""} · outermost electron <b>${el.top}</b> at ${top.r.toFixed(2)} bohr · total energy <b>${el.E.toFixed(2)}</b> hartree</div>
    <div class="kv">orbital energies (eV): ${el.orb.map((o) => `${o.s}${o.o > 1 ? `<sup>${o.o}</sup>` : ""} <b>${(o.e * EV).toFixed(o.e * EV < -100 ? 0 : 1)}</b>`).join(" · ")}</div>
    <canvas class="chart" id="cDens"></canvas>`;
  // the radial density, as electrons per unit log-radius (r · density), so each shell is a bump
  const pts = RPLOT.map((r, i) => [r, r * el.dens[i]]), ymax = Math.max(...pts.map((p) => p[1])) * 1.1;
  const radii = el.orb.map((o) => ({ x: o.r, c: DIM, label: o.s }));
  chart($("cDens"), { x: [0.02, 20], y: [0, +ymax.toPrecision(2)], logx: true, xl: "r (bohr)", yl: "electrons per log r", series: [{ pts, c: d === 3 ? C3 : C4, label: "the electron cloud" }], vlines: radii.map((v, i) => ({ ...v, dy: (i % 3) * 12 })) });
}

/* ------------------------------------------------------------- 4 · trends */
function drawTrends() {
  const t3 = TABLE[3], t4 = TABLE[4], zmax = t4.length;
  const nobles = (d) => TABLE[d].filter((el) => isNoble(el, d)).map((el) => el.Z);
  chart($("cIon"), { x: [0, zmax + 1], y: [0, 30], xl: "atomic number Z", yl: "first ionization energy (eV)", series: [
    { pts: t3.map((el) => [el.Z, el.ion * EV]), c: C3, label: "3D, this solver" },
    { pts: IE_REAL.map((v, i) => [i + 1, v]), c: C3, dots: true, label: "3D, measured" },
    { pts: t4.map((el) => [el.Z, el.ion * EV]), c: C4, label: "4D" },
  ], vlines: nobles(4).map((Z) => ({ x: Z, c: "#6fe0ff66", label: String(Z) })) });
  const n3 = nobles(3), n4 = nobles(4), plen = (n) => n.map((z, i) => z - (n[i - 1] || 0));
  $("rIon").innerHTML = `Noble gases: 3D <b>${n3.join(", ")}</b> (periods of ${plen(n3).join(", ")}); 4D <b>${n4.join(", ")}</b> (periods of ${plen(n4).join(", ")}). The solver's 3D line runs close to the measured dots, the dip where a shell passes half full (nitrogen to oxygen) included.`;
  const outer = (el) => el.orb.find((o) => o.s === el.top).r;
  chart($("cSize"), { x: [0, zmax + 1], y: [0, 12], xl: "atomic number Z", yl: "outer electron radius (bohr)", series: [
    { pts: t3.map((el) => [el.Z, outer(el)]), c: C3, label: "3D" }, { pts: t4.map((el) => [el.Z, outer(el)]), c: C4, label: "4D" },
  ] });
}

/* ------------------------------------------------------------- 6 · darbon (its tiles are ./shapes.js) */
function drawChem() {
  const t4 = TABLE[4], { cells } = layout(TABLE, 4), n4 = t4.filter((el) => isNoble(el, 4)).map((el) => el.Z);
  const carbon = cells.find((c) => c.row === 1 && /carbon-like/.test(role(c.el, 4, c)));
  const halo = cells.find((c) => c.row === 1 && /halogen-like/.test(role(c.el, 4, c)));
  const ion = (Z) => (t4[Z - 1].ion * EV).toFixed(1);
  $("chemText").innerHTML = `A 4D atom's outer shell is an s and four p orbitals: <b>ten electrons</b> where ours holds eight. So the octet rule becomes a <b>ten-electron rule</b>, and the second row is ten elements long, element 3 to element ${n4[1]}. Element 3 is an alkali metal like lithium, giving up its one outer electron for ${ion(3)} eV. Element ${carbon ? carbon.el.Z : "?"}, ${carbon ? carbon.el.config.split(" ").slice(-2).join(" ") : ""}, is the carbon of this world, its outer shell half full: call it <b>darbon</b>. Element ${halo ? halo.el.Z : "?"} is a halogen, grabbing one electron to make ten. The noble gases fall at <b>${n4.join(", ")}</b>. The heavier rows get d shells of eighteen electrons, so transition metals come in runs of eighteen, not ten.`;
}

/* ------------------------------------------------------------- 7 · rewriting Maxwell */
function drawRoutes() {
  const a = F.propagatorPower(1, 4), delta = F.scalingDim(a, 4), floor = F.unitarityFloor(4), m = F.nonlinearExponent(4);
  const R = [
    ["1 · Keep it local and relativistic", "A local, linear, relativistic field equation for a massless field has 1/k² (□A = J). That gives 1/r² in 4D, full stop. Higher powers of □ (fourth-order equations) give 1/k⁴: a logarithm in 4D, not 1/r.", "Impossible. 1/k³ isn't a whole number of derivatives."],
    ["2 · Keep relativity, give up locality: □^(3/2)", `Use the operator □^(3/2), a fractional power, which acts across a distance. The static potential is 1/r. The coupling becomes dimensionless, like our fine-structure constant. But positive probabilities require the propagator to be a positive sum of particles' 1/(p² + m²), and no such sum is more singular than 1/p². Equivalently the field's scaling dimension is <b>${delta}</b>, below the unitarity bound of <b>${floor}</b>.`, "Ghosts: states of negative probability. Light has no photon, only a continuum (an 'unparticle')."],
    ["3 · Keep locality in time, give up relativity: a strange vacuum", "Keep Maxwell's equations but give empty space a permittivity that grows with wavenumber, ε(k) = ε₀ ℓ k. Statics: 1/(ℓ k³), which is 1/r. A new fundamental length ℓ appears.", `Light disperses like deep-water waves, ω = c√(k/ℓ). Long waves outrun short ones without limit, so there's no speed of light and no relativity.`],
    ["4 · Keep everything but superposition: a nonlinear vacuum", `Make Gauss's law nonlinear, ∇·(|E|^(m−2) E) = ρ, as some modified gravity theories do. m = ${m} gives a 1/r potential in 4D.`, "Fields of two charges don't add. Light doesn't pass through light, and the solver above (which adds clouds) would be wrong too."],
    ["5 · Keep all four, make the fourth dimension small", "A compact fourth dimension of circumference ℓ (below). Far from a charge the field has filled it and falls as 1/r.", "Then atoms bigger than ℓ are 3D atoms. It's how our world could hide extra dimensions. It doesn't give 4D chemistry."],
    ["6 · Ours: the lens vacuum", `Route 3, finished. Give the vacuum both ε(k) = ε₀ ℓ k <b>and</b> μ(k) = μ₀ / ℓk. Then the fields D/ε₀ and μ₀H obey Maxwell's equations in empty 4D space exactly: that's light, and it's Lumen⁴'s light, at speed c at every wavelength. What pushes a charge is that light seen through a lens, E = (D/ε₀)/ℓk, which blurs it across space with a 1/r³ kernel. Statics: 1/(ℓ k³), the pinned 1/r. The energy is never negative, so there are no ghosts, and fields still add.`, "relativity, for electromagnetism. The lens acts across all of space at once, so there's an absolute now: a charge feels another's change instantly, a little, everywhere. One length, ℓ, sets the strength."],
  ];
  $("routes").innerHTML = R.map(([t, p, c], i) => `<div class="route${i === 5 ? " chosen" : ""}"><h5>${t}</h5><p>${p}</p><p class="cost">${i === 5 ? "we pay" : "costs"}: ${c}</p></div>`).join("");
}
function drawShell() {
  const ss = range(0.001, 3, 400);
  chart($("cShell"), { x: [0, 3], y: [0, 1.4], xl: "distance from the centre of a charged sphere of radius 1", yl: "potential", series: [
    { pts: ss.map((s) => [s, F.shellPotential(s, 1, 3)]), c: C3, label: "3D: flat inside, a point charge outside" },
    { pts: ss.map((s) => [s, F.shellPotential(s, 1, 4)]), c: C4, label: "4D, pinned 1/r: neither" },
    { pts: ss.filter((s) => s > 0.7).map((s) => [s, 1 / s]), c: DIM, dash: [4, 4], label: "the same charge at a point" },
  ], vlines: [{ x: 1, c: DIM, label: "the sphere" }] });
  $("rShell").innerHTML = `Inside, the 4D potential is k(s) = 1 − s²/8 − …, from <b>1</b> at the centre down to <b>8/3π = ${k4(1).toFixed(3)}</b> at the wall. Outside it falls short of the same charge at a point: at twice the radius it's ${(F.shellPotential(2, 1, 4) * 2).toFixed(3)} of a point's. That shortfall is the partial screening below.`;
}
function drawScreen() {
  const nob = (d) => TABLE[d].filter((el) => isNoble(el, d)), n3 = nob(3), n4 = nob(4), cf = SHELL_COUNTERFACTUAL;
  const pts = (els, f) => els.map((el, i) => [i + 1, f(el) * EV]);
  const series = [
    { pts: pts(n3, (el) => el.ion), c: C3, label: "3D (this solver)" }, { pts: pts(n3, (el) => el.ion), c: C3, dots: true },
    { pts: pts(n4, (el) => el.ion), c: C4, label: "4D, the true pull" }, { pts: pts(n4, (el) => el.ion), c: C4, dots: true },
    { pts: pts(cf, (el) => el.ion), c: DIM, dash: [5, 4], label: "4D, if the shell theorem held" }, { pts: pts(cf, (el) => el.ion), c: DIM, dots: true },
  ];
  chart($("cScreen"), { x: [0.7, Math.max(n3.length, n4.length) + 0.3], y: [0, 25], xl: "the noble gas of row 1, 2, 3 …", yl: "first ionization energy (eV)", series });
  const f = (els) => els.map((el) => (el.ion * EV).toFixed(1)).join(" → ");
  $("rScreen").innerHTML = `3D: <b>${f(n3)}</b> eV, falling down the column, as ours do. 4D: <b>${f(n4)}</b> eV, rising overall. 4D with the shell theorem forced on: ${f(cf)} eV, flat, and about half as tight. The same atoms and the same solver, with one thing changed: the grip comes from the shell theorem failing.`;
}
function drawCompact() {
  const rs = range(0.01, 100, 300, true), p = (r) => { const e = 1e-4; return -(Math.log(F.compactPotential(r * (1 + e), 1)) - Math.log(F.compactPotential(r, 1))) / Math.log(1 + e); };
  chart($("cCompact"), { x: [0.01, 100], y: [0.8, 2.2], logx: true, xl: "distance from the charge, in units of the small dimension's size ℓ", yl: "the potential falls as 1/r^…", series: [{ pts: rs.map((r) => [r, p(r)]), c: C4, label: "a small fourth dimension" }],
    vlines: [{ x: 1 / Math.PI, c: DIM, label: "ℓ/π" }] });
}

/* ------------------------------------------------------------- the light chapter: the sky */
function drawSky() {
  const sky = (n, p) => `rgb(${colourOf((l) => planck(l, 5800, n) * l ** -p)})`, sun = (n) => `rgb(${colourOf((l) => planck(l, 5800, n))})`;
  const rows = [["our sky", 3, F.scatterExponent(3, false), "3D: sunlight ν³/(eˣ − 1), scattered ∝ ω⁴"], ["4D, plain Maxwell", 4, F.scatterExponent(4, false), "sunlight ν⁴/(eˣ − 1), scattered ∝ ω⁵"], ["this universe", 4, F.scatterExponent(4, true), "sunlight ν⁴/(eˣ − 1), scattered ∝ ω³ through the lens"]];
  $("skies").innerHTML = rows.map(([t, n, p, cap]) => `<figure><div class="sw" style="background: linear-gradient(180deg, ${sky(n, p)} 0%, ${sky(n, p)} 70%, ${sun(n)} 100%)"></div><figcaption><b>${t}</b><br />${cap}</figcaption></figure>`).join("");
}
/* the hydrogen chapter: fine structure */
function drawFine() {
  $("fineTab").innerHTML = `<table><tr><th>l</th><th>orbitals (l + 1)²</th><th>with spin</th><th>splits into</th></tr>${[0, 1, 2, 3].map((l) => `<tr><td>${"spdf"[l]}</td><td>${harmonicDim(l)}</td><td>${2 * harmonicDim(l)}</td><td>${fineSplit(l).join(" + ")}</td></tr>`).join("")}</table>`;
}

/* ------------------------------------------------------------- the forces chapter */
function drawForces() {
  const meV = 27211.386, at = 6, nob = (d) => TABLE[d].filter((el) => isNoble(el, d));
  const rows4 = nob(4).map((el) => { const S = FF.sumR2(el), B = FF.permanentB(S, S); return `<tr><td class="d4">${el.Z}</td><td>${S.toFixed(1)}</td><td>${B.toFixed(1)}</td><td>${((-B / at ** 5) * meV).toFixed(1)}</td><td>${FF.bornMayerBeta(el.ion).toFixed(2)}</td></tr>`; });
  const rows3 = nob(3).map((el) => `<tr><td class="d3">${SYM[el.Z - 1]}</td><td>${FF.sumR2(el).toFixed(1)}</td><td>0</td><td>0</td><td>${FF.bornMayerBeta(el.ion).toFixed(2)}</td></tr>`);
  $("nobleForces").innerHTML = `<table><tr><th>noble gas</th><th>S = Σ⟨r²⟩ (bohr²)</th><th>B = 3S²/64</th><th>−B/R⁵ at ${at} bohr (meV)</th><th>β = 2√2I (1/bohr)</th></tr>${rows3.join("")}${rows4.join("")}</table><p class="read">S and β from the solver's atoms. Our measured noble-gas wells, whole: neon 3.6 meV deep, argon 10.3 meV.</p>`;
  const Rs = range(4.5, 14, 200), series = nob(4).slice(1, 4).map((el, i) => { const B = FF.permanentB(FF.sumR2(el), FF.sumR2(el)); return { pts: Rs.map((R) => [R, (-B / R ** 5) * meV]), c: ["#6fe0ff", "#7dffb0", "#c79bff"][i], label: `4D element ${el.Z}: −B/R⁵ alone` }; });
  series.push({ pts: Rs.map((R) => [R, FF.lj(R, FF.MEASURED_LJ.Ne) * meV]), c: C3, label: "our neon, measured: the whole well" });
  series.push({ pts: Rs.map((R) => [R, FF.lj(R, FF.MEASURED_LJ.Ar) * meV]), c: C3, dash: [5, 4], label: "our argon, measured" });
  chart($("cPair"), { x: [4.5, 14], y: [-80, 15], xl: "distance between the two atoms (bohr)", yl: "energy (meV)", series, vlines: [{ x: at, c: DIM, label: `${at} bohr` }] });
  // against our measured wells, each at our gas's own spacing (the Lennard-Jones minimum, 2^(1/6) σ)
  const vs = (Z, gas) => { const el = TABLE[4][Z - 1], B = FF.permanentB(FF.sumR2(el), FF.sumR2(el)), m = FF.MEASURED_LJ[gas], r = 2 ** (1 / 6) * m.sigma; return { r, u: (B / r ** 5) * meV, well: m.eps * meV, x: B / r ** 5 / m.eps }; };
  const a = vs(12, "Ne"), b = vs(22, "Ar");
  $("rPair").innerHTML = `At neon's spacing (${a.r.toFixed(2)} bohr), element 12's permanent pull is ${a.u.toFixed(0)} meV, <b>${a.x.toFixed(0)}×</b> neon's ${a.well.toFixed(1)} meV well. At argon's (${b.r.toFixed(2)} bohr), element 22's is ${b.u.toFixed(0)} meV, <b>${b.x.toFixed(0)}×</b> argon's ${b.well.toFixed(1)} meV.`;
  // twisting: staggered against eclipsed with a soft 1/r⁶ between the ends
  const I = (d) => Array.from({ length: d - 1 }, (_, i) => Array.from({ length: d - 1 }, (_, j) => (i === j ? 1 : 0)));
  const ratio = (d) => { const { near, staggered } = FF.bondEnds(d); return FF.twistEnergy(near, near, I(d), 1) / FF.twistEnergy(near, staggered, I(d), 1); };
  $("rTwist").innerHTML = `With a soft 1/r⁶ push between the two ends' atoms, eclipsed costs <b>${ratio(3).toFixed(2)}×</b> staggered across a 3D bond and <b>${ratio(4).toFixed(2)}×</b> across a 4D one: four neighbours a side crowd more than three.`;
  $("rSalt").innerHTML = `For a salt with λ = 1 (in atomic units), the tail is <b>${FF.saltTail(1).toFixed(4)} / r⁷</b>: negative, so a positive charge looks faintly negative from far off.`;
}

/* the forces chapter: two atoms computed (Gordon–Kim on the solver's clouds) */
function drawWells() {
  const meV = 27211.386, nob4 = PAIRS[4], nob3 = PAIRS[3], c6 = (d, Z) => RESPONSE[d].find((r) => r.Z === Z).c6;
  // our world first: every part computed, against the measured wells
  const check = nob3.filter((p) => p.Z !== 2).map((p) => {
    const m = FF.MEASURED[p.Z], w = FF.minimum(FF.fullPair(PAIR_RS, p, 0, c6(3, p.Z)));
    return `<tr><td class="d3">${SYM[p.Z - 1]}</td><td>${w.R.toFixed(2)}</td><td>${m.R}</td><td>${(-w.E * meV).toFixed(1)}</td><td>${(m.eps * meV).toFixed(1)}</td><td>${(-w.E / m.eps).toFixed(2)}×</td></tr>`;
  });
  $("wellCheck").innerHTML = `<table><tr><th>ours</th><th>well at (bohr), computed</th><th>measured</th><th>depth (meV), computed</th><th>measured</th><th>ratio</th></tr>${check.join("")}</table>`;
  const rows = nob4.map((p) => {
    const el = TABLE[4][p.Z - 1], S = FF.sumR2(el), B = FF.permanentB(S, S), C = c6(4, p.Z), w0 = FF.minimum(FF.pairCurve(PAIR_RS, p)), w = FF.minimum(FF.fullPair(PAIR_RS, p, B, C)), fit = FF.fitRepulsion(PAIR_RS, p, B), lo = -w.E / FF.OVERBIND, hi = -w.E;
    return `<tr><td class="d4">${p.Z}</td><td>${w.R.toFixed(2)}</td><td>${(lo * meV).toFixed(0)}–${(hi * meV).toFixed(0)}</td><td>${(-w0.E * meV).toFixed(0)}</td><td>${FF.boilK(lo).toFixed(0)}–${FF.boilK(hi).toFixed(0)}</td><td>${fit.A.toFixed(0)}</td><td>${fit.beta.toFixed(2)}</td><td>${B.toFixed(1)}</td><td>${C.toFixed(1)}</td></tr>`;
  });
  $("wellTab").innerHTML = `<table><tr><th>4D noble gas</th><th>well at (bohr)</th><th>depth (meV)</th><th>of it, without dispersion</th><th>boils near (K)</th><th>A</th><th>β</th><th>B</th><th>C₆</th></tr>${rows.join("")}</table><p class="read">Atomic units for A, β, B, C₆, in V(R) = A e^(−βR) − B/R⁵ − C₆ f₆(βR)/R⁶. The fit puts each well within 0.2 bohr and about 20% of the computed curve; the molecular-dynamics view can use the computed curve itself. "Boils near" is 0.7 × depth/k, as our noble gases boil, over the depth's range.</p>`;
  const Rs = range(3.5, 12, 300), cols = ["#7dffb0", "#6fe0ff", "#c79bff"], series = nob4.slice(1, 4).map((p, i) => { const el = TABLE[4][p.Z - 1], S = FF.sumR2(el), f = FF.fullPair(PAIR_RS, p, FF.permanentB(S, S), c6(4, p.Z)); return { pts: Rs.map((R) => [R, f(R) * meV]), c: cols[i], label: `4D element ${p.Z}, computed` }; });
  series.push({ pts: Rs.map((R) => [R, FF.lj(R, FF.MEASURED_LJ.Ar) * meV]), c: C3, label: "our argon, measured" });
  chart($("cWells"), { x: [3.5, 12], y: [-600, 150], xl: "distance between the two atoms (bohr)", yl: "energy (meV)", series });
}
/* the forces chapter: dispersion, computed */
function drawDisp() {
  const r3 = RESPONSE[3].map((r) => { const m = FF.MEASURED[r.Z]; return `<tr><td class="d3">${SYM[r.Z - 1]}</td><td>${r.a0.toFixed(3)}</td><td>${m.alpha}</td><td>${r.c6.toFixed(2)}</td><td>${m.C6}</td></tr>`; });
  $("dispCheck").innerHTML = `<table><tr><th>ours</th><th>α (bohr³), computed</th><th>measured</th><th>C₆, computed</th><th>measured</th></tr>${r3.join("")}</table><p class="read">Hydrogen's "measured" values are its exact ones.</p>`;
  const r4 = RESPONSE[4].map((r) => { const el = TABLE[4][r.Z - 1], S = FF.sumR2(el), B = FF.permanentB(S, S), x = FF.crossover(B, r.c6); return `<tr><td class="d4">${r.Z === 1 ? "hydrogen" : r.Z}</td><td>${r.a0.toFixed(2)}</td><td>${r.c6.toFixed(1)}</td><td>${r.Z === 1 ? "—" : B.toFixed(1)}</td><td>${r.Z === 1 ? "—" : x.toFixed(1)}</td></tr>`; });
  $("dispTab").innerHTML = `<table><tr><th>4D</th><th>α (bohr³)</th><th>C₆</th><th>B (the permanent R⁻⁵)</th><th>equal at (bohr)</th></tr>${r4.join("")}</table><p class="read">"Equal at" is C₆/B: closer in than that dispersion is the stronger, further out the permanent pull. (Hydrogen has one electron and an open shell; its S-term is left out here.)</p>`;
  const h = RESPONSE[4].find((r) => r.Z === 1), h3 = RESPONSE[3].find((r) => r.Z === 1);
  $("rDisp").innerHTML = `4D hydrogen is <b>${(h.a0 / h3.a0).toFixed(1)}×</b> as polarizable as ours (α = ${h.a0.toFixed(1)}), being twice the size and less than half as tightly bound. 4D's helium, element 2, is soft too: dispersion beats its permanent pull out to ${(RESPONSE[4][1].c6 / FF.permanentB(FF.sumR2(TABLE[4][1]), FF.sumR2(TABLE[4][1]))).toFixed(0)} bohr. From element 12 on, the two are equal about a bohr out, inside the atoms themselves: wherever two of them can sit, the permanent pull is the stronger.`;
}

/* the Xater chapter: our water as the check, then Xater, computed the same way */
const KCAL = 627.51; // a hartree in kcal/mol
function drawXater() {
  const w = MOLECULES[3], y = MOLECULES[4], f = (v, k) => (v == null ? "—" : v.toFixed(k));
  const rows = (m) => [["bond length (bohr)", m.big.R, m.small.R, 3], ["angle (°)", m.big.theta, m.small.theta, 1], ["dipole moment (au)", m.big.dipole, m.small.dipole, 2],
    ["straightening it costs (eV)", m.big.linear * EV, m.small.linear * EV, 2], ["pulling it into atoms (eV)", m.big.De * EV, m.small.De * EV, 2], ["its top electron's binding (eV)", -m.big.homo * EV, -m.small.homo * EV, 1]];
  const LIT = [[1.776, 1.809], [106.3, 104.5], [0.78, 0.730], [null, 1.38], [null, 10.09], [null, 12.6]];
  $("molCheck").innerHTML = `<table><tr><th>our water</th><th>computed</th><th>small basis</th><th>Hartree–Fock limit</th><th>measured</th></tr>${rows(w).map(([q, a, b, k], i) => `<tr><td class="d3">${q}</td><td>${f(a, k)}</td><td>${f(b, k)}</td><td>${f(LIT[i][0], k)}</td><td>${f(LIT[i][1], k)}</td></tr>`).join("")}<tr><td class="d3">hydrogen bond (kcal/mol)</td><td>—</td><td>${f(-w.dimer.E * KCAL, 1)}</td><td>3.6</td><td>5.0</td></tr><tr><td class="d3">O to O in the pair (bohr)</td><td>—</td><td>${f(w.dimer.RXX, 2)}</td><td>5.7</td><td>5.5</td></tr></table><p class="read">"Computed" is the big basis. The Hartree–Fock limit is what the method gives with a complete basis (from the literature); what it can't reach of the measured values is correlation. The top electron's binding is Koopmans's estimate of the energy to ionize.</p>`;
  const rw = rows(w), ry = rows(y);
  $("xaterTab").innerHTML = `<table><tr><th></th><th>our water</th><th>Xater</th></tr>${ry.map(([q, a, , k], i) => `<tr><td>${q}</td><td class="d3">${f(rw[i][1], k)}</td><td class="d4">${f(a, k)}</td></tr>`).join("")}<tr><td>hydrogen bond (kcal/mol)</td><td class="d3">${f(-w.dimer.E * KCAL, 1)}</td><td class="d4">${f(-y.dimer.E * KCAL, 1)}</td></tr><tr><td>heavy atoms in the pair (bohr)</td><td class="d3">${f(w.dimer.RXX, 2)}</td><td class="d4">${f(y.dimer.RXX, 2)}</td></tr></table><p class="read">The same method and the same recipe of basis functions in both worlds: the molecules at the big basis, the pairs at the small one. At the small basis Xater bends to ${f(y.small.theta, 1)}° and water to ${f(w.small.theta, 1)}°.</p>`;
  const ratio = y.dimer.E / w.dimer.E;
  $("rXater").innerHTML = `Xater's dipole is <b>${(y.big.dipole / w.big.dipole).toFixed(1)}×</b> water's, and its hydrogen bond <b>${ratio.toFixed(1)}×</b> as strong, computed the same way. Straightening Xater costs ${f(y.big.linear * EV, 2)} eV, ${(w.big.linear / y.big.linear).toFixed(0)} times less than water's ${f(w.big.linear * EV, 2)}.`;
}

/* the census chapter: every hydride of 4D's rows two and three, and its hydrogen bonds */
const SUB = (n) => (n > 1 ? String(n).replace(/\d/g, (c) => "₀₁₂₃₄₅₆₇₈₉"[c]) : "");
const SYM4 = { 3: "Mi", 7: "D", 13: "To" };
const formula = (m) => (m.d === 3 ? { 7: "NH₃", 8: "H₂O", 9: "HF" }[m.Z] : m.Z === 10 ? "Xater, H₂Px (10)" : `${SYM4[m.Z] || "X"}H${SUB(m.bonds)} (${m.Z})`);
const shapeText = (m) => (m.shape === "bent" ? (m.param >= 179.5 ? "straight" : `bent, ${m.param.toFixed(0)}°`) : m.shape === "pyramid" ? (Math.abs(m.param - 90) < 0.5 ? "flat" : `pyramid, ${m.param.toFixed(0)}°`) : m.bonds === 1 ? "—" : "a 4-simplex");
const network = (m) => (m.dimer && m.dimer.E != null ? Math.min(m.bonds, m.lp) * -m.dimer.E * KCAL : null);
function drawCensus() {
  const row = (m) => `<tr><td class="d${m.d}">${formula(m)}</td><td>${m.bonds}</td><td>${m.lp}</td><td>${shapeText(m)}</td><td>${m.R.toFixed(2)}</td><td>${m.qH > 0 ? "+" : ""}${m.qH.toFixed(2)}</td><td>${m.dipole.toFixed(2)}</td></tr>`;
  $("censusTab").innerHTML = `<table><tr><th>hydride</th><th>bonds</th><th>lone pairs</th><th>shape</th><th>bond (bohr)</th><th>charge on H</th><th>dipole (au)</th></tr>${[...CENSUS[3], ...CENSUS[4]].map(row).join("")}</table><p class="read">The charge on hydrogen is Mulliken's share, a rough measure: read its sign and its trend. A pyramid's angle is each bond's tilt from the axis (90° is flat).</p>`;
  const prot = [...CENSUS[3], ...CENSUS[4]].filter((m) => m.dimer);
  $("pairTab").innerHTML = `<table><tr><th>hydride</th><th>apart (bohr)</th><th>one bond (kcal/mol)</th><th>bonds per molecule</th><th>network's pull</th></tr>${prot.map((m) => m.dimer.skipped ? `<tr><td class="d4">${formula(m)}</td><td colspan="4">too large to pair in the sandbox (${m.dimer.skipped} functions)</td></tr>` : `<tr><td class="d${m.d}">${formula(m)}</td><td>${m.dimer.RXX.toFixed(2)}</td><td>${(-m.dimer.E * KCAL).toFixed(1)}</td><td>${Math.min(m.bonds, m.lp)}</td><td>${network(m).toFixed(1)}</td></tr>`).join("")}</table><p class="read">Hartree–Fock at the small basis, counterpoise-corrected, both worlds the same way. Our three are the check.</p>`;
  const w = network(CENSUS[3].find((m) => m.Z === 8)), best = CENSUS[4].filter((m) => network(m) != null).sort((a, b) => network(b) - network(a));
  if ($("pairFull")) { const nm = { 3: "H₂O", 4: "Xater, H₂Px (10)", 4.9: "XH₃ (9)" };
    $("pairFull").innerHTML = `<table><tr><th>pair</th><th>the census's (kcal/mol)</th><th>searched over every pose</th><th>heavy atoms apart (bohr)</th></tr>${Object.entries(PAIRMIN).map(([k, r]) => `<tr><td class="d${r.d}">${nm[k]}</td><td>${(-r.census * KCAL).toFixed(2)}</td><td>${(-r.best.E * KCAL).toFixed(2)}</td><td>${r.best.dXX.toFixed(2)}</td></tr>`).join("")}</table><p class="read">Hartree–Fock at the census's small basis, counterpoise-corrected. The search's last step is coarse (good to about 0.2 kcal/mol), so where the census's own pair is lower, as for our water, it stands.</p>`; }
  $("rPairs").innerHTML = `In 4D the strongest networks are ${formula(best[0])} at ${network(best[0]).toFixed(1)} and ${formula(best[1])} at ${network(best[1]).toFixed(1)}, ${(network(best[0]) / w).toFixed(1)} and ${(network(best[1]) / w).toFixed(1)} times water's ${w.toFixed(1)}.`;
}

/* the force chapter: atoms don't collapse, their energies grow as Thomas–Fermi's Z^(5/2) in 4D, Z^(7/3) in 3D */
function energySlope(d, a, b) {
  const xs = [], ys = []; for (const el of TABLE[d]) if (el.Z >= a && el.Z <= b) { xs.push(Math.log(el.Z)); ys.push(Math.log(-el.E)); }
  const n = xs.length, mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  return xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / xs.reduce((s, v) => s + (v - mx) ** 2, 0);
}
function drawScaling() { $("rScaling").innerHTML = `The solver's total energies, fitted as Z^p: <b>p = ${energySlope(4, 30, 78).toFixed(2)}</b> in 4D for Z = 30–78 (Thomas–Fermi: 5/2), and p = ${energySlope(3, 10, 36).toFixed(2)} in 3D for Z = 10–36 (Thomas–Fermi: 7/3, approached from above as ours are).`; }

/* ------------------------------------------------------------- wiring: each chapter draws what it has */
if ($("dimSel")) $("dimSel").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; dim = +b.dataset.d; for (const x of $("dimSel").children) x.classList.toggle("on", x === b); drawTable(); });
const DRAW = [["cPin", drawPin], ["cLevels", drawLevels], ["cSpec", drawSpec], ["pt", drawTable], ["cIon", drawTrends], ["chemText", drawChem], ["routes", drawRoutes], ["cShell", drawShell], ["cScreen", drawScreen], ["cCompact", drawCompact], ["skies", drawSky], ["fineTab", drawFine], ["nobleForces", drawForces], ["wellTab", drawWells], ["rScaling", drawScaling], ["dispTab", drawDisp], ["xaterTab", drawXater], ["censusTab", drawCensus]];
function drawAll() { for (const [id, f] of DRAW) if ($(id)) f(); }
let rt = 0; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { drawAll(); [...tiles, ...turnTiles].forEach((t) => t.draw()); }, 120); });
/* links into the old one-page version land on the chapter that holds them now */
const MOVED = { pin: "force.html", maxwell: "force.html#routes", hydrogen: "hydrogen.html", table: "table.html", trends: "table.html#trends", trust: "table.html#trust", solids: "shapes.html", chem: "darbon.html" };
if ($("position") && MOVED[location.hash.slice(1)]) location.replace(MOVED[location.hash.slice(1)]);
buildShapes();
buildTurning();
buildLiquid();
buildSearch();
drawClusters();
drawAll();
