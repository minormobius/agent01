/* LAVALAMP — the page. Two lamps side by side (stacked on a phone): 3D, the whole lamp, and 4D, your 3D slice of it,
   each in its own worker (./worker.js, ./lamp.js). Both 16 cells across and 32 tall. Each is ray-marched from a
   two-channel 16 × 32 × 16 texture (φ and T): the wax solid, coloured by its temperature, the liquid clear, tinted by
   its own. In 4D gravity stays vertical: the pad tilts the two directions across into w, the lever moves through w. */
const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const NH = 16, NY = 32;

/* ------------------------------------------------------------------ GL */
const gl = glc.getContext("webgl2", { antialias: false });
if (!gl) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">LAVALAMP needs WebGL2.</p>`; throw new Error("no WebGL2"); }
const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; precision highp sampler3D;
uniform sampler3D uF3, uF4; uniform vec4 uVP3, uVP4; uniform vec3 uEye, uCR, uCU, uCF; uniform float uTan, uIso; uniform vec2 uOffs; uniform int uChan, uGlass;
// the slice's offset in w (cells) for the panel being drawn: 0 for ours, the lever's for the 4D one
float gOff = 0.0;
out vec4 o;
// the lamp is [−1, 1] × [−2, 2] × [−1, 1]; its texture coordinate is ((x + 1)/2, (y + 2)/4, (z + 1)/2)
vec2 at(sampler3D s, vec3 p) { return texture(s, vec3(p.x * 0.5 + 0.5, p.y * 0.25 + 0.5, p.z * 0.5 + 0.5)).rg; }
float sel(vec2 v) { return uChan == 0 ? v.r : v.g - 0.5; }
vec3 hot(float T) { return mix(mix(vec3(0.45, 0.04, 0.12), vec3(0.95, 0.25, 0.08), smoothstep(0.0, 0.5, T)), vec3(1.0, 0.85, 0.35), smoothstep(0.5, 1.0, T)); }
vec3 bg(vec3 d) { return mix(vec3(0.03, 0.03, 0.05), vec3(0.07, 0.06, 0.09), 0.5 + 0.5 * d.y); }
// THE LAMP (uGlass 1): the glass's profile in cells (glassR in lamp.js, line for line), the metal base below it and the
// cap above. Render units are cells / 8, the fluid's box [−1, 1] × [−2, 2] × [−1, 1]. A 4D lamp is the profile turned
// round the vertical axis with a 3-ball across: your slice at w from the axis meets every part of it at radius
// √(R² − w²), so its radius here is measured as √(ρ² + w²) (ρ the distance from the axis in your slice)
float glassR(float y) { return y < 9.0 ? 5.0 + 1.8 * (1.0 - pow((9.0 - y) / 9.0, 2.0)) : 6.8 - 3.6 * (y - 9.0) / 23.0; }
float baseR(float y) { return mix(5.4, 7.6, clamp(-y / 9.0, 0.0, 1.0)); }
float capR(float y) { return mix(3.6, 2.3, clamp((y - 32.0) / 6.0, 0.0, 1.0)); }
float rad(vec3 p) { return sqrt(dot(p.xz, p.xz) * 64.0 + gOff * gOff); }
float ycell(vec3 p) { return (p.y + 2.0) * 8.0; }
// the metal: base (y −9 … 0) and cap (32 … 38), as a distance in render units (approximate, fine for a march)
float sdMetal(vec3 p) {
  float y = ycell(p), r = rad(p);
  float b = max(r - baseR(y), max(y - 0.0, -9.0 - y)), c = max(r - capR(y), max(y - 38.0, 32.0 - y));
  return min(b, c) / 8.0;
}
vec3 shade(sampler3D s, vec4 vp, vec2 fc) {
  vec2 q = (2.0 * (fc - vp.xy) - vp.zw) / vp.w;
  vec3 d = normalize(uCF + q.x * uTan * uCR + q.y * uTan * uCU), inv = 1.0 / d;
  vec3 B0 = uGlass == 1 ? vec3(-1.0, -3.2, -1.0) : vec3(-1.0, -2.0, -1.0), B1 = uGlass == 1 ? vec3(1.0, 2.85, 1.0) : vec3(1.0, 2.0, 1.0);
  vec3 t0 = (B0 - uEye) * inv, t1 = (B1 - uEye) * inv, tn = min(t0, t1), tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z);
  vec3 c = bg(d);
  if (b <= max(a, 0.0)) return c;
  a = max(a, 0.0);
  vec3 L = normalize(vec3(0.4, 0.8, -0.3));
  float st = 6.0 / 300.0, t = a, glow = 0.0, liquid = 0.0, rimA = 0.0; bool wasIn = false;
  for (int i = 0; i < 320; i++) {
    vec3 p = uEye + d * t; float y = ycell(p);
    if (uGlass == 1) {
      // the metal: a hit
      if (sdMetal(p) < 0.0) {
        const float e = 0.01; vec3 n = normalize(vec3(sdMetal(p + vec3(e, 0, 0)) - sdMetal(p - vec3(e, 0, 0)), sdMetal(p + vec3(0, e, 0)) - sdMetal(p - vec3(0, e, 0)), sdMetal(p + vec3(0, 0, e)) - sdMetal(p - vec3(0, 0, e))));
        vec3 r = reflect(d, n); float env = 0.5 + 0.5 * r.y, sp = pow(max(dot(r, L), 0.0), 30.0), lam = max(dot(n, L), 0.0);
        vec3 metal = mix(vec3(0.25, 0.2, 0.12), vec3(0.95, 0.8, 0.5), env) * (0.35 + 0.65 * lam) + vec3(1.0) * sp * 0.8;
        // the bulb's light spilling up the inside of the base's rim
        metal += vec3(1.0, 0.5, 0.15) * 0.25 * smoothstep(-3.0, 0.0, y);
        return mix(metal, vec3(0.9, 0.4, 0.6) * 0.5, liquid * 0.5) + vec3(1.0, 0.85, 0.7) * rimA;
      }
      bool inG = y > 0.0 && y < 32.0 && rad(p) < glassR(y);
      // crossing the glass: a faint bright rim, strongest where you see it edge-on
      // (the glass's normal taken as straight out from the axis in your slice: brightest seen edge-on)
      if (inG != wasIn) { vec3 gn = normalize(vec3(p.x, 0.0, p.z) + 1e-6); rimA += 0.03 + 0.35 * pow(1.0 - abs(dot(gn, d)), 4.0); }
      wasIn = inG;
      if (!inG) { t += st; if (t > b) break; continue; }
    }
    vec2 v = at(s, p);
    if (sel(v) > uIso) {
      float lo = t - st, hi = t;
      for (int k = 0; k < 6; k++) { float m = 0.5 * (lo + hi); if (sel(at(s, uEye + d * m)) > uIso) hi = m; else lo = m; }
      vec3 ph = uEye + d * hi; const float e = 1.0 / 16.0;
      vec3 n = -normalize(vec3(sel(at(s, ph + vec3(e, 0, 0))) - sel(at(s, ph - vec3(e, 0, 0))), sel(at(s, ph + vec3(0, e, 0))) - sel(at(s, ph - vec3(0, e, 0))), sel(at(s, ph + vec3(0, 0, e))) - sel(at(s, ph - vec3(0, 0, e)))));
      float lam = max(dot(n, L), 0.0), rim = pow(1.0 - abs(dot(n, d)), 3.0), sp = pow(max(dot(reflect(d, n), L), 0.0), 20.0);
      // lit from below too, by the bulb
      float bulb = uGlass == 1 ? max(-n.y, 0.0) * 0.6 * exp(-ycell(ph) / 14.0) : 0.0;
      vec3 col = hot(at(s, ph).g) * (0.35 + 0.75 * lam + bulb) + vec3(1.0, 0.8, 0.6) * (rim * 0.2 + sp * 0.3);
      return mix(col, vec3(0.55, 0.25, 0.45), liquid * 0.35) + vec3(0.9, 0.35, 0.15) * glow + vec3(1.0, 0.9, 0.8) * rimA;
    }
    glow += 0.008 * v.g * v.g;
    if (uGlass == 1) liquid = min(1.0, liquid + 0.012);
    t += st; if (t > b) break;
  }
  // the liquid: in the lamp a violet glow, brighter toward the bulb; otherwise dark, warmed by what it holds
  vec3 base = uGlass == 1 ? mix(c, vec3(0.35, 0.16, 0.42), liquid * 0.8) : mix(c, vec3(0.12, 0.08, 0.16), 0.5);
  return base + vec3(0.9, 0.35, 0.15) * min(glow, 0.6) + vec3(1.0, 0.9, 0.8) * rimA;
}
void main() {
  vec2 fc = gl_FragCoord.xy; vec3 c;
  if (fc.x >= uVP3.x && fc.x < uVP3.x + uVP3.z && fc.y >= uVP3.y && fc.y < uVP3.y + uVP3.w) { gOff = uOffs.x; c = shade(uF3, uVP3, fc); }
  else { gOff = uOffs.y; c = shade(uF4, uVP4, fc); }
  o = vec4(pow(c, vec3(0.9)), 1.0);
}`;
const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
const U = {}; for (const n of ["uF3", "uF4", "uVP3", "uVP4", "uEye", "uCR", "uCU", "uCF", "uTan", "uIso", "uChan", "uOffs", "uGlass"]) U[n] = gl.getUniformLocation(prog, n);
/* two RG16F textures (φ, T): half floats filter linearly on every WebGL2 phone. Across, they wrap (the lamp's sides are
   periodic); up and down they clamp (the floor and ceiling are walls) */
const texs = [0, 1].map((unitI) => {
  const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unitI); gl.bindTexture(gl.TEXTURE_3D, t);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.REPEAT], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.REPEAT]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RG16F, NH, NY, NH, 0, gl.RG, gl.FLOAT, new Float32Array(NH * NY * NH * 2).fill(-1));
  return t;
});
gl.uniform1i(U.uF3, 0); gl.uniform1i(U.uF4, 1);
function upload(i, field) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_3D, texs[i]); gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, NH, NY, NH, gl.RG, gl.FLOAT, field); }

/* ------------------------------------------------------------------ the runs */
const sel = { preset: "lamp", paused: false, seed: 1 };
// (for trying settings: ?phys={"mob":0.05} overrides the preset's physics)
// (and ?threads=1 caps the 4D lamp's threads, for comparing; both read once, before the page rewrites its URL)
const THREADS_OVER = +new URLSearchParams(location.search).get("threads") || 0;
const PHYS_OVER = (() => { try { return JSON.parse(new URLSearchParams(location.search).get("phys") || "{}"); } catch (e) { return {}; } })();
const W = { 3: new Worker("js/worker.js", { type: "module" }), 4: new Worker("js/worker.js", { type: "module" }) };
const S = { 3: null, 4: null }, hist = { 3: [], 4: [] }, gens = { 3: 0, 4: 0 };
for (const D of [3, 4]) W[D].onmessage = (e) => {
  const m = e.data; if (m.gen !== gens[D]) return;
  upload(D - 3, m.field); S[D] = m.stats; if (D === 4) W[3].postMessage({ type: "cap", t: m.stats.t + 1e-9 });
  const h = hist[D]; if (!h.length || m.stats.t > h[h.length - 1].t + 1e-9) h.push({ ...m.stats });
};
function start() { for (const D of [3, 4]) { gens[D]++; hist[D] = []; S[D] = null; W[D].postMessage({ type: "start", D, preset: sel.preset, seed: sel.seed, phys: PHYS_OVER, threads: THREADS_OVER }); W[D].postMessage({ type: "run", v: !sel.paused }); } sendSlice(); }

/* ------------------------------------------------------------------ the slice (4D: across only) and the camera */
const frame = { E0: [1, 0, 0], E2: [0, 1, 0], N: [0, 0, 1], off: 0 };
function tilt(which, ang) { // turn E0 or E2 toward N, in the 3-space across (x, z, w)
  const A = frame[which], c = Math.cos(ang), s = Math.sin(ang), a2 = A.map((v, i) => c * v + s * frame.N[i]), n2 = frame.N.map((v, i) => c * v - s * A[i]);
  frame[which] = unit(a2); frame.N = unit(n2);
  const B = [frame.E0, frame.E2, frame.N]; for (let i = 0; i < 3; i++) { for (let j = 0; j < i; j++) B[i] = add(B[i], B[j], -dot(B[i], B[j])); B[i] = unit(B[i]); } [frame.E0, frame.E2, frame.N] = B;
}
const squareUp = () => { Object.assign(frame, { E0: [1, 0, 0], E2: [0, 1, 0], N: [0, 0, 1], off: 0 }); sendSlice(); };
let sliceSent = 0;
function sendSlice() { sliceSent = performance.now(); W[4].postMessage({ type: "slice", slice: { E0: frame.E0, E2: frame.E2, N: frame.N, off: frame.off } }); }
const view = { az: 0.7, el: 0.25, dist: 7.4 };
function camera() { const { az, el, dist } = view, ty = sel.preset === "lamp" ? -0.18 : 0, eye = [-dist * Math.cos(el) * Math.sin(az), ty + dist * Math.sin(el), -dist * Math.cos(el) * Math.cos(az)], F = unit([-eye[0], ty - eye[1], -eye[2]]), R = unit([F[2], 0, -F[0]]); return { eye, F, R, U: cross(F, R) }; }

/* ------------------------------------------------------------------ captions */
const PAIR = `<span class="pair">wax and liquid, <b>immiscible</b> (PHASELAB's pair): cold wax a little denser, hot wax lighter</span>`;
const CAPS = {
  lamp: `${PAIR}<b>The lamp</b>, the classic shape: a glass swelling a little above its base and tapering to the cap, on a metal cone. Ours on the left; the 4D lamp's is the same profile turned round the vertical axis with a <b>3-ball</b> across instead of a disc. So your slice at w from the axis meets every part of it at radius √(R² − w²): move the lever and the whole lamp <b>slims</b>, the narrow cap going first, the wax with it. Inside, the same physics in both: the heater warms the wax, it rises in a thin hot stream, gathers into a blob in the cool upper glass, and the blob sinks back. A lamp cycles because its blobs lag behind their surroundings, staying hot on the way up and cold on the way down. A 4D blob trades heat faster, so its lag is shorter.`,
  thread: `${PAIR}<b>A thread</b> of wax, floor to ceiling, rippled (no gravity, no heater: only its surface acts). A thread breaks into drops when its ripple is long enough: in 3D when kR < 1 (Plateau and Rayleigh), but in 4D when <b>kR &lt; √2</b>, because its surface curves two ways round it, not one, so the squeeze that pinches a neck is stronger. This ripple is kR = 1.18, between the two: ours <b>straightens</b>, the 4D one <b>pinches off</b>. A blob leaving a 4D lamp's pool lets go sooner.`,
  cooling: `<span class="pair">no wax: a hot ball of the liquid in the cold</span><b>Cooling.</b> A ball of radius 5 at T = 1 in liquid at 0, no flow: how fast its heat leaves. A 4D ball has 4/3 the surface for its volume, and its heat spreads into a bigger neighbourhood: it loses half its heat in about <b>half the time</b>. (Held at a fixed temperature on its surface it would be 1.49× faster: the ratio of the two balls' slowest modes. Losing heat to its surroundings, as a blob does, it's more.)`,
};
let capTimer = 0;
function caption() { $("cap").innerHTML = CAPS[sel.preset]; $("cap").classList.remove("min"); clearTimeout(capTimer); capTimer = setTimeout(() => $("cap").classList.add("min"), 12000); }
// (the caption folds itself after 12 s: the lamps are what to look at; tap it to read it again)
$("cap").onclick = () => $("cap").classList.toggle("min");
/* what's drawn solid: the wax (φ > 0); for cooling, with no wax, the liquid hotter than T = 0.25 (sel() is T − 0.5) */
function look(p) { gl.uniform1f(U.uIso, p === "cooling" ? -0.25 : 0); gl.uniform1i(U.uChan, p === "cooling" ? 1 : 0); gl.uniform1i(U.uGlass, p === "lamp" ? 1 : 0); view.dist = p === "lamp" ? 8.8 : 7.4; }
function setPreset(p) { sel.preset = p; look(p); for (const b of document.querySelectorAll("#exps button[data-x]")) b.classList.toggle("on", b.dataset.x === p); caption(); history.replaceState(null, "", `?p=${p}`); start(); }
for (const b of document.querySelectorAll("#exps button[data-x]")) b.onclick = () => setPreset(b.dataset.x);
$("againB").onclick = () => { sel.seed++; start(); };
$("pauseB").onclick = () => { sel.paused = !sel.paused; $("pauseB").classList.toggle("on", sel.paused); for (const D of [3, 4]) W[D].postMessage({ type: "run", v: !sel.paused }); };
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
glc.addEventListener("pointermove", (e) => { const g = drags.get(e.pointerId); if (!g) return; view.az -= (e.clientX - g.x) * 0.007; view.el = Math.max(-1.2, Math.min(1.2, view.el + (e.clientY - g.y) * 0.007)); g.x = e.clientX; g.y = e.clientY; });
for (const ev of ["pointerup", "pointercancel"]) glc.addEventListener(ev, (e) => drags.delete(e.pointerId));
glc.addEventListener("wheel", (e) => { view.dist = Math.max(4, Math.min(14, view.dist * Math.exp(e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => e.preventDefault());

/* ------------------------------------------------------------------ the loop */
const TAN = 0.42;
let last = performance.now(), res = 0, layout = null;
function draw(now) {
  requestAnimationFrame(draw);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const kv = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0), tx = pads.tw[0] + kv("l", "j"), ty = pads.tw[1] + kv("i", "k"), an = pads.an + kv("r", "f"), r = (40 * Math.PI) / 180;
  if (tx || ty || an) { if (tx) tilt("E0", tx * r * dt); if (ty) tilt("E2", ty * r * dt); if (an) frame.off = Math.max(-8, Math.min(8, frame.off + an * 4 * dt)); if (now - sliceSent > 50) sendSlice(); }
  const dpr = Math.min(1.5, devicePixelRatio || 1); if (!res) res = dpr * (matchMedia("(pointer: coarse)").matches ? 0.6 : 0.8);
  const cw = Math.round(glc.clientWidth * res), chh = Math.round(glc.clientHeight * res); if (glc.width !== cw || glc.height !== chh) { glc.width = cw; glc.height = chh; }
  const tall = chh > cw * 1.1, plot = Math.round(chh * (tall ? 0.18 : 0.24)), top = Math.round(chh * 0.08);
  const vp3 = tall ? [0, plot + (chh - plot - top) / 2, cw, (chh - plot - top) / 2] : [0, plot, cw / 2, chh - plot - top], vp4 = tall ? [0, plot, cw, (chh - plot - top) / 2] : [cw / 2, plot, cw / 2, chh - plot - top];
  layout = { tall, vp3, vp4, plot: plot / res, res };
  gl.viewport(0, 0, cw, chh); gl.uniform2f(U.uOffs, 0, frame.off); gl.uniform4fv(U.uVP3, vp3); gl.uniform4fv(U.uVP4, vp4); gl.uniform1f(U.uTan, TAN);
  const cam = camera(); gl.uniform3fv(U.uEye, cam.eye); gl.uniform3fv(U.uCR, cam.R); gl.uniform3fv(U.uCU, cam.U); gl.uniform3fv(U.uCF, cam.F);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  overlay();
}
const fmt = (x, n = 2) => (x == null || !isFinite(x) ? "–" : x.toFixed(n));
/* the lamp's cycle: the mean time between blobs coming down, a piece's height falling through 0.4 of the lamp's (the
   wax goes up as a thin hot stream, gathers into a cool blob at the top, and the blob sinks back to the pool: the
   sinking is the clear event) */
function cycle(h) {
  const downs = []; let prevTop = 0;
  for (let i = 0; i < h.length; i++) { const bl = h[i].blobs || [], top = Math.max(0, ...bl.filter((b) => b.n > 30 && b.y < 0.9).map((b) => b.y)); if (prevTop >= 0.4 && top < 0.4 && top > 0 && h[i].t > 40) downs.push(h[i].t); prevTop = top; }
  return downs.length >= 2 ? (downs[downs.length - 1] - downs[0]) / (downs.length - 1) : null;
}
function halfLife(h) { for (let i = 1; i < h.length; i++) if (h[i].heat <= 0.5 && h[i - 1].heat > 0.5) { const a = h[i - 1], b = h[i]; return a.t + ((a.heat - 0.5) / (a.heat - b.heat)) * (b.t - a.t); } return null; }
function readout(D) {
  const s = S[D]; if (!s) return ["starting…"];
  const l = [`t ${s.t.toFixed(0)} · ${s.rate.toFixed(1)} steps/s${s.threads > 1 ? ` on ${s.threads} threads` : ""} · ${D === 3 ? "16 × 32 × 16" : "16 × 32 × 16 × 16"} cells`];
  if (sel.preset === "lamp") { const c = cycle(hist[D]); l.push(`${s.pieces} piece${s.pieces === 1 ? "" : "s"} of wax · ${(s.aloft * 100).toFixed(0)}% of it above half height · its temperature ${fmt(s.Twax)}`, `a blob comes down every ${c ? c.toFixed(0) + " time units" : "(counting…)"}`); }
  if (sel.preset === "thread") { const kR = (Math.PI * 3 * 4) / 32; l.push(`kR ${kR.toFixed(2)} (breaks if under ${D === 3 ? "1" : "√2 = 1.41"}) · ripple ${fmt(s.amp, 3)} · ${s.pinched ? "pinched off into drops" : s.t > 30 && hist[D].length > 3 && s.amp < hist[D][2].amp ? "straightening" : "…"}`); }
  if (sel.preset === "cooling") { const hl = halfLife(hist[D]); l.push(`heat still in the ball ${(100 * (s.heat ?? 0)).toFixed(0)}% · half gone ${hl ? "by t " + hl.toFixed(1) : "…"}`); }
  return l;
}
function overlay() {
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.font = "11px ui-monospace, Menlo, monospace";
  if (!layout) return;
  const k = 1 / layout.res, cam = camera();
  for (const [D, vp] of [[3, layout.vp3], [4, layout.vp4]]) {
    const x0 = vp[0] * k, yTop = h - (vp[1] + vp[3]) * k, pw = vp[2] * k, ph = vp[3] * k;
    const P = (p) => { const r = add(p, cam.eye, -1), z = dot(r, cam.F); return [x0 + pw / 2 + (dot(r, cam.R) / z / TAN) * (ph / 2), yTop + ph / 2 - (dot(r, cam.U) / z / TAN) * (ph / 2)]; };
    g.strokeStyle = sel.preset === "lamp" ? "rgba(0,0,0,0)" : "rgba(233,228,218,0.25)"; g.lineWidth = 1; g.beginPath();
    for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) { const c = (i) => [i & 1 ? 1 : -1, i & 2 ? 2 : -2, i & 4 ? 1 : -1]; g.moveTo(...P(c(a))); g.lineTo(...P(c(b))); }
    g.stroke();
    g.font = "11px ui-monospace, Menlo, monospace";
    const wmax = pw - (D === 4 ? 130 : 20), lines = readout(D).flatMap((l) => (g.measureText(l).width < wmax ? [l] : l.split(" · ")));
    g.fillStyle = "rgba(233,228,218,0.85)"; lines.forEach((l, i) => g.fillText(l, x0 + 10, yTop + ph - 8 - 14 * (lines.length - 1 - i)));
    g.fillStyle = D === 3 ? "#e9e4da" : "#ffd27a"; g.font = "600 12px ui-monospace, Menlo, monospace";
    g.fillText(D === 3 ? "3D · the whole lamp" : `4D · your slice of it${frame.off ? ` (${frame.off >= 0 ? "+" : ""}${frame.off.toFixed(1)} ana)` : ""}`, x0 + 10, yTop + ph - 12 - 14 * lines.length);
  }
  chart(g, 0, h - layout.plot, w, layout.plot);
  const tw = $("twist"), an = $("ana"), x4 = layout.vp4[0] * k, y4 = h - (layout.vp4[1] + layout.vp4[3]) * k, pw4 = layout.vp4[2] * k, ph4 = layout.vp4[3] * k;
  tw.style.left = `${x4 + pw4 - 176}px`; tw.style.top = `${y4 + ph4 - 120}px`; an.style.left = `${x4 + pw4 - 58}px`; an.style.top = `${y4 + ph4 - 136}px`;
}
function chart(g, x, y, w, h) {
  g.fillStyle = "rgba(7,8,12,0.75)"; g.fillRect(x, y, w, h);
  const pad = { l: 44, r: 12, t: 18, b: 22 }, X0 = x + pad.l, X1 = x + w - pad.r, Y0 = y + h - pad.b, Y1 = y + pad.t, col = { 3: "#e9e4da", 4: "#ffd27a" }, P = sel.preset;
  const spec = P === "lamp" ? { title: "every piece of wax: its height (as a share of the lamp's) over time, its size as the dot's", blobs: true, y: [0, 1], x: [0, 400] }
    : P === "thread" ? { title: "the thread's ripple (relative): 3D smooths it out, 4D pinches off", f: (e) => e.amp, y: [0, 2], x: [0, 300] }
    : { title: "heat still in the ball (dashed: half)", f: (e) => e.heat, y: [0, 1], x: [0, 80], lines: [0.5] };
  g.fillStyle = "rgba(233,228,218,0.8)"; g.fillText(spec.title, X0, Y1 - 5);
  const last = Math.max(spec.x[1], ...[3, 4].map((D) => (hist[D].length ? hist[D][hist[D].length - 1].t : 0))), x1 = P === "lamp" ? Math.max(spec.x[1], last) : spec.x[1], x0 = P === "lamp" ? Math.max(0, x1 - spec.x[1]) : 0;
  const tx = (t) => X0 + ((t - x0) / (x1 - x0)) * (X1 - X0), ty = (v) => Y0 - ((v - spec.y[0]) / (spec.y[1] - spec.y[0])) * (Y0 - Y1);
  g.strokeStyle = "rgba(233,228,218,0.3)"; g.lineWidth = 1; g.strokeRect(X0, Y1, X1 - X0, Y0 - Y1);
  g.fillStyle = "rgba(233,228,218,0.6)"; g.fillText(String(spec.y[1]), x + 6, Y1 + 8); g.fillText(String(spec.y[0]), x + 6, Y0); g.fillText(`t ${x1.toFixed(0)}`, X1 - 50, Y0 + 15);
  g.setLineDash([4, 4]); for (const v of spec.lines || []) { g.strokeStyle = "rgba(233,228,218,0.4)"; g.beginPath(); g.moveTo(X0, ty(v)); g.lineTo(X1, ty(v)); g.stroke(); } g.setLineDash([]);
  if (spec.blobs) {
    // a dot per piece per sample: the stream going up is too thin to count; the blobs coming down are the cycle
    for (const D of [3, 4]) { g.fillStyle = col[D]; for (const e of hist[D]) { if (e.t < x0) continue; for (const b of e.blobs || []) { g.globalAlpha = 0.25 + 0.6 * Math.min(1, b.n / 150); g.beginPath(); g.arc(tx(e.t) + (D === 4 ? 1.5 : -1.5), ty(b.y), 1 + Math.min(3.5, Math.sqrt(b.n) / 5), 0, 7); g.fill(); } } g.globalAlpha = 1; g.fillText(`${D}D`, X1 - (D === 3 ? 60 : 30), Y1 + 12); }
    return;
  }
  for (const D of [3, 4]) {
    g.strokeStyle = col[D]; g.lineWidth = 2; g.beginPath(); let on = false;
    for (const e of hist[D]) { const v = spec.f(e); if (v == null || !isFinite(v) || e.t < x0) { on = false; continue; } const px = tx(e.t), py = Math.max(Y1, Math.min(Y0, ty(v))); if (on) g.lineTo(px, py); else g.moveTo(px, py); on = true; }
    g.stroke(); g.fillStyle = col[D]; g.fillText(`${D}D`, X1 - (D === 3 ? 60 : 30), Y1 + 12);
  }
}

/* ------------------------------------------------------------------ start */
const Q = new URLSearchParams(location.search);
setPreset(CAPS[Q.get("p")] ? Q.get("p") : "lamp");
if (matchMedia("(orientation: portrait)").matches) $("cap").classList.add("min");
requestAnimationFrame(draw);
window.LAVALAMP = { sel, S, hist, frame, view, setPreset, sendSlice };
