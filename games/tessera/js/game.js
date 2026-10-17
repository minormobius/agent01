/* Tessera — the game page: draws js/snake.js's board, runs its clock, takes
   the turns. The board's shape and everything that happens on it live in the
   Game; this file only decides what the player sees.

   Two views of the same torus, both following the head:
     donut  the board on a real torus, through Orb's TorusCam (../orb/js/torus.js):
            the camera is fixed and the SKIN slides round the ring and the tube,
            so the head always sits at the front, facing you
     flat   the rectangle itself, wrapped, with the head at the centre */
import "../../orb/js/torus.js";
import { Tiling, FIGURES, T_, arc } from "./tiling.js";
import { Game, G_, SHAPE } from "./snake.js";
import { OPEN, BOARD, dailyId, dailySeed, day, label } from "./score.js";

const ORB = globalThis.ORB;
const $ = (id) => document.getElementById(id);
const cv = $("view"), ctx = cv.getContext("2d");
const [BW, BH] = BOARD;                  // the torus: 24 round the ring, 10 round the tube (r/R = 10/24, cells true-shaped on top)
const FILL = ["#2b5664", "#5f4830", "#3c4270", "#61344a"].map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
const ZOOMS = [1, 1.6, 2.4];
// the lab's fish walls at a little over half their size: enough to read as figures, not so much that a square stops looking like it has four sides
const WALLS = { A: FIGURES.fish.A.map((v) => v * 0.55), B: FIGURES.fish.B.map((v) => v * 0.55) };
let g, R, cam, fu = 0, fv = 0, s = 40, dpr = 1, cw = 0, ch = 0, acc = 0, last = 0, running = false, best = 0, noteT = 0;
let mode = "donut", zi = 1, kind = "daily", gameId = dailyId(), runSeed = 1, runs = [];
try { mode = localStorage.getItem("tessera.view") || "donut"; zi = +(localStorage.getItem("tessera.zoom") ?? 1); runs = JSON.parse(localStorage.getItem("tessera.runs") || "[]"); } catch (e) { /* private mode */ }
if (!Array.isArray(runs)) runs = [];
if (!(zi in ZOOMS)) zi = 1;

function size() {
  const r = cv.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1); cw = r.width; ch = r.height;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  s = Math.max(30, Math.min(54, Math.min(cw, ch) / 9));   // flat view: pixels per cell
}
/* where the view aims: the head sliding from the cell it left towards the one it's in, plus a lead so
   there's more board ahead of you than behind */
const LEAD = 1.5;
function headAt(f = 1) { const c = cellGeo(g.body[0]).c, [hx, hy] = g.heading, m = Math.hypot(hx, hy), t = f - 1 + LEAD; return [c[0] + hx / m * t, c[1] + hy / m * t]; }
/* the runs this browser has played: the best on each board, and how many tries */
const mine = (id) => { const r = runs.filter((x) => x.game === id); return { n: r.length, best: r.reduce((m, x) => Math.max(m, x.score), 0), long: r.reduce((m, x) => Math.max(m, x.longest || 0), 0) }; };
function newGame(k = kind) {
  size();
  kind = k; const d = day();
  gameId = kind === "daily" ? dailyId(d) : OPEN;
  runSeed = kind === "daily" ? dailySeed(d) : (Date.now() % 2147483646) + 1;
  best = mine(gameId).best;
  g = new Game(BW, BH, runSeed);
  R = new Tiling(BW, BH); R.fig1 = WALLS; R.phiA.fill(1); R.phiB.fill(1);
  cam = new ORB.TorusCam({ W: BW, H: BH, n: BW * BH });
  cam.zoom = ZOOMS[zi];
  geo.clear();
  const [u, v] = headAt(); cam.toward(u, v, 1); fu = u; fv = v;
  acc = 0; hud(); buttons();
}

/* ---- one frame's cell geometry, in each cell's own frame (lattice point (x, y) at its lower left) */
const geo = new Map();
function cellGeo(i) {
  let G = geo.get(i);
  if (G) return G;
  const sides = R.sides(i).map((sd) => {
    const n = sd.c && sd.c.some((v) => v) ? 8 : 1, pts = arc(sd.P0, sd.Q0, sd.c, n);
    if (sd.rev) pts.reverse();
    return { kind: sd.kind, pts };
  });
  const ring = []; for (const sd of sides) for (let k = 0; k < sd.pts.length - 1; k++) ring.push(sd.pts[k]);
  let A = 0, cx = 0, cy = 0;
  for (let k = 0; k < ring.length; k++) { const p = ring[k], q = ring[(k + 1) % ring.length], c = p[0] * q[1] - q[0] * p[1]; A += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; }
  G = { sides, ring, c: [cx / (3 * A), cy / (3 * A)] };
  geo.set(i, G);
  return G;
}

/* ---- the two projections: flat point (u, v) → [x, y, depth, facing] */
function projector() {
  if (mode === "donut") {
    // a tall screen gets the donut on its side (a rotation, so left is still left), ring running up the screen
    const rot = ch > cw * 1.15, w = rot ? ch : cw, h = rot ? cw : ch;
    const k = cam.scale(w, h), o = cam.origin(w, h);
    return { k, P: (u, v) => {
      const e = cam.embed(u, v), dx = k * e.X + o[0], dy = -k * e.Y + o[1];
      return rot ? [cw / 2 + dy, ch / 2 - dx, e.D, e.face] : [cw / 2 + dx, ch / 2 + dy, e.D, e.face];
    } };
  }
  return { k: s, P: (u, v) => [cw / 2 + (u - fu) * s, ch / 2 - (v - fv) * s, 0, 1] };
}
/* what to draw, back to front: cells (and, on the flat map, every image of a cell that lands on screen) */
function drawList(P) {
  const out = [];
  if (mode === "donut") {
    for (let i = 0; i < R.N; i++) { const c = cellGeo(i).c, p = P(c[0], c[1]); if (p[3] > -0.12) out.push({ i, a: 0, b: 0, D: p[2], face: p[3] }); }
    out.sort((p, q) => p.D - q.D);
    return out;
  }
  for (let i = 0; i < R.N; i++) {
    const c = cellGeo(i).c, a0 = Math.round((fu - c[0]) / BW), b0 = Math.round((fv - c[1]) / BH);
    for (let a = a0 - 2; a <= a0 + 2; a++) for (let b = b0 - 3; b <= b0 + 3; b++) {
      const p = P(c[0] + a * BW, c[1] + b * BH);
      if (p[0] > -2 * s && p[0] < cw + 2 * s && p[1] > -2 * s && p[1] < ch + 2 * s) out.push({ i, a: a * BW, b: b * BH, D: 0, face: 1 });
    }
  }
  return out;
}

function draw(f, now) {
  R.h.fill(g.drawnSplit(f)); geo.clear();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#06070b"; ctx.fillRect(0, 0, cw, ch);
  const { P } = projector(), list = drawList(P);
  const body = new Map(g.body.map((c, k) => [c, k])), n = g.body.length;
  const late = g.clock <= G_.PREVIEW, pulse = 0.55 + 0.45 * Math.sin(now / 90);
  const risk = new Set(g.pinchNext ? g.atRisk() : []);
  const ghost = late && g.shape === 0 ? (g.next > 0 ? [1, -1] : [1, 1]) : null;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  for (const it of list) {
    const { i, a, b } = it, G = cellGeo(i), [x, y] = R.xy(i), k = body.get(i);
    const shade = mode === "donut" ? 0.4 + 0.6 * Math.max(0, Math.min(1, it.face)) : 1;
    let rgb = FILL[(x & 1) + 2 * (y & 1)];
    if (k === 0) rgb = g.alive ? [242, 184, 75] : [255, 93, 98];
    else if (k !== undefined) { const t = k / Math.max(1, n - 1); rgb = [95 - 40 * t, 214 - 90 * t, 196 - 70 * t]; }
    // the cell
    ctx.beginPath();
    G.ring.forEach((p, q) => { const s2 = P(p[0] + a, p[1] + b); q ? ctx.lineTo(s2[0], s2[1]) : ctx.moveTo(s2[0], s2[1]); });
    ctx.closePath();
    ctx.fillStyle = `rgb(${rgb.map((c) => Math.round(c * shade)).join(",")})`; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = "#06070b"; ctx.stroke();
    // its short walls: teal while they hold, amber while they wait to close
    for (const sd of G.sides) if (sd.kind === "C") {
      ctx.strokeStyle = late && g.pinchNext ? `rgba(242,184,75,${0.5 + 0.5 * pulse})` : "rgba(95,214,196,0.7)"; ctx.lineWidth = late && g.pinchNext ? 2.6 : 1.8;
      ctx.beginPath(); sd.pts.forEach((p, q) => { const s2 = P(p[0] + a, p[1] + b); q ? ctx.lineTo(s2[0], s2[1]) : ctx.moveTo(s2[0], s2[1]); }); ctx.stroke();
    }
    // the corner about to open: a ghost of the wall at this cell's lower left
    if (ghost) {
      const h = T_.HMAX, p = P(x + a + h * ghost[0], y + b + h * ghost[1]), q = P(x + a - h * ghost[0], y + b - h * ghost[1]);
      ctx.setLineDash([3, 4]); ctx.strokeStyle = `rgba(95,214,196,${0.35 + 0.4 * pulse})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.setLineDash([]);
    }
    const c = G.c, C = P(c[0] + a, c[1] + b), cell = Math.hypot(...[0, 1].map((j) => P(c[0] + a + 0.5, c[1] + b)[j] - C[j])) * 2;
    // the spine: half a joint from each end, red where a pinch would cut
    if (k !== undefined) for (const [j, kk] of [[k - 1, k - 1], [k + 1, k]]) {
      if (j < 0 || j >= n) continue;
      const l = g.link(g.body[k], g.body[j]); if (!l) continue;
      const r = risk.has(kk), m = P(c[0] + a + l.dx / 2, c[1] + b + l.dy / 2);
      ctx.strokeStyle = r ? (late ? `rgba(255,93,98,${0.6 + 0.4 * pulse})` : "rgba(255,93,98,0.75)") : "rgba(6,7,11,0.35)";
      ctx.lineWidth = r ? 4 : 2; ctx.beginPath(); ctx.moveTo(C[0], C[1]); ctx.lineTo(m[0], m[1]); ctx.stroke();
    }
    if (k === 0 && g.alive) {
      const [hx, hy] = g.heading, mm = Math.hypot(hx, hy), e = P(c[0] + a + 0.32 * hx / mm, c[1] + b + 0.32 * hy / mm);
      ctx.strokeStyle = "#1a1000"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(C[0], C[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
    }
    const pel = g.pellets.get(i);
    if (pel) { ctx.fillStyle = `rgba(242,184,75,${Math.min(1, pel / 30) * shade})`; ctx.beginPath(); ctx.arc(C[0], C[1], cell * 0.12, 0, 7); ctx.fill(); }
    if (i === g.food) { ctx.fillStyle = `rgba(255,126,182,${shade})`; ctx.beginPath(); ctx.arc(C[0], C[1], cell * 0.2 * (0.9 + 0.1 * pulse), 0, 7); ctx.fill(); }
  }
}

/* the view follows the head: the donut's skin slides it to the front, the flat map pans to it */
function follow(dt, f) {
  const [u, v] = headAt(f), t = 1 - Math.exp(-dt / 90);   // eased, so a turn swings the view instead of jerking it
  cam.toward(u, v, t);
  let du = u - fu, dv = v - fv; du -= BW * Math.round(du / BW); dv -= BH * Math.round(dv / BH);
  fu += du * t; fv += dv * t;
}

function note(t) { const el = $("note"); el.textContent = t; el.classList.add("show"); clearTimeout(noteT); noteT = setTimeout(() => el.classList.remove("show"), 1600); }
function hud() {
  $("score").textContent = g.score; $("len").textContent = g.body.length; $("best").textContent = Math.max(best, g.score) || "—";
  $("bestlab").textContent = kind === "daily" ? "daily best" : "best";
  const secs = ((g.clock - acc / G_.TICK) * G_.TICK / 1000).toFixed(1), risk = g.pinchNext ? g.atRisk().length : 0;
  $("nextlab").textContent = g.pinchNext ? (risk ? risk + " joint" + (risk > 1 ? "s" : "") + " at risk" : "corners close") : "corners open";
  $("next").textContent = SHAPE[g.next] + " in " + secs + "s";
  const cls = g.pinchNext ? (risk ? "risk" : "pinch") : "";
  $("next").className = "val " + cls; $("clockfill").className = cls;
  $("clockfill").style.transform = `scaleX(${Math.max(0, (g.clock - acc / G_.TICK) / G_.HOLD)})`;
}
function buttons() {
  $("viewbtn").textContent = mode === "donut" ? "flat" : "torus";
  $("zoom").hidden = mode !== "donut"; $("zoom").textContent = "×" + ZOOMS[zi];
}
function over() {
  running = false;
  const was = best, wasLong = mine(gameId).long, longest = g.longest || g.body.length;
  runs.push({ game: gameId, score: g.score, longest, steps: g.ticks, at: Date.now() });
  runs = runs.slice(-60);
  try { localStorage.setItem("tessera.runs", JSON.stringify(runs)); } catch (e) { /* private mode */ }
  const m = mine(gameId); best = m.best;
  $("o-board").textContent = "bitten · " + label(gameId);
  $("o-score").textContent = g.score;
  $("o-text").textContent = `${g.ticks} steps, longest ${g.longest || g.body.length}; the corners cut you ${g.cuts} time${g.cuts === 1 ? "" : "s"} and ${g.dropped} pieces fell off.`;
  const news = [g.score > was && was > 0 ? "a new best score" : "", longest > wasLong && wasLong > 0 ? "your longest snake yet" : ""].filter(Boolean);
  $("o-mine").textContent = (news.length ? news.join(" and ") + "! " : "") + `your best on ${label(gameId)}: ${m.best} points, ${m.long} long, over ${m.n} run${m.n === 1 ? "" : "s"}`;
  $("switch").textContent = kind === "daily" ? "open play" : "today's daily";
  $("share").hidden = kind !== "daily";
  offerable();
  $("over").hidden = false;
}
/* the board loads on its own (it needs the vendored auth client); the post button shows once it's there */
const board = () => window.TESSERA_BOARD || null;
let postedRun = -1;
function offerable() { const p = $("post"); p.hidden = !board() || !g || g.alive || !g.score; p.disabled = postedRun === runs.length; $("trophy").hidden = $("o-board-btn").hidden = !board(); }
window.addEventListener("tessera-board", offerable);

function loop(now) {
  const dt = Math.min(250, now - (last || now)); last = now;
  if (running) {
    acc += dt;
    while (acc >= G_.TICK && g.alive) {
      acc -= G_.TICK; g.tick();
      g.longest = Math.max(g.longest || 0, g.body.length);
      for (const e of g.events) {
        if (e.kind === "cut") note(`cut! ${e.n} piece${e.n > 1 ? "s" : ""} fell off — gather ${e.n > 1 ? "them" : "it"}`);
        if (e.kind === "dead") over();
      }
    }
    hud();
  }
  const f = running ? Math.min(1, acc / G_.TICK) : 1;
  R.h.fill(g.drawnSplit(running ? f : 0)); geo.clear();
  follow(dt, f);
  draw(running ? f : 0, now);
  requestAnimationFrame(loop);
}

/* ---- input: relative turns */
const turn = (d) => { if (running) g.turn(d); };
const save = () => { try { localStorage.setItem("tessera.view", mode); localStorage.setItem("tessera.zoom", String(zi)); } catch (e) { /* private mode */ } };
cv.addEventListener("pointerdown", (e) => { const r = cv.getBoundingClientRect(); turn(e.clientX - r.left < r.width / 2 ? 1 : -1); });
window.addEventListener("keydown", (e) => {
  // keys typed into a field (the leaderboard's handle) belong to the field, not the game; and leave browser shortcuts alone
  if (e.ctrlKey || e.metaKey || e.altKey || (e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)))) return;
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { e.preventDefault(); turn(1); }
  else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); turn(-1); }
  else if (e.key === " ") { e.preventDefault(); $("play").click(); }
  else if (e.key === "v" || e.key === "V") $("viewbtn").click();
});
$("play").onclick = () => { if (!g.alive) return; running = !running; $("play").textContent = running ? "❚❚" : "▶"; };
$("viewbtn").onclick = () => { mode = mode === "donut" ? "flat" : "donut"; buttons(); save(); };
$("zoom").onclick = () => { zi = (zi + 1) % ZOOMS.length; cam.zoom = ZOOMS[zi]; buttons(); save(); };
$("help").onclick = () => { running = false; $("play").textContent = "▶"; $("start").hidden = false; };
const start = (k) => { $("start").hidden = true; $("over").hidden = true; if (!g.alive || g.ticks === 0 || k !== kind) newGame(k); running = true; $("play").textContent = "❚❚"; last = 0; };
$("go").onclick = () => start("daily");
$("go-open").onclick = () => start("open");
$("again").onclick = () => { $("over").hidden = true; newGame(); running = true; last = 0; };
$("switch").onclick = () => { $("over").hidden = true; newGame(kind === "daily" ? "open" : "daily"); running = true; last = 0; };
$("trophy").onclick = () => { const b = board(); if (!b) return; if (running) $("play").click(); b.open({ board: gameId }); };
$("o-board-btn").onclick = () => { const b = board(); if (b) b.open({ board: gameId }); };
$("post").onclick = () => {
  const b = board(); if (!b || g.alive || !g.score) return;
  postedRun = runs.length; $("post").disabled = true;
  b.offer({ sel: { board: gameId, metric: "score" }, value: g.score, seed: runSeed, steps: g.ticks, longest: g.longest || g.body.length, cuts: g.cuts, at: Date.now() });
};
$("share").onclick = async () => {
  const text = `Tessera ${label(gameId)}: ${g.score} points, ${g.ticks} steps, cut ${g.cuts} time${g.cuts === 1 ? "" : "s"}. games.mino.mobi/tessera/`;
  try { if (navigator.share) { await navigator.share({ text }); return; } await navigator.clipboard.writeText(text); $("o-mine").textContent = "copied: " + text; }
  catch (e) { $("o-mine").textContent = text; }
};
document.addEventListener("visibilitychange", () => { if (document.hidden && running) $("play").click(); });
window.addEventListener("resize", size);

newGame("daily");
offerable();
requestAnimationFrame(loop);
window.TESSERA = { get g() { return g; }, get cam() { return cam; }, set running(v) { running = v; }, set mode(v) { mode = v; buttons(); } };
