/* ATOM⁴ — the page. The physics is ./atom.js (the solver) and ./fields.js (the field theory); the periodic table
   is baked into ./table.js by tools/bake.mjs, since solving 114 atoms takes minutes. */
import { hydrogen, orbitals, k4 } from "./atom.js";
import * as F from "./fields.js";
import { TABLE, RPLOT, SHELL_COUNTERFACTUAL } from "./table.js";
import { lineColour } from "../../lumen4/js/optics.js";
import { SYM, IE_REAL, realConfig, isNoble, layout, role } from "./periodic.js";
import { buildShapes, tiles } from "./shapes.js";

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
  $("rIon").innerHTML = `Noble gases: 3D <b>${n3.join(", ")}</b> (periods of ${plen(n3).join(", ")}); 4D <b>${n4.join(", ")}</b> (periods of ${plen(n4).join(", ")}). The solver's 3D line runs about a third below the measured dots: without exchange it underbinds, and it can't show the small dips where a shell passes half full (nitrogen to oxygen).`;
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
  ];
  $("routes").innerHTML = R.map(([t, p, c]) => `<div class="route"><h5>${t}</h5><p>${p}</p><p class="cost">costs: ${c}</p></div>`).join("");
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
  $("rScreen").innerHTML = `3D: <b>${f(n3)}</b> eV, falling down the column, as ours do. 4D: <b>${f(n4)}</b> eV, rising. 4D with the shell theorem forced on: ${f(cf)} eV, no rise. The same atoms and the same solver, with one thing changed: the rising grip comes from the shell theorem failing.`;
}
function drawCompact() {
  const rs = range(0.01, 100, 300, true), p = (r) => { const e = 1e-4; return -(Math.log(F.compactPotential(r * (1 + e), 1)) - Math.log(F.compactPotential(r, 1))) / Math.log(1 + e); };
  chart($("cCompact"), { x: [0.01, 100], y: [0.8, 2.2], logx: true, xl: "distance from the charge, in units of the small dimension's size ℓ", yl: "the potential falls as 1/r^…", series: [{ pts: rs.map((r) => [r, p(r)]), c: C4, label: "a small fourth dimension" }],
    vlines: [{ x: 1 / Math.PI, c: DIM, label: "ℓ/π" }] });
}

/* ------------------------------------------------------------- wiring */
$("dimSel").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; dim = +b.dataset.d; for (const x of $("dimSel").children) x.classList.toggle("on", x === b); drawTable(); });
function drawAll() { drawPin(); drawLevels(); drawSpec(); drawTable(); drawTrends(); drawChem(); drawRoutes(); drawShell(); drawScreen(); drawCompact(); }
let rt = 0; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { drawAll(); tiles.forEach((t) => t.draw()); }, 120); });
buildShapes();
drawAll();
