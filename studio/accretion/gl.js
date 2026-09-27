// gl.js — the house as crystal and the flow as light. WebGL1, no dependencies.
//
// Every crystal is a hexagonal prism capped with a point, meshed with flat normals so each face catches
// the light on its own. Its colour is its mineral (shell.js MINERALS): a metal's thin-film interference
// (an oxide skin that thickens with age, sampled at three wavelengths, so the hue turns with age and
// with the angle), or a glass's reflections and the flow's light inside it. A crystal is born hot at its
// tip; one long unfed bleaches to bone, like a reef's dead coral. The flow is drawn as additive points,
// twice: brightly where it is in the open, faintly where the crystals hide it (it glows through).

import { MINERALS } from '../vendor/attractor/lib/shell.js';

const VS = `
attribute vec3 aPos; attribute vec3 aNrm; attribute float aBorn; attribute float aFed; attribute float aV;
uniform mat4 uPV; uniform float uS;
varying vec3 vN; varying vec3 vW; varying float vAge; varying float vStarve; varying float vV;
void main() { vN = aNrm; vW = aPos; vAge = uS - aBorn; vStarve = uS - aFed; vV = aV; gl_Position = uPV * vec4(aPos, 1.0); }`;
const FS = `
precision highp float;
varying vec3 vN; varying vec3 vW; varying float vAge; varying float vStarve; varying float vV;
uniform vec3 uEye; uniform vec3 uKey; uniform float uHue; uniform vec3 uFlow; uniform vec3 uCentre;
uniform vec3 uBase; uniform float uIri; uniform float uGlass; uniform float uSpec; uniform vec4 uCut;
vec3 film(float d, float ct) {
  float st = sqrt(1.0 - ct * ct) / 2.4, c = sqrt(1.0 - st * st);
  return 0.5 + 0.5 * cos(12.566 * 2.4 * d * c / vec3(620.0, 540.0, 455.0) + vec3(0.0, 0.4, 0.9));
}
void main() {
  if (dot(vW, uCut.xyz) > uCut.w) discard;                                     // cut open, like a geode
  vec3 N = normalize(vN), V = normalize(uEye - vW);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(uKey), H = normalize(L + V);
  float ct = max(0.04, dot(N, V)), fres = pow(1.0 - ct, 4.0);
  float bleach = smoothstep(250.0, 1100.0, vStarve);
  // metal: the film over the base; glass: the base, dim, lit from inside by the flow
  float d = 90.0 + 300.0 * (1.0 - exp(-vAge / 700.0)) + 220.0 * uHue + 60.0 * vV;
  vec3 metal = mix(uBase, film(d, ct) * (0.4 + 0.6 * uBase * 1.4), uIri);
  float r = length(vW - uCentre), inner = exp(-r * r / 260.0);
  vec3 glass = uBase * 0.25 + uFlow * (0.25 + 0.9 * inner) * (0.3 + 0.7 * vV) * (0.35 + 0.65 * (1.0 - ct));
  float diff = 0.3 + 0.7 * max(0.0, dot(N, L)), hemi = 0.6 + 0.4 * N.y;
  vec3 col = mix(metal * (diff * 0.85 + hemi * 0.3), glass + uBase * diff * 0.3, uGlass);
  col += pow(max(0.0, dot(N, H)), 70.0) * uSpec * (1.0 - 0.6 * bleach) + fres * mix(vec3(0.5, 0.55, 0.65), uFlow, 0.4) * 0.6;
  col = mix(col, vec3(0.8, 0.77, 0.7) * (0.35 + 0.45 * diff), bleach * 0.85);
  col += vec3(1.0, 0.92, 0.8) * 1.4 * exp(-vAge / 30.0) * max(0.0, vV);              // born hot, at the tip
  if (vV < -0.5) {                                                          // the rind: matte rock
    vec3 rock = mix(vec3(0.2, 0.17, 0.15), uBase * 0.35, 0.3) * (0.8 + 0.4 * fract(sin(dot(floor(vW * 1.3), vec3(12.9, 78.2, 37.7))) * 43758.5));
    col = rock * (diff * 0.9 + hemi * 0.25) + fres * 0.08;
    col = mix(col, vec3(0.62, 0.6, 0.56) * (0.3 + 0.5 * diff), bleach * 0.8);
  }
  col *= 1.0 - smoothstep(70.0, 170.0, length(vW - uEye)) * 0.6;
  gl_FragColor = vec4(col / (1.0 + 0.3 * max(col.r, max(col.g, col.b))) * 1.2, 1.0);
}`;
const PVS = `
attribute vec3 aPos; attribute float aB;
uniform mat4 uPV; uniform float uSize;
varying float vB;
void main() { gl_Position = uPV * vec4(aPos, 1.0); gl_PointSize = uSize / gl_Position.w; vB = aB; }`;
const PFS = `
precision mediump float;
varying float vB; uniform vec3 uCol; uniform float uGain;
void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard; gl_FragColor = vec4(uCol * vB * uGain * (1.0 - r) * (1.0 - r), 1.0); }`;

function program(gl, vs, fs) {
  const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const loc = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); loc[u.name] = gl.getUniformLocation(p, u.name); }
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); for (let i = 0; i < na; i++) { const a = gl.getActiveAttrib(p, i); loc[a.name] = gl.getAttribLocation(p, a.name); }
  return { p, loc };
}

export function makeRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: false });
  if (!gl) throw new Error('no WebGL');
  const S = program(gl, VS, FS), P = program(gl, PVS, PFS);
  const pbo = gl.createBuffer(), PER = 84 * 9;            // floats a crystal (84 vertices of 9)
  // two meshes: the reef (crystals away from the creature: they change rarely, re-meshed every few
  // seconds) and the live house round it (re-meshed as it grows). A crystal is in exactly one.
  const parts = { reef: { vbo: gl.createBuffer(), buf: new Float32Array(PER * 1024), nv: 0 }, live: { vbo: gl.createBuffer(), buf: new Float32Array(PER * 1024), nv: 0 } };
  let inReef = new Uint8Array(0), reefEpoch = -1, pts = new Float32Array(4 * 30000);
  const HC = Array.from({ length: 6 }, (_, k) => Math.cos((k * Math.PI) / 3)), HS = Array.from({ length: 6 }, (_, k) => Math.sin((k * Math.PI) / 3));
  const V = new Float32Array(3 * 20);                     // scratch vertices: lo 0–5, hi 6–11, tip 12, rim 13–17, up 18, dn 19

  /** Write crystal i (a hexagonal prism, its point, and a lump of rind at its base) into buf at o. */
  function crystal(C, i, buf, o) {
    const g = C.g, L = C.len[i] + 0.4, dx = C.dir[i * 3], dy = C.dir[i * 3 + 1], dz = C.dir[i * 3 + 2];
    const bx = C.base[i * 3] - dx * 0.4, by = C.base[i * 3 + 1] - dy * 0.4, bz = C.base[i * 3 + 2] - dz * 0.4;
    const r = 0.14 + L * g.girth * 0.5, top = L - Math.min(r * 1.9, L * 0.45);
    // a frame across the crystal
    let ax, ay, az;
    if (Math.abs(dy) < 0.9) { ax = dz; ay = 0; az = -dx; } else { ax = 0; ay = -dz; az = dy; }
    const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
    const cx = dy * az - dz * ay, cy = dz * ax - dx * az, cz = dx * ay - dy * ax;
    const sp = C.spin[i], cs = Math.cos(sp), sn = Math.sin(sp);
    for (let k = 0; k < 6; k++) {
      const c = HC[k] * cs - HS[k] * sn, s2 = HS[k] * cs + HC[k] * sn;
      for (const [slot, h, rr] of [[k, 0, r * 0.92], [k + 6, top, r]]) {
        V[slot * 3] = bx + dx * h + (ax * c + cx * s2) * rr; V[slot * 3 + 1] = by + dy * h + (ay * c + cy * s2) * rr; V[slot * 3 + 2] = bz + dz * h + (az * c + cz * s2) * rr;
      }
    }
    V[36] = bx + dx * L; V[37] = by + dy * L; V[38] = bz + dz * L;
    const rr = r * 2.3 + 0.35, sp2 = sp * 1.7;
    for (let q = 0; q < 5; q++) {
      const jq = 0.7 + 0.6 * (((i * 7919 + q * 104729) % 97) / 97), a = sp2 + (q * 2 * Math.PI) / 5, c = Math.cos(a) * rr * jq, s2 = Math.sin(a) * rr * jq, t = 13 + q;
      V[t * 3] = bx + ax * c + cx * s2 - dx * 0.1; V[t * 3 + 1] = by + ay * c + cy * s2 - dy * 0.1; V[t * 3 + 2] = bz + az * c + cz * s2 - dz * 0.1;
    }
    const jd = 0.5 + 0.3 * (0.7 + 0.6 * (((i * 7919 + 9 * 104729) % 97) / 97));
    V[54] = bx + dx * 0.35; V[55] = by + dy * 0.35; V[56] = bz + dz * 0.35; V[57] = bx - dx * jd; V[58] = by - dy * jd; V[59] = bz - dz * jd;
    const born = C.born[i], fed = C.fedAt[i], vt = top / L;
    const tri = (a, b, c, va, vb, vc) => {
      const e1x = V[b * 3] - V[a * 3], e1y = V[b * 3 + 1] - V[a * 3 + 1], e1z = V[b * 3 + 2] - V[a * 3 + 2], e2x = V[c * 3] - V[a * 3], e2y = V[c * 3 + 1] - V[a * 3 + 1], e2z = V[c * 3 + 2] - V[a * 3 + 2];
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (const [p, v] of [[a, va], [b, vb], [c, vc]]) { buf[o] = V[p * 3]; buf[o + 1] = V[p * 3 + 1]; buf[o + 2] = V[p * 3 + 2]; buf[o + 3] = nx; buf[o + 4] = ny; buf[o + 5] = nz; buf[o + 6] = born; buf[o + 7] = fed; buf[o + 8] = v; o += 9; }
    };
    for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; tri(k, k2, k2 + 6, 0, 0, vt); tri(k, k2 + 6, k + 6, 0, vt, vt); tri(k + 6, k2 + 6, 12, vt, vt, 1); }
    for (let q = 0; q < 5; q++) { const q2 = (q + 1) % 5; tri(13 + q, 13 + q2, 18, -1, -1, -1); tri(13 + q2, 13 + q, 19, -1, -1, -1); }
    return o;
  }
  function fill(part, C, want) {
    let o = 0;
    for (let i = 0; i < C.n; i++) {
      if (!C.alive[i] || !want(i)) continue;
      if (o + PER > part.buf.length) { const b2 = new Float32Array(part.buf.length * 2); b2.set(part.buf); part.buf = b2; }
      o = crystal(C, i, part.buf, o);
    }
    part.nv = o / 9;
    gl.bindBuffer(gl.ARRAY_BUFFER, part.vbo); gl.bufferData(gl.ARRAY_BUFFER, part.buf.subarray(0, o), gl.DYNAMIC_DRAW);
  }
  /** Re-mesh the reef: every crystal outside the creature's box (c, half) at this moment. */
  function meshReef(C, c, half) {
    if (inReef.length < C.cap) inReef = new Uint8Array(C.cap);
    inReef.fill(0);
    for (let i = 0; i < C.n; i++) if (C.alive[i] && (Math.abs(C.base[i * 3] - c[0]) > half || Math.abs(C.base[i * 3 + 1] - c[1]) > half || Math.abs(C.base[i * 3 + 2] - c[2]) > half)) inReef[i] = 1;
    reefEpoch = C.epoch;
    fill(parts.reef, C, (i) => inReef[i]);
  }
  /** Re-mesh the live house (everything the reef mesh doesn't hold). */
  function meshLive(C, c, half) {
    if (reefEpoch !== C.epoch) meshReef(C, c, half);
    fill(parts.live, C, (i) => i >= inReef.length || !inReef[i]);
  }
  const mesh = (C, c, half) => { meshReef(C, c, half); meshLive(C, c, half); };

  /** Draw: `view` { eye, target, fov }, s the (continuous) step, flow points [x,y,z,b]… */
  function draw(view, s, g, flow, nflow, look) {
    const w = canvas.width, h = canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.018, 0.016, 0.026, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const PV = mul(persp(view.fov, w / h, 0.5, 600), lookAt(view.eye, view.target));
    if (look.shell && parts.reef.nv + parts.live.nv) {
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      gl.useProgram(S.p);
      const M = MINERALS[g.mineral] || MINERALS.bismuth;
      gl.uniformMatrix4fv(S.loc.uPV, false, PV); gl.uniform1f(S.loc.uS, s); gl.uniform3fv(S.loc.uEye, view.eye);
      gl.uniform3fv(S.loc.uKey, [0.5, 0.9, 0.35]); gl.uniform1f(S.loc.uHue, g.hue); gl.uniform3fv(S.loc.uFlow, look.flowCol); gl.uniform3fv(S.loc.uCentre, look.centre || view.target);
      gl.uniform3fv(S.loc.uBase, M.base); gl.uniform1f(S.loc.uIri, M.iri); gl.uniform1f(S.loc.uGlass, M.glass); gl.uniform1f(S.loc.uSpec, M.spec);
      // the cut: a plane through the creature, square to the view (the near half is gone)
      const c = look.centre || view.target, n = [view.eye[0] - c[0], 0, view.eye[2] - c[2]], nl = Math.hypot(...n) || 1;
      if (look.cut) gl.uniform4f(S.loc.uCut, n[0] / nl, 0, n[2] / nl, (n[0] * c[0] + n[2] * c[2]) / nl + 1.5); else gl.uniform4f(S.loc.uCut, 0, 0, 0, 1);
      for (const part of [parts.reef, parts.live]) {
        if (!part.nv) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, part.vbo);
        for (const [name, n, off] of [['aPos', 3, 0], ['aNrm', 3, 12], ['aBorn', 1, 24], ['aFed', 1, 28], ['aV', 1, 32]]) { gl.enableVertexAttribArray(S.loc[name]); gl.vertexAttribPointer(S.loc[name], n, gl.FLOAT, false, 36, off); }
        gl.drawArrays(gl.TRIANGLES, 0, part.nv);
      }
      for (const name of ['aPos', 'aNrm', 'aBorn', 'aFed', 'aV']) gl.disableVertexAttribArray(S.loc[name]);
    }
    if (look.flow && nflow) {
      gl.useProgram(P.p); gl.bindBuffer(gl.ARRAY_BUFFER, pbo); gl.bufferData(gl.ARRAY_BUFFER, flow.subarray(0, nflow * 4), gl.STREAM_DRAW);
      gl.enableVertexAttribArray(P.loc.aPos); gl.vertexAttribPointer(P.loc.aPos, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(P.loc.aB); gl.vertexAttribPointer(P.loc.aB, 1, gl.FLOAT, false, 16, 12);
      gl.uniformMatrix4fv(P.loc.uPV, false, PV); gl.uniform3fv(P.loc.uCol, look.flowCol);
      gl.uniform1f(P.loc.uSize, h * 0.3 * look.pointSize);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      if (look.shell) { gl.depthFunc(gl.GREATER); gl.uniform1f(P.loc.uGain, 0.1 * look.xray); gl.drawArrays(gl.POINTS, 0, nflow); }   // behind the crystal: through it
      gl.depthFunc(gl.LEQUAL); gl.uniform1f(P.loc.uGain, 0.55); gl.drawArrays(gl.POINTS, 0, nflow);
      gl.depthMask(true); gl.disable(gl.BLEND);
      gl.disableVertexAttribArray(P.loc.aPos); gl.disableVertexAttribArray(P.loc.aB);
    }
  }
  return { gl, mesh, meshReef, meshLive, draw, get crystals() { return (parts.reef.nv + parts.live.nv) / 84; }, points: (n) => (pts.length < n * 4 ? (pts = new Float32Array(n * 4)) : pts) };
}

// ---- matrices (column-major) ----
function persp(fov, a, n, f) { const t = 1 / Math.tan(fov / 2); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]; }
function lookAt(e, c) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); }, cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = nrm(sub(e, c)), x = nrm(cr([0, 1, 0], z)), y = cr(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
}
function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
