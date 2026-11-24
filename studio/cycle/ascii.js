// ascii.js — the landscape drawn entirely in type. A WebGL2 pass over the finished 640×360 frame, on a
// canvas laid over the page's, like crt.js; but nothing of the picture shows through. Every mark on the
// screen is a printable ASCII character on black.
//
// No grid. The characters are tens of thousands of separate marks, each placed, sized and turned on its
// own: a scatter of points (a jittered lattice about a character apart, so neighbours overlap a
// touch), fixed for the screen size, each with its own random number. Per frame, once per point (the
// DECIDE pass below), each point looks at the picture and the class map under it and decides:
//
// - WHETHER to draw: tone is carried by how many characters there are. A point draws if its random number
//   is under the brightness there, so a dark sky is a few faint dots, a sunlit cliff is crowded.
// - WHICH character: each material has its own vocabulary, dark to bright (the colour cycle's rule: a
//   look is authored for the picture, not squeezed onto it). The renderers know what every pixel IS
//   (the painting's layer map, the flight's kind buffer), so water is -~=, the fall is |!I, pines ^A,
//   windows []: never the same @#% everywhere.
// - HOW it lies: on a boundary between materials (a ridge on the sky, a shore, a roofline, snow on a
//   brown range) the point becomes a dash TURNED ALONG THE CONTOUR, found from eight samples round it,
//   so silhouettes are drawn as strokes of type. Boundaries always draw, whatever their brightness.
// - HOW it moves: water drifts and the fall pours (each point slides and fades on its own phase).
// - stars are a sky point sitting on a pixel brighter than everything round it: . + * by brightness.
//
// Only the 95 printable ASCII characters: anything else falls back to another font on a phone, at
// another width. The index-buffer art underneath is untouched. `ascii=1` in the link; `glyph=` sets the
// character height in CSS pixels (default about a 100th of the picture's height, 5–9 px).

export const CLASS = { sky: 0, cloud: 1, water: 2, fall: 3, rock: 4, tree: 5, ground: 6, built: 7 };
export const RAMPS = [
  ' .:+=*o#',      // sky: inkier as it brightens, so a noon sky is a crowd of blue type
  ' .:-~=+*',      // cloud: soft, never an outline
  ' .,-~~==',      // water
  ' .:;|!I#',      // fall
  ' .:;=+%#',      // rock
  ' .,;^Aa%',      // tree
  ' .,:;-=+',      // ground
  ' .:-+[]#',      // built
];
const EDGE = '-';
const STARS = '.+*';
// every glyph once, in atlas order
export const GLYPHS = [...new Set([...RAMPS.join(''), EDGE, ...STARS])];
const at = (ch) => GLYPHS.indexOf(ch);

/** The painting's layers (scene.js / coast.js LAYER) as classes. */
export function layerClasses(LAYER) {
  const t = new Uint8Array(256).fill(CLASS.ground);
  const set = (k, c) => { if (k in LAYER) t[LAYER[k]] = c; };
  set('sky', CLASS.sky); set('beam', CLASS.sky); set('cloud', CLASS.cloud); set('far', CLASS.rock); set('snow', CLASS.rock);
  set('mid', CLASS.rock); set('cliff', CLASS.rock); set('fall', CLASS.fall); set('tree', CLASS.tree); set('ground', CLASS.ground);
  set('sand', CLASS.ground); set('lake', CLASS.water); set('cabin', CLASS.built);
  return t;
}
/** The flight's kinds (world.js KIND) as classes; a pixel with no depth is sky. */
export function kindClasses(KIND) {
  const t = new Uint8Array(256).fill(CLASS.ground);
  const set = (k, c) => { if (k in KIND) t[KIND[k]] = c; };
  set('land', CLASS.ground); set('lake', CLASS.water); set('river', CLASS.water); set('fall', CLASS.fall); set('foam', CLASS.fall);
  set('cabin', CLASS.built); set('cliff', CLASS.rock); set('building', CLASS.built);
  return t;
}

// Two passes. DECIDE runs once per point (a fragment per point, into three small textures): whether it
// draws, which character, its turn, size, colour and drift. DRAW is an instanced quad per point that only
// reads those three texels back, so the expensive looking (some thirty samples) is done once per point,
// not four times per vertex. A point's place is a hash of its index, so both passes agree on it and no
// point buffer is needed: a jittered lattice about a character apart, so neighbours overlap a
// touch and no row or column shows.
const COMMON = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 srcSize, cellSrc;     // cellSrc: the lattice step, in source pixels
uniform int nx;
float rnd(int i, int j, uint k) {
  uint x = uint(i) * 1973u + uint(j) * 9277u + k * 26699u + 1u;
  x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16;
  return float(x) / 4294967295.0;
}
vec2 home(int i, int j) { return (vec2(float(i), float(j)) + vec2(rnd(i, j, 1u), rnd(i, j, 2u))) * cellSrc; }
const float PI = 3.14159265;
`;
const QUAD_VS = `#version 300 es
in vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;
const DECIDE = COMMON + `
uniform sampler2D src, cls, ramp;
uniform float time, spacing, exposure;
uniform int edgeGlyph;
layout(location = 0) out vec4 o0;   // colour, and how strongly it shows (0: not drawn)
layout(location = 1) out vec4 o1;   // glyph / 255, turn (−π..π as 0..1), size (0.5..2 as 0..1)
layout(location = 2) out vec4 o2;   // drift x, y (±3 lattice steps as 0..1)
float classAt(vec2 p) { return floor(texture(cls, p / srcSize).r * 255.0 + 0.5); }
float edgeClass(vec2 p) { float k = classAt(p); return k == 1.0 ? 0.0 : k; }   // a cloud has no outline
vec3 colAt(vec2 p) { return texture(src, p / srcSize).rgb; }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void emit(vec3 col, float show, int glyph, float angle, float size, vec2 off) {
  o0 = vec4(clamp(col, 0.0, 1.0), show);
  o1 = vec4(float(glyph) / 255.0, angle / (2.0 * PI) + 0.5, (size - 0.5) / 1.5, 0.0);
  o2 = vec4(off / (cellSrc * 6.0) + 0.5, 0.0, 0.0);
}
void main() {
  int i = int(gl_FragCoord.x), j = int(gl_FragCoord.y);
  vec2 p0 = home(i, j), p = p0;
  float r = rnd(i, j, 3u), r2 = rnd(i, j, 4u), r3 = rnd(i, j, 5u);
  float k = classAt(p), alpha = 1.0;
  // the flow: the fall pours (each point slides down and fades in and out on its own phase), water drifts
  if (k == 3.0) { float ph = fract(time * 0.9 + r2); p.y += ph * spacing * 2.5; alpha = sin(ph * PI); }
  if (k == 2.0) p.x += sin(time * 0.7 + r2 * 6.2832) * spacing * 0.6;
  vec2 off = p - p0;
  vec3 raw = colAt(p);
  float L0 = lum(raw);
  // the eye adapts: in a dark scene everything is lifted (exposure), so dusk still has a shape
  vec3 col = min(raw * exposure, vec3(1.0));
  float L = lum(col);
  // a boundary: where among eight samples round the point the class (or, on land, the brightness)
  // changes; n points from this material toward the other, and the stroke runs across it
  float ke = edgeClass(p), rad = spacing * 0.9;
  vec2 n = vec2(0.0); float other = 0.0;
  vec3 lit = col;   // the brighter side's colour: a ridge is drawn in the light of the sky behind it
  for (int a = 0; a < 8; a++) {
    vec2 d = vec2(cos(float(a) * PI / 4.0), sin(float(a) * PI / 4.0));
    vec2 q = p + d * rad;
    vec3 cq = min(colAt(q) * exposure, vec3(1.0));
    if (lum(cq) > lum(lit)) lit = cq;
    float diff = edgeClass(q) != ke ? 1.0 : 0.0;
    if (diff < 0.5 && k >= 4.0) diff = abs(lum(colAt(q)) - L0) * exposure > 0.26 ? 1.0 : 0.0;
    n += d * diff; other += diff;
  }
  if (other > 0.5 && other < 7.5 && length(n) > 0.4 && k != 2.0) {
    float angle = atan(n.y, n.x) + PI * 0.5;                // along the contour
    if (angle > PI * 0.5) angle -= PI;                      // a dash reads the same either way round
    if (angle < -PI * 0.5) angle += PI;
    emit(max(lit * 1.25, vec3(lum(lit) * 0.8 + 0.1)), r < 0.15 ? 0.0 : alpha, edgeGlyph, angle, 1.3, off);   // a stroke, not a solid line
    return;
  }
  // a star: a sky point on a pixel brighter than its neighbours and much brighter than the sky round it
  if (k == 0.0) {
    float nb = 0.0, around = 0.0;
    for (int a = 0; a < 8; a++) {
      vec2 d = vec2(cos(float(a) * PI / 4.0), sin(float(a) * PI / 4.0));
      nb = max(nb, lum(colAt(p + d)));
      around += lum(colAt(p + d * 4.0)) / 8.0;
    }
    float s = L0 - around;
    if (L0 >= nb && s > 0.08) {
      int si = s > 0.45 ? 2 : s > 0.2 ? 1 : 0;
      emit(vec3(L0) * vec3(1.0, 0.97, 0.9) + 0.15, 1.0, int(texelFetch(ramp, ivec2(si, 9), 0).r * 255.0 + 0.5), 0.0, 0.9 + 0.5 * s, off);
      return;
    }
  }
  // tone by count: draw only if this point's number is under the brightness here
  float density = clamp(0.04 + 1.6 * pow(L, 0.8), 0.0, 1.0);
  // which character: the material's ramp at this brightness, varied a step by the point's own number
  float level = clamp(floor(pow(L, 0.9) * 6.3 + 0.5 + (r3 - 0.5) * 1.3), 1.0, 7.0);
  int glyph = int(texelFetch(ramp, ivec2(int(level), int(k)), 0).r * 255.0 + 0.5);
  // the colour, lifted toward full: on black the ink is all there is
  vec3 ink = mix(col, col / max(0.12, max(col.r, max(col.g, col.b))), 0.6) * (0.9 + 0.45 * sqrt(L));
  // its size: brightness again (off the grid a character can be any size): dim places are small faint
  // characters, sunlit ones large and bold, each a little varied by its own number, with a hand's tilt
  emit(ink, r > density ? 0.0 : alpha, glyph, (r3 - 0.5) * 0.25, 0.8 + 0.5 * sqrt(L) + 0.16 * (r2 - 0.5), off);
}`;
const DRAW_VS = COMMON + `
in vec2 corner;
uniform sampler2D s0, s1, s2;
uniform vec2 outSize, glyphPx;
out vec2 vAtlas;
out vec3 vCol;
out float vAlpha;
flat out int vGlyph;
void main() {
  int i = gl_InstanceID % nx, j = gl_InstanceID / nx;
  vec4 a = texelFetch(s0, ivec2(i, j), 0);
  if (a.a < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 b = texelFetch(s1, ivec2(i, j), 0), c = texelFetch(s2, ivec2(i, j), 0);
  vec2 p = home(i, j) + (c.xy - 0.5) * cellSrc * 6.0;
  float angle = (b.y - 0.5) * 2.0 * PI, size = 0.5 + b.z * 1.5, ca = cos(angle), sa = sin(angle);
  vec2 o = (corner - 0.5) * glyphPx * size;
  o = vec2(o.x * ca - o.y * sa, o.x * sa + o.y * ca);
  vec2 dev = p * outSize / srcSize + o;
  gl_Position = vec4(dev.x / outSize.x * 2.0 - 1.0, 1.0 - dev.y / outSize.y * 2.0, 0.0, 1.0);
  vAtlas = corner;                         // y down, as the atlas canvas
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

export class ASCII {
  /**
   * src: the 640×360 canvas. parent: where the overlay goes. classes(): a Uint8Array W×H of CLASS
   * values for the current frame (or null: everything is ground). glyphCss: character height in CSS
   * pixels (null: chosen from the picture's size).
   */
  constructor(src, parent, classes, glyphCss = null) {
    this.src = src; this.classes = classes; this.glyphCss = glyphCss;
    const cv = (this.cv = document.createElement('canvas'));
    Object.assign(cv.style, { position: 'absolute', pointerEvents: 'none', display: 'none' });
    parent.append(cv);
    const gl = (this.gl = cv.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, preserveDrawingBuffer: false }));
    this.ok = !!gl;
    this.on = false;
    if (!gl) return;
    try { this.init(gl); } catch (e) { console.warn('ascii:', e); this.ok = false; }
  }
  init(gl) {
    const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const program = (vs, fs) => {
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      return pr;
    };
    this.decide = program(QUAD_VS, DECIDE);
    this.drawer = program(DRAW_VS, DRAW_FS);
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    for (const pr of [this.decide, this.drawer]) {
      pr.vao = gl.createVertexArray(); gl.bindVertexArray(pr.vao);
      const lc = gl.getAttribLocation(pr, 'corner'); gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, 2, gl.FLOAT, false, 0, 0);
      pr.u = (n) => gl.getUniformLocation(pr, n);
    }
    const tex = (filter) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, filter], [gl.TEXTURE_MAG_FILTER, filter], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
      return t;
    };
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.tSrc = tex(gl.LINEAR); this.tCls = tex(gl.NEAREST); this.tAtlas = tex(gl.LINEAR); this.tRamp = tex(gl.NEAREST);
    this.state = [tex(gl.NEAREST), tex(gl.NEAREST), tex(gl.NEAREST)];
    this.fb = gl.createFramebuffer();
    // the ramp table: 10 rows of 8 glyph indices (8 classes, a spare, the stars)
    const rt = new Uint8Array(8 * 10);
    RAMPS.forEach((r, k) => [...r].forEach((ch, i) => { rt[k * 8 + i] = at(ch); }));
    [...STARS].forEach((ch, i) => { rt[9 * 8 + i] = at(ch); });
    gl.bindTexture(gl.TEXTURE_2D, this.tRamp);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 8, 10, 0, gl.RED, gl.UNSIGNED_BYTE, rt);
    gl.useProgram(this.decide);
    [['src', 0], ['cls', 1], ['ramp', 2]].forEach(([n, u]) => gl.uniform1i(this.decide.u(n), u));
    gl.uniform1i(this.decide.u('edgeGlyph'), at(EDGE));
    gl.useProgram(this.drawer);
    [['s0', 0], ['s1', 1], ['s2', 2], ['atlas', 3]].forEach(([n, u]) => gl.uniform1i(this.drawer.u(n), u));
    gl.uniform1f(this.drawer.u('glyphs'), GLYPHS.length);
    this.layoutFor = '';
  }
  set(on) { this.on = on && this.ok; this.cv.style.display = this.on ? 'block' : 'none'; }

  /** The glyph atlas, every glyph in a row, white on black, at twice the drawn size (they are turned). */
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
    gl.generateMipmap(gl.TEXTURE_2D);   // drawn at half its size or less: without mipmaps thin strokes vanish
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  /** The lattice for this screen: its step in source pixels, and the state textures sized to it. */
  layout(w, h, gw, gh) {
    const W = this.src.width, H = this.src.height, gl = this.gl;
    this.cell = [(gw * 1.0) / (w / W), (gh * 0.8) / (h / H)];
    this.nx = Math.ceil(W / this.cell[0]); this.ny = Math.ceil(H / this.cell[1]);
    this.spacing = Math.min(this.cell[0], this.cell[1] * 1.5);
    for (const t of this.state) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.nx, this.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    this.state.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Draw the frame in type, over exactly the rectangle the source occupies on the page. */
  draw(time) {
    if (!this.on) return;
    const s = this.src.style, gl = this.gl, dpr = Math.min(3, devicePixelRatio || 1);
    Object.assign(this.cv.style, { left: s.left, top: s.top, width: s.width, height: s.height });
    const cssH = this.src.clientHeight, w = Math.round(this.src.clientWidth * dpr), h = Math.round(cssH * dpr);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    // a character about a 100th of the picture's height: 5–9 CSS pixels, never under 7 device pixels
    // (smaller and a character stops reading as one on a 1× screen)
    const gh = Math.max(7, Math.round((this.glyphCss ?? Math.min(9, Math.max(5, cssH / 100))) * dpr)), gw = Math.max(4, Math.round(gh * 0.62));
    const key = `${w}x${h}@${gh}`;
    if (key !== this.layoutFor) { this.layoutFor = key; this.atlas(gw, gh); this.layout(w, h, gw, gh); }
    const W = this.src.width, H = this.src.height, k = this.classes && this.classes();
    // the frame and its classes
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tSrc);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.src);
    if (!this.blank || this.blank.length !== W * H) this.blank = new Uint8Array(W * H).fill(CLASS.ground);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tCls);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, k || this.blank);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tRamp);
    // the eye: the picture's mean brightness from a 32×18 thumbnail, and an exposure that lifts a dark
    // scene partway toward a daylit one (a night stays a night), eased over a second or so
    const th = (this.thumb ||= Object.assign(document.createElement('canvas'), { width: 32, height: 18 })).getContext('2d', { willReadFrequently: true });
    th.drawImage(this.src, 0, 0, 32, 18);
    const px = th.getImageData(0, 0, 32, 18).data;
    let m = 0; for (let i = 0; i < px.length; i += 4) m += (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
    m /= px.length / 4;
    const want = Math.min(4, Math.max(1, Math.pow(0.32 / Math.max(m, 0.01), 0.75)));
    this.exposure = this.exposure ? this.exposure + (want - this.exposure) * 0.06 : want;
    // DECIDE: one fragment per point
    const D = this.decide;
    gl.useProgram(D); gl.bindVertexArray(D.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.nx, this.ny);
    gl.disable(gl.BLEND);
    gl.uniform2f(D.u('srcSize'), W, H); gl.uniform2f(D.u('cellSrc'), this.cell[0], this.cell[1]); gl.uniform1i(D.u('nx'), this.nx);
    gl.uniform1f(D.u('time'), time % 1000); gl.uniform1f(D.u('spacing'), this.spacing); gl.uniform1f(D.u('exposure'), this.exposure);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // DRAW: a quad per point, reading its state back
    const R = this.drawer;
    gl.useProgram(R); gl.bindVertexArray(R.vao);
    this.state.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.tAtlas);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.012, 0.014, 0.02, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(R.u('srcSize'), W, H); gl.uniform2f(R.u('cellSrc'), this.cell[0], this.cell[1]); gl.uniform1i(R.u('nx'), this.nx);
    gl.uniform2f(R.u('outSize'), w, h); gl.uniform2f(R.u('glyphPx'), gw, gh);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nx * this.ny);
  }
}
