/* KATABASIS's grotto: what the cave looks like, never what it is. From a built cave it derives the light
   sources (clusters of glowing crystal grown on the walls, spaced through all four dimensions, in the fae
   colours; the goal crystal the brightest of them) and the dressing of the rock (gemstone round each light,
   glowing moss in patches). None of it touches the rules: the solver's cave is the cave, and every proof
   stands. No DOM: the selftest checks the lights sit in open air.

   The renderer packs this into its texture above the cave's own values: v = kind | deco << 2, where kind is
   the cave's (0 air, 1 rock, 2 goal) and deco is 1 gemstone, 2 moss. */
export const PALETTE = [[0.35, 1.0, 0.85], [0.78, 0.5, 1.0], [1.0, 0.5, 0.78], [1.0, 0.82, 0.45], [0.5, 0.8, 1.0]];
const NB = [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, -1, 0, 0], [0, 0, 1, 0], [0, 0, -1, 0], [0, 0, 0, 1], [0, 0, 0, -1]];

function hasher(seed) {
  return (x, y, z, w, k = 0) => {
    let n = (Math.imul(x + 911, 73856093) ^ Math.imul(y + 911, 19349663) ^ Math.imul(z + 911, 83492791) ^ Math.imul(w + 911, 2654435761 | 0) ^ Math.imul(seed + k * 101, 374761393)) >>> 0;
    n ^= n >>> 15; n = Math.imul(n, 0x2c1b3c6d) >>> 0; n ^= n >>> 12; n = Math.imul(n, 0x297a2d39) >>> 0; n ^= n >>> 15;
    return (n >>> 0) / 4294967296;
  };
}

/* { lights: [{ p (4D, voxels), color, power, goal }], deco: Uint8Array over the cave's voxels } */
export function decorate(cave, seed = 1, { maxLights = 40, spacing = 5 } = {}) {
  const [X, Y, Z, W] = cave.dims, h = hasher(seed), deco = new Uint8Array(cave.v.length), lights = [];
  const rock = (x, y, z, w) => cave.at(x, y, z, w) === 1;
  // the goal crystal is a light: the middle of its voxels
  let gs = [0, 0, 0, 0], gn = 0;
  for (let w = 0; w < W; w++) for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) if (cave.at(x, y, z, w) === 2) { gs = gs.map((v, i) => v + [x, y, z, w][i] + 0.5); gn++; }
  if (gn) lights.push({ p: gs.map((v) => v / gn), color: [0.6, 0.95, 1.0], power: 2.2, goal: true });
  // the wall lights: air voxels against rock, in the order a hash gives them, each kept if it's far enough from
  // every light so far; pushed half a voxel off the wall they grow from
  const cand = [];
  for (let w = 1; w < W - 1; w++) for (let z = 1; z < Z - 1; z++) for (let y = 1; y < Y - 1; y++) for (let x = 1; x < X - 1; x++) {
    if (cave.at(x, y, z, w) !== 0) continue;
    const wall = NB.filter((o) => rock(x + o[0], y + o[1], z + o[2], w + o[3]));
    if (wall.length === 1) cand.push({ v: [x, y, z, w], out: wall[0].map((s) => -s), r: h(x, y, z, w) });
  }
  cand.sort((a, b) => a.r - b.r);
  for (const c of cand) {
    if (lights.length >= maxLights + (gn ? 1 : 0)) break;
    const p = c.v.map((v, i) => v + 0.5 + 0.1 * c.out[i]);
    if (lights.some((l) => Math.hypot(...l.p.map((v, i) => v - p[i])) < spacing)) continue;
    lights.push({ p, color: PALETTE[Math.floor(c.r * 997) % PALETTE.length], power: 1.3 + 0.7 * h(...c.v, 1), anchor: c.v.map((v, i) => v - c.out[i]) });
  }
  // gemstone: the rock round each light's anchor, within a couple of voxels
  for (const l of lights) {
    if (!l.anchor) continue;
    const a = l.anchor;
    for (let w = a[3] - 2; w <= a[3] + 2; w++) for (let z = a[2] - 2; z <= a[2] + 2; z++) for (let y = a[1] - 2; y <= a[1] + 2; y++) for (let x = a[0] - 2; x <= a[0] + 2; x++) {
      if (!rock(x, y, z, w) || !cave.in(x, y, z, w)) continue;
      const d = Math.hypot(x - a[0], y - a[1], z - a[2], w - a[3]);
      if (d < 1.2 + 1.3 * h(x, y, z, w, 2)) deco[cave.idx(x, y, z, w)] = 1;
    }
  }
  // moss: on rock at the surface, in soft patches
  for (let w = 1; w < W - 1; w++) for (let z = 1; z < Z - 1; z++) for (let y = 1; y < Y - 1; y++) for (let x = 1; x < X - 1; x++) {
    const i = cave.idx(x, y, z, w);
    if (cave.v[i] !== 1 || deco[i]) continue;
    if (!NB.some((o) => cave.at(x + o[0], y + o[1], z + o[2], w + o[3]) === 0)) continue;
    const blob = h(x >> 2, y >> 2, z >> 2, w >> 2, 3); // patches four voxels across
    if (blob > 0.8 && h(x, y, z, w, 4) > 0.45) deco[i] = 2;
  }
  return { lights, deco };
}
