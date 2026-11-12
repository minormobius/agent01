/* The chart of nuclei, interactive: every nucleus of the network at (neutrons, protons) through a star's whole life.
   Zoom (wheel, pinch, buttons) and pan (drag); zoomed in, each nucleus is a classic chart box: symbol and mass number,
   its share of the core now, stable or its half-life. Scrub or play the life on the strip; tap a nucleus for what makes
   it and what destroys it now, at what rates, and its abundance across every stage. The star is the widget's (its
   settings ride in the address). Draws only; the network is life.js. */
import { STAGES, NUC, IDX, RX, fluxes, toX, energy, symOf, decayOf, rhoText, SHORT, WORLD, STRENGTH, STRENGTHS } from "./world.js";
import { runLife, atLife, decode, encode, KNOBS } from "./life.js";
import { label, human, sci, kelvin, eqn, words } from "./text.js";
import { drawStrip, stripLegend, colorZ } from "./strip.js";

const $ = (id) => document.getElementById(id);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const cfg = decode(location.hash), L = runLife(cfg), NS = STAGES.length, D4 = WORLD === "4d"; // the address carries the world (world.js)
const S = { v: +(new URLSearchParams(location.search).get("v") ?? 0) || 0, playing: false, speed: 1, sel: D4 ? "4-8" : "c12", hover: null, arrows: 16 };
const stageOf = () => Math.min(NS - 1, Math.floor(S.v));
const NE = Math.max(...NUC.map((n) => n.A - n.Z)) + 1, ZE = Math.max(...NUC.map((n) => n.Z)) + 1;
/* half-lives and decay modes are the world's (world.js decayOf: ours from the standard tables, 4D from the network) */

/* the view: centre (in chart cells) and zoom over the whole-chart fit */
const V = { cx: (NE + 1) / 2, cy: (ZE + 1) / 2, z: 1, follow: true };
/* following: the view fills the pinned strip's width and centres on where the core's matter is (weighted by the square root of
   the mass, so trace nuclei pull a little), easing there as the life plays; panning or zooming by hand turns it off */
function followTarget() { const c = $("chart"), w = c.clientWidth, h = c.clientHeight, cs0 = Math.min((w - 36) / (NE + 1), (h - 26) / (ZE + 1)), zw = Math.max(1, Math.min(4, (ZE + 1) / 11, (w - 36) / (12 * cs0)));
  const X = toX(atLife(L, S.v).Y); let sn = 0, sz = 0, sw = 0; X.forEach((m, i) => { if (m < 1e-6) return; const wt = Math.sqrt(m); sn += wt * (NUC[i].A - NUC[i].Z + 0.5); sz += wt * (NUC[i].Z + 0.5); sw += wt; });
  return { z: zw, cx: sw ? sn / sw : V.cx, cy: sw ? sz / sw : V.cy }; }
function follow(snap) { if (!V.follow) return; const t = followTarget(), k = snap ? 1 : 0.15; V.z += (t.z - V.z) * k; V.cx += (t.cx - V.cx) * k; V.cy += (t.cy - V.cy) * k; clampView(); }
let geo = null;
function layout(w, h) { const cs0 = Math.min((w - 36) / (NE + 1), (h - 26) / (ZE + 1)), cs = cs0 * V.z, ox = 30 + (w - 36) / 2, oy = (h - 22) / 2;
  const P = (n, z) => [ox + (n + 0.5 - V.cx) * cs, oy - (z + 0.5 - V.cy) * cs], inv = (px, py) => [V.cx + (px - ox) / cs - 0.5, V.cy - (py - oy) / cs - 0.5];
  return { cs, cs0, P, inv, ox, oy }; }

function draw() {
  const c = $("chart"), r = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (c.width !== Math.round(w * r) || c.height !== Math.round(h * r)) { c.width = Math.round(w * r); c.height = Math.round(h * r); }
  const x = c.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.fillStyle = "#0b0d13"; x.fillRect(0, 0, w, h);
  geo = layout(w, h); const { cs, P } = geo; $("zfollow").classList.toggle("on", V.follow);
  const s = atLife(L, S.v), R = L[stageOf()], fl = fluxes(s.Y, R.k), X = toX(s.Y);
  x.save(); x.beginPath(); x.rect(26, 0, w - 26, h - 18); x.clip();
  // N = Z, where helium-4's multiples sit
  x.strokeStyle = "rgba(255,255,255,0.07)"; x.lineWidth = 1; x.beginPath(); const [a0, b0] = P(-0.5, -0.5), [a1, b1] = P(ZE, ZE); x.moveTo(a0, b0); x.lineTo(a1, b1); x.stroke();
  for (let i = 0; i < NUC.length; i++) {
    const n = NUC[i], [px, py] = P(n.A - n.Z, n.Z); if (px < -cs || px > w + cs || py < -cs || py > h + cs) continue;
    const a = X[i] > 0 ? Math.max(0, Math.min(1, (Math.log10(X[i]) + 9) / 9)) : 0, sel = n.k === S.sel, x0 = px - cs / 2 + 1, y0 = py - cs / 2 + 1, bw = cs - 2;
    x.fillStyle = `rgba(111,224,255,${0.05 + 0.85 * a})`; x.fillRect(x0, y0, bw, bw);
    const dk = decayOf(n.k), t = dk?.half, dark = a > 0.55;
    if (t) { x.fillStyle = "#ff8b5e"; x.beginPath(); x.moveTo(x0 + bw, y0); x.lineTo(x0 + bw, y0 + Math.min(14, bw * 0.3)); x.lineTo(x0 + bw - Math.min(14, bw * 0.3), y0); x.fill(); }
    x.strokeStyle = sel ? css("--d3") : n.k === S.hover ? "#fff" : t ? "rgba(255,139,94,0.6)" : "rgba(233,228,218,0.55)"; x.lineWidth = sel ? 3 : t ? 1 : 1.5; x.strokeRect(x0, y0, bw, bw);
    x.fillStyle = dark ? "#07080c" : css("--text"); x.textAlign = "center";
    if (cs >= 64) { // the classic box
      const sym = symOf(n.Z), f = Math.min(26, cs / 3.4); x.textAlign = "left"; x.font = `700 ${f}px ${css("--sans")}`; const sx = x0 + bw * 0.16, sy = y0 + bw * 0.42;
      x.font = `600 ${f * 0.55}px ${css("--sans")}`; x.fillText(n.A, sx, sy - f * 0.45); const aw = x.measureText(String(n.A)).width; x.font = `700 ${f}px ${css("--sans")}`; x.fillText(n.Z === 1 ? "H" : sym, sx + aw + 1, sy);
      x.font = `${f * 0.48}px ${css("--mono")}`; x.textAlign = "center";
      x.fillText(X[i] >= 1e-3 ? `${(100 * X[i]).toPrecision(X[i] >= 0.1 ? 3 : 2)}%` : X[i] > 1e-30 ? sci(X[i], 0) : "—", px, y0 + bw * 0.66);
      x.fillStyle = t ? (dark ? "#7a2a10" : "#ff8b5e") : dark ? "#07080c" : css("--dim"); x.fillText(t ? `${dk.mode} ${halfText(t)}` : "stable", px, y0 + bw * 0.86);
    } else if (cs > 16) { x.font = `${Math.min(12, cs / 2.6)}px ${css("--mono")}`; x.fillText(label(n.k), px, py + 4); }
  }
  // net flows (heaviest reactant to heaviest product): the strongest, and every one touching the selected nucleus
  const net = new Map(); RX.forEach((rx, i) => { if (!fl[i]) return; const hv = (xs) => xs.slice().sort((a, b) => NUC[IDX[b]].A - NUC[IDX[a]].A || NUC[IDX[b]].Z - NUC[IDX[a]].Z)[0], a = hv(rx.r), b = hv(rx.p); if (a === b) return; const key = a < b ? `${a}|${b}` : `${b}|${a}`; net.set(key, (net.get(key) ?? 0) + (a < b ? 1 : -1) * fl[i]); });
  const all = [...net.entries()].map(([k, v]) => { const [a, b] = k.split("|"); return v >= 0 ? [a, b, v] : [b, a, -v]; }).sort((p, q) => q[2] - p[2]), top = all[0]?.[2] ?? 1;
  const show = new Set(all.slice(0, S.arrows)); for (const e of all) if (e[0] === S.sel || e[1] === S.sel) show.add(e);
  const sk = Math.min(2.2, Math.max(0.6, cs / 22));
  for (const [a, b, v] of show) { const na = NUC[IDX[a]], nb = NUC[IDX[b]], [x1, y1] = P(na.A - na.Z, na.Z), [x2, y2] = P(nb.A - nb.Z, nb.Z), touch = a === S.sel || b === S.sel, wd = (1 + 4 * Math.max(0, 1 + Math.log10(v / top) / 8)) * sk, ang = Math.atan2(y2 - y1, x2 - x1);
    x.strokeStyle = x.fillStyle = touch ? css("--d3") : "rgba(255,180,107,0.55)"; x.lineWidth = touch ? Math.max(2 * sk, wd) : wd; const sx = x1 + Math.cos(ang) * cs * 0.3, sy = y1 + Math.sin(ang) * cs * 0.3, ex = x2 - Math.cos(ang) * cs * 0.38, ey = y2 - Math.sin(ang) * cs * 0.38, hd = 7 * sk;
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(ex, ey); x.stroke(); x.beginPath(); x.moveTo(ex + Math.cos(ang) * hd, ey + Math.sin(ang) * hd); x.lineTo(ex + Math.cos(ang + 2.5) * hd, ey + Math.sin(ang + 2.5) * hd); x.lineTo(ex + Math.cos(ang - 2.5) * hd, ey + Math.sin(ang - 2.5) * hd); x.fill(); }
  x.restore();
  // the rows' elements down the left, the neutron numbers along the bottom
  x.font = `11px ${css("--mono")}`; x.fillStyle = css("--dim"); x.textAlign = "right"; const zstep = cs > 13 ? 1 : cs > 6 ? 2 : 5;
  for (let z = 0; z <= ZE; z += zstep) { const py = P(0, z)[1]; if (py > 8 && py < h - 20) x.fillText(cs > 13 ? (z ? symOf(z) : "") : z, 24, py + 4); }
  x.textAlign = "center"; const nstep = cs > 30 ? 1 : cs > 13 ? 2 : 5; for (let n = 0; n <= NE; n += nstep) { const px = P(n, 0)[0]; if (px > 30 && px < w - 6) x.fillText(n, px, h - 5); }
  // the heads-up
  x.fillStyle = "rgba(11,13,19,0.75)"; x.fillRect(30, 2, Math.min(w - 36, 620), 38); x.textAlign = "left"; x.font = `700 13px ${css("--mono")}`; x.fillStyle = css("--text"); x.fillText(`${stageOf() + 1} · ${R.st.title}`, 36, 17);
  x.font = `11px ${css("--mono")}`; x.fillStyle = css("--dim"); x.fillText(`${kelvin(R.T)} · ${rhoText(R.rho)} · ${human(s.t)} in · ${sci(energy(fl))} erg/g/s`, 36, 33);
  drawStrip($("strip"), L, S.v); panel(s, fl, X);
}
function halfText(t) { return t < 120 ? `${+t.toPrecision(3)} s` : t < 7200 ? `${+(t / 60).toPrecision(3)} min` : t < 2 * 86400 ? `${+(t / 3600).toPrecision(3)} h` : t < 3e7 ? `${+(t / 86400).toPrecision(3)} d` : `${+(t / 3.156e7).toPrecision(3)} yr`; }

/* the selected nucleus: abundance across the life, and its makers and breakers now */
function panel(s, fl, X) {
  const i = IDX[S.sel], n = NUC[i], mk = [], br = [];
  RX.forEach((rx, j) => { if (!fl[j]) return; const d = rx.dY.find(([q]) => q === i)?.[1] ?? 0; if (d > 0) mk.push([rx, fl[j] * d]); else if (d < 0) br.push([rx, -fl[j] * d]); });
  const tot = (a) => a.reduce((t, e) => t + e[1], 0), list = (a) => { const T = tot(a); return a.filter((e) => e[1] / T >= 1e-4).sort((p, q) => q[1] - p[1]).slice(0, 6).map(([rx, f]) => `<div class="rx"><div><b>${eqn(rx)}</b><span>${words(rx)}</span></div><em>${(100 * f / T).toFixed(f / T < 0.01 ? 2 : 0)}%</em></div>`).join("") || `<div class="rx"><div><span>nothing now</span></div></div>`; };
  const net = tot(mk) - tot(br), Y = s.Y[i], dk = decayOf(n.k), t = dk?.half;
  $("nname").innerHTML = `${label(n.k)} · ${n.name}`;
  $("nfacts").innerHTML = `${n.Z} protons, ${n.A - n.Z} neutrons · ${t ? `unstable: ${dk.mode === "β⁻" ? "electron decay" : dk.mode === "EC" ? "electron capture" : "positron decay or electron capture"}, half-life ${halfText(t)}` : "stable"} · now <b>${X[i] >= 1e-3 ? `${(100 * X[i]).toPrecision(3)}%` : sci(X[i])}</b> of the core by mass${Y > 0 && Math.abs(net) > 0 ? ` · ${net > 0 ? "growing" : "shrinking"} on a ${human(Y / Math.abs(net))} timescale` : ""}`;
  $("makers").innerHTML = list(mk); $("breakers").innerHTML = list(br); sparkline(i);
}
function sparkline(i) {
  const c = $("spark"), r = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (c.width !== Math.round(w * r)) { c.width = Math.round(w * r); c.height = Math.round(h * r); }
  const x = c.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h); const sw = w / NS, lo = -9, Yp = (m) => h - 14 - ((h - 18) * (Math.max(lo, Math.log10(Math.max(m, 1e-12))) - lo)) / -lo;
  x.strokeStyle = css("--border"); x.font = `10px ${css("--mono")}`; x.fillStyle = css("--dim"); x.textAlign = "right";
  for (const [e, t] of [[0, "100%"], [-3, "0.1%"], [-6, "10⁻⁶"], [-9, "10⁻⁹"]]) { x.beginPath(); x.moveTo(34, Yp(10 ** e)); x.lineTo(w, Yp(10 ** e)); x.stroke(); x.fillText(t, 30, Yp(10 ** e) + 3); }
  x.strokeStyle = colorZ(NUC[i].Z); x.lineWidth = 2; x.beginPath(); const X0 = 36, ww = w - X0;
  for (let k = 0; k <= NS * 30; k++) { const v = Math.min(NS - 1e-4, k / 30), m = atLife(L, v).Y[i] * NUC[i].A, px = X0 + (v / NS) * ww; k ? x.lineTo(px, Yp(m)) : x.moveTo(px, Yp(m)); } x.stroke();
  const px = X0 + (S.v / NS) * ww; x.strokeStyle = "#fff"; x.lineWidth = 1; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h - 12); x.stroke();
  x.textAlign = "center"; x.fillStyle = css("--dim"); for (let k = 0; k < NS; k++) x.fillText(SHORT[k], X0 + (k + 0.5) * (ww / NS), h - 1);
}

/* ---------- zoom, pan, pick ---------- */
const chart = $("chart"), ptr = new Map(); let pinch = null, moved = 0, downAt = null;
function zoomAt(f, px, py, keep = false) { if (!keep) V.follow = false; const g = layout(chart.clientWidth, chart.clientHeight), [cx, cy] = g.inv(px, py); V.z = Math.min(12, Math.max(1, V.z * f)); const g2 = layout(chart.clientWidth, chart.clientHeight), [cx2, cy2] = g2.inv(px, py); V.cx += cx - cx2; V.cy += cy - cy2; clampView(); draw(); }
function clampView() { V.cx = Math.min(NE + 1, Math.max(0, V.cx)); V.cy = Math.min(ZE + 1, Math.max(0, V.cy)); if (V.z <= 1.0001) { V.cx = (NE + 1) / 2; V.cy = (ZE + 1) / 2; } }
function pick(px, py) { let best = null, bd = Infinity; for (const n of NUC) { const [x, y] = geo.P(n.A - n.Z, n.Z), d = Math.max(Math.abs(x - px), Math.abs(y - py)); if (d < bd) { bd = d; best = n.k; } } return bd < geo.cs / 2 ? best : null; }
const local = (e) => { const b = chart.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
chart.addEventListener("wheel", (e) => { e.preventDefault(); const [px, py] = local(e); zoomAt(Math.exp(-e.deltaY * 0.0015), px, py); }, { passive: false });
chart.addEventListener("pointerdown", (e) => { chart.setPointerCapture(e.pointerId); ptr.set(e.pointerId, local(e)); moved = 0; downAt = local(e);
  if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: V.z }; } });
chart.addEventListener("pointermove", (e) => {
  const p = local(e);
  if (!ptr.has(e.pointerId)) { if (e.pointerType === "mouse") { const k = pick(...p); if (k !== S.hover) { S.hover = k; chart.style.cursor = k ? "pointer" : "grab"; draw(); } } return; }
  const prev = ptr.get(e.pointerId); ptr.set(e.pointerId, p);
  if (ptr.size === 2 && pinch) { const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; zoomAt((pinch.z * d) / pinch.d / V.z, ...mid); moved += 10; return; }
  const dx = p[0] - prev[0], dy = p[1] - prev[1]; moved += Math.abs(dx) + Math.abs(dy); if (moved > 6 && V.z > 1) { V.follow = false; V.cx -= dx / geo.cs; V.cy += dy / geo.cs; clampView(); draw(); } });
const up = (e) => { ptr.delete(e.pointerId); if (ptr.size < 2) pinch = null; if (moved < 6 && downAt && ptr.size === 0) { const k = pick(...downAt); if (k) { S.sel = k; draw(); } } downAt = null; };
chart.addEventListener("pointerup", up); chart.addEventListener("pointercancel", up);
chart.addEventListener("dblclick", (e) => { const [px, py] = local(e); zoomAt(2, px, py); });
$("zin").addEventListener("click", () => zoomAt(1.6, chart.clientWidth / 2, chart.clientHeight / 2));
$("zout").addEventListener("click", () => zoomAt(1 / 1.6, chart.clientWidth / 2, chart.clientHeight / 2));
$("zfit").addEventListener("click", () => { V.follow = false; V.z = 1; clampView(); draw(); });
$("zfollow").addEventListener("click", () => { V.follow = true; follow(true); draw(); });
$("zsel").addEventListener("click", () => { const n = NUC[IDX[S.sel]]; V.follow = false; V.z = 6; V.cx = n.A - n.Z + 0.5; V.cy = n.Z + 0.5; clampView(); draw(); });

/* ---------- the life ---------- */
let drag = false; const strip = $("strip"), scrub = (e) => { const b = strip.getBoundingClientRect(); S.v = Math.min(NS - 1e-4, Math.max(0, ((e.clientX - b.left) / b.width) * NS)); follow(true); draw(); };
strip.addEventListener("pointerdown", (e) => { drag = true; strip.setPointerCapture(e.pointerId); scrub(e); }); strip.addEventListener("pointermove", (e) => drag && scrub(e)); strip.addEventListener("pointerup", () => (drag = false));
$("play").addEventListener("click", () => { S.playing = !S.playing; $("play").textContent = S.playing ? "❚❚" : "▶"; });
$("speed").addEventListener("input", () => { S.speed = 2 ** +$("speed").value; $("sval").textContent = `×${S.speed}`; });
$("arrows").addEventListener("input", () => { S.arrows = +$("arrows").value; $("aval").textContent = S.arrows; draw(); });
for (const [id, d] of [["back", -1], ["fwd", 1]]) $(id).addEventListener("click", () => { S.v = Math.max(0, Math.min(NS - 1e-4, Math.floor(S.v) + d)); follow(true); draw(); });
const mods = [...Object.entries(cfg.T).map(([k, v]) => `${k} at ${kelvin(v)}`), ...Object.entries(cfg.rho).map(([k, v]) => `${k} at ${rhoText(v)}`), ...Object.entries(cfg.mult).filter(([, v]) => v !== 1).map(([k, v]) => `${KNOBS.find((x) => x.key === k)?.label} ×${v}`), ...(cfg.z !== 1 ? [`metals ×${cfg.z}`] : [])];
$("star").innerHTML = mods.length ? `Your star: ${mods.join(" · ")}. <a href="../${encode(cfg)}" style="color:var(--text)">Change it in the widget</a>.` : `The standard star. <a href="../" style="color:var(--text)">Change it in the widget</a>.`;
$("legend").innerHTML = stripLegend(L);
// the world: ours, or 4D at a strength; switching reloads with that world's standard star
$("world").value = WORLD; $("str").innerHTML = STRENGTHS.map((v) => `<option value="${v}">s = ${v}${v === 1.5152 ? " (the deuteron as ours)" : ""}</option>`).join(""); $("str").value = STRENGTH ?? 1.5152; $("str").hidden = !D4;
const go = () => { location.hash = $("world").value === "4d" ? encodeURIComponent(JSON.stringify({ w: "4d", s: +$("str").value })) : ""; location.reload(); };
$("world").addEventListener("change", go); $("str").addEventListener("change", go);
if (D4) { document.title = "Four · the chart of 4D nuclei"; $("title").textContent = "THE CHART OF 4D NUCLEI"; }
addEventListener("resize", () => { follow(true); draw(); });
let last = 0, lastDraw = 0;
function frame(now) { const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
  if (S.playing) { const i = stageOf(); if (S.v - i < 0.9999) S.v = Math.min(i + 0.9999, S.v + (dt * S.speed) / 30); else if (i < NS - 1) S.v = i + 1; else { S.playing = false; $("play").textContent = "▶"; }
    if (now - lastDraw > 120) { lastDraw = now; follow(false); draw(); $("widget").href = `../?v=${S.v.toFixed(3)}${encode(cfg)}`; } }
  requestAnimationFrame(frame); }
$("widget").href = `../?v=${S.v.toFixed(3)}${encode(cfg)}`;
follow(true); draw(); requestAnimationFrame(frame);
