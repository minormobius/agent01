/* Anakata's renderer: a WebGL2 fragment shader that ray-traces the 4D grid.

   What you see is a 3D slice of the 4D world through the point you stand on.
   The slice's three axes are the view frame: two horizontal ones, Eu and Ev,
   and z, always up. Every pixel's ray is a straight line in that 3D slice,
   which is a straight line in 4D (o + t·d, with o and d written in the
   frame), so it can step through the 4D grid cell by cell exactly like a 3D
   voxel ray, with four coordinates instead of three. Turning your sight is
   a rotation of the frame inside the x-y-w space, and every frame in between
   is drawn just as exactly: the world morphs as the slice sweeps through
   w. The crates and you are drawn the same way: a 4D box and a 4D ball,
   intersected analytically.

   The cells one step either side of the slice along the axis you can't see
   are traced too and laid over faintly (warm on the + side, cool on the −),
   so the slices next door are never quite invisible. */

const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float; precision highp int; precision highp usampler3D;
uniform usampler3D uGrid;
uniform ivec4 uDims;
uniform vec4 uC, uEu, uEv, uN;
uniform vec3 uCamPos, uCamR, uCamU, uCamF;
uniform vec2 uRes; uniform float uTan;
uniform vec4 uPlayer; uniform vec4 uCrates[8]; uniform int uNC;
uniform int uOpen; uniform int uWrap; uniform float uTime; uniform float uPW; uniform float uHook; uniform float uFog;
out vec4 frag;

const vec4 EZ = vec4(0.0, 0.0, 1.0, 0.0);
uint cellAt(ivec4 c) {
  if (uWrap == 1) c.w = ((c.w % uDims.w) + uDims.w) % uDims.w; // w goes round
  if (any(lessThan(c, ivec4(0))) || any(greaterThanEqual(c, uDims))) return 0u;
  return texelFetch(uGrid, ivec3(c.x, c.y, c.z + uDims.z * c.w), 0).r;
}
vec4 axisVec(int a) { return a == 0 ? vec4(1,0,0,0) : a == 1 ? vec4(0,1,0,0) : a == 2 ? vec4(0,0,1,0) : vec4(0,0,0,1); }
vec4 safeD(vec4 d) { return mix(d, sign(d + 1e-12) * 1e-6, vec4(lessThan(abs(d), vec4(1e-6)))); }

/* the nearest thing along o + t·d: kind 1 solid, 2 anchor, 3 plate, 4 door, 6–9 ramps, 16 crate, 17 you; glow = length through goal cells before it */
struct Hit { float t; int kind; int axis; float sgn; vec4 p; float glow; };

Hit trace(vec4 o, vec4 d) {
  Hit h; h.t = 1e9; h.kind = 0; h.axis = 2; h.sgn = 1.0; h.glow = 0.0;
  vec4 dims = vec4(uDims);
  vec4 inv = 1.0 / d;
  vec4 t0 = (vec4(0.0) - o) * inv, t1 = (dims - o) * inv;
  if (uWrap == 1) { t0.w = -1e9; t1.w = 1e9; } // and the room repeats along it for ever
  vec4 tn = min(t0, t1), tf = max(t0, t1);
  float tin = max(max(tn.x, tn.y), max(tn.z, tn.w)), tout = min(min(tf.x, tf.y), min(tf.z, tf.w));
  if (tin < tout && tout > 0.0) {
    int ax = tn.x == tin ? 0 : tn.y == tin ? 1 : tn.z == tin ? 2 : 3;
    float t = max(tin, 0.0) + 1e-4;
    vec4 p = o + d * t;
    ivec4 cell = ivec4(floor(p));
    cell.xyz = clamp(cell.xyz, ivec3(0), uDims.xyz - 1); if (uWrap == 0) cell.w = clamp(cell.w, 0, uDims.w - 1);
    vec4 st = sign(d);
    vec4 nx = (vec4(cell) + max(st, 0.0) - o) * inv;
    vec4 dl = abs(inv);
    for (int i = 0; i < 96; i++) {
      uint v = cellAt(cell);
      float tnext = min(min(nx.x, nx.y), min(nx.z, nx.w));
      if (v == 5u) h.glow += max(0.0, tnext - t);
      else if (v != 0u && !(v == 4u && uOpen == 1)) { h.t = t; h.kind = int(v); h.axis = ax; h.sgn = -st[ax]; break; }
      if (nx.x <= tnext) { ax = 0; cell.x += int(st.x); t = nx.x; nx.x += dl.x; }
      else if (nx.y <= tnext) { ax = 1; cell.y += int(st.y); t = nx.y; nx.y += dl.y; }
      else if (nx.z <= tnext) { ax = 2; cell.z += int(st.z); t = nx.z; nx.z += dl.z; }
      else { ax = 3; cell.w += int(st.w); t = nx.w; nx.w += dl.w; }
      if (any(lessThan(cell.xyz, ivec3(0))) || any(greaterThanEqual(cell.xyz, uDims.xyz)) || (uWrap == 0 && (cell.w < 0 || cell.w >= uDims.w))) break;
    }
  }
  // the crates: 4D boxes
  for (int i = 0; i < 8; i++) {
    if (i >= uNC) break;
    vec4 c = uCrates[i];
    vec4 b0 = (c - 0.43 - o) * inv, b1 = (c + 0.43 - o) * inv;
    vec4 bn = min(b0, b1), bf = max(b0, b1);
    float a = max(max(bn.x, bn.y), max(bn.z, bn.w)), b = min(min(bf.x, bf.y), min(bf.z, bf.w));
    if (a < b && a > 0.0 && a < h.t) { h.t = a; h.kind = 16; h.axis = bn.x == a ? 0 : bn.y == a ? 1 : bn.z == a ? 2 : 3; h.sgn = -sign(d[h.axis]); }
  }
  // you: a 4D ball
  vec4 oc = o - uPlayer;
  float B = dot(oc, d), Cc = dot(oc, oc) - 0.36 * 0.36, A = dot(d, d), disc = B * B - A * Cc;
  if (disc > 0.0) { float t = (-B - sqrt(disc)) / A; if (t > 0.0 && t < h.t) { h.t = t; h.kind = 17; } }
  h.p = o + d * h.t;
  return h;
}

vec3 toView(vec4 n) { return vec3(dot(n, uEu), dot(n, uEv), n.z); }

vec3 shade(Hit h, vec3 rd3) {
  vec3 L = normalize(vec3(-0.45, -0.6, 0.85));
  vec3 n3; vec3 col;
  if (h.kind == 17) {
    vec4 n4 = normalize(h.p - uPlayer); n3 = normalize(toView(n4) + 1e-5);
    col = vec3(1.0, 0.86, 0.42);
    float dif = max(dot(n3, L), 0.0), rim = pow(1.0 - max(dot(n3, -rd3), 0.0), 2.0);
    return col * (0.35 + 0.75 * dif) + vec3(1.0, 0.7, 0.3) * rim * 0.6;
  }
  vec4 n4 = axisVec(h.axis) * h.sgn;
  n3 = toView(n4); n3 = length(n3) > 1e-3 ? normalize(n3) : -rd3;
  // edges: how close the hit is to a cell edge, along the axes you can see
  vec4 f = fract(h.p + 1e-4), e4 = min(f, 1.0 - f);
  float edge = 1.0;
  for (int a = 0; a < 4; a++) {
    if (a == h.axis) continue;
    vec4 ea = axisVec(a);
    float vis = length(toView(ea));
    if (vis > 0.35) edge = min(edge, e4[a] / vis);
  }
  ivec4 c = ivec4(floor(h.p - n4 * 0.5));
  if (h.kind == 1) col = (n3.z > 0.5 ? vec3(0.47, 0.49, 0.6) : vec3(0.32, 0.33, 0.43)) * (((c.x + c.y + c.w) & 1) == 0 ? 1.0 : 0.92);
  else if (h.kind == 2) col = vec3(0.2, 0.85, 0.95) * (0.8 + 0.2 * sin(uTime * 3.0));
  else if (h.kind == 3) col = n3.z > 0.5 ? (uOpen == 1 ? vec3(1.0, 0.82, 0.3) : vec3(0.8, 0.55, 0.15)) : vec3(0.42, 0.36, 0.3);
  else if (h.kind == 4) col = mix(vec3(0.75, 0.18, 0.22), vec3(0.95, 0.35, 0.3), step(0.5, fract((h.p.x + h.p.y + h.p.z + h.p.w) * 2.0)));
  else if (h.kind >= 6 && h.kind <= 9) { // a ramp: its top runs from kata-cool to ana-warm the way it leans
    int ax = h.kind < 8 ? 0 : 1; float s = (h.kind == 6 || h.kind == 8) ? 1.0 : -1.0;
    float u = fract(h.p[ax] + 1e-4), lean = s > 0.0 ? u : 1.0 - u;
    vec3 cool = vec3(0.3, 0.5, 0.95), warm = vec3(1.0, 0.6, 0.3);
    col = n3.z > 0.5 ? mix(cool, warm, lean) * (0.9 + 0.1 * step(0.5, fract(lean * 3.0))) : mix(cool, warm, 0.5) * 0.6;
  }
  else col = vec3(0.72, 0.5, 0.28); // a crate
  // which slice it's in, relative to yours: ana warm, kata cool
  float wr = clamp(float(c.w) + 0.5 - uPW, -2.5, 2.5);
  col *= mix(vec3(1.0), wr > 0.0 ? vec3(1.28, 0.92, 0.72) : vec3(0.72, 0.9, 1.3), clamp(abs(wr) / 2.0, 0.0, 1.0) * 0.9);
  float dif = max(dot(n3, L), 0.0);
  col = col * (0.42 + 0.68 * dif);
  if (h.kind == 2) col += vec3(0.05, 0.25, 0.3);
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.05, edge));
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  vec3 rd3 = normalize(uCamF + uv.x * uTan * uCamR + uv.y * uTan * uCamU);
  vec4 o = uC + uCamPos.x * uEu + uCamPos.y * uEv + uCamPos.z * EZ;
  vec4 d = safeD(rd3.x * uEu + rd3.y * uEv + rd3.z * EZ);
  // sky: dusk above, void below
  vec3 col = mix(vec3(0.02, 0.015, 0.05), vec3(0.09, 0.06, 0.16), smoothstep(-0.4, 0.6, rd3.z));
  Hit h = trace(o, d);
  float far = 1e8;
  if (h.kind != 0) { col = shade(h, rd3); far = h.t; col = mix(col, vec3(0.05, 0.04, 0.1), smoothstep(uFog + 3.0, uFog + 16.0, h.t)); }
  // the goal glows wherever the ray passed through it
  col += vec3(0.4, 1.0, 0.55) * (1.0 - exp(-h.glow * 1.6)) * (0.75 + 0.25 * sin(uTime * 4.0));
  // the slices either side, through the thickness of yours: each one drawn as itself (a ramp with its
  // gradient, so the next stepping stone reads either way), tinted ana-warm or kata-cool, and fading in
  // as you near its side of your slice, so moving through w crossfades instead of jumping
  float f = fract(dot(uC, uN)) - 0.5; // where you are across your slice's thickness, −½ … ½
  for (int s = -1; s <= 1; s += 2) {
    Hit g = trace(o + uN * float(s), d);
    if (g.kind != 0 && g.kind != 17 && g.t < far - 0.05) {
      vec3 tint = s > 0 ? vec3(1.0, 0.6, 0.35) : vec3(0.45, 0.68, 1.0);
      float base = (g.kind >= 6 && g.kind <= 9) ? 0.5 : g.kind == 2 ? 0.32 : 0.2;
      float a = clamp(base + max(0.0, float(s) * f) * 1.3, 0.0, 0.88);
      col = mix(col, mix(shade(g, rd3), tint, 0.3), a);
    }
  }
  frag = vec4(pow(col, vec3(0.9)), 1.0);
}`;

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error("WebGL2 isn't available here");
    this.gl = gl; this.canvas = canvas;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.p = p; gl.useProgram(p);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ["uGrid", "uDims", "uC", "uEu", "uEv", "uN", "uCamPos", "uCamR", "uCamU", "uCamF", "uRes", "uTan", "uPlayer", "uCrates", "uNC", "uOpen", "uTime", "uPW", "uHook", "uFog", "uWrap"]) this.u[n] = gl.getUniformLocation(p, n);
    this.tex = gl.createTexture();
  }
  /* the static cells of a world, into a 3D texture X × Y × (Z·W) */
  setWorld(world) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_3D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8UI, world.X, world.Y, world.Z * world.W, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, world.cells);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.uniform4i(this.u.uDims, world.X, world.Y, world.Z, world.W);
    gl.uniform1i(this.u.uWrap, world.wrap ? 1 : 0);
  }
  /* f: { C, Eu, Ev, N (4D), cam: {pos, R, U, F, tan} (3D, view coords), player (4D), crates [4D], open, time, pw } */
  draw(f, scale) {
    const gl = this.gl, c = this.canvas;
    const w = Math.max(1, Math.round(c.clientWidth * scale)), h = Math.max(1, Math.round(c.clientHeight * scale));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    const u = this.u;
    gl.uniform1i(u.uGrid, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, this.tex);
    gl.uniform4fv(u.uC, f.C); gl.uniform4fv(u.uEu, f.Eu); gl.uniform4fv(u.uEv, f.Ev); gl.uniform4fv(u.uN, f.N);
    gl.uniform3fv(u.uCamPos, f.cam.pos); gl.uniform3fv(u.uCamR, f.cam.R); gl.uniform3fv(u.uCamU, f.cam.U); gl.uniform3fv(u.uCamF, f.cam.F);
    gl.uniform2f(u.uRes, w, h); gl.uniform1f(u.uTan, f.cam.tan);
    gl.uniform4fv(u.uPlayer, f.player);
    const cr = new Float32Array(32); f.crates.slice(0, 8).forEach((p, i) => cr.set(p, i * 4));
    gl.uniform4fv(u.uCrates, cr); gl.uniform1i(u.uNC, Math.min(8, f.crates.length));
    gl.uniform1i(u.uOpen, f.open ? 1 : 0); gl.uniform1f(u.uTime, f.time); gl.uniform1f(u.uPW, f.pw); gl.uniform1f(u.uHook, 0); gl.uniform1f(u.uFog, f.cam.dist || 9);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
