/* Hearth — the orb. A settlement 3 km across, held down by its core: a
   fusion-forged mass whose pull is a full g at the surface, and whose heat
   is why everyone lives on the shell.

   The ground is a spherical Voronoi diagram from Orb's sphere.js (a convex
   hull, Lloyd-relaxed into even cells): every cell is a LOT, a city block of
   about 85 m, and every cell boundary is a street. A lot's building is its
   cell, inset by half a street, extruded straight out from the core, so the
   town's towers lean away from each other and the skyline bristles.

   Numbers that follow from a 1 g core under a 1500 m radius: the horizon is
   70 m away for someone standing; the top of a 200 m tower is at 0.78 g;
   escape speed is 171 m/s and a circular orbit at the rooftops 121 m/s,
   once round every 78 s. So a rocket port is cheap, and the sky is busy. */
export const R = 1500;              // metres
export const G0 = 9.81;
export const O_ = {
  LOTS: 3000, RELAX: 3,             // ~9400 m² a lot
  STREET: 7,                        // half a street: the inset from the cell's edge
  FLOOR: 3.6,                       // metres a storey
  PORT_APRON: 170,                  // the pad and its apron: nothing built within this of the port
};

/* A lot's building in tiers: a podium on the whole plate, then a narrower
   shaft, then a crown. [from floor, to floor, plate scale]. The sim's floor
   area and the renderer's walls both come from here. */
export function tiers(f) {
  if (f <= 0) return [];
  if (f <= 8) return [[0, f, 1]];
  if (f <= 24) return [[0, 4, 1], [4, f, 0.72]];
  const t = Math.max(6, Math.round(f * 0.78));
  return [[0, 5, 1], [5, t, 0.56], [t, f, 0.4]];
}
/* Floor area a building holds, in plates (a plate is the inset lot's area). */
export function plates(f) { let a = 0; for (const [z0, z1, s] of tiers(f)) a += (z1 - z0) * s * s; return a; }
/* What gravity is at height h above the ground (it falls as 1/r² from the core). */
export function gAt(h) { return G0 * (R / (R + h)) ** 2; }

export function makeOrb(seed) {
  const m = globalThis.ORB.buildMesh(seed >>> 0, O_.LOTS, O_.RELAX), n = m.n, P = m.sites, V = m.verts;
  const area = new Float64Array(n), plate = new Float64Array(n), inr = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ring = m.polys[i], p = [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
    let a = 0, d = Infinity;
    for (let k = 0; k < ring.length; k++) {
      const A = vert(V, ring[k]), B = vert(V, ring[(k + 1) % ring.length]);
      a += 0.5 * len(cross(sub(A, p), sub(B, p)));
      d = Math.min(d, distToSeg(p, A, B));
    }
    area[i] = a * R * R; inr[i] = d * R;
    const k = Math.max(0, 1 - O_.STREET / Math.max(1, inr[i]));   // the plate: the lot less half a street all round
    plate[i] = area[i] * k * k;
  }
  // the port: the lot nearest a seeded point
  let s = seed >>> 0; const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return s / 4294967296; };
  const z = 2 * rnd() - 1, th = 2 * Math.PI * rnd(), q = [Math.sqrt(1 - z * z) * Math.cos(th), Math.sqrt(1 - z * z) * Math.sin(th), z];
  let port = 0, best = -2; for (let i = 0; i < n; i++) { const dd = P[3 * i] * q[0] + P[3 * i + 1] * q[1] + P[3 * i + 2] * q[2]; if (dd > best) { best = dd; port = i; } }
  const dPort = new Float64Array(n); for (let i = 0; i < n; i++) dPort[i] = dist(P, i, port);
  return { seed: seed >>> 0, n, P, V, polys: m.polys, nbrs: m.nbrs, area, plate, inr, port, dPort };
}
/* Metres along the surface between lots i and j. */
export function dist(P, i, j) { const d = P[3 * i] * P[3 * j] + P[3 * i + 1] * P[3 * j + 1] + P[3 * i + 2] * P[3 * j + 2]; return R * Math.acos(Math.max(-1, Math.min(1, d))); }

function vert(V, k) { return [V[3 * k], V[3 * k + 1], V[3 * k + 2]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function len(a) { return Math.hypot(a[0], a[1], a[2]); }
function distToSeg(p, a, b) {
  const ab = sub(b, a), ap = sub(p, a), t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / Math.max(1e-18, ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return len(sub(ap, [ab[0] * t, ab[1] * t, ab[2] * t]));
}
