// Truncated Meeus algorithms for Sun and Moon positions.
// Accurate to ~0.01° for the Sun and ~0.1° for the Moon over modern dates —
// more than enough for zodiac sign and moon-phase resolution.

const DEG = Math.PI / 180;

export function toJulianDay(date) {
  // Date is JS Date in UTC. Returns Julian Day (UT).
  const Y = date.getUTCFullYear();
  const M = date.getUTCMonth() + 1;
  const D = date.getUTCDate()
    + date.getUTCHours() / 24
    + date.getUTCMinutes() / 1440
    + date.getUTCSeconds() / 86400;
  let y = Y, m = M;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716))
    + Math.floor(30.6001 * (m + 1))
    + D + B - 1524.5;
}

function norm360(x) {
  return ((x % 360) + 360) % 360;
}

// Sun apparent ecliptic longitude (deg).
export function sunLongitude(jd) {
  const T = (jd - 2451545.0) / 36525;
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * DEG;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const trueLong = L0 + C;
  // Nutation/aberration: small omega correction
  const Omega = (125.04 - 1934.136 * T) * DEG;
  return norm360(trueLong - 0.00569 - 0.00478 * Math.sin(Omega));
}

// Moon ecliptic longitude (deg) — Meeus chapter 47, truncated to leading terms.
export function moonLongitude(jd) {
  const T = (jd - 2451545.0) / 36525;
  const Lp = norm360(218.3164477 + 481267.88123421 * T
    - 0.0015786 * T * T + T * T * T / 538841 - T * T * T * T / 65194000);
  const D = norm360(297.8501921 + 445267.1114034 * T
    - 0.0018819 * T * T + T * T * T / 545868) * DEG;
  const M = norm360(357.5291092 + 35999.0502909 * T
    - 0.0001536 * T * T + T * T * T / 24490000) * DEG;
  const Mp = norm360(134.9633964 + 477198.8675055 * T
    + 0.0087414 * T * T + T * T * T / 69699 - T * T * T * T / 14712000) * DEG;
  const F = norm360(93.2720950 + 483202.0175233 * T
    - 0.0036539 * T * T - T * T * T / 3526000 + T * T * T * T / 863310000) * DEG;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;

  // Leading 24 periodic terms (sufficient for 0.1° accuracy in modern era).
  const terms = [
    [0, 0, 1, 0, 6288774],
    [2, 0, -1, 0, 1274027],
    [2, 0, 0, 0,  658314],
    [0, 0, 2, 0,  213618],
    [0, 1, 0, 0, -185116],
    [0, 0, 0, 2, -114332],
    [2, 0, -2, 0,  58793],
    [2, -1, -1, 0, 57066],
    [2, 0, 1, 0,   53322],
    [2, -1, 0, 0,  45758],
    [0, 1, -1, 0, -40923],
    [1, 0, 0, 0,  -34720],
    [0, 1, 1, 0,  -30383],
    [2, 0, 0, -2,  15327],
    [0, 0, 1, 2,  -12528],
    [0, 0, 1, -2,  10980],
    [4, 0, -1, 0,  10675],
    [0, 0, 3, 0,   10034],
    [4, 0, -2, 0,   8548],
    [2, 1, -1, 0,  -7888],
    [2, 1, 0, 0,   -6766],
    [1, 0, -1, 0,  -5163],
    [1, 1, 0, 0,    4987],
    [2, -1, 1, 0,   4036],
  ];
  let sumL = 0;
  for (const [a, b, c, d, coeff] of terms) {
    const arg = a * D + b * M + c * Mp + d * F;
    let factor = 1;
    if (Math.abs(b) === 1) factor *= E;
    if (Math.abs(b) === 2) factor *= E * E;
    sumL += coeff * factor * Math.sin(arg);
  }
  return norm360(Lp + sumL / 1000000);
}

// Moon phase angle (0=new, 90=first quarter, 180=full, 270=last quarter)
// returned in degrees, normalized to [0, 360).
export function moonPhaseAngle(jd) {
  return norm360(moonLongitude(jd) - sunLongitude(jd));
}

// Illuminated fraction of the moon's disk (0..1).
export function moonIllumination(jd) {
  const angle = moonPhaseAngle(jd) * DEG;
  return (1 - Math.cos(angle)) / 2;
}
