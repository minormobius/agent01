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
const fundsQ = /[?&]funds=(\d+)/.exec(location.search);
try { history.replaceState(null, "", "?seed=" + seed + (fundsQ ? "&funds=" + fundsQ[1] : "")); } catch (e) { /* file:// */ }

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === "world") {
    W = m.world; P = m.P; warm = m.warmup; view.setWorld(W);
  } else if (m.type === "year") {
    const first = !snap;
    snap = m.snap; view.setSnap(snap); pending = false; dirty = true;
    if (m.log) { log = m.log.slice(); renderLog(); }
    else if (snap.events.length) { for (const ev of snap.events) { log.push(ev); toast(ev); } unread += snap.events.length; renderLog(); }
    // spends the worker hasn't seen yet still count against what this year's snapshot says
    while (inflight.length && inflight[0].seq <= snap.seq) inflight.shift();
    credits = snap.credits - inflight.reduce((a, x) => a + x.spend, 0);
    if (first) { lookAtBiggest(); $("loading").hidden = true; $("start-btn").disabled = false; $("start-btn").textContent = "BUILD"; }
    hud();
  }
};
let log = [], unread = 0;
worker.postMessage({ type: "init", seed, funds: fundsQ ? +fundsQ[1] : 0 });
$("seed").textContent = seed;

function yearLabel() { return snap ? 1900 + snap.year - warm : 1900; }
function site(i) { return [snap.P[3 * i], snap.P[3 * i + 1], snap.P[3 * i + 2]]; }
function lookAtBiggest() {
  let b = 0; for (let i = 0; i < snap.n; i++) if (snap.pop[i] > snap.pop[b]) b = i;
  view.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; view.face(site(b), 1); view.zoom = 4;
}
const fmt = (x) => x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e4 ? Math.round(x / 1e3) + "k" : x >= 1e3 ? (x / 1e3).toFixed(1) + "k" : Math.round(x) + "";

/* ------------------------------------------------------------ the clock */
function frame(t) {
  view.t = t / 1000;
  if (running && snap && !pending && t - lastStep > (speed === 1 ? 4000 : 1500)) { pending = true; lastStep = t; worker.postMessage({ type: "step" }); }
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
  bar(); panel(); charter();
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
  $("p-wagons").textContent = L.wagons || 0;
  const c = snap.cargo && snap.cargo.find((x) => x.id === L.id);
  $("p-cargo").textContent = !L.wagons ? "add a wagon to carry food and ore between towns" : c ? fmt(c.food) + " food · " + fmt(c.ore) + " ore · " + Math.round(100 * c.load) + "% full" : "nothing yet: stops must reach two towns, or a mine";
  $("p-cargo").classList.toggle("warn", !!(c && c.load > 0.99));
}

/* ------------------------------------------------------------ building */
function spend(c) { if (c > credits + 1e-9) { note("not enough: that costs ₵" + Math.ceil(c)); return false; } credits -= c; pendingSpend += c; return true; }
let pendingSpend = 0, seqN = 0; const inflight = [];
function push() { seqN++; inflight.push({ seq: seqN, spend: pendingSpend }); worker.postMessage({ type: "lines", lines, spend: pendingSpend, seq: seqN }); pendingSpend = 0; hud(); }
/* Prices now: the snapshot's index, and the density where you build. */
const ix = () => (snap && snap.index) || 1;
const trainPrice = () => P.COST_TRAIN * ix(), wagonPrice = () => P.COST_WAGON * ix();
function densAt(p) { const z = zoneAt(p); return snap.pop[z] / Math.max(1e-6, snap.area[z]); }
const stopPrice = (p) => P.COST_STOP * (1 + densAt(p) / P.URBAN_COST) * ix();
const trackPrice = (a, b) => trackCost(W, a, b, densAt) * ix();
function chartered(p) { return !snap.home || arc(p, snap.home) * R <= snap.charterKm + 1e-9; }
function newLine() {
  if (!spend(trainPrice())) return;
  const used = new Set(lines.map((l) => l.color)), color = COLORS.find((c) => !used.has(c));
  lines.push({ id: nextId++, color, stops: [], trains: 1, wagons: 0, paid: [] });
  sel = lines.length - 1; push();
  note("new line: tap land to lay its stops");
}
function addStop(z, at) {
  const L = lines[sel], p = at || site(z);   // exactly where you tapped; the zone centre when there is no tap
  if (!snap.land[z]) { note("stops go on land"); return; }
  if (!chartered(p)) { note("outside your charter (" + snap.charterKm + " km round " + snap.homeName + ")"); return; }
  const last = L.stops[L.stops.length - 1];
  if (last && arc(last, p) * R < 1) return;
  const c = stopPrice(p) + (last ? trackPrice(last, p) : 0);
  if (!spend(c)) return;
  L.stops.push(p); L.paid.push(c); push();
  note(L.stops.length < 2 ? "first stop · ₵" + Math.ceil(c) + " · now tap the next" : "stop " + L.stops.length + " · ₵" + Math.ceil(c) + (last ? " (" + (arc(last, p) * R).toFixed(0) + " km of track)" : ""));
}
$("p-undo").onclick = () => { const L = lines[sel]; if (!L || !L.stops.length) return; L.stops.pop(); const c = L.paid.pop(); credits += c / 2; pendingSpend -= c / 2; push(); note("stop removed: half its cost back"); };
$("p-plus").onclick = () => { const L = lines[sel], c = trainPrice(); if (L && spend(c)) { L.trains++; (L.trainPaid = L.trainPaid || []).push(c); push(); } };
$("p-minus").onclick = () => { const L = lines[sel]; if (L && L.trains > 1) { L.trains--; const c = (L.trainPaid && L.trainPaid.pop()) || P.COST_TRAIN; credits += c / 2; pendingSpend -= c / 2; push(); } };
$("w-plus").onclick = () => { const L = lines[sel], c = wagonPrice(); if (L && spend(c)) { L.wagons = (L.wagons || 0) + 1; (L.wagonPaid = L.wagonPaid || []).push(c); push(); } };
$("w-minus").onclick = () => { const L = lines[sel]; if (L && L.wagons > 0) { L.wagons--; const c = (L.wagonPaid && L.wagonPaid.pop()) || P.COST_WAGON; credits += c / 2; pendingSpend -= c / 2; push(); } };
const LAYERS = ["terrain", "food", "towns"];
$("layer").onclick = () => { view.layer = LAYERS[(LAYERS.indexOf(view.layer) + 1) % LAYERS.length]; $("layer").textContent = view.layer; $("layer").classList.toggle("on", view.layer !== "terrain"); };
$("ch-buy").onclick = () => { if (snap && snap.charterReady && credits >= snap.charterFee) worker.postMessage({ type: "charter" }); else note("not enough for the charter: ₵" + Math.ceil(snap.charterFee)); };
function charter() {
  if (!snap || !snap.home) return;
  const next = snap.nextRiders, km = snap.charterKm === Infinity ? "the whole planet" : snap.charterKm + " km round " + snap.homeName;
  $("ch-text").innerHTML = "charter: <b>" + km + "</b>" + (next && !snap.charterReady ? " · wider at " + fmt(next) + " riders a day" : "");
  $("ch-buy").hidden = !snap.charterReady;
  if (snap.charterReady) $("ch-buy").textContent = "widen · ₵" + Math.ceil(snap.charterFee);
}
// no page zoom: iOS ignores user-scalable for its own gestures
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("dblclick", (e) => e.preventDefault());
$("p-del").onclick = () => {
  const L = lines[sel]; if (!L) return;
  const sum = (a) => (a || []).reduce((x, y) => x + y, 0);
  const back = (sum(L.paid) + sum(L.trainPaid) + P.COST_TRAIN * ix() * Math.max(0, L.trains - (L.trainPaid || []).length) + sum(L.wagonPaid)) / 2;
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
    view.drag(c[0] - g.c[0], c[1] - g.c[1]); view.zoomAt(c[0], c[1], d / Math.max(1, g.d)); g.c = c; g.d = d; return;
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
cv.addEventListener("wheel", (e) => { e.preventDefault(); const p = xy(e); view.zoomAt(p[0], p[1], Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

function zoneAt(p) {
  let best = -2, bi = -1; const S = snap.P;
  for (let i = 0; i < snap.n; i++) { const d = S[3 * i] * p[0] + S[3 * i + 1] * p[1] + S[3 * i + 2] * p[2]; if (d > best) { best = d; bi = i; } }
  return bi;
}
function tap(p) {
  if (!snap) return;
  const m = view.unproject(p[0], p[1]); if (!m) { view.hot = -1; $("info").hidden = true; return; }
  const z = zoneAt(m);
  if (sel >= 0) { addStop(z, m); return; }
  view.hot = z; info(z);
}
function info(z) {
  const el = $("info"), g = snap.geo[z], d = snap.pop[z] / Math.max(1, snap.area[z]);
  if (!snap.land[z]) { el.hidden = false; el.innerHTML = "<b>sea</b>"; return; }
  const water = W.fresh[g], acc = snap.u ? snap.u[z] : 0;
  el.hidden = false;
  el.innerHTML = (townOf(z) ? "<i>" + townOf(z) + "</i> · " : "") + "<b>" + fmt(snap.pop[z]) + "</b> people · " + fmt(d) + "/km² · " + snap.area[z].toFixed(0) + " km²<br>" +
    "water <b>" + fmt(water) + "</b>/km² · reach <b>×" + acc.toFixed(2) + "</b>" +
    (snap.K ? " · room for " + fmt(snap.K[z]) : "") + townLine(z);
}
function townLine(z) {
  const t = snap.towns && nearestTown(site(z)); if (t == null) return "";
  const T = snap.towns[t];
  return "<br><i>" + T.name + "</i>: food <b>" + Math.round(100 * T.food) + "%</b>" + (T.short > 0 ? " (short " + fmt(T.short) + ")" : "") + " · ore <b>" + Math.round(100 * T.ore) + "%</b>";
}
function nearestTown(p) { let best = -2, bi = null; snap.towns.forEach((t, k) => { const d = t.p[0] * p[0] + t.p[1] * p[1] + t.p[2] * p[2]; if (d > best) { best = d; bi = k; } }); return bi; }
function townOf(z) {
  if (!snap.towns || !snap.towns.length || snap.pop[z] < 200) return "";
  const p = site(z); let best = -2, nm = "";
  for (const t of snap.towns) { const d = t.p[0] * p[0] + t.p[1] * p[1] + t.p[2] * p[2]; if (d > best) { best = d; nm = t.name; } }
  return best > Math.cos(60 / R) ? nm : "";
}
let noteT = 0, notePt = null;
function note(s, p) {
  const el = $("note"); el.textContent = s + (p ? " · tap to look" : ""); el.classList.add("show"); notePt = p || null;
  clearTimeout(noteT); noteT = setTimeout(() => el.classList.remove("show"), 3200);
}
function look(p) { if (!p || !snap) return; view.face(p, 1); if (view.zoom < 4) view.zoom = 4; const z = zoneAt(p); view.hot = z; info(z); }
$("note").onclick = () => look(notePt);

/* ------------------------------------------------------------ the log
   What the world did, newest first. Line events are worded here, where
   the lines' colours have names. Towns, cities passing a mark, a line
   filling up and the money running out also pop up as a note. */
const CNAME = { "#ff5a5f": "Red", "#3ec1ff": "Blue", "#ffd23f": "Yellow", "#5ee88a": "Green", "#c77dff": "Violet", "#ff9a3c": "Orange", "#ff7ac8": "Pink", "#9be15d": "Lime", "#7aa2ff": "Indigo", "#e8e8e8": "White" };
function evText(ev) {
  if (ev.line == null) return ev.text;
  const L = lines.find((l) => l.id === ev.line);
  return (L ? CNAME[L.color] + " line " : "A line ") + ev.text;
}
function evPoint(ev) {
  if (ev.p) return ev.p;
  const L = lines.find((l) => l.id === ev.line); return L && L.stops.length ? L.stops[L.stops.length >> 1] : null;
}
function toast(ev) { if (["town", "full", "money", "planet", "hunger", "mine", "charter"].includes(ev.kind) || (ev.kind === "city" && /passes|largest/.test(ev.text))) note(evText(ev), evPoint(ev)); }
function renderLog() {
  $("logbtn").textContent = "log" + (unread && $("log").hidden ? " ·" + unread : "");
  if ($("log").hidden) return;
  const el = $("loglist"); el.innerHTML = "";
  for (let k = log.length - 1; k >= 0; k--) {
    const ev = log[k], row = document.createElement("button"), L = ev.line != null && lines.find((l) => l.id === ev.line);
    row.type = "button"; row.className = "ev " + ev.kind;
    row.innerHTML = "<span class='y'>" + (1900 + ev.year - warm) + "</span>" + (L ? "<i style='background:" + L.color + "'></i>" : "") + "<span class='t'></span>";
    row.querySelector(".t").textContent = evText(ev);
    const p = evPoint(ev); if (p) row.onclick = () => { if (view.w < 700) $("log").hidden = true; look(p); }; else row.disabled = true;
    el.appendChild(row);
  }
}
$("logbtn").onclick = () => { $("log").hidden = !$("log").hidden; unread = 0; renderLog(); };
$("logclose").onclick = () => { $("log").hidden = true; renderLog(); };

/* ------------------------------------------------------------ buttons */
$("start-btn").onclick = () => { $("start").hidden = true; running = true; playBtn(); };
$("play").onclick = () => { running = !running; playBtn(); };
$("fast").onclick = () => { speed = speed === 1 ? 2 : 1; $("fast").classList.toggle("on", speed === 2); };
$("help").onclick = () => { running = false; playBtn(); $("start").hidden = false; };
$("newworld").onclick = (e) => { e.preventDefault(); location.search = "?seed=" + ((Math.random() * 1e9) >>> 0); };
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
