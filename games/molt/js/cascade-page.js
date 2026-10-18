/* Cascade — the page: the game (ouro.js, with the world exactly as long as
   you), the stack of layers it draws (cascade.js), and the camera that falls
   into it forever.

   THE ZOOM. The camera looks at the point the heads fall towards (each
   layer's head lies on the layer before, a third the size, so they close in
   on one point). Over one cycle it moves from riding layer 1 on layer 0 to
   riding layer 2 on layer 1: a third of the distance, turning from the one
   snake's way ahead to the other's, which on screen is the same "up". At the
   end of the cycle it steps back to the start. The picture there is the same
   picture, a layer out, because every layer is the same snake on the same
   skin: as above, so below. The layer that has swollen past the screen fades
   out as the cycle ends, and the next one in fades in as it begins, so the
   step back doesn't show. */
import { Ouro, autopilot } from "./ouro.js";
import { skinOf, buildStack, motionOf, frameTurn, rotate, K_ } from "./cascade.js";

const $ = (id) => document.getElementById(id);
const cv = $("view"), ctx = cv.getContext("2d");
const C_ = { TICK: 190, D0: 2.3, TILT: 0.32, LEAD: 0.22, TAU: 150, TAUP: 25, START: 6 };
const RATES = [["normal", 6], ["fast", 3.5], ["slow", 11], ["hold", 0]];
let ri = 0;
try { const r = +localStorage.getItem("cascade.rate"); if (r >= 0 && r < RATES.length) ri = r; } catch (e) { /* private mode */ }

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ortho = (v, n) => norm(sub(v, mul(n, dot(v, n))));
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const LIGHT = norm([0.3, -0.4, 0.86]);

let g, skin, motion, capHead, stack, acc = 0, last = 0, running = false, auto = false, phi = 0, depth = 0, noteT = 0, seed = 1;
let cam = null;                                   // the smoothed things the camera is made from
const turns = [];
let arnd = 9;
const rnd = () => (arnd = (arnd * 16807) % 2147483647) / 2147483647;
let W = 0, H = 0, dpr = 1, focal = 1;
function resize() { const r = cv.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); focal = Math.min(W, H) * 1.0; }

function newRun() {
  seed = (Date.now() % 2147483646) + 1; arnd = seed % 1000 + 9;
  g = new Ouro(seed, { shrink: "body", fall: "slide", bite: "die", anchor: "path" });
  for (let i = 0; i < C_.START - 1; i++) g.tick();     // crawl out to full length first: the world is only ever as long as you
  rebuild(); cam = null; phi = 0; depth = 0; turns.length = 0; acc = 0;
  hud();
}
/* once a step: the skin by name, the head's cap, and how this step moves; then the stack, every frame, part way through it */
function rebuild() {
  const W = g.world, CC = W.C * W.C, per = 5 * CC;
  skin = skinOf(W, g.names); motion = motionOf(g);
  capHead = new Uint8Array(W.N);
  for (let c = 0; c < W.N; c++) { const key = g.names.key[c]; if (Math.floor(key / per) === W.L - 1 && Math.floor((key % per) / CC) === 4) capHead[c] = 1; }
  frame(1);
}
function frame(f) { stack = buildStack(g.world, g.body, K_.DEPTH, skin, motion ? { ...motion, f } : null); }
function note(t) { const el = $("note"); el.textContent = t; el.classList.add("show"); clearTimeout(noteT); noteT = setTimeout(() => el.classList.remove("show"), 1800); }
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* no haptics */ } }
function hud() {
  $("depth").textContent = depth; $("len").textContent = g.body.length; $("eaten").textContent = g.eaten; $("cuts").textContent = g.cuts;
  $("rate").textContent = RATES[ri][1] ? "a layer every " + RATES[ri][1] + " s" : "held";
}
function over() {
  running = false; $("play").textContent = "▶";
  $("o-head").textContent = "bitten, " + depth + " layers down";
  $("o-len").textContent = g.maxLength;
  $("o-text").textContent = `Longest ${g.maxLength}; ${g.eaten} eaten, ${g.cuts} cut${g.cuts === 1 ? "" : "s"}, ${g.ticks} steps. Every one of you, all the way down, bit itself at the same moment.`;
  $("over").hidden = false;
}

function step() {
  if (auto) autopilot(g, rnd);
  else if (turns.length) g.steer((g.inSide + (turns.shift() === "L" ? 3 : 1)) % 4);
  g.tick(); rebuild();
  for (const e of g.events) {
    if (e.kind === "eat") buzz(8);
    if (e.kind === "cut") { buzz([20, 20, 20]); note(e.why === "slide" ? "the world shrank under you: you slid to its end" : "cut: your tail falls off as food"); }
    if (e.kind === "dead") { buzz([40, 30, 40]); over(); }
  }
  hud();
}

/* what the camera wants this frame: the point it falls into, and the two frames it turns between */
function aims() {
  const L = stack.layers, n = g.body.length, c = g.body[0];
  const nrm = (layer) => norm([layer.nrm[c * 3], layer.nrm[c * 3 + 1], layer.nrm[c * 3 + 2]]);
  const heading = (layer) => layer.spine.at(n - 1, 1).T;
  const n0 = nrm(L[0]), n1 = nrm(L[1]);
  return { P: stack.heads[stack.heads.length - 1], n0, h0: ortho(heading(L[1]), n0), n1, h1: ortho(heading(L[2]), n1) };
}
function follow(dt) {
  const a = aims();
  if (!cam) { cam = a; return; }
  const k = 1 - Math.exp(-dt / C_.TAU);
  // everything slithers continuously, so the point can be followed closely (and as closely on screen at every depth)
  cam.P = lerp(cam.P, a.P, 1 - Math.exp(-dt / (C_.TAUP * Math.pow(stack.s, phi))));
  for (const [nk, hk] of [["n0", "h0"], ["n1", "h1"]]) { cam[nk] = norm(lerp(cam[nk], a[nk], k)); cam[hk] = ortho(lerp(cam[hk], a[hk], k), cam[nk]); }
}
function camera() {
  const { P, n0, h0, n1, h1 } = cam, tr = frameTurn(h0, n0, h1, n1);
  const n = rotate(n0, tr.axis, tr.ang * phi), h = ortho(rotate(h0, tr.axis, tr.ang * phi), n);
  const D = C_.D0 * Math.pow(stack.s, phi);
  const eye = add(add(P, mul(n, D)), mul(h, -D * C_.TILT)), target = add(P, mul(h, D * C_.LEAD));
  const fwd = norm(sub(target, eye)), up = ortho(h, fwd), right = cross(fwd, up);
  // anything well in front of where we're looking is cut away (another coil of a world can pass between the camera and you)
  return { eye, fwd, up, right, near: D * 0.45 };
}

function draw(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#05060a"; ctx.fillRect(0, 0, W, H);
  if (!cam) return;
  const K = camera(), cx = W / 2, cy = H / 2, list = [];
  const P = (x, y, z) => { const v = [x - K.eye[0], y - K.eye[1], z - K.eye[2]], d = dot(v, K.fwd); return d < K.near ? null : [cx + focal * dot(v, K.right) / d, cy - focal * dot(v, K.up) / d, d]; };
  const Wd = g.world, C = Wd.C, L = Wd.L;
  const alphaOf = (j) => (j === 0 ? 1 - smooth(0.55, 1, phi) : j === 3 ? smooth(0, 0.45, phi) : 1);
  for (const layer of stack.layers) {
    const a = alphaOf(layer.j); if (a <= 0.01) continue;
    const x = layer.j - phi, hue = 220 + 120 * x;                                  // each layer its own colour, sliding as it falls past
    for (let c = 0; c < Wd.N; c++) {
      if (!layer.live[c]) continue;
      const m = [layer.mid[c * 3], layer.mid[c * 3 + 1], layer.mid[c * 3 + 2]], nn = [layer.nrm[c * 3], layer.nrm[c * 3 + 1], layer.nrm[c * 3 + 2]];
      const toEye = sub(K.eye, m); if (dot(nn, toEye) <= 0) continue;
      const q = [0, 1, 2, 3].map((i) => P(layer.pts[c * 12 + i * 3], layer.pts[c * 12 + i * 3 + 1], layer.pts[c * 12 + i * 3 + 2]));
      if (q.some((p) => !p)) continue;
      const minx = Math.min(q[0][0], q[1][0], q[2][0], q[3][0]), maxx = Math.max(q[0][0], q[1][0], q[2][0], q[3][0]);
      const miny = Math.min(q[0][1], q[1][1], q[2][1], q[3][1]), maxy = Math.max(q[0][1], q[1][1], q[2][1], q[3][1]);
      if (maxx < 0 || minx > W || maxy < 0 || miny > H || (maxx - minx) * (maxy - miny) < 0.4) continue;
      const lit = 0.35 + 0.65 * Math.max(0, dot(nn, LIGHT)) * 0.6 + 0.4 * Math.max(0, dot(nn, norm(toEye))) * 0.65;
      const k = skin.cube[c], i = c % C, j = ((c / C) | 0) % C;
      list.push([dot(sub(m, K.eye), K.fwd), q, a, capHead[c] ? `hsl(42 90% ${Math.round(32 + 30 * lit)}%)` : `hsl(${(hue + 18 * (k / L) + 3600) % 360} ${34 + 8 * ((i + j) & 1)}% ${Math.round(10 + 34 * lit + 3 * ((i + j) & 1))}%)`, g.food.has(c) ? [m, nn, layer.r] : null]);
    }
  }
  list.sort((u, v) => v[0] - u[0]);
  ctx.lineJoin = "round";
  const pulse = 0.9 + 0.1 * Math.sin(now / 160);
  for (const [, q, a, fill, food] of list) {
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let m = 1; m < 4; m++) ctx.lineTo(q[m][0], q[m][1]); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = "rgba(5,6,10,0.45)"; ctx.lineWidth = 0.7; ctx.stroke();
    if (food) {
      const [m, nn, r] = food, p = P(m[0] + nn[0] * r * 0.06, m[1] + nn[1] * r * 0.06, m[2] + nn[2] * r * 0.06);
      if (p) { ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(1, Math.hypot(q[2][0] - q[0][0], q[2][1] - q[0][1]) * 0.24 * pulse), 0, 7); ctx.fillStyle = "#ff7eb6"; ctx.fill(); }
    }
  }
  ctx.globalAlpha = 1;
}

function loop(now) {
  const dt = Math.min(100, now - (last || now)); last = now;
  if (running && g.alive) {
    acc += dt; while (acc >= C_.TICK && g.alive) { acc -= C_.TICK; step(); }
    if (g.alive && motion) frame(Math.min(1, acc / C_.TICK));
    const T = RATES[ri][1];
    if (T) { phi += dt / 1000 / T; if (phi >= 1) { phi -= 1; depth++; hud(); } }
  }
  follow(dt);
  draw(now);
  requestAnimationFrame(loop);
}

/* ---- input: left and right turn you (and every you) */
function turn(d) { if (!g.alive || !running) return; if (auto) setAuto(false); if (turns.length < 2) turns.push(d); const b = $(d === "L" ? "tl" : "tr"); b.classList.add("hit"); setTimeout(() => b.classList.remove("hit"), 120); }
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || (e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)))) return;
  if (e.key === "ArrowLeft" || e.key === "a") { e.preventDefault(); turn("L"); }
  else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); turn("R"); }
  else if (e.key === " ") { e.preventDefault(); $("play").click(); }
  else if (e.key === "z" || e.key === "Z") $("zoombtn").click();
  else if (e.key === "A") $("autobtn").click();
});
let down = null;
cv.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, used: false }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener("pointermove", (e) => {
  if (!down || down.used) return;
  const dx = e.clientX - down.x;
  if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(e.clientY - down.y)) { turn(dx < 0 ? "L" : "R"); down.used = true; }
});
cv.addEventListener("pointerup", (e) => { if (down && !down.used) { const r = cv.getBoundingClientRect(); turn(e.clientX - r.left < r.width / 2 ? "L" : "R"); } down = null; });
cv.addEventListener("pointercancel", () => { down = null; });
for (const [id, d] of [["tl", "L"], ["tr", "R"]]) $(id).addEventListener("pointerdown", (e) => { e.preventDefault(); turn(d); });
function setAuto(v) { auto = v; $("autobtn").classList.toggle("on", auto); }
$("autobtn").onclick = () => setAuto(!auto);
function rateState() { $("zoombtn").textContent = RATES[ri][0]; hud(); }
$("zoombtn").onclick = () => { ri = (ri + 1) % RATES.length; rateState(); try { localStorage.setItem("cascade.rate", String(ri)); } catch (e) { /* private mode */ } };
$("play").onclick = () => { if (!g.alive) return; running = !running; $("play").textContent = running ? "❚❚" : "▶"; };
$("help").onclick = () => { running = false; $("play").textContent = "▶"; $("start").hidden = false; };
const startRun = () => { $("start").hidden = true; if (!g.alive) newRun(); running = true; $("play").textContent = "❚❚"; last = 0; };
$("go").onclick = () => { setAuto(false); startRun(); };
$("watch").onclick = () => { setAuto(true); startRun(); };
$("again").onclick = () => { $("over").hidden = true; newRun(); running = true; $("play").textContent = "❚❚"; last = 0; };
document.addEventListener("visibilitychange", () => { if (document.hidden && running) $("play").click(); });
window.addEventListener("resize", resize);

resize();
newRun(); rateState();
requestAnimationFrame(loop);
window.CASCADE = { get g() { return g; }, get stack() { return stack; }, get phi() { return phi; }, set phi(v) { phi = v; }, step,
  aim(live) { if (!cam) return null; const K = camera(), v = sub(live ? stack.heads[stack.heads.length - 1] : cam.P, K.eye), d = dot(v, K.fwd); return [W / 2 + focal * dot(v, K.right) / d, H / 2 - focal * dot(v, K.up) / d, W, H]; } };
