/* Hearth — the renderer. WebGL2: a perspective camera over the orb, the sun's
   shadows from a shadow map, facades drawn by the shader, and the black sky.

   CAMERA. The camera looks at a point on the ground (u, a unit vector) from
   `dist` metres away, tilted `pitch` from straight down toward `fwd` (a
   tangent at u). Panning slides u over the sphere and carries fwd along
   (parallel transport), so the view never flips at a pole. Pitch goes from
   0 (a map) to near the horizon (a street).

   SHADOWS. The sun is a direction. Each frame its depth map is drawn in an
   orthographic box round what you're looking at (tight when close, so a
   tower's shadow is sharp; the whole orb when far), deep enough to hold the
   whole planet, so the night side falls in the planet's own shadow. Normal
   offset and a small bias keep the walls clean.

   FACADES. Walls carry metres along and up (geometry.js), so floors and
   windows are drawn at their real size: homes in stucco and brick with
   punched windows, offices in glass between mullions, industry in concrete
   with strip windows, a lit shopfront at street level. Where a window is
   smaller than a pixel the pattern fades to its average instead of
   shimmering. On the night side the lit windows glow. */
import { R } from "./orb.js";
import { STRIDE } from "./geometry.js";

const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec2 aUV; layout(location=3) in vec3 aM;
uniform mat4 uVP; uniform mat4 uLVP; uniform float uNOff;
out vec3 vW; out vec3 vN; out vec2 vUV; flat out vec3 vM; out vec4 vL;
void main() { vW = aP; vN = aN; vUV = aUV; vM = aM; vL = uLVP * vec4(aP + aN * uNOff, 1.0); gl_Position = uVP * vec4(aP, 1.0); }`;

const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW; in vec3 vN; in vec2 vUV; flat in vec3 vM; in vec4 vL;   // flat: a parcel's kind and seed reach every pixel exactly (interpolated, the hash of a seed off by 1e-6 jumped, and roofs speckled)
uniform vec3 uSun; uniform vec3 uEye; uniform sampler2DShadow uShadow; uniform vec3 uPort; uniform float uStreet; uniform float uPick; uniform vec3 uPickP;
out vec4 o;
float h1(float n) { return fract(sin(n) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float shade(vec4 l) {
  vec3 c = l.xyz / l.w * 0.5 + 0.5;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  vec2 t = 1.0 / vec2(textureSize(uShadow, 0));
  float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) s += texture(uShadow, vec3(c.xy + vec2(i, j) * t, c.z - 0.00003));
  return s / 9.0;
}
// a soft step, widened to a pixel so fine patterns fade instead of shimmering
float band(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
vec3 homeWall(float s) {   // render, brick, limewash, sage, terracotta, slate
  vec3 a = vec3(0.78, 0.62, 0.45), b = vec3(0.60, 0.33, 0.24), c = vec3(0.84, 0.80, 0.70), d = vec3(0.48, 0.55, 0.47), e = vec3(0.72, 0.45, 0.30), f = vec3(0.40, 0.44, 0.50);
  return s < 0.22 ? a : s < 0.42 ? b : s < 0.62 ? c : s < 0.74 ? d : s < 0.88 ? e : f;
}
vec3 tint(float s) {       // curtain-wall glass: blue, green, bronze, silver
  return s < 0.3 ? vec3(0.10, 0.17, 0.28) : s < 0.55 ? vec3(0.10, 0.22, 0.20) : s < 0.8 ? vec3(0.24, 0.17, 0.10) : vec3(0.20, 0.22, 0.25);
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec3 up = normalize(vW), n = normalize(vN), V = normalize(uEye - vW);
  float kind = vM.x, seed = vM.y, mode = vM.z;
  float sunUp = dot(up, uSun), day = smoothstep(-0.06, 0.10, sunUp);
  float lam = max(dot(n, uSun), 0.0), sh = shade(vL) * day;
  vec3 base; float glass = 0.0, lit = 0.0, rough = 1.0, blinds = 1.0;
  if (mode < 0.5) {
    // the ground: street, kerb and lot from the distance to the street edge
    float e = vUV.x, w = fwidth(e) + 0.05;
    vec3 lot = kind > 3.5 ? mix(vec3(0.16, 0.28, 0.13), vec3(0.22, 0.34, 0.15), h1(seed * 91.0)) : kind > 2.5 ? vec3(0.36, 0.37, 0.39) : kind > 1.5 ? vec3(0.30, 0.29, 0.27) : vec3(0.36, 0.34, 0.31);
    if (kind > 2.5 && kind < 3.5) {   // the pad: rings round the port's centre
      float d = acos(clamp(dot(up, uPort), -1.0, 1.0)) * ${R.toFixed(1)}, fw = fwidth(d) + 0.2;
      lot = mix(lot, vec3(0.85, 0.78, 0.30), max(band(mod(d, 40.0), 0.0, 1.6, fw), band(d, 0.0, 6.0, fw)));
    }
    vec3 street = vec3(0.10, 0.105, 0.115);
    base = mix(street, vec3(0.48, 0.47, 0.45), smoothstep(uStreet - w, uStreet + w, e));            // the kerb
    base = mix(base, lot, smoothstep(uStreet + 2.0 - w, uStreet + 2.0 + w, e));
    base = mix(base, vec3(0.30, 0.30, 0.31), band(e, 0.0, 0.18, w) * 0.6);                        // the street's centre line
    lit = (1.0 - smoothstep(0.0, 2.5, e)) * 0.05 * (1.0 - smoothstep(3.5, 4.5, kind));            // street lights, at night
  } else if (vUV.y < 0.0) {
    // a roof: membrane, gravel, or (on some homes) planted
    float rr = h1(seed * 17.0);
    base = kind < 0.5 && rr > 0.72 ? vec3(0.17, 0.26, 0.12) : mix(vec3(0.15, 0.155, 0.165), vec3(0.27, 0.26, 0.24), rr);
  } else {
    float fh = 3.6, v = vUV.y, u = vUV.x;
    float mod_ = kind > 0.5 && kind < 1.5 ? 1.5 : kind > 1.5 ? 6.0 : 3.0;                          // window module: offices tight, industry wide
    vec2 g = vec2(u / mod_, v / fh), f = fract(g), id = floor(g), fw = fwidth(g);
    float win;
    if (kind > 0.5 && kind < 1.5) {   // an office: glass between thin mullions and spandrels
      base = mix(vec3(0.58, 0.60, 0.63), vec3(0.30, 0.32, 0.35), h1(seed * 5.0));
      win = band(f.x, 0.06, 0.94, fw.x) * band(f.y, 0.12, 0.92, fw.y); rough = 0.2;
    } else if (kind > 1.5) {          // industry and the port: concrete or metal, a strip of windows every few floors
      base = kind > 2.5 ? vec3(0.62, 0.64, 0.68) : vec3(0.56, 0.55, 0.52);
      win = band(f.y, 0.55, 0.85, fw.y) * step(0.5, mod(id.y, 3.0)) * band(f.x, 0.04, 0.96, fw.x);
    } else {                          // homes: punched windows in a painted or brick wall
      base = homeWall(h1(seed * 13.0));
      win = band(f.x, 0.22, 0.78, fw.x) * band(f.y, 0.28, 0.82, fw.y);
    }
    if (v < 4.6 && kind < 1.5) { win = band(f.x, 0.04, 0.96, fw.x) * band(v, 0.4, 3.9, fw.y * fh); base *= 0.85; }   // a shopfront
    float far = clamp(max(fw.x, fw.y) * 2.0 - 0.6, 0.0, 1.0);
    win = mix(win, kind > 0.5 && kind < 1.5 ? 0.75 : 0.35, far);
    glass = win * (1.0 - far * 0.25);
    base *= 1.0 - 0.0 * far;
    // at night some rooms are lit: fewer in offices; where a window is under a pixel, their average, so it glows instead of fizzing
    float share = kind > 0.5 && kind < 1.5 ? 0.25 : kind > 1.5 ? 0.15 : 0.4;
    lit = mix(win * step(h2(id + seed * 37.0), share) * (0.7 + 0.5 * h2(id * 3.1 + seed)), win * share * 0.5, far) * 0.6;
    blinds = mix(0.55 + 0.9 * h2(id * 1.7 + seed * 3.0), 1.0, far);   // window by window: blinds, rooms, reflections
    base *= 0.62 + 0.38 * smoothstep(0.0, 14.0, v);                                               // darker at the foot
  }
  // ambient: the faint light off the town itself; on the night side, in vacuum, almost nothing
  vec3 sun = vec3(1.0, 0.95, 0.86) * 1.55, amb = (vec3(0.07, 0.08, 0.10) + vec3(0.05, 0.05, 0.06) * max(0.0, dot(n, up))) * mix(0.22, 1.0, day);
  vec3 col = base * (amb + sun * lam * sh);
  // glass: dark (it mirrors a black sky), tinted, with the sun's glint
  vec3 gtint = kind > 0.5 && kind < 1.5 ? tint(h1(seed * 29.0)) : vec3(0.06, 0.08, 0.11);
  vec3 gl = gtint * (amb * 5.0 + sun * lam * sh * 0.3) + gtint * 0.06;
  float spec = pow(max(dot(reflect(-uSun, n), V), 0.0), mix(400.0, 40.0, rough)) * sh;
  col = mix(col, gl * blinds, glass) + glass * spec * vec3(1.6, 1.5, 1.3);
  // lights on where the sun is down
  col += lit * smoothstep(0.04, -0.12, sunUp) * vec3(1.0, 0.76, 0.42);
  o = vec4(pow(aces(col * 1.1), vec3(1.0 / 2.2)), 1.0);
}`;

const DVS = `#version 300 es
layout(location=0) in vec3 aP; uniform mat4 uLVP; void main() { gl_Position = uLVP * vec4(aP, 1.0); }`;
const DFS = `#version 300 es
precision mediump float; out vec4 o; void main() { o = vec4(1.0); }`;

const SVS = `#version 300 es
layout(location=0) in vec4 aS; uniform mat4 uVPr; uniform float uPx; out float vB; out float vSun;
void main() { vec4 p = uVPr * vec4(aS.xyz, 0.0); gl_Position = p.xyww; vB = aS.w; vSun = step(5.0, aS.w); gl_PointSize = vSun > 0.5 ? 70.0 * uPx : (1.0 + aS.w) * uPx; }`;
const SFS = `#version 300 es
precision mediump float; in float vB; in float vSun; out vec4 o;
void main() { vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
  if (vSun > 0.5) { float a = exp(-d * 6.0) * 1.4 + smoothstep(0.16, 0.12, d); o = vec4(vec3(1.0, 0.96, 0.85) * a, 1.0); return; }
  float a = smoothstep(1.0, 0.2, d) * (0.35 + 0.25 * vB); o = vec4(vec3(a), 1.0); }`;

export class Renderer {
  static create(canvas) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
    if (!gl) return null;
    return new Renderer(canvas, gl);
  }
  constructor(canvas, gl) {
    this.cv = canvas; this.gl = gl; this.dpr = 1;
    this.prog = program(gl, VS, FS); this.dprog = program(gl, DVS, DFS); this.sprog = program(gl, SVS, SFS);
    this.U = uniforms(gl, this.prog, ["uVP", "uLVP", "uNOff", "uSun", "uEye", "uShadow", "uPort", "uStreet", "uPick", "uPickP"]);
    this.DU = uniforms(gl, this.dprog, ["uLVP"]); this.SU = uniforms(gl, this.sprog, ["uVPr", "uPx"]);
    this.ground = mesh(gl); this.blds = mesh(gl);
    // the shadow map
    this.SM = 2048;
    this.depth = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.depth);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.SM, this.SM);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depth, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // the stars, and the sun (w ≥ 5)
    let s = 12345; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    const st = new Float32Array(4 * 1601);
    for (let k = 0; k < 1600; k++) { const z = 2 * rnd() - 1, t = 2 * Math.PI * rnd(), r = Math.sqrt(1 - z * z); st.set([r * Math.cos(t), r * Math.sin(t), z, rnd() < 0.08 ? 1.8 : rnd()], 4 * k); }
    this.starData = st;
    this.stars = gl.createVertexArray(); this.starBuf = gl.createBuffer();
    gl.bindVertexArray(this.stars); gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuf); gl.bufferData(gl.ARRAY_BUFFER, st, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0); gl.bindVertexArray(null);
    // the camera
    this.cam = { u: [0, 0, 1], fwd: [0, 1, 0], pitch: 0.95, dist: 900, fov: 50 * Math.PI / 180 };
    this.sun = norm([0.5, 0.6, 0.62]); this.port = [0, 0, 1]; this.pick = null;
  }
  setGround(arr) { upload(this.gl, this.ground, arr); }
  setBuildings(arr) { upload(this.gl, this.blds, arr); }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = this.cv.clientWidth, h = this.cv.clientHeight;
    this.dpr = dpr; this.w = w; this.h = h;
    if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
  }
  /* The camera's frame: its target on the ground, the eye, and the matrices. */
  frame() {
    const c = this.cam, u = c.u, f = c.fwd, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const T = [u[0] * R, u[1] * R, u[2] * R];
    const eye = [T[0] + c.dist * (cp * u[0] - sp * f[0]), T[1] + c.dist * (cp * u[1] - sp * f[1]), T[2] + c.dist * (cp * u[2] - sp * f[2])];
    const up = [sp * u[0] + cp * f[0], sp * u[1] + cp * f[1], sp * u[2] + cp * f[2]];
    const view = lookAt(eye, T, up), aspect = this.w / Math.max(1, this.h);
    // the near plane as far out as the view allows: depth precision goes as near/distance², and at 0.5 m a 16-bit
    // depth buffer (some phones, and software GL) let the walls behind a roof bleed through it as a speckle
    const eyeR = Math.hypot(...eye), near = Math.max(1, Math.min(80, c.dist * 0.04)), far = eyeR + R + 600;
    const proj = perspective(c.fov, aspect, near, far);
    return { eye, T, view, proj, vp: mul(proj, view) };
  }
  draw(t) {
    const gl = this.gl; this.resize();
    const F = this.frame(), c = this.cam, L = this.sun;
    // the sun's box: round the target, as tight as the view allows
    const half = Math.max(260, Math.min(R + 450, c.dist * 1.3 + 250));
    const sup = Math.abs(L[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const leye = [F.T[0] + L[0] * (R + 2200), F.T[1] + L[1] * (R + 2200), F.T[2] + L[2] * (R + 2200)];
    const lview = lookAt(leye, F.T, sup), lproj = ortho(-half, half, -half, half, 1, 2 * (R + 2200)), lvp = mul(lproj, lview);
    // 1. the sun's depth
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, this.SM, this.SM);
    gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.useProgram(this.dprog); gl.uniformMatrix4fv(this.DU.uLVP, false, lvp);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.6, 3.0);   // slope-scaled: no acne on a roof the sun grazes
    for (const m of [this.ground, this.blds]) if (m.count) { gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.count); }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // 2. the sky
    gl.viewport(0, 0, this.cv.width, this.cv.height); gl.clearColor(0.004, 0.006, 0.014, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const vr = F.view.slice(); vr[12] = vr[13] = vr[14] = 0;
    this.starData.set([L[0], L[1], L[2], 6], 4 * 1600); gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 4 * 4 * 1600, this.starData.subarray(4 * 1600));
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.sprog); gl.uniformMatrix4fv(this.SU.uVPr, false, mul(F.proj, vr)); gl.uniform1f(this.SU.uPx, this.dpr);
    gl.bindVertexArray(this.stars); gl.drawArrays(gl.POINTS, 0, 1601); gl.disable(gl.BLEND);
    // 3. the town
    gl.enable(gl.DEPTH_TEST); gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.U.uVP, false, F.vp); gl.uniformMatrix4fv(this.U.uLVP, false, lvp);
    gl.uniform1f(this.U.uNOff, 2 * half / this.SM * 1.5);
    gl.uniform3fv(this.U.uSun, L); gl.uniform3fv(this.U.uEye, F.eye); gl.uniform3fv(this.U.uPort, this.port); gl.uniform1f(this.U.uStreet, 7);
    gl.uniform1f(this.U.uPick, 0); gl.uniform3fv(this.U.uPickP, [0, 0, 0]);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.depth); gl.uniform1i(this.U.uShadow, 0);
    for (const m of [this.ground, this.blds]) if (m.count) { gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.count); }
    gl.bindVertexArray(null);
    this.last = F;
  }
  /* Screen point → the unit vector of the ground under it, or null (sky). */
  unproject(px, py) {
    const F = this.last || this.frame(), inv = invert(F.vp), x = 2 * px / this.w - 1, y = 1 - 2 * py / this.h;
    const a = xform(inv, [x, y, -1, 1]), b = xform(inv, [x, y, 1, 1]);
    const o = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], e = [b[0] / b[3], b[1] / b[3], b[2] / b[3]], d = norm([e[0] - o[0], e[1] - o[1], e[2] - o[2]]);
    const B = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], C = o[0] ** 2 + o[1] ** 2 + o[2] ** 2 - R * R, disc = B * B - C;
    if (disc < 0) return null;
    const s = -B - Math.sqrt(disc); if (s < 0) return null;
    return norm([o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s]);
  }
  /* Slide the view: dx, dy screen pixels. */
  pan(dx, dy) {
    const c = this.cam, mpp = 2 * c.dist * Math.tan(c.fov / 2) / Math.max(1, this.h), u = c.u, f = c.fwd, rt = cross(f, u);
    const k = Math.max(0.35, Math.cos(c.pitch));
    const mv = [(-rt[0] * dx + f[0] * dy / k) * mpp, (-rt[1] * dx + f[1] * dy / k) * mpp, (-rt[2] * dx + f[2] * dy / k) * mpp];
    const nu = norm([u[0] + mv[0] / R, u[1] + mv[1] / R, u[2] + mv[2] / R]);
    c.u = nu; c.fwd = tangent(f, nu);
  }
  turn(a) { const c = this.cam, u = c.u, f = c.fwd, s = cross(u, f), ca = Math.cos(a), sa = Math.sin(a); c.fwd = norm([f[0] * ca + s[0] * sa, f[1] * ca + s[1] * sa, f[2] * ca + s[2] * sa]); }
  tilt(d) { this.cam.pitch = Math.max(0, Math.min(1.42, this.cam.pitch + d)); }
  zoom(k) { this.cam.dist = Math.max(25, Math.min(9000, this.cam.dist * k)); }
  lookAt(u, dist, pitch) { const c = this.cam; c.u = norm(u); c.fwd = tangent(c.fwd, c.u); if (dist) c.dist = dist; if (pitch != null) c.pitch = pitch; }
}

/* ---------------------------------------------------------------- GL plumbing */
function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
  return p;
}
function uniforms(gl, p, names) { const u = {}; for (const n of names) u[n] = gl.getUniformLocation(p, n); return u; }
function mesh(gl) {
  const vao = gl.createVertexArray(), buf = gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const B = STRIDE * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, B, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, B, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, B, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, B, 32);
  gl.bindVertexArray(null);
  return { vao, buf, count: 0 };
}
function upload(gl, m, arr) { gl.bindBuffer(gl.ARRAY_BUFFER, m.buf); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); m.count = arr.length / STRIDE; }

/* ---------------------------------------------------------------- matrices (column-major) */
function perspective(fov, a, n, f) { const t = 1 / Math.tan(fov / 2), r = 1 / (n - f); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * r, -1, 0, 0, 2 * f * n * r, 0]); }
function ortho(l, r, b, t, n, f) { return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]); }
function lookAt(e, c, up) {
  const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross(up, z)), y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
}
function mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
function xform(m, v) { return [0, 1, 2, 3].map((j) => m[j] * v[0] + m[4 + j] * v[1] + m[8 + j] * v[2] + m[12 + j] * v[3]); }
function invert(m) {
  const a = Array.from(m), inv = new Array(16);
  inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
  inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
  inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
  inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
  inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
  inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
  inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
  inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
  inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
  inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
  inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
  inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
  inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
  inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
  inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
  inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
  const det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
  return inv.map((x) => x / det);
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function tangent(f, u) { const d = dot(f, u); let t = [f[0] - d * u[0], f[1] - d * u[1], f[2] - d * u[2]]; if (Math.hypot(...t) < 1e-6) t = Math.abs(u[2]) < 0.9 ? cross(u, [0, 0, 1]) : cross(u, [1, 0, 0]); return norm(t); }
export { norm };
