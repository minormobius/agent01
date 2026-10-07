// aurora.js — the northern (and southern) lights for a place and a night. Pure: node, browser.
//
// Where: the aurora stands on an OVAL round the geomagnetic pole, its arcs at a geomagnetic latitude
// that moves equatorward as the night gets stormier (~67° in quiet times, ~49° at Kp 9). Each night
// draws its own activity (Kp) from the seed, stormier near the equinoxes, and the activity flares in
// substorms that peak around local midnight. So Tromsø or Reykjavík see it overhead on most dark
// nights, New York only in a storm, and then low in the north and mostly red.
//
// What: each arc is a curtain, a vertical sheet from ~100 km to ~300 km up, folded and wandering
// along its length, striated by rays that drift. Every direction in the sky is traced out to each
// curtain (on a curved Earth): the height where it crosses decides the colour (oxygen's green low
// down, its red high up, a purple lower edge in a strong storm). Nothing is special-cased: a far
// storm shows only its red tops above the horizon because that is what the geometry leaves.
//
//   const au = auroraAt(seed, ms, lat, lon, sunAlt, force);   // null when nothing can be seen
//   au.sample(altRad, azRad, t, out)                         // adds RGB (0..~1) into out[0..2]

const D = Math.PI / 180, R = 6371;
const POLE = [80.8 * D, -72.7 * D];            // the geomagnetic north pole (IGRF dipole, 2025)

const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const noise = (x, s) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i, s, 5) * (1 - u) + hash(i + 1, s, 5) * u; };

/** Geomagnetic latitude (degrees, signed) and the bearing (radians from north) to the nearer magnetic pole. */
export function geomag(lat, lon) {
  const p = lat * D, l = lon * D, [pp, pl] = POLE;
  const s = Math.sin(p) * Math.sin(pp) + Math.cos(p) * Math.cos(pp) * Math.cos(l - pl);
  const mlat = Math.asin(clamp(s, -1, 1)) / D;
  // the initial great-circle bearing to the pole of our own hemisphere
  const [tp, tl] = mlat >= 0 ? POLE : [-POLE[0], POLE[1] + Math.PI];
  const y = Math.sin(tl - l) * Math.cos(tp), x = Math.cos(p) * Math.sin(tp) - Math.sin(p) * Math.cos(tp) * Math.cos(tl - l);
  return { mlat, bearing: Math.atan2(y, x) };
}

/** The night's geomagnetic activity, Kp 0..9: seeded per local night, stormier near the equinoxes. */
export function kp(seed, ms, lon, force = null) {
  if (force != null) return force;
  const night = Math.floor((ms / 3600000 + lon / 15 - 12) / 24);
  const doy = (((night + 1) % 365.25) + 365.25) % 365.25;                  // the night's own date, so Kp holds all night
  const season = 1 + 0.3 * Math.abs(Math.cos(2 * Math.PI * (doy - 80) / 182.6));   // equinoxes ~1.3
  const u = hash(night, seed, 71);
  return clamp(-Math.log(1 - u * 0.9995) * 1.6 * season, 0, 9);
}

/**
 * The aurora for a place at a moment, or null when none can be seen (daylight, or the oval too far
 * away for even its tops to clear the horizon). `sunAlt` in degrees. `force` holds Kp (the page's
 * "aurora" button: a storm).
 */
export function auroraAt(seed, ms, lat, lon, sunAlt, force = null) {
  const dark = smooth(-5, -13, sunAlt);
  if (dark < 0.01) return null;
  const K = kp(seed, ms, lon, force), g = geomag(lat, lon), m = Math.abs(g.mlat);
  // substorms: the activity through the night, peaking near local midnight, flaring in bursts
  const hour = (((ms / 3600000 + lon / 15) % 24) + 24) % 24, fromMid = Math.min(Math.abs(hour - 23.5), 24 - Math.abs(hour - 23.5));
  const burst = smooth(0.5, 0.85, noise(ms / 1.4e6, seed + 3));
  const level = (0.25 + 0.12 * K) * (0.45 + 0.55 * Math.exp(-((fromMid / 3) ** 2))) * (0.6 + 1.1 * burst) * dark;
  // the arcs: their geomagnetic latitudes, as distances (km) poleward of us (negative: equatorward)
  const base = 67.5 - 2 * K, arcs = [];
  // the oval is broad, and broader when active: four arcs from its equatorward edge poleward
  for (let k = 0; k < 4; k++) arcs.push({ d: (base + [0, 2.2, 4.5, 7][k] * (0.8 + K / 12) - m) * 111, w: [1, 0.8, 0.6, 0.45][k], ph: k * 2.1 + seed % 7 });
  // can anything be seen? the top of the nearest arc must clear the horizon
  const near = Math.min(...arcs.map((a) => Math.abs(a.d)));
  if (near > 2300 || level < 0.02) return null;
  const purple = smooth(5, 8, K), redK = 0.7 + 0.12 * K;          // storms are redder (and their red tops reach farthest)
  return {
    kp: K, level, bearing: g.bearing, mlat: g.mlat, near,
    /** Add the aurora's light seen toward (alt, az) at scene second t into out. */
    sample(alt, az, t, out) {
      if (alt < -0.02) return;
      const ta = Math.tan(Math.max(alt, 0.004)), c = Math.cos(az - g.bearing), sn = Math.sin(az - g.bearing);
      let G = 0, Rd = 0, P = 0;
      // each curtain is a slab ~12 km thick standing from 92 to 330 km: where does this line of sight
      // enter and leave that height band (on a curved Earth), and how much of it lies in the slab?
      const gAt = (z) => R * (-ta + Math.sqrt(ta * ta + 2 * z / R));
      const g0 = gAt(92), g1 = Math.min(gAt(330), 2800);
      if (g0 >= g1) return;
      for (const a of arcs) {
        // across the arc: the perpendicular distance runs g·c along the ray; fold the arc where we meet it
        const gm = Math.abs(c) > 0.02 ? clamp(a.d / c, g0, g1) : (g0 + g1) / 2, s0 = gm * sn;
        const fold = 38 * Math.sin(s0 / 190 + t * 0.045 + a.ph) + 16 * Math.sin(s0 / 61 - t * 0.12 + a.ph * 2) + 6 * Math.sin(s0 / 19 + t * 0.4);
        const dd = a.d + fold, T = 12;
        const p0 = g0 * c, p1 = g1 * c, lo = Math.max(Math.min(p0, p1), dd - T / 2), hi = Math.min(Math.max(p0, p1), dd + T / 2);
        if (hi <= lo) continue;
        const len = Math.abs(c) > 1e-3 ? (hi - lo) / Math.abs(c) : g1 - g0;           // km of the ray inside the slab
        const gd = Math.abs(c) > 1e-3 ? ((lo + hi) / 2) / c : (g0 + g1) / 2;
        if (gd <= 0) continue;
        const z = gd * ta + gd * gd / (2 * R), s = gd * sn;
        // rays: fine vertical striations drifting along the arc, brightening and fading
        const ray = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(s / 4.1 + t * 0.7 + 2.2 * Math.sin(s / 23 - t * 0.09 + a.ph)), 2);
        const pulse = 0.75 + 0.25 * Math.sin(s / 140 - t * 0.35 + a.ph);
        const path = Math.min(3, Math.sqrt(len / T)) * Math.exp(-gd / 2400);
        const k = a.w * ray * pulse * path;
        G += k * (z < 120 ? Math.exp(-(((z - 120) / 11) ** 2)) : Math.exp(-(((z - 120) / 48) ** 2)));
        Rd += k * redK * Math.exp(-(((z - 235) / 60) ** 2));
        P += k * purple * Math.exp(-(((z - 100) / 7) ** 2));
      }
      const L = this.level;
      out[0] += (0.18 * G + 0.85 * Rd + 0.55 * P) * L; out[1] += (1.0 * G + 0.12 * Rd + 0.15 * P) * L; out[2] += (0.42 * G + 0.3 * Rd + 0.85 * P) * L;
    },
  };
}

/** Which way to look, as a compass word, for the page. */
export function compass(bearing) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8];
}

const glow = (v) => 255 * 0.95 * (1 - Math.exp(-v * 1.3));     // soft ceiling: a bright curtain saturates, never clips

/**
 * The aurora over the painting: sampled every 2×2 pixels (its directions cached per view), added to
 * the sky (thinned by cloud), and mirrored on the water. `dir(x, y)` → [alt, az] (scene.js unproject).
 */
export function paintAurora(px, scene, au, t, { cover = 0, overcast = 0, dir, cache }) {
  const { W, H, yH, layer, LAYER } = scene, BW = W >> 1, BH = (yH >> 1) + 1;
  if (!cache.dirs || cache.key !== cache.want) { cache.dirs = new Float32Array(BW * BH * 2); for (let by = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++) { const [a, z] = dir(bx * 2 + 1, by * 2 + 1); cache.dirs[(by * BW + bx) * 2] = a; cache.dirs[(by * BW + bx) * 2 + 1] = z; } cache.key = cache.want; }
  const A = cache.buf && cache.buf.length === BW * BH * 3 ? cache.buf : (cache.buf = new Float32Array(BW * BH * 3));
  A.fill(0);
  const veil = 1 - 0.95 * overcast, o = [0, 0, 0];
  for (let by = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++) {
    const i = (by * BW + bx) * 2;
    o[0] = o[1] = o[2] = 0; au.sample(cache.dirs[i], cache.dirs[i + 1], t, o);
    const k = (by * BW + bx) * 3; A[k] = o[0] * veil; A[k + 1] = o[1] * veil; A[k + 2] = o[2] * veil;
  }
  let peak = 0;
  const add = (p, k, f) => { px[p] = Math.min(255, px[p] + glow(A[k] * f)); px[p + 1] = Math.min(255, px[p + 1] + glow(A[k + 1] * f)); px[p + 2] = Math.min(255, px[p + 2] + glow(A[k + 2] * f)); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = layer[y * W + x];
    let sy = y, f = 1;
    if (l === LAYER.sky) f = 1;
    else if (l === LAYER.cloud) f = 1 - 0.9 * Math.max(cover, 0.5);
    else if (l === LAYER.lake && y > yH) { sy = Math.floor(yH - (y - yH) * 1.05 - 1); f = 0.32; if (sy < 0 || (layer[sy * W + x] !== LAYER.sky && layer[sy * W + x] !== LAYER.cloud)) continue; }
    else continue;
    if (sy >= yH) continue;
    const k = ((sy >> 1) * BW + Math.min(BW - 1, x >> 1)) * 3;
    if (f === 1 && A[k + 1] + A[k] > peak) peak = A[k + 1] + A[k];
    add((y * W + x) * 4, k, f);
  }
  return peak;                                  // the brightest the aurora shows (on open sky), for the page
}
