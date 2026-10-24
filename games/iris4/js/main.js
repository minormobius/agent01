/* IRIS⁴ — the page: walk a 4D landscape after rain, and shape the rainbow by how you're turned.
   The ground is ./world.js, the drawing ./render.js, the bows' physics Lumen⁴'s (../../lumen4/js/optics.js).

   Up is always y. Your other three directions, R, F and N, turn freely in the space of x, z and w: turn (F toward R,
   the mouse or a drag), twist (R toward N) and look into w (F toward N). The sun has a height, a bearing and a lean
   into w. The bow you see is decided by one thing only, the antisolar direction a = −sun in your own camera's frame:
   it's in your slice iff |a_N| ≤ sin θ, and on your screen it's a conic with e = √(a_R² + a_U²)/cos θ. */
import { DIM, VS, terrain, blocks, groundAt, walk, EYE, SIZE } from "./world.js";
import { Renderer } from "./render.js";
import { rainbowAngle, rainbowAngle2, waterN, lineColour, bowE, bowType, bowExists, bowOnScreenA } from "../../lumen4/js/optics.js";

const $ = (id) => document.getElementById(id), DEG = Math.PI / 180, T0 = performance.now(), timing = {};
const glc = $("gl"), ov = $("ov");
let Rd;
try { Rd = new Renderer(glc); } catch (e) { $("intro").innerHTML = `<h1>IRIS⁴</h1><p>This needs WebGL2: ${String(e.message || e)}</p>`; throw e; }

/* ------------------------------------------------------------- the world and the bows */
timing.shader = Math.round(performance.now() - T0);
const H = terrain(1), M = blocks(H); timing.land = Math.round(performance.now() - T0);
Rd.load(H, M, DIM); timing.upload = Math.round(performance.now() - T0);
const LAMS = [400, 440, 480, 520, 560, 600, 650, 700];
const BOW1 = LAMS.map((l) => ({ l, th: rainbowAngle(waterN(l)), c: lineColour(l) })), BOW2 = LAMS.map((l) => ({ l, th: rainbowAngle2(waterN(l)), c: lineColour(l) }));
Rd.bows(BOW1, BOW2);
const RED = BOW1[BOW1.length - 1].th;

/* ------------------------------------------------------------- you: where, and how you're turned */
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const me = { p: [24, 0, 24, 8], fr: { R: [1, 0, 0, 0], F: [0, 0, 1, 0], N: [0, 0, 0, 1] }, pitch: 0.08 };
me.p[1] = groundAt(H, me.p) + EYE;
const UP = [0, 1, 0, 0];
function rotFr(i, j, t) { const c = Math.cos(t), s = Math.sin(t), A = me.fr[i], B = me.fr[j]; me.fr[i] = add(A.map((v) => v * c), B, s); me.fr[j] = add(B.map((v) => v * c), A, -s); }
function tidy() { const f = me.fr, perp = (v, ...bs) => unit(bs.reduce((w, b) => add(w, b, -dot(w, b)), v)); f.F = perp(f.F, UP); f.R = perp(f.R, UP, f.F); f.N = perp(f.N, UP, f.F, f.R); }
/* square up: ease your frame onto the grid directions it's nearest (keeping your handedness) */
let squaring = null;
function squareUp() {
  const used = new Set([1]), out = {};
  for (const k of ["F", "R", "N"].sort((a, b) => Math.max(...me.fr[b].map(Math.abs)) - Math.max(...me.fr[a].map(Math.abs)))) {
    let best = -1; for (const a of [0, 2, 3]) if (!used.has(a) && (best < 0 || Math.abs(me.fr[k][a]) > Math.abs(me.fr[k][best]))) best = a;
    used.add(best); const g = [0, 0, 0, 0]; g[best] = me.fr[k][best] < 0 ? -1 : 1; out[k] = g;
  }
  const det = (R, F, N) => R[0] * (F[2] * N[3] - F[3] * N[2]) - R[2] * (F[0] * N[3] - F[3] * N[0]) + R[3] * (F[0] * N[2] - F[2] * N[0]);
  if (det(me.fr.R, me.fr.F, me.fr.N) * det(out.R, out.F, out.N) < 0) out.N = out.N.map((v) => -v);
  squaring = out;
}

/* ------------------------------------------------------------- the sun */
const sun = { el: 22 * DEG, az: 180 * DEG, beta: 0 };
function sunDir() { const h = [Math.sin(sun.az), 0, Math.cos(sun.az), 0], wv = [0, 0, 0, 1], hz = add(h.map((v) => v * Math.cos(sun.beta)), wv, Math.sin(sun.beta)); return add(hz.map((v) => v * Math.cos(sun.el)), UP, Math.sin(sun.el)); }

/* ------------------------------------------------------------- input */
const keys = new Set(); let look = { x: 0, y: 0 }, stick = null, twisting = 0, inW = 0;
const coarse = matchMedia("(pointer: coarse)").matches;
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
  const k = e.key.toLowerCase();
  if (!$("intro").hidden && (k === "enter" || k === " ")) { e.preventDefault(); go(); return; }
  if (k === "x") { squareUp(); return; }
  if (["w", "a", "s", "d", "z", "c", "q", "e"].includes(k)) { e.preventDefault(); keys.add(k); }
});
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
glc.addEventListener("click", () => { if (!coarse && $("intro").hidden && document.pointerLockElement !== glc) { try { const r = glc.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* keys still work */ } } });
document.addEventListener("mousemove", (e) => { if (document.pointerLockElement === glc) { look.x += e.movementX; look.y += e.movementY; } });
glc.addEventListener("wheel", (e) => { e.preventDefault(); rotFr("R", "N", Math.sign(e.deltaY) * 0.05); tidy(); squaring = null; }, { passive: false });
// touch: a stick bottom-left walks; dragging anywhere else turns and looks
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
$("sq").onclick = squareUp;
const slider = (id, set, show) => { const s = $(id); const f = () => { set(+s.value); $(id + "V").textContent = show(+s.value); }; s.oninput = f; f(); };
slider("sEl", (v) => { sun.el = v * DEG; }, (v) => `${v.toFixed(0)}°`);
slider("sAz", (v) => { sun.az = v * DEG; }, (v) => `${v.toFixed(0)}°`);
slider("sBeta", (v) => { sun.beta = v * DEG; }, (v) => `${v.toFixed(1)}°`);
const opt = { fae: true, second: true, conic: true };
for (const b of document.querySelectorAll("#show button")) { b.classList.toggle("on", opt[b.dataset.o]); b.onclick = () => { opt[b.dataset.o] = !opt[b.dataset.o]; b.classList.toggle("on", opt[b.dataset.o]); }; }
function go() { $("intro").hidden = true; if (!coarse) { try { const r = glc.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* fine */ } } }
$("go").onclick = go;

/* ------------------------------------------------------------- what the bow is doing, in your frame */
const TAN = 0.85, trail = [];
function readout(a) {
  const t = bowType(a, RED), e = bowE(a, RED), art = /^[aeiou]/.test(t) ? "an" : "a";
  const hud = t === "none" ? "the bow is off in w" : `the bow: ${art} <b>${t}</b> · e ${e.toFixed(2)}`;
  if (hud !== readout.was) { readout.was = hud; $("hudBow").innerHTML = hud; }
  const txt = `The antisolar direction in your frame: (a_F, a_R, a_U, a_N) = (<b>${a.map((x) => x.toFixed(2)).join(", ")}</b>). ` + (t === "none" ? `|a_N| = ${Math.abs(a[3]).toFixed(2)} is past sin ${(RED / DEG).toFixed(1)}° = ${Math.sin(RED).toFixed(2)}: no bow in your slice. Twist or look back out of w.` : `On your screen the red bow is ${art} <b>${t}</b>, e = √(a_R² + a_U²) / cos ${(RED / DEG).toFixed(1)}° = <b>${e.toFixed(3)}</b>.`);
  if (txt !== readout.txt) { readout.txt = txt; $("read").innerHTML = txt; }
}
function mapDraw(a) {
  const cv = $("map"), dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const P = 18, X = (v) => P + v * (w - 2 * P), Y = (v) => h - P - v * (h - 2 * P), sT = Math.sin(RED), cT = Math.cos(RED);
  g.fillStyle = "rgba(255,210,122,0.07)"; g.fillRect(X(0), Y(1), X(sT) - X(0), Y(cT) - Y(1)); // hyperbolas
  g.fillStyle = "rgba(111,224,255,0.07)"; g.fillRect(X(0), Y(cT), X(sT) - X(0), Y(0) - Y(cT)); // ellipses
  g.strokeStyle = "#ffd27a"; g.beginPath(); g.moveTo(X(0), Y(cT)); g.lineTo(X(sT), Y(cT)); g.stroke();
  g.strokeStyle = "#5a5f6e"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(sT), Y(0)); g.lineTo(X(sT), Y(1)); g.stroke(); g.setLineDash([]);
  g.strokeStyle = "#262833"; g.beginPath(); for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI / 2; const x = X(Math.sin(t)), y = Y(Math.cos(t)); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
  const px = Math.abs(a[3]), py = Math.hypot(a[1], a[2]), last = trail[trail.length - 1];
  if (!last || Math.hypot(last[0] - px, last[1] - py) > 0.004) { trail.push([px, py]); if (trail.length > 300) trail.shift(); }
  g.strokeStyle = "rgba(111,224,255,0.45)"; g.beginPath(); trail.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke();
  g.fillStyle = "#6fe0ff"; g.beginPath(); g.arc(X(px), Y(py), 4, 0, 2 * Math.PI); g.fill();
  g.font = "10px ui-monospace, Menlo, monospace"; g.fillStyle = "#9a958c"; g.textAlign = "left";
  g.fillText("hyperbola", X(0.02), Y(0.95)); g.fillText("ellipse", X(0.02), Y(0.08)); g.fillText("no bow →", X(sT) + 4, Y(0.5));
  g.textAlign = "center"; g.fillText("off in w: |a_N|", w / 2, h - 3);
  g.save(); g.translate(10, h / 2); g.rotate(-Math.PI / 2); g.fillText("across your screen", 0, 0); g.restore();
}
function overlay(a) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  const g = ov.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, S = h / 2 / TAN;
  g.fillStyle = "rgba(255,255,255,0.7)"; g.beginPath(); g.arc(cx, cy, 1.6, 0, 2 * Math.PI); g.fill();
  if (!opt.conic || !bowExists(a, RED)) return;
  g.strokeStyle = "rgba(255,210,122,0.85)"; g.lineWidth = 1.2; g.setLineDash([6, 5]); g.beginPath(); let on = false;
  for (const q of bowOnScreenA(a, RED, 360)) { if (!q || Math.abs(q[0]) > 30 || Math.abs(q[1]) > 30) { on = false; continue; } const x = cx + q[0] * S, y = cy - q[1] * S; if (on) g.lineTo(x, y); else g.moveTo(x, y); on = true; }
  g.stroke(); g.setLineDash([]);
}
function wName() { const N = me.fr.N; let a = 0; for (const i of [2, 3]) if (Math.abs(N[i]) > Math.abs(N[a])) a = i; const off = Math.round((Math.acos(Math.min(1, Math.abs(N[a]))) * 180) / Math.PI); return (N[a] > 0 ? "+" : "−") + "xyzw"[a] + (off >= 2 ? ` ${off}°` : ""); }

/* ------------------------------------------------------------- the loop */
let res = 0, lag = 1 / 60, prev = performance.now(), frames = 0;
const FIXED = 1 / (+new URLSearchParams(location.search).get("dt") || Infinity);
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
    // turning, twisting, looking into w; pitch is the camera's own
    const tw = (twisting || (keys.has("c") ? 1 : 0) - (keys.has("z") ? 1 : 0)) * 1.0 * dt, iw = (inW || (keys.has("e") ? 1 : 0) - (keys.has("q") ? 1 : 0)) * 0.8 * dt;
    if (look.x) rotFr("F", "R", look.x * 0.0028);
    if (tw) rotFr("R", "N", tw);
    if (iw) rotFr("F", "N", iw);
    if (look.x || tw || iw) { tidy(); squaring = null; }
    if (squaring) {
      const k = 1 - Math.exp(-dt * 8), T = squaring; for (const q of ["R", "F", "N"]) me.fr[q] = add(me.fr[q], T[q].map((v, i) => v - me.fr[q][i]), k); tidy();
      if (["R", "F", "N"].every((q) => me.fr[q].every((v, i) => Math.abs(v - T[q][i]) < 2e-3))) { me.fr = { R: T.R, F: T.F, N: T.N }; squaring = null; }
    }
    me.pitch = Math.max(-1.3, Math.min(1.3, me.pitch - look.y * 0.0028)); look.x = look.y = 0;
    let mv = [0, 0]; if (keys.has("w")) mv[1] += 1; if (keys.has("s")) mv[1] -= 1; if (keys.has("d")) mv[0] += 1; if (keys.has("a")) mv[0] -= 1;
    if (stick) mv = stick; const m = Math.hypot(...mv); if (m > 1) mv = mv.map((v) => v / m);
    const vel = add(me.fr.F.map((v) => v * mv[1] * 4.2), me.fr.R, mv[0] * 4.2);
    me.p = walk(H, me.p, vel, dt);
  }
  const cp = Math.cos(me.pitch), sp = Math.sin(me.pitch), F = add(me.fr.F.map((v) => v * cp), UP, sp), U = add(UP.map((v) => v * cp), me.fr.F, -sp), S = sunDir();
  Rd.draw({ eye: me.p.map((v) => v / VS), R: me.fr.R, U, F, sun: S, time: now / 1000, fae: opt.fae ? 1 : 0, second: opt.second ? 1 : 0, tan: TAN, far: 190, vs: VS }, resolution(dt));
  const a = S.map((v) => -v), af = [dot(a, F), dot(a, me.fr.R), dot(a, U), dot(a, me.fr.N)];
  readout(af); overlay(af); mapDraw(af);
  const wn = wName(); if (wn !== step.wn) { step.wn = wn; $("hudW").textContent = `w ${wn}`; }
  if (!frames) timing.first = Math.round(performance.now() - T0);
  frames++;
}
requestAnimationFrame(step);
window.IRIS4 = { timing, me, sun, squareUp, get frames() { return frames; }, rot: (i, j, t) => { rotFr(i, j, t); tidy(); }, opt };
