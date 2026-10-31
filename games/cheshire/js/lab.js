/* The cat lab: the Cheshire cat (js/cat.js) drawn as you'd see it, a 3D prisoner of its 4D world. Your space is the
   slice w = W of the world; the cat stands in the world turned by R and set at its origin, and the shader marches
   rays through your slice, asking the cat's distance at each 4D point (x, y, z, W). The distance is the same as
   cat.js's sdf, formula for formula, so what the selftest measures is what you see.
   Off-slice feet: a ring on the floor under each paw, wider and fainter the further off in w it is, teal ana (+w)
   and rose kata (−w), the colours the stripes take on the same sides (violet in between).
   With st.support (the gait panel), the floor also shows the support: the solid the planted feet span on the 3D floor,
   cut by your slice, and the centre of mass over it. st.body passes the gait's pose (sway, lift, tailFoot) to the cat. */
import { pose, cut, paws, mass, rig, HEAD, LIMITS, K, MAT } from "./cat.js";
import { wave, maxStride } from "./walk.js";
import { hull, margin, NEED } from "./gait.js";

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform vec3 uEye, uCR, uCU, uCF; uniform float uTan;
uniform mat4 uRot; uniform vec4 uPos, uBound; uniform float uW, uK, uFeet, uTime;
uniform int uNC, uNE;
uniform vec4 uA[${LIMITS.caps}], uB[${LIMITS.caps}], uCp[${LIMITS.caps}], uEc[${LIMITS.ells}], uEr[${LIMITS.ells}], uEp[${LIMITS.ells}];
uniform vec4 uPaw[6]; uniform int uNP;
uniform vec4 uCav, uCavR; // the mouth's cavity (an ellipsoid carved out; uCavR.x = 0: closed)
uniform vec4 uEyeC[3], uLook; // the eyes' centres, and the camera, in the cat's frame: its pupils look at you
uniform vec4 uSF[16], uCom; uniform int uNSF; // the support's faces on the floor (n·(x, z, w) ≤ c), the centre of mass (x, z, w, state)
out vec4 outC;

// the parts, as in cat.js: capD (wx > 0 extruded along w, wx < 0 spun round the xy plane),
// ellD, the joins (smooth for fur, hard for skin and eyes, kept apart), the groove and cavity carved, then the mouth's own parts
float capD(vec4 p, int i) {
  float wx = uCp[i].w; vec4 P = p; if (wx > 0.) P.w = 0.; else if (wx < 0.) P = vec4(p.x, p.y, length(p.zw), 0.);
  vec4 pa = P - uA[i], ba = uB[i] - uA[i]; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  float d = length(pa - ba * h) - mix(uCp[i].x, uCp[i].y, h);
  return wx > 0. ? max(d, abs(p.w) - wx) : d;
}
float ellD(vec4 p, int i) {
  float wx = uEp[i].y; vec4 q = p - uEc[i], r = uEr[i]; if (wx > 0.) { q.w = 0.; r.w = 1.; }
  float k0 = length(q / r), k1 = length(q / (r * r)); float d = k1 < 1e-12 ? -min(min(r.x, r.y), min(r.z, r.w)) : k0 * (k0 - 1.) / k1;
  return wx > 0. ? max(d, abs(p.w) - wx) : d;
}
void blend(inout float F, float d, float k) { float h = clamp(0.5 + 0.5 * (F - d) / k, 0., 1.); F = mix(F, d, h) - k * h * (1. - h); } // mix, not F + (d − F)h: from F = 100, float32 would lose d
void hard(inout float D, inout float M, float d, float m) { if (d < D) { D = d; M = m; } }
void add(inout float F, inout float D, inout float M, inout float C, inout float E, inout float N, float d, float m) {
  if (m > ${MAT.mouth - 0.5}) C = max(C, -d); else if (m >= ${MAT.grin}.) hard(E, N, d, m); else if (m >= ${MAT.pink}.) hard(D, M, d, m); else blend(F, d, uK * (1. - m)); // a fur part joins within K·(1 − m): a lip's tight
}
vec2 cat(vec4 q) {
  float F = 100., D = 100., M = ${MAT.pink}., C = -100., E = 100., N = ${MAT.grin}.; // fur, skin and eyes, carved, the mouth's own parts
  for (int i = 0; i < ${LIMITS.ells}; i++) { if (i >= uNE) break; add(F, D, M, C, E, N, ellD(q, i), uEp[i].x); }
  for (int i = 0; i < ${LIMITS.caps}; i++) { if (i >= uNC) break; add(F, D, M, C, E, N, capD(q, i), uCp[i].z); }
  if (uCavR.x > 0.) { vec4 c = q - uCav; float k0 = length(c / uCavR), k1 = length(c / (uCavR * uCavR)); C = max(C, -(k0 * (k0 - 1.) / max(k1, 1e-12))); }
  if (F <= D) { D = F; M = ${MAT.fur}.; }
  if (C > D) { D = C; M = ${MAT.mouth}.; }
  return E < D ? vec2(E, N) : vec2(D, M);
}
vec4 toCat(vec3 p) { return uRot * (vec4(p, uW) - uPos); }
float dist(vec3 p) { return cat(toCat(p)).x; }

vec3 normalAt(vec3 p) {
  vec2 e = vec2(1., -1.) * 6e-4;
  return normalize(e.xyy * dist(p + e.xyy) + e.yyx * dist(p + e.yyx) + e.yxy * dist(p + e.yxy) + e.xxx * dist(p + e.xxx));
}
// a ray from p toward the light: how much of the cat is in the way (soft)
float shade(vec3 p, vec3 L) {
  float s = 1., t = 0.01;
  for (int i = 0; i < 28; i++) { float d = dist(p + L * t); s = min(s, 10. * d / t); t += clamp(d, 0.01, 0.08); if (s < 0.02 || t > 1.2) break; }
  return clamp(s, 0., 1.);
}
vec3 sky(vec3 rd) { return mix(vec3(0.006, 0.005, 0.012), vec3(0.03, 0.022, 0.06), smoothstep(-0.2, 0.7, rd.y)); }
vec3 wtint(float w) { // kata rose, here violet, ana teal
  float u = clamp(w / 0.08, -1., 1.);
  return u < 0. ? mix(vec3(0.62, 0.42, 1.0), vec3(0.98, 0.36, 0.72), -u) : mix(vec3(0.62, 0.42, 1.0), vec3(0.22, 0.95, 0.88), u);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2. - uRes) / uRes.y;
  vec3 rd = normalize(uCF + uTan * (uv.x * uCR + uv.y * uCU)), ro = uEye;
  vec3 L = normalize(vec3(0.45, 0.85, 0.3));
  // the cat's bounding ball, then the floor
  vec3 oc = ro - uBound.xyz; float b = dot(oc, rd), c = dot(oc, oc) - uBound.w * uBound.w, disc = b * b - c;
  float tFloor = rd.y < 0. ? -ro.y / rd.y : 1e9, tHit = -1., m = 0.;
  if (disc > 0.) {
    float t = max(0., -b - sqrt(disc)), t1 = min(-b + sqrt(disc), tFloor);
    for (int i = 0; i < 140; i++) {
      if (t > t1) break;
      vec2 h = cat(toCat(ro + rd * t));
      if (h.x < 3e-4 * (1. + t)) { tHit = t; m = h.y; break; }
      t += h.x * 0.9;
    }
  }
  vec3 col = sky(rd);
  if (tHit > 0.) {
    vec3 p = ro + rd * tHit, n = normalAt(p); vec4 q = toCat(p);
    // fur: slate, striped in all four directions so the stripes slide as you move through w; the stripes take the
    // colour of the side of w they're on
    float st = sin(28. * q.x + 14. * q.w + 3.2 * sin(15. * q.y + 11. * q.z) + 1.3);
    float stripe = smoothstep(0.35, 0.65, st) * smoothstep(0.03, 0.1, q.y);
    vec3 base = mix(vec3(0.018, 0.017, 0.028), wtint(q.w) * 0.55, stripe);
    if (m > 0.5 && m < 1.5) base = vec3(0.85, 0.32, 0.45); // skin: the nose
    float lit = max(dot(n, L), 0.) * shade(p + n * 0.002, L);
    float ao = 0.; for (int k = 1; k <= 3; k++) { float h = 0.012 * float(k); ao += (h - dist(p + n * h)) / h; } ao = clamp(1. - ao * 0.3, 0.3, 1.); // (every smoothstep here has edge0 < edge1: reversed edges are undefined in GLSL)
    vec3 rim = vec3(0.45, 0.55, 1.0) * pow(1. - max(dot(n, -rd), 0.), 3.) * 0.7;
    col = base * (vec3(1.0, 0.92, 0.85) * lit * 1.5 + vec3(0.16, 0.17, 0.3) * (0.6 + 0.4 * n.y) * ao) + rim * ao * 0.6 + wtint(q.w) * stripe * 0.12;
    if (m > 1.5 && m < 2.5) { // eyes: lamps, each with a round pupil (a ball on its 3D surface: the cap within an angle of
      // where it looks, which is at you), a dark ring of iris round it
      vec4 c = uEyeC[0]; float bd = 1e9; for (int k = 0; k < 3; k++) { float e = length(q - uEyeC[k]); if (e < bd) { bd = e; c = uEyeC[k]; } }
      float cs = dot(normalize(q - c), normalize(uLook - c)), pupil = smoothstep(0.955, 0.966, cs), ring = smoothstep(0.86, 0.875, cs) * (1. - pupil);
      col = mix(vec3(1.0, 0.8, 0.22) * (1.25 + 0.25 * sin(uTime * 1.3)), vec3(0.45, 0.25, 0.05), ring * 0.6);
      col = mix(col, vec3(0.01, 0.005, 0.0), pupil) + vec3(1.) * pow(max(dot(reflect(rd, n), L), 0.), 40.) * 0.6;
    }
    if (m > ${MAT.grin - 0.5} && m < ${MAT.grin + 0.5}) { // the grin glows, in teeth: a carpet of them, in rings across the sheet round z and w
      // the gaps between teeth: across the rings (every 1.3 cm of ρ) and round them (nr teeth to a ring, about 1.3 cm apart,
      // an even number offset half a tooth, so the slice w = 0 runs through the middles of the teeth on both sides)
      float rho = length(q.zw), th = atan(q.w, q.z), ri = floor(rho / 0.013), nr = 2. * max(2., floor(3.1416 * (ri + 0.5) + 0.5));
      float gapR = 1. - smoothstep(0.07, 0.16, fract(rho / 0.013)), gapA = smoothstep(0.86, 0.93, abs(fract(th * nr / 6.2832 + 0.5) - 0.5) * 2.);
      float teeth = max(gapR, gapA);
      col = mix(vec3(0.9, 1.0, 0.97) * (1.15 + 0.15 * sin(uTime * 2.)), vec3(0.25, 0.4, 0.42), teeth * 0.7) + rim * 0.3;
    }
    if (m > ${MAT.tongue - 0.5} && m < ${MAT.tongue + 0.5}) col = vec3(0.75, 0.22, 0.32) * (0.4 + lit) + rim * 0.2; // the tongue
    if (m > ${MAT.mouth - 0.5}) col = vec3(0.16, 0.02, 0.05) * (0.5 + 0.5 * lit) + vec3(0.25, 0.04, 0.08) * ao * 0.4; // inside the mouth
    col = mix(col, sky(rd), smoothstep(2.5, 6., tHit));
  } else if (tFloor < 1e8) {
    vec3 p = ro + rd * tFloor;
    vec2 g = abs(fract(p.xz * 10. + 0.5) - 0.5) / fwidth(p.xz * 10.); float line = 1. - min(min(g.x, g.y), 1.);
    col = vec3(0.012, 0.011, 0.02) + vec3(0.03, 0.03, 0.06) * line * 0.5;
    float sh = shade(p + vec3(0., 0.002, 0.), L), dc = dist(p); // its shadow, and a contact darkening near it
    col *= 0.35 + 0.65 * sh; col *= mix(0.45, 1., smoothstep(0.0, 0.06, dc));
    // the feet that stand off your slice: a ring wider and fainter the further off in w
    for (int k = 0; k < 6; k++) {
      if (k >= uNP) break;
      vec4 pw = uPaw[k]; float dw = pw.w - uW, r = 0.03 + 0.45 * abs(dw), d = abs(length(p.xz - pw.xz) - r);
      float a = uFeet * exp(-abs(dw) * 9.) * (1. - smoothstep(0., 0.006 + 0.02 * abs(dw), d));
      col += wtint(dw) * a * 0.5;
    }
    // the gait panel: the support (the feet's solid on the 3D floor, cut by your slice) in gold, and the centre of mass,
    // a dot when it's in your slice and a ring the further off in w it is, gold if it's over the support, red if not
    if (uCom.w > 0.) {
      vec3 f = vec3(p.x, p.z, uW); float m = 1e9;
      for (int k = 0; k < 16; k++) { if (k >= uNSF) break; m = min(m, uSF[k].w - dot(uSF[k].xyz, f)); }
      if (uNSF > 0 && m > 0.) col = mix(col, vec3(0.95, 0.72, 0.25), 0.16 + 0.5 * (1. - smoothstep(0., 0.004, m)));
      vec3 cc = uCom.w > 1.5 ? vec3(1.0, 0.25, 0.2) : vec3(1.0, 0.82, 0.35);
      float dw = uCom.z - uW, r = 0.012 + 0.45 * abs(dw), d = length(p.xz - uCom.xy);
      col = mix(col, cc, abs(dw) < 0.01 ? 1. - smoothstep(0.009, 0.012, d) : (1. - smoothstep(0., 0.004, abs(d - r))) * exp(-abs(dw) * 6.));
    }
    col = mix(col, sky(rd), smoothstep(3., 9., tFloor));
  }
  outC = vec4(pow(col, vec3(0.4545)), 1.);
}`;
const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0., 1.); }`;

/* turns: the cat's frame turned against the world's in the planes it lists, composed in order */
export const PLANES = { xw: [0, 3], zw: [2, 3], yw: [1, 3], xz: [0, 2] };
export function rotation(angles) { // cat → world, row-major 4×4
  let R = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const [name, th] of Object.entries(angles)) {
    if (!th) continue;
    const [i, j] = PLANES[name], c = Math.cos(th), s = Math.sin(th), G = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    G[i * 4 + i] = c; G[i * 4 + j] = -s; G[j * 4 + i] = s; G[j * 4 + j] = c;
    const N = new Array(16).fill(0);
    for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) for (let k = 0; k < 4; k++) N[r * 4 + q] += G[r * 4 + k] * R[k * 4 + q];
    R = N;
  }
  return R;
}
export const apply = (R, q) => [0, 1, 2, 3].map((r) => R[r * 4] * q[0] + R[r * 4 + 1] * q[1] + R[r * 4 + 2] * q[2] + R[r * 4 + 3] * q[3]);

export function makeLab(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: /[?&]shot/.test(location.search) });
  if (!gl) throw new Error("This needs WebGL2.");
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {}; for (const n of ["uRes", "uEye", "uCR", "uCU", "uCF", "uTan", "uRot", "uPos", "uBound", "uW", "uK", "uFeet", "uTime", "uNC", "uNE", "uA", "uB", "uCp", "uEc", "uEr", "uEp", "uPaw", "uNP", "uSF", "uNSF", "uCom", "uCav", "uCavR", "uEyeC", "uLook"]) U[n] = gl.getUniformLocation(prog, n);
  const st = { yaw: 1.05, pitch: 0.2, dist: 1.55, target: [-0.03, 0.24, 0], W: 0, angles: { xw: 0, zw: 0, yw: 0, xz: 0 }, pos: [0, 0, 0, 0], idle: true, feet: true, scale: 0.8, legs: 4, body: {}, support: false, walk: null, track: [0, 0, 0], mouth: 0 };
  let last = performance.now(), slow = 0;

  function draw(t, still = false) {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.max(1, Math.round(canvas.clientWidth * dpr * st.scale)), h = Math.max(1, Math.round(canvas.clientHeight * dpr * st.scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    const R = rotation(st.angles);
    // walking: the gait puts the feet and sways the body; the cat moves forward along its own x, wherever that points
    let walkPose = {}, d = 0;
    if (st.walk) { const g = st.walk.gait.at((t - st.walk.t0) * st.walk.speed); walkPose = { feet: g.feet, sway: g.sway }; d = g.d + st.walk.d0; st.walk.d = d; }
    const P = pose(t, { idle: st.idle, legs: st.legs, mouth: st.mouth, ...st.body, ...walkPose });
    // the cat's origin in the world: turns pivot on its head (origin = pos + HEAD − R·HEAD), and the walk carries it forward
    const RH = apply(R, HEAD), fw = apply(R, [d, 0, 0, 0]), origin = st.pos.map((x, i) => x + HEAD[i] - RH[i] + fw[i]);
    st.track = [origin[0] - st.pos[0], 0, origin[2] - st.pos[2]]; // the camera follows the cat across your space
    // only the parts that reach your slice: the hyperplane w = W is n·q = W − origin.w in the cat's frame, n = R's last row
    const n = [R[12], R[13], R[14], R[15]], { parts } = cut(P, n, st.W - origin[3]);
    const caps = parts.filter((p) => p.a), ells = parts.filter((p) => p.c);
    const f4 = (arr, fn) => { const a = new Float32Array(arr.length * 4); arr.forEach((x, i) => a.set(fn(x), i * 4)); return a; };
    gl.uniform1i(U.uNC, caps.length); gl.uniform1i(U.uNE, ells.length);
    if (caps.length) { gl.uniform4fv(U.uA, f4(caps, (k) => k.a)); gl.uniform4fv(U.uB, f4(caps, (k) => k.b)); gl.uniform4fv(U.uCp, f4(caps, (k) => [k.ra, k.rb, k.m, k.wx])); }
    if (ells.length) { gl.uniform4fv(U.uEc, f4(ells, (e) => e.c)); gl.uniform4fv(U.uEr, f4(ells, (e) => e.r)); gl.uniform4fv(U.uEp, f4(ells, (e) => [e.m, e.wx, 0, 0])); }
    // world → cat is Rᵀ; a GLSL mat4 reads its array by columns, so R's rows, in order, are Rᵀ's columns
    gl.uniformMatrix4fv(U.uRot, false, new Float32Array(R));
    gl.uniform4fv(U.uPos, origin);
    if (P.cavity) { gl.uniform4fv(U.uCav, P.cavity.c); gl.uniform4fv(U.uCavR, P.cavity.r); } else gl.uniform4f(U.uCavR, 0, 0, 0, 0);
    gl.uniform4fv(U.uEyeC, f4(P.eyes, (e) => e));
    const bc = apply(R, [-0.05, 0.27, 0, 0]).map((x, i) => x + origin[i]);
    gl.uniform4f(U.uBound, bc[0], bc[1], bc[2], 0.72);
    const pw = paws(P).map((p) => apply(R, p).map((x, i) => x + origin[i]));
    gl.uniform4fv(U.uPaw, f4(pw, (p) => p)); gl.uniform1i(U.uNP, pw.length);
    // the support, from the feet actually down and the centre of mass actually where it is (only while the cat stands
    // upright: a turn through y lifts its floor off yours)
    let sup = null;
    if (st.support && Math.abs(R[5] - 1) < 1e-9) {
      const fl = (p) => [p[0], p[2], p[3]], h = hull(pw.map(fl)), com = apply(R, mass(P).c).map((x, i) => x + origin[i]), m = margin(h, fl(com));
      sup = { dim: h.dim, margin: m, ok: m >= NEED - 1e-6, com: fl(com), feet: pw.map(fl) };
      const F = h.faces.slice(0, 16); gl.uniform1i(U.uNSF, F.length); if (F.length) gl.uniform4fv(U.uSF, f4(F, (f) => [...f.n, f.c]));
      gl.uniform4f(U.uCom, com[0], com[2], com[3], sup.ok ? 1 : 2);
    } else { gl.uniform1i(U.uNSF, 0); gl.uniform4f(U.uCom, 0, 0, 0, 0); }
    gl.uniform1f(U.uW, st.W); gl.uniform1f(U.uK, K); gl.uniform1f(U.uFeet, st.feet ? 1 : 0); gl.uniform1f(U.uTime, t);
    const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch), tg = st.target.map((x, i) => x + st.track[i]);
    const eye = [tg[0] + st.dist * cp * sy, tg[1] + st.dist * sp, tg[2] + st.dist * cp * cy];
    const F = tg.map((x, i) => x - eye[i]), fl = Math.hypot(...F), Fn = F.map((x) => x / fl);
    const Rr = [Fn[2], 0, -Fn[0]].map((x, _, a) => x / Math.hypot(...a)), Uu = [Rr[1] * Fn[2] - Rr[2] * Fn[1], Rr[2] * Fn[0] - Rr[0] * Fn[2], Rr[0] * Fn[1] - Rr[1] * Fn[0]];
    gl.uniform3fv(U.uEye, eye); { const Rt = (x) => [0, 1, 2, 3].map((c) => R[c] * x[0] + R[4 + c] * x[1] + R[8 + c] * x[2] + R[12 + c] * x[3]); gl.uniform4fv(U.uLook, Rt([eye[0] - origin[0], eye[1] - origin[1], eye[2] - origin[2], st.W - origin[3]])); } gl.uniform3fv(U.uCF, Fn); gl.uniform3fv(U.uCR, Rr.map((x) => -x)); gl.uniform3fv(U.uCU, Uu.map((x) => -x));
    gl.uniform1f(U.uTan, Math.tan((38 * Math.PI) / 360)); gl.uniform2f(U.uRes, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // keep it smooth: drop the resolution when frames run long, raise it when there's room
    const now = performance.now(), dt = now - last; last = now;
    const seen = pw.filter((p) => Math.abs(p[3] - st.W) < 0.03).length, feet = { seen, unseen: pw.length - seen, eyes: parts.filter((p) => p.g === "eyes").length };
    if (still) return { groups: cut(P, n, st.W - origin[3]).groups, R, sup, feet };
    if (dt > 40) slow++; else if (dt < 22) slow--;
    if (slow > 8) { st.scale = Math.max(0.35, st.scale * 0.85); slow = 0; } else if (slow < -40) { st.scale = Math.min(1, st.scale * 1.1); slow = 0; }
    return { groups: cut(P, n, st.W - origin[3]).groups, R, sup, feet };
  }
  /* start or stop walking. The five-legged cat walks a wave gait, one foot at a time, statically balanced, at 80% of
     its longest stride; the cat with four can't, so it trots (diagonal pairs, beta 0.5): two feet down, a line, falling
     between steps, which this lab can show but not yet hold up (it needs dynamics) */
  function walk(on, t) {
    if (!on) { if (st.walk) st.pos = st.pos.map((x, i) => x + apply(rotation(st.angles), [st.walk.d, 0, 0, 0])[i]); st.walk = null; return null; }
    const fl = (p) => [p[0], p[2], p[3]], o = { legs: st.legs }, R = rig(o), com = fl(mass(pose(0, { idle: false, ...o })).c);
    let gait;
    if (st.legs === 5) { const m = maxStride(R, com, { steps: 9 }); gait = wave(R, com, { L: 0.8 * m.L, order: m.gait.groups }); gait.Lmax = m.L; }
    else gait = wave(R, com, { L: 0.08, beta: 0.5, T: 0.9, order: [["front +z", "hind −w"], ["front −z", "hind +w"]] });
    st.walk = { gait, t0: t, speed: 1, d0: 0, d: 0 };
    return gait;
  }
  return { st, draw, gl, walk };
}

export { MAT };
