/* WAKE — the page. The shader is Lean's (../../lean/js/render.js) in hill mode with water on; the lake is ./lake.js,
   the boat ./boat.js, the wake ./wake.js, the courses ./levels.js and ./gen.js. The Cheshire cat stands on the hub.
   The stick is the rudder (a 2-vector across the bow, in the camera's right and ana), the throttle a lever on the
   right. Round the buoys in order; capsize and you're put back at the last buoy you rounded. */
import { Renderer } from "../../lean/js/render.js";
import { CAT_BOUND, CAT_MID } from "../../lean/js/catbike.js";
import { K as CAT_K, cut as catCut, pose as catPose } from "../../lean/js/cat.js";
import { Boat, BOATS, CAPSIZE, camFrame, principal } from "./boat.js";
import { place, bake, depthAt, HN, GATE } from "./lake.js";
import { remember, shells } from "./wake.js";
import { LEVELS } from "./levels.js";
import { make, TIERS, todaySeed } from "./gen.js";

const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const UP = [0, 1, 0, 0], CAT_S = 2; // the cat drawn twice its bicycle size, a helmsman for a boat
let Rd;
try { Rd = new Renderer(glc); } catch (e) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">WAKE needs WebGL2: ${String(e.message || e)}</p>`; throw e; }

/* ------------------------------------------------------------------ the course */
const game = { def: null, P: null, boat: null, kind: null, state: "menu", t: 0, label: "", next: 0, par: null, hist: [], capsizes: 0, check: null, flash: -1e9, free: false };
let throttle = 0.6;
function loadLevel(def, label, kicker) {
  const P = place(def), B = bake(P);
  Rd.hill(B.H, B.F, HN, B.L, 3, B.tan, B.rows); Rd.grain(null); Rd.water(0);
  Object.assign(game, { def, P, label, par: def.par || null, kind: def.boat, free: false });
  restart();
  showCard(kicker, label, def.lesson || "", `${game.par ? `par <b>${game.par.toFixed(1)} s</b> · ` : ""}${P.buoys.length} buoys · the ${game.kind}: ${BOATS[game.kind].say}`);
}
function placeAt(p, T) {
  let e1 = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; e1 = unit(add(e1, T, -dot(e1, T)));
  game.boat = new Boat(game.kind, p, T, e1); game.hist = [];
}
function restart() {
  const P = game.P; game.boat = new Boat(game.kind, P.start.p, P.start.T, P.start.e1); game.hist = [];
  Object.assign(game, { state: "ready", t: 0, next: 0, capsizes: 0, check: null, flash: -1e9, upAt: 0 }); throttle = 0.6; human.x = human.y = 0;
}
function backToCheck() { // after a capsize: at the last buoy rounded (or the start), pointed at the next
  const P = game.P, from = game.next > 0 ? P.buoys[game.next - 1] : P.start.p, to = P.buoys[game.next];
  placeAt(from, unit(add(to, from, -1))); throttle = 0.4; game.state = "play";
}

/* ------------------------------------------------------------------ cards and the menu */
const BEST = (() => { try { return JSON.parse(localStorage.getItem("wake.best") || "{}"); } catch (e) { return {}; } })();
const saveBest = () => { try { localStorage.setItem("wake.best", JSON.stringify(BEST)); } catch (e) { /* private */ } };
const MEDAL = ["", "🥉", "🥈", "🥇"];
function showCard(kicker, title, text, stats, next = false) {
  $("cardKicker").textContent = kicker; $("cardTitle").textContent = title; $("cardText").textContent = text; $("cardStats").innerHTML = stats;
  $("cardNext").hidden = !next; $("cardGo").textContent = game.state === "done" ? "AGAIN" : "SAIL"; $("card").hidden = false; $("menu").hidden = true;
}
function menu() {
  game.state = "menu"; $("card").hidden = true; $("menu").hidden = false;
  $("levels").innerHTML = LEVELS.map((l, i) => `<li><button type="button" data-i="${i}"><span class="n">${i + 1}</span><span class="nm">${l.name}</span><span class="sc">${l.score.toFixed(1)} · par ${l.par.toFixed(0)} s</span><span class="md">${MEDAL[BEST[i] || 0]}</span></button></li>`).join("");
  for (const b of document.querySelectorAll("#levels button")) b.onclick = () => openLevel(+b.dataset.i);
}
function openLevel(i) { game.index = i; history.replaceState(null, "", `?level=${i + 1}`); const l = LEVELS[i]; loadLevel(l, l.name, `course ${i + 1} of ${LEVELS.length} · difficulty ${l.score.toFixed(1)}`); }
function openMade(tier, seed) {
  const m = make(seed, TIERS[tier === "today" ? "medium" : tier] ?? 0.5); if (!m) return;
  game.index = -1; history.replaceState(null, "", `?seed=${seed}&tier=${tier}`);
  const def = { ...m, par: m.sol.par, lesson: `A made course, seed ${seed}: ${m.buoys.length} buoys${m.islands.length ? `, ${m.islands.length} island${m.islands.length > 1 ? "s" : ""}` : ""}, the ${m.boat}.` };
  loadLevel(def, tier === "today" ? "Today's" : `Made · ${tier}`, `seed ${seed} · difficulty ${m.sol.score.toFixed(1)}`);
}
let tierPick = (() => { try { return localStorage.getItem("wake.tier") || "medium"; } catch (e) { return "medium"; } })();
const markTier = () => { for (const b of document.querySelectorAll(".made button")) b.classList.toggle("on", b.dataset.t === tierPick); };
function dice() { openMade(tierPick, Math.floor(Math.random() * 1e9)); }
for (const b of document.querySelectorAll(".made button")) b.onclick = () => { const t = b.dataset.t; if (t === "today") { openMade("today", todaySeed()); return; } tierPick = t; try { localStorage.setItem("wake.tier", t); } catch (e) { /* private */ } markTier(); dice(); };
markTier();
for (const id of ["diceB", "cardDice", "menuDice"]) $(id).onclick = dice;
$("cardGo").onclick = () => { if (game.state === "done") restart(); game.state = "play"; $("card").hidden = true; };
$("cardMenu").onclick = menu; $("menuB").onclick = menu;
$("cardNext").onclick = () => openLevel(Math.min(LEVELS.length - 1, game.index + 1));
$("retryB").onclick = () => { if (!game.P) return; restart(); game.state = "play"; $("card").hidden = true; };
const KINDS = Object.keys(BOATS);
$("boatB").onclick = () => { // any boat on any course: sailing it off its own boat is for fun (no medal)
  if (!game.P) return; game.kind = KINDS[(KINDS.indexOf(game.kind) + 1) % KINDS.length]; game.free = game.kind !== game.def.boat;
  const st = game.state; restart(); game.state = st === "menu" ? "ready" : st === "done" ? "ready" : st;
  setBoatLabel(); game.say = { text: BOATS[game.kind].say, at: performance.now() };
};
const setBoatLabel = () => { $("boatB").textContent = `boat: ${game.kind}`; $("boatB").classList.toggle("on", game.free); };

/* ------------------------------------------------------------------ input: the stick is the rudder, the lever the throttle */
const human = { x: 0, y: 0 }, keys = new Set(); let stick = null, pitch = -0.2, look = 0;
document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if ((k === "enter" || k === " ") && !$("card").hidden) { e.preventDefault(); $("cardGo").onclick(); return; }
  if (k === "r") { $("retryB").onclick(); return; }
  if (k === "n") { dice(); return; }
  if (k === "b") { $("boatB").onclick(); return; }
  if (["w", "a", "s", "d", "e", "q", "arrowup", "arrowdown", "arrowleft", "arrowright", "pageup", "pagedown"].includes(k)) { e.preventDefault(); keys.add(k); }
});
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
const STICK_R = 52, stickEl = $("stick"), knob = $("knob"), drags = new Map();
glc.addEventListener("pointerdown", (e) => {
  try { glc.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
  const r = stickEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  if (r.width && Math.hypot(e.clientX - cx, e.clientY - cy) < STICK_R * 1.8) { drags.set(e.pointerId, { stick: true, cx, cy }); stickEl.classList.add("live"); }
  else drags.set(e.pointerId, { stick: false, y: e.clientY });
  move(e);
});
function move(e) {
  const g = drags.get(e.pointerId); if (!g) return;
  if (g.stick) { const dx = e.clientX - g.cx, dy = e.clientY - g.cy, m = Math.hypot(dx, dy), k = m > STICK_R ? STICK_R / m : 1; knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`; stick = m < 4 ? null : [(dx * k) / STICK_R, (-dy * k) / STICK_R]; }
  else { look += (e.clientY - g.y) * 1.6; g.y = e.clientY; }
}
glc.addEventListener("pointermove", move);
for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) glc.addEventListener(ev, (e) => { const g = drags.get(e.pointerId); drags.delete(e.pointerId); if (g && g.stick) { stick = null; stickEl.classList.remove("live"); knob.style.transform = ""; } });
const thrEl = $("thr"), THR_MIN = -0.3;
const thrFrom = (e) => { const r = thrEl.getBoundingClientRect(), f = 1 - (e.clientY - r.top) / r.height; throttle = Math.max(THR_MIN, Math.min(1, THR_MIN + f * (1 - THR_MIN))); };
thrEl.addEventListener("pointerdown", (e) => { try { thrEl.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } thrEl.dragging = true; thrFrom(e); });
thrEl.addEventListener("pointermove", (e) => { if (thrEl.dragging) thrFrom(e); });
for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) thrEl.addEventListener(ev, () => { thrEl.dragging = false; });
function ask(dt) {
  let x = 0, y = 0; if (stick) { x = stick[0]; y = stick[1]; }
  const kx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0), ky = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
  if (kx || ky) { const m = Math.hypot(kx, ky); x = kx / m; y = ky / m; }
  const k = 1 - Math.exp(-dt * 20); human.x += (x - human.x) * k; human.y += (y - human.y) * k;
  const tq = (keys.has("e") || keys.has("pageup") ? 1 : 0) - (keys.has("q") || keys.has("pagedown") ? 1 : 0);
  if (tq) throttle = Math.max(THR_MIN, Math.min(1, throttle + tq * 0.6 * dt));
}
function drawThrottle() {
  const f = (throttle - THR_MIN) / (1 - THR_MIN), z = (0 - THR_MIN) / (1 - THR_MIN);
  $("thrFill").style.height = `${(100 * f).toFixed(1)}%`; $("thrZero").style.bottom = `${(100 * z).toFixed(1)}%`;
  const t = `${Math.round(throttle * 100)}%`; if ($("thrTxt").textContent !== t) $("thrTxt").textContent = t;
}

/* ------------------------------------------------------------------ the overlay: buoy markers, the gauge, the map */
function project(q4, eye, cam, w, h) { // a 4D point to the screen (it may lie off your slice: by ana, along cam.N)
  const r = add(q4, eye, -1), f = dot(r, cam.F), x = dot(r, cam.R), y = dot(r, cam.U), n = dot(r, cam.N);
  return { f, n, dist: Math.hypot(...r), sx: (w + (x / (f * cam.tan)) * h) / 2, sy: (h - (y / (f * cam.tan)) * h) / 2, x, y };
}
function markers(g, w, h, eye, cam) {
  const P = game.P;
  for (let i = Math.min(P.buoys.length - 1, game.next + 1); i >= game.next; i--) {
    const b = P.buoys[i], pr = project([b[0], 0.6, b[1], b[2]], eye, cam, w, h), first = i === game.next;
    const col = Math.abs(pr.n) < 0.9 ? "#ffd27a" : pr.n > 0 ? "#38f2e0" : "#ff66b8", txt = !first ? `${i + 1}` : `${i + 1} · ${Math.round(pr.dist)} m${Math.abs(pr.n) < 0.9 ? "" : ` · ${Math.round(Math.abs(pr.n))} m ${pr.n > 0 ? "ana" : "kata"}`}`; // the one after: just its number
    g.globalAlpha = first ? 1 : 0.55; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = first ? 2 : 1.2; g.font = "11px ui-monospace, Menlo, monospace"; g.textAlign = "center";
    if (pr.f > 0.5 && pr.sx > 0 && pr.sx < w && pr.sy > 30 && pr.sy < h) {
      const rr = Math.max(7, Math.min(28, (2.2 / (pr.f * cam.tan)) * h * 0.5));
      g.beginPath(); g.arc(pr.sx, pr.sy, rr, 0, 2 * Math.PI); g.stroke(); g.fillText(txt, pr.sx, pr.sy - rr - 5);
      if (Math.abs(pr.n) >= 0.9) { g.beginPath(); g.moveTo(pr.sx, pr.sy + (pr.n > 0 ? -rr : rr) * 0.5); g.lineTo(pr.sx, pr.sy + (pr.n > 0 ? rr : -rr) * 0.5); g.stroke(); }
    } else if (first) { // off screen or behind: an arrow at the edge, the way to turn
      const a = Math.atan2(-pr.y, pr.x), cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42, ax = cx + Math.cos(a) * R, ay = Math.min(h - 175, cy + Math.sin(a) * R); // clear of the gauge
      g.beginPath(); g.moveTo(ax + Math.cos(a) * 12, ay + Math.sin(a) * 12); g.lineTo(ax + Math.cos(a + 2.5) * 10, ay + Math.sin(a + 2.5) * 10); g.lineTo(ax + Math.cos(a - 2.5) * 10, ay + Math.sin(a - 2.5) * 10); g.closePath(); g.fill();
      g.fillText(txt, ax - Math.cos(a) * 18, ay - Math.sin(a) * 18);
    }
  }
  g.globalAlpha = 1;
}
function gauge(g, w, h, cam) {
  const R = 46, cx = w / 2, cy = h - R - 34, b = game.boat, e1 = [b.e1[0], 0, b.e1[1], b.e1[2]], e2 = [b.e2[0], 0, b.e2[1], b.e2[2]];
  const across = (v4) => [dot(v4, cam.R), dot(v4, cam.N)], cl = (p) => { const r = Math.hypot(...p); return r > 1 ? p.map((x) => x / r) : p; }, at = (p) => [cx + p[0] * R, cy - p[1] * R];
  g.fillStyle = "rgba(7,8,12,0.45)"; g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  g.font = "10px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillStyle = "#38f2e0"; g.fillText("ana", cx, cy - R - 5); g.fillStyle = "#ff66b8"; g.fillText("kata", cx, cy + R + 12);
  // the next buoy's bearing: where it lies across the bow (centre: dead ahead; the rim: abeam or behind)
  const bq = game.P.buoys[game.next];
  if (bq) { const r = [bq[0] - b.pos[0], 0, bq[1] - b.pos[1], bq[2] - b.pos[2]], lat = across(r), m = Math.hypot(...lat), ang = Math.atan2(m, dot(r, cam.F)) / (Math.PI / 2), p = m > 1e-6 ? lat.map((x) => (x / m) * Math.min(1, ang)) : [0, 0], [hx, hy] = at(p);
    g.strokeStyle = "rgba(255,210,122,0.9)"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(hx, hy - 6); g.lineTo(hx + 6, hy); g.lineTo(hx, hy + 6); g.lineTo(hx - 6, hy); g.closePath(); g.stroke(); }
  // the boat from astern, in the same plane: its hulls (the line across the middle is your slice: a hull off it is out
  // of your sight, ana or kata)
  const kk = 0.62 / 1.4;
  for (const hl of b.B.hulls) { const v4 = add(e1.map((x) => x * hl.o[0]), e2, hl.o[1]), [px, py] = at(across(v4).map((x) => x * kk)), on = Math.abs(dot(v4, cam.N)) < hl.r;
    g.strokeStyle = on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)"; g.lineWidth = 1.2; g.beginPath(); g.arc(px, py, Math.max(3, hl.r * kk * R), 0, 2 * Math.PI); g.stroke();
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(px, py); g.stroke(); }
  // the rudder you ask for (blue ring) and the heel (gold dot; the rim is capsizing)
  const [wx, wy] = at(cl([human.x, human.y])); g.strokeStyle = "#6fe0ff"; g.lineWidth = 1.6; g.beginPath(); g.arc(wx, wy, 7, 0, 2 * Math.PI); g.stroke();
  const hv = across(add(e1.map((x) => x * b.h[0]), e2, b.h[1])).map((x) => x / CAPSIZE), hm = Math.hypot(...hv), [lx, ly] = at(cl(hv));
  g.fillStyle = hm > 0.6 ? "#ff7a6a" : "#ffd27a"; g.beginPath(); g.arc(lx, ly, 5, 0, 2 * Math.PI); g.fill();
}
function mapDraw() {
  const cv = $("map"), dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const P = game.P, all = [P.start.p, ...P.buoys, ...P.islands.flatMap((i) => [add(i.c, [i.r, 0, 0]), add(i.c, [-i.r, 0, 0])])];
  const ya = 0.55, el = 0.62, ca = Math.cos(ya), sa = Math.sin(ya), ce = Math.cos(el), se = Math.sin(el), pr = (q) => { const u = q[0] * ca - q[1] * sa, v = q[0] * sa + q[1] * ca; return [u, -(q[2] * ce - v * se)]; };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const q of all) { const p = pr(q); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const k = Math.min((w - 16) / (x1 - x0 || 1), (h - 16) / (y1 - y0 || 1)), Pm = (q) => { const p = pr(q); return [8 + (p[0] - x0) * k + ((w - 16) - (x1 - x0) * k) / 2, 8 + (p[1] - y0) * k + ((h - 16) - (y1 - y0) * k) / 2]; };
  for (const i of P.islands) { const c = Pm(i.c); g.fillStyle = "rgba(120,170,90,0.6)"; g.beginPath(); g.arc(c[0], c[1], Math.max(2, i.r * k * 0.7), 0, 2 * Math.PI); g.fill(); }
  g.setLineDash([3, 3]); g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1; g.beginPath(); g.moveTo(...Pm(P.start.p)); for (const b of P.buoys) g.lineTo(...Pm(b)); g.stroke(); g.setLineDash([]);
  P.buoys.forEach((b, i) => { const c = Pm(b); g.fillStyle = i < game.next ? "#777" : i === game.next ? "#ffd27a" : "#f2522a"; g.beginPath(); g.arc(c[0], c[1], i === game.next ? 4 : 3, 0, 2 * Math.PI); g.fill(); });
  const c = Pm(game.boat.pos), f = Pm(add(game.boat.pos, game.boat.T, 6)); g.strokeStyle = "#6fe0ff"; g.lineWidth = 2; g.beginPath(); g.moveTo(...c); g.lineTo(...f); g.stroke();
  g.fillStyle = "#6fe0ff"; g.beginPath(); g.arc(c[0], c[1], 3.5, 0, 2 * Math.PI); g.fill();
}

/* ------------------------------------------------------------------ the loop */
let prev = performance.now(), res = 0, lag = 1 / 60;
const FIXED = 1 / (+new URLSearchParams(location.search).get("dt") || Infinity), TAN = 0.85, SUN = unit([0.35, 0.5, -0.75, 0.2]);
function resolution(dt) {
  const coarse = matchMedia("(pointer: coarse)").matches, dpr = Math.min(2, devicePixelRatio || 1), cap = Math.min(dpr, Math.sqrt(1.3e6 / Math.max(1, glc.clientWidth * glc.clientHeight)));
  if (!res) res = cap * (coarse ? 0.55 : 0.75);
  lag += (dt - lag) * 0.1; if (lag > 1 / 32 && res > 0.3) res *= 0.97; else if (lag < 1 / 55 && res < cap) res = Math.min(cap, res * 1.01);
  return Math.round(res * 40) / 40;
}
function step(now) {
  requestAnimationFrame(step);
  const dt = FIXED || Math.min(0.05, (now - prev) / 1000); prev = now;
  if (!game.P) return;
  ask(dt); drawThrottle();
  const b = game.boat, cam0 = camFrame(b.T, b.e1, b.e2), turn3 = add([cam0.R[0], cam0.R[2], cam0.R[3]].map((x) => x * human.x), cam0.ana, human.y);
  if (game.state === "play") {
    b.step(dt, [dot(turn3, b.e1), dot(turn3, b.e2)], throttle, (g) => depthAt(game.P, g)); game.t += dt;
    remember(game.hist, b, game.t);
    if (b.capsized) { game.state = "capsized"; game.capsizes++; game.upAt = now + 1600; }
    const q = game.P.buoys[game.next];
    if (q && Math.hypot(q[0] - b.pos[0], q[1] - b.pos[1], q[2] - b.pos[2]) < GATE) { game.next++; if (game.next === game.P.buoys.length) finish(); }
  } else if (game.state === "capsized" && now > game.upAt) backToCheck();
  const cam = camFrame(b.T, b.e1, b.e2);
  pitch = Math.max(-1.0, Math.min(0.3, pitch - look * 0.0025)); look = 0;
  const p4 = [b.pos[0], 0, b.pos[1], b.pos[2]], eye = add(add(p4, cam.F, -7), UP, 2.6);
  const cp = Math.cos(pitch), sp = Math.sin(pitch), F = add(cam.F.map((v) => v * cp), UP, sp), U = add(UP.map((v) => v * cp), cam.F, -sp);
  // the boat, and the cat standing on its hub
  const parts = b.parts(), fA = parts.f.A, O = parts.f.at([0.05, 0, 0, 0.43]), Mu = [fA[0], fA[3], fA[1], fA[2]], M = Mu.map((r) => r.map((x) => x / CAT_S));
  const P0 = catPose(now / 1000, { idle: true }), nC = Mu.map((r) => dot(r, cam.N)), cC = dot(cam.N, add(eye, O, -1)) / CAT_S, hit = catCut(P0, nC, cC).parts;
  const Pc = { caps: P0.caps.filter((x) => hit.includes(x)), ells: P0.ells.filter((x) => hit.includes(x)), cavity: P0.cavity }, bc = O.map((x, i) => x + Mu.reduce((s, r, k) => s + r[i] * CAT_MID[k] * CAT_S, 0));
  const span = Math.max(...b.B.hulls.map((h) => Math.hypot(...h.o) + h.L / 2 + h.r)) + 0.6;
  Rd.bike(parts, parts.f.at([0, 0, 0, 0.3]), span, b.B.col);
  Rd.cat(Pc, O, M, bc, CAT_BOUND * CAT_S, CAT_K);
  Rd.wake(shells(game.hist, game.t));
  Rd.buoys(game.P.buoys.map((p, i) => ({ p, s: i < game.next ? 3 : i === game.next ? 1 : 2 })));
  Rd.draw({ eye: eye.map((v) => v / 0.5), R: cam.R, U, F, N: cam.N, sun: SUN, time: now / 1000, fae: 0, tan: TAN, far: 440, vs: 0.5 }, resolution(dt));
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  if (game.state !== "menu" && game.state !== "done") { markers(g, w, h, eye, { R: cam.R, U, F, N: cam.N, tan: TAN }); gauge(g, w, h, { R: cam.R, F: cam.F, N: cam.N }); }
  $("barFill").style.width = `${((100 * game.next) / game.P.buoys.length).toFixed(1)}%`;
  const heel = Math.hypot(...b.h) / CAPSIZE, say = game.say && now - game.say.at < 4000 ? ` · <span class="off">${game.say.text}</span>` : "";
  const warn = game.state === "capsized" ? ` · <span class="off">capsized! ${principal(b.H.GM)[1] < 0 ? "this boat can't float upright here" : "back to the last buoy"}</span>` : b.aground ? ` · <span class="off">aground</span>` : heel > 0.6 ? ` · <span class="off">heeling: ease off</span>` : "";
  const info = `${game.label}${game.free ? ` (${game.kind})` : ""} · <b>${b.u.toFixed(1)}</b> m/s · buoy ${Math.min(game.next + 1, game.P.buoys.length)}/${game.P.buoys.length} · ${game.t.toFixed(1)} s${game.par ? ` / par ${game.par.toFixed(1)}` : ""}${warn}${say}`;
  if (info !== step.info) { step.info = info; $("hudInfo").innerHTML = info; }
  setBoatLabel(); mapDraw();
}
function finish() {
  game.state = "done";
  const r = game.par ? game.t / game.par : 2, medal = game.free ? 0 : r <= 1.05 ? 3 : r <= 1.25 ? 2 : 1;
  if (game.index >= 0 && medal) { BEST[game.index] = Math.max(BEST[game.index] || 0, medal); saveBest(); }
  showCard(game.free ? `round, in the ${game.kind}` : `${MEDAL[medal]} round`, game.label, game.free ? "Sailed on another boat than the course's: no medal, just the time." : medal === 3 ? "As quick as the oracle, or near it." : medal === 2 ? "Within a quarter of par." : "Round. There's a quicker line.",
    `${game.t.toFixed(1)} s${game.par ? ` · par ${game.par.toFixed(1)} s` : ""} · ${game.capsizes} capsize${game.capsizes === 1 ? "" : "s"}`, game.index >= 0 && game.index < LEVELS.length - 1);
}

/* ------------------------------------------------------------------ start */
const q = new URLSearchParams(location.search);
if (q.get("seed")) openMade(q.get("tier") || "medium", +q.get("seed"));
else if (q.get("level")) openLevel(Math.max(0, Math.min(LEVELS.length - 1, +q.get("level") - 1)));
else { openLevel(0); menu(); }
requestAnimationFrame(step);
window.WAKE = { game, human, openLevel, openMade, menu, LEVELS, setThrottle: (t) => { throttle = t; },
  // for tests: run the boat on for s seconds with a rudder and throttle, as the loop would, without drawing
  advance: (s, turn = [0, 0], thr = throttle) => { for (let i = 0; i < s * 60 && !game.boat.capsized; i++) { game.boat.step(1 / 60, turn, thr, (g) => depthAt(game.P, g)); game.t += 1 / 60; remember(game.hist, game.boat, game.t); } } };
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); });
