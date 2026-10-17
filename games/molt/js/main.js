/* Molt — the page: the clock, the input, the molt sequence. The rules are
   js/game.js, the world js/duct.js, the camera and drawing js/view.js. */
import { Game, M_ } from "./game.js";
import { View } from "./view.js";
import { bends } from "./duct.js";

const $ = (id) => document.getElementById(id);
const view = new View($("view"));
let g, acc = 0, last = 0, running = false, best = 0, noteT = 0, seq = null, runSeed = 1, posted = false;
let mine = { score: 0, length: 0, depth: 0 };
try { mine = Object.assign(mine, JSON.parse(localStorage.getItem("molt.mine") || "{}")); } catch (e) { /* private mode */ }
const queue = [];                                   // screen directions waiting for their tick (two at most)
try { best = +localStorage.getItem("molt.best") || 0; } catch (e) { /* private mode */ }
mine.score = Math.max(mine.score, best);
const touch = matchMedia("(hover: none)").matches;
let pad = touch;
try { const p = localStorage.getItem("molt.pad"); if (p != null) pad = p === "1"; const v = localStorage.getItem("molt.view"); if (v === "net" || v === "tube") view.mode = v; } catch (e) { /* private mode */ }

function newGame() {
  runSeed = (Date.now() % 2147483646) + 1; posted = false;
  g = new Game(runSeed);
  view.setWorld(g.world, g); queue.length = 0; acc = 0; seq = null; view.mix = 0; view.zoom = 1;
  hud();
}
function note(t) { const el = $("note"); el.textContent = t; el.classList.add("show"); clearTimeout(noteT); noteT = setTimeout(() => el.classList.remove("show"), 1600); }
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* no haptics */ } }
function hud() {
  $("depth").textContent = g.depth; $("len").textContent = g.body.length; $("score").textContent = g.score; $("best").textContent = Math.max(best, g.score) || "—";
  $("world").textContent = g.world.N + " cells" + (g.depth ? " · " + bends(g.world.word) + " bends" : "");
  const m = $("molt");
  if (g.canMolt && !seq) { m.hidden = false; const p = g.preview(); $("molt-sub").textContent = "→ " + p.cells + " cells, " + p.bends + " bend" + (p.bends === 1 ? "" : "s"); }
  else if (!seq) { m.hidden = true; }
}
function over() {
  running = false;
  if (g.score > best) { best = g.score; try { localStorage.setItem("molt.best", String(best)); } catch (e) { /* private mode */ } }
  $("o-head").textContent = "bitten at depth " + g.depth;
  $("o-score").textContent = g.score;
  const molts = g.history.map((h) => h.length).join(" → ");
  $("o-text").textContent = `${g.eaten} eaten, ${g.ticks} steps, ${g.maxLength} long at your longest.` + (g.history.length ? ` You molted at length ${molts}.` : " You never molted.");
  // this browser's bests on each board
  const news = [];
  if (g.score > mine.score) { mine.score = g.score; news.push("score"); }
  if (g.maxLength > mine.length) { mine.length = g.maxLength; news.push("longest snake"); }
  if (g.depth > mine.depth) { mine.depth = g.depth; news.push("deepest"); }
  try { localStorage.setItem("molt.mine", JSON.stringify(mine)); } catch (e) { /* private mode */ }
  $("o-mine").textContent = (news.length ? "new best: " + news.join(", ") + ". " : "") + `Your bests: ${mine.score} points, ${mine.length} long, depth ${mine.depth}.`;
  offerable();
  $("over").hidden = false;
}
/* the boards load on their own (they need the vendored auth client); their buttons show once they're there */
const board = () => window.MOLT_BOARD || null;
function offerable() { const b = !!board(); $("trophy").hidden = $("o-board").hidden = !b; $("post").hidden = !b || !g || g.alive || !g.score; $("post").disabled = posted; }
window.addEventListener("molt-board", offerable);
function postRun() {
  const b = board(); if (!b || g.alive || !g.score || posted) return;
  posted = true; $("post").disabled = true;
  b.offer({ sel: { metric: "score" }, value: g.score, seed: runSeed, steps: g.ticks, eaten: g.eaten, longest: g.maxLength, depth: g.depth, at: Date.now() });
}

/* the molt: dive into the head, swap worlds, show the new one whole (your old body), swoop down to the new head */
const MOLT_T = { dive: 650, show: 1500, swoop: 1100 };
function molt() {
  if (!g.canMolt || seq) return;
  seq = { t: 0, phase: "dive" }; $("molt").hidden = true; queue.length = 0; buzz(30);
}
function stepMolt(dt) {
  seq.t += dt;
  if (seq.phase === "dive") {
    const k = Math.min(1, seq.t / MOLT_T.dive); view.zoom = view.mode === "tube" ? 1 - 0.88 * k * k : 1 + 9 * k * k * k; seq.fade = k * k;
    if (k >= 1) {
      const from = g.body.length;
      g.molt(); view.setWorld(g.world, g); view.zoom = 1; view.mix = 1;
      seq = { t: 0, phase: "show", fade: 1 };
      const b = $("banner"); b.innerHTML = "DEPTH " + g.depth + "<small>this world is the snake you just were: " + from + " long, " + bends(g.world.word) + " bends, " + g.world.N + " cells</small>"; b.hidden = false;
      hud();
    }
  } else if (seq.phase === "show") {
    seq.fade = Math.max(0, 1 - seq.t / 300);
    if (seq.t >= MOLT_T.show) { seq = { t: 0, phase: "swoop" }; $("banner").hidden = true; }
  } else {
    const k = Math.min(1, seq.t / MOLT_T.swoop); view.mix = 1 - k;
    if (k >= 1) { seq = null; view.mix = 0; acc = 0; hud(); note("depth " + g.depth + ": food is worth " + (g.depth + 1)); }
  }
}

function loop(now) {
  const dt = Math.min(100, now - (last || now)); last = now;
  if (running && seq) stepMolt(dt);
  else if (running && g.alive) {
    acc += dt;
    while (acc >= M_.TICK && g.alive) {
      acc -= M_.TICK;
      // the next queued direction, as a side of the head's cell, in the camera's frame as it stands
      while (queue.length) { const s = view.sideFor(g, queue.shift()); if (s >= 0) { g.steer(s); break; } }
      g.tick();
      for (const e of g.events) { if (e.kind === "eat") buzz(8); if (e.kind === "dead") { buzz([40, 30, 40]); over(); } }
      hud();
    }
  }
  const f = running && !seq ? Math.min(1, acc / M_.TICK) : 1;
  view.track(g, f, dt);
  if (seq && seq.phase !== "dive") {
    view.drawTube(g, now);
    if (view.mode === "net" && seq.phase === "swoop" && view.mix < 0.4) view.drawNet(g, now, 1 - view.mix / 0.4);   // the net fades in as the camera lands
  } else if (view.mode === "tube") view.drawTube(g, now);
  else view.drawNet(g, now);
  if (!seq) view.drawMini(g);
  if (seq && seq.fade) { const c = view.ctx; c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); c.fillStyle = `rgba(5,6,10,${seq.fade})`; c.fillRect(0, 0, view.w, view.h); }
  requestAnimationFrame(loop);
}

/* ---- input: arrows / WASD, swipes (no need to lift between turns), the pad */
const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };
function push(dir) { if (!running || seq || !g.alive) return; if (queue.length < 2 && queue[queue.length - 1] !== dir) queue.push(dir); }
window.addEventListener("keydown", (e) => {
  // keys typed into a field (the leaderboard's handle) belong to the field, not the game; and leave browser shortcuts alone
  if (e.ctrlKey || e.metaKey || e.altKey || (e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)))) return;
  if (KEYS[e.key]) { e.preventDefault(); push(KEYS[e.key]); }
  else if (e.key === " ") { e.preventDefault(); $("play").click(); }
  else if (e.key === "m" || e.key === "M") molt();
  else if (e.key === "v" || e.key === "V") $("viewbtn").click();
});
let anchor = null;
const SWIPE = 22;
$("view").addEventListener("pointerdown", (e) => { anchor = { x: e.clientX, y: e.clientY, last: null }; $("view").setPointerCapture(e.pointerId); });
$("view").addEventListener("pointermove", (e) => {
  if (!anchor) return;
  const dx = e.clientX - anchor.x, dy = e.clientY - anchor.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  if (dir !== anchor.last) { push(dir); anchor.last = dir; }
  anchor.x = e.clientX; anchor.y = e.clientY;            // keep going: the next turn is measured from here
});
const end = () => { anchor = null; };
$("view").addEventListener("pointerup", end); $("view").addEventListener("pointercancel", end);
for (const b of document.querySelectorAll("#pad button")) {
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); push(b.dataset.dir); b.classList.add("hit"); setTimeout(() => b.classList.remove("hit"), 120); });
}
function padState() { document.body.classList.toggle("pad", pad); $("padbtn").classList.toggle("on", pad); }
$("padbtn").onclick = () => { pad = !pad; padState(); try { localStorage.setItem("molt.pad", pad ? "1" : "0"); } catch (e) { /* private mode */ } };
$("molt").onclick = molt;
$("post").onclick = postRun;
$("o-board").onclick = () => { const b = board(); if (b) b.open({ metric: "score" }); };
$("trophy").onclick = () => { const b = board(); if (!b) return; if (running) $("play").click(); b.open({ metric: "score" }); };
function viewState() { $("viewbtn").textContent = view.mode === "tube" ? "net" : "tube"; }
$("viewbtn").onclick = () => { view.mode = view.mode === "tube" ? "net" : "tube"; queue.length = 0; viewState(); try { localStorage.setItem("molt.view", view.mode); } catch (e) { /* private mode */ } };
$("play").onclick = () => { if (!g.alive) return; running = !running; $("play").textContent = running ? "❚❚" : "▶"; };
$("help").onclick = () => { running = false; $("play").textContent = "▶"; $("start").hidden = false; };
$("go").onclick = () => { $("start").hidden = true; if (!g.alive) newGame(); running = true; $("play").textContent = "❚❚"; last = 0; };
$("again").onclick = () => { $("over").hidden = true; newGame(); running = true; last = 0; };
document.addEventListener("visibilitychange", () => { if (document.hidden && running) $("play").click(); });
window.addEventListener("resize", () => { view.resize(); view.setWorld(g.world, g); });

padState(); viewState();
newGame(); offerable();
requestAnimationFrame(loop);
window.MOLT = { get g() { return g; }, view, molt, push, set running(v) { running = v; } };
