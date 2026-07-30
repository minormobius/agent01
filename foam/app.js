// foam/app.js — first person in the voronoi foam.
//
// WebGL2 renderer + walker physics + the shiva tools over the foamworld
// kernel. Design constraints, in order:
//   · mobile AND desktop performance — one membrane draw (sorted alpha, no
//     depth buffer), one edge draw, per-face state in a float texture, zero
//     per-frame allocation in the hot loop, adaptive resolution governor
//   · the membranes are the show — thin-film iridescence, and a tight
//     close-up on creation (film weaves in from the structural frame) and
//     destruction (dissolve front radiating from the hit point)
//   · movement honesty — the same support/grade rules the kernel certifies:
//     no jump, max walkable grade, membranes are the only thing that opens
//
// Edges are structure, plates are not: shattering a membrane always leaves
// its frame drawn.

import { generatePocket, supportAt } from './foamworld.js';

// ------------------------------------------------------------- boot --------
const PARAMS = new URLSearchParams(location.search);
const SEED = Math.max(1, Math.floor(+(PARAMS.get('seed') || 1)) || 1);

const cv = document.getElementById('c');
const gl = cv.getContext('webgl2', { antialias: true, depth: false, alpha: false, powerPreference: 'high-performance' });
if (!gl) {
  document.getElementById('intro').innerHTML =
    '<div class="card"><h1>⬡ foam</h1><p>This needs WebGL2 — any current browser has it. The structural wing lives at <a href="https://rind.mino.mobi" style="color:#7fd8d0">rind.mino.mobi</a>.</p></div>';
  throw new Error('webgl2 unavailable');
}

const pocket = generatePocket({ seed: SEED });
const { cells, faces, nodes, nav, opts } = pocket;
const targetCell = nodes[nav.target].cell;
const startCell = nodes[nav.start].cell;

// ------------------------------------------------------ face bookkeeping ---
const NF = faces.length;
const off = new Float32Array(NF);          // plane offset n·p
const radius = new Float32Array(NF);       // max centroid→vert distance
const state = new Uint8Array(NF);          // 0 closed · 1 opening · 2 open · 3 closing
const stateT = new Float32Array(NF);       // animation start (s)
const DUR_OPEN = 1.05, DUR_CLOSE = 1.6;
for (const f of faces) {
  off[f.id] = f.n[0] * f.centroid[0] + f.n[1] * f.centroid[1] + f.n[2] * f.centroid[2];
  let r = 0;
  for (const v of f.verts) r = Math.max(r, Math.hypot(v[0] - f.centroid[0], v[1] - f.centroid[1], v[2] - f.centroid[2]));
  radius[f.id] = r;
}
const targetFaceSet = new Set(cells[targetCell].faces);
const isOpenFn = (fid) => state[fid] === 1 || state[fid] === 2;
const isSolid = (fid) => state[fid] === 0 || state[fid] === 3;

// faces sharing a welded vertex (door frames — used for near-door collision)
const vkey = (p) => Math.round(p[0] * 128) + '_' + Math.round(p[1] * 128) + '_' + Math.round(p[2] * 128);
const touching = new Map(); // faceId -> Set(faceId)
{
  const byV = new Map();
  for (const f of faces) for (const p of f.verts) {
    const k = vkey(p);
    if (!byV.has(k)) byV.set(k, []);
    byV.get(k).push(f.id);
  }
  for (const ids of byV.values()) {
    for (const a of ids) {
      if (!touching.has(a)) touching.set(a, new Set());
      for (const b of ids) if (b !== a) touching.get(a).add(b);
    }
  }
}

// ------------------------------------------------------------ shaders ------
function sh(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
  return s;
}
function prog(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

const MEM_VS = `#version 300 es
precision highp float;
uniform mat4 uVP;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aN;
layout(location=2) in float aFid;
layout(location=3) in float aEdge;
out vec3 vPos; out vec3 vN; out float vEdge; flat out int vFid;
void main() { vPos = aPos; vN = aN; vEdge = aEdge; vFid = int(aFid + 0.5); gl_Position = uVP * vec4(aPos, 1.0); }`;

const MEM_FS = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform float uTime, uFilm, uDurOpen, uDurClose;
uniform vec3 uEye;
uniform int uHover;
in vec3 vPos; in vec3 vN; in float vEdge; flat in int vFid;
out vec4 frag;
vec3 hsv(float h, float s, float v) {
  vec3 p = abs(fract(vec3(h) + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return v * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), s);
}
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec3(1,0,0)), c = hash(i + vec3(0,1,0)), d = hash(i + vec3(1,1,0));
  float e = hash(i + vec3(0,0,1)), g = hash(i + vec3(1,0,1)), h = hash(i + vec3(0,1,1)), k = hash(i + vec3(1,1,1));
  return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(h,k,f.x), f.y), f.z);
}
void main() {
  int W = textureSize(uState, 0).x;
  ivec2 t0 = ivec2(vFid % W, (vFid / W) * 2);
  vec4 A = texelFetch(uState, t0, 0);                 // mode, tStart, flags, boundary
  vec4 B = texelFetch(uState, t0 + ivec2(0, 1), 0);   // hit xyz, faceRadius
  float mode = A.x;
  vec3 V = normalize(uEye - vPos);
  float ndv = abs(dot(normalize(vN), V));
  float fres = pow(1.0 - ndv, 2.0);
  float dEye = length(uEye - vPos);
  float fog = exp(-dEye * 0.055);
  float fid = float(vFid);
  vec3 film = hsv(fract(0.52 + 0.22 * fres + 0.11 * sin(fid * 1.7) + 0.03 * sin(vPos.y * 1.3)), 0.5, 1.0);
  float a = 0.10 + 0.42 * fres;                        // film opacity
  float filmVis = mix(0.045, 1.0, uFilm);
  vec3 emiss = vec3(0.0);
  float show = 1.0;
  if (A.w > 0.5) {                                     // pocket hull: dense, warm, structural
    film = vec3(0.85, 0.42, 0.28); a = 0.22 + 0.5 * fres; filmVis = max(filmVis, 0.6);
  }
  if (mode == 2.0) { show = 0.0; a *= 0.06; }          // open: ghost of the plate
  else if (mode == 1.0) {                              // SHATTER — dissolve front from the hit
    float t = clamp((uTime - A.y) / uDurOpen, 0.0, 1.0);
    float r = t * t * (3.0 - 2.0 * t) * B.w * 1.3;
    float n = noise(vPos * 2.4 + fid) * 0.9;
    float d = distance(vPos, B.xyz) + n * 0.5 - 0.45;
    if (d < r - 0.26) discard;
    float front = smoothstep(0.55, 0.0, abs(d - r));
    float nearD = clamp(dEye * 0.3, 0.3, 1.0);
    emiss += (vec3(1.0, 0.82, 0.5) * 1.1 + film * 0.5) * front * nearD;
    emiss += film * n * (1.0 - t) * 0.35;              // crackle charge on the doomed film
  } else if (mode == 3.0) {                            // WEAVE — film grows in from the frame
    float t = clamp((uTime - A.y) / uDurClose, 0.0, 1.0);
    float n = noise(vPos * 2.1 - fid) * 0.24;
    float grown = t * t * (3.0 - 2.0 * t) * 1.18 + n - 0.12;
    if (vEdge > grown) { show = 0.0; a *= 0.05; }
    else {
      float front = smoothstep(0.12, 0.0, grown - vEdge);
      float near = clamp(dEye * 0.25, 0.25, 1.0);        // don't blow out at arm's length
      emiss += (vec3(0.45, 1.0, 0.9) * 0.6 + film * 0.4) * front * near;
      a *= 0.75 + 0.25 * t;
    }
  }
  float rim = smoothstep(0.14, 0.0, vEdge);
  emiss += vec3(0.35, 0.9, 0.85) * rim * 0.085;
  if (uHover == vFid) { emiss += film * 0.22 + vec3(0.35, 0.9, 0.85) * rim * 0.5; }
  if (A.z >= 2.0) emiss += vec3(1.0, 0.65, 0.2) * (0.12 + 0.1 * sin(uTime * 2.6)) * (0.35 + fres); // beacon chamber
  float alpha = a * filmVis * show;
  vec3 col = (film * alpha + emiss) * fog;
  frag = vec4(col, alpha * fog);
}`;

const EDGE_VS = `#version 300 es
precision highp float;
uniform mat4 uVP;
layout(location=0) in vec3 aPos;
out vec3 vPos;
void main() { vPos = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`;

const EDGE_FS = `#version 300 es
precision highp float;
uniform vec3 uEye; uniform float uBright;
in vec3 vPos;
out vec4 frag;
void main() {
  float fog = exp(-length(uEye - vPos) * 0.05);
  frag = vec4(vec3(0.30, 0.75, 0.70) * uBright * fog, 0.0);
}`;

const BEAM_VS = `#version 300 es
precision highp float;
uniform mat4 uVP;
layout(location=0) in vec3 aPos;
layout(location=1) in float aA;
out float vA; out vec3 vPos;
void main() { vA = aA; vPos = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`;

const BEAM_FS = `#version 300 es
precision highp float;
uniform float uTime; uniform vec3 uEye;
in float vA; in vec3 vPos;
out vec4 frag;
void main() {
  float fog = exp(-length(uEye - vPos) * 0.04);
  float pulse = 0.65 + 0.35 * sin(uTime * 2.6 + vPos.y * 2.0);
  frag = vec4(vec3(1.0, 0.62, 0.18) * vA * pulse * fog * 0.8, 0.0);
}`;

const memProg = prog(MEM_VS, MEM_FS);
const edgeProg = prog(EDGE_VS, EDGE_FS);
const beamProg = prog(BEAM_VS, BEAM_FS);

// ------------------------------------------------------------ geometry -----
// Membranes: fan triangulation. Per face: centroid vertex (edge=1) + rim
// verts (edge=0); one index block per face, re-concatenated back-to-front
// each frame for correct alpha over the whole foam (no depth buffer at all).
const vboData = [];
const faceIndexBlock = new Array(NF);   // Uint32Array per face
let vcount = 0;
for (const f of faces) {
  const nvts = f.verts.length;
  const c = f.centroid, n = f.n;
  const base = vcount;
  vboData.push(c[0], c[1], c[2], n[0], n[1], n[2], f.id, 1);
  for (const v of f.verts) vboData.push(v[0], v[1], v[2], n[0], n[1], n[2], f.id, 0);
  vcount += nvts + 1;
  const idx = new Uint32Array(nvts * 3);
  for (let i = 0; i < nvts; i++) {
    idx[i * 3] = base;
    idx[i * 3 + 1] = base + 1 + i;
    idx[i * 3 + 2] = base + 1 + ((i + 1) % nvts);
  }
  faceIndexBlock[f.id] = idx;
}
const totalIdx = faceIndexBlock.reduce((a, b) => a + b.length, 0);
const idxScratch = new Uint32Array(totalIdx);
const sortKeys = new Float32Array(NF);
const sortOrder = new Uint32Array(NF);
for (let i = 0; i < NF; i++) sortOrder[i] = i;

const memVao = gl.createVertexArray();
gl.bindVertexArray(memVao);
const memVbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, memVbo);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vboData), gl.STATIC_DRAW);
const STRIDE = 8 * 4;
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE, 12);
gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE, 24);
gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE, 28);
const memIbo = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, memIbo);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxScratch.byteLength, gl.DYNAMIC_DRAW);
gl.bindVertexArray(null);

// Edges: every welded edge once
const edgeVerts = [];
{
  const seen = new Set();
  for (const f of faces) {
    for (let i = 0; i < f.verts.length; i++) {
      const a = f.verts[i], b = f.verts[(i + 1) % f.verts.length];
      const ka = vkey(a), kb = vkey(b);
      const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      if (seen.has(k)) continue;
      seen.add(k);
      edgeVerts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }
}
const edgeVao = gl.createVertexArray();
gl.bindVertexArray(edgeVao);
const edgeVbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, edgeVbo);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(edgeVerts), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
gl.bindVertexArray(null);
const edgeCount = edgeVerts.length / 3;

// Beacon: two crossed quads through the target chamber
const beamVerts = [];
{
  const c = cells[targetCell].centroid;
  const y0 = c[1] - opts.layerH * 0.7, y1 = c[1] + opts.layerH * 0.7, w = 0.55;
  for (const [dx, dz] of [[w, 0], [0, w]]) {
    beamVerts.push(
      c[0] - dx, y0, c[2] - dz, 0.0,  c[0] + dx, y0, c[2] + dz, 0.0,  c[0], y1, c[2], 0.9,
      c[0] - dx, y0, c[2] - dz, 0.0,  c[0], y1, c[2], 0.9,           c[0], y0, c[2], 0.9,
    );
  }
}
const beamVao = gl.createVertexArray();
gl.bindVertexArray(beamVao);
const beamVbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, beamVbo);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(beamVerts), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
gl.bindVertexArray(null);
const beamCount = beamVerts.length / 4;

// -------------------------------------------------------- state texture ----
const TW = 1024;
const rows = Math.ceil(NF / TW);
const stateTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, stateTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
const texData = new Float32Array(TW * rows * 2 * 4);
for (const f of faces) {
  const x = f.id % TW, y = Math.floor(f.id / TW) * 2;
  const ia = (y * TW + x) * 4, ib = ((y + 1) * TW + x) * 4;
  texData[ia] = 0; texData[ia + 1] = 0;
  texData[ia + 2] = targetFaceSet.has(f.id) ? 2 : 0;
  texData[ia + 3] = f.boundary ? 1 : 0;
  texData[ib + 3] = radius[f.id];
}
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TW, rows * 2, 0, gl.RGBA, gl.FLOAT, texData);
const texel = new Float32Array(8);
function pushFaceState(fid, hit) {
  const x = fid % TW, y = Math.floor(fid / TW) * 2;
  texel[0] = state[fid]; texel[1] = stateT[fid];
  texel[2] = targetFaceSet.has(fid) ? 2 : 0;
  texel[3] = faces[fid].boundary ? 1 : 0;
  if (hit) { texel[4] = hit[0]; texel[5] = hit[1]; texel[6] = hit[2]; }
  texel[7] = radius[fid];
  gl.bindTexture(gl.TEXTURE_2D, stateTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, 1, 2, gl.RGBA, gl.FLOAT, texel);
}

// -------------------------------------------------------------- camera -----
const player = {
  pos: [0, 0, 0],          // eye
  vy: 0, yaw: 0, pitch: -0.05,
  cell: startCell, grounded: false,
};
const EYE_H = 1.5, R = 0.34, WALK = 4.3, SPRINT = 6.3, GRAV = 16;
{
  const c = cells[startCell].centroid;
  const sup = supportAt(pocket, startCell, c[0], c[1] + 2, c[2], isOpenFn);
  player.pos = [c[0], (sup ? sup.y : c[1]) + EYE_H, c[2]];
  const t = cells[targetCell].centroid;
  player.yaw = Math.atan2(t[0] - c[0], -(t[2] - c[2]));
}

const M = new Float32Array(16);
function viewProj(w, h) {
  const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
  const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
  const f = [sy * cp, sp, -cy * cp];        // look dir (yaw 0 = -z)
  const rgt = [cy, 0, sy];
  const up = [-sy * sp, cp, cy * sp];
  const e = player.pos;
  const fov = 1.22, near = 0.06, far = 220, asp = w / h;
  const t = 1 / Math.tan(fov / 2);
  // rows of P·V, written column-major: row0 = (t/asp)·right, row1 = t·up,
  // row2 = A·(−f) with A·(f·e)+B, row3 = f with −f·e (w = distance ahead)
  const A = (far + near) / (near - far), Bc = (2 * far * near) / (near - far);
  const re = rgt[0] * e[0] + rgt[1] * e[1] + rgt[2] * e[2];
  const ue = up[0] * e[0] + up[1] * e[1] + up[2] * e[2];
  const fe = f[0] * e[0] + f[1] * e[1] + f[2] * e[2];
  const k = t / asp;
  M[0] = k * rgt[0]; M[4] = k * rgt[1]; M[8] = k * rgt[2]; M[12] = -k * re;
  M[1] = t * up[0]; M[5] = t * up[1]; M[9] = t * up[2]; M[13] = -t * ue;
  M[2] = -A * f[0]; M[6] = -A * f[1]; M[10] = -A * f[2]; M[14] = A * fe + Bc;
  M[3] = f[0]; M[7] = f[1]; M[11] = f[2]; M[15] = -fe;
  return M;
}
function lookDir() {
  const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
  const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
  return [sy * cp, sp, -cy * cp];
}

// -------------------------------------------------------------- input ------
const input = { f: 0, b: 0, l: 0, r: 0, sprint: 0 };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

const KMAP = { w: 'f', W: 'f', ArrowUp: 'f', s: 'b', S: 'b', ArrowDown: 'b', a: 'l', A: 'l', ArrowLeft: 'l', d: 'r', D: 'r', ArrowRight: 'r', Shift: 'sprint' };
addEventListener('keydown', (e) => {
  if (KMAP[e.key] != null) { input[KMAP[e.key]] = 1; e.preventDefault(); }
  if (e.key === 'm' || e.key === 'M') toggleFilm();
});
addEventListener('keyup', (e) => { if (KMAP[e.key] != null) { input[KMAP[e.key]] = 0; e.preventDefault(); } });

let running = false;
function lockPointer() { if (!isTouch && document.pointerLockElement !== cv) cv.requestPointerLock?.(); }
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== cv) return;
  player.yaw += e.movementX * 0.0026;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * 0.0026));
});
cv.addEventListener('mousedown', (e) => {
  if (!running) return;
  if (document.pointerLockElement !== cv) { lockPointer(); return; }
  if (e.button === 0) shatter();
  else if (e.button === 2) weave();
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());

// touch: left = stick, elsewhere = look
const stick = document.getElementById('stick'), knob = document.getElementById('knob');
let stickId = null, lookId = null, lookLast = null;
const stickVec = [0, 0];
function setKnob(dx, dy) { knob.style.transform = `translate(calc(-50% + ${dx * 36}px), calc(-50% + ${dy * 36}px))`; }
addEventListener('pointerdown', (e) => {
  if (!isTouch || !running) return;
  if (e.target.closest('#tools') || e.target.closest('#topright')) return;
  const rect = stick.getBoundingClientRect();
  const inStick = e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.45;
  if (inStick && stickId === null) {
    stickId = e.pointerId;
    stickMove(e, rect);
  } else if (lookId === null) {
    lookId = e.pointerId; lookLast = [e.clientX, e.clientY];
  }
});
function stickMove(e, rect) {
  const cx = rect.left + rect.width / 2, cy2 = rect.top + rect.height / 2;
  let dx = (e.clientX - cx) / (rect.width / 2), dy = (e.clientY - cy2) / (rect.height / 2);
  const l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; }
  stickVec[0] = dx; stickVec[1] = dy; setKnob(dx, dy);
}
addEventListener('pointermove', (e) => {
  if (e.pointerId === stickId) stickMove(e, stick.getBoundingClientRect());
  else if (e.pointerId === lookId && lookLast) {
    player.yaw += (e.clientX - lookLast[0]) * 0.0052;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - (e.clientY - lookLast[1]) * 0.0052));
    lookLast = [e.clientX, e.clientY];
  }
});
function endPointer(e) {
  if (e.pointerId === stickId) { stickId = null; stickVec[0] = stickVec[1] = 0; setKnob(0, 0); }
  if (e.pointerId === lookId) { lookId = null; lookLast = null; }
}
addEventListener('pointerup', endPointer);
addEventListener('pointercancel', endPointer);
document.getElementById('shatter').addEventListener('pointerdown', (e) => { e.stopPropagation(); shatter(); });
document.getElementById('weave').addEventListener('pointerdown', (e) => { e.stopPropagation(); weave(); });

// ------------------------------------------------------------- physics -----
// Support probes span the current chamber AND every adjacent one: floors are
// physical surfaces whichever chamber claims them, and near a tilted wall
// your feet can be in the neighbour's column while your eyes are in yours.
const adjacent = cells.map((c) => {
  const out = [];
  for (const fi of c.faces) {
    const f = faces[fi];
    if (!f.boundary) out.push(f.a === c.id ? f.b : f.a);
  }
  return out;
});
const candCells = [];
function gatherCells() {
  candCells.length = 0;
  candCells.push(player.cell);
  for (const nb of adjacent[player.cell]) candCells.push(nb);
}
// highest support whose height is ≤ yCap (the kernel probe itself allows
// +0.6 above its reference, so pass yCap−0.6 through)
function bestSupport(x, z, yCap) {
  let best = null;
  for (const ci of candCells) {
    const s = supportAt(pocket, ci, x, yCap - 0.6, z, isOpenFn);
    if (s && (best === null || s.y > best.y)) best = s;
  }
  return best;
}
function outward(f, cid) { return f.a === cid ? 1 : -1; }

function collide(pos) {
  // keep the sphere inside the current chamber's closed planes; open faces
  // let it through, then the chamber handoff happens in step().
  for (let pass = 0; pass < 2; pass++) {
    for (const fi of cells[player.cell].faces) {
      const f = faces[fi];
      if (!f.boundary && !isSolid(fi)) continue;
      const s = outward(f, player.cell);
      const ny = f.n[1] * s;
      const d = (f.n[0] * pos[0] + f.n[1] * pos[1] + f.n[2] * pos[2] - off[fi]) * s;
      // support-class floors are handled by the ground snap (you stand on
      // them); everything else — walls, scarps, ceilings — is a hard plane.
      // The pocket hull's floor is the one support plane that also hard
      // blocks (nothing exists beneath it to land in).
      if (ny < 0 && f.slope <= opts.maxGrade) {
        if (f.boundary && d > -(EYE_H - 0.1)) {
          const push = d + (EYE_H - 0.1);
          pos[0] -= f.n[0] * s * push; pos[1] -= f.n[1] * s * push; pos[2] -= f.n[2] * s * push;
        }
        continue;
      }
      const rr = ny > 0.5 ? 0.12 : R;   // ceilings hug closer than walls
      if (d > -rr) {
        const push = d + rr;
        pos[0] -= f.n[0] * s * push; pos[1] -= f.n[1] * s * push; pos[2] -= f.n[2] * s * push;
      }
    }
    // door-frame planes of adjacent chambers (only faces touching an open
    // membrane of the current cell, only small violations — prevents the
    // sphere clipping a neighbour's wall while standing in the doorway)
    for (const fi of cells[player.cell].faces) {
      if (faces[fi].boundary || !isOpenFn(fi)) continue;
      const f = faces[fi];
      const nb = f.a === player.cell ? f.b : f.a;
      const doorD = Math.abs(f.n[0] * pos[0] + f.n[1] * pos[1] + f.n[2] * pos[2] - off[fi]);
      if (doorD > 1.2) continue;
      const frame = touching.get(fi);
      for (const gi of cells[nb].faces) {
        if (gi === fi || !frame || !frame.has(gi)) continue;
        const g = faces[gi];
        if (!g.boundary && !isSolid(gi)) continue;
        const s = outward(g, nb);
        const ny = g.n[1] * s;
        if (ny < 0 && g.slope <= opts.maxGrade) continue;
        const d = (g.n[0] * pos[0] + g.n[1] * pos[1] + g.n[2] * pos[2] - off[gi]) * s;
        const rr = ny > 0.5 ? 0.12 : R;
        if (d > -rr && d < 0.6) {
          const push = d + rr;
          pos[0] -= g.n[0] * s * push; pos[1] -= g.n[1] * s * push; pos[2] -= g.n[2] * s * push;
        }
      }
    }
  }
}

function relocateCell(pos) {
  // anisotropic nearest seed — the authoritative "which chamber am I in"
  let best = 0, bd = Infinity;
  for (const c of cells) {
    const dx = pos[0] - c.seed[0], dy = (pos[1] - c.seed[1]) * Math.sqrt(opts.aniso), dz = pos[2] - c.seed[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) { bd = d; best = c.id; }
  }
  return best;
}

let won = false;
function step(dt) {
  gatherCells();
  const pos = player.pos;
  // move intent in yaw frame
  let mx = (input.r - input.l) + stickVec[0];
  let mz = (input.f - input.b) - stickVec[1];
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const sp = input.sprint ? SPRINT : WALK;
  const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
  const dx = (mx * cy + mz * sy) * sp * dt;
  const dz = (mx * sy - mz * cy) * sp * dt;

  const feet = pos[1] - EYE_H;
  const supHere = bestSupport(pos[0], pos[2], feet + 0.15);

  // horizontal move with the climb-grade gate: within-grade slopes rise a
  // few cm per step and pass; anything steeper is refused (and its plane
  // blocks anyway — this is the honesty backstop)
  const nx = pos[0] + dx, nz = pos[2] + dz;
  let allowed = true;
  if (player.grounded && (dx || dz)) {
    const supThere = bestSupport(nx, nz, feet + 0.3);
    if (supThere && supHere) {
      const rise = supThere.y - supHere.y;
      const run = Math.hypot(nx - pos[0], nz - pos[2]);
      if (rise > opts.maxGrade * run + 0.03) allowed = false;   // too steep to climb
    }
  }
  if (allowed) { pos[0] = nx; pos[2] = nz; }

  // vertical: gravity + support snap (no jumping, ever). Land on any floor
  // the feet reached or passed through this substep — tunnel-proof — but
  // never snap UP more than the few cm an in-grade slope rises per step.
  player.vy -= GRAV * dt;
  if (player.vy < -22) player.vy = -22;
  const feetOld = pos[1] - EYE_H;
  pos[1] += player.vy * dt;
  const feetNew = pos[1] - EYE_H;
  const sup = bestSupport(pos[0], pos[2], feetOld + 0.25);
  player.grounded = false;
  if (sup && player.vy <= 0 && feetNew - sup.y < 0.25) {
    pos[1] = sup.y + EYE_H;
    player.vy = 0;
    player.grounded = true;
  }

  collide(pos);

  // chamber handoff through any open face we crossed
  for (let hop = 0; hop < 2; hop++) {
    let moved = false;
    for (const fi of cells[player.cell].faces) {
      const f = faces[fi];
      if (f.boundary || !isOpenFn(fi)) continue;
      const s = outward(f, player.cell);
      const d = (f.n[0] * pos[0] + f.n[1] * pos[1] + f.n[2] * pos[2] - off[fi]) * s;
      if (d > 0.02) { player.cell = f.a === player.cell ? f.b : f.a; moved = true; break; }
    }
    if (!moved) break;
    gatherCells();
  }

  // sanity: fell out of the world or the cell tracker drifted
  if (pos[1] < -4 || pos[1] > pocket.H + 6) respawn();
  if ((frame & 63) === 0) {
    const truly = relocateCell(pos);
    if (truly !== player.cell) player.cell = truly;
  }

  if (!won && player.cell === targetCell && player.grounded) win();
}

function respawn() {
  const c = cells[startCell].centroid;
  const sup = supportAt(pocket, startCell, c[0], c[1] + 2, c[2], isOpenFn);
  player.pos = [c[0], (sup ? sup.y : c[1]) + EYE_H, c[2]];
  player.vy = 0; player.cell = startCell;
  toast('the foam catches you — back at the start chamber');
}

// ------------------------------------------------------------ the tools ----
let breaches = 0;
let hoverFace = -1, hoverPoint = null;
const REACH = 4.6;

function raycast() {
  hoverFace = -1; hoverPoint = null;
  const o = player.pos, dir = lookDir();
  // candidate faces: current chamber + chambers ≤2 open hops away
  let bestT = REACH;
  const seen = new Set([player.cell]);
  const q = [player.cell];
  for (let h = 0; h < q.length && h < 8; h++) {
    for (const fi of cells[q[h]].faces) {
      const f = faces[fi];
      if (!f.boundary && isOpenFn(fi)) {
        const nb = f.a === q[h] ? f.b : f.a;
        if (!seen.has(nb) && q.length < 8) { seen.add(nb); q.push(nb); }
      }
    }
  }
  for (const ci of seen) {
    for (const fi of cells[ci].faces) {
      const f = faces[fi];
      const dn = f.n[0] * dir[0] + f.n[1] * dir[1] + f.n[2] * dir[2];
      if (Math.abs(dn) < 1e-6) continue;
      const t = (off[fi] - (f.n[0] * o[0] + f.n[1] * o[1] + f.n[2] * o[2])) / dn;
      if (t < 0.05 || t >= bestT) continue;
      const p = [o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t];
      if (!pointInFace(f, p)) continue;
      bestT = t; hoverFace = fi; hoverPoint = p;
    }
  }
}
function pointInFace(f, p) {
  const vs = f.verts, n = f.n;
  let sign = 0;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i], b = vs[(i + 1) % vs.length];
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
    const px = p[0] - a[0], py = p[1] - a[1], pz = p[2] - a[2];
    const cx = ey * pz - ez * py, cyv = ez * px - ex * pz, cz = ex * py - ey * px;
    const d = cx * n[0] + cyv * n[1] + cz * n[2];
    if (Math.abs(d) < 1e-7) continue;
    if (sign === 0) sign = Math.sign(d);
    else if (Math.sign(d) !== sign) return false;
  }
  return true;
}

const pending = [];   // [faceId, when, nextState]
function shatter() {
  if (hoverFace < 0) return;
  const f = faces[hoverFace];
  if (f.boundary) { toast('the pocket hull is structural — it does not shatter'); flashNo(); return; }
  if (state[hoverFace] !== 0) return;
  state[hoverFace] = 1; stateT[hoverFace] = now;
  pushFaceState(hoverFace, hoverPoint);
  pending.push([hoverFace, now + DUR_OPEN, 2]);
  breaches++;
  document.getElementById('breaches').textContent = breaches;
}
function weave() {
  if (hoverFace < 0) return;
  const f = faces[hoverFace];
  if (f.boundary) { toast('the pocket hull is structural'); flashNo(); return; }
  if (state[hoverFace] !== 2) return;
  state[hoverFace] = 3; stateT[hoverFace] = now;
  pushFaceState(hoverFace, hoverPoint);
  pending.push([hoverFace, now + DUR_CLOSE, 0]);
}
function settle() {
  for (let i = pending.length - 1; i >= 0; i--) {
    if (now >= pending[i][1]) {
      const [fid, , st] = pending[i];
      state[fid] = st;
      pushFaceState(fid, null);
      pending.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------- HUD ------
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg; toastEl.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.opacity = 0; }, 2200);
}
const ret = document.getElementById('ret');
function flashNo() { ret.classList.add('no'); setTimeout(() => ret.classList.remove('no'), 350); }

let filmOn = true;
function toggleFilm() {
  filmOn = !filmOn;
  document.getElementById('film').classList.toggle('on', filmOn);
}
document.getElementById('film').addEventListener('click', toggleFilm);
document.getElementById('help').addEventListener('click', () => showIntro());

document.getElementById('seedlbl').textContent = 'pocket ' + SEED;
document.getElementById('par').textContent = nav.par;
document.getElementById('seedurl').textContent = '?seed=' + SEED;

function hud() {
  const c = cells[player.cell];
  document.getElementById('loc').textContent =
    'chamber ' + player.cell + ' · layer ' + (c.layer + 1) + '/' + opts.layers +
    (player.grounded ? '' : ' · falling');
  // compass
  const t = cells[targetCell].centroid;
  const bearing = Math.atan2(t[0] - player.pos[0], -(t[2] - player.pos[2]));
  document.getElementById('arrow').style.transform = 'rotate(' + ((bearing - player.yaw) * 180 / Math.PI) + 'deg)';
  const dl = cells[targetCell].layer - c.layer;
  document.getElementById('climb').textContent =
    dl > 0 ? '▲ ' + dl + ' layer' + (dl > 1 ? 's' : '') + ' up' : dl < 0 ? '▼ below you' : 'this layer';
  ret.classList.toggle('aim', hoverFace >= 0);
}

// win / overlays
const intro = document.getElementById('intro'), winEl = document.getElementById('win');
function showIntro() { intro.classList.remove('hidden'); running = false; document.exitPointerLock?.(); }
document.getElementById('start').addEventListener('click', () => {
  intro.classList.add('hidden'); running = true; lockPointer();
});
function win() {
  won = true; running = false;
  document.exitPointerLock?.();
  const t = Math.round(now - startTime);
  const best = +(localStorage.getItem('foam:v1:best:' + SEED) || Infinity);
  if (breaches < best) localStorage.setItem('foam:v1:best:' + SEED, breaches);
  document.getElementById('winline').textContent = breaches + ' breaches · par ' + nav.par;
  document.getElementById('winsub').textContent =
    (breaches <= nav.par ? 'PAR — the certified minimum. ' : breaches - nav.par + ' over the certified minimum. ') +
    t + 's in the foam.' + (best > breaches ? ' New best for this pocket.' : best < Infinity ? ' Best: ' + Math.min(best, breaches) + '.' : '');
  winEl.style.display = 'flex';
}
document.getElementById('next').addEventListener('click', () => { location.search = '?seed=' + (SEED + 1); });
document.getElementById('again').addEventListener('click', () => location.reload());

// ---------------------------------------------------------------- render ---
let DPR = Math.min(devicePixelRatio || 1, 2);
let resScale = 1;
function resize() {
  cv.width = Math.round(innerWidth * DPR * resScale);
  cv.height = Math.round(innerHeight * DPR * resScale);
  gl.viewport(0, 0, cv.width, cv.height);
}
addEventListener('resize', resize);
resize();

// adaptive resolution: sustained slow frames step the buffer down, fast
// frames step it back up (the v109 governor pattern)
let emaDt = 16;
let govFrames = 0;
function governor(dtMs) {
  emaDt = emaDt * 0.95 + dtMs * 0.05;
  if (++govFrames < 90) return;
  govFrames = 0;
  if (emaDt > 23 && resScale > 0.6) { resScale = Math.max(0.6, resScale - 0.15); resize(); }
  else if (emaDt < 13.5 && resScale < 1) { resScale = Math.min(1, resScale + 0.1); resize(); }
}

function sortFaces() {
  const e = player.pos;
  for (let i = 0; i < NF; i++) {
    const c = faces[i].centroid;
    const dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2];
    sortKeys[i] = -(dx * dx + dy * dy + dz * dz);
  }
  const arr = Array.from(sortOrder);
  arr.sort((a, b) => sortKeys[a] - sortKeys[b]);
  let k = 0;
  for (const fid of arr) {
    const blk = faceIndexBlock[fid];
    idxScratch.set(blk, k); k += blk.length;
  }
  // ELEMENT_ARRAY_BUFFER binding is VAO state — bind the VAO first
  gl.bindVertexArray(memVao);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, memIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxScratch, gl.DYNAMIC_DRAW);
  gl.bindVertexArray(null);
}

const uMem = {
  vp: gl.getUniformLocation(memProg, 'uVP'), state: gl.getUniformLocation(memProg, 'uState'),
  time: gl.getUniformLocation(memProg, 'uTime'), film: gl.getUniformLocation(memProg, 'uFilm'),
  eye: gl.getUniformLocation(memProg, 'uEye'), hover: gl.getUniformLocation(memProg, 'uHover'),
  durO: gl.getUniformLocation(memProg, 'uDurOpen'), durC: gl.getUniformLocation(memProg, 'uDurClose'),
};
const uEdge = {
  vp: gl.getUniformLocation(edgeProg, 'uVP'), eye: gl.getUniformLocation(edgeProg, 'uEye'),
  bright: gl.getUniformLocation(edgeProg, 'uBright'),
};
const uBeam = {
  vp: gl.getUniformLocation(beamProg, 'uVP'), eye: gl.getUniformLocation(beamProg, 'uEye'),
  time: gl.getUniformLocation(beamProg, 'uTime'),
};

let filmMix = 1;
let now = 0, startTime = 0, frame = 0;
let last = performance.now();

function draw() {
  const vp = viewProj(cv.width, cv.height);
  gl.clearColor(0.016, 0.023, 0.039, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  // edges first (additive), then sorted membranes over them, beacon last
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(edgeProg);
  gl.uniformMatrix4fv(uEdge.vp, false, vp);
  gl.uniform3fv(uEdge.eye, player.pos);
  gl.uniform1f(uEdge.bright, filmMix < 0.5 ? 1.35 : 0.8);
  gl.bindVertexArray(edgeVao);
  gl.drawArrays(gl.LINES, 0, edgeCount);

  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied
  gl.useProgram(memProg);
  gl.uniformMatrix4fv(uMem.vp, false, vp);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, stateTex);
  gl.uniform1i(uMem.state, 0);
  gl.uniform1f(uMem.time, now);
  gl.uniform1f(uMem.film, filmMix);
  gl.uniform3fv(uMem.eye, player.pos);
  gl.uniform1i(uMem.hover, hoverFace);
  gl.uniform1f(uMem.durO, DUR_OPEN);
  gl.uniform1f(uMem.durC, DUR_CLOSE);
  gl.bindVertexArray(memVao);
  gl.drawElements(gl.TRIANGLES, idxScratch.length, gl.UNSIGNED_INT, 0);

  gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(beamProg);
  gl.uniformMatrix4fv(uBeam.vp, false, vp);
  gl.uniform3fv(uBeam.eye, player.pos);
  gl.uniform1f(uBeam.time, now);
  gl.bindVertexArray(beamVao);
  gl.drawArrays(gl.TRIANGLES, 0, beamCount);
  gl.bindVertexArray(null);
}

function loop(t) {
  const dtMs = Math.min(50, t - last);
  last = t;
  now = t / 1000;
  if (!startTime && running) startTime = now;
  governor(dtMs);
  filmMix += ((filmOn ? 1 : 0) - filmMix) * Math.min(1, dtMs / 180);

  if (running) {
    const dt = dtMs / 1000;
    const n = Math.max(1, Math.ceil(dt / 0.0125));
    for (let i = 0; i < n; i++) step(dt / n);
    raycast();
    settle();
    hud();
  }
  if ((frame & 1) === 0 || pending.length) sortFaces();
  draw();
  frame++;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// debug/selftest hook (read-only probes; harmless in production)
window.__foam = {
  player, pocket, state,
  get hoverFace() { return hoverFace; },
  get breaches() { return breaches; },
  get fps() { return 1000 / emaDt; },
  get won() { return won; },
  targetCell, startCell,
};
