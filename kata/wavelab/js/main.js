/* WAVELAB — the page. The water is solved in ./worker.js (./waves.js: every plane wave turned at its own ω, exact),
   and drawn twice from one 3D texture of the surface's height:
     YOUR SLICE: the water as you'd see it standing in a 3D slice of the 4D world: a 2D surface, the slice's plane
       through the 3D water surface (a free frame: twisted into w by the pad, moved ana and kata by the lever), ray-marched
       as a height field, with the corks your slice cuts;
     THE WHOLE SURFACE: the 3D water surface itself, one period of it (48 m a side, x and z across, w up), crests teal
       and troughs rose, volume-rendered, with your slice the bright plane through its middle.
   The chart compares a pebble on kata's water with the same pebble on ours (a 2D surface), along a ray from it. */
import { omega, G } from "./waves.js";
const N3 = 64, DX = 0.75, L = N3 * DX, C = [L / 2, L / 2, L / 2];
const $ = (id) => document.getElementById(id), glc = $("gl"), ov = $("ov");
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* ------------------------------------------------------------------ GL */
const gl = glc.getContext("webgl2", { antialias: false });
if (!gl) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">WAVELAB needs WebGL2.</p>`; throw new Error("no WebGL2"); }
const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; precision highp sampler3D;
uniform sampler3D uEta; uniform float uL, uExag, uAmp, uTan, uGain; uniform int uMode;
uniform vec4 uVP; uniform vec3 uO, uA, uB, uN, uC, uEye, uCR, uCU, uCF;
uniform int uNCork; uniform vec4 uCork[24]; // each cork in your slice's own coordinates: (u, y, v) and δ, how far ana of the slice it is
out vec4 o;
// the surface's height at g (x, z, w), periodic: the texture repeats as the water does
float eta(vec3 g) { return texture(uEta, g / uL + 0.5 / 64.0).r; }
vec3 sky(vec3 d) { vec3 s = normalize(vec3(0.4, 0.45, -0.75)); return mix(vec3(0.78, 0.83, 0.92), vec3(0.28, 0.46, 0.85), smoothstep(0.0, 0.6, d.y)) + vec3(1.0, 0.88, 0.66) * (pow(max(dot(d, s), 0.0), 600.0) * 4.0 + pow(max(dot(d, s), 0.0), 8.0) * 0.2); }
float H(vec2 p) { return uExag * eta(uO + p.x * uA + p.y * uB); }
void main() {
  vec2 q = (2.0 * (gl_FragCoord.xy - uVP.xy) - uVP.zw) / uVP.w;
  vec3 d = normalize(uCF + q.x * uTan * uCR + q.y * uTan * uCU), c;
  if (uMode == 0) { // your slice: (u, y, v), the water y = height at uO + u uA + v uB
    if (d.y > -0.003) c = sky(d);
    else {
      float t = -uEye.y / d.y;
      for (int i = 0; i < 8; i++) { vec3 p = uEye + d * t; t = (H(p.xz) - uEye.y) / d.y; }
      vec3 p = uEye + d * t; const float e = 0.2;
      vec3 n = normalize(vec3(-(H(p.xz + vec2(e, 0.0)) - H(p.xz - vec2(e, 0.0))) / (2.0 * e), 1.0, -(H(p.xz + vec2(0.0, e)) - H(p.xz - vec2(0.0, e))) / (2.0 * e)));
      float v = eta(uO + p.x * uA + p.z * uB) / max(uAmp, 1e-5), fr = 0.03 + 0.97 * pow(1.0 - max(dot(-d, n), 0.0), 5.0);
      vec3 base = mix(vec3(0.01, 0.06, 0.11), vec3(0.06, 0.34, 0.4), clamp(0.5 + 0.7 * v, 0.0, 1.0)) + vec3(0.5, 0.95, 0.9) * smoothstep(0.3, 0.8, v) * 0.5 + vec3(0.7, 0.2, 0.45) * smoothstep(0.3, 0.8, -v) * 0.35;
      c = mix(base, sky(reflect(d, n)), fr * 0.6);
      vec2 g = abs(fract(p.xz / 4.0 + 0.5) - 0.5) * 4.0; float fw = max(fwidth(p.x), fwidth(p.z)); // a line every 4 m
      c = mix(c, vec3(0.85), (1.0 - smoothstep(0.0, fw * 1.3, min(g.x, g.y))) * 0.1 * exp(-t / 60.0));
      c = mix(c, sky(d) * 0.95, max(1.0 - exp(-t / 120.0), smoothstep(17.0, 24.0, length(p.xz)))); // one period shown: the water wraps round 24 m out, so it fades into mist there
    }
    // the corks: 4D balls, so your slice cuts each in a ball that shrinks as the cork moves out of it, and is gone when
    // it's more than its radius away; tinted teal or rose by which way it's going
    float tw = d.y < -0.003 ? -uEye.y / d.y : 1e9; const float CR = 0.55;
    for (int i = 0; i < 24; i++) {
      if (i >= uNCork) break;
      vec4 k = uCork[i]; if (abs(k.w) >= CR) continue;
      float rho = sqrt(CR * CR - k.w * k.w); vec3 oc = uEye - k.xyz; float b = dot(oc, d), cc = dot(oc, oc) - rho * rho, hh = b * b - cc;
      if (hh < 0.0) continue;
      float tk = -b - sqrt(hh); if (tk <= 0.0 || tk > tw + 0.6) continue;
      vec3 p = uEye + d * tk; if (p.y < uExag * eta(uO + p.x * uA + p.z * uB)) continue; // under the water
      vec3 n = normalize(p - k.xyz); float lam = max(dot(n, normalize(vec3(0.4, 0.6, -0.7))), 0.0);
      vec3 base = (p.y > k.y ? vec3(0.95, 0.3, 0.15) : vec3(0.95, 0.93, 0.88)); base = mix(base, k.w > 0.0 ? vec3(0.25, 1.0, 0.88) : vec3(1.0, 0.42, 0.7), smoothstep(0.1, 0.5, abs(k.w) / CR));
      c = base * (0.35 + 0.75 * lam); tw = tk;
    }
  } else { // the whole surface: a box one period across round the slice's origin; display (X, Y, Z) = (x, w, z)
    // the box is one period round the middle of the water (uC); your slice the plane through uO across uN
    vec3 bg = vec3(0.03, 0.035, 0.05) + 0.03 * q.y, inv = 1.0 / d, h = vec3(0.5 * uL), t0v = (-h - uEye) * inv, t1v = (h - uEye) * inv;
    vec3 tmin = min(t0v, t1v), tmax = max(t0v, t1v); float t0 = max(max(tmin.x, tmin.y), max(tmin.z, 0.0)), t1 = min(min(tmax.x, tmax.y), tmax.z);
    c = bg;
    if (t1 > t0) {
      vec3 Nd = vec3(uN.x, uN.z, uN.y), Od = vec3(uO.x - uC.x, uO.z - uC.z, uO.y - uC.y); float tp = dot(Od - uEye, Nd) / dot(d, Nd); // where the ray crosses your slice
      vec3 acc = vec3(0.0); float A = 0.0; const int S = 120; float dt = (t1 - t0) / float(S);
      for (int i = 0; i < S; i++) {
        float ts = t0 + float(i) * dt;
        vec3 P = uEye + d * (ts + 0.5 * dt); float v = eta(uC + vec3(P.x, P.z, P.y)) / max(uAmp, 1e-5);
        float m = smoothstep(0.3, 0.75, abs(v)), a = clamp(m * 0.5 * uGain * dt, 0.0, 1.0); // full colour; how high it stands sets how opaque
        acc += (1.0 - A) * a * (v > 0.0 ? vec3(0.3, 1.0, 0.88) : vec3(1.0, 0.42, 0.7)) * 1.2; A += (1.0 - A) * a;
        if (A > 0.97) break;
      }
      c = acc + (1.0 - A) * bg;
      // your slice, over everything (it's what you're looking for in a busy sea), painted with the water's height there
      if (tp > t0 && tp < t1) { vec3 P = uEye + d * tp; float v = eta(uC + vec3(P.x, P.z, P.y)) / max(uAmp, 1e-5); c = mix(c, mix(vec3(0.08, 0.2, 0.36), vec3(0.95, 0.97, 1.0), clamp(0.5 + 0.5 * v, 0.0, 1.0)), 0.55); }
    }
  }
  o = vec4(c / (1.0 + 0.1 * c), 1.0);
}`;
const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
const U = {}; for (const n of ["uC", "uNCork", "uCork", "uGain", "uEta", "uL", "uExag", "uAmp", "uTan", "uMode", "uVP", "uO", "uA", "uB", "uN", "uEye", "uCR", "uCU", "uCF"]) U[n] = gl.getUniformLocation(prog, n);
const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, tex);
gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16F, N3, N3, N3, 0, gl.RED, gl.FLOAT, null);
for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.REPEAT], [gl.TEXTURE_WRAP_T, gl.REPEAT], [gl.TEXTURE_WRAP_R, gl.REPEAT]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
gl.uniform1i(U.uEta, 0); gl.uniform1f(U.uL, L); gl.uniform3fv(U.uC, C); gl.uniform1f(U.uGain, +new URLSearchParams(location.search).get("gain") || 1);

/* ------------------------------------------------------------------ the water (in the worker) */
const W = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
const S = { t: 0, max: 0, amp: 0.05, prof3: null, prof2: null, h: Infinity, busy: false, lastTick: performance.now(), fresh: false };
W.onmessage = (e) => {
  const m = e.data; gl.bindTexture(gl.TEXTURE_3D, tex); gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, N3, N3, N3, gl.RED, gl.FLOAT, m.eta);
  S.corks = m.corks || []; Object.assign(S, { t: m.t, max: m.max, prof3: m.prof3 || S.prof3, prof2: m.prof2 || S.prof2, busy: false, fresh: true }); if (!m.prof3) { S.prof3 = null; S.prof2 = null; }
};
function tick() { if (S.busy) return; const now = performance.now(), dt = Math.min(0.1, (now - S.lastTick) / 1000); S.lastTick = now; S.busy = true; W.postMessage({ type: "tick", dt: FIXED || dt }); }
const send = (m) => W.postMessage(m);

/* ------------------------------------------------------------------ the slice */
/* your slice is a free frame in the 3D water surface: A (right) and B (forward) span it, N (ana) is the way it can't
   see, O its origin. Twisting turns A or B toward N (and N away); moving slides O along N (ana, kata) or along A and B.
   The water is periodic, so O is kept within the period round the middle */
const view = { az: 0.35, el: 0.7, dist: 34, vaz: 0.75, vel: 0.42, vdist: 2.05 * L };
const frame = { A: [1, 0, 0], B: [0, 1, 0], N: [0, 0, 1], O: C.slice() };
const slice = () => frame;
function wrapO() { frame.O = frame.O.map((v, i) => C[i] + ((((v - C[i] + L / 2) % L) + L) % L) - L / 2); }
function twist(which, ang) { // turn A (which = "A") or B toward N by ang radians
  const X = frame[which], N = frame.N, c = Math.cos(ang), s = Math.sin(ang);
  frame[which] = add(X.map((v) => v * c), N, s); frame.N = add(N.map((v) => v * c), X, -s);
  // keep it orthonormal: A, then B off A, then N = the rest
  frame.A = unit(frame.A); frame.B = unit(add(frame.B, frame.A, -dot(frame.B, frame.A))); const n = add(add(frame.N, frame.A, -dot(frame.N, frame.A)), frame.B, -dot(frame.N, frame.B)); frame.N = unit(n);
}
function moveO(dA, dB, dN) { frame.O = add(add(add(frame.O, frame.A, dA), frame.B, dB), frame.N, dN); wrapO(); }
function squareUp() { Object.assign(frame, { A: [1, 0, 0], B: [0, 1, 0], N: [0, 0, 1], O: C.slice() }); }
/* the frame as the experiments set it: square, then the forward axis tilted into w, then moved ana */
function setSlice(tilt, off) { squareUp(); twist("B", (tilt * Math.PI) / 180); moveO(0, 0, off); caption(); }
function camera(az, el, dist) { const eye = [-dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), -dist * Math.cos(el) * Math.cos(az)], F = unit(eye.map((x) => -x)), R = unit([F[2], 0, -F[0]]), Up = cross(F, R); return { eye, F, R, U: Up }; }

/* ------------------------------------------------------------------ experiments */
const DEPTHS = [Infinity, 2, 0.6, 0.25], DEPTH_TXT = ["deep", "2 m", "60 cm", "25 cm"], SPEEDS = [0.25, 0.5, 1, 1.5, 2];
let exp = null, rain = false, nextRain = 0, swellN = null;
function setDepth(i) { $("depth").value = i; S.h = DEPTHS[i]; send({ type: "depth", h: DEPTHS[i] }); $("depthV").textContent = DEPTH_TXT[i]; }
const CAPS = {
  pebble: () => "A pebble, in your slice. Here it makes a <b>ring</b>; on the whole surface (the other view) it's a <b>sphere</b>, and your slice is its equator. It fades faster than ours (the chart): its energy spreads over a sphere's area, growing as r², not a circle's, growing as r.",
  out: () => "A pebble <b>6 m ana</b> of your slice. Nothing; then a ring appears from nowhere: the sphere has reached your slice. It grows as more of the sphere crosses, and fades. Push the lever ana (or R) to stand where it fell, 6 m off.",
  shallow: () => "Shallow water (25 cm): every wave length travels at √(gh), 1.6 m/s. On kata's water the pulse is a clean <b>shell with flat water behind it</b>; on ours (grey, in the chart) it leaves a tail. That's Huygens' principle: sharp in odd dimensions (kata's surface is 3D), not in even ones (ours is 2D).",
  swell: () => { const k = swellN.map((n) => (2 * Math.PI * n) / L), kk = Math.hypot(...k), w = omega(kk, S.h), s = slice(), ks = Math.hypot(dot(k, s.A), dot(k, s.B)), wf = omega(ks, S.h) / Math.max(ks, 1e-9), ang = (Math.acos(Math.min(1, ks / kk)) * 180) / Math.PI;
    return `A plane wave, ${(2 * Math.PI / kk).toFixed(1)} m long at ${(w / kk).toFixed(1)} m/s, travelling <b>${ang.toFixed(0)}° out of your slice</b>, toward ana. In your slice its crests look <b>${(2 * Math.PI / ks).toFixed(1)} m</b> apart and sweep along at <b>${(w / ks).toFixed(1)} m/s</b>: faster than a wave ${(2 * Math.PI / ks).toFixed(1)} m long travels on this water (${wf.toFixed(1)} m/s). Too fast for its length is how swell from out of your slice gives itself away. Twist your slice ${ang.toFixed(0)}° into w (the pad, up) and it's an ordinary wave again.`; },
  s: () => "A <b>standing wave</b> of one frequency: every wave in it has the same length, arriving from every direction alike. In space it's a ball of rings, j₀(kr): the <b>s orbital</b>. The water in a round 4D pond sloshes in these shapes.",
  p: () => "The same, the directions weighted by cos θ about an axis tilted half into w: the <b>p orbital</b>, two lobes, opposite in phase. Your slice cuts it off its axis: move ana with the lever and twist with the pad to find the lobes.",
  d: () => "Weighted by (3cos²θ − 1)/2 about w: the <b>d orbital</b>. Its axis is w itself, so your slice, through its middle, sees only its waist ring; move ana or kata with the lever and the lobes appear.",
  sea: () => "A <b>rough sea</b>: sixty plane waves, 4 to 16 m long, from every direction the surface has, a sphere of them. Put the corks in: they're tossed into w as much as across your slice, so they come and go.",
  corks: () => "<b>Corks.</b> Each is pushed the way the water at the surface is: down its slope, <b>a = −g∇η</b>, in all three of the surface's directions. The arrow is the push within your slice, the tick beside it the push <b style='color:#38f2e0'>ana</b> or <b style='color:#ff66b8'>kata</b>. A cork carried out of your slice shrinks and is gone: it's a 4D ball, and you see the ball your slice cuts from it. Rings mark the ones just out of view.",
  rain: () => "Rain across the whole surface. Most drops land out of your slice, so their rings appear in it from nothing, and grow, and go.",
  clear: () => "Tap the water to drop a pebble. Drag either view to look round. The pad (bottom left) twists your slice into w, the lever (bottom right) moves it ana and kata; ⊞ squares it up again.",
};
$("cap").onclick = () => $("cap").classList.toggle("min"); // a tap folds the caption to a line, and back
function caption() { $("cap").innerHTML = (exp === "swell" && !swellN ? CAPS.clear : CAPS[exp] || CAPS.clear)(); }
/* where your slice is: its normal (the way it can't see) in x, z, w, how far that's turned from w, and how far ana of the middle its origin is */
function frameText() { const N = frame.N, ang = (Math.acos(Math.min(1, Math.abs(N[2]))) * 180) / Math.PI, o = dot(add(frame.O, C, -1), N); return `N (${N.map((v) => v.toFixed(2)).join(", ")}) · ${ang.toFixed(0)}° from w · ${o >= 0 ? "+" : ""}${o.toFixed(1)} m ana`; }
/* corks: 24 dropped across your slice as it is, at rest */
let corksOn = false;
function scatter() { const s = slice(), xs = []; for (let i = 0; i < 24; i++) xs.push(add(add(s.O, s.A, -11 + 22 * Math.random()), s.B, -11 + 22 * Math.random())); send({ type: "corks", x: xs }); corksOn = true; $("corkB").classList.add("on"); }
function run(x) {
  if (x === "corks") { if (corksOn) { send({ type: "corks", x: [] }); corksOn = false; $("corkB").classList.remove("on"); S.corks = []; } else { scatter(); exp = "corks"; caption(); } return; }
  if (x === "rain") { rain = !rain; $("rainB").classList.toggle("on", rain); if (rain) { exp = "rain"; caption(); } return; }
  rain = false; $("rainB").classList.remove("on");
  send({ type: "clear" }); swellN = null; exp = x;
  const s = slice();
  if (x === "pebble") { setDepth(0); setSlice(0, 0); send({ type: "drop", x: slice().O, a: 0.3, sigma: 1.2, compare: true }); }
  else if (x === "out") { setDepth(0); setSlice(0, 0); send({ type: "drop", x: add(slice().O, slice().N, 6), a: 0.3, sigma: 1.2, compare: true }); }
  else if (x === "shallow") { setDepth(3); setSlice(0, 0); send({ type: "drop", x: slice().O, a: 0.3, sigma: 1.2, compare: true }); }
  else if (x === "swell") { setDepth(0); setSlice(0, 0); swellN = [3, 0, 4]; send({ type: "swell", n: swellN, a: 0.12 }); }
  else if (x === "sea") { setDepth(0); setSlice(0, 0); send({ type: "sea", count: 60, a: 0.035, seed: (Math.random() * 1e9) | 0 }); scatter(); }
  else if (x === "s" || x === "p" || x === "d") { setDepth(0); setSlice(0, 0); const l = { s: 0, p: 1, d: 2 }[x]; send({ type: "orbital", l, k0: 0.8, axis: l === 1 ? [1, 0, 1] : [0, 0, 1], c: C, peak: 0.25 }); }
  void s;
  for (const b of document.querySelectorAll("#exps button[data-x]")) b.classList.toggle("on", b.dataset.x === x && x !== "clear");
  caption();
}
for (const b of document.querySelectorAll("#exps button[data-x]")) b.onclick = () => run(b.dataset.x);
$("gearB").onclick = () => { $("panel").hidden = !$("panel").hidden; $("gearB").classList.toggle("on", !$("panel").hidden); };
$("squareB").onclick = () => { squareUp(); caption(); };
/* the twist pad and the ana/kata lever: held, they turn and move your slice; let go, they spring back */
const pads = { tw: [0, 0], an: 0 };
function padDrag(el, onMove, onEnd) {
  let id = null;
  el.addEventListener("pointerdown", (e) => { id = e.pointerId; try { el.setPointerCapture(id); } catch (err) { /* fine */ } el.classList.add("live"); onMove(e); });
  el.addEventListener("pointermove", (e) => { if (e.pointerId === id) onMove(e); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(ev, (e) => { if (e.pointerId !== id) return; id = null; el.classList.remove("live"); onEnd(); });
}
padDrag($("twist"), (e) => { const r = $("twist").getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = -(e.clientY - r.top - r.height / 2) / (r.height / 2), m = Math.hypot(dx, dy), k = m > 1 ? 1 / m : 1; pads.tw = [dx * k, dy * k]; $("twistKnob").style.transform = `translate(${dx * k * r.width / 2}px, ${-dy * k * r.height / 2}px)`; },
  () => { pads.tw = [0, 0]; $("twistKnob").style.transform = ""; });
padDrag($("ana"), (e) => { const r = $("ana").getBoundingClientRect(), dy = Math.max(-1, Math.min(1, -(e.clientY - r.top - r.height / 2) / (r.height / 2))); pads.an = dy; $("anaKnob").style.transform = `translateY(${-dy * r.height / 2 * 0.8}px)`; },
  () => { pads.an = 0; $("anaKnob").style.transform = ""; });
const keys = new Set();
document.addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); if (k === "z") { squareUp(); caption(); return; } if ("ijklrfwasdqe".includes(k) && k.length === 1) { keys.add(k); e.preventDefault(); } });
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
function steer(dt) { // 35°/s of twist, 3 m/s ana or kata, 6 m/s across, at full
  const kv = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
  const tx = pads.tw[0] + kv("l", "j"), ty = pads.tw[1] + kv("i", "k"), an = pads.an + kv("r", "f") + kv("e", "q"), r = (35 * Math.PI) / 180;
  if (tx) twist("A", tx * r * dt); if (ty) twist("B", ty * r * dt);
  const mA = kv("d", "a"), mB = kv("w", "s"); if (an || mA || mB) moveO(mA * 6 * dt, mB * 6 * dt, an * 3 * dt);
  if (tx || ty || an) caption.dirty = true;
}$("depth").oninput = () => { setDepth(+$("depth").value); caption(); };
$("speed").oninput = () => { const s = SPEEDS[+$("speed").value]; send({ type: "speed", s }); $("speedV").textContent = `${s}×`; };

/* ------------------------------------------------------------------ layout and input */
function layout() {
  const w = glc.clientWidth, h = glc.clientHeight;
  if (w >= h * 1.05) return { sl: { x: 0, y: 0, w: w * 0.6, h }, vo: { x: w * 0.6, y: 0, w: w * 0.4, h: h * 0.6 }, ch: { x: w * 0.6 + 10, y: h * 0.6 + 6, w: w * 0.4 - 20, h: h * 0.4 - 16 } };
  const hs = Math.round(h * 0.58);
  return { sl: { x: 0, y: 0, w, h: hs }, vo: { x: 0, y: hs, w, h: h - hs }, ch: { x: w * 0.5, y: hs + (h - hs) * 0.6, w: w * 0.5 - 8, h: (h - hs) * 0.4 - 10 } };
}
const inR = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const drags = new Map();
glc.addEventListener("pointerdown", (e) => {
  try { glc.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
  const r = glc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, Lo = layout();
  drags.set(e.pointerId, { which: inR(Lo.vo, x, y) ? "vo" : "sl", x0: x, y0: y, x, y, moved: false });
});
glc.addEventListener("pointermove", (e) => {
  const g = drags.get(e.pointerId); if (!g) return;
  const r = glc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, dx = x - g.x, dy = y - g.y; g.x = x; g.y = y;
  if (Math.hypot(x - g.x0, y - g.y0) > 6) g.moved = true;
  if (!g.moved) return;
  if (g.which === "vo") { view.vaz -= dx * 0.008; view.vel = Math.max(-1.2, Math.min(1.4, view.vel + dy * 0.008)); }
  else { view.az -= dx * 0.006; view.el = Math.max(0.08, Math.min(1.4, view.el + dy * 0.006)); }
});
for (const ev of ["pointerup", "pointercancel"]) glc.addEventListener(ev, (e) => {
  const g = drags.get(e.pointerId); drags.delete(e.pointerId);
  if (!g || g.moved || ev !== "pointerup" || g.which !== "sl") return;
  // a tap on the water: drop a pebble where the tap's ray meets it
  const Lo = layout(), r = Lo.sl, cam = camera(view.az, view.el, view.dist), qx = (2 * (g.x - r.x) - r.w) / r.h, qy = -(2 * (g.y - r.y) - r.h) / r.h;
  const d = unit(add(add(cam.F, cam.R, qx * TAN), cam.U, qy * TAN)); if (d[1] >= -0.01) return;
  const t = -cam.eye[1] / d[1], p = add(cam.eye, d, t), s = slice(), x = add(add(s.O, s.A, p[0]), s.B, p[2]);
  if (exp !== "rain") exp = "pebble";
  send({ type: "drop", x, a: 0.3, sigma: 1.2, compare: true }); caption();
});
glc.addEventListener("wheel", (e) => { const Lo = layout(), r = glc.getBoundingClientRect(); if (inR(Lo.vo, e.clientX - r.left, e.clientY - r.top)) view.vdist = Math.max(L, Math.min(4 * L, view.vdist * Math.exp(e.deltaY * 0.001))); else view.dist = Math.max(8, Math.min(70, view.dist * Math.exp(e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });
for (const ev of ["contextmenu", "selectstart"]) document.addEventListener(ev, (e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); });

/* ------------------------------------------------------------------ drawing */
const TAN = 0.75, FIXED = +new URLSearchParams(location.search).get("dt") ? 1 / +new URLSearchParams(location.search).get("dt") : 0;
let res = 0;
let lastNow = performance.now(), capAt = 0, corkView = [];
const wrapRel = (r) => r.map((v) => ((((v + L / 2) % L) + L) % L) - L / 2); // the nearest copy of a difference, in the periodic water
function draw(now) {
  requestAnimationFrame(draw);
  const dtR = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
  tick(); steer(dtR);
  if (caption.dirty && now - capAt > 250) { caption.dirty = false; capAt = now; caption(); }
  if (rain && S.t > nextRain) { nextRain = S.t + 0.45; send({ type: "drop", x: [Math.random() * L, Math.random() * L, Math.random() * L], a: 0.12, sigma: 0.9, compare: false }); }
  // heights drawn to a steady scale: follow the largest wave, slowly
  const target = Math.max(0.6 * S.max, 0.003); S.amp += (target - S.amp) * (target > S.amp ? 0.2 : 0.03); // 60% of the highest sample: the grid's luckiest crest shouldn't set the scale
  const dpr = Math.min(1.5, devicePixelRatio || 1); if (!res) res = dpr * (matchMedia("(pointer: coarse)").matches ? 0.6 : 0.85);
  const cw = Math.round(glc.clientWidth * res), chh = Math.round(glc.clientHeight * res); if (glc.width !== cw || glc.height !== chh) { glc.width = cw; glc.height = chh; }
  const Lo = layout(), s = slice(), k = res, vp = (r) => [Math.round(r.x * k), Math.round(chh - (r.y + r.h) * k), Math.round(r.w * k), Math.round(r.h * k)];
  gl.uniform3fv(U.uO, s.O); gl.uniform3fv(U.uA, s.A); gl.uniform3fv(U.uB, s.B); gl.uniform3fv(U.uN, s.N); gl.uniform1f(U.uAmp, S.amp); gl.uniform1f(U.uTan, TAN);
  const exag = Math.min(80, Math.max(1, 0.9 / S.amp)); gl.uniform1f(U.uExag, exag);
  // the corks, carried as far as the waves carry them (scaled as the heights are: linear theory is the same at any size)
  const ck = new Float32Array(96); corkView = (S.corks || []).slice(0, 24).map((c, i) => {
    const p = add(c.x0, c.xi, exag), rel = wrapRel(add(p, s.O, -1)), u = dot(rel, s.A), v = dot(rel, s.B), dl = dot(rel, s.N), y = exag * c.eta + 0.15;
    ck.set([u, y, v, dl], 4 * i); return { u, v, y, dl, F: c.F, p };
  });
  gl.uniform1i(U.uNCork, corkView.length); gl.uniform4fv(U.uCork, ck);
  // the pads sit in the corners of your slice's view
  { const sl = Lo.sl, tw = $("twist"), an = $("ana"); tw.style.left = `${sl.x + 14}px`; tw.style.top = `${sl.y + sl.h - 14 - 104}px`; an.style.left = `${sl.x + sl.w - 14 - 44}px`; an.style.top = `${sl.y + sl.h - 14 - 120}px`; }
  for (const [mode, r, cam] of [[0, Lo.sl, camera(view.az, view.el, view.dist)], [1, Lo.vo, camera(view.vaz, view.vel, view.vdist)]]) {
    const v = vp(r); gl.viewport(...v); gl.uniform4f(U.uVP, ...v); gl.uniform1i(U.uMode, mode);
    gl.uniform3fv(U.uEye, cam.eye); gl.uniform3fv(U.uCR, cam.R); gl.uniform3fv(U.uCU, cam.U); gl.uniform3fv(U.uCF, cam.F);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  overlay(Lo, exag);
}
function overlay(Lo, exag) {
  const g = ov.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.font = "11px ui-monospace, Menlo, monospace"; g.textAlign = "left";
  // the views' names and the readout
  const sl = Lo.sl, vo = Lo.vo;
  g.fillStyle = "rgba(233,228,218,0.85)"; g.fillText(`your slice · ${S.t.toFixed(1)} s · ${DEPTH_TXT[DEPTHS.indexOf(S.h)] || "deep"} · heights ×${exag.toFixed(0)}`, sl.x + 10, sl.y + sl.h - 172);
  g.fillText(frameText(), sl.x + 10, sl.y + sl.h - 158);
  corksSlice(g, sl, exag);
  g.fillText("the whole surface (x, z, w up) · bright: your slice", vo.x + 10, vo.y + (vo.y > 0 ? 18 : 60));
  // the box's edges and its axes
  const cam = camera(view.vaz, view.vel, view.vdist), P = (p) => { const r = add(p, cam.eye, -1), f = dot(r, cam.F); return [vo.x + ((dot(r, cam.R) / (f * TAN)) * vo.h + vo.w) / 2, vo.y + (vo.h - (dot(r, cam.U) / (f * TAN)) * vo.h) / 2]; };
  const hL = L / 2, cs = [-hL, hL];
  g.strokeStyle = "rgba(255,255,255,0.22)"; g.lineWidth = 1; g.beginPath();
  for (const a of cs) for (const b of cs) { for (const [p, q] of [[[-hL, a, b], [hL, a, b]], [[a, -hL, b], [a, hL, b]], [[a, b, -hL], [a, b, hL]]]) { const A = P(p), B = P(q); g.moveTo(...A); g.lineTo(...B); } }
  g.stroke();
  g.fillStyle = "rgba(233,228,218,0.7)"; for (const [lab, p] of [["x", [hL + 3, -hL, -hL]], ["z", [-hL, -hL, hL + 3]], ["w", [-hL, hL + 3, -hL]]]) { const q = P(p); g.fillText(lab, q[0], q[1]); }
  // the corks on the whole surface: where they are, which side of your slice, and their push
  for (const c of corkView) {
    const rel = wrapRel(add(c.p, C, -1)), q = P([rel[0], rel[2], rel[1]]), col = Math.abs(c.dl) < 0.55 ? "#ffd27a" : c.dl > 0 ? "#38f2e0" : "#ff66b8", sc = (exag * 3) / G;
    const e = P([rel[0] + c.F[0] * sc, rel[2] + c.F[2] * sc, rel[1] + c.F[1] * sc]);
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.2; g.beginPath(); g.moveTo(...q); g.lineTo(...e); g.stroke(); g.beginPath(); g.arc(q[0], q[1], 2.5, 0, 2 * Math.PI); g.fill();
  }
  // the chart
  const ch = Lo.ch;
  if (S.prof3 && S.prof2) {
    g.fillStyle = "rgba(7,8,12,0.7)"; g.fillRect(ch.x, ch.y, ch.w, ch.h); g.strokeStyle = "rgba(255,255,255,0.15)"; g.strokeRect(ch.x + 0.5, ch.y + 0.5, ch.w - 1, ch.h - 1);
    const mx = Math.max(1e-4, ...S.prof3.map(Math.abs), ...S.prof2.map(Math.abs)), n = S.prof3.length, X = (i) => ch.x + 8 + ((ch.w - 16) * i) / (n - 1), Y = (v) => ch.y + ch.h / 2 + 4 - (v / mx) * (ch.h / 2 - 18);
    g.strokeStyle = "rgba(255,255,255,0.15)"; g.beginPath(); g.moveTo(ch.x + 8, Y(0)); g.lineTo(ch.x + ch.w - 8, Y(0)); g.stroke();
    for (const [pr, col] of [[S.prof2, "rgba(200,200,200,0.85)"], [S.prof3, "#38f2e0"]]) { g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); pr.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke(); }
    g.fillStyle = "#38f2e0"; g.fillText("kata (3D surface)", ch.x + 8, ch.y + 13); g.fillStyle = "rgba(200,200,200,0.9)"; g.textAlign = "right"; g.fillText("ours (2D)", ch.x + ch.w - 8, ch.y + 27);
    g.fillStyle = "rgba(233,228,218,0.6)"; g.fillText("η out to 20 m from the pebble →", ch.x + ch.w - 8, ch.y + ch.h - 6); g.textAlign = "left";
  }
}

/* the corks in your slice: a ring for each one just out of view (teal ana, rose kata, fainter the further), and for
   every one near, its push: an arrow along the water for the part in your slice, a tick for the part ana or kata */
function corksSlice(g, sl, exag) {
  const cam = camera(view.az, view.el, view.dist), P = (p) => { const r = add(p, cam.eye, -1), f = dot(r, cam.F); return f < 0.5 ? null : [sl.x + ((dot(r, cam.R) / (f * TAN)) * sl.h + sl.w) / 2, sl.y + (sl.h - (dot(r, cam.U) / (f * TAN)) * sl.h) / 2, f]; };
  const s = slice(), sc = (exag * 3) / G;
  for (const c of corkView) {
    if (Math.abs(c.dl) > 4 || Math.hypot(c.u, c.v) > 22) continue;
    const q = P([c.u, c.y, c.v]); if (!q) continue;
    const near = 1 - Math.abs(c.dl) / 4, inSlice = Math.abs(c.dl) < 0.55, col = c.dl > 0 ? "56,242,224" : "255,102,184";
    if (!inSlice) { const rr = Math.max(4, (0.55 / (q[2] * TAN)) * sl.h * 0.5); g.strokeStyle = `rgba(${col},${(0.8 * near).toFixed(2)})`; g.lineWidth = 1.2; g.setLineDash([3, 3]); g.beginPath(); g.arc(q[0], q[1], rr, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]); }
    const fa = dot(c.F, s.A), fb = dot(c.F, s.B), fn = dot(c.F, s.N), e = P([c.u + fa * sc, c.y, c.v + fb * sc]);
    g.globalAlpha = inSlice ? 1 : 0.5 * near;
    if (e) { g.strokeStyle = "#ffd27a"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(e[0], e[1]); g.stroke(); }
    const tk = Math.max(-28, Math.min(28, (fn / G) * exag * 120)); if (Math.abs(tk) > 1.5) { g.strokeStyle = fn > 0 ? "#38f2e0" : "#ff66b8"; g.lineWidth = 3; g.beginPath(); g.moveTo(q[0] + 10, q[1]); g.lineTo(q[0] + 10, q[1] - tk); g.stroke(); }
    g.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------ start */
const q = new URLSearchParams(location.search);
send({ type: "dir", d: [1, 0, 0] });
run(q.get("x") || "pebble");
requestAnimationFrame(draw);
window.WAVELAB = { S, view, frame, run, setSlice, send, twist, moveO, squareUp, pads };
