/* The strong-force dial: a slider over the strength s of the nucleon force's attraction, across the window where the
   deuteron binds in 4D. Everything shown is read from data.js (atom/tools/ppfusion.mjs dial); between its strengths the
   deuteron's binding and the log of the p + p rate are interpolated, nothing else is. */
import { DIAL } from "./data.js";

const $ = (id) => document.getElementById(id);
const BETA = 1.29333 + 0.510999, PEP = 1.29333 - 0.510999, OURS_B = DIAL.ours.deuteron;
// 4D names (atom/js/names.js; element 8 is one of the 52 new ones, so it has no name)
const NAME = { He: "ielium", 2: "ielium", 4: "ceryllium", 6: "element 6", 7: "darbon", 8: "element 8", 9: "oitrogen", 10: "pxygen", 11: "gluorine", 12: "oeon", 13: "todium" };
const COLOR = { He: "#6fe0ff", 8: "#9a958c", 9: "#ffb46b", 10: "#b48cff", 11: "#7fd88a", 12: "#e3cf7f", 13: "#ff8b8b" };
// strengths whose nuclei are partly computed: strength-scan-1 (helium-4, a nucleon on the ladder, Brink's clusters) is done,
// strength-scan-2 (the helium-4 ladder) is on the runner; captures and the core follow in the sandbox
const QUEUED = { MN: [1.55, 1.6, 1.65, 1.7, 1.75, 1.8, 1.85], MT: [] };

let force = "MN", s = DIAL.forces.MN.ours;
// the grid plus the deuteron-as-ours point itself (rate ×1 by definition, B ours by construction), so the reference reads exactly
for (const f of Object.values(DIAL.forces)) { f.grid.push({ s: f.ours, B: OURS_B, pp: "open", rel: 1 }); f.grid.sort((a, b) => a.s - b.s); }
const F = () => DIAL.forces[force];

function at(sv) { // interpolate B and the rate in the force's grid
  const g = F().grid; let i = 0; while (i < g.length - 2 && g[i + 1].s < sv) i++;
  const a = g[i], b = g[i + 1], t = Math.min(1, Math.max(0, (sv - a.s) / (b.s - a.s))), B = a.B + t * (b.B - a.B);
  let rel = 0; if (B > BETA) { if (a.rel > 0 && b.rel > 0) rel = Math.exp(Math.log(a.rel) + t * (Math.log(b.rel) - Math.log(a.rel))); else rel = NaN; } // NaN: open, just past the threshold
  return { B, rel };
}

function canvas(c) { const r = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (c.width !== w * r || c.height !== h * r) { c.width = w * r; c.height = h * r; } const x = c.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h); return { x, w, h }; }
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function gauge(B) {
  const { x, w, h } = canvas($("gauge")), lo = Math.log10(0.01), hi = Math.log10(30), L = 8, R = w - 8, X = (v) => L + ((Math.log10(Math.max(v, 0.01)) - lo) / (hi - lo)) * (R - L), y = 30;
  x.fillStyle = css("--border"); x.fillRect(L, y - 5, R - L, 10);
  x.fillStyle = "rgba(201,166,140,0.35)"; x.fillRect(L, y - 5, X(PEP) - L, 10);
  x.fillStyle = "rgba(227,207,127,0.35)"; x.fillRect(X(PEP), y - 5, X(BETA) - X(PEP), 10);
  x.fillStyle = "rgba(111,224,255,0.25)"; x.fillRect(X(BETA), y - 5, R - X(BETA), 10);
  x.font = `11px ${css("--mono")}`; x.textAlign = "center";
  for (const [v, lab, col] of [[PEP, "0.78 pep", "#e3cf7f"], [BETA, "1.80 p+p", css("--d4")], [OURS_B, "2.22 ours", css("--d3")]]) {
    x.strokeStyle = col; x.lineWidth = 1; x.beginPath(); x.moveTo(X(v), y - 9); x.lineTo(X(v), y + 9); x.stroke(); x.fillStyle = col; x.textAlign = v === BETA ? "right" : v === OURS_B ? "left" : "center"; x.fillText(lab, X(v) + (v === BETA ? -3 : v === OURS_B ? 3 : 0), y + (v === PEP && w < 600 ? 36 : 22)); }
  x.fillStyle = css("--dim"); for (const v of [0.01, 0.1, 1, 10]) { x.textAlign = v === 0.01 ? "left" : "center"; x.fillText(String(v), X(v), y - 13); }
  const px = X(B); x.fillStyle = css("--text"); x.beginPath(); x.moveTo(px, y - 6); x.lineTo(px - 6, y - 18); x.lineTo(px + 6, y - 18); x.fill();
  x.beginPath(); x.arc(px, y, 6, 0, 7); x.fill();
}

function rateChart() {
  const { x, w, h } = canvas($("rate")), f = F(), [s0, s1] = f.window, L = 46, R = w - 10, T = 10, Bm = h - 28;
  const X = (v) => L + ((v - s0) / (s1 - s0)) * (R - L), lo = -2, hi = 8, Y = (r) => Bm - ((Math.log10(r) - lo) / (hi - lo)) * (Bm - T);
  x.font = `11px ${css("--mono")}`; x.strokeStyle = css("--border"); x.fillStyle = css("--dim"); x.lineWidth = 1;
  for (let e = lo; e <= hi; e += 2) { x.beginPath(); x.moveTo(L, Y(10 ** e)); x.lineTo(R, Y(10 ** e)); x.stroke(); x.textAlign = "right"; x.fillText(e === 0 ? "×1" : `10${sup(e)}`, L - 5, Y(10 ** e) + 4); }
  x.textAlign = "center"; for (let k = 0; k <= 4; k++) { const v = s0 + ((s1 - s0) * k) / 4; x.textAlign = k === 0 ? "left" : k === 4 ? "right" : "center"; x.fillText(v.toFixed(2), X(v), h - 10); }
  x.fillStyle = "rgba(201,166,140,0.13)"; x.fillRect(L, T, X(f.open.beta) - L, Bm - T);
  x.fillStyle = css("--dim"); x.textAlign = "left"; x.fillText("no p + p", L + 4, T + 14);
  x.strokeStyle = css("--d4"); x.lineWidth = 2; x.beginPath(); let on = false;
  for (const g of f.grid) { if (!(g.rel > 0)) { on = false; continue; } const px = X(g.s), py = Y(g.rel); on ? x.lineTo(px, py) : x.moveTo(px, py); on = true; } x.stroke();
  x.fillStyle = css("--d3"); x.beginPath(); x.arc(X(f.ours), Y(1), 4, 0, 7); x.fill(); x.textAlign = "left"; x.fillText("deuteron as ours", X(f.ours) + 7, Y(1) + 14);
  x.strokeStyle = css("--text"); x.setLineDash([3, 3]); x.lineWidth = 1; x.beginPath(); x.moveTo(X(s), T); x.lineTo(X(s), Bm); x.stroke(); x.setLineDash([]);
  const r = at(s).rel; if (r > 0) { x.fillStyle = css("--text"); x.beginPath(); x.arc(X(s), Y(r), 5, 0, 7); x.fill(); }
}
const sup = (n) => String(n).split("").map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"["0123456789".indexOf(c)] ?? (c === "-" ? "⁻" : c)).join("");
const fmt = (r) => (r >= 100 ? `${(r / 10 ** Math.floor(Math.log10(r))).toFixed(1)} × 10${sup(Math.floor(Math.log10(r)))}` : r >= 1 ? r.toFixed(r < 10 ? 2 : 1) : r.toPrecision(2));

function chips(B, rel) {
  const f = F(), out = [];
  out.push(B > 0.005 ? ["yes", `deuteron binds, ${B.toFixed(2)} MeV`] : ["no", "deuteron doesn't bind"]);
  const he = f.he4.find((h) => Math.abs(h.s - s) < 0.004); if (he) out.push(["yes", `helium-4 binds by ${(-he.E).toFixed(1)} MeV (ours 28.3)`]);
  out.push(s >= f.window[1] - 1e-4 ? ["no", "diproton binds: the window's edge"] : ["yes", "diproton unbound"]);
  out.push(B > BETA ? ["yes", `p + p → d e⁺ ν runs${rel > 0 ? `, ×${fmt(rel)}` : ", barely"}`] : B > PEP ? ["half", "only p + e⁻ + p → d ν"] : ["no", "no deuteron from protons"]);
  $("chips").innerHTML = out.map(([c, t]) => `<span class="chip ${c}">${t}</span>`).join("");
  $("verdict").innerHTML = B > BETA
    ? (Math.abs(s - f.ours) < 2e-4 ? "Here the deuteron binds by 2.22 MeV, as ours does, and two protons fuse at the reference rate (×1)." : rel > 0 ? `Two protons fuse <b>${rel >= 1 ? `${fmt(rel)} times as fast` : `${fmt(1 / rel)} times slower`}</b> than where the deuteron binds as ours. ${rel > 1e3 ? "A star needs its core far cooler to shine as brightly, too cool to climb past the lightest nuclei." : rel < 0.3 ? "A star runs its core hotter to make up for it." : ""}` : "Two protons can just fuse: the positron is barely affordable, and the rate is tiny.")
    : B > PEP ? "Two protons can't make a deuteron and a positron: there isn't the energy. They could with an electron caught on the way in (pep), a three-body process that is much slower and not computed here yet. Below 1.80 MeV, hydrogen as our Sun burns it doesn't burn."
    : "Two protons can't make a deuteron at all, with or without an electron. A star of hydrogen would have to burn by some other route, or not burn.";
}

function bars() {
  const f = F(), note = $("chainnote"), host = $("bars");
  if (!f.chain.length) { note.innerHTML = `Not computed for Malfliet–Tjon's force: the full chain (the captures that climb past helium) has only been run on Minnesota's. Switch force to see it.`; host.innerHTML = ""; return; }
  const B = at(s).B, here = f.chain.find((c) => Math.abs(c.s - s) < 0.004), queued = QUEUED[force].find((q) => Math.abs(q - s) < 0.026);
  const where = B <= BETA ? `At s = ${s.toFixed(4)} there's <b>no p + p</b>, so no hydrogen burning by the Sun's route.`
    : here ? `Computed at <b>s = ${here.s}</b> (highlighted).`
    : `Not computed at s = ${s.toFixed(4)}: the full chain has been run at the two strengths below only.` + (queued ? ` At s = ${queued} helium-4 and a nucleon on each ladder nucleus are computed; the helium-4 ladder is <span class="tag queued">queued</span> on the runner, then the climb's captures and the core.` : "");
  note.innerHTML = `${where} A star is held as bright as the Sun, so its core sits at whatever temperature makes p + p supply that; two draws of the larger nuclei's helium-4s (loose and close) bracket the answer.`;
  host.innerHTML = f.chain.map((c) => {
    const on = c === here, rel = at(c.s).rel, cav = c.s > 1.6 ? ` <span class="tag open">caveat</span> <span style="font-weight:400">only p + p recomputed at this strength; the captures after it are still the deuteron-as-ours ones (being redone)</span>` : "";
    return `<div style="border:1px solid ${on ? "var(--d4)" : "var(--border)"};border-radius:8px;padding:8px 10px;opacity:${on || !here ? 1 : 0.55}"><h5 style="font:600 12px var(--mono);margin:0 0 6px;color:var(--text)">s = ${c.s} · p + p ×${fmt(rel)}${Math.abs(c.s - f.ours) < 2e-4 ? " (deuteron as ours)" : c.s >= f.window[1] - 1e-4 ? " (the window's top)" : ""}${cav}</h5>` +
      c.rows.map((r) => { const parts = Object.entries(r.mix).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
        return `<div class="bar" style="margin-top:4px"><h5>${r.draw} draw · core <b>${r.T_MK} million K</b></h5><div class="stack">${parts.map(([z, v]) => `<div style="width:${(v * 100).toFixed(1)}%;background:${COLOR[z] ?? "#888"}" title="${NAME[z] ?? z} ${(v * 100).toFixed(0)}%">${v > 0.12 ? `${NAME[z] ?? z} ${(v * 100).toFixed(0)}%` : ""}</div>`).join("")}</div></div>`; }).join("") + `</div>`;
  }).join("");
}

function steps() {
  const f = DIAL.forces.MN, he = f.he4.map((h) => `${h.s} → ${(-h.E).toFixed(0)}`).join(", ");
  const rows = [
    ["deuteron", "binds across the window; its binding is the gauge above", "done", "both forces, every strength"],
    ["p + p → d e⁺ ν", "the first, slowest step: the chart above", "done", "both forces, every strength (15 MK shown; 5–50 MK in the bake)"],
    ["p + e⁻ + p → d ν", "the only route between 0.78 and 1.80 MeV", "open", "not computed"],
    ["helium-4", `binding by diffusion Monte Carlo, MeV (ours 28.3); Minnesota s → binding: ${he}`, "done", `Minnesota at ten strengths (strength-scan-1 added ${QUEUED.MN.join(", ")}); Malfliet–Tjon at three`],
    ["a nucleon on the ladder", "whether the odd nuclei between helium-4 rungs bind, loose and close draws", "done", "strength-scan-1, at the same seven strengths"],
    ["the ladder past helium", "beryllium-8, ceryllium-12 … by helium-4 clusters and Brink's determinants", "queued", "Brink's done (strength-scan-1); the helium-4 ladder running (strength-scan-2)"],
    ["captures and the core", "helium-4 and proton captures up the ladder, then a Sun-paced zone burning to the end", "open", "in the sandbox once the runner's nuclei land; then this page is rebaked"],
  ];
  $("steps").innerHTML = rows.map(([a, b, t, c]) => `<tr><td>${a}<span class="tag ${t === "done" ? "done" : t === "queued" ? "queued" : "open"}">${t === "open" ? "to do" : t}</span></td><td>${b}<br><span style="opacity:.8">${c}</span></td></tr>`).join("");
}

const slider = $("s");
function fromSlider() { const [a, b] = F().window; s = a + ((b - a) * slider.value) / 1000; }
function toSlider() { const [a, b] = F().window; slider.value = Math.round(((s - a) / (b - a)) * 1000); }
function draw() { const { B, rel } = at(s); $("sval").textContent = s.toFixed(4); gauge(B); rateChart(); chips(B, rel); bars(); }
slider.addEventListener("input", () => { fromSlider(); draw(); });
$("ours").addEventListener("click", () => { s = F().ours; toSlider(); draw(); });
for (const b of document.querySelectorAll("#force button")) b.addEventListener("click", () => {
  const [a0, b0] = F().window, t = (s - a0) / (b0 - a0); force = b.dataset.f; const [a1, b1] = F().window; s = a1 + t * (b1 - a1);
  for (const o of document.querySelectorAll("#force button")) o.classList.toggle("on", o === b); toSlider(); draw(); });
addEventListener("resize", draw);
toSlider(); steps(); draw();
