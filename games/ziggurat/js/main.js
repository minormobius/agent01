/* Ziggurat — the page: draws the pile as a row of pyramids, takes taps, swipes
   and keys, and runs the game's clock. The game itself is ./zig.js.

   A cell (a, b, c) sliced along axis s sits on pyramid k = p[s], at
   (u, v) = (p[s+1], p[s+2]): row u + v, across v − u. Every pyramid is drawn
   the classic way, a cube per cell, each row half a cube across and three
   quarters of one down. Turning the tesseract re-slices along the next axis;
   every cube glides from its old pyramid to its new one. */
import { Game, Z, DIRS, dirOf, inBoard, add, keyOf, autopilot } from "./zig.js";

const $ = (id) => document.getElementById(id);
const cv = $("view"), ctx = cv.getContext("2d");
const AXES = ["a", "b", "c"], TURN = 560;
const COLOURS = { 1: ["#2a4cb0", "#ffc93a"], 2: ["#2a4cb0", "#3cc6b0", "#ffc93a"] };
const SIDE_L = "#c9893f", SIDE_R = "#8a5524";
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

let g = null, running = false, paused = false, posted = false;
let axis = 2, prevAxis = 2, turnAt = -1e9, clock = 0; // clock: page ms, for the view's own animations
let L = null, W = 0, H = 0, DPR = 1;
const pops = [];
const AUTO = { on: false, wait: 0 };
const best = () => { try { return +localStorage.getItem("ziggurat.best") || 0; } catch (e) { return 0; } };

/* ---------------------------------------------------------------- layout
   The pyramids, largest first, in as many rows as makes the cubes biggest. */
function layout(N) {
  const sides = Array.from({ length: N }, (_, k) => N - k), GAP = 0.7, LABEL = 0.55;
  const wOf = (s) => s, hOf = (s) => (s - 1) * 0.75 + 1 + LABEL;
  let bestL = null;
  for (let R = 1; R <= N; R++) {
    const total = sides.reduce((a, s) => a + wOf(s), 0) + GAP * (N - R), target = total / R, rows = [[]];
    let acc = 0;
    for (const s of sides) { if (acc > 0 && acc + wOf(s) / 2 > target && rows.length < R) { rows.push([]); acc = 0; } rows[rows.length - 1].push(s); acc += wOf(s) + GAP; }
    const rw = rows.map((r) => r.reduce((a, s) => a + wOf(s), 0) + GAP * (r.length - 1));
    const rh = rows.map((r) => hOf(r[0]));
    const unitsW = Math.max(...rw) + 0.6, unitsH = rh.reduce((a, h) => a + h, 0) + 0.5 * (rows.length - 1) + 0.6;
    const w = Math.min(W / unitsW, H / unitsH, 110);
    if (!bestL || w > bestL.w + 0.5) bestL = { w, rows, rw, rh, unitsH };
  }
  const { w, rows, rw, rh, unitsH } = bestL, ox = [], oy = [];
  let y = (H - unitsH * w) / 2 + 0.3 * w + w / 4, k = 0;
  rows.forEach((r, i) => {
    let x = (W - rw[i] * w) / 2;
    for (const s of r) { ox[k] = x + (s * w) / 2; oy[k] = y; x += (s + GAP) * w; k++; }
    y += (rh[i] + 0.5) * w;
  });
  return { N, w, ox, oy };
}

/* where a cell's top face is on screen, sliced along s (cells just off the pile included) */
function S(p, s) {
  const k = p[s], u = p[(s + 1) % 3], v = p[(s + 2) % 3];
  if (k < 0 || k >= L.N) {
    const k0 = k < 0 ? 0 : L.N - 1, k1 = k < 0 ? Math.min(1, L.N - 1) : Math.max(0, L.N - 2), n = Math.abs(k - k0);
    const q0 = p.slice(), q1 = p.slice(); q0[s] = k0; q1[s] = k1;
    const a = S(q0, s), b = k0 === k1 ? { x: a.x - L.w * 1.5, y: a.y } : S(q1, s);
    return { x: a.x + (a.x - b.x) * n, y: a.y + (a.y - b.y) * n };
  }
  return { x: L.ox[k] + ((v - u) * L.w) / 2, y: L.oy[k] + (u + v) * 0.75 * L.w };
}
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const turning = () => ease((clock - turnAt) / TURN);
/* the same, part way through a turn of the view */
function SB(p) {
  const e = turning(), b = S(p, axis);
  if (e >= 1) return b;
  const a = S(p, prevAxis);
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
}

/* where a hopper is drawn: on a top face, in the air between two, falling, or riding a disc */
function placeOf(x, isHero) {
  const w = L.w;
  if (x.fall) { const t = (g.now - x.fall.t0) / 1000, s = SB(x.fall.p); return { x: s.x, y: s.y + t * t * H * 0.9, alpha: Math.max(0, 1 - t * 1.1), behind: true }; }
  if (!x.mv) { const s = SB(x.p); return { x: s.x, y: s.y }; }
  const mv = x.mv, t = Math.min(1, (g.now - mv.t0) / mv.dur), b = SB(mv.to);
  if (mv.drop) return { x: b.x, y: b.y - (1 - t) * (1 - t) * (b.y + w * 2), alpha: Math.min(1, t * 3) };
  const a = SB(mv.from);
  const across = mv.from[axis] !== mv.to[axis]; // a hop to the pyramid beside: a longer flight
  const lift = mv.ride ? Math.sin(Math.PI * t) * w * 2.2 : Math.sin(Math.PI * t) * w * (across ? 0.9 : 0.42);
  const tt = mv.ride ? ease(t) : t;
  return { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt - lift, ride: !!mv.ride };
}

/* ---------------------------------------------------------------- drawing */
function cube(x, y, w, top, glow) {
  const h = w / 2, q = w / 4;
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x, y + q); ctx.lineTo(x, y + q + h); ctx.lineTo(x - w / 2, y + h); ctx.closePath(); ctx.fillStyle = SIDE_L; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x, y + q); ctx.lineTo(x, y + q + h); ctx.lineTo(x + w / 2, y + h); ctx.closePath(); ctx.fillStyle = SIDE_R; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x, y - q); ctx.lineTo(x + w / 2, y); ctx.lineTo(x, y + q); ctx.lineTo(x - w / 2, y); ctx.closePath(); ctx.fillStyle = top; ctx.fill();
  ctx.strokeStyle = "rgba(20, 10, 30, 0.35)"; ctx.lineWidth = 1; ctx.stroke();
  if (glow) { ctx.strokeStyle = glow; ctx.lineWidth = Math.max(1.5, w * 0.045); ctx.stroke(); }
}
function topPath(x, y, w) { const q = w / 4; ctx.beginPath(); ctx.moveTo(x, y - q); ctx.lineTo(x + w / 2, y); ctx.lineTo(x, y + q); ctx.lineTo(x - w / 2, y); ctx.closePath(); }

function disc(x, y, w, t) {
  const r = w * 0.32, hue = (t / 6) % 360;
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.42);
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(0, 0, r, (i * Math.PI) / 3 + t / 300, ((i + 1) * Math.PI) / 3 + t / 300); ctx.lineTo(0, 0); ctx.fillStyle = `hsl(${(hue + i * 60) % 360} 90% 60%)`; ctx.fill(); }
  ctx.restore();
}

function hero(x, y, w, d, alpha) {
  const r = w * 0.24, f = faceVec(d);
  ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.translate(x, y - r * 0.9);
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.8, r * 0.28, 0, 0, 7); ctx.fill();
  // a stepped crown: the ziggurat on its head
  ctx.fillStyle = "#ffe07a";
  for (let i = 0; i < 3; i++) ctx.fillRect(-r * (0.55 - i * 0.17), -r * (1.05 + i * 0.22), r * (1.1 - i * 0.34), r * 0.24);
  const gr = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  gr.addColorStop(0, "#fff0b0"); gr.addColorStop(1, "#f29a1d");
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(f.x * r * 0.32, f.y * r * 0.22 - r * 0.1, r * 0.36, 0, 7); ctx.fill();
  ctx.fillStyle = "#1b1030"; ctx.beginPath(); ctx.arc(f.x * r * 0.46, f.y * r * 0.3 - r * 0.1, r * 0.17, 0, 7); ctx.fill();
  ctx.restore();
}
function enemy(e, x, y, w, alpha, frozen) {
  const r = w * (e.kind === "coil" ? 0.2 : 0.17);
  ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.translate(x, y - r);
  const ball = (c1, c2, rr, oy) => { const gr = ctx.createRadialGradient(-rr * 0.35, oy - rr * 0.35, rr * 0.1, 0, oy, rr); gr.addColorStop(0, c1); gr.addColorStop(1, c2); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, oy, rr, 0, 7); ctx.fill(); };
  if (e.kind === "red") ball("#ffb0a8", "#d0262c", r, 0);
  else if (e.kind === "green") ball("#d4ffb8", "#2aa845", r, 0);
  else if (e.kind === "egg") ball("#e4c2ff", "#7a2fc0", r, 0);
  else if (e.kind === "slick") { ball("#d8fffb", "#19a3a8", r * 0.85, 0); ctx.fillStyle = "#0b0716"; ctx.fillRect(-r * 0.6, -r * 0.25, r * 1.2, r * 0.3); }
  else { // the coil: a spring of purple rings, eyes on top
    for (let i = 0; i < 4; i++) ball("#e4c2ff", "#6b22b0", r * (1 - i * 0.12), -i * r * 0.62);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 2.05, r * 0.24, 0, 7); ctx.arc(r * 0.3, -r * 2.05, r * 0.24, 0, 7); ctx.fill();
    ctx.fillStyle = "#e0102a"; ctx.beginPath(); ctx.arc(-r * 0.28, -r * 2.0, r * 0.11, 0, 7); ctx.arc(r * 0.32, -r * 2.0, r * 0.11, 0, 7); ctx.fill();
  }
  if (frozen) { ctx.strokeStyle = "rgba(160, 230, 255, 0.9)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, e.kind === "coil" ? -r : 0, r * (e.kind === "coil" ? 2 : 1.35), 0, 7); ctx.stroke(); }
  ctx.restore();
}
/* which way a hop points on screen, for the hero's eye */
function faceVec(d) {
  const p = [3, 3, 3], a = SB(p), b = SB(add(p, DIRS[d])), dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy) || 1;
  return { x: dx / n, y: dy / n };
}

let stars = null;
function sky() {
  if (!stars) { stars = []; for (let i = 0; i < 90; i++) stars.push([Math.random(), Math.random() * 0.8, Math.random() * 1.2 + 0.3, Math.random() * 6]); }
  ctx.fillStyle = "#fff";
  for (const [x, y, r, ph] of stars) { ctx.globalAlpha = 0.25 + 0.25 * Math.sin(clock / 900 + ph); ctx.fillRect(x * W, y * H, r, r); }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  sky();
  if (!g) return;
  if (!L || L.N !== g.N) L = layout(g.N);
  const w = L.w, cols = COLOURS[g.rule.stages], e = turning();
  // labels: which slice each pyramid is
  ctx.font = `600 ${Math.max(10, w * 0.2) | 0}px ui-monospace, Menlo, monospace`; ctx.textAlign = "center"; ctx.fillStyle = "#9a8fae";
  ctx.globalAlpha = e < 1 ? Math.abs(e * 2 - 1) : 0.85;
  const la = e < 0.5 ? prevAxis : axis;
  for (let k = 0; k < L.N; k++) ctx.fillText(AXES[la] + " = " + k, L.ox[k], L.oy[k] + (L.N - k - 1) * 0.75 * w + w * 1.08);
  ctx.globalAlpha = 1;
  // the cubes, back to front
  const list = g.all.map((p) => ({ p, s: SB(p) })).sort((A, B) => A.s.y - B.s.y || A.s.x - B.s.x);
  const Hh = g.hero, idle = g.state === "play" && !Hh.mv && !Hh.fall && running && !paused;
  const near = new Map();
  if (idle) for (let d = 0; d < 6; d++) { const q = add(Hh.p, DIRS[d]); if (inBoard(g.N, q)) near.set(keyOf(q), d); }
  const flash = g.state === "clear" ? Math.floor(g.now / 140) % 2 : 0;
  for (const { p, s } of list) {
    const st = g.top.get(keyOf(p));
    const top = flash ? (st === g.rule.stages ? "#fff4c8" : cols[st]) : cols[st];
    const glow = near.has(keyOf(p)) ? `rgba(255, 255, 255, ${0.35 + 0.25 * Math.sin(clock / 160)})` : null;
    cube(s.x, s.y, w, top, glow);
  }
  // key hints on the cubes next to you, on a keyboard
  if (idle && fine && w > 34) {
    const names = keyNames();
    ctx.font = `700 ${Math.max(9, w * 0.17) | 0}px ui-monospace, Menlo, monospace`; ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.textBaseline = "middle";
    for (const [k, d] of near) { const q = add(Hh.p, DIRS[d]), s = SB(q); ctx.fillText(names[d] || "", s.x, s.y + 1); }
    ctx.textBaseline = "alphabetic";
  }
  for (const dsc of g.discs) if (!dsc.used) { const s = SB(dsc.p); disc(s.x, s.y + w * 0.05, w, clock); }
  // the hoppers, back to front
  const things = g.enemies.map((x) => ({ x, at: placeOf(x) }));
  const hp = g.state === "over" ? null : placeOf(Hh, true);
  if (hp) things.push({ x: Hh, at: hp, hero: true });
  things.sort((A, B) => A.at.y - B.at.y);
  for (const t of things) {
    if (t.hero) {
      const dying = g.state === "dying" && g.cause === "hit";
      if (t.at.ride) disc(t.at.x, t.at.y + w * 0.05, w, clock);
      hero(t.at.x, t.at.y, w, Hh.face, dying ? (Math.floor(g.now / 120) % 2 ? 0.3 : 1) : t.at.alpha);
      if (dying) { ctx.strokeStyle = "rgba(255, 93, 98, 0.8)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(t.at.x, t.at.y - w * 0.22, w * 0.5 + ((g.now / 6) % (w * 0.4)), 0, 7); ctx.stroke(); }
    } else enemy(t.x, t.at.x, t.at.y, w, t.at.alpha, g.frozen);
  }
  // score pops
  ctx.textAlign = "center"; ctx.font = `800 ${Math.max(12, w * 0.26) | 0}px ui-monospace, Menlo, monospace`;
  for (let i = pops.length - 1; i >= 0; i--) {
    const P = pops[i], t = (clock - P.t0) / 1100;
    if (t >= 1) { pops.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - t; ctx.fillStyle = P.c; ctx.fillText(P.text, P.x, P.y - t * w * 0.9);
  }
  ctx.globalAlpha = 1;
  if (g.state === "clear") {
    ctx.font = `800 ${Math.max(18, w * 0.5) | 0}px ui-monospace, Menlo, monospace`; ctx.fillStyle = "#ffc93a";
    ctx.fillText("ROUND CLEAR", W / 2, Math.max(28, H * 0.12));
  }
}

/* ---------------------------------------------------------------- input */
/* the keys for the six hops, in the current slicing: arrows go round the pyramid, Z and X across */
function keyNames() {
  const s = axis, U = (s + 1) % 3, V = (s + 2) % 3, n = [];
  n[dirOf(V, -1)] = "←"; n[dirOf(U, -1)] = "↑"; n[dirOf(V, 1)] = "→"; n[dirOf(U, 1)] = "↓"; n[dirOf(s, -1)] = "Z"; n[dirOf(s, 1)] = "X";
  return n;
}
function keyDir(key) {
  const n = keyNames(), k = { ArrowLeft: "←", ArrowUp: "↑", ArrowRight: "→", ArrowDown: "↓", z: "Z", Z: "Z", x: "X", X: "X" }[key];
  return k ? n.indexOf(k) : -1;
}
function hop(d) { if (!running || paused || !g || d < 0) return; g.move(d); }
function turn() {
  prevAxis = axis; axis = (axis + 1) % 3; turnAt = clock;
  $("turn").textContent = "slice " + AXES[axis];
}

document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
  if (!$("start").hidden) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); begin(); } return; }
  if (!$("over").hidden) { if (e.key === "Enter") { e.preventDefault(); begin(); } return; }
  if (e.key === "p" || e.key === "P" || e.key === "Escape") { e.preventDefault(); setPaused(!paused); return; }
  if (paused) return;
  if (e.key === "t" || e.key === "T") { e.preventDefault(); turn(); return; }
  const d = keyDir(e.key);
  if (d >= 0) { e.preventDefault(); hop(d); }
});

/* a tap picks the neighbour nearest the finger; a swipe, the one most in its direction */
let press = null;
cv.addEventListener("pointerdown", (e) => { press = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
cv.addEventListener("pointerup", (e) => {
  if (!press || press.id !== e.pointerId || !g || !running || paused) { press = null; return; }
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const dx = e.clientX - press.x, dy = e.clientY - press.y; press = null;
  const from = SB(g.hero.mv && !g.hero.mv.ride ? g.hero.mv.to : g.hero.p), base = g.hero.mv && !g.hero.mv.ride ? g.hero.mv.to : g.hero.p;
  let bestD = -1, bestS = Infinity;
  if (Math.hypot(dx, dy) > 22) {
    const n = Math.hypot(dx, dy);
    for (let d = 0; d < 6; d++) { const s = SB(add(base, DIRS[d])), vx = s.x - from.x, vy = s.y - from.y, m = Math.hypot(vx, vy) || 1, c = (vx * dx + vy * dy) / (m * n); if (-c < bestS) { bestS = -c; bestD = d; } }
  } else {
    for (let d = 0; d < 6; d++) { const s = SB(add(base, DIRS[d])), q = Math.hypot(s.x - x, s.y + L.w * 0.1 - y); if (q < bestS) { bestS = q; bestD = d; } }
    if (bestS > L.w * 1.1) bestD = -1;
  }
  hop(bestD);
});
cv.addEventListener("pointercancel", () => { press = null; });

/* ---------------------------------------------------------------- sound */
let ac = null, muted = false;
function blip(f0, f1, dur, type, vol) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), gn = ac.createGain(), t = ac.currentTime;
    o.type = type || "square"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    gn.gain.setValueAtTime(vol || 0.05, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(ac.destination); o.start(t); o.stop(t + dur);
  } catch (e) { /* no sound */ }
}

/* ---------------------------------------------------------------- the run */
function events() {
  for (const ev of g.events) {
    const at = ev.p && L ? SB(ev.p) : { x: W / 2, y: H / 3 };
    if (ev.type === "jump") blip(330, 520, 0.07, "square", 0.025);
    else if (ev.type === "colour") blip(520 + 90 * ev.s, 780 + 90 * ev.s, 0.06, "triangle", 0.04);
    else if (ev.type === "uncolour") blip(400, 200, 0.12, "sawtooth", 0.03);
    else if (ev.type === "disc") blip(300, 1200, 1.2, "sine", 0.05);
    else if (ev.type === "lure") { blip(900, 80, 1.0, "sawtooth", 0.05); pops.push({ text: "+500", x: at.x, y: at.y, c: "#e4c2ff", t0: clock }); }
    else if (ev.type === "catch") { blip(700, 1400, 0.25, "triangle", 0.05); pops.push({ text: ev.kind === "green" ? "FREEZE" : "+300", x: at.x, y: at.y, c: ev.kind === "green" ? "#b8ffcf" : "#a8fff8", t0: clock }); }
    else if (ev.type === "hatch") blip(200, 120, 0.3, "sawtooth", 0.04);
    else if (ev.type === "die") blip(ev.cause === "fall" ? 900 : 180, ev.cause === "fall" ? 60 : 70, ev.cause === "fall" ? 1.0 : 0.6, "sawtooth", 0.06);
    else if (ev.type === "clear") { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, f, 0.16, "square", 0.04), i * 110)); pops.push({ text: "+" + ev.bonus, x: W / 2, y: Math.max(56, H * 0.12 + 34), c: "#ffc93a", t0: clock }); }
    else if (ev.type === "over") { if (demo) { attract(); return; } gameOver(); }
  }
  g.events.length = 0;
}

let hudKey = "";
function hud() {
  if (!g) return;
  const key = [g.score, g.lives, g.level, g.round, g.rule.stages].join();
  if (key === hudKey) return; hudKey = key;
  $("score").textContent = g.score.toLocaleString("en");
  $("lives").textContent = "◆".repeat(Math.max(0, g.lives)) || "—";
  $("lvl").textContent = g.level + "·" + g.round;
  const cols = COLOURS[g.rule.stages];
  $("target").innerHTML = cols.slice(1).map((c, i) => (i ? "<b>›</b>" : "") + `<i style="background:${c}"></i>`).join("") + (g.rule.toggle ? "<b>⇄</b>" : "");
  $("target").title = g.rule.toggle ? "hopping on a finished cube undoes it" : "";
}

let demo = false; // the autopilot plays behind the title screen
function begin() {
  if (demo) { demo = false; AUTO.on = false; muted = false; }
  g = new Game((Math.random() * 2 ** 32) >>> 0); L = null; posted = false;
  $("start").hidden = true; $("over").hidden = true; running = true; setPaused(false); hudKey = "";
  offerable();
}
function attract() {
  demo = true; AUTO.on = true; muted = true;
  g = new Game((Math.random() * 2 ** 32) >>> 0); L = null; running = true; paused = false;
}
function gameOver() {
  running = false;
  const b = best(); if (g.score > b) try { localStorage.setItem("ziggurat.best", String(g.score)); } catch (e) { /* private mode */ }
  $("o-score").textContent = g.score.toLocaleString("en");
  $("o-head").textContent = g.score > b && b > 0 ? "a new best" : "the summit falls quiet";
  $("o-text").innerHTML = `level ${g.level}, round ${g.round} · ${g.stats.cleared} round${g.stats.cleared === 1 ? "" : "s"} cleared · ${g.stats.hops} hops` +
    (g.stats.lures ? ` · ${g.stats.lures} coil${g.stats.lures > 1 ? "s" : ""} lured off` : "") + `<br>best on this device: <b>${Math.max(b, g.score).toLocaleString("en")}</b>`;
  setTimeout(() => { $("over").hidden = false; offerable(); }, 900);
}
function setPaused(v) {
  paused = !!v && running && !demo;
  $("paused").hidden = !paused;
  $("pause").textContent = paused ? "▶" : "❚❚";
}

/* the board loads on its own (it needs the vendored auth client); its buttons show once it's there */
const board = () => window.ZIG_BOARD || null;
function offerable() {
  const b = !!board();
  $("trophy").hidden = $("o-board").hidden = $("board-btn").hidden = !b;
  $("post").hidden = !b || !g || !g.over || !g.score; $("post").disabled = posted;
}
window.addEventListener("ziggurat-board", offerable);
$("post").onclick = () => {
  const b = board(); if (!b || !g || !g.over || posted) return;
  posted = true; offerable();
  b.offer(Object.assign({ sel: {}, at: Date.now() }, g.result()));
};
$("o-board").onclick = $("board-btn").onclick = () => { const b = board(); if (b) b.open(); };
$("trophy").onclick = () => { const b = board(); if (!b) return; if (running) setPaused(true); b.open(); };
$("again").onclick = begin;
$("resume").onclick = () => setPaused(false);
$("pause").onclick = () => setPaused(!paused);
$("turn").onclick = turn;
$("help").onclick = () => { if (demo) return; if (running) setPaused(true); $("paused").hidden = true; $("start").hidden = false; $("start-btn").textContent = running ? "BACK" : "CLIMB"; };
$("start-btn").onclick = () => { if (running && g && !g.over && !demo) { $("start").hidden = true; setPaused(false); } else begin(); };
document.addEventListener("visibilitychange", () => { if (document.hidden && running) setPaused(true); });
attract();

/* ---------------------------------------------------------------- the loop */
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  if (g) L = layout(g.N);
}
addEventListener("resize", resize);
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(50, now - last); last = now; clock += dt;
  if (g && running && !paused) {
    g.update(dt);
    if (AUTO.on && !g.hero.mv) { AUTO.wait -= dt; if (AUTO.wait <= 0) { const d = autopilot(g); if (d != null) { g.move(d); AUTO.wait = 70 + Math.random() * 90; } } }
    events(); hud();
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* handles for the arcade's recorder and the console */
window.ZIG = { get game() { return g; }, auto: AUTO, begin, turn, Z, mute(v) { muted = v !== false; }, at: (p) => (L ? SB(p) : null) };
