/* Tessera — the game page: draws js/snake.js's board, runs its clock, takes
   the turns. The board's shape and everything that happens on it live in the
   Game; this file only decides what the player sees. */
import { Tiling, FIGURES, T_ } from "./tiling.js";
import { Game, G_, SHAPE } from "./snake.js";

const $ = (id) => document.getElementById(id);
const cv = $("view"), ctx = cv.getContext("2d");
const FILL = ["#1d3a44", "#43321f", "#2a2e4c", "#432433"];
// the lab's fish walls at a little over half their size: enough to read as figures, not so much that a square stops looking like it has four sides
const WALLS = { A: FIGURES.fish.A.map((v) => v * 0.55), B: FIGURES.fish.B.map((v) => v * 0.55) };
let g, R, s = 40, ox = 0, oy = 0, dpr = 1, cw = 0, ch = 0, acc = 0, last = 0, running = false, best = 0, noteT = 0;
try { best = +localStorage.getItem("tessera.best") || 0; } catch (e) { /* private mode */ }

function size() {
  const r = cv.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1); cw = r.width; ch = r.height;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
}
function fit() { s = Math.min(cw / g.T.W, ch / g.T.H); ox = (cw - g.T.W * s) / 2; oy = (ch - g.T.H * s) / 2; }
function newGame() {
  size();
  const want = Math.max(36, Math.min(56, Math.min(cw, ch) / 9));
  const W = Math.max(6, 2 * Math.floor(cw / want / 2)), H = Math.max(6, 2 * Math.floor(ch / want / 2));
  g = new Game(W, H, (Date.now() % 2147483646) + 1);
  R = new Tiling(W, H); R.fig1 = WALLS; R.phiA.fill(1); R.phiB.fill(1);
  fit(); acc = 0; hud();
}
const X = (u) => ox + u * s, Y = (v) => oy + (g.T.H - v) * s;
function wraps(i) {
  const [x, y] = g.T.xy(i), dx = [0], dy = [0];
  if (x === 0) dx.push(g.T.W); if (x === g.T.W - 1) dx.push(-g.T.W);
  if (y === 0) dy.push(g.T.H); if (y === g.T.H - 1) dy.push(-g.T.H);
  const out = []; for (const a of dx) for (const b of dy) out.push([a, b]); return out;
}
function path(pts, a, b) { ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(X(p[0] + a), Y(p[1] + b)) : ctx.moveTo(X(p[0] + a), Y(p[1] + b)))); ctx.closePath(); }
function centroid(pts) {
  let A = 0, cx = 0, cy = 0;
  for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length], c = p[0] * q[1] - q[0] * p[1]; A += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; }
  return [cx / (3 * A), cy / (3 * A)];
}
function dot(c, r, fill) { for (const [a, b] of [[0, 0], [g.T.W, 0], [-g.T.W, 0], [0, g.T.H], [0, -g.T.H]]) { ctx.beginPath(); ctx.arc(X(c[0] + a), Y(c[1] + b), r, 0, 7); ctx.fillStyle = fill; ctx.fill(); } }

/* a short wall at lattice point (x, y), drawn again across the wrap when it sits on the board's edge */
function seg(x, y, P, Q) {
  for (const a of x === 0 ? [0, g.T.W] : [0]) for (const b of y === 0 ? [0, g.T.H] : [0]) { ctx.moveTo(X(P[0] + a), Y(P[1] + b)); ctx.lineTo(X(Q[0] + a), Y(Q[1] + b)); }
}

function draw(f, now) {
  R.h.fill(g.drawnSplit(f));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#06070b"; ctx.fillRect(0, 0, cw, ch);
  ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, g.T.W * s, g.T.H * s); ctx.clip();
  const outs = [], cen = [], body = new Map(g.body.map((c, k) => [c, k]));
  for (let i = 0; i < R.N; i++) { outs.push(R.outline(i, 10)); cen.push(centroid(outs[i])); }
  const n = g.body.length;
  for (let i = 0; i < R.N; i++) {
    const [x, y] = R.xy(i), k = body.get(i);
    let fill = FILL[(x & 1) + 2 * (y & 1)];
    if (k === 0) fill = g.alive ? "#f2b84b" : "#ff5d62";
    else if (k !== undefined) { const t = k / Math.max(1, n - 1); fill = `rgb(${Math.round(95 - 40 * t)},${Math.round(214 - 90 * t)},${Math.round(196 - 70 * t)})`; }
    for (const [a, b] of wraps(i)) { path(outs[i], a, b); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = "#06070b"; ctx.stroke(); }
  }
  // the short walls; in the last stretch before a pinch they turn amber, and the ones about to open are drawn as ghosts
  const late = g.clock <= G_.PREVIEW, pulse = 0.55 + 0.45 * Math.sin(now / 90);
  const H = R.h[0];
  ctx.lineCap = "round";
  if (Math.abs(H) > T_.EPS) {
    ctx.strokeStyle = late && g.pinchNext ? `rgba(242,184,75,${0.5 + 0.5 * pulse})` : "rgba(95,214,196,0.6)"; ctx.lineWidth = late && g.pinchNext ? 2.6 : 1.8;
    ctx.beginPath();
    for (let L = 0; L < R.N; L++) { const [x, y] = R.xy(L); seg(x, y, R.port(x, y, "dn"), R.port(x, y, "up")); }
    ctx.stroke();
  } else if (late && g.shape === 0) {
    const v = g.next > 0 ? [1, -1] : [1, 1], k = T_.HMAX;
    ctx.setLineDash([3, 4]); ctx.strokeStyle = `rgba(95,214,196,${0.35 + 0.4 * pulse})`; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let L = 0; L < R.N; L++) { const [x, y] = R.xy(L); seg(x, y, [x + k * v[0], y + k * v[1]], [x - k * v[0], y - k * v[1]]); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  // the spine: centre to centre along the body; the joints a pinch will cut are red
  const risk = new Set(g.pinchNext ? g.atRisk() : []);
  for (let k = 0; k + 1 < n; k++) {
    const l = g.link(g.body[k + 1], g.body[k]); if (!l) continue;
    const c = cen[g.body[k + 1]], d = [c[0] + l.dx, c[1] + l.dy];
    const r = risk.has(k);
    ctx.strokeStyle = r ? (late ? `rgba(255,93,98,${0.6 + 0.4 * pulse})` : "rgba(255,93,98,0.7)") : "rgba(6,7,11,0.35)";
    ctx.lineWidth = r ? 4 : 2;
    for (const [a, b] of wraps(g.body[k + 1])) { ctx.beginPath(); ctx.moveTo(X(c[0] + a), Y(c[1] + b)); ctx.lineTo(X(d[0] + a), Y(d[1] + b)); ctx.stroke(); }
  }
  // the head's heading
  if (g.alive) {
    const c = cen[g.body[0]], [hx, hy] = g.heading, m = Math.hypot(hx, hy);
    ctx.strokeStyle = "#1a1000"; ctx.lineWidth = 2.4; ctx.beginPath();
    ctx.moveTo(X(c[0]), Y(c[1])); ctx.lineTo(X(c[0] + 0.32 * hx / m), Y(c[1] + 0.32 * hy / m)); ctx.stroke();
  }
  for (const [c, t] of g.pellets) dot(cen[c], s * 0.12, `rgba(242,184,75,${Math.min(1, t / 30)})`);
  if (g.food >= 0) dot(cen[g.food], s * 0.2 * (0.9 + 0.1 * pulse), "#ff7eb6");
  ctx.restore();
}

function note(t) { const el = $("note"); el.textContent = t; el.classList.add("show"); clearTimeout(noteT); noteT = setTimeout(() => el.classList.remove("show"), 1600); }
function hud() {
  $("score").textContent = g.score; $("len").textContent = g.body.length; $("best").textContent = best || "—";
  const secs = ((g.clock - acc / G_.TICK) * G_.TICK / 1000).toFixed(1), risk = g.pinchNext ? g.atRisk().length : 0;
  $("nextlab").textContent = g.pinchNext ? (risk ? risk + " joint" + (risk > 1 ? "s" : "") + " at risk" : "corners close") : "corners open";
  $("next").textContent = SHAPE[g.next] + " in " + secs + "s";
  const cls = g.pinchNext ? (risk ? "risk" : "pinch") : "";
  $("next").className = "val " + cls; $("clockfill").className = cls;
  $("clockfill").style.transform = `scaleX(${Math.max(0, (g.clock - acc / G_.TICK) / G_.HOLD)})`;
}
function over() {
  running = false;
  if (g.score > best) { best = g.score; try { localStorage.setItem("tessera.best", String(best)); } catch (e) { /* private mode */ } }
  $("o-score").textContent = g.score;
  $("o-text").textContent = `${g.ticks} steps, longest ${g.longest || g.body.length}; the corners cut you ${g.cuts} time${g.cuts === 1 ? "" : "s"} and ${g.dropped} pieces fell off. Best: ${best}.`;
  $("over").hidden = false;
}

function loop(now) {
  const dt = Math.min(250, now - (last || now)); last = now;
  if (running) {
    acc += dt;
    while (acc >= G_.TICK && g.alive) {
      acc -= G_.TICK; g.tick();
      g.longest = Math.max(g.longest || 0, g.body.length);
      for (const e of g.events) {
        if (e.kind === "cut") note(`cut! ${e.n} piece${e.n > 1 ? "s" : ""} fell off — gather ${e.n > 1 ? "them" : "it"}`);
        if (e.kind === "dead") over();
      }
    }
    hud();
  }
  draw(running ? Math.min(1, acc / G_.TICK) : 0, now);
  requestAnimationFrame(loop);
}

/* ---- input: relative turns */
const turn = (d) => { if (running) g.turn(d); };
cv.addEventListener("pointerdown", (e) => { const r = cv.getBoundingClientRect(); turn(e.clientX - r.left < r.width / 2 ? 1 : -1); });
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { e.preventDefault(); turn(1); }
  else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); turn(-1); }
  else if (e.key === " ") { e.preventDefault(); $("play").click(); }
});
$("play").onclick = () => { if (!g.alive) return; running = !running; $("play").textContent = running ? "❚❚" : "▶"; };
$("help").onclick = () => { running = false; $("play").textContent = "▶"; $("start").hidden = false; };
$("go").onclick = () => { $("start").hidden = true; if (!g.alive) newGame(); running = true; $("play").textContent = "❚❚"; last = 0; };
$("again").onclick = () => { $("over").hidden = true; newGame(); running = true; };
document.addEventListener("visibilitychange", () => { if (document.hidden && running) $("play").click(); });
window.addEventListener("resize", () => { size(); fit(); });

newGame();
requestAnimationFrame(loop);
window.TESSERA = { get g() { return g; }, set running(v) { running = v; } };
