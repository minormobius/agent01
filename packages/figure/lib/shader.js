// shader.js — the figure drawn the way anime draws: flat colour, one shadow,
// a rim of light, and ink lines of two weights. WebGL2, two passes.
//
// Pass 1 raymarches the body's distance field (the same primitives body.js
// measures in node) and writes, per pixel: the view-space normal, the depth,
// the group the ray hit, and whether it hit a construction line on the head.
// Pass 2 reads that and draws: tone from the normal (a hard terminator, a
// cool shadow, a warm rim), and ink wherever the neighbourhood disagrees —
// against the background (the silhouette: the heaviest line), between groups
// or across a jump in depth (an arm in front of the body: a medium line), or
// across a fold in the normal (a crease: the lightest line). Pass 1 runs at
// twice the output resolution and pass 2 averages four samples, so the lines
// are antialiased.

import { pack, groupBounds, TEXELS, GROUPS } from './body.js';
import { cross, norm, sub, add, scale } from './vec.js';

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const GEOM = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 uv; out vec4 o;
uniform sampler2D prims; uniform int count;
uniform vec4 gb[${GROUPS.length}];      // group bounding spheres
uniform ivec2 gr[${GROUPS.length}];     // group prim ranges
uniform vec3 camC, camR, camU, camF; uniform vec2 halfSize;     // orthographic camera
uniform float persp;                                     // 0 = orthographic, else the focal length
uniform vec3 headC, headX, headY, headZ; uniform float eyeLine, headW;
uniform vec3 bmin, bmax;

vec4 T(int i, int j){ return texelFetch(prims, ivec2(j, i), 0); }
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 ba = b - a; float l2 = dot(ba, ba);
  if (l2 < 1e-10) return length(p - a) - r1;
  float rr = r1 - r2; float a2 = l2 - rr*rr; float il2 = 1.0/l2;
  vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
  vec3 xv = pa*l2 - ba*y; float x2 = dot(xv, xv); float y2 = y*y*l2; float z2 = z*z*l2;
  float k = sign(rr)*rr*rr*x2;
  if (sign(z)*a2*z2 > k) return sqrt(x2 + z2)*il2 - r2;
  if (sign(y)*a2*y2 < k) return sqrt(x2 + y2)*il2 - r1;
  return (sqrt(x2*a2*il2) + y*rr)*il2 - r1;
}
float sdEll(vec3 p, vec3 c, vec3 X, vec3 Y, vec3 Z, vec3 r){
  vec3 d = p - c; vec3 q = vec3(dot(d, X), dot(d, Y), dot(d, Z));
  float k0 = length(q / r); float k1 = length(q / (r*r));
  return k1 > 1e-9 ? k0*(k0 - 1.0)/k1 : -min(r.x, min(r.y, r.z));
}
float smin(float a, float b, float k){ if (k <= 0.0 || a > 1e8) return min(a, b); float h = max(k - abs(a - b), 0.0)/k; return min(a, b) - h*h*k*0.25; }
float prim(int i, vec3 p){
  vec4 t0 = T(i, 0), t1 = T(i, 1), t2 = T(i, 2);
  if (t2.x < 0.5) return sdRoundCone(p, t0.xyz, t1.xyz, t0.w, t1.w);
  vec4 t3 = T(i, 3), t4 = T(i, 4), t5 = T(i, 5);
  return sdEll(p, t0.xyz, t3.xyz, t4.xyz, t5.xyz, vec3(t3.w, t4.w, t5.w));
}
// the body: smooth within a group, hard between; returns (distance, group)
vec2 map(vec3 p){
  float best = 1e9; float g = -1.0;
  for (int gi = 0; gi < ${GROUPS.length}; gi++) {
    vec4 s = gb[gi];
    if (s.w <= 0.0) continue;
    float bound = length(p - s.xyz) - s.w;
    if (bound > best) continue;                 // this whole limb is farther than what we have
    if (bound > 0.3) { if (bound < best) { best = bound; g = -1.0; } continue; }
    // centre parts, then each side blended onto the centre (see body.js)
    float c = 1e9, dl = 1e9, dr = 1e9; bool sided = false;
    for (int i = gr[gi].x; i < gr[gi].y; i++) {
      vec4 t2 = T(i, 2); float di = prim(i, p);
      if (t2.w == 0.0) { c = smin(c, di, t2.z); dl = c; dr = c; }
      else if (t2.w > 0.0) { sided = true; dl = smin(dl, di, t2.z); }
      else { sided = true; dr = smin(dr, di, t2.z); }
    }
    float d = sided ? min(dl, dr) : c;
    if (d < best) { best = d; g = float(gi); }
  }
  return vec2(best, g);
}
vec3 normal(vec3 p){
  const vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x));
}
vec2 box(vec3 ro, vec3 rd){
  vec3 inv = 1.0 / rd; vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 lo = min(t0, t1), hi = max(t0, t1);
  return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}
void main(){
  vec2 s = (uv * 2.0 - 1.0) * halfSize;
  vec3 ro, rd;
  if (persp > 0.0) { ro = camC - camF * persp; rd = normalize(camF * persp + camR * s.x + camU * s.y); }
  else { ro = camC + camR * s.x + camU * s.y - camF * 30.0; rd = camF; }
  vec2 tb = box(ro, rd);
  o = vec4(0.5, 0.5, 1.0, 0.0);
  if (tb.x > tb.y || tb.y < 0.0) return;
  float t = max(tb.x, 0.0);
  vec2 h = vec2(1.0, -1.0);
  for (int i = 0; i < 160; i++) {
    vec3 p = ro + rd * t;
    h = map(p);
    if (h.x < 0.0008 * (1.0 + t * 0.02)) break;
    t += h.x * 0.9;
    if (t > tb.y) { h.y = -1.0; break; }
  }
  if (h.y < 0.0 || t > tb.y) return;
  vec3 p = ro + rd * t;
  vec3 n = normal(p);
  vec3 nv = vec3(dot(n, camR), dot(n, camU), -dot(n, camF));
  // the head's construction lines: the centre line and the eye line, front half only
  float mark = 0.0;
  if (int(h.y) == 1) {
    vec3 q = p - headC; vec3 l = vec3(dot(q, headX), dot(q, headY), dot(q, headZ));
    if (l.z > 0.05 && ((abs(l.x) < 0.012 && l.y > -0.08) || (abs(l.y - eyeLine) < 0.012 && abs(l.x) < headW * 0.5))) mark = 1.0;
  }
  float depth = clamp(dot(p - (camC - camF * 30.0), camF) / 60.0, 0.0, 1.0);
  o = vec4(nv.xy * 0.5 + 0.5, depth, (h.y + 1.0 + mark * 64.0) / 255.0);
}`;

const INK = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D g; uniform vec2 px;            // geometry pass, one of ITS texels in uv
uniform vec3 light;                              // in view space
uniform vec3 base[${GROUPS.length}], shade[${GROUPS.length}];
uniform vec3 inkC, paper; uniform float wOut, wIn, wCrease;
uniform float bgAlpha;

vec4 G(vec2 q){ return texture(g, q); }
float gid(vec4 s){ return floor(mod(s.w * 255.0 + 0.5, 64.0)); }
vec3 N(vec4 s){ vec2 xy = s.xy * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }

// ink coverage at one geometry sample
vec2 inkAt(vec2 q){
  vec4 c = G(q); float id = gid(c);
  float ink = 0.0;
  // silhouette: anything within wOut texels that is background (or, from outside, figure)
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 d = vec2(cos(a), sin(a));
    vec4 so = G(q + d * px * wOut);
    if ((id == 0.0) != (gid(so) == 0.0)) ink = 1.0;
    if (id > 0.0 && gid(so) > 0.0) {
      vec4 si = G(q + d * px * wIn);
      float di = gid(si);
      // an overlap (a jump in depth) draws on its far side; where two groups meet
      // in a fold (the armpit, the groin) the seam is inked, where they merge flat it is not
      bool jump = abs(si.z - c.z) > 0.004;
      bool fold = di != id && dot(N(si), N(c)) < 0.8;
      if (di > 0.0 && (jump || fold) && c.z > si.z - 0.0005) ink = 1.0;
      vec4 sc = G(q + d * px * wCrease);
      if (gid(sc) == id && dot(N(sc), N(c)) < 0.55 && abs(sc.z - c.z) < 0.004) ink = max(ink, 0.8);
    }
  }
  if (c.w * 255.0 > 64.5 && id > 0.0) ink = max(ink, 0.55);   // construction lines on the head
  return vec2(ink, id);
}
vec3 tone(vec2 q){
  vec4 c = G(q); float id = gid(c);
  if (id == 0.0) return paper;
  int gi = int(id) - 1;
  vec3 n = N(c);
  float l = dot(n, light);
  float lit = smoothstep(0.26, 0.32, l);                       // one hard terminator, well round toward the light
  vec3 col = mix(shade[gi], base[gi], lit);
  float rim = smoothstep(0.62, 0.8, 1.0 - n.z) * smoothstep(-0.2, 0.3, dot(n.xy, -light.xy)) ;
  col = mix(col, base[gi] * 1.08 + 0.04, rim * 0.55 * (1.0 - lit));   // a warm rim on the shadow side
  return col;
}
void main(){
  vec3 acc = vec3(0.0); float cov = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 q = uv + (vec2(float(k & 1), float(k >> 1)) - 0.5) * px;
    vec2 ik = inkAt(q);
    vec3 c = tone(q);
    acc += mix(c, inkC, ik.x);
    cov += (ik.y > 0.0 || ik.x > 0.0) ? 1.0 : 0.0;
  }
  vec3 col = acc * 0.25;
  float a = mix(bgAlpha, 1.0, cov * 0.25);
  o = vec4(col, a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
  return s;
}
function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

export const STYLE = {
  paper: '#f4efe4', ink: '#2a2230',
  skin: '#f6d9c4', skinShade: '#d9a3a0',
  groups: {},                              // per-group overrides: { arm_l: ['#base', '#shade'] }
  light: [-0.55, 0.62, 0.56],              // view space: from the upper left, in front
  lines: { out: 2.6, in: 1.5, crease: 1.2 },   // in geometry texels (twice the output pixels)
};

/**
 * A renderer bound to one WebGL2 canvas. draw(prims, camera, style) renders a
 * figure into the canvas (transparent background unless style.paperFill).
 */
export function makeRenderer(canvas, { supersample = 2 } = {}) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error('WebGL2 is not available');
  const pg = program(gl, GEOM), pi = program(gl, INK);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const primTex = gl.createTexture();
  const geoTex = gl.createTexture(), fb = gl.createFramebuffer();
  let gw = 0, gh = 0;
  const U = (p, n) => gl.getUniformLocation(p, n);

  function draw(prims, P, cam, style = STYLE) {
    const W = canvas.width, H = canvas.height;
    const gW = Math.round(W * supersample), gH = Math.round(H * supersample);
    if (gw !== gW || gh !== gH) {
      gw = gW; gh = gH;
      gl.bindTexture(gl.TEXTURE_2D, geoTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gw, gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, geoTex, 0);
    }
    // the primitives, as a float texture
    const data = pack(prims);
    gl.bindTexture(gl.TEXTURE_2D, primTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TEXELS, prims.length, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // pass 1
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, gw, gh);
    gl.useProgram(pg);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, primTex); gl.uniform1i(U(pg, 'prims'), 0);
    const gbs = groupBounds(prims);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    gbs.forEach((b, i) => {
      gl.uniform4f(U(pg, `gb[${i}]`), ...(b ? [...b.c, b.r] : [0, 0, 0, 0]));
      gl.uniform2i(U(pg, `gr[${i}]`), b ? b.start : 0, b ? b.end : 0);
      if (b) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.c[k] - b.r); hi[k] = Math.max(hi[k], b.c[k] + b.r); }
    });
    gl.uniform3f(U(pg, 'bmin'), ...lo); gl.uniform3f(U(pg, 'bmax'), ...hi);
    gl.uniform3f(U(pg, 'camC'), ...cam.c); gl.uniform3f(U(pg, 'camR'), ...cam.r); gl.uniform3f(U(pg, 'camU'), ...cam.u); gl.uniform3f(U(pg, 'camF'), ...cam.f);
    gl.uniform2f(U(pg, 'halfSize'), cam.halfW, cam.halfH); gl.uniform1f(U(pg, 'persp'), cam.persp || 0);
    const HF = P.F.head, hc = add(P.J.headPivot, [0, 0, 0]);
    gl.uniform3f(U(pg, 'headC'), ...hc); gl.uniform3f(U(pg, 'headX'), ...HF.x); gl.uniform3f(U(pg, 'headY'), ...HF.y); gl.uniform3f(U(pg, 'headZ'), ...HF.z);
    gl.uniform1f(U(pg, 'eyeLine'), P.rig.m.head.eyeLine - P.rig.m.head.pivotUp); gl.uniform1f(U(pg, 'headW'), P.rig.m.head.width);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // pass 2
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.useProgram(pi);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, geoTex); gl.uniform1i(U(pi, 'g'), 0);
    gl.uniform2f(U(pi, 'px'), 1 / gw, 1 / gh);
    const L = norm(style.light); gl.uniform3f(U(pi, 'light'), ...L);
    GROUPS.forEach((name, i) => {
      const [b, s] = style.groups?.[name] || [style.skin, style.skinShade];
      gl.uniform3f(U(pi, `base[${i}]`), ...hex(b)); gl.uniform3f(U(pi, `shade[${i}]`), ...hex(s));
    });
    gl.uniform3f(U(pi, 'inkC'), ...hex(style.ink)); gl.uniform3f(U(pi, 'paper'), ...hex(style.paper));
    gl.uniform1f(U(pi, 'wOut'), style.lines.out); gl.uniform1f(U(pi, 'wIn'), style.lines.in); gl.uniform1f(U(pi, 'wCrease'), style.lines.crease);
    gl.uniform1f(U(pi, 'bgAlpha'), style.paperFill ? 1 : 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  /** The geometry pass's group ids (0 = background), for tests: Uint8Array, gw × gh, rows bottom-up. */
  function readGroups() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const px = new Uint8Array(gw * gh * 4);
    gl.readPixels(0, 0, gw, gh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const ids = new Uint8Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) ids[i] = px[i * 4 + 3] % 64;
    return { ids, w: gw, h: gh };
  }
  return { draw, gl, readGroups };
}

/** An orthographic camera looking at `target` from yaw (0 = the front) and pitch (+ = from above). */
export function camera({ target = [0, 3.5, 0], yaw = 0, pitch = 0, height = 8, aspect = 0.5, persp = 0 } = {}) {
  const dir = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];   // from the target toward the eye
  const f = scale(dir, -1);
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  return { c: target, f, r, u, halfH: height / 2, halfW: (height / 2) * aspect, persp };
}

/** Project a world point to canvas pixels, for overlays. */
export function project(cam, p, W, H) {
  const d = sub(p, cam.c);
  const x = (d[0] * cam.r[0] + d[1] * cam.r[1] + d[2] * cam.r[2]) / cam.halfW, y = (d[0] * cam.u[0] + d[1] * cam.u[1] + d[2] * cam.u[2]) / cam.halfH;
  return [(x * 0.5 + 0.5) * W, (1 - (y * 0.5 + 0.5)) * H];
}
