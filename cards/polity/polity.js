// Polity Spiral — every elected American officeholder since 1789 as one point cloud.
// One dot = one officeholder in one two-year cycle. Each dot is drawn as an instanced quad
// that fills the cell its layout gives it (an arc segment on the spiral, a tile on a wall in
// 3D, a grid cell on the timeline), so zooming in never opens up empty space: the cells
// grow, stay tiled, and once they are big enough the names are written into them.
// Layouts are pure functions from the active dot set to cells; the GPU tweens between the
// last two. Picking renders instance ids into a 1-pixel scissor.

const $ = s => document.querySelector(s);
const START = 1789, cycleOf = t => Math.floor((t - START + 0.3) / 2);
const yearOf = c => START + 2 * c;

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

// ── load
const D = await (await fetch('data/polity.json')).json();
$('#loading').remove();
const T = D.terms, P = D.people;
const nTerms = T.p.length;
let lastStart = 0; for (let i = 0; i < nTerms; i++) if (T.y0[i] > lastStart) lastStart = T.y0[i];
const NC = cycleOf(Math.max(2026.9, lastStart)) + 1;       // the 2027 cycle exists once 2026 results are in
const C26 = cycleOf(2027.01);                                // the cycle the Nov 2026 winners take office in
const UNK = D.families.findIndex(f => f.k === 'U');
const bodyLane = D.bodies.map(b => LANES.findIndex(l => l.includes(b.k)));
const stateRank = D.states.map(s => { const i = ORDER.indexOf(s); return i < 0 ? 900 + D.states.indexOf(s) : i; });
const K = T.k || new Array(nTerms).fill(0), F2 = T.f2 || new Array(nTerms).fill(-1), X = T.x || new Array(nTerms).fill(-1);
const E26 = D.e2026 || null;

// ── state
const S = {
  layout: 'spiral', year: NC - 1, bodies: new Set([0, 1, 2, 3, 4, 5]), state: '',
  sort: 'party', color: 'party', isolate: null, find: '', unk: false, mark: 'none',
};

// expand terms → dots (officeholder × cycle seated)
let N, dotTerm, dotCycle, dotLane, dotTenure;
{
  const tc = [], cc = [];
  for (let i = 0; i < nTerms; i++) {
    const a = Math.max(0, cycleOf(T.y0[i])), b = Math.min(NC - 1, Math.max(a, cycleOf(T.y1[i] - 1)));
    for (let c = a; c <= b; c++) { tc.push(i); cc.push(c); }
  }
  N = tc.length;
  dotTerm = Int32Array.from(tc); dotCycle = Int16Array.from(cc);
  dotLane = new Int8Array(N); dotTenure = new Int16Array(N);
  const first = new Map();
  for (let d = 0; d < N; d++) { const p = T.p[dotTerm[d]]; const f = first.get(p); if (f == null || dotCycle[d] < f) first.set(p, dotCycle[d]); }
  for (let d = 0; d < N; d++) { const t = dotTerm[d]; dotLane[d] = bodyLane[T.b[t]]; dotTenure[d] = dotCycle[d] - first.get(T.p[t]); }
}
const famCount = new Array(D.families.length).fill(0); for (let d = 0; d < N; d++) famCount[T.f[dotTerm[d]]]++;

// per-dot cell: centre + two half-extent axes, for the "from" and "to" layouts
const G = { p0: new Float32Array(N * 3), u0: new Float32Array(N * 3), v0: new Float32Array(N * 3),
            p1: new Float32Array(N * 3), u1: new Float32Array(N * 3), v1: new Float32Array(N * 3), b0: new Float32Array(N), b1: new Float32Array(N),
            c: new Float32Array(N * 3), c2: new Float32Array(N * 3), h: new Float32Array(N), k: new Float32Array(N) };
let mixT = 1;
let activeList = new Int32Array(0);

// ── colours
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const famRGB = D.families.map(f => hex(f.color));
const PEND = [[0.62, 0.6, 0.56], [0.86, 0.84, 0.79]];
const laneRGB = ['#f0c862', '#e8846a', '#c46ad8', '#4fb3d9', '#7bc96f', '#9aa0ff'].map(hex);
function ramp(t) {
  const stops = [[0.18, 0.15, 0.45], [0.13, 0.45, 0.6], [0.2, 0.7, 0.5], [0.75, 0.85, 0.25], [0.99, 0.9, 0.3]];
  t = Math.min(0.999, Math.max(0, t)) * (stops.length - 1); const i = Math.floor(t), f = t - i;
  return stops[i].map((v, k) => v + (stops[i + 1][k] - v) * f);
}
function colorOf(d) {
  const t = dotTerm[d];
  if (S.color === 'party') return famRGB[T.f[t]];
  if (S.color === 'office') return laneRGB[dotLane[d]];
  if (S.color === 'born') { const b = P.b[T.p[t]]; return b ? ramp((b - 1720) / 290) : [0.3, 0.3, 0.32]; }
  return ramp(Math.min(1, dotTenure[d] / 20));
}
function paint() {
  for (let d = 0; d < N; d++) {
    const t = dotTerm[d]; let c = colorOf(d), c2 = c;
    if (K[t] === 2 && S.color === 'party') {
      // not yet called: stripes of the two leaders, or a neutral "pending" stripe when no one leads yet
      if (T.f[t] === UNK) { c = PEND[0]; c2 = PEND[1]; } else c2 = F2[t] >= 0 && F2[t] !== UNK ? famRGB[F2[t]] : PEND[1];
    }
    G.c.set(c, d * 3); G.c2.set(c2, d * 3);
    G.k[d] = K[t];
  }
  upload('c', G.c); upload('c2', G.c2); upload('k', G.k);
}
function highlight() {
  const q = S.find.trim().toLowerCase();
  let match = null;
  if (q.length >= 2) { match = new Uint8Array(P.n.length); P.n.forEach((n, i) => { if (n.toLowerCase().includes(q)) match[i] = 1; }); }
  let found = new Set();
  for (let d = 0; d < N; d++) {
    const t = dotTerm[d]; let on = 1;
    if (S.isolate != null && T.f[t] !== S.isolate) on = 0;
    if (match && !match[T.p[t]]) on = 0;
    if (S.mark === 'new' && !(K[t] >= 1)) on = 0;
    if (S.mark === 'flip' && K[t] !== 3) on = 0;
    if (S.mark === 'open' && K[t] !== 2) on = 0;
    G.h[d] = on ? 1 : 0;
    if (on && match) found.add(T.p[t]);
  }
  upload('h', G.h);
  stats.found = match ? found.size : null;
  stats();
}

// ── active set + sort
function active() {
  const st = S.state ? D.states.indexOf(S.state) : -1;
  const out = [];
  for (let d = 0; d < N; d++) {
    if (!S.bodies.has(dotLane[d])) continue;
    if (!S.unk && T.f[dotTerm[d]] === UNK && K[dotTerm[d]] !== 2) continue;
    if (st >= 0 && T.s[dotTerm[d]] !== st && dotLane[d] !== 0) continue;
    out.push(d);
  }
  return Int32Array.from(out);
}
function sortKey(d) {
  const t = dotTerm[d];
  switch (S.sort) {
    case 'party': return T.f[t] * 1e6 + T.pl[t] * 100 + (stateRank[T.s[t]] % 100);
    case 'state': return stateRank[T.s[t]] * 1e4 + T.f[t] * 100;
    case 'born': return (P.b[T.p[t]] || 3000) * 100 + T.f[t];
    case 'tenure': return -dotTenure[d] * 100 + T.f[t];
  }
}
function groups(act, keyFn) {
  const m = new Map();
  for (const d of act) { const k = keyFn(d); let a = m.get(k); if (!a) m.set(k, a = []); a.push(d); }
  for (const [k, a] of m) { const ks = new Float64Array(a.length); a.forEach((d, i) => ks[i] = sortKey(d)); const idx = a.map((_, i) => i).sort((x, y) => ks[x] - ks[y]); m.set(k, idx.map(i => a[i])); }
  return m;
}
// write one cell into the "to" layout
function cell(d, x, y, z, ux, uy, uz, vx, vy, vz, bend = 0) {
  const i = d * 3; G.b1[d] = bend;
  G.p1[i] = x; G.p1[i + 1] = y; G.p1[i + 2] = z;
  G.u1[i] = ux; G.u1[i + 1] = uy; G.u1[i + 2] = uz;
  G.v1[i] = vx; G.v1[i + 1] = vy; G.v1[i + 2] = vz;
}
const square = (d, x, y, half) => cell(d, x, y, 0, half, 0, 0, 0, half, 0);

// ── layouts
const LAYOUTS = {
  spiral: { name: 'Spiral', flat: true, ext: [2.15, 2.15], cam: { yaw: 0, pitch: Math.PI / 2, target: [0, 0, 0] } },
  helix: { name: 'States in 3D', flat: false, ext: [1.7, 1.7], cam: { yaw: 0.5, pitch: 0.75, target: [0, 0, 0.05] } },
  stream: { name: 'Timeline', flat: true, ext: [2.6, 1.8], cam: { yaw: 0, pitch: Math.PI / 2, target: [0, 0, 0] } },
  chamber: { name: 'Chambers', flat: true, slice: true, ext: [2.5, 1.85], cam: { yaw: 0, pitch: Math.PI / 2, target: [0, 0, 0] } },
  map: { name: 'Map', flat: true, slice: true, ext: [2.5, 2.05], cam: { yaw: 0, pitch: Math.PI / 2, target: [0, 0, 0] } },
};
// labels: [x, y, z, text, align, level]; level 3 always wins room, level 0 only when there is space
let labels = [];
const activeLanes = () => [...S.bodies].sort((a, b) => a - b);
const cycleLabel = c => c === C26 && E26 ? `${yearOf(c)} · elected Nov 3, 2026` : String(yearOf(c));

const LAY = {
  spiral(act) {
    const R0 = 0.1, k = (1 - R0) / NC, lanes = activeLanes(), L = lanes.length;
    const laneW = k * 0.9 / L;
    const g = groups(act, d => dotCycle[d] * 8 + dotLane[d]);
    for (const [key, a] of g) {
      const c = Math.floor(key / 8), li = lanes.indexOf(key % 8), n = a.length;
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n, th = 2 * Math.PI * f;
        const r = R0 + k * (c + f) + laneW * (li + 0.5) - k * 0.45;
        const s = Math.sin(th), co = Math.cos(th);
        // tangential half-length: the arc it owns, capped so a long chord does not leave the ring
        const ht = Math.PI * r / n, hr = laneW * 0.5;
        cell(a[i], r * s, r * co, 0, ht * co, -ht * s, 0, hr * s, hr * co, 0, 1 / r);
      }
    }
    for (let c = 0; c < NC; c++) { const r = R0 + k * c + k * 0.05; labels.push([-0.002, r, 0, cycleLabel(c), 'right', c === C26 ? 3 : c % 25 === 0 ? 3 : c % 5 === 0 ? 2 : 0]); }
    // lane names at the 12 o'clock seam, readable only when zoomed in
    for (let c = 0; c < NC; c += 1) lanes.forEach((l, li) => { const r = R0 + k * c + laneW * (li + 0.5) - k * 0.45 + k; labels.push([0.002, r, 0, LANE_NAMES[l], 'left', -1]); });
  },
  helix(act) {
    const CPT = 30, turns = NC / CPT, R0 = 0.12, KK = (1 - R0) / turns;
    const sts = [...new Set([...act].map(d => T.s[dotTerm[d]]))].sort((a, b) => stateRank[a] - stateRank[b]);
    const nS = sts.length, laneW = KK * 0.9 / nS;
    const sIdx = new Map(sts.map((s, i) => [s, i]));
    const g = groups(act, d => dotCycle[d] * 1000 + sIdx.get(T.s[dotTerm[d]]));
    const zs = S.state ? 5 : 1;
    for (const [key, a] of g) {
      const c = Math.floor(key / 1000), si = key % 1000, n = a.length;
      const th0 = 2 * Math.PI * c / CPT, dth = 2 * Math.PI / CPT;
      const r = R0 + KK * (c / CPT) + laneW * (si + 0.5) - KK * 0.45;
      const arc = r * dth * 0.92, dsz = Math.min(laneW, arc) * 0.95, dz = dsz * 1.2 * zs;
      const cols = Math.max(1, Math.floor(arc / dsz));
      for (let i = 0; i < n; i++) {
        const cx = i % cols, row = Math.floor(i / cols);
        const th = th0 + dth * 0.04 + (cx + 0.5) * dsz / r, s = Math.sin(th), co = Math.cos(th);
        cell(a[i], r * s, r * co, (row + 0.5) * dz, co * dsz / 2, -s * dsz / 2, 0, 0, 0, dz / 2);
      }
    }
    for (let c = 0; c < NC; c += 5) { const th = 2 * Math.PI * c / CPT, r = R0 + KK * (c / CPT) + KK * 0.5; labels.push([r * Math.sin(th), r * Math.cos(th), 0, cycleLabel(c), 'left', c === C26 ? 3 : c % 15 ? 1 : 2]); }
    { const c = NC - 1, th = 2 * Math.PI * (c + 1) / CPT;
      sts.forEach((s, i) => { const r = R0 + KK * (c / CPT) + laneW * (i + 0.5) - KK * 0.45; labels.push([r * Math.sin(th), r * Math.cos(th), 0, D.states[s], 'left', 0]); }); }
  },
  stream(act) {
    const lanes = activeLanes(), L = lanes.length, W = 2.4, H = 1.5, gap = 0.04;
    const lh = (H - gap * (L - 1)) / L, cw = W / NC;
    const g = groups(act, d => dotCycle[d] * 8 + dotLane[d]);
    for (const [key, a] of g) {
      const c = Math.floor(key / 8), li = lanes.indexOf(key % 8), n = a.length;
      const top = H / 2 - li * (lh + gap), w = cw * 0.94;
      const cols = Math.max(1, Math.round(Math.sqrt(n * w / lh))), rows = Math.ceil(n / cols);
      const cwid = w / cols, chgt = lh / rows;
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / cols), col = i % cols;
        cell(a[i], -W / 2 + c * cw + (col + 0.5) * cwid + cw * 0.03, top - (row + 0.5) * chgt, 0, cwid / 2, 0, 0, 0, chgt / 2, 0);
      }
    }
    lanes.forEach((l, li) => labels.push([-W / 2, H / 2 - li * (lh + gap) + 0.013, 0, LANE_NAMES[l], 'left', 3]));
    for (let c = 0; c < NC; c++) labels.push([-W / 2 + (c + 0.5) * cw, -H / 2 - 0.035, 0, String(yearOf(c)), 'center', c === C26 ? 3 : c % 25 === 0 ? 3 : c % 5 === 0 ? 2 : 0]);
  },
  chamber(act) {
    const lanes = activeLanes(), y = S.year;
    const g = groups(act.filter(d => dotCycle[d] === y), d => dotLane[d]);
    const present = lanes.filter(l => g.get(l)?.length);
    const tall = W / H < 0.85, HH = tall ? 2.7 : 1.5;
    LAYOUTS.chamber.ext = [2.5, HH + 0.4];
    const cols = present.length <= 2 ? present.length : present.length <= 4 || tall ? 2 : 3;
    const rows = Math.ceil(present.length / cols);
    const cellW = 2.4 / Math.max(1, cols), cellH = HH / Math.max(1, rows);
    present.forEach((l, i) => {
      const a = g.get(l), cx = -1.2 + cellW * (i % cols + 0.5), cy = HH / 2 - cellH * (Math.floor(i / cols) + 0.5) - cellH * 0.25;
      const R = Math.min(cellW * 0.46, cellH * 0.8);
      hemicycle(a, cx, cy, R);
      labels.push([cx, cy - 0.045, 0, `${LANE_NAMES[l]} · ${a.length}`, 'center', 3]);
      labels.push([cx, cy - 0.09, 0, tally(a).slice(3), 'center', 2]);
    });
    labels.push([0, HH / 2 + 0.1, 0, `${yearOf(y)}–${yearOf(y) + 1}`, 'center', 4]);
    if (y === C26 && E26) labels.push([0, HH / 2 + 0.03, 0, `elected Nov 3, 2026 · results as of ${E26.asOf}`, 'center', 3.5]);
  },
  map(act) {
    const y = S.year, tile = 2.4 / 11;
    const g = groups(act.filter(d => dotCycle[d] === y), d => T.s[dotTerm[d]]);
    for (const [s, a] of g) {
      const code = D.states[s], tp = TILES[code]; if (!tp) continue;
      const x0 = -1.2 + tp[0] * tile, y0 = 0.85 - tp[1] * tile, inner = tile * 0.9, n = a.length;
      const cols = Math.max(3, Math.ceil(Math.sqrt(n))), sz = inner / cols;
      for (let i = 0; i < n; i++) square(a[i], x0 + (i % cols + 0.5) * sz, y0 - (Math.floor(i / cols) + 0.5) * sz, sz * 0.5);
      labels.push([x0, y0 + 0.012, 0, code, 'left', 3]);
    }
    labels.push([0, 1.0, 0, `${yearOf(y)}–${yearOf(y) + 1}${y === C26 && E26 ? ' · elected Nov 3, 2026' : ''}`, 'center', 4]);
  },
};
// " · D 51 R 47 …" for a chamber label: the top two families
function tally(a) {
  const c = new Map(); for (const d of a) { if (K[dotTerm[d]] === 2) continue; const f = T.f[dotTerm[d]]; c.set(f, (c.get(f) || 0) + 1); }
  const top = [...c].sort((x, y) => y[1] - x[1]).slice(0, 3).filter(([, n]) => n > 0);
  const undecided = a.filter(d => K[dotTerm[d]] === 2).length;
  return ' · ' + top.map(([f, n]) => `${D.families[f].k === 'U' ? 'party unrecorded' : D.families[f].name.split(/[ -]/)[0]} ${n}`).join(', ') + (undecided ? `, ${undecided} uncalled` : '');
}
function hemicycle(a, cx, cy, R) {
  const n = a.length; if (!n) return;
  const r0 = 0.35;
  let rows = 1; while (true) {
    const sp = (1 - r0) / rows; let cap = 0;
    for (let j = 0; j < rows; j++) cap += Math.floor(Math.PI * (r0 + sp * (j + 0.5)) / sp);
    if (cap >= n || rows > 60) break; rows++;
  }
  const sp = (1 - r0) / rows, radii = [], caps = [];
  let tot = 0; for (let j = 0; j < rows; j++) { radii.push(r0 + sp * (j + 0.5)); tot += radii[j]; }
  let left = n; for (let j = 0; j < rows; j++) { const c = j === rows - 1 ? left : Math.round(n * radii[j] / tot); caps.push(c); left -= c; }
  const seats = [];
  for (let j = 0; j < rows; j++) for (let s = 0; s < caps[j]; s++) { const ang = Math.PI * (caps[j] === 1 ? 0.5 : s / (caps[j] - 1)); seats.push([Math.PI - ang, radii[j]]); }
  seats.sort((p, q) => q[0] - p[0] || p[1] - q[1]);
  const half = Math.min(R * sp * 0.46, R * 0.05);
  for (let i = 0; i < n; i++) { const [ang, r] = seats[i]; square(a[i], cx + R * r * Math.cos(ang), cy + R * r * Math.sin(ang), half); }
}
function layout() {
  G.u1.fill(0); G.v1.fill(0); G.b1.fill(0);
  activeList = active();
  labels = [];
  LAY[S.layout](activeList);
  stats(activeList.length);
}

// ── WebGL2: instanced quads
const cv = $('#gl'), ov = $('#ov'), ctx = ov.getContext('2d');
const gl = cv.getContext('webgl2', { antialias: true, alpha: false });
if (!gl) document.body.insertAdjacentHTML('beforeend', '<div id="loading">This needs WebGL2.</div>');
const VS = `#version 300 es
in vec2 q;
in vec3 p0; in vec3 u0; in vec3 v0; in vec3 p1; in vec3 u1; in vec3 v1; in float b0; in float b1;
in vec3 c; in vec3 c2; in float h; in float k;
uniform mat4 mvp; uniform float t, minPx, pick, hov; uniform vec2 vp;
out vec2 vq; out vec2 vsz; out vec3 vc; out vec3 vc2; out float vh; out float vk; out float vhov; flat out int vid;
void main(){
  bool a0 = dot(u0, u0) > 0., a1 = dot(u1, u1) > 0.;
  vec3 P = mix(p0, p1, t), U = mix(u0, u1, t), V = mix(v0, v1, t);
  if (!a0) { P = p1; U = u1 * t; V = v1 * t; }
  if (!a1) { P = p0; U = u0 * (1. - t); V = v0 * (1. - t); }
  if ((!a0 && !a1) || (pick > .5 && h < .5)) { gl_Position = vec4(2., 2., 2., 1.); return; }
  vec4 cc = mvp * vec4(P, 1.);
  if (cc.w <= 0.) { gl_Position = vec4(2., 2., 2., 1.); return; }
  vec4 cu = mvp * vec4(P + U, 1.), cv = mvp * vec4(P + V, 1.);
  vec2 sc = cc.xy / cc.w, su = cu.xy / cu.w - sc, sv = cv.xy / cv.w - sc;
  float lu = length(su * vp * .5), lv = length(sv * vp * .5);   // half-extent in px
  bool isH = float(gl_InstanceID) == hov;
  float m = (pick > .5 ? max(minPx, 3.5) : minPx) * .5;
  if (isH) m = max(m, 7.);
  float fu = lu < m ? m / max(lu, 1e-7) : 1., fv = lv < m ? m / max(lv, 1e-7) : 1.;
  if (lu < 1e-6) su = vec2(1., 0.) / (vp * .5) * 1e-6;
  if (lv < 1e-6) sv = vec2(0., 1.) / (vp * .5) * 1e-6;
  float bend = mix(b0, b1, t);
  if (bend > 0.) {
    // a curved cell: lay it along its arc in world space, widened to the minimum pixel size
    float lU = length(U) * fu, lV = length(V) * fv, R = 1. / bend;
    vec3 Vh = V / max(length(V), 1e-12), Uh = U / max(length(U), 1e-12), C = P - Vh * R;
    float a = clamp(q.x * lU * bend, -3.1416, 3.1416), rr = R + q.y * lV;
    gl_Position = mvp * vec4(C + rr * (cos(a) * Vh + sin(a) * Uh), 1.);
  } else {
    vec2 off = q.x * su * fu + q.y * sv * fv;
    gl_Position = vec4((sc + off) * cc.w, cc.z, cc.w);
  }
  vq = q; vsz = vec2(max(lu * fu, m), max(lv * fv, m));
  vc = c; vc2 = c2; vh = h; vk = k; vhov = isH ? 1. : 0.; vid = gl_InstanceID;
}`;
const FS = `#version 300 es
precision highp float;
in vec2 vq; in vec2 vsz; in vec3 vc; in vec3 vc2; in float vh; in float vk; in float vhov; flat in int vid;
uniform float pick; uniform vec3 bg, ink; out vec4 o;
void main(){
  vec2 p = vq * vsz;                          // px from centre
  float gap = clamp(min(vsz.x, vsz.y) * .12, 0., 1.2);
  vec2 b = vsz - gap;
  float r = min(b.x, b.y) * .95;               // fully rounded short side: a disc when square
  vec2 qq = abs(p) - b + r;
  float d = length(max(qq, 0.)) + min(max(qq.x, qq.y), 0.) - r;
  if (pick > .5) { if (d > .5) discard; int i = vid + 1; o = vec4(float(i & 255), float((i >> 8) & 255), float((i >> 16) & 255), 255.) / 255.; return; }
  float cov = clamp(.5 - d, 0., 1.);
  if (cov <= 0.) discard;
  vec3 col = vc;
  if (vk > 1.5 && vk < 2.5) col = mod(gl_FragCoord.x + gl_FragCoord.y, 7.) < 3.5 ? vc : vc2;   // uncalled: stripes of the two leaders
  float edge = -d;                                                                          // px inside the edge
  float ring = min(b.x, b.y) > 3. ? 1.4 : 0.;
  if ((vk > 2.5 || vhov > .5) && edge < ring + (vhov > .5 ? 1. : 0.)) col = ink;             // flipped seat or hover: outline
  if (vh < .5) col = mix(bg, col, .22);
  o = vec4(col, cov);
}`;
function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; }
const prog = gl.createProgram();
gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
gl.useProgram(prog);
const U = {}; for (const u of ['mvp', 't', 'minPx', 'pick', 'hov', 'vp', 'bg', 'ink']) U[u] = gl.getUniformLocation(prog, u);
const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
const bufs = {};
function attr(name, n, divisor) {
  const b = gl.createBuffer(), loc = gl.getAttribLocation(prog, name);
  gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(loc, divisor);
  bufs[name] = b;
}
attr('q', 2, 0);
const SEG = 16, NV = 2 * (SEG + 1);
{ const q = []; for (let i = 0; i <= SEG; i++) { const x = -1 + 2 * i / SEG; q.push(x, -1, x, 1); }
  gl.bindBuffer(gl.ARRAY_BUFFER, bufs.q); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(q), gl.STATIC_DRAW); }
for (const [n, c] of [['p0', 3], ['u0', 3], ['v0', 3], ['p1', 3], ['u1', 3], ['v1', 3], ['b0', 1], ['b1', 1], ['c', 3], ['c2', 3], ['h', 1], ['k', 1]]) attr(n, c, 1);
function upload(name, arr) { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[name]); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW); }
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
  const f = 1 / Math.tan(c.fov / 2), nr = Math.max(1e-5, c.dist * 0.01), fr = c.dist * 20 + 5;
  const Pm = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (fr + nr) / (nr - fr), -1, 0, 0, 2 * fr * nr / (nr - fr), 0];
  return { M: mul(Pm, V), eye, x, y, z };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
function mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
function project(M, x, y, z) { const X = M[0] * x + M[4] * y + M[8] * z + M[12], Y = M[1] * x + M[5] * y + M[9] * z + M[13], Wc = M[3] * x + M[7] * y + M[11] * z + M[15]; return Wc > 0 ? [(X / Wc * 0.5 + 0.5) * W, (0.5 - Y / Wc * 0.5) * H, Wc] : null; }
function unproject(sx, sy) {
  const m = mat(cam, W / H), f = Math.tan(cam.fov / 2);
  const nx = (sx / W * 2 - 1) * f * W / H, ny = (1 - sy / H * 2) * f;
  const dir = norm([m.x[0] * nx + m.y[0] * ny - m.z[0], m.x[1] * nx + m.y[1] * ny - m.z[1], m.x[2] * nx + m.y[2] * ny - m.z[2]]);
  if (Math.abs(dir[2]) < 1e-6) return null; const tt = -m.eye[2] / dir[2]; if (tt < 0) return null;
  return [m.eye[0] + dir[0] * tt, m.eye[1] + dir[1] * tt, 0];
}
function fitCam(k) {
  const L = LAYOUTS[k], c = { ...L.cam, target: [...L.cam.target], fov: cam.fov };
  const side = W > 700 ? 324 : 0, top = Math.max(56, document.querySelector('header').getBoundingClientRect().bottom + 8), bottom = W > 700 ? 0 : 56;
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
const cssRGB = prop => { const c = getComputedStyle(document.body)[prop].match(/\d+/g).map(Number); return c.slice(0, 3).map(v => v / 255); };
let BG = [0, 0, 0], INK = [1, 1, 1];
function uniforms(M, pick) {
  gl.uniformMatrix4fv(U.mvp, false, M);
  gl.uniform1f(U.t, ease(mixT)); gl.uniform2f(U.vp, W * DPR, H * DPR);
  gl.uniform1f(U.minPx, 1.6 * DPR); gl.uniform1f(U.pick, pick); gl.uniform1f(U.hov, pinned >= 0 ? pinned : hover);
  gl.uniform3fv(U.bg, BG); gl.uniform3fv(U.ink, INK);
}
let last = performance.now(), playing = false, playLast = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (mixT < 1) { mixT = Math.min(1, mixT + dt / 1.1); dirty = true; }
  if (camT < 1) {
    camT = Math.min(1, camT + dt / 1.1); const e = ease(camT);
    for (const k of ['yaw', 'pitch']) cam[k] = camFrom[k] + (camTo[k] - camFrom[k]) * e;
    cam.dist = Math.exp(Math.log(camFrom.dist) + (Math.log(camTo.dist) - Math.log(camFrom.dist)) * e);
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
  gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  uniforms(m.M, 0); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, NV, N);
  gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  overlay(m.M);
}

// ── overlay: decluttered axis labels, then names written into cells big enough to hold them
const boxes = [];
const hit = (x0, y0, x1, y1) => { for (const b of boxes) if (x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]) return true; return false; };
function overlay(M) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  if (mixT < 0.9) return;
  boxes.length = 0;
  const ink = getComputedStyle(document.body).color;
  ctx.textBaseline = 'middle';
  // panel and header are not drawing room
  if (W > 700) boxes.push([W - 324, 0, W, H]);
  const order = labels.map((l, i) => i).sort((a, b) => labels[b][5] - labels[a][5]);
  for (const i of order) {
    const [x, y, z, t, al, lv] = labels[i];
    const p = project(M, x, y, z); if (!p || p[0] < -50 || p[0] > W + 50 || p[1] < -20 || p[1] > H + 20) continue;
    if (lv < 0 && cam.dist > 0.25) continue;
    ctx.font = lv >= 4 ? `600 ${W < 700 ? 17 : 22}px ui-serif, Georgia, serif` : lv >= 2 ? '600 11px ui-sans-serif, system-ui' : '10px ui-sans-serif, system-ui';
    const w = ctx.measureText(t).width, h = lv >= 4 ? 26 : 13;
    const x0 = al === 'left' ? p[0] + 4 : al === 'right' ? p[0] - 4 - w : p[0] - w / 2;
    if (lv < 4 && hit(x0 - 2, p[1] - h / 2, x0 + w + 2, p[1] + h / 2)) continue;
    boxes.push([x0 - 2, p[1] - h / 2, x0 + w + 2, p[1] + h / 2]);
    ctx.globalAlpha = lv >= 3 ? 0.9 : lv >= 2 ? 0.7 : 0.5;
    ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.fillText(t, x0, p[1]);
  }
  ctx.globalAlpha = 1;
  names(M);
}
const surname = n => { const p = n.replace(/,? (Jr\.?|Sr\.?|II|III|IV)$/, '').split(' '); return p[p.length - 1]; };
function names(M) {
  // cheap gate: names only appear once a typical cell is a few dozen px across
  let drawn = 0;
  const e = ease(mixT);
  for (let j = 0; j < activeList.length && drawn < 700; j++) {
    const d = activeList[j], i = d * 3;
    const x = G.p1[i], y = G.p1[i + 1], z = G.p1[i + 2];
    const p = project(M, x, y, z); if (!p || p[0] < -40 || p[0] > W + 40 || p[1] < -20 || p[1] > H + 20) continue;
    const pu = project(M, x + G.u1[i], y + G.u1[i + 1], z + G.u1[i + 2]); if (!pu) continue;
    const ux = pu[0] - p[0], uy = pu[1] - p[1], lu = Math.hypot(ux, uy);
    if (lu < 14) continue;
    const pv = project(M, x + G.v1[i], y + G.v1[i + 1], z + G.v1[i + 2]); if (!pv) continue;
    let lv = Math.hypot(pv[0] - p[0], pv[1] - p[1]);
    // write along the long side
    let ang = Math.atan2(uy, ux), along = lu, across = lv;
    if (lv > lu * 1.3) { ang = Math.atan2(pv[1] - p[1], pv[0] - p[0]); along = lv; across = lu; }
    if (across < 4.5) continue;
    if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    const t = dotTerm[d], nm = P.n[T.p[t]];
    const fs = Math.min(13, across * 1.25, 2 * along / 4);
    if (fs < 6.5) continue;
    ctx.font = `${fs >= 10 ? 600 : 500} ${fs}px ui-sans-serif, system-ui`;
    let txt = nm; if (ctx.measureText(txt).width > along * 1.85) txt = surname(nm);
    if (ctx.measureText(txt).width > along * 1.85) continue;
    const c = G.c.subarray(i, i + 3), lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang);
    ctx.fillStyle = G.h[d] < 0.5 ? 'rgba(128,128,128,.5)' : lum > 0.55 ? 'rgba(0,0,0,.85)' : 'rgba(255,255,255,.95)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 0, across > fs * 2.6 ? -fs * 0.55 : 0);
    if (across > fs * 2.6) { ctx.font = `400 ${fs * 0.8}px ui-sans-serif, system-ui`; ctx.globalAlpha = 0.8; ctx.fillText(`${yearOf(dotCycle[d])} · ${D.families[T.f[t]].name}`, 0, fs * 0.6); ctx.globalAlpha = 1; }
    ctx.restore(); drawn++;
  }
}
function pickAt(sx, sy) {
  if (!curM) return -1;
  gl.bindFramebuffer(gl.FRAMEBUFFER, pickFB);
  gl.viewport(0, 0, W * DPR, H * DPR);
  const px = Math.floor(sx * DPR), py = Math.floor((H - sy) * DPR);
  gl.enable(gl.SCISSOR_TEST); gl.scissor(px, py, 1, 1);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  uniforms(curM, 1); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, NV, N);
  const o = new Uint8Array(4); gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, o);
  gl.disable(gl.SCISSOR_TEST); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return (o[0] | o[1] << 8 | o[2] << 16) - 1;
}

// ── transitions
function relayout(camToo) {
  const e = ease(mixT);
  if (e < 1) { // freeze the on-screen tween as the new "from"
    for (const [a, b] of [['p0', 'p1'], ['u0', 'u1'], ['v0', 'v1']]) {
      const A = G[a], B = G[b];
      for (let d = 0; d < N; d++) {
        const i = d * 3, has0 = G.u0[i] || G.u0[i + 1] || G.u0[i + 2] || G.v0[i] || G.v0[i + 1] || G.v0[i + 2];
        const has1 = G.u1[i] || G.u1[i + 1] || G.u1[i + 2] || G.v1[i] || G.v1[i + 1] || G.v1[i + 2];
        for (let k = 0; k < 3; k++) A[i + k] = has0 && has1 ? A[i + k] + (B[i + k] - A[i + k]) * e : has1 ? (a === 'p0' ? B[i + k] : B[i + k] * e) : (a === 'p0' ? A[i + k] : A[i + k] * (1 - e));
      }
    }
    for (let d = 0; d < N; d++) G.b0[d] = G.b0[d] + (G.b1[d] - G.b0[d]) * e;
  } else { G.p0.set(G.p1); G.u0.set(G.u1); G.v0.set(G.v1); G.b0.set(G.b1); }
  const extBefore = LAYOUTS.chamber.ext[1];
  layout();
  for (const k of ['p0', 'u0', 'v0', 'p1', 'u1', 'v1', 'b0', 'b1']) upload(k, G[k]);
  mixT = 0;
  if (camToo || (S.layout === 'chamber' && LAYOUTS.chamber.ext[1] !== extBefore)) { camFrom = { ...cam, target: [...cam.target] }; camTo = fitCam(S.layout); camT = 0; }
  dirty = true;
}

// ── interaction
const ptrs = new Map(); let dragged = false, downAt = null, pinch = null;
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
    zoomAt(mx, my, pinch.d / Math.max(1, d)); pan(mx - pinch.mx, my - pinch.my); pinch = { d, mx, my }; return;
  }
  if (!dragged) return;
  const orbit = !flat() ? !(p.b === 2 || p.shift) : (p.b === 2 || p.shift);
  if (orbit) { cam.yaw -= dx * 0.006; cam.pitch = Math.max(0.05, Math.min(Math.PI / 2, cam.pitch + dy * 0.006)); dirty = true; }
  else pan(dx, dy);
  if (pinned < 0) hideTip();
});
function pan(dx, dy) {
  const a = unproject(W / 2, H / 2), b = unproject(W / 2 - dx, H / 2 - dy);
  if (a && b) cam.target = [cam.target[0] + b[0] - a[0], cam.target[1] + b[1] - a[1], cam.target[2]];
  else { const s = cam.dist * 0.0015; cam.target = [cam.target[0] - dx * s, cam.target[1] + dy * s, cam.target[2]]; }
  dirty = true;
}
function zoomAt(sx, sy, f) {
  const before = unproject(sx, sy);
  cam.dist = Math.max(0.0008, Math.min(12, cam.dist * f));
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
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); if (pinned < 0) hideTip(); }, { passive: false });
cv.addEventListener('pointerleave', () => { if (pinned < 0) { hover = -1; hideTip(); dirty = true; } });
cv.addEventListener('dblclick', e => { zoomAt(e.clientX, e.clientY, 0.35); });
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
  const b = D.bodies[T.b[t]].k, st = D.states[T.s[t]], dist = T.d[t] !== '' && T.d[t] != null ? T.d[t] : '';
  switch (b) {
    case 'P': return 'President of the United States';
    case 'V': return 'Vice President of the United States';
    case 'G': return `Governor of ${st}`;
    case 'S': return `U.S. Senator from ${st}`;
    case 'H': return `U.S. Representative, ${st}${dist !== '' ? '-' + dist : ''}`;
    case 'SS': return `${st} state senator${dist !== '' ? ', district ' + dist : ''}`;
    case 'SH': return `${st} state representative${dist !== '' ? ', district ' + dist : ''}`;
  }
}
let tipFor = -1, tipTimer = 0;
function showTip(d, x, y, pin) {
  const t = dotTerm[d], pi = T.p[t], fam = D.families[T.f[t]];
  if (tipFor !== d || pin !== tip.classList.contains('pinned')) {
    tipFor = d;
    const label = D.partyLabels[T.pl[t]], url = wikiURL(pi), hasWiki = !!wikiTitle(pi), k = K[t];
    const note = X[t] >= 0 ? D.notes[X[t]] : '';
    tip.innerHTML = `<div class="nm"></div><div class="of"></div><div class="pt"><i></i><span></span></div><div class="nt"></div><div class="wk"></div>
      ${url ? `<a class="go" target="_blank" rel="noopener" href="${url}">${hasWiki ? 'Open on Wikipedia' : 'Open on Wikidata'} ↗</a>` : ''}<div class="hint">${url ? 'Click to open ' + (hasWiki ? 'Wikipedia' : 'Wikidata') : 'No article'}</div>`;
    tip.querySelector('.pt i').style.background = k === 2 ? `repeating-linear-gradient(45deg, ${fam.color} 0 3px, ${D.families[F2[t]]?.color || fam.color} 3px 6px)` : fam.color;
    tip.querySelector('.nm').textContent = k === 2 ? P.n[pi] : P.n[pi] + (P.b[pi] ? ` (b. ${P.b[pi]})` : '');
    const span = T.y0[t] > 2026.85 ? `elected Nov 3, 2026 · takes office ${Math.floor(T.y0[t]) === 2026 ? 'on certification' : 'Jan 2027'}` : `${Math.floor(T.y0[t])}–${T.y1[t] > 2026.5 ? 'present' : Math.floor(T.y1[t])} · seen in ${yearOf(dotCycle[d])}`;
    tip.querySelector('.of').textContent = `${office(t)} · ${span}`;
    tip.querySelector('.pt span').textContent = k === 2 ? 'Too close to call' : label === fam.name || label === 'Unknown' ? fam.name : label;
    const nt = tip.querySelector('.nt'); nt.textContent = note; nt.style.display = note ? 'block' : 'none';
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
    b.onclick = () => { set(k); syncSegs(); };
    el.appendChild(b);
  }
  el._get = get;
}
function syncSegs() { for (const el of document.querySelectorAll('.seg')) if (el._get) [...el.children].forEach(c => c.classList.toggle('on', !!el._get(c.dataset.k))); }
seg($('#layouts'), Object.entries(LAYOUTS).map(([k, v]) => [k, v.name]), k => S.layout === k, k => { S.layout = k; $('#yearbox').classList.toggle('show', !!LAYOUTS[k].slice); relayout(true); saveHash(); });
seg($('#bodies'), LANE_NAMES.map((n, i) => [i, n]), k => S.bodies.has(+k), k => { k = +k; if (S.bodies.has(k)) { if (S.bodies.size > 1) S.bodies.delete(k); } else S.bodies.add(k); relayout(false); saveHash(); });
seg($('#sorts'), [['party', 'Party'], ['state', 'State'], ['born', 'Birth year'], ['tenure', 'Tenure']], k => S.sort === k, k => { S.sort = k; relayout(false); saveHash(); });
seg($('#colors'), [['party', 'Party'], ['office', 'Office'], ['born', 'Born'], ['tenure', 'Tenure']], k => S.color === k, k => { S.color = k; paint(); dirty = true; saveHash(); });
if (E26) seg($('#marks'), [['none', 'Everything'], ['new', 'Won Nov 3'], ['flip', 'Flipped seats'], ['open', 'Not yet called']], k => S.mark === k, k => { S.mark = k; highlight(); dirty = true; saveHash(); });
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
    if (i === UNK) { b.classList.toggle('off', !S.unk); b.onclick = () => { S.unk = !S.unk; legend(); relayout(false); saveHash(); }; }
    else b.onclick = () => { S.isolate = S.isolate === i ? null : i; legend(); highlight(); dirty = true; };
    el.appendChild(b);
  });
}
legend();
let findT; $('#find').oninput = e => { clearTimeout(findT); findT = setTimeout(() => { S.find = e.target.value; highlight(); dirty = true; }, 150); };
function onYear() { S.year = +$('#year').value; $('#yearlabel').textContent = yearOf(S.year); relayout(false); }
$('#year').max = NC - 1; $('#year').oninput = () => { onYear(); saveHash(); };
$('#play').onclick = () => { playing = !playing; $('#play').textContent = playing ? '❚❚' : '▶'; if (playing && S.year >= NC - 1) S.year = -1; };
$('#toggle').onclick = () => { $('#panel').classList.toggle('open'); pinned = -1; hideTip(); dirty = true; };
if (E26) {
  const b = $('#e26');
  const sl = E26.state && E26.state.races ? ` · state legislatures: ${E26.state.called.toLocaleString()} of ${E26.state.races.toLocaleString()} races called` : '';
  b.querySelector('b').textContent = `Congress & governors: ${E26.called} of ${E26.races} races called, ${E26.gains} seats flipped${sl}`;
  b.querySelector('small').textContent = `Nov 3, 2026 results from Wikipedia as of ${E26.asOf}`;
  b.hidden = false;
  b.querySelector('button').onclick = () => {
    S.layout = 'chamber'; S.year = C26; S.mark = 'new'; $('#year').value = S.year; $('#yearlabel').textContent = yearOf(S.year);
    $('#yearbox').classList.add('show'); syncSegs(); highlight(); relayout(true); saveHash();
  };
}
function stats(nAct) {
  if (nAct != null) stats.n = nAct;
  const f = stats.found;
  $('#stats').innerHTML = `${(stats.n ?? N).toLocaleString()} of ${N.toLocaleString()} officeholder-cycles shown${S.unk ? '' : ` (${famCount[UNK].toLocaleString()} with no recorded party hidden — tap its chip to show)`} · ${P.n.length.toLocaleString()} people${f != null ? ` · ${f} match “${S.find.replace(/[<&]/g, '')}”` : ''}<br>
    Data: <a href="https://github.com/unitedstates/congress-legislators" target="_blank" rel="noopener">congress-legislators</a> (Congress, complete), <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a> (presidents, governors, state legislatures — as complete as Wikidata is)${E26 ? `, and English Wikipedia's 2026 election articles (as of ${E26.asOf}; uncalled races are striped in the two leaders' colours, flipped seats outlined)` : ''}. Built ${D.built}.<br>
    Drag to ${LAYOUTS[S.layout].flat ? 'pan, shift/right-drag to tilt' : 'orbit, shift/right-drag to pan'}; scroll, pinch or double-click to zoom — names appear as you zoom in.`;
}
function saveHash() {
  const h = new URLSearchParams({ v: S.layout, u: S.unk ? 1 : 0, y: yearOf(S.year), o: [...S.bodies].join(''), s: S.state, sort: S.sort, c: S.color, m: S.mark });
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
  if (['none', 'new', 'flip', 'open'].includes(h.get('m'))) S.mark = h.get('m');
}
loadHash();
syncSegs();
stSel.value = S.state; $('#year').value = S.year; $('#yearlabel').textContent = yearOf(S.year);
$('#yearbox').classList.toggle('show', !!LAYOUTS[S.layout].slice);

// ── go
BG = cssRGB('backgroundColor'); INK = cssRGB('color');
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { BG = cssRGB('backgroundColor'); INK = cssRGB('color'); paint(); dirty = true; });
resize();
paint(); highlight();
layout();
Object.assign(cam, fitCam(S.layout)); G.p0.set(G.p1); G.u0.set(G.u1); G.v0.set(G.v1); G.b0.set(G.b1);
for (const k of ['p0', 'u0', 'v0', 'p1', 'u1', 'v1', 'b0', 'b1']) upload(k, G[k]);
mixT = 1;
requestAnimationFrame(frame);
window.__polity = { S, N, D, pickAt, relayout, cam, zoomAt, get dirty() { return dirty; }, set dirty(v) { dirty = v; } };
