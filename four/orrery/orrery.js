/* The 4D orrery, full screen: drawing and controls only. The system and its motion are atom/js/orrery.js (no DOM,
   selftest 49). The view is a 4D camera, the shared viewer's own maths (atom/js/tile.js: turn, apply, the w colours):
   a 4×4 turn M takes the world into the view's axes, the first three seen and the fourth, w, the one you can't.
     the whole of it: w folded in by perspective, as the shared viewer does, everything coloured by how far into w
     a 3D slice:      only what sits at the centre's w; the rest shown as ghosts, marked how far ana or kata they are
   Following a planet centres the view on it; riding along in w also cuts the slice through it, so it stays in your
   3D world while the star and the other planets pass through. The gauge at the right and the strip below show the
   one coordinate the view hides: each planet's w, ana up, kata down. */
import { eye, turn, apply, wColour } from "../atom/js/tile.js";
import * as O from "../atom/js/orrery.js";
import { planeOf, planeAngles } from "../atom/js/orbits.js";

const $ = (id) => document.getElementById(id), R = 1.15, RING = 96, HIST = 480, SIGMA = 0.05;
const cv = $("cv"), view = $("view"), strip = $("strip");
const st = { sys: null, seed: 1, M: turn(turn(eye(), 1, 2, -1.15), 0, 3, 0.35), zoom: 1, mode: "shadow", drag: "turn", fmode: "none", sel: 1, playing: true, t: 0, frame: 0, hist: [], picks: [] };
const colourT = (T) => (T > 373 ? "#ff9b6a" : T >= 273 ? "#6fe0ff" : "#cfd8ff");
const fmt = (x, d = 0) => x.toFixed(d).replace("-", "−");
const planets = () => st.sys.bodies.map((b, i) => [b, i]).filter(([b]) => b.kind === "planet");

/* ---------------------------------------------------------------- the system */
function make() {
  const n = +$("nP").value, q = $("qRand").checked ? null : +$("qq").value;
  st.sys = O.makeSystem({ seed: st.seed, n, q, moons: $("moons").checked });
  st.dt = O.dtFor(st.sys); st.t = 0; st.frame = 0; st.hist = [];
  const P = planets(); st.inner = Math.min(...P.map(([b]) => b.period)); st.amax = Math.max(...P.map(([b]) => b.a));
  if (!P.some(([, i]) => i === st.sel)) st.sel = P[0][1];
  $("qqo").textContent = st.sys.q.toFixed(2); if ($("qRand").checked) $("qq").value = st.sys.q.toFixed(2);
  history.replaceState(null, "", `#seed=${st.seed}`);
  chips(); table();
}
function chips() {
  $("chips").innerHTML = planets().map(([b, i]) => `<button type="button" class="b chip${i === st.sel ? " on" : ""}" data-p="${i}"><span class="sw" style="background:${colourT(b.T)}"></span>${b.name}</button>`).join("");
  $("chips").querySelectorAll("button").forEach((el) => (el.onclick = () => select(+el.dataset.p)));
}
function select(i) { st.sel = i; chips(); table(); }
function setOn(attr, val) { document.querySelectorAll(`[data-${attr}]`).forEach((el) => el.classList.toggle("on", el.dataset[attr] === val)); }

/* ---------------------------------------------------------------- the view */
/* the centre: the star, or the planet followed */
const centre = () => (st.fmode === "none" ? st.sys.bodies[0].x : st.sys.bodies[st.sel].x);
const scale = () => st.zoom / (st.amax * 1.08);
/* moons are drawn farther out than they are until the zoom shows them at their true distance */
const moonX = () => Math.max(1, 8 / st.zoom);
function viewOf(x) { const c = centre(), k = scale(); return apply(st.M, x.map((v, i) => (v - c[i]) * k)); }
function bodyView(b) { const B = st.sys.bodies; if (b.kind !== "moon") return viewOf(b.x); const h = B[b.host], m = moonX(); return viewOf(b.x.map((v, i) => h.x[i] + m * (v - h.x[i]))); }
function projector(w, h) {
  const S = (Math.min(w, h) * 0.54) / R, cx = w / 2, cy = h / 2;
  const to3 = (q) => { if (st.mode === "slice") return q; const W = Math.min(q[3], 2.7 * R), k = (2.2 * R) / (3 * R - W); return [q[0] * k, q[1] * k, q[2] * k, q[3]]; };
  const to2 = (q) => { const Z = Math.min(q[2], 3.6 * R), k = (3.2 * R) / (4 * R - Z); return [cx + q[0] * k * S, cy - q[1] * k * S, k]; };
  return { S, to3, to2, P: (q) => to2(to3(q)) };
}
/* an orbit as it is now: the ellipse its position and velocity about the star give */
function orbitPoints(b) {
  const s = st.sys.bodies[0], r = b.x.map((x, c) => x - s.x[c]), v = b.v.map((x, c) => x - s.v[c]), mu = 1 + b.mass, Rr = Math.hypot(...r), v2 = v.reduce((t, u) => t + u * u, 0);
  const a = 1 / (2 / Rr - v2 / mu), rv = r.reduce((t, u, c) => t + u * v[c], 0), e = r.map((u, c) => (v2 / mu - 1 / Rr) * u - (rv / mu) * v[c]), en = Math.hypot(...e);
  const [u1, u2] = en > 1e-6 ? (() => { const p = e.map((x) => x / en), q0 = v.map((x, c) => x - v.reduce((t, w, k) => t + w * p[k], 0) * p[c]), qn = Math.hypot(...q0); return [p, q0.map((x) => x / qn)]; })() : planeOf(r, v);
  const bsemi = a * Math.sqrt(Math.max(0, 1 - en * en)), pts = [];
  for (let i = 0; i <= RING; i++) { const E = (2 * Math.PI * i) / RING, x = a * (Math.cos(E) - en), y = bsemi * Math.sin(E); pts.push(s.x.map((c0, k) => c0 + x * u1[k] + y * u2[k])); }
  return pts;
}
function draw() {
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#07080c"; g.fillRect(0, 0, w, h);
  const pr = projector(w - 52, h), B = st.sys.bodies, slice = st.mode === "slice", items = [];
  // orbits
  for (const [b, i] of planets()) {
    const pts = orbitPoints(b).map(viewOf), sel = i === st.sel;
    for (let j = 0; j < RING; j++) {
      const A = pts[j], C = pts[j + 1], Wm = (A[3] + C[3]) / 2;
      if (slice) { const da = A[3], dc = C[3]; if (da * dc < 0) { const t = da / (da - dc), X = A.map((v, k) => v + (C[k] - v) * t), p = pr.P(X); items.push({ z: X[2], f: () => { g.fillStyle = colourT(b.T); g.beginPath(); g.arc(p[0], p[1], 3, 0, 2 * Math.PI); g.fill(); } }); } }
      const a2 = pr.P(A), c2 = pr.P(C), al = slice ? 0.18 : (sel ? 0.95 : 0.55) * (0.45 + 0.55 * Math.min(1, Math.max(0, ((A[2] + C[2]) / 2 + R) / (2 * R))));
      items.push({ z: (A[2] + C[2]) / 2 - 0.02, f: () => { g.strokeStyle = `rgba(${wColour(Wm / R)},${al})`; g.lineWidth = sel ? 2 : 1.2; g.setLineDash(slice ? [3, 4] : []); g.beginPath(); g.moveTo(a2[0], a2[1]); g.lineTo(c2[0], c2[1]); g.stroke(); g.setLineDash([]); } });
    }
  }
  // bodies
  st.picks = [];
  B.forEach((b, i) => {
    const q = bodyView(b), q3 = pr.to3(q), p = pr.to2(q3), r0 = b.kind === "star" ? 0.06 : b.kind === "planet" ? (b.mass >= 1e-3 ? 0.04 : 0.03) : 0.014;
    const col = b.kind === "star" ? "#ffd27a" : b.kind === "planet" ? colourT(b.T) : "#b8b2a8", near = slice ? Math.exp(-((q[3] / SIGMA) ** 2)) : 1;
    const rad = Math.max(1.5, r0 * p[2] * pr.S * (slice ? 1 : (2.2 * R) / (3 * R - Math.min(q[3], 2.7 * R))));
    if (b.kind === "planet") st.picks.push({ i, x: p[0], y: p[1] });
    items.push({ z: q3[2], f: () => {
      if (slice && near < 0.05) { // a ghost: where it is in x, y, z, and how far off in w
        g.strokeStyle = `rgba(${wColour(q[3] / (4 * SIGMA))},0.75)`; g.lineWidth = 1.2; g.setLineDash([2, 3]); g.beginPath(); g.arc(p[0], p[1], Math.max(4, rad), 0, 2 * Math.PI); g.stroke(); g.setLineDash([]);
        if (b.kind !== "moon") { g.fillStyle = "rgba(201,195,184,0.85)"; g.font = "10px ui-monospace, monospace"; g.fillText(`${b.kind === "star" ? "star" : b.name} ${q[3] > 0 ? "ana" : "kata"} ${fmt(Math.abs(q[3] / scale()) * O.UNIT)}`, p[0] + rad + 4, p[1] + 3); }
        return;
      }
      g.globalAlpha = slice ? Math.max(0.35, near) : 1;
      const gr = g.createRadialGradient(p[0] - rad * 0.35, p[1] - rad * 0.35, rad * 0.1, p[0], p[1], rad); gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.3, col); gr.addColorStop(1, "#05060a");
      g.fillStyle = gr; g.beginPath(); g.arc(p[0], p[1], rad, 0, 2 * Math.PI); g.fill();
      if (!slice && b.kind !== "star") { g.strokeStyle = `rgba(${wColour(q[3] / R)},0.95)`; g.lineWidth = 1.5; g.stroke(); }
      if (b.kind === "star") { const halo = g.createRadialGradient(p[0], p[1], rad, p[0], p[1], rad * 4); halo.addColorStop(0, "rgba(255,210,122,0.35)"); halo.addColorStop(1, "rgba(255,210,122,0)"); g.fillStyle = halo; g.beginPath(); g.arc(p[0], p[1], rad * 4, 0, 2 * Math.PI); g.fill(); }
      if (i === st.sel) { g.strokeStyle = "rgba(233,228,218,0.9)"; g.lineWidth = 1; g.beginPath(); g.arc(p[0], p[1], rad + 6, 0, 2 * Math.PI); g.stroke(); }
      if (b.kind === "planet") { g.fillStyle = "rgba(233,228,218,0.9)"; g.font = "11px ui-monospace, monospace"; g.fillText(b.name, p[0] + rad + 4, p[1] - rad - 2); }
      g.globalAlpha = 1;
    } });
  });
  items.sort((a, b) => a.z - b.z).forEach((it) => it.f());
  gauge(g, w, h);
  if (slice) { g.fillStyle = "rgba(154,149,140,0.9)"; g.font = "11px ui-monospace, monospace"; g.fillText(`the slice through ${st.fmode === "none" ? "the star" : B[st.sel].name} · dots: orbits crossing it`, 12, h - 10); }
}
/* the gauge: every planet's w in the view, star-centred, ana up and kata down */
function gauge(g, w, h) {
  const B = st.sys.bodies, s = B[0], k = scale(), x0 = w - 30, top = 40, bot = h - 30, mid = (top + bot) / 2, ws = planets().map(([b, i]) => [b, i, apply(st.M, b.x.map((v, c) => (v - s.x[c]) * k))[3]]);
  const span = Math.max(0.05, ...ws.map(([, , W]) => Math.abs(W))) * 1.15, yOf = (W) => mid - (W / span) * (bot - top) / 2;
  g.strokeStyle = "rgba(122,127,140,0.6)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, top); g.lineTo(x0, bot); g.stroke();
  const grad = g.createLinearGradient(0, top, 0, bot); grad.addColorStop(0, `rgb(${wColour(1)})`); grad.addColorStop(0.5, `rgb(${wColour(0)})`); grad.addColorStop(1, `rgb(${wColour(-1)})`);
  g.fillStyle = grad; g.fillRect(x0 - 1.5, top, 3, bot - top);
  g.fillStyle = "rgba(201,195,184,0.9)"; g.font = "10px ui-monospace, monospace"; g.textAlign = "center"; g.fillText("ana", x0, top - 8); g.fillText("kata", x0, bot + 14); g.fillText("w", x0, mid - (bot - top) / 2 - 22);
  g.fillStyle = "#ffd27a"; g.fillRect(x0 - 7, mid - 1, 14, 2);
  for (const [b, i, W] of ws) { const y = yOf(W), sel = i === st.sel; g.fillStyle = colourT(b.T); g.beginPath(); g.arc(x0, y, sel ? 6 : 4, 0, 2 * Math.PI); g.fill(); if (sel) { g.strokeStyle = "#e9e4da"; g.lineWidth = 1.5; g.stroke(); g.fillStyle = "#e9e4da"; g.textAlign = "right"; g.fillText(b.name, x0 - 10, y + 3); } }
  if (st.mode === "slice") { const Wc = apply(st.M, centre().map((v, c) => (v - s.x[c]) * k))[3], y = yOf(Wc); g.strokeStyle = "rgba(233,228,218,0.8)"; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x0 - 14, y); g.lineTo(x0 + 14, y); g.stroke(); g.setLineDash([]); }
  g.textAlign = "left";
  st.wNow = ws.map(([b, i, W]) => [i, W / k]);
}
function stripChart() {
  const dpr = Math.min(2, devicePixelRatio || 1), w = strip.clientWidth, h = strip.clientHeight; if (!w) return;
  if (strip.width !== Math.round(w * dpr)) { strip.width = Math.round(w * dpr); strip.height = Math.round(h * dpr); }
  const g = strip.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  if (st.hist.length < 2) return;
  const span = Math.max(1e-6, ...st.hist.flatMap((s) => s.map(([, W]) => Math.abs(W)))) * 1.1, y = (W) => h / 2 - (W / span) * (h / 2 - 4);
  g.strokeStyle = "rgba(122,127,140,0.5)"; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  for (const [b, i] of planets()) {
    const sel = i === st.sel; g.strokeStyle = sel ? colourT(b.T) : "rgba(154,149,140,0.35)"; g.lineWidth = sel ? 2 : 1; g.beginPath();
    st.hist.forEach((s, j) => { const e = s.find(([k]) => k === i); if (!e) return; const x = (j / (HIST - 1)) * w; j ? g.lineTo(x, y(e[1])) : g.moveTo(x, y(e[1])); }); g.stroke();
  }
  g.fillStyle = "rgba(201,195,184,0.8)"; g.font = "10px ui-monospace, monospace"; g.fillText("ana", 4, 11); g.fillText("kata", 4, h - 4);
}
function hud() {
  const b = st.sys.bodies[st.sel], wn = (st.wNow || []).find(([i]) => i === st.sel), lost = st.sys.bodies.some((x, i) => i && !O.orbitOf(st.sys.bodies, i).bound);
  const fol = st.fmode === "none" ? "" : st.fmode === "centre" ? ` · following ${b.name}` : ` · riding along with ${b.name} in w`;
  $("hud").innerHTML = `<span class="t">ORRERY⁴</span> · seed ${st.seed}${fol}<br><b>planet ${b.name}</b>: ${fmt(b.a * O.UNIT)} star radii, ${fmt(b.T)} K, a year ${fmt(b.period / st.inner, 2)} of b's, now <b>${wn ? `${fmt(Math.abs(wn[1]) * O.UNIT)} star radii ${wn[1] >= 0 ? "ana" : "kata"}` : ""}</b><br>${fmt(st.t / st.inner, 1)} of b's years${lost ? ", and something has come loose" : ""}${moonX() > 1.01 ? ` · moons drawn ×${fmt(moonX(), 0)} farther out` : ""}`;
}
function table() {
  const B = st.sys.bodies, xy = [[1, 0, 0, 0], [0, 1, 0, 0]], P = planets(), b0 = P[0][0], pl = (b) => planeOf(b.x.map((x, c) => x - B[0].x[c]), b.v.map((x, c) => x - B[0].v[c]));
  const head = `<tr><th>planet</th><th>star radii</th><th>year</th><th>T</th><th>tilt to the nebula</th><th>to b</th><th>e</th>${st.sys.moons ? "<th>moon e</th>" : ""}</tr>`;
  $("sys").innerHTML = head + P.map(([b, i]) => {
    const t0 = planeAngles(xy, pl(b)), tb = planeAngles(pl(b0), pl(b)), m = B.findIndex((x) => x.kind === "moon" && x.host === i);
    return `<tr data-p="${i}" class="${i === st.sel ? "sel" : ""}"><td><span class="sw" style="background:${colourT(b.T)}"></span> ${b.name}</td><td>${fmt(b.a * O.UNIT)}</td><td>${fmt(b.period / st.inner, 2)}</td><td>${fmt(b.T)} K</td><td>${fmt(t0[0])}° / ${fmt(t0[1])}°</td><td>${b === b0 ? "–" : `${fmt(tb[0])}° / ${fmt(tb[1])}°`}</td><td>${fmt(O.orbitOf(B, i).e, 3)}</td>${m >= 0 ? `<td>${fmt(O.orbitOf(B, m).e, 3)}</td>` : st.sys.moons ? "<td>–</td>" : ""}</tr>`;
  }).join("");
  $("sys").querySelectorAll("tr[data-p]").forEach((tr) => (tr.onclick = () => select(+tr.dataset.p)));
}
/* turn the view so the chosen planet's orbit lies a given way: face on (its plane is the screen), edge on (its plane
   holds the depth), or swinging through w (its plane holds w: the planet goes ana and kata as it goes round) */
function orient(how) {
  const B = st.sys.bodies, b = B[st.sel], [u, v] = planeOf(b.x.map((x, c) => x - B[0].x[c]), b.v.map((x, c) => x - B[0].v[c])), basis = [u, v];
  for (let k = 0; k < 4 && basis.length < 4; k++) { let e = [0, 1, 2, 3].map((i) => +(i === k)); for (const q of basis) { const d = e.reduce((s, x, i) => s + x * q[i], 0); e = e.map((x, i) => x - d * q[i]); } const n = Math.hypot(...e); if (n > 1e-6) basis.push(e.map((x) => x / n)); }
  const [e1, e2, e3, e4] = basis, rows = how === "face" ? [e1, e2, e3, e4] : how === "edge" ? [e1, e3, e2, e4] : [e1, e3, e4, e2];
  st.M = rows.flat(); setOn("o", how);
}

/* ---------------------------------------------------------------- input */
const ptrs = new Map(); let dragStart = null, pinch0 = null;
view.addEventListener("pointerdown", (e) => { view.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); dragStart = { x: e.clientX, y: e.clientY, moved: 0 }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: st.zoom }; } view.classList.add("drag"); });
view.addEventListener("pointermove", (e) => {
  if (!ptrs.has(e.pointerId)) return; const [px, py] = ptrs.get(e.pointerId), dx = e.clientX - px, dy = e.clientY - py; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2 && pinch0) { const [a, b] = [...ptrs.values()]; setZoom(pinch0.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / Math.max(1, pinch0.d)); return; }
  if (dragStart) dragStart.moved += Math.abs(dx) + Math.abs(dy);
  const s = 0.008; if (st.drag === "turn") { st.M = turn(st.M, 0, 2, dx * s); st.M = turn(st.M, 1, 2, -dy * s); } else { st.M = turn(st.M, 0, 3, dx * s); st.M = turn(st.M, 1, 3, -dy * s); }
  setOn("o", "");
});
const up = (e) => {
  if (dragStart && dragStart.moved < 6 && ptrs.size === 1) { // a tap: pick the nearest planet
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = st.picks.reduce((b, p) => { const d = Math.hypot(p.x - x, p.y - y); return d < b.d ? { d, i: p.i } : b; }, { d: 28, i: -1 });
    if (best.i >= 0) select(best.i);
  }
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; if (!ptrs.size) { dragStart = null; view.classList.remove("drag"); }
};
view.addEventListener("pointerup", up); view.addEventListener("pointercancel", up);
view.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(st.zoom * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
function setZoom(z) { st.zoom = Math.min(50, Math.max(0.6, z)); $("zm").value = Math.log10(st.zoom).toFixed(2); $("zmo").textContent = (st.zoom < 10 ? st.zoom.toFixed(1) : st.zoom.toFixed(0)) + "×"; }

document.querySelectorAll("[data-f]").forEach((el) => (el.onclick = () => { st.fmode = el.dataset.f; setOn("f", st.fmode); if (st.fmode !== "none" && st.zoom < 3) setZoom(4); if (st.fmode === "none") setZoom(1); if (st.fmode === "ride") { st.mode = "slice"; setOn("v", "slice"); } }));
document.querySelectorAll("[data-o]").forEach((el) => (el.onclick = () => orient(el.dataset.o)));
document.querySelectorAll("[data-v]").forEach((el) => (el.onclick = () => { st.mode = el.dataset.v; setOn("v", st.mode); if (st.mode === "shadow" && st.fmode === "ride") { st.fmode = "centre"; setOn("f", "centre"); } }));
document.querySelectorAll("[data-d]").forEach((el) => (el.onclick = () => { st.drag = el.dataset.d; setOn("d", st.drag); }));
$("play").onclick = () => { st.playing = !st.playing; $("play").textContent = st.playing ? "pause" : "play"; };
$("spd").oninput = () => { const x = 10 ** +$("spd").value; $("spdo").textContent = (x < 10 ? x.toFixed(1) : x.toFixed(0)) + "×"; };
$("zm").oninput = () => setZoom(10 ** +$("zm").value);
$("newSys").onclick = () => { st.seed = 1 + Math.floor(Math.random() * 1e6); make(); };
$("nP").oninput = () => { $("nPo").textContent = $("nP").value; make(); };
$("moons").onchange = make;
$("qq").oninput = () => { $("qRand").checked = false; $("qqo").textContent = (+$("qq").value).toFixed(2); make(); };
$("qRand").onchange = make;

/* ---------------------------------------------------------------- run */
{ const m = /seed=(\d+)/.exec(location.hash); st.seed = m ? +m[1] : 1 + Math.floor(Math.random() * 1e6); }
setOn("f", "none"); setOn("v", "shadow"); setOn("d", "turn");
make();
function frame() {
  if (st.playing) {
    const per = Math.min(4000, Math.max(1, Math.round((st.inner * 10 ** +$("spd").value) / (240 * st.dt))));
    for (let s = 0; s < per; s++) O.step(st.sys.bodies, st.dt);
    st.t += per * st.dt;
  }
  st.frame++;
  draw();
  if (st.playing && st.frame % 2 === 0 && st.wNow) { st.hist.push(st.wNow.slice()); if (st.hist.length > HIST) st.hist.shift(); }
  if (st.frame % 2 === 0) stripChart();
  if (st.frame % 6 === 0) hud();
  if (st.frame % 30 === 0) table();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
