// ascii.js — the landscape set in type: a WebGL pass over the finished 640×360 frame, on a canvas laid
// over the page's, like crt.js. The screen is cut into character cells; each cell shows one glyph in the
// colour of what it covers, on a dark ground.
//
// The rule the colour cycling taught (scene.js): a look must be AUTHORED for the picture, not squeezed
// onto it. A plain ASCII filter picks a glyph by brightness alone and every surface turns into the same
// sand of @#%. Here the renderer already knows what each pixel IS (the painting's layer map, the flight's
// kind buffer), so each material has its own vocabulary, dark to bright. Under the type lies the picture
// itself, darkened: the tone is carried by that, so the glyphs are TEXTURE, never a wall of @#&:
//
//   sky    ' .`.:-+*'      sparse: an empty sky is mostly the ground showing
//   star   a sky cell much brighter than its neighbours: . + *
//   cloud  ' .`:-~=+'      soft, and never outlined: a cloud has no edge
//   water  ' .,-~~=='      the palette's cycling moves brightness through it, so the waves travel
//   fall   ' .:;|!I#'      the waterfall, foam and surf
//   rock   ' .:;=+%#'      ranges, cliffs, snow
//   tree   ' .,;^Aa%'
//   ground ' .,:;-=+'      meadow, sand, the flight's land
//   built  ' .:-+[]#'      the cabin, the lighthouse, the city
//
// and where a cell straddles two materials (a ridge on the sky, a shore, a roofline) it draws the EDGE
// instead: _ / | \ along the boundary's direction, so silhouettes are lines of type, the way a person
// drawing in ASCII would draw them. The index-buffer art underneath is untouched. `ascii=1` in the link.
//
// Only the 95 printable ASCII characters: anything else falls back to another font on a phone, at
// another width, and the grid breaks.

export const CLASS = { sky: 0, cloud: 1, water: 2, fall: 3, rock: 4, tree: 5, ground: 6, built: 7 };
export const RAMPS = [
  ' .`.:-+*',      // sky (bright sky: the sun's disc and the glow round it)
  ' .`:-~=+',      // cloud: soft, never an outline
  ' .,-~~==',      // water
  ' .:;|!I#',      // fall
  ' .:;=+%#',      // rock
  ' .,;^Aa%',      // tree
  ' .,:;-=+',      // ground
  ' .:-+[]#',      // built
];
const EDGES = '_/|\\';
const STARS = '.+*';
// every glyph once, in atlas order
export const GLYPHS = [...new Set([...RAMPS.join(''), ...EDGES, ...STARS])];
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

const VS = `attribute vec2 p; varying vec2 v; void main() { v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `
precision highp float;
varying vec2 v;
uniform sampler2D src, cls, atlas, ramp;
uniform vec2 srcSize, outSize, cell;   // cell: its size in device pixels
uniform float glyphs, time, bg;
// a texel of the class map, as a class number
float classAt(vec2 uv) { return floor(texture2D(cls, uv).r * 255.0 + 0.5); }
// the class an edge is looked for in: a cloud counts as sky, so clouds get no outline
float edgeClass(vec2 uv) { float k = classAt(uv); return k == 1.0 ? 0.0 : k; }
vec3 colAt(vec2 uv) { return texture2D(src, uv).rgb; }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 frag = vec2(gl_FragCoord.x, outSize.y - gl_FragCoord.y);   // y down, as the source
  vec2 id = floor(frag / cell), inCell = (frag - id * cell) / cell;
  vec2 c0 = (id + 0.5) * cell / outSize;                         // the cell's middle, in uv
  vec2 h = 0.32 * cell / outSize;                                 // a little short of its edges
  // the cell's colour: its middle and four points round it
  vec3 col = (colAt(c0) * 2.0 + colAt(c0 + vec2(-h.x, -h.y)) + colAt(c0 + vec2(h.x, -h.y)) + colAt(c0 + vec2(-h.x, h.y)) + colAt(c0 + vec2(h.x, h.y))) / 6.0;
  float L = lum(col);
  // what the cell is, and whether a boundary crosses it (and which way)
  float k = classAt(c0);
  float kl = edgeClass(c0 - vec2(h.x, 0.0)), kr = edgeClass(c0 + vec2(h.x, 0.0));
  float ku = edgeClass(c0 - vec2(0.0, h.y)), kd = edgeClass(c0 + vec2(0.0, h.y));
  float gx = (kl != kr ? 1.0 : 0.0), gy = (ku != kd ? 1.0 : 0.0);
  // diagonals: a boundary running corner to corner
  float a = edgeClass(c0 + vec2(-h.x, -h.y)), b = edgeClass(c0 + vec2(h.x, h.y)), cc = edgeClass(c0 + vec2(h.x, -h.y)), d = edgeClass(c0 + vec2(-h.x, h.y));
  float g1 = a != b ? 1.0 : 0.0, g2 = cc != d ? 1.0 : 0.0;
  // inside one material, a hard step in brightness is an edge too (snow on a brown ridge, a lit face
  // against a shadowed one): the same four tests on luminance, for land only
  if (k >= 4.0 && gx + gy + g1 + g2 < 0.5) {
    float T = 0.28;
    gx = abs(lum(colAt(c0 - vec2(h.x, 0.0))) - lum(colAt(c0 + vec2(h.x, 0.0)))) > T ? 1.0 : 0.0;
    gy = abs(lum(colAt(c0 - vec2(0.0, h.y))) - lum(colAt(c0 + vec2(0.0, h.y)))) > T ? 1.0 : 0.0;
    g1 = abs(lum(colAt(c0 + vec2(-h.x, -h.y))) - lum(colAt(c0 + vec2(h.x, h.y)))) > T ? 1.0 : 0.0;
    g2 = abs(lum(colAt(c0 + vec2(h.x, -h.y))) - lum(colAt(c0 + vec2(-h.x, h.y)))) > T ? 1.0 : 0.0;
  }
  float glyph;
  if (gx + gy + g1 + g2 > 0.5 && k != 2.0) {
    // an edge: _ when the boundary is level, | when it stands, / or \\ on a slope. A level boundary
    // changes top to bottom; a standing one left to right; '/' separates the top-left corner from the
    // bottom-right, '\\' the top-right from the bottom-left. (Water draws no edges: a shore is drawn
    // from the land side, and the lake's mirrored ridges would double every line.)
    float e = gy > 0.5 && gx < 0.5 ? 0.0 : gx > 0.5 && gy < 0.5 ? 2.0 : (g1 > 0.5 && g2 < 0.5 ? 1.0 : g2 > 0.5 && g1 < 0.5 ? 3.0 : (gy > 0.5 ? 0.0 : 2.0));
    glyph = texture2D(ramp, vec2((e + 0.5) / 8.0, 8.5 / 10.0)).r * 255.0;
    col = max(col, vec3(L * 1.1));                               // a line reads lighter than its fill
    L = max(L, 0.45);
  } else {
    // the ramp level, dithered per cell by a fixed hash: a flat field (sand, an open sky) becomes a mix
    // of neighbouring glyphs, the way a hand would vary them, instead of a grid of one character
    float n = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
    float level = clamp(floor(pow(L, 0.9) * 6.3 + 0.5 + (n - 0.5) * 1.3), 0.0, 7.0);
    if (k == 0.0) {
      // a star: a sky cell brighter than the sky round it
      float around = (lum(colAt(c0 + vec2(-2.5 * h.x, 0.0))) + lum(colAt(c0 + vec2(2.5 * h.x, 0.0))) + lum(colAt(c0 + vec2(0.0, -2.5 * h.y))) + lum(colAt(c0 + vec2(0.0, 2.5 * h.y)))) / 4.0;
      float peak = max(max(lum(colAt(c0 + vec2(-h.x, 0.0))), lum(colAt(c0 + vec2(h.x, 0.0)))), max(lum(colAt(c0)), max(lum(colAt(c0 + vec2(0.0, -h.y))), lum(colAt(c0 + vec2(0.0, h.y))))));
      float s = peak - around;
      if (s > 0.06) { glyph = texture2D(ramp, vec2((clamp(floor(s * 12.0), 0.0, 2.0) + 0.5) / 8.0, 9.5 / 10.0)).r * 255.0; col = max(col, vec3(peak)); L = max(L, 0.5); }
      else glyph = texture2D(ramp, vec2((level + 0.5) / 8.0, (k + 0.5) / 10.0)).r * 255.0;
    } else {
      // water and the fall shimmer: a step up or down the ramp now and then, moving with the flow
      if (k == 2.0) level = clamp(level + floor(0.5 + 0.6 * sin(id.x * 0.9 + id.y * 2.3 - time * 2.1)), 0.0, 7.0);
      if (k == 3.0) level = clamp(level + floor(0.5 + 0.6 * sin(id.y * 1.7 - time * 6.0 + id.x * 3.1)), 0.0, 7.0);
      glyph = texture2D(ramp, vec2((level + 0.5) / 8.0, (k + 0.5) / 10.0)).r * 255.0;
    }
  }
  // the glyph's coverage at this pixel, from the atlas (one row of glyphs)
  float cover = texture2D(atlas, vec2((glyph + inCell.x) / glyphs, inCell.y)).r;
  // the ink is the cell's own colour, lifted toward full brightness; the ground under the type is the
  // picture itself much darker, so a blue sky is still blue and the type is what carries the detail
  vec3 ink = mix(col, col / max(0.2, max(col.r, max(col.g, col.b))), 0.45) * 1.08;
  vec3 ground = colAt(vec2(frag.x, frag.y) / outSize) * bg;   // the picture itself, darkened, pixel by pixel
  gl_FragColor = vec4(mix(ground, ink, cover), 1.0);
}`;

export class ASCII {
  /**
   * src: the 640×360 canvas. parent: where the overlay goes. classes(): a Uint8Array W×H of CLASS
   * values for the current frame (or null: everything is ground).
   */
  constructor(src, parent, classes) {
    this.src = src; this.classes = classes;
    const cv = (this.cv = document.createElement('canvas'));
    Object.assign(cv.style, { position: 'absolute', pointerEvents: 'none', display: 'none' });
    parent.append(cv);
    const gl = (this.gl = cv.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false }));
    this.ok = !!gl;
    this.on = false;
    if (!gl) return;
    const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = (unit, filter) => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [p, val] of [[gl.TEXTURE_MIN_FILTER, filter], [gl.TEXTURE_MAG_FILTER, filter], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, val);
      return t;
    };
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.tSrc = tex(0, gl.LINEAR); this.tCls = tex(1, gl.NEAREST); this.tAtlas = tex(2, gl.LINEAR); this.tRamp = tex(3, gl.NEAREST);
    // the ramp table: 10 rows of 8 glyph indices (8 classes, the edges, the stars)
    const rt = new Uint8Array(8 * 10);
    RAMPS.forEach((r, k) => [...r].forEach((ch, i) => { rt[k * 8 + i] = at(ch); }));
    [...EDGES].forEach((ch, i) => { rt[8 * 8 + i] = at(ch); });
    [...STARS].forEach((ch, i) => { rt[9 * 8 + i] = at(ch); });
    gl.activeTexture(gl.TEXTURE3);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 8, 10, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, rt);
    for (const [name, unit] of [['src', 0], ['cls', 1], ['atlas', 2], ['ramp', 3]]) gl.uniform1i(gl.getUniformLocation(pr, name), unit);
    this.u = Object.fromEntries(['srcSize', 'outSize', 'cell', 'glyphs', 'time', 'bg'].map((n) => [n, gl.getUniformLocation(pr, n)]));
    this.atlasFor = 0;
    this.clsBuf = null;
  }
  set(on) { this.on = on && this.ok; this.cv.style.display = this.on ? 'block' : 'none'; }

  /** The glyph atlas: every glyph in a row, white on black, drawn at the cell's own size so it is crisp. */
  atlas(cw, ch) {
    const key = cw * 1000 + ch;
    if (this.atlasFor === key) return;
    this.atlasFor = key;
    const c = document.createElement('canvas'); c.width = cw * GLYPHS.length; c.height = ch;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${Math.round(ch * 0.86)}px ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace`;
    GLYPHS.forEach((s, i) => g.fillText(s, i * cw + cw / 2, ch * 0.54));
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  }

  /** Draw the frame in type, over exactly the rectangle the source occupies on the page. */
  draw(time) {
    if (!this.on) return;
    const s = this.src.style, gl = this.gl, dpr = Math.min(2, devicePixelRatio || 1);
    Object.assign(this.cv.style, { left: s.left, top: s.top, width: s.width, height: s.height });
    const w = Math.round(this.src.clientWidth * dpr), h = Math.round(this.src.clientHeight * dpr);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    // about 150 columns across whatever the screen, never smaller than 7 device pixels; a cell is a
    // character's proportions (1 : 1.8)
    const cw = Math.max(7 * Math.min(dpr, 1.5), Math.round(w / 150)), ch = Math.round(cw * 1.8);
    this.atlas(cw, ch);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tSrc);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.src);
    const k = this.classes && this.classes();
    const W = this.src.width, H = this.src.height;
    if (!this.clsBuf || this.clsBuf.length !== W * H) this.clsBuf = new Uint8Array(W * H).fill(CLASS.ground);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tCls);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, W, H, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, k || this.clsBuf);
    gl.uniform2f(this.u.srcSize, W, H);
    gl.uniform2f(this.u.outSize, w, h);
    gl.uniform2f(this.u.cell, cw, ch);
    gl.uniform1f(this.u.glyphs, GLYPHS.length);
    gl.uniform1f(this.u.time, time % 1000);
    gl.uniform1f(this.u.bg, 0.3);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
