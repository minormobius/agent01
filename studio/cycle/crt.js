// crt.js — the picture as a cathode-ray tube would have shown it: a WebGL pass over the finished 640×360
// frame, drawn at the screen's own resolution on a canvas laid over the page's. The source canvas is a
// texture; per screen pixel the shader finds the source row (each of the 360 lines is a beam's sweep,
// brighter lines spreading wider, as a real beam blooms), filters softly along the line, multiplies an
// aperture-grille mask (red, green, blue stripes, as a Trinitron), curves the glass, adds the glow of the
// phosphor and a slight misconvergence, darkens the corners, and flickers a hair. The index-buffer art
// underneath is untouched: this is only how it is shown. Off by default; `crt=1` in the link.
const VS = `attribute vec2 p; varying vec2 v; void main() { v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `
precision highp float;
varying vec2 v;
uniform sampler2D src;
uniform vec2 srcSize;       // 640, 360
uniform vec2 outSize;       // device pixels
uniform float time;
vec3 lin(vec3 c) { return c * c; }                 // near enough gamma 2 for a glow
vec3 fetch(vec2 uv) { return lin(texture2D(src, uv).rgb); }
void main() {
  // the glass: a gentle barrel, the edges falling away
  vec2 q = v * 2.0 - 1.0;
  q *= 1.0 + 0.035 * dot(q, q) * vec2(0.9, 1.1);
  vec2 uv = q * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  uv.y = 1.0 - uv.y;
  // the line this pixel lies on, and how far from its middle
  float row = uv.y * srcSize.y, fy = fract(row) - 0.5;
  vec2 c = vec2(uv.x, (floor(row) + 0.5) / srcSize.y);
  float px = 1.0 / srcSize.x;
  // along the line: a soft filter, the guns a fraction of a pixel out of register
  vec3 col;
  col.r = (fetch(c + vec2(-0.6 * px, 0.0)).r * 0.6 + fetch(c + vec2(0.4 * px, 0.0)).r * 0.4);
  col.g = (fetch(c).g * 0.6 + fetch(c + vec2(0.5 * px, 0.0)).g * 0.2 + fetch(c - vec2(0.5 * px, 0.0)).g * 0.2);
  col.b = (fetch(c + vec2(0.6 * px, 0.0)).b * 0.6 + fetch(c - vec2(0.4 * px, 0.0)).b * 0.4);
  // the beam: a gaussian across the line, wider where it is bright
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  float sigma = mix(0.2, 0.36, clamp(lum * 1.4, 0.0, 1.0));
  float beam = exp(-fy * fy / (2.0 * sigma * sigma));
  // a beam needs pixels to be drawn: under ~3 device pixels a line it aliases into moiré rings against the
  // curved glass, so the lines fade in with the room the screen has for them
  float room = clamp((outSize.y / srcSize.y - 1.8) / 2.0, 0.0, 1.0);
  col *= mix(1.15, beam * 1.55, room);
  // the phosphor's glow: a wide soft blur of the picture added back
  vec3 glow = vec3(0.0);
  for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) glow += fetch(uv + vec2(float(i) * 2.5, float(j) * 2.5) / srcSize);
  col += glow / 25.0 * 0.22;
  // the aperture grille: a stripe of each gun, three device pixels to a triad (only when there is room)
  float k = clamp((outSize.x / srcSize.x - 1.5) / 2.0, 0.0, 1.0);
  float m = mod(gl_FragCoord.x, 3.0);
  vec3 mask = m < 1.0 ? vec3(1.12, 0.82, 0.82) : m < 2.0 ? vec3(0.82, 1.12, 0.82) : vec3(0.82, 0.82, 1.12);
  col *= mix(vec3(1.0), mask, 0.8 * k);
  // the corners darker, a hair of flicker, a slow roll of brightness up the screen
  float vig = smoothstep(1.25, 0.35, length(q * vec2(0.85, 1.0)));
  col *= vig * (0.985 + 0.015 * sin(time * 57.0)) * (0.97 + 0.03 * sin(uv.y * 6.0 - time * 1.3));
  gl_FragColor = vec4(sqrt(max(col, 0.0)), 1.0);
}`;

export class CRT {
  constructor(src, parent) {
    this.src = src;
    const cv = (this.cv = document.createElement('canvas'));
    Object.assign(cv.style, { position: 'absolute', pointerEvents: 'none', display: 'none' });
    parent.append(cv);
    const gl = (this.gl = cv.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false }));
    this.ok = !!gl;
    if (!gl) return;
    const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
    this.u = { srcSize: gl.getUniformLocation(pr, 'srcSize'), outSize: gl.getUniformLocation(pr, 'outSize'), time: gl.getUniformLocation(pr, 'time') };
    this.on = false;
  }
  set(on) { this.on = on && this.ok; this.cv.style.display = this.on ? 'block' : 'none'; }
  /** Draw the source canvas through the tube, over exactly the rectangle it occupies on the page. */
  draw(time) {
    if (!this.on) return;
    const s = this.src.style, gl = this.gl, dpr = Math.min(2, devicePixelRatio || 1);
    Object.assign(this.cv.style, { left: s.left, top: s.top, width: s.width, height: s.height });
    const w = Math.round(this.src.clientWidth * dpr), h = Math.round(this.src.clientHeight * dpr);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    gl.viewport(0, 0, w, h);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.src);
    gl.uniform2f(this.u.srcSize, this.src.width, this.src.height);
    gl.uniform2f(this.u.outSize, w, h);
    gl.uniform1f(this.u.time, time % 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
