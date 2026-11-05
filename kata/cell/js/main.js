/* CELL — the page. The membrane is ./cell.js (no DOM): a radius over every direction, held out by pressure and in by
   the cortex. Each frame it steps, and its radius and tension over the directions go into a texture laid out as the
   grid is (the cube's faces side by side in 3D; stacked as slabs in 4D). The shader marches the star-shaped cell from
   that: at any point, its direction from the centre picks the face and the place on it, and the membrane is where the
   distance equals the radius there. In 4D, in your 3D slice. A nucleus shows through. */
import { makeCell, step, applyPreset, volume, area, waist, nucClearance, R0 } from "./cell.js";
const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* ------------------------------------------------------------------ GL */
const gl = glc.getContext("webgl2", { antialias: false });
if (!gl) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">CELL needs WebGL2.</p>`; throw new Error("no WebGL2"); }
const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; precision highp sampler2D; precision highp sampler3D;
uniform vec2 uRes; uniform float uTan, uN; uniform vec3 uEye, uCR, uCU, uCF;
uniform vec4 uO, uE0, uE1, uE2; uniform int uD;
uniform sampler2D uT3; uniform sampler3D uT4;
out vec4 o;
const float PI = 3.14159265;
// the membrane at a direction: (radius, tension, the ring's or belt's pull, 0), from the cube's face it leans toward
vec4 at3(vec3 n) {
  vec3 a = abs(n); int ax = a.x >= a.y && a.x >= a.z ? 0 : (a.y >= a.z ? 1 : 2);
  float s = n[ax]; int f = 2 * ax + (s < 0.0 ? 1 : 0);
  vec2 oth = ax == 0 ? n.yz : (ax == 1 ? n.xz : n.xy);
  vec2 u = (4.0 / PI) * atan(oth / abs(s)), tc = clamp((u * 0.5 + 0.5) * uN, vec2(0.5), vec2(uN - 0.5));
  return texture(uT3, vec2((float(f) * uN + tc.x) / (6.0 * uN), tc.y / uN));
}
vec4 at4(vec4 n) {
  vec4 a = abs(n); int ax = 0; float m = a.x;
  if (a.y > m) { ax = 1; m = a.y; } if (a.z > m) { ax = 2; m = a.z; } if (a.w > m) { ax = 3; m = a.w; }
  float s = n[ax]; int f = 2 * ax + (s < 0.0 ? 1 : 0);
  vec3 oth = ax == 0 ? n.yzw : (ax == 1 ? n.xzw : (ax == 2 ? n.xyw : n.xyz));
  vec3 u = (4.0 / PI) * atan(oth / abs(s)), tc = clamp((u * 0.5 + 0.5) * uN, vec3(0.5), vec3(uN - 0.5));
  return texture(uT4, vec3(tc.x / uN, tc.y / uN, (float(f) * uN + tc.z) / (8.0 * uN)));
}
vec4 cellAt(vec4 p) { float L = length(p); if (L < 1e-5) return vec4(1.0, 1.0, 0.0, 0.0); return uD == 3 ? at3(p.xyz / L) : at4(p / L); }
// distance to the membrane (star-shaped: the radial gap, halved, is a safe step)
float sdCell(vec4 p) { return (length(p) - cellAt(p).x) * 0.5; }
// the nuclei (one, or two after it divides): balls the membrane can't pass, moving as cell.js moves them (in 4D
// 4-balls, so your slice of one comes and goes)
uniform vec4 uNc[2]; uniform vec2 uNa;
float sdNuc(vec4 p) { return min(length(p - uNc[0]) - uNa.x, length(p - uNc[1]) - uNa.y); }
vec3 bg(vec3 d) { return mix(vec3(0.02, 0.05, 0.06), vec3(0.06, 0.12, 0.13), 0.5 + 0.5 * d.y); }
vec4 P4(vec3 e) { return uO + e.x * uE0 + e.y * uE1 + e.z * uE2; }
vec3 nrm(vec3 e, int which) {
  const float h = 0.004; vec3 g;
  for (int k = 0; k < 3; k++) { vec3 dd = vec3(0.0); dd[k] = h; g[k] = which == 0 ? sdCell(P4(e + dd)) - sdCell(P4(e - dd)) : sdNuc(P4(e + dd)) - sdNuc(P4(e - dd)); }
  return normalize(g);
}
void main() {
  vec2 q = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 d = normalize(uCF + q.x * uTan * uCR + q.y * uTan * uCU), c = bg(d), L = normalize(vec3(0.4, 0.8, -0.35));
  float t = 0.2; bool hit = false; vec3 e;
  for (int i = 0; i < 140; i++) { e = uEye + d * t; float s = sdCell(P4(e)); if (s < 0.001) { hit = true; break; } t += max(s, 0.004); if (t > 14.0) break; }
  if (!hit) { o = vec4(c, 1.0); return; }
  vec4 m = cellAt(P4(e)); vec3 n = nrm(e, 0);
  // the membrane: pale, warmer where the cortex is tight, cooler where it has let go, gold where a ring or belt pulls
  float sg = m.y;
  vec3 skin = vec3(0.86, 0.72, 0.68);
  skin = mix(skin, vec3(0.45, 0.8, 0.95), clamp((1.0 - sg) * 1.6, 0.0, 1.0));
  skin = mix(skin, vec3(0.95, 0.35, 0.25), clamp((sg - 1.0) * 0.6, 0.0, 1.0));
  skin = mix(skin, vec3(1.0, 0.8, 0.3), clamp(m.z * 1.2, 0.0, 1.0));
  float lam = max(dot(n, L), 0.0), fr = pow(1.0 - abs(dot(n, d)), 2.5);
  // inside: the cytoplasm faintly tinted, and the nucleus if the ray meets it before leaving
  vec3 inside = vec3(0.35, 0.25, 0.3); float t2 = t + 0.01; bool nuc = false; vec3 e2;
  for (int i = 0; i < 90; i++) { e2 = uEye + d * t2; float sn = sdNuc(P4(e2)), sc = -sdCell(P4(e2)); if (sn < 0.002) { nuc = true; break; } if (sc < -0.002) break; t2 += max(min(sn, max(sc, 0.01)), 0.006); if (t2 > t + 4.0) break; }
  if (nuc) { vec3 nn = nrm(e2, 1); inside = vec3(0.55, 0.32, 0.6) * (0.35 + 0.75 * max(dot(nn, L), 0.0)) + vec3(0.3, 0.2, 0.4) * pow(1.0 - abs(dot(nn, d)), 3.0); }
  vec3 mem = skin * (0.3 + 0.7 * lam) + vec3(0.9, 0.95, 1.0) * pow(max(dot(reflect(d, n), L), 0.0), 30.0) * 0.4;
  // translucent: the membrane at the rim (seen edge-on, more of it), the inside through the middle
  c = mix(inside, mem, 0.35 + 0.6 * fr);
  o = vec4(c, 1.0);
}`;
const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
const U = {}; for (const n of ["uRes", "uTan", "uN", "uEye", "uCR", "uCU", "uCF", "uO", "uE0", "uE1", "uE2", "uD", "uT3", "uT4", "uNc", "uNa"]) U[n] = gl.getUniformLocation(prog, n);
const lin = (target) => { for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(target, k, v); if (target === gl.TEXTURE_3D) gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE); };
const tex3 = gl.createTexture(), tex4 = gl.createTexture();
gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex3); lin(gl.TEXTURE_2D);
gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, tex4); lin(gl.TEXTURE_3D);
gl.uniform1i(U.uT3, 0); gl.uniform1i(U.uT4, 1);
let texN = 0, texD = 0;
/* the membrane into its texture: node i's (radius, tension, band) at the texel the grid puts it at. The grid's node order
   is face, then u index 0 fastest, so in 3D the faces sit side by side (x = face·N + u0, y = u1) and in 4D they stack
   (x = u0, y = u1, z = face·N + u2): the same layout the shader reads */
function upload(cell) {
  const { G, d, r, sigma } = cell, N = G.N, band = cell.band || new Float64Array(G.count), data = new Float32Array(G.count * 4);
  if (d === 3) { for (let f = 0; f < 6; f++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const node = f * G.per + i + N * j, px = (j * 6 * N + f * N + i) * 4; data[px] = r[node]; data[px + 1] = sigma[node]; data[px + 2] = band[node]; } }
  else for (let p = 0; p < G.count; p++) { data[p * 4] = r[p]; data[p * 4 + 1] = sigma[p]; data[p * 4 + 2] = band[p]; }
  if (d === 3) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex3); if (texN !== N || texD !== 3) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 6 * N, N, 0, gl.RGBA, gl.FLOAT, data); else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 6 * N, N, gl.RGBA, gl.FLOAT, data); }
  else { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, tex4); if (texN !== N || texD !== 4) gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, N, N, 8 * N, 0, gl.RGBA, gl.FLOAT, data); else gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, N, N, 8 * N, gl.RGBA, gl.FLOAT, data); }
  texN = N; texD = d; gl.uniform1f(U.uN, N); gl.uniform1i(U.uD, d);
}
// (a 1×1×1 placeholder for whichever texture the dimension isn't using, so both samplers are always complete)
gl.activeTexture(gl.TEXTURE1); gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, 1, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(4));
gl.activeTexture(gl.TEXTURE0); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(4));

/* ------------------------------------------------------------------ state */
const sel = { d: 3, preset: "rest", paused: false, speed: 1 };
let cell = null;

/* ------------------------------------------------------------------ the slice (4D) and the camera */
const frame = { E: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], N: [0, 0, 0, 1], off: 0 };
function twistSlice(dir3, ang) {
  const u = unit([0, 1, 2, 3].map((k) => dir3[0] * frame.E[0][k] + dir3[1] * frame.E[1][k] + dir3[2] * frame.E[2][k])), N = frame.N, c = Math.cos(ang) - 1, s = Math.sin(ang);
  const rot = (x) => { const a = dot(x, u), b = dot(x, N); return x.map((v, k) => v + c * (a * u[k] + b * N[k]) + s * (a * N[k] - b * u[k])); };
  frame.E = frame.E.map(rot); frame.N = rot(N);
  const B = [...frame.E, frame.N]; for (let i = 0; i < 4; i++) { for (let j = 0; j < i; j++) B[i] = add(B[i], B[j], -dot(B[i], B[j])); B[i] = unit(B[i]); } frame.E = B.slice(0, 3); frame.N = B[3];
}
const squareUp = () => Object.assign(frame, { E: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], N: [0, 0, 0, 1], off: 0 });
const view = { az: 0.6, el: 0.3, dist: 4.4 };
function camera() { const { az, el, dist } = view, eye = [-dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), -dist * Math.cos(el) * Math.cos(az)], F = unit(eye.map((x) => -x)), R = unit([F[2], 0, -F[0]]); return { eye, F, R, U: cross(F, R) }; }

/* ------------------------------------------------------------------ captions */
const CAPS = {
  rest: (d) => d === 3 ? `<b>A cell.</b> Pressure inside pushes the membrane out; the cortex under it (a gel of protein fibres) pulls it in. Round, they balance by <b>Laplace's law</b>, P = σ·2/R: the membrane curves two ways. The cortex's tension wanders a little; the colour shows it (warm where tight, cool where it lets go). The purple ball is the nucleus, seen through: a stiff body the membrane presses on and can't pass, held toward the cell's middle by the cytoskeleton. Then press <b>4D</b>.` : `<b>A 4D cell</b>, in your slice. Its membrane is a 3-sphere and curves three ways, so the same tension holds <b>half again as much pressure</b>: P = σ·3/R. It has 4/3 the membrane for its volume. Move the lever and your slice moves through it: the cell shrinks to a point and is gone, and the nucleus, off centre, goes before it.`,
  reach: (d) => `<b>Reach.</b> The cortex lets go in a patch at the front; the pressure pushes the membrane out there until its curvature is P/σ: a <b>pseudopod</b>. Then the tension comes back and pulls it in. (Held weak, a patch like this balloons until it has drained the cell: a bleb that runs away.) The inside flows forward and the nucleus is carried with it, into the pseudopod: it is pushed, never cut.${d === 4 ? " In 4D the patch's rim is a 2-sphere, not a circle." : ""}`,
  contract: (d) => `<b>Contract.</b> The cortex at the back tightens to three times its rest. The back flattens, and since the inside can't be squeezed, it goes forward: this is how a crawling cell pushes its front ahead. The back presses the nucleus forward too.`,
  wave: (d) => `<b>A contraction wave</b>: a band of tight cortex running from front to back, again and again.${d === 4 ? " In 4D the band is a 2-sphere's worth round the cell, not a ring." : ""}`,
  bleb: (d) => `<b>A bleb.</b> The cortex lets go of a small patch all at once; the membrane balloons out under the pressure; then cortex re-forms under it and pulls it back, harder than before.`,
  belt: (d) => d === 3 ? `<b>Division.</b> A contractile ring round the equator tightens: a loop of tension pulls in at T/r, more the narrower it gets, and pinches the cell toward two. First the nucleus divides, and the daughters go one to each half, ahead of the furrow. In 3D the equator <b>is</b> a ring. Now see 4D.` : `<b>Division in 4D: a belt.</b> The equator of a 3-sphere is a 2-sphere, and to pinch it you need a contractile <b>sheet</b> all round it. A sheet curves two ways, so it pulls in at 2T/r and pinches deep. Try <b>ring</b> to see what a loop does.`,
  ring: (d) => d === 3 ? `<b>A ring</b>: in 3D the same as the belt (the equator of a 2-sphere is a circle).` : `<b>A ring in 4D</b>: a loop of tension round a great circle. It pulls a groove in along itself and the cell <b>bulges round it</b>: there's a whole 2-sphere of equator, and a loop is a line on it. A ring can't divide a 4D cell, as a string can't tie a 4D knot. It takes a belt. The nucleus divides anyway: one cell, two nuclei.`,
};
function caption() { $("cap").innerHTML = CAPS[sel.preset](sel.d); }
$("cap").onclick = () => $("cap").classList.toggle("min");
function sync() {
  for (const b of document.querySelectorAll("#exps button[data-d]")) b.classList.toggle("on", +b.dataset.d === sel.d);
  for (const b of document.querySelectorAll("#exps button[data-x]")) b.classList.toggle("on", b.dataset.x === sel.preset);
  for (const id of ["twist", "ana", "squareB"]) $(id).style.display = sel.d === 4 ? "" : "none";
  caption(); history.replaceState(null, "", `?d=${sel.d}&p=${sel.preset}`);
}
function reset() { cell = makeCell(sel.d); }
function setD(d) { sel.d = d; squareUp(); reset(); sync(); }
function setPreset(p) { sel.preset = p; reset(); sync(); }
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
glc.addEventListener("wheel", (e) => { view.dist = Math.max(2.4, Math.min(10, view.dist * Math.exp(e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => e.preventDefault());

/* ------------------------------------------------------------------ the loop */
const TAN = 0.5, DT = 0.02;
let last = performance.now(), res = 0, physMs = 0, acc = 0;
function physics(dt) {
  // fixed steps of 0.02, as many as the frame's time asks for, at most three (a slow device runs slow, not wrong)
  acc = Math.min(acc + dt * sel.speed, 3 * DT);
  const t0 = performance.now(); let k = 0;
  while (acc >= DT && k < 3) { applyPreset(cell, sel.preset, cell.t); step(cell, DT); acc -= DT; k++; }
  if (k) physMs += ((performance.now() - t0) / k - physMs) * 0.1;
}
function draw(now) {
  requestAnimationFrame(draw);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (sel.d === 4) { const kv = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0), cam0 = camera(), tx = pads.tw[0] + kv("l", "j"), ty = pads.tw[1] + kv("i", "k"), an = pads.an + kv("r", "f"), r = (40 * Math.PI) / 180;
    if (tx) twistSlice(cam0.R, tx * r * dt); if (ty) twistSlice(cam0.U, ty * r * dt); if (an) frame.off = Math.max(-2, Math.min(2, frame.off + an * 0.8 * dt)); }
  if (!sel.paused) physics(dt);
  upload(cell);
  const dpr = Math.min(1.5, devicePixelRatio || 1); if (!res) res = dpr * (matchMedia("(pointer: coarse)").matches ? 0.6 : 0.8);
  const cw = Math.round(glc.clientWidth * res), chh = Math.round(glc.clientHeight * res); if (glc.width !== cw || glc.height !== chh) { glc.width = cw; glc.height = chh; }
  gl.viewport(0, 0, cw, chh); gl.uniform2f(U.uRes, cw, chh); gl.uniform1f(U.uTan, TAN);
  const cam = camera(); gl.uniform3fv(U.uEye, cam.eye); gl.uniform3fv(U.uCR, cam.R); gl.uniform3fv(U.uCU, cam.U); gl.uniform3fv(U.uCF, cam.F);
  if (sel.d === 4) { gl.uniform4fv(U.uO, frame.N.map((v) => v * frame.off)); gl.uniform4fv(U.uE0, frame.E[0]); gl.uniform4fv(U.uE1, frame.E[1]); gl.uniform4fv(U.uE2, frame.E[2]); }
  else { gl.uniform4fv(U.uO, [0, 0, 0, 0]); gl.uniform4fv(U.uE0, [1, 0, 0, 0]); gl.uniform4fv(U.uE1, [0, 1, 0, 0]); gl.uniform4fv(U.uE2, [0, 0, 1, 0]); }
  { const nu = cell.nuc, v = new Float32Array(8), a = [0, -1]; nu.forEach((N, k) => { for (let j = 0; j < cell.d; j++) v[4 * k + j] = N.c[j]; a[k] = N.a; }); if (nu.length < 2) v.set(v.subarray(0, 4), 4);
    gl.uniform4fv(U.uNc, v); gl.uniform2f(U.uNa, a[0], a[1] < 0 ? a[0] : a[1]); }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  overlay();
}
let slow = { t: -1, A: 0 };
function overlay() {
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.font = "11px ui-monospace, Menlo, monospace";
  const d = cell.d; if (cell.t - slow.t > 0.25 || cell.t < slow.t) slow = { t: cell.t, A: area(cell), V: volume(cell), W: waist(cell), C: nucClearance(cell) };
  const Req = (slow.V / (d === 3 ? (4 / 3) * Math.PI : Math.PI ** 2 / 2)) ** (1 / d);
  const lines = [`${d}D · the membrane on ${cell.G.count.toLocaleString()} directions · physics ${physMs.toFixed(1)} ms a step`,
    `volume ${slow.V.toFixed(3)} (held) · pressure ${cell.P.toFixed(2)} (round: σ·${d - 1}/R = ${((d - 1) / Req).toFixed(2)})`,
    `membrane ${slow.A.toFixed(2)} · per volume ${(slow.A / slow.V).toFixed(2)} (a round cell: ${d}/R = ${(d / Req).toFixed(2)})`];
  if (sel.preset === "belt" || sel.preset === "ring") lines.push(d === 3 ? `waist ${slow.W.min.toFixed(2)} (it started at 1)` : `at the ring ${slow.W.ring.toFixed(2)} · on the equator away from it ${slow.W.away.toFixed(2)} (both started at 1)`);
  lines.push(cell.nuc.length === 2 ? `two nuclei, ${Math.abs(cell.nuc[0].c[1] - cell.nuc[1].c[1]).toFixed(2)} apart · nearest the membrane comes: ${slow.C.toFixed(2)}` : `the nucleus at (${[...cell.nuc[0].c].map((x) => x.toFixed(2)).join(", ")}) · nearest the membrane comes: ${slow.C.toFixed(2)}`);
  if (d === 4) lines.push(`your slice: ${frame.off >= 0 ? "+" : ""}${frame.off.toFixed(2)} ana`);
  const wrapped = lines.flatMap((l) => (g.measureText(l).width < w - 24 ? [l] : l.split(" · ")));
  g.fillStyle = "rgba(233,228,218,0.85)"; wrapped.forEach((l, i) => g.fillText(l, 12, h - 130 - 15 * (wrapped.length - i)));
  const tw = $("twist"), an = $("ana"); tw.style.left = "14px"; tw.style.top = `${h - 118}px`; an.style.left = `${w - 58}px`; an.style.top = `${h - 134}px`;
}

/* ------------------------------------------------------------------ start */
const Q = new URLSearchParams(location.search);
sel.d = +(Q.get("d") || 3) === 4 ? 4 : 3; sel.preset = CAPS[Q.get("p")] ? Q.get("p") : "rest"; reset(); sync(); squareUp();
if (matchMedia("(orientation: portrait)").matches) $("cap").classList.add("min");
requestAnimationFrame(draw);
// (for tests: run the cell on by sec seconds without drawing)
function ff(sec) { for (let i = 0; i < Math.round(sec / DT); i++) { applyPreset(cell, sel.preset, cell.t); step(cell, DT); } }
window.CELL = { sel, frame, view, setD, setPreset, cell: () => cell, ff };
