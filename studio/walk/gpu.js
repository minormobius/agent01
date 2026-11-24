// gpu.js — the colour cycle's world, drawn on the GPU, and set in type that stays where it is put.
//
// The flight (cycle/fly.js) draws the world on the CPU, Voxel Space at 640×360: about 35 ms a frame
// before anything else, and a picture too coarse to carry more type. Here the same world goes to the
// GPU as textures (its heightmap, each cell's palette index and kind, the palette lit for this moment,
// the cloud layer) and one fragment shader marches a ray per pixel at the screen's own resolution.
// The look is still the colour cycle's: every surface colour is a PALETTE ENTRY, lit and turned on
// the CPU exactly as the flight does it (Flight.palette), so the waterfall pours and the shadows swing
// by the same rules.
//
// Three passes a frame:
//   WORLD   ray-march into two targets: colour + material (the class ascii.js reads), and distance
//   SHOW    the colour target to the screen (the plain view)
//   TYPE    the world in type (DECIDE + DRAW, after cycle/ascii.js), but ANCHORED IN THE WORLD:
//           a character belongs to a point on a surface, or to a direction in the sky, not to a
//           place on the screen. Walking moves the characters with the world (near ones past
//           faster than far ones) instead of re-lettering the picture every frame.
//
// How a character is anchored. Each point of the screen lattice (a jittered lattice about a character
// apart, as in ascii.js) looks at what it sees: a surface at distance t, or the sky in direction d.
//  - A surface: the world is cut into cubes a little over half a character across at that distance
//    (smaller and the set drawn flickers as you move; larger and most points own nothing) (sizes in
//    powers of two, so a cube is the same cube from frame to frame until you are twice as near or far);
//    the cube the point sees is the character's home, at a jittered spot inside it fixed by its hash.
//  - The sky: the same with directions: rows of elevation, each cut into azimuth steps a character wide.
// The anchor is projected back to the screen; the lattice point OWNS the character only if the anchor
// lands in its own lattice cell (so a character is drawn once, by one point). Its glyph, size, tilt
// and number come from the anchor's hash, so they travel with it.

export const CLASS = { sky: 0, cloud: 1, water: 2, fall: 3, rock: 4, tree: 5, ground: 6, built: 7 };
const RAMPS = [
  ' .:+=*o#',      // sky
  ' .:-~=+*',      // cloud
  ' .,-~~==',      // water
  ' .:;|!I#',      // fall
  ' .:;=+%#',      // rock
  ' .,;^Aa%',      // tree
  ' .,:;-=+',      // ground
  ' .:-+[]#',      // built
];
const EDGE = '-', STARS = '.+*';
export const GLYPHS = [...new Set([...RAMPS.join(''), EDGE, ...STARS])];
const at = (ch) => GLYPHS.indexOf(ch);
export const FAR = 6000, VFOV = 62 * Math.PI / 180;

// the camera, shared by every pass: position, basis, the tangent of half the vertical field of view
const CAMERA = `
uniform vec3 camPos, camFwd, camRight, camUp;
uniform float tanHalf, aspect;
vec3 rayAt(vec2 uv) {    // uv: 0..1 across the picture, y down
  vec2 s = vec2((uv.x - 0.5) * 2.0 * aspect, (0.5 - uv.y) * 2.0) * tanHalf;
  return normalize(camFwd + camRight * s.x + camUp * s.y);
}
vec3 project(vec3 p) {   // → uv (y down) and depth along the view; z <= 0 behind
  vec3 r = p - camPos; float z = dot(r, camFwd);
  vec2 s = vec2(dot(r, camRight), dot(r, camUp)) / max(z, 1e-4) / tanHalf;
  return vec3(s.x / (2.0 * aspect) + 0.5, 0.5 - s.y / 2.0, z);
}
const float PI = 3.14159265;
`;

const QUAD_VS = `#version 300 es
in vec2 corner;
out vec2 vUv;
void main() { vUv = vec2(corner.x, 1.0 - corner.y); gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;

// ---------------------------------------------------------------------------------------- WORLD
const WORLD_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
in vec2 vUv;
layout(location = 0) out vec4 oCol;    // colour, and the material class / 255 in alpha
layout(location = 1) out vec4 oDep;    // distance, log-packed into two bytes (rg)
${CAMERA}
uniform sampler2D hmap, pal, cloud;    // height (R16F, linear, mirrored), palette (256×1 RGBA16F), cloud density
uniform usampler2D cells;              // per cell: palette index, kind
uniform float SIZE, CELLM, maxH, timeS, drift;
uniform vec3 zen, hor, amb, sunCol, moonCol, sunDir, body;
uniform float sunI, fogK, cloudThr, cloudA;
uniform int fallSlot, strataOff;
uniform vec3 cloudLit, cloudDark;
float H(vec2 p) { return max(texture(hmap, p / SIZE).r, 0.0); }    // water is level at 0
uvec2 cellAt(vec2 p) {
  vec2 m = mod(p, 2.0 * SIZE); m = mix(m, 2.0 * SIZE - m, step(SIZE, m));     // the world mirrors past its edge
  ivec2 c = clamp(ivec2(m / CELLM), ivec2(0), ivec2(int(SIZE / CELLM) - 1));
  return texelFetch(cells, c, 0).rg;
}
vec3 palAt(uint i) { return texelFetch(pal, ivec2(int(i), 0), 0).rgb; }
vec3 sky(vec3 d, out float ca) {
  float e = d.z;
  vec3 c = mix(hor, zen, pow(max(e, 0.0), 0.55));
  float cs = dot(d, sunDir);
  if (cs > 0.6) { float g = pow(cs, 10.0) * 0.45 + pow(cs, 120.0) * 0.6, hz = 1.0 - min(1.0, e * 3.0); c += sunCol * g * vec3(0.5 + hz, 0.4 + hz * 0.8, 0.4); }
  if (cs > 0.99985 && sunI > 0.0) c = vec3(1.0, 0.96, 0.85);
  ca = 0.0;
  if (e > 0.012) {
    float tt = (1800.0 - camPos.z) / e;
    if (tt > 0.0 && tt < 30000.0) {
      vec2 q = (camPos.xy + d.xy * tt) / 25.0 + vec2(drift, drift * 0.3);
      float dd = texture(cloud, q / 512.0).r;
      if (dd > cloudThr) {
        ca = smoothstep(cloudThr, cloudThr + 0.14, dd) * cloudA * smoothstep(30000.0, 9000.0, tt);
        float lit = smoothstep(cloudThr, cloudThr + 0.3, dd), sh = clamp(1.0 - (texture(cloud, (q + vec2(0.0, 3.0)) / 512.0).r - dd) * 6.0, 0.0, 1.0);
        c = mix(c, mix(cloudDark, cloudLit, lit * sh), ca);
      }
    }
  }
  return c;
}
// march over the heightfield: big steps high above it, small near it, a bisection at the crossing
bool march(vec3 ro, vec3 rd, float far, out float t) {
  t = 0.3;
  float prev = 0.0;
  for (int i = 0; i < 220; i++) {
    vec3 p = ro + rd * t;
    if (p.z > maxH && rd.z >= 0.0) return false;
    float h = H(p.xy), gap = p.z - h;
    if (gap < 0.0) {
      float a = prev, b = t;
      for (int k = 0; k < 6; k++) { float m = 0.5 * (a + b); vec3 q = ro + rd * m; if (q.z - H(q.xy) < 0.0) b = m; else a = m; }
      t = b; return true;
    }
    prev = t;
    t += max(max(0.25, gap * 0.45), t * 0.0025);
    if (t > far) return false;
  }
  return false;
}
// the colour of a surface point: its cell's palette entry (the fall and the cliff strata by height)
vec3 surface(vec3 p, out uint kind) {
  uvec2 c = cellAt(p.xy); kind = c.g;
  uint idx = c.r;
  ivec2 ij = ivec2(p.xy / CELLM);
  if (kind == 3u) { int lag = (ij.x * 7 + ij.y * 3) & 7; idx = uint(fallSlot + (((int(floor(p.z / 1.3)) + lag) % 16) + 16) % 16); }
  else if (kind == 6u) { float off = float((ij.x * 13 + ij.y * 7) & 7) * 0.6; if (sin(p.z * 0.5 + off) + 0.6 * sin(p.z * 1.6 + off * 3.0) > 1.0) idx += uint(strataOff); }
  return palAt(idx);
}
float classOf(uint kind) {
  return kind == 1u || kind == 2u ? 2.0 : kind == 3u || kind == 4u ? 3.0 : kind == 6u ? 4.0 : kind == 5u || kind == 7u ? 7.0 : 6.0;
}
vec3 haze(vec3 c, float t, vec3 d) {
  float ca; vec3 hz = sky(normalize(vec3(d.xy, 0.02 * length(d.xy))), ca);
  return mix(c, hz, 1.0 - exp(-t * fogK));
}
void main() {
  // the targets are stored top row first, like a canvas: everything that reads them uses y down
  vec3 rd = rayAt(vec2(vUv.x, 1.0 - vUv.y));
  float t, ca;
  vec3 col; float cls;
  if (march(camPos, rd, ${FAR.toFixed(1)}, t)) {
    vec3 p = camPos + rd * t;
    uint kind;
    col = surface(p, kind);
    cls = classOf(kind);
    if (kind == 1u) {
      // the lake: what it mirrors (a second march from the surface), over the water's own body
      vec3 rr = vec3(rd.xy, -rd.z);
      float t2; vec3 refl;
      if (march(p + vec3(0.0, 0.0, 0.05), rr, 2500.0, t2)) { uint k2; refl = haze(surface(p + rr * t2, k2), t2, rr); }
      else refl = sky(rr, ca);
      vec3 bodyC = body * (amb + sunCol * 0.3);
      float fres = 0.25 + 0.65 * pow(1.0 - abs(rd.z), 4.0);
      col = mix(bodyC, refl, fres) + col;    // the palette's lake entries are its ripple highlights
    }
    col = haze(col, t, rd);
    t = min(t, ${FAR.toFixed(1)});
  } else {
    col = sky(rd, ca);
    cls = ca > 0.5 ? 1.0 : 0.0;
    t = ${(FAR * 2).toFixed(1)};
  }
  oCol = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.87)), cls / 255.0);
  float dl = log2(1.0 + t) / log2(1.0 + ${(FAR * 2).toFixed(1)});
  float hi = floor(dl * 255.0) / 255.0;
  oDep = vec4(hi, (dl - hi) * 255.0, 0.0, 1.0);
}`;

const SHOW_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D col;
out vec4 o;
void main() { o = vec4(texture(col, vUv).rgb, 1.0); }`;

// ---------------------------------------------------------------------------------------- TYPE
const LATTICE = `
uniform vec2 outSize, cellPx;          // the screen in device pixels, the lattice step in device pixels
uniform int nx;
float rndI(int i, int j, uint k) {
  uint x = uint(i) * 1973u + uint(j) * 9277u + k * 26699u + 1u;
  x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16;
  return float(x) / 4294967295.0;
}
vec2 home(int i, int j) { return (vec2(float(i), float(j)) + vec2(rndI(i, j, 1u), rndI(i, j, 2u))) * cellPx; }
`;
const DECIDE_FS = `#version 300 es
precision highp float;
precision highp int;
${CAMERA}
${LATTICE}
uniform sampler2D gcol, gdep, ramp;
uniform float timeS, levels;
uniform int edgeGlyph;
layout(location = 0) out vec4 o0;   // colour, shown (0: not drawn)
layout(location = 1) out vec4 o1;   // glyph/255, turn (−π..π as 0..1), size (0.5..2 as 0..1)
layout(location = 2) out vec4 o2;   // where, relative to home: ±8 lattice steps as 0..1
float h3(vec3 c, float salt) { return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719)) + salt * 17.13) * 43758.5453); }
float classAt(vec2 uv) { return floor(texture(gcol, uv).a * 255.0 + 0.5); }
float edgeClass(vec2 uv) { float k = classAt(uv); return k == 1.0 ? 0.0 : k; }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float depthAt(vec2 uv) { vec2 d = texture(gdep, uv).rg; return exp2((d.r + d.g / 255.0) * log2(1.0 + ${(FAR * 2).toFixed(1)})) - 1.0; }
void hide() { o0 = vec4(0.0); o1 = vec4(0.0); o2 = vec4(0.5); }
void main() {
  int i = int(gl_FragCoord.x), j = int(gl_FragCoord.y);
  vec2 hp = home(i, j), huv = hp / outSize;
  float k0 = classAt(huv);
  vec3 rd = rayAt(huv);
  float chAng = cellPx.y / outSize.y * 2.0 * tanHalf;        // a lattice step's angle (tangent), vertically
  vec3 anchor; vec3 cell; float salt;
  if (k0 <= 1.0) {
    // the sky: rows of elevation a character high, each cut into azimuth steps a character wide
    float el = asin(clamp(rd.z, -1.0, 1.0)), az = atan(rd.x, rd.y);
    float a = chAng * 0.6, row = floor(el / a);
    float elc = (row + 0.5) * a, stp = a / max(cos(elc), 0.05), ac = floor(az / stp);
    cell = vec3(ac, row, 7.0); salt = 1.0;
    float e2 = (row + 0.15 + 0.7 * h3(cell, 1.0)) * a, a2 = (ac + 0.15 + 0.7 * h3(cell, 2.0)) * stp;
    anchor = camPos + vec3(sin(a2) * cos(e2), cos(a2) * cos(e2), sin(e2)) * 1000.0;
  } else {
    // a surface: a cube about a character across at this distance, sizes in powers of two
    float t = depthAt(huv);
    vec3 p = camPos + rd * t;
    float s = t * chAng * 0.55, lv = floor(log2(max(s, 0.02) / 0.02) + 0.5), w = 0.02 * exp2(lv);
    cell = floor(p / w); salt = lv;
    anchor = (cell + 0.15 + 0.7 * vec3(h3(cell, lv), h3(cell, lv + 0.37), h3(cell, lv + 0.71))) * w;
    // pull the anchor back onto the ray's surface along the view, so it sits on what is seen
    anchor = camPos + normalize(anchor - camPos) * t;
  }
  vec3 pr = project(anchor);
  if (pr.z <= 0.0) { hide(); return; }
  vec2 q = pr.xy * outSize;
  if (floor(q.x / cellPx.x) != float(i) || floor(q.y / cellPx.y) != float(j)) { hide(); return; }   // not mine
  float r = h3(cell, salt + 3.0), r2 = h3(cell, salt + 5.0), r3 = h3(cell, salt + 9.0);
  vec2 uv = q / outSize;
  float k = classAt(uv);
  vec2 drawAt = q;
  float alpha = 1.0;
  if (k == 3.0) { float ph = fract(timeS * 0.9 + r2); drawAt.y += ph * cellPx.y * 2.5; alpha = sin(ph * PI); }
  vec3 raw = texture(gcol, uv).rgb;
  float L0 = lum(raw);
  // the eye: the picture's mean brightness from the colour target's smallest mip
  float m = lum(textureLod(gcol, vec2(0.5), levels).rgb), exposure = clamp(pow(0.32 / max(m, 0.01), 0.75), 1.0, 4.0);
  vec3 col = min(raw * exposure, vec3(1.0));
  float L = lum(col);
  // an edge between materials: a dash along the contour, in the brighter side's light
  float ke = edgeClass(uv), rad = cellPx.x * 0.9;
  vec2 n = vec2(0.0); float other = 0.0; vec3 lit = col;
  for (int a = 0; a < 8; a++) {
    vec2 d = vec2(cos(float(a) * PI / 4.0), sin(float(a) * PI / 4.0));
    vec2 qq = (q + d * rad) / outSize;
    vec3 cq = min(texture(gcol, qq).rgb * exposure, vec3(1.0));
    if (lum(cq) > lum(lit)) lit = cq;
    float diff = edgeClass(qq) != ke ? 1.0 : 0.0;
    if (diff < 0.5 && k >= 4.0) diff = abs(lum(texture(gcol, qq).rgb) - L0) * exposure > 0.26 ? 1.0 : 0.0;
    n += d * diff; other += diff;
  }
  vec2 off = (drawAt - hp) / (cellPx * 16.0) + 0.5;
  if (other > 0.5 && other < 7.5 && length(n) > 0.4 && k != 2.0) {
    if (r < 0.15) { hide(); return; }
    float angle = atan(n.y, n.x) + PI * 0.5;
    if (angle > PI * 0.5) angle -= PI;
    if (angle < -PI * 0.5) angle += PI;
    o0 = vec4(clamp(max(lit * 1.25, vec3(lum(lit) * 0.8 + 0.1)), 0.0, 1.0), alpha);
    o1 = vec4(float(edgeGlyph) / 255.0, angle / (2.0 * PI) + 0.5, (1.3 - 0.5) / 1.5, 0.0);
    o2 = vec4(off, 0.0, 0.0);
    return;
  }
  // a star: a sky character on a pixel brighter than the sky round it
  if (k == 0.0) {
    float nb = 0.0, around = 0.0;
    for (int a = 0; a < 8; a++) {
      vec2 d = vec2(cos(float(a) * PI / 4.0), sin(float(a) * PI / 4.0));
      nb = max(nb, lum(texture(gcol, (q + d * 1.5) / outSize).rgb));
      around += lum(texture(gcol, (q + d * 6.0) / outSize).rgb) / 8.0;
    }
    float s = L0 - around;
    if (L0 >= nb && s > 0.08) {
      int si = s > 0.45 ? 2 : s > 0.2 ? 1 : 0;
      o0 = vec4(clamp(vec3(L0) * vec3(1.0, 0.97, 0.9) + 0.15, 0.0, 1.0), 1.0);
      o1 = vec4(texelFetch(ramp, ivec2(si, 9), 0).r, 0.5, (0.9 + 0.5 * s - 0.5) / 1.5, 0.0);
      o2 = vec4(off, 0.0, 0.0);
      return;
    }
  }
  float density = clamp(0.04 + 1.6 * pow(L, 0.8), 0.0, 1.0);
  if (r > density) { hide(); return; }
  float level = clamp(floor(pow(L, 0.9) * 6.3 + 0.5 + (r3 - 0.5) * 1.3), 1.0, 7.0);
  vec3 ink = mix(col, col / max(0.12, max(col.r, max(col.g, col.b))), 0.6) * (0.9 + 0.45 * sqrt(L));
  o0 = vec4(clamp(ink, 0.0, 1.0), alpha);
  o1 = vec4(texelFetch(ramp, ivec2(int(level), int(k)), 0).r, (r3 - 0.5) * 0.25 / (2.0 * PI) + 0.5, (0.8 + 0.5 * sqrt(L) + 0.16 * (r2 - 0.5) - 0.5) / 1.5, 0.0);
  o2 = vec4(off, 0.0, 0.0);
}`;
const DRAW_VS = `#version 300 es
precision highp float;
precision highp int;
${LATTICE}
in vec2 corner;
uniform sampler2D s0, s1, s2;
uniform vec2 glyphPx;
out vec2 vAtlas;
out vec3 vCol;
out float vAlpha;
flat out int vGlyph;
const float PI = 3.14159265;
void main() {
  int i = gl_InstanceID % nx, j = gl_InstanceID / nx;
  vec4 a = texelFetch(s0, ivec2(i, j), 0);
  if (a.a < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 b = texelFetch(s1, ivec2(i, j), 0), c = texelFetch(s2, ivec2(i, j), 0);
  vec2 p = home(i, j) + (c.xy - 0.5) * cellPx * 16.0;
  float angle = (b.y - 0.5) * 2.0 * PI, size = 0.5 + b.z * 1.5, ca = cos(angle), sa = sin(angle);
  vec2 o = (corner - 0.5) * glyphPx * size;
  o = vec2(o.x * ca - o.y * sa, o.x * sa + o.y * ca);
  vec2 dev = p + o;
  gl_Position = vec4(dev.x / outSize.x * 2.0 - 1.0, 1.0 - dev.y / outSize.y * 2.0, 0.0, 1.0);
  vAtlas = corner;
  vCol = a.rgb; vAlpha = a.a; vGlyph = int(b.x * 255.0 + 0.5);
}`;
const DRAW_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vAtlas;
in vec3 vCol;
in float vAlpha;
flat in int vGlyph;
uniform sampler2D atlas;
uniform float glyphs;
out vec4 o;
void main() {
  float cover = texture(atlas, vec2((float(vGlyph) + vAtlas.x) / glyphs, vAtlas.y)).r * vAlpha;
  if (cover < 0.01) discard;
  o = vec4(vCol * cover, cover);
}`;

export class GPUWorld {
  constructor(canvas) {
    this.cv = canvas;
    const gl = (this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, preserveDrawingBuffer: false }));
    if (!gl) throw new Error('this page needs WebGL2');
    const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const program = (vs, fs) => {
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      pr.u = (n) => gl.getUniformLocation(pr, n);
      return pr;
    };
    this.pWorld = program(QUAD_VS, WORLD_FS);
    this.pShow = program(QUAD_VS, SHOW_FS);
    this.pDecide = program(QUAD_VS, DECIDE_FS);
    this.pDraw = program(DRAW_VS, DRAW_FS);
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    for (const pr of [this.pWorld, this.pShow, this.pDecide, this.pDraw]) {
      pr.vao = gl.createVertexArray(); gl.bindVertexArray(pr.vao);
      const lc = gl.getAttribLocation(pr, 'corner'); gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, 2, gl.FLOAT, false, 0, 0);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.tex = (filter, wrap = gl.CLAMP_TO_EDGE) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, filter], [gl.TEXTURE_MAG_FILTER, filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter], [gl.TEXTURE_WRAP_S, wrap], [gl.TEXTURE_WRAP_T, wrap]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
      return t;
    };
    // the type's tables
    this.tRamp = this.tex(gl.NEAREST);
    const rt = new Uint8Array(8 * 10);
    RAMPS.forEach((r, k) => [...r].forEach((ch, i) => { rt[k * 8 + i] = at(ch); }));
    [...STARS].forEach((ch, i) => { rt[9 * 8 + i] = at(ch); });
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 8, 10, 0, gl.RED, gl.UNSIGNED_BYTE, rt);
    this.tAtlas = this.tex(gl.LINEAR_MIPMAP_LINEAR);
    this.gb = null; this.st = null;
    this.dens = 1; this.glyphCss = null;
  }

  /** The world's fixed data, once: heightmap, cells (palette index, kind), the cloud layer. */
  load(world, cloud) {
    const gl = this.gl, N = world.N;
    this.world = world;
    this.tH = this.tex(gl.LINEAR, gl.MIRRORED_REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, N, N, 0, gl.RED, gl.FLOAT, world.height);
    this.tCells = this.tex(gl.NEAREST);
    const c = new Uint8Array(N * N * 2);
    for (let k = 0; k < N * N; k++) { c[k * 2] = world.index[k]; c[k * 2 + 1] = world.kind[k]; }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8UI, N, N, 0, gl.RG_INTEGER, gl.UNSIGNED_BYTE, c);
    this.tCloud = this.tex(gl.LINEAR, gl.REPEAT);
    const cb = new Uint8Array(512 * 512); for (let k = 0; k < cb.length; k++) cb[k] = Math.max(0, Math.min(255, Math.round(cloud[k] * 255)));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 512, 512, 0, gl.RED, gl.UNSIGNED_BYTE, cb);
    this.tPal = this.tex(gl.NEAREST);
    this.pal4 = new Float32Array(256 * 4);
  }

  /** Render targets sized to the world pass's resolution and the type's lattice. */
  targets(gw, gh) {
    const gl = this.gl;
    if (this.gb && this.gb.w === gw && this.gb.h === gh) return;
    const col = this.tex(gl.LINEAR_MIPMAP_LINEAR), dep = this.tex(gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, col); gl.texStorage2D(gl.TEXTURE_2D, 1 + Math.floor(Math.log2(Math.max(gw, gh))), gl.RGBA8, gw, gh);
    gl.bindTexture(gl.TEXTURE_2D, dep); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gw, gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, col, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, dep, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.gb = { w: gw, h: gh, col, dep, fb, levels: Math.floor(Math.log2(Math.max(gw, gh))) };
  }

  /** The glyph atlas, every glyph in a row, white on black, bold, at twice its drawn size. */
  atlas(gw, gh) {
    const c = document.createElement('canvas'), s = 2;
    c.width = gw * s * GLYPHS.length; c.height = gh * s;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${Math.round(gh * s)}px ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace`;
    GLYPHS.forEach((ch, i) => g.fillText(ch, (i + 0.5) * gw * s, gh * s * 0.55));
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tAtlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  /** The type's lattice for this screen and its three state targets. */
  lattice(w, h, gw, gh) {
    const gl = this.gl, k = 1 / Math.sqrt(this.dens);
    const cell = [gw * 1.0 * k, gh * 0.8 * k], nx = Math.ceil(w / cell[0]), ny = Math.ceil(h / cell[1]);
    if (!this.st) {
      this.st = { tex: [this.tex(gl.NEAREST), this.tex(gl.NEAREST), this.tex(gl.NEAREST)], fb: gl.createFramebuffer() };
    }
    for (const t of this.st.tex) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nx, ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.st.fb);
    this.st.tex.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    Object.assign(this.st, { cell, nx, ny, w, h, gw, gh });
  }

  tune({ dens, glyph } = {}) {
    if (dens !== undefined) this.dens = Math.min(6, Math.max(0.25, dens));
    if (glyph !== undefined) this.glyphCss = glyph;
    this.layoutFor = '';
  }

  camera(pr, cam) {
    const gl = this.gl, cy = Math.cos(cam.pitch), f = [Math.sin(cam.yaw) * cy, Math.cos(cam.yaw) * cy, Math.sin(cam.pitch)];
    const r = [Math.cos(cam.yaw), -Math.sin(cam.yaw), 0], u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    gl.uniform3f(pr.u('camPos'), cam.x, cam.y, cam.z);
    gl.uniform3fv(pr.u('camFwd'), f); gl.uniform3fv(pr.u('camRight'), r); gl.uniform3fv(pr.u('camUp'), u);
    gl.uniform1f(pr.u('tanHalf'), Math.tan(VFOV / 2)); gl.uniform1f(pr.u('aspect'), this.cv.width / this.cv.height);
  }

  /**
   * One frame. cam {x, y, z, yaw, pitch}; lt the flight's light; pal its palette (768 floats);
   * env { timeS, drift, fogK, cloudThr, cloudA, cloudLit, cloudDark }; type: draw in type (else colour);
   * scale: the world pass's resolution against the canvas.
   */
  frame(cam, lt, pal, env, type, scale) {
    const gl = this.gl, w = this.cv.width, h = this.cv.height, W = this.world;
    const gw = Math.max(64, Math.round(w * scale)), gh = Math.max(36, Math.round(h * scale));
    this.targets(gw, gh);
    for (let i = 0; i < 256; i++) { this.pal4[i * 4] = pal[i * 3]; this.pal4[i * 4 + 1] = pal[i * 3 + 1]; this.pal4[i * 4 + 2] = pal[i * 3 + 2]; this.pal4[i * 4 + 3] = 1; }
    gl.bindTexture(gl.TEXTURE_2D, this.tPal);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 256, 1, 0, gl.RGBA, gl.FLOAT, this.pal4);
    // WORLD
    const P = this.pWorld;
    gl.useProgram(P); gl.bindVertexArray(P.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gb.fb); gl.viewport(0, 0, gw, gh); gl.disable(gl.BLEND);
    this.camera(P, cam);
    [[this.tH, 'hmap'], [this.tPal, 'pal'], [this.tCloud, 'cloud'], [this.tCells, 'cells']].forEach(([t, n], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(P.u(n), i); });
    gl.uniform1f(P.u('SIZE'), W.SIZE); gl.uniform1f(P.u('CELLM'), W.CELL); gl.uniform1f(P.u('maxH'), W.maxH);
    gl.uniform1f(P.u('timeS'), env.timeS % 1000); gl.uniform1f(P.u('drift'), env.drift % 512);
    for (const k of ['zen', 'hor', 'amb', 'sunCol', 'moonCol']) gl.uniform3fv(P.u(k), lt[k]);
    gl.uniform3fv(P.u('sunDir'), lt.L); gl.uniform3fv(P.u('body'), W.water);
    gl.uniform1f(P.u('sunI'), lt.sunI); gl.uniform1f(P.u('fogK'), env.fogK);
    gl.uniform1f(P.u('cloudThr'), env.cloudThr); gl.uniform1f(P.u('cloudA'), env.cloudA);
    gl.uniform3fv(P.u('cloudLit'), env.cloudLit); gl.uniform3fv(P.u('cloudDark'), env.cloudDark);
    gl.uniform1i(P.u('fallSlot'), W.slots.fall); gl.uniform1i(P.u('strataOff'), W.slots.strata);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, this.gb.col); gl.generateMipmap(gl.TEXTURE_2D);
    if (!type) {
      const S = this.pShow;
      gl.useProgram(S); gl.bindVertexArray(S.vao); gl.viewport(0, 0, w, h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.gb.col); gl.uniform1i(S.u('col'), 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return;
    }
    // TYPE: lay the lattice for this screen and size
    const dpr = this.dpr || 1, cssH = h / dpr;
    const gH = Math.max(this.glyphCss != null ? 4 : 7, Math.round((this.glyphCss ?? Math.min(9, Math.max(5, cssH / 100))) * dpr)), gW = Math.max(4, Math.round(gH * 0.62));
    const key = `${w}x${h}@${gH}x${this.dens}`;
    if (key !== this.layoutFor) { this.layoutFor = key; this.atlas(gW, gH); this.lattice(w, h, gW, gH); }
    const st = this.st, D = this.pDecide;
    gl.useProgram(D); gl.bindVertexArray(D.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, st.fb); gl.viewport(0, 0, st.nx, st.ny);
    this.camera(D, cam);
    [[this.gb.col, 'gcol'], [this.gb.dep, 'gdep'], [this.tRamp, 'ramp']].forEach(([t, n], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(D.u(n), i); });
    gl.uniform2f(D.u('outSize'), w, h); gl.uniform2f(D.u('cellPx'), st.cell[0], st.cell[1]); gl.uniform1i(D.u('nx'), st.nx);
    gl.uniform1f(D.u('timeS'), env.timeS % 1000); gl.uniform1f(D.u('levels'), this.gb.levels); gl.uniform1i(D.u('edgeGlyph'), at(EDGE));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const R = this.pDraw;
    gl.useProgram(R); gl.bindVertexArray(R.vao); gl.viewport(0, 0, w, h);
    gl.clearColor(0.012, 0.014, 0.02, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    [[st.tex[0], 's0'], [st.tex[1], 's1'], [st.tex[2], 's2'], [this.tAtlas, 'atlas']].forEach(([t, n], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(R.u(n), i); });
    gl.uniform2f(R.u('outSize'), w, h); gl.uniform2f(R.u('cellPx'), st.cell[0], st.cell[1]); gl.uniform1i(R.u('nx'), st.nx);
    gl.uniform2f(R.u('glyphPx'), gW, gH); gl.uniform1f(R.u('glyphs'), GLYPHS.length);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, st.nx * st.ny);
    gl.disable(gl.BLEND);
  }
}
