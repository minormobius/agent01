// proj.mjs — inverse map projections, so every source lands in one coordinate
// system (WGS84 lon/lat) before the topology is built.
//
// WHY: the four primary boundary sources do not agree on a CRS. The Census
// cartographic files are already geographic (NAD83 lon/lat); Statistics
// Canada ships Statistics Canada Lambert (EPSG:3347, metres); INEGI ships
// either geographic or its own Lambert. Building a topology across mixed
// coordinate systems would silently produce a map where Canada is a stripe.
//
// Formulae: Snyder, *Map Projections — A Working Manual* (USGS PP 1395),
// ellipsoidal forms. NAD83 and WGS84 are treated as equivalent: they differ by
// ~1-2 m, which is two orders of magnitude below the simplification we apply.

const D2R = Math.PI / 180, R2D = 180 / Math.PI;

/** Parse the handful of WKT parameters we care about out of a .prj string. */
export function readPrj(wkt) {
  if (!wkt || !/PROJCS/i.test(wkt)) return { kind: 'geographic' };
  const num = (name) => {
    const m = wkt.match(new RegExp(`PARAMETER\\s*\\[\\s*"${name}"\\s*,\\s*(-?[\\d.eE+]+)`, 'i'));
    return m ? Number(m[1]) : undefined;
  };
  const sph = wkt.match(/SPHEROID\s*\[\s*"[^"]*"\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  const p = {
    a: sph ? Number(sph[1]) : 6378137,
    invFlattening: sph ? Number(sph[2]) : 298.257222101,
    lat1: num('standard_parallel_1'),
    lat2: num('standard_parallel_2'),
    lat0: num('latitude_of_origin') ?? num('latitude_of_center'),
    lon0: num('central_meridian') ?? num('longitude_of_center'),
    x0: num('false_easting') ?? 0,
    y0: num('false_northing') ?? 0,
  };
  if (/Lambert_Conformal_Conic/i.test(wkt)) return { kind: 'lcc', ...p };
  if (/Albers/i.test(wkt)) return { kind: 'aea', ...p };
  return { kind: 'unsupported', wkt: wkt.slice(0, 120) };
}

const ecc = (p) => {
  const f = 1 / p.invFlattening;
  return Math.sqrt(2 * f - f * f);
};

/** Inverse Lambert Conformal Conic (2 standard parallels), ellipsoidal. */
export function inverseLCC(p) {
  const a = p.a, e = ecc(p);
  const m = (phi) => Math.cos(phi) / Math.sqrt(1 - e * e * Math.sin(phi) ** 2);
  const t = (phi) => Math.tan(Math.PI / 4 - phi / 2)
    / Math.pow((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi)), e / 2);

  const p1 = p.lat1 * D2R, p2 = (p.lat2 ?? p.lat1) * D2R, p0 = p.lat0 * D2R, l0 = p.lon0 * D2R;
  const n = Math.abs(p1 - p2) < 1e-12
    ? Math.sin(p1)
    : (Math.log(m(p1)) - Math.log(m(p2))) / (Math.log(t(p1)) - Math.log(t(p2)));
  const F = m(p1) / (n * Math.pow(t(p1), n));
  const rho0 = a * F * Math.pow(t(p0), n);

  return (x, y) => {
    const xx = x - p.x0, yy = y - p.y0;
    const s = n < 0 ? -1 : 1;
    const rho = s * Math.hypot(xx, rho0 - yy);
    const theta = Math.atan2(s * xx, s * (rho0 - yy));
    const tt = Math.pow(rho / (a * F), 1 / n);
    let phi = Math.PI / 2 - 2 * Math.atan(tt);
    for (let i = 0; i < 12; i++) {                     // Snyder 3-5, converges fast
      const next = Math.PI / 2 - 2 * Math.atan(tt * Math.pow((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi)), e / 2));
      if (Math.abs(next - phi) < 1e-12) { phi = next; break; }
      phi = next;
    }
    return [(theta / n + l0) * R2D, phi * R2D];
  };
}

/** Inverse Albers Equal-Area Conic, ellipsoidal. */
export function inverseAEA(p) {
  const a = p.a, e = ecc(p), e2 = e * e;
  const q = (phi) => {
    const s = Math.sin(phi);
    return (1 - e2) * (s / (1 - e2 * s * s) - (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s)));
  };
  const m = (phi) => Math.cos(phi) / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const p1 = p.lat1 * D2R, p2 = (p.lat2 ?? p.lat1) * D2R, p0 = p.lat0 * D2R, l0 = p.lon0 * D2R;
  const m1 = m(p1), m2 = m(p2), q1 = q(p1), q2 = q(p2), q0 = q(p0);
  const n = Math.abs(p1 - p2) < 1e-12 ? Math.sin(p1) : (m1 * m1 - m2 * m2) / (q2 - q1);
  const C = m1 * m1 + n * q1;
  const rho0 = a * Math.sqrt(C - n * q0) / n;
  const qp = q(Math.PI / 2);

  return (x, y) => {
    const xx = x - p.x0, yy = y - p.y0;
    const rho = Math.hypot(xx, rho0 - yy);
    const theta = Math.atan2(xx, rho0 - yy);
    const qv = (C - (rho * rho * n * n) / (a * a)) / n;
    let phi = Math.asin(Math.max(-1, Math.min(1, qv / 2)));
    for (let i = 0; i < 20; i++) {                     // Snyder 3-16
      const s = Math.sin(phi), c = Math.cos(phi), t = 1 - e2 * s * s;
      const d = (t * t) / (2 * c) * (qv / (1 - e2) - s / t + (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s)));
      phi += d;
      if (Math.abs(d) < 1e-12) break;
    }
    if (Math.abs(Math.abs(qv) - Math.abs(qp)) < 1e-9) phi = qv > 0 ? Math.PI / 2 : -Math.PI / 2;
    return [(theta / n + l0) * R2D, phi * R2D];
  };
}

/** Pick the right inverse for a .prj, or the identity if already geographic. */
export function inverseFor(wkt) {
  const p = readPrj(wkt);
  if (p.kind === 'geographic') return null;
  if (p.kind === 'lcc') return inverseLCC(p);
  if (p.kind === 'aea') return inverseAEA(p);
  throw new Error(`proj: unsupported projection — ${p.wkt}`);
}

/** Apply an inverse to every coordinate of a GeoJSON feature collection. */
export function reproject(fc, inverse) {
  if (!inverse) return fc;
  const walk = (c) => (typeof c[0] === 'number' ? inverse(c[0], c[1]) : c.map(walk));
  for (const f of fc.features) if (f.geometry) f.geometry.coordinates = walk(f.geometry.coordinates);
  return fc;
}
