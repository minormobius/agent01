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
/* the map: the track from above (x across, z up the page) and from the side into w (x across, w up), coloured by w,
   with you on both */
const wCol = (w) => `hsl(${Math.round(170 + ((w - BASIN.c[2]) / 4) * 110)}, 75%, 62%)`;
function mapDraw(r) {
  const cv = $("map"), dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const side = w > h * 1.5, P = 12;
  // two panels: above (x, z) over a 34 m square; into w (x, w) over 34 × 12 m
  const pa = side ? { x: P, y: P, w: (w - 3 * P) * 0.62, h: h - 2 * P } : { x: P, y: P, w: w - 2 * P, h: (h - 3 * P) * 0.66 };
  const pb = side ? { x: pa.x + pa.w + P, y: P, w: w - pa.w - 3 * P, h: h - 2 * P } : { x: P, y: pa.y + pa.h + P, w: w - 2 * P, h: h - pa.h - 3 * P };
  const fit = (box, sx, sy) => { const k = Math.min(box.w / sx, box.h / sy); return { k, ox: box.x + (box.w - sx * k) / 2, oy: box.y + (box.h - sy * k) / 2 }; };
  const A = fit(pa, 32, 26), Bf = fit(pb, 32, 10);
  const toA = (x, z) => [A.ox + (x - 8) * A.k, A.oy + (37 - z) * A.k], toB = (x, wv) => [Bf.ox + (x - 8) * Bf.k, Bf.oy + (13 - wv) * Bf.k];
  g.lineWidth = Math.max(2, R_TRACK * 2 * A.k * 0.35); g.lineCap = "round";
  for (const [to, lw] of [[toA, Math.max(2, 2 * R_TRACK * A.k * 0.4)], [toB, Math.max(2, 2 * R_TRACK * Bf.k * 0.4)]]) {
    g.lineWidth = lw;
    for (let i = 0; i < NS; i += 8) { const p = PTS[i], q = PTS[(i + 8) % NS]; g.strokeStyle = wCol(p[2]); g.beginPath(); const a = to === toA ? toA(p[0], p[1]) : toB(p[0], p[2]), b = to === toA ? toA(q[0], q[1]) : toB(q[0], q[2]); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
  }
  // start line
  g.fillStyle = "#fff"; { const a = toA(PTS[0][0], PTS[0][1]); g.fillRect(a[0] - 4, a[1] - 1, 8, 2); }
  // you, and which way you face (F) and the direction you can't see (N), on both
  const you = (to, i, j) => { const p = to(me.p[i], me.p[j]), F = [me.fr.F[i], me.fr.F[j]], N = [me.fr.N[i], me.fr.N[j]];
    g.strokeStyle = "#ffd27a"; g.lineWidth = 2; g.beginPath(); g.moveTo(...p); g.lineTo(p[0] + F[0] * 14, p[1] - F[1] * 14); g.stroke();
    g.strokeStyle = "rgba(111,224,255,0.8)"; g.lineWidth = 1.5; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(...p); g.lineTo(p[0] + N[0] * 10, p[1] - N[1] * 10); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#ffd27a"; g.beginPath(); g.arc(p[0], p[1], 3.5, 0, 2 * Math.PI); g.fill(); };
  you(toA, 0, 2); you(toB, 0, 3);
  g.font = "10px ui-monospace, Menlo, monospace"; g.fillStyle = "#9a958c"; g.textAlign = "left";
  g.fillText("from above: x, z", pa.x, pa.y + 9); g.fillText("into w: x, w", pb.x, pb.y + 9);
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
  const r = trackRead(); readout(r); mapDraw(r);
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1); if (ov.width !== Math.round(ov.clientWidth * dpr)) { ov.width = Math.round(ov.clientWidth * dpr); ov.height = Math.round(ov.clientHeight * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, ov.clientWidth, ov.clientHeight); g.fillStyle = "rgba(255,255,255,0.7)"; g.beginPath(); g.arc(ov.clientWidth / 2, ov.clientHeight / 2, 1.6, 0, 2 * Math.PI); g.fill();
  const wn = wName(); if (wn !== step.wn) { step.wn = wn; $("hudW").textContent = `unseen ${wn}`; }
  if (!frames) timing.first = Math.round(performance.now() - T0);
  frames++;
}
requestAnimationFrame(step);
window.LEAN = { timing, me, squareUp, faceTrack, get frames() { return frames; }, rot: (i, j, t) => { rotFr(i, j, t); tidy(); }, opt, track: () => trackRead(), lap };
