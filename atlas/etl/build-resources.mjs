#!/usr/bin/env node
// build-resources.mjs — the two physical endowments the superstate tool balances.
//
//   node atlas/etl/build-resources.mjs
//
// Emits atlas/data/resources.json: for every U.S. county,
//   water_mgd   freshwater withdrawn, million gallons/day (USGS 2015)
//   water_sw    of which fresh SURFACE water
//   water_gw    of which fresh GROUND water
//   coast_km    length of the county's boundary that fronts the open ocean
//
// WHAT water_mgd IS AND IS NOT. It is WITHDRAWAL — water actually taken — and
// not renewable supply. There is no county-level supply series for the whole
// country; this is the one national county-level water dataset that exists, it
// is five-yearly, and it is what every water-policy map is built on. The
// limitation that matters: a county that IMPORTS water reads high. Imperial
// County, California withdraws Colorado River water delivered from out of
// basin, so on this measure it looks water-rich, which as a statement about
// local rainfall is nonsense. Read it as "where water is being used", treat it
// as a proxy for "where water is", and know where that proxy breaks.
//
// WHAT coast_km IS. Not "has a coastline" from a published list, and not the
// Census water-area field: AWATER includes territorial sea for coastal
// counties AND every inland lake, so Minnesota outscores Delaware on it. This
// walks the actual boundary. A county's OUTER arcs — the ones no neighbour
// shares — are its frontier; each is sampled, each sample is stepped 4 km to
// either side, and the step is tested against Natural Earth's ocean polygon.
// Great Lakes shore does NOT count, because the Great Lakes are not in that
// polygon; the Gulf, both oceans and the Arctic do. That also correctly
// excludes the Canadian and Mexican land borders, which no amount of stepping
// puts in the sea.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { get } from './lib/fetch-cache.mjs';
import { extract } from './lib/zip.mjs';
import { readShapefile } from './lib/shapefile.mjs';

const require = createRequire(import.meta.url);
require('../../packages/geoviz/codec.js');
const CODEC = globalThis.ATLAS_CODEC;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEO = join(ROOT, 'geo');
const DATA = join(ROOT, 'data');

export const RESOURCE_SOURCES = [
  {
    id: 'usgs-wateruse-2015',
    publisher: 'U.S. Geological Survey',
    title: 'Estimated Use of Water in the United States County-Level Data for 2015 (v2.0)',
    landing: 'https://www.sciencebase.gov/catalog/item/5af3311be4b0da30c1b245d8',
    url: 'https://www.sciencebase.gov/catalog/file/get/5af3311be4b0da30c1b245d8?f=__disk__eb%2F74%2Feb%2Feb74ebb41169c76aaf374990bd5a71cac82604c1',
    licence: 'U.S. Government work — public domain (17 U.S.C. §105).',
    cadence: 'every five years; 2015 is the most recent county-level release',
    geography: 'U.S. counties and county equivalents',
    cite: 'Dieter, C.A., Linsey, K.S., Caldwell, R.R., Harris, M.A., Ivahnenko, T.I., Lovelace, J.K., Maupin, M.A., and Barber, N.L., 2018, Estimated use of water in the United States county-level data for 2015 (ver. 2.0): U.S. Geological Survey data release, https://doi.org/10.5066/F7TB15V5.',
    kind: 'data',
    caveat: 'Withdrawals, not supply. A county served by an inter-basin transfer reads high.',
  },
  {
    id: 'ne-ocean',
    publisher: 'Natural Earth',
    title: 'Ocean, 1:10m physical',
    landing: 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/',
    url: 'https://naciscdn.org/naturalearth/10m/physical/ne_10m_ocean.zip',
    licence: 'Public domain.',
    cadence: 'irregular',
    geography: 'global',
    cite: 'Natural Earth, "Ocean" (1:10m physical vectors).',
    kind: 'boundary',
  },
];

// ------------------------------------------------------------- geometry ---

const R_EARTH = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;

function haversineKm(a, b) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Point-in-polygon over a very large multipolygon, indexed by latitude band.
 *
 * The ocean is ~150,000 segments. A ray cast east from the test point only ever
 * meets segments whose latitude range spans that point, so segments go into
 * latitude buckets once and each query touches a few hundred instead of all of
 * them. Without this the 60,000 queries below would be hours instead of seconds.
 */
class BandIndex {
  constructor(rings, bands = 2048) {
    this.bands = bands;
    this.lat0 = -90; this.lat1 = 90;
    this.h = (this.lat1 - this.lat0) / bands;
    this.cells = Array.from({ length: bands }, () => []);
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = ring[j][0], ay = ring[j][1], bx = ring[i][0], by = ring[i][1];
        if (ay === by) continue;
        const lo = Math.min(ay, by), hi = Math.max(ay, by);
        let b0 = Math.floor((lo - this.lat0) / this.h);
        let b1 = Math.floor((hi - this.lat0) / this.h);
        b0 = Math.max(0, Math.min(bands - 1, b0));
        b1 = Math.max(0, Math.min(bands - 1, b1));
        for (let b = b0; b <= b1; b++) this.cells[b].push(ax, ay, bx, by);
      }
    }
  }

  contains(x, y) {
    let b = Math.floor((y - this.lat0) / this.h);
    if (b < 0 || b >= this.bands) return false;
    const seg = this.cells[b];
    let inside = false;
    for (let i = 0; i < seg.length; i += 4) {
      const ax = seg[i], ay = seg[i + 1], bx = seg[i + 2], by = seg[i + 3];
      if ((ay > y) !== (by > y)) {
        const t = (y - ay) / (by - ay);
        if (x < ax + t * (bx - ax)) inside = !inside;
      }
    }
    return inside;
  }
}

/** Step `km` perpendicular to the segment a→b, both ways, in lon/lat. */
function perpendicularOffsets(a, b, km) {
  const latMid = (a[1] + b[1]) / 2;
  const mPerLon = 111320 * Math.cos(rad(latMid)) || 1;
  const mPerLat = 110540;
  const dx = (b[0] - a[0]) * mPerLon, dy = (b[1] - a[1]) * mPerLat;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;             // unit normal, metres
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const d = km * 1000;
  return [
    [mx + (nx * d) / mPerLon, my + (ny * d) / mPerLat],
    [mx - (nx * d) / mPerLon, my - (ny * d) / mPerLat],
  ];
}

// ------------------------------------------------------------------ main ---

async function main() {
  // ---- 1. USGS water use ------------------------------------------------
  const src = RESOURCE_SOURCES[0];
  const csv = (await get(src.url, { label: 'USGS — county water use 2015' })).toString('utf8');
  const lines = csv.split(/\r?\n/);
  // Row 1 is a citation that contains commas; the header is row 2.
  const head = lines[1].split(',');
  const col = (name) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`USGS column ${name} not found`);
    return i;
  };
  const cFips = col('FIPS'), cPop = col('TP-TotPop');
  const cFrTo = col('TO-WFrTo'), cSw = col('TO-WSWFr'), cGw = col('TO-WGWFr');
  const numOf = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const water = new Map();
  for (let i = 2; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = lines[i].split(',');
    const fips = (f[cFips] || '').replace(/"/g, '').trim();
    if (!/^\d{5}$/.test(fips)) continue;
    water.set(`US:${fips}`, {
      water_mgd: numOf(f[cFrTo]),
      water_sw: numOf(f[cSw]),
      water_gw: numOf(f[cGw]),
      usgs_pop_k: numOf(f[cPop]),
    });
  }
  process.stderr.write(`  USGS water use: ${water.size} counties\n`);

  // ---- 2. the ocean -----------------------------------------------------
  const oceanZip = await get(RESOURCE_SOURCES[1].url, { label: 'Natural Earth — ocean 10m' });
  const files = extract(oceanZip, /\.(shp|dbf|prj)$/i);
  const fc = readShapefile(files, /ocean/i);
  const rings = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const r of poly) if (r.length > 3) rings.push(r);
  }
  process.stderr.write(`  Natural Earth ocean: ${rings.length} rings, ` +
    `${rings.reduce((t, r) => t + r.length, 0).toLocaleString()} points\n`);
  const ocean = new BandIndex(rings);

  // ---- 3. walk every county's outer boundary ----------------------------
  const topo = CODEC.unpack(JSON.parse(readFileSync(join(GEO, 'us-counties.json'), 'utf8')));
  const [sx, sy] = topo.transform.scale, [dx, dy] = topo.transform.translate;
  const arcLL = topo.arcs.map((a) => {
    const out = new Array(a.length / 2);
    for (let j = 0; j < a.length; j += 2) out[j / 2] = [dx + a[j] * sx, dy + a[j + 1] * sy];
    return out;
  });

  // an arc no neighbour shares is on the national frontier
  const owners = new Map();
  for (let u = 0; u < topo.ids.length; u++) {
    for (let r = topo.polyStart[u]; r < topo.polyStart[u + 1]; r++) {
      for (let k = topo.ringStart[r]; k < topo.ringStart[r + 1]; k++) {
        const a = topo.refs[k] < 0 ? ~topo.refs[k] : topo.refs[k];
        let s = owners.get(a);
        if (!s) owners.set(a, s = new Set());
        s.add(u);
      }
    }
  }

  const coast = new Float64Array(topo.ids.length);
  const STEP_KM = 4;
  let outerArcs = 0, oceanArcs = 0;
  for (const [a, us] of owners) {
    if (us.size !== 1) continue;                    // interior border
    outerArcs++;
    const u = [...us][0];
    const pts = arcLL[a];
    let hit = 0;
    for (let i = 1; i < pts.length; i++) {
      const segKm = haversineKm(pts[i - 1], pts[i]);
      if (segKm <= 0) continue;
      const [p, q] = perpendicularOffsets(pts[i - 1], pts[i], STEP_KM);
      if (ocean.contains(p[0], p[1]) || ocean.contains(q[0], q[1])) { coast[u] += segKm; hit++; }
    }
    if (hit) oceanArcs++;
  }
  process.stderr.write(`  frontier arcs: ${outerArcs}, of which touching ocean: ${oceanArcs}\n`);

  // ---- 4. emit ----------------------------------------------------------
  const out = {};
  for (let u = 0; u < topo.ids.length; u++) {
    const id = topo.ids[u];
    const w = water.get(id) || {};
    const e = {};
    if (w.water_mgd != null) e.water_mgd = Math.round(w.water_mgd * 100) / 100;
    if (w.water_sw != null) e.water_sw = Math.round(w.water_sw * 100) / 100;
    if (w.water_gw != null) e.water_gw = Math.round(w.water_gw * 100) / 100;
    if (coast[u] > 0.5) e.coast_km = Math.round(coast[u]);
    if (Object.keys(e).length) out[id] = e;
  }

  const doc = {
    format: 'atlas-resources-1',
    built: new Date().toISOString().slice(0, 10),
    note: 'water_mgd is WITHDRAWAL (USGS 2015), not renewable supply. coast_km is ocean frontage only — the Great Lakes are excluded.',
    sources: RESOURCE_SOURCES.map((s) => s.id),
    units: { water_mgd: 'million gallons per day', water_sw: 'Mgal/d', water_gw: 'Mgal/d', coast_km: 'km' },
    values: out,
  };
  writeFileSync(join(DATA, 'resources.json'), JSON.stringify(doc));

  const nCoast = Object.values(out).filter((e) => e.coast_km).length;
  const totW = Object.values(out).reduce((t, e) => t + (e.water_mgd || 0), 0);
  const totC = Object.values(out).reduce((t, e) => t + (e.coast_km || 0), 0);
  process.stderr.write(`  -> resources.json  ${Object.keys(out).length} counties, ` +
    `${nCoast} with ocean frontage (${Math.round(totC).toLocaleString()} km total), ` +
    `${Math.round(totW).toLocaleString()} Mgal/d fresh withdrawals\n`);
}

// Importable for its RESOURCE_SOURCES without running the download: build-data
// pulls the citations in so the /sources page lists them.
if (process.argv[1] && process.argv[1].endsWith('build-resources.mjs')) {
  main().catch((e) => { process.stderr.write(String(e.stack || e) + '\n'); process.exit(1); });
}
