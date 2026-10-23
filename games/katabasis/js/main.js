/* KATABASIS — the page: walk a cave in four dimensions, and flip.
   The rules are ./cave.js (the solver's own), the drawing ./render.js, the levels ./levels.js. You move
   continuously, as a box against the voxels; a flip snaps you to the whole-voxel position you're nearest
   and asks the rules (flipFrom) whether it's allowed and where you'll land, so you can never flip where the
   solver couldn't. Your view turns freely in the three directions that aren't up (./body.js: turn, in a
   plane tilted into w, and twist), and a flip puts under you the wall nearest the way you name. */
import { ORIENTATIONS, FLIP_R, axisVec, Cave } from "./cave.js";
import { LEVELS, build } from "./levels.js";
import { Renderer } from "./render.js";
import { Body, SPEED, TILT, turn, twist, tip, tidy, flipUp } from "./body.js";
import { decorate } from "./grotto.js";
import { seedOf } from "./gen.js";

const $ = (id) => document.getElementById(id);
const glc = $("gl");
let Rd;
try { Rd = new Renderer(glc); } catch (e) { $("start").innerHTML = `<h1>KATABASIS</h1><p>This needs WebGL2: ${String(e.message || e)}</p>`; throw e; }

const EYE = 1.5; // your eye, up from your centre (you're 4 voxels tall)
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);
const Q = new URLSearchParams(location.search), tilt = Q.has("tilt") ? (+Q.get("tilt") * Math.PI) / 180 : TILT; // ?tilt=30: a gentler lean into w
const TWIST = 1.1; // radians a second, held

/* ------------------------------------------------------------- the run */
let lv = null, cave = null, me = null; // lv: the cave you're in ({ cave, start, par, line, title, key, deco }); me: your Body, your view frame fr (R, U, F, N), pitch, and whether you've won
let src = { kind: "level", i: 0 }; // where it came from: a level, a made cave (tier, seed), or the day's
const best = (() => { try { return JSON.parse(localStorage.getItem("katabasis.best") || "{}"); } catch (e) { return {}; } })();
function play(L, from) {
  lv = L; src = from; cave = L.cave; Rd.load(cave, decorate(cave, L.deco));
  const O = ORIENTATIONS[0], fr = { R: axisVec(O, 0), U: axisVec(O, 1), F: axisVec(O, 2), N: axisVec(O, 3) };
  me = Object.assign(new Body(cave, L.start.c, 0), { fr, pitch: -0.15, won: false });
  $("lvl").textContent = L.title; $("line").textContent = L.line; $("won").hidden = true; hud(); link();
}
function load(i) {
  const li = (i + LEVELS.length) % LEVELS.length, L = LEVELS[li], b = build(L);
  play({ cave: b.cave, start: b.start, par: L.par, line: L.line, title: `${li + 1}. ${L.name}`, key: L.name, deco: li * 97 + 13 }, { kind: "level", i: li });
}
const restart = () => play(lv, src);
function next() {
  if (src.kind === "level" && src.i + 1 < LEVELS.length) load(src.i + 1);
  else made(src.kind === "gen" ? src.tier : src.kind === "daily" ? "hard" : "medium");
}
/* made caves: carved in a worker (./gen-worker.js), proved there, and played when they arrive */
let worker = null, asked = 0;
try { worker = new Worker(new URL("./gen-worker.js", import.meta.url), { type: "module" }); worker.onmessage = (e) => arrived(e.data); } catch (e) { worker = null; }
const today = () => new Date().toISOString().slice(0, 10);
function made(tier, seed = (Math.random() * 4294967296) >>> 0, daily = null) {
  const id = ++asked, msg = { id, tier, seed, daily };
  $("carving").hidden = !$("start").hidden; $("carving").textContent = daily ? `carving today's cave…` : `carving a ${tier} cave…`;
  pending.set(id, msg);
  if (worker) worker.postMessage({ id, tier, seed });
  else import("./gen.js").then(({ generate }) => { const g = generate(tier, seed); arrived(g ? { id, dims: g.cave.dims, v: g.cave.v.buffer, start: g.start, par: g.par, line: g.line, tier, seed } : { id, fail: true }); });
}
const pending = new Map();
function arrived(d) {
  const m = pending.get(d.id); pending.delete(d.id);
  if (!m || d.id !== asked) return; // something newer was asked for
  if (d.fail) { made(m.tier, (m.seed + 1) >>> 0, m.daily); return; }
  $("carving").hidden = true;
  const c = new Cave(...d.dims); c.v = new Uint8Array(d.v);
  const s36 = m.seed.toString(36), title = m.daily ? `today · ${m.daily}` : `made · ${m.tier}`;
  play({ cave: c, start: d.start, par: d.par, line: m.daily ? d.line.replace("A made cave.", "Today's cave, the same for everyone.") : d.line, title, key: m.daily ? `daily:${m.daily}` : `gen:${m.tier}.${s36}`, deco: m.seed }, m.daily ? { kind: "daily", date: m.daily } : { kind: "gen", tier: m.tier, seed: m.seed });
}
const daily = (date = today()) => made("hard", seedOf("katabasis " + date), date);
/* the address bar names the cave you're in, so a link to it is the cave */
function link() {
  const P = new URLSearchParams(location.search); for (const k of ["gen", "daily", "level"]) P.delete(k);
  if (src.kind === "gen") P.set("gen", `${src.tier}.${src.seed.toString(36)}`); else if (src.kind === "daily") P.set("daily", src.date); else if (src.i) P.set("level", String(src.i + 1));
  const q = P.toString(); try { history.replaceState(null, "", location.pathname + (q ? "?" + q.replace(/%2C/g, ",") : "")); } catch (e) { /* fine */ }
}
function walk(dt, mv) { // your stick as a world velocity: where you face, w and all
  me.move(dt, add(me.fr.F.map((v) => v * mv[1] * SPEED), me.fr.R, mv[0] * SPEED));
  if (me.atGoal()) win();
  if (me.p.some((v, i) => v < -20 || v > cave.dims[i] + 20)) restart();
}
function tryFlip(name) {
  if (!me || me.won) return;
  const why = me.tryFlipTo(flipUp(me.fr, name), name);
  if (why === "ground") say("stand still on solid ground to flip");
  else if (why === "room") say(`no room to flip: you need ${(2 * FLIP_R).toFixed(1)} voxels clear all round you, w included`);
  hud();
}

/* ------------------------------------------------------------- input */
const keys = new Set(); let look = { x: 0, y: 0 }, stick = null, twisting = 0;
const FLIPKEYS = { arrowup: "ahead", arrowdown: "behind", arrowleft: "left", arrowright: "right", q: "kata", e: "ana" };
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
  const k = e.key.toLowerCase();
  if (!$("start").hidden && (k === "enter" || k === " ")) { e.preventDefault(); go(); return; }
  if (FLIPKEYS[k]) { e.preventDefault(); if (!e.repeat) tryFlip(FLIPKEYS[k]); return; }
  if (k === "r") { restart(); return; }
  if (k === "n" && me && me.won) { next(); return; }
  if (["w", "a", "s", "d", "z", "c"].includes(k)) { e.preventDefault(); keys.add(k); }
});
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
const coarse = matchMedia("(pointer: coarse)").matches;
glc.addEventListener("click", () => { if (!coarse && $("start").hidden && document.pointerLockElement !== glc) { try { const r = glc.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* keys still work */ } } });
document.addEventListener("mousemove", (e) => { if (document.pointerLockElement === glc) { look.x += e.movementX; look.y += e.movementY; } });
// touch: a stick on the left walks; dragging anywhere else looks
const STICK_R = 52, stickEl = $("stick"), knob = $("knob"), drags = new Map();
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
  if (g.stick) { const dx = e.clientX - g.cx, dy = e.clientY - g.cy, m = Math.hypot(dx, dy), k = m > STICK_R ? STICK_R / m : 1; knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`; stick = m < 6 ? null : [dx * k / STICK_R, -dy * k / STICK_R]; }
  else { look.x += (e.clientX - g.x) * 1.6; look.y += (e.clientY - g.y) * 1.6; g.x = e.clientX; g.y = e.clientY; }
}
glc.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") move(e); });
for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) glc.addEventListener(ev, (e) => { const g = drags.get(e.pointerId); drags.delete(e.pointerId); if (g && g.stick) { stick = null; stickEl.classList.remove("live"); knob.style.transform = ""; } });
for (const b of document.querySelectorAll("#flips button[data-f]")) b.addEventListener("pointerdown", (e) => { e.preventDefault(); tryFlip(b.dataset.f); });
for (const b of document.querySelectorAll("#flips button[data-t]")) {
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } twisting = +b.dataset.t; });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(ev, () => { twisting = 0; });
}

/* ------------------------------------------------------------- the loop */
let msgT = 0;
function say(m) { $("msg").textContent = m; $("msg").classList.add("show"); clearTimeout(msgT); msgT = setTimeout(() => $("msg").classList.remove("show"), 2200); }
function hud() { if (!me) return; $("flipsN").textContent = me.flips; $("par").textContent = lv.par; $("upIs").textContent = upName(); }
function upName() { const [a, s] = ORIENTATIONS[me.flip ? me.flip.o2 : me.o][1]; return (s > 0 ? "+" : "−") + "xyzw"[a]; }
let wWas = "";
function wName() { // the grid direction your w is nearest, and how far it leans off it
  const N = me.fr.N; let a = 0; for (let i = 1; i < 4; i++) if (Math.abs(N[i]) > Math.abs(N[a])) a = i;
  const off = Math.round((Math.acos(Math.min(1, Math.abs(N[a]))) * 180) / Math.PI);
  return (N[a] > 0 ? "+" : "−") + "xyzw"[a] + (off >= 2 ? ` ${off}°` : "");
}
function win() {
  if (me.won) return; me.won = true; flash = 1;
  const k = lv.key, prev = best[k]; if (prev === undefined || me.flips < prev) { best[k] = me.flips; try { localStorage.setItem("katabasis.best", JSON.stringify(best)); } catch (e) { /* private */ } }
  $("won-text").textContent = `${me.flips} flip${me.flips === 1 ? "" : "s"} · par ${lv.par}` + (me.flips === lv.par ? " · at par" : "");
  $("won").hidden = false;
}
let res = 0, lag = 0, resN = 0, waits = 0, fence = null, flash = 0, prev = performance.now(), frames = 0, simT = 0;
const FIXED = 1 / (+new URLSearchParams(location.search).get("dt") || Infinity); // ?dt=24: a fixed 1/24 s a frame (the attract loop films in time-lapse)
const queue = []; // things to do at a time on the game's own clock (the attract loop's script)
function resolution(w) {
  const dpr = Math.min(2, devicePixelRatio || 1), cap = Math.min(dpr, Math.sqrt(1.4e6 / Math.max(1, glc.clientWidth * glc.clientHeight)));
  if (!res) res = cap * (coarse ? 0.6 : 0.8);
  lag += (w - lag) * 0.25;
  if (++resN >= 6) { resN = 0; if (lag > 0.35 && res > 0.35) res = Math.max(0.35, res * (lag > 1.5 ? 0.75 : 0.88)); else if (lag < 0.08 && res < cap) res = Math.min(cap, res * 1.05); }
  return Math.round(res * 40) / 40;
}
function step(now) {
  requestAnimationFrame(step);
  if (FIXED && fence && Rd.gl.getSyncParameter(fence, Rd.gl.SYNC_STATUS) !== Rd.gl.SIGNALED) { waits++; return; }
  const dt = FIXED || Math.min(0.05, (now - prev) / 1000); prev = now; simT += dt;
  while (queue.length && queue[0].t <= simT) queue.shift().fn();
  if (me && $("start").hidden) {
    // look: turn (round your up, leaning into w), twist (right toward w), pitch toward your up. Not mid-flip:
    // the flip carries your frame
    if (!me.flip) {
      const tw = twisting || (keys.has("c") ? 1 : 0) - (keys.has("z") ? 1 : 0);
      if (look.x) me.fr = turn(me.fr, look.x * 0.0028, tilt);
      if (tw) me.fr = twist(me.fr, tw * TWIST * dt);
      if (look.x || tw) me.fr = tidy(me.fr);
    }
    me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - look.y * 0.0028)); look.x = look.y = 0;
    if (!me.won) {
      let mv = [0, 0]; if (keys.has("w")) mv[1] += 1; if (keys.has("s")) mv[1] -= 1; if (keys.has("d")) mv[0] += 1; if (keys.has("a")) mv[0] -= 1;
      if (stick) mv = stick; const m = Math.hypot(...mv); if (m > 1) mv = mv.map((v) => v / m);
      const was = me.flip; walk(dt, mv);
      if (was && !me.flip) { me.fr = tidy(tip(me.fr, was.U0, was.U1, Math.PI / 2)); hud(); } // landed: your frame keeps the whole tip
    }
  }
  if (!me) return;
  flash = Math.max(0, flash - dt * 1.5);
  const gl = Rd.gl;
  if (fence) { if (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) { waits++; return; } gl.deleteSync(fence); fence = null; }
  const f = me.frame(), v = f.th ? tip(me.fr, f.U0, f.U1, f.th) : me.fr, cp = Math.cos(me.pitch), sp = Math.sin(me.pitch);
  const camF = add(v.F.map((x) => x * cp), v.U, sp), camU = add(v.U.map((x) => x * cp), v.F, -sp);
  Rd.draw({ eye: add(f.ctr, v.U, EYE), R: v.R, U: camU, F: camF, up: v.U, time: now / 1000, flash }, resolution(waits)); waits = 0;
  const wn = wName(); if (wn !== wWas) { wWas = wn; $("wIs").textContent = wn; }
  fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); frames++;
}
requestAnimationFrame(step);

/* ------------------------------------------------------------- screens */
function go() { $("start").hidden = true; if (pending.size) $("carving").hidden = false; else if (!me) load(0); if (!coarse) { try { const r = glc.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* fine */ } } }
$("go").onclick = go;
$("next").onclick = next;
$("again").onclick = restart;
$("restart").onclick = restart;
const button = (box, text, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "ghost small"; b.textContent = text; b.onclick = () => { fn(); go(); }; $(box).appendChild(b); };
LEVELS.forEach((L, i) => button("levels", `${i + 1}. ${L.name}`, () => load(i)));
button("made", "today's cave", () => daily());
for (const t of ["easy", "medium", "hard"]) button("made", `made · ${t}`, () => made(t));
// a link to a cave opens it
{
  const g = /^(easy|medium|hard)\.([0-9a-z]{1,7})$/.exec(Q.get("gen") || ""), d = Q.get("daily"), n = +Q.get("level");
  if (g) made(g[1], parseInt(g[2], 36) >>> 0);
  else if (Q.has("daily")) daily(/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : today());
  else load(n >= 1 && n <= LEVELS.length ? n - 1 : 0);
}

window.KATABASIS = { get me() { return me; }, load, made, daily, get lv() { return lv; }, tryFlip, keys, turn: (phi) => { me.fr = tidy(turn(me.fr, phi, tilt)); }, twist: (phi) => { me.fr = tidy(twist(me.fr, phi)); }, get cave() { return cave; }, get frames() { return frames; }, at: (s, fn) => { queue.push({ t: simT + s, fn }); queue.sort((a, b) => a.t - b.t); } };
