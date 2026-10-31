/* Lean's drawing: one fragment shader, IRIS⁴'s cut down. Each pixel's ray is a line in your 3D slice, so a line in
   4D; it is marched through the land (./world.js's march(), line for line: blocks of 8³ cells skipped when the ray
   stays above their tallest column, cells inside the rest), shaded, and fogged into a sky with a low sun.

   A cell's byte is its height (bits 0–5) and its material (bits 6–7): ground, track, the centre line, a kerb. The
   track is dark tarmac with the centre line in white and the kerbs red and white; everything else is IRIS⁴'s grass,
   earth, sandstone and stone. Fae colours: a surface's tint follows how far off in w it lies from you, so with your
   slice square to the grid the land looks natural, and the more you lean into w the more the distance turns teal,
   violet, rose and gold. On the track that's what shows you where it goes when it leaves your slice. */
const VSRC = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
uniform usampler2D uH, uM;
uniform vec4 uEye, uR, uU, uF, uSun;
uniform vec2 uRes;
uniform float uTan, uTime, uFae, uFar, uVS;
out vec4 o;
const ivec3 DIM = ivec3(192, 192, 64);
const ivec3 NB = ivec3(24, 24, 8);
int wr(int v, int n) { return v - n * int(floor(float(v) / float(n))); }
uint raw(ivec3 c) { int x = wr(c.x, DIM.x), z = wr(c.y, DIM.y), w = wr(c.z, DIM.z); return texelFetch(uH, ivec2(x + (w - (w / 8) * 8) * DIM.x, z + (w / 8) * DIM.y), 0).r; }
float col(ivec3 c) { return float(raw(c) & 63u); }
float blk(ivec3 b) { return float(texelFetch(uM, ivec2(wr(b.x, NB.x) + wr(b.z, NB.z) * NB.x, wr(b.y, NB.y)), 0).r); }
bool march(vec4 ro, vec4 rd, out float tHit, out vec4 n, out ivec3 cell) {
  vec3 p = ro.xzw, v = rd.xzw; float py = ro.y, vy = rd.y;
  vec3 st = sign(v), inv = 1.0 / max(abs(v), vec3(1e-6));
  ivec3 bc = ivec3(floor(p / 8.0));
  vec3 tMaxB = (st * (vec3(bc) * 8.0 - p) + max(st, 0.0) * 8.0) * inv, tDB = inv * 8.0;
  float t0 = 0.0; int lastB = -1;
  for (int i = 0; i < 160; i++) {
    if (t0 > uFar) break;
    int k = tMaxB.x < tMaxB.y ? (tMaxB.x < tMaxB.z ? 0 : 2) : (tMaxB.y < tMaxB.z ? 1 : 2);
    float t1 = tMaxB[k];
    if (min(py + vy * t0, py + vy * t1) <= blk(bc)) {
      vec3 q = p + v * (t0 + 1e-4); ivec3 c = ivec3(floor(q));
      vec3 tMax = (st * (vec3(c) - p) + max(st, 0.0)) * inv;
      float tc = t0; int last = lastB;
      for (int j = 0; j < 40; j++) {
        int a = tMax.x < tMax.y ? (tMax.x < tMax.z ? 0 : 2) : (tMax.y < tMax.z ? 1 : 2);
        float tn = min(tMax[a], t1), hc = col(c);
        if (py + vy * tc <= hc) {
          n = vec4(0.0); if (last < 0) n.y = 1.0; else { float s = -st[last]; if (last == 0) n.x = s; else if (last == 1) n.z = s; else n.w = s; }
          tHit = tc; cell = c; return true;
        }
        if (py + vy * tn <= hc) { tHit = (hc - py) / vy; n = vec4(0.0, 1.0, 0.0, 0.0); cell = c; return true; }
        if (tMax[a] >= t1) break;
        tc = tMax[a]; c[a] += int(st[a]); tMax[a] += inv[a]; last = a;
      }
    }
    t0 = t1; bc[k] += int(st[k]); tMaxB[k] += tDB[k]; lastB = k;
  }
  return false;
}
// the sky: blue overhead, pale at the horizon, and the sun (a 4D direction: off your slice, only its glow reaches you)
vec3 sky(vec4 d) {
  vec3 c = mix(vec3(0.80, 0.84, 0.92), vec3(0.30, 0.48, 0.86), smoothstep(0.0, 0.7, d.y));
  if (d.y < 0.0) c = mix(vec3(0.66, 0.70, 0.78), vec3(0.42, 0.45, 0.55), smoothstep(0.0, -0.5, d.y));
  float sd = max(dot(d, uSun), 0.0);
  c += vec3(1.0, 0.88, 0.66) * (pow(sd, 8.0) * 0.3 + pow(sd, 900.0) * 5.0);
  return c;
}
vec3 fae(float t) { // teal, violet, rose, gold, round again
  t = fract(t) * 4.0;
  vec3 a = vec3(0.35, 1.0, 0.85), b = vec3(0.72, 0.5, 1.0), c = vec3(1.0, 0.5, 0.78), e = vec3(1.0, 0.82, 0.45);
  return t < 1.0 ? mix(a, b, t) : t < 2.0 ? mix(b, c, t - 1.0) : t < 3.0 ? mix(c, e, t - 2.0) : mix(e, a, t - 3.0);
}
float hash(vec4 p) { return fract(sin(dot(p, vec4(12.9898, 78.233, 37.719, 94.673))) * 43758.5453); }
void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec4 d = normalize(uF + uv.x * uTan * uR + uv.y * uTan * uU);
  float t; vec4 n; ivec3 cell; vec3 c;
  bool hit = march(uEye, d, t, n, cell);
  if (!hit) c = sky(d);
  else {
    vec4 p = uEye + d * t, f = fract(p);
    uint r = raw(cell); float h = float(r & 63u); int mat = int(r >> 6u);
    float g = hash(vec4(cell, 0.0)); bool top = n.y > 0.5;
    vec3 grass = mix(vec3(0.28, 0.55, 0.2), vec3(0.52, 0.68, 0.24), g), earth = mix(vec3(0.46, 0.34, 0.25), vec3(0.56, 0.42, 0.3), g);
    vec3 sand = mix(vec3(0.82, 0.6, 0.4), vec3(0.64, 0.42, 0.33), 0.5 + 0.5 * sin(p.y * 1.3 + g * 2.0)), stone = mix(vec3(0.5, 0.5, 0.56), vec3(0.62, 0.6, 0.62), g);
    vec3 base = h >= 50.0 ? (top ? mix(stone, vec3(0.94, 0.96, 1.0), 0.6) : stone) : h >= 30.0 ? (top ? mix(stone, grass, 0.5) : sand) : (top ? grass : p.y > h - 1.0 ? grass * 0.8 : earth);
    if (top && mat == 0 && h < 30.0) { float fl = hash(floor(p * 4.0)); if (fl > 0.982) base = mix(vec3(1.0), fae(fl * 23.0), 0.7); } // wildflowers
    if (top && mat > 0) { // the track: tarmac, the centre line, red-and-white kerbs
      base = mix(vec3(0.17, 0.17, 0.19), vec3(0.23, 0.23, 0.25), g);
      if (mat == 2) base = vec3(0.92, 0.92, 0.88);
      if (mat == 3) base = mod(float(cell.x + cell.y + cell.z), 4.0) < 2.0 ? vec3(0.85, 0.16, 0.14) : vec3(0.93, 0.93, 0.9);
    }
    float seam;
    if (n.y > 0.5) seam = min(min(min(f.x, 1.0 - f.x), min(f.z, 1.0 - f.z)), min(f.w, 1.0 - f.w));
    else { seam = min(f.y, 1.0 - f.y); if (n.x == 0.0) seam = min(seam, min(f.x, 1.0 - f.x)); if (n.z == 0.0) seam = min(seam, min(f.z, 1.0 - f.z)); if (n.w == 0.0) seam = min(seam, min(f.w, 1.0 - f.w)); }
    float edge = smoothstep(0.0, 0.06 + 0.002 * t, seam);
    if (top && mat > 0) edge = mix(edge, 1.0, 0.7); // the tarmac's seams faint
    float dw = (p.w - uEye.w) * uVS, k = uFae * smoothstep(0.25, 2.5, abs(dw));
    base = mix(base, mix(base, fae(dw * 0.22 + 0.5), 0.75) * 1.15, k);
    float lam = max(dot(n, uSun), 0.0);
    c = base * (vec3(0.4, 0.46, 0.62) * (0.8 + 0.25 * n.y) + vec3(1.0, 0.85, 0.64) * lam) * mix(0.7, 1.0, edge);
    float fog = 1.0 - exp(-t * uVS / 40.0);
    c = mix(c, sky(d) * 0.9 + 0.08, fog);
  }
  o = vec4(c / (1.0 + 0.12 * c), 1.0);
}`;

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("no WebGL2");
    this.gl = gl; this.canvas = canvas;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VSRC)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p); this.p = p;
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {}; for (const n of ["uH", "uM", "uEye", "uR", "uU", "uF", "uSun", "uRes", "uTan", "uTime", "uFae", "uFar", "uVS"]) this.u[n] = gl.getUniformLocation(p, n);
  }
  tex(unit, w, h, data) {
    const gl = this.gl, t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, w, h, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
  }
  /* the land: H (x + X(z + Z w)) into an atlas of 8 × 8 w-slices, each X × Z; M (the blocks) into a row of 8 */
  load(H, M, dims) {
    const [X, Z, W] = dims, a = new Uint8Array(X * 8 * Z * 8);
    for (let w = 0; w < W; w++) for (let z = 0; z < Z; z++) { const src = X * (z + Z * w), row = (z + (w >> 3) * Z) * X * 8 + (w & 7) * X; a.set(H.subarray(src, src + X), row); }
    this.tex(0, X * 8, Z * 8, a);
    const nb = dims.map((v) => v / 8), m = new Uint8Array(nb[0] * nb[2] * nb[1]);
    for (let w = 0; w < nb[2]; w++) for (let z = 0; z < nb[1]; z++) for (let x = 0; x < nb[0]; x++) m[z * nb[0] * nb[2] + x + w * nb[0]] = M[x + nb[0] * (z + nb[1] * w)];
    this.tex(1, nb[0] * nb[2], nb[1], m);
    const gl = this.gl; gl.uniform1i(this.u.uH, 0); gl.uniform1i(this.u.uM, 1);
  }
  /* v: { eye (cells), R, U, F (the camera's), sun, time, fae, tan, far, vs } */
  draw(v, scale) {
    const gl = this.gl, c = this.canvas, u = this.u;
    const w = Math.max(1, Math.round(c.clientWidth * scale)), h = Math.max(1, Math.round(c.clientHeight * scale));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform4fv(u.uEye, v.eye); gl.uniform4fv(u.uR, v.R); gl.uniform4fv(u.uU, v.U); gl.uniform4fv(u.uF, v.F); gl.uniform4fv(u.uSun, v.sun);
    gl.uniform2f(u.uRes, w, h); gl.uniform1f(u.uTan, v.tan); gl.uniform1f(u.uTime, v.time); gl.uniform1f(u.uFae, v.fae); gl.uniform1f(u.uFar, v.far); gl.uniform1f(u.uVS, v.vs);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
