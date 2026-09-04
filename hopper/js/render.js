// bismuth — the renderer. WebGL1, no dependencies.
//
// The crystal is a voxel set; it is drawn as the exposed faces of its bricks,
// meshed per 16³ chunk so laying a brick re-meshes one chunk, not the world.
// Each vertex carries a baked ambient-occlusion term (the stair-wells go dark
// on their own), the brick's oxide thickness, and the instant it was laid.
//
// The colour is not a palette. It is thin-film interference computed in the
// fragment shader: bismuth's iridescence is a skin of Bi₂O₃ (n ≈ 2.4) over
// the grey metal, and the reflected spectrum of an air/film/metal stack is
// sampled at nine wavelengths, weighted by approximate colour-matching
// curves, and summed — so the hue shifts with the film's thickness AND with
// the viewing angle, the way the real thing does when you turn it in your
// hand. A brick is laid glowing hot and silver; its oxide thickens as it
// cools over the next second or two, and only then does it take its colour.

import { CHUNK, GRID } from "./genome.js";

const G = GRID, C = CHUNK, NC = G / C;
const IDX = (x, y, z) => (z * G + y) * G + x;

const VS = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute float aAO;
attribute float aThick;
attribute float aBorn;
attribute float aGrain;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCenter;
varying vec3 vN;
varying vec3 vP;
varying float vAO;
varying float vThick;
varying float vBorn;
varying float vGrain;
void main() {
  vec3 w = vec3(aPos.x - uCenter.x, aPos.z - uCenter.z, -(aPos.y - uCenter.y));
  vec4 p = uView * vec4(w, 1.0);
  vP = p.xyz;
  vN = mat3(uView) * vec3(aNrm.x, aNrm.z, -aNrm.y);
  vAO = aAO;
  vThick = aThick;
  vBorn = aBorn;
  vGrain = aGrain;
  gl_Position = uProj * p;
}`;

const FS = `
precision highp float;
varying vec3 vN;
varying vec3 vP;
varying float vAO;
varying float vThick;
varying float vBorn;
varying float vGrain;
uniform float uTime;
uniform vec3 uKey;
uniform float uCool;

// approximate CIE-ish colour matching, three lobes per channel is plenty
vec3 cmf(float l) {
  float r = exp(-0.5 * pow((l - 605.0) / 38.0, 2.0)) + 0.32 * exp(-0.5 * pow((l - 445.0) / 22.0, 2.0));
  float g = exp(-0.5 * pow((l - 548.0) / 42.0, 2.0));
  float b = exp(-0.5 * pow((l - 455.0) / 30.0, 2.0));
  return vec3(r, g, b);
}

// reflectance of air | film (n=2.4, thickness d nm) | bismuth, at wavelength l
// r1: air->oxide, r2: oxide->metal (metal reflects strongly, with a phase flip)
float filmR(float d, float cosT, float l) {
  float r1 = -0.41;
  float r2 = 0.50;
  float delta = 4.0 * 3.14159265 * 2.4 * d * cosT / l;
  float c = cos(delta);
  float num = r1 * r1 + r2 * r2 + 2.0 * r1 * r2 * c;
  float den = 1.0 + r1 * r1 * r2 * r2 + 2.0 * r1 * r2 * c;
  return num / den;
}

vec3 film(float d, float cosV) {
  // refract the view angle into the film
  float sinT2 = (1.0 - cosV * cosV) / (2.4 * 2.4);
  float cosT = sqrt(max(0.0, 1.0 - sinT2));
  vec3 acc = vec3(0.0);
  vec3 wsum = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    float l = 400.0 + 37.5 * float(i);
    vec3 w = cmf(l);
    acc += w * filmR(d, cosT, l);
    wsum += w;
  }
  return acc / wsum * 2.0;      // the stack peaks near 0.5; bring that to 1
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(-vP);
  float cosV = clamp(dot(N, V), 0.0, 1.0);
  float age = max(0.0, uTime - vBorn);
  // the oxide grows as the brick cools: silver first, colour after
  float cool = clamp(age / uCool, 0.0, 1.0);
  cool = cool * cool * (3.0 - 2.0 * cool);
  float d = vThick * cool + vGrain;
  vec3 tint = film(d, cosV);
  // deepen the interference colour: the metal underneath is dark grey, the
  // film's reflection is what you see
  float lum = dot(tint, vec3(0.3, 0.59, 0.11));
  tint = clamp(mix(vec3(lum), tint, 1.4), 0.0, 1.2);
  vec3 metal = vec3(0.78, 0.78, 0.80);
  vec3 albedo = mix(metal * 0.6, metal * tint, cool);

  vec3 L = normalize(uKey);
  float ndl = dot(N, L);
  float diff = clamp(ndl * 0.65 + 0.35, 0.0, 1.0);          // wrapped lambert
  vec3 H = normalize(L + V);
  float spec = pow(max(0.0, dot(N, H)), 36.0);
  float fres = pow(1.0 - cosV, 3.0);
  // hemisphere ambient: cool from above, near-black from below
  float up = N.y * 0.5 + 0.5;
  vec3 amb = mix(vec3(0.04, 0.03, 0.035), vec3(0.20, 0.22, 0.28), up);
  float ao = vAO / 3.0;
  ao = 0.18 + 0.82 * ao * ao;

  vec3 col = albedo * (amb * ao + vec3(1.0, 0.96, 0.9) * diff * diff * ao * 1.25);
  col += mix(vec3(1.0), tint, 0.7) * spec * 0.9 * ao;
  col += tint * fres * 0.55 * ao;
  // a fill from the far side, faint and blue, and a rim from below
  vec3 L2 = normalize(vec3(-0.7, 0.1, 0.4));
  col += albedo * vec3(0.22, 0.28, 0.42) * clamp(dot(N, L2), 0.0, 1.0) * 0.6 * ao;

  // the birth glow: molten, then fading
  float glow = exp(-age * 2.2);
  col += (vec3(1.0, 0.58, 0.22) * 1.1 + vec3(0.6, 0.45, 0.3) * glow) * glow;

  // filmic-ish tonemap
  col = col / (col + 0.6) * 1.45;
  col = pow(col, vec3(1.0 / 1.05));
  gl_FragColor = vec4(col, 1.0);
}`;

// flux lines: a position and the field's strength there, relative to the
// applied field — dim and cold where the crystal has expelled the flux,
// warm and bright where it has gathered it
const LVS = `
attribute vec3 aPos;
attribute float aI;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCenter;
varying float vI;
void main() {
  vec3 w = vec3(aPos.x - uCenter.x, aPos.z - uCenter.z, -(aPos.y - uCenter.y));
  gl_Position = uProj * (uView * vec4(w, 1.0));
  vI = aI;
}`;
const LFS = `
precision mediump float;
varying float vI;
void main() {
  float i = vI;
  vec3 cold = vec3(0.16, 0.22, 0.55);
  vec3 even = vec3(0.55, 0.62, 0.9);
  vec3 warm = vec3(1.0, 0.78, 0.35);
  vec3 c = i < 1.0 ? mix(cold, even, clamp(i, 0.0, 1.0)) : mix(even, warm, clamp((i - 1.0) * 0.8, 0.0, 1.0));
  float a = 0.5 + 0.5 * clamp(i * 0.6, 0.0, 1.0);
  gl_FragColor = vec4(c * a, a);
}`;
const PVS = `
attribute vec3 aPos;
attribute float aFade;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCenter;
uniform float uPx;
uniform float uH;
uniform float uSize;
varying float vFade;
void main() {
  vec3 w = vec3(aPos.x - uCenter.x, aPos.z - uCenter.z, -(aPos.y - uCenter.y));
  vec4 p = uView * vec4(w, 1.0);
  gl_Position = uProj * p;
  gl_PointSize = clamp(uPx * 0.9 * uSize * uH / max(1.0, -p.z), 4.0, 48.0) * (0.55 + 0.45 * aFade);
  vFade = aFade;
}`;
// the same sprite in two palettes: warm for masons and beacons, cold for
// the worms (ghosts of the masonry, drawn as a chain of fading motes)
const PFS = `
precision mediump float;
varying float vFade;
uniform vec3 uTint;
uniform vec3 uCore;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  float a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.7, 1.0, r));
  vec3 c = mix(uTint, uCore, exp(-r * r * 14.0));
  gl_FragColor = vec4(c * a * (0.35 + 0.65 * vFade), a * vFade);
}`;

// Props: solid things in the world that are not crystal — the platformer's
// bucket. Same vertex layout as a chunk (so the cubic mesher makes them),
// a flat matte colour with a slow pulse at the rim so it reads from far off.
const RVS = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute float aAO;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCenter;
varying vec3 vN;
varying vec3 vP;
varying float vAO;
void main() {
  vec3 w = vec3(aPos.x - uCenter.x, aPos.z - uCenter.z, -(aPos.y - uCenter.y));
  vec4 p = uView * vec4(w, 1.0);
  vP = p.xyz;
  vN = mat3(uView) * vec3(aNrm.x, aNrm.z, -aNrm.y);
  vAO = aAO;
  gl_Position = uProj * p;
}`;
const RFS = `
precision highp float;
varying vec3 vN;
varying vec3 vP;
varying float vAO;
uniform vec3 uColor;
uniform float uTime;
uniform vec3 uKey;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(-vP);
  float cosV = clamp(dot(N, V), 0.0, 1.0);
  vec3 L = normalize(uKey);
  float diff = clamp(dot(N, L) * 0.6 + 0.4, 0.0, 1.0);
  float up = N.y * 0.5 + 0.5;
  vec3 amb = mix(vec3(0.05, 0.04, 0.05), vec3(0.22, 0.24, 0.30), up);
  float ao = vAO / 3.0;
  ao = 0.25 + 0.75 * ao * ao;
  float pulse = 0.5 + 0.5 * sin(uTime * 2.2);
  float fres = pow(1.0 - cosV, 2.5);
  vec3 col = uColor * (amb * ao + vec3(1.0, 0.96, 0.9) * diff * ao * 1.1);
  col += uColor * (0.25 + 0.75 * pulse) * fres * 1.4;
  col += uColor * 0.18 * pulse;
  col = col / (col + 0.6) * 1.45;
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
  return p;
}

// ------------------------------------------------------------- matrices --
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function lookAt(eye, target, up) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1,
  ]);
}

// face definitions: normal, the four corners (CCW from outside), and for each
// corner the two side offsets + corner offset used for AO
const FACES = [
  { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
const FLOATS = 10;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL unavailable");
    this.prog = program(gl, VS, FS);
    this.pprog = program(gl, PVS, PFS);
    this.lprog = program(gl, LVS, LFS);
    this.lloc = {};
    for (const n of ["aPos", "aI"]) this.lloc[n] = gl.getAttribLocation(this.lprog, n);
    for (const n of ["uProj", "uView", "uCenter"]) this.lloc[n] = gl.getUniformLocation(this.lprog, n);
    this.lbuf = gl.createBuffer();
    this.flux = null;                      // GL_LINES segments [x, y, z, i, x, y, z, i, …] from flux.js, or null
    this.loc = {};
    for (const n of ["aPos", "aNrm", "aAO", "aThick", "aBorn", "aGrain"]) this.loc[n] = gl.getAttribLocation(this.prog, n);
    for (const n of ["uProj", "uView", "uCenter", "uTime", "uKey", "uCool"]) this.loc[n] = gl.getUniformLocation(this.prog, n);
    this.ploc = {};
    for (const n of ["aPos", "aFade"]) this.ploc[n] = gl.getAttribLocation(this.pprog, n);
    for (const n of ["uProj", "uView", "uCenter", "uPx", "uH", "uSize", "uTint", "uCore"]) this.ploc[n] = gl.getUniformLocation(this.pprog, n);
    this.pbuf = gl.createBuffer();
    this.rprog = program(gl, RVS, RFS);
    this.rloc = {};
    for (const n of ["aPos", "aNrm", "aAO"]) this.rloc[n] = gl.getAttribLocation(this.rprog, n);
    for (const n of ["uProj", "uView", "uCenter", "uColor", "uTime", "uKey"]) this.rloc[n] = gl.getUniformLocation(this.rprog, n);
    this.props = null;                     // {buf, count, color}: the world's non-crystal solids
    this.beacons = null;                   // extra motes: [x, y, z, fade] in substrate coordinates
    this.worms = null;                     // worm segments: [x, y, z, fade], drawn cold
    this.ghosts = null;                    // a recorded player's body: [x, y, z, fade], drawn pale
    // first person: {eye: [x, y, z] in substrate coordinates, yaw, pitch, fov}
    // — set by a page that walks the crystal instead of orbiting it
    this.fp = null;

    this.occ = new Uint8Array(G * G * G);
    this.bid = new Int32Array(G * G * G).fill(-1);
    this.chunks = new Map();              // chunk index -> {buf, count}
    this.dirty = new Set();
    this.synced = 0;
    this.growth = null;
    this.born = [];                        // per brick, seconds on the render clock
    this.time = 0;
    this.cool = 1.6;

    // camera
    this.az = 0.78; this.el = 0.55; this.dist = 40;
    this.target = [G / 2, G / 2, G / 2];
    this.center = [G / 2, G / 2, G / 2];
    this.autoSpin = 0.16;
    this.spinVel = 0; this.elVel = 0;
    this.userZoom = 1;
    this.fit = 40;
    this.trails = new Map();
    this.attachInput();
  }

  // ------------------------------------------------------------ crystal --
  setGrowth(growth) {
    this.growth = growth;
    this.kind = growth.sub ? growth.sub.kind : "cubic";
    if (this.kind === "prism") {
      // the prism substrate: sites are (tile, layer); the engine's occupancy
      // is read directly, bricks are identified by the brick id we stamp
      this.pr = growth.sub;
      this.pbid = new Int32Array(this.pr.sites).fill(-1);
      this.NBK = Math.ceil(this.pr.n / 128);
      this._vert = new Int32Array(64);
    } else if (this.kind === "ico") {
      // the icosahedral substrate: sites are rhombohedra, chunks are blocks of 128 in the tiling's spatial order
      this.pr = null;
      this.ico = growth.sub;
      this.pbid = new Int32Array(this.ico.sites).fill(-1);
      this.NBK = Math.ceil(this.ico.n / 128);
    } else {
      this.pr = null;
      this.occ.fill(0);
      this.bid.fill(-1);
    }
    for (const c of this.chunks.values()) this.gl.deleteBuffer(c.buf);
    this.chunks.clear();
    this.dirty.clear();
    this.synced = 0;
    this.syncedRemoved = 0;
    this.born = [];
    this.trails.clear();
    this.userZoom = 1;
  }

  // chunk bookkeeping for one cubic cell and the neighbours whose faces it changes
  dirtyCubic(x, y, z) {
    const id = (cx, cy, cz) => (cz * NC + cy) * NC + cx;
    const cx = x >> 4, cy = y >> 4, cz = z >> 4;
    this.dirty.add(id(cx, cy, cz));
    const lx = x & 15, ly = y & 15, lz = z & 15;
    if (lx === 0) this.dirty.add(id(cx - 1, cy, cz));
    if (lx === 15) this.dirty.add(id(cx + 1, cy, cz));
    if (ly === 0) this.dirty.add(id(cx, cy - 1, cz));
    if (ly === 15) this.dirty.add(id(cx, cy + 1, cz));
    if (lz === 0) this.dirty.add(id(cx, cy, cz - 1));
    if (lz === 15) this.dirty.add(id(cx, cy, cz + 1));
  }
  dirtyPrism(t, z) {
    const pr = this.pr, T = pr.T, NBK = this.NBK;
    const chunkOf = (tt, zz) => (zz >> 4) * NBK + (tt >> 7);
    this.dirty.add(chunkOf(t, z));
    for (let k = T.nbrStart[t]; k < T.nbrStart[t + 1]; k++) this.dirty.add(chunkOf(T.nbrList[k], z));
    // the layers above and below: the same tile on a prism, the overlapped tiles on a stack
    const v = this._vert;
    let m = pr.vertical(t, z, -1, v);
    for (let i = 0; i < m; i++) this.dirty.add(chunkOf(v[i], z - 1));
    m = pr.vertical(t, z, 1, v);
    for (let i = 0; i < m; i++) this.dirty.add(chunkOf(v[i], z + 1));
  }

  // a rhombohedron and everything whose faces or corner occlusion it changes
  dirtyIco(s) {
    const T = this.ico.T;
    this.dirty.add(s >> 7);
    for (let k = T.vnbrStart[s]; k < T.vnbrStart[s + 1]; k++) this.dirty.add(T.vnbrList[k] >> 7);
  }

  // bricks taken away since the last sync (destructible terrain)
  drainRemoved() {
    const rm = this.growth.removed;
    for (let i = this.syncedRemoved; i < rm.length; i++) {
      const s = rm[i];
      if (this.kind === "ico") {
        this.pbid[s] = -1;
        this.dirtyIco(s);
      } else if (this.kind === "prism") {
        this.pbid[s] = -1;
        const t = s % this.pr.n;
        this.dirtyPrism(t, (s - t) / this.pr.n);
      } else {
        this.occ[s] = 0; this.bid[s] = -1;
        const x = s % G, y = ((s - x) / G) % G, z = (s / (G * G)) | 0;
        this.dirtyCubic(x, y, z);
      }
    }
    this.syncedRemoved = rm.length;
  }

  // The brick under a canvas pixel (CSS px), or -1: the camera ray marched
  // through the substrate in small steps. What a click on the crystal means.
  pick(px, py) {
    const cam = this.cam;
    if (!cam) return -1;
    const W = this.canvas.width, H = this.canvas.height, dpr = this.dpr || 1;
    const xn = (px * dpr / W) * 2 - 1, yn = 1 - (py * dpr / H) * 2;
    const f = Math.tan(0.31), aspect = W / Math.max(1, H);
    const dx = xn * f * aspect, dy = yn * f, dz = -1;
    // world direction = dx·right + dy·up − dz·back (the lookAt basis)
    const wx = dx * cam.xaxis[0] + dy * cam.yaxis[0] + dz * cam.zaxis[0];
    const wy = dx * cam.xaxis[1] + dy * cam.yaxis[1] + dz * cam.zaxis[1];
    const wz = dx * cam.xaxis[2] + dy * cam.yaxis[2] + dz * cam.zaxis[2];
    const len = Math.hypot(wx, wy, wz) || 1;
    // world (x, up, −y) + target → substrate coordinates
    const sx = cam.eye[0] + this.target[0], sy = -cam.eye[2] + this.target[1], sz = cam.eye[1] + this.target[2];
    const vx = wx / len, vy = -wz / len, vz = wy / len;
    const sub = this.growth.sub, step = 0.15;
    for (let d = 0; d < 400; d += step) {
      const s = sub.siteAtWorld(sx + vx * d, sy + vy * d, sz + vz * d);
      if (s >= 0 && sub.occ[s]) return s;
    }
    return -1;
  }

  // Pull bricks laid since the last sync. `instant` stamps them as already
  // cold (a replay or a skip), otherwise they are born now.
  sync(instant = false) {
    const br = this.growth.bricks;
    const now = this.time;
    if (this.growth.removed && this.growth.removed.length > this.syncedRemoved) this.drainRemoved();
    if (this.kind === "ico") {
      for (let i = this.synced; i < br.length; i++) {
        const s = br[i].tile;
        this.pbid[s] = i;
        this.born[i] = instant ? now - 60 : now;
        this.dirtyIco(s);
      }
      this.synced = br.length;
      return;
    }
    if (this.kind === "prism") {
      const pr = this.pr, n = pr.n, T = pr.T, NBK = this.NBK;
      const chunkOf = (t, z) => (z >> 4) * NBK + (t >> 7);
      for (let i = this.synced; i < br.length; i++) {
        const b = br[i], t = b.tile, z = b.z;
        this.pbid[z * n + t] = i;
        this.born[i] = instant ? now - 60 : now;
        this.dirtyPrism(t, z);
      }
      this.synced = br.length;
      return;
    }
    for (let i = this.synced; i < br.length; i++) {
      const b = br[i], k = IDX(b.x, b.y, b.z);
      this.occ[k] = 1; this.bid[k] = i;
      this.born[i] = instant ? now - 60 : now;
      this.dirty.add(((b.z >> 4) * NC + (b.y >> 4)) * NC + (b.x >> 4));
      // a brick on a chunk boundary changes its neighbour's exposed faces too
      const lx = b.x & 15, ly = b.y & 15, lz = b.z & 15;
      if (lx === 0) this.dirty.add(((b.z >> 4) * NC + (b.y >> 4)) * NC + ((b.x >> 4) - 1));
      if (lx === 15) this.dirty.add(((b.z >> 4) * NC + (b.y >> 4)) * NC + ((b.x >> 4) + 1));
      if (ly === 0) this.dirty.add(((b.z >> 4) * NC + ((b.y >> 4) - 1)) * NC + (b.x >> 4));
      if (ly === 15) this.dirty.add(((b.z >> 4) * NC + ((b.y >> 4) + 1)) * NC + (b.x >> 4));
      if (lz === 0) this.dirty.add((((b.z >> 4) - 1) * NC + (b.y >> 4)) * NC + (b.x >> 4));
      if (lz === 15) this.dirty.add((((b.z >> 4) + 1) * NC + (b.y >> 4)) * NC + (b.x >> 4));
    }
    this.synced = br.length;
  }

  // Oxide thickness of brick i, nm. Older bricks (laid earlier) carry more —
  // they were hot longer — plus a slow spatial drift and a per-brick grain.
  thickness(i) {
    const b = this.growth.bricks[i];
    // a deployed pack carries its own oxide: each colony wears its own palette
    const col = b.c && this.growth.colonies[b.c];
    const g = (col && col.genome.oxide) || this.growth.genome.oxide;
    const n = Math.max(1, this.growth.genome.budget);
    const age = 1 - Math.min(1, i / n);
    const w = g.wavelength;
    const drift = Math.sin(b.x / w * 6.283 + 0.7) * Math.cos(b.y / w * 5.1 + 1.9) * Math.sin(b.z / w * 4.3 + 0.4);
    return g.base + g.ramp * age + g.ramp * 0.35 * g.warp * drift;
  }
  grain(i) {
    const b = this.growth.bricks[i], g = this.growth.genome.oxide;
    let h = (b.x * 73856093) ^ (b.y * 19349663) ^ (b.z * 83492791) ^ (i * 2654435761);
    h = (h ^ (h >>> 13)) * 1274126177; h = (h ^ (h >>> 16)) >>> 0;
    return (h / 4294967296 - 0.5) * 2 * g.grain;
  }

  // The prism mesher: each brick is the prism over its tile — a fan for each
  // cap, one quad per edge whose neighbour is empty. Ambient occlusion per
  // vertex from how many of the tiles around that corner hold a brick at the
  // relevant layer.
  meshPrismChunk(ci) {
    const gl = this.gl, pr = this.pr, T = pr.T, n = pr.n, pbid = this.pbid, stacked = !!pr.stacked;
    const zb = Math.floor(ci / this.NBK), bk = ci % this.NBK;
    const out = [];
    const F = 1 / 1024;
    const has = (t, z) => z >= 0 && z < pr.Z && pbid[z * n + t] >= 0;
    // occlusion at a vertex v for the layer z: tiles around v holding a brick, excluding `skip`
    const aoAt = (v, z, skip1, skip2) => {
      const list = T.atVertex.get(v);
      let cnt = 0, m = 0;
      for (const o of list) { if (o === skip1 || o === skip2) continue; m++; if (has(o, z)) cnt++; }
      if (m === 0) return 3;
      return 3 - Math.min(3, Math.round((cnt * 3) / m));
    };
    // on a stack the layer above or below is displaced: occlusion there is read
    // off the tile under the corner's world position and its edge-neighbours
    const aoWorld = (v, zc, zz) => {
      const u = pr.under(v, zc, zz - zc);
      if (u < 0) return 3;
      let cnt = has(u, zz) ? 1 : 0, m = 1;
      for (let k = T.nbrStart[u]; k < T.nbrStart[u + 1]; k++) { m++; if (has(T.nbrList[k], zz)) cnt++; }
      return 3 - Math.min(3, Math.round((cnt * 3) / m));
    };
    let f = null;   // the layer's frame on a stack
    const push = (v, zh, nx, ny, nz, ao, thick, born, grain) => {
      if (f === null) { out.push(T.vx[v] * F, T.vy[v] * F, zh, nx, ny, nz, ao, thick, born, grain); return; }
      const x = T.vx[v] + f.ox, y = T.vy[v] + f.oy;
      out.push((f.c * x - f.s * y) * F, (f.s * x + f.c * y) * F, zh, f.c * nx - f.s * ny, f.s * nx + f.c * ny, nz, ao, thick, born, grain);
    };
    for (let z = zb * 16; z < zb * 16 + 16 && z < pr.Z; z++) {
      f = stacked ? pr.frame(z) : null;
      for (let t = bk * 128; t < bk * 128 + 128 && t < n; t++) {
        const i = pbid[z * n + t];
        if (i < 0) continue;
        const thick = this.thickness(i), born = this.born[i], grain = this.grain(i);
        const s = T.polyStart[t], L = T.polyLen[t];
        // top cap
        if (stacked ? !pr.covered(t, z) : !has(t, z + 1)) {
          const ao = [];
          for (let k = 0; k < L; k++) ao.push(stacked ? aoWorld(T.polyVerts[s + k], z, z + 1) : aoAt(T.polyVerts[s + k], z + 1, -1, -1));
          for (let k = 1; k + 1 < L; k++) {
            push(T.polyVerts[s], z + 1, 0, 0, 1, ao[0], thick, born, grain);
            push(T.polyVerts[s + k], z + 1, 0, 0, 1, ao[k], thick, born, grain);
            push(T.polyVerts[s + k + 1], z + 1, 0, 0, 1, ao[k + 1], thick, born, grain);
          }
        }
        // bottom cap
        if (stacked ? !pr.standing(t, z) : !has(t, z - 1)) {
          const ao = [];
          for (let k = 0; k < L; k++) ao.push(stacked ? aoWorld(T.polyVerts[s + k], z, z - 1) : aoAt(T.polyVerts[s + k], z - 1, -1, -1));
          for (let k = 1; k + 1 < L; k++) {
            push(T.polyVerts[s], z, 0, 0, -1, ao[0], thick, born, grain);
            push(T.polyVerts[s + k + 1], z, 0, 0, -1, ao[k + 1], thick, born, grain);
            push(T.polyVerts[s + k], z, 0, 0, -1, ao[k], thick, born, grain);
          }
        }
        // sides
        for (let k = 0; k < L; k++) {
          const o = T.across[s + k];
          if (o >= 0 && has(o, z)) continue;
          const a = T.polyVerts[s + k], b = T.polyVerts[s + (k + 1) % L];
          let nx = (T.vy[b] - T.vy[a]), ny = -(T.vx[b] - T.vx[a]);
          const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
          const a0 = aoAt(a, z, t, o), b0 = aoAt(b, z, t, o);
          const a1 = stacked ? aoWorld(a, z, z + 1) : aoAt(a, z + 1, -1, -1), b1 = stacked ? aoWorld(b, z, z + 1) : aoAt(b, z + 1, -1, -1);
          // two triangles: (a,z) (b,z) (b,z+1) and (a,z) (b,z+1) (a,z+1)
          push(a, z, nx, ny, 0, a0, thick, born, grain);
          push(b, z, nx, ny, 0, b0, thick, born, grain);
          push(b, z + 1, nx, ny, 0, b1, thick, born, grain);
          push(a, z, nx, ny, 0, a0, thick, born, grain);
          push(b, z + 1, nx, ny, 0, b1, thick, born, grain);
          push(a, z + 1, nx, ny, 0, a1, thick, born, grain);
        }
      }
    }
    let ch = this.chunks.get(ci);
    if (!out.length) {
      if (ch) { gl.deleteBuffer(ch.buf); this.chunks.delete(ci); }
      return;
    }
    if (!ch) { ch = { buf: gl.createBuffer(), count: 0 }; this.chunks.set(ci, ch); }
    gl.bindBuffer(gl.ARRAY_BUFFER, ch.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW);
    ch.count = out.length / FLOATS;
  }

  // The rhombohedron mesher: each brick's six rhombic faces, drawn where the
  // neighbour across is empty, two triangles each; occlusion per corner from
  // the tiles around that corner holding a brick.
  meshIcoChunk(ci) {
    const gl = this.gl, sub = this.ico, T = sub.T, pbid = this.pbid, n = sub.n;
    const out = [];
    const aoAt = (v, skip) => {
      let cnt = 0, m = 0;
      for (let k = T.vtStart[v]; k < T.vtStart[v + 1]; k++) { const o = T.vtList[k]; if (o === skip) continue; m++; if (pbid[o] >= 0) cnt++; }
      if (m === 0) return 3;
      return 3 - Math.min(3, Math.round((cnt * 3) / m));
    };
    for (let t = ci * 128; t < ci * 128 + 128 && t < n; t++) {
      const i = pbid[t];
      if (i < 0) continue;
      const thick = this.thickness(i), born = this.born[i], grain = this.grain(i);
      for (let f = 0; f < 6; f++) {
        const o = T.across[t * 6 + f];
        if (o >= 0 && pbid[o] >= 0) continue;
        const nx = T.fn[t * 18 + f * 3], ny = T.fn[t * 18 + f * 3 + 1], nz = T.fn[t * 18 + f * 3 + 2];
        const a = T.fv[t * 24 + f * 4], b = T.fv[t * 24 + f * 4 + 1], c = T.fv[t * 24 + f * 4 + 2], d = T.fv[t * 24 + f * 4 + 3];
        const aoA = aoAt(a, t), aoB = aoAt(b, t), aoC = aoAt(c, t), aoD = aoAt(d, t);
        for (const [v, ao] of [[a, aoA], [b, aoB], [c, aoC], [a, aoA], [c, aoC], [d, aoD]]) out.push(T.vx[v], T.vy[v], T.vz[v], nx, ny, nz, ao, thick, born, grain);
      }
    }
    let ch = this.chunks.get(ci);
    if (!out.length) {
      if (ch) { gl.deleteBuffer(ch.buf); this.chunks.delete(ci); }
      return;
    }
    if (!ch) { ch = { buf: gl.createBuffer(), count: 0 }; this.chunks.set(ci, ch); }
    gl.bindBuffer(gl.ARRAY_BUFFER, ch.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW);
    ch.count = out.length / FLOATS;
  }

  meshChunk(ci) {
    if (this.kind === "ico") return this.meshIcoChunk(ci);
    if (this.kind === "prism") return this.meshPrismChunk(ci);
    const gl = this.gl;
    const cz = Math.floor(ci / (NC * NC)), cy = Math.floor(ci / NC) % NC, cx = ci % NC;
    if (cx < 0 || cy < 0 || cz < 0 || cx >= NC || cy >= NC || cz >= NC) return;
    const occ = this.occ;
    const out = [];
    const x0 = cx * C, y0 = cy * C, z0 = cz * C;
    const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= G || y >= G || z >= G) ? 0 : occ[IDX(x, y, z)];
    for (let z = z0; z < z0 + C; z++) for (let y = y0; y < y0 + C; y++) for (let x = x0; x < x0 + C; x++) {
      const k = IDX(x, y, z);
      if (!occ[k]) continue;
      const i = this.bid[k];
      const thick = this.thickness(i), born = this.born[i], grain = this.grain(i);
      for (let f = 0; f < 6; f++) {
        const F = FACES[f], n = F.n;
        if (at(x + n[0], y + n[1], z + n[2])) continue;
        // AO per corner: the three cells beyond the face around that corner
        const ao = [];
        for (let c = 0; c < 4; c++) {
          const v = F.v[c];
          const dx = v[0] ? 1 : -1, dy = v[1] ? 1 : -1, dz = v[2] ? 1 : -1;
          // the two tangent axes of this face
          let s1, s2, cc;
          if (n[0]) { s1 = at(x + n[0], y + dy, z); s2 = at(x + n[0], y, z + dz); cc = at(x + n[0], y + dy, z + dz); }
          else if (n[1]) { s1 = at(x + dx, y + n[1], z); s2 = at(x, y + n[1], z + dz); cc = at(x + dx, y + n[1], z + dz); }
          else { s1 = at(x + dx, y, z + n[2]); s2 = at(x, y + dy, z + n[2]); cc = at(x + dx, y + dy, z + n[2]); }
          ao.push(s1 && s2 ? 0 : 3 - (s1 + s2 + cc));
        }
        const flip = ao[0] + ao[2] < ao[1] + ao[3];
        const order = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
        for (const c of order) {
          const v = F.v[c];
          out.push(x + v[0], y + v[1], z + v[2], n[0], n[1], n[2], ao[c], thick, born, grain);
        }
      }
    }
    let ch = this.chunks.get(ci);
    if (!out.length) {
      if (ch) { gl.deleteBuffer(ch.buf); this.chunks.delete(ci); }
      return;
    }
    if (!ch) { ch = { buf: gl.createBuffer(), count: 0 }; this.chunks.set(ci, ch); }
    gl.bindBuffer(gl.ARRAY_BUFFER, ch.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW);
    ch.count = out.length / FLOATS;
  }

  // Solid cells that are not crystal (a bucket, a goal): meshed like a
  // chunk, drawn flat in `color` ([r, g, b], linear-ish). null clears them.
  setProps(cells, color = [0.9, 0.62, 0.22]) {
    const gl = this.gl;
    if (this.props) { gl.deleteBuffer(this.props.buf); this.props = null; }
    if (!cells || !cells.length) return;
    const key = (x, y, z) => (z * G + y) * G + x;
    const set = new Set(cells.map((c) => key(c[0], c[1], c[2])));
    const at = (x, y, z) => (set.has(key(x, y, z)) ? 1 : 0);
    const out = [];
    for (const [x, y, z] of cells) {
      for (let f = 0; f < 6; f++) {
        const F = FACES[f], n = F.n;
        if (at(x + n[0], y + n[1], z + n[2])) continue;
        const ao = [];
        for (let c = 0; c < 4; c++) {
          const v = F.v[c];
          const dx = v[0] ? 1 : -1, dy = v[1] ? 1 : -1, dz = v[2] ? 1 : -1;
          let s1, s2, cc;
          if (n[0]) { s1 = at(x + n[0], y + dy, z); s2 = at(x + n[0], y, z + dz); cc = at(x + n[0], y + dy, z + dz); }
          else if (n[1]) { s1 = at(x + dx, y + n[1], z); s2 = at(x, y + n[1], z + dz); cc = at(x + dx, y + n[1], z + dz); }
          else { s1 = at(x + dx, y, z + n[2]); s2 = at(x, y + dy, z + n[2]); cc = at(x + dx, y + dy, z + n[2]); }
          ao.push(s1 && s2 ? 0 : 3 - (s1 + s2 + cc));
        }
        const flip = ao[0] + ao[2] < ao[1] + ao[3];
        const order = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
        for (const c of order) {
          const v = F.v[c];
          out.push(x + v[0], y + v[1], z + v[2], n[0], n[1], n[2], ao[c], 0, 0, 0);
        }
      }
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW);
    this.props = { buf, count: out.length / FLOATS, color };
  }

  // re-mesh everything (the playground recolours a grown crystal live)
  remesh() { for (const ci of this.chunks.keys()) this.dirty.add(ci); }

  // Re-mesh dirty chunks: at least `limit`, then as many as fit in ~8 ms —
  // after a skip the whole crystal is dirty at once
  rebuild(limit = 12) {
    let n = 0;
    const deadline = performance.now() + 8;
    for (const ci of this.dirty) {
      this.meshChunk(ci);
      this.dirty.delete(ci);
      if (++n >= limit && performance.now() > deadline) break;
    }
  }

  // ------------------------------------------------------------- camera --
  attachInput() {
    const cv = this.canvas;
    let drag = null, pinch = null;
    const down = (x, y, id) => { if (this.fp) return; drag = { x, y, id, moved: false }; this.spinVel = 0; this.elVel = 0; };
    const move = (x, y) => {
      if (!drag || this.fp) return;
      const dx = x - drag.x, dy = y - drag.y;
      drag.x = x; drag.y = y; drag.moved = true;
      this.az -= dx * 0.006; this.el += dy * 0.006;
      this.el = Math.max(-1.2, Math.min(1.45, this.el));
      this.spinVel = -dx * 0.006; this.elVel = dy * 0.006;
      this.idle = 0;
    };
    cv.addEventListener("pointerdown", (e) => { if (e.isPrimary && !this.fp) { down(e.clientX, e.clientY, e.pointerId); try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ } } });
    cv.addEventListener("pointermove", (e) => { if (drag && e.pointerId === drag.id) move(e.clientX, e.clientY); });
    const up = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", (e) => {
      if (this.fp) return;
      e.preventDefault();
      this.userZoom *= Math.exp(e.deltaY * 0.0012);
      this.userZoom = Math.max(0.25, Math.min(4, this.userZoom));
      this.idle = 0;
    }, { passive: false });
    cv.addEventListener("touchstart", (e) => {
      if (this.fp) return;
      if (e.touches.length === 2) {
        pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    cv.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2 && pinch) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        this.userZoom *= pinch / d; pinch = d;
        this.userZoom = Math.max(0.25, Math.min(4, this.userZoom));
        e.preventDefault();
      }
    }, { passive: false });
    cv.addEventListener("touchend", () => { pinch = null; });
    this.idle = 0;
  }

  // jump the framing to the crystal's current extent (after a skip or replay)
  snapCamera() { this.updateCamera(1e9); }

  updateCamera(dt) {
    const bb = this.growth && this.growth.sub && this.growth.sub.bounds();
    if (bb && bb.count) {
      const c = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
      const ex = bb.max[0] - bb.min[0], ey = bb.max[1] - bb.min[1], ez = bb.max[2] - bb.min[2];
      const r = Math.max(6, Math.hypot(ex, ey, ez) * 0.5);
      const aspect = this.canvas.width / Math.max(1, this.canvas.height);
      const fovFit = aspect < 1 ? 1.35 / aspect : 1.0;
      const want = r * 2.9 * fovFit;
      const k = 1 - Math.exp(-dt * 1.4);
      this.target[0] += (c[0] - this.target[0]) * k;
      this.target[1] += (c[1] - this.target[1]) * k;
      this.target[2] += (c[2] - this.target[2]) * k;
      this.fit += (want - this.fit) * k;
    }
    if (dt > 1e6) return;
    this.idle += dt;
    // inertia, then the slow show-off spin when nobody is touching it
    this.az += this.spinVel; this.el += this.elVel;
    this.spinVel *= 0.92; this.elVel *= 0.92;
    this.el = Math.max(-1.2, Math.min(1.45, this.el));
    if (this.idle > 2.5) this.az += this.autoSpin * dt * Math.min(1, (this.idle - 2.5) / 2);
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.dpr = dpr;
  }

  // ---------------------------------------------------------------- draw --
  frame(dt, masons) {
    const gl = this.gl;
    this.time += dt;
    this.resize();
    if (!this.fp) this.updateCamera(dt);
    this.rebuild();

    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    let eye, proj, view;
    if (this.fp) {
      // first person: the eye in substrate coordinates, yaw about +z from +x,
      // pitch up; drawn relative to the lattice centre like everything else
      const fp = this.fp, T = this.target;
      T[0] = G / 2; T[1] = G / 2; T[2] = G / 2;
      const cp = Math.cos(fp.pitch);
      const fx = Math.cos(fp.yaw) * cp, fy = Math.sin(fp.yaw) * cp, fz = Math.sin(fp.pitch);
      eye = [fp.eye[0] - T[0], fp.eye[2] - T[2], -(fp.eye[1] - T[1])];
      const look = [eye[0] + fx, eye[1] + fz, eye[2] - fy];
      proj = perspective(fp.fov || 1.25, W / Math.max(1, H), 0.05, 420);
      view = lookAt(eye, look, [0, 1, 0]);
    } else {
      const dist = this.fit * this.userZoom;
      eye = [
        Math.sin(this.az) * Math.cos(this.el) * dist,
        Math.sin(this.el) * dist,
        Math.cos(this.az) * Math.cos(this.el) * dist,
      ];
      proj = perspective(0.62, W / Math.max(1, H), 0.5, dist * 4 + 200);
      view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    }
    // the camera basis, for picking: columns of the rotation part
    this.cam = { eye, xaxis: [view[0], view[4], view[8]], yaxis: [view[1], view[5], view[9]], zaxis: [view[2], view[6], view[10]] };

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.uProj, false, proj);
    gl.uniformMatrix4fv(this.loc.uView, false, view);
    gl.uniform3f(this.loc.uCenter, this.target[0], this.target[1], this.target[2]);
    gl.uniform1f(this.loc.uTime, this.time);
    gl.uniform1f(this.loc.uCool, this.cool);
    // key light rides with the camera, up and to the left, in view space
    gl.uniform3f(this.loc.uKey, -0.45, 0.75, 0.6);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    const stride = FLOATS * 4;
    for (const ch of this.chunks.values()) {
      gl.bindBuffer(gl.ARRAY_BUFFER, ch.buf);
      gl.enableVertexAttribArray(this.loc.aPos); gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(this.loc.aNrm); gl.vertexAttribPointer(this.loc.aNrm, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(this.loc.aAO); gl.vertexAttribPointer(this.loc.aAO, 1, gl.FLOAT, false, stride, 24);
      gl.enableVertexAttribArray(this.loc.aThick); gl.vertexAttribPointer(this.loc.aThick, 1, gl.FLOAT, false, stride, 28);
      gl.enableVertexAttribArray(this.loc.aBorn); gl.vertexAttribPointer(this.loc.aBorn, 1, gl.FLOAT, false, stride, 32);
      gl.enableVertexAttribArray(this.loc.aGrain); gl.vertexAttribPointer(this.loc.aGrain, 1, gl.FLOAT, false, stride, 36);
      gl.drawArrays(gl.TRIANGLES, 0, ch.count);
    }
    if (this.props) {
      const pr = this.props;
      gl.useProgram(this.rprog);
      gl.uniformMatrix4fv(this.rloc.uProj, false, proj);
      gl.uniformMatrix4fv(this.rloc.uView, false, view);
      gl.uniform3f(this.rloc.uCenter, this.target[0], this.target[1], this.target[2]);
      gl.uniform1f(this.rloc.uTime, this.time);
      gl.uniform3f(this.rloc.uKey, -0.45, 0.75, 0.6);
      gl.uniform3f(this.rloc.uColor, pr.color[0], pr.color[1], pr.color[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, pr.buf);
      gl.enableVertexAttribArray(this.rloc.aPos); gl.vertexAttribPointer(this.rloc.aPos, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(this.rloc.aNrm); gl.vertexAttribPointer(this.rloc.aNrm, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(this.rloc.aAO); gl.vertexAttribPointer(this.rloc.aAO, 1, gl.FLOAT, false, stride, 24);
      gl.drawArrays(gl.TRIANGLES, 0, pr.count);
    }
    gl.disable(gl.CULL_FACE);

    // the flux lines: additive, behind the crystal where the crystal is
    if (this.flux && this.flux.length) {
      gl.useProgram(this.lprog);
      gl.uniformMatrix4fv(this.lloc.uProj, false, proj);
      gl.uniformMatrix4fv(this.lloc.uView, false, view);
      gl.uniform3f(this.lloc.uCenter, this.target[0], this.target[1], this.target[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lbuf);
      if (this._fluxUploaded !== this.flux) { gl.bufferData(gl.ARRAY_BUFFER, this.flux, gl.STATIC_DRAW); this._fluxUploaded = this.flux; }
      gl.enableVertexAttribArray(this.lloc.aPos); gl.vertexAttribPointer(this.lloc.aPos, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(this.lloc.aI); gl.vertexAttribPointer(this.lloc.aI, 1, gl.FLOAT, false, 16, 12);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false);
      gl.drawArrays(gl.LINES, 0, this.flux.length / 4);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // masons: a glowing mote per agent on the surface, with a short trail
    // (plus any beacons the page asks for, drawn the same way)
    if ((masons && masons.length) || (this.beacons && this.beacons.length)) {
      const pts = [];
      if (this.beacons) for (const b of this.beacons) pts.push(b[0], b[1], b[2], b[3]);
      for (const m of masons || []) {
        let tr = this.trails.get(m.id);
        if (!tr) { tr = []; this.trails.set(m.id, tr); }
        if (m.state === "surface") {
          const last = tr[tr.length - 1];
          if (!last || last[0] !== m.x || last[1] !== m.y || last[2] !== m.z) tr.push([m.x, m.y, m.z, this.time]);
        }
        while (tr.length && this.time - tr[0][3] > 0.9) tr.shift();
        if (tr.length > 14) tr.splice(0, tr.length - 14);
        for (let i = 0; i < tr.length; i++) {
          const p = tr[i];
          const fade = Math.max(0, 1 - (this.time - p[3]) / 0.9);
          const head = (m.state === "surface" && i === tr.length - 1) ? 1 : fade * 0.55;
          const mo = this.growth.sub.moteOffset;
          pts.push(p[0] + mo[0], p[1] + mo[1], p[2] + mo[2], head);
        }
      }
      if (pts.length) this.drawPoints(pts, proj, view, H, [1.0, 0.55, 0.2], [1.0, 0.95, 0.85], 1.0);
    }
    // the worms: a chain of cold motes per worm, head brightest
    if (this.worms && this.worms.length) {
      const pts = [];
      for (const w of this.worms) pts.push(w[0], w[1], w[2], w[3]);
      this.drawPoints(pts, proj, view, H, [0.42, 0.34, 0.95], [0.86, 0.9, 1.0], 2.1);
    }
    if (this.ghosts && this.ghosts.length) {
      const pts = [];
      for (const g of this.ghosts) pts.push(g[0], g[1], g[2], g[3]);
      this.drawPoints(pts, proj, view, H, [0.85, 0.8, 0.6], [1.0, 0.98, 0.9], 2.4);
    }
  }

  drawPoints(pts, proj, view, H, tint, core, size) {
    const gl = this.gl;
    gl.useProgram(this.pprog);
    gl.uniformMatrix4fv(this.ploc.uProj, false, proj);
    gl.uniformMatrix4fv(this.ploc.uView, false, view);
    gl.uniform3f(this.ploc.uCenter, this.target[0], this.target[1], this.target[2]);
    gl.uniform1f(this.ploc.uPx, this.dpr);
    gl.uniform1f(this.ploc.uH, H / this.dpr);
    gl.uniform1f(this.ploc.uSize, size);
    gl.uniform3f(this.ploc.uTint, tint[0], tint[1], tint[2]);
    gl.uniform3f(this.ploc.uCore, core[0], core[1], core[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pbuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.ploc.aPos); gl.vertexAttribPointer(this.ploc.aPos, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.ploc.aFade); gl.vertexAttribPointer(this.ploc.aFade, 1, gl.FLOAT, false, 16, 12);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, pts.length / 4);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
