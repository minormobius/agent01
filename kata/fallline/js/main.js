/* FALL LINE — the page. The shader, the dynamics and the cat are Lean's (../../lean/js/), the lessons' courses and
   generator idiom TAILSPIN's; a level is a tree of trails down a hill (./trails.js), baked into a height map the shader
   ray-marches and the physics rides. The Cheshire cat, its one-axis bike, easy mode (the stick is the lean), its speed
   from the slope. Off the trails is rough and slow but allowed; the valley's walls send you back to the last
   checkpoint. Reach the end of any trail: that's the bottom. */
import { Renderer } from "../../lean/js/render.js";
import { catOnBike, catFrame, bikeParts as catBikeParts, twistInertias, CAT_BOUND, CAT_MID, GEO as CGEO } from "../../lean/js/catbike.js";
import { K as CAT_K, cut as catCut } from "../../lean/js/cat.js";
import { DS, G } from "../../tailspin/js/course.js";
import { buildTrails, bake, sampler, speedStep, routes, HN, BASIN } from "./trails.js";
import { startBike, underBike, THROW, V0 } from "./descent.js";
import { LEVELS } from "./levels.js";
import { make, TIERS, todaySeed } from "./gen.js";
import { kelvin } from "./kelvin.js";

const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const to4 = (v, y = 0) => [v[0], y, v[1], v[2]], UP = [0, 1, 0, 0], CHECK = 10;
let Rd;
try { Rd = new Renderer(glc); } catch (e) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">FALL LINE needs WebGL2: ${String(e.message || e)}</p>`; throw e; }
const GRAINS = ["kelvin", "grid", "none"], KELVIN = kelvin();
let grain = "kelvin";
function setGrain(g) { grain = g; Rd.grain(g === "kelvin" ? KELVIN : g === "grid" ? "grid" : null); $("grainB").textContent = `grain: ${g}`; }

/* ------------------------------------------------------------------ the level */
const game = { def: null, B: null, S: null, built: null, bike: null, v: V0, state: "menu", t: 0, label: "", hint: null, check: null, resets: 0, par: null };
const TAIL = { ratio: twistInertias().ratio, theta: 0.6, alpha0: 0 };
function loadLevel(def, label, kicker, B = null) {
  const built = B ? B.built : buildTrails(def), baked = B || bake(def, built, def.seed || 1);
  Rd.hill(baked.H, baked.F, HN, baked.L, built.R, baked.tan, baked.rows); setGrain(grain);
  const top = built.trails[0].y[0], ends = built.trails.map((t) => ({ p: t.pts[t.pts.length - 1], y: t.y[t.y.length - 1] }));
  Object.assign(game, { def, B: baked, S: sampler(baked), built, label, top, ends, bottom: Math.min(...ends.map((e) => e.y)), par: def.par ?? null, routes: routes(built) });
  restart(); showCard(kicker, label, def.lesson || "", game.par ? `par <b>${game.par.toFixed(1)} s</b> · ${built.trails.length} way${built.trails.length > 1 ? "s" : ""} down` : `${built.trails.length} way${built.trails.length > 1 ? "s" : ""} down`);
}
function placeSnap(snap) {
  const r = game.routes[0], b = startBike(r, 0);
  if (snap) { b.place(snap.pos, snap.T, snap.c); }
  game.bike = b; game.v = snap ? Math.max(V0, snap.v * 0.6) : V0; TAIL.alpha0 = b.alpha; human.lc = human.ld = 0; game.near = { t: 0, i: 0 };
}
function restart() { placeSnap(null); Object.assign(game, { state: "ready", t: 0, resets: 0, check: null, dist: 0, offTime: 0, flash: -1e9 }); }

/* ------------------------------------------------------------------ cards and the menu */
const BEST = (() => { try { return JSON.parse(localStorage.getItem("fallline.best") || "{}"); } catch (e) { return {}; } })();
const saveBest = () => { try { localStorage.setItem("fallline.best", JSON.stringify(BEST)); } catch (e) { /* private */ } };
const MEDAL = ["", "🥉", "🥈", "🥇"];
function showCard(kicker, title, text, stats, next = false) {
  $("cardKicker").textContent = kicker; $("cardTitle").textContent = title; $("cardText").textContent = text; $("cardStats").innerHTML = stats;
  $("cardNext").hidden = !next; $("cardGo").textContent = game.state === "done" ? "AGAIN" : "RIDE"; $("card").hidden = false; $("menu").hidden = true;
}
function menu() {
  game.state = "menu"; $("card").hidden = true; $("menu").hidden = false;
  $("levels").innerHTML = LEVELS.map((l, i) => `<li><button type="button" data-i="${i}"><span class="n">${i + 1}</span><span class="nm">${l.name}</span><span class="sc">${l.score.toFixed(1)} · par ${l.par.toFixed(0)} s</span><span class="md">${MEDAL[BEST[i] || 0]}</span></button></li>`).join("");
  for (const b of document.querySelectorAll("#levels button")) b.onclick = () => openLevel(+b.dataset.i);
}
function openLevel(i) { game.index = i; history.replaceState(null, "", `?level=${i + 1}`); const l = LEVELS[i]; loadLevel(l, l.name, `level ${i + 1} of ${LEVELS.length} · difficulty ${l.score.toFixed(1)}`); }
function openMade(tier, seed) {
  const m = make(seed, TIERS[tier === "today" ? "medium" : tier] ?? 0.5); if (!m) return;
  game.index = -1; history.replaceState(null, "", `?seed=${seed}&tier=${tier}`);
  const def = { ...m, par: m.sol.par.time, lesson: `A made hill, seed ${seed}: ${m.trails.length} ways down, the trails ${m.R} m wide each way, ${Math.round(m.grade * 100)}% on the main one.` };
  loadLevel(def, tier === "today" ? "Today's" : `Made · ${tier}`, `seed ${seed} · difficulty ${m.sol.score.toFixed(1)}`, m.B);
}
let tierPick = (() => { try { return localStorage.getItem("fallline.tier") || "medium"; } catch (e) { return "medium"; } })();
const markTier = () => { for (const b of document.querySelectorAll(".made button")) b.classList.toggle("on", b.dataset.t === tierPick); };
function dice() { openMade(tierPick, Math.floor(Math.random() * 1e9)); }
for (const b of document.querySelectorAll(".made button")) b.onclick = () => { const t = b.dataset.t; if (t === "today") { openMade("today", todaySeed()); return; } tierPick = t; try { localStorage.setItem("fallline.tier", t); } catch (e) { /* private */ } markTier(); dice(); };
markTier();
for (const id of ["diceB", "cardDice", "menuDice"]) $(id).onclick = dice;
$("cardGo").onclick = () => { if (game.state === "done") restart(); game.state = "play"; $("card").hidden = true; };
$("cardMenu").onclick = menu; $("menuB").onclick = menu;
$("cardNext").onclick = () => openLevel(Math.min(LEVELS.length - 1, game.index + 1));
$("retryB").onclick = () => { if (!game.B) return; restart(); game.state = "play"; $("card").hidden = true; };
let hintOn = true; $("hintB").onclick = () => { hintOn = !hintOn; $("hintB").classList.toggle("on", hintOn); };
$("grainB").onclick = () => setGrain(GRAINS[(GRAINS.indexOf(grain) + 1) % GRAINS.length]);

/* ------------------------------------------------------------------ input (TAILSPIN's) */
const human = { lc: 0, ld: 0 }, keys = new Set(); let stick = null, pitch = -0.16, look = 0;
document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if ((k === "enter" || k === " ") && !$("card").hidden) { e.preventDefault(); $("cardGo").onclick(); return; }
  if (k === "r") { $("retryB").onclick(); return; }
  if (k === "n") { dice(); return; }
  if (k === "g") { $("grainB").onclick(); return; }
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
function ask(dt) {
  let x = 0, y = 0; if (stick) { x = stick[0]; y = stick[1]; }
  const kx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0), ky = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
  if (kx || ky) { const m = Math.hypot(kx, ky); x = (kx / m) * 0.8; y = (ky / m) * 0.8; }
  const k = 1 - Math.exp(-dt * 30); human.lc += (x * THROW - human.lc) * k; human.ld += (y * THROW - human.ld) * k;
}

/* ------------------------------------------------------------------ the camera and the pose: the bike pitched to the slope */
function camFrame(b) {
  const R = to4(b.c), F = to4(b.T); let N = to4(b.d);
  const det = R[0] * (F[2] * N[3] - F[3] * N[2]) - R[2] * (F[0] * N[3] - F[3] * N[0]) + R[3] * (F[0] * N[2] - F[2] * N[0]);
  if (det < 0) N = N.map((v) => -v);
  return { R, F, N };
}
function pose(b, h, grade) {
  const p = to4(b.pos, h), Th = to4(b.T), T = unit(add(Th, UP, grade)), u0 = unit(add(UP, T, -dot(UP, T)));
  const L = to4(b.lean), phiT = Math.hypot(...L), phi = Math.min(phiT, 1.45), lh = phiT > 1e-6 ? L.map((x) => x / phiT) : to4(b.a);
  const u = add(u0.map((x) => x * Math.cos(phi)), lh, Math.sin(phi)), tilt = (x) => unit(add(add(x, u, -dot(x, u)), T, -dot(x, T)));
  const Sv = to4(b.steer), dT = Math.hypot(...Sv), del = Math.min(dT, 1.2), sd = dT > 1e-6 ? Sv.map((x) => x / dT) : to4(b.a);
  return { p, T, u, a: tilt(to4(b.a)), b: tilt(to4(b.b)), Np: tilt(sd), Tf: add(T.map((x) => x * Math.cos(del)), sd, Math.sin(del)), delta: del, phi, lean: lh, ph: b.dist / (2 * CGEO.R) };
}

/* ------------------------------------------------------------------ the nearest trail point, and the overlay */
function nearTrail(g) { // the nearest trail sample (searching near the last one, and widely now and then)
  const T = game.built.trails, n0 = game.near; let best = { d: Infinity, t: n0.t, i: n0.i };
  const scan = (t, lo, hi) => { const tr = T[t]; for (let i = Math.max(0, lo); i <= Math.min(tr.pts.length - 1, hi); i += 2) { const q = tr.pts[i], d = Math.hypot(g[0] - q[0], g[1] - q[1], g[2] - q[2]); if (d < best.d) best = { d, t, i }; } };
  for (let t = 0; t < T.length; t++) { if (t === n0.t) scan(t, n0.i - 150, n0.i + 150); else scan(t, 0, T[t].pts.length - 1); }
  game.near = best; return best;
}
function gauge(g, w, h, fr, want) {
  const R = 46, cx = w / 2, cy = h - R - 34, k = R / THROW, X = (v) => cx + dot(v, fr.R) * k, Y = (v) => cy - dot(v, fr.N) * k, cl = (v) => { const r = Math.hypot(X(v) - cx, Y(v) - cy); return r > R ? [cx + ((X(v) - cx) * R) / r, cy + ((Y(v) - cy) * R) / r] : [X(v), Y(v)]; };
  g.fillStyle = "rgba(7,8,12,0.45)"; g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  g.font = "10px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillStyle = "#38f2e0"; g.fillText("ana", cx, cy - R - 5); g.fillStyle = "#ff66b8"; g.fillText("kata", cx, cy + R + 12);
  const nt = game.near;
  if (hintOn && nt && nt.d < game.built.R * 1.5) { // the lean the trail wants just ahead, at your speed, in the frame you ride in (the trail's, through its forks)
    const tr = game.built.trails[nt.t], b = tr.bend[Math.min(tr.bend.length - 1, nt.i + Math.round((1 + game.v) / DS))], f = tr.fr[nt.i], s = (game.v * game.v) / G;
    const kv = add(f.e1.map((x) => x * b[0]), f.e2, b[1]), K = to4(kv.map((x) => x * s)), [hx, hy] = cl(K);
    g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(hx, hy - 6); g.lineTo(hx + 6, hy); g.lineTo(hx, hy + 6); g.lineTo(hx - 6, hy); g.closePath(); g.stroke();
  }
  const [wx, wy] = cl(to4(want)), [lx, ly] = cl(to4(game.bike.lean));
  g.strokeStyle = "#6fe0ff"; g.lineWidth = 1.6; g.beginPath(); g.arc(wx, wy, 7, 0, 2 * Math.PI); g.stroke();
  g.fillStyle = "#ffd27a"; g.beginPath(); g.arc(lx, ly, 5, 0, 2 * Math.PI); g.fill();
}
function mapDraw() {
  const cv = $("map"), dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const T = game.built.trails, all = T.flatMap((t) => t.pts.filter((_, i) => i % 20 === 0));
  const ya = 0.55, el = 0.62, ca = Math.cos(ya), sa = Math.sin(ya), ce = Math.cos(el), se = Math.sin(el), pr = (q) => { const u = q[0] * ca - q[1] * sa, v = q[0] * sa + q[1] * ca; return [u, -(q[2] * ce - v * se)]; };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const q of all) { const p = pr(q); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const k = Math.min((w - 16) / (x1 - x0 || 1), (h - 16) / (y1 - y0 || 1)), P = (q) => { const p = pr(q); return [8 + (p[0] - x0) * k + ((w - 16) - (x1 - x0) * k) / 2, 8 + (p[1] - y0) * k + ((h - 16) - (y1 - y0) * k) / 2]; };
  const top = game.top, bot = game.bottom; g.lineCap = "round"; g.lineWidth = Math.max(2, game.built.R * k * 0.8);
  for (const t of T) for (let i = 0; i + 10 < t.pts.length; i += 10) { const u = (t.y[i] - bot) / (top - bot || 1), a = P(t.pts[i]), b = P(t.pts[i + 10]); g.strokeStyle = `hsl(${Math.round(30 + 160 * (1 - u))}, 70%, ${45 + 20 * u}%)`; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
  for (const e of game.ends) { const p = P(e.p); g.fillStyle = "#fff"; g.beginPath(); g.arc(p[0], p[1], 3, 0, 2 * Math.PI); g.fill(); }
  const c = P(game.bike.pos); g.fillStyle = "#ffd27a"; g.strokeStyle = "#07080c"; g.lineWidth = 1.5; g.beginPath(); g.arc(c[0], c[1], 4, 0, 2 * Math.PI); g.fill(); g.stroke();
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
const basinE = (q) => Math.hypot((q[0] - BASIN.c[0]) / BASIN.a[0], (q[1] - BASIN.c[1]) / BASIN.a[1], (q[2] - BASIN.c[2]) / BASIN.a[2]);
function step(now) {
  requestAnimationFrame(step);
  const dt = FIXED || Math.min(0.05, (now - prev) / 1000); prev = now;
  if (!game.B) return;
  const b = game.bike, R = game.built.R;
  ask(dt);
  const fr0 = camFrame(b), want = [0, 2, 3].map((j) => fr0.R[j] * human.lc + fr0.N[j] * human.ld);
  const u = underBike(game.S, b, R);
  if (game.state === "play") {
    game.v = speedStep(game.v, u.grade, u.on, dt); b.v = game.v; b.step(dt, want, null, true); game.t += dt; game.dist += game.v * dt;
    const nt = nearTrail(b.pos);
    if (u.on && (!game.check || game.dist - game.check.dist > CHECK)) game.check = { pos: b.pos.slice(), T: b.T.slice(), c: b.c.slice(), v: game.v, dist: game.dist };
    game.offTime = u.on ? 0 : game.offTime + dt;
    if (basinE(b.pos) > 0.86) { game.resets++; placeSnap(game.check); game.flash = now; }
    for (const e of game.ends) if (Math.hypot(b.pos[0] - e.p[0], b.pos[1] - e.p[1], b.pos[2] - e.p[2]) < 2 * R) { finish(); break; }
  } else nearTrail(b.pos);
  const st = pose(game.bike, game.S.height(game.bike.pos), u.grade), fr = camFrame(game.bike);
  pitch = Math.max(-1.0, Math.min(0.3, pitch - look * 0.0025)); look = 0;
  let eye = add(add(to4(game.bike.pos, st.p[1]), fr.F, -1.7), UP, 0.95); const eg = [eye[0], eye[2], eye[3]], floor = game.S.height(eg) + 0.4; if (eye[1] < floor) eye[1] = floor;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), F = add(fr.F.map((v) => v * cp), UP, sp), U = add(UP.map((v) => v * cp), fr.F, -sp);
  const th = TAIL.theta - TAIL.ratio * (game.bike.alpha - TAIL.alpha0);
  const cf = catFrame(st), P0 = catOnBike(st.ph, th), nC = cf.M.map((r) => dot(r, fr.N)), cC = dot(fr.N, add(eye, cf.O, -1)), hit = catCut(P0, nC, cC).parts;
  const Pc = { caps: P0.caps.filter((x) => hit.includes(x)), ells: P0.ells.filter((x) => hit.includes(x)), cavity: P0.cavity }, bc = cf.O.map((x, i) => x + cf.M.reduce((s2, r, k) => s2 + r[i] * CAT_MID[k], 0));
  Rd.bike(catBikeParts(st), add(add(st.p, st.T, 0.21), st.u, 0.3), 0.8, [0.95, 0.42, 0.62]);
  Rd.cat(Pc, cf.O, cf.M, bc, CAT_BOUND, CAT_K);
  Rd.draw({ eye: eye.map((v) => v / 0.5), R: fr.R, U, F, N: fr.N, sun: SUN, time: now / 1000, fae: 0, tan: TAN, far: 440, vs: 0.5 }, resolution(dt));
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
  if (ov.width !== Math.round(ov.clientWidth * dpr) || ov.height !== Math.round(ov.clientHeight * dpr)) { ov.width = Math.round(ov.clientWidth * dpr); ov.height = Math.round(ov.clientHeight * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, ov.clientWidth, ov.clientHeight);
  if (game.state === "play" || game.state === "ready") gauge(g, ov.clientWidth, ov.clientHeight, fr, want);
  const down = Math.max(0, Math.min(1, (game.top - u.h) / (game.top - game.bottom || 1)));
  $("barFill").style.width = `${(100 * down).toFixed(1)}%`;
  const info = `${game.label} · <b>${game.v.toFixed(1)}</b> m/s · ${game.t.toFixed(1)} s${game.par ? ` / par ${game.par.toFixed(1)}` : ""}${u.on ? "" : ` · <span class="off">off the trail: rough</span>`}${now - game.flash < 1500 ? ` · <span class="off">back at the checkpoint</span>` : ""}`;
  if (info !== step.info) { step.info = info; $("hudInfo").innerHTML = info; }
  mapDraw();
}
function finish() {
  game.state = "done";
  const r = game.par ? game.t / game.par : 2, medal = r <= 1.05 ? 3 : r <= 1.25 ? 2 : 1;
  if (game.index >= 0) { BEST[game.index] = Math.max(BEST[game.index] || 0, medal); saveBest(); }
  showCard(`${MEDAL[medal]} at the bottom`, game.label, medal === 3 ? "As quick as the oracle's best way down, or near it." : medal === 2 ? "Within a quarter of par." : "Down. There's a quicker way.",
    `${game.t.toFixed(1)} s${game.par ? ` · par ${game.par.toFixed(1)} s` : ""} · ${game.resets} back to a checkpoint`, game.index >= 0 && game.index < LEVELS.length - 1);
}

/* ------------------------------------------------------------------ start */
const q = new URLSearchParams(location.search);
if (q.get("seed")) openMade(q.get("tier") || "medium", +q.get("seed"));
else if (q.get("level")) openLevel(Math.max(0, Math.min(LEVELS.length - 1, +q.get("level") - 1)));
else { openLevel(0); menu(); }
requestAnimationFrame(step);
window.FALLLINE = { game, human, openLevel, openMade, menu, LEVELS, setGrain };
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); });
