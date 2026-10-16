/* Tessera — the page: draws the tiling, runs the morph, and checks the laws
   on every frame. The tiling itself is js/tiling.js. */
import { Tiling, morph, FIGURES, MODES, T_ } from "./tiling.js";

const $ = (id) => document.getElementById(id);
const cv = $("view"), ctx = cv.getContext("2d");
const CYCLE = 204;                       // seconds until both fields repeat: lcm(12, 17)
const MODE_LIST = Object.keys(MODES), FIG_LIST = Object.keys(FIGURES);
const FILL = ["#1f4f5c", "#5b3f2a", "#33395f", "#5a2c3d"];   // four colours: no two neighbours share one, even diagonally
const st = { mode: "breathe", fig: "fish", t: 0, play: true, graph: false, pin: -1, joins: 0, pinches: 0, prev: null, prevH: null, last: 0 };
let T, s = 40, ox = 0, oy = 0, dpr = 1, cw = 0, ch = 0;

function layout() {
  const r = cv.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cw = r.width; ch = r.height;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  const want = Math.max(34, Math.min(58, Math.min(cw, ch) / 8));
  const W = Math.max(4, 2 * Math.floor(cw / want / 2)), H = Math.max(4, 2 * Math.floor(ch / want / 2));
  if (!T || T.W !== W || T.H !== H) { T = new Tiling(W, H); st.prev = null; st.pin = -1; }
  s = Math.min(cw / W, ch / H); ox = (cw - W * s) / 2; oy = (ch - H * s) / 2;
  T.fig1 = FIGURES[st.fig];
}
// lattice → screen, with y up so that counter-clockwise stays counter-clockwise
const X = (u) => ox + u * s, Y = (v) => oy + (T.H - v) * s;

function wraps(i) {
  const [x, y] = T.xy(i), dx = [0], dy = [0];
  if (x === 0) dx.push(T.W); if (x === T.W - 1) dx.push(-T.W);
  if (y === 0) dy.push(T.H); if (y === T.H - 1) dy.push(-T.H);
  const out = [];
  for (const a of dx) for (const b of dy) out.push([a, b]);
  return out;
}
function path(pts, a, b) {
  ctx.beginPath();
  pts.forEach((p, k) => (k ? ctx.lineTo(X(p[0] + a), Y(p[1] + b)) : ctx.moveTo(X(p[0] + a), Y(p[1] + b))));
  ctx.closePath();
}
function centroid(pts) {
  let A = 0, cx = 0, cy = 0;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], q = pts[(k + 1) % pts.length], c = p[0] * q[1] - q[0] * p[1];
    A += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c;
  }
  return [cx / (3 * A), cy / (3 * A)];
}

function draw(bad) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#06070b"; ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, T.W * s, T.H * s); ctx.clip();
  const nbs = st.pin >= 0 ? new Set(T.neighbours(st.pin).map((n) => n.nb)) : null;
  const outs = [];
  for (let i = 0; i < T.N; i++) outs.push(T.outline(i, 10));
  // cells
  for (let i = 0; i < T.N; i++) {
    const [x, y] = T.xy(i);
    let f = FILL[(x & 1) + 2 * (y & 1)];
    if (i === st.pin) f = "#f2b84b"; else if (nbs && nbs.has(i)) f = "#8fe3d5";
    for (const [a, b] of wraps(i)) {
      path(outs[i], a, b);
      ctx.fillStyle = f; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = "#06070b"; ctx.stroke();
    }
  }
  // the short walls: teal while they hold a pair of cells together, amber while they shrink towards a pinch
  ctx.lineCap = "round";
  for (let k = 0; k < T.N; k++) {
    const h = T.h[k];
    if (Math.abs(h) < T_.EPS) continue;
    const [x, y] = T.xy(k), shrinking = st.prevH && Math.abs(h) < Math.abs(st.prevH[k]) && Math.abs(h) < 0.07;
    const P = T.port(x, y, "dn"), Q = T.port(x, y, "up");
    ctx.strokeStyle = shrinking ? "#f2b84b" : "rgba(95,214,196,0.85)"; ctx.lineWidth = shrinking ? 3.2 : 2.2;
    for (const a of [0, x === 0 ? T.W : 0]) for (const b of [0, y === 0 ? T.H : 0]) {
      ctx.beginPath(); ctx.moveTo(X(P[0] + a), Y(P[1] + b)); ctx.lineTo(X(Q[0] + a), Y(Q[1] + b)); ctx.stroke();
    }
  }
  // a cell whose walls cross is no longer a cell
  for (const i of bad) for (const [a, b] of wraps(i)) { path(outs[i], a, b); ctx.lineWidth = 2.6; ctx.strokeStyle = "#ff5d62"; ctx.stroke(); }
  // the graph the game runs on: centre to centre, for every pair that shares a wall
  if (st.graph) {
    const cen = outs.map(centroid);
    ctx.strokeStyle = "rgba(236,239,247,0.55)"; ctx.lineWidth = 1.2; ctx.fillStyle = "#eceff7";
    for (let i = 0; i < T.N; i++) {
      const [x, y] = T.xy(i), c = cen[i];
      for (const n of T.neighbours(i)) {
        const [nx, ny] = T.xy(n.nb), d = cen[n.nb];
        const ex = d[0] - nx + x + n.dx, ey = d[1] - ny + y + n.dy;   // the neighbour's centre, carried across the wrap
        for (const [a, b] of wraps(i)) { ctx.beginPath(); ctx.moveTo(X(c[0] + a), Y(c[1] + b)); ctx.lineTo(X((c[0] + ex) / 2 + a), Y((c[1] + ey) / 2 + b)); ctx.stroke(); }
      }
      for (const [a, b] of wraps(i)) { ctx.beginPath(); ctx.arc(X(c[0] + a), Y(c[1] + b), 2, 0, 7); ctx.fill(); }
    }
  }
  ctx.restore();
}

/* ---- the laws, checked */
const row = (mark, k, v) => `<span class="m ${mark}">${mark === "ok" ? "✓" : mark === "no" ? "✗" : "~"}</span><span class="k">${k}</span><span class="v">${v}</span>`;
function laws(c, bad) {
  const flat = c.amax - c.amin < 1e-9, sum = c.fbar && 1 / c.fbar + 1 / c.vbar;
  $("laws").innerHTML = [
    row("ok", "cells", `${T.N}, always: cell i is lattice point i`),
    row(c.chi === 0 ? "ok" : "no", "Euler", `V − E + F = ${c.V} − ${c.E} + ${c.F} = ${c.chi}`),
    row(Math.abs(sum - 0.5) < 1e-12 ? "ok" : "no", "1/f̄ + 1/v̄", `1/${c.fbar.toFixed(2)} + 1/${c.vbar.toFixed(2)} = ${sum.toFixed(4)}  (neighbours, corners)`),
    row(Math.abs(c.atot - T.N) < 1e-9 ? (flat ? "ok" : "so") : "no", "area", `total ${c.atot.toFixed(3)}; each cell ${flat ? "1.000" : c.amin.toFixed(3) + " – " + c.amax.toFixed(3)}`),
    row(bad.length ? "no" : "ok", "walls clear", bad.length ? `${bad.length} cell${bad.length > 1 ? "s" : ""} tangled` : "no wall crosses another"),
    row("so", "T1", `${st.joins} joins · ${st.pinches} pinches  (a pinch would cut a snake)`),
  ].join("");
}
function say(c) {
  let t = MODES[st.mode] + ". " + FIGURES[st.fig].note + ".";
  if (st.pin >= 0) {
    const [x, y] = T.xy(st.pin), n = T.neighbours(st.pin).length;
    t = `cell (${x}, ${y}) touches ${n} cells right now. ` + t;
  } else if (c.amax - c.amin > 1e-9 && st.mode === "ripple" && st.fig !== "bulge") {
    t += " The total is still exact: whatever one cell gains, a neighbour loses.";
  }
  $("say").textContent = t;
}

/* ---- the clock */
function step(now) {
  const dt = Math.min(0.1, (now - (st.last || now)) / 1000); st.last = now;
  if (st.play) { st.t = (st.t + dt) % CYCLE; $("scrub").value = Math.round(st.t * 10); }
  frame();
  requestAnimationFrame(step);
}
function frame() {
  st.prevH = Float64Array.from(T.h);
  morph(T, st.mode, st.t);
  const cur = T.states();
  if (st.prev) for (let k = 0; k < T.N; k++) if (cur[k] !== st.prev[k]) { if (st.prev[k]) st.pinches++; if (cur[k]) st.joins++; }
  st.prev = cur;
  const bad = [];
  for (let i = 0; i < T.N; i++) if (!T.simple(i)) bad.push(i);
  const c = T.census();
  draw(bad); laws(c, bad); say(c);
}

/* ---- input */
function cellAt(px, py) {
  const u = (px - ox) / s, v = T.H - (py - oy) / s;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = Math.floor(u) + dx, y = Math.floor(v) + dy, i = T.idx(x, y), [cx, cy] = T.xy(i);
    const pu = u - x + cx, pv = v - y + cy, pts = T.outline(i, 10);
    let inside = false;
    for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) {
      const a = pts[k], b = pts[j];
      if ((a[1] > pv) !== (b[1] > pv) && pu < ((b[0] - a[0]) * (pv - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    if (inside) return i;
  }
  return -1;
}
cv.addEventListener("pointerdown", (e) => {
  const r = cv.getBoundingClientRect(), i = cellAt(e.clientX - r.left, e.clientY - r.top);
  st.pin = i === st.pin ? -1 : i;
});
const reset = () => { st.joins = 0; st.pinches = 0; st.prev = null; };
$("play").onclick = () => { st.play = !st.play; $("play").textContent = st.play ? "❚❚" : "▶"; };
$("mode").onclick = () => { st.mode = MODE_LIST[(MODE_LIST.indexOf(st.mode) + 1) % MODE_LIST.length]; $("mode").textContent = st.mode; reset(); };
$("fig").onclick = () => { st.fig = FIG_LIST[(FIG_LIST.indexOf(st.fig) + 1) % FIG_LIST.length]; $("fig").textContent = st.fig; T.fig1 = FIGURES[st.fig]; };
$("graph").onclick = () => { st.graph = !st.graph; $("graph").classList.toggle("on", st.graph); };
$("scrub").oninput = (e) => { st.t = +e.target.value / 10; };
$("help").onclick = () => { $("start").hidden = false; };
$("go").onclick = () => { $("start").hidden = true; };
window.addEventListener("keydown", (e) => { if (e.key === " ") { e.preventDefault(); $("play").click(); } });
window.addEventListener("resize", layout);

layout();
requestAnimationFrame(step);
window.TESSERA = { get T() { return T; }, st, frame };
