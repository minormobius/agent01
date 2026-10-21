/* Foam⁴'s renderer: one WebGL2 fragment shader that ray-traces a 3D slice of
   a 4D Voronoi foam, inside a box.

   A ray in the slice is a straight line in 4D. It starts in the cell of the
   seed nearest where it enters the box, and leaves that cell where it
   first crosses a bisector with one of the cell's neighbours (a linear
   equation along the ray). So it steps from cell to cell, membrane by
   membrane, exactly, with no mesh. The neighbours are the lattice's
   Voronoi-relevant vectors (8, 24 or 30), or for the random foam the 80
   seeds round its grid cell, whose jitter the shader hashes exactly as
   foam.js does.

   Modes: glass (every membrane translucent, edges bright: the foam as a
   whole), solid (the box as a block cut from the foam: each face shows the
   cells it cuts), and one cell (glass, with the cell at the centre drawn
   solid). */

const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float; precision highp int;
uniform int uLattice; uniform float uJitter;
uniform mat4 uB, uBinv;
uniform vec4 uRel[30]; uniform vec4 uRelK[30]; uniform int uNRel;
uniform vec4 uC, uEu, uEv, uEz;
uniform vec3 uCamPos, uCamR, uCamU, uCamF; uniform vec2 uRes; uniform float uTan;
uniform float uBox; uniform int uMode; uniform vec4 uFocus; uniform int uHasFocus;
out vec4 frag;

uint hashU(ivec4 g, uint k) {
  uvec4 u = uvec4(g + 1024);
  uint n = (u.x * 73856093u) ^ (u.y * 19349663u) ^ (u.z * 83492791u) ^ (u.w * 2654435761u) ^ (k * 374761393u);
  n ^= n >> 16u; n *= 0x7feb352du; n ^= n >> 15u; n *= 0x846ca68bu; n ^= n >> 16u;
  return n;
}
float hashF(ivec4 g, uint k) { return float(hashU(g, k)) / 4294967296.0; }
vec4 seedOf(vec4 id) {
  if (uLattice == 1) return uB * id;
  ivec4 g = ivec4(id);
  return id + 0.5 + uJitter * (vec4(hashF(g, 0u), hashF(g, 1u), hashF(g, 2u), hashF(g, 3u)) - 0.5);
}
vec4 nbId(vec4 id, int j) { // the j-th neighbour (lattice: < uNRel; random: < 80)
  if (uLattice == 1) return id + uRelK[j];
  int k = j < 40 ? j : j + 1; // skip the centre of the 3×3×3×3 block
  return id + vec4(float(k % 3) - 1.0, float((k / 3) % 3) - 1.0, float((k / 9) % 3) - 1.0, float(k / 27) - 1.0);
}
int nbCount() { return uLattice == 1 ? uNRel : 80; }

/* the seed nearest p */
vec4 nearestId(vec4 p) {
  if (uLattice == 1) {
    vec4 k = floor(uBinv * p + 0.5), s = uB * k; float d = dot(p - s, p - s);
    for (int it = 0; it < 24; it++) {
      int best = -1; float bd = d - 1e-7;
      for (int j = 0; j < 30; j++) { if (j >= uNRel) break; vec4 t = p - s - uRel[j]; float e = dot(t, t); if (e < bd) { bd = e; best = j; } }
      if (best < 0) break;
      k += uRelK[best]; s += uRel[best]; d = bd;
    }
    return k;
  }
  vec4 g = floor(p), bid = g; vec4 s0 = seedOf(g); float bd = dot(p - s0, p - s0);
  for (int j = 0; j < 80; j++) { vec4 id = nbId(g, j), s = seedOf(id); float e = dot(p - s, p - s); if (e < bd) { bd = e; bid = id; } }
  return bid;
}

vec3 cellColor(vec4 id) {
  float h = fract(sin(dot(id, vec4(12.9898, 78.233, 37.719, 4.581))) * 43758.5453);
  vec3 c = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return mix(vec3(0.62), c, 0.55) * 0.95 + 0.05;
}
vec3 to3(vec4 v) { return vec3(dot(v, uEu), dot(v, uEv), dot(v, uEz)); }

/* how near x (on the boundary of the cell of s) is to another of its faces, in the slice: the edge test */
float edgeDist(vec4 id, vec4 s, vec4 x, int skip) {
  float m = 1e9;
  for (int j = 0; j < 80; j++) {
    if (j >= nbCount()) break;
    if (j == skip) continue;
    vec4 sn = seedOf(nbId(id, j)), nrm = sn - s;
    float L = length(to3(nrm)); if (L < 1e-5) continue;
    float v = (0.5 * (dot(sn, sn) - dot(s, s)) - dot(x, nrm)) / L;
    m = min(m, v);
  }
  return m;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  vec3 rd = normalize(uCamF + uv.x * uTan * uCamR + uv.y * uTan * uCamU), ro = uCamPos;
  vec3 bg = mix(vec3(0.02, 0.03, 0.05), vec3(0.06, 0.08, 0.12), smoothstep(-0.5, 0.7, rd.z));
  // the box
  vec3 inv = 1.0 / rd, ta = (-uBox - ro) * inv, tb = (uBox - ro) * inv, tn = min(ta, tb), tf = max(ta, tb);
  float t0 = max(max(tn.x, tn.y), tn.z), t1 = min(min(tf.x, tf.y), tf.z);
  if (t1 < max(t0, 0.0)) { frag = vec4(bg, 1.0); return; }
  t0 = max(t0, 0.0);
  vec4 o4 = uC + ro.x * uEu + ro.y * uEv + ro.z * uEz, d4 = rd.x * uEu + rd.y * uEv + rd.z * uEz;
  vec3 L = normalize(vec3(-0.4, -0.55, 0.75));
  float px = 2.0 * uTan / uRes.y; // a pixel, per unit of distance
  vec4 id = nearestId(o4 + d4 * (t0 + 1e-4));
  vec3 n0 = tn.x == t0 ? vec3(-sign(rd.x), 0, 0) : tn.y == t0 ? vec3(0, -sign(rd.y), 0) : vec3(0, 0, -sign(rd.z));
  bool focusOn = uMode == 2 && uHasFocus == 1;
  // solid: the box as a block cut from the foam; one cell, starting inside it: its cut face
  if (uMode == 1 || (focusOn && all(equal(id, uFocus)))) {
    vec4 s = seedOf(id), x = o4 + d4 * t0;
    float e = edgeDist(id, s, x, -1), lw = max(0.006, px * t0 * 1.2);
    vec3 col = cellColor(id) * (0.55 + 0.5 * max(dot(n0, L), 0.0));
    col *= mix(0.25, 1.0, smoothstep(lw, lw + px * t0 * 1.5, e));
    frag = vec4(pow(col, vec3(0.9)), 1.0); return;
  }
  vec3 acc = cellColor(id) * 0.05; float A = 0.05; // the box's face, faintly
  float t = t0;
  for (int step = 0; step < 48; step++) {
    vec4 s = seedOf(id);
    float best = 1e9; int bj = -1;
    for (int j = 0; j < 80; j++) {
      if (j >= nbCount()) break;
      vec4 sn = seedOf(nbId(id, j)), nrm = sn - s;
      float den = dot(d4, nrm); if (den <= 1e-7) continue;
      float tj = (0.5 * (dot(sn, sn) - dot(s, s)) - dot(o4, nrm)) / den;
      if (tj > t + 1e-5 && tj < best) { best = tj; bj = j; }
    }
    if (bj < 0 || best >= t1) break;
    vec4 nid = nbId(id, bj), x = o4 + d4 * best, nrm = seedOf(nid) - s;
    vec3 n3 = normalize(to3(nrm)); if (dot(n3, rd) > 0.0) n3 = -n3;
    float e = edgeDist(id, s, x, bj), lw = max(0.006, px * best * 1.0), edge = 1.0 - smoothstep(lw, lw + px * best * 1.5, e);
    float lit = 0.45 + 0.55 * max(dot(n3, L), 0.0) + 0.25 * pow(1.0 - abs(dot(n3, rd)), 3.0);
    if (focusOn && all(equal(nid, uFocus))) { // the cell you're watching: solid
      vec3 c = cellColor(nid) * (0.5 + 0.55 * max(dot(n3, L), 0.0));
      c *= mix(0.3, 1.0, 1.0 - edge);
      acc += (1.0 - A) * c; A = 1.0; break;
    }
    vec3 c = mix(cellColor(id), cellColor(nid), 0.5) * lit;
    float a = focusOn ? 0.05 + 0.35 * edge : 0.09 + 0.75 * edge;
    c = mix(c, vec3(0.95, 0.97, 1.0), edge * 0.6);
    acc += (1.0 - A) * a * c; A += (1.0 - A) * a;
    if (A > 0.97) break;
    id = nid; t = best;
  }
  vec3 col = acc + (1.0 - A) * bg;
  frag = vec4(pow(col, vec3(0.9)), 1.0);
}`;

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) throw new Error("WebGL2 isn't available here");
    this.gl = gl; this.canvas = canvas;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p); this.p = p;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ["uLattice", "uJitter", "uB", "uBinv", "uRel", "uRelK", "uNRel", "uC", "uEu", "uEv", "uEz", "uCamPos", "uCamR", "uCamU", "uCamF", "uRes", "uTan", "uBox", "uMode", "uFocus", "uHasFocus"]) this.u[n] = gl.getUniformLocation(p, n);
  }
  /* a species from foam.js */
  setSpecies(sp) {
    const gl = this.gl, u = this.u;
    gl.uniform1i(u.uLattice, sp.kind === "lattice" ? 1 : 0);
    gl.uniform1f(u.uJitter, sp.jitter || 0);
    if (sp.kind === "lattice") {
      gl.uniformMatrix4fv(u.uB, false, new Float32Array(sp.B.flat())); // columns are the basis vectors
      const Binv = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) Binv[c * 4 + r] = sp.coords(c === 0 ? [1, 0, 0, 0] : c === 1 ? [0, 1, 0, 0] : c === 2 ? [0, 0, 1, 0] : [0, 0, 0, 1])[r];
      gl.uniformMatrix4fv(u.uBinv, false, Binv);
      const rel = new Float32Array(120), relK = new Float32Array(120);
      sp.rel.forEach((v, i) => rel.set(v, i * 4)); sp.relK.forEach((v, i) => relK.set(v, i * 4));
      gl.uniform4fv(u.uRel, rel); gl.uniform4fv(u.uRelK, relK); gl.uniform1i(u.uNRel, sp.rel.length);
    }
  }
  /* f: { C, F: { Eu, Ev, Ez }, cam: { pos, R, U, F, tan }, box, mode (0 glass, 1 solid, 2 one cell), focus (an id, or null) } */
  draw(f, scale) {
    const gl = this.gl, c = this.canvas, u = this.u;
    const w = Math.max(1, Math.round(c.clientWidth * scale)), h = Math.max(1, Math.round(c.clientHeight * scale));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform4fv(u.uC, f.C); gl.uniform4fv(u.uEu, f.F.Eu); gl.uniform4fv(u.uEv, f.F.Ev); gl.uniform4fv(u.uEz, f.F.Ez);
    gl.uniform3fv(u.uCamPos, f.cam.pos); gl.uniform3fv(u.uCamR, f.cam.R); gl.uniform3fv(u.uCamU, f.cam.U); gl.uniform3fv(u.uCamF, f.cam.F);
    gl.uniform2f(u.uRes, w, h); gl.uniform1f(u.uTan, f.cam.tan);
    gl.uniform1f(u.uBox, f.box); gl.uniform1i(u.uMode, f.mode);
    gl.uniform1i(u.uHasFocus, f.focus ? 1 : 0); if (f.focus) gl.uniform4fv(u.uFocus, f.focus);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
