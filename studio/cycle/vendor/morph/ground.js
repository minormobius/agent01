// ground.js — the ground a city stands on: a heightfield in metres, a river in its valley, perhaps a
// coast. Pure, DOM-free, deterministic. Every layer above reads this one ground: the settlement field
// (polis/field.js) samples it to decide where the town is founded and where it spreads, morph lays its
// streets and plots on it, and the flight will fly over it.
//
// The shape, in the order it is made:
//
//   HILLS: fractal noise scaled to the place's relief (most places are gentle: a town is founded
//   where the ground was buildable), with a broad tilt so water has somewhere to go.
//
//   THE RIVER enters the frame on one side and leaves on the other (into the sea, on a coast). Its
//   centreline meanders about the chord between them. Its water surface falls gently downstream. The
//   valley is cut INTO the hills as a profile of distance from the centreline: the channel (a few
//   metres deep), its banks, a flat FLOODPLAIN (the land that floods: cheap until embanked), a
//   TERRACE scarp up to the older valley floor, then the valley's sides rising until they meet the
//   hills. So the town gets what towns are built round: a crossing, dry terraces, and wet meadows.
//
//   THE COAST, if there is one: a shoreline across the frame (wiggling), the land dropping to it at a
//   beach's or a cliff's slope, the sea floor shelving below.
//
//   REPOSE: no slope may stand steeper than the soil's friction angle (thermal relaxation, the same
//   rule as tjs/brut/terrain.js: the angle of repose IS φ). A natural slope does not fail; what fails
//   is a cut, which is earthworks' business, not the ground's.
//
//   const g = Ground(seed, { size: 3000 });
//   g.heightAt(x, y)  → metres above the sea      g.water(x, y) → 'river' | 'sea' | null
//   g.slopeAt(x, y)   → rise over run              g.river.path → [[x, y], …] (metres)
//   g.sampler()       → the field's (x, y in km) → { elev, moist, water } and g.riverPathKm()

import { Rand, fbm2 } from './rand.js';

export const SOILS = {
  rock:  { label: 'rock', phi: 45 },
  dense: { label: 'very dense soil', phi: 40 },
  stiff: { label: 'stiff soil', phi: 33 },
  clay:  { label: 'soft clay', phi: 25 },
};

/**
 * opts: size (m, the frame's side), cell (m), relief (m), soil, river (false for none), riverDir
 * (radians: the way it flows), coast (true/false; default by seed), coastDir (radians: toward the sea).
 */
export function Ground(seed, opts = {}) {
  const R = Rand(seed, 'ground');
  const size = opts.size || 3000, half = size / 2, cell = opts.cell || 8;
  const n = Math.round(size / cell) + 1, N = n * n;
  const relief = opts.relief ?? Math.round((8 + Math.pow(R.f(), 1.6) * 62) * 10) / 10;
  const soil = SOILS[opts.soil] || SOILS[R.pick(['dense', 'stiff', 'stiff', 'clay'])];
  const coast = opts.coast ?? R.chance(0.35);
  const coastDir = opts.coastDir ?? R.range(0, Math.PI * 2);
  const hasRiver = opts.river !== false;
  const riverDir = opts.riverDir ?? (coast ? coastDir + R.range(-0.5, 0.5) : R.range(0, Math.PI * 2));
  const s1 = (Math.imul(seed | 0, 2654435761) >>> 0) % 1e6, tilt = R.range(0, Math.PI * 2), tiltK = R.range(0.002, 0.008);
  const g = { seed, size, cell, n, relief, soil, coast, coastDir, hasRiver, riverDir, h: new Float32Array(N) };
  const X = (i) => -half + (i % n) * cell, Y = (i) => -half + Math.floor(i / n) * cell;

  // ---- hills
  for (let i = 0; i < N; i++) {
    const x = X(i), y = Y(i);
    const f = fbm2(x / 1100 + 7.3, y / 1100 - 2.1, s1, 6, 0.48);
    const ridge = 1 - Math.abs(2 * fbm2(x / 2300 + 1.7, y / 2300 + 9.1, s1 + 17, 3) - 1);      // a broad ridge or two
    g.h[i] = Math.max(2, 6 + relief * (1.25 * (f - 0.35) + 0.35 * ridge) + (x * Math.cos(tilt) + y * Math.sin(tilt)) * tiltK * relief / 30);
  }

  let shoreAt = null;
  // ---- the river: a meandering centreline, a falling surface, and its valley cut into the hills
  if (hasRiver) {
    const ux = Math.cos(riverDir), uy = Math.sin(riverDir), vx = -uy, vy = ux;
    // from the frame's edge upstream to the edge downstream (or the sea), through the middle third
    const off = R.range(-0.25, 0.25) * half, reach = half * 1.45;
    const A = [-ux * reach + vx * off, -uy * reach + vy * off], L = reach * 2;
    const amp = R.range(60, 220), k = R.range(1.2, 2.6), ph = R.range(0, Math.PI * 2);
    const path = [];
    for (let s = 0; s <= 240; s++) {
      const t = s / 240, w = amp * Math.sin(Math.PI * 2 * k * t + ph) * Math.sin(Math.PI * t) + 120 * (2 * fbm2(t * 4 + 1.1, 2.2, s1 + 59, 3) - 1);
      path.push([A[0] + ux * L * t + vx * w, A[1] + uy * L * t + vy * w]);
    }
    // the channel's width, the floodplain's, and the water surface (sea level at the coast)
    const width = R.range(30, 80), plain = R.range(110, 280), terrace = R.range(5, 10), side = R.range(0.06, 0.16);
    const cum = [0]; for (let s = 1; s < path.length; s++) cum.push(cum[s - 1] + Math.hypot(path[s][0] - path[s - 1][0], path[s][1] - path[s - 1][1]));
    const total = cum[cum.length - 1], zIn = coast ? R.range(2.5, 5) : R.range(4, 9), zOut = coast ? 0 : zIn - R.range(1.5, 4);
    const surface = (s) => zIn + (zOut - zIn) * (s / total);
    // the floodplain widens and narrows along the valley; the channel meanders inside it, on a
    // shorter wavelength than the valley's own bends
    const plainAt = (s) => plain * (0.65 + 0.7 * fbm2(s / 700 + 4.4, 1.3, s1 + 71, 3));
    const lam = R.range(380, 800), ph2 = R.range(0, Math.PI * 2);
    const channel = path.map(([x, y], i) => {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L2 = Math.hypot(dx, dy) || 1;
      const room = Math.max(0, plainAt(cum[i]) - width / 2 - 14), m = room * 0.7 * (0.35 + 0.65 * fbm2(cum[i] / 900 + 2.7, 5.1, s1 + 83, 2)) * Math.sin(Math.PI * 2 * cum[i] / lam + ph2);
      return [x - dy / L2 * m, y + dx / L2 * m];
    });
    g.river = { path: channel, valley: path, width, plain, plainAt, terrace, total, surface };
    // distance to each polyline over the whole grid: sample it every 2 m, then an exact Euclidean
    // distance transform (Felzenszwalb & Huttenlocher) that also carries WHICH sample is nearest, so the
    // distance is measured to the sample itself (not its grid cell) and the along-river position comes free
    const nearest = (P) => {
      const pts = [], at = [];
      let acc = 0;
      for (let k2 = 0; k2 + 1 < P.length; k2++) {
        const [ax, ay] = P[k2], [bx, by] = P[k2 + 1], L2 = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.ceil(L2 / 2));
        for (let q = 0; q < m; q++) { pts.push([ax + (bx - ax) * q / m, ay + (by - ay) * q / m]); at.push(acc + L2 * q / m); }
        acc += L2;
      }
      const seedIdx = new Int32Array(N).fill(-1);
      for (let q = 0; q < pts.length; q++) {
        const i = Math.round((pts[q][0] + half) / cell), j = Math.round((pts[q][1] + half) / cell);
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const k = j * n + i, o2 = seedIdx[k];
        if (o2 < 0 || Math.hypot(pts[q][0] - X(k), pts[q][1] - Y(k)) < Math.hypot(pts[o2][0] - X(k), pts[o2][1] - Y(k))) seedIdx[k] = q;
      }
      const idx = edt(seedIdx, n), d = new Float32Array(N), sAt = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        const q = idx[k];
        if (q < 0) { d[k] = Infinity; continue; }
        d[k] = Math.hypot(pts[q][0] - X(k), pts[q][1] - Y(k)); sAt[k] = at[q];
      }
      return [d, sAt];
    };
    const [DV, SV] = nearest(path), [DC] = nearest(channel);
    g.riverDist = DC; g.valleyDist = DV; g.valleyS = SV;
    for (let i = 0; i < N; i++) {
      const dv = DV[i], sv = SV[i], dc = DC[i];
      const z = surface(sv), pl = plainAt(sv), w2 = width / 2;
      // the valley in cross-section: the channel's bed and bank, the floodplain, the terrace scarp, the side
      let p;
      if (dc < w2) p = z - 3 * (1 - (dc / w2) ** 2) - 0.4;
      else if (dc < w2 + 10 && dv < pl) p = z + 2.2 * ((dc - w2) / 10);
      else if (dv < pl) p = z + 2.2 + 1.3 * Math.min(1, dv / pl);
      else if (dv < pl + 30) p = z + 3.5 + terrace * smooth((dv - pl) / 30);
      else p = z + 3.5 + terrace + (dv - pl - 30) * side;
      g.h[i] = dv < pl + 30 || dc < w2 + 10 ? p : Math.min(g.h[i], p);
    }

  }

  // ---- the coast: a shoreline across the frame, the land falling to it, the sea floor below
  if (coast) {
    const cx = Math.cos(coastDir), cy = Math.sin(coastDir), shore0 = R.range(0.4, 0.62) * half, wig = R.range(30, 120);
    const landSlope = R.chance(0.6) ? R.range(0.02, 0.06) : R.range(0.25, 0.5);   // a beach, or cliffs
    g.landSlope = landSlope;
    shoreAt = (x, y) => { const t = -x * cy + y * cx; return shore0 + wig * (2 * fbm2(t / 600 + 3.3, 0.5, s1 + 41, 3) - 1); };
    for (let i = 0; i < N; i++) {
      const x = X(i), y = Y(i), p = x * cx + y * cy, d = shoreAt(x, y) - p;       // d > 0: on land, metres from the shore
      g.h[i] = d > 0 ? Math.min(g.h[i], 0.6 + d * landSlope) : -1.5 + d * 0.025;
    }
    g.shore = { dir: coastDir, at: shoreAt };
  }

  // ---- repose: thermal relaxation until no slope stands steeper than the soil allows
  const tanPhi = Math.tan(soil.phi * Math.PI / 180), drop = cell * tanPhi;
  for (let pass = 0; pass < 60; pass++) {
    let moved = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * n + i;
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        if (i + di >= n || j + dj >= n) continue;
        const b = (j + dj) * n + i + di, dh = g.h[a] - g.h[b];
        if (Math.abs(dh) > drop + 1e-4) { const m = (Math.abs(dh) - drop) / 2 * Math.sign(dh); g.h[a] -= m; g.h[b] += m; moved++; }
      }
    }
    if (!moved) break;
  }
  g.repose = soil.phi;

  // ---- reading it
  const at = (x, y) => {
    const fx = Math.max(0, Math.min(n - 1.000001, (x + half) / cell)), fy = Math.max(0, Math.min(n - 1.000001, (y + half) / cell));
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k0 = j * n + i;
    return [k0, u, v];
  };
  const lerpField = (F, x, y) => { const [k0, u, v] = at(x, y); return F[k0] * (1 - u) * (1 - v) + F[k0 + 1] * u * (1 - v) + F[k0 + n] * (1 - u) * v + F[k0 + n + 1] * u * v; };
  g.heightAt = (x, y) => lerpField(g.h, x, y);
  g.slopeAt = (x, y) => { const e = cell; return Math.hypot(g.heightAt(x + e, y) - g.heightAt(x - e, y), g.heightAt(x, y + e) - g.heightAt(x, y - e)) / (2 * e); };
  g.riverDistAt = (x, y) => (g.riverDist ? lerpField(g.riverDist, x, y) : Infinity);
  g.water = (x, y) => {
    if (g.river && g.riverDistAt(x, y) < g.river.width / 2) return 'river';
    if (coast && g.heightAt(x, y) < 0) return 'sea';
    return null;
  };
  // the floodplain: inside the valley's flat floor (below the terrace scarp), and dry
  g.floodplain = (x, y) => !!g.river && lerpField(g.valleyDist, x, y) < g.river.plainAt(lerpField(g.valleyS, x, y)) && g.water(x, y) == null;
  // the settlement field's view: kilometres in, its unitless elevation (≈ metres / 200) and moisture out
  g.sampler = () => (xk, yk) => {
    const x = xk * 1000, y = yk * 1000, h = g.heightAt(x, y), d = g.riverDistAt(x, y);
    const moist = Math.max(0.2, Math.min(1, 0.45 + 0.4 * Math.exp(-d / 500) - Math.max(0, h - 20) / 200));
    return { elev: Math.max(0.005, h / 200), moist, water: coast && h < 0 };
  };
  g.riverPathKm = () => (g.river ? g.river.path.map(([x, y]) => [x / 1000, y / 1000]) : null);
  return g;
}
/**
 * The exact Euclidean distance transform of a grid of seeds (-1 none, else a seed's label), returning
 * the label of the nearest seed at every point: rows, then columns, each a lower envelope of parabolas.
 */
function edt(seed, n) {
  const N = n * n, INF = 1e20, f = new Float64Array(n), lab = new Int32Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const g = new Float64Array(N), gl = new Int32Array(N), outD = new Float64Array(N), out = new Int32Array(N);
  const pass = (get, put) => {
    for (let line = 0; line < n; line++) {
      for (let q = 0; q < n; q++) { const [fv, lv] = get(line, q); f[q] = fv; lab[q] = lv; }
      let k = -1;
      const S = (q, p) => ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
      for (let q = 0; q < n; q++) {
        if (f[q] >= INF) continue;
        if (k < 0) { k = 0; v[0] = q; z[0] = -INF; z[1] = INF; continue; }
        let sx = S(q, v[k]);
        while (sx <= z[k]) { k--; sx = S(q, v[k]); }
        k++; v[k] = q; z[k] = sx; z[k + 1] = INF;
      }
      if (k < 0) { for (let q = 0; q < n; q++) put(line, q, INF, -1); continue; }
      k = 0;
      for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; put(line, q, (q - v[k]) ** 2 + f[v[k]], lab[v[k]]); }
    }
  };
  pass((j, i) => (seed[j * n + i] >= 0 ? [0, seed[j * n + i]] : [INF, -1]), (j, i, d, l) => { g[j * n + i] = d; gl[j * n + i] = l; });
  pass((i, j) => [g[j * n + i], gl[j * n + i]], (i, j, d, l) => { outD[j * n + i] = d; out[j * n + i] = l; });
  return out;
}
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
