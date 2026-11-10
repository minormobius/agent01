/* VOLLEY — the page. The rules are ./game.js (no DOM), stepped here. The view is Lean's: its arena, its renderer, and
   the camera riding behind you in YOUR frame: you see the 3D slice spanned by your heading, your across and up, and
   nothing of the direction your frame calls N. Everything is cut by that slice, the many and their bunkers too (Lean's
   props()), so they show only where your slice meets their world; that world's trace on your ground is a red line.
   You steer (the stick, or the keys); a tap looses an arrow at the point tapped, in your slice. Two instruments below,
   both in your own frame, say where the many are when you can't see them. */
import { makeGame, step, shoot, preview, bot, bikeParts, offSlice, SEE, HP, BODY, ORIGIN, ARENA } from "./game.js";
import { Renderer } from "../../lean/js/render.js";
import { DIM, ATLAS_C, VS as VOX, terrain, trackCells, trackBins, binTangents, OVAL_COURSE, blocks } from "../../lean/js/world.js";
import { GROUND_Y, BOUND } from "../../lean/js/bike.js";
const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), sc = (a, k) => a.map((v) => v * k), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v) || 1; return v.map((x) => x / m); };

/* ------------------------------------------------------------------ the arena: Lean's world and Lean's renderer */
let Rd; try { Rd = new Renderer(glc); } catch (e) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">VOLLEY needs WebGL2.</p>`; throw e; }
{ const TC = trackCells(), H = terrain(1, TC), M = blocks(H); Rd.load(H, M, DIM, ATLAS_C); Rd.aux(trackBins(TC), binTangents(OVAL_COURSE), DIM, ATLAS_C); }
// the game's coordinates (the basin's middle, the ground, their slice at 0) to Lean's world
const OFF = [ORIGIN[0], GROUND_Y, ORIGIN[1], ORIGIN[2]], toWorld = (p) => [p[0] + OFF[0], p[1] + OFF[1], p[2] + OFF[2], p[3] + OFF[3]];
const SUN = unit([0.45, 0.7, -0.4, 0.25]), UP = [0, 1, 0, 0];

/* ------------------------------------------------------------------ state */
const sel = { wave: 1, seed: 1, paused: false, demo: false };
let g = makeGame(sel.seed, sel.wave), flash = 0, marks = [], marksAt = -1, shown = null, note = null;
const view = { az: 0, el: 0.2, dist: 8 }, TAN = 0.62; let cam = null;
/* the camera: behind you and a little up, in your frame (your drag turns it about you within your slice) */
function camera() {
  const { F, R, N } = g.frame, ca = Math.cos(view.az), sa = Math.sin(view.az), Fv = add(sc(F, ca), R, sa), Rv = add(sc(R, ca), F, -sa), ce = Math.cos(view.el), se = Math.sin(view.el);
  const tgt = add(g.st.p, UP, 1.5), eye = add(add(tgt, Fv, -view.dist * ce), UP, view.dist * se);
  return (cam = { eye, F: add(sc(Fv, ce), UP, -se), R: Rv, U: add(sc(UP, ce), Fv, se), N });
}
// a 4D point on the screen: [x, y, depth, how far out of your slice]
const toScreen = (p, w, h) => { const r = add(p, cam.eye, -1), z = dot(r, cam.F); return z > 0.1 ? [w / 2 + (dot(r, cam.R) / (z * TAN)) * (h / 2), h / 2 - (dot(r, cam.U) / (z * TAN)) * (h / 2), z, dot(r, cam.N)] : null; };

/* ------------------------------------------------------------------ the buttons, the banner */
function restart(wave = sel.wave) { sel.wave = wave; g = makeGame(sel.seed, wave); shown = null; $("banner").hidden = true; $("waveB").textContent = `wave ${wave}`; caption(); history.replaceState(null, "", `?wave=${wave}`); }
function caption() { $("cap").innerHTML = `<b>Find them.</b> The many live in one slice of this arena and you see only your own. <b>Steer</b> with the stick: ↔ turns you, ↕ turns you into the direction you can't see. The <b>red line</b> on the ground is where their world crosses your slice. Turn until your slice holds them, then <b>tap one to loose an arrow</b>.`; }
$("cap").onclick = () => $("cap").classList.toggle("min");
$("restartB").onclick = $("bRetry").onclick = () => restart();
$("bNext").onclick = () => restart(sel.wave + 1);
$("waveB").onclick = () => restart(sel.wave >= 5 ? 1 : sel.wave + 1);
$("demoB").onclick = () => { sel.demo = !sel.demo; $("demoB").classList.toggle("on", sel.demo); };
$("pauseB").onclick = () => { sel.paused = !sel.paused; $("pauseB").classList.toggle("on", sel.paused); };
$("gearB").onclick = () => { $("panel").hidden = !$("panel").hidden; };
function verdict() {
  if (g.state === "playing" || shown === g) return; shown = g; const won = g.state === "won";
  $("banner").hidden = false; $("bTitle").textContent = won ? "FIELD CLEARED" : "UNSEATED";
  $("bText").textContent = won ? `All ${g.total} found and down in ${g.t.toFixed(0)} s, ${g.loosed} arrows loosed, ${g.hits} hit${g.hits === 1 ? "" : "s"} taken.` : `They caught you in their world ${HP} times. They can only see you there: come at them from outside it, and don't linger on the red.`;
  $("bNext").hidden = !won;
}

/* ------------------------------------------------------------------ input: the stick steers; a tap looses; a drag looks; a pinch zooms */
const stick = { x: 0, y: 0 }, keys = new Set();
{ const el = $("stick"); let id = null;
  const move = (e) => { const r = el.getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = -(e.clientY - r.top - r.height / 2) / (r.height / 2), m = Math.hypot(dx, dy), k = m > 1 ? 1 / m : 1; stick.x = dx * k; stick.y = dy * k; $("stickKnob").style.transform = `translate(${(dx * k * r.width) / 2}px, ${(-dy * k * r.height) / 2}px)`; };
  el.addEventListener("pointerdown", (e) => { id = e.pointerId; try { el.setPointerCapture(id); } catch (err) { /* fine */ } el.classList.add("live"); move(e); });
  el.addEventListener("pointermove", (e) => { if (e.pointerId === id) move(e); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(ev, (e) => { if (e.pointerId !== id) return; id = null; el.classList.remove("live"); stick.x = stick.y = 0; $("stickKnob").style.transform = ""; }); }
document.addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); if (k === " ") { e.preventDefault(); $("pauseB").onclick(); return; } keys.add(k); });
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
const kv = (a, a2, b, b2) => (keys.has(a) || keys.has(a2) ? 1 : 0) - (keys.has(b) || keys.has(b2) ? 1 : 0);
const ptrs = new Map(); let pinch0 = 0;
glc.addEventListener("pointerdown", (e) => { try { glc.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } });
glc.addEventListener("pointermove", (e) => { const p = ptrs.get(e.pointerId); if (!p) return;
  if (ptrs.size >= 2) { p.x = e.clientX; p.y = e.clientY; p.moved = true; const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 10) view.dist = Math.max(4, Math.min(40, view.dist * (pinch0 / d))); pinch0 = d; return; }
  if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) p.moved = true;
  if (p.moved) { view.az -= (e.clientX - p.x) * 0.006; view.el = Math.max(0.03, Math.min(1.3, view.el + (e.clientY - p.y) * 0.006)); } p.x = e.clientX; p.y = e.clientY; });
glc.addEventListener("pointerup", (e) => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (p && !p.moved && performance.now() - p.t0 < 400) tap(e.clientX, e.clientY); });
glc.addEventListener("pointercancel", (e) => ptrs.delete(e.pointerId));
glc.addEventListener("wheel", (e) => { view.dist = Math.max(4, Math.min(40, view.dist * Math.exp(e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => e.preventDefault());
/* a tap: the nearest of the many you can see to it (within a thumb's width), or else the point of the ground under it,
   in your slice */
function tap(cx, cy) {
  if (!cam || g.state !== "playing") return; const r = glc.getBoundingClientRect(), x = cx - r.left, y = cy - r.top, w = r.width, h = r.height;
  let best = -1, bd = 46;
  g.enemies.forEach((e, i) => { if (!e.alive || Math.abs(offSlice(g, e)) >= BODY) return; const s = toScreen([e.x, 1.0, e.z, 0], w, h); if (!s) return; const d = Math.hypot(s[0] - x, s[1] - y); if (d < bd) { bd = d; best = i; } });
  let ok;
  if (best >= 0) ok = shoot(g, best);
  else { const qx = (2 * x - w) / h, qy = (h - 2 * y) / h, d = unit(add(add(cam.F, cam.R, qx * TAN), cam.U, qy * TAN)); if (d[1] > -1e-3) return; const t = (0.1 - cam.eye[1]) / d[1]; ok = shoot(g, add(cam.eye, d, t)); }
  if (!ok && g.cool <= 0) note = { t: performance.now(), x, y, text: "out of range" };
}

/* ------------------------------------------------------------------ the loop */
let last = performance.now(), acc = 0, res = 0;
function draw(now) {
  requestAnimationFrame(draw);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!sel.paused) { acc = Math.min(acc + dt, 0.1); while (acc >= 1 / 60) { const hp = g.hp;
    if (sel.demo) bot(g); else g.stick = [Math.max(-1, Math.min(1, stick.x + kv("d", "arrowright", "a", "arrowleft"))), Math.max(-1, Math.min(1, stick.y + kv("w", "arrowup", "s", "arrowdown")))];
    step(g, 1 / 60); if (g.hp < hp) flash = 1; acc -= 1 / 60; } }
  flash = Math.max(0, flash - dt * 2.5);
  const dpr = Math.min(1.5, devicePixelRatio || 1); if (!res) res = dpr * (matchMedia("(pointer: coarse)").matches ? 0.55 : 0.75);
  camera();
  // (the bicycle is drawn pressed into your slice: it leans into the direction you can't see whenever you steer that
  // way, and cut exactly by the slice everything above the hubs would drop out of the picture)
  { const P = bikeParts(g), N = cam.N, e0 = cam.eye, fl = (q) => toWorld(add(q, N, -dot(add(q, e0, -1), N))), fd = (v) => unit(add(v, N, -dot(v, N)));
    const W4 = { tori: P.tori.map((t) => ({ ...t, c: fl(t.c), e1: fd(t.e1), e2: fd(t.e2) })), caps: P.caps.map((c) => ({ ...c, a: fl(c.a), b: fl(c.b) })) };
    Rd.bike(W4, fl(add(add(g.st.p, g.st.T, 0.5), g.st.u, 0.8)), BOUND, [0.35, 0.85, 0.95]); Rd.cat(null);
    Rd.props(g.enemies.slice(0, 16).map((e) => ({ x: e.x + OFF[0], z: e.z + OFF[2], s: e.alive ? (e.kind === "open" ? 1 : 2) : 0 })), g.bunkers.map((b) => ({ x: b.x + OFF[0], z: b.z + OFF[2], h: b.h, H: b.H })), GROUND_Y, OFF[3], 0.3); }
  // (a hair along N: with your slice square to the grid and exactly on a cell boundary, the whole land read as the next cell over)
  Rd.draw({ eye: toWorld(add(cam.eye, cam.N, 0.0137)).map((v) => v / VOX), R: cam.R, U: cam.U, F: cam.F, N: cam.N, sun: SUN, time: now / 1000, fae: 1, tan: TAN, far: 440, vs: VOX }, res);
  overlay(now); panes(); hud(); verdict();
}

/* ------------------------------------------------------------------ the overlay: arrows, the rings over the many you can see */
function overlay(now) {
  const c = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.font = "11px ui-monospace, Menlo, monospace";
  if (flash > 0) { c.fillStyle = `rgba(230,40,25,${0.35 * flash})`; c.fillRect(0, 0, w, h); }
  // would a shot from here land? (worked out five times a second; shown for the ones in your slice)
  if (g.t - marksAt > 0.2 || g.t < marksAt) { marksAt = g.t; marks = g.enemies.map((e, i) => (e.alive && Math.abs(offSlice(g, e)) < BODY ? preview(g, i) : null)); }
  g.enemies.forEach((e, i) => { if (!e.alive || !marks[i]) return; const s = toScreen([e.x, 2.3, e.z, 0], w, h); if (!s) return;
    c.strokeStyle = marks[i] === "ok" ? "rgba(120,235,130,0.95)" : marks[i] === "wall" ? "rgba(255,190,90,0.9)" : "rgba(200,200,200,0.6)"; c.lineWidth = 2; c.beginPath(); c.arc(s[0], s[1], Math.max(4, 150 / s[2]), 0, 7); c.stroke(); });
  // the arrows near your slice: yours gold, theirs red; fainter the further out of it
  for (const a of g.arrows) { const v = Math.hypot(...a.v) || 1, s0 = toScreen(a.p, w, h), s1 = toScreen(a.p.map((x, k) => x - (a.v[k] / v) * 1.1), w, h); if (!s0 || !s1 || Math.abs(s0[3]) > 2.5) continue; const al = (a.stuck ? 0.5 : 1) * Math.max(0.15, 1 - Math.abs(s0[3]) / 2.5);
    c.strokeStyle = a.mine ? `rgba(255,215,110,${al})` : `rgba(255,90,70,${al})`; c.lineWidth = Math.max(1.2, 26 / s0[2]); c.beginPath(); c.moveTo(s1[0], s1[1]); c.lineTo(s0[0], s0[1]); c.stroke(); }
  for (const ev of g.events) { const s = toScreen(ev.p, w, h); if (!s || Math.abs(s[3]) > 3) continue; const k = (g.t - ev.t) / 1.5;
    c.strokeStyle = ev.kind === "kill" ? `rgba(255,230,140,${1 - k})` : ev.kind === "hurt" ? `rgba(255,80,60,${1 - k})` : `rgba(200,210,230,${1 - k})`; c.lineWidth = 2; c.beginPath(); c.arc(s[0], s[1], 6 + 40 * k * (ev.kind === "wall" ? 0.4 : 1), 0, 7); c.stroke();
    if (ev.kind === "kill" && ev.bunker && k < 0.8) { c.fillStyle = `rgba(255,230,140,${1 - k})`; c.fillText("past the wall, not through it", s[0] + 10, s[1] - 12 - 20 * k); }
    if (ev.kind === "wall" && ev.mine && k < 0.8) { c.fillStyle = `rgba(200,210,230,${1 - k})`; c.fillText("caught the wall", s[0] + 8, s[1] - 8 - 16 * k); } }
  if (note && now - note.t < 900) { c.fillStyle = "rgba(233,228,218,0.9)"; c.fillText(note.text, note.x + 10, note.y - 10); }
  // the bow
  c.fillStyle = "rgba(233,228,218,0.25)"; c.fillRect(w - 102, h - 18, 90, 6); c.fillStyle = g.cool > 0 ? "rgba(255,190,90,0.9)" : "rgba(120,235,130,0.95)"; c.fillRect(w - 102, h - 18, 90 * (1 - g.cool / 0.5), 6);
}
function hud() {
  $("hp").textContent = "♥".repeat(Math.max(0, g.hp)) + "♡".repeat(Math.max(0, HP - g.hp));
  let inSlice = 0; for (const e of g.enemies) if (e.alive && Math.abs(offSlice(g, e)) < BODY) inSlice++;
  $("left").textContent = `${g.total - g.kills} of ${g.total} left · ${inSlice} in your slice · ${g.t.toFixed(0)} s`;
  const inn = Math.abs(g.w) < SEE, tilt = (Math.acos(Math.min(1, Math.abs(g.frame.N[3]))) * 180) / Math.PI; $("where").classList.toggle("in", inn);
  $("where").textContent = (inn ? "IN THEIR WORLD: they see you" : `${Math.abs(g.w).toFixed(1)} m ${g.w > 0 ? "ana" : "kata"} of their world`) + ` · your slice ${tilt.toFixed(0)}° off theirs`;
}

/* ------------------------------------------------------------------ the two instruments, in your frame */
function fit(cv) { const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); } const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.font = "10px ui-monospace, Menlo, monospace"; return { c, w, h }; }
const sideColour = (off, a = 1) => (Math.abs(off) < BODY ? `rgba(255,255,255,${a})` : off > 0 ? `rgba(56,242,224,${a})` : `rgba(255,102,184,${a})`);
function panes() {
  const { F, R, N } = g.frame, P0 = g.st.p, RANGE = 70, rel = (e) => { const r = [e.x - P0[0], 0, e.z - P0[2], -P0[3]]; return [dot(r, R), dot(r, F), dot(r, N)]; };
  // their world, w = 0, as a line in each instrument: w = w_you + a·(axis1's w) + b·(axis2's w) = 0
  const line = (c, X, Y, A1, A2, span) => { const a = A1[3], b = A2[3], w0 = P0[3]; if (Math.hypot(a, b) < 0.02) return false; c.strokeStyle = "rgba(255,110,80,0.9)"; c.lineWidth = 1.5; c.beginPath();
    if (Math.abs(b) > Math.abs(a)) { c.moveTo(X(-span), Y((-w0 + a * span) / b)); c.lineTo(X(span), Y((-w0 - a * span) / b)); } else { c.moveTo(X((-w0 + b * span) / a), Y(-span)); c.lineTo(X((-w0 - b * span) / a), Y(span)); } c.stroke(); c.lineWidth = 1; return true; };
  { // radar: across (R) and ahead (F), from above
    const { c, w, h } = fit($("p1")), s = Math.min(w, h - 30) / (2 * RANGE), cx = w / 2, cy = h / 2 + 8, X = (a) => cx + a * s, Y = (b) => cy - b * s;
    c.save(); c.beginPath(); c.rect(0, 16, w, h - 34); c.clip();
    c.strokeStyle = "rgba(233,228,218,0.12)"; for (const r of [20, 40, 60]) { c.beginPath(); c.arc(cx, cy, r * s, 0, 7); c.stroke(); }
    const has = line(c, X, Y, R, F, RANGE * 1.5);
    for (const e of g.enemies) { const [a, b, n] = rel(e); c.fillStyle = e.alive ? sideColour(n, Math.max(0.35, 1 - Math.abs(n) / 30)) : "rgba(120,120,120,0.5)"; c.beginPath(); c.arc(X(a), Y(b), e.alive ? (Math.abs(n) < BODY ? 4.5 : 3) : 2, 0, 7); c.fill(); if (e.alive && e.kind === "bunker") { c.strokeStyle = "rgba(190,150,240,0.9)"; c.strokeRect(X(a) - 5, Y(b) - 5, 10, 10); } }
    c.fillStyle = "rgb(90,220,245)"; c.beginPath(); c.moveTo(cx, cy - 7); c.lineTo(cx - 4.5, cy + 5); c.lineTo(cx + 4.5, cy + 5); c.fill(); c.restore();
    $("p1S").textContent = `rings 20 m · white: in your slice · teal: ana of it · rose: kata${has ? " · red: their world, where it crosses your slice" : " · their world is parallel to your slice: turn ↕"}`;
  }
  { // ahead (F) across, the direction you can't see (N) up
    const { c, w, h } = fit($("p2")), s = Math.min(w / (2 * RANGE), (h - 40) / 50), cx = w / 2, cy = h / 2 + 8, X = (a) => cx + a * s, Y = (b) => cy - b * s;
    c.save(); c.beginPath(); c.rect(0, 16, w, h - 34); c.clip();
    c.strokeStyle = "rgba(233,228,218,0.3)"; c.beginPath(); c.moveTo(0, cy); c.lineTo(w, cy); c.stroke(); c.fillStyle = "rgba(233,228,218,0.6)"; c.fillText("your slice", 6, cy - 4); c.fillText("ahead →", w - 52, cy + 12);
    c.fillStyle = "rgba(56,242,224,0.8)"; c.fillText("↑ unseen (stick ↑ turns you this way)", 6, 28);
    line(c, X, Y, F, N, RANGE * 1.5);
    for (const e of g.enemies) { const [, b, n] = rel(e); c.fillStyle = e.alive ? sideColour(n) : "rgba(120,120,120,0.5)"; c.beginPath(); c.arc(X(b), Y(n), e.alive ? 3.2 : 2, 0, 7); c.fill(); }
    c.fillStyle = "rgb(90,220,245)"; c.beginPath(); c.moveTo(cx + 7, cy); c.lineTo(cx - 5, cy - 4.5); c.lineTo(cx - 5, cy + 4.5); c.fill(); c.restore();
    $("p2S").textContent = "bring them onto the line (your slice) to see them · red: their world";
  }
}

/* ------------------------------------------------------------------ start */
{ const Q = new URLSearchParams(location.search); sel.wave = Math.max(1, Math.min(5, +(Q.get("wave") || 1))); sel.demo = Q.get("demo") === "1"; $("demoB").classList.toggle("on", sel.demo); restart(sel.wave); }
if (matchMedia("(orientation: portrait)").matches) $("cap").classList.add("min");
requestAnimationFrame(draw);
void ARENA;
window.VOLLEY = { sel, view, stick, game: () => g, restart, flash: () => flash };
