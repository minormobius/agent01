// geometry.js — procedural meshes: the duck, the two worlds, the props.
//
// Every builder returns { verts, indices } where `verts` is interleaved
// position(3) · normal(3) · color(3) = 9 floats/vertex (Float32Array) and
// `indices` is a Uint32Array. The duck is composed from primitives via a tiny
// MeshBuilder that bakes a per-part transform + colour. Scatter helpers return
// arrays of { pos, quat, scale } transforms the renderer turns into instances.
//
// Seeded (mulberry32) so a given world is identical every load — the repo's
// determinism habit, and it keeps the prop field stable across the mode toggle.

import { vec3, quat, mat4 } from './math.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── MeshBuilder: accumulate primitives, each with its own transform + colour ──
class MeshBuilder {
  constructor() { this.v = []; this.i = []; this.n = 0; }
  // add raw {positions, normals, indices} with offset/quat/scale and a colour.
  add(prim, { pos = [0, 0, 0], q = [0, 0, 0, 1], scale = [1, 1, 1], color = [1, 1, 1] } = {}) {
    const { positions, normals, indices } = prim;
    const base = this.n;
    const tp = [0, 0, 0], tn = [0, 0, 0];
    for (let k = 0; k < positions.length; k += 3) {
      tp[0] = positions[k] * scale[0]; tp[1] = positions[k + 1] * scale[1]; tp[2] = positions[k + 2] * scale[2];
      vec3.transformQuat(tp, tp, q);
      this.v.push(pos[0] + tp[0], pos[1] + tp[1], pos[2] + tp[2]);
      tn[0] = normals[k]; tn[1] = normals[k + 1]; tn[2] = normals[k + 2];
      vec3.transformQuat(tn, tn, q); vec3.normalize(tn, tn);
      this.v.push(tn[0], tn[1], tn[2]);
      this.v.push(color[0], color[1], color[2]);
      this.n++;
    }
    for (const idx of indices) this.i.push(base + idx);
    return this;
  }
  build() { return { verts: new Float32Array(this.v), indices: new Uint32Array(this.i) }; }
}

// ── primitives (unit-ish, centred) ──
function box() {
  // unit cube, flat-shaded (24 verts)
  const f = [
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
    [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
  ];
  const positions = [], normals = [], indices = [];
  let b = 0;
  for (const [nrm, quad] of f) {
    for (const p of quad) { positions.push(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5); normals.push(...nrm); }
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3); b += 4;
  }
  return { positions, normals, indices };
}

function sphere(seg = 14) {
  const positions = [], normals = [], indices = [];
  for (let y = 0; y <= seg; y++) {
    const v = y / seg, phi = v * Math.PI;
    for (let x = 0; x <= seg; x++) {
      const u = x / seg, th = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
      positions.push(nx * 0.5, ny * 0.5, nz * 0.5); normals.push(nx, ny, nz);
    }
  }
  const row = seg + 1;
  for (let y = 0; y < seg; y++) for (let x = 0; x < seg; x++) {
    const a = y * row + x, b = a + row;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { positions, normals, indices };
}

function cone(seg = 16) {
  // base radius 0.5 at y=-0.5, apex at y=+0.5, pointing +Y
  const positions = [], normals = [], indices = [];
  const apex = [0, 0.5, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0 = [Math.cos(a0) * 0.5, -0.5, Math.sin(a0) * 0.5];
    const p1 = [Math.cos(a1) * 0.5, -0.5, Math.sin(a1) * 0.5];
    const e0 = vec3.sub([0, 0, 0], p0, apex), e1 = vec3.sub([0, 0, 0], p1, apex);
    const nrm = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], e1, e0));
    const b = positions.length / 3;
    positions.push(...apex, ...p0, ...p1); normals.push(...nrm, ...nrm, ...nrm);
    indices.push(b, b + 1, b + 2);
  }
  // base cap
  const bc = positions.length / 3; positions.push(0, -0.5, 0); normals.push(0, -1, 0);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const b = positions.length / 3;
    positions.push(Math.cos(a0) * 0.5, -0.5, Math.sin(a0) * 0.5, Math.cos(a1) * 0.5, -0.5, Math.sin(a1) * 0.5);
    normals.push(0, -1, 0, 0, -1, 0);
    indices.push(bc, b + 1, b);
  }
  return { positions, normals, indices };
}

function cylinderY(seg = 8) {
  // open tube along +Y, radius 0.5, height 1, centred — trunks & branches
  const positions = [], normals = [], indices = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    positions.push(c * 0.5, -0.5, s * 0.5); normals.push(c, 0, s);
    positions.push(c * 0.5, 0.5, s * 0.5); normals.push(c, 0, s);
  }
  for (let i = 0; i < seg; i++) { const b = i * 2; indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  return { positions, normals, indices };
}

const PRIM = { box: box(), sphere: sphere(), sphereHi: sphere(20), cone: cone(), cyl: cylinderY(7), blob: sphere(6) };

// ── the duck ──  forward = −Z, up = +Y. A friendly low-poly mallard.
export function buildDuck() {
  const mb = new MeshBuilder();
  const BODY = [0.96, 0.83, 0.22], HEAD = [0.98, 0.86, 0.26], BEAK = [0.95, 0.5, 0.12];
  const WING = [0.86, 0.72, 0.16], EYE = [0.05, 0.05, 0.06], CHEST = [0.99, 0.9, 0.45];
  // body: stretched sphere along Z
  mb.add(PRIM.sphereHi, { pos: [0, 0, 0.15], scale: [1.0, 0.9, 2.0], color: BODY });
  mb.add(PRIM.sphereHi, { pos: [0, -0.15, 0.55], scale: [0.7, 0.6, 1.0], color: CHEST });
  // neck + head up front (−Z)
  mb.add(PRIM.sphere, { pos: [0, 0.45, -0.85], scale: [0.62, 0.7, 0.62], color: HEAD });
  mb.add(PRIM.sphere, { pos: [0, 0.18, -0.55], scale: [0.42, 0.6, 0.5], color: HEAD });
  // beak: cone pointing −Z (rotate +Y cone to −Z) → rotate −90° about X
  const beakQ = quat.rotateLocal([0, 0, 0, 1], [0, 0, 0, 1], [1, 0, 0], -Math.PI / 2);
  mb.add(PRIM.cone, { pos: [0, 0.42, -1.28], q: beakQ, scale: [0.34, 0.5, 0.22], color: BEAK });
  // eyes
  mb.add(PRIM.sphere, { pos: [0.22, 0.56, -1.02], scale: [0.12, 0.12, 0.12], color: EYE });
  mb.add(PRIM.sphere, { pos: [-0.22, 0.56, -1.02], scale: [0.12, 0.12, 0.12], color: EYE });
  // wings: thin angled boxes
  const wq = quat.rotateLocal([0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 1], 0.32);
  const wqL = quat.rotateLocal([0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 1], -0.32);
  mb.add(PRIM.box, { pos: [0.78, 0.12, 0.2], q: wqL, scale: [0.9, 0.16, 1.5], color: WING });
  mb.add(PRIM.box, { pos: [-0.78, 0.12, 0.2], q: wq, scale: [0.9, 0.16, 1.5], color: WING });
  // tail: little wedge at +Z
  const tq = quat.rotateLocal([0, 0, 0, 1], [0, 0, 0, 1], [1, 0, 0], 0.5);
  mb.add(PRIM.box, { pos: [0, 0.28, 1.15], q: tq, scale: [0.7, 0.16, 0.7], color: WING });
  return mb.build(); // unit-ish duck ~2.6 long; the instance scale sets metres
}

// A breadcrumb / marker (small low sphere).
export function buildCrumb() {
  const mb = new MeshBuilder();
  mb.add(PRIM.sphere, { color: [1, 1, 1] });
  return mb.build();
}

// ── trees, the yarrow way ──────────────────────────────────────────────────
// Inspired by clock/yarrow: a plant grown from a seed by botanical rules. Here
// each species is a seeded recursive growth — limbs placed around the parent at
// the GOLDEN ANGLE (137.5°, yarrow's phyllotactic divergence), tapering in length
// and radius each generation, with low-poly foliage clumps at the tips. Built
// once into a small KIT of meshes; the forest instances them with jitter.

const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ≈ 137.5° divergence

function canopy(mb, at, size, leaf, clump, rnd) {
  for (let i = 0; i < clump; i++) {
    const o = [(rnd() - 0.5) * size, (rnd() - 0.25) * size * 0.8, (rnd() - 0.5) * size];
    const s = size * (0.55 + 0.5 * rnd()), j = 0.1;
    const col = [leaf[0] + (rnd() - 0.5) * j, leaf[1] + (rnd() - 0.5) * j, leaf[2] + (rnd() - 0.5) * j];
    mb.add(PRIM.blob, { pos: [at[0] + o[0], at[1] + o[1], at[2] + o[2]], scale: [s, s, s], color: col });
  }
}

function growBranch(mb, start, dir, len, rad, depth, o, rnd, az0) {
  const q = quat.fromTo([0, 0, 0, 1], [0, 1, 0], dir);
  const mid = [start[0] + dir[0] * len / 2, start[1] + dir[1] * len / 2, start[2] + dir[2] * len / 2];
  mb.add(PRIM.cyl, { pos: mid, q, scale: [rad, len, rad], color: o.bark });
  const end = [start[0] + dir[0] * len, start[1] + dir[1] * len, start[2] + dir[2] * len];
  if (depth <= 0) { canopy(mb, end, len * o.leafScale, o.leaf, o.clump, rnd); return; }
  // a stable perpendicular frame to swing children around the parent axis
  let side = vec3.cross([0, 0, 0], dir, [0, 1, 0]);
  if (vec3.len(side) < 1e-4) side = [1, 0, 0];
  vec3.normalize(side, side);
  const side2 = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], dir, side));
  let az = az0;
  for (let i = 0; i < o.branchN; i++) {
    az += GOLDEN;
    const tilt = o.tilt * (0.75 + 0.5 * rnd());
    const ca = Math.cos(az), sa = Math.sin(az), ct = Math.cos(tilt), st = Math.sin(tilt);
    const perp = [side[0] * ca + side2[0] * sa, side[1] * ca + side2[1] * sa, side[2] * ca + side2[2] * sa];
    const cd = vec3.normalize([0, 0, 0], [dir[0] * ct + perp[0] * st, dir[1] * ct + perp[1] * st, dir[2] * ct + perp[2] * st]);
    growBranch(mb, end, cd, len * o.lenFalloff * (0.85 + 0.3 * rnd()), rad * o.radFalloff, depth - 1, o, rnd, az);
  }
  if (o.midLeaf) canopy(mb, end, len * o.leafScale * 0.6, o.leaf, Math.max(2, o.clump - 2), rnd);
}

function conifer(mb, o, rnd) {
  const h = o.height;
  mb.add(PRIM.cyl, { pos: [0, h * 0.18, 0], scale: [o.rad, h * 0.4, o.rad], color: o.bark });
  for (let i = 0; i < o.tiers; i++) {
    const t = i / (o.tiers - 1), y = h * (0.2 + 0.72 * t), r = o.baseR * (1 - 0.78 * t), ch = h * 0.28 * (1 - 0.28 * t);
    const j = 0.08, col = [o.leaf[0] + (rnd() - 0.5) * j, o.leaf[1] + (rnd() - 0.5) * j, o.leaf[2] + (rnd() - 0.5) * j];
    mb.add(PRIM.cone, { pos: [0, y, 0], scale: [r, ch, r], color: col });
  }
}

// One entry per species. Built once at module load → TREE_KIT. up = +Y, base at y≈0.
const SPECIES = [
  { style: 'conifer', seed: 11, bark: [0.30, 0.21, 0.13], leaf: [0.12, 0.33, 0.16], height: 9, tiers: 6, baseR: 2.6, rad: 0.34 },   // fir
  { style: 'conifer', seed: 12, bark: [0.28, 0.19, 0.12], leaf: [0.10, 0.29, 0.18], height: 12, tiers: 8, baseR: 1.9, rad: 0.30 },  // spruce (narrow)
  { style: 'broadleaf', seed: 13, bark: [0.36, 0.25, 0.15], leaf: [0.20, 0.42, 0.16], len: 3.0, rad: 0.36, depth: 3, branchN: 3, tilt: 0.62, lenFalloff: 0.74, radFalloff: 0.6, leafScale: 1.5, clump: 5, midLeaf: false }, // oak
  { style: 'broadleaf', seed: 14, bark: [0.34, 0.24, 0.14], leaf: [0.24, 0.46, 0.2], len: 3.6, rad: 0.30, depth: 3, branchN: 2, tilt: 0.5, lenFalloff: 0.78, radFalloff: 0.6, leafScale: 1.25, clump: 4, midLeaf: true }, // round broadleaf
  { style: 'broadleaf', seed: 15, bark: [0.82, 0.82, 0.78], leaf: [0.42, 0.58, 0.26], len: 3.4, rad: 0.18, depth: 3, branchN: 2, tilt: 0.42, lenFalloff: 0.8, radFalloff: 0.58, leafScale: 1.0, clump: 3, midLeaf: false }, // birch
  { style: 'bush', seed: 16, leaf: [0.2, 0.4, 0.18], size: 1.6, clump: 6 },
];

export function buildForestKit() {
  return SPECIES.map((o) => {
    const mb = new MeshBuilder(), rnd = mulberry32(o.seed);
    if (o.style === 'conifer') conifer(mb, o, rnd);
    else if (o.style === 'bush') canopy(mb, [0, o.size * 0.7, 0], o.size, o.leaf, o.clump, rnd);
    else growBranch(mb, [0, 0, 0], [0, 1, 0], o.len, o.rad, o.depth, o, rnd, rnd() * Math.PI * 2);
    return mb.build();
  });
}
export const TREE_KIT = buildForestKit();
const TREE_WEIGHTS = [5, 4, 5, 4, 2, 6];   // spawn bias per species (bushes common)
const TREE_TOTW = TREE_WEIGHTS.reduce((a, b) => a + b, 0);
function pickSpecies(rnd) {
  let r = rnd() * TREE_TOTW;
  for (let v = 0; v < TREE_WEIGHTS.length; v++) { r -= TREE_WEIGHTS[v]; if (r <= 0) return v; }
  return TREE_WEIGHTS.length - 1;
}

// A pylon / marker post — tall and bright, reads parallax + spin.
export function buildPylon() {
  const mb = new MeshBuilder();
  mb.add(PRIM.box, { pos: [0, 6, 0], scale: [0.6, 12, 0.6], color: [0.7, 0.72, 0.78] });
  mb.add(PRIM.box, { pos: [0, 12, 0], scale: [1.6, 0.6, 1.6], color: [0.95, 0.4, 0.3] });
  return mb.build();
}

// ── worlds ──

// A ring / torus, major radius 1, axis = +Z (you fly THROUGH along Z). Used for
// the course gates and — laid flat — the landing pad. Vertex colour white so the
// per-instance tint picks the status colour.
export function buildRing(tube = 0.09, ringSeg = 44, tubeSeg = 9) {
  const positions = [], normals = [], colors = [], indices = [];
  for (let i = 0; i <= ringSeg; i++) {
    const u = (i / ringSeg) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= tubeSeg; j++) {
      const v = (j / tubeSeg) * Math.PI * 2, cv = Math.cos(v), sv = Math.sin(v);
      positions.push((1 + tube * cv) * cu, (1 + tube * cv) * su, tube * sv);
      normals.push(cv * cu, cv * su, sv);
      colors.push(1, 1, 1);
    }
  }
  const row = tubeSeg + 1;
  for (let i = 0; i < ringSeg; i++) for (let j = 0; j < tubeSeg; j++) {
    const a = i * row + j, b = a + row;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return interleave(positions, normals, colors, indices);
}

// EARTH: a big checkered ground plane at y=0.
export function buildGround(half = 9000, seg = 120) {
  const positions = [], normals = [], colors = [], indices = [];
  const g1 = [0.13, 0.28, 0.14], g2 = [0.16, 0.34, 0.16];   // forest floor
  for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
    const x = -half + (2 * half * i) / seg, z = -half + (2 * half * j) / seg;
    positions.push(x, 0, z); normals.push(0, 1, 0);
    const c = ((i + j) & 1) ? g1 : g2; colors.push(c[0], c[1], c[2]);
  }
  const row = seg + 1;
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * row + i, b = a + row;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return interleave(positions, normals, colors, indices);
}

// CYLINDER: the inside surface of a tube along +Z, inward-facing normals, with
// painted land/sea bands so the curving floor reads. Floor is at radius R.
export function buildCylinderShell(R, len, radial = 120, axial = 80) {
  const positions = [], normals = [], colors = [], indices = [];
  const sea = [0.12, 0.34, 0.5], land = [0.22, 0.45, 0.22], land2 = [0.30, 0.42, 0.2], sand = [0.6, 0.56, 0.36];
  for (let a = 0; a <= axial; a++) {
    const z = (a / axial) * len;
    for (let r = 0; r <= radial; r++) {
      const th = (r / radial) * Math.PI * 2;
      const x = Math.cos(th) * R, y = Math.sin(th) * R;
      positions.push(x, y, z);
      normals.push(-Math.cos(th), -Math.sin(th), 0); // inward
      // three "continents" + sea between, plus shoreline sand
      const band = (th / (Math.PI * 2)) * 3 % 1;
      let c = sea;
      if (band < 0.62) c = ((a >> 2) & 1) ? land : land2;
      else if (band < 0.7 || band > 0.94) c = sand;
      colors.push(c[0], c[1], c[2]);
    }
  }
  const row = radial + 1;
  for (let a = 0; a < axial; a++) for (let r = 0; r < radial; r++) {
    const i0 = a * row + r, i1 = i0 + row;
    // winding so the INWARD face is front-facing (CCW seen from the axis)
    indices.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1);
  }
  return interleave(positions, normals, colors, indices);
}

// The axial sun-rod down the centre of the cylinder (a glowing tube along Z).
export function buildSunRod(len, rad = 18, seg = 16) {
  const positions = [], normals = [], colors = [], indices = [];
  const C = [1.0, 0.96, 0.7];
  for (let a = 0; a <= 1; a++) {
    const z = a * len;
    for (let r = 0; r <= seg; r++) {
      const th = (r / seg) * Math.PI * 2;
      positions.push(Math.cos(th) * rad, Math.sin(th) * rad, z);
      normals.push(Math.cos(th), Math.sin(th), 0);
      colors.push(C[0], C[1], C[2]);
    }
  }
  const row = seg + 1;
  for (let r = 0; r < seg; r++) {
    const i0 = r, i1 = row + r;
    indices.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
  }
  return interleave(positions, normals, colors, indices);
}

function interleave(positions, normals, colors, indices) {
  const n = positions.length / 3;
  const verts = new Float32Array(n * 9);
  for (let k = 0; k < n; k++) {
    verts[k * 9] = positions[k * 3]; verts[k * 9 + 1] = positions[k * 3 + 1]; verts[k * 9 + 2] = positions[k * 3 + 2];
    verts[k * 9 + 3] = normals[k * 3]; verts[k * 9 + 4] = normals[k * 3 + 1]; verts[k * 9 + 5] = normals[k * 3 + 2];
    verts[k * 9 + 6] = colors[k * 3]; verts[k * 9 + 7] = colors[k * 3 + 1]; verts[k * 9 + 8] = colors[k * 3 + 2];
  }
  return { verts, indices: new Uint32Array(indices) };
}

// ── scatter: prop transforms for each world ──

// Both scatter helpers return { trees, pylons } where `trees` is an array indexed
// by species (trees[v] = transforms for TREE_KIT[v]) so the renderer draws one
// instanced batch per species. Trees grow in GROVES — denser clumps with a few
// scattered singles — so the ground reads as forest, not a polka-dot field.

// EARTH: a clustered forest on the ground (up = +Y, random yaw).
export function scatterEarth(seed = 7) {
  const rnd = mulberry32(seed);
  const trees = TREE_KIT.map(() => []), pylons = [];
  const place = (x, z, smin, smax) => {
    const v = pickSpecies(rnd), s = smin + rnd() * (smax - smin);
    const q = quat.rotateLocal([0, 0, 0, 1], [0, 0, 0, 1], [0, 1, 0], rnd() * Math.PI * 2);
    trees[v].push({ pos: [x, 0, z], q, scale: [s, s, s] });
  };
  for (let g = 0; g < 42; g++) {                  // groves
    const ga = rnd() * Math.PI * 2, gd = 110 + rnd() * 3400;
    const gx = Math.cos(ga) * gd, gz = Math.sin(ga) * gd;
    const n = 8 + (rnd() * 16 | 0), rad = 18 + rnd() * 44;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * rad;
      place(gx + Math.cos(a) * d, gz + Math.sin(a) * d, 0.7, 1.8);
    }
  }
  for (let i = 0; i < 140; i++) {                 // scattered singles
    const a = rnd() * Math.PI * 2, d = 60 + rnd() * 3600;
    place(Math.cos(a) * d, Math.sin(a) * d, 0.6, 1.5);
  }
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = 160 + rnd() * 2600;
    pylons.push({ pos: [Math.cos(a) * d, 0, Math.sin(a) * d], q: [0, 0, 0, 1], scale: [1, 1, 1] });
  }
  return { trees, pylons };
}

// CYLINDER: forest clinging to the inner wall, up = radially INWARD, with a spin
// about the trunk for variety.
export function scatterCylinder(R, len, seed = 7) {
  const rnd = mulberry32(seed);
  const trees = TREE_KIT.map(() => []), pylons = [];
  const big = R > 2000, base = big ? 3 : 1;
  // quaternion rotating local +Y onto the inward radial at angle th.
  const orient = (th) => {
    const inw = [-Math.cos(th), -Math.sin(th), 0];
    const axis = vec3.cross([0, 0, 0], [0, 1, 0], inw);
    const al = vec3.len(axis);
    if (al < 1e-6) return [0, 0, 0, 1];
    vec3.scale(axis, axis, 1 / al);
    return quat.rotateLocal([0, 0, 0, 1], [0, 0, 0, 1], axis, Math.acos(Math.max(-1, Math.min(1, inw[1]))));
  };
  const place = (th, z) => {
    const v = pickSpecies(rnd), s = (0.7 + rnd() * 1.0) * base;
    const q = quat.rotateLocal([0, 0, 0, 1], orient(th), [0, 1, 0], rnd() * Math.PI * 2);
    trees[v].push({ pos: [Math.cos(th) * R, Math.sin(th) * R, z], q, scale: [s, s, s] });
  };
  const groves = big ? 64 : 46, arc = (big ? 70 : 14) / R;
  for (let g = 0; g < groves; g++) {
    const gth = rnd() * Math.PI * 2, gz = rnd() * len, n = 5 + (rnd() * 9 | 0), spreadZ = big ? 70 : 16;
    for (let i = 0; i < n; i++) place(gth + (rnd() - 0.5) * arc, Math.max(2, Math.min(len - 2, gz + (rnd() - 0.5) * spreadZ)));
  }
  for (let i = 0; i < 44; i++) {
    const th = rnd() * Math.PI * 2, z = rnd() * len;
    pylons.push({ pos: [Math.cos(th) * R, Math.sin(th) * R, z], q: orient(th), scale: [base, base, base] });
  }
  return { trees, pylons };
}

// transforms[] → Float32Array of column-major mat4 (16 floats each).
export function instanceMatrices(transforms) {
  const out = new Float32Array(transforms.length * 16);
  const m = mat4.create();
  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i];
    mat4.fromRTS(m, t.q || [0, 0, 0, 1], t.pos, t.scale || [1, 1, 1]);
    out.set(m, i * 16);
  }
  return out;
}
