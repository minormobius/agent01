/* The 4D orrery: drawing only. The system and its motion are atom/js/orrery.js (no DOM, selftest 49); the viewer is
   atom/js/tile.js, the shared 4D view (turn it, or slice it through w). */
import { makeTile, eye, turn } from "../atom/js/tile.js";
import * as O from "../atom/js/orrery.js";
import { planeOf, planeAngles } from "../atom/js/orbits.js";

const $ = (id) => document.getElementById(id), MZ = 8, RING = 72;
const st = { sys: null, k: 1, frame: 0, t: 0, seed: 1 };
const scene = { balls: [], P: [], lines: [] };
const colourT = (T) => (T > 373 ? "#ff9b6a" : T >= 273 ? "#6fe0ff" : "#cfd8ff");
const fmt = (x, d = 0) => x.toFixed(d).replace("-", "−");

function seedFromHash() { const m = /seed=(\d+)/.exec(location.hash); return m ? +m[1] : 1 + Math.floor(Math.random() * 1e6); }
function make() {
  const n = +$("nP").value, q = $("qRand").checked ? null : +$("qq").value;
  st.sys = O.makeSystem({ seed: st.seed, n, q, moons: $("moons").checked });
  st.dt = O.dtFor(st.sys); st.t = 0; st.frame = 0; st.emax = st.sys.bodies.map(() => 0);
  const P = st.sys.bodies.filter((b) => b.kind === "planet"); st.inner = Math.min(...P.map((p) => p.period));
  st.k = 1 / (Math.max(...P.map((p) => p.a)) * 1.08);
  $("qqo").textContent = st.sys.q.toFixed(2); if ($("qRand").checked) $("qq").value = st.sys.q.toFixed(2);
  $("mcos").textContent = st.sys.minus.toFixed(2);
  history.replaceState(null, "", `#seed=${st.seed}`);
  // the scene, rebuilt in place (the tile keeps drawing the same object)
  scene.balls.length = 0; scene.P.length = 0; scene.lines.length = 0;
  st.sys.bodies.forEach((b) => scene.balls.push({ p: [0, 0, 0, 0], c: b.kind === "star" ? "#ffd27a" : b.kind === "planet" ? colourT(b.T) : "#b8b2a8", r: b.kind === "star" ? 0.06 : b.kind === "planet" ? (b.mass >= 1e-3 ? 0.04 : 0.03) : 0.013 }));
  P.forEach((_, j) => { const o = j * RING; for (let i = 0; i < RING; i++) { scene.P.push([0, 0, 0, 0]); scene.lines.push([o + i, o + ((i + 1) % RING)]); } });
  place(); rings(); table(); sphere();
}
/* where each body is drawn: planets as they are, moons' distances from their planets ×MZ */
function place() {
  const B = st.sys.bodies;
  B.forEach((b, i) => { const p = b.kind === "moon" ? b.x.map((x, c) => B[b.host].x[c] + MZ * (x - B[b.host].x[c])) : b.x; for (let c = 0; c < 4; c++) scene.balls[i].p[c] = p[c] * st.k; });
}
/* each planet's orbit as it is now: the circle-ish ellipse its position and velocity give, drawn in its plane */
function rings() {
  const B = st.sys.bodies; let j = 0;
  B.forEach((b) => {
    if (b.kind !== "planet") return;
    const r = b.x.map((x, c) => x - B[0].x[c]), w = b.v.map((v, c) => v - B[0].v[c]), R = Math.hypot(...r), w2 = w.reduce((s, u) => s + u * u, 0), a = 1 / (2 / R - w2 / (1 + b.mass)), [u, v] = planeOf(r, w);
    for (let i = 0; i < RING; i++) { const th = (2 * Math.PI * i) / RING, p = scene.P[j * RING + i]; for (let c = 0; c < 4; c++) p[c] = (B[0].x[c] + a * (Math.cos(th) * u[c] + Math.sin(th) * v[c])) * st.k; }
    b.plane = [u, v]; j++;
  });
}
function table() {
  const B = st.sys.bodies, P = B.filter((b) => b.kind === "planet"), xy = [[1, 0, 0, 0], [0, 1, 0, 0]];
  const head = `<tr><th>planet</th><th>mass</th><th>distance</th><th>period</th><th>temperature</th><th>tilt to the nebula</th><th>to b</th><th>e</th>${st.sys.moons ? "<th>its moon's e</th>" : ""}</tr>`;
  const rows = P.map((p) => {
    const i = B.indexOf(p), pl = p.plane || [p.u, p.v0], t0 = planeAngles(xy, pl), tb = planeAngles(P[0].plane || [P[0].u, P[0].v0], pl), e = O.orbitOf(B, i).e, m = B.findIndex((x) => x.kind === "moon" && x.host === i);
    return `<tr><td><span class="sw" style="background:${colourT(p.T)}"></span>${p.name}</td><td>${p.mass >= 1e-3 ? "Jupiter's" : "⅒ Jupiter's"}</td><td>${fmt(p.a * O.UNIT)}</td><td>${fmt(p.period / st.inner, 2)}</td><td>${fmt(p.T)} K</td><td>${fmt(t0[0])}° / ${fmt(t0[1])}°</td><td>${p === P[0] ? "–" : `${fmt(tb[0])}° / ${fmt(tb[1])}°`}</td><td>${fmt(e, 3)}</td>${m >= 0 ? `<td>${fmt(O.orbitOf(B, m).e, 3)}</td>` : st.sys.moons ? "<td>–</td>" : ""}</tr>`;
  });
  $("sys").innerHTML = head + rows.join("");
  const lost = B.some((b, i) => i && !O.orbitOf(B, i).bound);
  $("clock").innerHTML = `<b>${fmt(st.t / st.inner, 1)}</b> of the innermost planet's years run${lost ? ", and something has come loose" : ", every orbit still bound"}. q = ${st.sys.q.toFixed(2)}, seed ${st.seed}${st.sys.attempt ? ` (drawn ${st.sys.attempt + 1} times to find one that holds)` : ""}.`;
}
/* the sphere of right halves, seen from the nebula's own (✦, toward you), the far side faint */
function sphere() {
  const cv = $("sphere"), dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth || 240; cv.width = cv.height = Math.round(w * dpr);
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, w);
  const c = w / 2, R = w * 0.42, xy = (v) => [c + R * v[1], c - R * v[2]];
  g.strokeStyle = "#3a3f4d"; g.lineWidth = 1; g.beginPath(); g.arc(c, c, R, 0, 2 * Math.PI); g.stroke();
  const m = st.sys.minus, rr = R * Math.sqrt(Math.max(0, 1 - m * m)); g.setLineDash([3, 4]); g.strokeStyle = "#7a7f8c"; g.beginPath(); if (m >= 0) g.arc(c, c, rr, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]);
  g.fillStyle = "#ffd27a"; g.font = "14px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("✦", c, c);
  st.sys.bodies.filter((b) => b.kind === "planet").forEach((p) => {
    const v = p.right, [x, y] = xy(v), front = v[0] >= 0; g.beginPath(); g.arc(x, y, 5, 0, 2 * Math.PI);
    if (front) { g.fillStyle = colourT(p.T); g.fill(); } else { g.strokeStyle = colourT(p.T); g.stroke(); }
    g.fillStyle = "#e9e4da"; g.font = "11px ui-monospace, monospace"; g.fillText(p.name, x + 10, y - 8);
  });
}

st.seed = seedFromHash();
makeTile($("orrTile"), scene, {
  title: "the system, live", sub: "orbits coloured by how far into w they reach; slice to see one 3D cross-section", tab: "orrery",
  R: 1.15, spin: [[0, 2, 0.0008], [1, 3, 0.0005]], start: turn(turn(eye(), 1, 2, -1.15), 0, 3, 0.35),
  step: () => {
    if (!st.sys) return;
    const per = Math.min(4000, Math.max(1, Math.round((st.inner * 10 ** +$("spd").value) / (240 * st.dt))));
    for (let s = 0; s < per; s++) O.step(st.sys.bodies, st.dt);
    st.t += per * st.dt; st.frame++; place();
    if (st.frame % 20 === 0) rings();
    if (st.frame % 15 === 0) table();
  },
});
$("newSys").onclick = () => { st.seed = 1 + Math.floor(Math.random() * 1e6); make(); };
$("nP").oninput = () => { $("nPo").textContent = $("nP").value; make(); };
$("moons").onchange = make;
$("qq").oninput = () => { $("qRand").checked = false; $("qqo").textContent = (+$("qq").value).toFixed(2); make(); };
$("qRand").onchange = make;
$("spd").oninput = () => { const x = 10 ** +$("spd").value; $("spdo").textContent = (x < 10 ? x.toFixed(1) : x.toFixed(0)) + "×"; };
addEventListener("resize", sphere);
make();
