// Polity Spiral — every elected American officeholder since 1789 as one point cloud.
// One dot = one officeholder in one two-year cycle. Layouts are pure functions from the
// active dot set to positions; the GPU tweens between the last two. Picking renders
// dot ids into a 1-pixel scissor so hover costs one draw, not a CPU search.

const $ = s => document.querySelector(s);
const START = 1789, cycleOf = t => Math.floor((t - START + 0.3) / 2);
const yearOf = c => START + 2 * c;
const NC = cycleOf(2026.9) + 1;

// ── geography: lane order for the helix, tile positions for the map
const ORDER = 'US ME NH VT MA RI CT NY NJ PA DE MD VA WV NC SC GA FL KY TN AL MS AR LA OK TX OH MI IN IL WI MN IA MO ND SD NE KS MT WY CO NM ID UT AZ NV WA OR CA AK HI DC PR GU VI AS MP'.split(' ');
const TILES = {
  AK: [0, 0], ME: [10, 0], VT: [9, 1], NH: [10, 1],
  WA: [0, 2], ID: [1, 2], MT: [2, 2], ND: [3, 2], MN: [4, 2], IL: [5, 2], WI: [6, 2], MI: [7, 2], NY: [8, 2], RI: [9, 2], MA: [10, 2],
  OR: [0, 3], NV: [1, 3], WY: [2, 3], SD: [3, 3], IA: [4, 3], IN: [5, 3], OH: [6, 3], PA: [7, 3], NJ: [8, 3], CT: [9, 3],
  CA: [0, 4], UT: [1, 4], CO: [2, 4], NE: [3, 4], MO: [4, 4], KY: [5, 4], WV: [6, 4], VA: [7, 4], MD: [8, 4], DE: [9, 4],
  AZ: [1, 5], NM: [2, 5], KS: [3, 5], AR: [4, 5], TN: [5, 5], NC: [6, 5], SC: [7, 5], DC: [8, 5],
  OK: [3, 6], LA: [4, 6], MS: [5, 6], AL: [6, 6], GA: [7, 6], US: [10, 6],
  HI: [0, 7], TX: [3, 7], FL: [8, 7], PR: [10, 7],
};
const LANES = [['P', 'V'], ['G'], ['S'], ['H'], ['SS'], ['SH']];
const LANE_NAMES = ['Executive', 'Governors', 'U.S. Senate', 'U.S. House', 'State senates', 'State houses'];

// ── state
const S = {
  layout: 'spiral', year: NC - 1, bodies: new Set([0, 1, 2, 3, 4, 5]), state: '',
  sort: 'party', color: 'party', isolate: null, find: '', unk: false,
};
let D; // data
let N = 0; // dots
let dotTerm, dotCycle, dotLane, dotTenure; // per dot
let pos0, pos1, size0, size1, col, hl;
let mixT = 1, mixFrom = 0;

// ── load
const res = await fetch('data/polity.json');
D = await res.json();
$('#loading').remove();
const T = D.terms, P = D.people;
const nTerms = T.p.length;
const UNK = D.families.findIndex(f => f.k === 'U');
const bodyLane = D.bodies.map(b => LANES.findIndex(l => l.includes(b.k)));
const stateRank = D.states.map(s => { const i = ORDER.indexOf(s); return i < 0 ? 900 + D.states.indexOf(s) : i; });

// expand terms → dots (officeholder × cycle seated)
{
  const tc = [], cc = [];
  for (let i = 0; i < nTerms; i++) {
    const a = Math.max(0, cycleOf(T.y0[i])), b = Math.min(NC - 1, Math.max(a, cycleOf(T.y1[i] - 1)));
    for (let c = a; c <= b; c++) { tc.push(i); cc.push(c); }
  }
  N = tc.length;
  dotTerm = Int32Array.from(tc); dotCycle = Int16Array.from(cc);
  dotLane = new Int8Array(N); dotTenure = new Int16Array(N);
  const first = new Map(); // person → first cycle in any office
  for (let d = 0; d < N; d++) { const p = T.p[dotTerm[d]]; const f = first.get(p); if (f == null || dotCycle[d] < f) first.set(p, dotCycle[d]); }
  for (let d = 0; d < N; d++) { const t = dotTerm[d]; dotLane[d] = bodyLane[T.b[t]]; dotTenure[d] = dotCycle[d] - first.get(T.p[t]); }
}
const famCount = new Array(D.families.length).fill(0); for (let d = 0; d < N; d++) famCount[T.f[dotTerm[d]]]++;
pos0 = new Float32Array(N * 3); pos1 = new Float32Array(N * 3);
size0 = new Float32Array(N); size1 = new Float32Array(N);
col = new Float32Array(N * 3); hl = new Float32Array(N);

// ── colours
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const famRGB = D.families.map(f => hex(f.color));
const laneRGB = ['#f0c862', '#e8846a', '#c46ad8', '#4fb3d9', '#7bc96f', '#9aa0ff'].map(hex);
function ramp(t) { // perceptual-ish dark blue → teal → yellow
  const stops = [[0.18, 0.15, 0.45], [0.13, 0.45, 0.6], [0.2, 0.7, 0.5], [0.75, 0.85, 0.25], [0.99, 0.9, 0.3]];
  t = Math.min(0.999, Math.max(0, t)) * (stops.length - 1); const i = Math.floor(t), f = t - i;
  return stops[i].map((v, k) => v + (stops[i + 1][k] - v) * f);
}
function paint() {
  for (let d = 0; d < N; d++) {
    const t = dotTerm[d]; let c;
    if (S.color === 'party') c = famRGB[T.f[t]];
    else if (S.color === 'office') c = laneRGB[dotLane[d]];
    else if (S.color === 'born') { const b = P.b[T.p[t]]; c = b ? ramp((b - 1720) / 290) : [0.3, 0.3, 0.32]; }
    else c = ramp(Math.min(1, dotTenure[d] / 20));
    col.set(c, d * 3);
  }
  upload('col', col);
}
function highlight() {
  const q = S.find.trim().toLowerCase();
  let match = null;
  if (q.length >= 2) { match = new Uint8Array(P.n.length); P.n.forEach((n, i) => { if (n.toLowerCase().includes(q)) match[i] = 1; }); }
  for (let d = 0; d < N; d++) {
    const t = dotTerm[d]; let on = 1;
    if (S.isolate != null && T.f[t] !== S.isolate) on = 0;
    if (match && !match[T.p[t]]) on = 0;
    hl[d] = on ? 1 : 0.13;
  }
  upload('hl', hl);
  if (match) { const n = new Set(); for (let d = 0; d < N; d++) if (hl[d] === 1 && match[T.p[dotTerm[d]]]) n.add(T.p[dotTerm[d]]); $('#stats').dataset.find = n.size; }
  stats();
}

// ── active set + sort
function active() {
  const st = S.state ? D.states.indexOf(S.state) : -1;
  const out = [];
  for (let d = 0; d < N; d++) {
    if (!S.bodies.has(dotLane[d])) continue;
    if (!S.unk && T.f[dotTerm[d]] === UNK) continue;
    if (st >= 0 && T.s[dotTerm[d]] !== st && !(dotLane[d] === 0)) continue;
    out.push(d);
  }
  return Int32Array.from(out);
}
function sortKey(d) {
  const t = dotTerm[d];
  switch (S.sort) {
    case 'party': return T.f[t] * 1e6 + T.pl[t] * 100 + (stateRank[T.s[t]] % 100);
    case 'state': return (stateRank[T.s[t]]) * 1e4 + T.f[t] * 100;
    case 'born': return (P.b[T.p[t]] || 3000) * 100 + T.f[t];
    case 'tenure': return -dotTenure[d] * 100 + T.f[t];
  }
}
// group dots by key fn, each group sorted by sortKey. returns Map key -> Int32Array
function groups(act, keyFn) {
  const m = new Map();
  for (const d of act) { const k = keyFn(d); let a = m.get(k); if (!a) m.set(k, a = []); a.push(d); }
  for (const [k, a] of m) { const ks = new Float64Array(a.length); a.forEach((d, i) => ks[i] = sortKey(d)); const idx = a.map((_, i) => i).sort((x, y) => ks[x] - ks[y]); m.set(k, idx.map(i => a[i])); }
  return m;
}

// ── layouts: each fills pos1/size1 for active dots; everything else size 0
const LAYOUTS = {
  spiral: { name: 'Spiral', flat: true, ext: [2.15, 2.15], cam: { yaw: 0, pitch: Math.PI / 2, dist: 2.6, target: [0, 0, 0] } },
  helix: { name: 'States in 3D', flat: false, ext: [1.7, 1.7], cam: { yaw: 0.5, pitch: 0.75, dist: 2.4, target: [0, 0, 0.05] } },
  stream: { name: 'Timeline', flat: true, ext: [2.6, 1.8], cam: { yaw: 0, pitch: Math.PI / 2, dist: 2.3, target: [0, 0, 0] } },
  chamber: { name: 'Chambers', flat: true, slice: true, ext: [2.5, 1.85], cam: { yaw: 0, pitch: Math.PI / 2, dist: 2.4, target: [0, 0, 0] } },
  map: { name: 'Map', flat: true, slice: true, ext: [2.5, 2.05], cam: { yaw: 0, pitch: Math.PI / 2, dist: 2.3, target: [0, 0, 0] } },
};
let labels = []; // overlay text in world coords: [x,y,z,text,align,size]

function layout() {
  size1.fill(0);
  const act = active();
  labels = [];
  LAY[S.layout](act);
  stats(act.length);
}
const activeLanes = () => [...S.bodies].sort((a, b) => a - b);

const LAY = {
  spiral(act) {
    const R0 = 0.1, k = (1 - R0) / NC, lanes = activeLanes(), L = lanes.length;
    const g = groups(act, d => dotCycle[d] * 8 + dotLane[d]);
    for (const [key, a] of g) {
      const c = Math.floor(key / 8), li = lanes.indexOf(key % 8), n = a.length;
      const laneW = k * 0.86 / L;
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n, u = c + f, th = 2 * Math.PI * f;
        const r = R0 + k * u + laneW * (li + 0.5) - k * 0.43;
        const d = a[i];
        pos1[d * 3] = r * Math.sin(th); pos1[d * 3 + 1] = r * Math.cos(th); pos1[d * 3 + 2] = 0;
        size1[d] = Math.min(2 * Math.PI * r / n * 1.6, laneW * 1.15);
      }
    }
    for (let c = 0; c < NC; c += 10) { const r = R0 + k * c; labels.push([-0.004, r, 0, String(yearOf(c)), 'right', c % 50 ? 0 : 1]); }
  },
  helix(act) {
    const CPT = 30, turns = NC / CPT, R0 = 0.12, K = (1 - R0) / turns;
    const sts = [...new Set([...act].map(d => T.s[dotTerm[d]]))].sort((a, b) => stateRank[a] - stateRank[b]);
    const nS = sts.length, laneW = K * 0.9 / nS;
    const sIdx = new Map(sts.map((s, i) => [s, i]));
    const g = groups(act, d => dotCycle[d] * 1000 + sIdx.get(T.s[dotTerm[d]]));
    const zs = S.state ? 5 : 1;
    for (const [key, a] of g) {
      const c = Math.floor(key / 1000), si = key % 1000, n = a.length;
      const th0 = 2 * Math.PI * c / CPT, dth = 2 * Math.PI / CPT;
      const rBase = R0 + K * (c / CPT) + laneW * (si + 0.5) - K * 0.45;
      const arc = rBase * dth * 0.9, dsz = Math.min(laneW, arc) * 0.95;
      const cols = Math.max(1, Math.floor(arc / dsz));
      for (let i = 0; i < n; i++) {
        const cx = i % cols, row = Math.floor(i / cols);
        const th = th0 + dth * 0.05 + (cx + 0.5) * dsz / rBase;
        const d = a[i];
        pos1[d * 3] = rBase * Math.sin(th); pos1[d * 3 + 1] = rBase * Math.cos(th); pos1[d * 3 + 2] = (row + 0.5) * dsz * 1.2 * zs;
        size1[d] = dsz;
      }
    }
    for (let c = 0; c < NC; c += 15) { const th = 2 * Math.PI * c / CPT, r = R0 + K * (c / CPT) + K * 0.5; labels.push([r * Math.sin(th), r * Math.cos(th), 0, String(yearOf(c)), 'left', c % 30 ? 0 : 1]); }
    if (nS <= 60) {
      const c = NC - 1, th = 2 * Math.PI * (c + 1) / CPT;
      sts.forEach((s, i) => { if (nS > 12 && i % 3) return; const r = R0 + K * (c / CPT) + laneW * (i + 0.5) - K * 0.45; labels.push([r * Math.sin(th), r * Math.cos(th), 0, D.states[s], 'left', 0]); });
    }
  },
  stream(act) {
    const lanes = activeLanes(), L = lanes.length, W = 2.4, H = 1.5, gap = 0.04;
    const lh = (H - gap * (L - 1)) / L, cw = W / NC;
    const g = groups(act, d => dotCycle[d] * 8 + dotLane[d]);
    for (const [key, a] of g) {
      const c = Math.floor(key / 8), li = lanes.indexOf(key % 8), n = a.length;
      const y0 = H / 2 - li * (lh + gap) - lh;
      const sz = Math.min(cw, Math.sqrt(cw * lh / n) * 1.1);
      for (let i = 0; i < n; i++) {
        const d = a[i], jit = ((i * 0.6180339) % 1) - 0.5;
        pos1[d * 3] = -W / 2 + (c + 0.5 + jit * 0.8) * cw; pos1[d * 3 + 1] = y0 + lh * (1 - (i + 0.5) / n); pos1[d * 3 + 2] = 0;
        size1[d] = sz;
      }
    }
    lanes.forEach((l, li) => labels.push([-W / 2, H / 2 - li * (lh + gap) + 0.013, 0, LANE_NAMES[l], 'left', 1]));
    for (let c = 0; c < NC; c += 10) labels.push([-W / 2 + (c + 0.5) * cw, -H / 2 - 0.04, 0, String(yearOf(c)), 'center', c % 25 ? 0 : 1]);
  },
  chamber(act) {
    const lanes = activeLanes(), y = S.year;
    const g = groups(act.filter(d => dotCycle[d] === y), d => dotLane[d]);
    const present = lanes.filter(l => g.get(l)?.length);
    const cols = present.length <= 2 ? present.length : present.length <= 4 ? 2 : 3;
    const rows = Math.ceil(present.length / cols);
    const cellW = 2.4 / Math.max(1, cols), cellH = 1.5 / Math.max(1, rows);
    present.forEach((l, i) => {
      const a = g.get(l), cx = -1.2 + cellW * (i % cols + 0.5), cy = 0.75 - cellH * (Math.floor(i / cols) + 0.5) - cellH * 0.25;
      const R = Math.min(cellW * 0.46, cellH * 0.8);
      hemicycle(a, cx, cy, R);
      labels.push([cx, cy - 0.05, 0, `${LANE_NAMES[l]} · ${a.length}`, 'center', 1]);
    });
    labels.push([0, 0.82, 0, `${yearOf(y)}–${yearOf(y) + 1}`, 'center', 2]);
  },
  map(act) {
    const y = S.year, tile = 2.4 / 11;
    const g = groups(act.filter(d => dotCycle[d] === y), d => T.s[dotTerm[d]]);
    for (const [s, a] of g) {
      const code = D.states[s]; const tp = TILES[code] || [10, 0.0 + 0];
      if (!TILES[code]) continue;
      const x0 = -1.2 + tp[0] * tile, y0 = 0.85 - tp[1] * tile, inner = tile * 0.9, n = a.length;
      const cols = Math.max(3, Math.ceil(Math.sqrt(n))), sz = inner / cols;
      for (let i = 0; i < n; i++) {
        const d = a[i];
        pos1[d * 3] = x0 + (i % cols + 0.5) * sz; pos1[d * 3 + 1] = y0 - (Math.floor(i / cols) + 0.5) * sz; pos1[d * 3 + 2] = 0;
        size1[d] = sz * 0.92;
      }
      labels.push([x0, y0 + 0.012, 0, code, 'left', 0]);
    }
    labels.push([0, 1.0, 0, `${yearOf(y)}–${yearOf(y) + 1}`, 'center', 2]);
  },
};
function hemicycle(a, cx, cy, R) {
  const n = a.length; if (!n) return;
  const r0 = 0.35;
  let rows = 1; while (true) { // seats that fit with `rows` rows
    const sp = (1 - r0) / rows; let cap = 0;
    for (let j = 0; j < rows; j++) cap += Math.floor(Math.PI * (r0 + sp * (j + 0.5)) / sp);
    if (cap >= n || rows > 60) break; rows++;
  }
  const sp = (1 - r0) / rows, radii = [], caps = [];
  let tot = 0; for (let j = 0; j < rows; j++) { radii.push(r0 + sp * (j + 0.5)); tot += radii[j]; }
  let left = n; for (let j = 0; j < rows; j++) { const c = j === rows - 1 ? left : Math.round(n * radii[j] / tot); caps.push(c); left -= c; }
  const seats = [];
  for (let j = 0; j < rows; j++) for (let s = 0; s < caps[j]; s++) { const ang = Math.PI * (caps[j] === 1 ? 0.5 : s / (caps[j] - 1)); seats.push([Math.PI - ang, radii[j]]); }
  seats.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  seats.reverse();
  for (let i = 0; i < n; i++) {
    const d = a[i], [ang, r] = seats[i];
    pos1[d * 3] = cx + R * r * Math.cos(ang); pos1[d * 3 + 1] = cy + R * r * Math.sin(ang); pos1[d * 3 + 2] = 0;
    size1[d] = Math.min(R * sp * 0.85, R * 0.09);
  }
}

// ── WebGL2
const cv = $('#gl'), ov = $('#ov'), ctx = ov.getContext('2d');
const gl = cv.getContext('webgl2', { antialias: true });
if (!gl) document.body.insertAdjacentHTML('beforeend', '<div id="loading">This needs WebGL2.</div>');
const VS = `#version 300 es
in vec3 p0; in vec3 p1; in float s0; in float s1; in vec3 c; in float h;
uniform mat4 mvp; uniform float t, px, minPx, pick, hov;
out vec3 vc; out float vh; flat out int vid;
void main(){
  float s = mix(s0, s1, t); vec3 p = mix(p0, p1, t);
  if (s0 <= 0. && t < 1.) p = p1; if (s1 <= 0.) p = p0;
  gl_Position = mvp * vec4(p, 1.);
  float ps = s * px / gl_Position.w;
  ps = s > 0. ? max(ps, pick > .5 ? max(minPx, 7.) : minPx) : 0.;
  if (s <= 0.) gl_Position = vec4(2., 2., 2., 1.);
  bool isH = float(gl_VertexID) == hov;
  gl_PointSize = isH ? max(ps * 2.2, 9.) : ps;
  vc = isH ? vec3(1.) : c * (h < .5 ? .28 : 1.); vh = h; vid = gl_VertexID;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vc; in float vh; flat in int vid; uniform float pick, bg; out vec4 o;
void main(){
  vec2 q = gl_PointCoord * 2. - 1.; float r = dot(q, q);
  if (pick > .5) { if (r > 1. || vh < .5) discard; int i = vid + 1; o = vec4(float(i & 255), float((i >> 8) & 255), float((i >> 16) & 255), 255.) / 255.; return; }
  if (r > 1.) discard;
  o = vec4(vh < .5 ? mix(vec3(bg), vc, .55) : vc, 1.);
}`;
function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; }
const prog = gl.createProgram();
gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
gl.useProgram(prog);
const U = {}; for (const u of ['mvp', 't', 'px', 'minPx', 'pick', 'hov', 'bg']) U[u] = gl.getUniformLocation(prog, u);
const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
const bufs = {};
function attr(name, n) { const b = gl.createBuffer(); const loc = gl.getAttribLocation(prog, name); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0); bufs[name] = b; }
attr('p0', 3); attr('p1', 3); attr('s0', 1); attr('s1', 1); attr('c', 3); attr('h', 1);
const map = { pos0: 'p0', pos1: 'p1', size0: 's0', size1: 's1', col: 'c', hl: 'h' };
function upload(name, arr) { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[map[name] || name]); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW); }
const pickFB = gl.createFramebuffer(), pickTex = gl.createRenderbuffer(), pickDepth = gl.createRenderbuffer();
gl.enable(gl.DEPTH_TEST);

// ── camera
const cam = { yaw: 0, pitch: Math.PI / 2, dist: 2.6, target: [0, 0, 0], fov: 0.7 };
let camFrom = null, camTo = null, camT = 1;
function mat(c, aspect) {
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const eye = [c.target[0] + c.dist * cp * Math.sin(c.yaw), c.target[1] - c.dist * cp * Math.cos(c.yaw), c.target[2] + c.dist * sp];
  const up = sp > 0.999 ? [Math.sin(c.yaw), Math.cos(c.yaw), 0] : [0, 0, 1];
  const z = norm(sub(eye, c.target)), x = norm(cross(up, z)), y = cross(z, x);
  const V = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  const f = 1 / Math.tan(c.fov / 2), nr = 0.01, fr = 50;
  const Pm = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (fr + nr) / (nr - fr), -1, 0, 0, 2 * fr * nr / (nr - fr), 0];
  return { M: mul(Pm, V), eye, x, y, z };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
function mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
function project(M, p) { const x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15]; return w > 0 ? [(x / w * 0.5 + 0.5) * W, (0.5 - y / w * 0.5) * H, w] : null; }
// world point on the z=0 plane under a screen pixel
function unproject(sx, sy) {
  const m = mat(cam, W / H), f = Math.tan(cam.fov / 2);
  const nx = (sx / W * 2 - 1) * f * W / H, ny = (1 - sy / H * 2) * f;
  const dir = norm([m.x[0] * nx + m.y[0] * ny - m.z[0], m.x[1] * nx + m.y[1] * ny - m.z[1], m.x[2] * nx + m.y[2] * ny - m.z[2]]);
  if (Math.abs(dir[2]) < 1e-6) return null; const tt = -m.eye[2] / dir[2]; if (tt < 0) return null;
  return [m.eye[0] + dir[0] * tt, m.eye[1] + dir[1] * tt, 0];
}

// fit a layout's extent into the part of the screen the panel and header leave free
function fitCam(k) {
  const L = LAYOUTS[k], c = { ...L.cam, target: [...L.cam.target] };
  const side = W > 700 ? 324 : 0, top = W > 700 ? 56 : 64, bottom = W > 700 ? 0 : 56;
  const aw = Math.max(200, W - side), ah = Math.max(200, H - top - bottom), tf = 2 * Math.tan(cam.fov / 2);
  const hNeed = Math.max(L.ext[1] * H / ah, L.ext[0] * W / aw * H / W);
  c.dist = hNeed / tf * (L.flat ? 1 : 1.25);
  const wpp = hNeed / H;
  c.target[0] += side / 2 * wpp; c.target[1] += (top - bottom) / 2 * wpp * (L.flat ? 1 : 0.5);
  return c;
}

// ── frame
let W = 0, H = 0, DPR = 1, dirty = true, hover = -1, pinned = -1;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  for (const c of [cv, ov]) { c.width = W * DPR; c.height = H * DPR; }
  gl.bindRenderbuffer(gl.RENDERBUFFER, pickTex); gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, W * DPR, H * DPR);
  gl.bindRenderbuffer(gl.RENDERBUFFER, pickDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, W * DPR, H * DPR);
  gl.bindFramebuffer(gl.FRAMEBUFFER, pickFB);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, pickTex);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, pickDepth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  dirty = true;
}
addEventListener('resize', resize);
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const bgRGB = () => { const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number); return c.map(v => v / 255); };
let BG = [0, 0, 0];
function uniforms(M, pick) {
  gl.uniformMatrix4fv(U.mvp, false, M);
  gl.uniform1f(U.t, ease(mixT)); gl.uniform1f(U.px, H * DPR / (2 * Math.tan(cam.fov / 2)));
  gl.uniform1f(U.minPx, 1.6 * DPR); gl.uniform1f(U.pick, pick); gl.uniform1f(U.hov, pinned >= 0 ? pinned : hover); gl.uniform1f(U.bg, (BG[0] + BG[1] + BG[2]) / 3);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (mixT < 1) { mixT = Math.min(1, mixT + dt / 1.1); dirty = true; }
  if (camT < 1) {
    camT = Math.min(1, camT + dt / 1.1); const e = ease(camT);
    for (const k of ['yaw', 'pitch', 'dist']) cam[k] = camFrom[k] + (camTo[k] - camFrom[k]) * e;
    cam.target = camFrom.target.map((v, i) => v + (camTo.target[i] - v) * e); dirty = true;
  }
  if (playing && now - playLast > 280) { playLast = now; S.year = (S.year + 1) % NC; $('#year').value = S.year; onYear(); }
  if (dirty) { draw(); dirty = false; }
  requestAnimationFrame(frame);
}
let curM;
function draw() {
  const m = mat(cam, W / H); curM = m.M;
  gl.viewport(0, 0, W * DPR, H * DPR);
  gl.clearColor(BG[0], BG[1], BG[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  uniforms(m.M, 0); gl.drawArrays(gl.POINTS, 0, N);
  drawLabels(m.M);
}
function drawLabels(M) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  if (mixT < 0.85) return;
  const ink = getComputedStyle(document.body).color;
  ctx.fillStyle = ink; ctx.textBaseline = 'middle';
  for (const [x, y, z, t, al, big] of labels) {
    const p = project(M, [x, y, z]); if (!p) continue;
    ctx.globalAlpha = big === 2 ? 0.9 : big ? 0.75 : 0.45;
    ctx.font = big === 2 ? '600 22px ui-serif, Georgia, serif' : big ? '600 11px ui-sans-serif, system-ui' : '10px ui-sans-serif, system-ui';
    ctx.textAlign = al; ctx.fillText(t, p[0] + (al === 'left' ? 4 : al === 'right' ? -4 : 0), p[1]);
  }
  ctx.globalAlpha = 1;
}
function pickAt(sx, sy) {
  if (!curM) return -1;
  gl.bindFramebuffer(gl.FRAMEBUFFER, pickFB);
  gl.viewport(0, 0, W * DPR, H * DPR);
  const px = Math.floor(sx * DPR), py = Math.floor((H - sy) * DPR);
  gl.enable(gl.SCISSOR_TEST); gl.scissor(px, py, 1, 1);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  uniforms(curM, 1); gl.drawArrays(gl.POINTS, 0, N);
  const o = new Uint8Array(4); gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, o);
  gl.disable(gl.SCISSOR_TEST); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return (o[0] | o[1] << 8 | o[2] << 16) - 1;
}

// ── transitions
function relayout(camToo) {
  pos0.set(blend(pos0, pos1)); size0.set(blendS(size0, size1));
  upload('pos0', pos0); upload('size0', size0);
  layout();
  upload('pos1', pos1); upload('size1', size1);
  mixT = 0;
  if (camToo) { camFrom = { ...cam, target: [...cam.target] }; camTo = fitCam(S.layout); camT = 0; }
  dirty = true;
}
// current on-screen state = mix(pos0,pos1,ease(mixT))
function blend(a, b) { const e = ease(mixT); if (e >= 1) return b; const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] + (b[i] - a[i]) * e; for (let d = 0; d < N; d++) { if (size0[d] <= 0) { o[d * 3] = b[d * 3]; o[d * 3 + 1] = b[d * 3 + 1]; o[d * 3 + 2] = b[d * 3 + 2]; } if (size1[d] <= 0) { o[d * 3] = a[d * 3]; o[d * 3 + 1] = a[d * 3 + 1]; o[d * 3 + 2] = a[d * 3 + 2]; } } return o; }
function blendS(a, b) { const e = ease(mixT); if (e >= 1) return b; const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] + (b[i] - a[i]) * e; return o; }

// ── interaction
let ptrs = new Map(), dragged = false, downAt = null, pinch = null;
const flat = () => LAYOUTS[S.layout].flat && cam.pitch > 1.4;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey });
  if (ptrs.size === 1) { dragged = false; downAt = { x: e.clientX, y: e.clientY }; }
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
  camT = 1;
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p) { if (e.pointerType === 'mouse') hoverAt(e.clientX, e.clientY); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) dragged = true;
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    zoomAt(mx, my, pinch.d / d); pan(mx - pinch.mx, my - pinch.my); pinch = { d, mx, my }; return;
  }
  if (!dragged) return;
  const orbit = !flat() ? !(p.b === 2 || p.shift) : (p.b === 2 || p.shift);
  if (orbit) { cam.yaw -= dx * 0.006; cam.pitch = Math.max(0.05, Math.min(Math.PI / 2, cam.pitch + dy * 0.006)); dirty = true; }
  else pan(dx, dy);
  hideTip();
});
function pan(dx, dy) {
  const a = unproject(W / 2, H / 2), b = unproject(W / 2 - dx, H / 2 - dy);
  if (a && b) { cam.target = [cam.target[0] + b[0] - a[0], cam.target[1] + b[1] - a[1], cam.target[2]]; }
  else { const s = cam.dist * 0.0015; cam.target = [cam.target[0] - dx * s, cam.target[1] + dy * s, cam.target[2]]; }
  dirty = true;
}
function zoomAt(sx, sy, f) {
  const before = unproject(sx, sy);
  cam.dist = Math.max(0.02, Math.min(12, cam.dist * f));
  const after = unproject(sx, sy);
  if (before && after) cam.target = [cam.target[0] + before[0] - after[0], cam.target[1] + before[1] - after[1], cam.target[2]];
  dirty = true;
}
const up = e => {
  const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
  if (p && !dragged && ptrs.size === 0 && e.type === 'pointerup') {
    const id = pickAt(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') { if (id >= 0) openWiki(id); }
    else { if (id >= 0) { pinned = id; showTip(id, e.clientX, e.clientY, true); } else { pinned = -1; hideTip(); } dirty = true; }
  }
};
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); hideTip(); }, { passive: false });
cv.addEventListener('pointerleave', () => { if (pinned < 0) { hover = -1; hideTip(); dirty = true; } });
let hoverRAF = 0;
function hoverAt(x, y) {
  if (hoverRAF) return;
  hoverRAF = requestAnimationFrame(() => {
    hoverRAF = 0;
    const id = pickAt(x, y);
    if (id !== hover) { hover = id; dirty = true; }
    if (id >= 0) showTip(id, x, y, false); else hideTip();
    cv.style.cursor = id >= 0 ? 'pointer' : 'grab';
  });
}

// ── tooltip + Wikipedia
const tip = $('#tip'), wikiCache = new Map();
function wikiTitle(pi) { const w = P.w[pi]; return w === '=' ? P.n[pi] : w; }
function wikiURL(pi) { const w = wikiTitle(pi); return w ? 'https://en.wikipedia.org/wiki/' + encodeURIComponent(w.replace(/ /g, '_')) : P.q[pi] ? 'https://www.wikidata.org/wiki/' + P.q[pi] : null; }
function openWiki(d) { const u = wikiURL(T.p[dotTerm[d]]); if (u) window.open(u, '_blank', 'noopener'); }
function office(t) {
  const b = D.bodies[T.b[t]].k, st = D.states[T.s[t]];
  switch (b) {
    case 'P': return 'President of the United States';
    case 'V': return 'Vice President of the United States';
    case 'G': return `Governor of ${st}`;
    case 'S': return `U.S. Senator from ${st}`;
    case 'H': return `U.S. Representative, ${st}${T.d[t] !== '' ? '-' + T.d[t] : ''}`;
    case 'SS': return `${st} state senator`;
    case 'SH': return `${st} state representative`;
  }
}
const fy = y => Math.floor(y);
let tipFor = -1, tipTimer = 0;
function showTip(d, x, y, pin) {
  const t = dotTerm[d], pi = T.p[t], fam = D.families[T.f[t]];
  if (tipFor !== d || pin !== tip.classList.contains('pinned')) {
    tipFor = d;
    const label = D.partyLabels[T.pl[t]];
    const url = wikiURL(pi), hasWiki = !!wikiTitle(pi);
    tip.innerHTML = `<div class="nm"></div><div class="of"></div><div class="pt"><i style="background:${fam.color}"></i><span></span></div><div class="wk"></div>
      ${url ? `<a class="go" target="_blank" rel="noopener" href="${url}">${hasWiki ? 'Open on Wikipedia' : 'Open on Wikidata'} ↗</a>` : ''}<div class="hint">${url ? 'Click to open ' + (hasWiki ? 'Wikipedia' : 'Wikidata') : 'No article'}</div>`;
    tip.querySelector('.nm').textContent = P.n[pi] + (P.b[pi] ? ` (b. ${P.b[pi]})` : '');
    tip.querySelector('.of').textContent = `${office(t)} · ${fy(T.y0[t])}–${T.y1[t] > 2026.5 ? 'present' : fy(T.y1[t])} · seen in ${yearOf(dotCycle[d])}`;
    tip.querySelector('.pt span').textContent = label === fam.name || label === 'Unknown' ? fam.name : `${label}`;
    clearTimeout(tipTimer);
    if (hasWiki) tipTimer = setTimeout(() => summary(wikiTitle(pi)).then(s => { if (tipFor !== d || !s) return; const el = tip.querySelector('.wk'); el.innerHTML = (s.img ? `<img alt="" src="${s.img}">` : '') + '<p></p>'; el.querySelector('p').textContent = s.text; place(); }), pin ? 0 : 220);
  }
  tip.classList.toggle('pinned', pin);
  tip.style.display = 'block'; tip._x = x; tip._y = y; place();
}
function place() {
  if (innerWidth <= 700) return;
  const r = tip.getBoundingClientRect(); let x = tip._x + 16, y = tip._y + 16;
  if (x + r.width > innerWidth - 8) x = tip._x - r.width - 16; if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
  tip.style.left = x + 'px'; tip.style.top = Math.max(8, y) + 'px';
}
function hideTip() { if (pinned >= 0) return; tip.style.display = 'none'; tipFor = -1; clearTimeout(tipTimer); }
async function summary(title) {
  if (wikiCache.has(title)) return wikiCache.get(title);
  const p = fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')))
    .then(r => r.ok ? r.json() : null).then(j => j && { text: j.extract, img: j.thumbnail?.source }).catch(() => null);
  wikiCache.set(title, p); return p;
}

// ── controls
function seg(el, items, get, set) {
  el.innerHTML = '';
  for (const [k, label] of items) {
    const b = document.createElement('button'); b.textContent = label; b.dataset.k = k;
    b.onclick = () => { set(k); [...el.children].forEach(c => c.classList.toggle('on', get(c.dataset.k))); };
    b.classList.toggle('on', get(k)); el.appendChild(b);
  }
}
seg($('#layouts'), Object.entries(LAYOUTS).map(([k, v]) => [k, v.name]), k => S.layout === k, k => { S.layout = k; $('#yearbox').classList.toggle('show', !!LAYOUTS[k].slice); relayout(true); saveHash(); });
seg($('#bodies'), LANE_NAMES.map((n, i) => [i, n]), k => S.bodies.has(+k), k => { k = +k; if (S.bodies.has(k)) { if (S.bodies.size > 1) S.bodies.delete(k); } else S.bodies.add(k); relayout(false); saveHash(); });
seg($('#sorts'), [['party', 'Party'], ['state', 'State'], ['born', 'Birth year'], ['tenure', 'Tenure']], k => S.sort === k, k => { S.sort = k; relayout(false); saveHash(); });
seg($('#colors'), [['party', 'Party'], ['office', 'Office'], ['born', 'Born'], ['tenure', 'Tenure']], k => S.color === k, k => { S.color = k; paint(); dirty = true; saveHash(); });
const stSel = $('#state');
for (const s of [...D.states].sort((a, b) => stateRank[D.states.indexOf(a)] - stateRank[D.states.indexOf(b)])) { if (s === 'US') continue; const o = document.createElement('option'); o.value = o.textContent = s; stSel.appendChild(o); }
stSel.onchange = () => { S.state = stSel.value; relayout(false); saveHash(); };
function legend() {
  const el = $('#legend'); el.innerHTML = '';
  D.families.forEach((f, i) => {
    if (!famCount[i]) return;
    const b = document.createElement('button'); b.className = 'chip' + (S.isolate != null && S.isolate !== i ? ' off' : '');
    b.innerHTML = `<i style="background:${f.color}"></i><span></span>`; b.querySelector('span').textContent = f.name;
    b.title = famCount[i].toLocaleString() + ' officeholder-cycles';
    if (i === UNK) {
      b.classList.toggle('off', !S.unk); b.title += S.unk ? ' — tap to hide' : ' — hidden; tap to show';
      b.onclick = () => { S.unk = !S.unk; legend(); relayout(false); saveHash(); };
    } else b.onclick = () => { S.isolate = S.isolate === i ? null : i; legend(); highlight(); dirty = true; };
    el.appendChild(b);
  });
}
legend();
let findT; $('#find').oninput = e => { clearTimeout(findT); findT = setTimeout(() => { S.find = e.target.value; highlight(); dirty = true; }, 150); };
let playing = false, playLast = 0;
function onYear() { S.year = +$('#year').value; $('#yearlabel').textContent = yearOf(S.year); relayout(false); }
$('#year').max = NC - 1; $('#year').value = S.year; $('#year').oninput = () => { onYear(); saveHash(); };
$('#play').onclick = () => { playing = !playing; $('#play').textContent = playing ? '❚❚' : '▶'; if (playing && S.year >= NC - 1) S.year = -1; };
$('#toggle').onclick = () => { $('#panel').classList.toggle('open'); pinned = -1; hideTip(); dirty = true; };
function stats(nAct) {
  if (nAct != null) stats.n = nAct;
  const f = $('#stats').dataset.find;
  $('#stats').innerHTML = `${(stats.n ?? N).toLocaleString()} of ${N.toLocaleString()} officeholder-cycles shown${S.unk ? '' : ` (${famCount[UNK].toLocaleString()} with no recorded party hidden — tap its chip to show)`} · ${P.n.length.toLocaleString()} people${S.find.trim().length >= 2 ? ` · ${f} match “${S.find.replace(/[<&]/g, '')}”` : ''}<br>
    Data: <a href="https://github.com/unitedstates/congress-legislators" target="_blank" rel="noopener">congress-legislators</a> (Congress, complete) and <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a> (presidents, governors, state legislatures — as complete as Wikidata is). Built ${D.built}. Drag to ${LAYOUTS[S.layout].flat ? 'pan, shift/right-drag to tilt' : 'orbit, shift/right-drag to pan'}; scroll or pinch to zoom.`;
}
function saveHash() {
  const h = new URLSearchParams({ v: S.layout, u: S.unk ? 1 : 0, y: yearOf(S.year), o: [...S.bodies].join(''), s: S.state, sort: S.sort, c: S.color });
  history.replaceState(null, '', '#' + h);
}
function loadHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (LAYOUTS[h.get('v')]) S.layout = h.get('v');
  if (h.get('u') === '1') S.unk = true;
  if (h.get('y')) S.year = Math.max(0, Math.min(NC - 1, cycleOf(+h.get('y') + 0.2)));
  if (h.get('o')) S.bodies = new Set([...h.get('o')].map(Number).filter(n => n >= 0 && n < 6));
  if (h.get('s') && D.states.includes(h.get('s'))) S.state = h.get('s');
  if (['party', 'state', 'born', 'tenure'].includes(h.get('sort'))) S.sort = h.get('sort');
  if (['party', 'office', 'born', 'tenure'].includes(h.get('c'))) S.color = h.get('c');
}
loadHash();
for (const id of ['#layouts', '#bodies', '#sorts', '#colors']) [...$(id).children].forEach(b => b.classList.toggle('on', id === '#layouts' ? S.layout === b.dataset.k : id === '#bodies' ? S.bodies.has(+b.dataset.k) : id === '#sorts' ? S.sort === b.dataset.k : S.color === b.dataset.k));
stSel.value = S.state; $('#year').value = S.year; $('#yearlabel').textContent = yearOf(S.year);
$('#yearbox').classList.toggle('show', !!LAYOUTS[S.layout].slice);

// ── go
BG = bgRGB();
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { BG = bgRGB(); dirty = true; });
resize();
Object.assign(cam, fitCam(S.layout));
paint(); highlight();
layout(); pos0.set(pos1); size0.set(size1);
for (const k of ['pos0', 'pos1', 'size0', 'size1']) upload(k, { pos0, pos1, size0, size1 }[k]);
mixT = 1;
requestAnimationFrame(frame);
window.__polity = { S, N, D, pickAt, relayout, cam };
