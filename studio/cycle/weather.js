// weather.js — the forecast for a place and a moment, and what it does to the light. Pure.
//
// Each local day draws a kind of weather, weighted by the season (a temperature from the date, the
// latitude and the hour decides whether what falls is rain or snow): clear, fair, overcast, rain,
// storm, fog, snow. Through the day the intensity wanders (rain comes and goes, a storm builds in the
// afternoon), fog lies in the valley at dawn and burns off by late morning, and one day eases into
// the next across the night. The same seed, place and moment give the same weather to everyone.
//
// Lightning is a schedule too: in scene seconds (the page's clock, not the simulated day, which can
// run hundreds of times faster), gated by how stormy the moment is. So the flash in the picture, the
// thunder in the beds and the piano's low cluster in the music all agree on when it struck.

export const KINDS = ['clear', 'fair', 'overcast', 'rain', 'storm', 'fog', 'snow'];

const hash = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const noise = (x, s) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i, s, 11), hash(i + 1, s, 11), u); };

/** A rough air temperature (°C) for the place, the date and the hour: season, latitude, day and night. */
export function temperature(ms, lat, lon) {
  const days = ms / 86400000, doy = ((days % 365.25) + 365.25) % 365.25;
  const hour = (((ms / 3600000 + lon / 15) % 24) + 24) % 24;
  const north = lat >= 0 ? 1 : -1;
  const season = -Math.cos(2 * Math.PI * (doy - 15) / 365.25) * north;          // −1 midwinter … 1 midsummer
  const mean = 27 - 0.42 * Math.abs(lat), swing = 2 + 0.22 * Math.abs(lat);
  return mean + swing * season + 4.5 * Math.sin(2 * Math.PI * (hour - 9) / 24);
}

/** What one day is: its kind and its levels (before the hour shapes them). */
function day(seed, d, lat, ms) {
  const t = temperature(ms, lat, 0);
  const r = hash(d, seed, 1), warm = smooth(8, 20, t);
  const w = [
    ['clear', 0.24], ['fair', 0.26], ['overcast', 0.14], ['rain', 0.15],
    ['storm', 0.07 * warm], ['fog', 0.08], ['snow', 0.12 * smooth(4, -2, t)],
  ];
  let s = 0; for (const [, x] of w) s += x;
  let x = r * s, kind = 'clear';
  for (const [k, p] of w) { x -= p; if (x <= 0) { kind = k; break; } }
  const level = 0.55 + 0.45 * hash(d, seed, 2);
  return { kind, level };
}

const BASE = {           // cover (the painted clouds), overcast (how much it dims the sun), and what falls
  clear: { cover: 0.06, overcast: 0, rain: 0, snow: 0, fog: 0.15, storm: 0 },
  fair: { cover: 0.45, overcast: 0.12, rain: 0, snow: 0, fog: 0.2, storm: 0 },
  overcast: { cover: 0.95, overcast: 0.72, rain: 0, snow: 0, fog: 0.3, storm: 0 },
  rain: { cover: 1, overcast: 0.82, rain: 1, snow: 0, fog: 0.35, storm: 0 },
  storm: { cover: 1, overcast: 0.9, rain: 1, snow: 0, fog: 0.2, storm: 1 },
  fog: { cover: 0.7, overcast: 0.55, rain: 0, snow: 0, fog: 1, storm: 0 },
  snow: { cover: 1, overcast: 0.78, rain: 0, snow: 1, fog: 0.3, storm: 0 },
};

/** The levels of a day at an hour: what falls comes and goes; fog lies at dawn; storms build. */
function shaped(seed, d, k, level, hour, ms) {
  const b = BASE[k], hrs = d * 24 + hour;
  const come = smooth(0.25, 0.65, noise(hrs / 3.5, seed + d)) * 0.75 + 0.25;   // showers come and go
  const build = k === 'storm' ? 0.35 + 0.65 * smooth(9, 16, hour) * smooth(23, 18, hour) : 1;
  const dawn = smooth(4, 6.5, hour) * smooth(11.5, 8, hour) + smooth(21, 24, hour) * 0.4 + smooth(3, 0, hour) * 0.4;
  return {
    cover: b.cover, overcast: b.overcast * (k === 'rain' || k === 'storm' ? 0.75 + 0.25 * come : 1),
    rain: b.rain * level * come * build, snow: b.snow * level * (0.5 + 0.5 * come),
    storm: b.storm * level * build * come, fog: clamp(b.fog * (k === 'fog' ? 0.35 + 0.65 * dawn : dawn) * level),
    wind: (hash(d, seed, 5) - 0.5) * 2 * (k === 'storm' ? 1 : 0.5),
  };
}

/**
 * The weather at a moment and place: { kind, cover, overcast, rain, snow, fog, storm, wind, temp }.
 * `force` (a kind) overrides the day's draw (the page's chooser), keeping the hour's shaping.
 */
export function forecast(seed, ms, lat, lon, force = null) {
  const local = ms / 3600000 + lon / 15, d = Math.floor(local / 24), hour = local - d * 24;
  const at = (dd, h) => {
    const dy = force ? { kind: force, level: 0.85 } : day(seed, dd, lat, (dd * 24 + 12 - lon / 15) * 3600000);
    return { kind: dy.kind, ...shaped(seed, dd, dy.kind, dy.level, h, ms) };
  };
  const a = at(d, hour);
  // ease into tomorrow across the last hours of the night
  const f = force ? 0 : smooth(22, 24, hour) * 0.5;
  const b = f > 0 ? at(d + 1, hour - 24) : a;
  const mix = (k) => lerp(a[k], b[k], f);
  // snow lying on the ground: what fell today and the two days before, while it stays cold enough
  const temp = temperature(ms, lat, lon);
  let fallen = 0;
  for (let k = 0; k < 3; k++) {
    const dy = force ? { kind: force, level: 0.85 } : day(seed, d - k, lat, ((d - k) * 24 + 12 - lon / 15) * 3600000);
    if (dy.kind === 'snow') fallen = Math.max(fallen, dy.level * [smooth(5, 11, hour) * 0.5 + 0.5, 0.8, 0.5][k]);
  }
  const lying = fallen * smooth(6, 0, temp);
  return {
    lying,
    kind: f > 0.25 ? b.kind : a.kind, cover: mix('cover'), overcast: mix('overcast'), rain: mix('rain'),
    snow: mix('snow'), fog: mix('fog'), storm: mix('storm'), wind: mix('wind'), temp,
  };
}

// ------------------------------------------------------------------------------- lightning --
const SLOT = 1.7;            // scene seconds per chance of a strike

/** Does a strike begin in slot `k`, at this storminess? Returns its time within the slot, or −1. */
function strikeIn(seed, k, storm) {
  if (storm < 0.05 || hash(k, seed, 21) > 0.07 * storm) return -1;
  return hash(k, seed, 22) * SLOT;
}

/**
 * The lightning at scene second `t` given the storminess there: { flash 0..1, strike: { t0, seed,
 * x (0..1 across the view), dist (0..1, near … far) } | null }. A strike is a bright flash, a second
 * flicker, and a fading afterglow; its bolt is drawn while it lasts.
 */
export function lightning(seed, t, storm) {
  const k0 = Math.floor(t / SLOT);
  for (let k = k0; k >= k0 - 1; k--) {
    const off = strikeIn(seed, k, storm);
    if (off < 0) continue;
    const t0 = k * SLOT + off, age = t - t0;
    if (age < 0 || age > 1.2) continue;
    const flash = Math.exp(-age * 9) + (age > 0.16 && age < 0.26 ? 0.6 : 0) + 0.25 * Math.exp(-age * 2.5);
    return { flash: Math.min(1.3, flash), strike: { t0, seed: k, x: hash(k, seed, 23), dist: hash(k, seed, 24) } };
  }
  return { flash: 0, strike: null };
}

/** Every strike that begins in scene seconds [t0, t1), with its distance: for thunder, and the music. */
export function strikesIn(seed, t0, t1, stormAt) {
  const out = [];
  for (let k = Math.floor(t0 / SLOT); k * SLOT < t1; k++) {
    const t = k * SLOT, off = strikeIn(seed, k, stormAt(t));
    if (off >= 0 && t + off >= t0 && t + off < t1) out.push({ t: t + off, dist: hash(k, seed, 24) });
  }
  return out;
}
/** Seconds from a flash to its thunder (sound at 340 m/s, the strike 0.4–6 km away). */
export const thunderDelay = (dist) => 1.2 + dist * 16;

// ------------------------------------------------------------------------------- the light --
const lum = (c) => 0.3 * c[0] + 0.55 * c[1] + 0.15 * c[2];
const toward = (c, d, k) => [c[0] + (d[0] - c[0]) * k, c[1] + (d[1] - c[1]) * k, c[2] + (d[2] - c[2]) * k];

/**
 * Lay the weather on a light (scene.js light() or fly.js's): overcast mutes the sun and greys and
 * flattens the sky, rain darkens it, fog pales the horizon, and a lightning flash whitens everything
 * for an instant. Returns a new light with `wx` and `flash` on it.
 */
export function weatherLight(lt, wx, flash = 0) {
  const o = wx.overcast, day = 1 - lt.night;
  const grey = (c, k) => toward(c, [lum(c), lum(c), lum(c) * 1.04], k);
  const dark = 1 - 0.28 * wx.rain - 0.15 * wx.storm;
  let zen = grey(lt.zen, 0.85 * o).map((v) => v * (1 - 0.35 * o) * dark);
  let hor = grey(lt.hor, 0.75 * o).map((v) => v * (1 - 0.2 * o) * dark);
  hor = toward(hor, [0.62 * day + 0.12, 0.64 * day + 0.13, 0.66 * day + 0.16], 0.5 * wx.fog);
  // under cloud the light comes from everywhere: the sun's share moves into the ambient
  let amb = grey(lt.amb, 0.5 * o).map((v, i) => (v + [0.07, 0.07, 0.08][i] * o * day) * dark);
  const sunCol = lt.sunCol.map((v) => v * (1 - 0.88 * o)), moonCol = lt.moonCol.map((v) => v * (1 - 0.92 * o));
  if (flash > 0) {
    const f = [0.75, 0.8, 1].map((v) => v * flash);
    zen = zen.map((v, i) => v + f[i] * 0.9); hor = hor.map((v, i) => v + f[i] * 0.7); amb = amb.map((v, i) => v + f[i] * 0.55);
  }
  // the sun's and moon's own presence (their discs, the glitter under them) goes behind the cloud too
  const sunI = (lt.sunI ?? 0) * (1 - 0.95 * o), moonI = (lt.moonI ?? 0) * (1 - 0.95 * o);
  return { ...lt, zen, hor, amb, sunCol, moonCol, sunI, moonI, veiled: o, cover: Math.max(lt.cover ?? 0, wx.cover), wx, flash };
}
