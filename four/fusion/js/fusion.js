/* How stars burn: the page. The network (net.js, REACLIB's rates) runs every stage up front; the cartoon then walks
   through each stage at a steady pace in the fuel burned, showing reactions sampled in proportion to their real rates at
   that moment, so the kinds and the order of what happens are the star's. What the cartoon makes up is where things are
   (nuclei don't move like this, and a real core is ~10⁵⁰ nuclei, not ~70) and how often a reaction is shown: each one
   stands for a number of real ones, which the page states. */
import { STAGES, run, toX, NUC, IDX, RX, fluxes, energy, SOURCE } from "./net.js";

const $ = (id) => document.getElementById(id);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹", sup = (n) => String(n).split("").map((c) => SUP[+c]).join("");
const label = (k) => { const n = NUC[IDX[k]]; return k === "p" ? "p" : k === "d" ? "d" : `${sup(n.A)}${n.sym.split("-")[0]}`; };
const YR = 3.15576e7;
const sci = (v, d = 1) => { if (v < 1e4 && v >= 0.1) return String(+v.toPrecision(d + 1)); const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${m.toFixed(d)} × 10${e < 0 ? "⁻" : ""}${sup(Math.abs(e))}`; };
export function human(t) {
  const f = (v) => String(+v.toPrecision(2)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (t < 1e-3) return `${f(t * 1e6)} µs`; if (t < 1) return `${f(t * 1e3)} ms`; if (t < 120) return `${f(t)} s`;
  if (t < 7200) return `${f(t / 60)} min`; if (t < 2 * 86400) return `${f(t / 3600)} h`; if (t < 2 * YR) return `${f(t / 86400)} days`;
  if (t < 2e3 * YR) return `${f(t / YR)} yr`; if (t < 2e6 * YR) return `${f(t / YR / 1e3)} thousand yr`; if (t < 2e9 * YR) return `${f(t / YR / 1e6)} million yr`;
  return `${f(t / YR / 1e9)} billion yr`;
}

/* ---------- the stages, run once ---------- */
const RUNS = {}; for (const st of STAGES) {
  const X0 = st.from ? Object.fromEntries(toX(RUNS[st.from].Y).map((x, i) => [NUC[i].k, x]).filter(([, x]) => x > 1e-12)) : st.X0;
  const R = (RUNS[st.key] = { ...run({ ...st, X0 }), st, X0 }), fi = IDX[st.fuel]; R.t90 = R.snaps.find((x) => x.Y[fi] < 0.1 * R.snaps[0].Y[fi])?.t ?? R.t;
}
/* along a run, the state when a share u (0..1) of what will burn has burned */
function at(R, u) {
  const fi = IDX[R.st.fuel], s = R.snaps, y0 = s[0].Y[fi], y1 = s.at(-1).Y[fi], want = y0 - u * (y0 - y1);
  let i = 1; while (i < s.length - 1 && s[i].Y[fi] > want) i++;
  const a = s[i - 1], b = s[i], f = a.Y[fi] === b.Y[fi] ? 1 : Math.min(1, Math.max(0, (a.Y[fi] - want) / (a.Y[fi] - b.Y[fi])));
  return { t: a.t + f * (b.t - a.t), Y: a.Y.map((v, j) => v + f * (b.Y[j] - v)) };
}

/* ---------- what a reaction is, in words ---------- */
const NOTE = {
  "p+p>d|w": "Two protons touch, and for once the weak force turns one into a neutron while they do: a deuteron, a positron and a neutrino. Each proton in the Sun waits billions of years for this; it is why the Sun lasts.",
  "p+p>d|ec": "The same with an electron caught in the act (pep): no positron, one neutrino.",
  "p+d>he3": "The deuteron grabs a proton within about a second of being made: helium-3.",
  "he3+he3>p+p+he4": "Two helium-3s make helium-4 and hand two protons back. That ends the main chain, pp-I.",
  "he3+he4>be7": "Or a helium-3 meets a helium-4 first: beryllium-7, the start of the side chains pp-II and pp-III.",
  "be7>li7|ec": "Beryllium-7 swallows an electron: lithium-7 and a neutrino.",
  "p+li7>he4+he4": "Lithium-7 catches a proton and splits into two helium-4s (pp-II).",
  "p+be7>b8": "Rarely a proton reaches beryllium-7 before an electron does: boron-8 (pp-III).",
  "b8>he4+he4|w": "Boron-8 decays and falls apart into two helium-4s. Its energetic neutrinos are the ones solar-neutrino detectors first caught.",
  "p+c12>n13": "Carbon-12 catches a proton: nitrogen-13. The CNO cycle begins; the carbon is only borrowed.",
  "n13>c13|w": "Nitrogen-13 turns a proton into a neutron (half-life 10 minutes): carbon-13.",
  "p+c13>n14": "Carbon-13 catches a proton: nitrogen-14.",
  "p+n14>o15": "Nitrogen-14 catches a proton: oxygen-15. The cycle's slowest step, so its catalysts pile up as nitrogen-14.",
  "o15>n15|w": "Oxygen-15 turns a proton into a neutron (2 minutes): nitrogen-15.",
  "p+n15>he4+c12": "Nitrogen-15 catches a proton and splits: a helium-4 out, and the carbon-12 back. Four protons have become one helium-4.",
  "p+n15>o16": "Once in a thousand times nitrogen-15 keeps the proton instead: oxygen-16, the second CNO loop.",
  "p+o17>he4+n14": "Oxygen-17 plus a proton: helium-4 and nitrogen-14, closing the second loop.",
  "he4+he4+he4>c12": "Three helium-4s make carbon-12. Two meet as beryllium-8, which falls apart within 10⁻¹⁶ s; very rarely a third arrives in time, through a resonance in carbon-12, the Hoyle state.",
  "he4+c12>o16": "Carbon-12 catches a helium-4: oxygen-16. How much carbon survives helium burning hangs on this rate, still one of the least certain in astrophysics.",
  "he4+o16>ne20": "Oxygen-16 catches a helium-4: neon-20.",
  "he4+n14>f18": "The nitrogen left over from hydrogen burning catches a helium-4: fluorine-18, which decays to oxygen-18 and goes on to neon-22.",
  "c12+c12>he4+ne20": "Two carbon-12s fuse into an excited magnesium-24, which throws out a helium-4: neon-20.",
  "c12+c12>p+na23": "Two carbon-12s fuse and throw out a proton: sodium-23.",
  "ne20>he4+o16": "A gamma ray knocks a helium-4 out of neon-20, leaving oxygen-16. In neon burning light starts breaking nuclei.",
  "he4+ne20>mg24": "Neon-20 catches the freed helium-4: magnesium-24.",
  "o16+o16>he4+si28": "Two oxygen-16s fuse into an excited sulfur-32, which throws out a helium-4: silicon-28.",
  "o16+o16>p+p31": "Two oxygen-16s fuse and throw out a proton: phosphorus-31.",
  "he4+ni56>": "",
};
const keyOf = (r) => `${r.r.join("+")}>${r.p.join("+")}${r.ec ? "|ec" : r.weak ? "|w" : ""}`;
function kind(r) {
  if (r.ec) return "ec"; if (r.weak) return "beta"; if (r.r.length === 1) return "photo"; if (r.p.length === 1) return "capture"; return "swap";
}
function words(r) {
  const n = NOTE[keyOf(r)] ?? NOTE[keyOf(r).replace(/\|.*/, "")]; if (n) return n;
  const big = (xs) => xs.slice().sort((a, b) => NUC[IDX[b]].A - NUC[IDX[a]].A), name = (k) => NUC[IDX[k]].name;
  switch (kind(r)) {
    case "photo": { const [heavy, light] = [big(r.p)[0], big(r.p)[1]]; return `Light knocks a ${light === "p" ? "proton" : name(light)} out of ${name(r.r[0])}, leaving ${name(heavy)}.`; }
    case "capture": { const [a, b] = big(r.r); return `${name(a)} catches a ${b === "p" ? "proton" : name(b)}: ${name(r.p[0])}, and a gamma ray carries the energy off.`; }
    case "beta": return `${name(r.r[0])} turns a proton into a neutron: ${name(r.p[0])}, a positron and a neutrino.`;
    case "ec": return `${name(r.r[0])} swallows an electron: ${name(r.p[0])} and a neutrino.`;
    default: { const [a, b] = big(r.r), [c, d] = big(r.p); return `${name(a)} meets a ${b === "p" ? "proton" : name(b)}: ${name(c)} and a ${d === "p" ? "proton" : name(d)}.`; }
  }
}
const eqn = (r) => `${r.r.map(label).join(" + ")}${r.ec ? " + e⁻" : ""} → ${r.p.map(label).join(" + ")}${kind(r) === "beta" ? " + e⁺ + ν" : kind(r) === "ec" ? " + ν" : kind(r) === "capture" ? " + γ" : ""}`;

/* ---------- the cartoon nuclei ---------- */
const PC = "#ff6f61", NCOL = "#8fb3ff";
const SHAPES = {}; function shape(k) {
  if (SHAPES[k]) return SHAPES[k]; const n = NUC[IDX[k]], pts = []; let seed = n.A * 7919 + n.Z * 104729;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n.A; i++) { const r = 0.62 * Math.sqrt(i + (n.A > 1 ? 0.5 : 0)), a = i * 2.39996; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
  const isP = Array.from({ length: n.A }, (_, i) => i < n.Z); for (let i = n.A - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [isP[i], isP[j]] = [isP[j], isP[i]]; }
  return (SHAPES[k] = { pts, isP, R: 0.62 * Math.sqrt(n.A) + 0.5 });
}
function drawNucleus(x, k, px, py, s, alpha = 1) {
  const sh = shape(k); x.globalAlpha = alpha;
  for (let i = sh.pts.length - 1; i >= 0; i--) { const [u, v] = sh.pts[i]; x.fillStyle = sh.isP[i] ? PC : NCOL; x.beginPath(); x.arc(px + u * s, py + v * s, s * 0.52, 0, 7); x.fill();
    x.strokeStyle = "rgba(0,0,0,0.35)"; x.lineWidth = 0.6; x.stroke(); }
  x.globalAlpha = 1;
}

/* ---------- the gas window ---------- */
const NSHOW = 64;
const S = { stage: "pp", u: 0, playing: true, speed: 1, parts: [], fx: [], log: [], last: 0, nextEvent: 0, done: false };
function targets(Y) {
  const tot = Y.reduce((a, b) => a + b, 0), out = {};
  for (let i = 0; i < Y.length; i++) { const f = Y[i] / tot, c = f * NSHOW; out[NUC[i].k] = c >= 0.5 ? Math.round(c) : f > 2e-6 ? 1 : 0; }
  return out;
}
let W = 600, H = 360;
function spawn(k, edge = false) {
  const n = NUC[IDX[k]], sp = 26 / Math.sqrt(n.A), a = Math.random() * 7, p = { k, vx: sp * Math.cos(a), vy: sp * Math.sin(a), born: performance.now() };
  if (edge) { const e = Math.floor(Math.random() * 4); p.x = e === 0 ? -10 : e === 1 ? W + 10 : Math.random() * W; p.y = e === 2 ? -10 : e === 3 ? H + 10 : Math.random() * H; p.vx = (W / 2 - p.x) * 0.05; p.vy = (H / 2 - p.y) * 0.05; p.entering = true; }
  else { p.x = 20 + Math.random() * (W - 40); p.y = 20 + Math.random() * (H - 40); }
  S.parts.push(p); return p;
}
function populate(Y) { S.parts = []; for (const [k, c] of Object.entries(targets(Y))) for (let i = 0; i < c; i++) spawn(k); }
function reconcile(Y) {
  const tg = targets(Y), have = {}; for (const p of S.parts) if (!p.busy && !p.leaving) have[p.k] = (have[p.k] ?? 0) + 1;
  for (const k of new Set([...Object.keys(tg), ...Object.keys(have)])) { const d = (have[k] ?? 0) - (tg[k] ?? 0);
    if (d > 1 || (d > 0 && !tg[k])) { const p = S.parts.find((q) => q.k === k && !q.busy && !q.leaving); if (p) { p.leaving = true; const a = Math.atan2(p.y - H / 2, p.x - W / 2); p.vx = 90 * Math.cos(a); p.vy = 90 * Math.sin(a); } }
    else if (d < -1 || (d < 0 && (have[k] ?? 0) === 0)) spawn(k, true); }
}
/* one reaction, sampled by its rate now: pick reactants on screen (or bring them in from the rest of the core) */
function stageEvent(R, st, fl, Ynow) {
  const tot = fl.reduce((a, b) => a + b, 0); if (!(tot > 0)) return; let u = Math.random() * tot, ri = 0; for (; ri < fl.length; ri++) { u -= fl[ri]; if (u <= 0) break; }
  const r = RX[Math.min(ri, RX.length - 1)], used = [];
  for (const k of r.r) { let p = S.parts.find((q) => q.k === k && !q.busy && !q.leaving && !used.includes(q)); if (!p) p = spawn(k, true); used.push(p); }
  const cx = used.reduce((s, p) => s + p.x, 0) / used.length, cy = used.reduce((s, p) => s + p.y, 0) / used.length, mx = Math.min(W - 40, Math.max(40, cx)), my = Math.min(H - 40, Math.max(40, cy));
  for (const p of used) { p.busy = true; p.tx = mx; p.ty = my; }
  const ev = { r, used, x: mx, y: my, t0: performance.now(), dur: 1100 / S.speed ** 0.5, kind: kind(r) }; S.fx.push(ev);
  S.log.unshift({ r, t: Ynow.t }); S.log.length = Math.min(S.log.length, 6); showLog(st);
}
function finishEvent(ev) {
  S.parts = S.parts.filter((p) => !ev.used.includes(p));
  for (const k of ev.r.p) { const p = spawn(k); p.x = ev.x + (Math.random() - 0.5) * 18; p.y = ev.y + (Math.random() - 0.5) * 18; const a = Math.random() * 7, sp = 60 / Math.sqrt(NUC[IDX[k]].A); p.vx = sp * Math.cos(a); p.vy = sp * Math.sin(a); p.fresh = performance.now(); }
  const out = []; if (ev.kind === "capture") out.push("γ"); if (ev.kind === "beta") out.push("e⁺", "ν"); if (ev.kind === "ec") out.push("ν");
  for (const o of out) { const a = Math.random() * 7; S.fx.push({ ray: o, x: ev.x, y: ev.y, a, t0: performance.now(), dur: 900 }); }
}
function step(dt, now) {
  for (const p of S.parts) {
    if (p.busy) { p.x += (p.tx - p.x) * Math.min(1, dt * 6); p.y += (p.ty - p.y) * Math.min(1, dt * 6); continue; }
    p.x += p.vx * dt * S.speed ** 0.3; p.y += p.vy * dt * S.speed ** 0.3;
    if (p.entering && p.x > 20 && p.x < W - 20 && p.y > 20 && p.y < H - 20) { p.entering = false; const a = Math.random() * 7, sp = 26 / Math.sqrt(NUC[IDX[p.k]].A); p.vx = sp * Math.cos(a); p.vy = sp * Math.sin(a); }
    if (!p.entering && !p.leaving) { if (p.x < 8 || p.x > W - 8) p.vx *= -1; if (p.y < 8 || p.y > H - 8) p.vy *= -1; p.x = Math.min(W - 8, Math.max(8, p.x)); p.y = Math.min(H - 8, Math.max(8, p.y)); }
  }
  S.parts = S.parts.filter((p) => !p.leaving || (p.x > -40 && p.x < W + 40 && p.y > -40 && p.y < H + 40));
  // soft repulsion between nuclei, the Coulomb barrier in cartoon (the closer, the harder they're turned away)
  for (let i = 0; i < S.parts.length; i++) for (let j = i + 1; j < S.parts.length; j++) { const a = S.parts[i], b = S.parts[j]; if (a.busy || b.busy) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, za = NUC[IDX[a.k]].Z, zb = NUC[IDX[b.k]].Z; if (d2 > 2500 || d2 < 1) continue;
    const f = (90 * za * zb) / d2 * dt, d = Math.sqrt(d2), ma = NUC[IDX[a.k]].A, mb = NUC[IDX[b.k]].A; a.vx -= (f * dx) / d / ma; a.vy -= (f * dy) / d / ma; b.vx += (f * dx) / d / mb; b.vy += (f * dy) / d / mb; }
  for (const ev of S.fx) if (ev.r && !ev.done && now - ev.t0 > ev.dur * 0.55) { ev.done = true; finishEvent(ev); }
  S.fx = S.fx.filter((e) => now - e.t0 < e.dur);
}
function drawGas(now) {
  const c = $("gas"), r = devicePixelRatio || 1; W = c.clientWidth; H = c.clientHeight; if (c.width !== W * r) { c.width = W * r; c.height = H * r; }
  const x = c.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.fillStyle = "#0b0d13"; x.fillRect(0, 0, W, H);
  const T = RUNS[S.stage].st.T, glow = Math.min(1, Math.log10(T / 1e7) / 2.6); x.fillStyle = `rgba(255,${150 - 80 * glow},${60},${0.05 + 0.06 * glow})`; x.fillRect(0, 0, W, H);
  const nA = S.parts.reduce((a, p) => a + NUC[IDX[p.k]].A, 0) / Math.max(1, S.parts.length), sc = Math.max(2.4, Math.min(5, W / 140) * Math.min(1, (12 / nA) ** 0.35));
  for (const p of S.parts) drawNucleus(x, p.k, p.x, p.y, sc, p.leaving ? 0.5 : 1);
  for (const ev of S.fx) { const f = (now - ev.t0) / ev.dur;
    if (ev.r) { if (ev.kind === "photo" && f < 0.55) { const L = 120 * (1 - f / 0.55), a = 0.6; wave(x, ev.x - L * Math.cos(a), ev.y - L * Math.sin(a), ev.x, ev.y, "#fff3a8"); }
      if (f > 0.45 && f < 0.85) { const g = (f - 0.45) / 0.4; x.strokeStyle = `rgba(255,255,255,${1 - g})`; x.lineWidth = 3; x.beginPath(); x.arc(ev.x, ev.y, 8 + 40 * g, 0, 7); x.stroke(); }
      x.font = `600 12px ${css("--mono")}`; x.textAlign = "center"; x.fillStyle = `rgba(233,228,218,${Math.min(1, 3 * (1 - f))})`; x.fillText(eqn(ev.r), Math.min(W - 120, Math.max(120, ev.x)), Math.max(16, ev.y - 30)); }
    else { const L = 30 + 260 * f, ex = ev.x + L * Math.cos(ev.a), ey = ev.y + L * Math.sin(ev.a);
      if (ev.ray === "γ") wave(x, ev.x + 0.4 * L * Math.cos(ev.a), ev.y + 0.4 * L * Math.sin(ev.a), ex, ey, "#fff3a8");
      else if (ev.ray === "ν") { x.setLineDash([3, 5]); x.strokeStyle = "rgba(200,200,255,0.6)"; x.lineWidth = 1; x.beginPath(); x.moveTo(ev.x, ev.y); x.lineTo(ev.x + 2.5 * L * Math.cos(ev.a), ev.y + 2.5 * L * Math.sin(ev.a)); x.stroke(); x.setLineDash([]); x.fillStyle = "rgba(200,200,255,0.8)"; x.font = `11px ${css("--mono")}`; x.fillText("ν", ev.x + 2.5 * L * Math.cos(ev.a), ev.y + 2.5 * L * Math.sin(ev.a)); }
      else { x.fillStyle = "#ffe08a"; x.beginPath(); x.arc(ex, ey, 2.5, 0, 7); x.fill(); x.font = `11px ${css("--mono")}`; x.fillText("e⁺", ex + 6, ey - 4); } } }
}
function wave(x, x0, y0, x1, y1, col) { const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L; x.strokeStyle = col; x.lineWidth = 1.5; x.beginPath();
  for (let s = 0; s <= L; s += 2) { const w = 4 * Math.sin(s / 3); x.lineTo(x0 + (dx * s) / L + nx * w, y0 + (dy * s) / L + ny * w); } x.stroke(); }

/* ---------- the readouts ---------- */
function showLog(st) {
  $("log").innerHTML = S.log.map((e, i) => `<div class="ev${i ? "" : " new"}"><b>${eqn(e.r)}</b><span>${words(e.r)}</span></div>`).join("");
}
function bars(Y) {
  const X = toX(Y), rows = X.map((v, i) => [NUC[i], v]).filter(([, v]) => v > 0.002).sort((a, b) => b[1] - a[1]).slice(0, 9);
  $("comp").innerHTML = rows.map(([n, v]) => `<div class="cb"><span>${label(n.k)}</span><i style="width:${(100 * v).toFixed(1)}%"></i><em>${v >= 0.01 ? (100 * v).toFixed(0) : (100 * v).toFixed(1)}%</em></div>`).join("");
}
/* the chart of the nuclides: every nucleus at (neutrons, protons), shaded by how much there is, and the strongest net
   flows between them as arrows */
function chart(Y, fl) {
  const c = $("chart"), r = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (c.width !== w * r) { c.width = w * r; c.height = h * r; }
  const x = c.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h);
  const st = RUNS[S.stage].st, heavy = ["si", "o"].includes(st.key), ne = heavy ? 30 : st.key === "ne" || st.key === "c" ? 16 : 11, ze = heavy ? 29 : st.key === "ne" || st.key === "c" ? 15 : 10;
  const cs = Math.min((w - 34) / (ne + 1), (h - 26) / (ze + 1)), X0 = 26, Y0 = h - 18, P = (n, z) => [X0 + (n + 0.5) * cs, Y0 - (z + 0.5) * cs];
  x.font = `10px ${css("--mono")}`; x.fillStyle = css("--dim"); x.textAlign = "center"; x.fillText("neutrons →", X0 + (ne * cs) / 2, h - 3); x.save(); x.translate(10, Y0 - (ze * cs) / 2); x.rotate(-Math.PI / 2); x.fillText("protons →", 0, 0); x.restore();
  for (let i = 0; i < NUC.length; i++) { const n = NUC[i], N = n.A - n.Z; if (N > ne || n.Z > ze) continue; const [px, py] = P(N, n.Z), X = Y[i] * n.A, a = X > 0 ? Math.max(0, Math.min(1, (Math.log10(X) + 8) / 8)) : 0;
    x.fillStyle = `rgba(111,224,255,${0.06 + 0.8 * a})`; x.strokeStyle = css("--border"); x.fillRect(px - cs / 2 + 1, py - cs / 2 + 1, cs - 2, cs - 2); x.strokeRect(px - cs / 2 + 1, py - cs / 2 + 1, cs - 2, cs - 2);
    if (cs > 11) { x.fillStyle = a > 0.6 ? "#07080c" : css("--text"); x.font = `${Math.min(10, cs / 2.6)}px ${css("--mono")}`; x.fillText(label(n.k), px, py + 3); } }
  // net flows heaviest reactant → heaviest product
  const net = new Map(); RX.forEach((r, i) => { if (!fl[i]) return; const hv = (xs) => xs.slice().sort((a, b) => NUC[IDX[b]].A - NUC[IDX[a]].A || NUC[IDX[b]].Z - NUC[IDX[a]].Z)[0], a = hv(r.r), b = hv(r.p); if (a === b) return; const key = a < b ? `${a}|${b}` : `${b}|${a}`, sgn = a < b ? 1 : -1; net.set(key, (net.get(key) ?? 0) + sgn * fl[i]); });
  const arr = [...net.entries()].map(([k, v]) => { const [a, b] = k.split("|"); return v >= 0 ? [a, b, v] : [b, a, -v]; }).sort((p, q) => q[2] - p[2]).slice(0, 14), top = arr[0]?.[2] ?? 1;
  for (const [a, b, v] of arr) { const na = NUC[IDX[a]], nb = NUC[IDX[b]]; if (na.A - na.Z > ne || nb.A - nb.Z > ne || na.Z > ze || nb.Z > ze) continue; const [x1, y1] = P(na.A - na.Z, na.Z), [x2, y2] = P(nb.A - nb.Z, nb.Z), wd = 1 + 4 * Math.max(0, 1 + Math.log10(v / top) / 6);
    x.strokeStyle = "rgba(255,180,107,0.85)"; x.fillStyle = "rgba(255,180,107,0.85)"; x.lineWidth = wd; const ang = Math.atan2(y2 - y1, x2 - x1), ex = x2 - Math.cos(ang) * cs * 0.35, ey = y2 - Math.sin(ang) * cs * 0.35;
    x.beginPath(); x.moveTo(x1 + Math.cos(ang) * cs * 0.3, y1 + Math.sin(ang) * cs * 0.3); x.lineTo(ex, ey); x.stroke(); x.beginPath(); x.moveTo(ex + Math.cos(ang) * 6, ey + Math.sin(ang) * 6); x.lineTo(ex + Math.cos(ang + 2.4) * 7, ey + Math.sin(ang + 2.4) * 7); x.lineTo(ex + Math.cos(ang - 2.4) * 7, ey + Math.sin(ang - 2.4) * 7); x.fill(); }
}

/* ---------- the loop ---------- */
const STAGE_SECONDS = 70; // wall seconds a stage takes at speed 1
function setStage(k) {
  S.stage = k; S.u = 0; S.done = false; S.log = []; S.fx = []; const R = RUNS[k];
  for (const b of document.querySelectorAll("#stages button")) b.classList.toggle("on", b.dataset.k === k);
  $("blurb").textContent = R.st.blurb; $("cond").innerHTML = `<b>${R.st.T >= 1e9 ? `${(R.st.T / 1e9).toFixed(1)} billion` : `${(R.st.T / 1e6).toFixed(R.st.T < 1e8 ? 1 : 0)} million`} K</b>, <b>${sci(R.st.rho)} g/cm³</b> (water is 1) · held there, nine-tenths of its ${R.st.fuel === "p" ? "hydrogen" : NUC[IDX[R.st.fuel]].name} burns in <b>${human(R.t90)}</b>`;
  populate(at(R, 0).Y); showLog(); $("next").hidden = true; drawGas(performance.now()); readouts();
}
function readouts() {
  const R = RUNS[S.stage], s = at(R, S.u), fl = fluxes(s.Y, R.k), eps = energy(fl), fuel = NUC[IDX[R.st.fuel]];
  // real reactions in a window of NSHOW nuclei per wall second (the run's local clock rate) over those shown per second
  const tot = fl.reduce((a, b) => a + b, 0), nuclei = s.Y.reduce((a, b) => a + b, 0), du = 0.01, dtdu = (at(R, Math.min(1, S.u + du)).t - at(R, Math.max(0, S.u - du)).t) / (Math.min(1, S.u + du) - Math.max(0, S.u - du));
  const perShown = (tot * (NSHOW / nuclei) * dtdu * (S.speed / STAGE_SECONDS)) / (Math.sqrt(S.speed) / 1.4);
  $("clock").innerHTML = `<b>${human(s.t)}</b> into the stage · ${fuel.k === "p" ? "hydrogen" : fuel.name} left <b>${(100 * s.Y[IDX[fuel.k]] * fuel.A / R.X0[fuel.k]).toFixed(0)}%</b> · <b>${sci(eps)}</b> erg per gram per second`;
  $("scale").textContent = perShown > 1.5 ? `The clock skips: each reaction shown stands for about ${perShown > 1e3 ? `10${sup(Math.round(Math.log10(perShown)))}` : Math.round(perShown)} that really happen among ${NSHOW} nuclei in the same time.` : `About as many reactions as really happen among ${NSHOW} nuclei.`;
  bars(s.Y); chart(s.Y, fl); return { s, fl };
}
let lastRead = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now; const R = RUNS[S.stage];
  if (S.playing && !S.done) { S.u = Math.min(1, S.u + (dt * S.speed) / STAGE_SECONDS); if (S.u >= 1) { S.done = true; $("next").hidden = !STAGES.find((x) => x.from === S.stage); }
    if (now > S.nextEvent) { const s = at(R, S.u); stageEvent(R, R.st, fluxes(s.Y, R.k), s); S.nextEvent = now + 1400 / Math.sqrt(S.speed); }
    if (now - lastRead > 250) { lastRead = now; const { s } = readouts(); reconcile(s.Y); } }
  step(dt, now); drawGas(now); requestAnimationFrame(frame);
}

/* ---------- the barrier, one encounter ---------- */
const PAIRS = [["p", "p"], ["p", "c12"], ["p", "n14"], ["he4", "he4"], ["he4", "c12"], ["c12", "c12"], ["o16", "o16"]];
function barrier() {
  const [a, b] = PAIRS[+$("pair").value], na = NUC[IDX[a]], nb = NUC[IDX[b]], T = 10 ** +$("temp").value, kT = 8.617333e-11 * T; // MeV
  const mu = (na.A * nb.A) / (na.A + nb.A) * 931.494, Z = na.Z * nb.Z, R0 = 1.2 * (Math.cbrt(na.A) + Math.cbrt(nb.A)), VB = (1.44 * Z) / R0, EG = 2 * mu * (Math.PI * Z / 137.036) ** 2;
  const E0 = Math.cbrt((EG * kT * kT) / 4), P0 = Math.exp(-Math.sqrt(EG / E0));
  $("tval").textContent = T >= 1e9 ? `${(T / 1e9).toFixed(2)} billion K` : `${(T / 1e6).toPrecision(3)} million K`;
  // the potential
  { const c = $("pot"), r = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (c.width !== w * r) { c.width = w * r; c.height = h * r; } const x = c.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h);
    const rmax = Math.max(4 * R0, 3 * (1.44 * Z) / VB), Xp = (rr) => 36 + ((w - 46) * rr) / rmax, Ymax = VB * 1.15, Yp = (e) => h - 22 - ((h - 34) * e) / Ymax;
    x.strokeStyle = css("--border"); x.beginPath(); x.moveTo(36, Yp(0)); x.lineTo(w - 10, Yp(0)); x.stroke();
    x.fillStyle = "rgba(111,224,255,0.12)"; x.fillRect(Xp(0), Yp(0), Xp(R0) - Xp(0), h - 22 - Yp(0) + 0);
    x.strokeStyle = css("--d4"); x.lineWidth = 2; x.beginPath(); x.moveTo(Xp(0), h - 22); x.lineTo(Xp(0), h - 18); x.moveTo(Xp(R0), h - 18); x.lineTo(Xp(R0), Yp(VB)); for (let rr = R0; rr <= rmax; rr += rmax / 300) x.lineTo(Xp(rr), Yp((1.44 * Z) / rr)); x.stroke();
    const Eshow = Math.max(E0, VB * 0.015), rt = (1.44 * Z) / Eshow; x.strokeStyle = css("--d3"); x.setLineDash([4, 4]); x.lineWidth = 1; x.beginPath(); x.moveTo(Xp(0), Yp(Eshow)); x.lineTo(w - 10, Yp(Eshow)); x.stroke(); x.setLineDash([]);
    x.fillStyle = "rgba(255,180,107,0.25)"; x.fillRect(Xp(R0), Yp(Eshow) - 3, Xp(Math.min(rt, rmax)) - Xp(R0), 6);
    x.font = `11px ${css("--mono")}`; x.fillStyle = css("--dim"); x.textAlign = "left"; x.fillText(`barrier ${VB.toFixed(2)} MeV at ${R0.toFixed(1)} fm`, Xp(R0) + 6, Yp(VB) + 4);
    x.fillStyle = css("--d3"); x.fillText(`their energy ${(E0 * 1e3).toPrecision(3)} keV: tunnel ${R0.toFixed(1)}–${rt.toPrecision(3)} fm`, Xp(R0) + 6, Yp(Eshow) - 6);
    x.fillStyle = css("--dim"); x.textAlign = "right"; x.fillText("distance →", w - 10, h - 6); x.textAlign = "center"; x.fillText("nucleus", Xp(R0 / 2), h - 6); }
  // the Gamow window
  { const c = $("gamow"), r = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (c.width !== w * r) { c.width = w * r; c.height = h * r; } const x = c.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h);
    const Emax = Math.max(3 * E0, 8 * kT), n = 300, Xp = (e) => 10 + ((w - 20) * e) / Emax, mb = (e) => (e / kT) * Math.exp(-e / kT), tn = (e) => Math.exp(-Math.sqrt(EG / e)), pr = (e) => mb(e) * tn(e);
    let pm = 0; for (let i = 1; i <= n; i++) pm = Math.max(pm, pr((Emax * i) / n));
    const plot = (f, s, col, fill) => { x.beginPath(); x.moveTo(Xp(0), h - 18); for (let i = 1; i <= n; i++) { const e = (Emax * i) / n; x.lineTo(Xp(e), h - 18 - (h - 34) * Math.min(1, f(e) / s)); } if (fill) { x.lineTo(Xp(Emax), h - 18); x.fillStyle = col; x.fill(); } else { x.strokeStyle = col; x.lineWidth = 1.5; x.stroke(); } };
    plot(mb, Math.exp(-1), "rgba(233,228,218,0.6)"); plot(tn, tn(Emax), css("--d4")); plot(pr, pm, "rgba(255,180,107,0.55)", true);
    x.font = `11px ${css("--mono")}`; x.textAlign = "left"; x.fillStyle = "rgba(233,228,218,0.8)"; x.fillText("how many have energy E", Xp(kT) + 8, 14); x.fillStyle = css("--d4"); x.textAlign = "right"; x.fillText("chance to tunnel at E (rescaled)", w - 10, 26);
    x.fillStyle = "#07080c"; x.textAlign = "center"; x.font = `600 11px ${css("--mono")}`; x.fillText("fusion happens here", Xp(E0), h - 18 - (h - 34) * 0.35); x.fillStyle = css("--dim"); x.fillText("energy →", w / 2, h - 4); }
  $("bnums").innerHTML = `kT <b>${(kT * 1e3).toPrecision(3)} keV</b> against a barrier of <b>${(VB * 1e3).toFixed(0)} keV</b> (${(VB / kT).toFixed(0)}× higher). They fuse near <b>${(E0 * 1e3).toPrecision(3)} keV</b>, ${(E0 / kT).toFixed(1)} kT, where few have that much energy and each of those tunnels once in <b>${P0 > 1e-3 ? Math.round(1 / P0) : `10${sup(Math.round(-Math.log10(P0)))}`}</b> tries.`;
}

/* ---------- wiring ---------- */
$("stages").innerHTML = STAGES.map((s, i) => `<button data-k="${s.key}">${i + 1} · ${s.title}</button>`).join("");
for (const b of document.querySelectorAll("#stages button")) b.addEventListener("click", () => setStage(b.dataset.k));
$("play").addEventListener("click", () => { S.playing = !S.playing; $("play").textContent = S.playing ? "pause" : "play"; });
$("speed").addEventListener("input", () => { S.speed = 2 ** +$("speed").value; $("sval").textContent = `×${S.speed}`; });
$("next").addEventListener("click", () => { const n = STAGES.find((x) => x.from === S.stage); if (n) setStage(n.key); });
$("restart").addEventListener("click", () => setStage(S.stage));
$("pair").innerHTML = PAIRS.map(([a, b], i) => `<option value="${i}">${label(a)} + ${label(b)}</option>`).join("");
for (const id of ["pair", "temp"]) $(id).addEventListener("input", barrier);
$("src").textContent = SOURCE;
addEventListener("resize", () => { barrier(); readouts(); });
setStage("pp"); barrier(); requestAnimationFrame(frame);
