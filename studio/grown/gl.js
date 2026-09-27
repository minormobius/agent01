// gl.js — grown bodies as light, armour and reef as crystal, the medium as a faint haze. WebGL1.
//
// Organs are drawn as their attractors (additive points, a short streak each), bonds as threads of
// points, crystals (armour on the living, reef from the dead) as flat-shaded hexagonal prisms with a
// thin-film sheen, and the medium's veins as dim motes, brighter where there is more mineral.

const PVS = `
attribute vec3 aPos; attribute vec4 aCol;
uniform mat4 uPV; uniform float uSize;
varying vec4 vCol;
void main() { gl_Position = uPV * vec4(aPos, 1.0); gl_PointSize = uSize * aCol.a / gl_Position.w; vCol = aCol; }`;
const PFS = `
precision mediump float;
varying vec4 vCol;
void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard; gl_FragColor = vec4(vCol.rgb * (1.0 - r) * (1.0 - r), 1.0); }`;
const CVS = `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aAge;
uniform mat4 uPV;
varying vec3 vN; varying vec3 vW; varying vec2 vAge;
void main() { vN = aNrm; vW = aPos; vAge = aAge; gl_Position = uPV * vec4(aPos, 1.0); }`;
const CFS = `
precision highp float;
varying vec3 vN; varying vec3 vW; varying vec2 vAge;
uniform vec3 uEye;
void main() {
  vec3 N = normalize(vN), V = normalize(uEye - vW); if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(vec3(0.5, 0.9, 0.35)), H = normalize(L + V);
  float ct = max(0.05, dot(N, V)), d = 120.0 + 380.0 * (1.0 - exp(-vAge.x / 900.0)) + 200.0 * vAge.y;
  vec3 film = 0.5 + 0.5 * cos(12.566 * 2.4 * d * sqrt(1.0 - (1.0 - ct * ct) / 5.76) / vec3(620.0, 540.0, 455.0) + vec3(0.0, 0.4, 0.9));
  vec3 col = mix(vec3(0.6), film, 0.7) * (0.3 + 0.7 * max(0.0, dot(N, L))) + pow(max(0.0, dot(N, H)), 60.0) + pow(1.0 - ct, 4.0) * 0.4;
  col *= 1.0 - smoothstep(120.0, 330.0, length(vW - uEye)) * 0.6;
  gl_FragColor = vec4(col / (1.0 + 0.3 * max(col.r, max(col.g, col.b))) * 1.15, 1.0);
}`;

function program(gl, vs, fs) {
  const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const loc = {};
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const u = gl.getActiveUniform(p, i); loc[u.name] = gl.getUniformLocation(p, u.name); }
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i++) { const a = gl.getActiveAttrib(p, i); loc[a.name] = gl.getAttribLocation(p, a.name); }
  return { p, loc };
}

/** A growable float buffer. */
class Buf { constructor(n) { this.a = new Float32Array(n); this.n = 0; } need(k) { if (this.n + k > this.a.length) { const b = new Float32Array(Math.max(this.a.length * 2, this.n + k)); b.set(this.a.subarray(0, this.n)); this.a = b; } } }

const HC = [0, 1, 2, 3, 4, 5].map((k) => Math.cos((k * Math.PI) / 3)), HS = [0, 1, 2, 3, 4, 5].map((k) => Math.sin((k * Math.PI) / 3));
/** A hexagonal prism with a point: base b, unit direction d, length L, radius r; ages go to aAge. */
export function prism(out, b, d, L, r, spin, age, hue) {
  let ax, ay, az; if (Math.abs(d[1]) < 0.9) { ax = d[2]; ay = 0; az = -d[0]; } else { ax = 0; ay = -d[2]; az = d[1]; }
  const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
  const cx = d[1] * az - d[2] * ay, cy = d[2] * ax - d[0] * az, cz = d[0] * ay - d[1] * ax, top = L - Math.min(r * 1.8, L * 0.45), V = [];
  for (let k = 0; k < 6; k++) {
    const c = HC[k] * Math.cos(spin) - HS[k] * Math.sin(spin), s = HS[k] * Math.cos(spin) + HC[k] * Math.sin(spin);
    for (const [h, rr] of [[0, r * 0.9], [top, r]]) V.push([b[0] + d[0] * h + (ax * c + cx * s) * rr, b[1] + d[1] * h + (ay * c + cy * s) * rr, b[2] + d[2] * h + (az * c + cz * s) * rr]);
  }
  const tip = [b[0] + d[0] * L, b[1] + d[1] * L, b[2] + d[2] * L];
  const tri = (A, B, C) => {
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n) || 1;
    out.need(24); for (const P of [A, B, C]) { out.a.set([P[0], P[1], P[2], n[0] / l, n[1] / l, n[2] / l, age, hue], out.n); out.n += 8; }
  };
  for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; tri(V[k * 2], V[k2 * 2], V[k2 * 2 + 1]); tri(V[k * 2], V[k2 * 2 + 1], V[k * 2 + 1]); tri(V[k * 2 + 1], V[k2 * 2 + 1], tip); }
}

export function makeRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true });
  if (!gl) throw new Error('no WebGL');
  const P = program(gl, PVS, PFS), C = program(gl, CVS, CFS), pb = gl.createBuffer(), cb = gl.createBuffer(), rb = gl.createBuffer();
  let reefN = 0;
  return {
    points: new Buf(8 * 60000), crystals: new Buf(8 * 84 * 400), reef: new Buf(8 * 84 * 400),
    /** Upload the reef (it changes rarely). */
    uploadReef() { gl.bindBuffer(gl.ARRAY_BUFFER, rb); gl.bufferData(gl.ARRAY_BUFFER, this.reef.a.subarray(0, this.reef.n), gl.STATIC_DRAW); reefN = this.reef.n / 8; },
    draw(view) {
      const w = canvas.width, h = canvas.height;
      gl.viewport(0, 0, w, h); gl.clearColor(0.016, 0.014, 0.024, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const PV = mul(persp(view.fov, w / h, 0.5, 900), lookAt(view.eye, view.target));
      // crystals: the living's armour (every frame) and the reef
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.useProgram(C.p);
      gl.uniformMatrix4fv(C.loc.uPV, false, PV); gl.uniform3fv(C.loc.uEye, view.eye);
      gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.bufferData(gl.ARRAY_BUFFER, this.crystals.a.subarray(0, this.crystals.n), gl.STREAM_DRAW);
      for (const [buf, n] of [[cb, this.crystals.n / 8], [rb, reefN]]) {
        if (!n) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        for (const [name, k, off] of [['aPos', 3, 0], ['aNrm', 3, 12], ['aAge', 2, 24]]) { gl.enableVertexAttribArray(C.loc[name]); gl.vertexAttribPointer(C.loc[name], k, gl.FLOAT, false, 32, off); }
        gl.drawArrays(gl.TRIANGLES, 0, n);
      }
      for (const name of ['aPos', 'aNrm', 'aAge']) gl.disableVertexAttribArray(C.loc[name]);
      // light: organs, bonds, the medium (additive; hidden behind crystal)
      gl.useProgram(P.p); gl.uniformMatrix4fv(P.loc.uPV, false, PV); gl.uniform1f(P.loc.uSize, h * 0.3);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, this.points.a.subarray(0, this.points.n), gl.STREAM_DRAW);
      gl.enableVertexAttribArray(P.loc.aPos); gl.vertexAttribPointer(P.loc.aPos, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(P.loc.aCol); gl.vertexAttribPointer(P.loc.aCol, 4, gl.FLOAT, false, 28, 12);
      gl.drawArrays(gl.POINTS, 0, this.points.n / 7);
      gl.disableVertexAttribArray(P.loc.aPos); gl.disableVertexAttribArray(P.loc.aCol);
      gl.depthMask(true); gl.disable(gl.BLEND);
    },
  };
}

function persp(fov, a, n, f) { const t = 1 / Math.tan(fov / 2); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]; }
function lookAt(e, c) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); }, cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = nrm(sub(e, c)), x = nrm(cr([0, 1, 0], z)), y = cr(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
}
function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
