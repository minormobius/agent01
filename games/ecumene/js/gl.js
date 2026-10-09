/* Ecumene — the ground, in WebGL.

   Every zone is a triangle fan: its site in the middle, its Voronoi corners
   round it. A corner takes the AVERAGE colour of the zones of its own kind
   that meet there (land with land, sea with sea), so biomes run smoothly
   across the tiles while the coast stays a crisp line; a city's districts
   keep flat colours, so its grain still shows. Normals come from the
   heights, exaggerated, averaged per corner: the light falls on ridges and
   valleys, not on tiles. The fragment shader adds a fine texture to the
   land (rock in the mountains, fields in the plains, faded in as you zoom)
   and does the sea: depth from shelf to abyss, waves that move, and the
   sun's glint.

   Same projection as the 2D view (js/view.js): orthographic, one rotation R,
   radius in pixels. The 2D canvas sits on top for everything with edges:
   rivers, lines, labels, borders, a city's seams. If WebGL isn't there,
   the 2D view draws the ground itself, as it always did. */

const VS = `
attribute vec3 aP; attribute vec3 aN; attribute vec3 aC; attribute float aK;
uniform mat3 uR; uniform vec2 uS;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vK; varying float vZ;
void main() {
  vec3 v = uR * aP;
  vP = aP; vN = aN; vC = aC; vK = aK; vZ = v.z;
  gl_Position = vec4(v.x * uS.x, v.y * uS.y, -v.z * 0.5, 1.0);
}`;
const FS = `
precision highp float;
varying vec3 vP; varying vec3 vN; varying vec3 vC; varying float vK; varying float vZ;
uniform mat3 uR; uniform float uT; uniform float uZoom;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  vec3 n = normalize(uR * vN), L = normalize(vec3(-0.45, 0.55, 0.7));
  float limb = smoothstep(0.0, 0.25, vZ);
  if (vK > 0.5 && vK < 1.5) {               // the sea
    vec3 p = vP * 260.0;
    float w1 = noise(p * 1.0 + vec3(uT * 0.25, 0.0, uT * 0.18));
    float w2 = noise(p * 2.7 - vec3(0.0, uT * 0.35, uT * 0.1));
    float w3 = mix(0.5, noise(p * 9.0 + vec3(uT * 0.6)), clamp(uZoom / 6.0, 0.0, 1.0));
    float w = 0.5 * w1 + 0.3 * w2 + 0.2 * w3;
    vec3 nn = normalize(n + 0.10 * vec3(w - 0.5, w2 - 0.5, 0.0));
    float diff = max(dot(nn, L), 0.0);
    float spec = pow(max(dot(nn, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 160.0) * 0.22;
    vec3 col = vC * (0.62 + 0.45 * diff) + spec + vec3(0.03, 0.05, 0.06) * smoothstep(0.7, 0.85, w);
    gl_FragColor = vec4(col * (0.55 + 0.45 * limb), 1.0);
    return;
  }
  float diff = max(dot(n, L), 0.0);
  float fine = clamp((uZoom - 2.0) / 10.0, 0.0, 1.0);
  float tex = 0.6 * noise(vP * 900.0) + 0.4 * mix(0.5, noise(vP * 4000.0), fine);
  vec3 col = vC * (0.18 + 1.1 * diff) * (0.9 + 0.2 * tex);
  col = mix(vec3(dot(col, vec3(0.3, 0.59, 0.11))), col, 1.2);   // a little more colour
  col = col * (1.0 + col / 2.2) / (1.0 + col);                     // and the snow doesn't blow out
  if (vK > 1.5) col = vC * (0.55 + 0.45 * diff);   // a lake: flat water
  gl_FragColor = vec4(col * (0.55 + 0.45 * limb), 1.0);
}`;

export class GLGround {
  static create(canvas) {
    const gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false }) || canvas.getContext("experimental-webgl");
    if (!gl) return null;
    const g = new GLGround(); g.cv = canvas; g.gl = gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    try {
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      g.pr = pr;
    } catch (e) { console.warn("ecumene: WebGL ground off:", e.message); return null; }
    g.loc = { P: gl.getAttribLocation(g.pr, "aP"), N: gl.getAttribLocation(g.pr, "aN"), C: gl.getAttribLocation(g.pr, "aC"), K: gl.getAttribLocation(g.pr, "aK"),
      R: gl.getUniformLocation(g.pr, "uR"), S: gl.getUniformLocation(g.pr, "uS"), T: gl.getUniformLocation(g.pr, "uT"), Z: gl.getUniformLocation(g.pr, "uZoom") };
    g.buf = gl.createBuffer(); g.count = 0;
    return g;
  }
  /* Build the fans. colorOf(i) → [r, g, b] in 0..1 for zone i; flat(i) keeps
     a zone's own colour at its corners (a city's districts, the towns layer).
     elev: Float32Array per zone (0..1 above the sea, negative-ish below). */
  build(s, world, colorOf, flat, elev, exag) {
    const gl = this.gl, V = s.verts, nv = V.length / 3, n = s.n;
    // the zones meeting at each corner, by kind
    const cs = new Float32Array(nv * 3 * 2), cc = new Float32Array(nv * 2), ce = new Float32Array(nv), ec = new Float32Array(nv);
    const kind = new Uint8Array(n), col = new Array(n);
    for (let i = 0; i < n; i++) {
      kind[i] = s.land[i] ? (world.water[s.geo[i]] === 2 ? 2 : 0) : 1;
      col[i] = colorOf(i);
      const k = kind[i] === 1 ? 1 : 0;
      for (let m = s.off[i]; m < s.off[i + 1]; m++) {
        const v = s.ring[m], c = col[i];
        cs[6 * v + 3 * k] += c[0]; cs[6 * v + 3 * k + 1] += c[1]; cs[6 * v + 3 * k + 2] += c[2]; cc[2 * v + k]++;
        ce[v] += elev[i]; ec[v]++;
      }
    }
    // heights at corners and centres → exaggerated positions → normals averaged per corner
    const hz = (i) => Math.max(0, elev[i]) * exag, hv = (v) => Math.max(0, ce[v] / Math.max(1, ec[v])) * exag;
    const nrmV = new Float32Array(nv * 3), nrmZ = new Float32Array(n * 3);
    const pos = (x, y, z, h) => [x * (1 + h), y * (1 + h), z * (1 + h)];
    for (let i = 0; i < n; i++) {
      const a = s.off[i], b = s.off[i + 1], L = b - a; if (L < 3) continue;
      const C = pos(s.P[3 * i], s.P[3 * i + 1], s.P[3 * i + 2], hz(i));
      for (let m = 0; m < L; m++) {
        const u = s.ring[a + m], w = s.ring[a + (m + 1) % L];
        const A = pos(V[3 * u], V[3 * u + 1], V[3 * u + 2], hv(u)), B = pos(V[3 * w], V[3 * w + 1], V[3 * w + 2], hv(w));
        const e1 = [A[0] - C[0], A[1] - C[1], A[2] - C[2]], e2 = [B[0] - C[0], B[1] - C[1], B[2] - C[2]];
        let N = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (N[0] * C[0] + N[1] * C[1] + N[2] * C[2] < 0) N = [-N[0], -N[1], -N[2]];
        for (let q = 0; q < 3; q++) { nrmZ[3 * i + q] += N[q]; nrmV[3 * u + q] += N[q]; nrmV[3 * w + q] += N[q]; }
      }
    }
    const unit = (A, k) => { const l = Math.hypot(A[3 * k], A[3 * k + 1], A[3 * k + 2]) || 1; return [A[3 * k] / l, A[3 * k + 1] / l, A[3 * k + 2] / l]; };
    // the fans: 3 vertices a triangle, 10 floats a vertex
    let tri = 0; for (let i = 0; i < n; i++) if (s.off[i + 1] - s.off[i] >= 3) tri += s.off[i + 1] - s.off[i];
    const data = new Float32Array(tri * 3 * 10);
    let o = 0;
    const put = (x, y, z, N, c, k) => { data[o++] = x; data[o++] = y; data[o++] = z; data[o++] = N[0]; data[o++] = N[1]; data[o++] = N[2]; data[o++] = c[0]; data[o++] = c[1]; data[o++] = c[2]; data[o++] = k; };
    for (let i = 0; i < n; i++) {
      const a = s.off[i], b = s.off[i + 1], L = b - a; if (L < 3) continue;
      const k = kind[i], kk = k === 1 ? 1 : 0, own = col[i], keep = flat(i) || k === 2;
      // the centre's normal: the mean of its corners', so a fan has no crease at its middle
      const sum = [0, 0, 0]; for (let m = a; m < b; m++) { const q = unit(nrmV, s.ring[m]); sum[0] += q[0]; sum[1] += q[1]; sum[2] += q[2]; }
      const ls = Math.hypot(...sum) || 1, Nc = [sum[0] / ls, sum[1] / ls, sum[2] / ls];
      const cornerC = (v) => keep || !cc[2 * v + kk] ? own : [cs[6 * v + 3 * kk] / cc[2 * v + kk], cs[6 * v + 3 * kk + 1] / cc[2 * v + kk], cs[6 * v + 3 * kk + 2] / cc[2 * v + kk]];
      const cornerN = (v) => (k === 0 ? unit(nrmV, v) : [V[3 * v], V[3 * v + 1], V[3 * v + 2]]);
      for (let m = 0; m < L; m++) {
        const u = s.ring[a + m], w = s.ring[a + (m + 1) % L];
        put(s.P[3 * i], s.P[3 * i + 1], s.P[3 * i + 2], k === 0 ? Nc : [s.P[3 * i], s.P[3 * i + 1], s.P[3 * i + 2]], own, k);
        put(V[3 * u], V[3 * u + 1], V[3 * u + 2], cornerN(u), cornerC(u), k);
        put(V[3 * w], V[3 * w + 1], V[3 * w + 2], cornerN(w), cornerC(w), k);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.count = tri * 3;
  }
  resize(w, h, dpr) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.w = w; this.h = h; }
  draw(R, radius, t, zoom) {
    const gl = this.gl; if (!this.count) return;
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.useProgram(this.pr);
    // uR maps model → view; GLSL mat3 is column-major, R is row-major
    gl.uniformMatrix3fv(this.loc.R, false, new Float32Array([R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]));
    gl.uniform2f(this.loc.S, 2 * radius / this.w, 2 * radius / this.h);
    gl.uniform1f(this.loc.T, t); gl.uniform1f(this.loc.Z, zoom);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const st = 40;
    gl.enableVertexAttribArray(this.loc.P); gl.vertexAttribPointer(this.loc.P, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(this.loc.N); gl.vertexAttribPointer(this.loc.N, 3, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(this.loc.C); gl.vertexAttribPointer(this.loc.C, 3, gl.FLOAT, false, st, 24);
    gl.enableVertexAttribArray(this.loc.K); gl.vertexAttribPointer(this.loc.K, 1, gl.FLOAT, false, st, 36);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
  }
}
