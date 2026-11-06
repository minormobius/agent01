/* AMOEBA — the page. The physics is ./amoeba.js, run in ./worker.js; each frame the page takes the latest membrane
   and draws it in two passes. First, ray-marched, everything that isn't the membrane: the floor (its grid in world
   coordinates; food's smell on it), the food, the nucleus; this pass writes depth. Then the membrane as triangles,
   translucent, over it: in 3D the mesh itself; in 4D the cut of every tetrahedron by your 3D slice (a triangle or a
   quad where the slice passes through it), so what you see is exactly the slice of the 3-dimensional membrane. */
const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* ------------------------------------------------------------------ GL */
const gl = glc.getContext("webgl2", { antialias: true });
if (!gl) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">AMOEBA needs WebGL2.</p>`; throw new Error("no WebGL2"); }
const NEAR = 0.05, FAR = 60;
const BG_VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const BG_FS = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTan, uFloorOn, uNucA; uniform vec3 uEye, uCR, uCU, uCF;
uniform vec4 uS, uE0, uE1, uE2, uNuc; uniform int uD, uFoodN; uniform vec4 uFood[10];
out vec4 o;
vec4 W(vec3 e) { return uS + e.x * uE0 + e.y * uE1 + e.z * uE2; }
float sdNuc(vec4 p) { return length(p - uNuc) - uNucA; }
float sdFood(vec4 p) { float m = 1e3; for (int k = 0; k < 10; k++) { if (k >= uFoodN) break; m = min(m, length(p - uFood[k]) - 0.12); } return m; }
float depthOf(float t, vec3 d) { float z = t * dot(d, uCF), A = (${FAR.toFixed(1)} + ${NEAR}) / (${FAR.toFixed(1)} - ${NEAR}), B = -2.0 * ${FAR.toFixed(1)} * ${NEAR} / (${FAR.toFixed(1)} - ${NEAR}); return 0.5 * (A + B / z) + 0.5; }
void main() {
  vec2 q = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 d = normalize(uCF + q.x * uTan * uCR + q.y * uTan * uCU), L = normalize(vec3(0.4, 0.8, -0.35));
  vec3 c = mix(vec3(0.02, 0.05, 0.06), vec3(0.06, 0.12, 0.13), 0.5 + 0.5 * d.y);
  float t = 0.05; bool hit = false; int which = 0;
  for (int i = 0; i < 100; i++) { vec4 p = W(uEye + d * t); float a = sdNuc(p), b = sdFood(p), s = min(a, b); if (s < 0.001) { hit = true; which = a < b ? 1 : 2; break; } t += max(s, 0.01); if (t > 30.0) break; }
  float tf = -1.0;
  if (uFloorOn > 0.5) { float y0 = W(uEye).y, yd = dot(vec3(uE0.y, uE1.y, uE2.y), d); tf = abs(yd) > 1e-5 ? -y0 / yd : -1.0; }
  if (tf > 0.0 && (!hit || tf < t)) {
    vec4 q4 = W(uEye + d * tf);
    vec3 g = abs(fract(vec3(q4.x, q4.z, q4.w) + 0.5) - 0.5); float ln = min(g.x, g.y); if (uD == 4 && length(vec3(uE0.w, uE1.w, uE2.w)) > 0.05) ln = min(ln, g.z);
    vec3 base = uD == 4 ? mix(vec3(0.10, 0.22, 0.24), vec3(0.24, 0.13, 0.17), 0.5 + 0.5 * sin(q4.w * 1.3)) : vec3(0.13, 0.19, 0.2);
    vec3 col = mix(base * 1.6, base, smoothstep(0.0, 0.03, ln));
    if (uFoodN > 0) { float cc = 0.0; for (int k = 0; k < 10; k++) { if (k >= uFoodN) break; vec4 F = uFood[k]; float r2 = dot(q4 - F, q4 - F) + 0.09; cc += uD == 3 ? 1.0 / sqrt(r2) : 1.0 / r2; }
      col += vec3(0.5, 0.33, 0.08) * clamp(cc * 0.5, 0.0, 0.8); col = mix(col, vec3(0.95, 0.75, 0.3), (1.0 - smoothstep(0.0, 0.04, abs(log(cc / 0.1)))) * 0.6); }
    o = vec4(mix(col, c, smoothstep(6.0, 16.0, tf)), 1.0); gl_FragDepth = depthOf(tf, d); return;
  }
  if (!hit) { o = vec4(c, 1.0); gl_FragDepth = 0.99999; return; }
  vec3 e = uEye + d * t, nn; const float h = 0.003;
  if (which == 1) nn = normalize(vec3(sdNuc(W(e + vec3(h, 0, 0))) - sdNuc(W(e - vec3(h, 0, 0))), sdNuc(W(e + vec3(0, h, 0))) - sdNuc(W(e - vec3(0, h, 0))), sdNuc(W(e + vec3(0, 0, h))) - sdNuc(W(e - vec3(0, 0, h)))));
  else nn = normalize(vec3(sdFood(W(e + vec3(h, 0, 0))) - sdFood(W(e - vec3(h, 0, 0))), sdFood(W(e + vec3(0, h, 0))) - sdFood(W(e - vec3(0, h, 0))), sdFood(W(e + vec3(0, 0, h))) - sdFood(W(e - vec3(0, 0, h)))));
  vec3 base = which == 1 ? vec3(0.55, 0.32, 0.62) : vec3(0.45, 0.85, 0.35);
  o = vec4(base * (0.35 + 0.7 * max(dot(nn, L), 0.0)) + vec3(0.3, 0.2, 0.4) * pow(1.0 - abs(dot(nn, d)), 3.0) * (which == 1 ? 1.0 : 0.2), 1.0); gl_FragDepth = depthOf(t, d);
}`;
const MEM_VS = `#version 300 es
in vec3 aPos, aNrm, aCol; uniform vec3 uEye, uCR, uCU, uCF; uniform float uTan, uAsp;
out vec3 vN, vC, vV;
void main() { vec3 r = aPos - uEye; float z = dot(r, uCF); vN = aNrm; vC = aCol; vV = normalize(r);
  gl_Position = vec4(dot(r, uCR) / (uTan * uAsp), dot(r, uCU) / uTan, z * ${((FAR + NEAR) / (FAR - NEAR)).toFixed(6)} - ${((2 * FAR * NEAR) / (FAR - NEAR)).toFixed(6)}, z); }`;
const MEM_FS = `#version 300 es
precision highp float; in vec3 vN, vC, vV; out vec4 o;
void main() {
  vec3 n = normalize(vN), L = normalize(vec3(0.4, 0.8, -0.35)); if (dot(n, vV) > 0.0) n = -n;
  float u = vC.x, v = vC.y;
  vec3 skin = vec3(0.86, 0.72, 0.68);
  skin = mix(skin, vec3(0.95, 0.42, 0.3), clamp(v * 0.9 * (1.0 - u), 0.0, 0.8));
  skin = mix(skin, vec3(0.35, 0.9, 1.0), clamp(u * 1.3, 0.0, 1.0));
  float lam = max(dot(n, L), 0.0), fr = pow(1.0 - abs(dot(n, vV)), 2.0);
  vec3 c = skin * (0.32 + 0.68 * lam) + vec3(0.9, 0.95, 1.0) * pow(max(dot(reflect(vV, n), L), 0.0), 30.0) * 0.35;
  o = vec4(c, 0.42 + 0.5 * fr);
}`;
const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
const program = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
const bgP = program(BG_VS, BG_FS), memP = program(MEM_VS, MEM_FS);
const uni = (p, names) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]));
const UB = uni(bgP, ["uRes", "uTan", "uFloorOn", "uNucA", "uEye", "uCR", "uCU", "uCF", "uS", "uE0", "uE1", "uE2", "uNuc", "uD", "uFoodN", "uFood"]);
const UM = uni(memP, ["uEye", "uCR", "uCU", "uCF", "uTan", "uAsp"]);
const bgVao = gl.createVertexArray(); gl.bindVertexArray(bgVao);
const bgBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
{ const a = gl.getAttribLocation(bgP, "aPos"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); }
const memVao = gl.createVertexArray(); gl.bindVertexArray(memVao);
const bufs = {}; for (const n of ["aPos", "aNrm", "aCol"]) { bufs[n] = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bufs[n]); const a = gl.getAttribLocation(memP, n); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0); }
const ibuf = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);
gl.bindVertexArray(null);

/* ------------------------------------------------------------------ state */
const sel = { d: 3, preset: "explore", paused: false };
let mesh = null, fr = null, worker = null, S = null, nIdx = 0, nTri = 0;
const frame = { E: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], N: [0, 0, 0, 1], off: 0 };
function twistSlice(dir3, ang) {
  const u = unit([0, 1, 2, 3].map((k) => dir3[0] * frame.E[0][k] + dir3[1] * frame.E[1][k] + dir3[2] * frame.E[2][k])), N = frame.N, c = Math.cos(ang) - 1, s = Math.sin(ang);
  const rot = (x) => { const a = dot(x, u), b = dot(x, N); return x.map((v, k) => v + c * (a * u[k] + b * N[k]) + s * (a * N[k] - b * u[k])); };
  frame.E = frame.E.map(rot); frame.N = rot(N);
  const B = [...frame.E, frame.N]; for (let i = 0; i < 4; i++) { for (let j = 0; j < i; j++) B[i] = add(B[i], B[j], -dot(B[i], B[j])); B[i] = unit(B[i]); } frame.E = B.slice(0, 3); frame.N = B[3];
}
const squareUp = () => Object.assign(frame, { E: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], N: [0, 0, 0, 1], off: 0 });
const view = { az: 0.6, el: 0.55, dist: 5.5 };
function camera() { const { az, el, dist } = view, eye = [-dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), -dist * Math.cos(el) * Math.cos(az)], F = unit(eye.map((x) => -x)), R = unit([F[2], 0, -F[0]]); return { eye, F, R, U: cross(F, R) }; }

/* ------------------------------------------------------------------ the worker */
function start() {
  if (worker) worker.terminate();
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => { const m = e.data; if (m.type === "mesh") { mesh = m; meshReady(); } else if (m.type === "frame") { fr = m; if (mesh && m.F) { mesh.F = m.F; mesh.nv = m.nv; mesh.nf = m.nf; meshReady(); } else if (mesh) { mesh.nv = m.nv; } worker.postMessage({ type: "ready" }); } };
  worker.postMessage({ type: "init", d: sel.d, preset: sel.preset, opts: OPTS }); worker.postMessage({ type: "pause", on: sel.paused });
  fr = null; mesh = null; S = null;
}
function meshReady() {
  if (mesh.d === 3) { gl.bindVertexArray(memVao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint32Array.from(mesh.F), gl.STATIC_DRAW); nIdx = mesh.F.length; gl.bindVertexArray(null); }
  else cut = { pos: new Float32Array(mesh.nf * 18), nrm: new Float32Array(mesh.nf * 18), col: new Float32Array(mesh.nf * 18) };
}
let cut = null;

/* ------------------------------------------------------------------ the membrane into triangles */
// slice coordinates of a world point: (x − S)·E
function buildMembrane() {
  const d = fr.d, P = fr.P, g = fr.g, nv = mesh.nv;
  gl.bindVertexArray(memVao);
  if (d === 3) {
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { for (let c = 0; c < 3; c++) pos[i * 3 + c] = P[i * 3 + c] - S[c]; col[i * 3] = fr.u[i]; col[i * 3 + 1] = fr.v[i]; col[i * 3 + 2] = fr.sig[i]; }
    for (const [n, a] of [["aPos", pos], ["aNrm", g], ["aCol", col]]) { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[n]); gl.bufferData(gl.ARRAY_BUFFER, a, gl.DYNAMIC_DRAW); }
  } else {
    // marching tetrahedra: each tet's vertices' signed distances from your slice; where they change sign, the cut
    const { E, N } = frame, F = mesh.F, nf = mesh.nf, s = new Float32Array(nv), loc = new Float32Array(nv * 3), nl = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { const b = i * 4; let sd = 0; for (let c = 0; c < 4; c++) sd += (P[b + c] - S[c]) * N[c]; s[i] = sd;
      for (let k = 0; k < 3; k++) { let x = 0, y = 0; for (let c = 0; c < 4; c++) { x += (P[b + c] - S[c]) * E[k][c]; y += g[b + c] * E[k][c]; } loc[i * 3 + k] = x; nl[i * 3 + k] = y; } }
    const { pos, nrm, col } = cut; let nt = 0;
    const pts = [], put = (a, b) => { const t = s[a] / (s[a] - s[b]); pts.push([a, b, t]); };
    const emit = (p) => { for (const [a, b, t] of p) { const o = nt * 3; for (let k = 0; k < 3; k++) { pos[o + k] = loc[a * 3 + k] + t * (loc[b * 3 + k] - loc[a * 3 + k]); nrm[o + k] = nl[a * 3 + k] + t * (nl[b * 3 + k] - nl[a * 3 + k]); }
      col[o] = fr.u[a] + t * (fr.u[b] - fr.u[a]); col[o + 1] = fr.v[a] + t * (fr.v[b] - fr.v[a]); col[o + 2] = fr.sig[a] + t * (fr.sig[b] - fr.sig[a]); nt++; } };
    for (let k = 0; k < nf; k++) {
      const v0 = F[k * 4], v1 = F[k * 4 + 1], v2 = F[k * 4 + 2], v3 = F[k * 4 + 3], q = [v0, v1, v2, v3], pos4 = q.filter((i) => s[i] > 0), neg = q.filter((i) => s[i] <= 0);
      if (!pos4.length || !neg.length) continue;
      pts.length = 0;
      if (pos4.length === 1 || neg.length === 1) { const [lone, rest] = pos4.length === 1 ? [pos4[0], neg] : [neg[0], pos4]; for (const r of rest) put(lone, r); emit(pts); }
      else { const [a, b] = pos4, [c, e] = neg; put(a, c); put(a, e); put(b, e); const tri1 = pts.slice(0, 3); pts.length = 0; put(a, c); put(b, e); put(b, c); emit(tri1); emit(pts.slice(0, 3)); }
    }
    nTri = nt;
    for (const [n, a] of [["aPos", pos], ["aNrm", nrm], ["aCol", col]]) { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[n]); gl.bufferData(gl.ARRAY_BUFFER, a.subarray(0, nt * 3), gl.DYNAMIC_DRAW); }
  }
  gl.bindVertexArray(null);
}

/* ------------------------------------------------------------------ captions */
const CAPS = {
  explore: (d) => d === 3 ? `<b>An amoeba</b>, from its mechanics. Its membrane is one closed mesh, remeshed as it flows. The cortex under it pulls it in; its pressure is whatever holds its volume; and a <b>signalling medium on the membrane</b> fires in patches: where it fires (cyan), actin polymerises against the membrane and pushes a pseudopod out, and a firing tip, bent sharply, keeps firing. The cell's front–rear axis follows its feet; myosin (warm) gathers at the rear and squeezes it in. The more of it is firing, the harder to fire more, so it makes a few feet, not a hundred. Nothing is drawn on: the shapes are what those forces make.` : `<b>A 4D amoeba</b>, in your slice. Its membrane is a 3-dimensional mesh of tetrahedra (the 600-cell's, refined), and what you see is your slice's cut through it. Its signalling spreads over a 3D membrane, its feet reach out along a 3D floor, and the same tension squeezes it half again as hard (σ·3/R). Move the lever to slide your slice through it; the map shows the footprint as the solid it is.`,
  hunt: (d) => d === 3 ? `<b>Hunt.</b> Food (green) leaks a chemical; the floor glows with it. The membrane fires more readily where the smell is stronger, so its feet go that way more often than not: nobody steers it. It eats what it closes round, and grows a little.` : `<b>Hunt in 4D.</b> The smell falls as 1/r² here, so food has to lie closer and thicker (ten morsels within 4.5 radii, against four within 9 in 3D) for the feet to find it. Most of it is off your slice: watch the glow, the map and the readout.`,
  still: (d) => `<b>Still.</b> The signalling off: no feet. Pressed flat by its weight and stuck down by adhesion, it settles to a dome on its footprint, the pressure ${d === 3 ? "σ·2/R" : "σ·3/R"} of its curvature, and stays.`,
  float: (d) => `<b>Floating.</b> The same signalling with nothing to hold on to. It still drifts, about two-thirds as fast: its feet push out in front and are drawn in behind, a cycle that doesn't undo itself, and amoebae have been seen to swim that way. (The water here is plain local drag, not a full flow, so the speed is a sketch.)`,
};
function caption() { $("cap").innerHTML = CAPS[sel.preset](sel.d); }
$("cap").onclick = () => $("cap").classList.toggle("min");
function sync() {
  for (const b of document.querySelectorAll("#exps button[data-d]")) b.classList.toggle("on", +b.dataset.d === sel.d);
  for (const b of document.querySelectorAll("#exps button[data-x]")) b.classList.toggle("on", b.dataset.x === sel.preset);
  for (const id of ["twist", "ana", "squareB"]) $(id).style.display = sel.d === 4 ? "" : "none";
  caption(); history.replaceState(null, "", `?d=${sel.d}&p=${sel.preset}${Object.keys(OPTS).length ? `&o=${encodeURIComponent(JSON.stringify(OPTS))}` : ""}`);
}
function setD(d) { sel.d = d; squareUp(); start(); sync(); }
function setPreset(p) { sel.preset = p; start(); sync(); }
for (const b of document.querySelectorAll("#exps button[data-d]")) b.onclick = () => setD(+b.dataset.d);
for (const b of document.querySelectorAll("#exps button[data-x]")) b.onclick = () => setPreset(b.dataset.x);
$("pauseB").onclick = () => { sel.paused = !sel.paused; $("pauseB").classList.toggle("on", sel.paused); worker && worker.postMessage({ type: "pause", on: sel.paused }); };
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
// one finger turns the view; two pinch it nearer or farther (the wheel does the same)
const spread = () => { const [a, b] = [...drags.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
glc.addEventListener("pointermove", (e) => { const g = drags.get(e.pointerId); if (!g) return;
  if (drags.size >= 2) { const before = spread(); g.x = e.clientX; g.y = e.clientY; const after = spread(); if (before > 10 && after > 10) view.dist = Math.max(1.5, Math.min(18, view.dist * (before / after))); return; }
  view.az -= (e.clientX - g.x) * 0.007; view.el = Math.max(-1.3, Math.min(1.3, view.el + (e.clientY - g.y) * 0.007)); g.x = e.clientX; g.y = e.clientY; });
for (const ev of ["pointerup", "pointercancel"]) glc.addEventListener(ev, (e) => drags.delete(e.pointerId));
glc.addEventListener("wheel", (e) => { view.dist = Math.max(1.5, Math.min(18, view.dist * Math.exp(e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => e.preventDefault());

/* ------------------------------------------------------------------ the loop */
const TAN = 0.5;
let last = performance.now(), res = 0;
function draw(now) {
  requestAnimationFrame(draw);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (sel.d === 4) { const kv = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0), cam0 = camera(), tx = pads.tw[0] + kv("l", "j"), ty = pads.tw[1] + kv("i", "k"), an = pads.an + kv("r", "f"), r = (40 * Math.PI) / 180;
    if (tx) twistSlice(cam0.R, tx * r * dt); if (ty) twistSlice(cam0.U, ty * r * dt); if (an) frame.off = Math.max(-2.5, Math.min(2.5, frame.off + an * 0.8 * dt)); }
  const dpr = Math.min(1.5, devicePixelRatio || 1); if (!res) res = dpr * (matchMedia("(pointer: coarse)").matches ? 0.75 : 1);
  const cw = Math.round(glc.clientWidth * res), chh = Math.round(glc.clientHeight * res); if (glc.width !== cw || glc.height !== chh) { glc.width = cw; glc.height = chh; }
  gl.viewport(0, 0, cw, chh); gl.clearColor(0.02, 0.05, 0.06, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (!fr || !mesh || fr.d !== mesh.d) { overlay(); return; }
  // the slice follows the cell (its centre, plus your offset along N in 4D), smoothly
  const d = fr.d, C4 = [0, 0, 0, 0]; for (let k = 0; k < d; k++) C4[k] = fr.C[k];
  const target = d === 4 ? add(C4, frame.N, frame.off) : C4; target[1] = Math.max(target[1], 0.6);
  S = S ? S.map((v, k) => v + (target[k] - v) * 0.08) : target;
  const cam = camera(), E = d === 4 ? frame.E : [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
  // pass 1: floor, food, nucleus
  gl.useProgram(bgP); gl.bindVertexArray(bgVao); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.ALWAYS); gl.depthMask(true); gl.disable(gl.BLEND);
  gl.uniform2f(UB.uRes, cw, chh); gl.uniform1f(UB.uTan, TAN); gl.uniform3fv(UB.uEye, cam.eye); gl.uniform3fv(UB.uCR, cam.R); gl.uniform3fv(UB.uCU, cam.U); gl.uniform3fv(UB.uCF, cam.F);
  gl.uniform4fv(UB.uS, S); gl.uniform4fv(UB.uE0, E[0]); gl.uniform4fv(UB.uE1, E[1]); gl.uniform4fv(UB.uE2, E[2]); gl.uniform1i(UB.uD, d);
  const nuc = [0, 0, 0, 0]; fr.nuc.forEach((v, k) => (nuc[k] = v)); gl.uniform4fv(UB.uNuc, nuc); gl.uniform1f(UB.uNucA, fr.nucA); gl.uniform1f(UB.uFloorOn, fr.floor ? 1 : 0);
  const fd = new Float32Array(40), fs = fr.foods.slice(0, 10); fs.forEach((F, k) => F.forEach((v, c) => (fd[4 * k + c] = v))); gl.uniform4fv(UB.uFood, fd); gl.uniform1i(UB.uFoodN, fs.length);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // pass 2: the membrane, translucent, depth-tested but not depth-written
  buildMembrane();
  gl.useProgram(memP); gl.bindVertexArray(memVao); gl.depthFunc(gl.LESS); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform3fv(UM.uEye, cam.eye); gl.uniform3fv(UM.uCR, cam.R); gl.uniform3fv(UM.uCU, cam.U); gl.uniform3fv(UM.uCF, cam.F); gl.uniform1f(UM.uTan, TAN); gl.uniform1f(UM.uAsp, cw / chh);
  if (d === 3) gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0); else gl.drawArrays(gl.TRIANGLES, 0, nTri);
  gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);
  overlay();
}

/* ------------------------------------------------------------------ the readout and the minimap */
function overlay() {
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.font = "11px ui-monospace, Menlo, monospace";
  const tw = $("twist"), an = $("ana"); tw.style.left = "14px"; tw.style.top = `${h - 118}px`; an.style.left = `${w - 58}px`; an.style.top = `${h - 134}px`;
  if (!fr || !mesh || fr.d !== mesh.d) { g.fillStyle = "rgba(233,228,218,0.8)"; g.fillText("building the membrane…", 12, h - 150); return; }
  const d = fr.d, Rv = (fr.V / (d === 3 ? (4 / 3) * Math.PI : Math.PI ** 2 / 2)) ** (1 / d), sphA = d === 3 ? 4 * Math.PI * Rv * Rv : 2 * Math.PI ** 2 * Rv ** 3;
  let reach = 0, act = 0, foot = 0; for (let i = 0; i < mesh.nv; i++) { let q = 0; for (let k = 0; k < d; k++) if (k !== 1) q += (fr.P[i * d + k] - fr.C[k]) ** 2; reach = Math.max(reach, Math.sqrt(q)); if (fr.u[i] > 0.5) act++; if (fr.P[i * d + 1] < 0.03) foot++; }
  const lines = [`${d}D · the membrane: ${mesh.nv.toLocaleString()} points, ${mesh.nf.toLocaleString()} ${d === 3 ? "triangles" : "tetrahedra"} · physics ${fr.stepMs.toFixed(1)} ms a step · t = ${fr.t.toFixed(1)}`,
    `volume ${fr.V.toFixed(3)} (held) · pressure ${fr.Pr.toFixed(2)} · membrane ${(fr.area / sphA).toFixed(2)}× a ball's of its volume`,
    `reaches ${reach.toFixed(2)} from its middle · ${((100 * act) / mesh.nv).toFixed(0)}% of the membrane firing · ${fr.floor ? `${((100 * foot) / mesh.nv).toFixed(0)}% on the floor · ` : ""}going ${fr.vel.toFixed(2)} radii/s`];
  if (fr.foods.length || fr.eaten) { let nd = Infinity, ana = 0; for (const F of fr.foods) { const u = F.map((v, k) => v - fr.C[k]); const L = Math.hypot(...u.map((v, k) => (k === 1 ? 0 : v))); if (L < nd) { nd = L; ana = d === 4 ? dot(u, frame.N) : 0; } }
    lines.push(`eaten ${fr.eaten} · nearest food ${nd.toFixed(1)} away${d === 4 ? ` (${ana >= 0 ? "+" : ""}${ana.toFixed(1)} ana of your slice)` : ""} · ${fr.foods.length} about`); }
  if (d === 4) lines.push(`your slice: ${frame.off >= 0 ? "+" : ""}${frame.off.toFixed(2)} ana`);
  const wrapped = lines.flatMap((l) => (g.measureText(l).width < w - 24 ? [l] : l.split(" · ")));
  g.fillStyle = "rgba(233,228,218,0.85)"; wrapped.forEach((l, i) => g.fillText(l, 12, h - 130 - 15 * (wrapped.length - i)));
  if (fr.floor) minimap(g, w, h);
}
/* the footprint: the membrane's points on the floor, coloured by what they're doing (cyan firing, warm myosin), seen
   from above in 3D; in 4D the floor is 3D, so a little 3D view of the footprint solid (x, z across, w up), turned with
   your camera, with your slice's cut through the floor as a plane */
function minimap(g, w, h) {
  const d = fr.d, S0 = Math.round(Math.min(180, w * 0.34)), x0 = w - S0 - 10, y0 = 50, cx = x0 + S0 / 2, cy = y0 + S0 / 2;
  const pts = []; for (let i = 0; i < mesh.nv; i++) if (fr.P[i * d + 1] < 0.03) pts.push(i);
  let reach = 1; const m0 = [fr.C[0], fr.C[2], d === 4 ? fr.C[3] : 0];
  for (let i = 0; i < mesh.nv; i++) { const p = [fr.P[i * d], fr.P[i * d + 2], d === 4 ? fr.P[i * d + 3] : 0]; reach = Math.max(reach, Math.hypot(p[0] - m0[0], p[1] - m0[1], p[2] - m0[2])); }
  const sc = (S0 * (d === 3 ? 0.46 : 0.4)) / reach, ca = Math.cos(view.az), sa = Math.sin(view.az), pitch = d === 3 ? Math.PI / 2 : 0.55, cp = Math.cos(pitch), sp = Math.sin(pitch);
  const Pm = (a0, b0, c0 = 0) => { const a = a0 - m0[0], b = b0 - m0[1], c = c0 - m0[2], a2 = a * ca + b * sa, b2 = -a * sa + b * ca; return [cx + a2 * sc, cy - (c * cp - b2 * sp) * sc, c * sp + b2 * cp]; };
  g.save(); g.fillStyle = "rgba(8,14,16,0.72)"; g.strokeStyle = "rgba(233,228,218,0.25)"; g.beginPath(); g.roundRect ? g.roundRect(x0, y0, S0, S0, 8) : g.rect(x0, y0, S0, S0); g.fill(); g.stroke(); g.beginPath(); g.rect(x0, y0, S0, S0); g.clip();
  // the whole cell from above, faint (3D)
  if (d === 3) { g.fillStyle = "rgba(220,190,185,0.12)"; for (let i = 0; i < mesh.nv; i++) { const q = Pm(fr.P[i * 3], fr.P[i * 3 + 2]); g.fillRect(q[0] - 1, q[1] - 1, 2, 2); } }
  if (d === 4) { const E = frame.E, gy = E.map((e) => e[1]), g2 = gy.reduce((a, v) => a + v * v, 0);
    if (g2 > 1e-6 && S) { const s0 = gy.map((v) => (v * -S[1]) / g2), at = (sv) => [0, 1, 2, 3].map((k) => S[k] + sv[0] * E[0][k] + sv[1] * E[1][k] + sv[2] * E[2][k]);
      let u = Math.abs(gy[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]; const pr = dot(u, gy) / g2; u = u.map((v, k) => v - pr * gy[k]); u = unit(u); const v3 = unit(cross(gy, u));
      const o = at(s0), U = at(u).map((x, k) => x - S[k]), V = at(v3).map((x, k) => x - S[k]), L = reach;
      const c4 = [[-L, -L], [L, -L], [L, L], [-L, L]].map(([a, b]) => Pm(o[0] + a * U[0] + b * V[0], o[2] + a * U[2] + b * V[2], o[3] + a * U[3] + b * V[3]));
      g.fillStyle = "rgba(233,228,218,0.08)"; g.strokeStyle = "rgba(233,228,218,0.35)"; g.beginPath(); c4.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); g.stroke(); } }
  const P2 = pts.map((i) => { const q = Pm(fr.P[i * d], fr.P[i * d + 2], d === 4 ? fr.P[i * d + 3] : 0); return [q, fr.u[i], fr.v[i]]; }).sort((a, b) => b[0][2] - a[0][2]);
  for (const [q, u, v] of P2) { g.fillStyle = u > 0.4 ? "rgba(90,230,255,0.9)" : v > 0.3 ? "rgba(240,120,90,0.8)" : "rgba(150,190,195,0.7)"; g.fillRect(q[0] - 1.2, q[1] - 1.2, 2.4, 2.4); }
  { const q = Pm(fr.nuc[0], fr.nuc[2], d === 4 ? fr.nuc[3] : 0); g.fillStyle = "rgba(170,110,200,0.9)"; g.beginPath(); g.arc(q[0], q[1], Math.max(2.5, fr.nucA * sc * 0.8), 0, 7); g.fill(); }
  for (const F of fr.foods) { const q = Pm(F[0], F[2], d === 4 ? F[3] : 0), inside = q[0] > x0 + 4 && q[0] < x0 + S0 - 4 && q[1] > y0 + 4 && q[1] < y0 + S0 - 4;
    g.fillStyle = "rgba(120,215,95,0.85)";
    if (inside) { g.beginPath(); g.arc(q[0], q[1], 2.8, 0, 7); g.fill(); }
    else { const t = Math.atan2(q[1] - cy, q[0] - cx), ex = cx + Math.cos(t) * (S0 / 2 - 9), ey = cy + Math.sin(t) * (S0 / 2 - 9); g.beginPath(); g.moveTo(ex + Math.cos(t) * 5, ey + Math.sin(t) * 5); g.lineTo(ex + Math.cos(t + 2.4) * 5, ey + Math.sin(t + 2.4) * 5); g.lineTo(ex + Math.cos(t - 2.4) * 5, ey + Math.sin(t - 2.4) * 5); g.fill(); } }
  g.restore(); g.fillStyle = "rgba(233,228,218,0.7)"; g.fillText(d === 3 ? "footprint, from above" : "footprint (x, z, w↑)", x0 + 6, y0 + S0 + 13);
}

/* ------------------------------------------------------------------ start */
const Q = new URLSearchParams(location.search);
// (?o={...}: physics settings, for trying things)
let OPTS = {}; try { OPTS = JSON.parse(Q.get("o") || "{}"); } catch (err) { OPTS = {}; }
sel.d = 3; // (4D is next: its tetrahedral mesh needs the same remeshing) sel.preset = CAPS[Q.get("p")] ? Q.get("p") : "explore";
squareUp(); start(); sync();
if (matchMedia("(orientation: portrait)").matches) $("cap").classList.add("min");
requestAnimationFrame(draw);
window.AMOEBA = { sel, frame, view, setD, setPreset, frame_: () => fr };
