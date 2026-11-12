/* The chart of nuclei, interactive: every nucleus of the network at (neutrons, protons) through a star's whole life.
   Scrub or play the life; tap a nucleus for what makes it and what destroys it now, at what rates, and its abundance
   across every stage. The star is the widget's (its settings ride in the address). Draws only; the network is life.js. */
import { STAGES, NUC, IDX, RX, fluxes, toX, energy } from "./net.js";
import { runLife, at, atLife, decode, encode, KNOBS } from "./life.js";
import { label, human, sci, kelvin, eqn, words } from "./text.js";
import { drawStrip, stripLegend, colorZ } from "./strip.js";

const $ = (id) => document.getElementById(id);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const NS = STAGES.length, cfg = decode(location.hash), L = runLife(cfg);
const S = { v: +(new URLSearchParams(location.search).get("v") ?? 0) || 0, playing: false, speed: 1, sel: "c12", hover: null, arrows: 16, carry: true };
const stageOf = () => Math.min(NS - 1, Math.floor(S.v));
const NE = 30, ZE = 28;
let geo = null;

function draw() {
  const c = $("chart"), r = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (c.width !== Math.round(w * r) || c.height !== Math.round(h * r)) { c.width = Math.round(w * r); c.height = Math.round(h * r); }
  const x = c.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h);
  const cs = Math.min((w - 40) / (NE + 1), (h - 34) / (ZE + 1)), X0 = 30, Y0 = h - 24, P = (n, z) => [X0 + (n + 0.5) * cs, Y0 - (z + 0.5) * cs]; geo = { cs, P };
  const s = atLife(L, S.v), R = L[stageOf()], fl = fluxes(s.Y, R.k), X = toX(s.Y);
  // the axes, and the lines N = Z (where helium-4's multiples sit)
  x.strokeStyle = "rgba(255,255,255,0.06)"; x.lineWidth = 1; x.beginPath(); const [a0, b0] = P(0, 0), [a1, b1] = P(Math.min(NE, ZE), Math.min(NE, ZE)); x.moveTo(a0, b0); x.lineTo(a1, b1); x.stroke();
  x.font = `11px ${css("--mono")}`; x.fillStyle = css("--dim"); x.textAlign = "center";
  for (let n = 0; n <= NE; n += 5) x.fillText(n, P(n, 0)[0], h - 8); x.textAlign = "right"; for (let z = 0; z <= ZE; z += 5) x.fillText(z, X0 - 6, P(0, z)[1] + 4);
  x.textAlign = "right"; x.fillText("neutrons →", P(NE, 0)[0], h - 8); x.save(); x.translate(10, P(0, ZE / 2)[1]); x.rotate(-Math.PI / 2); x.textAlign = "center"; x.fillText("protons →", 0, 0); x.restore();
  for (let i = 0; i < NUC.length; i++) { const n = NUC[i], [px, py] = P(n.A - n.Z, n.Z), a = X[i] > 0 ? Math.max(0, Math.min(1, (Math.log10(X[i]) + 9) / 9)) : 0, sel = n.k === S.sel;
    x.fillStyle = `rgba(111,224,255,${0.05 + 0.85 * a})`; x.fillRect(px - cs / 2 + 1, py - cs / 2 + 1, cs - 2, cs - 2);
    x.strokeStyle = sel ? css("--d3") : n.k === S.hover ? "#fff" : css("--border"); x.lineWidth = sel ? 2.5 : 1; x.strokeRect(px - cs / 2 + 1, py - cs / 2 + 1, cs - 2, cs - 2);
    if (cs > 16) { x.fillStyle = a > 0.55 ? "#07080c" : css("--text"); x.font = `${Math.min(11, cs / 2.7)}px ${css("--mono")}`; x.textAlign = "center"; x.fillText(label(n.k), px, py + 3); } }
  // net flows between nuclei (heaviest reactant to heaviest product): the strongest, plus every one touching the selected
  const net = new Map(); RX.forEach((rx, i) => { if (!fl[i]) return; const hv = (xs) => xs.slice().sort((a, b) => NUC[IDX[b]].A - NUC[IDX[a]].A || NUC[IDX[b]].Z - NUC[IDX[a]].Z)[0], a = hv(rx.r), b = hv(rx.p); if (a === b) return; const key = a < b ? `${a}|${b}` : `${b}|${a}`; net.set(key, (net.get(key) ?? 0) + (a < b ? 1 : -1) * fl[i]); });
  const all = [...net.entries()].map(([k, v]) => { const [a, b] = k.split("|"); return v >= 0 ? [a, b, v] : [b, a, -v]; }).sort((p, q) => q[2] - p[2]), top = all[0]?.[2] ?? 1;
  const show = new Set(all.slice(0, S.arrows)); for (const e of all) if (e[0] === S.sel || e[1] === S.sel) show.add(e);
  for (const [a, b, v] of show) { const na = NUC[IDX[a]], nb = NUC[IDX[b]], [x1, y1] = P(na.A - na.Z, na.Z), [x2, y2] = P(nb.A - nb.Z, nb.Z), touch = a === S.sel || b === S.sel, wd = 1 + 5 * Math.max(0, 1 + Math.log10(v / top) / 8), ang = Math.atan2(y2 - y1, x2 - x1);
    x.strokeStyle = x.fillStyle = touch ? css("--d3") : "rgba(255,180,107,0.55)"; x.lineWidth = touch ? Math.max(2, wd) : wd; const sx = x1 + Math.cos(ang) * cs * 0.3, sy = y1 + Math.sin(ang) * cs * 0.3, ex = x2 - Math.cos(ang) * cs * 0.38, ey = y2 - Math.sin(ang) * cs * 0.38;
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(ex, ey); x.stroke(); x.beginPath(); x.moveTo(ex + Math.cos(ang) * 6, ey + Math.sin(ang) * 6); x.lineTo(ex + Math.cos(ang + 2.5) * 7, ey + Math.sin(ang + 2.5) * 7); x.lineTo(ex + Math.cos(ang - 2.5) * 7, ey + Math.sin(ang - 2.5) * 7); x.fill(); }
  // the heads-up
  x.textAlign = "left"; x.font = `700 14px ${css("--mono")}`; x.fillStyle = css("--text"); x.fillText(`${stageOf() + 1} · ${R.st.title}`, X0 + 4, 18);
  x.font = `12px ${css("--mono")}`; x.fillStyle = css("--dim"); x.fillText(`${kelvin(R.T)} · ${sci(R.rho)} g/cm³ · ${human(s.t)} into the stage · ${sci(energy(fl))} erg/g/s`, X0 + 4, 35);
  drawStrip($("strip"), L, S.v); panel(s, fl, X);
}

/* the selected nucleus: abundance across the life, and its makers and breakers now */
function panel(s, fl, X) {
  const i = IDX[S.sel], n = NUC[i], mk = [], br = [];
  RX.forEach((rx, j) => { if (!fl[j]) return; const d = rx.dY.find(([q]) => q === i)?.[1] ?? 0; if (d > 0) mk.push([rx, fl[j] * d]); else if (d < 0) br.push([rx, -fl[j] * d]); });
  const tot = (a) => a.reduce((t, e) => t + e[1], 0), list = (a) => { const T = tot(a); return a.filter((e) => e[1] / T >= 1e-4).sort((p, q) => q[1] - p[1]).slice(0, 6).map(([rx, f]) => `<div class="rx" title="${words(rx).replace(/"/g, "&quot;")}"><b>${eqn(rx)}</b><span>${(100 * f / T).toFixed(f / T < 0.01 ? 2 : 0)}%</span></div>`).join("") || `<div class="rx"><span>nothing now</span></div>`; };
  const life = Y => Y[i] > 0 ? Y[i] / (Y[i] + 1e-300) : 0, net = tot(mk) - tot(br), Y = s.Y[i];
  $("nname").innerHTML = `${label(n.k)} · ${n.name}`; $("nfacts").innerHTML = `${n.Z} protons, ${n.A - n.Z} neutrons · now <b>${X[i] >= 1e-3 ? `${(100 * X[i]).toPrecision(3)}%` : sci(X[i])}</b> of the core by mass${Y > 0 && Math.abs(net) > 0 ? ` · ${net > 0 ? "growing" : "shrinking"} on a ${human(Y / Math.abs(net))} timescale` : ""}`;
  $("makers").innerHTML = list(mk); $("breakers").innerHTML = list(br);
  sparkline(i);
}
function sparkline(i) {
  const c = $("spark"), r = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (c.width !== Math.round(w * r)) { c.width = Math.round(w * r); c.height = Math.round(h * r); }
  const x = c.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h); const sw = w / NS, lo = -9, Yp = (m) => h - 12 - ((h - 16) * (Math.max(lo, Math.log10(Math.max(m, 1e-12))) - lo)) / -lo;
  x.strokeStyle = css("--border"); for (const e of [0, -3, -6]) { x.beginPath(); x.moveTo(0, Yp(10 ** e)); x.lineTo(w, Yp(10 ** e)); x.stroke(); }
  x.font = `10px ${css("--mono")}`; x.fillStyle = css("--dim"); x.textAlign = "left"; x.fillText("100%", 2, Yp(1) + 10); x.fillText("0.1%", 2, Yp(1e-3) - 2); x.fillText("10⁻⁶", 2, Yp(1e-6) - 2);
  x.strokeStyle = colorZ(NUC[i].Z); x.lineWidth = 2; x.beginPath();
  for (let k = 0; k <= NS * 30; k++) { const v = Math.min(NS - 1e-4, k / 30), st = atLife(L, v), m = st.Y[i] * NUC[i].A, px = (v / NS) * w; k ? x.lineTo(px, Yp(m)) : x.moveTo(px, Yp(m)); } x.stroke();
  const px = (S.v / NS) * w; x.strokeStyle = "#fff"; x.lineWidth = 1; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h - 10); x.stroke();
  for (let k = 0; k < NS; k++) { x.fillStyle = css("--dim"); x.textAlign = "center"; x.fillText(["pp", "CNO", "He", "C", "Ne", "O", "Si"][k], k * sw + sw / 2, h - 1); }
}

function pick(e) { const c = $("chart"), b = c.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top; let best = null, bd = Infinity;
  for (const n of NUC) { const [px, py] = geo.P(n.A - n.Z, n.Z), d = Math.hypot(px - mx, py - my); if (d < bd) { bd = d; best = n.k; } } return bd < geo.cs ? best : null; }
const chart = $("chart");
chart.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") return; const k = pick(e); if (k !== S.hover) { S.hover = k; chart.style.cursor = k ? "pointer" : "default"; if (!S.playing) draw(); } });
chart.addEventListener("click", (e) => { const k = pick(e); if (k) { S.sel = k; draw(); } });
let drag = false; const strip = $("strip"), scrub = (e) => { const b = strip.getBoundingClientRect(); S.v = Math.min(NS - 1e-4, Math.max(0, ((e.clientX - b.left) / b.width) * NS)); draw(); };
strip.addEventListener("pointerdown", (e) => { drag = true; strip.setPointerCapture(e.pointerId); scrub(e); }); strip.addEventListener("pointermove", (e) => drag && scrub(e)); strip.addEventListener("pointerup", () => (drag = false));
$("play").addEventListener("click", () => { S.playing = !S.playing; $("play").textContent = S.playing ? "❚❚ pause" : "▶ play"; });
$("speed").addEventListener("input", () => { S.speed = 2 ** +$("speed").value; $("sval").textContent = `×${S.speed}`; });
$("arrows").addEventListener("input", () => { S.arrows = +$("arrows").value; $("aval").textContent = S.arrows; draw(); });
for (const [id, d] of [["back", -1], ["fwd", 1]]) $(id).addEventListener("click", () => { S.v = Math.max(0, Math.min(NS - 1e-4, Math.floor(S.v) + d)); draw(); });
$("widget").href = `../?v=${S.v.toFixed(3)}${encode(cfg)}`;
const mods = [...Object.entries(cfg.T).map(([k, v]) => `${k} at ${kelvin(v)}`), ...Object.entries(cfg.rho).map(([k, v]) => `${k} at ${sci(v)} g/cm³`), ...Object.entries(cfg.mult).filter(([, v]) => v !== 1).map(([k, v]) => `${KNOBS.find((x) => x.key === k)?.label} ×${v}`), ...(cfg.z !== 1 ? [`metals ×${cfg.z}`] : [])];
$("star").innerHTML = mods.length ? `Your star: ${mods.join(" · ")}. <a href="../${encode(cfg)}" style="color:var(--text)">Change it in the widget</a>.` : `The standard star. <a href="../" style="color:var(--text)">Change it in the widget</a>.`;
$("legend").innerHTML = stripLegend(L);
addEventListener("resize", draw);
let last = 0, lastDraw = 0;
function frame(now) { const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
  if (S.playing) { const i = stageOf(); if (S.v - i < 0.9999) S.v = Math.min(i + 0.9999, S.v + (dt * S.speed) / 30); else if (i < NS - 1) S.v = i + 1; else { S.playing = false; $("play").textContent = "▶ play"; }
    if (now - lastDraw > 120) { lastDraw = now; draw(); $("widget").href = `../?v=${S.v.toFixed(3)}${encode(cfg)}`; } }
  requestAnimationFrame(frame); }
draw(); requestAnimationFrame(frame);
