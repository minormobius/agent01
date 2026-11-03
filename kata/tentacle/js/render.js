/* TENTACLE's renderer, shared with the OCTOPUS page: one shader that sphere-traces arms (chains of round cones in d
   dimensions, with suckers) and, optionally, a body, in your 3D slice. Everything about the arms comes from one float
   texture, a column per node, 8 rows:
     0 position · 1 (radius, s, mean activation, sucker coordinate u) · 2–5 the frame (T, e1, e2, e3)
     6 (dipole, rest radius) · 7 (twist rates / 9, 0)
   The arms sit end to end, uPer nodes each (one arm of 65, the knot's 117, eight of 65). Culling: a ball round each
   arm, then a ball round each run of eight segments. Keep shader comments on their own lines: a // at the end of a
   statement line once swallowed an else. */
export const NMAX = 640;
const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; precision highp sampler2D;
uniform vec2 uRes; uniform float uTan; uniform vec3 uEye, uCR, uCU, uCF;
uniform vec4 uO, uE0, uE1, uE2, uN; uniform int uD, uArms, uPer, uBody; uniform vec4 uGB[64], uAB[8]; uniform float uSuck;
uniform sampler2D uArm; // per node (columns): row 0 position, 1 (radius, s, mean activation, sucker coordinate u), 2–5 the frame (T, e1, e2, e3), 6 (dipole, rest radius), 7 (twist rates, 0)
out vec4 o;
vec4 nodeP(int i) { return texelFetch(uArm, ivec2(i, 0), 0); }
float nodeR(int i) { return texelFetch(uArm, ivec2(i, 1), 0).x; }
const float DU = 0.75, PHI = 0.47; // suckers: one every 0.75 radii of arm, set 0.47 rad off the oral line (−e1)
// a sucker in its own coordinates: h up its axis (out of the skin), q how far off the axis (in every other direction:
// the same profile turned round its axis, so in 4D a cup is a ball's worth of rim, not a ring)
float sdCup(float q, float h, float rc) {
  vec2 w = vec2(q - 0.72 * rc, abs(h + 0.1 * rc) - 0.5 * rc); float stalk = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.26 * rc;
  float hollow = length(vec2(q, h - 0.95 * rc)) - 0.72 * rc;
  return max(stalk, -hollow);
}
// the direction of sucker k across the arm, in the frame (e1, e2, e3): two staggered rows in 3D; in 4D a spiral at the
// golden angle round the oral pole of the skin's 2-sphere
vec4 cupDir(int k, vec4 e1, vec4 e2, vec4 e3) {
  if (uD == 3) return -cos(PHI) * e1 + sin(PHI) * ((k & 1) == 0 ? 1.0 : -1.0) * e2;
  float psi = 2.39996 * float(k); return -cos(PHI) * e1 + sin(PHI) * (cos(psi) * e2 + sin(psi) * e3);
}
// distance from p to the arm: round cones between nodes, in groups of eight with bounding balls; the nearest segment and
// how far along it; then the suckers near there, smoothly joined; mat 1 on a sucker (2 inside its cup)
float sdArm(vec4 p, out int seg, out float hh, out int mat) {
  float d = 1e9; seg = 0; hh = 0.0; mat = 0; int gpa = (uPer + 6) / 8;
  for (int a = 0; a < 8; a++) {
   if (a >= uArms) break;
   // the arm's own bounding ball: centred on its middle node, radius in uAB[a].w
   vec4 ac = texelFetch(uArm, ivec2(a * uPer + uPer / 2, 0), 0); if (length(p - ac) - uAB[a].w > d) continue;
   for (int g = 0; g < 16; g++) {
    if (g * 8 + 1 >= uPer) break;
    vec4 gc = texelFetch(uArm, ivec2(a * uPer + min(g * 8 + 4, uPer - 1), 0), 0); if (length(p - gc) - uGB[a * gpa + g].w > d) continue;
    for (int k = 0; k < 8; k++) {
      int li = g * 8 + k; if (li + 1 >= uPer) break; int i = a * uPer + li;
      vec4 a = nodeP(i), b = nodeP(i + 1), ab = b - a, ap = p - a; float ra = nodeR(i), rb = nodeR(i + 1), h = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0), e = length(ap - ab * h) - mix(ra, rb, h);
      if (e < d) { d = e; seg = i; hh = h; }
    }
   }
  }
  if (uSuck > 0.5 && d < 0.2) {
    vec4 iA = texelFetch(uArm, ivec2(seg, 1), 0), iB = texelFetch(uArm, ivec2(seg + 1, 1), 0), A = nodeP(seg), B = nodeP(seg + 1);
    vec4 e1 = texelFetch(uArm, ivec2(seg, 3), 0), e2 = texelFetch(uArm, ivec2(seg, 4), 0), e3 = texelFetch(uArm, ivec2(seg, 5), 0);
    float u = mix(iA.w, iB.w, hh), cd = 1e9; int k0 = int(floor(u / DU)); bool inCup = false;
    for (int j = -1; j <= 1; j++) {
      int k = k0 + j; float uk = (float(k) + 0.5) * DU, tk = (uk - iA.w) / max(iB.w - iA.w, 1e-6);
      if (k < 2) continue;
      vec4 C = A + (B - A) * tk, m = cupDir(k, e1, e2, e3); float r = mix(iA.x, iB.x, tk), rc = 0.36 * r;
      vec4 S = C + m * r * 0.92, v = p - S; float h = dot(v, m), q = length(v - h * m), c = sdCup(q, h, rc);
      if (c < cd) { cd = c; inCup = h > 0.15 * rc && q < 0.62 * rc; }
    }
    // (only when a sucker is near: mix(1e9, d, 1) is not d in single precision)
    if (cd < d + 0.05) {
      float kk = 0.02 * iA.x, hm = clamp(0.5 + 0.5 * (cd - d) / kk, 0.0, 1.0);
      if (cd < d + 0.002) mat = inCup ? 2 : 1;
      d = mix(cd, d, hm) - kk * hm * (1.0 - hm);
    }
  }
  // the body it grows from: a ball under the base (one arm); a head, mantle and eyes (the octopus)
  if (uBody == 1) { float body = length(p - vec4(0.0, -0.28, 0.0, 0.0)) - 0.34; if (body < d) { d = body; seg = -1; mat = 0; } }
  if (uBody == 2) {
    float head = length(p) - 0.42;
    vec4 ma = vec4(0.0, 0.2, -0.05, 0.0), mb = vec4(0.0, 0.95, -0.32, 0.0), ab = mb - ma; float h = clamp(dot(p - ma, ab) / dot(ab, ab), 0.0, 1.0), mantle = length(p - ma - ab * h) - mix(0.4, 0.3, h);
    float kb = 0.12, hb = clamp(0.5 + 0.5 * (mantle - head) / kb, 0.0, 1.0), body = mix(mantle, head, hb) - kb * hb * (1.0 - hb);
    // the eyes: two in 3D, at ±x; four in 4D, at ±x and ±w (a ring of them round the head)
    float eye = min(length(p - vec4(0.34, 0.1, 0.17, 0.0)), length(p - vec4(-0.34, 0.1, 0.17, 0.0))) - 0.1;
    if (uD == 4) eye = min(eye, min(length(p - vec4(0.0, 0.1, 0.17, 0.34)), length(p - vec4(0.0, 0.1, 0.17, -0.34))) - 0.1);
    if (body < d) { d = body; seg = -1; mat = 0; }
    if (eye < d) { d = eye; seg = -2; mat = 0; }
  }
  return d;
}
float sdOnly(vec4 p) { int s, m; float h; return sdArm(p, s, h, m); }
vec3 abyss(vec3 d) { return mix(vec3(0.01, 0.03, 0.06), vec3(0.05, 0.12, 0.2), smoothstep(-0.5, 0.9, d.y)) + vec3(0.2, 0.35, 0.45) * pow(max(dot(d, normalize(vec3(0.3, 0.8, -0.4))), 0.0), 16.0) * 0.5; }
void main() {
  vec2 q = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 d = normalize(uCF + q.x * uTan * uCR + q.y * uTan * uCU), c = abyss(d);
  float t = 0.5; bool hit = false; vec4 P;
  for (int i = 0; i < 110; i++) { vec3 e3 = uEye + d * t; P = uO + e3.x * uE0 + e3.y * uE1 + e3.z * uE2; float e = sdOnly(P); if (e < 0.0015 * t) { hit = true; break; } t += e * 0.9; if (t > 30.0) break; }
  if (hit) {
    int seg, mat; float h; sdArm(P, seg, h, mat); const float eps = 0.003;
    vec4 n = normalize(vec4(sdOnly(P + vec4(eps, 0, 0, 0)) - sdOnly(P - vec4(eps, 0, 0, 0)), sdOnly(P + vec4(0, eps, 0, 0)) - sdOnly(P - vec4(0, eps, 0, 0)), sdOnly(P + vec4(0, 0, eps, 0)) - sdOnly(P - vec4(0, 0, eps, 0)), sdOnly(P + vec4(0, 0, 0, eps)) - sdOnly(P - vec4(0, 0, 0, eps))));
    vec4 L = normalize(vec4(0.4, 0.8, -0.35, 0.25)); float lam = max(dot(n, L), 0.0), rim = pow(1.0 - abs(dot(n, vec4(d.x * uE0 + d.y * uE1 + d.z * uE2))), 3.0);
    vec3 base;
    if (seg == -2) {
      // an eye: gold, with a dark bar of a pupil across it
      vec4 ec = P.x > 0.2 ? vec4(0.34, 0.1, 0.17, 0.0) : P.x < -0.2 ? vec4(-0.34, 0.1, 0.17, 0.0) : P.w > 0.0 ? vec4(0.0, 0.1, 0.17, 0.34) : vec4(0.0, 0.1, 0.17, -0.34);
      vec4 v = normalize(P - ec); base = abs(v.y) < 0.25 && dot(v, normalize(ec)) > 0.7 ? vec3(0.02) : vec3(0.85, 0.62, 0.18);
    } else if (seg < 0) base = uBody == 2 ? mix(vec3(0.42, 0.07, 0.16), vec3(0.6, 0.18, 0.24), 0.5 + 0.5 * sin(9.0 * P.x + 7.0 * P.y + 5.0 * P.z + 6.0 * P.w)) : vec3(0.22, 0.08, 0.16);
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
    // suckers: a pale rim, a dark rose cup
    if (seg >= 0 && mat == 1) base = mix(base, vec3(0.93, 0.8, 0.72), 0.75);
    if (seg >= 0 && mat == 2) base = vec3(0.45, 0.12, 0.16);
    c = base * (0.45 + 0.95 * lam) + vec3(0.55, 0.75, 0.95) * rim * 0.45; // lit from above, a cold rim from the water behind
    c = mix(c, abyss(d), 1.0 - exp(-t / 25.0));
  }
  o = vec4(c / (1.0 + 0.15 * c), 1.0);
}`;

export function makeRenderer(glc) {
  const gl = glc.getContext("webgl2", { antialias: false });
  if (!gl) { document.body.innerHTML = `<p style="padding:20px;font-family:monospace">This needs WebGL2.</p>`; throw new Error("no WebGL2"); }
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = {}; for (const n of ["uRes", "uTan", "uEye", "uCR", "uCU", "uCF", "uO", "uE0", "uE1", "uE2", "uN", "uD", "uArms", "uPer", "uGB", "uAB", "uArm", "uBody", "uSuck"]) U[n] = gl.getUniformLocation(prog, n);
  const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, NMAX, 8, 0, gl.RGBA, gl.FLOAT, null); gl.uniform1i(U.uArm, 0);
  const D = new Float32Array(NMAX * 8 * 4), pad4 = (v) => [v[0] || 0, v[1] || 0, v[2] || 0, v[3] || 0];
  const dist4 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], (a[3] || 0) - (b[3] || 0));
  return {
    gl,
    /* the scene: nodes [{x, F, r, s}] for arms × per, st (per node: {mean, dip, twist} or null), skin {u, rr} per node,
       body 0 none, 1 a ball under one arm, 2 the octopus's head, mantle and eyes */
    upload({ d, nodes, arms = 1, per = nodes.length, st = null, skin, body = 0, suckers = true }) {
      D.fill(0); const put = (row, i, v) => D.set(pad4(v), 4 * (row * NMAX + i));
      nodes.forEach((nd, i) => {
        const sk = st ? st[i] : null;
        put(0, i, nd.x); put(1, i, [nd.r, nd.s ?? 0, sk ? sk.mean : 0, skin.u[i]]); for (let r = 0; r < nd.F.length; r++) put(2 + r, i, nd.F[r]);
        put(6, i, [...(sk ? sk.dip : [0, 0, 0]), 0, 0].slice(0, 3).concat([skin.rr[i]])); put(7, i, sk ? sk.twist.map((v) => v / 9) : [0, 0, 0]);
      });
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NMAX, 8, gl.RGBA, gl.FLOAT, D);
      // bounding balls: each arm's round its middle node, and each run of eight segments' round its node 4
      const gpa = Math.floor((per + 6) / 8), GB = new Float32Array(256), AB = new Float32Array(32);
      for (let a = 0; a < arms; a++) {
        const b0 = a * per, mid = nodes[b0 + (per >> 1)].x; let ra = 0;
        for (let g = 0; g * 8 + 1 < per; g++) {
          const c = nodes[b0 + Math.min(per - 1, g * 8 + 4)].x; let r = 0;
          for (let i = g * 8; i <= Math.min(per - 1, g * 8 + 8); i++) r = Math.max(r, dist4(nodes[b0 + i].x, c) + nodes[b0 + i].r * 1.4);
          GB[4 * (a * gpa + g) + 3] = r + 0.01;
        }
        for (let i = 0; i < per; i++) ra = Math.max(ra, dist4(nodes[b0 + i].x, mid) + nodes[b0 + i].r * 1.4);
        AB[4 * a + 3] = ra + 0.01;
      }
      gl.uniform4fv(U.uGB, GB); gl.uniform4fv(U.uAB, AB); gl.uniform1i(U.uArms, arms); gl.uniform1i(U.uPer, per); gl.uniform1i(U.uD, d); gl.uniform1i(U.uBody, body); gl.uniform1f(U.uSuck, suckers ? 1 : 0);
    },
    /* draw: cam {eye, R, U, F}, tan, the slice {O, E (3 rows), N} (4D) or null (3D) */
    draw(cam, tan, slice) {
      const cw = glc.width, chh = glc.height; gl.viewport(0, 0, cw, chh); gl.uniform2f(U.uRes, cw, chh); gl.uniform1f(U.uTan, tan);
      gl.uniform3fv(U.uEye, cam.eye); gl.uniform3fv(U.uCR, cam.R); gl.uniform3fv(U.uCU, cam.U); gl.uniform3fv(U.uCF, cam.F);
      if (slice) { gl.uniform4fv(U.uO, slice.O); gl.uniform4fv(U.uE0, slice.E[0]); gl.uniform4fv(U.uE1, slice.E[1]); gl.uniform4fv(U.uE2, slice.E[2]); gl.uniform4fv(U.uN, slice.N); }
      else { gl.uniform4fv(U.uO, [0, 0, 0, 0]); gl.uniform4fv(U.uE0, [1, 0, 0, 0]); gl.uniform4fv(U.uE1, [0, 1, 0, 0]); gl.uniform4fv(U.uE2, [0, 0, 1, 0]); gl.uniform4fv(U.uN, [0, 0, 0, 1]); }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
