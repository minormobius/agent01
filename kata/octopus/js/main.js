/* OCTOPUS — the page. Eight of TENTACLE's arms on a head (./octo.js, no DOM), drawn by TENTACLE's renderer
   (../../tentacle/js/render.js: the arms end to end in its float texture, 8 × 65 nodes, and the head, mantle and eyes
   as body 2). In 4D the arms root at a cube's corners round the mouth and your slice cuts them. */
import { makeOcto, stepOcto, octoSkin, OPRESETS, OCTO, NA, PER, SWEEP } from "./octo.js";
import { makeRenderer } from "../../tentacle/js/render.js";
const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * (b[i] || 0)), dot = (a, b) => a.reduce((s, v, i) => s + v * (b[i] || 0), 0), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const pad4 = (v) => [v[0] || 0, v[1] || 0, v[2] || 0, v[3] || 0];
const R3 = makeRenderer(glc), SKIN = octoSkin();

/* ------------------------------------------------------------------ state */
const sel = { d: 3, preset: "sprawl", t: 0, paused: false };
let octo = null, bodyF = [0, 0, 0, 0], meanF = [0, 0, 0, 0], strokeLog = [], full = false;
const perf = { phys: 0, frame: 1 / 60, since: 0 };

/* ------------------------------------------------------------------ the slice (4D) and the camera */
const frame = { E: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], N: [0, 0, 0, 1], off: 0 };
function twistSlice(dir3, ang) {
  const u = unit([0, 1, 2, 3].map((k) => dir3[0] * frame.E[0][k] + dir3[1] * frame.E[1][k] + dir3[2] * frame.E[2][k])), N = frame.N, c = Math.cos(ang) - 1, s = Math.sin(ang);
  const rot = (x) => { const a = dot(x, u), b = dot(x, N); return x.map((v, k) => v + c * (a * u[k] + b * N[k]) + s * (a * N[k] - b * u[k])); };
  frame.E = frame.E.map(rot); frame.N = rot(N);
  const B = [...frame.E, frame.N]; for (let i = 0; i < 4; i++) { for (let j = 0; j < i; j++) B[i] = add(B[i], B[j], -dot(B[i], B[j])); B[i] = unit(B[i]); } frame.E = B.slice(0, 3); frame.N = B[3];
}
const squareUp = () => Object.assign(frame, { E: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], N: [0, 0, 0, 1], off: 0 });
const O4 = () => frame.N.map((v) => v * frame.off);
const view = { az: 0.6, el: 0.32, dist: 6.4, target: [0, -0.5, 0] };
function camera() { const { az, el, dist } = view, off = [-dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), -dist * Math.cos(el) * Math.cos(az)], eye = add(view.target, off), F = unit(off.map((x) => -x)), R = unit([F[2], 0, -F[0]]); return { eye, F, R, U: cross(F, R) }; }

/* ------------------------------------------------------------------ captions */
const CAPS = {
  sprawl: (d) => d === 3 ? `<b>Eight arms</b>, rooted in a ring round the mouth, 45° apart, every one TENTACLE's arm with its mass, its water and its suckers, all in one solve: they press on one another and on the head, and can't pass through. Calibrate here, then press <b>4D</b>.` : `<b>The hyperoctopus.</b> In 4D the mouth is ringed by a 2-sphere, not a circle, and the eight most evenly spread points on a 2-sphere are a <b>cube's corners</b>: its arms root there, 70.5° apart, each with three nearest neighbours. The cube is turned so four arms lie in your slice (a rectangle round the mouth) and two stand off ana and two kata: move the lever and those come in while these go.`,
  writhe: (d) => `<b>Writhe</b>: each arm writhing, out of step with the next. ${d === 4 ? "In 4D they weave through w, so your slice catches pieces of them, appearing and vanishing as they cross it." : "They collide and slide over one another."}`,
  sweep: (d) => `<b>Sweep</b>: the stroke. All ${NA} arms close fast (a quarter of a ${SWEEP} s cycle) and open slowly. The water's drag goes as speed squared, so the fast close pushes harder than the slow open pulls back: over a whole stroke the body is <b>pushed</b>, and the readout averages it.${d === 4 ? " In 4D the cube of arms closes like a fist from every side at once." : ""}`,
  flare: (d) => `<b>Flare</b>: the arms curl back over the head and mantle, suckers turned out, the way an octopus makes itself big. The head and mantle are solid to them: they drape over it.${d === 4 ? " In 4D they close over the head from eight directions, a cage of arms round a 3-sphere." : ""}`,
  grab: (d) => `<b>Grab</b>: the arms coil in under the mouth, suckers inward, as if round something held there.`,
  reach: (d) => `<b>Reach</b>: one arm unrolls outward (a bend travelling from root to tip) while the other seven hold.`,
};
function caption() { $("cap").innerHTML = CAPS[sel.preset](sel.d); }
$("cap").onclick = () => $("cap").classList.toggle("min");
function sync() {
  for (const b of document.querySelectorAll("#exps button[data-d]")) b.classList.toggle("on", +b.dataset.d === sel.d);
  for (const b of document.querySelectorAll("#exps button[data-x]")) b.classList.toggle("on", b.dataset.x === sel.preset);
  for (const id of ["twist", "ana", "squareB"]) $(id).style.display = sel.d === 4 ? "" : "none";
  caption(); history.replaceState(null, "", `?d=${sel.d}&p=${sel.preset}`);
}
function setD(d) { sel.d = d; squareUp(); octo = makeOcto(d, sel.preset); strokeLog = []; full = false; sync(); }
function setPreset(p) { sel.preset = p; sel.t = 0; strokeLog = []; full = false; if (!octo) octo = makeOcto(sel.d, p); sync(); }
for (const b of document.querySelectorAll("#exps button[data-d]")) b.onclick = () => setD(+b.dataset.d);
for (const b of document.querySelectorAll("#exps button[data-x]")) b.onclick = () => setPreset(b.dataset.x);
$("pauseB").onclick = () => { sel.paused = !sel.paused; $("pauseB").classList.toggle("on", sel.paused); };
$("squareB").onclick = squareUp;
$("gearB").onclick = () => { $("panel").hidden = !$("panel").hidden; };

/* ------------------------------------------------------------------ input */
const pads = { tw: [0, 0], an: 0 };
function padDrag(el, onMove, onEnd) {
  let id = null;
  el.addEventListener("pointerdown", (e) => { id = e.pointerId; try { el.setPointerCapture(id); } catch (err) { /* fine */ } el.classList.add("live"); onMove(e); });
  el.addEventListener("pointermove", (e) => { if (e.pointerId === id) onMove(e); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(ev, (e) => { if (e.pointerId !== id) return; id = null; el.classList.remove("live"); onEnd(); });
}
padDrag($("twist"), (e) => { const r = $("twist").getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = -(e.clientY - r.top - r.height / 2) / (r.height / 2), m = Math.hypot(dx, dy), k = m > 1 ? 1 / m : 1; pads.tw = [dx * k, dy * k]; $("twistKnob").style.transform = `translate(${dx * k * r.width / 2}px, ${-dy * k * r.height / 2}px)`; }, () => { pads.tw = [0, 0]; $("twistKnob").style.transform = ""; });
padDrag($("ana"), (e) => { const r = $("ana").getBoundingClientRect(), dy = Math.max(-1, Math.min(1, -(e.clientY - r.top - r.height / 2) / (r.height / 2))); pads.an = dy; $("anaKnob").style.transform = `translateY(${-dy * r.height / 2 * 0.8}px)`; }, () => { pads.an = 0; $("anaKnob").style.transform = ""; });
const keys = new Set();
document.addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); if (k === "z") { squareUp(); return; } if (k === " ") { e.preventDefault(); $("pauseB").onclick(); return; } if ("ijklrf".includes(k) && k.length === 1) keys.add(k); });
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
const drags = new Map();
glc.addEventListener("pointerdown", (e) => { try { glc.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } drags.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
glc.addEventListener("pointermove", (e) => { const g = drags.get(e.pointerId); if (!g) return; view.az -= (e.clientX - g.x) * 0.007; view.el = Math.max(-1.3, Math.min(1.3, view.el + (e.clientY - g.y) * 0.007)); g.x = e.clientX; g.y = e.clientY; });
for (const ev of ["pointerup", "pointercancel"]) glc.addEventListener(ev, (e) => drags.delete(e.pointerId));
glc.addEventListener("wheel", (e) => { view.dist = Math.max(3, Math.min(16, view.dist * Math.exp(e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => e.preventDefault());

/* ------------------------------------------------------------------ the loop */
const TAN = 0.6, Q = new URLSearchParams(location.search), FIXED = +Q.get("dt") ? 1 / +Q.get("dt") : 0;
let last = performance.now(), res = 0;
function physics(dt) {
  const t0 = performance.now(); sel.t += dt; stepOcto(octo, sel.preset, sel.t, dt);
  perf.phys += (performance.now() - t0 - perf.phys) * 0.05;
  const k = 1 - Math.exp(-dt / 0.12); bodyF = pad4(octo.body).map((v, i) => bodyF[i] + (v - bodyF[i]) * k);
  // the mean over exactly the last stroke (a whole cycle: the close and the open together)
  strokeLog.push({ dt, F: pad4(octo.body) }); let span = strokeLog.reduce((a, e) => a + e.dt, 0); while (span - strokeLog[0].dt >= SWEEP) span -= strokeLog.shift().dt;
  meanF = [0, 1, 2, 3].map((c) => strokeLog.reduce((a, e) => a + e.F[c] * e.dt, 0) / span); full = span >= SWEEP - 1e-6;
}
function draw(now) {
  requestAnimationFrame(draw);
  const raw = (now - last) / 1000, dt = FIXED || Math.min(0.1, raw); last = now;
  if (sel.d === 4) { const kv = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0), cam0 = camera(), tx = pads.tw[0] + kv("l", "j"), ty = pads.tw[1] + kv("i", "k"), an = pads.an + kv("r", "f"), r = (40 * Math.PI) / 180;
    if (tx) twistSlice(cam0.R, tx * r * dt); if (ty) twistSlice(cam0.U, ty * r * dt); if (an) frame.off = Math.max(-3, Math.min(3, frame.off + an * 1.2 * dt)); }
  if (!sel.paused) physics(Math.min(dt, 1 / 30));
  // a slow device: after a settling second, cheaper physics first (fewer substeps), then fewer pixels
  perf.frame += (Math.min(0.2, raw) - perf.frame) * 0.05; perf.since += raw;
  if (!FIXED && perf.since > 1.5 && perf.frame > 1 / 40) { perf.since = 0; if (OCTO.sub > 4) OCTO.sub = 4; else if (res > 0.3) res *= 0.85; }
  R3.upload({ d: sel.d, nodes: octo.nodes, arms: NA, per: PER, st: octo.st, skin: SKIN, body: 2 });
  const dpr = Math.min(1.5, devicePixelRatio || 1); if (!res) res = dpr * (matchMedia("(pointer: coarse)").matches ? 0.5 : 0.7);
  const cw = Math.round(glc.clientWidth * res), chh = Math.round(glc.clientHeight * res); if (glc.width !== cw || glc.height !== chh) { glc.width = cw; glc.height = chh; }
  R3.draw(camera(), TAN, sel.d === 4 ? { O: O4(), E: frame.E, N: frame.N } : null);
  overlay();
}
function overlay() {
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight, cam = camera();
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.font = "11px ui-monospace, Menlo, monospace";
  const F = Math.hypot(...bodyF), M = Math.hypot(...meanF);
  const lines = [`${sel.d}D · ${NA} arms × 64 segments, ${NA * PER} nodes, one solve · physics ${perf.phys.toFixed(1)} ms a frame (${OCTO.sub} substeps) · ${(1 / perf.frame).toFixed(0)} fps`,
    `the arms push the body ${F < 20 ? "<20" : F.toFixed(0)} N${F < 20 ? "" : " (the arrow)"}` + (sel.preset === "sweep" ? (full ? ` · over the last stroke: ${M.toFixed(0)} N, ${meanF[1] >= 0 ? "up" : "down"}` : " · (averaging a whole stroke…)") : "")];
  const scr = (x) => { const y = sel.d === 4 ? frame.E.map((E) => dot(add(pad4(x), O4(), -1), E)) : x.slice(0, 3), r = add(y, cam.eye, -1), z = dot(r, cam.F); return z > 0.05 ? [w / 2 + (dot(r, cam.R) / z / TAN) * (h / 2), h / 2 - (dot(r, cam.U) / z / TAN) * (h / 2)] : null; };
  const L = F > 20 ? 0.45 * Math.log10(1 + F / 5) : 0, p0 = scr([0, 0, 0, 0]), p1 = scr(bodyF.map((v) => (v / (F || 1)) * L));
  if (p0 && p1 && L > 0.02) { g.strokeStyle = "#7fd8ff"; g.fillStyle = "#7fd8ff"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.stroke(); const a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]); g.beginPath(); g.moveTo(...p1); g.lineTo(p1[0] - 9 * Math.cos(a - 0.4), p1[1] - 9 * Math.sin(a - 0.4)); g.lineTo(p1[0] - 9 * Math.cos(a + 0.4), p1[1] - 9 * Math.sin(a + 0.4)); g.fill(); }
  if (sel.d === 4) {
    // how many pieces your slice cuts the arms into, and the whole animal projected (w as colour, gold in the slice)
    let pieces = 0; const nodes = octo.nodes;
    for (let a = 0; a < NA; a++) { let inside = false; for (let i = 0; i < PER; i++) { const nd = nodes[a * PER + i], now = Math.abs(dot(add(pad4(nd.x), O4(), -1), frame.N)) < nd.r; if (now && !inside) pieces++; inside = now; } }
    lines.push(`your slice cuts the arms into ${pieces} piece${pieces === 1 ? "" : "s"} · ${frame.off >= 0 ? "+" : ""}${frame.off.toFixed(2)} m ana`);
    const s = Math.min(w, h) * 0.2, cx = w - s * 0.75 - 12, cy = (h > w ? 96 : 64) + s, P = (x) => { const r = [x[0] - view.target[0], x[1] - view.target[1], x[2] - view.target[2]]; return [cx + (dot(r, cam.R) * s) / 3.6, cy - (dot(r, cam.U) * s) / 3.6]; };
    g.fillStyle = "rgba(7,8,12,0.6)"; g.fillRect(cx - s * 0.75, cy - s * 1.0, s * 1.5, s * 1.9); g.fillStyle = "rgba(233,228,218,0.7)"; g.textAlign = "center"; g.fillText("all eight: w as colour", cx, cy + s * 0.84); g.fillText("gold: in your slice", cx, cy - s * 0.88); g.textAlign = "left";
    g.lineWidth = 2; g.lineCap = "round";
    for (let a = 0; a < NA; a++) for (let i = 0; i + 1 < PER; i++) { const A = nodes[a * PER + i], B = nodes[a * PER + i + 1], wv = A.x[3], inS = Math.abs(dot(add(pad4(A.x), O4(), -1), frame.N)) < A.r;
      g.strokeStyle = inS ? "#ffd27a" : `rgba(${wv > 0 ? "56,242,224" : "255,102,184"},${(0.3 + Math.min(0.6, Math.abs(wv) * 1.2)).toFixed(2)})`; g.beginPath(); g.moveTo(...P(A.x)); g.lineTo(...P(B.x)); g.stroke(); }
  }
  const wrapped = lines.flatMap((l) => (g.measureText(l).width < w - 24 ? [l] : l.split(" · ")));
  g.fillStyle = "rgba(233,228,218,0.85)"; wrapped.forEach((l, i) => g.fillText(l, 12, h - 130 - 15 * (wrapped.length - i)));
  const tw = $("twist"), an = $("ana"); tw.style.left = "14px"; tw.style.top = `${h - 118}px`; an.style.left = `${w - 58}px`; an.style.top = `${h - 134}px`;
}

/* ------------------------------------------------------------------ start */
sel.d = +(Q.get("d") || 3); setPreset(OPRESETS[Q.get("p")] ? Q.get("p") : "sprawl"); setD(sel.d);
if (matchMedia("(orientation: portrait)").matches) $("cap").classList.add("min");
requestAnimationFrame(draw);
// (for tests: run the physics on by sec seconds without drawing)
function ff(sec) { for (let i = 0; i < Math.round(sec * 30); i++) physics(1 / 30); }
window.OCTOPUS = { sel, frame, view, setD, setPreset, octo: () => octo, ff, perf, bodyF: () => bodyF, meanF: () => meanF };
