// The sheet as a fragment shader. Strokes no longer land on the visible canvas:
// Paper draws them, exactly as before, onto an offscreen PIGMENT LAYER that
// starts white, so each pixel holds the light the ink lets through and nothing
// else. This pass then lays that layer into a procedural sheet of paper.
//
// Why a separate pass at all: on a real sheet the paper and the pigment
// interact, and a 2D canvas can only stack them. Painting the grain under the
// strokes was the honest best the old renderer could do; these are the four
// things it could not:
//
//   1. GRANULATION. Pigment settles into the valleys of the tooth, so the grain
//      shows MORE where the ink is dense, not uniformly everywhere. Absorbance
//      is scaled by valley depth, mean-preserving, so the sheet's overall weight
//      (and the 0.18 nibAlpha decision in paper.js) is unchanged.
//   2. POOLED EDGES. Where a mark is wide enough to pool, pigment migrates to its
//      rim as it dries. Unsharp mask in absorbance space, A + E·(A − blur A),
//      gated by Ab/A so a hairline (whose blur is mostly paper) is left alone
//      and only masses and the wet-on-wet halos get a rim.
//   3. FEATHERING. Ink wicks a little way along the paper's fibres: the mark is
//      the darker of itself and a tap displaced along the local fibre direction.
//   4. A SHEET THAT DOES NOT TILE. The old tooth was a 96px tile of white noise,
//      and at a full sheet the repeat was visible. Here the tooth is fbm plus
//      oriented fibres, hashed from the sheet's seed, lit from the upper left.
//
// The blur for (2) is the pigment texture's own mip chain: one textureLod, no
// extra pass. Everything here is render-only. The simulation never sees it and
// the stroke log is untouched, so all three of ink's invariants hold.
//
// Y is flipped exactly once, at the upload (UNPACK_FLIP_Y), so texture v and
// gl_FragCoord.y agree; test/wash.browser.selftest.mjs probes that orientation.

const VS = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_pig;
uniform vec2 u_res;       // device px
uniform float u_dpr;
uniform vec3 u_paper;     // 0..1
uniform uint u_seed;
uniform float u_grain;    // paper: tooth, granulation, feathering
uniform float u_bleed;    // wetness: pooled edges
out vec4 o;

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float h2(ivec2 c) { return float(pcg(uint(c.x) + pcg(uint(c.y) + u_seed))) * (1.0 / 4294967296.0); }
float vnoise(vec2 p) {
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(h2(i), h2(i + ivec2(1, 0)), u.x), mix(h2(i + ivec2(0, 1)), h2(i + ivec2(1, 1)), u.x), u.y);
}
// n octaves, each rotated and doubled. The tooth asks for few: an octave finer
// than a pixel does not add texture, it aliases into white-noise sandpaper.
float fbm(vec2 p, int n) {
  const mat2 R = mat2(1.6, 1.2, -1.2, 1.6);
  float s = 0.0, a = 0.5, w = 0.0;
  for (int i = 0; i < n; i++) { s += a * vnoise(p); w += a; p = R * p; a *= 0.5; }
  return s / w;
}
vec3 absorb(vec3 t) { return -log(max(t, vec3(1.0 / 1024.0))); }

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  // CSS px, y down like the 2D canvas, so the paper's scale is physical rather
  // than tied to the screen's pixel density
  vec2 q = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_dpr;

  // ---- the sheet: fibre direction, tooth height, mottling ----
  float th = fbm(q / 70.0 + 31.0, 3) * 6.2831853;
  vec2 fdir = vec2(cos(th), sin(th));
  mat2 toF = mat2(fdir.x, -fdir.y, fdir.y, fdir.x);
  float fibre = vnoise(toF * q * vec2(0.07, 0.45) + 17.0);
  float h = 0.65 * fbm(q / 3.5, 3) + 0.35 * fibre;       // 0 = valley, 1 = crest
  float valley = 1.0 - h;
  float mottle = fbm(q / 150.0 + 7.0, 4) - 0.5;

  // ---- feathering: wick along the fibre ----
  vec2 fd = fdir * (0.35 + 1.2 * vnoise(q * 0.6 + 3.0)) * u_grain * u_dpr / u_res;
  vec3 T = texture(u_pig, uv).rgb;
  vec3 Tw = texture(u_pig, uv + vec2(fd.x, -fd.y)).rgb;
  T = min(T, mix(vec3(1.0), Tw, 0.6));
  vec3 A = absorb(T);

  // ---- pooled edges, only where the mark is wide enough to pool ----
  vec3 Ab = absorb(textureLod(u_pig, uv, 1.6 + log2(u_dpr)).rgb);
  vec3 wide = smoothstep(vec3(0.3), vec3(0.75), Ab / (A + 1e-3));
  A += u_bleed * 0.9 * max(A - Ab, 0.0) * wide;

  // ---- granulation: pigment settles in the valleys (mean factor 1) ----
  // A pen line barely granulates; a wash does. Gating on the same width test as
  // the rim keeps hairlines whole instead of breaking them into dashes.
  float gw = 0.2 + 0.8 * dot(wide, vec3(1.0 / 3.0));
  A *= mix(1.0, 0.55 + 0.9 * valley, 0.8 * u_grain * gw);

  // ---- the paper itself, lit from the upper left ----
  float lit = 1.0 + u_grain * 0.12 * u_dpr * (dFdy(h) - dFdx(h));
  vec3 paper = u_paper * (1.0 + 0.07 * mottle) * (1.0 - u_grain * 0.05 * valley) * lit;

  vec3 c = paper * exp(-A);
  // interleaved-gradient dither, so the mottling does not band at 8 bits
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  o = vec4(c + (ign - 0.5) / 255.0, 1.0);
}`;

const cache = new WeakMap();

export class Wash {
  // One Wash per canvas, for the page's lifetime: a Paper is rebuilt on every
  // repaint, and recompiling (or worse, re-requesting a context) each time would
  // leak. Returns null when WebGL2 is unavailable or the canvas already holds a
  // 2D context; the caller then draws the old way.
  //
  // The program is built on a throwaway canvas first. A canvas keeps the first
  // context type it hands out, so taking webgl2 on the real one and THEN finding
  // the shader will not compile would leave it unable to give the 2D fallback
  // its context, and the page would draw nothing at all.
  static on(canvas) {
    if (cache.has(canvas)) return cache.get(canvas);
    let w = null;
    try {
      const pc = document.createElement('canvas');
      const pg = pc.getContext('webgl2');
      if (pg) {
        new Wash(pc, pg);
        pg.getExtension('WEBGL_lose_context')?.loseContext();
        const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false });
        if (gl) w = new Wash(canvas, gl);
      }
    } catch { w = null; }
    cache.set(canvas, w);
    return w;
  }

  constructor(canvas, gl) {
    this.cv = canvas;
    this.gl = gl;
    this.layer = document.createElement('canvas');
    this.sheet = null;
    this._init();
    if (!this.ok) throw new Error('wash: shader did not build');
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; });
    canvas.addEventListener('webglcontextrestored', () => { this._init(); this.present(); });
  }

  _init() {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('wash: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('wash: ' + gl.getProgramInfoLog(p));
    gl.useProgram(p);
    this.u = {};
    for (const n of ['u_pig', 'u_res', 'u_dpr', 'u_paper', 'u_seed', 'u_grain', 'u_bleed']) this.u[n] = gl.getUniformLocation(p, n);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.uniform1i(this.u.u_pig, 0);
    this.ok = true;
  }

  // A fresh, white pigment layer at the canvas's pixel size, plus the sheet's
  // look. Called once per Paper.
  begin(sheet) {
    this.sheet = sheet;
    const L = this.layer;
    L.width = this.cv.width;
    L.height = this.cv.height;
    const ctx = L.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, L.width, L.height);
    return ctx;
  }

  // Upload the pigment layer and composite. Called after every batch of strokes.
  present() {
    if (!this.ok || !this.sheet) return;
    const gl = this.gl, s = this.sheet, W = this.cv.width, H = this.cv.height;
    gl.viewport(0, 0, W, H);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.layer);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.uniform2f(this.u.u_res, W, H);
    gl.uniform1f(this.u.u_dpr, s.dpr);
    gl.uniform3f(this.u.u_paper, s.paper[0] / 255, s.paper[1] / 255, s.paper[2] / 255);
    gl.uniform1ui(this.u.u_seed, s.seed >>> 0);
    gl.uniform1f(this.u.u_grain, s.grain);
    gl.uniform1f(this.u.u_bleed, s.bleed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
