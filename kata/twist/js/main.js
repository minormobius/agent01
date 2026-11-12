/* TWIST's page: two yarns from the same module, d = 3 and d = 4, stepped together and drawn on 2D canvases. */
import { makeYarn } from "./yarn.js";
const $ = (id) => document.getElementById(id), END = 34000, per = (t) => (t < 1000 ? 2 : t < 4000 ? 10 : 80), FRAMES = 1000 / 2 + 3000 / 10 + (END - 4000) / 80; // (the first moments slowly: that is when the 4D yarn lets go)
const COL = ["#ffd27a", "#cfd6de", "#9fb4c8", "#cfd6de", "#9fb4c8", "#cfd6de", "#9fb4c8"];
let W = [], hist = [], spin = 0, last = performance.now();
window.TWIST = { get worlds() { return W; }, get hist() { return hist; } };
function start() { const turns = +$("turnsR").value, noise = $("jig").checked ? 2e-3 : 0; W = [3, 4].map((d) => ({ Y: makeYarn({ d, turns, noise }), m: null })); hist = []; for (const w of W) w.m = w.Y.measure(); }
const mix = (a, b, t) => { const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16)); return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`; };
function draw(w, cv) {
  const Y = w.Y, d = Y.d, dpr = Math.min(window.devicePixelRatio || 1, 2), cw = cv.clientWidth, ch = cv.clientHeight; if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
  const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, cw, ch);
  const top = Y.L * (1 + Y.strain), sideW = Math.min(cw * 0.42, 150), sc = (ch - 16) / top, c = Math.cos(spin), s = Math.sin(spin), beads = [];
  const tint = (f, z) => (d === 4 && Math.abs(z) > 0.01 ? mix(COL[f], z > 0 ? "#38f2e0" : "#ff66b8", Math.min(1, Math.abs(z) / 0.3)) : COL[f]);
  for (let f = 0; f < Y.F; f++) for (let i = 0; i < Y.n; i++) { const p = (f * Y.n + i) * d, X = Y.X[p], Yc = Y.X[p + 1], z = d === 4 ? Y.X[p + 2] : 0; beads.push({ sx: sideW / 2 + (X * c + Yc * s) * sc * 1.3, sy: ch - 8 - Y.X[p + d - 1] * sc, dep: -X * s + Yc * c, f, z }); }
  beads.sort((a, b) => a.dep - b.dep); const r = Math.max(2, Y.a * sc * 1.05);
  for (const b of beads) { x.globalAlpha = 0.55 + 0.45 * Math.min(1, Math.max(0, (b.dep + 0.4) / 0.8)); x.fillStyle = tint(b.f, b.z); x.beginPath(); x.arc(b.sx, b.sy, r, 0, 7); x.fill(); }
  x.globalAlpha = 1;
  /* the cross-section half way up: x across, y up; in 4D a fibre's z is its tint, and a ring whose size is |z| */
  const cx = sideW + (cw - sideW) / 2, cy = ch / 2, cs = Math.min(cw - sideW, ch) / 1.5, mid = Y.M >> 1;
  x.strokeStyle = "rgba(255,255,255,0.12)"; x.lineWidth = 1; x.beginPath(); x.moveTo(cx - cs * 0.6, cy); x.lineTo(cx + cs * 0.6, cy); x.moveTo(cx, cy - cs * 0.6); x.lineTo(cx, cy + cs * 0.6); x.stroke();
  x.fillStyle = "#9a958c"; x.font = "10px ui-monospace, Menlo, monospace"; x.textAlign = "center"; x.fillText("x", cx + cs * 0.6 + 8, cy + 3); x.fillText("y", cx, cy - cs * 0.6 - 5); x.fillText("cross-section, half way up", cx, ch - 4);
  for (let f = 0; f < Y.F; f++) { const p = (f * Y.n + mid) * d, z = d === 4 ? Y.X[p + 2] : 0, px = cx + Y.X[p] * cs, py = cy - Y.X[p + 1] * cs; x.fillStyle = tint(f, z); x.globalAlpha = 0.9; x.beginPath(); x.arc(px, py, Y.a * cs, 0, 7); x.fill(); x.globalAlpha = 1;
    if (d === 4 && Math.abs(z) > 0.02) { x.strokeStyle = z > 0 ? "#38f2e0" : "#ff66b8"; x.lineWidth = 1.5; x.beginPath(); x.arc(px, py, Y.a * cs + Math.abs(z) * cs * 0.5, 0, 7); x.stroke(); } }
}
function rows(el, w) { const m = w.m, f = (v, n = 2) => (Math.abs(v) < 5e-3 ? "0" : v.toFixed(n)), list = [["squeeze on the core", f(m.squeeze, 1), m.squeeze > 0.5 ? "big" : "nil"], ["turns still wound", f(m.wind)], ["elastic energy", f(m.energy)], ["tension in the core", f(m.tension, 1)]]; if (w.Y.d === 4) list.push(["furthest out of the plane", f(m.out)]);
  el.textContent = ""; for (const [k, v, cls] of list) { const a = document.createElement("i"), b = document.createElement("span"); a.textContent = k; b.textContent = v; if (cls) b.className = cls; el.append(a, b); } }
function plot() { const cv = $("plot"), dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const top = Math.max(1, ...hist.map((q) => Math.max(q[0], q[1]))), y0 = h - 18, X = (i) => 8 + (i / FRAMES) * (w - 16), Yv = (v) => y0 - (v / top) * (y0 - 16);
  x.strokeStyle = "rgba(255,255,255,0.15)"; x.beginPath(); x.moveTo(8, y0 + 0.5); x.lineTo(w - 8, y0 + 0.5); x.stroke();
  [["#ffd27a", 0, "3D"], ["#6fe0ff", 1, "4D"]].forEach(([colr, k, name]) => { x.strokeStyle = colr; x.lineWidth = 2; x.beginPath(); hist.forEach((q, i) => (i ? x.lineTo(X(i), Yv(q[k])) : x.moveTo(X(i), Yv(q[k])))); x.stroke(); if (hist.length) { x.fillStyle = colr; x.font = "600 11px ui-monospace, Menlo, monospace"; x.textAlign = "left"; x.fillText(name, Math.min(w - 26, X(hist.length - 1) + 5), Yv(hist[hist.length - 1][k]) + (k ? 12 : -4)); } });
  x.fillStyle = "#9a958c"; x.font = "10px ui-monospace, Menlo, monospace"; x.textAlign = "left"; x.fillText("squeeze on the core, as the yarn settles", 8, 12); x.textAlign = "right"; x.fillText("time →", w - 8, h - 5); }
function tick(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; spin += dt * 0.5;
  if (W[0].Y.t < END) { for (const w of W) { w.Y.step(per(w.Y.t)); w.m = w.Y.measure(); } hist.push([W[0].m.squeeze, W[1].m.squeeze]); rows($("r3"), W[0]); rows($("r4"), W[1]); plot(); }
  draw(W[0], $("c3")); draw(W[1], $("c4")); requestAnimationFrame(tick); }
$("turnsR").addEventListener("input", () => { $("turnsV").textContent = (+$("turnsR").value).toString(); start(); });
$("jig").addEventListener("change", start); $("goB").addEventListener("click", start); addEventListener("resize", plot);
start(); rows($("r3"), W[0]); rows($("r4"), W[1]); requestAnimationFrame(tick);
