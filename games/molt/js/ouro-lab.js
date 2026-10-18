/* Ouroboros lab — the page: the clock, the input, the rules, the log. The
   rules of the world are js/ouro.js; the drawing is Molt's own (js/view.js),
   handed a new world every step. */
import { Ouro, O_, DEFAULTS, autopilot } from "./ouro.js";
import { View, V_ } from "./view.js";
import { tokens } from "./duct.js";

const $ = (id) => document.getElementById(id);
const view = new View($("view"));
const RULES = { ground: ["skin", "space"], body: ["retrace", "carry"], shrink: ["keep", "body"], bite: ["cut", "die"], grain: ["3", "2", "1"], speed: ["320", "180", "110"] };
const BASE = { ...DEFAULTS, grain: String(O_.C), speed: String(O_.TICK) };
const rules = { ...BASE };
const params = new URLSearchParams(location.search);
for (const k of Object.keys(RULES)) if (RULES[k].includes(params.get(k))) rules[k] = params.get(k);
let seed = +params.get("seed") || ((Date.now() % 2147483646) + 1);
let g, acc = 0, last = 0, running = false, auto = false, noteT = 0, lastWord = "";
/* how far out the camera sits. ride, far and high all ride your head (up the screen is still the way you're going,
   so the arrows still steer); whole is the whole world from outside, for watching. A wheel or a pinch fine-tunes. */
const ZOOMS = [["ride", 1], ["far", 2.6], ["high", 5], ["whole", 0]];
let zi = 0, zoom = 1;
try { const z = +localStorage.getItem("ouro.zoom"); if (z >= 0 && z < ZOOMS.length) zi = z; } catch (e) { /* private mode */ }
zoom = ZOOMS[zi][1] || 1;
const LEAD = V_.TLEAD, TILT = V_.TTILT;
V_.WINDOW = 1e9;                                    // these worlds are small: draw all of it, however far out
const queue = [];
const touch = matchMedia("(hover: none)").matches;
let pad = touch;
try { const p = localStorage.getItem("molt.pad"); if (p != null) pad = p === "1"; } catch (e) { /* private mode */ }
let arnd = 7;
const rnd = () => (arnd = (arnd * 16807) % 2147483647) / 2147483647;

function newRun() {
  g = new Ouro(seed, { ground: rules.ground, body: rules.body, shrink: rules.shrink, bite: rules.bite, C: +rules.grain });
  arnd = seed % 1000 + 7;
  view.setWorld(g.world, g); view.mix = wide() ? 1 : 0; queue.length = 0; acc = 0;
  clearLog(); lastWord = "";
  hud(); share();
}
function share() {
  const q = new URLSearchParams();
  for (const k of Object.keys(RULES)) if (rules[k] !== BASE[k]) q.set(k, rules[k]);
  q.set("seed", seed);
  history.replaceState(null, "", "?" + q.toString());
}
function note(t) { const el = $("note"); el.textContent = t; el.classList.add("show"); clearTimeout(noteT); noteT = setTimeout(() => el.classList.remove("show"), 2200); }
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* no haptics */ } }
function hud() {
  $("ticks").textContent = g.ticks; $("len").textContent = g.body.length + (g.maxLength > g.body.length ? " (" + g.maxLength + ")" : "");
  $("cuts").textContent = g.cuts; $("eaten").textContent = g.eaten;
  $("world").textContent = g.world.L + " cubes · " + g.world.N + " cells";
  // the word: the world's bends, tail to head
  const w = g.word.join("");
  if (w !== lastWord) {
    const el = $("word"), parts = g.word.length ? g.word : [];
    el.innerHTML = "<span>▸</span>" + parts.map((t, i) => `<span class="${t.length > 1 ? "p" : t !== "S" ? "b" : ""}${i === parts.length - 1 ? " new" : ""}">${t}</span>`).join("") + "<span>◉</span>";
    lastWord = w;
  }
}
/* the log: tap a line (or its ×) to dismiss it; cuts fade on their own after a while, a death stays till you dismiss it */
function log(e) {
  if (e.kind === "eat") return;
  const li = document.createElement("li"); li.className = e.kind;
  const x = document.createElement("button"); x.type = "button"; x.className = "x"; x.textContent = "×"; x.setAttribute("aria-label", "dismiss");
  li.innerHTML = `<b>${e.tick}</b>`; li.append(e.text, x);
  const gone = () => { li.classList.add("gone"); setTimeout(() => li.remove(), 250); };
  li.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); gone(); });
  if (e.kind !== "dead") setTimeout(gone, 9000);
  const el = $("log"); el.prepend(li); while (el.children.length > 4) el.lastChild.remove();
}
function clearLog() { $("log").innerHTML = ""; }
function over() {
  running = false; $("play").textContent = "▶";
  const head = { fell: "you fell", bitten: "bitten" }[g.cause] || "over";
  $("o-head").textContent = head + " at step " + g.ticks;
  $("o-len").textContent = g.maxLength;
  const why = g.cause === "fell" ? "You were cut, the world lost as many cubes off its tail end, and the ground under your head went with them. (Stay towards the world's head end, or let the world keep its length.)" : "You ran into yourself.";
  $("o-text").textContent = `${why} Longest ${g.maxLength}; ${g.eaten} eaten, ${g.cuts} cut${g.cuts === 1 ? "" : "s"}, ${g.lostToFood} cells of you left lying as food.`;
  $("over").hidden = false;
}

function step() {
  if (auto) autopilot(g, rnd);
  else while (queue.length) { const s = view.sideFor(g, queue.shift()); if (s >= 0) { g.steer(s); break; } }
  g.tick();
  view.setWorld(g.world);
  for (const e of g.events) {
    log(e);
    if (e.kind === "eat") buzz(8);
    if (e.kind === "cut") buzz([20, 20, 20]);
    if (e.kind === "dead") { buzz([40, 30, 40]); over(); }
  }
  hud();
}
function loop(now) {
  const dt = Math.min(100, now - (last || now)); last = now;
  const tick = +rules.speed;
  if (running && g.alive) { acc += dt; while (acc >= tick && g.alive) { acc -= tick; step(); } }
  view.track(g, running ? Math.min(1, acc / tick) : 1, dt);
  // ease the camera out (or in) to where it's asked to be, and towards the whole world
  view.zoom += (zoom - view.zoom) * (1 - Math.exp(-dt / 140));
  // further out, look less far ahead and more straight down, so the head stays near the middle
  V_.TLEAD = LEAD / view.zoom; V_.TTILT = TILT / Math.sqrt(view.zoom);
  const want = wide() ? 1 : 0;
  view.mix += (want - view.mix) * (1 - Math.exp(-dt / 160));
  if (Math.abs(view.mix - want) < 0.002) view.mix = want;
  view.drawTube(g, now);
  view.drawMini(g);
  requestAnimationFrame(loop);
}

/* ---- input: arrows / WASD, swipes, the pad; the lab's own keys */
const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", D: "right" };
function push(dir) { if (!g.alive) return; if (auto) setAuto(false); if (queue.length < 2 && queue[queue.length - 1] !== dir) queue.push(dir); }
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || (e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)))) return;
  if (KEYS[e.key]) { e.preventDefault(); push(KEYS[e.key]); }
  else if (e.key === " ") { e.preventDefault(); $("play").click(); }
  else if (e.key === "." || e.key === "n") $("stepbtn").click();
  else if (e.key === "v" || e.key === "V") $("viewbtn").click();
  else if (e.key === "+" || e.key === "=") nudge(1 / 1.25);
  else if (e.key === "-" || e.key === "_") nudge(1.25);
  else if (e.key === "Escape") clearLog();
  else if (e.key === "A") $("autobtn").click();
});
let anchor = null, pinch = null;
const SWIPE = 22, fingers = new Map();
const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
$("view").addEventListener("pointerdown", (e) => {
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); $("view").setPointerCapture(e.pointerId);
  if (fingers.size === 2) { anchor = null; pinch = { d: spread(), z: zoom }; } else anchor = { x: e.clientX, y: e.clientY, last: null };
});
$("view").addEventListener("pointermove", (e) => {
  if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && fingers.size === 2) { setZoom(pinch.z * pinch.d / Math.max(10, spread())); return; }
  if (!anchor) return;
  const dx = e.clientX - anchor.x, dy = e.clientY - anchor.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  if (dir !== anchor.last) { push(dir); anchor.last = dir; }
  anchor.x = e.clientX; anchor.y = e.clientY;
});
const end = (e) => { fingers.delete(e.pointerId); if (fingers.size < 2) pinch = null; anchor = null; };
$("view").addEventListener("wheel", (e) => { e.preventDefault(); nudge(Math.exp(e.deltaY * 0.0015)); }, { passive: false });
$("view").addEventListener("pointerup", end); $("view").addEventListener("pointercancel", end);
for (const b of document.querySelectorAll("#pad button")) {
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); push(b.dataset.dir); b.classList.add("hit"); setTimeout(() => b.classList.remove("hit"), 120); });
}
function padState() { document.body.classList.toggle("pad", pad); $("padbtn").classList.toggle("on", pad); }
$("padbtn").onclick = () => { pad = !pad; padState(); try { localStorage.setItem("molt.pad", pad ? "1" : "0"); } catch (e) { /* private mode */ } };
function setAuto(v) { auto = v; $("autobtn").classList.toggle("on", auto); }
$("autobtn").onclick = () => setAuto(!auto);
function wide() { return ZOOMS[zi][1] === 0; }
function setZoom(z) { zoom = Math.max(0.7, Math.min(9, z)); if (wide()) { zi = 0; zoomState(); } }
function nudge(f) { if (wide()) return; setZoom(zoom * f); }
function zoomState() { $("viewbtn").textContent = ZOOMS[zi][0]; $("viewbtn").classList.toggle("on", zi > 0); }
$("viewbtn").onclick = () => {
  zi = (zi + 1) % ZOOMS.length; if (!wide()) zoom = ZOOMS[zi][1];
  zoomState(); try { localStorage.setItem("ouro.zoom", String(zi)); } catch (e) { /* private mode */ }
  note(wide() ? "the whole world, from outside (the arrows still steer from your head)" : ZOOMS[zi][0] + ": riding your head, " + ZOOMS[zi][1] + "× out");
};
$("play").onclick = () => { if (!g.alive) return; running = !running; $("play").textContent = running ? "❚❚" : "▶"; };
$("stepbtn").onclick = () => { if (!g.alive) return; running = false; $("play").textContent = "▶"; acc = 0; step(); };
$("help").onclick = () => { running = false; $("play").textContent = "▶"; $("start").hidden = false; };
const startRun = () => { $("start").hidden = true; if (!g.alive) newRun(); running = true; $("play").textContent = "❚❚"; last = 0; };
$("go").onclick = () => { setAuto(false); startRun(); };
$("watch").onclick = () => { setAuto(true); startRun(); };
$("again").onclick = () => { $("over").hidden = true; seed = (Date.now() % 2147483646) + 1; newRun(); running = true; $("play").textContent = "❚❚"; last = 0; };

/* the rules drawer */
function ruleState() { for (const el of document.querySelectorAll(".seg")) for (const b of el.children) b.classList.toggle("on", rules[el.dataset.rule] === b.dataset.v); }
for (const el of document.querySelectorAll(".seg")) for (const b of el.children) b.onclick = () => {
  const k = el.dataset.rule; if (rules[k] === b.dataset.v) return;
  rules[k] = b.dataset.v; ruleState();
  if (k !== "speed") { newRun(); $("over").hidden = true; } else share();
};
const openRules = () => { running = false; $("play").textContent = "▶"; $("over").hidden = true; $("rules").hidden = false; };
$("rulesbtn").onclick = openRules; $("o-rules").onclick = openRules;
$("rulesgo").onclick = () => { $("rules").hidden = true; if (!g.alive) newRun(); running = true; $("play").textContent = "❚❚"; last = 0; };
document.addEventListener("visibilitychange", () => { if (document.hidden && running) $("play").click(); });
window.addEventListener("resize", () => { view.resize(); view.setWorld(g.world); });

padState(); ruleState(); zoomState();
newRun();
requestAnimationFrame(loop);
window.OURO = { get g() { return g; }, view, step, push, rules, tokens };
