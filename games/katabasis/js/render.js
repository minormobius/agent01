/* KATABASIS's renderer: one fragment shader that walks each ray voxel by voxel through the 4D grid.

   What you see is the 3D slice of the cave through your eye, spanned by your R, U and F (four-vectors, so
   a flip in progress, turning them through 4D, is drawn exactly at every angle in between). A ray in the
   slice is a line in 4D, so it steps through the grid like a 3D voxel ray with four coordinates (a 4D DDA).
   Rock is lit by a lantern at your eye and fades into the dark; the grain of the voxels shows as faint
   seams, so the size of things reads; the goal crystal glows, and the ray carries on through it. */

const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
uniform usampler2D uGrid; // (x + X z, y + Y w)
uniform ivec4 uDims;
uniform vec4 uEye, uCR, uCU, uCF, uUp; // your eye, the camera's right, up and forward (in your slice), and your up (gravity's opposite)
uniform vec2 uRes; uniform float uTan, uTime, uFlash;
out vec4 frag;

uint cell(ivec4 c) {
  if (any(lessThan(c, ivec4(0))) || any(greaterThanEqual(c, uDims))) return 1u;
  return texelFetch(uGrid, ivec2(c.x + uDims.x * c.z, c.y + uDims.y * c.w), 0).r;
}
float hash(vec4 p) { return fract(sin(dot(p, vec4(12.9898, 78.233, 37.719, 4.581))) * 43758.5453); }
vec4 axis(int a) { return a == 0 ? vec4(1, 0, 0, 0) : a == 1 ? vec4(0, 1, 0, 0) : a == 2 ? vec4(0, 0, 1, 0) : vec4(0, 0, 0, 1); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  vec4 d = normalize(uCF + uv.x * uTan * uCR + uv.y * uTan * uCU);
  d = mix(d, sign(d + 1e-12) * 1e-6, vec4(lessThan(abs(d), vec4(1e-6))));
  vec4 o = uEye, inv = 1.0 / d;
  ivec4 c = ivec4(floor(o)), st = ivec4(sign(d));
  vec4 tMax = ((vec4(c) + max(sign(d), 0.0)) - o) * inv, tD = abs(inv);
  float t = 0.0, glow = 0.0; int ax = 0; bool hit = false;
  for (int i = 0; i < 160; i++) {
    // the next voxel boundary: the least of the four
    float m = min(min(tMax.x, tMax.y), min(tMax.z, tMax.w));
    ax = m == tMax.x ? 0 : m == tMax.y ? 1 : m == tMax.z ? 2 : 3;
    float t1 = m; vec4 sv = vec4(0.0); sv[ax] = 1.0;
    uint k = cell(c);
    if (k == 2u) glow += (t1 - t) * (2.2 + 30.0 / (4.0 + t)); // through the crystal: it glows, and more the nearer it is
    t = t1; if (t > 60.0) break;
    c += st * ivec4(sv); tMax += tD * sv;
    uint k2 = cell(c);
    if (k2 == 1u) { hit = true; break; }
  }
  vec3 col = vec3(0.0);
  if (hit) {
    vec4 p = o + d * t, n = -float(st[ax]) * axis(ax);
    // light: the lantern at your eye (falling off with distance), a glow from overhead along your own up (so
    // floors read lighter than ceilings, and you can tell which way you'll fall), and a little ambient
    float lam = max(dot(n, -d), 0.0), fall = 1.0 / (1.0 + 0.0035 * t * t), over = 0.5 + 0.5 * dot(n, uUp);
    // corners: the air voxel in front of the face, and how much rock crowds it across the face
    ivec4 air = c - st * ivec4(axis(ax)); float occ = 0.0;
    for (int a = 0; a < 4; a++) { if (a == ax) continue; ivec4 e = ivec4(axis(a)); occ += float(cell(air + e) == 1u) + float(cell(air - e) == 1u); }
    // the rock: grain per voxel, a tint by which way the face turns, seams at the voxel edges
    vec4 vc = vec4(c), f = fract(p);
    float g = hash(vc), seam = 1.0;
    for (int a = 0; a < 4; a++) if (a != ax) { float e = min(f[a], 1.0 - f[a]); seam = min(seam, e); }
    float edge = smoothstep(0.0, 0.05 + 0.003 * t, seam);
    vec3 tint = ax == 0 ? vec3(1.0, 0.93, 0.86) : ax == 1 ? vec3(1.04, 0.97, 0.88) : ax == 2 ? vec3(0.9, 0.93, 1.0) : vec3(0.88, 1.0, 0.95);
    vec3 rock = mix(vec3(0.36, 0.31, 0.27), vec3(0.52, 0.45, 0.38), g) * tint;
    float light = 0.16 + 0.6 * lam * fall + 0.35 * over * (0.4 + 0.6 * fall);
    col = rock * light * (1.0 - 0.09 * occ) * mix(0.6, 1.0, edge);
    col = mix(col, vec3(0.025, 0.025, 0.03), 1.0 - exp(-t * 0.028));
  }
  col += vec3(0.3, 0.9, 1.0) * (1.0 - exp(-glow * 0.9)) * (0.75 + 0.25 * sin(uTime * 2.0));
  col = mix(col, vec3(1.0, 0.95, 0.85), uFlash);
  frag = vec4(pow(col, vec3(0.85)), 1.0);
}`;

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) throw new Error("WebGL2 isn't available here");
    this.gl = gl; this.canvas = canvas;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.bindAttribLocation(p, 0, "aPos"); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ["uGrid", "uDims", "uEye", "uCR", "uCU", "uCF", "uUp", "uRes", "uTan", "uTime", "uFlash"]) this.u[n] = gl.getUniformLocation(p, n);
    this.tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.uniform1i(this.u.uGrid, 0);
  }
  /* the cave into the texture: voxel (x, y, z, w) at (x + X z, y + Y w) */
  load(cave) {
    const gl = this.gl, [X, Y, Z, W] = cave.dims, a = new Uint8Array(X * Z * Y * W);
    for (let w = 0; w < W; w++) for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) a[(y + Y * w) * (X * Z) + x + X * z] = cave.v[cave.idx(x, y, z, w)];
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, X * Z, Y * W, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, a);
    this.dims = cave.dims;
  }
  /* v: { eye, R, U, F (the camera's, four-vectors), up (yours), time, flash } */
  draw(v, scale) {
    const gl = this.gl, c = this.canvas, u = this.u;
    const w = Math.max(1, Math.round(c.clientWidth * scale)), h = Math.max(1, Math.round(c.clientHeight * scale));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform4i(u.uDims, ...this.dims);
    gl.uniform4fv(u.uEye, v.eye); gl.uniform4fv(u.uCR, v.R); gl.uniform4fv(u.uCU, v.U); gl.uniform4fv(u.uCF, v.F); gl.uniform4fv(u.uUp, v.up);
    gl.uniform2f(u.uRes, w, h); gl.uniform1f(u.uTan, 0.7); gl.uniform1f(u.uTime, v.time || 0); gl.uniform1f(u.uFlash, v.flash || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
