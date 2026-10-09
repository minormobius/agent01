/* Ecumene — the page. The simulation runs in a worker (js/worker.js); this
   thread draws the globe, takes taps, and keeps the player's lines.

   One finger turns the globe, two pinch to zoom. With no line picked, a
   tap shows a zone. Pick a line (or start one) and a tap on land adds a
   stop where you tapped: at the end you're building from (tap an end stop
   to switch ends), or, on the line's own track, between the two stops it
   runs through. A loop's new stops go in wherever they add the least track.
   A stop laid on another line's stop takes its exact place: an interchange.
   The track and the stop are paid for on the spot. Trains are bought and sold per
   line. A year passes every few seconds; the lines change hands with the
   worker between years. */
import { View, CHORO, ramp } from "./view.js";
import { GLGround } from "./gl.js";
import { trackCost, arc, legs, slerp } from "./sim.js";
import { R } from "./world.js";

const $ = (id) => document.getElementById(id);
const COLORS = ["#ff5a5f", "#3ec1ff", "#ffd23f", "#5ee88a", "#c77dff", "#ff9a3c", "#ff7ac8", "#9be15d", "#7aa2ff", "#e8e8e8"];
const cv = $("globe"), view = new View(cv);
view.ground = /[?&]gl=0/.test(location.search) ? null : GLGround.create($("ground"));   // ?gl=0: the plain 2D ground
let W = null, P = null, snap = null, warm = 0, credits = 0, lines = [], sel = -1, nextId = 1, pick = -1;   // pick: a stop of the selected line
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
  view.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; view.face(snap.home || site(b), 1); view.zoom = 4;
}
const fmt = (x) => x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e4 ? Math.round(x / 1e3) + "k" : x >= 1e3 ? (x / 1e3).toFixed(1) + "k" : Math.round(x) + "";

/* ------------------------------------------------------------ the clock */
function frame(t) {
  view.t = t / 1000;
  if (running && snap && !pending && t - lastStep > (speed === 1 ? 4000 : 1500)) { pending = true; lastStep = t; worker.postMessage({ type: "step" }); }
  view.lines = lines; view.sel = sel; view.pick = pick;
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
    b.onclick = () => { sel = sel === i ? -1 : i; pick = -1; hud(); };
    el.appendChild(b);
  });
  if (lines.length < COLORS.length) {
    const b = document.createElement("button"); b.type = "button"; b.className = "lchip add"; b.textContent = "+ line";
    b.onclick = newLine; el.appendChild(b);
  }
}
/* The cities: every town, biggest first. Shown in the dock when no line is picked. */
function cities() {
  const el = $("cities"), T = (snap.towns || []).map((t, k) => ({ ...t, k })).filter((t) => t.pop + t.rural > 500).sort((a, b) => b.pop - a.pop);
  let pop = 0, gdp = 0; for (const t of T) { pop += t.pop + t.rural; gdp += t.gdp; }
  $("c-sum").textContent = T.length + " towns · " + fmt(pop) + " people · GDP ₵" + fmt(gdp) + "/yr";
  const rows = $("c-rows"); rows.innerHTML = "";
  for (const t of T) {
    const tr = document.createElement("tr"), f = Math.round(100 * t.food);
    if (snap.homeName === t.name) tr.className = "home";
    const pr = t.price ?? 1;   // food: what it costs there (×1 the usual), and how much short when it is
    tr.innerHTML = "<td></td><td>" + fmt(t.pop) + "</td><td>" + fmt(t.rural) + "</td><td class='" + (f < 70 ? "starve" : f < 95 || pr > 1.5 ? "short" : pr < 0.7 ? "cheap" : "") + "'>×" + pr.toFixed(2) + (f < 99 ? " <small>" + f + "%</small>" : "") + "</td><td>₵" + fmt(t.gdp) + "</td>";
    tr.firstChild.textContent = t.name;
    tr.onclick = () => look(t.p);
    rows.appendChild(tr);
  }
}
function panel() {
  const el = $("panel");
  $("cities").hidden = sel >= 0 && !!lines[sel];
  if (!$("cities").hidden) cities();
  if (sel < 0 || !lines[sel]) { el.hidden = true; return; }
  const L = lines[sel], info = snap.stats.lines && snap.stats.lines.find((x) => x.id === L.id);
  el.hidden = false; el.style.setProperty("--c", L.color);
  let km = 0; for (const [a, b] of legs(L)) km += arc(L.stops[a], L.stops[b]) * R;
  const hubs = (snap.hubs || []).filter((h) => h.lines.includes(L.id)).length;
  $("p-title").textContent = L.stops.length < 2 ? "tap land to lay stops" : km.toFixed(0) + " km · " + L.stops.length + " stops" + (L.loop ? " · loop" : "") + (hubs ? " · " + hubs + " ◎" : "") + (info && info.fare ? " · fares ₵" + Math.round(info.fare * 365) + "/yr" : "");
  $("p-end").hidden = L.loop || L.stops.length < 2;
  $("p-end").textContent = L.end === 0 ? "◀ from start" : "from end ▶";
  $("p-loop").hidden = L.stops.length < 3;
  $("p-loop").classList.toggle("on", !!L.loop);
  $("p-loop").textContent = L.loop ? "loop ✓" : L.stops.length < 3 ? "loop" : "loop · ₵" + Math.ceil(trackPrice(L.stops[L.stops.length - 1], L.stops[0]));
  $("p-undo").textContent = pick >= 0 && pick < L.stops.length ? "remove stop " + (pick + 1) : "remove stop";
  $("p-undo").hidden = !L.stops.length;
  $("p-riders").textContent = info && info.riders ? fmt(info.riders) + "/day" : "—";
  $("p-load").textContent = info && info.cap ? Math.round(100 * info.crowd) + "%" : "—";
  $("p-load").classList.toggle("warn", !!(info && info.crowd > 1));
  $("p-head").textContent = info && info.headway ? info.headway.toFixed(0) + " min" : "—";
  $("p-trains").textContent = L.trains;
  $("p-wagons").textContent = L.wagons || 0;
  const c = snap.cargo && snap.cargo.find((x) => x.id === L.id);
  $("p-cargo").textContent = !L.wagons ? "wagons carry food and ore" : c ? "freight " + fmt(c.food) + " food · " + fmt(c.ore) + " ore · " + Math.round(100 * c.load) + "% full" + (c.toll > 0.02 ? " · full: +×" + c.toll.toFixed(2) + " a unit" : "") + " · ₵" + Math.round(c.earned || 0) + "/yr" : "no freight yet: stops must reach two towns, or a mine";
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
  lines.push({ id: nextId++, color, stops: [], trains: 1, wagons: 0, paid: [], end: 1, loop: false });
  sel = lines.length - 1; pick = -1; push();
  note("new line: tap land to lay its stops");
}
/* Where a tap lands on the selected line, in screen pixels: a stop of it, a
   leg of it, or neither. Another line's stop near the tap is where the new
   stop goes instead (an interchange). */
const HIT = 16;
function scr(p) { return view.proj(p[0], p[1], p[2]); }
function hitStop(L, px) { let best = HIT, bi = -1; L.stops.forEach((s, k) => { const q = scr(s); if (q[2] < 0) return; const d = Math.hypot(q[0] - px[0], q[1] - px[1]); if (d < best) { best = d; bi = k; } }); return bi; }
function hitLeg(L, px) {
  let best = HIT * 0.8, bi = -1;
  legs(L).forEach(([a, b], k) => {
    const A = L.stops[a], B = L.stops[b], m = Math.max(2, Math.ceil(arc(A, B) * R / 2));   // every ~2 km of track
    for (let j = 0; j < m; j++) {
      const p = scr(slerp(A, B, j / m)), q = scr(slerp(A, B, (j + 1) / m)); if (p[2] < 0 || q[2] < 0) continue;
      const d = segDist(px, p, q); if (d < best) { best = d; bi = k; }
    }
  });
  return bi;
}
function snapTo(px, m) {
  let best = Infinity, at = null, who = null;
  lines.forEach((L, i) => {
    if (i === sel) return;
    for (const s of L.stops) { const q = scr(s); if (q[2] < 0) continue; const d = Math.hypot(q[0] - px[0], q[1] - px[1]); if ((d < HIT || arc(s, m) * R < P.HUB_KM) && d < best) { best = d; at = s; who = L; } }
  });
  return at ? { p: at.slice(), line: who } : null;
}
function place(z, p) {
  if (!snap.land[z]) { note("stops go on land"); return false; }
  if (!chartered(p)) { note("outside your charter (" + snap.charterKm + " km round " + snap.homeName + ")"); return false; }
  return true;
}
/* A stop at p, on a leg (the stop goes between its two stops), at an end, or, on a loop, wherever it adds the least. */
function addStop(z, at, px) {
  const L = lines[sel]; let p = at || site(z);   // exactly where you tapped; the zone centre when there is no tap
  const sn = px && snapTo(px, p); if (sn) { p = sn.p; z = zoneAt(p); }
  if (!place(z, p)) return;
  if (L.stops.some((s) => arc(s, p) * R < 0.3)) return;
  const n = L.stops.length;
  let leg = px && n > 1 ? hitLeg(L, px) : -1;
  if (leg < 0 && L.loop) {   // a loop has no end to grow from: the cheapest place in it
    let best = Infinity; legs(L).forEach(([a, b], k) => { const d = arc(L.stops[a], p) + arc(p, L.stops[b]) - arc(L.stops[a], L.stops[b]); if (d < best) { best = d; leg = k; } });
  }
  const tag = sn ? " · interchange with " + CNAME[sn.line.color] + " line" : "";
  if (leg >= 0) {
    const [a, b] = legs(L)[leg], A = L.stops[a], B = L.stops[b];
    const c = stopPrice(p) + Math.max(0, trackPrice(A, p) + trackPrice(p, B) - trackPrice(A, B));   // only the detour is new track
    if (!spend(c)) return;
    const at2 = b === 0 ? n : b;   // the loop's closing leg: the new stop goes last
    L.stops.splice(at2, 0, p); L.paid.splice(at2, 0, c); pick = -1; push();
    note("stop added between " + (a + 1) + " and " + (b + 1) + " · ₵" + Math.ceil(c) + tag);
    return;
  }
  const front = n > 1 && L.end === 0, last = n ? L.stops[front ? 0 : n - 1] : null;
  if (last && arc(last, p) * R < 1) return;
  const c = stopPrice(p) + (last ? trackPrice(last, p) : 0);
  if (!spend(c)) return;
  if (front) { L.stops.unshift(p); L.paid.unshift(c); } else { L.stops.push(p); L.paid.push(c); }
  pick = -1; push();
  note(L.stops.length < 2 ? "first stop · ₵" + Math.ceil(c) + " · now tap the next" : "stop " + L.stops.length + " · ₵" + Math.ceil(c) + (last ? " (" + (arc(last, p) * R).toFixed(0) + " km of track)" : "") + tag);
}
/* A tap with a line picked: on one of its stops picks that stop (an end stop also becomes the end you build from); anywhere else lays a stop. */
function lineTap(z, m, px) {
  const L = lines[sel], k = hitStop(L, px);
  if (k >= 0) {
    if (pick === k) { pick = -1; hud(); return; }
    pick = k;
    if (!L.loop && L.stops.length > 1 && (k === 0 || k === L.stops.length - 1)) { L.end = k === 0 ? 0 : 1; note("building from " + (k === 0 ? "the start" : "the end") + " · stop " + (k + 1) + " picked"); }
    else note("stop " + (k + 1) + " picked: remove it, or tap it again to let go");
    hud(); return;
  }
  addStop(z, m, px);
}
function removeStop(k) {
  const L = lines[sel]; if (!L || !L.stops.length) return;
  if (k < 0 || k >= L.stops.length) k = L.end === 0 ? 0 : L.stops.length - 1;
  L.stops.splice(k, 1); const c = L.paid.splice(k, 1)[0] || 0;
  let back = c / 2;
  if (L.loop && L.stops.length < 3) { L.loop = false; back += (L.loopPaid || 0) / 2; L.loopPaid = 0; }
  credits += back; pendingSpend -= back; pick = -1; push(); note("stop removed: half its cost back");
}
$("p-undo").onclick = () => removeStop(pick);
$("p-end").onclick = () => { const L = lines[sel]; if (!L) return; L.end = L.end === 0 ? 1 : 0; pick = -1; hud(); };
$("p-loop").onclick = () => {
  const L = lines[sel]; if (!L || L.stops.length < 3) return;
  if (L.loop) { L.loop = false; const back = (L.loopPaid || 0) / 2; L.loopPaid = 0; credits += back; pendingSpend -= back; push(); note("loop opened: half its track back"); return; }
  const A = L.stops[L.stops.length - 1], B = L.stops[0];
  if (!chartered(A) || !chartered(B)) return;
  const c = trackPrice(A, B); if (!spend(c)) return;
  L.loop = true; L.loopPaid = c; pick = -1; push(); note("loop closed · ₵" + Math.ceil(c) + " (" + (arc(A, B) * R).toFixed(0) + " km of track)");
};
$("p-plus").onclick = () => { const L = lines[sel], c = trainPrice(); if (L && spend(c)) { L.trains++; (L.trainPaid = L.trainPaid || []).push(c); push(); } };
$("p-minus").onclick = () => { const L = lines[sel]; if (L && L.trains > 1) { L.trains--; const c = (L.trainPaid && L.trainPaid.pop()) || P.COST_TRAIN; credits += c / 2; pendingSpend -= c / 2; push(); } };
$("w-plus").onclick = () => { const L = lines[sel], c = wagonPrice(); if (L && spend(c)) { L.wagons = (L.wagons || 0) + 1; (L.wagonPaid = L.wagonPaid || []).push(c); push(); } };
$("w-minus").onclick = () => { const L = lines[sel]; if (L && L.wagons > 0) { L.wagons--; const c = (L.wagonPaid && L.wagonPaid.pop()) || P.COST_WAGON; credits += c / 2; pendingSpend -= c / 2; push(); } };
const LAYERS = ["terrain", "people", "GDP", "food", "towns"];
$("layer").onclick = () => { view.relayer(LAYERS[(LAYERS.indexOf(view.layer) + 1) % LAYERS.length]); $("layer").textContent = view.layer; $("layer").classList.toggle("on", view.layer !== "terrain"); legend(); };
/* The key for the people and GDP layers: the ramp, and its decades. */
function legend() {
  const el = $("legend"), sc = CHORO[view.layer];
  if (!sc) { el.hidden = true; return; }
  el.hidden = false;
  const stops = []; for (let k = 0; k <= 8; k++) { const c = ramp(k / 8); stops.push("rgb(" + c.join(",") + ") " + (k * 12.5) + "%"); }
  const lab = (e) => e >= 3 ? fmt(Math.pow(10, e)) : e >= 0 ? String(Math.pow(10, e)) : Math.pow(10, e).toFixed(-e);
  let ticks = ""; for (let e = sc.lo; e <= sc.hi; e++) ticks += "<span>" + lab(e) + "</span>";
  el.innerHTML = "<div class='lg-bar' style='background:linear-gradient(90deg," + stops.join(",") + ")'></div><div class='lg-ticks'>" + ticks + "</div><div class='lg-unit'>" + sc.unit + "</div>";
}
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
  const back = (sum(L.paid) + (L.loopPaid || 0) + sum(L.trainPaid) + P.COST_TRAIN * ix() * Math.max(0, L.trains - (L.trainPaid || []).length) + sum(L.wagonPaid)) / 2;
  credits += back; pendingSpend -= back; lines.splice(sel, 1); sel = -1; pick = -1; push(); note("line closed: half its cost back");
};
$("p-done").onclick = () => { sel = -1; pick = -1; hud(); };

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

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function zoneAt(p) {
  let best = -2, bi = -1; const S = snap.P;
  for (let i = 0; i < snap.n; i++) { const d = S[3 * i] * p[0] + S[3 * i + 1] * p[1] + S[3 * i + 2] * p[2]; if (d > best) { best = d; bi = i; } }
  return bi;
}
function tap(p) {
  if (!snap) return;
  const m = view.unproject(p[0], p[1]); if (!m) { view.hot = -1; $("info").hidden = true; return; }
  const z = zoneAt(m);
  if (sel >= 0) { lineTap(z, m, p); return; }
  view.hot = z; info(z);
}
function info(z) {
  const el = $("info"), g = snap.geo[z], d = snap.pop[z] / Math.max(1, snap.area[z]);
  if (!snap.land[z]) { el.hidden = false; el.innerHTML = "<b>sea</b>"; return; }
  const water = W.fresh[g], acc = (snap.u && snap.u[z]) || 0;
  el.hidden = false;
  const gz = snap.gdpZ ? snap.gdpZ[z] : 0;
  el.innerHTML = (townOf(z) ? "<i>" + townOf(z) + "</i> · " : "") + "<b>" + fmt(snap.pop[z]) + "</b> people · " + fmt(d) + "/km² · " + snap.area[z].toFixed(0) + " km²<br>" +
    "GDP <b>₵" + (gz >= 10 ? fmt(gz) : gz.toFixed(gz >= 1 ? 1 : 2)) + "</b>/yr" + (snap.pop[z] > 50 ? " · ₵" + (1e3 * gz / snap.pop[z]).toFixed(2) + " a year per thousand people" : "") + "<br>" +
    "water <b>" + fmt(water) + "</b>/km² · reach <b>×" + acc.toFixed(2) + "</b>" +
    (snap.K ? " · room for " + fmt(snap.K[z]) : "") + townLine(z);
}
function townLine(z) {
  const t = snap.towns && nearestTown(site(z)); if (t == null) return "";
  const T = snap.towns[t];
  return "<br><i>" + T.name + "</i>: food <b>×" + (T.price ?? 1).toFixed(2) + "</b> the usual price, " + Math.round(100 * T.food) + "% fed, farms ×" + (T.tech ?? 1).toFixed(1) + "" + (T.short > 0 ? " (short " + fmt(T.short) + ")" : "") + " · ore <b>×" + (T.orePrice ?? 1).toFixed(1) + "</b>, " + Math.round(100 * T.ore) + "% of what its industry wants";
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
  if (ev.kind === "hub" && ev.lines) {
    const nm = ev.lines.map((id) => lines.find((l) => l.id === id)).filter(Boolean).map((L) => CNAME[L.color]);
    return (nm.length > 1 ? nm.slice(0, -1).join(", ") + " and " + nm[nm.length - 1] + " lines meet" : "An interchange opens") + ev.text;
  }
  if (ev.line == null) return ev.text;
  const L = lines.find((l) => l.id === ev.line);
  return (L ? CNAME[L.color] + " line " : "A line ") + ev.text;
}
function evPoint(ev) {
  if (ev.p) return ev.p;
  const L = lines.find((l) => l.id === ev.line); return L && L.stops.length ? L.stops[L.stops.length >> 1] : null;
}
function toast(ev) { if (["tech", "dear", "hub", "town", "full", "money", "planet", "hunger", "mine", "charter"].includes(ev.kind) || (ev.kind === "city" && /passes|largest/.test(ev.text))) note(evText(ev), evPoint(ev)); }
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
  if (e.key === "Escape") { sel = -1; pick = -1; hud(); }
});
window.addEventListener("resize", () => view.resize());
if (window.ResizeObserver) new ResizeObserver(() => view.resize()).observe(cv);
view.resize();
requestAnimationFrame(frame);
window.ECUMENE = { view, get snap() { return snap; }, get lines() { return lines; }, addStop, lineTap, removeStop, newLine, site, zoneAt, get credits() { return credits; } }; // for tests
