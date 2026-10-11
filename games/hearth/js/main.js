/* Hearth — the page. The settlement runs in a worker (js/worker.js); this
   thread draws the town (js/render.js), takes gestures, and turns the sun.

   One finger slides the view over the orb; two pinch to zoom, twist to turn
   and move together up or down to tilt (a mouse: drag to slide, right-drag
   or shift-drag to turn and tilt, the wheel to zoom). A tap picks the
   building under it. The sun goes round once every DAY seconds, so the
   shadows sweep and the night side lights up. */
import { Renderer } from "./render.js";
import { R, O_, gAt, tiers } from "./orb.js";

const $ = (id) => document.getElementById(id);
const DAY = 240;   // seconds of real time a day
const cv = $("view"), view = Renderer.create(cv);
let orb = null, snap = null, running = false, fast = false, pending = false, lastStep = 0, sel = -1, sun0 = 0;
const seedQ = /[?&]seed=(\d+)/.exec(location.search), seed = seedQ ? +seedQ[1] : (Math.random() * 1e9) >>> 0;
try { history.replaceState(null, "", "?seed=" + seed); } catch (e) { /* file:// */ }
$("seed").textContent = seed;
if (!view) { $("loading").textContent = "Hearth needs WebGL2, which this browser doesn't offer."; throw new Error("no webgl2"); }

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === "orb") {
    orb = m.orb;
    const pp = [orb.P[3 * orb.port], orb.P[3 * orb.port + 1], orb.P[3 * orb.port + 2]];
    view.port = pp; view.lookAt(pp, 1100, 1.0);
    // morning at the port: the sun a little above its eastern horizon
    sun0 = Math.atan2(pp[1], pp[0]) + 0.9;
  } else if (m.type === "year") {
    snap = m.snap; pending = false;
    view.setGround(m.ground); view.setBuildings(m.blds);   // built in the worker
    if ($("start-btn").disabled) { $("loading").hidden = true; $("start-btn").disabled = false; $("start-btn").textContent = "LAND"; }
    hud();
  }
};
worker.postMessage({ type: "init", seed });

const fmt = (x) => x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e4 ? Math.round(x / 1e3) + "k" : x >= 1e3 ? (x / 1e3).toFixed(1) + "k" : Math.round(x) + "";
const USE = ["homes", "offices", "industry", "the rocket port", "open ground"];
function hud() {
  const s = snap.stats;
  $("year").textContent = s.year + 1;
  $("pop").textContent = fmt(s.people); $("jobs").textContent = fmt(s.jobs);
  $("tall").textContent = s.tall + " fl";
  $("supply").textContent = fmt(s.supply || s.people);
  $("t-sum").textContent = s.built + " of " + orb.n + " lots built";
  $("t-text").innerHTML = "Everything comes through the port: <b>" + fmt(s.people) + "</b> people fed, <b>" + fmt(s.buildM2) + " m²</b> of floor built from imported steel this year, and the work of <b>" + fmt(s.jobs) + "</b> jobs shipped out. " +
    "The tallest building has <b>" + s.tall + "</b> floors (" + Math.round(s.tallM) + " m, " + gAt(s.tallM).toFixed(2) + " m/s² at the top).";
  lot();
}
function lot() {
  $("lot").hidden = sel < 0; $("town").hidden = sel >= 0;
  if (sel < 0 || !snap) return;
  const f = snap.floors[sel], h = f * O_.FLOOR, k = snap.kind[sel], d = orb.dPort[sel];
  $("l-title").textContent = f > 0 ? USE[k] : USE[k];
  $("l-floors").textContent = f; $("l-height").textContent = Math.round(h) + " m";
  $("l-g").textContent = (gAt(h) / 9.81).toFixed(2) + " g";
  $("l-pop").textContent = fmt(snap.pop[sel]); $("l-jobs").textContent = fmt(snap.jobs[sel]);
  const cap = snap.cap[sel];
  $("l-text").textContent = Math.round(orb.area[sel]) + " m² of lot, " + Math.round(d) + " m from the pad. " +
    (k === 3 ? "Everything the town eats and makes passes through here." : cap === 0 ? "On the port's apron: nothing may be built." : cap < 90 ? "Launches need clear sky: nothing here may rise past " + cap + " floors." : "") +
    (f > 0 && f < snap.cap[sel] ? "" : "");
}

/* ------------------------------------------------------------ the clock and the sun */
function frame(t) {
  if (running && snap && !pending && t - lastStep > (fast ? 900 : 2500)) { pending = true; lastStep = t; worker.postMessage({ type: "step" }); }
  const a = sun0 + 2 * Math.PI * (t / 1000) / DAY;
  view.sun = norm3([Math.cos(a) * 0.93, Math.sin(a) * 0.93, 0.36]);
  view.draw(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

/* ------------------------------------------------------------ gestures */
const pts = new Map(); let g = null;
const xy = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
cv.addEventListener("contextmenu", (e) => e.preventDefault());
cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId); const p = xy(e); pts.set(e.pointerId, p);
  if (pts.size === 2) { const v = [...pts.values()]; g = two(v); return; }
  g = { start: p, last: p, moved: false, turn: e.button === 2 || e.shiftKey };
});
function two(v) { return { two: true, d: Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]), a: Math.atan2(v[1][1] - v[0][1], v[1][0] - v[0][0]), c: [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2] }; }
cv.addEventListener("pointermove", (e) => {
  if (!pts.has(e.pointerId) || !g) return;
  const p = xy(e); pts.set(e.pointerId, p);
  if (g.two && pts.size === 2) {
    const n = two([...pts.values()]);
    view.zoom(g.d / Math.max(1, n.d));
    let da = n.a - g.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    view.turn(-da); view.tilt((n.c[1] - g.c[1]) * 0.006);
    g = n; return;
  }
  if (!g.moved && Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) < 6) return;
  g.moved = true;
  const dx = p[0] - g.last[0], dy = p[1] - g.last[1];
  if (g.turn) { view.turn(dx * 0.006); view.tilt(dy * 0.005); } else view.pan(dx, dy);
  g.last = p;
});
const up = (e) => {
  pts.delete(e.pointerId); if (!g) return;
  if (g.two) { if (!pts.size) g = null; else { const p = [...pts.values()][0]; g = { start: p, last: p, moved: true }; } return; }
  if (pts.size) return;
  const t = g; g = null; if (!t.moved) tap(t.start);
};
cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
cv.addEventListener("wheel", (e) => { e.preventDefault(); view.zoom(Math.exp(e.deltaY * 0.0015)); }, { passive: false });
function tap(p) {
  if (!orb) return;
  const u = view.unproject(p[0], p[1]); if (!u) { sel = -1; lot(); return; }
  let best = -2, bi = -1; for (let i = 0; i < orb.n; i++) { const d = orb.P[3 * i] * u[0] + orb.P[3 * i + 1] * u[1] + orb.P[3 * i + 2] * u[2]; if (d > best) { best = d; bi = i; } }
  sel = bi; lot();
}
document.addEventListener("gesturestart", (e) => e.preventDefault());

/* ------------------------------------------------------------ buttons */
let note_ = 0;
function note(s) { const el = $("note"); el.textContent = s; el.classList.add("show"); clearTimeout(note_); note_ = setTimeout(() => el.classList.remove("show"), 2600); }
$("start-btn").onclick = () => { $("start").hidden = true; running = true; playBtn(); };
$("play").onclick = () => { running = !running; playBtn(); };
$("fast").onclick = () => { fast = !fast; $("fast").classList.toggle("on", fast); };
$("viewbtn").onclick = () => {
  const far = view.cam.dist > 3000;
  if (far) { view.lookAt(view.cam.u, 650, 1.05); $("viewbtn").textContent = "orb"; } else { view.lookAt(view.cam.u, 7200, 0); $("viewbtn").textContent = "town"; }
};
$("portbtn").onclick = () => { if (orb) view.lookAt([orb.P[3 * orb.port], orb.P[3 * orb.port + 1], orb.P[3 * orb.port + 2]], 1100, 1.0); };
$("help").onclick = () => { running = false; playBtn(); $("start").hidden = false; $("start-btn").textContent = "BACK"; };
$("newworld").onclick = (e) => { e.preventDefault(); location.search = "?seed=" + ((Math.random() * 1e9) >>> 0); };
$("l-done").onclick = () => { sel = -1; lot(); };
function playBtn() { $("play").textContent = running ? "❚❚" : "▶"; }
document.addEventListener("keydown", (e) => { if (e.key === " ") { e.preventDefault(); $("play").click(); } if (e.key === "Escape") { sel = -1; lot(); } });
window.ECUMENE_HEARTH = window.HEARTH = { view, get snap() { return snap; }, get orb() { return orb; }, years: (n) => { for (let k = 0; k < n; k++) worker.postMessage({ type: "step" }); }, note };
