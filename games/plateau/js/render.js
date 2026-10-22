/* PLATEAU's renderer: one fragment shader that ray-traces your 3D slice of
   the 4D foam from behind your eyes, the way Foam⁴'s does a box of it.

   A ray starts in the cell you're in and steps membrane to membrane: it
   leaves a cell where it first crosses a bisector with one of the 80 seeds
   round it (a linear equation along the ray), so the cells are exact. The
   seeds are hashed exactly as flight.js hashes them, with the same field
   (scale, jitter, which cells are solid), so what you see is what the
   collision test measures:
     the edges (where three cells meet) are drawn as tubes of the collision
     radius, glowing, warmer the nearer they are
     a solid cell is opaque; the one you're in never is
     the membranes are faint glass, fogging into the distance */

const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float; precision highp int;
uniform float uScale, uJitter, uSolid; uniform uint uSeed;
uniform vec4 uP, uR, uU, uF; uniform vec4 uHere;
uniform vec2 uRes; uniform float uTan, uFar, uEdge, uTime, uFlash;
out vec4 frag;

uint hashU(ivec4 g, uint k) {
  uvec4 u = uvec4(g + 1024);
  uint n = (u.x * 73856093u) ^ (u.y * 19349663u) ^ (u.z * 83492791u) ^ (u.w * 2654435761u) ^ (k * 374761393u);
  n ^= n >> 16u; n *= 0x7feb352du; n ^= n >> 15u; n *= 0x846ca68bu; n ^= n >> 16u;
  return n;
}
uint remix(uint n, uint s) { uint m = n ^ s; m ^= m >> 16u; m *= 0x7feb352du; m ^= m >> 15u; m *= 0x846ca68bu; m ^= m >> 16u; return m; }
uint baseOf(vec4 g) { return remix(hashU(ivec4(g), 0u), uSeed); }
vec4 seedOf(vec4 g) {
  uint n = baseOf(g);
  vec4 j = vec4(float(remix(n, 0x9e3779b9u)), float(remix(n, 0x3c6ef372u)), float(remix(n, 0xdaa66d2bu)), float(remix(n, 0x78dde6e4u))) / 4294967296.0;
  return uScale * (g + 0.5 + uJitter * (j - 0.5));
}
bool solidCell(vec4 g) { return !all(equal(g, uHere)) && float(remix(baseOf(g), 0x5bd1e995u)) / 4294967296.0 < uSolid; }
vec4 nb(vec4 g, int j) { int k = j < 40 ? j : j + 1; return g + vec4(float(k % 3) - 1.0, float((k / 3) % 3) - 1.0, float((k / 9) % 3) - 1.0, float(k / 27) - 1.0); }
vec3 to3(vec4 v) { return vec3(dot(v, uR), dot(v, uF), dot(v, uU)); } // view space: x right, y forward, z up

vec4 nearestCell(vec4 p) {
  vec4 g0 = floor(p / uScale), best = g0; vec4 s = seedOf(g0); float bd = dot(p - s, p - s);
  for (int j = 0; j < 80; j++) { vec4 g = nb(g0, j), t = seedOf(g); float e = dot(p - t, p - t); if (e < bd) { bd = e; best = g; } }
  return best;
}
/* how near x, on the face of the cell of seed s that faces neighbour skip (unit normal m, in view
   space), is to the face's rim, measured IN the face: a bisector j cuts the face along a line, and x's
   distance to it is its distance to j's plane over the sine of the angle between them. The least of these
   is exactly the distance to the rim (the face is convex), and a plane nearly parallel to the face, which
   never cuts it near x, counts for nothing. .x the distance; .yzw the direction in the face it grows in */
vec4 rimDist(vec4 g, vec4 s, vec4 x, int skip, vec3 m) {
  vec4 r = vec4(1e9, 0.0, 0.0, 0.0);
  for (int j = 0; j < 80; j++) {
    if (j == skip) continue;
    vec4 sn = seedOf(nb(g, j)), n = sn - s; vec3 n3 = to3(n); float L = length(n3); if (L < 1e-5) continue;
    vec3 u = n3 / L; float c = dot(u, m), sn2 = 1.0 - c * c; if (sn2 < 1e-4) continue;
    float d = (0.5 * (dot(sn, sn) - dot(s, s)) - dot(x, n)) / L / sqrt(sn2);
    if (d < r.x) r = vec4(d, -(u - c * m) / sqrt(sn2));
  }
  return r;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  vec3 rd = normalize(vec3(uv.x * uTan, 1.0, uv.y * uTan));
  vec4 d4 = rd.x * uR + rd.y * uF + rd.z * uU, o4 = uP;
  vec3 bg = mix(vec3(0.01, 0.015, 0.03), vec3(0.04, 0.06, 0.11), smoothstep(-0.6, 0.8, rd.z));
  vec3 L = normalize(vec3(-0.35, -0.5, 0.8));
  vec4 g = uHere;
  vec3 acc = vec3(0.0); float A = 0.0, t = 0.0, px = 2.0 * uTan / uRes.y;
  for (int step = 0; step < 30; step++) {
    vec4 s = seedOf(g);
    float best = 1e9; int bj = -1;
    for (int j = 0; j < 80; j++) {
      vec4 sn = seedOf(nb(g, j)), n = sn - s;
      float den = dot(d4, n); if (den <= 1e-7) continue;
      float tj = (0.5 * (dot(sn, sn) - dot(s, s)) - dot(o4, n)) / den;
      if (tj > t + 1e-5 && tj < best) { best = tj; bj = j; }
    }
    if (bj < 0 || best > uFar) break;
    vec4 ng = nb(g, bj), x = o4 + d4 * best, n4 = seedOf(ng) - s;
    vec3 n3 = normalize(to3(n4)); if (dot(n3, rd) > 0.0) n3 = -n3;
    float fog = exp(-best * 2.2 / uFar);
    // the rim as a tube: a line in the face, its width on screen the tube's (radius uEdge at distance best),
    // never under a pixel. The distance's rate per pixel is worked out exactly, so the width is the same
    // whatever the face's tilt: the rim stays a line, never a slab
    vec4 rim = rimDist(g, s, x, bj, n3);
    vec3 G = best * (rim.yzw - n3 * dot(rim.yzw, rd) / dot(n3, rd)); G -= rd * dot(G, rd);
    float e = rim.x / max(px * length(G), 1e-7); // the distance to the rim, in pixels
    float hw = max(0.7, uEdge / (best * px)); // the tube's half-width in pixels
    float core = 1.0 - smoothstep(hw - 0.7, hw + 0.7, e), halo = exp(-max(e - hw, 0.0) / (1.5 + 0.25 * hw)) * 0.3 * (1.0 - core);
    float round = 0.45 + 0.75 * sqrt(max(0.0, 1.0 - (e / hw) * (e / hw))); // lit like a tube: brightest along its axis
    vec3 heat = mix(vec3(1.0, 0.5, 0.25), vec3(0.4, 0.8, 1.0), smoothstep(0.5, 3.0, best)); // near edges run hot
    if (solidCell(ng)) { // a solid cell: opaque
      vec3 c = vec3(0.62, 0.36, 0.5) * (0.35 + 0.65 * max(dot(n3, L), 0.0)) + 0.06;
      c = mix(c, heat * 1.3 * round, core) + heat * halo * 0.5;
      acc += (1.0 - A) * mix(bg, c, fog); A = 1.0; break;
    }
    float a = min(1.0, 0.035 + 0.85 * core + 0.6 * halo);
    vec3 c = mix(vec3(0.3, 0.42, 0.6) * (0.5 + 0.5 * max(dot(n3, L), 0.0)), heat * mix(1.6, 1.4 * round, core), min(1.0, core + halo));
    acc += (1.0 - A) * a * mix(bg, c, fog); A += (1.0 - A) * a;
    if (A > 0.97) break;
    g = ng; t = best;
  }
  vec3 col = acc + (1.0 - A) * bg;
  col = mix(col, vec3(1.0, 0.3, 0.2), uFlash);
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
    gl.useProgram(p);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ["uScale", "uJitter", "uSolid", "uSeed", "uP", "uR", "uU", "uF", "uHere", "uRes", "uTan", "uFar", "uEdge", "uTime", "uFlash"]) this.u[n] = gl.getUniformLocation(p, n);
  }
  /* f: { field: { scale, jitter, solid }, seed, craft (P, R, U, F), here (the grid cell you're in), far, edge, flash } */
  draw(f, scale) {
    const gl = this.gl, c = this.canvas, u = this.u;
    const w = Math.max(1, Math.round(c.clientWidth * scale)), h = Math.max(1, Math.round(c.clientHeight * scale));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform1f(u.uScale, f.field.scale); gl.uniform1f(u.uJitter, f.field.jitter); gl.uniform1f(u.uSolid, f.field.solid); gl.uniform1ui(u.uSeed, f.seed >>> 0);
    gl.uniform4fv(u.uP, f.craft.P); gl.uniform4fv(u.uR, f.craft.R); gl.uniform4fv(u.uU, f.craft.U); gl.uniform4fv(u.uF, f.craft.F);
    gl.uniform4fv(u.uHere, f.here);
    gl.uniform2f(u.uRes, w, h); gl.uniform1f(u.uTan, 0.62); gl.uniform1f(u.uFar, f.far); gl.uniform1f(u.uEdge, f.edge);
    gl.uniform1f(u.uTime, f.time || 0); gl.uniform1f(u.uFlash, f.flash || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
