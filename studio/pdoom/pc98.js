// pc98.js — the frame as a PC-98 would have shown it: 400 lines, 16 colours chosen from 4096
// (4 bits a channel), and an ordered 4×4 Bayer dither between them.
//
// The palette is fitted to each frame (k-means on a thumbnail), starting from the last
// frame's, so it follows the stage's colour through the song without flickering. Some
// colours are pinned (`fixed`: the ink, the skin, each dancer's hair), because a fit by area
// gives the dark stage nearly all of them, and a purple fringe a few pixels wide none. Runs as one WebGL2 pass over the
// finished 2D canvas: `makePC98(canvas).draw(source)`.

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform vec3 pal[16]; uniform vec2 cells; uniform float spread;
const float B[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
void main(){
  vec2 cell = floor(uv * cells);
  vec3 c = texture(src, (cell + 0.5) / cells).rgb;
  ivec2 b = ivec2(mod(cell, 4.0));
  c += (B[b.y * 4 + b.x] / 16.0 - 0.47) * spread;
  float best = 1e9; vec3 pick = pal[0];
  for (int i = 0; i < 16; i++) {
    vec3 d = (c - pal[i]) * vec3(0.9, 1.2, 0.7);          // closer to how far apart colours look
    float e = dot(d, d);
    if (e < best) { best = e; pick = pal[i]; }
  }
  o = vec4(pick, 1.0);
}`;

const q4 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 15) / 15;   // 4 bits a channel

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

export function makePC98(canvas, { lines = 400, fixed = ['#12081a'] } = {}) {
  const pinned = fixed.slice(0, 12).map((c) => (typeof c === 'string' ? hex(c) : c).map(q4)), free = 16 - pinned.length;
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const pg = gl.createProgram();
  gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS));
  gl.bindAttribLocation(pg, 0, 'p'); gl.linkProgram(pg);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const tex = gl.createTexture();
  const thumb = document.createElement('canvas'); thumb.width = 96; thumb.height = 54;
  const tctx = thumb.getContext('2d', { willReadFrequently: true });
  let pal = null;

  /** Fit the free colours to the frame, from the last frame's palette; the pinned ones stay. */
  function fit(source) {
    tctx.drawImage(source, 0, 0, thumb.width, thumb.height);
    const px = tctx.getImageData(0, 0, thumb.width, thumb.height).data, n = px.length / 4;
    const pts = new Float32Array(n * 3), w = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) pts[i * 3 + k] = px[i * 4 + k] / 255;
      // the dark stage is most of the frame, and would take most of the colours: weight a pixel by
      // how bright and how coloured it is, so the figures (hair, skin, clothes) keep theirs
      const r = pts[i * 3], g = pts[i * 3 + 1], b = pts[i * 3 + 2];
      w[i] = 0.08 + (Math.max(r, g, b) - Math.min(r, g, b)) + 0.6 * (0.3 * r + 0.59 * g + 0.11 * b);
    }
    let C = pal ? pal.slice(pinned.length).map((c) => [...c]) : Array.from({ length: free }, (_, j) => { const i = Math.floor(((j + 0.5) / free) * n); return [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]]; });
    for (let it = 0, its = pal ? 3 : 10; it < its; it++) {
      const sum = C.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < n; i++) {
        const r = pts[i * 3], g = pts[i * 3 + 1], b = pts[i * 3 + 2];
        // a pixel a pinned colour already draws is not the free colours' to fit
        let best = 1e9, bj = -1;
        for (const c of pinned) { const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2; if (d < best) best = d; }
        for (let j = 0; j < C.length; j++) { const d = (r - C[j][0]) ** 2 + (g - C[j][1]) ** 2 + (b - C[j][2]) ** 2; if (d < best) { best = d; bj = j; } }
        if (bj < 0) continue;
        const s = sum[bj], wi = w[i]; s[0] += r * wi; s[1] += g * wi; s[2] += b * wi; s[3] += wi;
      }
      // an empty cluster takes a pixel from the frame (a colour left behind by the last shot)
      C = C.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : ((i) => [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]])(Math.floor(Math.random() * n))));
    }
    pal = [...pinned, ...C.map((c) => c.map(q4))];
  }

  function draw(source) {
    if (canvas.width !== source.width || canvas.height !== source.height) { canvas.width = source.width; canvas.height = source.height; }
    fit(source);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(pg);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(pg, 'src'), 0);
    gl.uniform3fv(gl.getUniformLocation(pg, 'pal'), pal.flat());
    // 400 lines, and square cells across
    gl.uniform2f(gl.getUniformLocation(pg, 'cells'), Math.round(lines * canvas.width / canvas.height), lines);
    gl.uniform1f(gl.getUniformLocation(pg, 'spread'), 0.14);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return { draw, get palette() { return pal; } };
}
