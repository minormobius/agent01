/* TENTACLE — the page. The arm is ./rod.js (no DOM): each frame its muscles (a preset, in time) give its strains, and
   the strains its shape: nodes with positions, frames and radii, written into a float texture the shader reads. The
   shader sphere-traces the hypertube (a chain of round cones, in d dimensions) in your 3D slice: in 3D the whole arm,
   in 4D the slice of it, which is where it comes apart into pieces. The skin shows the muscle: rings for the
   segmentation, glow where the longitudinal fibres contract, stripes that spiral as it twists, and (4D) the bald lines
   where a twist muscle can't reach. */
import { build, strainsOf, PRESETS, SEG, pieces, planes } from "./rod.js";
const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const NN = SEG + 1;

/* ------------------------------------------------------------------ GL */
const gl = glc.getContext("webgl2", { antialias: false });
if (!gl) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">TENTACLE needs WebGL2.</p>`; throw new Error("no WebGL2"); }
const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; precision highp sampler2D;
uniform vec2 uRes; uniform float uTan; uniform vec3 uEye, uCR, uCU, uCF;
uniform vec4 uO, uE0, uE1, uE2, uN; uniform int uD, uNN; uniform vec4 uGB[8];
uniform sampler2D uArm; // per node (columns): row 0 position, 1 (radius, s, mean activation, 0), 2–5 the frame (T, e1, e2, e3), 6 (dipole, 0), 7 (twist rates, 0)
out vec4 o;
vec4 nodeP(int i) { return texelFetch(uArm, ivec2(i, 0), 0); }
float nodeR(int i) { return texelFetch(uArm, ivec2(i, 1), 0).x; }
// distance from p to the arm: round cones between nodes, in groups of eight with bounding balls; the nearest segment and how far along it
float sdArm(vec4 p, out int seg, out float hh) {
  float d = 1e9; seg = 0; hh = 0.0;
  for (int g = 0; g < 8; g++) {
    vec4 gc = texelFetch(uArm, ivec2(g * 8 + 4, 0), 0); if (length(p - gc) - uGB[g].w > d) continue;
    for (int k = 0; k < 8; k++) {
      int i = g * 8 + k; if (i + 1 >= uNN) break;
      vec4 a = nodeP(i), b = nodeP(i + 1), ab = b - a, ap = p - a; float ra = nodeR(i), rb = nodeR(i + 1), h = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0), e = length(ap - ab * h) - mix(ra, rb, h);
      if (e < d) { d = e; seg = i; hh = h; }
    }
  }
  // the body it grows from: a ball under the base
  float body = length(p - vec4(0.0, -0.28, 0.0, 0.0)) - 0.34; if (body < d) { d = body; seg = -1; }
  return d;
}
float sdOnly(vec4 p) { int s; float h; return sdArm(p, s, h); }
vec3 abyss(vec3 d) { return mix(vec3(0.01, 0.03, 0.06), vec3(0.05, 0.12, 0.2), smoothstep(-0.5, 0.9, d.y)) + vec3(0.2, 0.35, 0.45) * pow(max(dot(d, normalize(vec3(0.3, 0.8, -0.4))), 0.0), 16.0) * 0.5; }
void main() {
  vec2 q = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 d = normalize(uCF + q.x * uTan * uCR + q.y * uTan * uCU), c = abyss(d);
  float t = 0.5; bool hit = false; vec4 P;
  for (int i = 0; i < 110; i++) { vec3 e3 = uEye + d * t; P = uO + e3.x * uE0 + e3.y * uE1 + e3.z * uE2; float e = sdOnly(P); if (e < 0.0015 * t) { hit = true; break; } t += e * 0.9; if (t > 30.0) break; }
  if (hit) {
    int seg; float h; sdArm(P, seg, h); const float eps = 0.004;
    vec4 n = normalize(vec4(sdOnly(P + vec4(eps, 0, 0, 0)) - sdOnly(P - vec4(eps, 0, 0, 0)), sdOnly(P + vec4(0, eps, 0, 0)) - sdOnly(P - vec4(0, eps, 0, 0)), sdOnly(P + vec4(0, 0, eps, 0)) - sdOnly(P - vec4(0, 0, eps, 0)), sdOnly(P + vec4(0, 0, 0, eps)) - sdOnly(P - vec4(0, 0, 0, eps))));
    vec4 L = normalize(vec4(0.4, 0.8, -0.35, 0.25)); float lam = max(dot(n, L), 0.0), rim = pow(1.0 - abs(dot(n, vec4(d.x * uE0 + d.y * uE1 + d.z * uE2))), 3.0);
    vec3 base;
    if (seg < 0) base = vec3(0.22, 0.08, 0.16);
    else {
      // the skin's coordinates: how far along (s), and which way round (n̂, a unit vector across, in the segment's frame)
      vec4 A = nodeP(seg), B = nodeP(seg + 1), C = mix(A, B, h), off = P - C; vec4 i1 = mix(texelFetch(uArm, ivec2(seg, 1), 0), texelFetch(uArm, ivec2(seg + 1, 1), 0), h);
      vec4 e1 = texelFetch(uArm, ivec2(seg, 3), 0), e2 = texelFetch(uArm, ivec2(seg, 4), 0), e3 = texelFetch(uArm, ivec2(seg, 5), 0);
      vec3 nh = vec3(dot(off, e1), dot(off, e2), uD == 4 ? dot(off, e3) : 0.0); nh /= max(length(nh), 1e-6);
      float s = i1.y;
      // flesh: deep red-violet above, paler beneath (e1's negative side), mottled
      base = mix(vec3(0.42, 0.07, 0.16), vec3(0.85, 0.62, 0.62), smoothstep(0.2, -0.8, nh.x));
      base *= 0.85 + 0.15 * sin(23.0 * nh.y + 9.0 * nh.z + 40.0 * s) * sin(19.0 * nh.x + 31.0 * s);
      // the segmentation: a groove every so often down the arm, continuous muscle rings
      float ring = abs(fract(s * 34.0) - 0.5); base *= mix(0.55, 1.0, smoothstep(0.0, 0.12, ring));
      // the muscle: glow where the longitudinal fibres on this side contract (the mean, plus the dipole toward this side)
      vec4 dp = texelFetch(uArm, ivec2(seg, 6), 0); float act = clamp(i1.z + dot(dp.xyz, nh) / float(uD - 1), 0.0, 1.0);
      base = mix(base, vec3(1.0, 0.45, 0.18), act * 0.75); base += vec3(1.0, 0.3, 0.1) * act * act * 0.25;
      // twist stripes (they spiral as it twists, because the frame does), and in 4D each twist muscle's bald poles: a
      // blue line down the arm where n_i = n_j = 0 for an active plane
      vec4 tw = texelFetch(uArm, ivec2(seg, 7), 0);
      if (uD == 3) base *= 0.85 + 0.15 * smoothstep(-0.3, 0.3, sin(6.0 * atan(nh.y, nh.x)));
      else {
        base *= 0.85 + 0.15 * smoothstep(-0.3, 0.3, sin(6.0 * atan(nh.y, nh.x)) * sin(5.0 * acos(clamp(nh.z, -1.0, 1.0))));
        if (abs(tw.x) > 0.05) base = mix(base, vec3(0.25, 0.65, 1.0), 1.0 - smoothstep(0.16, 0.34, length(nh.xy)));
        if (abs(tw.y) > 0.05) base = mix(base, vec3(0.25, 0.65, 1.0), 1.0 - smoothstep(0.16, 0.34, length(nh.xz)));
        if (abs(tw.z) > 0.05) base = mix(base, vec3(0.25, 0.65, 1.0), 1.0 - smoothstep(0.16, 0.34, length(nh.yz)));
      }
    }
    c = base * (0.45 + 0.95 * lam) + vec3(0.55, 0.75, 0.95) * rim * 0.45; // lit from above, a cold rim from the water behind
    c = mix(c, abyss(d), 1.0 - exp(-t / 25.0));
  }
  o = vec4(c / (1.0 + 0.15 * c), 1.0);
}`;
const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
const U = {}; for (const n of ["uRes", "uTan", "uEye", "uCR", "uCU", "uCF", "uO", "uE0", "uE1", "uE2", "uN", "uD", "uNN", "uGB", "uArm"]) U[n] = gl.getUniformLocation(prog, n);
const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, NN, 8, 0, gl.RGBA, gl.FLOAT, null); gl.uniform1i(U.uArm, 0);

/* ------------------------------------------------------------------ state */
const sel = { d: 3, preset: "writhe", t: 0, paused: false };
const pad4 = (v) => [...v, 0, 0, 0, 0].slice(0, 4);
function upload(nodes, st) {
  const D = new Float32Array(NN * 8 * 4), put = (row, i, v) => D.set(pad4(v), 4 * (row * NN + i));
  nodes.forEach((nd, i) => {
    const k = Math.min(i, SEG - 1), sk = st[k];
    put(0, i, nd.x); put(1, i, [nd.r, nd.s ?? i / SEG, sk.mean, 0]); for (let r = 0; r < nd.F.length; r++) put(2 + r, i, nd.F[r]);
    put(6, i, [...sk.dip, 0]); put(7, i, [...sk.twist.map((v) => v / 9), 0]);
  });
  gl.bindTexture(gl.TEXTURE_2D, tex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NN, 8, gl.RGBA, gl.FLOAT, D);
  // bounding balls for the groups of eight segments: centre at node g·8 + 4, radius reaching every node of the group
  const GB = new Float32Array(32); for (let g = 0; g < 8; g++) { const c = nodes[Math.min(NN - 1, g * 8 + 4)].x; let r = 0; for (let i = g * 8; i <= Math.min(NN - 1, g * 8 + 8); i++) r = Math.max(r, Math.hypot(...add(pad4(nodes[i].x), pad4(c), -1)) + nodes[i].r); GB.set([0, 0, 0, r + 0.01], 4 * g); }
  gl.uniform4fv(U.uGB, GB); gl.uniform1i(U.uNN, NN); gl.uniform1i(U.uD, sel.d);
}

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
  rest: (d) => `At rest. A tentacle has no bones: it's a <b>muscular hydrostat</b>, muscle round fluid that won't compress, so its volume is fixed. Each segment can bend, twist and stretch: <b>${d === 3 ? "4" : "7"} ways</b> (${d === 3 ? "2 bends, 1 twist, 1 stretch" : "3 bends, 3 twists, 1 stretch"}).`,
  reach: (d) => `<b>Reach</b>, as an octopus does: the arm starts curled and a bend <b>travels from base to tip</b>, unrolling it. The glow is the longitudinal muscle contracting on the inside of the curl.`,
  writhe: (d) => d === 3 ? `<b>Writhe</b>: waves of contraction run down the arm, the side that's contracting turning as they go. Calibrate your eye here; then press <b>4D</b>.` : `<b>Writhe</b>, in 4D: the waves' side turns through w as well. It's <b>one smooth arm</b>, but your slice cuts it where it crosses: a ball where it passes through, a tube where it runs alongside, nothing where it's gone. So you see <b>pieces</b> that swell, merge, split and vanish. Move the lever and twist your slice to follow it.`,
  coil: (d) => d === 3 ? `<b>Coil</b>: a steady bend and a steady twist make a helix. Watch the stripes spiral with the twist.` : `<b>Coil</b> in 4D: bend and twist, and a second twist in another plane that comes and goes, so the helix winds into w. The blue lines are a twist muscle's <b>bald lines</b>.`,
  twist: (d) => d === 3 ? `<b>Twist</b>: the helical muscles alone, the arm straight. The stripes spiral. Its twisting fibres can cover the whole ring of skin.` : `<b>Twist</b> in 4D: the skin round the arm is a 2-sphere, and a twisting fibre field on a sphere must have bald spots (the <b>hairy ball theorem</b>): the blue lines down the arm are where this twist muscle (turning the skin in the x–w plane) can't reach: its two poles, along z. A 4D arm has three twist muscles, one for each plane across, and each has its own pair of bald lines; a twist in the x–z plane would hide them along w, where your slice doesn't look.`,
  strike: (d) => `<b>Strike</b>: the transverse muscles squeeze the arm thin, and at constant volume thinner means longer: it <b>shoots out</b> (in ${d}D the cross-section is a ${d - 1}-ball, so r^${d - 1} × length stays fixed), then curls back.`,
  ana: (d) => d === 3 ? `<b>Curl</b>: one side contracting, coming and going.` : `<b>Into w</b>: the fibres on the arm's w side contract, so it curls into w, out of your slice. Your slice keeps only the part near its base.`,
};
function caption() { $("cap").innerHTML = CAPS[sel.preset](sel.d); }
$("cap").onclick = () => $("cap").classList.toggle("min");
function setD(d) { sel.d = d; squareUp(); for (const b of document.querySelectorAll("#exps button[data-d]")) b.classList.toggle("on", +b.dataset.d === d); $("anaB").textContent = d === 4 ? "into w" : "curl"; for (const id of ["twist", "ana", "squareB"]) $(id).style.display = d === 4 ? "" : "none"; caption(); }
function setPreset(p) { sel.preset = p; sel.t = 0; for (const b of document.querySelectorAll("#exps button[data-x]")) b.classList.toggle("on", b.dataset.x === p); caption(); history.replaceState(null, "", `?d=${sel.d}&p=${p}`); }
for (const b of document.querySelectorAll("#exps button[data-d]")) b.onclick = () => { setD(+b.dataset.d); history.replaceState(null, "", `?d=${sel.d}&p=${sel.preset}`); };
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
  const st = strainsOf(sel.d, PRESETS[sel.preset](sel.d, sel.t)), nodes = build(sel.d, st); cur = { st, nodes };
  upload(nodes, st);
  const dpr = Math.min(1.5, devicePixelRatio || 1); if (!res) res = dpr * (matchMedia("(pointer: coarse)").matches ? 0.55 : 0.75);
  const cw = Math.round(glc.clientWidth * res), chh = Math.round(glc.clientHeight * res); if (glc.width !== cw || glc.height !== chh) { glc.width = cw; glc.height = chh; }
  gl.viewport(0, 0, cw, chh); gl.uniform2f(U.uRes, cw, chh); gl.uniform1f(U.uTan, TAN);
  const cam = camera(); gl.uniform3fv(U.uEye, cam.eye); gl.uniform3fv(U.uCR, cam.R); gl.uniform3fv(U.uCU, cam.U); gl.uniform3fv(U.uCF, cam.F);
  if (sel.d === 4) { gl.uniform4fv(U.uO, O4()); gl.uniform4fv(U.uE0, frame.E[0]); gl.uniform4fv(U.uE1, frame.E[1]); gl.uniform4fv(U.uE2, frame.E[2]); gl.uniform4fv(U.uN, frame.N); }
  else { gl.uniform4fv(U.uO, [0, 0, 0, 0]); gl.uniform4fv(U.uE0, [1, 0, 0, 0]); gl.uniform4fv(U.uE1, [0, 1, 0, 0]); gl.uniform4fv(U.uE2, [0, 0, 1, 0]); gl.uniform4fv(U.uN, [0, 0, 0, 1]); }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  overlay(nodes);
}
function overlay(nodes) {
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.font = "11px ui-monospace, Menlo, monospace";
  const len = nodes.slice(1).reduce((s, n, i) => s + Math.hypot(...add(n.x, nodes[i].x, -1)), 0);
  const lines = [`${sel.d}D · ${sel.d === 3 ? "4" : "7"} strains a segment · ${SEG} segments · ${len.toFixed(2)} m long`];
  if (sel.d === 4) {
    const n = pieces(nodes, O4(), frame.N); lines.push(`your slice cuts it in ${n} piece${n === 1 ? "" : "s"} · ${frame.off >= 0 ? "+" : ""}${frame.off.toFixed(2)} m ana`);
    // the whole arm, projected: x, y and z drawn (w dropped), coloured by w; where your slice is, as the line's brightness
    const s = Math.min(w, h) * 0.2, cx = w - s * 0.75 - 12, cy = 64 + s, cam = camera(), P = (x) => { const r = [x[0] - view.target[0], x[1] - view.target[1], x[2] - view.target[2]]; return [cx + (dot(r, cam.R) * s) / 2.6, cy - (dot(r, cam.U) * s) / 2.6]; };
    g.fillStyle = "rgba(7,8,12,0.6)"; g.fillRect(cx - s * 0.75, cy - s * 1.0, s * 1.5, s * 1.9); g.fillStyle = "rgba(233,228,218,0.7)"; g.textAlign = "center"; g.fillText("the whole arm, w as colour", cx, cy + s * 0.84); g.textAlign = "left";
    g.lineWidth = 3; g.lineCap = "round";
    for (let i = 0; i + 1 < nodes.length; i++) { const a = nodes[i], b = nodes[i + 1], wv = a.x[3], inS = Math.abs(dot(a.x.map((v, k) => v - O4()[k]), frame.N)) < a.r, p0 = P(a.x), p1 = P(b.x);
      g.strokeStyle = `rgba(${wv > 0 ? "56,242,224" : "255,102,184"},${(0.35 + Math.min(0.65, Math.abs(wv) * 1.5)).toFixed(2)})`; if (inS) g.strokeStyle = "#ffd27a"; g.beginPath(); g.moveTo(...p0); g.lineTo(...p1); g.stroke(); }
    g.fillStyle = "rgba(233,228,218,0.7)"; g.fillText("gold: in your slice", cx - s * 0.7, cy - s * 0.88);
  }
  g.fillStyle = "rgba(233,228,218,0.85)"; lines.forEach((l, i) => g.fillText(l, 12, h - 160 + i * 15));
  const tw = $("twist"), an = $("ana"); tw.style.left = "14px"; tw.style.top = `${h - 118}px`; an.style.left = `${w - 58}px`; an.style.top = `${h - 134}px`;
}

/* ------------------------------------------------------------------ start */
const q = new URLSearchParams(location.search);
setD(+(q.get("d") || 3)); setPreset(q.get("p") || "writhe");
if (matchMedia("(orientation: portrait)").matches) $("cap").classList.add("min");
requestAnimationFrame(draw);
window.TENTACLE = { sel, frame, view, setD, setPreset, cur: () => cur, twistSlice };
