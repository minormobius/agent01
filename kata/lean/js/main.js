/* Lean — the page: walk a track carved into a four-dimensional basin.
   The ground and the track are ./world.js, the drawing ./render.js. The controls are IRIS⁴'s.

   Up is always y. Your other three directions, R, F and N, turn freely in the space of x, z and w: turn (F toward R,
   the mouse or a drag), twist (R toward N) and look into w (F toward N). Your slice is the 3D space of F, R and up;
   N is the one direction across the ground you can't see.

   The readout is the track's own geometry where you stand, in your frame: its curvature vector κN (which way, and how
   hard, the centreline bends) split into the part in your slice (along R and F) and the part into w you can't see
   (along N), and its torsion τ, how fast the plane of the bend turns. A road on our ground has no torsion. */
import { DIM, ATLAS_C, VS, terrain, blocks, groundAt, walk, EYE, frenet, nearestTrack, LAP, PTS, NS, S, start, BASIN, R_TRACK, basinE } from "./world.js";
import { Renderer } from "./render.js";
import { parts as bikeParts, BOUND, V, G, HOLONOMY, MECHS, BIKE, GROUND_Y } from "./bike.js";
import { Bike, followLean, lookahead } from "./dyn.js";

const $ = (id) => document.getElementById(id), T0 = performance.now(), timing = {};
const glc = $("gl"), ov = $("ov");
let Rd;
try { Rd = new Renderer(glc); } catch (e) { $("intro").innerHTML = `<h1>LEAN</h1><p>This needs WebGL2: ${String(e.message || e)}</p>`; throw e; }

/* ------------------------------------------------------------- the world */
timing.shader = Math.round(performance.now() - T0);
const H = terrain(1), M = blocks(H); timing.land = Math.round(performance.now() - T0);
Rd.load(H, M, DIM, ATLAS_C); timing.upload = Math.round(performance.now() - T0);
const ground = (q) => groundAt(H, q);

/* ------------------------------------------------------------- you: where, and how you're turned */
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const me = { p: start(H), fr: { R: [1, 0, 0, 0], F: [0, 0, 1, 0], N: [0, 0, 0, 1] }, pitch: -0.12 };
const UP = [0, 1, 0, 0];
function rotFr(i, j, t) { const c = Math.cos(t), s = Math.sin(t), A = me.fr[i], B = me.fr[j]; me.fr[i] = add(A.map((v) => v * c), B, s); me.fr[j] = add(B.map((v) => v * c), A, -s); }
function tidy() { const f = me.fr, perp = (v, ...bs) => unit(bs.reduce((w, b) => add(w, b, -dot(w, b)), v)); f.F = perp(f.F, UP); f.R = perp(f.R, UP, f.F); f.N = perp(f.N, UP, f.F, f.R); }
const det = (R, F, N) => R[0] * (F[2] * N[3] - F[3] * N[2]) - R[2] * (F[0] * N[3] - F[3] * N[0]) + R[3] * (F[0] * N[2] - F[2] * N[0]);
/* square up: ease your frame onto the grid directions it's nearest (keeping your handedness). IRIS⁴'s */
let easing = null;
function squareUp() {
  const used = new Set([1]), out = {};
  for (const k of ["F", "R", "N"].sort((a, b) => Math.max(...me.fr[b].map(Math.abs)) - Math.max(...me.fr[a].map(Math.abs)))) {
    let best = -1; for (const a of [0, 2, 3]) if (!used.has(a) && (best < 0 || Math.abs(me.fr[k][a]) > Math.abs(me.fr[k][best]))) best = a;
    used.add(best); const g = [0, 0, 0, 0]; g[best] = me.fr[k][best] < 0 ? -1 : 1; out[k] = g;
  }
  if (det(me.fr.R, me.fr.F, me.fr.N) * det(out.R, out.F, out.N) < 0) out.N = out.N.map((v) => -v);
  easing = out;
}
/* face the track: F along the centreline (whichever way you were facing more), R toward or away from the centre of
   its bend, N the binormal. Then the whole bend is in your slice, and the torsion is how fast it leaves it */
function faceTrack() {
  const f = frenet(nearestTrack(me.p).t), F = dot(f.T, me.fr.F) < 0 ? f.T.map((v) => -v) : f.T, R = dot(f.N, me.fr.R) < 0 ? f.N.map((v) => -v) : f.N;
  const out = { F, R, N: f.Bn };
  if (det(me.fr.R, me.fr.F, me.fr.N) * det(out.R, out.F, out.N) < 0) out.N = out.N.map((v) => -v);
  easing = out;
}

/* ------------------------------------------------------------- input (IRIS⁴'s) */
const SUN = unit([0.35, 0.42, -0.8, 0.2]);
const keys = new Set(); let look = { x: 0, y: 0 }, stick = null, twisting = 0, inW = 0;
const coarse = matchMedia("(pointer: coarse)").matches;
/* on a phone (a touch screen, or a narrow one) the map takes the bottom sixth and the buttons float over the view */
const phoneQ = matchMedia("(pointer: coarse), (max-width: 700px)");
function layout() { const ph = phoneQ.matches, act = $("act"); document.body.classList.toggle("phone", ph); if (ph) $("view").appendChild(act); else $("panel").insertBefore(act, $("panel").firstChild); }
layout(); phoneQ.addEventListener("change", layout);
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
  const k = e.key.toLowerCase();
  if (!$("intro").hidden && (k === "enter" || k === " ")) { e.preventDefault(); go(); return; }
  if (k === "x") { squareUp(); return; }
  if (k === "t") { faceTrack(); return; }
  if (["w", "a", "s", "d", "z", "c", "q", "e", "shift"].includes(k)) { e.preventDefault(); keys.add(k); }
});
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
glc.addEventListener("click", () => { if (!coarse && $("intro").hidden && document.pointerLockElement !== glc) { try { const r = glc.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* keys still work */ } } });
document.addEventListener("mousemove", (e) => { if (document.pointerLockElement === glc) { look.x += e.movementX; look.y += e.movementY; } });
glc.addEventListener("wheel", (e) => { e.preventDefault(); rotFr("R", "N", Math.sign(e.deltaY) * 0.05); tidy(); easing = null; }, { passive: false });
const STICK_R = 46, stickEl = $("stick"), knob = $("knob"), drags = new Map();
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
  if (g.stick) { const dx = e.clientX - g.cx, dy = e.clientY - g.cy, m = Math.hypot(dx, dy), k = m > STICK_R ? STICK_R / m : 1; knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`; stick = m < 6 ? null : [(dx * k) / STICK_R, (-dy * k) / STICK_R]; }
  else { look.x += (e.clientX - g.x) * 1.6; look.y += (e.clientY - g.y) * 1.6; g.x = e.clientX; g.y = e.clientY; }
}
glc.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") move(e); });
for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) glc.addEventListener(ev, (e) => { const g = drags.get(e.pointerId); drags.delete(e.pointerId); if (g && g.stick) { stick = null; stickEl.classList.remove("live"); knob.style.transform = ""; } });
const hold = (id, set) => { const b = $(id); b.addEventListener("pointerdown", (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } set(true); }); for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(ev, () => set(false)); };
hold("twL", (on) => { twisting = on ? -1 : 0; }); hold("twR", (on) => { twisting = on ? 1 : 0; });
hold("inA", (on) => { inW = on ? 1 : 0; }); hold("inK", (on) => { inW = on ? -1 : 0; });
$("sq").onclick = squareUp; $("ft").onclick = faceTrack;
const opt = { fae: true };
for (const b of document.querySelectorAll("#show button")) { b.classList.toggle("on", opt[b.dataset.o]); b.onclick = () => { opt[b.dataset.o] = !opt[b.dataset.o]; b.classList.toggle("on", opt[b.dataset.o]); }; }
function go() { $("intro").hidden = true; if (!coarse) { try { const r = glc.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* fine */ } } }
$("go").onclick = go;

/* ------------------------------------------------------------- the bicycle (./dyn.js), and riding it
   A dynamic bicycle: the linearized Whipple model lifted to 4D (two copies, leaning into y and into w), balanced and
   steered by an LQR rider about the steady turn it's asked for. Something asks it for a lean: the autopilot (pure
   pursuit round the track) or you (the phone's tilt, or the arrow keys). Either steering mechanism. You can walk, or
   ride it: the camera follows behind, either carried without twisting ("no twist") or turning your slice with the
   track's bend ("follow the bend").
   Your hand, on a phone: the stick (the one you walk with), across for your slice, up for ana, down for kata, let go
   for hands off; or the tilt if you turn it on. On a keyboard: ← → in your slice, ↑ ana, ↓ kata. What you ask for is a lean, as a rider asks with their
   body; the rider in the machine steers to get it (a real bike can't be balanced by its handlebar angle alone). */
const g3 = (v) => [v[0], v[2], v[3]], to4g = (v, y = 0) => [v[0], y, v[1], v[2]];
const bike = new Bike({ mech: "two-axis", v: V });
/* two modes, each with its own few controls: walk (the stick walks; twist, look into w, square up, face the track) and
   ride (the stick is the handlebars; the camera, the speed, and ⚙ for the rest). Riding, who holds the bars (pilot) is
   you, hands on (default), you assisted (you ask for a lean), or the autopilot (you watch) */
const CAMS = ["no twist", "follow the bend"], PILOTS = ["hands", "assisted", "autopilot"];
let mode = "walk", cam = "no twist", pilot = "hands", bhint = 0, fellAt = -1e9, fellWhy = "";
const humanOn = () => mode === "ride" && pilot !== "autopilot";
/* limits: off by default. The bike never falls and leans however far you push it, both ways: past ~45° that isn't a
   bicycle any more (the linear model, followed regardless), and the HUD says so. On: it falls past 57° of lean, or if
   one-axis steering can't twist fast enough */
let relaxed = true;
const SILLY = 0.8; // rad (~46°): past this, the lean is flagged as non-physical
const handMax = () => (relaxed ? 1.3 : 0.5); // the stick's full throw, as a lean asked for (radians); hands on it is T_MAX either way
const COL = { "two-axis": [0.35, 0.85, 0.95], "one-axis": [1.0, 0.72, 0.25] };
const nearIdx = (pos, hint, span = 60) => { let best = Infinity, bi = 0; for (let k = -span; k <= span; k++) { const i = (((hint + k) % NS) + NS) % NS, q = PTS[i], d = Math.hypot(pos[0] - q[0], pos[1] - q[1], pos[2] - q[2]); if (d < best) { best = d; bi = i; } } return { i: bi, d: best }; };
const aheadPt = (i, L) => { let s2 = S[i] + L; s2 = ((s2 % LAP) + LAP) % LAP; let lo = 0, hi = NS; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s2) lo = m; else hi = m; } return PTS[lo]; };
function resetBike(i) {
  const f = frenet((2 * Math.PI * i) / NS); bike.place(PTS[i], g3(f.T), g3(f.N)); bhint = i;
  if (!humanOn()) bike.settle(followLean(bike, aheadPt(i, lookahead(bike.v))));
}
resetBike(80); // a few metres ahead of where you start
const human = { lc: 0, ld: 0, tilt: null, zero: null, perm: false, useTilt: false }; // hands on: you steer, nobody balances for you
const T_MAX = 2.5; // N m of steer torque at full tilt
addEventListener("deviceorientation", (e) => { if (e.beta == null) return; human.tilt = { beta: e.beta, gamma: e.gamma }; });
function setMode(m) {
  if (mode === "ride" && m === "walk") { const p = me.p.slice(); p[1] = ground(p) + EYE; me.p = p; me.pitch = -0.12; tidy(); } // step off where the camera was
  if (m === "ride") { human.zero = null; human.lc = human.ld = 0; }
  mode = m; document.body.classList.toggle("riding", m === "ride"); document.body.classList.remove("cfg");
  $("mode").textContent = m === "walk" ? "🚲 ride" : "🚶 walk";
}
function setCam(c) { cam = c; $("cam").textContent = `👁 ${c}`; }
function setPilot(p) { pilot = p; $("hands").textContent = { hands: "✋ hands on", assisted: "🤝 assisted", autopilot: "🤖 autopilot" }[p]; if (p === "autopilot") bike.settle(followLean(bike, aheadPt(bhint, lookahead(bike.v)))); }
function setMech(m) { bike.setMech(m); $("mech").textContent = `steer: ${m}`; }
/* the phone's tilt, if you'd rather: off by default (the stick is the control); turning it on asks iOS for permission */
function setTilt(on) {
  human.useTilt = on; human.zero = null; $("tiltb").textContent = on ? "📱 tilt on" : "📱 tilt"; $("tiltb").classList.toggle("on", on);
  if (on) try { if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission && !human.perm) DeviceOrientationEvent.requestPermission().then((r) => { human.perm = r === "granted"; }).catch(() => {}); } catch (e) { /* the stick still works */ }
}
$("tiltb").onclick = () => setTilt(!human.useTilt);
function setLimits(r) { relaxed = r; bike.limits = !r; $("lim").textContent = r ? "limits: off" : "limits: real"; }
$("lim").onclick = () => setLimits(!relaxed);
$("hands").onclick = () => setPilot(PILOTS[(PILOTS.indexOf(pilot) + 1) % PILOTS.length]);
const SPEEDS = [5, 6, 7, 3, 4];
function setSpeed(v) { bike.setSpeed(v); $("spd").value = v; $("spdV").textContent = `${v.toFixed(1)} m/s`; $("spdb").textContent = `${v} m/s`; }
$("spdb").onclick = () => setSpeed(SPEEDS[(SPEEDS.indexOf(bike.v) + 1) % SPEEDS.length] || 5);
$("mode").onclick = () => setMode(mode === "walk" ? "ride" : "walk");
$("cam").onclick = () => setCam(CAMS[(CAMS.indexOf(cam) + 1) % CAMS.length]);
$("cfg").onclick = () => document.body.classList.toggle("cfg");
$("mech").onclick = () => setMech(MECHS[(MECHS.indexOf(bike.mech) + 1) % MECHS.length]);
const arrows = new Set();
document.addEventListener("keydown", (e) => { const k = e.key.toLowerCase(), t = e.target; if (e.ctrlKey || e.metaKey || e.altKey || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; if (k === "r") $("mode").onclick(); if (k === "v" && mode === "ride") $("cam").onclick(); if (k === "m") $("mech").onclick(); if (k === "h") $("hands").onclick(); if (e.key.startsWith("Arrow")) { e.preventDefault(); arrows.add(e.key); } });
document.addEventListener("keyup", (e) => arrows.delete(e.key));
{ const sl = $("spd"), lab = () => { $("spdV").textContent = `${(+sl.value).toFixed(1)} m/s`; }; sl.oninput = lab; sl.onchange = () => setSpeed(+sl.value); lab(); }
setMode("walk"); setCam("no twist"); setPilot("hands"); setMech("two-axis"); setLimits(true);
/* what you do with your hand, in your riding frame (across your slice, and into w: ana up, kata down), from the stick, the
   keys or (if you turn it on) the tilt: a push on the bars when hands on, a lean asked for when assisted (radians; ×5 N m/rad) */
function humanLean(dt) {
  const MAX = handMax(), k = 1 - Math.exp(-dt * 6);
  let tc = 0, td = 0;
  if (human.useTilt && human.tilt) {
    const ang = (screen.orientation && screen.orientation.angle) || 0, b0 = human.tilt.beta, g0 = human.tilt.gamma;
    let roll = g0, tip = b0; if (ang === 90) { roll = b0; tip = -g0; } else if (ang === 270 || ang === -90) { roll = -b0; tip = g0; }
    if (!human.zero) human.zero = { roll, tip };
    const dz = (x) => (Math.abs(x) < 2 ? 0 : x - Math.sign(x) * 2), cl = (x) => Math.max(-1, Math.min(1, x));
    tc = cl(dz(roll - human.zero.roll) / 26) * MAX; td = cl(dz(tip - human.zero.tip) / 26) * MAX; // tip the top away: kata
  }
  if (stick) { tc = stick[0] * MAX; td = stick[1] * MAX; } // the stick: across is your slice, up is ana, down kata
  const kx = (keys.has("d") || arrows.has("ArrowRight") ? 1 : 0) - (keys.has("a") || arrows.has("ArrowLeft") ? 1 : 0), ky = (keys.has("w") || arrows.has("ArrowUp") ? 1 : 0) - (keys.has("s") || arrows.has("ArrowDown") ? 1 : 0);
  if (kx || ky) { tc = kx * MAX * 0.8; td = ky * MAX * 0.8; }
  const kk = pilot === "hands" ? 1 - Math.exp(-dt * 25) : k; human.lc += (tc - human.lc) * kk; human.ld += (td - human.ld) * kk;
  const f = rideFrame(); // in the frame you ride in: across your slice, and ana (+N) or kata (−N)
  return [0, 2, 3].map((j) => f.R[j] * human.lc + f.N[j] * human.ld);
}
/* the bike for the shader and the map: bike.js's parts() wants its pose */
function bikePose() {
  const p = to4g(bike.pos, GROUND_Y), T = to4g(bike.T), L = to4g(bike.lean), phiTrue = Math.hypot(...L), phi = Math.min(phiTrue, 1.45), lh = phiTrue > 1e-6 ? L.map((x) => x / phiTrue) : to4g(bike.a); // drawn no flatter than 83°
  const u = add(UP.map((x) => x * Math.cos(phi)), lh, Math.sin(phi)), tilt = (x) => unit(add(x, u, -dot(x, u)));
  const Sv = to4g(bike.steer), delTrue = Math.hypot(...Sv), del = Math.min(delTrue, 1.2), sd = delTrue > 1e-6 ? Sv.map((x) => x / delTrue) : to4g(bike.a); // drawn no further than 69°
  return { p, T, u, a: tilt(to4g(bike.a)), b: tilt(to4g(bike.b)), Np: tilt(sd), Tf: add(T.map((x) => x * Math.cos(del)), sd, Math.sin(del)), delta: del, phi, phiTrue, deltaTrue: delTrue, lean: lh, mech: bike.mech, s: bike.dist, front: add(p, T, BIKE.WB) };
}
/* the camera riding along: behind and above the rear wheel, upright, facing along the bike */
function rideFrame() {
  let R, N; const T = to4g(bike.T);
  if (cam === "follow the bend") { const f = frenet((2 * Math.PI * bhint) / NS); R = f.N; N = f.Bn; R = unit(add(R, T, -dot(R, T))); N = unit(add(add(N, T, -dot(N, T)), R, -dot(N, R))); }
  else { R = to4g(bike.c); N = to4g(bike.d); }
  if (det(R, T, N) < 0) N = N.map((v) => -v);
  return { R, F: T, N };
}
function bikeRead(st, want) {
  const deg = (x) => (x * 180 / Math.PI).toFixed(1), kap = Math.hypot(...bike.curvature), cal = Math.atan(bike.v * bike.v * kap / G);
  const L = st.lean.map((x) => x * st.phi), kN = dot(L, me.fr.N), kS = Math.hypot(dot(L, me.fr.R), dot(L, me.fr.F)), intoW = Math.round(100 * kN * kN / (kN * kN + kS * kS || 1));
  const mech = bike.mech === "two-axis"
    ? `Two-axis steering: both copies steer, the frame never twists (round this track it comes home turned ${deg(HOLONOMY)}°), steer torques <b>${bike.torque[0].toFixed(1)}</b> and <b>${bike.torque[1].toFixed(1)}</b> N m.`
    : `One-axis steering: its one steering axis must lie along the steer, so the frame twists, <b>${bike.alphaDot.toFixed(2)}</b> rad/s now, a twisting torque of <b>${bike.twistTorque.toFixed(1)}</b> N m from the rider (nothing on the ground can supply it). Steer torque <b>${Math.hypot(...bike.torque).toFixed(1)}</b> N m.`;
  const who = humanOn() ? (pilot === "hands" ? `Hands on: you push the bars with <b>${(Math.hypot(human.lc, human.ld) * T_MAX / handMax()).toFixed(2)}</b> N m, and nothing balances it but the bike itself${bike.v >= 4.31 && bike.v <= 6.02 ? " (at this speed it does, in both copies)" : " (at this speed it can't: that's on you)"}.` : `You ask for a lean of ${deg(Math.hypot(human.lc, human.ld))}°, and the rider in the machine steers to get it.`) : `The autopilot asks for ${deg(Math.hypot(...want))}°.`;
  const txt = `<b>The bike</b> (the dynamics: the linearized Whipple bicycle in two copies, an LQR rider) at ${bike.v.toFixed(1)} m/s: lean <b>${deg(st.phiTrue)}°</b>${st.phiTrue > SILLY ? " (non-physical: no bicycle leans like that; with the limits off the linear model is simply followed)" : ""}, <b>${intoW}%</b> of it into the direction you can't see; ` +
    `steer <b>${deg(st.deltaTrue)}°</b>, a turn of radius ${kap > 1e-3 ? (1 / kap).toFixed(1) + " m" : "∞"}, for which the calibration says ${deg(cal)}°. ${who} ${mech}`;
  if (txt !== bikeRead.txt) { bikeRead.txt = txt; $("bread").innerHTML = txt; }
  return { intoW };
}
/* the lean gauge, while riding: across is your slice, up is ana; the filled dot the bike's lean, the ring what's asked */
function gauge(g, w, h, st, want) {
  const R = 44, cx = w / 2, cy = h - R - 28, k = R / (relaxed ? 1.45 : 0.6), X = (v) => cx + dot(v, me.fr.R) * k, Y = (v) => cy - dot(v, me.fr.N) * k;
  g.fillStyle = "rgba(7,8,12,0.45)"; g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  g.font = "9px ui-monospace, Menlo, monospace"; g.fillStyle = "rgba(255,255,255,0.6)"; g.textAlign = "center"; g.fillText("ana", cx, cy - R - 4); g.fillText("kata", cx, cy + R + 10);
  const L = st.lean.map((x) => x * Math.min(st.phiTrue, relaxed ? 1.45 : 0.6)), W4 = to4g(want); // on the gauge's edge if past it
  g.strokeStyle = pilot === "hands" && humanOn() ? "#ff8a6a" : "#6fe0ff"; g.lineWidth = 1.6; g.beginPath(); g.arc(X(W4), Y(W4), 6, 0, 2 * Math.PI); g.stroke();
  if (humanOn()) g.fillText(pilot === "hands" ? "your push on the bars" : "the lean you ask for", cx, cy + R + 21);
  g.fillStyle = "#ffd27a"; g.beginPath(); g.arc(X(L), Y(L), 4.5, 0, 2 * Math.PI); g.fill();
}

/* ------------------------------------------------------------- the track, in your frame */
const lap = { n: 0, last: null };
function trackRead() {
  const nt = nearestTrack(me.p), f = frenet(nt.t), on = nt.d <= R_TRACK, frac = nt.s / LAP;
  if (lap.last !== null && on) { if (lap.last > 0.9 && frac < 0.1) lap.n++; else if (lap.last < 0.1 && frac > 0.9) lap.n--; }
  if (on) lap.last = frac;
  const K = f.N.map((v) => v * f.kappa), kF = dot(K, me.fr.F), kR = dot(K, me.fr.R), kN = dot(K, me.fr.N);
  const inSlice = Math.hypot(kF, kR), intoW = Math.abs(kN), share = (inSlice * inSlice) / (f.kappa * f.kappa);
  const along = Math.abs(dot(f.T, me.fr.F)), tAngle = Math.round((Math.acos(Math.min(1, along)) * 180) / Math.PI);
  return { nt, f, on, frac, kF, kR, kN, inSlice, intoW, share, tAngle };
}
function readout(r) {
  const where = r.on ? `on the track · lap ${lap.n} · ${Math.round(r.frac * 100)}%` : `${(r.nt.d - R_TRACK).toFixed(1)} m off the track`;
  const side = r.kR < 0 ? "left" : "right", wdir = r.kN > 0 ? "ana" : "kata";
  const hud = `${where} · bend <b>${Math.round(r.share * 100)}%</b> in your slice`;
  if (mode === "walk" && hud !== readout.hud) { readout.hud = hud; $("hudT").innerHTML = hud; }
  const txt = `Here the centreline bends with radius <b>${(1 / r.f.kappa).toFixed(1)} m</b>. In your frame its curvature vector is ` +
    `(κ_F, κ_R, κ_N) = (<b>${r.kF.toFixed(3)}, ${r.kR.toFixed(3)}, ${r.kN.toFixed(3)}</b>) per metre: ` +
    `<b>${Math.round(r.share * 100)}%</b> of the bend is in your slice (to your ${side}), <b>${Math.round((1 - r.share) * 100)}%</b> is into w${1 - r.share > 0.01 ? ` (${wdir})` : ""}, where you can't see it. ` +
    `The plane of the bend turns at τ = <b>${r.f.tau.toFixed(3)}</b> rad/m, so ${Math.abs(r.f.tau) < 0.01 ? "for now it holds still" : `at this rate a bend wholly in your slice would be wholly into w ${Math.min(99, Math.abs(Math.PI / 2 / r.f.tau)).toFixed(0)} m on`}. ` +
    (mode === "walk" ? `You face ${r.tAngle}° off the track's direction. <b>↦</b> (or <b>T</b>) faces it, with the whole bend in your slice.` : `You're riding behind the bike.`);
  if (txt !== readout.txt) { readout.txt = txt; $("read").innerHTML = txt; }
}
/* the map: the ground itself, x, z and w, as a solid you can turn (drag it; double-click resets). The track is drawn
   as what it is, a tube 2·R_TRACK thick round its centreline: in an orthographic view a tube's outline is that wide
   everywhere, so each stretch is a stroke of the tube's true width, drawn back to front and coloured by w, with its
   round cross-sections every few metres. The basin's three principal ellipses frame it, and you're on it: your
   position, where you face (gold) and the direction you can't see (dashed blue). w is the map's up. */
const MAPV = { yaw: 0.55, el: 0.62 }, MAP0 = { ...MAPV };
const wHue = (w) => Math.round(175 + ((w - BASIN.c[2]) / 3) * 115);
const RINGS = [];
for (let i = 0; i < NS; i += 48) { const f = frenet((2 * Math.PI * i) / NS), c = [f.p[0], f.p[2], f.p[3]], n = [f.N[0], f.N[2], f.N[3]], bn = [f.Bn[0], f.Bn[2], f.Bn[3]]; RINGS.push({ i, pts: Array.from({ length: 25 }, (_, k) => { const t = (2 * Math.PI * k) / 24; return c.map((v, j) => v + R_TRACK * (Math.cos(t) * n[j] + Math.sin(t) * bn[j])); }) }); }
{
  const cv = $("map"); let drag = null;
  cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } });
  cv.addEventListener("pointermove", (e) => { if (!drag) return; MAPV.yaw += (e.clientX - drag.x) * 0.012; MAPV.el = Math.max(-0.2, Math.min(1.5, MAPV.el + (e.clientY - drag.y) * 0.012)); drag = { x: e.clientX, y: e.clientY }; });
  for (const ev of ["pointerup", "pointercancel"]) cv.addEventListener(ev, () => { drag = null; });
  cv.addEventListener("dblclick", () => Object.assign(MAPV, MAP0));
}
function mapDraw(st) {
  const cv = $("map"), dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const ca = Math.cos(MAPV.yaw), sa = Math.sin(MAPV.yaw), ce = Math.cos(MAPV.el), se = Math.sin(MAPV.el), C = BASIN.c;
  // fit the track as seen from this angle (its projected extent, plus its radius) to the canvas, under the caption
  const proj = (q) => { const dx = q[0] - C[0], dz = q[1] - C[1], dw = q[2] - C[2], u = dx * ca - dz * sa, v = dx * sa + dz * ca; return [u, -(dw * ce - v * se), v * ce + dw * se]; };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < NS; i += 16) { const q = proj(PTS[i]); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  x0 -= R_TRACK; x1 += R_TRACK; y0 -= R_TRACK; y1 += R_TRACK;
  const top = 18, k = Math.min((w * 0.9) / (x1 - x0), ((h - top - 6) * 0.94) / (y1 - y0)), cx = w / 2 - ((x0 + x1) / 2) * k, cy = top + (h - top) / 2 - ((y0 + y1) / 2) * k;
  // ground (x, z, w) → screen, and depth (bigger is nearer)
  const P = (q) => { const r = proj(q); return [cx + r[0] * k, cy + r[1] * k, r[2]]; };
  // the basin: its three principal ellipses
  g.strokeStyle = "rgba(154,149,140,0.28)"; g.lineWidth = 1;
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) { g.beginPath(); for (let s = 0; s <= 64; s++) { const t = (2 * Math.PI * s) / 64, q = C.slice(); q[i] += BASIN.a[i] * Math.cos(t); q[j] += BASIN.a[j] * Math.sin(t); const p = P(q); s ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke(); }
  // the tube, back to front: each stretch a stroke the tube's true width, a darker rim under a lighter core
  const segs = []; for (let i = 0; i < NS; i += 6) { const a = P(PTS[i]), b = P(PTS[(i + 6) % NS]); segs.push({ a, b, d: (a[2] + b[2]) / 2, w: PTS[i][2], i }); }
  segs.sort((p, q) => p.d - q.d);
  const dmax = 19, shade = (d) => 0.55 + 0.45 * (d + dmax) / (2 * dmax);
  g.lineCap = "round";
  for (const s of segs) {
    const L = Math.round(30 + 30 * shade(s.d)), hue = wHue(s.w);
    g.strokeStyle = `hsl(${hue}, 55%, ${L - 14}%)`; g.lineWidth = 2 * R_TRACK * k; g.beginPath(); g.moveTo(s.a[0], s.a[1]); g.lineTo(s.b[0], s.b[1]); g.stroke();
    g.strokeStyle = `hsl(${hue}, 70%, ${L + 4}%)`; g.lineWidth = Math.max(1, 2 * R_TRACK * k * 0.55); g.beginPath(); g.moveTo(s.a[0], s.a[1]); g.lineTo(s.b[0], s.b[1]); g.stroke();
  }
  // the cross-sections: the half of each ring that faces you, over the tube, so you can see it's round both ways
  g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 1;
  for (const r of RINGS) { const dc = P(PTS[r.i])[2]; let on = false; g.beginPath(); for (const q of r.pts) { const p = P(q); if (p[2] >= dc - 1e-9) { on ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); on = true; } else on = false; } g.stroke(); }
  // the start line
  { const f = frenet(0), c = [f.p[0], f.p[2], f.p[3]], a = P(c.map((v, j) => v + R_TRACK * [f.N[0], f.N[2], f.N[3]][j])), b = P(c.map((v, j) => v - R_TRACK * [f.N[0], f.N[2], f.N[3]][j])); g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  // the bike, and its lean (red, scaled ×6 so it reads)
  if (st) { const bp = [st.p[0], st.p[2], st.p[3]], q = P(bp), l = P(bp.map((x, j) => x + [st.lean[0], st.lean[2], st.lean[3]][j] * Math.sin(st.phi) * 3));
    g.strokeStyle = "#ff5a4e"; g.lineWidth = 2.2; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(l[0], l[1]); g.stroke();
    g.fillStyle = "#ff5a4e"; g.strokeStyle = "#07080c"; g.lineWidth = 1.5; g.beginPath(); g.arc(q[0], q[1], 4, 0, 2 * Math.PI); g.fill(); g.stroke(); }
  // you
  const me3 = [me.p[0], me.p[2], me.p[3]], p = P(me3), arrow = (v, len) => P(me3.map((x, j) => x + v[j] * len));
  const F3 = [me.fr.F[0], me.fr.F[2], me.fr.F[3]], N3 = [me.fr.N[0], me.fr.N[2], me.fr.N[3]], fa = arrow(F3, 3.5), na = arrow(N3, 2.5);
  g.strokeStyle = "rgba(111,224,255,0.95)"; g.lineWidth = 1.6; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(na[0], na[1]); g.stroke(); g.setLineDash([]);
  g.strokeStyle = "#ffd27a"; g.lineWidth = 2.2; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(fa[0], fa[1]); g.stroke();
  g.fillStyle = "#ffd27a"; g.strokeStyle = "#07080c"; g.lineWidth = 1.5; g.beginPath(); g.arc(p[0], p[1], 4.5, 0, 2 * Math.PI); g.fill(); g.stroke();
  // the axes
  const o = [C[0] - 15, C[1] - 15, C[2] - 6], O = P(o);
  g.font = "10px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.textBaseline = "middle";
  [["x", [1, 0, 0]], ["z", [0, 1, 0]], ["w", [0, 0, 1]]].forEach(([n, v]) => { const e = P(o.map((x, j) => x + v[j] * 3)); g.strokeStyle = n === "w" ? "#b88cff" : "#9a958c"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(O[0], O[1]); g.lineTo(e[0], e[1]); g.stroke(); g.fillStyle = g.strokeStyle; g.fillText(n, O[0] + (e[0] - O[0]) * 1.35, O[1] + (e[1] - O[1]) * 1.35); });
  g.textAlign = "left"; g.textBaseline = "alphabetic"; g.fillStyle = "#9a958c";
  g.fillText(h < 200 ? "x, z, w · drag" : "the ground: x, z, w (w up) · drag to turn", 8, 13);
  // the colours' key: w, kata to ana
  if (h >= 200) { const kx = w - 136, ky = h - 16; for (let i = 0; i < 100; i++) { g.fillStyle = `hsl(${wHue(BASIN.c[2] - 3 + (6 * i) / 100)}, 60%, 50%)`; g.fillRect(kx + i, ky, 1, 6); }
  g.fillStyle = "#9a958c"; g.textAlign = "right"; g.fillText("kata", kx - 4, ky + 6); g.textAlign = "left"; g.fillText("ana", kx + 104, ky + 6); }
}
function wName() { const N = me.fr.N; let a = 0; for (const i of [2, 3]) if (Math.abs(N[i]) > Math.abs(N[a])) a = i; const off = Math.round((Math.acos(Math.min(1, Math.abs(N[a]))) * 180) / Math.PI); return (N[a] > 0 ? "+" : "−") + "xyzw"[a] + (off >= 2 ? ` ${off}°` : ""); }

/* ------------------------------------------------------------- the loop (IRIS⁴'s) */
let res = 0, lag = 1 / 60, prev = performance.now(), frames = 0;
const FIXED = 1 / (+new URLSearchParams(location.search).get("dt") || Infinity), TAN = 0.85;
function resolution(dt) {
  const dpr = Math.min(2, devicePixelRatio || 1), cap = Math.min(dpr, Math.sqrt(1.6e6 / Math.max(1, glc.clientWidth * glc.clientHeight)));
  if (!res) res = cap * (coarse ? 0.55 : 0.75);
  lag += (dt - lag) * 0.1;
  if (lag > 1 / 32 && res > 0.3) res *= 0.97; else if (lag < 1 / 55 && res < cap) res = Math.min(cap, res * 1.01);
  return Math.round(res * 40) / 40;
}
function step(now) {
  requestAnimationFrame(step);
  const dt = FIXED || Math.min(0.05, (now - prev) / 1000); prev = now;
  if ($("intro").hidden) {
    const tw = (twisting || (keys.has("c") ? 1 : 0) - (keys.has("z") ? 1 : 0)) * 1.0 * dt, iw = (inW || (keys.has("e") ? 1 : 0) - (keys.has("q") ? 1 : 0)) * 0.8 * dt;
    if (look.x) rotFr("F", "R", look.x * 0.0028);
    if (tw) rotFr("R", "N", tw);
    if (iw) rotFr("F", "N", iw);
    if (look.x || tw || iw) { tidy(); easing = null; }
    if (easing) {
      const k = 1 - Math.exp(-dt * 8), T = easing; for (const q of ["R", "F", "N"]) me.fr[q] = add(me.fr[q], T[q].map((v, i) => v - me.fr[q][i]), k); tidy();
      if (["R", "F", "N"].every((q) => me.fr[q].every((v, i) => Math.abs(v - T[q][i]) < 2e-3))) { me.fr = { R: T.R, F: T.F, N: T.N }; easing = null; }
    }
    me.pitch = Math.max(-1.3, Math.min(1.3, me.pitch - look.y * 0.0028)); look.x = look.y = 0;
    let mv = [0, 0]; if (keys.has("w")) mv[1] += 1; if (keys.has("s")) mv[1] -= 1; if (keys.has("d")) mv[0] += 1; if (keys.has("a")) mv[0] -= 1;
    if (stick) mv = stick; const m = Math.hypot(...mv); if (m > 1) mv = mv.map((v) => v / m);
    const speed = keys.has("shift") ? 8.4 : 4.2, vel = add(me.fr.F.map((v) => v * mv[1] * speed), me.fr.R, mv[0] * speed);
    if (mode === "walk") me.p = walk(H, me.p, vel, dt, ground);
  }
  // the bike: who asks for its lean, one step of its dynamics, and back on the track if it falls or reaches the rim
  const nb = nearIdx(bike.pos, bhint, humanOn() ? 160 : 60); bhint = nb.i;
  const want = humanOn() ? humanLean(dt) : followLean(bike, aheadPt(nb.i, lookahead(bike.v)));
  // hands on, what you tilt is the handlebar's torque (the same tilt that asks for a lean when assisted, ×T_MAX/0.5)
  const hands = humanOn() && pilot === "hands" ? [dot(want, bike.c) * (T_MAX / handMax()), dot(want, bike.d) * (T_MAX / handMax())] : null;
  bike.step(dt, want, hands);
  if (bike.crashed || basinE(...bike.pos) > 0.95) { const n2 = nearIdx(bike.pos, bhint, NS / 2); fellWhy = bike.why; resetBike(n2.i); fellAt = now; }
  const st = bikePose();
  if (mode === "ride") {
    me.fr = rideFrame(); easing = null;
    me.p = add(add(st.p, st.T, -3.4), UP, 2.0); if (me.pitch > 0.2) me.pitch = 0.2;
  }
  Rd.bike(bikeParts(st), add(add(st.p, st.T, BIKE.WB / 2), st.u, 0.8), BOUND, COL[bike.mech]);
  const cp = Math.cos(me.pitch), sp = Math.sin(me.pitch), F = add(me.fr.F.map((v) => v * cp), UP, sp), U = add(UP.map((v) => v * cp), me.fr.F, -sp);
  Rd.draw({ eye: me.p.map((v) => v / VS), R: me.fr.R, U, F, sun: SUN, time: now / 1000, fae: opt.fae ? 1 : 0, tan: TAN, far: 440, vs: VS }, resolution(dt));
  const r = trackRead(), br = bikeRead(st, want); readout(r); mapDraw(st);
  if (mode === "ride") { const hud = now - fellAt < 2000 ? (fellWhy === "twist" ? "it fell: the frame couldn't twist fast enough" : "it fell: back on the track") : `${{ hands: "hands on", assisted: "assisted", autopilot: "autopilot" }[pilot]} · ${cam} · lean <b>${(st.phiTrue * 180 / Math.PI).toFixed(0)}°</b>${st.phiTrue > SILLY ? " ⚠ non-physical" : ""}, ${br.intoW}% into w · ${(bike.dist / LAP).toFixed(1)} laps`; if (hud !== readout.hud) { readout.hud = hud; $("hudT").innerHTML = hud; } }
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1); if (ov.width !== Math.round(ov.clientWidth * dpr)) { ov.width = Math.round(ov.clientWidth * dpr); ov.height = Math.round(ov.clientHeight * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, ov.clientWidth, ov.clientHeight); g.fillStyle = "rgba(255,255,255,0.7)"; g.beginPath(); g.arc(ov.clientWidth / 2, ov.clientHeight / 2, 1.6, 0, 2 * Math.PI); g.fill();
  if (mode === "ride") gauge(g, ov.clientWidth, ov.clientHeight, st, want);
  const wn = wName(); if (wn !== step.wn) { step.wn = wn; $("hudW").textContent = `unseen ${wn}`; }
  if (!frames) timing.first = Math.round(performance.now() - T0);
  frames++;
}
requestAnimationFrame(step);
window.LEAN = { timing, me, bike, human, setMode, setCam, setPilot, setMech, resetBike, get mode() { return mode; }, squareUp, faceTrack, get frames() { return frames; }, rot: (i, j, t) => { rotFr(i, j, t); tidy(); }, opt, track: () => trackRead(), lap };
