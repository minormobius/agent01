/* Naught — the page. The rules and the engine are js/group.js.

   Three ways to see one board:
     grid    nested 3 × 3 grids: coordinates 1 and 2 across and down inside
             a block, 3 and 4 place the blocks, 5 and 6 the blocks of blocks.
             A line that runs off an edge comes back on the opposite one; on
             the 3 × 3 board faded copies all round make that a straight line
     cards   the same layout, every cell drawn as a card whose attributes are
             its coordinates (colour, shape, fill, count, tint, size): three
             cards are a line when every attribute is all the same or all
             different, so you can see a line without picturing the space
     donut   a real torus, the 2-dimensional slice through the focused cell
             along two coordinates (all of the board when n = 2), through
             Orb's TorusCam: drag to turn it, tap to play
   Hints: in "make", the cells that complete a line for either side; in
   "avoid" and the cap puzzle, the cells each side can no longer take. */
import "../../orb/js/torus.js";
import { Game, board, choose, safeCells, CAP } from "./group.js";

const $ = (id) => document.getElementById(id);
const cv = $("view"), ctx = cv.getContext("2d");
const ORB = globalThis.ORB;
const COL = { x: "#f2b84b", o: "#ff7eb6", bg: "#05060a", dim: "#8b93a8", teal: "#5fd6c4" };
const HUES = ["#ff6b6b", "#5fd6c4", "#a98bff"];          // attribute 1: colour
const TINTS = ["#141a2a", "#14241e", "#2a1c14"];         // attribute 5: the card's ground

let n = 3, game = null, mode = "avoid", opp = "engine", first = "you", skin = "grid", hints = true, axes = [0, 1], focus = 0, hover = -1, busy = false, over = false, noteT = 0;
let W = 0, H = 0, dpr = 1, z = 1, pan = [0, 0], cam = null;
let seed = Date.now() % 2147483647 || 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
try { const s = JSON.parse(localStorage.getItem("naught.prefs") || "{}"); if (s.n >= 2 && s.n <= 6) n = s.n; if (s.opp) opp = s.opp; if (s.first) first = s.first; if (s.skin) skin = s.skin; } catch (e) { /* private mode */ }
const save = () => { try { localStorage.setItem("naught.prefs", JSON.stringify({ n, opp, first, skin })); } catch (e) { /* private mode */ } };

/* ---- the layout: where each cell sits, in cell units */
function layout(n) {
  const GAP = [0, 0.32, 0.9, 1.8], sx = [], sy = [];
  let w = 1, h = 1;
  for (let i = 0; i < n; i++) {
    const level = i >> 1, g = GAP[level];
    if ((i & 1) === 0) { sx[i] = w + g; w = 3 * w + 2 * g; } else { sy[i] = h + g; h = 3 * h + 2 * g; }
  }
  const B = board(n), pos = new Float64Array(B.N * 2);
  for (let c = 0; c < B.N; c++) { let x = 0, y = 0; for (let i = 0; i < n; i++) { const d = B.dig[c * n + i]; if (i & 1) y += d * sy[i]; else x += d * sx[i]; } pos[c * 2] = x; pos[c * 2 + 1] = y; }
  return { pos, w, h };
}
let L = layout(n);

function resize() { const r = cv.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); draw(); }
/* the grid's fit: cell size u (before zoom) and where the board's corner goes */
function fit() {
  const ghosts = n === 2 && skin === "grid" ? 3 : 1, top = 46, bottom = 30;
  const u = Math.min((W - 16) / (L.w * (ghosts === 3 ? 1.7 : 1)), (H - top - bottom) / (L.h * (ghosts === 3 ? 1.7 : 1))) * z;
  return { u, ox: W / 2 - (L.w * u) / 2 + pan[0], oy: top + (H - top - bottom) / 2 - (L.h * u) / 2 + pan[1] };
}

/* ---- a new game */
function newGame(m) {
  if (m) mode = m;
  game = new Game(n, mode === "cap" ? "avoid" : mode);
  L = layout(n); z = 1; pan = [0, 0]; over = false; busy = false; focus = 0; hover = -1;
  axes = [0, Math.min(1, n - 1)];
  cam = new ORB.TorusCam({ W: 3, H: 3, n: 9 }); cam.toward(0.5, 0.5, 1);
  $("over").hidden = true; $("start").hidden = true;
  if (mode !== "cap" && opp === "engine" && first === "them") setTimeout(engineMove, 400);
  hud(); draw(); save();
}
const engineSide = () => (mode !== "cap" && opp === "engine" ? (first === "you" ? 2 : 1) : 0);
const name = (p) => (mode === "cap" ? "you" : opp === "engine" ? (p === engineSide() ? "the engine" : "you") : p === 1 ? "✕" : "○");

function hud() {
  $("dim").textContent = "(ℤ₃)" + "⁰¹²³⁴⁵⁶"[n] + " · " + 3 ** n;
  const p = game.turn, q = 3 - p;
  if (mode === "cap") {
    $("lab1").textContent = "your cap"; $("v1").textContent = game.marks[1].length;
    $("lab2").textContent = "best known"; $("v2").textContent = CAP[n];
  } else if (mode === "avoid") {
    $("lab1").textContent = "to move"; $("v1").textContent = game.winner ? "—" : (p === 1 ? "✕ " : "○ ") + name(p);
    $("lab2").textContent = "safe ✕ · ○"; $("v2").textContent = safeCells(game, 1).length + " · " + safeCells(game, 2).length;
  } else {
    $("lab1").textContent = "to move"; $("v1").textContent = game.winner ? "—" : (p === 1 ? "✕ " : "○ ") + name(p);
    $("lab2").textContent = "threats ✕ · ○"; $("v2").textContent = game.threats(1).size + " · " + game.threats(2).size;
  }
  const c = hover >= 0 ? hover : focus;
  $("cell").textContent = "(" + board(n).coords(c).join(", ") + ")";
  $("skinbtn").textContent = skin; $("hintbtn").classList.toggle("on", hints);
  $("axisbtn").hidden = !(skin === "donut" && n > 2); $("axisbtn").textContent = "axes " + (axes[0] + 1) + "·" + (axes[1] + 1);
  legend();
}
function legend() {
  const l = $("legend");
  if (!hints) { l.innerHTML = ""; return; }
  l.innerHTML = mode === "make"
    ? `<i style="background:${COL.x}"></i>✕ completes a line here<br><i style="background:${COL.o}"></i>○ completes a line here`
    : mode === "avoid"
      ? `<i style="background:rgba(242,184,75,.35)"></i>poison for ✕ (it would make ✕ a line)<br><i style="background:rgba(255,126,182,.35)"></i>poison for ○`
      : `<i style="background:rgba(255,93,98,.45)"></i>you can't take these any more`;
}
function note(t) { const el = $("note"); el.textContent = t; el.classList.add("show"); clearTimeout(noteT); noteT = setTimeout(() => el.classList.remove("show"), 2200); }

/* ---- playing */
function tryPlay(c) {
  if (c < 0 || over || busy || !game.empty(c)) return;
  if (mode === "cap") {
    if (game.threats(1).has(c)) { note("that cell would complete a line with two you have"); return; }
    game.owner[c] = 1; game.marks[1].push(c); game.moves++; focus = c;
    if (!safeCells(game, 1).length) finish();
    hud(); draw(); return;
  }
  if (opp === "engine" && game.turn === engineSide()) return;
  game.play(c); focus = c;
  if (game.winner) return finish();
  hud(); draw();
  if (opp === "engine") { busy = true; setTimeout(engineMove, 380); }
}
function engineMove() {
  busy = false;
  if (over || game.winner) return;
  const c = choose(game, rnd);
  game.play(c); focus = c;
  if (game.winner) return finish();
  hud(); draw();
}
function finish() {
  over = true; hud(); draw();
  setTimeout(() => {
    if (mode === "cap") {
      const k = game.marks[1].length;
      $("o-head").textContent = "a maximal cap"; $("o-big").textContent = k;
      $("o-text").textContent = `${k} cells and no three of them on a line, and every cell left would make one. The biggest cap in ${n} dimensions has ${CAP[n]}.` + (k === CAP[n] ? " You found one." : "");
    } else {
      const w = game.winner, line = game.line, pts = line.map((c) => "(" + board(n).coords(c).join("") + ")").join(" + ");
      $("o-head").textContent = (mode === "avoid" ? name(3 - w) + " made a line" : name(w) + " made a line");
      $("o-big").textContent = name(w) === "you" ? "you win" : name(w) === "the engine" ? "the engine wins" : (w === 1 ? "✕" : "○") + " wins";
      $("o-text").textContent = `${pts} = 0 (mod 3), after ${game.moves} moves.` + (mode === "make" && n >= 3 ? " Making a line is a race: every pair of your marks threatens its third cell." : "");
    }
    $("over").hidden = false;
  }, 700);
}

/* ---- drawing */
function cellRect(c, F, du = 0, dv = 0) { const u = F.u; return [F.ox + (L.pos[c * 2] + du) * u, F.oy + (L.pos[c * 2 + 1] + dv) * u, u]; }
function shape(k, x, y, r) {
  ctx.beginPath();
  if (k === 0) ctx.arc(x, y, r, 0, 7);
  else if (k === 1) { ctx.moveTo(x, y - r * 1.1); ctx.lineTo(x + r * 1.0, y + r * 0.75); ctx.lineTo(x - r * 1.0, y + r * 0.75); ctx.closePath(); }
  else ctx.rect(x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76);
}
function card(c, x, y, s) {
  const B = board(n), d = B.coords(c), col = HUES[d[0]], sh = d[1] ?? 0, fill = d[2] ?? 0, count = (d[3] ?? 0) + 1, tint = d[4], size = [0.8, 0.95, 1.1][d[5] ?? 1];
  ctx.fillStyle = tint === undefined ? "#121624" : TINTS[tint];
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, s, s, s * 0.14) : ctx.rect(x, y, s, s); ctx.fill();
  const r = (s * 0.13) * size * (count === 1 ? 1.35 : 1), gap = s * 0.27;
  for (let k = 0; k < count; k++) {
    const cx = x + s / 2 + (k - (count - 1) / 2) * gap, cy = y + s / 2;
    shape(sh, cx, cy, r);
    if (fill === 0) { ctx.fillStyle = col; ctx.fill(); }
    else if (fill === 1) { ctx.save(); ctx.clip(); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, s * 0.03); for (let t = -r * 2; t < r * 2; t += Math.max(2, s * 0.07)) { ctx.beginPath(); ctx.moveTo(cx + t - r, cy - r * 1.2); ctx.lineTo(cx + t + r, cy + r * 1.2); ctx.stroke(); } ctx.restore(); shape(sh, cx, cy, r); }
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, s * 0.035); ctx.stroke();
  }
}
function mark(p, x, y, s) {
  ctx.lineWidth = Math.max(2, s * 0.1); ctx.lineCap = "round";
  if (p === 1) { ctx.strokeStyle = COL.x; const m = s * 0.26; ctx.beginPath(); ctx.moveTo(x + m, y + m); ctx.lineTo(x + s - m, y + s - m); ctx.moveTo(x + s - m, y + m); ctx.lineTo(x + m, y + s - m); ctx.stroke(); }
  else { ctx.strokeStyle = COL.o; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.27, 0, 7); ctx.stroke(); }
}
/* what the hints say about each cell */
function hintState() {
  const h = new Map();
  if (!hints || !game) return h;
  if (mode === "make") { for (const c of game.threats(2).keys()) h.set(c, "o"); for (const c of game.threats(1).keys()) h.set(c, h.has(c) ? "xo" : "x"); }
  else if (mode === "avoid") { for (const c of game.threats(1).keys()) h.set(c, "px"); for (const c of game.threats(2).keys()) h.set(c, h.has(c) ? "pxo" : "po"); }
  else for (const c of game.threats(1).keys()) h.set(c, "cap");
  return h;
}
function drawCell(c, x, y, s, hs, alpha) {
  ctx.globalAlpha = alpha;
  const own = game.owner[c], pad = s * 0.05, ss = s - 2 * pad, X = x + pad, Y = y + pad;
  if (skin === "cards") card(c, X, Y, ss);
  else { ctx.fillStyle = "#121624"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(X, Y, ss, ss, ss * 0.12) : ctx.rect(X, Y, ss, ss); ctx.fill(); }
  const hst = hs.get(c);
  if (hst && !own) {
    if (mode === "make") { ctx.strokeStyle = hst === "o" ? COL.o : COL.x; ctx.lineWidth = Math.max(2, s * 0.08); ctx.setLineDash(hst === "xo" ? [s * 0.12, s * 0.08] : []); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(X + 1, Y + 1, ss - 2, ss - 2, ss * 0.12) : ctx.rect(X, Y, ss, ss); ctx.stroke(); ctx.setLineDash([]); }
    else { ctx.fillStyle = hst === "cap" ? "rgba(255,93,98,0.45)" : hst === "px" ? "rgba(242,184,75,0.33)" : hst === "po" ? "rgba(255,126,182,0.33)" : "rgba(220,150,120,0.42)"; ctx.fillRect(X, Y, ss, ss); }
  }
  if (own) {
    if (skin === "cards") { ctx.strokeStyle = own === 1 ? COL.x : COL.o; ctx.lineWidth = Math.max(2.5, s * 0.1); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(X + 1, Y + 1, ss - 2, ss - 2, ss * 0.14) : ctx.rect(X, Y, ss, ss); ctx.stroke(); }
    else mark(own, X, Y, ss);
  }
  if (game.line && game.line.includes(c)) { ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, s * 0.08); ctx.strokeRect(X - 1, Y - 1, ss + 2, ss + 2); }
  if (c === hover) { ctx.strokeStyle = COL.teal; ctx.lineWidth = 1.5; ctx.strokeRect(X - 0.5, Y - 0.5, ss + 1, ss + 1); }
  else if (c === focus && game.moves) { ctx.strokeStyle = "rgba(95,214,196,0.5)"; ctx.lineWidth = 1; ctx.strokeRect(X - 0.5, Y - 0.5, ss + 1, ss + 1); }
  ctx.globalAlpha = 1;
}
function drawGrid() {
  const F = fit(), hs = hintState(), B = board(n);
  // the 3 × 3 board's neighbours: the same board again all round, so a line through an edge reads straight
  if (n === 2 && skin === "grid") {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) for (let c = 0; c < 9; c++) { const [x, y, s] = cellRect(c, F, a * 3, b * 3); drawCell(c, x, y, s, hs, 0.14); }
    ctx.strokeStyle = "rgba(95,214,196,0.55)"; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); ctx.strokeRect(F.ox - 3, F.oy - 3, 3 * F.u + 6, 3 * F.u + 6); ctx.setLineDash([]);
  }
  for (let c = 0; c < B.N; c++) { const [x, y, s] = cellRect(c, F); if (x > W || y > H || x + s < 0 || y + s < 0) continue; drawCell(c, x, y, s, hs, 1); }
  // a line through the hovered cell and the focus: its third cell
  if (hover >= 0 && hover !== focus && game.moves) {
    const t = B.third[hover * B.N + focus], pts = [hover, focus, t].map((c) => { const [x, y, s] = cellRect(c, F); return [x + s / 2, y + s / 2]; });
    ctx.strokeStyle = "rgba(95,214,196,0.45)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[2]); ctx.stroke(); ctx.setLineDash([]);
  }
}
/* the donut: the slice through the focused cell along coordinates axes[0], axes[1] */
let donutHit = [];
function sliceCell(u, v) {
  const B = board(n), d = B.coords(focus);
  d[axes[0]] = u; if (n > 1) d[axes[1]] = v;
  return d.reduce((s, x, i) => s + x * 3 ** i, 0);
}
function drawDonut() {
  const rot = H > W * 1.15, w = rot ? H : W, h = rot ? W : H - 40, k = cam.scale(w, h), o = cam.origin(w, h), cy0 = 20 + (H - 20) / 2;
  const P = (u, v) => { const e = cam.embed(u, v), dx = k * e.X + o[0], dy = -k * e.Y + o[1]; return rot ? [W / 2 + dy, cy0 - dx, e.D, e.face] : [W / 2 + dx, cy0 + dy, e.D, e.face]; };
  const hs = hintState(), S = 6, quads = [];
  for (let u = 0; u < 3; u++) for (let v = 0; v < 3; v++) {
    const c = sliceCell(u, v);
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
      const p = [[a, b], [a + 1, b], [a + 1, b + 1], [a, b + 1]].map(([i, j]) => P(u + i / S, v + j / S)), m = P(u + (a + 0.5) / S, v + (b + 0.5) / S);
      if (m[3] < -0.15) continue;
      quads.push({ c, p, D: m[2], lit: 0.45 + 0.55 * Math.max(0, m[3]), edge: a === 0 || b === 0 });
    }
  }
  quads.sort((x, y) => x.D - y.D);
  donutHit = quads;
  for (const q of quads) {
    const own = game.owner[q.c], hst = hs.get(q.c), d = board(n).coords(q.c);
    let col;
    if (own) col = `hsl(225 25% ${Math.round(14 + 26 * q.lit)}%)`;
    else { const hue = 215 + 25 * d[axes[0]] - 20 * (d[axes[1]] ?? 0); col = `hsl(${hue} 30% ${Math.round(10 + 22 * q.lit)}%)`; }
    ctx.beginPath(); ctx.moveTo(q.p[0][0], q.p[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q.p[i][0], q.p[i][1]); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    if (hst && !own) { ctx.fillStyle = mode === "make" ? (hst === "o" ? "rgba(255,126,182,0.3)" : "rgba(242,184,75,0.3)") : hst === "px" ? "rgba(242,184,75,0.16)" : hst === "po" ? "rgba(255,126,182,0.16)" : "rgba(255,93,98,0.25)"; ctx.fill(); }
    if (game.line && game.line.includes(q.c)) { ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fill(); }
    if (q.c === hover) { ctx.fillStyle = "rgba(95,214,196,0.25)"; ctx.fill(); }
    ctx.strokeStyle = q.edge ? "rgba(5,6,10,0.9)" : "rgba(5,6,10,0.18)"; ctx.lineWidth = q.edge ? 1.6 : 0.5; ctx.stroke();
  }
  // the marks, at each cell's middle on the side facing you
  for (let u = 0; u < 3; u++) for (let v = 0; v < 3; v++) {
    const c = sliceCell(u, v), own = game.owner[c], m = P(u + 0.5, v + 0.5);
    if (!own || m[3] < 0.05) continue;
    const s = k * 0.42 * Math.max(0.35, m[3]) * cam.r / 1;
    mark(own, m[0] - s / 2, m[1] - s / 2, s);
  }
  ctx.fillStyle = COL.dim; ctx.font = "11px ui-monospace, monospace"; ctx.textAlign = "center";
  const fixed = board(n).coords(focus).map((x, i) => (i === axes[0] || i === axes[1] ? "·" : x)).join(", ");
  ctx.fillText(n === 2 ? "the whole board: a 3 × 3 torus · drag to turn it" : `the slice along coordinates ${axes[0] + 1} and ${axes[1] + 1} through (${fixed}) · drag to turn it`, W / 2, H - 14);
}
function draw() {
  if (!game) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "left";
  if (skin === "donut") drawDonut(); else drawGrid();
}

/* ---- finding the cell under a point */
function cellAt(px, py) {
  if (skin === "donut") {
    for (let i = donutHit.length - 1; i >= 0; i--) { const q = donutHit[i]; if (inPoly(px, py, q.p)) return q.c; }
    return -1;
  }
  const F = fit(), B = board(n), wrap = n === 2 && skin === "grid";
  for (let c = 0; c < B.N; c++) {
    for (const [a, b] of wrap ? [[0, 0], [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] : [[0, 0]]) {
      const [x, y, s] = cellRect(c, F, a * 3, b * 3);
      if (px >= x && px < x + s && py >= y && py < y + s) return c;
    }
  }
  return -1;
}
function inPoly(x, y, p) { let inside = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside; } return inside; }

/* ---- input: tap to play, drag to pan (or turn the donut), wheel or pinch to zoom */
const fingers = new Map();
let gesture = null;
cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId); fingers.set(e.pointerId, [e.clientX, e.clientY]);
  if (fingers.size === 2) { const [a, b] = [...fingers.values()]; gesture = { pinch: Math.hypot(a[0] - b[0], a[1] - b[1]), z, moved: true }; }
  else gesture = { x: e.clientX, y: e.clientY, last: [e.clientX, e.clientY], moved: false };
});
cv.addEventListener("pointermove", (e) => {
  const r = cv.getBoundingClientRect();
  if (!fingers.has(e.pointerId)) { const c = cellAt(e.clientX - r.left, e.clientY - r.top); if (c !== hover) { hover = c; hud(); draw(); } return; }
  fingers.set(e.pointerId, [e.clientX, e.clientY]);
  if (!gesture) return;
  if (gesture.pinch && fingers.size === 2) { const [a, b] = [...fingers.values()]; z = Math.max(0.5, Math.min(12, gesture.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / gesture.pinch)); draw(); return; }
  const dx = e.clientX - gesture.last[0], dy = e.clientY - gesture.last[1];
  if (!gesture.moved && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 7) gesture.moved = true;
  if (gesture.moved) {
    if (skin === "donut") { const k = cam.scale(W, H); cam.ou += (dx / k) * 3 / (2 * Math.PI * cam.R); cam.ov -= (dy / k) * 3 / (2 * Math.PI * cam.r) * 0.5; }
    else { pan[0] += dx; pan[1] += dy; }
    draw();
  }
  gesture.last = [e.clientX, e.clientY];
});
const lift = (e) => {
  fingers.delete(e.pointerId);
  if (gesture && !gesture.moved && !gesture.pinch && e.type === "pointerup") { const r = cv.getBoundingClientRect(); tryPlay(cellAt(e.clientX - r.left, e.clientY - r.top)); }
  if (!fingers.size) gesture = null;
};
cv.addEventListener("pointerup", lift); cv.addEventListener("pointercancel", lift);
cv.addEventListener("pointerleave", () => { if (hover >= 0) { hover = -1; hud(); draw(); } });
cv.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (skin === "donut") { cam.zoom = Math.max(0.6, Math.min(4, cam.zoom * Math.exp(-e.deltaY * 0.0015))); draw(); return; }
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, F = fit(), z0 = z;
  z = Math.max(0.5, Math.min(12, z * Math.exp(-e.deltaY * 0.0015)));
  // zoom about the pointer
  const bx = (mx - F.ox) / F.u, by = (my - F.oy) / F.u, F2 = fit();
  pan[0] += mx - (F2.ox + bx * F2.u); pan[1] += my - (F2.oy + by * F2.u);
  void z0; draw();
}, { passive: false });

/* ---- controls */
const SKINS = ["grid", "cards", "donut"];
$("skinbtn").onclick = () => { skin = SKINS[(SKINS.indexOf(skin) + 1) % 3]; z = 1; pan = [0, 0]; hud(); draw(); save(); note(skin === "cards" ? "every coordinate is an attribute: three cards are a line when each attribute is all the same or all different" : skin === "donut" ? (n === 2 ? "the whole board is a torus" : "a 2-dimensional slice of the board, on a real torus") : "nested grids: lines wrap round every block"); };
$("hintbtn").onclick = () => { hints = !hints; hud(); draw(); };
$("axisbtn").onclick = () => {
  const pairs = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  const k = pairs.findIndex((p) => p[0] === axes[0] && p[1] === axes[1]); axes = pairs[(k + 1) % pairs.length]; hud(); draw();
};
$("newbtn").onclick = () => { $("over").hidden = true; $("start").hidden = false; };
$("help").onclick = () => { $("start").hidden = false; };
$("again").onclick = () => newGame();
$("o-menu").onclick = () => { $("over").hidden = true; $("start").hidden = false; };
$("o-look").onclick = () => { $("over").hidden = true; };
for (const b of document.querySelectorAll(".games button")) b.onclick = () => newGame(b.dataset.game);
function seg(id, get, set) {
  const el = $(id), sync = () => { for (const b of el.children) b.classList.toggle("on", b.dataset.v === String(get())); };
  for (const b of el.children) b.onclick = () => { set(b.dataset.v); sync(); };
  sync();
}
seg("nsel", () => n, (v) => { n = +v; L = layout(n); });
seg("opp", () => opp, (v) => { opp = v; });
seg("first", () => first, (v) => { first = v; });
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || (e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)))) return;
  if (e.key === "n" || e.key === "N") $("newbtn").click();
  else if (e.key === "v" || e.key === "V") $("skinbtn").click();
  else if (e.key === "h" || e.key === "H") $("hintbtn").click();
});
window.addEventListener("resize", resize);

game = new Game(n, mode); cam = new ORB.TorusCam({ W: 3, H: 3, n: 9 }); cam.toward(0.5, 0.5, 1);
resize(); hud();
window.NAUGHT = { get game() { return game; }, newGame, tryPlay, set skin(v) { skin = v; hud(); draw(); }, cellAt };
