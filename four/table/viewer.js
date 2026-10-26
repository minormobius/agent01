/* The periodic table of four dimensions, big: all 78 elements as ATOM⁴'s solver found them (../atom/js/table.js),
   named after ours where they do what one of ours does (../atom/js/names.js), the new ones marked, and our own table
   beside it, linked both ways. */
import { TABLE, RPLOT } from "../atom/js/table.js";
import { IE_REAL, layout } from "../atom/js/periodic.js";
import { names, OURS } from "../atom/js/names.js";
import { CENSUS } from "../atom/js/census.js";

const $ = (id) => document.getElementById(id), EV = 27.2114, KCAL = 627.509;
const N4 = names(TABLE, 4), L4 = layout(TABLE, 4);
const counterpart4 = new Map([...N4.values()].filter((e) => e.ours).map((e) => [e.ours.Z, e.Z])); // ours Z → 4D Z

/* our table, 1–54, in its usual 18 columns (computed by the same solver up to 36) */
const OUR_ROWS = [[1, 2], [3, 10], [11, 18], [19, 36], [37, 54]];
function ourCell(Z) {
  const r = OUR_ROWS.findIndex(([a, b]) => Z >= a && Z <= b), [a, b] = OUR_ROWS[r], k = Z - a, len = b - a + 1;
  const col = r === 0 ? (Z === 1 ? 1 : 18) : k < 2 ? k + 1 : 18 - (len - 1 - k);
  const block = r === 0 ? "s" : k < 2 ? "s" : len === 18 && k < 12 ? "d" : "p";
  return { row: r, col, block, noble: k === len - 1 };
}
const OUR = OURS.map((o) => ({ ...o, ...ourCell(o.Z), el: TABLE[3][o.Z - 1] ?? null }));

/* the census's hydride and pair for a 4D element, where it was computed */
const hydride = (Z) => CENSUS[4].find((m) => m.Z === Z);
const PAGES = { 1: ["hydrogen.html", "Hydrogen"], 7: ["darbon.html", "Darbon"], 10: ["xater.html", "Pxygen and Xater"] };

let mode = "kin", pinned = 7, hover = null, world = 4;
const sel = () => hover ?? pinned;

function colourOf(e, el) {
  if (mode === "block") return { s: "#2b1d38", p: "#13283a", d: "#1d3022" }[e.block];
  if (mode === "kin") return e.isNew ? "#3a2c0c" : "#141822";
  if (!el) return "transparent"; // ours past 36: not computed by the solver, so no colour to give
  const v = mode === "ion" ? el.ion * EV / 14 : el.orb.find((o) => o.s === el.top).r / 9; // ionization (eV) or outer radius (bohr)
  const t = Math.max(0, Math.min(1, v));
  return `hsl(${200 - 160 * t} ${30 + 40 * t}% ${12 + 26 * t}%)`;
}

function tile(e, el, which) {
  const b = document.createElement("button"); b.type = "button";
  b.className = `el ${e.block}${e.noble ? " noble" : ""}${e.isNew ? " new" : ""}`;
  b.style.gridRow = e.row + 2; b.style.gridColumn = e.col + 1; b.style.background = colourOf(e, el);
  const name = which === 4 ? (e.name ?? `element ${e.Z}`) : e.name;
  b.innerHTML = `<span class="z">${e.Z}</span><span class="sym">${which === 4 ? (e.sym ?? "new") : e.sym}</span><span class="nm">${e.isNew ? "" : name}</span>`;
  b.dataset.z = e.Z; b.dataset.w = which;
  b.setAttribute("aria-label", `${name}, element ${e.Z}${e.isNew ? ", new: no counterpart in our world" : ""}`);
  b.onmouseenter = () => { hover = which === 4 ? e.Z : counterpart4.get(e.Z) ?? -e.Z; mark(); detail(); };
  b.onmouseleave = () => { hover = null; mark(); detail(); };
  b.onclick = () => { pinned = which === 4 ? e.Z : counterpart4.get(e.Z) ?? -e.Z; hover = null; mark(); detail(); };
  return b;
}

/* the grids: 4D (28 columns) and ours (18), each with block labels over their columns */
function grids() {
  const g4 = $("pt4"), g3 = $("pt3");
  for (const [g, W] of [[g4, L4.W], [g3, 18]]) { g.innerHTML = ""; g.style.gridTemplateColumns = `20px repeat(${W}, var(--cw))`; }
  // block spans over the widest row: s (2), d, p
  const spans = (g, W, d) => { const P = d === 4 ? 8 : 6, D = W - 2 - P; [["s", 2, 2], ["d", 3, D], ["p", 3 + D, P]].forEach(([t, c, n]) => {
    const s = document.createElement("div"); s.className = `span ${t}`; s.style.gridRow = 1; s.style.gridColumn = `${c + 1} / span ${n}`;
    s.textContent = t === "s" ? "s" : t === "d" ? `d: ${D} places${d === 4 ? " (ours 10)" : ""}` : `p: ${P}${d === 4 ? " (ours 6)" : ""}`; g.appendChild(s); }); };
  spans(g4, L4.W, 4); spans(g3, 18, 3);
  for (let r = 0; r < 5; r++) for (const g of [g4, g3]) { const l = document.createElement("div"); l.className = "lab"; l.textContent = r + 1; l.style.gridRow = r + 2; l.style.gridColumn = 1; g.appendChild(l); }
  for (const c of L4.cells) g4.appendChild(tile(N4.get(c.el.Z), c.el, 4));
  for (const o of OUR) g3.appendChild(tile(o, o.el, 3));
  size(); mark(); reveal();
}
/* on a narrow screen the 4D table scrolls: bring the selected element into view (without moving the page) */
function reveal() {
  const w = $("wrap4"), b = w.querySelector(`.el[data-w="4"][data-z="${pinned}"]`); if (!b || w.scrollWidth <= w.clientWidth) return;
  w.scrollLeft = Math.max(0, b.offsetLeft - w.clientWidth / 2 + b.offsetWidth / 2);
}
function size() {
  const w = Math.min($("wrap4").clientWidth, 1440), cw = Math.max(30, Math.min(56, Math.floor((w - 24) / L4.W) - 3));
  document.documentElement.style.setProperty("--cw", cw + "px");
  document.body.classList.toggle("tight", cw < 44);
}
/* the selection, and its counterpart in the other world */
function mark() {
  const z4 = sel(), e4 = z4 > 0 ? N4.get(z4) : null, z3 = z4 < 0 ? -z4 : e4?.ours?.Z;
  for (const b of document.querySelectorAll(".el")) {
    const z = +b.dataset.z, w = +b.dataset.w;
    b.classList.toggle("on", (w === 4 && z === z4) || (w === 3 && z === z3));
    b.classList.toggle("dim", mode === "kin" && w === 3 && !counterpart4.has(z));
  }
}

function detail() {
  const z = sel(), box = $("detail");
  if (z < 0) { // one of ours with no 4D counterpart
    const o = OURS[-z - 1];
    box.innerHTML = `<h4>${o.name} <span class="sym3">${o.sym}</span></h4><div class="kv">ours, element ${o.Z}. No 4D element does what it does.</div>`;
    return;
  }
  const e = N4.get(z), el = TABLE[4][z - 1], top = el.orb.find((o) => o.s === el.top), h = hydride(z), o = e.ours;
  const o3 = o ? TABLE[3][o.Z - 1] : null, page = PAGES[z] ?? (h ? ["census.html", "Which water"] : null);
  const rowTxt = ["first", "second", "third", "fourth", "fifth"][e.row];
  box.innerHTML = `
    <h4 class="${e.isNew ? "newt" : ""}">${e.name ?? `Element ${z}`} <span class="sym4">${e.sym ?? ""}</span></h4>
    <div class="kv">element <b>${z}</b> · ${rowTxt} row · ${e.block} block${e.noble ? " · a noble gas" : ""}</div>
    ${e.isNew
      ? `<div class="kv newt"><b>New: nothing in our world does what it does.</b> ${e.why}.</div>`
      : `<div class="kv">4D's counterpart of our <b>${o.name}</b> (${o.sym}, element ${o.Z}): ${e.why}.</div>`}
    <div class="cfg">${el.config}</div>
    <div class="kv">first ionization <b>${(el.ion * EV).toFixed(2)} eV</b>${o ? ` · our ${o.name}: ${IE_REAL[o.Z - 1]} eV measured` : ""}</div>
    <div class="kv">outermost electron <b>${el.top}</b> at <b>${top.r.toFixed(2)} bohr</b>${o3 ? ` · our ${o.name}'s at ${o3.orb.find((q) => q.s === o3.top).r.toFixed(2)} (same solver)` : ""}</div>
    ${h ? `<div class="kv">its hydride, from the census: <b>XH${sub(h.bonds)}</b>${h.lp ? `, ${h.lp} lone pair${h.lp > 1 ? "s" : ""}` : ""}, ${h.shape === "pyramid" && Math.abs(h.param - 90) < 0.5 ? "flat: its hydrogens in one 3D slice, the lone pair straight across it" : h.shape === "fixed" ? "fully symmetric" : `${h.shape}${h.param != null ? ` (${h.param.toFixed(0)}°)` : ""}`}, dipole <b>${h.dipole.toFixed(2)}</b> au, hydrogen ${h.qH > 0 ? "positive" : "negative"}${h.dimer && h.dimer.E ? `; a hydrogen-bonded pair holds at <b>${(-h.dimer.E * KCAL).toFixed(1)} kcal/mol</b> (the census's linear bond)` : ""}</div>` : ""}
    ${page ? `<div class="kv">in the position: <a href="../atom/${page[0]}">${page[1]}</a></div>` : ""}
    <canvas id="cloud" class="cloud"></canvas>
    <div class="kv small">its electron cloud: electrons per unit of log r, each shell a bump${o3 ? `, with our ${o.name}'s in amber` : ""}</div>`;
  cloud($("cloud"), el, o3);
}
const sub = (n) => (n > 1 ? String(n).split("").map((c) => "₀₁₂₃₄₅₆₇₈₉"[+c]).join("") : "");

function cloud(cv, el, o3) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const lx = (r) => 8 + ((w - 16) * (Math.log10(r) + 1.7)) / 3.1; // r from 0.02 to 25 bohr
  const curves = [[el, "#6fe0ff"], ...(o3 ? [[o3, "#ffb46b"]] : [])], ymax = Math.max(...curves.flatMap(([e]) => RPLOT.map((r, i) => r * e.dens[i]))) * 1.08;
  g.strokeStyle = "rgba(255,255,255,0.15)"; g.beginPath(); g.moveTo(8, h - 16); g.lineTo(w - 8, h - 16); g.stroke();
  g.font = "10px ui-monospace, monospace"; g.fillStyle = "#9a958c";
  for (const r of [0.1, 1, 10]) { g.fillText(`${r}`, lx(r) - 6, h - 4); g.fillRect(lx(r), h - 18, 1, 4); }
  g.fillText("bohr", w - 34, h - 4);
  for (const [e, c] of curves.reverse()) { g.strokeStyle = c; g.lineWidth = 1.6; g.beginPath(); RPLOT.forEach((r, i) => { const x = lx(r), y = h - 16 - ((h - 26) * r * e.dens[i]) / ymax; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
}

function legend() {
  const L = {
    kin: [["#141822", "does what one of ours does: our name, its first letter moved on"], ["#3a2c0c", "new: nothing of ours does what it does"]],
    block: [["#2b1d38", "s block"], ["#1d3022", "d block"], ["#13283a", "p block"]],
    ion: [["hsl(200 30% 12%)", "ionizes easily"], ["hsl(40 70% 38%)", "holds its electrons hard (14 eV and up)"], ["transparent", "ours past 36: not computed"]],
    size: [["hsl(200 30% 12%)", "small"], ["hsl(40 70% 38%)", "large (outer electron 9 bohr and out)"], ["transparent", "ours past 36: not computed"]],
  }[mode];
  $("legend").innerHTML = L.map(([c, t]) => `<span><i style="background:${c}${mode === "kin" && c === "#3a2c0c" ? ";box-shadow:inset 0 0 0 1px #ffd166" : c === "transparent" ? ";box-shadow:inset 0 0 0 1px #262833" : ""}"></i>${t}</span>`).join("");
}

$("modes").addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (!b) return; mode = b.dataset.m; for (const x of $("modes").children) x.classList.toggle("on", x === b); grids(); legend(); });
addEventListener("resize", () => { size(); reveal(); });
addEventListener("keydown", (ev) => {
  if (ev.target.closest?.("input, textarea, select, [contenteditable]") || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (!["ArrowLeft", "ArrowRight"].includes(ev.key) || pinned < 0) return;
  pinned = Math.max(1, Math.min(78, pinned + (ev.key === "ArrowRight" ? 1 : -1))); hover = null; mark(); detail(); ev.preventDefault();
});
const all = [...N4.values()];
$("count").innerHTML = `<b>${all.length}</b> elements · <b>${all.filter((e) => !e.isNew).length}</b> answer to one of ours · <b class="newt">${all.filter((e) => e.isNew).length}</b> are new`;
grids(); legend(); detail();
