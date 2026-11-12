/* How stars burn: the widget. The network (net.js, REACLIB's rates) runs a star's whole burning life up front (life.js);
   the cartoon walks through it along one timeline, drawing reactions sampled from the network's real rates at that
   moment. Every knob reruns the network from the stage it touches. Pause stops everything, the cartoon's own clock too.
   What the cartoon makes up: where nuclei are and how they move, how many are drawn (a real core holds ~10⁵⁰), and how
   often a reaction is shown; the page states each. */
import { STAGES, NUC, IDX, RX, fluxes, energy, toX, SOURCE } from "./net.js";
import { KNOBS, defaults, runLife, at, atLife, encode, decode, isDefault } from "./life.js";
import { label, human, sci, kelvin, kind, eqn, words, sup } from "./text.js";
import { drawStrip, stripLegend } from "./strip.js";

const $ = (id) => document.getElementById(id);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const NS = STAGES.length;

/* ---------- state ---------- */
let cfg = decode(location.hash), L = runLife(cfg), STD = isDefault(cfg) ? L : runLife(defaults());
const S = { v: +(new URLSearchParams(location.search).get("v") ?? 0) || 0, playing: true, speed: 1, vt: 0, parts: [], fx: [], log: [], nextEvent: 0, gamma: 1, carry: true, pace: 70 };
const stageOf = () => Math.min(NS - 1, Math.floor(S.v));

/* ---------- the cartoon nuclei ---------- */
const PC = "#ff6f61", NCOL = "#8fb3ff", SHAPES = {};
function shape(k) {
  if (SHAPES[k]) return SHAPES[k]; const n = NUC[IDX[k]], pts = []; let seed = n.A * 7919 + n.Z * 104729;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n.A; i++) { const r = 0.62 * Math.sqrt(i + (n.A > 1 ? 0.5 : 0)), a = i * 2.39996; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
  const isP = Array.from({ length: n.A }, (_, i) => i < n.Z); for (let i = n.A - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [isP[i], isP[j]] = [isP[j], isP[i]]; }
  return (SHAPES[k] = { pts, isP });
}
function drawNucleus(x, k, px, py, s, alpha = 1) {
  const sh = shape(k); x.globalAlpha = alpha;
  for (let i = sh.pts.length - 1; i >= 0; i--) { const [u, v] = sh.pts[i]; x.fillStyle = sh.isP[i] ? PC : NCOL; x.beginPath(); x.arc(px + u * s, py + v * s, s * 0.52, 0, 7); x.fill(); x.strokeStyle = "rgba(0,0,0,0.35)"; x.lineWidth = 0.6; x.stroke(); }
  x.globalAlpha = 1;
}

/* ---------- the gas window ---------- */
const NSHOW = 64; let W = 600, H = 400;
function targets(Y) { const tot = Y.reduce((a, b) => a + b, 0), out = {}; for (let i = 0; i < Y.length; i++) { const f = Y[i] / tot, c = f * NSHOW; out[NUC[i].k] = c >= 0.5 ? Math.round(c) : f > 2e-6 ? 1 : 0; } return out; }
function spawn(k, edge = false) {
  const sp = 26 / Math.sqrt(NUC[IDX[k]].A), a = Math.random() * 7, p = { k, vx: sp * Math.cos(a), vy: sp * Math.sin(a) };
  if (edge) { const e = Math.floor(Math.random() * 4); p.x = e === 0 ? -10 : e === 1 ? W + 10 : Math.random() * W; p.y = e === 2 ? -10 : e === 3 ? H + 10 : Math.random() * H; p.vx = (W / 2 - p.x) * 0.05; p.vy = (H / 2 - p.y) * 0.05; p.entering = true; }
  else { p.x = 20 + Math.random() * (W - 40); p.y = 20 + Math.random() * (H - 40); }
  S.parts.push(p); return p;
}
/* the scene's size now; nuclei already placed are scaled with it */
function sizeScene() { const c = $("gas"), w = c.clientWidth || W, h = c.clientHeight || H; if (w !== W || h !== H) { for (const p of S.parts) { p.x *= w / W; p.y *= h / H; if (p.tx != null) { p.tx *= w / W; p.ty *= h / H; } } W = w; H = h; } }
function populate(Y) { sizeScene(); S.parts = []; S.fx = []; for (const [k, c] of Object.entries(targets(Y))) for (let i = 0; i < c; i++) spawn(k); }
function reconcile(Y) {
  const tg = targets(Y), have = {}; for (const p of S.parts) if (!p.busy && !p.leaving) have[p.k] = (have[p.k] ?? 0) + 1;
  for (const k of new Set([...Object.keys(tg), ...Object.keys(have)])) { const d = (have[k] ?? 0) - (tg[k] ?? 0);
    if (d > 1 || (d > 0 && !tg[k])) { const p = S.parts.find((q) => q.k === k && !q.busy && !q.leaving); if (p) { p.leaving = true; const a = Math.atan2(p.y - H / 2, p.x - W / 2); p.vx = 90 * Math.cos(a); p.vy = 90 * Math.sin(a); } }
    else if (d < -1 || (d < 0 && !(have[k] ?? 0))) spawn(k, true); }
}
/* one reaction, sampled from the rates now (weight rate^γ: γ = 1 as they happen, smaller lets rare ones through) */
function stageEvent(fl) {
  const w = fl.map((f) => (f > 0 ? f ** S.gamma : 0)), tot = w.reduce((a, b) => a + b, 0), real = fl.reduce((a, b) => a + b, 0); if (!(tot > 0)) return;
  let u = Math.random() * tot, ri = 0; for (; ri < w.length - 1; ri++) { u -= w[ri]; if (u <= 0) break; }
  const r = RX[ri], used = [];
  for (const k of r.r) { let p = S.parts.find((q) => q.k === k && !q.busy && !q.leaving && !used.includes(q)); if (!p) p = spawn(k, true); used.push(p); }
  const cx = used.reduce((s, p) => s + p.x, 0) / used.length, cy = used.reduce((s, p) => s + p.y, 0) / used.length, mx = Math.min(W - 40, Math.max(40, cx)), my = Math.min(H - 40, Math.max(60, cy));
  for (const p of used) { p.busy = true; p.tx = mx; p.ty = my; }
  S.fx.push({ r, used, x: mx, y: my, t0: S.vt, dur: 1100 / Math.sqrt(S.speed), kind: kind(r) });
  S.log.unshift({ r, share: fl[ri] / real }); S.log.length = Math.min(S.log.length, 4); showLog();
}
function finishEvent(ev) {
  S.parts = S.parts.filter((p) => !ev.used.includes(p));
  for (const k of ev.r.p) { const p = spawn(k); p.x = ev.x + (Math.random() - 0.5) * 18; p.y = ev.y + (Math.random() - 0.5) * 18; const a = Math.random() * 7, sp = 60 / Math.sqrt(NUC[IDX[k]].A); p.vx = sp * Math.cos(a); p.vy = sp * Math.sin(a); }
  const out = ev.kind === "capture" ? ["γ"] : ev.kind === "beta" ? ["e⁺", "ν"] : ev.kind === "ec" ? ["ν"] : [];
  for (const o of out) S.fx.push({ ray: o, x: ev.x, y: ev.y, a: Math.random() * 7, t0: S.vt, dur: 900 });
}
function step(dt) {
  const m = dt * S.speed ** 0.3;
  for (const p of S.parts) {
    if (p.busy) { p.x += (p.tx - p.x) * Math.min(1, dt * 6); p.y += (p.ty - p.y) * Math.min(1, dt * 6); continue; }
    p.x += p.vx * m; p.y += p.vy * m;
    if (p.entering && p.x > 20 && p.x < W - 20 && p.y > 20 && p.y < H - 20) { p.entering = false; const a = Math.random() * 7, sp = 26 / Math.sqrt(NUC[IDX[p.k]].A); p.vx = sp * Math.cos(a); p.vy = sp * Math.sin(a); }
    if (!p.entering && !p.leaving) { if (p.x < 8 || p.x > W - 8) p.vx *= -1; if (p.y < 8 || p.y > H - 8) p.vy *= -1; p.x = Math.min(W - 8, Math.max(8, p.x)); p.y = Math.min(H - 8, Math.max(8, p.y)); }
  }
  S.parts = S.parts.filter((p) => !p.leaving || (p.x > -40 && p.x < W + 40 && p.y > -40 && p.y < H + 40));
  for (let i = 0; i < S.parts.length; i++) for (let j = i + 1; j < S.parts.length; j++) { const a = S.parts[i], b = S.parts[j]; if (a.busy || b.busy) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy; if (d2 > 2500 || d2 < 1) continue; const na = NUC[IDX[a.k]], nb = NUC[IDX[b.k]], f = ((90 * na.Z * nb.Z) / d2) * dt, d = Math.sqrt(d2);
    a.vx -= (f * dx) / d / na.A; a.vy -= (f * dy) / d / na.A; b.vx += (f * dx) / d / nb.A; b.vy += (f * dy) / d / nb.A; }
  for (const ev of S.fx) if (ev.r && !ev.done && S.vt - ev.t0 > ev.dur * 0.55) { ev.done = true; finishEvent(ev); }
  S.fx = S.fx.filter((e) => S.vt - e.t0 < e.dur);
}
function wave(x, x0, y0, x1, y1, col) { const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L; x.strokeStyle = col; x.lineWidth = 1.5; x.beginPath(); for (let s = 0; s <= L; s += 2) { const w = 4 * Math.sin(s / 3); x.lineTo(x0 + (dx * s) / L + nx * w, y0 + (dy * s) / L + ny * w); } x.stroke(); }
function drawGas() {
  const c = $("gas"), r = devicePixelRatio || 1; sizeScene(); if (c.width !== Math.round(W * r) || c.height !== Math.round(H * r)) { c.width = Math.round(W * r); c.height = Math.round(H * r); }
  const x = c.getContext("2d"), R = L[stageOf()]; x.setTransform(r, 0, 0, r, 0, 0); x.fillStyle = "#0b0d13"; x.fillRect(0, 0, W, H);
  const glow = Math.min(1, Math.max(0, Math.log10(R.T / 1e7) / 2.6)); x.fillStyle = `rgba(255,${150 - 80 * glow},60,${0.05 + 0.07 * glow})`; x.fillRect(0, 0, W, H);
  const nA = S.parts.reduce((a, p) => a + NUC[IDX[p.k]].A, 0) / Math.max(1, S.parts.length), sc = Math.max(2.4, Math.min(5, W / 140) * Math.min(1, (12 / nA) ** 0.35));
  for (const p of S.parts) drawNucleus(x, p.k, p.x, p.y, sc, p.leaving ? 0.5 : 1);
  for (const ev of S.fx) { const f = (S.vt - ev.t0) / ev.dur;
    if (ev.r) { if (ev.kind === "photo" && f < 0.55) { const Lw = 120 * (1 - f / 0.55); wave(x, ev.x - Lw * 0.83, ev.y - Lw * 0.56, ev.x, ev.y, "#fff3a8"); }
      if (f > 0.45 && f < 0.85) { const g = (f - 0.45) / 0.4; x.strokeStyle = `rgba(255,255,255,${1 - g})`; x.lineWidth = 3; x.beginPath(); x.arc(ev.x, ev.y, 8 + 40 * g, 0, 7); x.stroke(); }
      x.font = `600 13px ${css("--mono")}`; x.textAlign = "center"; x.fillStyle = `rgba(233,228,218,${Math.min(1, 3 * (1 - f))})`; x.fillText(eqn(ev.r), Math.min(W - 130, Math.max(130, ev.x)), Math.max(70, ev.y - 30)); }
    else { const Lr = 30 + 260 * f, ex = ev.x + Lr * Math.cos(ev.a), ey = ev.y + Lr * Math.sin(ev.a); x.font = `11px ${css("--mono")}`;
      if (ev.ray === "γ") wave(x, ev.x + 0.4 * Lr * Math.cos(ev.a), ev.y + 0.4 * Lr * Math.sin(ev.a), ex, ey, "#fff3a8");
      else if (ev.ray === "ν") { const nx = ev.x + 2.5 * Lr * Math.cos(ev.a), ny = ev.y + 2.5 * Lr * Math.sin(ev.a); x.setLineDash([3, 5]); x.strokeStyle = "rgba(200,200,255,0.6)"; x.lineWidth = 1; x.beginPath(); x.moveTo(ev.x, ev.y); x.lineTo(nx, ny); x.stroke(); x.setLineDash([]); x.fillStyle = "rgba(200,200,255,0.8)"; x.fillText("ν", nx, ny); }
      else { x.fillStyle = "#ffe08a"; x.beginPath(); x.arc(ex, ey, 2.5, 0, 7); x.fill(); x.fillText("e⁺", ex + 6, ey - 4); } } }
  // the heads-up: stage, conditions, clock
  const s = atLife(L, S.v), fuel = NUC[IDX[R.st.fuel]], left = (s.Y[IDX[fuel.k]] * fuel.A) / (R.X0[fuel.k] || 1);
  const narrow = W < 560; x.fillStyle = "rgba(11,13,19,0.7)"; x.fillRect(0, 0, W, narrow ? 62 : 46);
  x.textAlign = "left"; x.font = `700 14px ${css("--mono")}`; x.fillStyle = css("--text"); x.fillText(`${stageOf() + 1} · ${R.st.title}`, 12, 20);
  x.font = `12px ${css("--mono")}`; x.fillStyle = css("--dim"); x.fillText(`${kelvin(R.T)} · ${sci(R.rho)} g/cm³ · ${fuel.k === "p" ? "hydrogen" : fuel.name} left ${(100 * left).toFixed(0)}%`, 12, 37);
  const clock = `${human(s.t)} into this stage${S.playing ? "" : " · paused"}`; x.font = `600 12px ${css("--mono")}`; x.fillStyle = S.playing ? css("--text") : "#e3cf7f";
  if (narrow) { x.textAlign = "left"; x.fillText(clock, 12, 54); } else { x.textAlign = "right"; x.fillText(clock, W - 12, 20); }
}

/* ---------- the timeline: the whole life, one segment a stage ---------- */
function drawTimeline() { drawStrip($("timeline"), L, S.v); }
function scrubTo(e) { const c = $("timeline"), b = c.getBoundingClientRect(), v = Math.min(NS - 0.0001, Math.max(0, ((e.clientX - b.left) / b.width) * NS)); S.v = v; populate(atLife(L, S.v).Y); S.log = []; showLog(); refresh(); }

/* ---------- the panel ---------- */
function showLog() {
  $("log").innerHTML = S.log.map((e, i) => `<div class="ev${i ? "" : " new"}"><b>${eqn(e.r)}${S.gamma < 1 ? ` <i>${e.share > 0.01 ? `${(100 * e.share).toFixed(0)}% of reactions now` : `really 1 in ${sci(1 / e.share, 0)}`}</i>` : ""}</b><span>${words(e.r)}</span></div>`).join("") || `<div class="ev"><span>${S.playing ? "…" : "Paused. Drag along the timeline to move through the star's life."}</span></div>`;
}
const ROWS = (Y) => toX(Y).map((v, i) => [NUC[i].k, v]);
function bars(el, Y, Ystd) {
  const now = ROWS(Y), std = Ystd ? ROWS(Ystd) : null, keys = [...new Set([...now, ...(std ?? [])].filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1]).map(([k]) => k))].slice(0, 10);
  el.innerHTML = keys.map((k) => { const v = now.find((r) => r[0] === k)[1], s = std ? std.find((r) => r[0] === k)[1] : null;
    return `<div class="cb"><span>${label(k)}</span><div class="tr"><i style="width:${(100 * v).toFixed(1)}%"></i>${s != null ? `<u style="left:${(100 * s).toFixed(1)}%"></u>` : ""}</div><em>${v >= 0.01 ? (100 * v).toFixed(0) : (100 * v).toFixed(1)}%${s != null && Math.abs(v - s) > 0.005 ? `<small>${v > s ? "▲" : "▼"} ${(100 * s).toFixed(0)}</small>` : ""}</em></div>`; }).join("");
}
function chart(cv, Y, fl, { labels = false } = {}) {
  const r = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
  const x = cv.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h); const ne = 30, ze = 28, cs = Math.min((w - 8) / (ne + 1), (h - 8) / (ze + 1)), X0 = 4, Y0 = h - 4, P = (n, z) => [X0 + (n + 0.5) * cs, Y0 - (z + 0.5) * cs];
  const X = toX(Y);
  for (let i = 0; i < NUC.length; i++) { const n = NUC[i], [px, py] = P(n.A - n.Z, n.Z), a = X[i] > 0 ? Math.max(0, Math.min(1, (Math.log10(X[i]) + 8) / 8)) : 0; x.fillStyle = `rgba(111,224,255,${0.06 + 0.8 * a})`; x.fillRect(px - cs / 2 + 0.5, py - cs / 2 + 0.5, cs - 1, cs - 1); }
  const net = new Map(); RX.forEach((rx, i) => { if (!fl[i]) return; const hv = (xs) => xs.slice().sort((a, b) => NUC[IDX[b]].A - NUC[IDX[a]].A || NUC[IDX[b]].Z - NUC[IDX[a]].Z)[0], a = hv(rx.r), b = hv(rx.p); if (a === b) return; const key = a < b ? `${a}|${b}` : `${b}|${a}`; net.set(key, (net.get(key) ?? 0) + (a < b ? 1 : -1) * fl[i]); });
  const arr = [...net.entries()].map(([k, v]) => { const [a, b] = k.split("|"); return v >= 0 ? [a, b, v] : [b, a, -v]; }).sort((p, q) => q[2] - p[2]).slice(0, 12), top = arr[0]?.[2] ?? 1;
  for (const [a, b, v] of arr) { const na = NUC[IDX[a]], nb = NUC[IDX[b]], [x1, y1] = P(na.A - na.Z, na.Z), [x2, y2] = P(nb.A - nb.Z, nb.Z), wd = 0.8 + 2.5 * Math.max(0, 1 + Math.log10(v / top) / 6), ang = Math.atan2(y2 - y1, x2 - x1);
    x.strokeStyle = x.fillStyle = "rgba(255,180,107,0.9)"; x.lineWidth = wd; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2 - Math.cos(ang) * 3, y2 - Math.sin(ang) * 3); x.stroke(); x.beginPath(); x.moveTo(x2, y2); x.lineTo(x2 + Math.cos(ang + 2.5) * 5, y2 + Math.sin(ang + 2.5) * 5); x.lineTo(x2 + Math.cos(ang - 2.5) * 5, y2 + Math.sin(ang - 2.5) * 5); x.fill(); }
}
let lastRead = 0;
let barStage = -1;
function refresh() {
  if (stageOf() !== barStage) { barStage = stageOf(); barrier(true); }
  const i = stageOf(), R = L[i], s = atLife(L, S.v), fl = fluxes(s.Y, R.k), tot = fl.reduce((a, b) => a + b, 0), nuclei = s.Y.reduce((a, b) => a + b, 0);
  const du = 0.01, u = s.u, dtdu = (at(R, Math.min(1, u + du)).t - at(R, Math.max(0, u - du)).t) / (Math.min(1, u + du) - Math.max(0, u - du));
  const per = (tot * (NSHOW / nuclei) * dtdu * (S.speed / S.pace)) / (Math.sqrt(S.speed) / 1.4);
  $("stats").innerHTML = `<b>${sci(energy(fl))}</b> erg/g/s · nine-tenths of the fuel burns in <b>${human(R.t90)}</b>${STD[i] !== R ? ` (standard ${human(STD[i].t90)})` : ""} · ${per > 1.5 ? `each reaction shown stands for ~${per > 1e3 ? `10${sup(Math.round(Math.log10(per)))}` : Math.round(per)} real ones among ${NSHOW} nuclei` : `about real time for ${NSHOW} nuclei`}${S.gamma < 1 ? "; rare reactions boosted" : ""}`;
  $("blurb").textContent = R.st.blurb;
  bars($("comp"), s.Y, STD[i] !== R ? atLife(STD, S.v).Y : null); bars($("ash"), R.Y, STD[i].Y); $("ashlabel").textContent = `What stage ${i + 1} leaves`;
  chart($("mini"), s.Y, fl); $("open").href = $("open2").href = `chart/?v=${S.v.toFixed(3)}${encode(cfg)}`;
  drawTimeline(); $("legend").innerHTML = stripLegend(L); return { s, fl };
}

/* ---------- the knobs ---------- */
function knobs() {
  const i = stageOf(), st = STAGES[i], T = cfg.T[st.key] ?? st.T, rho = cfg.rho[st.key] ?? st.rho;
  $("Tk").value = Math.log10(T / st.T).toFixed(3); $("Tv").textContent = kelvin(T); $("rk").value = Math.log10(rho / st.rho).toFixed(3); $("rv").textContent = `${sci(rho)} g/cm³`;
  $("zk").value = Math.log10(cfg.z).toFixed(3); $("zv").textContent = `×${+cfg.z.toPrecision(2)} the Sun's`; $("hk").value = cfg.he; $("hv").textContent = `${(100 * cfg.he).toFixed(0)}%`;
  const kn = KNOBS.find((k) => k.key === $("rsel").value), f = cfg.mult[kn.key] ?? 1; $("mk").value = Math.log10(f).toFixed(3); $("mv").textContent = `×${+f.toPrecision(2)}`;
  $("chips").innerHTML = Object.entries(cfg.mult).filter(([, v]) => v !== 1).map(([k, v]) => `<span class="chip">${KNOBS.find((x) => x.key === k).label} ×${+v.toPrecision(2)}</span>`).join("");
  $("stagename").textContent = `${i + 1} · ${st.title}`;
}
let pending = null;
function recompute() {
  clearTimeout(pending); $("busy").textContent = "rerunning the network…";
  pending = setTimeout(() => { const t0 = performance.now(); L = runLife(cfg, L); $("busy").textContent = `reran in ${((performance.now() - t0) / 1000).toFixed(1)} s`; history.replaceState(null, "", `${location.pathname}${encode(cfg)}`); populate(atLife(L, S.v).Y); refresh(); knobs(); }, 160);
}
function wire() {
  const st = () => STAGES[stageOf()];
  $("Tk").addEventListener("input", () => { const v = st().T * 10 ** +$("Tk").value; if (Math.abs(+$("Tk").value) < 0.01) delete cfg.T[st().key]; else cfg.T[st().key] = +v.toPrecision(3); knobs(); recompute(); });
  $("rk").addEventListener("input", () => { const v = st().rho * 10 ** +$("rk").value; if (Math.abs(+$("rk").value) < 0.02) delete cfg.rho[st().key]; else cfg.rho[st().key] = +v.toPrecision(3); knobs(); recompute(); });
  $("zk").addEventListener("input", () => { cfg.z = +(10 ** +$("zk").value).toPrecision(2); if (Math.abs(+$("zk").value) < 0.02) cfg.z = 1; knobs(); recompute(); });
  $("hk").addEventListener("input", () => { cfg.he = +(+$("hk").value).toFixed(3); knobs(); recompute(); });
  $("rsel").innerHTML = KNOBS.map((k) => `<option value="${k.key}">${k.label}</option>`).join(""); $("rsel").value = "c12a";
  $("rsel").addEventListener("input", knobs);
  $("mk").addEventListener("input", () => { const k = $("rsel").value, f = +(10 ** +$("mk").value).toPrecision(2); if (Math.abs(+$("mk").value) < 0.02) delete cfg.mult[k]; else cfg.mult[k] = f; knobs(); recompute(); });
  $("reset").addEventListener("click", () => { cfg = defaults(); knobs(); recompute(); });
  $("play").addEventListener("click", () => { S.playing = !S.playing; $("play").textContent = S.playing ? "❚❚ pause" : "▶ play"; showLog(); });
  $("speed").addEventListener("input", () => { S.speed = 2 ** +$("speed").value; $("sval").textContent = `×${S.speed}`; });
  $("rare").addEventListener("input", () => { S.gamma = [1, 0.6, 0.35, 0.15][+$("rare").value]; $("rarev").textContent = ["as they happen", "rare ones more often", "rare ones often", "every kind about equally"][+$("rare").value]; showLog(); });
  $("carry").addEventListener("change", () => (S.carry = $("carry").checked));
  for (const [a, b] of [["back", -1], ["fwd", 1]]) $(a).addEventListener("click", () => { S.v = Math.max(0, Math.min(NS - 0.0001, Math.floor(S.v) + b)); populate(atLife(L, S.v).Y); refresh(); knobs(); });
  let drag = false; const tl = $("timeline");
  tl.addEventListener("pointerdown", (e) => { drag = true; tl.setPointerCapture(e.pointerId); scrubTo(e); knobs(); });
  tl.addEventListener("pointermove", (e) => drag && (scrubTo(e), knobs())); tl.addEventListener("pointerup", () => (drag = false));
  for (const b of document.querySelectorAll(".tabs button")) b.addEventListener("click", () => { for (const o of document.querySelectorAll(".tabs button")) o.classList.toggle("on", o === b); for (const p of document.querySelectorAll(".pane")) p.hidden = p.id !== b.dataset.p; if (b.dataset.p === "pbar") barrier(true); refresh(); });
  addEventListener("keydown", (e) => { if (e.code === "Space" && e.target === document.body) { e.preventDefault(); $("play").click(); } });
  for (const id of ["pair", "temp"]) $(id).addEventListener("input", () => barrier(false));
  addEventListener("resize", () => { refresh(); barrier(false); });
}

/* ---------- the barrier, one encounter ---------- */
const PAIRS = [["p", "p"], ["p", "n14"], ["he4", "he4"], ["he4", "c12"], ["c12", "c12"], ["he4", "ne20"], ["o16", "o16"], ["he4", "si28"]], STAGE_PAIR = [0, 1, 3, 4, 5, 6, 7];
function barrier(sync) {
  if (sync) { const i = stageOf(); $("pair").value = STAGE_PAIR[i]; $("temp").value = Math.log10(L[i].T).toFixed(2); }
  const [a, b] = PAIRS[+$("pair").value], na = NUC[IDX[a]], nb = NUC[IDX[b]], T = 10 ** +$("temp").value, kT = 8.617333e-11 * T;
  const mu = ((na.A * nb.A) / (na.A + nb.A)) * 931.494, Z = na.Z * nb.Z, R0 = 1.2 * (Math.cbrt(na.A) + Math.cbrt(nb.A)), VB = (1.44 * Z) / R0, EG = 2 * mu * ((Math.PI * Z) / 137.036) ** 2, E0 = Math.cbrt((EG * kT * kT) / 4), P0 = Math.exp(-Math.sqrt(EG / E0));
  $("tval").textContent = kelvin(T);
  const prep = (id) => { const c = $(id), r = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (c.width !== Math.round(w * r)) { c.width = Math.round(w * r); c.height = Math.round(h * r); } const x = c.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h); x.font = `11px ${css("--mono")}`; return { x, w, h }; };
  { const { x, w, h } = prep("pot"), rmax = Math.max(4 * R0, 3 * R0), Xp = (rr) => 30 + ((w - 40) * rr) / rmax, Yp = (e) => h - 18 - ((h - 30) * e) / (VB * 1.15);
    x.fillStyle = "rgba(111,224,255,0.12)"; x.fillRect(Xp(0), Yp(0) - (h - 30), Xp(R0) - Xp(0), h - 30);
    x.strokeStyle = css("--d4"); x.lineWidth = 2; x.beginPath(); x.moveTo(Xp(R0), Yp(0)); x.lineTo(Xp(R0), Yp(VB)); for (let rr = R0; rr <= rmax; rr += rmax / 300) x.lineTo(Xp(rr), Yp((1.44 * Z) / rr)); x.stroke();
    const Es = Math.max(E0, VB * 0.015), rt = (1.44 * Z) / E0; x.strokeStyle = css("--d3"); x.setLineDash([4, 4]); x.lineWidth = 1; x.beginPath(); x.moveTo(Xp(0), Yp(Es)); x.lineTo(w - 6, Yp(Es)); x.stroke(); x.setLineDash([]);
    x.fillStyle = "rgba(255,180,107,0.3)"; x.fillRect(Xp(R0), Yp(Es) - 3, w - 6 - Xp(R0), 6);
    x.fillStyle = css("--dim"); x.textAlign = "left"; x.fillText(`hill ${(VB * 1e3).toFixed(0)} keV at ${R0.toFixed(1)} fm`, Xp(R0) + 6, Yp(VB) + 4);
    x.fillStyle = css("--d3"); x.fillText(`they come in at ${(E0 * 1e3).toPrecision(3)} keV`, Xp(R0) + 6, Yp(Es) - 7); x.fillStyle = css("--dim"); x.textAlign = "center"; x.fillText("nucleus", Xp(R0 / 2), h - 4); x.textAlign = "right"; x.fillText("distance →", w - 6, h - 4); }
  { const { x, w, h } = prep("gamow"), Emax = Math.max(3 * E0, 8 * kT), n = 300, Xp = (e) => 6 + ((w - 12) * e) / Emax, mb = (e) => (e / kT) * Math.exp(-e / kT), tn = (e) => Math.exp(-Math.sqrt(EG / e)), pr = (e) => mb(e) * tn(e);
    let pm = 0; for (let i = 1; i <= n; i++) pm = Math.max(pm, pr((Emax * i) / n));
    const plot = (f, s, col, fill) => { x.beginPath(); x.moveTo(Xp(0), h - 16); for (let i = 1; i <= n; i++) { const e = (Emax * i) / n; x.lineTo(Xp(e), h - 16 - (h - 30) * Math.min(1, f(e) / s)); } if (fill) { x.lineTo(Xp(Emax), h - 16); x.fillStyle = col; x.fill(); } else { x.strokeStyle = col; x.lineWidth = 1.5; x.stroke(); } };
    plot(pr, pm, "rgba(255,180,107,0.55)", true); plot(mb, Math.exp(-1), "rgba(233,228,218,0.6)"); plot(tn, tn(Emax), css("--d4"));
    x.textAlign = "left"; x.fillStyle = "rgba(233,228,218,0.8)"; x.fillText("how many", Xp(kT) + 6, 12); x.fillStyle = css("--d4"); x.textAlign = "right"; x.fillText("chance to tunnel", w - 6, 24); x.fillStyle = css("--d3"); x.textAlign = "center"; x.fillText("fusion", Xp(E0), h - 22); x.fillStyle = css("--dim"); x.fillText("energy →", w / 2, h - 2); }
  $("bnums").innerHTML = `kT <b>${(kT * 1e3).toPrecision(3)} keV</b> against a ${(VB / kT).toFixed(0)}× higher hill. They fuse near <b>${(E0 * 1e3).toPrecision(3)} keV</b> (${(E0 / kT).toFixed(1)} kT), and each such try tunnels once in <b>${P0 > 1e-3 ? Math.round(1 / P0) : `10${sup(Math.round(-Math.log10(P0)))}`}</b>.`;
}

/* ---------- the loop ---------- */
let last = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
  if (S.playing) { S.vt += dt * 1000; const i = stageOf(), u0 = S.v - i;
    if (u0 < 0.9999) S.v = Math.min(i + 0.9999, S.v + (dt * S.speed) / S.pace);
    else if (S.carry && i < NS - 1) { S.v = i + 1; populate(atLife(L, S.v).Y); S.log = []; showLog(); knobs(); if (!$("pbar").hidden) barrier(true); }
    if (S.vt > S.nextEvent) { const s = atLife(L, S.v); stageEvent(fluxes(s.Y, L[stageOf()].k)); S.nextEvent = S.vt + 1400 / Math.sqrt(S.speed); }
    if (now - lastRead > 250) { lastRead = now; const { s } = refresh(); reconcile(s.Y); }
    step(dt); }
  drawGas(); requestAnimationFrame(frame);
}
$("src").textContent = SOURCE;
wire(); populate(atLife(L, S.v).Y); knobs(); refresh(); barrier(true); showLog(); requestAnimationFrame(frame);
