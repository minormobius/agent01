/* KATABASIS's renderer: one fragment shader that walks each ray voxel by voxel through the 4D grid, and lights
   what it hits with real light sources.

   What you see is the 3D slice of the grotto through your eye, spanned by your R, U and F (four-vectors, so a
   flip in progress, turning them through 4D, is drawn exactly at every angle in between). A ray in the slice
   is a line in 4D, so it steps through the grid like a 3D voxel ray with four coordinates (a 4D DDA).

   Light, in four dimensions: the grotto's lights (crystal clusters on the walls, from grotto.js) are points
   in 4D. Light from a point spreads over a 3-sphere, so it falls off as the cube of distance, not the square.
   Every surface the ray hits sends a shadow ray to each light near enough to matter, through the 4D grid, so
   rock anywhere in 4D shadows your slice, rock you can't see too, and a light round a corner in w lights your
   slice from a direction that isn't in it. The lights themselves glow by how near each passes to the ray in
   4D: one off your slice shows only the cross-section of its glow, and swells into view as you come to it in
   w. The rock is wet (a sheen, wetter underfoot), with mica that glints as you move; gemstone round each light
   takes its colour; moss glows in specks; the goal crystal glows brightest. */

const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const NL = 8; // lights a frame: the nearest to you (beyond them, 4D falloff leaves next to nothing)

const FS = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
uniform usampler2D uGrid; // (x + X z, y + Y w): the cave's kind | the grotto's dressing << 2
uniform ivec4 uDims;
uniform vec4 uEye, uCR, uCU, uCF, uUp; // your eye, the camera's right, up and forward (in your slice), and your up (gravity's opposite)
uniform vec4 uLP[${NL}], uLC[${NL}]; uniform int uNL; // the lights: where (4D), and colour (rgb) with power (a)
uniform vec2 uRes; uniform float uTan, uTime, uFlash;
out vec4 frag;

const float R0 = 6.5; // where a light has fallen to half: past it, as the cube of the distance (light spreads over a 3-sphere in 4D)

uint raw(ivec4 c) {
  if (any(lessThan(c, ivec4(0))) || any(greaterThanEqual(c, uDims))) return 1u;
  return texelFetch(uGrid, ivec2(c.x + uDims.x * c.z, c.y + uDims.y * c.w), 0).r;
}
float hash(vec4 p) { return fract(sin(dot(p, vec4(12.9898, 78.233, 37.719, 4.581))) * 43758.5453); }
vec4 hash4(vec4 p) { return vec4(hash(p), hash(p + 17.3), hash(p + 41.7), hash(p + 73.1)); }
vec4 axis(int a) { return a == 0 ? vec4(1, 0, 0, 0) : a == 1 ? vec4(0, 1, 0, 0) : a == 2 ? vec4(0, 0, 1, 0) : vec4(0, 0, 0, 1); }
vec4 safe(vec4 d) { return mix(d, sign(d + 1e-12) * 1e-6, vec4(lessThan(abs(d), vec4(1e-6)))); }

/* is there rock between a and b? a shadow ray, voxel by voxel through the 4D grid (it can pass through
   anywhere in w: rock you can't see casts shadows into your slice) */
bool blocked(vec4 a, vec4 b) {
  vec4 d = b - a; float L = length(d); d = safe(d / L);
  vec4 inv = 1.0 / d; ivec4 c = ivec4(floor(a)), st = ivec4(sign(d));
  vec4 tMax = ((vec4(c) + max(sign(d), 0.0)) - a) * inv, tD = abs(inv);
  for (int i = 0; i < 48; i++) {
    float m = min(min(tMax.x, tMax.y), min(tMax.z, tMax.w));
    if (m >= L) return false;
    int ax = m == tMax.x ? 0 : m == tMax.y ? 1 : m == tMax.z ? 2 : 3; vec4 sv = vec4(0.0); sv[ax] = 1.0;
    c += st * ivec4(sv); tMax += tD * sv;
    if ((raw(c) & 3u) == 1u) return true;
  }
  return false;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  vec4 d = safe(normalize(uCF + uv.x * uTan * uCR + uv.y * uTan * uCU));
  vec4 o = uEye, inv = 1.0 / d;
  ivec4 c = ivec4(floor(o)), st = ivec4(sign(d));
  vec4 tMax = ((vec4(c) + max(sign(d), 0.0)) - o) * inv, tD = abs(inv);
  float t = 0.0, glow = 0.0; int ax = 0; bool hit = false;
  for (int i = 0; i < 160; i++) {
    float m = min(min(tMax.x, tMax.y), min(tMax.z, tMax.w));
    ax = m == tMax.x ? 0 : m == tMax.y ? 1 : m == tMax.z ? 2 : 3;
    float t1 = m; vec4 sv = vec4(0.0); sv[ax] = 1.0;
    if ((raw(c) & 3u) == 2u) glow += (t1 - t) * (2.2 + 30.0 / (4.0 + t)); // through the goal crystal
    t = t1; if (t > 60.0) break;
    c += st * ivec4(sv); tMax += tD * sv;
    if ((raw(c) & 3u) == 1u) { hit = true; break; }
  }
  vec3 haze = vec3(0.03, 0.022, 0.055), col = haze;
  if (hit) {
    vec4 p = o + d * t, n = -float(st[ax]) * axis(ax), vc = vec4(c), f = fract(p);
    uint deco = raw(c) >> 2;
    // the rock: violet-grey, grain per voxel; gemstone round the lights; moss in patches
    float g = hash(vc), seam = 1.0;
    for (int a = 0; a < 4; a++) if (a != ax) { float e = min(f[a], 1.0 - f[a]); seam = min(seam, e); }
    float edge = smoothstep(0.0, 0.05 + 0.003 * t, seam), up = dot(n, uUp);
    vec3 base = mix(vec3(0.17, 0.15, 0.22), vec3(0.29, 0.25, 0.35), g);
    float gloss = up > 0.6 ? 0.55 : 0.28, shine = 26.0; vec3 emit = vec3(0.0);
    // corners darkened by the rock round the air in front of the face
    ivec4 air = c - st * ivec4(axis(ax)); float occ = 0.0;
    for (int a = 0; a < 4; a++) { if (a == ax) continue; ivec4 e = ivec4(axis(a)); occ += float((raw(air + e) & 3u) == 1u) + float((raw(air - e) & 3u) == 1u); }
    // light: every light near enough to matter, falling off as in 4D, unless rock in 4D shadows it
    vec3 dif = vec3(0.0), spec = vec3(0.0), gemTint = vec3(0.0); float gemW = 0.0;
    vec4 V = -d, q = floor(f * 6.0); float sparkle = step(0.94, hash(vc * 13.0 + q)); vec4 nj = normalize(n + 0.7 * (hash4(vc + q) - 0.5));
    for (int i = 0; i < ${NL}; i++) {
      if (i >= uNL) break;
      vec4 L = uLP[i] - p; float r = length(L); L /= r;
      float att = uLC[i].a * R0 * R0 * R0 / (R0 * R0 * R0 + r * r * r), ndl = dot(n, L);
      gemTint += uLC[i].rgb * att; gemW += att;
      if (ndl <= 0.0 || att * ndl < 0.004) continue;
      if (blocked(p + n * 0.01, uLP[i])) continue;
      vec3 lc = uLC[i].rgb * att;
      dif += lc * ndl;
      vec4 H = normalize(L + V);
      spec += lc * pow(max(dot(n, H), 0.0), shine) * gloss;
      spec += lc * sparkle * pow(max(dot(nj, H), 0.0), 300.0) * 5.0; // mica: glints that come and go as you move
    }
    gemTint /= max(gemW, 1e-4);
    if (deco == 1u) { base = mix(vec3(0.25), gemTint, 0.8) * 0.55; gloss = 1.0; emit = gemTint * 0.18 * (0.8 + 0.2 * sin(uTime * 1.3 + g * 6.0)); } // gemstone: the colour of its light
    if (deco == 2u) { base = vec3(0.05, 0.13, 0.11); float sp = step(0.95, hash(floor(p * 4.0))); emit = vec3(0.2, 1.0, 0.75) * sp * (0.12 + 0.08 * sin(uTime * 2.0 + g * 9.0)); } // moss, glowing in specks
    // a little warm lantern at your eye (no shadow: it's where you look from), and the faint dark
    float lam = max(dot(n, V), 0.0), fall = 1.0 / (1.0 + 0.01 * t * t);
    vec3 amb = vec3(0.05, 0.045, 0.08) + vec3(0.22, 0.16, 0.1) * lam * fall;
    col = (base * (amb + dif) + spec) * (1.0 - 0.08 * occ) * mix(0.65, 1.0, edge) + emit;
    col = mix(col, haze, 1.0 - exp(-t * 0.03));
  }
  // the lights themselves: a bright core and a soft bloom, by how near each passes to the ray, in 4D (a light
  // off your slice shows only the cross-section of its glow: it swells into view as you come to it in w)
  float tEnd = hit ? t : 60.0;
  for (int i = 0; i < ${NL}; i++) {
    if (i >= uNL) break;
    vec4 v = uLP[i] - o; float along = dot(v, d);
    if (along > tEnd + 0.25 || along < 0.0) continue;
    float d2 = dot(v - d * along, v - d * along);
    // a 4D ball of light, 0.8 across: where your slice cuts it, a disc that swells and shrinks as you move in w
    float core = smoothstep(0.16, 0.0, d2) * 1.8 + exp(-d2 / 0.35) * 0.6;
    col += uLC[i].rgb * uLC[i].a * (core + exp(-d2 / 2.0) * 0.18 + 0.04 / (1.0 + d2)) * (0.9 + 0.1 * sin(uTime * 3.0 + float(i)));
  }
  col += vec3(0.3, 0.9, 1.0) * (1.0 - exp(-glow * 0.9)) * (0.75 + 0.25 * sin(uTime * 2.0));
  col = mix(col, vec3(1.0, 0.95, 0.85), uFlash);
  col = col / (1.0 + 0.35 * col); // a soft shoulder, so bright light doesn't clip flat
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
    for (const n of ["uGrid", "uDims", "uEye", "uCR", "uCU", "uCF", "uUp", "uLP", "uLC", "uNL", "uRes", "uTan", "uTime", "uFlash"]) this.u[n] = gl.getUniformLocation(p, n);
    this.tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.uniform1i(this.u.uGrid, 0);
  }
  /* the cave into the texture: voxel (x, y, z, w) at (x + X z, y + Y w), its kind with the grotto's dressing
     above it; and the grotto's lights */
  load(cave, grotto) {
    const gl = this.gl, [X, Y, Z, W] = cave.dims, a = new Uint8Array(X * Z * Y * W);
    for (let w = 0; w < W; w++) for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) { const i = cave.idx(x, y, z, w); a[(y + Y * w) * (X * Z) + x + X * z] = cave.v[i] | ((grotto ? grotto.deco[i] : 0) << 2); }
    this.lights = grotto ? grotto.lights : [];
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
    // the lights nearest your eye
    const near = this.lights.map((l) => ({ l, d: l.p.reduce((s, x, i) => s + (x - v.eye[i]) ** 2, 0) })).sort((a, b) => a.d - b.d).slice(0, NL);
    const LP = new Float32Array(4 * NL), LC = new Float32Array(4 * NL);
    near.forEach(({ l }, i) => { LP.set(l.p, 4 * i); LC.set([...l.color, l.power], 4 * i); });
    gl.uniform4fv(u.uLP, LP); gl.uniform4fv(u.uLC, LC); gl.uniform1i(u.uNL, near.length);
    gl.uniform2f(u.uRes, w, h); gl.uniform1f(u.uTan, 0.7); gl.uniform1f(u.uTime, v.time || 0); gl.uniform1f(u.uFlash, v.flash || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
