// morph.js — a city's form, from districts down to buildings: streets → blocks → plots → buildings.
// Pure, DOM-free, deterministic (the same seed is the same city in node and every browser).
//
// The model is urban morphology's (M. R. G. Conzen, Alnwick 1960): a town plan is three things laid
// down at different times and lasting differently long — the STREET system, the PLOT pattern, and the
// BUILDINGS on the plots — and a town is read by the order they were laid in. Here:
//
//   DISTRICTS are GRAINS (the word is bismuth's, packages/bismuth/poly.js: a polycrystal is several
//   lattices at their own angles that grow until they meet). Each district was laid out in one era by
//   one idea of a street: the ORGANIC core (streets between irregular cells), a planned GRID (a
//   lattice at its own angle, avenues every few blocks), a RADIAL scheme (rings and spokes round a
//   rond-point), a SUBURB (big irregular cells, houses set back on their plots). A district's lattice
//   is clipped to the district's own region, so where two grains meet the blocks are cut short: the
//   seam is the irregular street and the triangular leftover plots (the flatirons) that real cities
//   have where two plans meet.
//
//   BLOCKS are the lattice cells, and STREETS are what is left between them: every block edge is moved
//   in by half its street's width (`geom.inset`), so two blocks either side of a street leave exactly
//   the street. A street's width is its rank: a lane, a street, an avenue, a boulevard on a seam.
//
//   PLOTS. A block is divided among the streets it fronts by the straight skeleton (`geom.zones`): the
//   land nearest each street belongs to it. Each frontage is cut into strips running back to the middle
//   of the block, as wide as the era's plots: burgage plots (5–8 m) in the old core, wider ones later.
//   Later eras MERGE strips (the burgage cycle: plots are amalgamated as values rise), so a modern
//   district has a few big plots where a medieval one has many narrow ones.
//
//   BUILDINGS stand on the front of each plot, as deep as the era built (a medieval range of 12 m, a
//   modern slab of 20), as tall as the era and the land's value allow, roofed as the era roofed: hipped
//   (the skeleton again, raised by a pitch) or flat. A suburb's houses stand back from the street.
//
//   const city = generate({ seed: 7 });   // { frame, districts, blocks, streets, plots, buildings, stats }

import * as G from './geom.js';

export const VERSION = 1;

// ---------------------------------------------------------------------------- randomness --
// xmur3 + mulberry32, the repo's convention (polis/prng.js, tjs/brut/rand.js): a stream per SALT, so
// adding a draw in one place cannot move anything elsewhere ("district/3/plot/12" is its own stream).
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
function mulberry32(a) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function Rand(seed, salt) {
  const f = mulberry32(xmur3(`${seed}::${salt}`)());
  return {
    f, range: (a, b) => a + (b - a) * f(), int: (a, b) => a + Math.floor(f() * (b - a + 1)),
    chance: (p) => f() < p, pick: (xs) => xs[Math.floor(f() * xs.length)],
    pickW: (pairs) => { let s = 0; for (const [, w] of pairs) s += w; let x = f() * s; for (const [v, w] of pairs) { x -= w; if (x <= 0) return v; } return pairs[pairs.length - 1][0]; },
  };
}

// ---------------------------------------------------------------------------- the eras --
// What each kind of district builds. Widths in metres; storeys as [min, max] near the centre and far
// out (the value of land falls with distance, and so do the buildings).
export const ERAS = {
  organic: {
    label: 'the old core', year: 1300,
    lattice: 'voronoi', cell: 70, jitter: 0.75,
    street: [5, 8], avenue: 11, plotW: [5, 8.5], merge: 0.08, depth: [10, 16], setback: 0,
    storeys: [[3, 5], [2, 3]], storeyH: 3.3, roof: 'hip', pitch: 0.8, square: 0.02,
  },
  grid: {
    label: 'a planned grid', year: 1820,
    lattice: 'grid', cell: [70, 110], street: [12, 15], avenue: 22, avenueEvery: 4,
    plotW: [7, 11], merge: 0.25, depth: [14, 20], setback: 0,
    storeys: [[4, 6], [3, 4]], storeyH: 3.4, roof: 'hip', pitch: 0.55, square: 0.03,
  },
  radial: {
    label: 'a boulevard scheme', year: 1870,
    lattice: 'radial', ring: 85, plaza: 55, street: [14, 18], avenue: 30, avenueEvery: 2,
    plotW: [10, 16], merge: 0.15, depth: [15, 18], setback: 0,
    storeys: [[6, 7], [5, 6]], storeyH: 3.6, roof: 'mansard', pitch: 1.6, square: 0.02,
  },
  modern: {
    label: 'a modern grid', year: 1965,
    lattice: 'grid', cell: [90, 140], street: [16, 20], avenue: 32, avenueEvery: 3,
    plotW: [12, 20], merge: 0.6, depth: [18, 26], setback: 4,
    storeys: [[8, 30], [4, 10]], storeyH: 3.5, roof: 'flat', pitch: 0, square: 0.05,
  },
  suburb: {
    label: 'a suburb', year: 1930,
    lattice: 'voronoi', cell: 120, jitter: 1.0, relax: false,
    street: [9, 12], avenue: 16, plotW: [14, 22], merge: 0.05, depth: [9, 12], setback: 7, side: 2.5,
    storeys: [[2, 2], [1, 2]], storeyH: 3, roof: 'hip', pitch: 0.65, square: 0.04,
  },
};
export const KINDS = Object.keys(ERAS);
const BOULEVARD = 26;            // a street on a seam between two districts: the old town's ring road

// ---------------------------------------------------------------------------- the plan --
/**
 * opts: seed, size (the frame's side, m), districts (how many), kinds (which eras may appear, the
 * first is the core's), plotScale, streetScale, heightScale.
 */
export function generate(opts = {}) {
  const o = { seed: 1, size: 1400, districts: 6, kinds: KINDS, plotScale: 1, streetScale: 1, heightScale: 1, ...opts };
  const S = o.size, half = S / 2, frame = [[-half, -half], [half, -half], [half, half], [-half, half]];
  const city = { seed: o.seed, frame, districts: [], blocks: [], streets: [], plots: [], buildings: [], squares: [] };

  // ---- districts: a Voronoi of seeds round the core; the core's kind is the first, and an era is
  // older the nearer it stands to the core (cities grow outward)
  const R = Rand(o.seed, 'districts');
  const n = Math.max(1, Math.min(12, o.districts | 0));
  const pts = [[R.range(-0.08, 0.08) * S, R.range(-0.08, 0.08) * S]];
  for (let i = 1; i < n; i++) {
    const a = (i / (n - 1)) * Math.PI * 2 + R.range(-0.35, 0.35), r = R.range(0.28, 0.46) * S;
    pts.push([pts[0][0] + Math.cos(a) * r, pts[0][1] + Math.sin(a) * r]);
  }
  const regions = G.voronoi(pts, frame);
  const kinds = o.kinds.filter((k) => ERAS[k]);
  const core = kinds[0] || 'organic', later = kinds.slice(1).length ? kinds.slice(1) : [core];
  pts.forEach((p, i) => {
    const kind = i === 0 ? core : R.pick(later);
    const toCore = Math.atan2(pts[0][1] - p[1], pts[0][0] - p[0]);
    city.districts.push({ id: i, kind, era: ERAS[kind], seed: p, region: regions[i], centre: G.centroid(regions[i]), angle: toCore + R.range(-0.25, 0.25), dist: Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) });
  });

  // ---- each district's lattice, clipped to its region: the blocks
  for (const d of city.districts) layDistrict(city, d, o);

  // ---- streets: each block edge drawn back by half its street's width
  for (const b of city.blocks) {
    const d = city.districts[b.district], e = d.era, Rs = Rand(o.seed, `street/${b.id}`);
    b.widths = b.cell.map((p, i) => {
      const q = b.cell[(i + 1) % b.cell.length];
      let w, rank;
      if (G.onBoundary(d.region, p, q) >= 0 && G.onBoundary(frame, p, q) < 0) { w = BOULEVARD; rank = 'boulevard'; }
      else if (b.avenue && b.avenue[i]) { w = e.avenue; rank = 'avenue'; }
      else { w = Rs.range(e.street[0], e.street[1]); rank = 'street'; }
      w *= o.streetScale;
      city.streets.push({ block: b.id, a: p, b: q, width: w, rank });
      return { w, rank };
    });
    b.lot = G.inset(b.cell, b.widths.map((x) => x.w / 2));
  }

  // ---- squares: a few blocks are left open (a market place in the core, squares in the plans)
  for (const b of city.blocks) {
    const d = city.districts[b.district];
    const near = d.id === 0 && G.inside(b.cell, d.seed);
    if (b.lot.length && (near || Rand(o.seed, `square/${b.id}`).chance(d.era.square))) { b.square = true; city.squares.push(b.id); }
  }

  // ---- plots, then buildings
  for (const b of city.blocks) if (b.lot.length && !b.square) layPlots(city, b, o);
  for (const p of city.plots) build(city, p, o);

  city.stats = stats(city);
  return city;
}

/** A district's lattice of block cells, clipped to its region (the seams fall where they fall). */
function layDistrict(city, d, o) {
  const e = d.era, reg = d.region, R = Rand(o.seed, `lattice/${d.id}`);
  const add = (cell, avenue = null) => {
    const C = G.clipConvex(cell, reg);
    if (C.length < 3 || G.area(C) < 60) return;
    // which edges of the CLIPPED cell are avenues: those lying on an avenue line of the lattice
    const av = avenue ? C.map((p, i) => avenue(p, C[(i + 1) % C.length])) : null;
    city.blocks.push({ id: city.blocks.length, district: d.id, cell: C, avenue: av });
  };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of reg) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const span = Math.hypot(maxX - minX, maxY - minY);

  if (e.lattice === 'grid') {
    // a rectangular lattice at the district's angle, its origin on the district's seed
    const ux = Math.cos(d.angle), uy = Math.sin(d.angle), vx = -uy, vy = ux;
    const bw = R.range(e.cell[0], e.cell[1]), bd = R.range(e.cell[0], e.cell[1]) * R.range(1.1, 1.6);
    const ox = d.seed[0], oy = d.seed[1], k = e.avenueEvery || 99;
    const nu = Math.ceil(span / bw) + 1, nv = Math.ceil(span / bd) + 1;
    for (let i = -nu; i <= nu; i++) for (let j = -nv; j <= nv; j++) {
      const cx = ox + ux * (i + 0.5) * bw + vx * (j + 0.5) * bd, cy = oy + uy * (i + 0.5) * bw + vy * (j + 0.5) * bd;
      if (Math.hypot(cx - d.centre[0], cy - d.centre[1]) > span) continue;
      const cell = G.orientedRect(cx, cy, ux, uy, bw / 2, bd / 2);
      // an avenue runs along every k-th lattice line in each direction
      const onLine = (p, q) => {
        const su = ((p[0] - ox) * ux + (p[1] - oy) * uy) / bw, sv = ((p[0] - ox) * vx + (p[1] - oy) * vy) / bd;
        const tu = ((q[0] - ox) * ux + (q[1] - oy) * uy) / bw, tv = ((q[0] - ox) * vx + (q[1] - oy) * vy) / bd;
        const isU = Math.abs(su - tu) < 1e-6 && Math.abs(su - Math.round(su)) < 1e-6 && Math.round(su) % k === 0;
        const isV = Math.abs(sv - tv) < 1e-6 && Math.abs(sv - Math.round(sv)) < 1e-6 && Math.round(sv) % k === 0;
        return isU || isV;
      };
      add(cell, onLine);
    }
  } else if (e.lattice === 'radial') {
    // rings and spokes round a rond-point on the district's seed; sectors multiply outward so the
    // blocks stay roughly as wide as they are deep
    const c = d.seed, r0 = e.plaza, dr = e.ring, k = e.avenueEvery || 99;
    // sectors DOUBLE outward from a base of 8 (so every spoke of an inner ring runs on through the
    // outer ones, and the avenue spokes stay straight), as soon as the blocks would get too wide
    const BASE = 8;
    for (let ring = 0; r0 + ring * dr < span; ring++) {
      const ra = r0 + ring * dr, rb = ra + dr, want = (2 * Math.PI * (ra + rb) / 2) / (dr * 1.3);
      let f = 1; while (BASE * f * 2 <= want) f *= 2;
      const spokes = BASE * f;
      for (let s = 0; s < spokes; s++) {
        const a0 = d.angle + (s / spokes) * Math.PI * 2, a1 = d.angle + ((s + 1) / spokes) * Math.PI * 2;
        const cell = [[c[0] + Math.cos(a0) * ra, c[1] + Math.sin(a0) * ra], [c[0] + Math.cos(a0) * rb, c[1] + Math.sin(a0) * rb], [c[0] + Math.cos(a1) * rb, c[1] + Math.sin(a1) * rb], [c[0] + Math.cos(a1) * ra, c[1] + Math.sin(a1) * ra]];
        // every k-th BASE spoke is an avenue, and so is the innermost ring (round the rond-point)
        const onLine = (p, q) => {
          const rp = Math.hypot(p[0] - c[0], p[1] - c[1]), rq = Math.hypot(q[0] - c[0], q[1] - c[1]);
          if (Math.abs(rp - r0) < 1e-6 && Math.abs(rq - r0) < 1e-6) return true;
          const idx = (pt) => ((((Math.atan2(pt[1] - c[1], pt[0] - c[0]) - d.angle) / (Math.PI * 2)) * spokes) % spokes + spokes) % spokes;
          const sp = idx(p), sq = idx(q), on = (x) => Math.abs(x - Math.round(x)) < 1e-6;
          return on(sp) && on(sq) && Math.round(sp) % spokes === Math.round(sq) % spokes && Math.round(sp) % (f * k) === 0;
        };
        add(G.ccw(cell), onLine);
      }
    }
    d.plaza = c;
  } else {
    // organic and suburban: a Voronoi of jittered points in the region, relaxed once (Lloyd) so the
    // cells are irregular but not shattered
    const cell = e.cell, pts = [];
    for (let x = minX - cell; x <= maxX + cell; x += cell) for (let y = minY - cell; y <= maxY + cell; y += cell) {
      const p = [x + R.range(-0.5, 0.5) * cell * e.jitter, y + R.range(-0.5, 0.5) * cell * e.jitter];
      if (G.inside(reg, p, cell * 0.2)) pts.push(p);
    }
    let cells = G.voronoi(pts, reg);
    if (e.relax !== false) {
      const relaxed = cells.map((C, i) => (C.length ? G.centroid(C) : pts[i]));
      cells = G.voronoi(relaxed, reg);
    }
    for (const C of cells) if (C.length) add(C);
  }
}

/** Divide a block among the streets it fronts, and each frontage into plots. */
function layPlots(city, b, o) {
  const d = city.districts[b.district], e = d.era, B = b.lot, Z = G.zones(B);
  const R = Rand(o.seed, `plots/${b.id}`);
  Z.forEach((zone, i) => {
    if (zone.length < 3) return;
    const a = B[i], q = B[(i + 1) % B.length], L = Math.hypot(q[0] - a[0], q[1] - a[1]);
    if (L < 3) { addPlot(city, b, zone, i, L, 0); return; }
    const ux = (q[0] - a[0]) / L, uy = (q[1] - a[1]) / L;
    // plot widths along the frontage, scaled to fit it exactly
    const ws = [];
    let sum = 0;
    const lo = e.plotW[0] * o.plotScale, hi = e.plotW[1] * o.plotScale;
    while (sum < L - lo * 0.5) { const w = R.range(lo, hi); ws.push(w); sum += w; }
    if (!ws.length) ws.push(L);
    // the burgage cycle: neighbouring strips merged into one, more often in later eras
    const merged = [];
    for (const w of ws) { if (merged.length && R.chance(e.merge)) merged[merged.length - 1] += w; else merged.push(w); }
    const k = L / merged.reduce((s, w) => s + w, 0), cuts = [];
    let acc = 0;
    for (let m = 0; m < merged.length - 1; m++) { acc += merged[m] * k; cuts.push(acc); }
    const strips = G.slices(zone, a, ux, uy, cuts);
    strips.forEach((S, m) => { if (S.length >= 3) addPlot(city, b, S, i, merged[m] * k, m); });
  });
}
function addPlot(city, b, poly, front, width, index) {
  const B = b.lot, a = B[front], q = B[(front + 1) % B.length];
  city.plots.push({ id: city.plots.length, block: b.id, district: b.district, poly, front: [a, q], frontEdge: front, width, index, depth: depthFrom(poly, a, q) });
}
function depthFrom(P, a, q) {
  const dx = q[0] - a[0], dy = q[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  let m = 0; for (const p of P) m = Math.max(m, nx * (p[0] - a[0]) + ny * (p[1] - a[1]));
  return m;
}

/** The building on a plot: on its front, as deep, tall and roofed as its era built. */
function build(city, p, o) {
  const d = city.districts[p.district], e = d.era, R = Rand(o.seed, `building/${p.id}`);
  const [a, q] = p.front, dx = q[0] - a[0], dy = q[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const c0 = -(nx * a[0] + ny * a[1]);                      // distance behind the frontage line
  if (R.chance(0.04) && e.setback === 0) return;            // a gap: a yard, a gate, a ruin
  const setback = e.setback, depth = R.range(e.depth[0], e.depth[1]);
  let F = G.clipHalf(p.poly, nx, ny, c0 - setback);
  F = G.clipHalf(F, -nx, -ny, -c0 + setback + depth);
  if (e.side) {
    // a house stands free of its neighbours: side yards, on the edges that are not the frontage
    const w = F.map((pt, i) => {
      const nb = F[(i + 1) % F.length], mid = [(pt[0] + nb[0]) / 2, (pt[1] + nb[1]) / 2];
      return Math.abs(nx * mid[0] + ny * mid[1] + c0 - setback) < 0.5 ? 0 : e.side;
    });
    F = G.inset(F, w);
  }
  if (F.length < 3 || G.area(F) < 18) return;
  // height: the era's range, falling with distance from the city's centre (the value of land)
  const core = city.districts[0].seed, cen = G.centroid(F), dist = Math.hypot(cen[0] - core[0], cen[1] - core[1]);
  const t = Math.min(1, dist / (city.frame[1][0] * 1.1));
  const lo = e.storeys[0][0] + (e.storeys[1][0] - e.storeys[0][0]) * t, hi = e.storeys[0][1] + (e.storeys[1][1] - e.storeys[0][1]) * t;
  let storeys = Math.max(1, Math.round(R.range(lo, hi) * o.heightScale));
  if (e.roof === 'flat' && R.chance(0.04) && G.area(F) > 500) storeys = Math.round(storeys * R.range(1.8, 3));   // a tower
  const h = storeys * e.storeyH;
  const roofKind = e.roof;
  const roof = roofKind === 'hip' ? G.hipRoof(F, e.pitch) : roofKind === 'mansard' ? mansard(F, e.storeyH * 1.1) : null;
  city.buildings.push({ id: city.buildings.length, plot: p.id, district: p.district, footprint: F, storeys, height: h, roof: roofKind, roofFaces: roof, frontEdge: frontEdgeOf(F, nx, ny, c0 - setback) });
}
/** A mansard: a steep lower slope to a setback, then flat. The hip zones, capped at a height. */
function mansard(F, h) {
  const steep = 2.2, cap = h / steep;
  return G.zones(F).map((Z, i) => ({ edge: i, poly: Z.map((p) => [p[0], p[1], Math.min(cap, Math.max(0, G.edgeDist(F, i, p))) * steep]) })).filter((r) => r.poly.length >= 3);
}
function frontEdgeOf(F, nx, ny, c) {
  for (let i = 0; i < F.length; i++) { const p = F[i], q = F[(i + 1) % F.length]; if (Math.abs(nx * p[0] + ny * p[1] + c) < 0.05 && Math.abs(nx * q[0] + ny * q[1] + c) < 0.05) return i; }
  return -1;
}

function stats(city) {
  const A = (P) => Math.abs(G.area(P));
  const land = A(city.frame), blocks = city.blocks.reduce((s, b) => s + A(b.lot.length ? b.lot : [[0, 0], [0, 0], [0, 0]]), 0);
  const built = city.buildings.reduce((s, b) => s + A(b.footprint), 0), floor = city.buildings.reduce((s, b) => s + A(b.footprint) * b.storeys, 0);
  return {
    districts: city.districts.length, blocks: city.blocks.length, plots: city.plots.length, buildings: city.buildings.length,
    streetShare: 1 - blocks / land, coverage: built / land, far: floor / land,
    tallest: city.buildings.reduce((m, b) => Math.max(m, b.height), 0),
  };
}
