// region.js — the foam, TILED: the seam-contract kernel for FOAM.md leg 6 (the game port).
//
// rind's sectorFoam generates one free-standing sector from a sequential RNG stream — two sectors
// generated independently agree on nothing, so a world you can walk off-screen in any direction is
// impossible from it. This kernel changes the generative basis: every chamber's existence and
// jitter is a PURE FUNCTION of its GLOBAL lattice coordinates (gx axial ∈ ℤ, gy circumferential
// mod the ring, gz radial) + the ship seed. Two consequences, and they are the whole design:
//
//   · THE SEAM CONTRACT IS FREE. Any region reproduces its neighbours' border chambers exactly —
//     not by negotiation, but because both sides evaluate the same function. A region also emits
//     a GHOST RIM (the neighbours' first two lattice columns, computed the same way) plus the
//     cross-seam edges into it, so roads and buildings can straddle seams and the nav graph
//     splices without loading the neighbour.
//   · THE RING CLOSES, THE AXIS DOES NOT. gy wraps mod nyRing (walk azimuthally forever, you come
//     home — the O'Neill hoop); gx is unbounded ℤ (the infinite cylinder; the game's "wander
//     off-screen in any direction").
//
// Geometry matches sectorFoam (same thinning law, same jitter scale, same 1.85·cell adjacency)
// so everything downstream — buildings, the desire-line grower, the painted viewer — ports by
// swapping the foam source. Chamber identity: gid = "gx|gy|gz", stable for ever; the postal
// binding (leg 5) keys off it. Pure, deterministic, node + browser.

// avalanche hash of (seed, gx, gy, gz, salt) → [0,1). gx may be negative; imul wraps fine.
function roll(seed, gx, gy, gz, salt) {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (gx | 0), 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ (gy | 0), 0xc2b2ae35); h ^= h >>> 16;
  h = Math.imul(h ^ (gz | 0), 0x27d4eb2f); h ^= h >>> 15;
  h = Math.imul(h ^ (salt | 0), 0x165667b1); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// the fixed ring lattice for a given hull: regionsPerRing tiles the circumference EXACTLY
// (nyRing = regionsPerRing · nyR), so region boundaries land on lattice lines by construction.
export function ringLattice({ Ri = 250, T = 50, cell = 1, regionsPerRing = 36 } = {}) {
  const nyR = Math.max(4, Math.round((2 * Math.PI * Ri / cell) / regionsPerRing));
  const nyRing = regionsPerRing * nyR;
  const nz = Math.max(2, Math.round(T / cell));
  return { Ri, T, cell, regionsPerRing, nyR, nyRing, nz, dTheta: 2 * Math.PI / nyRing, dz: T / nz };
}

// does the chamber at global (gx, gy, gz) exist, and where exactly — the one shared function.
// Exported: record.js's seam GATES must use this very function, never a copy (a drifted copy
// would let two regions disagree about whether a gate chamber exists).
export function chamberAt(L, seed, grade, gx, gyRaw, gz) {
  const gy = ((gyRaw % L.nyRing) + L.nyRing) % L.nyRing;          // the ring closes
  const zc = (gz + 0.5) / L.nz, dens = 1 + grade * zc;
  if (roll(seed, gx, gy, gz, 0) > dens / (1 + grade)) return null;
  const th = (gy + 0.5 + 0.5 * (roll(seed, gx, gy, gz, 1) - 0.5)) * L.dTheta;
  const ax = (gx + 0.5 + 0.5 * (roll(seed, gx, gy, gz, 2) - 0.5)) * L.cell;
  const rad = (gz + 0.5 + 0.5 * (roll(seed, gx, gy, gz, 3) - 0.5)) * L.dz;
  const r = L.Ri + rad;
  return { gid: gx + '|' + gy + '|' + gz, gx, gy, gz, th, rad, z: ax, x: r * Math.cos(th), y: r * Math.sin(th), circ: gy * L.cell };
}

// ── a REGION: its own chambers + the 2-deep ghost rim + intra edges + cross-seam edges ──────────
// key = { az (mod regionsPerRing), ax (∈ ℤ) }; axSpan = axial lattice cells per region.
export function regionFoam({ lattice, seed = 1, grade = 0.4, az = 0, ax = 0, axSpan = 24 } = {}) {
  const L = lattice;
  const azN = ((az % L.regionsPerRing) + L.regionsPerRing) % L.regionsPerRing;
  const gy0 = azN * L.nyR, gy1 = gy0 + L.nyR;                     // [gy0, gy1) — exact lattice tile
  const gx0 = ax * axSpan, gx1 = gx0 + axSpan;
  const RIM = 2;                                                   // ≥ adjacency reach (1.85·cell)

  const nodes = [], ghosts = [];
  const add = (gx, gyRaw, gz, ghost) => {
    const c = chamberAt(L, seed, grade, gx, gyRaw, gz);
    if (!c) return;
    // unwrap θ around the region so local geometry is continuous even across the global wrap seam
    c.thU = (gyRaw + 0.5) * L.dTheta + (c.th - ((((gyRaw % L.nyRing) + L.nyRing) % L.nyRing) + 0.5) * L.dTheta);
    if (ghost) { c.ghost = true; ghosts.push(c); } else { c.idx = nodes.length; nodes.push(c); }
  };
  for (let gz = 0; gz < L.nz; gz++)
    for (let gyRaw = gy0 - RIM; gyRaw < gy1 + RIM; gyRaw++)
      for (let gx = gx0 - RIM; gx < gx1 + RIM; gx++) {
        const inside = gyRaw >= gy0 && gyRaw < gy1 && gx >= gx0 && gx < gx1;
        add(gx, gyRaw, gz, !inside);
      }

  // adjacency by true 3D distance over the unwrapped local frame (same 1.85·cell law as sectorFoam)
  const thr2 = (1.85 * L.cell) ** 2, rBar = L.Ri + L.T / 2;
  const pos = (c) => [rBar * c.thU, c.z, c.rad];                   // arc, axial, radial — local chart
  const mi = [], mj = [], seamEdges = [];
  const all = nodes.concat(ghosts);
  const bs = 1.9 * L.cell, key = (p) => Math.floor(p[0] / bs) + '|' + Math.floor(p[1] / bs) + '|' + Math.floor(p[2] / bs);
  const bins = new Map();
  all.forEach((c, i) => { const k = key(pos(c)); let b = bins.get(k); if (!b) { b = []; bins.set(k, b); } b.push(i); });
  for (let i = 0; i < all.length; i++) {
    const a = all[i]; if (a.ghost) continue;                       // edges originate from real chambers
    const p = pos(a), bx = Math.floor(p[0] / bs), by = Math.floor(p[1] / bs), bz = Math.floor(p[2] / bs);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const b = bins.get((bx + dx) + '|' + (by + dy) + '|' + (bz + dz)); if (!b) continue;
      for (const j of b) {
        const c = all[j];
        if (!c.ghost && j <= i) continue;                          // dedupe intra edges
        const q = pos(c), ddx = p[0] - q[0], ddy = p[1] - q[1], ddz = p[2] - q[2];
        if (ddx * ddx + ddy * ddy + ddz * ddz >= thr2) continue;
        if (c.ghost) seamEdges.push({ i: a.idx, gid: c.gid });
        else { mi.push(a.idx); mj.push(c.idx); }
      }
    }
  }
  return { key: { az: azN, ax }, gy0, gy1, gx0, gx1, lattice: L, nodes, ghosts, mi, mj, seamEdges };
}

const Region = { ringLattice, regionFoam };
if (typeof globalThis !== 'undefined') globalThis.HOOPREGION = Region;
export default Region;
