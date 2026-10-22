/* PLATEAU — the page: fly through a 4D Voronoi foam and don't touch its edges.
   The physics and the collision are ./flight.js, the drawing ./render.js,
   the leaderboard ./board.js (loaded apart). This file is the run: input,
   the clock, the phases, the crash, the overlays. */
import { Foam, Craft, clearance, fieldAt, speedAt, phaseAt, autopilot, PHASES, R_EDGE, R_BODY, RATES } from "./flight.js";
import { Renderer } from "./render.js";
import { OPEN, dailyId, dailySeed, METRES } from "./score.js";

const $ = (id) => document.getElementById(id);
const glc = $("gl"), oc = $("over"), octx = oc.getContext("2d");
let Rd;
try { Rd = new Renderer(glc); } catch (e) { $("start").innerHTML = `<h1>PLATEAU</h1><p>This needs WebGL2: ${String(e.message || e)}</p>`; throw e; }

/* ------------------------------------------------------------- the run */
let run = null; // { foam, craft, d, time, seed, daily, over, phase, cell, grace }
const best = (() => { try { return JSON.parse(localStorage.getItem("plateau.best") || "{}"); } catch (e) { return {}; } })();
const saveBest = () => { try { localStorage.setItem("plateau.best", JSON.stringify(best)); } catch (e) { /* private mode */ } };
function begin(daily, fixed) {
  const seed = daily ? dailySeed() : fixed !== undefined ? fixed >>> 0 : (Math.random() * 2 ** 32) >>> 0, foam = new Foam(seed), F = fieldAt(0);
  const craft = new Craft(foam.pos([0, 0, 0, 0], F));
  // a heading off the crystal's axes, the same for everyone on a seed: the safe lanes are yours to find
  const h = (k) => (((seed >>> (k * 5)) & 31) / 31) * 2 - 1;
  craft.steer(0, 0.35 + 0.2 * h(0), 0.4 + 0.3 * h(1), 0.4, 0); craft.steer(0.3 * h(2), 0, 0, 0.4, 0);
  run = { foam, craft, d: 0, time: 0, seed, daily, over: false, phase: PHASES[0], cell: [0, 0, 0, 0], grace: 1.2, near: 0, posted: false, auto: false, autoT: 0, autoK: [0, 0, 0] };
  $("start").hidden = true; $("dead").hidden = true; banner(PHASES[0].name, PHASES[0].line); offerable();
  if (!matchMedia("(pointer: coarse)").matches) lock();
}
function lock() { // the mouse steers once it's caught (a promise in some browsers, refused without a gesture)
  try { const r = glc.requestPointerLock && glc.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* no lock: keys still fly */ }
}
function crash(why) {
  run.over = true; flash = 1;
  if (document.pointerLockElement) document.exitPointerLock();
  const m = Math.floor(run.d * METRES), k = run.daily ? dailyId() : OPEN, prev = best[k] || 0;
  if (m > prev) { best[k] = m; saveBest(); }
  $("dead-head").textContent = why;
  $("dead-m").textContent = m.toLocaleString("en") + " m";
  $("dead-text").innerHTML = `${run.daily ? "today's foam" : "a foam of your own"} · reached <b>${run.phase.name}</b> · ${run.time.toFixed(1)} s` + (prev ? ` · your best <b>${Math.max(prev, m).toLocaleString("en")} m</b>` : "");
  setTimeout(() => { $("dead").hidden = false; offerable(); }, 650);
}
let bannerT = 0;
function banner(name, line) { $("banner-name").textContent = name; $("banner-line").textContent = line; $("banner").classList.add("show"); clearTimeout(bannerT); bannerT = setTimeout(() => $("banner").classList.remove("show"), 2600); }

/* ------------------------------------------------------------- input: keys, mouse, a stick and roll buttons */
const keys = new Set();
let stick = null, rollHeld = 0, mouse = { x: 0, y: 0 };
function inputs(dt) {
  let roll = 0, pitch = 0, yaw = 0;
  if (keys.has("a") || keys.has("q")) roll -= 1;
  if (keys.has("d") || keys.has("e")) roll += 1;
  if (keys.has("w") || keys.has("arrowup")) pitch += 1; // up is nose up (or down, inverted, as flight sims do)
  if (keys.has("s") || keys.has("arrowdown")) pitch -= 1;
  if (keys.has("arrowleft")) yaw -= 1;
  if (keys.has("arrowright")) yaw += 1;
  if (stick) { yaw += stick.x; pitch -= stick.y; }
  roll += rollHeld;
  // the mouse turns you by how far it moved, like looking round
  if (dt > 0) { yaw += mouse.x * 0.0026 / (RATES.yaw * dt); pitch -= mouse.y * 0.0026 / (RATES.pitch * dt); }
  mouse.x = mouse.y = 0;
  const c = (v) => Math.max(-3, Math.min(3, v));
  return [Math.max(-1, Math.min(1, roll)), c(invert ? -pitch : pitch), c(yaw)];
}
let invert = false;
try { invert = localStorage.getItem("plateau.invert") === "1"; } catch (e) { /* private mode */ }
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
  const k = e.key.toLowerCase();
  if ((!$("start").hidden || !$("dead").hidden) && (k === "enter" || k === " ")) { e.preventDefault(); begin(false); return; }
  if (["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { e.preventDefault(); keys.add(k); }
});
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
glc.addEventListener("click", () => { if (run && !run.over && !matchMedia("(pointer: coarse)").matches && document.pointerLockElement !== glc) lock(); });
document.addEventListener("mousemove", (e) => { if (document.pointerLockElement === glc) { mouse.x += e.movementX; mouse.y += e.movementY; } });
// touch: the stick (drawn, and it stays put) steers; the roll buttons roll
const STICK_R = 52, touches = new Map(), stickEl = $("stick"), knobEl = $("knob");
function press(id, x, y) {
  const r = stickEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  if (r.width && Math.hypot(x - cx, y - cy) <= STICK_R * 1.8) { touches.set(id, { cx, cy }); stickEl.classList.add("live"); move(id, x, y); }
}
function move(id, x, y) {
  const t = touches.get(id); if (!t) return;
  const dx = x - t.cx, dy = y - t.cy, m = Math.hypot(dx, dy), k = m > STICK_R ? STICK_R / m : 1, s = m < 5 ? 0 : Math.min(1, (m - 5) / (STICK_R - 5)) / (m || 1);
  knobEl.style.transform = `translate(${dx * k}px, ${dy * k}px)`; stick = { x: dx * s, y: dy * s };
}
function lift(id) { if (!touches.has(id)) return; touches.delete(id); stick = null; stickEl.classList.remove("live"); knobEl.style.transform = ""; }
glc.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; try { glc.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } press(e.pointerId, e.clientX, e.clientY); });
glc.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") move(e.pointerId, e.clientX, e.clientY); });
for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) glc.addEventListener(ev, (e) => lift(e.pointerId));
for (const [id, v] of [["roll-l", -1], ["roll-r", 1]]) {
  const b = $(id);
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); rollHeld = v; b.classList.add("on"); });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => { if (rollHeld === v) rollHeld = 0; b.classList.remove("on"); });
}
/* a finger lifted on the button it went down on presses it at once (Safari can swallow the click while the
   page is busy redrawing); a click that follows is ignored, so nothing is pressed twice */
const downs = new Map(); let tappedAt = 0;
document.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; const b = e.target.closest && e.target.closest("button"); if (b && !b.classList.contains("hold")) downs.set(e.pointerId, { b, x: e.clientX, y: e.clientY }); }, true);
document.addEventListener("pointercancel", (e) => downs.delete(e.pointerId), true);
document.addEventListener("pointerup", (e) => { const d = downs.get(e.pointerId); downs.delete(e.pointerId); if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return; tappedAt = performance.now(); d.b.click(); }, true);
document.addEventListener("click", (e) => { if (e.isTrusted && performance.now() - tappedAt < 700 && e.target.closest && e.target.closest("button")) { e.stopPropagation(); e.preventDefault(); } }, true);

/* ------------------------------------------------------------- the loop */
// the attract loop's autopilot looks less far and tries fewer inputs than the balance report's, to fit in a frame
const AUTO = { ahead: 0.45, step: 0.15, cands: [[0, 0, 0], [1, 0, 0], [-1, 0, 0], ...[-1, 0, 1].flatMap((p) => [-1, 0, 1].map((y) => [0, p, y])).filter((k) => k[1] || k[2])] };
let res = 0, lag = 0, resN = 0, waits = 0, fence = null, flash = 0, prev = performance.now();
function resolution(w) { // as sharp as the GPU keeps up with: judged by frames left waiting on it, not by time
  const dpr = Math.min(2, devicePixelRatio || 1), cap = Math.min(dpr, Math.sqrt(1.6e6 / Math.max(1, glc.clientWidth * glc.clientHeight)));
  if (!res) res = cap * 0.8;
  lag += (w - lag) * 0.2;
  if (++resN >= 8) { resN = 0; if (lag > 2.5 && res > 0.5) res = Math.max(0.5, res * 0.85); else if (lag < 1.2 && res < cap) res = Math.min(cap, res * 1.08); }
  return Math.round(res * 20) / 20;
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
  if (run && !run.over && $("start").hidden && !paused()) {
    if (run.auto && (run.autoT -= dt) <= 0) { run.autoK = autopilot(run.foam, run.d, run.craft, AUTO); run.autoT = 0.12; } // the attract loop's pilot
    const [roll, pitch, yaw] = run.auto ? run.autoK : inputs(dt), v = speedAt(run.d);
    run.craft.steer(roll, pitch, yaw, dt); run.craft.fly(v, dt); run.d += v * dt; run.time += dt; run.grace -= dt;
    const F = fieldAt(run.d), cl = clearance(run.foam, F, run.craft);
    run.cell = cl.cell.split(",").map(Number); run.near = Math.min(cl.edge - R_EDGE, cl.solid - R_BODY);
    const ph = phaseAt(run.d); if (ph !== run.phase) { run.phase = ph; banner(ph.name, ph.line); }
    if (run.grace <= 0 && cl.edge < R_EDGE) crash("you touched an edge");
    else if (run.grace <= 0 && cl.solid < R_BODY) crash("you hit a solid cell");
    hud();
  } else inputs(0);
  if (!run) return;
  flash = Math.max(0, flash - dt * 2);
  const gl = Rd.gl;
  if (fence) { if (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) { waits++; return; } gl.deleteSync(fence); fence = null; }
  const F = fieldAt(run.d);
  Rd.draw({ field: F, seed: run.seed, craft: run.craft, here: run.cell, far: 7 * F.scale, edge: R_EDGE, time: now / 1000, flash }, resolution(waits)); waits = 0;
  fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
  overlay();
}
const paused = () => !$("dead").hidden;
function hud() {
  $("dist").textContent = Math.floor(run.d * METRES).toLocaleString("en") + " m";
  $("phase").textContent = run.phase.name;
  $("speed").textContent = (speedAt(run.d) * METRES).toFixed(0) + " m/s";
}
/* the overlay: a crosshair, and the w gauge (how far your nose points ana or kata, which is how fast
   you're driving through w), and a warning ring when something is close */
function overlay() {
  const W = oc.clientWidth, H = oc.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (oc.width !== Math.round(W * dpr)) { oc.width = Math.round(W * dpr); oc.height = Math.round(H * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);
  if (!run || run.over) return;
  const cx = W / 2, cy = H / 2, near = run.near;
  octx.strokeStyle = near < 0.12 ? "rgba(255,120,90,0.9)" : "rgba(220,240,255,0.55)"; octx.lineWidth = 1.5;
  octx.beginPath(); octx.arc(cx, cy, 9, 0, 7); octx.moveTo(cx - 16, cy); octx.lineTo(cx - 11, cy); octx.moveTo(cx + 11, cy); octx.lineTo(cx + 16, cy); octx.stroke();
  // the w gauge
  const gx = W - 26, gy = H / 2, gh = Math.min(140, H * 0.25), wn = run.craft.F[3];
  octx.strokeStyle = "rgba(200,220,255,0.35)"; octx.beginPath(); octx.moveTo(gx, gy - gh); octx.lineTo(gx, gy + gh); octx.stroke();
  octx.fillStyle = wn >= 0 ? "#ffb070" : "#7aa8ff"; octx.fillRect(gx - 4, Math.min(gy, gy - wn * gh), 8, Math.abs(wn * gh));
  octx.font = "600 10px ui-monospace, Menlo, monospace"; octx.textAlign = "center"; octx.fillStyle = "rgba(220,235,255,0.7)";
  octx.fillText("ana", gx, gy - gh - 8); octx.fillText("kata", gx, gy + gh + 14); octx.fillText("w", gx - 14, gy + 4);
}
requestAnimationFrame(frame);

/* ------------------------------------------------------------- buttons and the board */
$("go").onclick = () => begin(false);
$("go-daily").onclick = () => begin(true);
$("again").onclick = () => begin(run && run.daily);
$("again-open").onclick = () => begin(false);
const invLabel = () => { $("invert").textContent = invert ? "up = nose down (flight sim)" : "up = nose up"; };
$("invert").onclick = () => { invert = !invert; try { localStorage.setItem("plateau.invert", invert ? "1" : "0"); } catch (e) { /* private mode */ } invLabel(); };
invLabel();
const board = () => window.PLATEAU_BOARD || null;
function offerable() {
  const b = !!board();
  for (const id of ["board-btn", "dead-board"]) $(id).hidden = !b;
  $("post").hidden = !b || !run || !run.over || run.d < 1; $("post").disabled = !!(run && run.posted);
}
window.addEventListener("plateau-board", offerable);
$("post").onclick = () => {
  const b = board(); if (!b || !run || !run.over || run.posted) return;
  run.posted = true; offerable();
  b.offer({ sel: { board: run.daily ? dailyId() : OPEN }, at: Date.now(), cells: run.d, time: run.time, seed: run.seed, phase: run.phase.name });
};
$("board-btn").onclick = $("dead-board").onclick = () => { const b = board(); if (b) { b.open(); } };

window.PLATEAU = { get run() { return run; }, begin, crash, keys, setStick: (s) => (stick = s) };
