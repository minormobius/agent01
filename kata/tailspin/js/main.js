/* TAILSPIN — the page. The stadium, the shader, the dynamics and the cat are Lean's (../../lean/js/); a level is a course
   (./course.js) marked on Lean's floor, ridden by the Cheshire cat on its one-axis bike in easy mode: the stick is the
   lean (right right, up ana, down kata, in the camera's own non-twisting frame), the bike takes it at once. No autopilot.
   Leave the track (further than its radius from the centreline) for more than OFF_GRACE and you're put back at the last
   checkpoint; reach the finish and the card says how you did. */
import { DIM, ATLAS_C, VS, rimTerrain, blocks, markTrack, unmarkTrack, trackCells, trackBins, binTangents } from "../../lean/js/world.js";
import { Renderer } from "../../lean/js/render.js";
import { catOnBike, catFrame, bikeParts as catBikeParts, twistInertias, CAT_BOUND, CAT_MID, GEO as CGEO } from "../../lean/js/catbike.js";
import { K as CAT_K, cut as catCut } from "../../lean/js/cat.js";
import { TRACK_H } from "../../lean/js/world.js";
import { build, nearest, DS, V_CAT, G } from "./course.js";
import { startBike, throwFor, difficulty } from "./oracle.js";
import { LEVELS } from "./levels.js";
import { make, TIERS, todaySeed } from "./gen.js";

const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const to4 = (v, y = 0) => [v[0], y, v[1], v[2]], UP = [0, 1, 0, 0], GROUND = TRACK_H * VS, OFF_GRACE = 0.45, CHECK = 15;
let Rd;
try { Rd = new Renderer(glc); } catch (e) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">TAILSPIN needs WebGL2: ${String(e.message || e)}</p>`; throw e; }

/* the stadium, once: a level changes only the floor's markings */
const H = rimTerrain(1), M = blocks(H);
Rd.load(H, M, DIM, ATLAS_C);

/* ------------------------------------------------------------------ the level */
const game = { def: null, C: null, T: null, bike: null, hint: 0, check: 0, resets: 0, off: 0, sumOff: 0, n: 0, state: "menu", t: 0, label: "" };
const TAIL = { ratio: twistInertias().ratio, theta: 0.6, alpha0: 0, rate: 0, last: null };
function loadLevel(def, label, kicker) {
  if (game.T) unmarkTrack(H, game.T);
  const C = build(def.segs, def.R), T = trackCells(C.poly);
  markTrack(H, T); Rd.reload(H, DIM, ATLAS_C); Rd.aux(trackBins(T), binTangents(C.poly), DIM, ATLAS_C);
  Object.assign(game, { def, C, T, label, throw: throwFor(C) });
  restart(); showCard(kicker, label, def.lesson || "", "");
}
function placeAt(i) {
  const bike = startBike(game.C, i); game.bike = bike; game.hint = i; game.off = 0;
  TAIL.alpha0 = bike.alpha; TAIL.last = null; human.lc = human.ld = 0;
}
function restart() { placeAt(0); Object.assign(game, { check: 0, resets: 0, sumOff: 0, n: 0, t: 0, state: "ready" }); }

/* ------------------------------------------------------------------ cards and the menu */
const BEST = (() => { try { return JSON.parse(localStorage.getItem("tailspin.best") || "{}"); } catch (e) { return {}; } })();
const saveBest = () => { try { localStorage.setItem("tailspin.best", JSON.stringify(BEST)); } catch (e) { /* private */ } };
const MEDAL = ["", "🥉", "🥈", "🥇"];
function showCard(kicker, title, text, stats, next = false) {
  $("cardKicker").textContent = kicker; $("cardTitle").textContent = title; $("cardText").textContent = text; $("cardStats").innerHTML = stats;
  $("cardNext").hidden = !next; $("cardGo").textContent = game.state === "done" ? "AGAIN" : "RIDE"; $("card").hidden = false; $("menu").hidden = true;
}
function menu() {
  game.state = "menu"; $("card").hidden = true; $("menu").hidden = false;
  $("levels").innerHTML = LEVELS.map((l, i) => `<li><button type="button" data-i="${i}"><span class="n">${i + 1}</span><span class="nm">${l.name}</span><span class="sc">${l.score.toFixed(1)}</span><span class="md">${MEDAL[BEST[i] || 0]}</span></button></li>`).join("");
  for (const b of document.querySelectorAll("#levels button")) b.onclick = () => openLevel(+b.dataset.i);
}
function openLevel(i) { game.index = i; history.replaceState(null, "", `?level=${i + 1}`); const l = LEVELS[i]; loadLevel(l, l.name, `level ${i + 1} of ${LEVELS.length} · difficulty ${l.score.toFixed(1)}`); }
function openMade(tier, seed) {
  const m = make(seed, TIERS[tier === "today" ? "medium" : tier] ?? +tier); if (!m) return;
  game.index = -1; history.replaceState(null, "", `?seed=${seed}&tier=${tier}`);
  loadLevel({ segs: m.segs, R: m.R, lesson: `A made course, seed ${seed}: ${m.segs.filter((g) => g.r).length} bends, the track ${m.R} m in radius.` }, tier === "today" ? "Today's" : `Made · ${tier}`, `seed ${seed} · difficulty …`);
  setTimeout(() => { const d = difficulty(game.C, { step: 0.1 }); if (game.state === "ready") $("cardKicker").textContent = `seed ${seed} · difficulty ${d.score.toFixed(1)}`; }, 30); // the oracle rides it (coarsely: a 0.1 s grid)
}
/* a random course: one tap from anywhere (🎲 in the corner, on every card, at the top of the menu; N on a keyboard), at
   the tier last picked (medium to begin with) */
let tierPick = (() => { try { return localStorage.getItem("tailspin.tier") || "medium"; } catch (e) { return "medium"; } })();
const markTier = () => { for (const b of document.querySelectorAll(".made button")) b.classList.toggle("on", b.dataset.t === tierPick); };
function dice() { openMade(tierPick, Math.floor(Math.random() * 1e9)); }
for (const b of document.querySelectorAll(".made button")) b.onclick = () => {
  const t = b.dataset.t; if (t === "today") { openMade("today", todaySeed()); return; }
  tierPick = t; try { localStorage.setItem("tailspin.tier", t); } catch (e) { /* private */ } markTier(); dice();
};
markTier();
for (const id of ["diceB", "cardDice", "menuDice"]) $(id).onclick = dice;
$("cardGo").onclick = () => { if (game.state === "done") restart(); game.state = "play"; $("card").hidden = true; };
$("cardMenu").onclick = menu; $("menuB").onclick = menu;
$("cardNext").onclick = () => openLevel(Math.min(LEVELS.length - 1, game.index + 1));
$("retryB").onclick = () => { if (!game.C) return; restart(); game.state = "play"; $("card").hidden = true; };
let hintOn = true; $("hintB").onclick = () => { hintOn = !hintOn; $("hintB").classList.toggle("on", hintOn); };

/* ------------------------------------------------------------------ input: the stick, WASD and the arrows, dragging looks */
const human = { lc: 0, ld: 0 }, keys = new Set(); let stick = null, pitch = -0.1, look = 0;
document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if ((k === "enter" || k === " ") && !$("card").hidden) { e.preventDefault(); $("cardGo").onclick(); return; }
  if (k === "r") { $("retryB").onclick(); return; }
  if (k === "n") { dice(); return; }
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { e.preventDefault(); keys.add(k); }
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
/* where you ask the cat to lean, in your frame (across your slice, and into w: ana up), radians, at most the level's throw */
function ask(dt) {
  let x = 0, y = 0;
  if (stick) { x = stick[0]; y = stick[1]; }
  const kx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0), ky = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
  if (kx || ky) { const m = Math.hypot(kx, ky); x = (kx / m) * 0.8; y = (ky / m) * 0.8; }
  const k = 1 - Math.exp(-dt * 30); human.lc += (x * game.throw - human.lc) * k; human.ld += (y * game.throw - human.ld) * k;
}

/* ------------------------------------------------------------------ the camera and the pose */
function camFrame(b) { // the bike's non-twisting pair: across your slice c, and ana (the det keeps Lean's handedness)
  const R = to4(b.c), F = to4(b.T); let N = to4(b.d);
  const det = R[0] * (F[2] * N[3] - F[3] * N[2]) - R[2] * (F[0] * N[3] - F[3] * N[0]) + R[3] * (F[0] * N[2] - F[2] * N[0]);
  if (det < 0) N = N.map((v) => -v);
  return { R, F, N };
}
function pose(b) { // as Lean's bikePose: the pose catbike.js draws
  const p = to4(b.pos, GROUND), T = to4(b.T), L = to4(b.lean), phiT = Math.hypot(...L), phi = Math.min(phiT, 1.45), lh = phiT > 1e-6 ? L.map((x) => x / phiT) : to4(b.a);
  const u = add(UP.map((x) => x * Math.cos(phi)), lh, Math.sin(phi)), tilt = (x) => unit(add(x, u, -dot(x, u)));
  const Sv = to4(b.steer), dT = Math.hypot(...Sv), del = Math.min(dT, 1.2), sd = dT > 1e-6 ? Sv.map((x) => x / dT) : to4(b.a);
  return { p, T, u, a: tilt(to4(b.a)), b: tilt(to4(b.b)), Np: tilt(sd), Tf: add(T.map((x) => x * Math.cos(del)), sd, Math.sin(del)), delta: del, phi, lean: lh, ph: b.dist / (2 * CGEO.R) };
}

/* ------------------------------------------------------------------ the overlay: the gauge, and the map */
function gauge(g, w, h, fr, want) {
  const R = 46, cx = w / 2, cy = h - R - 34, k = R / game.throw, X = (v) => cx + dot(v, fr.R) * k, Y = (v) => cy - dot(v, fr.N) * k, cl = (v) => { const r = Math.hypot(X(v) - cx, Y(v) - cy); return r > R ? [cx + ((X(v) - cx) * R) / r, cy + ((Y(v) - cy) * R) / r] : [X(v), Y(v)]; };
  g.fillStyle = "rgba(7,8,12,0.45)"; g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  g.font = "10px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillStyle = "#38f2e0"; g.fillText("ana", cx, cy - R - 5); g.fillStyle = "#ff66b8"; g.fillText("kata", cx, cy + R + 12);
  if (hintOn) { // the lean the track wants here (its bend, in the frame you ride in: the course's own), a diamond
    const b = game.C.bend[Math.min(game.C.bend.length - 1, game.hint + Math.round(2 / DS))], s = (V_CAT * V_CAT) / G, hx = cx + b[0] * s * k, hy = cy - b[1] * s * k;
    g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(hx, hy - 6); g.lineTo(hx + 6, hy); g.lineTo(hx, hy + 6); g.lineTo(hx - 6, hy); g.closePath(); g.stroke();
  }
  const L = to4(game.bike.lean), W4 = to4(want), [wx, wy] = cl(W4), [lx, ly] = cl(L);
  g.strokeStyle = "#6fe0ff"; g.lineWidth = 1.6; g.beginPath(); g.arc(wx, wy, 7, 0, 2 * Math.PI); g.stroke();
  g.fillStyle = "#ffd27a"; g.beginPath(); g.arc(lx, ly, 5, 0, 2 * Math.PI); g.fill();
}
function mapDraw() {
  const cv = $("map"), dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const C = game.C; if (!C) return;
  const ya = 0.55, el = 0.62, ca = Math.cos(ya), sa = Math.sin(ya), ce = Math.cos(el), se = Math.sin(el), pr = (q) => { const u = q[0] * ca - q[1] * sa, v = q[0] * sa + q[1] * ca; return [u, -(q[2] * ce - v * se)]; };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let i = 0; i < C.pts.length; i += 20) { const p = pr(C.pts[i]); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const k = Math.min((w - 16) / (x1 - x0 || 1), (h - 16) / (y1 - y0 || 1)), P = (q) => { const p = pr(q); return [8 + (p[0] - x0) * k + ((w - 16) - (x1 - x0) * k) / 2, 8 + (p[1] - y0) * k + ((h - 16) - (y1 - y0) * k) / 2]; };
  const wmin = Math.min(...C.pts.map((q) => q[2])), wmax = Math.max(...C.pts.map((q) => q[2]));
  g.lineWidth = Math.max(2, C.R * k * 0.8); g.lineCap = "round";
  for (let i = 0; i + 10 < C.pts.length; i += 10) { const u = (C.pts[i][2] - wmin) / (wmax - wmin || 1), a = P(C.pts[i]), b = P(C.pts[i + 10]); g.strokeStyle = i < game.hint ? `hsla(${Math.round(175 + u * 115)}, 70%, 60%, 0.35)` : `hsl(${Math.round(175 + u * 115)}, 70%, 60%)`; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
  const f = P(C.pts[C.pts.length - 1]); g.fillStyle = "#fff"; g.beginPath(); g.arc(f[0], f[1], 3, 0, 2 * Math.PI); g.fill();
  const c = P(game.bike.pos); g.fillStyle = "#ffd27a"; g.strokeStyle = "#07080c"; g.lineWidth = 1.5; g.beginPath(); g.arc(c[0], c[1], 4, 0, 2 * Math.PI); g.fill(); g.stroke();
}

/* ------------------------------------------------------------------ the loop */
let prev = performance.now(), res = 0, lag = 1 / 60;
const FIXED = 1 / (+new URLSearchParams(location.search).get("dt") || Infinity), TAN = 0.85;
function resolution(dt) {
  const coarse = matchMedia("(pointer: coarse)").matches, dpr = Math.min(2, devicePixelRatio || 1), cap = Math.min(dpr, Math.sqrt(1.4e6 / Math.max(1, glc.clientWidth * glc.clientHeight)));
  if (!res) res = cap * (coarse ? 0.55 : 0.75);
  lag += (dt - lag) * 0.1; if (lag > 1 / 32 && res > 0.3) res *= 0.97; else if (lag < 1 / 55 && res < cap) res = Math.min(cap, res * 1.01);
  return Math.round(res * 40) / 40;
}
function step(now) {
  requestAnimationFrame(step);
  const dt = FIXED || Math.min(0.05, (now - prev) / 1000); prev = now;
  if (!game.C) return;
  const b = game.bike, C = game.C;
  ask(dt);
  const fr0 = camFrame(b), want = [0, 2, 3].map((j) => fr0.R[j] * human.lc + fr0.N[j] * human.ld);
  if (game.state === "play") {
    b.step(dt, want, null, true); game.t += dt;
    const nr = nearest(C, b.pos, game.hint, 80); game.hint = nr.i; game.sumOff += nr.d; game.n++;
    if (nr.d <= C.R) { game.off = 0; if (nr.s >= (game.check + 1) * CHECK) game.check = Math.floor(nr.s / CHECK); }
    else if ((game.off += dt) > OFF_GRACE) { game.resets++; placeAt(Math.round((game.check * CHECK) / DS)); game.state = "play"; game.flash = now; }
    if (nr.s >= C.len - 0.5) finish();
  }
  // the camera rides behind the cat, upright, in the bike's non-twisting frame
  const fr = camFrame(game.bike), st = pose(game.bike);
  pitch = Math.max(-1.0, Math.min(0.3, pitch - look * 0.0025)); look = 0;
  const eye = add(add(st.p, st.T, -1.6), UP, 0.85), cp = Math.cos(pitch), sp = Math.sin(pitch), F = add(fr.F.map((v) => v * cp), UP, sp), U = add(UP.map((v) => v * cp), fr.F, -sp);
  // the tail carries the twist: I_body α + I_tail θ stays put
  const th = TAIL.theta - TAIL.ratio * (game.bike.alpha - TAIL.alpha0);
  const cf = catFrame(st), P0 = catOnBike(st.ph, th), nC = cf.M.map((r) => dot(r, fr.N)), cC = dot(fr.N, add(eye, cf.O, -1)), hit = catCut(P0, nC, cC).parts;
  const Pc = { caps: P0.caps.filter((x) => hit.includes(x)), ells: P0.ells.filter((x) => hit.includes(x)), cavity: P0.cavity }, bc = cf.O.map((x, i) => x + cf.M.reduce((s2, r, k) => s2 + r[i] * CAT_MID[k], 0));
  Rd.bike(catBikeParts(st), add(add(st.p, st.T, 0.21), st.u, 0.3), 0.8, [0.95, 0.42, 0.62]);
  Rd.cat(Pc, cf.O, cf.M, bc, CAT_BOUND, CAT_K);
  Rd.draw({ eye: eye.map((v) => v / VS), R: fr.R, U, F, N: fr.N, sun: SUN, time: now / 1000, fae: 0, tan: TAN, far: 440, vs: VS }, resolution(dt));
  // the overlay and the HUD
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
  if (ov.width !== Math.round(ov.clientWidth * dpr) || ov.height !== Math.round(ov.clientHeight * dpr)) { ov.width = Math.round(ov.clientWidth * dpr); ov.height = Math.round(ov.clientHeight * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, ov.clientWidth, ov.clientHeight);
  if (game.state === "play" || game.state === "ready") gauge(g, ov.clientWidth, ov.clientHeight, fr, want);
  $("barFill").style.width = `${Math.min(100, (100 * game.hint * DS) / C.len).toFixed(1)}%`;
  const offNow = game.off > 0, info = `${game.label} · ${Math.round((100 * game.hint * DS) / C.len)}% · ${game.resets ? `<b>${game.resets}</b> back to a checkpoint` : "clean"}${offNow ? ` · <span class="off">off the track!</span>` : ""}${now - (game.flash || -1e9) < 1500 ? ` · <span class="off">back at the checkpoint</span>` : ""}`;
  if (info !== step.info) { step.info = info; $("hudInfo").innerHTML = info; }
  mapDraw();
}
const SUN = unit([0.35, 0.42, -0.8, 0.2]);
function finish() {
  game.state = "done";
  const mean = game.sumOff / Math.max(1, game.n), medal = game.resets === 0 && mean < game.C.R / 4 ? 3 : game.resets === 0 ? 2 : 1;
  if (game.index >= 0) { BEST[game.index] = Math.max(BEST[game.index] || 0, medal); saveBest(); }
  showCard(`${MEDAL[medal]} finished`, game.label, medal === 3 ? "Clean, and close to the line all the way." : medal === 2 ? "Clean: you never left the track." : "Made it, with a few trips back to a checkpoint.",
    `${game.C.len.toFixed(0)} m in ${game.t.toFixed(1)} s · ${game.resets} back to a checkpoint · on average <b>${mean.toFixed(2)} m</b> off the line (the track is ${game.C.R} m wide each way)`, game.index >= 0 && game.index < LEVELS.length - 1);
}

/* ------------------------------------------------------------------ start */
const q = new URLSearchParams(location.search);
if (q.get("seed")) openMade(q.get("tier") || "medium", +q.get("seed"));
else if (q.get("level")) openLevel(Math.max(0, Math.min(LEVELS.length - 1, +q.get("level") - 1)));
else { openLevel(0); menu(); } // the first level's course behind the menu
requestAnimationFrame(step);
window.TAILSPIN = { game, human, openLevel, openMade, menu, LEVELS, placeAt };
/* no text selection, long-press menu or callout from a held finger (iOS ignores some of the CSS on its own) */
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); });
