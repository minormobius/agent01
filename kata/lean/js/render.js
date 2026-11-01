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
uniform usampler2D uH, uM, uAux; uniform sampler2D uBinT; uniform int uHasAux; uniform vec4 uN; // uAux: each track cell's bin along the course; uBinT: the course's tangent at each bin; uN: the direction your slice can't see
uniform vec4 uEye, uR, uU, uF, uSun;
uniform vec2 uRes;
uniform float uTan, uTime, uFae, uFar, uVS;
// the bike (bike.js's parts(), in metres): two tyres (centre, the wheel's plane, radii) and capsules (ends, radius, part)
uniform int uBike, uNCap;
uniform vec4 uTor[6]; uniform vec2 uTorR[2]; // per tyre: centre, e1, e2; and (R, r)
uniform vec4 uCapA[24], uCapB[24], uCapR[24]; // ends, and (radius, part, 0, 0)
uniform vec4 uBC; uniform float uBR; uniform vec3 uBikeCol; // a ball holding all of it, and the frame's colour
// the Cheshire cat (cat.js, as games/cheshire's lab.js draws it): parts in its own frame, q = uCatM (p − uCatO)
uniform int uCat, uNCC, uNCE; uniform vec4 uCatO; uniform mat4 uCatM; uniform float uCK;
uniform vec4 uCA[48], uCB[48], uCCp[48], uCEc[18], uCEr[18], uCEp[18], uCatBC; uniform float uCatBR;
out vec4 o;
const ivec3 DIM = ivec3(320, 320, 128);
const ivec3 NB = ivec3(40, 40, 16);
const int AC = 12; // the atlas: w-slices 12 across
int wr(int v, int n) { return v - n * int(floor(float(v) / float(n))); }
uint raw(ivec3 c) { int x = wr(c.x, DIM.x), z = wr(c.y, DIM.y), w = wr(c.z, DIM.z); return texelFetch(uH, ivec2(x + (w - (w / AC) * AC) * DIM.x, z + (w / AC) * DIM.y), 0).r; }
float col(ivec3 c) { return float(raw(c) & 63u); }
uint aux(ivec3 c) { int x = wr(c.x, DIM.x), z = wr(c.y, DIM.y), w = wr(c.z, DIM.z); return texelFetch(uAux, ivec2(x + (w - (w / AC) * AC) * DIM.x, z + (w / AC) * DIM.y), 0).r; }
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

// the bike's distance (metres) and part: bike.js's sdf(), line for line
float sdBike(vec4 q, out int m) {
  float d = 1e9; m = 0;
  for (int i = 0; i < 2; i++) {
    vec4 o = q - uTor[3 * i]; vec4 e1 = uTor[3 * i + 1], e2 = uTor[3 * i + 2]; float x = dot(o, e1), y = dot(o, e2);
    vec4 rest = o - x * e1 - y * e2; float e = length(vec2(length(vec2(x, y)) - uTorR[i].x, length(rest))) - uTorR[i].y;
    if (e < d) { d = e; m = 0; }
  }
  for (int i = 0; i < 24; i++) {
    if (i >= uNCap) break;
    vec4 a = uCapA[i], ab = uCapB[i] - a, ao = q - a; float L2 = dot(ab, ab), h = L2 > 0.0 ? clamp(dot(ao, ab) / L2, 0.0, 1.0) : 0.0;
    float e = length(ao - ab * h) - uCapR[i].x; if (e < d) { d = e; m = int(uCapR[i].y + 0.5); }
  }
  return d;
}

// the cat's distance, cat.js's sdf() (and the cat lab's shader), formula for formula
float cCapD(vec4 p, int i) {
  float wx = uCCp[i].w; vec4 P = p; if (wx > 0.) P.w = 0.; else if (wx < 0.) P = vec4(p.x, p.y, length(p.zw), 0.);
  vec4 pa = P - uCA[i], ba = uCB[i] - uCA[i]; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  float d = length(pa - ba * h) - mix(uCCp[i].x, uCCp[i].y, h);
  return wx > 0. ? max(d, abs(p.w) - wx) : d;
}
float cEllD(vec4 p, int i) {
  float wx = uCEp[i].y; vec4 q = p - uCEc[i], r = uCEr[i]; if (wx > 0.) { q.w = 0.; r.w = 1.; }
  float k0 = length(q / r), k1 = length(q / (r * r)); float d = k1 < 1e-12 ? -min(min(r.x, r.y), min(r.z, r.w)) : k0 * (k0 - 1.) / k1;
  return wx > 0. ? max(d, abs(p.w) - wx) : d;
}
void cBlend(inout float F, float d, float k) { float h = clamp(0.5 + 0.5 * (F - d) / k, 0., 1.); F = mix(F, d, h) - k * h * (1. - h); }
void cHard(inout float D, inout float M, float d, float m) { if (d < D) { D = d; M = m; } }
void cAdd(inout float F, inout float D, inout float M, inout float C, inout float E, inout float N, float d, float m) {
  if (m > 4.5) C = max(C, -d); else if (m >= 3.) cHard(E, N, d, m); else if (m >= 1.) cHard(D, M, d, m); else cBlend(F, d, uCK * (1. - m));
}
vec2 catSD(vec4 q) {
  float F = 100., D = 100., M = 1., C = -100., E = 100., N = 3.;
  for (int i = 0; i < 18; i++) { if (i >= uNCE) break; cAdd(F, D, M, C, E, N, cEllD(q, i), uCEp[i].x); }
  for (int i = 0; i < 48; i++) { if (i >= uNCC) break; cAdd(F, D, M, C, E, N, cCapD(q, i), uCCp[i].z); }
  if (F <= D) { D = F; M = 0.; }
  if (C > D) { D = C; M = 5.; }
  return E < D ? vec2(E, N) : vec2(D, M);
}
// the bike, and the cat on it when there is one: the nearer, and its part (the cat's parts are 10 + its material)
float sdScene(vec4 q, out int m) {
  float d = sdBike(q, m);
  if (uCat == 1 && length(q - uCatBC) - uCatBR < d) { vec2 c = catSD(uCatM * (q - uCatO)); if (c.x < d) { d = c.x; m = 10 + int(c.y + 0.01); } }
  return d;
}
// march the bike along a ray (metres) out to tMax: the ball first, then sphere tracing inside it
bool marchBike(vec4 ro, vec4 rd, float tMax, out float tHit, out int m) {
  vec4 oc = ro - uBC; float b = dot(oc, rd), c = dot(oc, oc) - uBR * uBR, h = b * b - c;
  if (h < 0.0) return false;
  h = sqrt(h); float t = max(-b - h, 0.0), t1 = min(-b + h, tMax);
  for (int i = 0; i < 96; i++) {
    if (t > t1) return false;
    float d = sdScene(ro + rd * t, m);
    if (d < (uCat == 1 ? 0.0004 : 0.0015) + 0.0004 * t) { tHit = t; return true; }
    t += d;
  }
  return false;
}
float hash(vec4 p) { return fract(sin(dot(p, vec4(12.9898, 78.233, 37.719, 94.673))) * 43758.5453); }
void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec4 d = normalize(uF + uv.x * uTan * uR + uv.y * uTan * uU);
  float t; vec4 n; ivec3 cell; vec3 c;
  bool hit = march(uEye, d, t, n, cell);
  float tb; int bm; bool bike = uBike == 1 && marchBike(uEye * uVS, d, hit ? t * uVS : uFar * uVS, tb, bm);
  if (bike) { // the bike: its parts' colours, lit as the land is, tinted by w as the land is
    vec4 q = uEye * uVS + d * tb; int mm; float E = uCat == 1 ? 0.0006 : 0.002;
    vec4 nb = normalize(vec4(sdScene(q + vec4(E, 0, 0, 0), mm) - sdScene(q - vec4(E, 0, 0, 0), mm), sdScene(q + vec4(0, E, 0, 0), mm) - sdScene(q - vec4(0, E, 0, 0), mm),
                             sdScene(q + vec4(0, 0, E, 0), mm) - sdScene(q - vec4(0, 0, E, 0), mm), sdScene(q + vec4(0, 0, 0, E), mm) - sdScene(q - vec4(0, 0, 0, E), mm)));
    vec3 base = bm == 0 ? vec3(0.08, 0.08, 0.09) : bm == 1 ? uBikeCol : bm == 2 ? vec3(0.85, 0.85, 0.82) : bm == 3 ? vec3(0.16, 0.24, 0.5) : bm == 4 ? vec3(0.12, 0.12, 0.13) : bm == 5 ? vec3(0.93, 0.76, 0.6) : vec3(0.2, 0.2, 0.26);
    if (bm >= 10) { // the cat: slate fur striped in all four directions (the stripes slide as you move through w), a pink nose,
      // amber lamps for eyes, a glowing grin, a tongue, the dark inside of the mouth
      vec4 cq = uCatM * (q - uCatO); float st = sin(28. * cq.x + 14. * cq.w + 3.2 * sin(15. * cq.y + 11. * cq.z) + 1.3), stripe = smoothstep(0.35, 0.65, st);
      base = mix(vec3(0.07, 0.065, 0.09), mix(vec3(0.62, 0.42, 1.0), vec3(0.22, 0.95, 0.88), clamp(0.5 + cq.w / 0.16, 0., 1.)) * 0.55, stripe);
      if (bm == 11) base = vec3(0.85, 0.32, 0.45);
      if (bm == 12) base = vec3(1.0, 0.8, 0.22) * 2.2;
      if (bm == 13) base = vec3(0.92, 1.0, 0.97) * 2.0;
      if (bm == 14) base = vec3(0.75, 0.22, 0.32);
      if (bm == 15) base = vec3(0.16, 0.02, 0.05);
    }
    float dw = q.w - uEye.w * uVS, k = uFae * smoothstep(0.25, 2.5, abs(dw));
    base = mix(base, mix(base, fae(dw * 0.22 + 0.5), 0.6) * 1.1, k);
    float lam = max(dot(nb, uSun), 0.0), spec = pow(max(dot(reflect(d, nb), uSun), 0.0), 24.0);
    c = base * (vec3(0.42, 0.47, 0.62) * (0.75 + 0.25 * nb.y) + vec3(1.0, 0.85, 0.64) * lam) + vec3(0.35) * spec * (bm == 1 ? 1.0 : 0.3);
    c = mix(c, sky(d) * 0.9 + 0.08, 1.0 - exp(-tb / 150.0));
  }
  else if (!hit) c = sky(d);
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
      if (mat == 3) {
        bool stripe = mod(float(cell.x + cell.y + cell.z), 4.0) < 2.0;
        base = stripe ? vec3(0.85, 0.16, 0.14) : vec3(0.93, 0.93, 0.9);
        if (uHasAux == 1) { // the kerbs say where the track goes out of your slice: teal ana, rose kata, white in it
          uint bi = aux(cell); vec4 tg = texelFetch(uBinT, ivec2(int(bi), 0), 0); float tn = dot(tg, uN), a = clamp(abs(tn) * 4.0, 0.0, 1.0);
          vec3 inPlane = stripe ? vec3(0.9, 0.9, 0.86) : vec3(0.55, 0.55, 0.58), way = tn > 0.0 ? vec3(0.22, 0.95, 0.88) : vec3(1.0, 0.4, 0.72);
          base = mix(inPlane, way * (stripe ? 1.0 : 0.7), a);
        }
      }
    }
    float seam;
    if (n.y > 0.5) seam = min(min(min(f.x, 1.0 - f.x), min(f.z, 1.0 - f.z)), min(f.w, 1.0 - f.w));
    else { seam = min(f.y, 1.0 - f.y); if (n.x == 0.0) seam = min(seam, min(f.x, 1.0 - f.x)); if (n.z == 0.0) seam = min(seam, min(f.z, 1.0 - f.z)); if (n.w == 0.0) seam = min(seam, min(f.w, 1.0 - f.w)); }
    float edge = smoothstep(0.0, 0.06 + 0.002 * t, seam);
    if (top && mat > 0) edge = mix(edge, 1.0, 0.7); // the tarmac's seams faint
    float dw = (p.w - uEye.w) * uVS, k = uFae * smoothstep(0.25, 2.5, abs(dw));
    base = mix(base, mix(base, fae(dw * 0.22 + 0.5), 0.75) * 1.15, k);
    float lam = max(dot(n, uSun), 0.0);
    if (uBike == 1) { float ts; int sm; if (marchBike(p * uVS + n * 0.01, uSun, 4.0, ts, sm)) lam *= 0.25; } // the bike's shadow
    c = base * (vec3(0.4, 0.46, 0.62) * (0.8 + 0.25 * n.y) + vec3(1.0, 0.85, 0.64) * lam) * mix(0.7, 1.0, edge);
    float fog = 1.0 - exp(-t * uVS / 150.0);
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
    this.u = {}; for (const n of ["uH", "uM", "uEye", "uR", "uU", "uF", "uSun", "uRes", "uTan", "uTime", "uFae", "uFar", "uVS", "uAux", "uBinT", "uHasAux", "uN", "uBike", "uNCap", "uTor", "uTorR", "uCapA", "uCapB", "uCapR", "uBC", "uBR", "uBikeCol", "uCat", "uNCC", "uNCE", "uCatO", "uCatM", "uCK", "uCA", "uCB", "uCCp", "uCEc", "uCEr", "uCEp", "uCatBC", "uCatBR"]) this.u[n] = gl.getUniformLocation(p, n);
  }
  tex(unit, w, h, data) {
    const gl = this.gl; this.texs = this.texs || {}; if (this.texs[unit]) gl.deleteTexture(this.texs[unit]); const t = (this.texs[unit] = gl.createTexture()); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, w, h, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
  }
  /* the land: H (x + X(z + Z w)) into an atlas of w-slices, each X × Z, `cols` across (world.js's ATLAS_C); M (the
     blocks) into a row of block-slices */
  load(H, M, dims, cols = 12) {
    const [X, Z, W] = dims, rows = Math.ceil(W / cols), a = new Uint8Array(X * cols * Z * rows);
    for (let w = 0; w < W; w++) for (let z = 0; z < Z; z++) { const src = X * (z + Z * w), row = (z + Math.floor(w / cols) * Z) * X * cols + (w % cols) * X; a.set(H.subarray(src, src + X), row); }
    this.tex(0, X * cols, Z * rows, a);
    const nb = dims.map((v) => v / 8), m = new Uint8Array(nb[0] * nb[2] * nb[1]);
    for (let w = 0; w < nb[2]; w++) for (let z = 0; z < nb[1]; z++) for (let x = 0; x < nb[0]; x++) m[z * nb[0] * nb[2] + x + w * nb[0]] = M[x + nb[0] * (z + nb[1] * w)];
    this.tex(1, nb[0] * nb[2], nb[1], m);
    const gl = this.gl; gl.uniform1i(this.u.uH, 0); gl.uniform1i(this.u.uM, 1);
  }
  /* the land again (a level's track changes only materials), and the track's direction bins and tangents (world.js
     trackBins, binTangents); aux null turns the kerbs' direction colours off */
  reload(H, dims, cols = 12) { this.atlas(0, H, dims, cols); this.gl.uniform1i(this.u.uH, 0); }
  atlas(unit, H, dims, cols) {
    const [X, Z, W] = dims, rows = Math.ceil(W / cols), a = new Uint8Array(X * cols * Z * rows);
    for (let w = 0; w < W; w++) for (let z = 0; z < Z; z++) { const src = X * (z + Z * w), row = (z + Math.floor(w / cols) * Z) * X * cols + (w % cols) * X; a.set(H.subarray(src, src + X), row); }
    this.tex(unit, X * cols, Z * rows, a);
  }
  aux(A, table, dims, cols = 12) {
    const gl = this.gl, u = this.u;
    if (!A) { gl.uniform1i(u.uHasAux, 0); return; }
    this.atlas(3, A, dims, cols); gl.uniform1i(u.uAux, 3);
    this.texs = this.texs || {}; if (this.texs[4]) gl.deleteTexture(this.texs[4]);
    const t = (this.texs[4] = gl.createTexture()); gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, table.length / 4, 1, 0, gl.RGBA, gl.FLOAT, table);
    gl.uniform1i(u.uBinT, 4); gl.uniform1i(u.uHasAux, 1);
  }
  /* the bike: bike.js's parts() (metres), the middle and radius of a ball holding it, and the frame's colour; null hides it */
  bike(P, mid, rad, col) {
    const gl = this.gl, u = this.u;
    if (!P) { gl.uniform1i(u.uBike, 0); return; }
    const tor = new Float32Array(24), tr = new Float32Array(4);
    P.tori.forEach((w, i) => { tor.set(w.c, 12 * i); tor.set(w.e1, 12 * i + 4); tor.set(w.e2, 12 * i + 8); tr[2 * i] = w.R; tr[2 * i + 1] = w.r; });
    const A = new Float32Array(96), Bv = new Float32Array(96), R = new Float32Array(96), n = Math.min(24, P.caps.length);
    for (let i = 0; i < n; i++) { const c = P.caps[i]; A.set(c.a, 4 * i); Bv.set(c.b, 4 * i); R[4 * i] = c.r; R[4 * i + 1] = c.m; }
    gl.uniform4fv(u.uTor, tor); gl.uniform2fv(u.uTorR, tr); gl.uniform4fv(u.uCapA, A); gl.uniform4fv(u.uCapB, Bv); gl.uniform4fv(u.uCapR, R);
    gl.uniform1i(u.uNCap, n); gl.uniform4fv(u.uBC, mid); gl.uniform1f(u.uBR, rad); gl.uniform3fv(u.uBikeCol, col); gl.uniform1i(u.uBike, 1);
  }
  /* the cat: its parts (cat.js pose(), its own frame), its frame in the world (O, rows M) and a ball holding it; null hides it */
  cat(P, O, M, bc, br, K) {
    const gl = this.gl, u = this.u;
    if (!P) { gl.uniform1i(u.uCat, 0); return; }
    const A = new Float32Array(192), Bv = new Float32Array(192), Cp = new Float32Array(192), nc = Math.min(48, P.caps.length);
    for (let i = 0; i < nc; i++) { const c = P.caps[i]; A.set(c.a, 4 * i); Bv.set(c.b, 4 * i); Cp.set([c.ra, c.rb, c.m, c.wx], 4 * i); }
    const Ec = new Float32Array(72), Er = new Float32Array(72), Ep = new Float32Array(72), ne = Math.min(18, P.ells.length);
    for (let i = 0; i < ne; i++) { const e = P.ells[i]; Ec.set(e.c, 4 * i); Er.set(e.r, 4 * i); Ep.set([e.m, e.wx, 0, 0], 4 * i); }
    gl.uniform4fv(u.uCA, A); gl.uniform4fv(u.uCB, Bv); gl.uniform4fv(u.uCCp, Cp); gl.uniform4fv(u.uCEc, Ec); gl.uniform4fv(u.uCEr, Er); gl.uniform4fv(u.uCEp, Ep);
    gl.uniform1i(u.uNCC, nc); gl.uniform1i(u.uNCE, ne); gl.uniform4fv(u.uCatO, O); gl.uniform1f(u.uCK, K);
    // GLSL's mat4 is column-major: M · v = (rows · v) wants the rows laid out as columns of the transpose
    const m = new Float32Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) m[c * 4 + r] = M[r][c];
    gl.uniformMatrix4fv(u.uCatM, false, m); gl.uniform4fv(u.uCatBC, bc); gl.uniform1f(u.uCatBR, br); gl.uniform1i(u.uCat, 1);
  }
  /* v: { eye (cells), R, U, F (the camera's), sun, time, fae, tan, far, vs } */
  draw(v, scale) {
    const gl = this.gl, c = this.canvas, u = this.u;
    const w = Math.max(1, Math.round(c.clientWidth * scale)), h = Math.max(1, Math.round(c.clientHeight * scale));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform4fv(u.uEye, v.eye); gl.uniform4fv(u.uN, v.N || [0, 0, 0, 1]); gl.uniform4fv(u.uR, v.R); gl.uniform4fv(u.uU, v.U); gl.uniform4fv(u.uF, v.F); gl.uniform4fv(u.uSun, v.sun);
    gl.uniform2f(u.uRes, w, h); gl.uniform1f(u.uTan, v.tan); gl.uniform1f(u.uTime, v.time); gl.uniform1f(u.uFae, v.fae); gl.uniform1f(u.uFar, v.far); gl.uniform1f(u.uVS, v.vs);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
