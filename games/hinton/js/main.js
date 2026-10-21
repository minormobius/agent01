/* Hinton — the page: four-dimensional rooms in first person. Two lanes on
   one engine: Anakata's rooms (w sideways: you see it by turning your sight
   and cross it with the hook) and Anabasis's (w a second down: you fall kata
   and only a ramp takes you ana). The rules, the levels, the generators and
   the ray tracer are those games' own; this page is a camera behind your
   eyes and a walker (./walker.js) that turns continuous movement into their
   moves, one per cell crossed.

   The view is a 3D slice of the 4D room through you, in a frame of four
   directions: Eu and Ev across, Ez up, N hidden. Each lane has its three
   frames, as in its own game, and turning your sight rotates between them;
   your look (yaw and pitch) is within the slice. You walk along whatever's
   across in the slice, but only in x and y: in Anakata nothing walks you
   through w, and in Anabasis only a ramp does. */
import { parse, ACTIONS, HOOKS } from "../../anakata/js/world.js";
import { Renderer } from "../../anakata/js/render.js";
import { encode, decode, seedOf, generate as genAnakata } from "../../anakata/js/gen.js";
import { generate as genAnabasis } from "../../anabasis/js/gen.js";
import { LEVELS as AK } from "../../anakata/js/levels.js";
import { LEVELS as AB } from "../../anabasis/js/levels.js";
import { Walker, SPEED } from "./walker.js";

const $ = (id) => document.getElementById(id);
const glc = $("gl"), oc = $("over"), octx = oc.getContext("2d");
let Rd = null;
try { Rd = new Renderer(glc); } catch (e) { $("start").innerHTML = `<h1>HINTON</h1><p>This needs WebGL2, which this browser doesn't have: ${String(e.message || e)}</p>`; throw e; }

/* ------------------------------------------------------------- the lanes */
const LANES = {
  anakata: {
    title: "Anakata", levels: AK, allow: () => true, hook: true, generate: genAnakata, worker: "../../anakata/js/gen-worker.js",
    dailyKey: "anakata ", dailyTier: "hard", sky: null,
    // frames of the x-y-w space; z is always up
    sub: [0, 1, 3], roles: ["Eu", "Ev", "N"], fixed: { Ez: [0, 0, 1, 0] },
    frames: [{ Eu: [1, 0, 0], Ev: [0, 1, 0], N: [0, 0, 1] }, { Eu: [1, 0, 0], Ev: [0, 0, 1], N: [0, -1, 0] }, { Eu: [0, 0, 1], Ev: [0, 1, 0], N: [-1, 0, 0] }],
  },
  anabasis: {
    title: "Anabasis", levels: AB, allow: (a) => a.kind === "walk", hook: false, generate: genAnabasis, worker: "../../anabasis/js/gen-worker.js",
    dailyKey: "anabasis ", dailyTier: "hard", sky: [[0.03, 0.012, 0.03], [0.24, 0.1, 0.12], [0.1, 0.05, 0.07]],
    // frames of the y-z-w space; x is always across. z up, then w up (the kata wall is your floor), then x·w across
    sub: [1, 2, 3], roles: ["Ev", "Ez", "N"], fixed: { Eu: [1, 0, 0, 0] },
    frames: [{ Ev: [1, 0, 0], Ez: [0, 1, 0], N: [0, 0, 1] }, { Ev: [1, 0, 0], Ez: [0, 0, 1], N: [0, -1, 0] }, { Ev: [0, 0, 1], Ez: [0, 1, 0], N: [-1, 0, 0] }],
  },
};
const laneOf = (world) => (world.gravW ? "anabasis" : "anakata");

/* ------------------------------------------------------------- frames */
function quatFromMat(m) {
  const t = m[0][0] + m[1][1] + m[2][2];
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; return [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4]; }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; return [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s]; }
  if (m[1][1] > m[2][2]) { const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; return [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s]; }
  const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; return [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s];
}
function slerpId(q, t) {
  const w = Math.max(-1, Math.min(1, q[3])), th = Math.acos(w), s = Math.sin(th);
  if (s < 1e-6) return [0, 0, 0, 1];
  const a = Math.sin((1 - t) * th) / s, b = Math.sin(t * th) / s;
  return [b * q[0], b * q[1], b * q[2], a + b * q[3]];
}
function rotV(q, v) {
  const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
function between(lane, A, B) { // R = B·Aᵀ, over the lane's three moving directions
  const a = lane.roles.map((r) => A[r]), b = lane.roles.map((r) => B[r]), m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) m[r][c] += b[k][r] * a[k][c];
  return quatFromMat(m);
}
let view = 0, turn = null;
const TURN_MS = 700;
function frameNow(now) {
  const lane = LANES[L.lane];
  let F = lane.frames[view];
  if (turn) {
    const t = Math.min(1, (now - turn.t0) / TURN_MS), e = t * t * (3 - 2 * t), q = slerpId(turn.q, e), A = lane.frames[turn.from];
    if (t >= 1) turn = null; else { F = {}; for (const r of lane.roles) F[r] = rotV(q, A[r]); }
  }
  const to4 = (v) => { const o = [0, 0, 0, 0]; lane.sub.forEach((ax, i) => { o[ax] = v[i]; }); return o; };
  const out = Object.assign({}, lane.fixed);
  for (const r of lane.roles) out[r] = to4(F[r]);
  return out;
}
function turnSight(dir = 1) {
  if (turn || !L) return;
  const lane = LANES[L.lane], from = view; view = (view + dir + 3) % 3;
  turn = { from, q: between(lane, lane.frames[from], lane.frames[view]), t0: performance.now() };
  seeing();
}

/* ------------------------------------------------------------- the camera: behind your eyes */
let yaw = 0.6, pitch = -0.25;
const EYE = 0.16, TAN = 0.74;
function camera() {
  const cp = Math.cos(pitch), F = [Math.sin(yaw) * cp, Math.cos(yaw) * cp, Math.sin(pitch)];
  const Rr = [Math.cos(yaw), -Math.sin(yaw), 0], U = [Rr[1] * F[2] - Rr[2] * F[1], Rr[2] * F[0] - Rr[0] * F[2], Rr[0] * F[1] - Rr[1] * F[0]];
  return { pos: [0, 0, EYE], R: Rr, U, F, tan: TAN, dist: 4.5 };
}
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const in4 = (Fr, v) => [0, 1, 2, 3].map((j) => v[0] * Fr.Eu[j] + v[1] * Fr.Ev[j] + v[2] * Fr.Ez[j]); // a view-space vector, in 4D

/* ------------------------------------------------------------- the room */
let L = null; // { lane, src, world, W (walker), par }
let won = false, beam = null;
const best = (() => { try { return JSON.parse(localStorage.getItem("hinton.best") || "{}"); } catch (e) { return {}; } })();
const saveBest = () => { try { localStorage.setItem("hinton.best", JSON.stringify(best)); } catch (e) { /* private mode */ } };

function start(world, src, par) {
  const lane = laneOf(world);
  if (par == null) { const sol = world.solve(LANES[lane].allow); par = sol.moves ? sol.moves.length : null; }
  src.code = src.code || encode(world);
  L = { lane, src, world, W: new Walker(world), par };
  Rd.setWorld(world); won = false; beam = null; turn = null; view = 0;
  $("won").hidden = true; $("hook").hidden = !LANES[lane].hook;
  const t = LANES[lane].title;
  $("lvlno").textContent = src.kind === "tutorial" ? `${t} · ${src.i + 1} of ${LANES[lane].levels.length}` : src.kind === "daily" ? `${t} · today · ${src.date}` : src.kind === "gen" ? `${t} · ${src.tier} room` : `${t} · a shared room`;
  $("lvlname").textContent = src.kind === "tutorial" ? world.name : src.kind === "gen" ? src.seed.toString(36) : src.kind === "daily" ? "daily" : "shared";
  const hint = world.hint || `A room someone shared. Par ${par}: the fewest moves there are.`;
  $("hint-text").textContent = hint; $("hint").hidden = !hint;
  const q = src.kind === "tutorial" ? `?lane=${lane}&level=${src.i + 1}` : src.kind === "daily" ? `?lane=${lane}&daily=${src.date}` : "?room=" + src.code;
  try { history.replaceState(null, "", location.pathname + q); } catch (e) { /* sandboxed */ }
  try { localStorage.setItem("hinton.last", q); } catch (e) { /* private mode */ }
  hud(); seeing();
}
function load(lane, i) { start(parse(LANES[lane].levels[i]), { kind: "tutorial", i }); }
const workers = {};
let asked = 0;
function room(lane, tier, seed, kind = "gen", date) {
  toast("building a room in four dimensions…");
  const id = ++asked, Ln = LANES[lane];
  const done = (res) => {
    if (id !== asked) return;
    if (!res || !res.code) { toast("no room came out of that seed; try another"); return; }
    const world = decode(res.code, tier + " " + res.seed.toString(36)); world.hint = res.hint;
    start(world, { kind, tier, seed: res.seed, date, code: res.code }, res.par);
    $("toast").classList.remove("show");
  };
  let wk = workers[lane];
  if (wk === undefined) { try { wk = workers[lane] = new Worker(new URL(Ln.worker, import.meta.url), { type: "module" }); } catch (e) { wk = workers[lane] = null; } }
  if (wk) { wk.onmessage = (e) => done(e.data); wk.onerror = () => { workers[lane] = null; room(lane, tier, seed, kind, date); }; wk.postMessage({ tier, seed, id }); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (let k = 0; k < 6; k++) { const r = Ln.generate((seed + k) >>> 0, tier); if (r) return done({ code: encode(r.world), par: r.par, seed: (seed + k) >>> 0, hint: r.world.hint }); }
    done(null);
  }));
}
const today = () => new Date().toISOString().slice(0, 10);
const daily = (lane, date = today()) => room(lane, LANES[lane].dailyTier, seedOf(LANES[lane].dailyKey + date), "daily", date); // the same room as that game's own daily
const fresh = (lane, tier) => room(lane, tier, (Math.random() * 2 ** 32) >>> 0);
function fromCode(code) {
  try { start(decode(code), { kind: "code", code }); return true; } catch (e) { setTimeout(() => toast("That link isn't a room (" + e.message + "), so here's a level."), 1200); return false; }
}
const bestKey = () => (L.src.kind === "tutorial" ? L.lane + ":" + L.world.name : "room:" + L.src.code);
async function share() {
  if (!L) return;
  const url = location.origin + location.pathname + (L.src.kind === "tutorial" ? `?lane=${L.lane}&level=${L.src.i + 1}` : "?room=" + L.src.code);
  const text = `Hinton — a room in four dimensions, in first person. Par ${L.par}.`;
  try { if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: "Hinton", text, url }); return; } } catch (e) { /* cancelled */ }
  try { await navigator.clipboard.writeText(url); toast("Link copied: it opens this exact room."); } catch (e) { prompt("The link to this room:", url); }
}
function hud() {
  $("moves").textContent = L.W.moves; $("par").textContent = L.par == null ? "—" : L.par;
  const c = L.world.coords(L.W.s.p);
  $("alt").innerHTML = `<i style="color:var(--z)">z</i>${c[2]} <i style="color:var(--w)">w</i>${c[3]}`;
}
function seeing() {
  const lane = LANES[L.lane], Fr = lane.frames[view], to4 = (v) => { const o = [0, 0, 0, 0]; lane.sub.forEach((ax, i) => { o[ax] = v[i]; }); return o; };
  const F = Object.assign({}, lane.fixed); for (const r of lane.roles) F[r] = to4(Fr[r]);
  const n = (v) => (Math.abs(v[0]) > 0.5 ? "x" : Math.abs(v[1]) > 0.5 ? "y" : Math.abs(v[2]) > 0.5 ? "z" : "w");
  const col = { x: "var(--x)", y: "var(--y)", z: "var(--z)", w: "var(--w)" }, i = (a) => `<i style="color:${col[a]}">${a}</i>`;
  $("seeing").innerHTML = `${i(n(F.Eu))} · ${i(n(F.Ev))} · ↑${i(n(F.Ez))} <span class="hid">(${n(F.N)} hidden)</span>`;
}
let toastT = 0, lastToast = "";
function toast(msg) { $("toast").textContent = msg; $("toast").classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => { $("toast").classList.remove("show"); lastToast = ""; }, 2400); lastToast = msg; }

/* ------------------------------------------------------------- moving */
const keys = new Set();
let stick = null; // { x, y } from the touch stick, −1 … 1
function intent() { // forward and right, −1 … 1
  let f = 0, r = 0;
  if (keys.has("w") || keys.has("arrowup")) f += 1;
  if (keys.has("s") || keys.has("arrowdown")) f -= 1;
  if (keys.has("d") || keys.has("arrowright")) r += 1;
  if (keys.has("a") || keys.has("arrowleft")) r -= 1;
  if (stick) { f -= stick.y; r += stick.x; }
  const m = Math.hypot(f, r); return m > 1 ? [f / m, r / m] : [f, r];
}
function walkFrame(dt, F) {
  const [f, r] = intent();
  if (!f && !r) return;
  if (turn || won) return;
  const u = f * Math.sin(yaw) + r * Math.cos(yaw), v = f * Math.cos(yaw) - r * Math.sin(yaw);
  const d4 = [0, 1, 2, 3].map((j) => u * F.Eu[j] + v * F.Ev[j]), m = Math.hypot(u, v) || 1;
  if (Math.abs(d4[3]) > 0.6 * m && Math.hypot(d4[0], d4[1]) < 0.4 * m && !lastToast) toast(L.lane === "anakata" ? "You can't walk in w: it's across in this view, but only the hook goes that way." : "You can't walk in w: gravity takes you kata, and only a ramp takes you ana.");
  const res = L.W.move(d4[0] * SPEED * dt, d4[1] * SPEED * dt);
  if (res) hud();
}
/* the hook goes along whichever of ±x ±y ±w you're looking most nearly down, if you're looking near one */
function aimDir() {
  const F = frameNow(performance.now()), aim = in4(F, camera().F);
  let bestD = null, bc = 0.5;
  for (const d of HOOKS) { const c = dot4(aim, d); if (c > bc) { bc = c; bestD = d; } }
  return bestD;
}
function hookFire() {
  if (!L || !LANES[L.lane].hook || won || turn) return;
  const bestD = aimDir();
  if (!bestD) { toast("Aim the hook along x, y or w: look straight along one."); return; }
  const P = L.W.P.slice(), r = L.W.hook(bestD);
  if (!r) return;
  beam = { from: P, d: bestD, k: r.k, what: r.what, t0: performance.now(), miss: !r.moved && r.what !== "crate" };
  if (r.what !== "miss" && r.k === 1) toast("Too close: the hook needs room to fly.");
  hud();
}
function undo() { if (L && !won && L.W.undo()) { beam = null; hud(); } }
function reset() { if (L) start(L.world, L.src, L.par); }

/* ------------------------------------------------------------- the overlay: crosshair, hook line, the w strip, axes */
function project(p4, F, cam) {
  const C = L.W.P, v = p4.map((x, j) => x - C[j]), q = [dot4(F.Eu, v), dot4(F.Ev, v), dot4(F.Ez, v)];
  const rel = [q[0] - cam.pos[0], q[1] - cam.pos[1], q[2] - cam.pos[2]], z = rel[0] * cam.F[0] + rel[1] * cam.F[1] + rel[2] * cam.F[2];
  if (z < 0.05) return null;
  const x = rel[0] * cam.R[0] + rel[1] * cam.R[1] + rel[2] * cam.R[2], y = rel[0] * cam.U[0] + rel[1] * cam.U[1] + rel[2] * cam.U[2];
  const H = oc.clientHeight, W = oc.clientWidth, f = H / 2 / cam.tan;
  return { x: W / 2 + (x / z) * f, y: H / 2 - (y / z) * f };
}
const CELL = { 0: null, 1: "#7d7f9c", 2: "#36d9f2", 3: "#d9a33a", 4: "#c8424b", 5: "#6dff94" };
function overlay(now, F, cam) {
  const W = oc.clientWidth, H = oc.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (oc.width !== Math.round(W * dpr)) { oc.width = Math.round(W * dpr); oc.height = Math.round(H * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);
  // the crosshair
  octx.strokeStyle = "rgba(255,255,255,0.7)"; octx.lineWidth = 1.5;
  octx.beginPath(); octx.moveTo(W / 2 - 7, H / 2); octx.lineTo(W / 2 + 7, H / 2); octx.moveTo(W / 2, H / 2 - 7); octx.lineTo(W / 2, H / 2 + 7); octx.stroke();
  // the hook's line, out from below your eyes
  if (beam) {
    const t = (now - beam.t0) / 1000, life = beam.miss ? 0.3 : 0.45;
    if (t > life) beam = null;
    else {
      const out = beam.miss ? Math.sin(Math.min(1, t / life) * Math.PI) : Math.min(1, t / 0.12), end = beam.from.map((v, j) => v + beam.d[j] * beam.k * out);
      const a = { x: W / 2, y: H - 40 }, c = project(end, F, cam);
      if (c) { octx.strokeStyle = "#36d9f2"; octx.lineWidth = 3; octx.shadowColor = "#36d9f2"; octx.shadowBlur = 10; octx.beginPath(); octx.moveTo(a.x, a.y); octx.lineTo(c.x, c.y); octx.stroke(); octx.shadowBlur = 0; }
    }
  }
  // the w strip: the column of slices you're in, and the one ahead of you, ana at the top
  const wd = L.world, c = wd.coords(L.W.s.p), Wn = wd.W, look = in4(F, cam.F);
  const ax = Math.abs(look[0]) >= Math.abs(look[1]) ? 0 : 1, sg = Math.sign(look[ax]) || 1;
  const sz = Math.min(22, Math.floor((H * 0.32) / Wn)), x0 = 14, y0 = H - 210 - sz * Wn;
  octx.font = "600 10px ui-monospace, Menlo, monospace"; octx.textAlign = "left"; octx.textBaseline = "middle";
  octx.fillStyle = "rgba(255,255,255,0.55)"; octx.fillText("w", x0, y0 - 10); octx.fillText(wd.gravW ? "↑ ana" : "ana", x0 + 12, y0 - 10);
  for (let k = 0; k < 2; k++) {
    const cx = c.slice(); cx[ax] += k * sg;
    for (let w = 0; w < Wn; w++) {
      const yy = y0 + (Wn - 1 - w) * sz, xx = x0 + k * (sz + 3);
      const inside = cx[0] >= 0 && cx[1] >= 0 && cx[0] < wd.X && cx[1] < wd.Y;
      const i = inside ? cx[0] + wd.X * (cx[1] + wd.Y * (cx[2] + wd.Z * w)) : -1, under = inside && cx[2] > 0 ? i - wd.X * wd.Y : -1;
      octx.fillStyle = "rgba(20,14,30,0.75)"; octx.fillRect(xx, yy, sz, sz);
      if (i >= 0) {
        const v = wd.cells[i], fill = v >= 6 ? "#e08a4a" : CELL[v];
        if (fill) { octx.fillStyle = fill; octx.fillRect(xx + 1, yy + 1, sz - 2, sz - 2); }
        if (L.W.s.crates.includes(i)) { octx.fillStyle = "#b8743e"; octx.fillRect(xx + 3, yy + 3, sz - 6, sz - 6); }
        const fl = under >= 0 ? wd.cells[under] : 0; // the floor under it: a line, warm if it's a ramp, missing over a drop
        if (fl) { octx.fillStyle = fl >= 6 ? "#ff9a55" : "#cfc6e8"; octx.fillRect(xx, yy + sz - 2, sz, 2); }
      }
      if (k === 0 && w === c[3]) { octx.strokeStyle = "#ffd36b"; octx.lineWidth = 2; octx.beginPath(); octx.arc(xx + sz / 2, yy + sz / 2, sz * 0.3, 0, 7); octx.stroke(); }
    }
  }
  octx.fillStyle = "rgba(255,255,255,0.55)"; octx.fillText("here · ahead", x0, y0 + Wn * sz + 10);
  // the axes, as you see them
  const gx = W - 52, gy = 112, len = 24;
  octx.textAlign = "center";
  for (const [name, e, colr] of [["x", [1, 0, 0, 0], "#ff6b6b"], ["y", [0, 1, 0, 0], "#6be38a"], ["z", [0, 0, 1, 0], "#efeafc"], ["w", [0, 0, 0, 1], "#c27bff"]]) {
    const v = [dot4(F.Eu, e), dot4(F.Ev, e), dot4(F.Ez, e)];
    const sx = v[0] * cam.R[0] + v[1] * cam.R[1] + v[2] * cam.R[2], sy = -(v[0] * cam.U[0] + v[1] * cam.U[1] + v[2] * cam.U[2]), m = Math.hypot(v[0], v[1], v[2]);
    octx.strokeStyle = colr; octx.fillStyle = colr; octx.globalAlpha = 0.35 + 0.65 * m; octx.lineWidth = 2.5;
    if (m > 0.15) { octx.beginPath(); octx.moveTo(gx, gy); octx.lineTo(gx + sx * len, gy + sy * len); octx.stroke(); octx.fillText(name, gx + sx * (len + 10), gy + sy * (len + 10)); }
    else { octx.beginPath(); octx.arc(gx, gy, 6, 0, 7); octx.stroke(); octx.fillText(name, gx + 14, gy + 12); }
  }
  octx.globalAlpha = 1;
}

/* ------------------------------------------------------------- the loop */
/* how many pixels to trace: as sharp as the device can keep up with. Starts high, and steps down (or back
   up) when the frames run slow (or fast), in steps, at most twice a second, so the canvas isn't
   reallocated every frame */
let res = 0, ema = 1 / 60, resT = 0;
function resolution(dt) {
  const dpr = Math.min(2, devicePixelRatio || 1), cap = Math.min(dpr, Math.sqrt(2.6e6 / Math.max(1, glc.clientWidth * glc.clientHeight)));
  const fixed = +new URLSearchParams(location.search).get("res"); // ?res=1.5: fixed, for screenshots and slow machines
  if (fixed > 0) return Math.min(3, fixed);
  if (!res) res = Math.min(cap, coarse ? dpr * 0.8 : cap);
  ema += (dt - ema) * 0.08; resT += dt;
  if (resT > 0.5) {
    resT = 0;
    if (ema > 1 / 38 && res > 0.5) res = Math.max(0.5, res * 0.88);
    else if (ema < 1 / 56 && res < cap) res = Math.min(cap, res * 1.08);
  }
  return Math.round(res * 20) / 20;
}
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (!L) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const F = frameNow(now);
  walkFrame(dt, F);
  if (L.W.update(dt) === "fell") { toast(L.world.wrap ? "Nothing there to catch you, all the way round. Undone." : "You fell out of the world. Undone."); hud(); }
  if (!won && L.W.won()) win();
  const cam = camera(), P = L.W.P, Wn = L.world.W;
  const crates = L.W.crates.map((c) => (L.world.wrap ? [c.at[0], c.at[1], c.at[2], c.at[3] + Wn * Math.round((P[3] - c.at[3]) / Wn)] : c.at));
  const scale = resolution(dt);
  Rd.draw({ C: P, Eu: F.Eu, Ev: F.Ev, Ez: F.Ez, N: F.N, cam, player: P, crates, open: L.world.doorsOpen(L.W.s), time: now / 1000, pw: P[3], sky: LANES[L.lane].sky, hideYou: true, ghostNear: 0.45, style: 1 }, scale);
  overlay(now, F, cam);
}
requestAnimationFrame(frame);

function win() {
  won = true; keys.clear(); stick = null; touches.clear(); stickRest();
  if (document.pointerLockElement) document.exitPointerLock();
  const key = bestKey(), prev = best[key], m = L.W.moves, atPar = L.par != null && m <= L.par;
  if (!prev || m < prev) { best[key] = m; const ks = Object.keys(best); if (ks.length > 300) delete best[ks.find((k) => k.startsWith("room:"))]; saveBest(); }
  $("won-head").textContent = atPar ? "solved at par" : "solved";
  $("won-moves").textContent = m + (m === 1 ? " move" : " moves");
  $("won-text").innerHTML = `par is <b>${L.par}</b>: the fewest moves there are, found by searching every state of the room. A move is a cell crossed, a crate pushed, a hook fired.` + (prev ? ` Your best: <b>${Math.min(prev, m)}</b>.` : "");
  const t = L.src.kind, n = LANES[L.lane].levels.length;
  $("next").textContent = t === "tutorial" ? (L.src.i + 1 < n ? "NEXT" : "A NEW ROOM") : t === "gen" ? "ANOTHER " + L.src.tier.toUpperCase() : "A NEW ROOM";
  setTimeout(() => { $("won").hidden = false; }, 400);
}

/* ------------------------------------------------------------- input */
const overlayOpen = () => !$("start").hidden || !$("won").hidden || !$("levels").hidden;
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
  const k = e.key.toLowerCase();
  if (!$("start").hidden) { if (k === "enter" || k === " ") { e.preventDefault(); $("start-btn").click(); } return; }
  if (!$("won").hidden) { if (k === "enter" || k === " ") { e.preventDefault(); $("next").click(); } return; }
  if (!$("levels").hidden) { if (k === "escape") $("levels").hidden = true; return; }
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { e.preventDefault(); keys.add(k); return; }
  if (k === " ") { e.preventDefault(); hookFire(); return; }
  if (k === "v" || k === "tab") { e.preventDefault(); turnSight(e.shiftKey ? -1 : 1); return; }
  if (k === "z" || k === "backspace") { e.preventDefault(); undo(); return; }
  if (k === "r") { reset(); return; }
  if (k === "l") { showLevels(); return; }
  if (k === "n") { fresh(L ? L.lane : "anakata", L && L.src.kind === "gen" ? L.src.tier : "medium"); return; }
});
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
// the mouse: click to look around (pointer lock), click again to fire the hook
glc.addEventListener("click", () => {
  if (matchMedia("(pointer: coarse)").matches || overlayOpen()) return;
  if (document.pointerLockElement === glc) hookFire(); else glc.requestPointerLock?.();
});
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== glc) return;
  yaw += e.movementX * 0.0025; pitch = Math.max(-1.45, Math.min(1.45, pitch - e.movementY * 0.0025));
});
/* touch: a stick on the left (drawn, so you can find it; it follows your thumb wherever on the left half it
   lands), and the right half looks. Pointer events where there are any, touch events where there aren't */
const STICK_R = 52, touches = new Map(), coarse = matchMedia("(pointer: coarse)").matches;
const stickEl = $("stick"), knobEl = $("knob");
function stickRest() { stickEl.style.left = ""; stickEl.style.top = ""; stickEl.classList.remove("live"); knobEl.style.transform = ""; }
function press(id, x, y) {
  const left = x < innerWidth / 2;
  touches.set(id, { left, x0: x, y0: y, x, y });
  if (left) { stickEl.style.left = x - STICK_R + "px"; stickEl.style.top = y - STICK_R + "px"; stickEl.classList.add("live"); stick = { x: 0, y: 0 }; }
}
function drag(id, x, y) {
  const t = touches.get(id); if (!t) return;
  if (t.left) {
    const dx = x - t.x0, dy = y - t.y0, m = Math.hypot(dx, dy), k = m > STICK_R ? STICK_R / m : 1;
    knobEl.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const dead = 6, s = m < dead ? 0 : Math.min(1, (m - dead) / (STICK_R - dead)) / (m || 1);
    stick = { x: dx * s, y: dy * s };
  } else { yaw += (x - t.x) * 0.006; pitch = Math.max(-1.45, Math.min(1.45, pitch - (y - t.y) * 0.006)); }
  t.x = x; t.y = y;
}
function release(id) { const t = touches.get(id); if (!t) return; if (t.left) { stick = null; stickRest(); } touches.delete(id); }
if (window.PointerEvent) {
  glc.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") return; try { glc.setPointerCapture(e.pointerId); } catch (err) { /* fine without */ } press(e.pointerId, e.clientX, e.clientY); e.preventDefault(); });
  glc.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") { drag(e.pointerId, e.clientX, e.clientY); e.preventDefault(); } });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) glc.addEventListener(ev, (e) => release(e.pointerId));
} else {
  glc.addEventListener("touchstart", (e) => { for (const t of e.changedTouches) press(t.identifier, t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
  glc.addEventListener("touchmove", (e) => { for (const t of e.changedTouches) drag(t.identifier, t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
  for (const ev of ["touchend", "touchcancel"]) glc.addEventListener(ev, (e) => { for (const t of e.changedTouches) release(t.identifier); });
}
if (coarse) document.body.classList.add("touch");
$("hook").onclick = hookFire;
$("view").onclick = () => turnSight(1);
$("undo").onclick = undo;
$("reset").onclick = reset;
$("menu").onclick = showLevels;
$("share").onclick = share; $("won-share").onclick = share;
$("hint-x").onclick = () => { $("hint").hidden = true; };

/* ------------------------------------------------------------- menus */
function showLevels() {
  if (document.pointerLockElement) document.exitPointerLock();
  keys.clear(); stick = null; touches.clear(); stickRest();
  for (const lane of Object.keys(LANES)) {
    const list = $("list-" + lane); list.innerHTML = "";
    LANES[lane].levels.forEach((def, i) => {
      const b = document.createElement("button"), mine = best[lane + ":" + def.name], par = parse(def).solve(LANES[lane].allow).moves.length;
      b.className = (mine ? "done" : "") + (mine && mine <= par ? " par" : "");
      b.innerHTML = `<span>${i + 1} · ${def.name}</span><small>${mine ? "best " + mine + " · " : ""}par ${par}</small>`;
      b.onclick = () => { $("levels").hidden = true; $("start").hidden = true; load(lane, i); };
      list.appendChild(b);
    });
  }
  $("levels").hidden = false;
}
$("levels-close").onclick = () => { $("levels").hidden = true; };
$("start-levels").onclick = showLevels;
$("start-btn").onclick = () => { $("start").hidden = true; };
document.querySelectorAll("[data-room]").forEach((b) => { b.onclick = () => { $("levels").hidden = true; $("start").hidden = true; const [lane, tier] = b.dataset.room.split("."); if (tier === "daily") daily(lane); else fresh(lane, tier); }; });
$("next").onclick = () => {
  $("won").hidden = true;
  const t = L.src.kind, n = LANES[L.lane].levels.length;
  if (t === "tutorial" && L.src.i + 1 < n) load(L.lane, L.src.i + 1);
  else fresh(L.lane, t === "gen" ? L.src.tier : t === "tutorial" ? "easy" : "medium");
};
$("again").onclick = () => { $("won").hidden = true; reset(); };

/* where to begin: the address (a room, a lane's level, today's, a seed), then wherever you were */
function begin(q) {
  const P = new URLSearchParams(q), lane = LANES[P.get("lane")] ? P.get("lane") : "anakata";
  if (P.get("room") && fromCode(P.get("room"))) return true;
  if (P.has("daily")) { const d = P.get("daily"); daily(lane, /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : today()); return true; }
  if (P.get("level")) { const n = LANES[lane].levels.length, i = Math.max(1, Math.min(n, +P.get("level") || 1)) - 1; load(lane, i); return true; }
  if (P.get("gen")) { const [tier, seed] = P.get("gen").split("."); if (["easy", "medium", "hard"].includes(tier)) { room(lane, tier, parseInt(seed, 36) >>> 0); return true; } }
  return false;
}
if (/[?&](room|daily|level|gen)=?/.test(location.search)) $("start").hidden = true;
if (!begin(location.search)) { let lastQ = ""; try { lastQ = localStorage.getItem("hinton.last") || ""; } catch (e) { /* private mode */ } if (!begin(lastQ)) load("anakata", 0); }

/* handles for tests and the console */
window.HINTON = { get level() { return L; }, get won() { return won; }, aimDir, load, turnSight, hookFire, undo, fromCode, share, room, daily, keys, look: (y, p) => { yaw = y; pitch = p; }, get view() { return view; } };
