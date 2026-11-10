/* VOLLEY — the page. The rules are ./game.js (no DOM), stepped here (they're cheap). The view is one ray-marched
   picture: the ground and your bicycle are your own 3D slice (the bicycle is cut at its own w, as Lean draws it); the
   many, their bunkers and (on the overlay) every arrow are drawn where they would be with w flattened away, so you can
   see what you are shooting at from outside their world. Two panels below say what the flattening hides: their world
   from above, as they see it (you are in it only at a gate; your arrows appear in it only as they land), and the
   course from the side, x across and w up, where their whole world is one line. */
import { makeGame, step, shoot, preview, bot, bikeParts, COURSE, SEE, HP, WALL_W, ORIGIN, PTS } from "./game.js";
import { Renderer } from "../../lean/js/render.js";
import { DIM, ATLAS_C, VS as VOX, terrain, trackCells, trackBins, binTangents, OVAL_COURSE, blocks } from "../../lean/js/world.js";
import { GROUND_Y, BOUND } from "../../lean/js/bike.js";
const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v) || 1; return v.map((x) => x / m); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* ------------------------------------------------------------------ the arena: Lean's world and Lean's renderer */
let Rd; try { Rd = new Renderer(glc); } catch (e) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">VOLLEY needs WebGL2.</p>`; throw e; }
{ const TC = trackCells(), H = terrain(1, TC), M = blocks(H); Rd.load(H, M, DIM, ATLAS_C); Rd.aux(trackBins(TC), binTangents(OVAL_COURSE), DIM, ATLAS_C); }
// the game's coordinates (the basin's middle, the ground, their slice at 0) to Lean's world
const OFF = [ORIGIN[0], GROUND_Y, ORIGIN[1], ORIGIN[2]], toWorld = (p) => [p[0] + OFF[0], p[1] + OFF[1], p[2] + OFF[2], p[3] + OFF[3]];
const SUN = unit([0.45, 0.7, -0.4, 0.25]), v4u = (e) => { const l = Math.hypot(e[0], e[1], e[2]) || 1; return [e[0] / l, e[1] / l, e[2] / l, 0]; };

/* ------------------------------------------------------------------ state */
const sel = { wave: 1, seed: 1, paused: false, demo: false };
let g = makeGame(sel.seed, sel.wave), flash = 0, marks = [], marksAt = -1, shown = null;
const view = { az: 1.1, el: 0.22, dist: 12 }, TAN = 0.62; let yaw = null, cam = null;
function camera() {
  // riding along: just behind the bicycle and a little to one side, low, in the arena; your drag turns it about the bike
  const T = g.st.T, want = Math.atan2(T[2], T[0]); yaw = yaw === null ? want : yaw + Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)) * 0.05;
  const a = yaw + Math.PI + view.az, tgt = [g.st.p[0], 1.5, g.st.p[2]], eye = [tgt[0] + view.dist * Math.cos(view.el) * Math.cos(a), tgt[1] + view.dist * Math.sin(view.el), tgt[2] + view.dist * Math.cos(view.el) * Math.sin(a)];
  const F = unit(add(tgt, eye, -1)), R = unit(cross(F, [0, 1, 0])), Up = cross(R, F);
  return (cam = { eye, F, R, U: Up });
}
const toScreen = (p, w, h) => { const r = [p[0] - cam.eye[0], p[1] - cam.eye[1], p[2] - cam.eye[2]], z = dot(r, cam.F); return z > 0.1 ? [w / 2 + (dot(r, cam.R) / (z * TAN)) * (h / 2), h / 2 - (dot(r, cam.U) / (z * TAN)) * (h / 2), z] : null; };

/* ------------------------------------------------------------------ the buttons, the banner */
function restart(wave = sel.wave) { sel.wave = wave; g = makeGame(sel.seed, wave); shown = null; yaw = null; $("banner").hidden = true; $("waveB").textContent = `wave ${wave}`; caption(); history.replaceState(null, "", `?wave=${wave}`); }
function caption() { $("cap").innerHTML = `<b>One against the many.</b> They live in one slice of the world (w = 0) and can't see or shoot out of it; your track leaves it. <b>Tap one of them to loose an arrow</b>: it crosses w and arrives, walls or no walls. Four times a lap you ride through their world, and they shoot back.`; }
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
  $("bText").textContent = won ? `All ${g.total} in ${g.t.toFixed(0)} s, ${g.loosed} arrows loosed, ${g.hits} hit${g.hits === 1 ? "" : "s"} taken. ${g.bunkers.length} of them were in closed bunkers.` : `They caught you in their world ${HP} times. They can only do that at the four gates: thin them out from outside before you cross.`;
  $("bNext").hidden = !won;
}

/* ------------------------------------------------------------------ input: tap to loose, drag to look, pinch to zoom */
const ptrs = new Map(); let pinch0 = 0;
glc.addEventListener("pointerdown", (e) => { try { glc.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } });
glc.addEventListener("pointermove", (e) => { const p = ptrs.get(e.pointerId); if (!p) return;
  if (ptrs.size >= 2) { p.x = e.clientX; p.y = e.clientY; p.moved = true; const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 10) view.dist = Math.max(6, Math.min(70, view.dist * (pinch0 / d))); pinch0 = d; return; }
  if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) p.moved = true;
  if (p.moved) { view.az += (e.clientX - p.x) * 0.006; view.el = Math.max(0.08, Math.min(1.4, view.el + (e.clientY - p.y) * 0.006)); } p.x = e.clientX; p.y = e.clientY; });
glc.addEventListener("pointerup", (e) => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (p && !p.moved && performance.now() - p.t0 < 400) tap(e.clientX, e.clientY); });
glc.addEventListener("pointercancel", (e) => ptrs.delete(e.pointerId));
glc.addEventListener("wheel", (e) => { view.dist = Math.max(6, Math.min(70, view.dist * Math.exp(e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => e.preventDefault());
/* a tap: the nearest of the many to it on the screen (within a thumb's width), or else the point of the ground under it */
function tap(cx, cy) {
  if (!cam || g.state !== "playing") return; const r = glc.getBoundingClientRect(), x = cx - r.left, y = cy - r.top, w = r.width, h = r.height;
  let best = -1, bd = 46;
  g.enemies.forEach((e, i) => { if (!e.alive) return; const s = toScreen([e.x, 1.0, e.z], w, h); if (!s) return; const d = Math.hypot(s[0] - x, s[1] - y); if (d < bd) { bd = d; best = i; } });
  let ok;
  if (best >= 0) ok = shoot(g, best);
  else { const qx = (2 * x - w) / h, qy = (h - 2 * y) / h, d = unit(add(add(cam.F, cam.R, qx * TAN), cam.U, qy * TAN)); if (d[1] > -1e-3) return; const t = -cam.eye[1] / d[1]; ok = shoot(g, [cam.eye[0] + d[0] * t, 0.1, cam.eye[2] + d[2] * t, 0]); }
  if (!ok && g.cool <= 0) note = { t: performance.now(), x, y, text: "out of range" };
}
let note = null;

/* ------------------------------------------------------------------ the loop */
let last = performance.now(), acc = 0, res = 0;
function draw(now) {
  requestAnimationFrame(draw);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!sel.paused) { acc = Math.min(acc + dt, 0.1); while (acc >= 1 / 60) { const hp = g.hp; if (sel.demo) bot(g); step(g, 1 / 60); if (g.hp < hp) flash = 1; acc -= 1 / 60; } }
  flash = Math.max(0, flash - dt * 2.5);
  const dpr = Math.min(1.5, devicePixelRatio || 1); if (!res) res = dpr * (matchMedia("(pointer: coarse)").matches ? 0.55 : 0.75);
  camera();
  // (the bicycle is drawn flattened into your slice, as the many are: it leans a few degrees into w on this track, and
  // cut by a slice exactly at its own w, everything above the hubs would fall out of the picture)
  { const P = bikeParts(g), fl = (q) => toWorld([q[0], q[1], q[2], g.w]), fd = (e) => v4u(e), W4 = { tori: P.tori.map((t) => ({ ...t, c: fl(t.c), e1: fd(t.e1), e2: fd(t.e2) })), caps: P.caps.map((c) => ({ ...c, a: fl(c.a), b: fl(c.b) })) };
    Rd.bike(W4, fl(add(add(g.st.p, g.st.T, 0.5), g.st.u, 0.8)), BOUND, [0.35, 0.85, 0.95]); Rd.cat(null);
    Rd.props(g.enemies.slice(0, 16).map((e) => ({ x: e.x + OFF[0], z: e.z + OFF[2], s: e.alive ? (e.kind === "open" ? 1 : 2) : 0 })), g.bunkers.map((b) => ({ x: b.x + OFF[0], z: b.z + OFF[2], h: b.h, H: b.H })), GROUND_Y, OFF[3], Math.max(0, Math.min(1, (1.6 - Math.abs(g.w)) / (1.6 - SEE)))); }
  // your slice is square to the grid: you see x, y, z at the bicycle's own w, and the direction you can't see is w
  // (a hair off in w: exactly on a cell boundary of the voxel grid, which the start is, the whole land read as the next cell over and tinted)
  const eye = toWorld([cam.eye[0], cam.eye[1], cam.eye[2], g.w + 0.0137]).map((v) => v / VOX), v4 = (a) => [a[0], a[1], a[2], 0];
  Rd.draw({ eye, R: v4(cam.R), U: v4(cam.U), F: v4(cam.F), N: [0, 0, 0, 1], sun: SUN, time: now / 1000, fae: 1, tan: TAN, far: 440, vs: VOX }, res);
  overlay(now); panes(); hud(); verdict();
}

/* ------------------------------------------------------------------ the overlay: arrows, the rings over the many */
function overlay(now) {
  const c = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.font = "11px ui-monospace, Menlo, monospace";
  if (flash > 0) { c.fillStyle = `rgba(230,40,25,${0.35 * flash})`; c.fillRect(0, 0, w, h); }
  // would a shot from here land? (worked out five times a second)
  if (g.t - marksAt > 0.2 || g.t < marksAt) { marksAt = g.t; marks = g.enemies.map((e, i) => (e.alive ? preview(g, i) : null)); }
  g.enemies.forEach((e, i) => { if (!e.alive || !marks[i]) return; const s = toScreen([e.x, 2.25, e.z], w, h); if (!s) return;
    c.strokeStyle = marks[i] === "ok" ? "rgba(120,235,130,0.95)" : marks[i] === "wall" ? "rgba(255,190,90,0.9)" : "rgba(160,160,160,0.5)"; c.lineWidth = 2; c.beginPath(); c.arc(s[0], s[1], Math.max(4, 150 / s[2]), 0, 7); c.stroke(); });
  // the arrows, flattened like the many: yours gold, theirs red; a streak a metre long
  for (const a of g.arrows) { const v = Math.hypot(...a.v) || 1, tail = a.p.map((x, k) => x - (a.v[k] / v) * 1.1), s0 = toScreen(a.p, w, h), s1 = toScreen(tail, w, h); if (!s0 || !s1) continue;
    c.strokeStyle = a.mine ? `rgba(255,215,110,${a.stuck ? 0.5 : 1})` : `rgba(255,90,70,${a.stuck ? 0.5 : 1})`; c.lineWidth = Math.max(1.2, 26 / s0[2]); c.beginPath(); c.moveTo(s1[0], s1[1]); c.lineTo(s0[0], s0[1]); c.stroke(); }
  for (const ev of g.events) { const s = toScreen(ev.p, w, h); if (!s) continue; const k = (g.t - ev.t) / 1.5;
    c.strokeStyle = ev.kind === "kill" ? `rgba(255,230,140,${1 - k})` : ev.kind === "hurt" ? `rgba(255,80,60,${1 - k})` : `rgba(200,210,230,${1 - k})`; c.lineWidth = 2; c.beginPath(); c.arc(s[0], s[1], 6 + 40 * k * (ev.kind === "wall" ? 0.4 : 1), 0, 7); c.stroke();
    if (ev.kind === "kill" && ev.bunker && k < 0.8) { c.fillStyle = `rgba(255,230,140,${1 - k})`; c.fillText("through the wall? no: past it", s[0] + 10, s[1] - 12 - 20 * k); }
    if (ev.kind === "wall" && ev.mine && k < 0.8) { c.fillStyle = `rgba(200,210,230,${1 - k})`; c.fillText("caught the wall", s[0] + 8, s[1] - 8 - 16 * k); } }
  if (note && now - note.t < 900) { c.fillStyle = "rgba(233,228,218,0.9)"; c.fillText(note.text, note.x + 10, note.y - 10); }
  // the bow
  c.fillStyle = "rgba(233,228,218,0.25)"; c.fillRect(12, h - 18, 90, 6); c.fillStyle = g.cool > 0 ? "rgba(255,190,90,0.9)" : "rgba(120,235,130,0.95)"; c.fillRect(12, h - 18, 90 * (1 - g.cool / 0.5), 6);
}
function hud() {
  $("hp").textContent = "♥".repeat(Math.max(0, g.hp)) + "♡".repeat(Math.max(0, HP - g.hp));
  $("left").textContent = `${g.total - g.kills} of ${g.total} left · ${g.loosed} loosed · ${g.t.toFixed(0)} s`;
  const inn = Math.abs(g.w) < SEE; $("where").classList.toggle("in", inn);
  $("where").textContent = inn ? "IN THEIR WORLD: they see you" : `${Math.abs(g.w).toFixed(1)} m ${g.w > 0 ? "ana" : "kata"} of their world: unseen`;
}

/* ------------------------------------------------------------------ the two panels */
function fit(cv) { const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); } const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.font = "10px ui-monospace, Menlo, monospace"; return { c, w, h }; }
function panes() {
  const { A, B, C } = COURSE, inn = Math.abs(g.w) < SEE;
  { // their world, from above (x across, z down): only what is in w = 0
    const { c, w, h } = fit($("p1")), s = Math.min((w - 20) / (2 * A + 8), (h - 44) / (2 * B + 8)), X = (x) => w / 2 + x * s, Z = (z) => h / 2 + 6 - z * s;
    const path = (pick, X2, Y2) => { c.beginPath(); let pen = false; for (let i = 0; i <= PTS.length; i += 8) { const q = PTS[i % PTS.length]; if (!pick(q)) { pen = false; continue; } if (pen) c.lineTo(X2(q), Y2(q)); else c.moveTo(X2(q), Y2(q)); pen = true; } c.stroke(); };
    c.strokeStyle = "rgba(233,228,218,0.12)"; c.setLineDash([3, 5]); path(() => true, (q) => X(q[0]), (q) => Z(q[1])); c.setLineDash([]);
    // the track where it is in their world: the four gates
    c.strokeStyle = "rgba(255,110,80,0.9)"; c.lineWidth = 3; path((q) => Math.abs(q[2]) < SEE * 1.5, (q) => X(q[0]), (q) => Z(q[1])); c.lineWidth = 1;
    for (const b of g.bunkers) { c.strokeStyle = "rgba(150,170,205,0.9)"; c.strokeRect(X(b.x - b.h), Z(b.z + b.h), 2 * b.h * s, 2 * b.h * s); }
    for (const e of g.enemies) { c.fillStyle = !e.alive ? "rgba(120,120,120,0.6)" : e.kind === "open" ? "rgb(235,90,70)" : "rgb(170,110,230)"; c.beginPath(); c.arc(X(e.x), Z(e.z), e.alive ? 3 : 2, 0, 7); c.fill(); }
    for (const a of g.arrows) { if (Math.abs(a.p[3]) > WALL_W + 0.2) continue; c.fillStyle = a.mine ? "rgb(255,215,110)" : "rgb(255,90,70)"; c.fillRect(X(a.p[0]) - 1.5, Z(a.p[2]) - 1.5, 3, 3); }
    for (const ev of g.events) if (ev.kind === "kill") { const k = (g.t - ev.t) / 1.5; c.strokeStyle = `rgba(255,230,140,${1 - k})`; c.beginPath(); c.arc(X(ev.p[0]), Z(ev.p[2]), 3 + 12 * k, 0, 7); c.stroke(); }
    if (inn) { c.fillStyle = "rgb(90,220,245)"; c.beginPath(); c.arc(X(g.st.p[0]), Z(g.st.p[2]), 4, 0, 7); c.fill(); }
    $("p1S").textContent = inn ? "you are in it (cyan): they see you, and shoot" : "you are not in it. To them your arrows come from nowhere";
  }
  { // from the side: x across, w up. Their whole world is the line w = 0
    const { c, w, h } = fit($("p2")), s = Math.min((w - 30) / (2 * A + 8), (h - 50) / (2 * C + 6)), X = (x) => w / 2 + x * s, W = (v) => h / 2 + 4 - v * s * 1.0;
    c.strokeStyle = "rgba(233,228,218,0.25)"; c.beginPath(); for (let i = 0; i <= PTS.length; i += 8) { const q = PTS[i % PTS.length]; if (i) c.lineTo(X(q[0]), W(q[2])); else c.moveTo(X(q[0]), W(q[2])); } c.stroke();
    c.strokeStyle = "rgba(255,110,80,0.8)"; c.beginPath(); c.moveTo(X(-A - 3), W(0)); c.lineTo(X(A + 3), W(0)); c.stroke();
    c.fillStyle = "rgba(56,242,224,0.9)"; c.fillText("ana (+w)", 8, W(C) + 4); c.fillStyle = "rgba(255,102,184,0.9)"; c.fillText("kata (−w)", 8, W(-C) + 4); c.fillStyle = "rgba(255,110,80,0.9)"; c.fillText("their world", X(A + 3) - 62, W(0) - 4);
    for (const e of g.enemies) { c.fillStyle = !e.alive ? "rgba(120,120,120,0.6)" : e.kind === "open" ? "rgb(235,90,70)" : "rgb(170,110,230)"; c.fillRect(X(e.x) - 1.5, W(0) - 4, 3, 8); }
    for (const a of g.arrows) { if (!a.mine || a.stuck) continue; const v = Math.hypot(a.v[0], a.v[3]) || 1; c.strokeStyle = "rgb(255,215,110)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(X(a.p[0] - (a.v[0] / v) * 3), W(a.p[3] - (a.v[3] / v) * 3)); c.lineTo(X(a.p[0]), W(a.p[3])); c.stroke(); c.lineWidth = 1; }
    c.fillStyle = "rgb(90,220,245)"; c.beginPath(); c.arc(X(g.st.p[0]), W(g.w), 4, 0, 7); c.fill();
    $("p2S").textContent = "the track loops out of their world; your arrows come down onto the line";
  }
}

/* ------------------------------------------------------------------ start */
{ const Q = new URLSearchParams(location.search); sel.wave = Math.max(1, Math.min(5, +(Q.get("wave") || 1))); sel.demo = Q.get("demo") === "1"; $("demoB").classList.toggle("on", sel.demo); restart(sel.wave); }
if (matchMedia("(orientation: portrait)").matches) $("cap").classList.add("min");
requestAnimationFrame(draw);
window.VOLLEY = { sel, view, game: () => g, restart, flash: () => flash };
