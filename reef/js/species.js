// reef — procedural voxel species. Seven marine classes, each a seeded
// parametric generator over the same 15^3 lattice the cube3D bricks live on.
// (species, seed) -> Uint8Array(3375), deterministic on every machine, so a
// specimen id like "eel:1234" IS the shape — the judge site stores only votes
// and the trainer regenerates the corpus from seeds.
//
// Morphology is deliberately exaggerated per class: at 15^3 a real fish mesh
// and a real eel mesh voxelise into nearly the same blob, so distinctness is
// designed in, not sampled. Shapes are guaranteed connected (largest component
// kept; deterministic re-roll if the cube count leaves [50, 450]).
//
// GEN_VERSION stamps votes; bump it if morphology changes materially so old
// judgements can be excluded.
//
// Pure module: no DOM. Node-tested in species.selftest.mjs.

export const GRID = 15;
export const NCELLS = GRID * GRID * GRID;
export const GEN_VERSION = 1;
export const SPECIES = ['Fish', 'Eel', 'Ray', 'Jellyfish', 'Turtle', 'Coral', 'Anemone'];
export const SPECIES_EMOJI = ['🐟', '🪱', '🐋', '🪼', '🐢', '🪸', '🌸'];

// mulberry32 + string hash — same PRNG family as the rest of the repo.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cellOf = (a0, a1, a2) => (a0 * GRID + a1) * GRID + a2;

class Canvas {
  constructor() { this.v = new Uint8Array(NCELLS); }
  set(a0, a1, a2) {
    a0 = Math.round(a0); a1 = Math.round(a1); a2 = Math.round(a2);
    if (a0 < 0 || a1 < 0 || a2 < 0 || a0 >= GRID || a1 >= GRID || a2 >= GRID) return;
    this.v[cellOf(a0, a1, a2)] = 1;
  }
  blob(c0, c1, c2, r) { // solid sphere
    const R = Math.ceil(r);
    for (let a0 = Math.floor(c0 - R); a0 <= c0 + R; a0++)
      for (let a1 = Math.floor(c1 - R); a1 <= c1 + R; a1++)
        for (let a2 = Math.floor(c2 - R); a2 <= c2 + R; a2++) {
          const d = ((a0 - c0) ** 2 + (a1 - c1) ** 2 + (a2 - c2) ** 2);
          if (d <= r * r + 0.25) this.set(a0, a1, a2);
        }
  }
  ellipsoid(c0, c1, c2, r0, r1, r2, pred = null) {
    for (let a0 = Math.floor(c0 - r0); a0 <= c0 + r0; a0++)
      for (let a1 = Math.floor(c1 - r1); a1 <= c1 + r1; a1++)
        for (let a2 = Math.floor(c2 - r2); a2 <= c2 + r2; a2++) {
          const q = ((a0 - c0) / r0) ** 2 + ((a1 - c1) / r1) ** 2 + ((a2 - c2) / r2) ** 2;
          if (q <= 1.05 && (!pred || pred(a0, a1, a2))) this.set(a0, a1, a2);
        }
  }
}

// -------------------------------------------------------------- per species
function fish(R) {
  const c = new Canvas();
  const rx = 3.4 + R() * 1.6, ry = 1.3 + R() * 0.9, rz = 1.9 + R() * 1.1;
  const cx = 7.6 + (R() - 0.5), cz = 7 + (R() - 0.5) * 2;
  c.ellipsoid(cx, 7, cz, rx, ry, rz);
  // tail fan: vertical triangle behind the body, 1 thick
  const tx = Math.round(cx - rx);
  const th = 1.6 + R() * 1.4;
  for (let k = 0; k <= 2; k++) {
    const spread = 0.8 + (th * k) / 2;
    for (let dz = -spread; dz <= spread; dz += 1) c.set(tx - k, 7, cz + dz);
  }
  // dorsal ridge on top
  const dl = 2 + Math.floor(R() * 2);
  for (let k = 0; k < dl; k++) c.set(Math.round(cx - 1 + k), 7, Math.round(cz + rz + 0.2));
  // pectoral stubs
  if (R() < 0.7) { c.set(Math.round(cx + 1), 7 - Math.ceil(ry) - 0, cz); c.set(Math.round(cx + 1), 7 + Math.ceil(ry) + 0, cz); }
  return c.v;
}

function eel(R) {
  const c = new Canvas();
  const A = 2.4 + R() * 1.6, f = 1.0 + R() * 0.9, ph = R() * Math.PI * 2;
  const zBase = 6 + R() * 3, zDrift = (R() - 0.5) * 3;
  for (let a0 = 1; a0 <= 13; a0 += 0.5) {
    const t = a0 / 14;
    const a1 = 7 + A * Math.sin(2 * Math.PI * f * t + ph);
    const a2 = zBase + zDrift * t;
    c.blob(a0, a1, a2, a0 < 3 ? 1.35 : 0.95); // slightly fatter head
  }
  return c.v;
}

function ray(R) {
  const c = new Canvas();
  const nose = 12, L = 8 + R() * 2, maxW = 4.5 + R() * 1.8, peak = 0.35 + R() * 0.15;
  const z = 7, thick = R() < 0.35 ? 2 : 1;
  for (let a0 = Math.ceil(nose - L); a0 <= nose; a0++) {
    const t = (nose - a0) / L; // 0 at nose -> 1 at back
    const w = t < peak ? maxW * (t / peak) : maxW * (1 - (t - peak) / (1 - peak));
    for (let a1 = Math.ceil(7 - w); a1 <= 7 + w; a1++) {
      for (let k = 0; k < thick; k++) c.set(a0, a1, z + k);
      // upturned wingtips
      if (Math.abs(a1 - 7) > w - 0.8 && w > 2.5) c.set(a0, a1, z + thick);
    }
  }
  // whip tail
  const tl = 3 + Math.floor(R() * 3);
  for (let k = 1; k <= tl; k++) c.set(Math.round(nose - L - k), 7, z - (k > 2 ? 1 : 0));
  return c.v;
}

function jellyfish(R) {
  const c = new Canvas();
  const r = 3.0 + R() * 1.5, rz = 2.4 + R() * 1.1;
  const cz = 9.5 + (R() - 0.5);
  c.ellipsoid(7, 7, cz, r, r, rz, (a0, a1, a2) => a2 >= cz - 0.5); // dome: top half only
  // tentacles hang from the rim/underside
  const n = 4 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + R() * 0.5;
    let a0 = 7 + Math.cos(ang) * (r - 1), a1 = 7 + Math.sin(ang) * (r - 1);
    const len = 4 + Math.floor(R() * 3);
    for (let k = 0; k <= len; k++) {
      c.set(a0, a1, Math.round(cz - 0.5 - k));
      a0 += (R() - 0.5) * 1.2; a1 += (R() - 0.5) * 1.2; // drift as they trail
    }
  }
  return c.v;
}

function turtle(R) {
  const c = new Canvas();
  const rx = 3.4 + R() * 1.1, ry = 2.7 + R() * 1.0, rz = 1.4 + R() * 0.6;
  c.ellipsoid(7, 7, 7, rx, ry, rz, (a0, a1, a2) => a2 >= 6.2); // shell: flat belly
  // four flippers, diagonal, flat
  const fx = rx * 0.65, fy = ry * 0.8;
  for (const [s0, s1] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const len = 2 + Math.floor(R() * 2);
    for (let k = 0; k < len; k++) {
      c.set(7 + s0 * (fx + k * 0.8), 7 + s1 * (fy + k * 0.8), 6.5);
      c.set(7 + s0 * (fx + k * 0.8) + (s0 > 0 ? -1 : 1) * 0.4, 7 + s1 * (fy + k * 0.8), 6.5);
    }
  }
  // head + tail
  c.blob(7 + rx + 1, 7, 7, 1.1);
  c.set(7 - rx - 1, 7, 7);
  return c.v;
}

function coral(R) {
  const c = new Canvas();
  const branch = (a0, a1, a2, d0, d1, d2, depth) => {
    const len = 3 + Math.floor(R() * 3);
    for (let k = 0; k < len; k++) {
      c.blob(a0, a1, a2, depth === 0 ? 1.2 : 0.8);
      a0 += d0 + (R() - 0.5) * 0.8;
      a1 += d1 + (R() - 0.5) * 0.8;
      a2 += Math.max(0.4, d2 + (R() - 0.5) * 0.4);
      if (a2 > 13.5) return;
    }
    if (depth >= 3) return;
    const kids = depth === 0 ? 2 + Math.floor(R() * 2) : (R() < 0.75 ? 2 : 1);
    for (let i = 0; i < kids; i++) {
      const ang = R() * Math.PI * 2, tilt = 0.35 + R() * 0.5;
      branch(a0, a1, a2, Math.cos(ang) * tilt, Math.sin(ang) * tilt, 0.75, depth + 1);
    }
  };
  branch(7 + (R() - 0.5) * 2, 7 + (R() - 0.5) * 2, 1, 0, 0, 1, 0);
  return c.v;
}

function anemone(R) {
  const c = new Canvas();
  const br = 2.4 + R() * 1.1, bh = 1 + Math.floor(R() * 2);
  // base disc
  for (let a0 = 0; a0 < GRID; a0++) for (let a1 = 0; a1 < GRID; a1++) {
    const d = Math.hypot(a0 - 7, a1 - 7);
    if (d <= br) for (let a2 = 1; a2 <= bh; a2++) c.set(a0, a1, a2);
  }
  // a thicket of upright swaying tentacles rooted on the disc
  const n = 8 + Math.floor(R() * 6);
  for (let i = 0; i < n; i++) {
    const ang = R() * Math.PI * 2, rr = R() * (br - 0.4);
    let a0 = 7 + Math.cos(ang) * rr, a1 = 7 + Math.sin(ang) * rr;
    const len = 4 + Math.floor(R() * 4), ph = R() * Math.PI * 2, amp = 0.5 + R() * 0.6;
    for (let k = 1; k <= len; k++) {
      c.set(a0 + Math.sin(ph + k * 0.9) * amp, a1 + Math.cos(ph + k * 0.7) * amp, bh + k);
    }
  }
  return c.v;
}

const GENERATORS = [fish, eel, ray, jellyfish, turtle, coral, anemone];

// -------------------------------------------------------------- post-process
function largestComponent(v) {
  const seen = new Uint8Array(NCELLS);
  let best = null;
  const stack = [];
  for (let s = 0; s < NCELLS; s++) {
    if (!v[s] || seen[s]) continue;
    const comp = [];
    stack.length = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const c = stack.pop();
      comp.push(c);
      const a0 = Math.floor(c / (GRID * GRID)), a1 = Math.floor(c / GRID) % GRID, a2 = c % GRID;
      for (const [d0, d1, d2] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const b0 = a0 + d0, b1 = a1 + d1, b2 = a2 + d2;
        if (b0 < 0 || b1 < 0 || b2 < 0 || b0 >= GRID || b1 >= GRID || b2 >= GRID) continue;
        const n = cellOf(b0, b1, b2);
        if (v[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    if (!best || comp.length > best.length) best = comp;
  }
  const out = new Uint8Array(NCELLS);
  if (best) for (const c of best) out[c] = 1;
  return out;
}

// (species index, seed) -> connected Uint8Array(3375) with 50..450 cubes.
export function generate(species, seed) {
  let s = (seed >>> 0) ^ (species * 0x9E3779B9);
  for (let attempt = 0; attempt < 8; attempt++) {
    const v = largestComponent(GENERATORS[species](mulberry32(s)));
    let n = 0;
    for (let i = 0; i < NCELLS; i++) n += v[i];
    if (n >= 50 && n <= 450) return v;
    s = (Math.imul(s, 31) + 0x85EBCA6B) >>> 0; // deterministic re-roll
  }
  return largestComponent(GENERATORS[species](mulberry32(s))); // last resort, accept as-is
}

export function countCubes(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i];
  return n;
}
