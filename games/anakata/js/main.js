/* Anakata — the page: input, the view frame and its turns, the camera, the
   animations, and the overlay (the hook's line, the axes). The rules are
   ./world.js, the levels ./levels.js, the drawing ./render.js.

   The view frame is three directions in 4D: Eu and Ev (horizontal) and z.
   There are three frames: walking (x, y), and two that swap a walking axis
   for w: (x, w) and (w, y). Each is a right-handed frame of the x-y-w space
   (z is never touched), so turning from one to another is a 3D rotation of
   that space, slerped as a quaternion: the slice sweeps through 4D and the
   world morphs on the way. */
import { parse, isW, ACTIONS } from "./world.js";
import { LEVELS } from "./levels.js";
import { generate, encode, decode, seedOf } from "./gen.js";
import { Renderer } from "./render.js";

const $ = (id) => document.getElementById(id);
const glc = $("gl"), oc = $("over"), octx = oc.getContext("2d");
let R = null;
try { R = new Renderer(glc); } catch (e) { $("start").innerHTML = `<h1>ANAKATA</h1><p>This needs WebGL2, which this browser doesn't have: ${String(e.message || e)}</p>`; throw e; }

/* ------------------------------------------------------------- frames */
const FRAMES = [ // in x-y-w coordinates
  { Eu: [1, 0, 0], Ev: [0, 1, 0], N: [0, 0, 1] },  // walking: x, y (w hidden)
  { Eu: [1, 0, 0], Ev: [0, 0, 1], N: [0, -1, 0] }, // x, w (y hidden)
  { Eu: [0, 0, 1], Ev: [0, 1, 0], N: [-1, 0, 0] }, // w, y (x hidden)
];
const to4 = (v) => [v[0], v[1], 0, v[2]];
function quatFromMat(m) { // m[r][c], a rotation
  const t = m[0][0] + m[1][1] + m[2][2];
  let q;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4]; }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; q = [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s]; }
  else if (m[1][1] > m[2][2]) { const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; q = [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s]; }
  else { const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s]; }
  return q;
}
function slerpId(q, t) { // from the identity to q
  const w = Math.max(-1, Math.min(1, q[3])), th = Math.acos(w), s = Math.sin(th);
  if (s < 1e-6) return [0, 0, 0, 1];
  const a = Math.sin((1 - t) * th) / s, b = Math.sin(t * th) / s;
  return [b * q[0], b * q[1], b * q[2], a + b * q[3]];
}
function rotV(q, v) { // rotate v by unit quaternion q
  const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
const cols = (F) => [F.Eu, F.Ev, F.N];
function between(A, B) { // the rotation taking frame A to frame B: R = B·Aᵀ
  const a = cols(A), b = cols(B), m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) m[r][c] += b[k][r] * a[k][c];
  return quatFromMat(m);
}
let view = 0, turn = null; // turn: { from, to, q, t0 }
const TURN_MS = 700;
function frameNow(now) {
  if (!turn) return FRAMES[view];
  const t = Math.min(1, (now - turn.t0) / TURN_MS), e = t * t * (3 - 2 * t), q = slerpId(turn.q, e), A = FRAMES[turn.from];
  if (t >= 1) { turn = null; return FRAMES[view]; }
  return { Eu: rotV(q, A.Eu), Ev: rotV(q, A.Ev), N: rotV(q, A.N) };
}
function turnSight(dir = 1) {
  if (turn) return;
  const from = view; view = (view + dir + 3) % 3;
  turn = { from, q: between(FRAMES[from], FRAMES[view]), t0: performance.now() };
  seeing(); dirty = true;
}

/* ------------------------------------------------------------- camera */
let yaw = -0.5, yawT = -0.5;
const PITCH = 0.72, TAN = 0.58;
function camera() {
  const aspect = Math.max(0.3, glc.clientWidth / Math.max(1, glc.clientHeight)); // a tall screen sees less across, so stand back
  const D = (L ? 6.2 + 0.45 * Math.max(L.world.X, L.world.Y) : 8) * Math.max(1, 0.9 / aspect);
  const pos = [D * Math.cos(PITCH) * Math.sin(yaw), -D * Math.cos(PITCH) * Math.cos(yaw), D * Math.sin(PITCH) + 0.3];
  const tgt = [0, 0, -0.4];
  let F = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]]; const n = Math.hypot(...F); F = F.map((v) => v / n);
  let Rr = [F[1], -F[0], 0]; const m = Math.hypot(...Rr); Rr = Rr.map((v) => v / m);
  const U = [Rr[1] * F[2] - Rr[2] * F[1], Rr[2] * F[0] - Rr[0] * F[2], Rr[0] * F[1] - Rr[1] * F[0]];
  return { pos, R: Rr, U, F, tan: TAN, dist: D };
}

/* ------------------------------------------------------------- the level */
let L = null; // { i, def, world, s, hist, moves, par }
let anim = null, dirty = true, hookArmed = false, won = false;
const best = (() => { try { return JSON.parse(localStorage.getItem("anakata.best") || "{}"); } catch (e) { return {}; } })();
const saveBest = () => { try { localStorage.setItem("anakata.best", JSON.stringify(best)); } catch (e) { /* private mode */ } };
const center = (w, i) => { const c = w.coords(i); return [c[0] + 0.5, c[1] + 0.5, c[2] + 0.5, c[3] + 0.5]; };

/* a room from anywhere: the tutorial, the generator, today's date, or a link */
function start(world, src, par) {
  if (par == null) { const sol = world.solve(); par = sol.moves ? sol.moves.length : null; }
  src.code = src.code || encode(world);
  L = { src, world, s: { p: world.start.p, crates: world.start.crates.slice() }, hist: [], moves: 0, par };
  R.setWorld(world); anim = null; won = false; hookArmed = false; view = 0; turn = null;
  $("hook").classList.remove("on"); $("won").hidden = true;
  $("lvlno").textContent = src.kind === "tutorial" ? "level " + (src.i + 1) + " of " + LEVELS.length : src.kind === "daily" ? "today's room · " + src.date : src.kind === "gen" ? src.tier + " room" : "a shared room";
  $("lvlname").textContent = src.kind === "tutorial" ? world.name : src.kind === "gen" ? src.seed.toString(36) : src.kind === "daily" ? "daily" : "shared";
  const hint = world.hint || `A room someone shared. Par ${par}: the fewest moves there are.`;
  $("hint-text").textContent = hint; $("hint").hidden = !hint;
  // the address is the room: copy it and anyone gets this exact room, whatever the generator does later
  const q = src.kind === "tutorial" ? "?level=" + (src.i + 1) : src.kind === "daily" ? "?daily=" + src.date : "?room=" + src.code;
  try { history.replaceState(null, "", location.pathname + q); } catch (e) { /* sandboxed */ }
  try { localStorage.setItem("anakata.last", q); } catch (e) { /* private mode */ }
  hud(); seeing(); dirty = true;
}
function load(i) { start(parse(LEVELS[i]), { kind: "tutorial", i }); }
/* a new room from the generator (a few seeds on, if one comes up empty), built in a worker so the page
   keeps drawing; where module workers aren't to be had, built right here */
let worker = null, asked = 0;
try { worker = new Worker(new URL("./gen-worker.js", import.meta.url), { type: "module" }); } catch (e) { worker = null; }
function room(tier, seed, kind = "gen", date) {
  toast("building a room in four dimensions…");
  const id = ++asked;
  const done = (res) => {
    if (id !== asked) return; // a newer request came in meanwhile
    if (!res || !res.code) { toast("no room came out of that seed; try another"); return; }
    const world = decode(res.code, tier + " " + res.seed.toString(36));
    world.hint = res.hint;
    start(world, { kind, tier, seed: res.seed, date, code: res.code }, res.par);
    $("toast").classList.remove("show");
  };
  if (worker) { worker.onmessage = (e) => done(e.data); worker.onerror = () => { worker = null; room(tier, seed, kind, date); }; worker.postMessage({ tier, seed, id }); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (let k = 0; k < 6; k++) { const r = generate((seed + k) >>> 0, tier); if (r) return done({ code: encode(r.world), par: r.par, seed: (seed + k) >>> 0, hint: r.world.hint }); }
    done(null);
  }));
}
const today = () => new Date().toISOString().slice(0, 10);
const daily = (date = today()) => room("hard", seedOf("anakata " + date), "daily", date);
const fresh = (tier) => room(tier, (Math.random() * 2 ** 32) >>> 0);
function fromCode(code) {
  try { start(decode(code), { kind: "code", code }); return true; } catch (e) { setTimeout(() => toast("That link isn't a room (" + e.message + "), so here's another."), 1200); return false; }
}
const bestKey = () => (L.src.kind === "tutorial" ? L.world.name : "room:" + L.src.code);
async function share() {
  if (!L) return;
  const url = location.origin + location.pathname + (L.src.kind === "tutorial" ? "?level=" + (L.src.i + 1) : "?room=" + L.src.code);
  const text = `Anakata — a room in four dimensions. Par ${L.par}.`;
  try { if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: "Anakata", text, url }); return; } } catch (e) { /* cancelled */ }
  try { await navigator.clipboard.writeText(url); toast("Link copied: it opens this exact room."); } catch (e) { prompt("The link to this room:", url); }
}
function hud() { $("moves").textContent = L.moves; $("par").textContent = L.par == null ? "—" : L.par; }
function seeing() {
  const F = FRAMES[view], name = (v) => (v[0] ? "x" : v[1] ? "y" : "w"), colour = { x: "var(--x)", y: "var(--y)", w: "var(--w)" };
  const a = name(F.Eu), b = name(F.Ev), h = name(F.N);
  $("seeing").innerHTML = `<i style="color:${colour[a]}">${a}</i> · <i style="color:${colour[b]}">${b}</i> · z <span style="color:var(--dim);font-weight:400">(${h} hidden)</span>`;
}
let toastT = 0;
function toast(msg) { $("toast").textContent = msg; $("toast").classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => $("toast").classList.remove("show"), 2200); }

/* ------------------------------------------------------------- acting */
/* where something is, part way through the current animation */
function track(pts, durs, t) {
  let acc = 0;
  for (let k = 0; k < durs.length; k++) {
    if (t <= acc + durs[k]) { const f = durs[k] ? (t - acc) / durs[k] : 1, a = pts[k], b = pts[k + 1]; return a.map((v, j) => v + (b[j] - v) * f); }
    acc += durs[k];
  }
  return pts[pts.length - 1];
}
function path(A, B, pull) { // across first then down, or up first then across
  if (L && L.world.wrap && Math.abs(B[3] - A[3]) > L.world.W / 2) B = [B[0], B[1], B[2], B[3] + (B[3] < A[3] ? L.world.W : -L.world.W)]; // across the seam, the short way
  const pts = B[2] < A[2] - 0.01 ? [A, [B[0], B[1], A[2], B[3]], B] : B[2] > A[2] + 0.01 ? [A, [A[0], A[1], B[2], A[3]], B] : [A, B];
  const durs = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], dz = Math.abs(b[2] - a[2]), dh = Math.hypot(b[0] - a[0], b[1] - a[1], b[3] - a[3]);
    durs.push(dz > 0.01 ? dz * 85 + 30 : dh * (pull ? 75 : 150));
  }
  return { pts, durs, total: durs.reduce((x, y) => x + y, 0) };
}
function playerAt(now) { return anim ? track(anim.player.pts, anim.player.durs, Math.max(0, now - anim.t0 - anim.delay)) : center(L.world, L.s.p); }
function cratesAt(now) {
  const t = Math.max(0, now - (anim ? anim.t0 + anim.delay : 0));
  const at = anim ? anim.crates.map((c) => track(c.pts, c.durs, t)) : L.s.crates.map((c) => center(L.world, c));
  if (!L.world.wrap) return at;
  const P = playerAt(now), W = L.world.W; // where w goes round, draw each crate in its copy nearest you
  return at.map((c) => [c[0], c[1], c[2], c[3] + W * Math.round((P[3] - c[3]) / W)]);
}

function act(d, hooking) {
  if (!L || won || turn || (anim && performance.now() < anim.t0 + anim.delay + anim.len)) return;
  if (anim) anim = null;
  const a = { kind: hooking ? "hook" : "walk", d };
  if (!hooking && isW(a)) { toast("You can't step in w. Hook along it: SPACE (or HOOK), then the arrow."); return; }
  const w = L.world, s = L.s, n = w.act(s, a), now = performance.now();
  const P0 = center(w, s.p);
  if (hooking) { hookArmed = false; $("hook").classList.remove("on"); }
  if (!n) {
    if (hooking) { // the line goes out and comes back empty
      const r = w.reach(s, d), end = P0.map((v, j) => v + d[j] * (r.k - (r.what === "miss" && r.cell >= 0 ? 0.5 : 0)));
      anim = { t0: now, delay: 0, len: 260, player: { pts: [P0], durs: [] }, crates: s.crates.map((c) => ({ pts: [center(w, c)], durs: [] })), beam: { end, miss: true, len: 260 } };
      if (r.what !== "miss" && r.k === 1) toast("Too close: the hook needs room to fly.");
      dirty = true;
    } else toast(blockedWhy(d));
    return;
  }
  L.hist.push(s); L.s = n; L.moves++;
  // tracks: you, and each crate matched to where it went (nearest first)
  const pTrack = path(P0, center(w, n.p), hooking);
  const olds = s.crates.map((c) => center(w, c)), news = n.crates.map((c) => center(w, c)), used = new Set(), crates = [];
  const pairs = [];
  olds.forEach((o, i) => news.forEach((q, j) => pairs.push([Math.hypot(o[0] - q[0], o[1] - q[1], o[2] - q[2], o[3] - q[3]), i, j])));
  pairs.sort((x, y) => x[0] - y[0]);
  const matched = new Map();
  for (const [, i, j] of pairs) if (!matched.has(i) && !used.has(j)) { matched.set(i, j); used.add(j); }
  olds.forEach((o, i) => { if (matched.has(i)) crates.push(path(o, news[matched.get(i)], hooking)); else crates.push(path(o, [o[0], o[1], -4, o[3]], false)); });
  let beam = null, delay = 0;
  if (hooking) {
    const r = w.reach(s, d), end = P0.map((v, j) => v + d[j] * r.k); // straight out k cells, even round w
    delay = r.k * 45; beam = { end, crate: r.what === "crate" ? s.crates.indexOf(r.cell) : -1 };
  }
  const dead = n.dead ? path(P0, [P0[0], P0[1], -5, P0[3]], false) : null;
  anim = { t0: now, delay, player: dead || pTrack, crates, beam, len: Math.max(dead ? dead.total : pTrack.total, ...crates.map((c) => c.total), 0) };
  hud(); dirty = true;
  if (n.dead) { setTimeout(() => { undo(); toast("You fell out of the world. Undone."); }, delay + anim.len + 250); }
}
function blockedWhy(d) {
  const t = L.world.step(L.s.p, d);
  if (t === -1) return "That's the edge of the world.";
  return "Something's in the way, too high to climb.";
}
function undo() { if (!L || !L.hist.length || won) return; L.s = L.hist.pop(); L.moves = Math.max(0, L.moves - 1); anim = null; hud(); dirty = true; }
function reset() { if (L) start(L.world, L.src, L.par); }

/* the 4D direction an arrow means: whichever of ±Eu, ±Ev looks most like it on screen */
function dirFor(sx, sy) {
  const F = FRAMES[view], P = playerAt(performance.now()), cam = camera(), C = P;
  const base = project(P, C, F, cam);
  let bestD = null, bestC = -2;
  for (const [axis, sign] of [[F.Eu, 1], [F.Eu, -1], [F.Ev, 1], [F.Ev, -1]]) {
    const d4 = to4(axis).map((v) => Math.round(v * sign)), q = project(P.map((v, j) => v + d4[j]), C, F, cam);
    if (!q || !base) continue;
    const vx = q.x - base.x, vy = q.y - base.y, m = Math.hypot(vx, vy) || 1, c = (vx * sx + vy * sy) / (m * Math.hypot(sx, sy));
    if (c > bestC) { bestC = c; bestD = d4; }
  }
  return bestD;
}
function go(sx, sy, hooking) { const d = dirFor(sx, sy); if (d) act(d, hooking || hookArmed); }

/* ------------------------------------------------------------- the overlay */
function project(p4, C, F, cam) {
  const v = p4.map((x, j) => x - C[j]), E = [to4(F.Eu), to4(F.Ev)];
  const q = [E[0].reduce((s, e, j) => s + e * v[j], 0), E[1].reduce((s, e, j) => s + e * v[j], 0), v[2]];
  const rel = [q[0] - cam.pos[0], q[1] - cam.pos[1], q[2] - cam.pos[2]];
  const z = rel[0] * cam.F[0] + rel[1] * cam.F[1] + rel[2] * cam.F[2];
  if (z < 0.1) return null;
  const x = rel[0] * cam.R[0] + rel[1] * cam.R[1] + rel[2] * cam.R[2], y = rel[0] * cam.U[0] + rel[1] * cam.U[1] + rel[2] * cam.U[2];
  const H = oc.clientHeight, W = oc.clientWidth, f = H / 2 / cam.tan;
  return { x: W / 2 + (x / z) * f, y: H / 2 - (y / z) * f };
}
function overlay(now, F, cam, P) {
  const W = oc.clientWidth, H = oc.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (oc.width !== Math.round(W * dpr)) { oc.width = Math.round(W * dpr); oc.height = Math.round(H * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);
  // the hook's line
  if (anim && anim.beam) {
    const t = now - anim.t0, b = anim.beam;
    let tip = b.end;
    if (b.miss) { const f = Math.sin(Math.min(1, t / b.len) * Math.PI); tip = P.map((v, j) => v + (b.end[j] - v) * f); }
    else if (t < anim.delay) tip = P.map((v, j) => v + (b.end[j] - v) * (t / anim.delay));
    else if (b.crate >= 0) tip = cratesAt(now)[b.crate];
    const a = project(P, P, F, cam), c = project(tip, P, F, cam);
    if (a && c && (b.miss || t < anim.delay + anim.len)) {
      octx.strokeStyle = "#36d9f2"; octx.lineWidth = 2.5; octx.shadowColor = "#36d9f2"; octx.shadowBlur = 10;
      octx.beginPath(); octx.moveTo(a.x, a.y); octx.lineTo(c.x, c.y); octx.stroke(); octx.shadowBlur = 0;
      octx.fillStyle = "#bff6ff"; octx.beginPath(); octx.arc(c.x, c.y, 4, 0, 7); octx.fill();
    }
  }
  // the axes, as the camera sees them
  const tall = H > W * 1.2, ox = W - (tall ? 52 : 62), oy = tall ? H - 300 : 130, len = tall ? 24 : 30;
  octx.font = "700 12px ui-monospace, Menlo, monospace"; octx.textAlign = "center"; octx.textBaseline = "middle";
  for (const [name, e, colr] of [["x", [1, 0, 0, 0], "#ff6b6b"], ["y", [0, 1, 0, 0], "#6be38a"], ["z", [0, 0, 1, 0], "#efeafc"], ["w", [0, 0, 0, 1], "#c27bff"]]) {
    const E = [to4(F.Eu), to4(F.Ev)], v = [E[0].reduce((s, x, j) => s + x * e[j], 0), E[1].reduce((s, x, j) => s + x * e[j], 0), e[2]];
    const sx = v[0] * cam.R[0] + v[1] * cam.R[1] + v[2] * cam.R[2], sy = -(v[0] * cam.U[0] + v[1] * cam.U[1] + v[2] * cam.U[2]), m = Math.hypot(v[0], v[1], v[2]);
    octx.strokeStyle = colr; octx.fillStyle = colr; octx.globalAlpha = 0.35 + 0.65 * m; octx.lineWidth = 2.5;
    if (m > 0.15) { octx.beginPath(); octx.moveTo(ox, oy); octx.lineTo(ox + sx * len, oy + sy * len); octx.stroke(); octx.fillText(name, ox + sx * (len + 11), oy + sy * (len + 11)); }
    else { octx.beginPath(); octx.arc(ox, oy, 6, 0, 7); octx.stroke(); octx.fillText(name, ox + 14, oy + 12); }
  }
  octx.globalAlpha = 1;
  if (hookArmed) { const a = project(P, P, F, cam); if (a) { octx.strokeStyle = "rgba(54,217,242,0.8)"; octx.lineWidth = 2; octx.setLineDash([4, 4]); octx.beginPath(); octx.arc(a.x, a.y - 4, 26 + 3 * Math.sin(now / 150), 0, 7); octx.stroke(); octx.setLineDash([]); } }
}

/* ------------------------------------------------------------- the loop */
let frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!L) return;
  yaw += (yawT - yaw) * 0.18;
  const moving = !!turn || !!anim || Math.abs(yawT - yaw) > 1e-3;
  if (!moving && !dirty && frames++ % 4) return; // idle: a quarter of the frames, for the anchors' pulse
  dirty = false;
  const F = frameNow(now), cam = camera(), P = playerAt(now);
  if (anim && now > anim.t0 + anim.delay + anim.len + (anim.beam && anim.beam.miss ? 0 : 0)) {
    anim = null;
    if (L.world.won(L.s) && !won) win();
  }
  const scale = matchMedia("(pointer: coarse)").matches ? 0.62 : Math.min(1, 1500 / Math.max(1, glc.clientWidth));
  R.draw({ C: P, Eu: to4(F.Eu), Ev: to4(F.Ev), N: to4(F.N), cam, player: P, crates: cratesAt(now), open: L.world.doorsOpen(L.s), time: now / 1000, pw: P[3] }, scale * Math.min(2, devicePixelRatio || 1));
  overlay(now, F, cam, P);
}
requestAnimationFrame(frame);

function win() {
  won = true;
  const key = bestKey(), prev = best[key], atPar = L.par != null && L.moves <= L.par;
  if (!prev || L.moves < prev) { best[key] = L.moves; const ks = Object.keys(best); if (ks.length > 300) delete best[ks.find((k) => k.startsWith("room:"))]; saveBest(); }
  $("won-head").textContent = atPar ? "solved at par" : "solved";
  $("won-moves").textContent = L.moves + (L.moves === 1 ? " move" : " moves");
  $("won-text").innerHTML = `par is <b>${L.par}</b>: the fewest moves there are, found by searching every state of the room.` + (prev ? ` Your best: <b>${Math.min(prev, L.moves)}</b>.` : "");
  const t = L.src.kind;
  $("next").textContent = t === "tutorial" ? (L.src.i + 1 < LEVELS.length ? "NEXT" : "A NEW ROOM") : t === "gen" ? "ANOTHER " + L.src.tier.toUpperCase() : "A NEW ROOM";
  setTimeout(() => { $("won").hidden = false; }, 350);
}

/* ------------------------------------------------------------- input */
const KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] };
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
  if (!$("start").hidden) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("start-btn").click(); } return; }
  if (!$("won").hidden) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("next").click(); } return; }
  if (!$("levels").hidden) { if (e.key === "Escape") $("levels").hidden = true; return; }
  if (KEYS[e.key]) { e.preventDefault(); go(KEYS[e.key][0], KEYS[e.key][1], e.shiftKey); return; }
  if (e.key === " ") { e.preventDefault(); armHook(); return; }
  if (e.key === "v" || e.key === "V" || e.key === "Tab") { e.preventDefault(); turnSight(e.shiftKey ? -1 : 1); return; }
  if (e.key === "q" || e.key === "Q") { yawT += Math.PI / 2; dirty = true; return; }
  if (e.key === "e" || e.key === "E") { yawT -= Math.PI / 2; dirty = true; return; }
  if (e.key === "z" || e.key === "Z" || e.key === "Backspace") { e.preventDefault(); undo(); return; }
  if (e.key === "r" || e.key === "R") { reset(); return; }
  if (e.key === "l" || e.key === "L") { showLevels(); return; }
  if (e.key === "n" || e.key === "N") { fresh(L && L.src.kind === "gen" ? L.src.tier : "medium"); return; }
  if (e.key === "Escape" && hookArmed) armHook();
});
function armHook() { hookArmed = !hookArmed; $("hook").classList.toggle("on", hookArmed); dirty = true; }
const DPAD = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
document.querySelectorAll("#pad .key").forEach((b) => b.addEventListener("click", () => { const v = DPAD[b.dataset.k]; go(v[0], v[1], false); }));
$("hook").onclick = armHook;
$("view").onclick = () => turnSight(1);
$("rotl").onclick = () => { yawT += Math.PI / 2; dirty = true; };
$("rotr").onclick = () => { yawT -= Math.PI / 2; dirty = true; };
$("undo").onclick = undo;
$("reset").onclick = reset;
$("menu").onclick = showLevels;
$("hint-x").onclick = () => { $("hint").hidden = true; };
// a swipe on the world walks (or hooks, if the hook is armed)
let press = null;
glc.addEventListener("pointerdown", (e) => { press = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
glc.addEventListener("pointerup", (e) => {
  if (!press || press.id !== e.pointerId) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y; press = null;
  if (Math.hypot(dx, dy) > 24) go(dx, dy, false);
});
addEventListener("resize", () => { dirty = true; });

/* ------------------------------------------------------------- menus */
function showLevels() {
  const list = $("level-list"); list.innerHTML = "";
  LEVELS.forEach((def, i) => {
    const b = document.createElement("button"), mine = best[def.name], par = parse(def).solve().moves.length;
    b.className = (mine ? "done" : "") + (mine && mine <= par ? " par" : "");
    b.innerHTML = `<span>${i + 1} · ${def.name}</span><small>${mine ? "best " + mine + " · " : ""}par ${par}${def.needsW ? " · w" : ""}</small>`;
    b.onclick = () => { $("levels").hidden = true; $("start").hidden = true; load(i); };
    list.appendChild(b);
  });
  $("levels").hidden = false;
}
$("levels-close").onclick = () => { $("levels").hidden = true; };
$("start-levels").onclick = showLevels;
$("start-btn").onclick = () => { $("start").hidden = true; };
$("next").onclick = () => {
  $("won").hidden = true;
  const t = L.src.kind;
  if (t === "tutorial" && L.src.i + 1 < LEVELS.length) load(L.src.i + 1);
  else fresh(t === "gen" ? L.src.tier : t === "tutorial" ? "easy" : "medium");
};
$("share").onclick = share; $("won-share").onclick = share;
document.querySelectorAll("[data-tier]").forEach((b) => { b.onclick = () => { $("levels").hidden = true; $("start").hidden = true; fresh(b.dataset.tier); }; });
$("daily").onclick = () => { $("levels").hidden = true; $("start").hidden = true; daily(); };
$("again").onclick = () => { $("won").hidden = true; reset(); };

/* where to begin: the address first (a shared room, today's, a tutorial level), then wherever you were */
function begin(q) {
  const P = new URLSearchParams(q);
  if (P.get("room") && fromCode(P.get("room"))) return true;
  if (P.has("daily")) { const d = P.get("daily"); daily(/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : today()); return true; }
  if (P.get("room") === null && P.get("level")) { const i = Math.max(1, Math.min(LEVELS.length, +P.get("level") || 1)) - 1; load(i); return true; }
  if (P.get("gen")) { const [tier, seed] = P.get("gen").split("."); if (TIER_NAMES.includes(tier)) { room(tier, parseInt(seed, 36) >>> 0); return true; } }
  return false;
}
const TIER_NAMES = ["easy", "medium", "hard"];
const linked = /[?&](room|daily|level|gen)=?/.test(location.search);
if (linked) $("start").hidden = true; // a link drops you straight into its room
if (!begin(location.search)) { let last = ""; try { last = localStorage.getItem("anakata.last") || ""; } catch (e) { /* private mode */ } if (!begin(last)) load(0); }

/* handles for tests and the console */
window.ANAKATA = { get level() { return L; }, act, turnSight, load, undo, ACTIONS, get view() { return view; }, room, daily, fromCode, share };
