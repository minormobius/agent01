#!/usr/bin/env node
// build-geo.mjs — turn the primary boundary sources into the atlas geometry.
//
//   node atlas/etl/build-geo.mjs             # everything that downloads
//   node atlas/etl/build-geo.mjs us-counties # one layer
//
// Raw archives are cached outside the repo ($ATLAS_CACHE); only the derived,
// simplified, topology-built artefacts are committed. Nothing here needs a key.
//
// What it emits, into atlas/geo/:
//   <layer>.json         packed topology (see packages/geoviz/codec.js)
//   <layer>-lo.json      a coarser tier, for the first paint at continent scale
//   adjacency.json       which counties touch which — from the SHARED ARCS, so
//                        it is exact rather than a distance heuristic. This is
//                        what makes contiguous regionalisation possible.
//   manifest.json        every layer, with the citation for its boundaries
// and into atlas/data/:
//   places.json          id → name, level, parent, area, centroid

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { get, cachePath } from './lib/fetch-cache.mjs';
import { extract } from './lib/zip.mjs';
import { readShapefile } from './lib/shapefile.mjs';
import { inverseFor, reproject } from './lib/proj.mjs';
import { buildTopology, simplifyTopology, requantize, pointCount } from './lib/topology.mjs';
import { GEO_SOURCES, byId, CARIBBEAN_ADM0 } from './sources/geography.mjs';

const require = createRequire(import.meta.url);
require('../../packages/geoviz/codec.js');
const CODEC = globalThis.ATLAS_CODEC;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEO  = join(ROOT, 'geo');
const DATA = join(ROOT, 'data');

// --------------------------------------------------------------- helpers ---

const R_EARTH = 6371.0088;                       // km, IUGG mean radius

/** Spherical polygon area in km², and an area-weighted centroid. */
function measure(geometry) {
  let area = 0, cx = 0, cy = 0, w = 0;
  const rings = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of rings) {
    for (let r = 0; r < poly.length; r++) {
      const ring = poly[r];
      // planar shoelace in degrees, scaled by cos(lat) — good to a fraction of
      // a percent at county size, and we only need it for weights and labels
      let a = 0, px = 0, py = 0;
      const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      const k = Math.cos(lat0 * Math.PI / 180);
      for (let i = 0, n = ring.length - 1; i < n; i++) {
        const cross = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
        a += cross;
        px += (ring[i][0] + ring[i + 1][0]) * cross;
        py += (ring[i][1] + ring[i + 1][1]) * cross;
      }
      a /= 2;
      const km2 = Math.abs(a) * k * (Math.PI * R_EARTH / 180) ** 2;
      if (r === 0) { area += km2; } else { area -= km2; }
      if (r === 0 && a !== 0) { cx += px / (6 * a) * km2; cy += py / (6 * a) * km2; w += km2; }
    }
  }
  return { area_km2: Math.round(area), lon: w ? +(cx / w).toFixed(4) : null, lat: w ? +(cy / w).toFixed(4) : null };
}

async function shapefileOf(sourceId, match, decode) {
  const src = byId[sourceId];
  if (!existsSync(cachePath(src.url))) {
    // let get() try; it throws with the URL if the publisher is down
  }
  const files = extract(await get(src.url, { label: `${src.publisher} — ${src.id}` }), /\.(shp|dbf|prj)$/i);
  const fc = readShapefile(files, match, decode);
  return reproject(fc, inverseFor(fc.prj));
}

// ----------------------------------------------------------- the layers ----
//
// Each layer: how to get its features, how to name them, and how hard to
// simplify. `minArea` is in squared quantization units, so it means the same
// thing at every layer's own scale.

const LAYERS = {
  'us-counties': {
    label: 'United States — counties and county equivalents',
    level: 'county', source: 'us-county',
    tiers: { '': { q: 2e5, minArea: 25 }, '-lo': { q: 4e4, minArea: 500 } },
    adjacency: true,
    async features() {
      const fc = await shapefileOf('us-county', /county/i);
      return fc.features
        .filter((f) => { const s = +f.properties.STATEFP; return (s >= 1 && s <= 56) || s === 72 || s === 78; })
        .map((f) => ({
          ...f,
          atlasId: `US:${f.properties.GEOID}`,
          place: {
            name: f.properties.NAME,
            long: f.properties.NAMELSAD,
            level: 'county',
            parent: `US:${f.properties.STATEFP}`,
            iso: 'US',
            land_km2: Math.round(f.properties.ALAND / 1e6),
            water_km2: Math.round(f.properties.AWATER / 1e6),
          },
        }));
    },
  },

  'us-states': {
    label: 'United States — states, DC and Puerto Rico',
    level: 'state', source: 'us-state',
    tiers: { '': { q: 6e4, minArea: 200 } },
    async features() {
      const fc = await shapefileOf('us-state', /state/i);
      return fc.features
        .filter((f) => { const s = +f.properties.STATEFP; return (s >= 1 && s <= 56) || s === 72 || s === 78; })
        .map((f) => ({
          ...f,
          atlasId: `US:${f.properties.STATEFP}`,
          place: { name: f.properties.NAME, abbr: f.properties.STUSPS, level: 'state', parent: 'US', iso: 'US' },
        }));
    },
  },

  'ca-divisions': {
    label: 'Canada — census divisions',
    level: 'county', source: 'ca-cd',
    tiers: { '': { q: 2e5, minArea: 25 }, '-lo': { q: 4e4, minArea: 500 } },
    adjacency: true,
    async features() {
      const fc = await shapefileOf('ca-cd', /lcd/i);
      return fc.features.map((f) => ({
        ...f,
        atlasId: `CA:${f.properties.CDUID}`,
        place: {
          name: f.properties.CDNAME, level: 'county', parent: `CA:${f.properties.PRUID}`, iso: 'CA',
          land_km2: Math.round(f.properties.LANDAREA), cdtype: f.properties.CDTYPE,
        },
      }));
    },
  },

  'ca-provinces': {
    label: 'Canada — provinces and territories',
    level: 'state', source: 'ca-pr',
    tiers: { '': { q: 6e4, minArea: 200 } },
    async features() {
      const fc = await shapefileOf('ca-pr', /lpr/i);
      return fc.features.map((f) => ({
        ...f,
        atlasId: `CA:${f.properties.PRUID}`,
        place: { name: f.properties.PRENAME, abbr: f.properties.PREABBR, level: 'state', parent: 'CA', iso: 'CA' },
      }));
    },
  },

  'mx-municipios': {
    label: 'Mexico - municipios and alcaldias',
    level: 'county', source: 'mx-mun',
    // CONABIO's outlines are far more detailed than the Census cartographic
    // files, so the same visual fidelity needs a heavier threshold here.
    tiers: { '': { q: 2e5, minArea: 120 }, '-lo': { q: 4e4, minArea: 1200 } },
    adjacency: true,
    optional: true,
    async features() {
      const fc = await shapefileOf('mx-mun', /muni/i);
      const seenEnt = new Set();
      const out = [];
      for (const f of fc.features) {
        const p = f.properties;
        const cve = p.CVEGEO || `${p.CVE_ENT}${p.CVE_MUN}`;
        if (!/^\d{5}$/.test(cve)) continue;
        // The state layer has no geometry of its own here - an entidad is the
        // union of its municipios - but the hierarchy still needs a name for
        // it, so it is emitted as a place with no shape.
        if (!seenEnt.has(p.CVE_ENT)) {
          seenEnt.add(p.CVE_ENT);
          out.push({ geometry: null, atlasId: `MX:${p.CVE_ENT}`,
            place: { name: p.NOM_ENT, level: 'state', parent: 'MX', iso: 'MX' } });
        }
        out.push({
          ...f,
          atlasId: `MX:${cve}`,
          place: { name: p.NOM_MUN, level: 'county', parent: `MX:${p.CVE_ENT}`, iso: 'MX' },
        });
      }
      return out;
    },
  },

  'carib-districts': {
    label: 'Caribbean — parishes, provinces, départements and island territories',
    level: 'county', source: 'ne-admin1',
    tiers: { '': { q: 1e5, minArea: 12 } },
    async features() {
      const fc = await shapefileOf('ne-admin1', /admin_1/i, (b, s, e) => b.toString('utf8', s, e));
      return fc.features
        .filter((f) => CARIBBEAN_ADM0.has(f.properties.adm0_a3))
        .map((f) => {
          const p = f.properties;
          const iso = (p.iso_a2 && p.iso_a2 !== '-99') ? p.iso_a2 : p.adm0_a3.slice(0, 2);
          const code = (p.iso_3166_2 && p.iso_3166_2 !== '-99') ? p.iso_3166_2.replace(/^[A-Z]{2}-/, '') : String(p.adm1_code);
          return {
            ...f,
            atlasId: `${iso}:${code}`,
            place: { name: p.name || p.name_en || code, level: 'county', parent: iso, iso, country: p.admin, type: p.type_en },
          };
        });
    },
  },

  'na-nations': {
    label: 'North America — national outlines (context only)',
    level: 'nation', source: 'ne-admin0',
    tiers: { '': { q: 6e4, minArea: 6 } },
    async features() {
      const fc = await shapefileOf('ne-admin0', /admin_0/i, (b, s, e) => b.toString('utf8', s, e));
      return fc.features
        .filter((f) => /North America/i.test(f.properties.CONTINENT || f.properties.continent || ''))
        .map((f) => {
          const p = f.properties;
          const iso = p.ISO_A2 && p.ISO_A2 !== '-99' ? p.ISO_A2 : (p.ADM0_A3 || '').slice(0, 2);
          return { ...f, atlasId: iso, place: { name: p.NAME || p.ADMIN, level: 'nation', parent: null, iso } };
        });
    },
  },
};

// ------------------------------------------------------------- the build ---

async function buildLayer(key) {
  const L = LAYERS[key];
  process.stderr.write(`\n${key} — ${L.label}\n`);

  let features;
  try {
    features = await L.features();
  } catch (e) {
    if (L.optional) { process.stderr.write(`  ! skipped: ${e.message}\n`); return null; }
    throw e;
  }
  features = features.filter((f) => f.atlasId);
  // A feature may be shapeless on purpose: a parent that exists only as a name,
  // because its geometry is the union of its children (Mexico's entidades).
  const shapeless = features.filter((f) => !f.geometry);
  features = features.filter((f) => f.geometry);
  process.stderr.write(`  ${features.length} units${shapeless.length ? ` (+${shapeless.length} name-only parents)` : ''}\n`);

  // places metadata (independent of tier)
  const places = {};
  for (const f of shapeless) places[f.atlasId] = { ...f.place };
  for (const f of features) {
    const m = measure(f.geometry);
    places[f.atlasId] = { ...f.place, ...m };
  }

  // ONE topology, at full resolution, and then a tier is a simplification plus
  // a re-quantization of its arcs (see requantize() for why that order).
  const BASE_Q = 2e5;
  const topo = buildTopology(features, {
    quantization: BASE_Q,
    id: (f) => f.atlasId,
    properties: () => ({}),                       // names live in places.json
    name: key,
  });
  process.stderr.write(`  topology: ${topo.arcs.length} arcs, ${pointCount(topo)} points\n`);

  const written = [];
  for (const [suffix, tier] of Object.entries(L.tiers)) {
    const s = requantize(simplifyTopology(topo, tier.minArea), tier.q);
    const json = JSON.stringify(CODEC.pack(s, key));
    writeFileSync(join(GEO, `${key}${suffix}.json`), json);
    written.push({ file: `${key}${suffix}.json`, quantization: tier.q, minArea: tier.minArea, points: pointCount(s), bytes: json.length });
    process.stderr.write(`  -> ${key}${suffix}.json  q ${String(tier.q).padStart(6)}  minArea ${String(tier.minArea).padStart(4)}  ${String(pointCount(s)).padStart(7)} pts  ${(json.length / 1024).toFixed(0)} KB\n`);
  }

  // ---- adjacency, straight off the shared arcs -------------------------
  let adjacency = null;
  if (L.adjacency) {
    const owners = new Map();                     // arc id → Set(unit index)
    topo.objects[key].geometries.forEach((g, i) => {
      const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
      for (const poly of polys) for (const ring of poly) for (const r of ring) {
        const a = r < 0 ? ~r : r;
        let s = owners.get(a);
        if (!s) owners.set(a, s = new Set());
        s.add(i);
      }
    });
    const ids = topo.objects[key].geometries.map((g) => g.id);
    const adj = ids.map(() => new Set());
    for (const set of owners.values()) {
      if (set.size < 2) continue;
      const list = [...set];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        adj[list[i]].add(list[j]); adj[list[j]].add(list[i]);
      }
    }
    adjacency = {};
    ids.forEach((id, i) => { adjacency[id] = [...adj[i]].map((k) => ids[k]).sort(); });
    const degree = Object.values(adjacency).reduce((n, a) => n + a.length, 0) / ids.length;
    const isolated = Object.entries(adjacency).filter(([, a]) => a.length === 0).length;
    process.stderr.write(`  adjacency: mean degree ${degree.toFixed(2)}, ${isolated} isolated (islands)\n`);
  }

  return { key, label: L.label, level: L.level, source: L.source, units: features.length, tiers: written, places, adjacency };
}

async function main() {
  mkdirSync(GEO, { recursive: true });
  mkdirSync(DATA, { recursive: true });
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const keys = only.length ? only : Object.keys(LAYERS);

  const results = [];
  for (const k of keys) {
    if (!LAYERS[k]) throw new Error(`unknown layer ${k} — have: ${Object.keys(LAYERS).join(', ')}`);
    const r = await buildLayer(k);
    if (r) results.push(r);
  }

  // merge places + adjacency across layers (a rebuild of one layer must not
  // drop the others' entries)
  const placesPath = join(DATA, 'places.json');
  const places = existsSync(placesPath) ? JSON.parse(require('node:fs').readFileSync(placesPath, 'utf8')) : {};
  for (const r of results) Object.assign(places, r.places);
  writeFileSync(placesPath, JSON.stringify(places));

  const adjPath = join(GEO, 'adjacency.json');
  const adjacency = existsSync(adjPath) ? JSON.parse(require('node:fs').readFileSync(adjPath, 'utf8')) : {};
  for (const r of results) if (r.adjacency) Object.assign(adjacency, r.adjacency);
  writeFileSync(adjPath, JSON.stringify(adjacency));

  const manPath = join(GEO, 'manifest.json');
  const manifest = existsSync(manPath) ? JSON.parse(require('node:fs').readFileSync(manPath, 'utf8')) : { layers: {} };
  manifest.built = new Date().toISOString().slice(0, 10);
  manifest.sources = Object.fromEntries(GEO_SOURCES.map((s) => [s.id, s]));
  for (const r of results) {
    manifest.layers[r.key] = { label: r.label, level: r.level, source: r.source, units: r.units, tiers: r.tiers };
  }
  writeFileSync(manPath, JSON.stringify(manifest, null, 1));

  process.stderr.write(`\nplaces.json ${Object.keys(places).length} places · adjacency.json ${Object.keys(adjacency).length} units\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
