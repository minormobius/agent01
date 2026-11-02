/* Drift golf: the course and the strokes are ../atom/js/drift.js (no DOM; the selftest checks its physics and that every
   hole can be played in par); this file draws and takes the aim. */
import { HOLES, GAMMA, PUSH_T, EMAX, CUP_R, OFF, fieldOf, stroke, step } from "../atom/js/drift.js";

const $ = (id) => document.getElementById(id);
const COL = { ".": "#1a1d26", r: "#1d3a2c", s: "#2f5a3e", R: "#3a2c1d", h: "#1d2f4a", t: "#3a1d3f", l: "#1d4040", "#": "#3a3d48" };
const TIP = { ".": "no field: goes where it's pushed", r: "rough: two planes, the green's stiff (x–y 3, z–w 1.5)", s: "soft rough: two planes, the green's weak (x–y 1, z–w 2.5)", R: "back rough: turns the other way (x–y −3)", h: "highway: one plane, z–w; the green is its free sheet", t: "slant: planes x–z and y–w, half in the green, half out", l: "left: x–y and z–w at the same rate", "#": "wall" };
let hi = 0, strokes = 0, ball = null, rest = null, anim = null, aim = null, done = false, msg = "";
const scores = load();
function load() { try { return JSON.parse(localStorage.getItem("four-drift-golf") || "{}"); } catch { return {}; } }
function save() { try { localStorage.setItem("four-drift-golf", JSON.stringify(scores)); } catch { /* private window: fine */ } }

function start(i) {
  hi = (i + HOLES.length) % HOLES.length; const h = HOLES[hi];
  strokes = 0; ball = [...h.tee, 0, 0]; rest = ball.slice(); anim = null; aim = null; done = false; msg = "";
  $("hName").textContent = `${hi + 1} · ${h.name}`; $("hPar").textContent = h.par; $("note").textContent = h.note;
  const kinds = [...new Set(h.rows.join(""))]; $("legend").innerHTML = kinds.map((k) => `<span><i style="background:${COL[k]}"></i>${TIP[k]}</span>`).join("");
  holes(); status(); draw();
}
function holes() {
  $("holes").innerHTML = HOLES.map((h, i) => `<button type="button" data-h="${i}" class="${i === hi ? "on" : ""}">${i + 1} ${h.name}<small>${scores[i] != null ? `${scores[i]} (par ${h.par})` : `par ${h.par}`}</small></button>`).join("");
  const done = HOLES.map((_, i) => scores[i]).filter((x) => x != null);
  $("hTotal").textContent = done.length ? `${done.reduce((a, b) => a + b, 0)} over ${done.length} (par ${HOLES.filter((_, i) => scores[i] != null).reduce((a, h) => a + h.par, 0)})` : "–";
}
function status() {
  $("hStrokes").textContent = strokes; $("msg").textContent = msg; $("msg").style.color = done ? "#7dffb0" : msg.startsWith("Lost") ? "#ff8fa3" : "var(--text)";
  for (const [id, k] of [["gz", 2], ["gw", 3]]) { const bar = $(id), H = bar.clientHeight, y = (v) => H / 2 - (v / OFF) * (H / 2) * 0.96;
    bar.querySelector(".cup").style.top = `${y(CUP_R)}px`; bar.querySelector(".cup").style.height = `${y(-CUP_R) - y(CUP_R)}px`;
    const v = (anim ? anim.cur : ball)[k]; bar.querySelector(".dot").style.top = `${Math.max(0, Math.min(H, y(v)))}px`; }
}

/* the course on the canvas: tile size from the width */
let geo = null;
function layout() {
  const cv = $("course"), h = HOLES[hi], W = h.rows[0].length, H = h.rows.length, w = cv.clientWidth, s = Math.min(w / W, 420 / H);
  cv.style.height = `${s * H}px`; const dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(w * dpr); cv.height = Math.round(s * H * dpr);
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  geo = { g, s, W, H, ox: (w - s * W) / 2, X: (x) => (w - s * W) / 2 + x * s, Y: (y) => (H - y) * s };
}
function arrow(g, x0, y0, x1, y1, col, wdt = 2, dash = []) {
  const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0); if (L < 2) return;
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = wdt; g.setLineDash(dash); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - 9 * Math.cos(a - 0.45), y1 - 9 * Math.sin(a - 0.45)); g.lineTo(x1 - 9 * Math.cos(a + 0.45), y1 - 9 * Math.sin(a + 0.45)); g.fill(); g.lineWidth = 1;
}
const wCol = (w) => { const t = Math.max(-1, Math.min(1, w / OFF)); return t >= 0 ? `rgb(${Math.round(233 - 34 * t)},${Math.round(228 - 73 * t)},${Math.round(218 + 37 * t)})` : `rgb(${Math.round(233 + 22 * -t)},${Math.round(228 - 85 * -t)},${Math.round(218 - 55 * -t)})`; };
function draw() {
  layout(); const { g, s, W, H, X, Y } = geo, h = HOLES[hi];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = h.rows[j][i]; g.fillStyle = COL[k]; g.fillRect(X(i) + 1, Y(H - j) + 1, s - 2, s - 2);
    if (k !== "." && k !== "#") { g.fillStyle = "rgba(255,255,255,0.13)"; g.font = `${Math.round(s * 0.28)}px ui-monospace, monospace`; g.fillText(k, X(i) + s * 0.08, Y(H - j) + s * 0.32); } }
  // the cup and the tee
  g.strokeStyle = "#7dffb0"; g.lineWidth = 2; g.beginPath(); g.arc(X(h.cup[0]), Y(h.cup[1]), CUP_R * s, 0, 2 * Math.PI); g.stroke(); g.fillStyle = "rgba(125,255,176,0.15)"; g.fill(); g.lineWidth = 1;
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(X(h.tee[0]) - 3, Y(h.tee[1]) - 3, 6, 6);
  // the stroke in flight, or the aim
  const pos = anim ? anim.cur : ball;
  if (anim) { g.strokeStyle = "rgba(233,228,218,0.45)"; g.beginPath(); for (let k = 0; k <= anim.i; k++) { const p = anim.path[k]; k ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])); } g.stroke(); }
  if (aim && !anim) {
    const bx = X(pos[0]), by = Y(pos[1]), L = Math.min(1, aim.len) * s * 2.2;
    arrow(g, bx, by, bx + L * Math.cos(aim.th), by - L * Math.sin(aim.th), "rgba(255,255,255,0.85)", 2);
    if (aim.pred) { g.strokeStyle = "#6fe0ff"; g.setLineDash([5, 4]); g.lineWidth = 2; g.beginPath(); aim.pred.forEach((p, k) => (k ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke(); g.setLineDash([]); g.lineWidth = 1;
      const e = aim.pred.at(-1); g.fillStyle = "#6fe0ff"; g.beginPath(); g.arc(X(e[0]), Y(e[1]), 4, 0, 2 * Math.PI); g.fill();
      g.font = "11px ui-monospace, monospace"; g.fillStyle = "#6fe0ff"; const zw = Math.hypot(e[2] - pos[2], e[3] - pos[3]); if (zw > 0.05) g.fillText(`and ${zw.toFixed(2)} off the green`, X(e[0]) + 8, Y(e[1]) - 6); }
  }
  // the ball: its colour is w, its halo z
  const bx = X(pos[0]), by = Y(pos[1]), r = Math.max(5, s * 0.14);
  if (Math.abs(pos[2]) > 0.02) { g.strokeStyle = pos[2] > 0 ? "#ff8fa3" : "#ffb46b"; g.lineWidth = 2; g.beginPath(); g.arc(bx, by, r + 3 + 10 * Math.min(1, Math.abs(pos[2]) / OFF), 0, 2 * Math.PI); g.stroke(); g.lineWidth = 1; }
  g.fillStyle = wCol(pos[3]); g.beginPath(); g.arc(bx, by, r, 0, 2 * Math.PI); g.fill();
}

/* aiming: drag anywhere; the direction is the push, the length its strength. The prediction runs the stroke as if the
   field stayed the tile under the ball */
function predict(th, str) {
  const G = fieldOf(HOLES[hi]), F = G.F(ball), E = [Math.cos(th) * str * EMAX, Math.sin(th) * str * EMAX, 0, 0];
  let st = { x: ball.slice(), v: [0, 0, 0, 0] }; const pts = [st.x];
  for (let t = 0, n = 0; t < 14; t += 0.02, n++) { st = step(st, () => F, t < PUSH_T ? E : [0, 0, 0, 0], GAMMA, 0.02); if (n % 4 === 0) pts.push(st.x); if (t > PUSH_T && Math.hypot(...st.v) < 0.01) break; }
  return pts;
}
function bind() {
  const cv = $("course"); let p0 = null;
  const toTiles = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / geo.s, -(e.clientY - r.top) / geo.s]; };
  cv.addEventListener("pointerdown", (e) => { if (anim || done) return; p0 = toTiles(e); cv.setPointerCapture(e.pointerId); aim = { th: 0, len: 0, pred: null }; });
  cv.addEventListener("pointermove", (e) => { if (!p0 || anim) return; const p = toTiles(e), dx = p[0] - p0[0], dy = p[1] - p0[1], len = Math.hypot(dx, dy) / 2.2;
    aim = { th: Math.atan2(dy, dx), len, pred: len > 0.03 ? predict(Math.atan2(dy, dx), Math.min(1, len)) : null }; draw(); });
  const release = () => { if (!p0) return; p0 = null; const a = aim; aim = null; if (!a || a.len < 0.03) { draw(); return; } shoot(a.th, Math.min(1, a.len)); };
  cv.addEventListener("pointerup", release); cv.addEventListener("pointercancel", () => { p0 = null; aim = null; draw(); });
  $("retry").onclick = () => start(hi); $("next").onclick = () => start(hi + 1);
  $("holes").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) start(+b.dataset.h); });
  addEventListener("resize", () => { draw(); status(); });
}
function shoot(th, str) {
  const r = stroke(HOLES[hi], ball, th, str); strokes++; msg = "";
  anim = { path: r.path, i: 0, cur: r.path[0], r, t0: performance.now(), dur: Math.min(3200, 600 + r.t * 220) };
  const tick = (now) => {
    const f = Math.max(0, Math.min(1, (now - anim.t0) / anim.dur)), i = Math.min(anim.path.length - 1, Math.floor(f * (anim.path.length - 1)));
    anim.i = i; anim.cur = anim.path[i]; draw(); status();
    if (f < 1) return requestAnimationFrame(tick);
    const { r } = anim; anim = null;
    if (r.holed) { done = true; ball = r.end; msg = strokes <= HOLES[hi].par ? `In, in ${strokes}${strokes < HOLES[hi].par ? ": under par!" : ", par."}` : `In, in ${strokes} (par ${HOLES[hi].par}).`;
      if (scores[hi] == null || strokes < scores[hi]) { scores[hi] = strokes; save(); } holes(); }
    else if (r.off) { strokes++; ball = rest.slice(); msg = `Lost off the green into ${Math.abs(r.end[2]) > OFF ? "z" : "w"}: a stroke's penalty, back to where it was.`; }
    else { ball = r.end; rest = ball.slice(); }
    draw(); status();
  };
  requestAnimationFrame(tick);
}
bind(); start(0);
