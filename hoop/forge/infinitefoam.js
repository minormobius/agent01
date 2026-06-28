// infinitefoam.js — THE INFINITE PRODUCTION LAYER. Not a hex pipe — the connective tissue the finite naves
// float in. The naves are bounded little societies (parenchyma, the carbon-pump lobules); production is the
// interstitium + vasculature BETWEEN them, and THAT is what's infinite. Two interpenetrating vessel
// lattices — MATERIAL arteries + PEDESTRIAN veins — run forever, never touching (the two-species result,
// now endless), with naves hanging off the arteries like organs and the eight verticals as glands along
// the vessels.
//
// The infinity HOOK (the 3D cousin of the 2D seam contract in econ/record.js): every hub, vessel, and nave
// is a PURE FUNCTION of its lattice coordinate + the ship seed, so the ship streams around the player
// forever and any two windows agree on their overlap. No global solve, no bounds — just a windowed read of
// a deterministic field. Pure + node-tested in test/infinitefoam.selftest.mjs.

// deterministic hash of a 3D lattice cell → [0,1)
function h3(ix, iy, iz, salt) {
  let h = (salt ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (ix & 0xfffff), 2654435761); h ^= h >>> 15;
  h = Math.imul(h ^ (iy & 0xfffff), 2246822519); h ^= h >>> 13;
  h = Math.imul(h ^ (iz & 0x3ff), 3266489917); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const DEFAULTS = { T: 120, jitter: 0.45, naveProb: 0.16, seed: 1 };

// a vessel hub at integer lattice (ix,iy,iz). `species` shifts the lattice by half a cell so the two vessel
// systems INTERPENETRATE without ever sharing a hub (material at k·T, pedestrian at (k+½)·T).
export function hubAt(ix, iy, iz, species, o = {}) {
  const { T, jitter, seed } = { ...DEFAULTS, ...o };
  const off = species === 'pedestrian' ? 0.5 : 0;
  const salt = species === 'pedestrian' ? (seed ^ 0x5eed) >>> 0 : seed;
  const x = (ix + off + 0.5 + (h3(ix, iy, iz, salt ^ 0x11) - 0.5) * jitter) * T;
  const y = (iy + off + 0.5 + (h3(ix, iy, iz, salt ^ 0x22) - 0.5) * jitter) * T;
  const z = (iz + off + 0.5 + (h3(ix, iy, iz, salt ^ 0x33) - 0.5) * jitter) * T;
  // a nave is a material hub the field flags as an organ (a bounded little society on the artery)
  const nave = species === 'material' && h3(ix, iy, iz, (seed ^ 0x4e617665) >>> 0) < (o.naveProb ?? DEFAULTS.naveProb);
  // which production vertical is glanded here (only non-nave material hubs run an engine)
  const gland = species === 'material' && !nave ? GLANDS[(h3(ix, iy, iz, (seed ^ 0x61) >>> 0) * GLANDS.length) | 0] : null;
  return { ix, iy, iz, species, x, y, z, nave, gland, key: species[0] + ix + ',' + iy + ',' + iz };
}
export const GLANDS = ['foundry', 'mill', 'chemworks', 'fab', 'weave', 'fluid', 'assembly', 'reclaim'];

// a WINDOW of the infinite ship around a world point: the hubs, the vessel segments (each hub → its +x/+y/+z
// neighbour in the same lattice), and the naves, within radius R. Streamable: move the centre, read again.
export function shipWindow(center, R, o = {}) {
  const opt = { ...DEFAULTS, ...o }, T = opt.T;
  const lo = (c) => Math.floor((c - R) / T) - 1, hi = (c) => Math.ceil((c + R) / T) + 1;
  const within = (h) => (h.x - center.x) ** 2 + (h.y - center.y) ** 2 + (h.z - center.z) ** 2 <= R * R;
  const out = { material: { hubs: [], edges: [] }, pedestrian: { hubs: [], edges: [] }, naves: [], center, R, T };
  for (const species of ['material', 'pedestrian']) {
    const net = out[species], seen = new Map();
    const get = (ix, iy, iz) => { const k = ix + ',' + iy + ',' + iz; let h = seen.get(k); if (!h) { h = hubAt(ix, iy, iz, species, opt); seen.set(k, h); } return h; };
    for (let iz = lo(center.z); iz <= hi(center.z); iz++) for (let iy = lo(center.y); iy <= hi(center.y); iy++) for (let ix = lo(center.x); ix <= hi(center.x); ix++) {
      const h = get(ix, iy, iz);
      if (within(h)) { net.hubs.push(h); if (species === 'material' && h.nave) out.naves.push(h); }
      for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { const n = get(ix + dx, iy + dy, iz + dz); if (within(h) || within(n)) net.edges.push([h, n]); }
    }
  }
  return out;
}

// quick stat: do the two vessel systems ever coincide in this window? (they must NOT — the non-touching
// guarantee, now infinite). Returns the minimum hub-to-hub distance across systems.
export function minCrossDistance(win) {
  let md = Infinity;
  for (const a of win.material.hubs) for (const b of win.pedestrian.hubs) { const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2; if (d < md) md = d; }
  return Math.sqrt(md);
}
