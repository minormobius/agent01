/* TENTACLE — the page. The arm is ./rod.js (no DOM): each frame its muscles (a preset, in time) give its strains, and
   the strains its shape: nodes with positions, frames and radii, written into a float texture the shader reads. The
   shader sphere-traces the hypertube (a chain of round cones, in d dimensions) in your 3D slice: in 3D the whole arm,
   in 4D the slice of it, which is where it comes apart into pieces. The skin shows the muscle: rings for the
   segmentation, glow where the longitudinal fibres contract, stripes that spiral as it twists, and (4D) the bald lines
   where a twist muscle can't reach. */
import { build, strainsOf, PRESETS, SEG, LEN, R0, RTIP, pieces } from "./rod.js";
import { makeArm, stepArm, tipSpeed } from "./arm.js";
import { makeRenderer } from "./render.js";
import { KNOT, newKnot as makeKnot, stepKnot as knotStep, transportFrames, span } from "./dyn.js";
const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* ------------------------------------------------------------------ GL (./render.js, shared with OCTOPUS) */
const R3 = makeRenderer(glc);
/* ------------------------------------------------------------------ state */
const sel = { d: 3, preset: "writhe", t: 0, paused: false, phys: true };
const pad4 = (v) => [...v, 0, 0, 0, 0].slice(0, 4);
/* the skin's sucker coordinate u (arm length in units of its resting radius, so suckers come closer as it narrows) */
function skinOf(rr, ds) { const u = [0]; for (let i = 1; i < rr.length; i++) u.push(u[i - 1] + ds[i - 1] / ((rr[i] + rr[i - 1]) / 2)); return u; }
const ARMSKIN = (() => { const rr = Array.from({ length: SEG + 1 }, (_, i) => R0 + (RTIP - R0) * (i / SEG)); return { rr, u: skinOf(rr, new Array(SEG).fill(LEN / SEG)) }; })();
function upload(nodes, st, skin, body) {
  R3.upload({ d: sel.d, nodes, st: st ? nodes.map((_, i) => st[Math.min(i, SEG - 1)]) : null, skin, body: body ? 1 : 0, suckers: sel.suckers !== false });
}
/* the arm with mass (arm.js), remade when the dimension changes; presets carry on from wherever it is */
let arm = null, knot = null, bodyF = [0, 0, 0, 0];
function newKnot() {
  const k = makeKnot(sel.d), rr = new Array(KNOT.N).fill(KNOT.r);
  knot = Object.assign(k, { skin: { rr, u: skinOf(rr, k.rod.L) }, F0: sel.d === 3 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]] });
}
const stepKnot = (dt) => knotStep(knot, dt);
/* where the knot is: the node with the most rope near it that isn't its own neighbour (the strands crowd there); the
   camera eases toward it, or toward the middle once it's gone */
function knotCore() {
  const x = knot.rod.x, N = x.length, R = 4 * KNOT.r; let best = -1, bi = N >> 1;
  for (let i = 0; i < N; i += 2) { let n = 0; for (let j = 0; j < N; j++) if (Math.abs(i - j) > 8 && Math.hypot(...add(x[i], x[j], -1)) < R) n++; if (n > best) { best = n; bi = i; } }
  return best > 2 ? x[bi] : x[N >> 1];
}
function knotNodes() { const r = knot.rod, F = transportFrames(r.x, knot.F0); return r.x.map((x, i) => ({ x, F: F[i], r: r.r[i], s: i / (r.N - 1) })); }

/* ------------------------------------------------------------------ the slice (4D) and the camera */
const frame = { E: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], N: [0, 0, 0, 1], off: 0 };
function twistSlice(dir3, ang) { // tip the slice's direction dir3 (its own coordinates) toward N
  const u = unit([0, 1, 2, 3].map((k) => dir3[0] * frame.E[0][k] + dir3[1] * frame.E[1][k] + dir3[2] * frame.E[2][k])), N = frame.N, c = Math.cos(ang) - 1, s = Math.sin(ang);
  const rot = (x) => { const a = dot(x, u), b = dot(x, N); return x.map((v, k) => v + c * (a * u[k] + b * N[k]) + s * (a * N[k] - b * u[k])); };
  frame.E = frame.E.map(rot); frame.N = rot(N);
  const B = [...frame.E, frame.N]; for (let i = 0; i < 4; i++) { for (let j = 0; j < i; j++) B[i] = add(B[i], B[j], -dot(B[i], B[j])); B[i] = unit(B[i]); } frame.E = B.slice(0, 3); frame.N = B[3];
}
const squareUp = () => Object.assign(frame, { E: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], N: [0, 0, 0, 1], off: 0 });
const O4 = () => frame.N.map((v) => v * frame.off);
const view = { az: 0.7, el: 0.2, dist: 4.6, target: [0, 1.0, 0] };
function camera() { const { az, el, dist } = view, off = [-dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), -dist * Math.cos(el) * Math.cos(az)], eye = add(view.target, off), F = unit(off.map((x) => -x)), R = unit([F[2], 0, -F[0]]); return { eye, F, R, U: cross(F, R) }; }

/* ------------------------------------------------------------------ captions */
const CAPS = {
  rest: (d) => `At rest. A tentacle has no bones: it's a <b>muscular hydrostat</b>, muscle round fluid that won't compress, so its volume is fixed. Each segment can bend, twist and stretch: <b>${d === 3 ? "4" : "7"} ways</b> (${d === 3 ? "2 bends, 1 twist, 1 stretch" : "3 bends, 3 twists, 1 stretch"}). The suckers run down its underside${d === 3 ? " in two staggered rows" : ": in 4D the skin is a 2-sphere, so they spiral round a whole cap of it, and your slice cuts each cup into a smaller cup, or misses it"}.`,
  reach: (d) => `<b>Reach</b>, as an octopus does: the arm starts curled and a bend <b>travels from base to tip</b>, unrolling it. The glow is the longitudinal muscle contracting on the inside of the curl.`,
  writhe: (d) => d === 3 ? `<b>Writhe</b>: waves of contraction run down the arm, the side that's contracting turning as they go. Calibrate your eye here; then press <b>4D</b>.` : `<b>Writhe</b>, in 4D: the waves' side turns through w as well. It's <b>one smooth arm</b>, but your slice cuts it where it crosses: a ball where it passes through, a tube where it runs alongside, nothing where it's gone. So you see <b>pieces</b> that swell, merge, split and vanish. Move the lever and twist your slice to follow it.`,
  coil: (d) => d === 3 ? `<b>Coil</b>: a steady bend and a steady twist make a helix. Watch the stripes spiral with the twist.` : `<b>Coil</b> in 4D: bend and twist, and a second twist in another plane that comes and goes, so the helix winds into w. The blue lines are a twist muscle's <b>bald lines</b>.`,
  twist: (d) => d === 3 ? `<b>Twist</b>: the helical muscles alone, the arm straight. The stripes spiral. Its twisting fibres can cover the whole ring of skin.` : `<b>Twist</b> in 4D: the skin round the arm is a 2-sphere, and a twisting fibre field on a sphere must have bald spots (the <b>hairy ball theorem</b>): the blue lines down the arm are where this twist muscle (turning the skin in the x–w plane) can't reach: its two poles, along z. A 4D arm has three twist muscles, one for each plane across, and each has its own pair of bald lines; a twist in the x–z plane would hide them along w, where your slice doesn't look.`,
  strike: (d) => `<b>Strike</b>: the transverse muscles squeeze the arm thin, and at constant volume thinner means longer: it <b>shoots out</b> (in ${d}D the cross-section is a ${d - 1}-ball, so r^${d - 1} × length stays fixed), then curls back.`,
  whip: (d) => sel.phys ? `<b>Whip</b>: only the base moves (one side hard, then back) and the rest of the arm is left <b>slack</b>, low tone. Momentum carries the bend out along it, and as it reaches the thin end it moves faster: the tip outruns anything the muscles did. A hydrostat chooses how stiff to be, part by part.` : `<b>Whip</b> without physics: just the base bending. Turn <b>physics</b> on to see what the slack arm does with it.`,
  limp: (d) => sel.phys ? `<b>Limp</b>: no muscle and no tone. The arm is 5% denser than water, so what's left of gravity takes it, and the water slows its fall. All its stiffness was its muscles.` : `<b>Limp</b> needs physics: without it, the arm just holds the shape no muscle asks for. Turn <b>physics</b> on.`,
  knot: (d) => d === 3 ? `<b>The knot</b>: an overhand knot in a length of arm, its ends pulled apart. It tightens and <b>jams</b>: the strands press on one another and there's no way past. Knots hold in 3D because a curve can't pass through a curve. Now press <b>4D</b>.` : `<b>The knot, in 4D</b>: the same knot, the same pull, and it <b>slips out</b>. Where two strands press, there's a fourth direction to give way along: one slides past the other through w, and the rope pulls straight. Knots need two more dimensions than the thing tied: a string in 3D, a <b>sheet</b> in 4D. A 4D horror that wants to hold you needs webbing. Watch the slice: a strand <b>vanishes</b> where it passes.`,
  ana: (d) => d === 3 ? `<b>Curl</b>: one side contracting, coming and going.` : `<b>Into w</b>: the fibres on the arm's w side contract, so it curls into w, out of your slice. Your slice keeps only the part near its base.`,
};
function caption() { $("cap").innerHTML = CAPS[sel.preset](sel.d); }
$("cap").onclick = () => $("cap").classList.toggle("min");
const isKnot = () => sel.preset === "knot";
function sync() {
  for (const b of document.querySelectorAll("#exps button[data-d]")) b.classList.toggle("on", +b.dataset.d === sel.d);
  for (const b of document.querySelectorAll("#exps button[data-x]")) b.classList.toggle("on", b.dataset.x === sel.preset);
  $("physB").classList.toggle("on", sel.phys || isKnot()); $("anaB").textContent = sel.d === 4 ? "into w" : "curl";
  for (const id of ["twist", "ana", "squareB"]) $(id).style.display = sel.d === 4 ? "" : "none";
  for (const id of ["pullB", "retieB"]) $(id).style.display = isKnot() ? "" : "none";
  $("pullB").classList.toggle("on", !!(knot && knot.pulling)); caption(); history.replaceState(null, "", `?d=${sel.d}&p=${sel.preset}${sel.phys ? "" : "&phys=0"}`);
}
function setD(d) { sel.d = d; squareUp(); arm = makeArm(d, sel.preset === "knot" ? "rest" : sel.preset); if (isKnot()) newKnot(); bodyF = [0, 0, 0, 0]; sync(); }
function setPreset(p) {
  const wasKnot = isKnot(); sel.preset = p; sel.t = 0;
  if (p === "knot") { newKnot(); Object.assign(view, { target: [0, 0, 0], dist: 4.6, el: 0.35 }); }
  else if (wasKnot || !arm) { arm = makeArm(sel.d, p); Object.assign(view, { target: [0, 1.0, 0], dist: 4.6, el: 0.2 }); }
  sync();
}
for (const b of document.querySelectorAll("#exps button[data-d]")) b.onclick = () => setD(+b.dataset.d);
for (const b of document.querySelectorAll("#exps button[data-x]")) b.onclick = () => setPreset(b.dataset.x);
$("physB").onclick = () => { if (isKnot()) return; sel.phys = !sel.phys; if (sel.phys) arm = makeArm(sel.d, sel.preset); sync(); };
$("pullB").onclick = () => { knot.pulling = !knot.pulling; if (knot.pulling) knot.t = KNOT.wait; sync(); };
$("retieB").onclick = () => { newKnot(); sync(); };
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
glc.addEventListener("wheel", (e) => { view.dist = Math.max(2.5, Math.min(14, view.dist * Math.exp(e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => e.preventDefault());

/* ------------------------------------------------------------------ the loop */
const TAN = 0.6, FIXED = +new URLSearchParams(location.search).get("dt") ? 1 / +new URLSearchParams(location.search).get("dt") : 0;
let last = performance.now(), res = 0, cur = null;
function draw(now) {
  requestAnimationFrame(draw);
  const dt = FIXED || Math.min(0.1, (now - last) / 1000); last = now;
  if (!sel.paused) sel.t += dt;
  // the slice (4D): pad and lever, keys
  if (sel.d === 4) { const kv = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0), cam0 = camera(), tx = pads.tw[0] + kv("l", "j"), ty = pads.tw[1] + kv("i", "k"), an = pads.an + kv("r", "f"), r = (40 * Math.PI) / 180;
    if (tx) twistSlice(cam0.R, tx * r * dt); if (ty) twistSlice(cam0.U, ty * r * dt); if (an) frame.off = Math.max(-3, Math.min(3, frame.off + an * 1.2 * dt)); }
  // the arm: with physics, where the water lets it get (arm.js); without, the shape its muscles ask for, at once
  let nodes, st;
  if (isKnot()) { if (!sel.paused) stepKnot(Math.min(dt, 1 / 30)); nodes = knotNodes(); st = null;
    const c = knotCore(), k = 1 - Math.exp(-dt / 0.6); view.target = view.target.map((v, i) => v + (c[i] - v) * k); }
  else if (sel.phys) { if (!sel.paused || !arm.nodes) stepArm(arm, sel.preset, sel.t, Math.min(dt, 1 / 30)); nodes = arm.nodes; st = arm.st;
    const k = 1 - Math.exp(-Math.min(dt, 1 / 30) / 0.12); if (!sel.paused) bodyF = pad4(arm.rod.body).map((v, i) => bodyF[i] + (v - bodyF[i]) * k); }
  else { st = strainsOf(sel.d, PRESETS[sel.preset](sel.d, sel.t)); nodes = build(sel.d, st); }
  cur = { st, nodes };
  upload(nodes, st, isKnot() ? knot.skin : ARMSKIN, !isKnot());
  const dpr = Math.min(1.5, devicePixelRatio || 1); if (!res) res = dpr * (matchMedia("(pointer: coarse)").matches ? 0.55 : 0.75);
  const cw = Math.round(glc.clientWidth * res), chh = Math.round(glc.clientHeight * res); if (glc.width !== cw || glc.height !== chh) { glc.width = cw; glc.height = chh; }
  R3.draw(camera(), TAN, sel.d === 4 ? { O: O4(), E: frame.E, N: frame.N } : null);
  overlay(nodes);
}
function overlay(nodes) {
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.font = "11px ui-monospace, Menlo, monospace";
  const len = nodes.slice(1).reduce((s, n, i) => s + Math.hypot(...add(n.x, nodes[i].x, -1)), 0), cam = camera();
  const lines = isKnot() ? [`${sel.d}D · a knot in ${knot.total.toFixed(2)} m of arm, ${(2 * KNOT.r * 100).toFixed(0)} cm thick · ${knot.pulling ? "pulling" : "slack"}`] : [`${sel.d}D · ${sel.d === 3 ? "4" : "7"} strains a segment · ${SEG} segments · ${len.toFixed(2)} m long${sel.phys ? "" : " · no physics"}`];
  // screen place of a point (4D: in your slice's own coordinates)
  const scr = (x) => { const y = sel.d === 4 ? frame.E.map((E) => dot(add(pad4(x), O4(), -1), E)) : x.slice(0, 3), r = add(y, cam.eye, -1), z = dot(r, cam.F); return z > 0.05 ? [w / 2 + (dot(r, cam.R) / z / TAN) * (h / 2), h / 2 - (dot(r, cam.U) / z / TAN) * (h / 2)] : null; };
  if (isKnot()) {
    const sp = span(knot.rod), held = knot.t > KNOT.wait + KNOT.ramp + 2;
    lines.push(`its ends ${(sp * knot.total).toFixed(2)} m apart: ${(sp * 100).toFixed(0)}% of its length · strands no closer than ${knot.gap.toFixed(2)} × their thickness`);
    lines.push(sp > 0.97 ? (sel.d === 4 ? "untied: it slipped out through w" : "untied") : !knot.pulling ? "slack: press pull" : held ? (sel.d === 3 ? "jammed: the knot holds" : "still tied: wait") : "tightening");
  } else if (sel.phys) {
    const F = Math.hypot(...bodyF); lines.push(`tip ${tipSpeed(arm).toFixed(1)} m/s · the arm pushes the body ${F < 20 ? "<20" : F.toFixed(0)} N${F < 20 ? "" : " (the arrow)"}`);
    // the force on the body, as an arrow from its centre: log length, so a twitch and a strike both show
    const b0 = [0, -0.28, 0, 0], L = F > 20 ? 0.35 * Math.log10(1 + F / 5) : 0, tip = add(b0, bodyF.map((v) => (v / (F || 1)) * L)), p0 = scr(b0), p1 = scr(tip);
    if (p0 && p1 && L > 0.02) { g.strokeStyle = "#7fd8ff"; g.fillStyle = "#7fd8ff"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.stroke();
      const a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]); g.beginPath(); g.moveTo(...p1); g.lineTo(p1[0] - 9 * Math.cos(a - 0.4), p1[1] - 9 * Math.sin(a - 0.4)); g.lineTo(p1[0] - 9 * Math.cos(a + 0.4), p1[1] - 9 * Math.sin(a + 0.4)); g.fill(); }
  }
  if (sel.d === 4) {
    const n = pieces(nodes, O4(), frame.N); lines.push(`your slice cuts it in ${n} piece${n === 1 ? "" : "s"} · ${frame.off >= 0 ? "+" : ""}${frame.off.toFixed(2)} m ana`);
    // the whole arm, projected: x, y and z drawn (w dropped), coloured by w; where your slice is, as the line's brightness
    const s = Math.min(w, h) * 0.2, cx = w - s * 0.75 - 12, cy = (h > w ? 96 : 64) + s, zs = isKnot() ? 3.6 : 2.6, P = (x) => { const r = [x[0] - view.target[0], x[1] - view.target[1], x[2] - view.target[2]]; return [cx + (dot(r, cam.R) * s) / zs, cy - (dot(r, cam.U) * s) / zs]; };
    g.fillStyle = "rgba(7,8,12,0.6)"; g.fillRect(cx - s * 0.75, cy - s * 1.0, s * 1.5, s * 1.9); g.fillStyle = "rgba(233,228,218,0.7)"; g.textAlign = "center"; g.fillText(`whole ${isKnot() ? "rope" : "arm"}: w as colour`, cx, cy + s * 0.84); g.textAlign = "left";
    g.lineWidth = 3; g.lineCap = "round";
    for (let i = 0; i + 1 < nodes.length; i++) { const a = nodes[i], b = nodes[i + 1], wv = a.x[3], inS = Math.abs(dot(a.x.map((v, k) => v - O4()[k]), frame.N)) < a.r, p0 = P(a.x), p1 = P(b.x);
      g.strokeStyle = `rgba(${wv > 0 ? "56,242,224" : "255,102,184"},${(0.35 + Math.min(0.65, Math.abs(wv) * 1.5)).toFixed(2)})`; if (inS) g.strokeStyle = "#ffd27a"; g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.stroke(); }
    g.fillStyle = "rgba(233,228,218,0.7)"; g.fillText("gold: in your slice", cx - s * 0.7, cy - s * 0.88);
  }
  // (a line too wide for the screen breaks at its dots)
  const wrapped = lines.flatMap((l) => (g.measureText(l).width < w - 24 ? [l] : l.split(" · ")));
  g.fillStyle = "rgba(233,228,218,0.85)"; wrapped.forEach((l, i) => g.fillText(l, 12, h - 130 - 15 * (wrapped.length - i)));
  const tw = $("twist"), an = $("ana"); tw.style.left = "14px"; tw.style.top = `${h - 118}px`; an.style.left = `${w - 58}px`; an.style.top = `${h - 134}px`;
}

/* ------------------------------------------------------------------ start */
const q = new URLSearchParams(location.search);
sel.phys = q.get("phys") !== "0"; sel.d = +(q.get("d") || 3); setPreset(q.get("p") || "writhe"); setD(sel.d);
if (matchMedia("(orientation: portrait)").matches) $("cap").classList.add("min");
requestAnimationFrame(draw);
// (for tests: run the physics on by sec seconds without drawing)
function ff(sec) { for (let i = 0; i < Math.round(sec * 30); i++) { sel.t += 1 / 30; if (isKnot()) stepKnot(1 / 30); else if (sel.phys) stepArm(arm, sel.preset, sel.t, 1 / 30); } }
window.TENTACLE = { ff, sel, frame, view, setD, setPreset, cur: () => cur, twistSlice, arm: () => arm, knot: () => knot, bodyF: () => bodyF };
