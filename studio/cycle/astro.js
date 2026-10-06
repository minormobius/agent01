// astro.js — where the sun, the moon and the stars are, for a moment and a place. Pure.
//
// Low-precision formulas (the Astronomical Almanac's, as in Meeus and NOAA's calculators): the sun
// to about 0.01°, the moon to about 1° (no parallax), stars from their J2000 positions (precession
// over 26 years is a third of a degree; ignored). Plenty for a sky drawn at 640 × 360.
//
// Angles in degrees at the edges, radians inside. Azimuth from north through east.

const D = Math.PI / 180;
const sin = (d) => Math.sin(d * D), cos = (d) => Math.cos(d * D);
const norm = (d) => ((d % 360) + 360) % 360;

/** Days since J2000.0 (2000-01-01 12:00 TT ≈ UTC here) for a time in ms since the epoch. */
export const daysJ2000 = (ms) => ms / 86400000 + 2440587.5 - 2451545.0;
/** Local sidereal time, degrees, at longitude `lon` (east positive). */
export const lst = (d, lon) => norm(280.46061837 + 360.98564736629 * d + lon);
const obliquity = (d) => 23.439 - 0.00000036 * d;

/** Ecliptic (λ, β) → equatorial (ra, dec), degrees. */
function eclToEq(lam, beta, eps) {
  const ra = Math.atan2(sin(lam) * cos(eps) - Math.tan(beta * D) * sin(eps), cos(lam)) / D;
  const dec = Math.asin(sin(beta) * cos(eps) + cos(beta) * sin(eps) * sin(lam)) / D;
  return { ra: norm(ra), dec };
}
/** The sun's apparent position: ecliptic longitude and equatorial coordinates. */
export function sunEq(d) {
  const g = norm(357.529 + 0.98560028 * d), q = norm(280.459 + 0.98564736 * d);
  const lam = norm(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
  return { lam, ...eclToEq(lam, 0, obliquity(d)) };
}
/** The moon's position (geocentric, ~1°) and its ecliptic longitude. */
export function moonEq(d) {
  const L = norm(218.316 + 13.176396 * d), M = norm(134.963 + 13.064993 * d), F = norm(93.272 + 13.229350 * d);
  const Ms = norm(357.529 + 0.98560028 * d), Dm = norm(297.850 + 12.190749 * d);
  // the largest terms: equation of centre, evection, variation, annual equation
  const lam = norm(L + 6.289 * sin(M) + 1.274 * sin(2 * Dm - M) + 0.658 * sin(2 * Dm) - 0.186 * sin(Ms) + 0.214 * sin(2 * M));
  const beta = 5.128 * sin(F) + 0.281 * sin(M + F) + 0.278 * sin(M - F);
  return { lam, beta, ...eclToEq(lam, beta, obliquity(d)) };
}
/** Equatorial → horizontal at latitude `lat` and local sidereal time `st`: { alt, az } degrees. */
export function horizontal(ra, dec, lat, st) {
  const H = st - ra;
  const alt = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H)) / D;
  const az = Math.atan2(-sin(H) * cos(dec), cos(lat) * sin(dec) - sin(lat) * cos(dec) * cos(H)) / D;
  return { alt, az: norm(az) };
}
/** Unit vector (east, north, up) for an altitude and azimuth. */
export const enu = (alt, az) => [cos(alt) * sin(az), cos(alt) * cos(az), sin(alt)];

/**
 * The sky at a moment (ms since epoch) and place: the sun's and moon's alt/az, the moon's
 * illuminated fraction and whether it is waxing, and a function placing any RA/Dec.
 */
export function sky(ms, lat, lon) {
  const d = daysJ2000(ms), st = lst(d, lon);
  const s = sunEq(d), m = moonEq(d);
  const sun = horizontal(s.ra, s.dec, lat, st), moon = horizontal(m.ra, m.dec, lat, st);
  // phase: the angle sun–earth–moon, from the two directions on the celestial sphere
  const vs = [cos(s.dec) * cos(s.ra), cos(s.dec) * sin(s.ra), sin(s.dec)];
  const vm = [cos(m.dec) * cos(m.ra), cos(m.dec) * sin(m.ra), sin(m.dec)];
  const elong = Math.acos(Math.max(-1, Math.min(1, vs[0] * vm[0] + vs[1] * vm[1] + vs[2] * vm[2]))) / D;
  const lit = (1 - cos(elong)) / 2;
  return {
    ms, d, st, lat, lon, sun, moon, moonLit: lit, waxing: norm(m.lam - s.lam) < 180,
    place: (ra, dec) => horizontal(ra, dec, lat, st),
  };
}

/** Local mean solar time (hours) at longitude `lon` for ms: what a sundial there reads, near enough. */
export const solarHour = (ms, lon) => (((ms / 3600000 + lon / 15) % 24) + 24) % 24;
/** The ms at which local mean solar time at `lon` is `hour` on the UTC day containing `ms`. */
export function atSolarHour(ms, lon, hour) {
  const day = Math.floor((ms / 3600000 + lon / 15) / 24);
  return (day * 24 + hour - lon / 15) * 3600000;
}

/** A star's colour from B−V (a blackbody fit: blue-white hot to orange-red cool), 0..1 RGB. */
export function starColour(bv) {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));       // Ballesteros' formula, K
  const x = Math.min(40000, Math.max(1000, t)) / 100;
  const r = x <= 66 ? 1 : Math.min(1, 1.293 * Math.pow(x - 60, -0.1332));
  const g = x <= 66 ? Math.min(1, Math.max(0, 0.390 * Math.log(x) - 0.632)) : Math.min(1, 1.130 * Math.pow(x - 60, -0.0755));
  const b = x >= 66 ? 1 : x <= 19 ? 0 : Math.min(1, Math.max(0, 0.543 * Math.log(x - 10) - 1.196));
  return [r, g, b];
}
