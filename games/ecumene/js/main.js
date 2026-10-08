/* Ecumene — the page. The simulation runs in a worker (js/worker.js); this
   thread draws the globe, takes taps, and keeps the player's lines.

   One finger turns the globe, two pinch to zoom. With no line picked, a
   tap shows a zone. Pick a line (or start one) and every tap on land adds a
   stop at the end of it, at the centre of the zone you tapped; the track
   and the stop are paid for on the spot. Trains are bought and sold per
   line. A year passes every few seconds; the lines change hands with the
   worker between years. */
import { View } from "./view.js";
import { trackCost, arc } from "./sim.js";
import { R } from "./world.js";

const $ = (id) => document.getElementById(id);
const COLORS = ["#ff5a5f", "#3ec1ff", "#ffd23f", "#5ee88a", "#c77dff", "#ff9a3c", "#ff7ac8", "#9be15d", "#7aa2ff", "#e8e8e8"];
const cv = $("globe"), view = new View(cv);
let W = null, P = null, snap = null, warm = 0, credits = 0, lines = [], sel = -1, nextId = 1;
let running = false, speed = 1, pending = false, lastStep = 0, dirty = true;

const seedQ = /[?&]seed=(\d+)/.exec(location.search);
const seed = seedQ ? +seedQ[1] : (Math.random() * 1e9) >>> 0;
try { history.replaceState(null, "", "?seed=" + seed); } catch (e) { /* file:// */ }

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === "world") {
    W = m.world; P = m.P; warm = m.warmup; view.world = W;
  } else if (m.type === "year") {
    const first = !snap;
    snap = m.snap; view.snap = snap; pending = false; dirty = true;
    // spends the worker hasn't seen yet still count against what this year's snapshot says
    while (inflight.length && inflight[0].seq <= snap.seq) inflight.shift();
    credits = snap.credits - inflight.reduce((a, x) => a + x.spend, 0);
    if (first) { lookAtBiggest(); $("loading").hidden = true; $("start-btn").disabled = false; $("start-btn").textContent = "BUILD"; }
    if (snap.lastTown != null && snap.lastTown !== lastTownSeen && !first) { lastTownSeen = snap.lastTown; note("a new town is founded", snap.lastTown); }
    if (first) lastTownSeen = snap.lastTown;
    hud();
  }
};
let lastTownSeen = null;
worker.postMessage({ type: "init", seed });
$("seed").textContent = seed;

function yearLabel() { return snap ? 1900 + snap.year - warm : 1900; }
function site(i) { return [snap.P[3 * i], snap.P[3 * i + 1], snap.P[3 * i + 2]]; }
function lookAtBiggest() {
  let b = 0; for (let i = 0; i < snap.n; i++) if (snap.pop[i] > snap.pop[b]) b = i;
  view.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; view.face(site(b), 1); view.zoom = 3.2;
}
const fmt = (x) => x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e4 ? Math.round(x / 1e3) + "k" : x >= 1e3 ? (x / 1e3).toFixed(1) + "k" : Math.round(x) + "";

/* ------------------------------------------------------------ the clock */
function frame(t) {
  view.t = t / 1000;
  if (running && snap && !pending && t - lastStep > (speed === 1 ? 2600 : 900)) { pending = true; lastStep = t; worker.postMessage({ type: "step" }); }
  view.lines = lines; view.sel = sel;
  view.draw(); // trains move every frame
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------ the HUD */
function hud() {
  if (!snap) return;
  const s = snap.stats;
  $("year").textContent = yearLabel();
  $("pop").textContent = fmt(s.pop || 0);
  $("riders").textContent = fmt(s.riders || 0);
  $("share").textContent = ((s.share || 0) * 100).toFixed(1) + "%";
  $("stranded").textContent = fmt(s.stranded || 0);
  $("stranded").parentElement.classList.toggle("warn", (s.stranded || 0) > 0);
  $("credits").textContent = "₵" + Math.floor(credits);
  const net = (s.fares || 0) - (s.upkeep || 0);
  $("net").textContent = (net >= 0 ? "+" : "−") + Math.round(Math.abs(net)) + "/yr";
  $("net").classList.toggle("neg", net < 0);
  bar(); panel();
}
function bar() {
  const el = $("linebar"); el.innerHTML = "";
  lines.forEach((L, i) => {
    const b = document.createElement("button"), info = snap && snap.stats.lines && snap.stats.lines.find((x) => x.id === L.id);
    b.type = "button"; b.className = "lchip" + (i === sel ? " on" : ""); b.style.setProperty("--c", L.color);
    b.innerHTML = "<i></i>" + (info ? fmt(info.riders) : "—") + (info && info.crowd > 1 ? " <em>full</em>" : "");
    b.onclick = () => { sel = sel === i ? -1 : i; hud(); };
    el.appendChild(b);
  });
  if (lines.length < COLORS.length) {
    const b = document.createElement("button"); b.type = "button"; b.className = "lchip add"; b.textContent = "+ line";
    b.onclick = newLine; el.appendChild(b);
  }
}
function panel() {
  const el = $("panel");
  if (sel < 0 || !lines[sel]) { el.hidden = true; return; }
  const L = lines[sel], info = snap.stats.lines && snap.stats.lines.find((x) => x.id === L.id);
  el.hidden = false; el.style.setProperty("--c", L.color);
  let km = 0; for (let k = 0; k + 1 < L.stops.length; k++) km += arc(L.stops[k], L.stops[k + 1]) * R;
  $("p-title").textContent = L.stops.length < 2 ? "tap land to lay stops" : km.toFixed(0) + " km · " + L.stops.length + " stops";
  $("p-riders").textContent = info && info.riders ? fmt(info.riders) + "/day" : "—";
  $("p-load").textContent = info && info.cap ? Math.round(100 * info.crowd) + "%" : "—";
  $("p-load").classList.toggle("warn", !!(info && info.crowd > 1));
  $("p-head").textContent = info && info.headway ? info.headway.toFixed(0) + " min" : "—";
  $("p-trains").textContent = L.trains;
}

/* ------------------------------------------------------------ building */
function spend(c) { if (c > credits + 1e-9) { note("not enough: that costs ₵" + Math.ceil(c)); return false; } credits -= c; pendingSpend += c; return true; }
let pendingSpend = 0, seqN = 0; const inflight = [];
function push() { seqN++; inflight.push({ seq: seqN, spend: pendingSpend }); worker.postMessage({ type: "lines", lines, spend: pendingSpend, seq: seqN }); pendingSpend = 0; hud(); }
function newLine() {
  if (!spend(P.COST_TRAIN)) return;
  const used = new Set(lines.map((l) => l.color)), color = COLORS.find((c) => !used.has(c));
  lines.push({ id: nextId++, color, stops: [], trains: 1, paid: [] });
  sel = lines.length - 1; push();
  note("new line: tap land to lay its stops");
}
function addStop(z) {
  const L = lines[sel], p = site(z);
  if (!snap.land[z]) { note("stops go on land"); return; }
  const last = L.stops[L.stops.length - 1];
  if (last && arc(last, p) * R < 1) return;
  const c = P.COST_STOP + (last ? trackCost(W, last, p) : 0);
  if (!spend(c)) return;
  L.stops.push(p); L.paid.push(c); push();
  note(L.stops.length < 2 ? "first stop · ₵" + Math.ceil(c) + " · now tap the next" : "stop " + L.stops.length + " · ₵" + Math.ceil(c) + (last ? " (" + (arc(last, p) * R).toFixed(0) + " km of track)" : ""));
}
$("p-undo").onclick = () => { const L = lines[sel]; if (!L || !L.stops.length) return; L.stops.pop(); const c = L.paid.pop(); credits += c / 2; pendingSpend -= c / 2; push(); note("stop removed: half its cost back"); };
$("p-plus").onclick = () => { const L = lines[sel]; if (L && spend(P.COST_TRAIN)) { L.trains++; push(); } };
$("p-minus").onclick = () => { const L = lines[sel]; if (L && L.trains > 1) { L.trains--; credits += P.COST_TRAIN / 2; pendingSpend -= P.COST_TRAIN / 2; push(); } };
$("p-del").onclick = () => {
  const L = lines[sel]; if (!L) return;
  const back = (L.paid.reduce((a, b) => a + b, 0) + L.trains * P.COST_TRAIN) / 2;
  credits += back; pendingSpend -= back; lines.splice(sel, 1); sel = -1; push(); note("line closed: half its cost back");
};
$("p-done").onclick = () => { sel = -1; hud(); };

/* ------------------------------------------------------------ input */
const pts = new Map(); let g = null;
function xy(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId); const p = xy(e); pts.set(e.pointerId, p);
  if (pts.size === 2) { const v = [...pts.values()]; g = { two: true, d: Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]), c: [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2] }; return; }
  g = { start: p, last: p, moved: false };
});
cv.addEventListener("pointermove", (e) => {
  if (!pts.has(e.pointerId) || !g) return;
  const p = xy(e); pts.set(e.pointerId, p);
  if (g.two && pts.size === 2) {
    const v = [...pts.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]), c = [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2];
    view.drag(c[0] - g.c[0], c[1] - g.c[1]); view.zoom = Math.max(0.8, Math.min(12, view.zoom * d / Math.max(1, g.d))); g.c = c; g.d = d; return;
  }
  if (!g.moved && Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) < 7) return;
  g.moved = true; view.drag(p[0] - g.last[0], p[1] - g.last[1]); g.last = p;
});
const up = (e) => {
  pts.delete(e.pointerId);
  if (!g) return;
  if (g.two) { if (!pts.size) g = null; else { const p = [...pts.values()][0]; g = { start: p, last: p, moved: true }; } return; }
  if (pts.size) return;
  const t = g; g = null;
  if (!t.moved) tap(t.start);
};
cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
cv.addEventListener("wheel", (e) => { e.preventDefault(); view.zoom = Math.max(0.8, Math.min(12, view.zoom * Math.exp(-e.deltaY * 0.0015))); }, { passive: false });

function zoneAt(p) {
  let best = -2, bi = -1; const S = snap.P;
  for (let i = 0; i < snap.n; i++) { const d = S[3 * i] * p[0] + S[3 * i + 1] * p[1] + S[3 * i + 2] * p[2]; if (d > best) { best = d; bi = i; } }
  return bi;
}
function tap(p) {
  if (!snap) return;
  const m = view.unproject(p[0], p[1]); if (!m) { view.hot = -1; $("info").hidden = true; return; }
  const z = zoneAt(m);
  if (sel >= 0) { addStop(z); return; }
  view.hot = z; info(z);
}
function info(z) {
  const el = $("info"), g = snap.geo[z], d = snap.pop[z] / Math.max(1, snap.area[z]);
  if (!snap.land[z]) { el.hidden = false; el.innerHTML = "<b>sea</b>"; return; }
  const water = W.fresh[g], acc = snap.u ? snap.u[z] : 0;
  el.hidden = false;
  el.innerHTML = "<b>" + fmt(snap.pop[z]) + "</b> people · " + fmt(d) + "/km² · " + snap.area[z].toFixed(0) + " km²<br>" +
    "water <b>" + fmt(water) + "</b>/km² · reach <b>×" + acc.toFixed(2) + "</b>" +
    (snap.K ? " · room for " + fmt(snap.K[z]) : "");
}
let noteT = 0, noteZone = -1;
function note(s, z) {
  const el = $("note"); el.textContent = s + (z != null ? " · tap to look" : ""); el.classList.add("show"); noteZone = z == null ? -1 : z;
  clearTimeout(noteT); noteT = setTimeout(() => el.classList.remove("show"), 2600);
}
$("note").onclick = () => { if (noteZone >= 0 && snap) { view.face(site(noteZone), 1); view.hot = noteZone; info(noteZone); } };

/* ------------------------------------------------------------ buttons */
$("start-btn").onclick = () => { $("start").hidden = true; running = true; playBtn(); };
$("play").onclick = () => { running = !running; playBtn(); };
$("fast").onclick = () => { speed = speed === 1 ? 2 : 1; $("fast").classList.toggle("on", speed === 2); };
$("help").onclick = () => { running = false; playBtn(); $("start").hidden = false; };
$("newworld").onclick = () => { location.search = "?seed=" + ((Math.random() * 1e9) >>> 0); };
function playBtn() { $("play").textContent = running ? "❚❚" : "▶"; }
document.addEventListener("keydown", (e) => {
  if (e.key === " ") { e.preventDefault(); $("play").click(); }
  if (e.key === "Escape") { sel = -1; hud(); }
});
window.addEventListener("resize", () => view.resize());
if (window.ResizeObserver) new ResizeObserver(() => view.resize()).observe(cv);
view.resize();
requestAnimationFrame(frame);
window.ECUMENE = { view, get snap() { return snap; }, get lines() { return lines; }, addStop, newLine, site, zoneAt, get credits() { return credits; } }; // for tests
