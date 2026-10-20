/* Anabasis — the page: input, the view frames and their turns, the camera,
   the animations, the overlay. The rules are Anakata's (../../anakata/js/
   world.js) with w made a second down; the levels are ./levels.js; the
   drawing is Anakata's ray tracer, told which way is up.

   The view frame is four directions in 4D: Eu and Ev (horizontal), Ez (drawn
   up the screen), and N (hidden). Eu is always x. The other three are a
   right-handed frame of the y-z-w space, so turning from one view to the
   next is a 3D rotation of that space, slerped as a quaternion:
     · (x, y) across, z up: w hidden. Walking, the way you'd stand.
     · (x, y) across, w up: z hidden. The other gravity, drawn as gravity;
       the wall kata of you is the floor you stand on.
     · (x, w) across, z up: y hidden. Both downs at once, a corner you lean in. */
import { parse, isW, ACTIONS } from "../../anakata/js/world.js";
import { encode, decode } from "../../anakata/js/gen.js";
import { Renderer } from "../../anakata/js/render.js";
import { LEVELS } from "./levels.js";

const $ = (id) => document.getElementById(id);
const glc = $("gl"), oc = $("over"), octx = oc.getContext("2d");
let R = null;
try { R = new Renderer(glc); } catch (e) { $("start").innerHTML = `<h1>ANABASIS</h1><p>This needs WebGL2, which this browser doesn't have: ${String(e.message || e)}</p>`; throw e; }

/* the only moves here are steps: you climb, you fall, you push. No hook yet */
const WALKING = (a) => a.kind === "walk";
const solveWalk = (world) => world.solve(WALKING);

/* ------------------------------------------------------------- frames */
const FRAMES = [ // Ev, Ez, N in y-z-w coordinates (Eu is x)
  { Ev: [1, 0, 0], Ez: [0, 1, 0], N: [0, 0, 1] },  // x, y across, z up (w hidden)
  { Ev: [1, 0, 0], Ez: [0, 0, 1], N: [0, -1, 0] }, // x, y across, w up (z hidden)
  { Ev: [0, 0, 1], Ez: [0, 1, 0], N: [-1, 0, 0] }, // x, w across, z up (y hidden)
];
const EU = [1, 0, 0, 0];
const to4 = (v) => [0, v[0], v[1], v[2]];
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
const cols = (F) => [F.Ev, F.Ez, F.N];
function between(A, B) { // the rotation taking frame A to frame B: R = B·Aᵀ
  const a = cols(A), b = cols(B), m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) m[r][c] += b[k][r] * a[k][c];
  return quatFromMat(m);
}
let view = 0, turn = null; // turn: { from, q, t0 }
const TURN_MS = 700;
function frameNow(now) {
  let F = FRAMES[view];
  if (turn) {
    const t = Math.min(1, (now - turn.t0) / TURN_MS), e = t * t * (3 - 2 * t), q = slerpId(turn.q, e), A = FRAMES[turn.from];
    if (t >= 1) turn = null; else F = { Ev: rotV(q, A.Ev), Ez: rotV(q, A.Ez), N: rotV(q, A.N) };
  }
  return { Eu: EU, Ev: to4(F.Ev), Ez: to4(F.Ez), N: to4(F.N) };
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
  const w = L && L.world, D = (w ? 6.2 + 0.45 * Math.max(w.X, w.Y, w.W) : 8) * Math.max(1, 0.9 / aspect);
  const pos = [D * Math.cos(PITCH) * Math.sin(yaw), -D * Math.cos(PITCH) * Math.cos(yaw), D * Math.sin(PITCH) + 0.3];
  const tgt = [0, 0, -0.4];
  let F = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]]; const n = Math.hypot(...F); F = F.map((v) => v / n);
  let Rr = [F[1], -F[0], 0]; const m = Math.hypot(...Rr); Rr = Rr.map((v) => v / m);
  const U = [Rr[1] * F[2] - Rr[2] * F[1], Rr[2] * F[0] - Rr[0] * F[2], Rr[0] * F[1] - Rr[1] * F[0]];
  return { pos, R: Rr, U, F, tan: TAN, dist: D };
}

/* ------------------------------------------------------------- the level */
let L = null; // { src, world, s, hist, moves, par }
let anim = null, dirty = true, won = false;
const best = (() => { try { return JSON.parse(localStorage.getItem("anabasis.best") || "{}"); } catch (e) { return {}; } })();
const saveBest = () => { try { localStorage.setItem("anabasis.best", JSON.stringify(best)); } catch (e) { /* private mode */ } };
const center = (w, i) => { const c = w.coords(i); return [c[0] + 0.5, c[1] + 0.5, c[2] + 0.5, c[3] + 0.5]; };

function start(world, src, par) {
  if (par == null) { const sol = solveWalk(world); par = sol.moves ? sol.moves.length : null; }
  src.code = src.code || encode(world);
  L = { src, world, s: { p: world.start.p, crates: world.start.crates.slice() }, hist: [], moves: 0, par };
  R.setWorld(world); anim = null; won = false; view = 0; turn = null;
  $("won").hidden = true;
  $("lvlno").textContent = src.kind === "tutorial" ? "level " + (src.i + 1) + " of " + LEVELS.length : "a shared room";
  $("lvlname").textContent = src.kind === "tutorial" ? world.name : "shared";
  const hint = world.hint || (par == null ? "A room someone shared. No way up has been found in it." : `A room someone shared. Par ${par}: the fewest moves there are.`);
  $("hint-text").textContent = hint; $("hint").hidden = !hint;
  const q = src.kind === "tutorial" ? "?level=" + (src.i + 1) : "?room=" + src.code;
  try { history.replaceState(null, "", location.pathname + q); } catch (e) { /* sandboxed */ }
  try { localStorage.setItem("anabasis.last", q); } catch (e) { /* private mode */ }
  hud(); seeing(); dirty = true;
}
function load(i) { start(parse(LEVELS[i]), { kind: "tutorial", i }); }
function fromCode(code) {
  try {
    const world = decode(code);
    if (!world.gravW) throw new Error("that's an Anakata room: w there is sideways");
    start(world, { kind: "code", code }); return true;
  } catch (e) { setTimeout(() => toast("That link isn't a room here (" + e.message + "), so here's a level."), 1200); return false; }
}
const bestKey = () => (L.src.kind === "tutorial" ? L.world.name : "room:" + L.src.code);
async function share() {
  if (!L) return;
  const url = location.origin + location.pathname + (L.src.kind === "tutorial" ? "?level=" + (L.src.i + 1) : "?room=" + L.src.code);
  const text = `Anabasis — a climb in four dimensions, with two downs. Par ${L.par}.`;
  try { if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: "Anabasis", text, url }); return; } } catch (e) { /* cancelled */ }
  try { await navigator.clipboard.writeText(url); toast("Link copied: it opens this exact room."); } catch (e) { prompt("The link to this room:", url); }
}
function hud() { $("moves").textContent = L.moves; $("par").textContent = L.par == null ? "—" : L.par; }
const axisName = (v) => (Math.abs(v[0]) > 0.5 ? "x" : Math.abs(v[1]) > 0.5 ? "y" : Math.abs(v[2]) > 0.5 ? "z" : "w");
function seeing() {
  const F = FRAMES[view], colour = { x: "var(--x)", y: "var(--y)", z: "var(--z)", w: "var(--w)" }, n = (v) => axisName(to4(v)), i = (a) => `<i style="color:${colour[a]}">${a}</i>`;
  $("seeing").innerHTML = `x · ${i(n(F.Ev))} · ↑${i(n(F.Ez))} <span style="color:var(--dim);font-weight:400">(${n(F.N)} hidden)</span>`;
}
let toastT = 0;
function toast(msg) { $("toast").textContent = msg; $("toast").classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => $("toast").classList.remove("show"), 2400); }

/* ------------------------------------------------------------- acting */
function track(pts, durs, t) {
  let acc = 0;
  for (let k = 0; k < durs.length; k++) {
    if (t <= acc + durs[k]) { const f = durs[k] ? (t - acc) / durs[k] : 1, a = pts[k], b = pts[k + 1]; return a.map((v, j) => v + (b[j] - v) * f); }
    acc += durs[k];
  }
  return pts[pts.length - 1];
}
/* up first (in z and w, whichever rises), then across, then down: a climb goes up and over, a fall goes
   over and down, and a step off a ledge in one gravity and onto a step in the other does both */
function path(A, B) {
  if (L && L.world.wrap && Math.abs(B[3] - A[3]) > L.world.W / 2) B = [B[0], B[1], B[2], B[3] + (B[3] < A[3] ? L.world.W : -L.world.W)]; // across the seam, the short way
  const up = [A[0], A[1], Math.max(A[2], B[2]), Math.max(A[3], B[3])], over = [B[0], B[1], up[2], up[3]];
  const pts = [A];
  for (const p of [up, over, B]) if (p.some((v, j) => Math.abs(v - pts[pts.length - 1][j]) > 0.01)) pts.push(p);
  const durs = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], dv = Math.hypot(b[2] - a[2], b[3] - a[3]), dh = Math.hypot(b[0] - a[0], b[1] - a[1]);
    durs.push(dh > 0.01 ? dh * 150 : dv * 95 + 30);
  }
  return { pts, durs, total: durs.reduce((x, y) => x + y, 0) };
}
function playerAt(now) { return anim ? track(anim.player.pts, anim.player.durs, Math.max(0, now - anim.t0)) : center(L.world, L.s.p); }
function cratesAt(now) {
  const t = Math.max(0, now - (anim ? anim.t0 : 0));
  const at = anim ? anim.crates.map((c) => track(c.pts, c.durs, t)) : L.s.crates.map((c) => center(L.world, c));
  if (!L.world.wrap) return at;
  const P = playerAt(now), W = L.world.W; // where w goes round, draw each crate in its copy nearest you
  return at.map((c) => [c[0], c[1], c[2], c[3] + W * Math.round((P[3] - c[3]) / W)]);
}

function act(d) {
  if (!L || won || turn || (anim && performance.now() < anim.t0 + anim.len)) return;
  anim = null;
  const a = { kind: "walk", d };
  if (isW(a)) { toast("You can't step in w, only climb it: walk into a wall and you go up onto it, ana, if that holds you."); return; }
  const w = L.world, s = L.s, n = w.act(s, a), now = performance.now();
  if (!n) { toast(blockedWhy(d)); return; }
  const P0 = center(w, s.p);
  L.hist.push(s); L.s = n; L.moves++;
  const pTrack = path(P0, center(w, n.p));
  const olds = s.crates.map((c) => center(w, c)), news = n.crates.map((c) => center(w, c)), used = new Set(), crates = [], pairs = [];
  olds.forEach((o, i) => news.forEach((q, j) => pairs.push([Math.hypot(o[0] - q[0], o[1] - q[1], o[2] - q[2], o[3] - q[3]), i, j])));
  pairs.sort((x, y) => x[0] - y[0]);
  const matched = new Map();
  for (const [, i, j] of pairs) if (!matched.has(i) && !used.has(j)) { matched.set(i, j); used.add(j); }
  olds.forEach((o, i) => crates.push(path(o, matched.has(i) ? news[matched.get(i)] : [o[0], o[1], o[2] - 4, o[3] - 4])));
  const dead = n.dead ? path(P0, [P0[0] + d[0], P0[1] + d[1], P0[2] - 4, P0[3] - 4]) : null;
  anim = { t0: now, player: dead || pTrack, crates, len: Math.max(dead ? dead.total : pTrack.total, ...crates.map((c) => c.total), 0) };
  hud(); dirty = true;
  if (n.dead) setTimeout(() => { undo(); toast(w.wrap ? "Nothing there to catch you, all the way round. Undone." : "You fell out of the world. Undone."); }, anim.len + 250);
}
function blockedWhy(d) {
  const t = L.world.step(L.s.p, d);
  if (t === -1) return "That's the edge of the world.";
  return "Too high to climb, in z and in w: nothing to stand on up there.";
}
function undo() { if (!L || !L.hist.length || won) return; L.s = L.hist.pop(); L.moves = Math.max(0, L.moves - 1); anim = null; hud(); dirty = true; }
function reset() { if (L) start(L.world, L.src, L.par); }

/* the 4D direction an arrow means: whichever of ±Eu, ±Ev looks most like it on screen */
function dirFor(sx, sy) {
  const F = frameNow(performance.now()), P = playerAt(performance.now()), cam = camera();
  const base = project(P, P, F, cam);
  let bestD = null, bestC = -2;
  for (const [axis, sign] of [[F.Eu, 1], [F.Eu, -1], [F.Ev, 1], [F.Ev, -1]]) {
    const d4 = axis.map((v) => Math.round(v * sign)), q = project(P.map((v, j) => v + d4[j]), P, F, cam);
    if (!q || !base) continue;
    const vx = q.x - base.x, vy = q.y - base.y, m = Math.hypot(vx, vy) || 1, c = (vx * sx + vy * sy) / (m * Math.hypot(sx, sy));
    if (c > bestC) { bestC = c; bestD = d4; }
  }
  return bestD;
}
function go(sx, sy) { const d = dirFor(sx, sy); if (d) act(d); }

/* ------------------------------------------------------------- the overlay */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
function project(p4, C, F, cam) {
  const v = p4.map((x, j) => x - C[j]), q = [dot(F.Eu, v), dot(F.Ev, v), dot(F.Ez, v)];
  const rel = [q[0] - cam.pos[0], q[1] - cam.pos[1], q[2] - cam.pos[2]];
  const z = rel[0] * cam.F[0] + rel[1] * cam.F[1] + rel[2] * cam.F[2];
  if (z < 0.1) return null;
  const x = rel[0] * cam.R[0] + rel[1] * cam.R[1] + rel[2] * cam.R[2], y = rel[0] * cam.U[0] + rel[1] * cam.U[1] + rel[2] * cam.U[2];
  const H = oc.clientHeight, W = oc.clientWidth, f = H / 2 / cam.tan;
  return { x: W / 2 + (x / z) * f, y: H / 2 - (y / z) * f };
}
function overlay(F, cam) {
  const W = oc.clientWidth, H = oc.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (oc.width !== Math.round(W * dpr)) { oc.width = Math.round(W * dpr); oc.height = Math.round(H * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);
  // the axes, as the camera sees them; both downs drawn with a foot, so you can see which way you'd fall
  const tall = H > W * 1.2, ox = W - (tall ? 52 : 62), oy = tall ? H - 300 : 130, len = tall ? 24 : 30;
  octx.font = "700 12px ui-monospace, Menlo, monospace"; octx.textAlign = "center"; octx.textBaseline = "middle";
  for (const [name, e, colr] of [["x", [1, 0, 0, 0], "#ff6b6b"], ["y", [0, 1, 0, 0], "#6be38a"], ["z", [0, 0, 1, 0], "#fff1dc"], ["w", [0, 0, 0, 1], "#ffb347"]]) {
    const v = [dot(F.Eu, e), dot(F.Ev, e), dot(F.Ez, e)];
    const sx = v[0] * cam.R[0] + v[1] * cam.R[1] + v[2] * cam.R[2], sy = -(v[0] * cam.U[0] + v[1] * cam.U[1] + v[2] * cam.U[2]), m = Math.hypot(v[0], v[1], v[2]);
    octx.strokeStyle = colr; octx.fillStyle = colr; octx.globalAlpha = 0.35 + 0.65 * m; octx.lineWidth = 2.5;
    if (m > 0.15) {
      octx.beginPath(); octx.moveTo(ox, oy); octx.lineTo(ox + sx * len, oy + sy * len); octx.stroke(); octx.fillText(name, ox + sx * (len + 11), oy + sy * (len + 11));
      if (name === "z" || name === "w") { const hx = ox - sx * len * 0.55, hy = oy - sy * len * 0.55; octx.setLineDash([2, 3]); octx.beginPath(); octx.moveTo(ox, oy); octx.lineTo(hx, hy); octx.stroke(); octx.setLineDash([]); octx.beginPath(); octx.arc(hx, hy, 2.5, 0, 7); octx.fill(); }
    } else { octx.beginPath(); octx.arc(ox, oy, 6, 0, 7); octx.stroke(); octx.fillText(name, ox + 14, oy + 12); }
  }
  octx.globalAlpha = 1;
}

/* ------------------------------------------------------------- the loop */
const SKY = [[0.03, 0.012, 0.03], [0.24, 0.1, 0.12], [0.1, 0.05, 0.07]]; // dawn: rose above, the dark below
/* the cutaways. Nothing more than two cells above you is drawn: with w up in a room whose w wraps, the
   room repeats upward for ever, and the camera would be inside the tower. And nothing above you in a
   tunnel from you to the camera, so the steps over your head never hide you */
const CEIL = 2.2, CUT = 1.4;
let frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!L) return;
  yaw += (yawT - yaw) * 0.18;
  const moving = !!turn || !!anim || Math.abs(yawT - yaw) > 1e-3;
  if (!moving && !dirty && frames++ % 4) return; // idle: a quarter of the frames, for the goal's pulse
  dirty = false;
  const F = frameNow(now), cam = camera(), P = playerAt(now);
  if (anim && now > anim.t0 + anim.len) {
    anim = null;
    if (L.world.won(L.s) && !won) win();
  }
  const scale = matchMedia("(pointer: coarse)").matches ? 0.62 : Math.min(1, 1500 / Math.max(1, glc.clientWidth));
  R.draw({ C: P, Eu: F.Eu, Ev: F.Ev, Ez: F.Ez, N: F.N, cam, player: P, crates: cratesAt(now), open: L.world.doorsOpen(L.s), time: now / 1000, pw: P[3], sky: SKY, ceil: CEIL, cut: CUT }, scale * Math.min(2, devicePixelRatio || 1));
  overlay(F, cam);
}
requestAnimationFrame(frame);

function win() {
  won = true;
  const key = bestKey(), prev = best[key], atPar = L.par != null && L.moves <= L.par;
  if (!prev || L.moves < prev) { best[key] = L.moves; const ks = Object.keys(best); if (ks.length > 300) delete best[ks.find((k) => k.startsWith("room:"))]; saveBest(); }
  $("won-head").textContent = atPar ? "summit at par" : "summit";
  $("won-moves").textContent = L.moves + (L.moves === 1 ? " move" : " moves");
  $("won-text").innerHTML = `par is <b>${L.par}</b>: the fewest moves there are, found by searching every state of the room.` + (prev ? ` Your best: <b>${Math.min(prev, L.moves)}</b>.` : "");
  const last = L.src.kind !== "tutorial" || L.src.i + 1 >= LEVELS.length;
  $("next").textContent = last ? "LEVELS" : "NEXT";
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
  if (KEYS[e.key]) { e.preventDefault(); go(KEYS[e.key][0], KEYS[e.key][1]); return; }
  if (e.key === "v" || e.key === "V" || e.key === "Tab" || e.key === " ") { e.preventDefault(); turnSight(e.shiftKey ? -1 : 1); return; }
  if (e.key === "q" || e.key === "Q") { yawT += Math.PI / 2; dirty = true; return; }
  if (e.key === "e" || e.key === "E") { yawT -= Math.PI / 2; dirty = true; return; }
  if (e.key === "z" || e.key === "Z" || e.key === "Backspace") { e.preventDefault(); undo(); return; }
  if (e.key === "r" || e.key === "R") { reset(); return; }
  if (e.key === "l" || e.key === "L") { showLevels(); return; }
});
const DPAD = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
document.querySelectorAll("#pad .key").forEach((b) => b.addEventListener("click", () => { const v = DPAD[b.dataset.k]; go(v[0], v[1]); }));
$("view").onclick = () => turnSight(1);
$("rotl").onclick = () => { yawT += Math.PI / 2; dirty = true; };
$("rotr").onclick = () => { yawT -= Math.PI / 2; dirty = true; };
$("undo").onclick = undo;
$("reset").onclick = reset;
$("menu").onclick = showLevels;
$("hint-x").onclick = () => { $("hint").hidden = true; };
let press = null; // a swipe on the world walks
glc.addEventListener("pointerdown", (e) => { press = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
glc.addEventListener("pointerup", (e) => {
  if (!press || press.id !== e.pointerId) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y; press = null;
  if (Math.hypot(dx, dy) > 24) go(dx, dy);
});
addEventListener("resize", () => { dirty = true; });

/* ------------------------------------------------------------- menus */
function showLevels() {
  const list = $("level-list"); list.innerHTML = "";
  LEVELS.forEach((def, i) => {
    const b = document.createElement("button"), mine = best[def.name], par = solveWalk(parse(def)).moves.length;
    b.className = (mine ? "done" : "") + (mine && mine <= par ? " par" : "");
    b.innerHTML = `<span>${i + 1} · ${def.name}</span><small>${mine ? "best " + mine + " · " : ""}par ${par}${def.wrap ? " · w wraps" : ""}</small>`;
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
  if (L.src.kind === "tutorial" && L.src.i + 1 < LEVELS.length) load(L.src.i + 1); else showLevels();
};
$("share").onclick = share; $("won-share").onclick = share;
$("again").onclick = () => { $("won").hidden = true; reset(); };

/* where to begin: the address first (a shared room, a level), then wherever you were */
function begin(q) {
  const P = new URLSearchParams(q);
  if (P.get("room") && fromCode(P.get("room"))) return true;
  if (P.get("room") === null && P.get("level")) { const i = Math.max(1, Math.min(LEVELS.length, +P.get("level") || 1)) - 1; load(i); return true; }
  return false;
}
const linked = /[?&](room|level)=/.test(location.search);
if (linked) $("start").hidden = true; // a link drops you straight into its room
if (!begin(location.search)) { let last = ""; try { last = localStorage.getItem("anabasis.last") || ""; } catch (e) { /* private mode */ } if (!begin(last)) load(0); }

/* handles for tests and the console */
window.ANABASIS = { get level() { return L; }, act, turnSight, load, undo, ACTIONS, get view() { return view; }, fromCode, share };
