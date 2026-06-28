// infinitefoam.js — THE RIND AS A CYLINDRICAL SHELL. The ship is an O'Neill cylinder; the rind is its shell.
// So the production foam is NOT free 3D — it's "bounded but infinite", with a direction for each axis:
//
//   • RADIAL (ir) — BOUNDED. A stack of shells. Naves dot the INNER surface (ir 0), then the upper-rind
//     production layers stratify OUTWARD (assembly nearest the naves → refine → foundry → reclaim deepest),
//     with the lower rind below (ir ≥ Nr, deferred). "Up from a nave" = inward (naves / the bioengine
//     centre); "down" = outward (lower rind). The formation tower IS this radial gradient.
//   • AZIMUTHAL (ith) — BOUNDED + PERIODIC. It wraps the circumference and closes: cell (ith) ≡ (ith + Nth).
//     The ring seam — the cylinder cousin of econ/region.js's "ring closes azimuthally".
//   • AXIAL (iz) — INFINITE. The big big cylinder streams forever along its length.
//
// Every hub/vessel/nave is a pure function of (iz, ith mod Nth, ir) + seed, so the ship streams along the
// axis forever and any two axial windows agree on their overlap (the seam contract). Two interpenetrating
// vessel lattices (material arteries · pedestrian veins, half-cell offset) never touch. Node-tested.

function h3(ix, iy, iz, salt) {
  let h = (salt ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (ix & 0xfffff), 2654435761); h ^= h >>> 15;
  h = Math.imul(h ^ (iy & 0x3ff), 2246822519); h ^= h >>> 13;
  h = Math.imul(h ^ (iz & 0x3ff), 3266489917); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const DEFAULTS = { Tz: 90, Nth: 24, Nr: 5, R0: 360, Tr: 46, jitter: 0.42, naveProb: 0.2, seed: 1 };
// the radial stratification (the tower, laid along the cylinder's radius). ir 0 = the nave shell (inner
// surface); production stratifies outward; ir ≥ Nr is the lower rind (deferred).
export const SHELL = ['nave', 'assembly', 'refine', 'foundry', 'reclaim'];
const REFINERS = ['mill', 'chemworks', 'fab', 'weave'];

// a vessel hub at lattice (iz axial, ith azimuthal, ir radial). ith is taken mod Nth (the ring closes);
// ir must be in [0, Nr). `species` shifts the lattice half a cell axially + azimuthally so the two vessel
// systems interpenetrate without ever sharing a hub.
export function hubAt(iz, ith, ir, species, o = {}) {
  const opt = { ...DEFAULTS, ...o }, { Tz, Nth, R0, Tr, jitter, seed } = opt;
  const itw = ((ith % Nth) + Nth) % Nth;                       // azimuthal wrap — the ring closes
  const ped = species === 'pedestrian', off = ped ? 0.5 : 0, salt = ped ? (seed ^ 0x5eed) >>> 0 : seed;
  const a = (iz + off + (h3(iz, itw, ir, salt ^ 0x11) - 0.5) * jitter) * Tz;                 // axial (the infinite dim)
  const phi = ((itw + off + (h3(iz, itw, ir, salt ^ 0x22) - 0.5) * jitter) / Nth) * Math.PI * 2;   // angle around
  const rho = R0 + (ir + (h3(iz, itw, ir, salt ^ 0x33) - 0.5) * jitter * 0.5) * Tr;          // radius (bounded shell)
  const nave = species === 'material' && ir === 0 && h3(iz, itw, ir, (seed ^ 0x4e) >>> 0) < opt.naveProb;
  const role = SHELL[ir] || 'lower';
  const gland = species === 'material' && ir > 0 ? (role === 'refine' ? REFINERS[(h3(iz, itw, ir, (seed ^ 0x61) >>> 0) * REFINERS.length) | 0] : (role === 'foundry' ? (h3(iz, itw, ir, seed ^ 0x66) < 0.3 ? 'fluid' : 'foundry') : role)) : null;
  // world: cylinder axis = world Z (axial); cross-section in world X/Y (radius·angle)
  return { iz, ith: itw, ir, species, a, phi, rho, x: rho * Math.cos(phi), y: rho * Math.sin(phi), z: a, nave, role, gland, key: species[0] + iz + '.' + itw + '.' + ir };
}

// a WINDOW of the cylinder: a BAND along the axis (|axial − centerA| ≤ span) × the FULL ring (all Nth) ×
// the FULL bounded thickness (all Nr shells). Streams along the axis; the ring + radius are bounded.
export function shipWindow(centerA, span, o = {}) {
  const opt = { ...DEFAULTS, ...o }, { Tz, Nth, Nr } = opt;
  const iz0 = Math.floor((centerA - span) / Tz) - 1, iz1 = Math.ceil((centerA + span) / Tz) + 1;
  const out = { material: { hubs: [], edges: [] }, pedestrian: { hubs: [], edges: [] }, naves: [], centerA, span, opt };
  for (const species of ['material', 'pedestrian']) {
    const net = out[species], cache = new Map();
    const get = (iz, ith, ir) => { const k = iz + '.' + (((ith % Nth) + Nth) % Nth) + '.' + ir; let h = cache.get(k); if (!h) { h = hubAt(iz, ith, ir, species, opt); cache.set(k, h); } return h; };
    const inBand = (h) => Math.abs(h.a - centerA) <= span;
    for (let iz = iz0; iz <= iz1; iz++) for (let ith = 0; ith < Nth; ith++) for (let ir = 0; ir < Nr; ir++) {
      const h = get(iz, ith, ir);
      if (inBand(h)) { net.hubs.push(h); if (species === 'material' && h.nave) out.naves.push(h); }
      // vessels: axial +1, azimuthal +1 (wraps), radial +1 (bounded — only within the shell)
      const nb = [get(iz + 1, ith, ir), get(iz, ith + 1, ir)]; if (ir + 1 < Nr) nb.push(get(iz, ith, ir + 1));
      for (const n of nb) if (inBand(h) || inBand(n)) net.edges.push([h, n]);
    }
  }
  // power + water: a few bold trunks along the deep shell (ir = Nr-1, against the lower rind) + radial risers
  // climbing inward to feed production. Major arterials, not mesh.
  const NT = opt.Ntrunk || NTRUNK, irTrunk = Nr - 1;
  for (const kind of ['power', 'water']) {
    const net = out[kind] = { hubs: [], edges: [] }, inBand = (h) => Math.abs(h.a - centerA) <= span;
    for (let s = 0; s < NT; s++) {
      let prev = null;
      for (let iz = iz0; iz <= iz1; iz++) {
        const h = utilHub(iz, s, irTrunk, kind, opt);
        if (inBand(h)) net.hubs.push(h);
        if (prev && (inBand(prev) || inBand(h))) net.edges.push([prev, h]);
        prev = h;
        if (((iz + (kind === 'water' ? 1 : 0)) % 3) === 0) {     // a riser every 3 stations (staggered by utility)
          let pr = h;
          for (let ir = irTrunk - 1; ir >= 1; ir--) { const r = utilHub(iz, s, ir, kind, opt); if (inBand(r)) net.hubs.push(r); net.edges.push([pr, r]); pr = r; }
        }
      }
    }
  }
  return out;
}

export function minCrossDistance(win) {
  let md = Infinity;
  for (const a of win.material.hubs) for (const b of win.pedestrian.hubs) { const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2; if (d < md) md = d; }
  return Math.sqrt(md);
}

// ── UTILITY TRUNKS: power + water, the 3rd & 4th path sets ────────────────────────────────────────────────
// Unlike the fine material/pedestrian mesh, these are MAJOR ARTERIALS rising from the lower rind: a few bold
// trunks running clean & straight along the deepest shell (ir = Nr-1, against the lower rind), with periodic
// radial RISERS climbing inward to feed production. Power & water are interleaved azimuthally so they never
// share a slot. Pure functions of (iz, slot, ir) + seed → same seam contract as everything else.
const NTRUNK = 6;                                  // trunk slots around the ring (per utility)
function utilHub(iz, slot, ir, kind, o) {
  const opt = { ...DEFAULTS, ...o }, { Tz, Nth, R0, Tr } = opt, NT = opt.Ntrunk || NTRUNK;
  const phase = kind === 'power' ? 0 : 0.5;          // interleave the two utilities between slots
  const ithF = (slot + phase) * (Nth / NT);
  const a = iz * Tz, phi = (ithF / Nth) * Math.PI * 2, rho = R0 + ir * Tr;
  return { iz, slot, ir, kind, a, phi, rho, x: rho * Math.cos(phi), y: rho * Math.sin(phi), z: a, key: kind[0] + iz + '.' + slot + '.' + ir };
}

// ── RIND STRUCTURE: the load path the foam doesn't walk alone (from /rind's research.js) ──────────────────
// The secant-cable web — an {N/k} star polygon of N rim anchors each joined to the k-th, every cable a CHORD
// (a secant of the ring) cutting across the bore to carry hoop tension. Here the planar web is ADVANCED one
// bay along the axis, so the two mirrored families (i→i+k and i→i−k) become counter-rotating helices that
// CROSS in the traverse (the Shukhov hyperboloid) while still reading as the {N/k} rose down the bore. Plus
// ring hoops + axial stringers. The cables stay clear of the bore centre by coreClear = ROUT·cos(πk/N).
export function shipStructure(centerA, span, o = {}) {
  const opt = { ...DEFAULTS, ...o }, { Tz, Nth, Nr, R0, Tr } = opt;
  const ROUT = R0 + Nr * Tr, Rin = R0;
  const N = opt.anchorsN || 18, k = opt.cableK || 5, pitch = (opt.cableBay || 2) * Tz;
  const ang = Math.PI * k / N, coreClear = ROUT * Math.cos(ang);     // nearest approach of any chord to the axis
  const anchor = (i, z) => { const th = 2 * Math.PI * (((i % N) + N) % N) / N; return { x: ROUT * Math.cos(th), y: ROUT * Math.sin(th), z, i: ((i % N) + N) % N }; };
  const out = { N, k, coreClear, ROUT, Rin, hoops: [], stringers: [], cables: [], opt };
  const iz0 = Math.floor((centerA - span) / Tz) - 1, iz1 = Math.ceil((centerA + span) / Tz) + 1;
  for (let iz = iz0; iz <= iz1; iz++) { if (iz % 2) continue; const z = iz * Tz; if (Math.abs(z - centerA) <= span + Tz) { out.hoops.push({ z, rho: ROUT, kind: 'outer' }); out.hoops.push({ z, rho: Rin, kind: 'inner' }); } }
  const Nstr = opt.Nstr || 9, z0 = centerA - span, z1 = centerA + span;
  for (let s = 0; s < Nstr; s++) { const th = 2 * Math.PI * s / Nstr; out.stringers.push({ x: ROUT * Math.cos(th), y: ROUT * Math.sin(th), z0, z1 }); }
  const m0 = Math.floor((centerA - span) / pitch) - 1, m1 = Math.ceil((centerA + span) / pitch) + 1;
  for (let m = m0; m <= m1; m++) { const za = m * pitch, zb = za + pitch; if (zb < centerA - span || za > centerA + span) continue;
    for (let i = 0; i < N; i++) { out.cables.push({ a: anchor(i, za), b: anchor(i + k, zb), fam: 'A', m, i }); out.cables.push({ a: anchor(i, za), b: anchor(i - k, zb), fam: 'B', m, i }); }
  }
  return out;
}
