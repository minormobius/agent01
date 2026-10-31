/* Lean — the page: walk a track carved into a four-dimensional basin.
   The ground and the track are ./world.js, the drawing ./render.js. The controls are IRIS⁴'s.

   Up is always y. Your other three directions, R, F and N, turn freely in the space of x, z and w: turn (F toward R,
   the mouse or a drag), twist (R toward N) and look into w (F toward N). Your slice is the 3D space of F, R and up;
   N is the one direction across the ground you can't see.

   The readout is the track's own geometry where you stand, in your frame: its curvature vector κN (which way, and how
   hard, the centreline bends) split into the part in your slice (along R and F) and the part into w you can't see
   (along N), and its torsion τ, how fast the plane of the bend turns. A road on our ground has no torsion. */
import { DIM, VS, terrain, blocks, groundAt, walk, EYE, frenet, nearestTrack, LAP, PTS, NS, start, BASIN, R_TRACK } from "./world.js";
import { Renderer } from "./render.js";

const $ = (id) => document.getElementById(id), T0 = performance.now(), timing = {};
const glc = $("gl"), ov = $("ov");
let Rd;
try { Rd = new Renderer(glc); } catch (e) { $("intro").innerHTML = `<h1>LEAN</h1><p>This needs WebGL2: ${String(e.message || e)}</p>`; throw e; }

/* ------------------------------------------------------------- the world */
timing.shader = Math.round(performance.now() - T0);
const H = terrain(1), M = blocks(H); timing.land = Math.round(performance.now() - T0);
Rd.load(H, M, DIM); timing.upload = Math.round(performance.now() - T0);
const ground = (q) => groundAt(H, q);

/* ------------------------------------------------------------- you: where, and how you're turned */
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const me = { p: start(H), fr: { R: [1, 0, 0, 0], F: [0, 0, 1, 0], N: [0, 0, 0, 1] }, pitch: -0.12 };
const UP = [0, 1, 0, 0];
function rotFr(i, j, t) { const c = Math.cos(t), s = Math.sin(t), A = me.fr[i], B = me.fr[j]; me.fr[i] = add(A.map((v) => v * c), B, s); me.fr[j] = add(B.map((v) => v * c), A, -s); }
function tidy() { const f = me.fr, perp = (v, ...bs) => unit(bs.reduce((w, b) => add(w, b, -dot(w, b)), v)); f.F = perp(f.F, UP); f.R = perp(f.R, UP, f.F); f.N = perp(f.N, UP, f.F, f.R); }
const det = (R, F, N) => R[0] * (F[2] * N[3] - F[3] * N[2]) - R[2] * (F[0] * N[3] - F[3] * N[0]) + R[3] * (F[0] * N[2] - F[2] * N[0]);
/* square up: ease your frame onto the grid directions it's nearest (keeping your handedness). IRIS⁴'s */
let easing = null;
function squareUp() {
  const used = new Set([1]), out = {};
  for (const k of ["F", "R", "N"].sort((a, b) => Math.max(...me.fr[b].map(Math.abs)) - Math.max(...me.fr[a].map(Math.abs)))) {
    let best = -1; for (const a of [0, 2, 3]) if (!used.has(a) && (best < 0 || Math.abs(me.fr[k][a]) > Math.abs(me.fr[k][best]))) best = a;
    used.add(best); const g = [0, 0, 0, 0]; g[best] = me.fr[k][best] < 0 ? -1 : 1; out[k] = g;
  }
  if (det(me.fr.R, me.fr.F, me.fr.N) * det(out.R, out.F, out.N) < 0) out.N = out.N.map((v) => -v);
  easing = out;
}
/* face the track: F along the centreline (whichever way you were facing more), R toward or away from the centre of
   its bend, N the binormal. Then the whole bend is in your slice, and the torsion is how fast it leaves it */
function faceTrack() {
  const f = frenet(nearestTrack(me.p).t), F = dot(f.T, me.fr.F) < 0 ? f.T.map((v) => -v) : f.T, R = dot(f.N, me.fr.R) < 0 ? f.N.map((v) => -v) : f.N;
  const out = { F, R, N: f.Bn };
  if (det(me.fr.R, me.fr.F, me.fr.N) * det(out.R, out.F, out.N) < 0) out.N = out.N.map((v) => -v);
  easing = out;
}

/* ------------------------------------------------------------- input (IRIS⁴'s) */
const SUN = unit([0.35, 0.42, -0.8, 0.2]);
const keys = new Set(); let look = { x: 0, y: 0 }, stick = null, twisting = 0, inW = 0;
const coarse = matchMedia("(pointer: coarse)").matches;
/* on a phone (a touch screen, or a narrow one) the map takes the bottom sixth and the buttons float over the view */
const phoneQ = matchMedia("(pointer: coarse), (max-width: 700px)");
function layout() { const ph = phoneQ.matches, act = $("act"); document.body.classList.toggle("phone", ph); if (ph) $("view").appendChild(act); else $("panel").insertBefore(act, $("panel").firstChild); }
layout(); phoneQ.addEventListener("change", layout);
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
  const k = e.key.toLowerCase();
  if (!$("intro").hidden && (k === "enter" || k === " ")) { e.preventDefault(); go(); return; }
  if (k === "x") { squareUp(); return; }
  if (k === "t") { faceTrack(); return; }
  if (["w", "a", "s", "d", "z", "c", "q", "e", "shift"].includes(k)) { e.preventDefault(); keys.add(k); }
});
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
glc.addEventListener("click", () => { if (!coarse && $("intro").hidden && document.pointerLockElement !== glc) { try { const r = glc.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* keys still work */ } } });
document.addEventListener("mousemove", (e) => { if (document.pointerLockElement === glc) { look.x += e.movementX; look.y += e.movementY; } });
glc.addEventListener("wheel", (e) => { e.preventDefault(); rotFr("R", "N", Math.sign(e.deltaY) * 0.05); tidy(); easing = null; }, { passive: false });
const STICK_R = 46, stickEl = $("stick"), knob = $("knob"), drags = new Map();
glc.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  try { glc.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
  const r = stickEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  if (r.width && Math.hypot(e.clientX - cx, e.clientY - cy) < STICK_R * 1.8) { drags.set(e.pointerId, { stick: true, cx, cy }); stickEl.classList.add("live"); }
  else drags.set(e.pointerId, { stick: false, x: e.clientX, y: e.clientY });
  move(e);
});
function move(e) {
  const g = drags.get(e.pointerId); if (!g) return;
  if (g.stick) { const dx = e.clientX - g.cx, dy = e.clientY - g.cy, m = Math.hypot(dx, dy), k = m > STICK_R ? STICK_R / m : 1; knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`; stick = m < 6 ? null : [(dx * k) / STICK_R, (-dy * k) / STICK_R]; }
  else { look.x += (e.clientX - g.x) * 1.6; look.y += (e.clientY - g.y) * 1.6; g.x = e.clientX; g.y = e.clientY; }
}
glc.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") move(e); });
for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) glc.addEventListener(ev, (e) => { const g = drags.get(e.pointerId); drags.delete(e.pointerId); if (g && g.stick) { stick = null; stickEl.classList.remove("live"); knob.style.transform = ""; } });
const hold = (id, set) => { const b = $(id); b.addEventListener("pointerdown", (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } set(true); }); for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(ev, () => set(false)); };
hold("twL", (on) => { twisting = on ? -1 : 0; }); hold("twR", (on) => { twisting = on ? 1 : 0; });
hold("inA", (on) => { inW = on ? 1 : 0; }); hold("inK", (on) => { inW = on ? -1 : 0; });
$("sq").onclick = squareUp; $("ft").onclick = faceTrack;
const opt = { fae: true };
for (const b of document.querySelectorAll("#show button")) { b.classList.toggle("on", opt[b.dataset.o]); b.onclick = () => { opt[b.dataset.o] = !opt[b.dataset.o]; b.classList.toggle("on", opt[b.dataset.o]); }; }
function go() { $("intro").hidden = true; if (!coarse) { try { const r = glc.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* fine */ } } }
$("go").onclick = go;

/* ------------------------------------------------------------- the track, in your frame */
const lap = { n: 0, last: null };
function trackRead() {
  const nt = nearestTrack(me.p), f = frenet(nt.t), on = nt.d <= R_TRACK, frac = nt.s / LAP;
  if (lap.last !== null && on) { if (lap.last > 0.9 && frac < 0.1) lap.n++; else if (lap.last < 0.1 && frac > 0.9) lap.n--; }
  if (on) lap.last = frac;
  const K = f.N.map((v) => v * f.kappa), kF = dot(K, me.fr.F), kR = dot(K, me.fr.R), kN = dot(K, me.fr.N);
  const inSlice = Math.hypot(kF, kR), intoW = Math.abs(kN), share = (inSlice * inSlice) / (f.kappa * f.kappa);
  const along = Math.abs(dot(f.T, me.fr.F)), tAngle = Math.round((Math.acos(Math.min(1, along)) * 180) / Math.PI);
  return { nt, f, on, frac, kF, kR, kN, inSlice, intoW, share, tAngle };
}
function readout(r) {
  const where = r.on ? `on the track · lap ${lap.n} · ${Math.round(r.frac * 100)}%` : `${(r.nt.d - R_TRACK).toFixed(1)} m off the track`;
  const side = r.kR < 0 ? "left" : "right", wdir = r.kN > 0 ? "ana" : "kata";
  const hud = `${where} · bend <b>${Math.round(r.share * 100)}%</b> in your slice`;
  if (hud !== readout.hud) { readout.hud = hud; $("hudT").innerHTML = hud; }
  const txt = `Here the centreline bends with radius <b>${(1 / r.f.kappa).toFixed(1)} m</b>. In your frame its curvature vector is ` +
    `(κ_F, κ_R, κ_N) = (<b>${r.kF.toFixed(3)}, ${r.kR.toFixed(3)}, ${r.kN.toFixed(3)}</b>) per metre: ` +
    `<b>${Math.round(r.share * 100)}%</b> of the bend is in your slice (to your ${side}), <b>${Math.round((1 - r.share) * 100)}%</b> is into w${1 - r.share > 0.01 ? ` (${wdir})` : ""}, where you can't see it. ` +
    `The plane of the bend turns at τ = <b>${r.f.tau.toFixed(3)}</b> rad/m, so ${Math.abs(r.f.tau) < 0.01 ? "for now it holds still" : `at this rate a bend wholly in your slice would be wholly into w ${Math.min(99, Math.abs(Math.PI / 2 / r.f.tau)).toFixed(0)} m on`}. ` +
    `You face ${r.tAngle}° off the track's direction. <b>↦</b> (or <b>T</b>) faces it, with the whole bend in your slice.`;
  if (txt !== readout.txt) { readout.txt = txt; $("read").innerHTML = txt; }
}
/* the map: the ground itself, x, z and w, as a solid you can turn (drag it; double-click resets). The track is drawn
   as what it is, a tube 2·R_TRACK thick round its centreline: in an orthographic view a tube's outline is that wide
   everywhere, so each stretch is a stroke of the tube's true width, drawn back to front and coloured by w, with its
   round cross-sections every few metres. The basin's three principal ellipses frame it, and you're on it: your
   position, where you face (gold) and the direction you can't see (dashed blue). w is the map's up. */
const MAPV = { yaw: 0.55, el: 0.62 }, MAP0 = { ...MAPV };
const wHue = (w) => Math.round(175 + ((w - BASIN.c[2]) / 3) * 115);
const RINGS = [];
for (let i = 0; i < NS; i += 48) { const f = frenet((2 * Math.PI * i) / NS), c = [f.p[0], f.p[2], f.p[3]], n = [f.N[0], f.N[2], f.N[3]], bn = [f.Bn[0], f.Bn[2], f.Bn[3]]; RINGS.push({ i, pts: Array.from({ length: 25 }, (_, k) => { const t = (2 * Math.PI * k) / 24; return c.map((v, j) => v + R_TRACK * (Math.cos(t) * n[j] + Math.sin(t) * bn[j])); }) }); }
{
  const cv = $("map"); let drag = null;
  cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } });
  cv.addEventListener("pointermove", (e) => { if (!drag) return; MAPV.yaw += (e.clientX - drag.x) * 0.012; MAPV.el = Math.max(-0.2, Math.min(1.5, MAPV.el + (e.clientY - drag.y) * 0.012)); drag = { x: e.clientX, y: e.clientY }; });
  for (const ev of ["pointerup", "pointercancel"]) cv.addEventListener(ev, () => { drag = null; });
  cv.addEventListener("dblclick", () => Object.assign(MAPV, MAP0));
}
function mapDraw() {
  const cv = $("map"), dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const ca = Math.cos(MAPV.yaw), sa = Math.sin(MAPV.yaw), ce = Math.cos(MAPV.el), se = Math.sin(MAPV.el), C = BASIN.c;
  // fit the track as seen from this angle (its projected extent, plus its radius) to the canvas, under the caption
  const proj = (q) => { const dx = q[0] - C[0], dz = q[1] - C[1], dw = q[2] - C[2], u = dx * ca - dz * sa, v = dx * sa + dz * ca; return [u, -(dw * ce - v * se), v * ce + dw * se]; };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < NS; i += 16) { const q = proj(PTS[i]); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  x0 -= R_TRACK; x1 += R_TRACK; y0 -= R_TRACK; y1 += R_TRACK;
  const top = 18, k = Math.min((w * 0.9) / (x1 - x0), ((h - top - 6) * 0.94) / (y1 - y0)), cx = w / 2 - ((x0 + x1) / 2) * k, cy = top + (h - top) / 2 - ((y0 + y1) / 2) * k;
  // ground (x, z, w) → screen, and depth (bigger is nearer)
  const P = (q) => { const r = proj(q); return [cx + r[0] * k, cy + r[1] * k, r[2]]; };
  // the basin: its three principal ellipses
  g.strokeStyle = "rgba(154,149,140,0.28)"; g.lineWidth = 1;
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) { g.beginPath(); for (let s = 0; s <= 64; s++) { const t = (2 * Math.PI * s) / 64, q = C.slice(); q[i] += BASIN.a[i] * Math.cos(t); q[j] += BASIN.a[j] * Math.sin(t); const p = P(q); s ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke(); }
  // the tube, back to front: each stretch a stroke the tube's true width, a darker rim under a lighter core
  const segs = []; for (let i = 0; i < NS; i += 6) { const a = P(PTS[i]), b = P(PTS[(i + 6) % NS]); segs.push({ a, b, d: (a[2] + b[2]) / 2, w: PTS[i][2], i }); }
  segs.sort((p, q) => p.d - q.d);
  const dmax = 19, shade = (d) => 0.55 + 0.45 * (d + dmax) / (2 * dmax);
  g.lineCap = "round";
  for (const s of segs) {
    const L = Math.round(30 + 30 * shade(s.d)), hue = wHue(s.w);
    g.strokeStyle = `hsl(${hue}, 55%, ${L - 14}%)`; g.lineWidth = 2 * R_TRACK * k; g.beginPath(); g.moveTo(s.a[0], s.a[1]); g.lineTo(s.b[0], s.b[1]); g.stroke();
    g.strokeStyle = `hsl(${hue}, 70%, ${L + 4}%)`; g.lineWidth = Math.max(1, 2 * R_TRACK * k * 0.55); g.beginPath(); g.moveTo(s.a[0], s.a[1]); g.lineTo(s.b[0], s.b[1]); g.stroke();
  }
  // the cross-sections: the half of each ring that faces you, over the tube, so you can see it's round both ways
  g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 1;
  for (const r of RINGS) { const dc = P(PTS[r.i])[2]; let on = false; g.beginPath(); for (const q of r.pts) { const p = P(q); if (p[2] >= dc - 1e-9) { on ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); on = true; } else on = false; } g.stroke(); }
  // the start line
  { const f = frenet(0), c = [f.p[0], f.p[2], f.p[3]], a = P(c.map((v, j) => v + R_TRACK * [f.N[0], f.N[2], f.N[3]][j])), b = P(c.map((v, j) => v - R_TRACK * [f.N[0], f.N[2], f.N[3]][j])); g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  // you
  const me3 = [me.p[0], me.p[2], me.p[3]], p = P(me3), arrow = (v, len) => P(me3.map((x, j) => x + v[j] * len));
  const F3 = [me.fr.F[0], me.fr.F[2], me.fr.F[3]], N3 = [me.fr.N[0], me.fr.N[2], me.fr.N[3]], fa = arrow(F3, 3.5), na = arrow(N3, 2.5);
  g.strokeStyle = "rgba(111,224,255,0.95)"; g.lineWidth = 1.6; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(na[0], na[1]); g.stroke(); g.setLineDash([]);
  g.strokeStyle = "#ffd27a"; g.lineWidth = 2.2; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(fa[0], fa[1]); g.stroke();
  g.fillStyle = "#ffd27a"; g.strokeStyle = "#07080c"; g.lineWidth = 1.5; g.beginPath(); g.arc(p[0], p[1], 4.5, 0, 2 * Math.PI); g.fill(); g.stroke();
  // the axes
  const o = [C[0] - 15, C[1] - 15, C[2] - 6], O = P(o);
  g.font = "10px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.textBaseline = "middle";
  [["x", [1, 0, 0]], ["z", [0, 1, 0]], ["w", [0, 0, 1]]].forEach(([n, v]) => { const e = P(o.map((x, j) => x + v[j] * 3)); g.strokeStyle = n === "w" ? "#b88cff" : "#9a958c"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(O[0], O[1]); g.lineTo(e[0], e[1]); g.stroke(); g.fillStyle = g.strokeStyle; g.fillText(n, O[0] + (e[0] - O[0]) * 1.35, O[1] + (e[1] - O[1]) * 1.35); });
  g.textAlign = "left"; g.textBaseline = "alphabetic"; g.fillStyle = "#9a958c";
  g.fillText(h < 200 ? "x, z, w · drag" : "the ground: x, z, w (w up) · drag to turn", 8, 13);
  // the colours' key: w, kata to ana
  if (h >= 200) { const kx = w - 136, ky = h - 16; for (let i = 0; i < 100; i++) { g.fillStyle = `hsl(${wHue(BASIN.c[2] - 3 + (6 * i) / 100)}, 60%, 50%)`; g.fillRect(kx + i, ky, 1, 6); }
  g.fillStyle = "#9a958c"; g.textAlign = "right"; g.fillText("kata", kx - 4, ky + 6); g.textAlign = "left"; g.fillText("ana", kx + 104, ky + 6); }
}
function wName() { const N = me.fr.N; let a = 0; for (const i of [2, 3]) if (Math.abs(N[i]) > Math.abs(N[a])) a = i; const off = Math.round((Math.acos(Math.min(1, Math.abs(N[a]))) * 180) / Math.PI); return (N[a] > 0 ? "+" : "−") + "xyzw"[a] + (off >= 2 ? ` ${off}°` : ""); }

/* ------------------------------------------------------------- the loop (IRIS⁴'s) */
let res = 0, lag = 1 / 60, prev = performance.now(), frames = 0;
const FIXED = 1 / (+new URLSearchParams(location.search).get("dt") || Infinity), TAN = 0.85;
function resolution(dt) {
  const dpr = Math.min(2, devicePixelRatio || 1), cap = Math.min(dpr, Math.sqrt(1.6e6 / Math.max(1, glc.clientWidth * glc.clientHeight)));
  if (!res) res = cap * (coarse ? 0.55 : 0.75);
  lag += (dt - lag) * 0.1;
  if (lag > 1 / 32 && res > 0.3) res *= 0.97; else if (lag < 1 / 55 && res < cap) res = Math.min(cap, res * 1.01);
  return Math.round(res * 40) / 40;
}
function step(now) {
  requestAnimationFrame(step);
  const dt = FIXED || Math.min(0.05, (now - prev) / 1000); prev = now;
  if ($("intro").hidden) {
    const tw = (twisting || (keys.has("c") ? 1 : 0) - (keys.has("z") ? 1 : 0)) * 1.0 * dt, iw = (inW || (keys.has("e") ? 1 : 0) - (keys.has("q") ? 1 : 0)) * 0.8 * dt;
    if (look.x) rotFr("F", "R", look.x * 0.0028);
    if (tw) rotFr("R", "N", tw);
    if (iw) rotFr("F", "N", iw);
    if (look.x || tw || iw) { tidy(); easing = null; }
    if (easing) {
      const k = 1 - Math.exp(-dt * 8), T = easing; for (const q of ["R", "F", "N"]) me.fr[q] = add(me.fr[q], T[q].map((v, i) => v - me.fr[q][i]), k); tidy();
      if (["R", "F", "N"].every((q) => me.fr[q].every((v, i) => Math.abs(v - T[q][i]) < 2e-3))) { me.fr = { R: T.R, F: T.F, N: T.N }; easing = null; }
    }
    me.pitch = Math.max(-1.3, Math.min(1.3, me.pitch - look.y * 0.0028)); look.x = look.y = 0;
    let mv = [0, 0]; if (keys.has("w")) mv[1] += 1; if (keys.has("s")) mv[1] -= 1; if (keys.has("d")) mv[0] += 1; if (keys.has("a")) mv[0] -= 1;
    if (stick) mv = stick; const m = Math.hypot(...mv); if (m > 1) mv = mv.map((v) => v / m);
    const speed = keys.has("shift") ? 8.4 : 4.2, vel = add(me.fr.F.map((v) => v * mv[1] * speed), me.fr.R, mv[0] * speed);
    me.p = walk(H, me.p, vel, dt, ground);
  }
  const cp = Math.cos(me.pitch), sp = Math.sin(me.pitch), F = add(me.fr.F.map((v) => v * cp), UP, sp), U = add(UP.map((v) => v * cp), me.fr.F, -sp);
  Rd.draw({ eye: me.p.map((v) => v / VS), R: me.fr.R, U, F, sun: SUN, time: now / 1000, fae: opt.fae ? 1 : 0, tan: TAN, far: 200, vs: VS }, resolution(dt));
  const r = trackRead(); readout(r); mapDraw();
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1); if (ov.width !== Math.round(ov.clientWidth * dpr)) { ov.width = Math.round(ov.clientWidth * dpr); ov.height = Math.round(ov.clientHeight * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, ov.clientWidth, ov.clientHeight); g.fillStyle = "rgba(255,255,255,0.7)"; g.beginPath(); g.arc(ov.clientWidth / 2, ov.clientHeight / 2, 1.6, 0, 2 * Math.PI); g.fill();
  const wn = wName(); if (wn !== step.wn) { step.wn = wn; $("hudW").textContent = `unseen ${wn}`; }
  if (!frames) timing.first = Math.round(performance.now() - T0);
  frames++;
}
requestAnimationFrame(step);
window.LEAN = { timing, me, squareUp, faceTrack, get frames() { return frames; }, rot: (i, j, t) => { rotFr(i, j, t); tidy(); }, opt, track: () => trackRead(), lap };
