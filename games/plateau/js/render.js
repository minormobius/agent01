/* PLATEAU's renderer: one fragment shader that ray-traces your 3D slice of
   the 4D foam from behind your eyes, the way Foam⁴'s does a box of it.

   A ray starts in the cell you're in and steps membrane to membrane: it
   leaves a cell where it first crosses a bisector with one of the 80 seeds
   round it (a linear equation along the ray), so the cells are exact. The
   seeds come from flight.js itself (Foam.rand, kept in a texture round you), with the same field
   (scale, jitter, which cells are solid), so what you see is what the
   collision test measures:
     the edges (where three cells meet) are drawn as tubes of the collision
     radius, glowing, warmer the nearer they are
     a solid cell is opaque; the one you're in never is
     the membranes are faint glass, fogging into the distance */

const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const M = 26; // the seed texture holds a 26⁴ window of grid cells, addressed by g mod 26 (a ray needs ±11 round you, in a lattice's own coordinates)

/* the fragment shader for a mode: the tesseract foam's is the grid itself; a lattice mode multiplies by its
   basis (uB) and reads its few extra neighbours (uExtra: the offsets beyond the 80 that its melt can make
   neighbours, flight.js's MODES[mode].extra) */
const fsFor = (lattice, nx) => `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uRand, uSolidR; // per grid cell: where its seed sits (rgba) and when it turns solid (r), from flight.js
uniform float uScale, uJitter, uSolid;
uniform vec4 uP, uR, uU, uF; uniform vec4 uHere;
uniform vec2 uRes; uniform float uTan, uFar, uEdge, uFlash;
uniform mat4 uB; uniform vec4 uExtra[${Math.max(1, nx)}];
out vec4 frag;
const float M = ${M}.0;

/* the j-th of the 80 grid offsets round a cell, computed. A constant table indexed in the loop measured
   2-3 times slower (some GPUs keep such tables in memory), and four nested loops were slower too */
vec4 nbo(int j) { int k = j < 40 ? j : j + 1; return vec4(float(k % 3) - 1.0, float((k / 3) % 3) - 1.0, float((k / 9) % 3) - 1.0, float(k / 27) - 1.0); }
ivec2 texel(vec4 g) { vec4 m = g - M * floor(g / M); return ivec2(int(m.x + M * m.y), int(m.z + M * m.w)); }
vec4 nb(int j) { ${nx ? "return j < 80 ? nbo(j) : uExtra[j - 80];" : "return nbo(j);"} }
vec4 seedOf(vec4 g) { vec4 k = g + 0.5 + uJitter * (texelFetch(uRand, texel(g), 0) - 0.5); return uScale * ${lattice ? "(uB * k)" : "k"}; }
bool solidCell(vec4 g) { return !all(equal(g, uHere)) && texelFetch(uSolidR, texel(g), 0).r < uSolid; }
vec3 to3(vec4 v) { return vec3(dot(v, uR), dot(v, uF), dot(v, uU)); } // view space: x right, y forward, z up

/* how near x, on the face of the cell g (seed s) that faces neighbour skip (unit normal m, in view space),
   is to the face's rim, measured IN the face: a bisector j cuts the face along a line, and x's distance to
   it is its distance to j's plane over the sine of the angle between them. The least of these is exactly
   the distance to the rim (the face is convex), and a plane nearly parallel to the face, which never cuts
   it near x, counts for nothing. .x the distance; .yzw the direction in the face it grows in.
   The march below does this for free for every face it passes through (the face's rim seen from the far
   cell, whose planes it is reading anyway); this is for the one it stops at, a solid cell's */
vec4 rimFrom(vec4 g, vec4 s, vec4 x, int skip, vec3 m) {
  vec4 r = vec4(1e9, 0.0, 0.0, 0.0);
  for (int j = 0; j < ${80 + nx}; j++) {
    if (j == skip) continue;
    vec4 sn = seedOf(g + nb(j)), n = sn - s; vec3 n3 = to3(n); float L = length(n3); if (L < 1e-5) continue;
    vec3 u = n3 / L; float c = dot(u, m), q = 1.0 - c * c; if (q < 1e-4) continue;
    float iq = inversesqrt(q), d = (0.5 * (dot(sn, sn) - dot(s, s)) - dot(x, n)) / L * iq;
    if (d < r.x) r = vec4(d, -(u - c * m) * iq);
  }
  return r;
}

/* one face hit, at distance best along the ray: a membrane (faint glass) or a solid cell (opaque), with its
   rim drawn as a tube: a line in the face, its width on screen the tube's (radius uEdge at distance best),
   never under a pixel. The distance's rate per pixel is worked out exactly, so the width is the same
   whatever the face's tilt: the rim stays a line, never a slab */
void shade(inout vec3 acc, inout float A, vec3 bg, vec3 rd, float px, float best, vec3 n3, vec4 rim, bool solid) {
  vec3 L = normalize(vec3(-0.35, -0.5, 0.8));
  float fog = exp(-best * 2.2 / uFar);
  vec3 G = best * (rim.yzw - n3 * dot(rim.yzw, rd) / dot(n3, rd)); G -= rd * dot(G, rd);
  float e = rim.x / max(px * length(G), 1e-7); // the distance to the rim, in pixels
  float hw = max(0.7, uEdge / (best * px)); // the tube's half-width in pixels
  float core = 1.0 - smoothstep(hw - 0.7, hw + 0.7, e), halo = exp(-max(e - hw, 0.0) / (1.5 + 0.25 * hw)) * 0.3 * (1.0 - core);
  float round = 0.45 + 0.75 * sqrt(max(0.0, 1.0 - (e / hw) * (e / hw))); // lit like a tube: brightest along its axis
  vec3 heat = mix(vec3(1.0, 0.5, 0.25), vec3(0.4, 0.8, 1.0), smoothstep(0.5, 3.0, best)); // near edges run hot
  if (solid) {
    vec3 c = vec3(0.62, 0.36, 0.5) * (0.35 + 0.65 * max(dot(n3, L), 0.0)) + 0.06;
    c = mix(c, heat * 1.3 * round, core) + heat * halo * 0.5;
    acc += (1.0 - A) * mix(bg, c, fog); A = 1.0; return;
  }
  float a = min(1.0, 0.035 + 0.85 * core + 0.6 * halo);
  vec3 c = mix(vec3(0.3, 0.42, 0.6) * (0.5 + 0.5 * max(dot(n3, L), 0.0)), heat * mix(1.6, 1.4 * round, core), min(1.0, core + halo));
  acc += (1.0 - A) * a * mix(bg, c, fog); A += (1.0 - A) * a;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  vec3 rd = normalize(vec3(uv.x * uTan, 1.0, uv.y * uTan));
  vec4 d4 = rd.x * uR + rd.y * uF + rd.z * uU, o4 = uP;
  vec3 bg = mix(vec3(0.01, 0.015, 0.03), vec3(0.04, 0.06, 0.11), smoothstep(-0.6, 0.8, rd.z));
  vec3 acc = vec3(0.0); float A = 0.0, t = 0.0, px = 2.0 * uTan / uRes.y;
  // the march: in each cell, one pass over the 80 seeds round it finds where the ray leaves (the nearest
  // bisector ahead) AND the rim of the face it came in through, at the entry point (that face is one of
  // this cell's too, bounded by this cell's planes), so the face is shaded a step late, for nothing
  vec4 g = uHere, gp = uHere; vec3 mp = vec3(0.0, 1.0, 0.0); bool pend = false;
  for (int step = 0; step <= 30; step++) {
    vec4 s = seedOf(g); float ss = dot(s, s), best = 1e9; int bj = -1; vec4 rim = vec4(1e9, 0.0, 0.0, 0.0);
    for (int j = 0; j < ${80 + nx}; j++) {
      vec4 gn = g + nb(j), sn = seedOf(gn), n = sn - s;
      float v0 = 0.5 * (dot(sn, sn) - ss) - dot(o4, n), den = dot(d4, n); // the plane's value at the eye, and its rate along the ray
      if (den > 1e-7) { float tj = v0 / den; if (tj > t + 1e-5 && tj < best) { best = tj; bj = j; } }
      if (pend && any(notEqual(gn, gp))) {
        vec3 n3 = to3(n); float Ln = length(n3);
        if (Ln > 1e-5) {
          vec3 u = n3 / Ln; float c = dot(u, mp), q = 1.0 - c * c;
          if (q > 1e-4) { float iq = inversesqrt(q), d = (v0 - t * den) / Ln * iq; if (d < rim.x) rim = vec4(d, -(u - c * mp) * iq); }
        }
      }
    }
    if (pend) { shade(acc, A, bg, rd, px, t, mp, rim, false); if (A > 0.97) break; }
    if (step == 30 || bj < 0 || best > uFar) break;
    vec4 ng = g + nb(bj);
    vec3 n3 = normalize(to3(seedOf(ng) - s)); if (dot(n3, rd) > 0.0) n3 = -n3;
    if (solidCell(ng)) { shade(acc, A, bg, rd, px, best, n3, rimFrom(g, s, o4 + d4 * best, bj, n3), true); break; }
    pend = true; gp = g; mp = n3; g = ng; t = best;
  }
  vec3 col = acc + (1.0 - A) * bg;
  col = mix(col, vec3(1.0, 0.3, 0.2), uFlash);
  frag = vec4(pow(col, vec3(0.9)), 1.0);
}`;

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) throw new Error("WebGL2 isn't available here");
    this.gl = gl; this.canvas = canvas; this.progs = {};
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // the seed textures: M² × M² texels, (g mod M) laid out as (x + M y, z + M w). The same in every mode:
    // a cell's numbers are the foam's, whatever crystal they're read against
    const tex = (unit, fmt) => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, M * M, M * M);
      return t;
    };
    this.randTex = tex(0, gl.RGBA32F); this.solidTex = tex(1, gl.R32F);
    this.lo = null; this.seed = null;
    this.prog(null); // the tesseract foam's, now: a shader error shows at once
  }
  /* the program for a foam's mode, compiled the first time it's needed */
  prog(foam) {
    const key = foam ? foam.mode : "tesseract"; if (this.progs[key]) return this.progs[key];
    const gl = this.gl, B = foam && foam.B, extra = (foam && foam.neigh.slice(80)) || [];
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsFor(!!B, extra.length))); gl.bindAttribLocation(p, 0, "aPos"); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (const n of ["uRand", "uSolidR", "uScale", "uJitter", "uSolid", "uP", "uR", "uU", "uF", "uHere", "uRes", "uTan", "uFar", "uEdge", "uFlash", "uB", "uExtra"]) u[n] = gl.getUniformLocation(p, n);
    gl.useProgram(p); this.cur = p;
    gl.uniform1i(u.uRand, 0); gl.uniform1i(u.uSolidR, 1);
    if (B) gl.uniformMatrix4fv(u.uB, false, B.flat()); // B's rows are the basis vectors: GL's columns
    if (extra.length) gl.uniform4fv(u.uExtra, extra.flat());
    return (this.progs[key] = { p, u });
  }
  /* keep the window of grid cells round gc (your grid cell) in the textures: a new foam fills it whole, and
     moving refills only the strips that came into it. The numbers are flight.js's own (foam.rand) */
  sync(foam, gc) {
    const R = 12; // a ray reaches its cells' neighbours within ±11 cells of yours (the selftest measures it in every crystal); one spare
    const want = gc.map((v, a) => (this.lo && v - R >= this.lo[a] && v + R <= this.lo[a] + M - 1 ? this.lo[a] : v - R - 1));
    if (this.seed !== foam.seed || !this.lo || want.some((v, a) => Math.abs(v - this.lo[a]) >= M)) { // a new foam, or a jump: all of it
      this.seed = foam.seed; this.lo = want; this.rect(foam, 0, 0, M * M, M * M); return;
    }
    for (let a = 0; a < 4; a++) {
      const lo = this.lo[a]; if (want[a] === lo) continue;
      this.lo[a] = want[a]; // the strips that came in, with the other axes' windows as they are (a later axis refills its own)
      const fresh = []; for (let v = want[a]; v < want[a] + M; v++) if (v < lo || v >= lo + M) fresh.push(v);
      for (const v of fresh) {
        const m = ((v % M) + M) % M;
        if (a === 0) for (let y = 0; y < M; y++) this.rect(foam, m + M * y, 0, 1, M * M);
        else if (a === 1) this.rect(foam, M * m, 0, M, M * M);
        else if (a === 2) for (let w = 0; w < M; w++) this.rect(foam, 0, m + M * w, M * M, 1);
        else this.rect(foam, 0, M * m, M * M, M);
      }
    }
  }
  /* compute and upload one rectangle of texels: each is the grid cell in the window with those residues */
  rect(foam, X0, Y0, w, h) {
    const gl = this.gl, lo = this.lo, r4 = new Float32Array(w * h * 4), r1 = new Float32Array(w * h), g = [0, 0, 0, 0], out = new Array(5);
    const at = (a, m) => lo[a] + ((((m - lo[a]) % M) + M) % M);
    for (let j = 0, i = 0; j < h; j++) {
      const Y = Y0 + j; g[2] = at(2, Y % M); g[3] = at(3, (Y / M) | 0);
      for (let k = 0; k < w; k++, i++) {
        const X = X0 + k; g[0] = at(0, X % M); g[1] = at(1, (X / M) | 0);
        foam.rand(g, out); r4[4 * i] = out[0]; r4[4 * i + 1] = out[1]; r4[4 * i + 2] = out[2]; r4[4 * i + 3] = out[3]; r1[i] = out[4];
      }
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.randTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, X0, Y0, w, h, gl.RGBA, gl.FLOAT, r4);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.solidTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, X0, Y0, w, h, gl.RED, gl.FLOAT, r1);
  }
  /* f: { foam, field: { scale, jitter, solid }, craft (P, R, U, F), here (the grid cell you're in), far, edge, flash } */
  draw(f, scale) {
    const gl = this.gl, c = this.canvas, P = this.prog(f.foam), u = P.u;
    if (this.cur !== P.p) { gl.useProgram(P.p); this.cur = P.p; }
    this.sync(f.foam, f.foam.cellCoords(f.craft.P, f.field).map(Math.floor));
    const w = Math.max(1, Math.round(c.clientWidth * scale)), h = Math.max(1, Math.round(c.clientHeight * scale));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform1f(u.uScale, f.field.scale); gl.uniform1f(u.uJitter, f.field.jitter); gl.uniform1f(u.uSolid, f.field.solid);
    gl.uniform4fv(u.uP, f.craft.P); gl.uniform4fv(u.uR, f.craft.R); gl.uniform4fv(u.uU, f.craft.U); gl.uniform4fv(u.uF, f.craft.F);
    gl.uniform4fv(u.uHere, f.here);
    gl.uniform2f(u.uRes, w, h); gl.uniform1f(u.uTan, 0.62); gl.uniform1f(u.uFar, f.far); gl.uniform1f(u.uEdge, f.edge);
    gl.uniform1f(u.uFlash, f.flash || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
