#!/usr/bin/env node
// atlas.selftest.mjs — known-answer proofs for the atlas machinery.
//
// The point of a known-answer suite is that each test runs on a PLANTED
// configuration whose correct output is known before the code runs, so a pass
// means the code is right rather than that it is consistent with itself. The
// last block is different in kind: it checks the COMMITTED artefacts against
// figures the agencies publish, so a bad rebuild is caught before it ships a
// map that renders perfectly and is wrong.
//
//   node atlas/etl/atlas.selftest.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { buildTopology, simplifyTopology, requantize, pointCount } from './lib/topology.mjs';
import { readDBF, readSHP } from './lib/shapefile.mjs';
import { rows, records, num } from './lib/csv.mjs';
import { readPrj, inverseLCC } from './lib/proj.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
require(join(ROOT, 'lib', 'codec.js'));
require(join(ROOT, 'lib', 'projection.js'));
require(join(ROOT, 'lib', 'scale.js'));
require(join(ROOT, 'lib', 'hier.js'));
require(join(ROOT, 'lib', 'regionalize.js'));
require(join(ROOT, 'lib', 'measures.js'));
require(join(ROOT, 'names.js'));
const { ATLAS_CODEC, ATLAS_PROJ, ATLAS_SCALE, ATLAS_HIER, ATLAS_REGION, ATLAS_MEASURES, ATLAS_NAMES } = globalThis;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ───────────────────────────────────────────────────────────── the codec ──
console.log('\ncodec');
{
  const arcs = [
    [[0, 0], [3, 4], [10, -2], [10, -2]],
    [[-5, 7], [-5, 7]],
    [[100000, -100000], [0, 0]],
  ];
  const back = ATLAS_CODEC.decodeArcs(ATLAS_CODEC.encodeArcs(arcs), arcs.length);
  ok('arcs round-trip exactly',
    back.length === arcs.length && arcs.every((a, i) => a.flat().every((v, j) => back[i][j] === v)));

  // TopoJSON encodes a reversed arc reference as ~i, i.e. -i-1. Those must
  // survive the zigzag, or every hole in the map turns inside out.
  const ints = [0, -1, 1, ~0, ~4552, 4552, -2147483648, 2147483647];
  const rt = [...ATLAS_CODEC.decodeInts(ATLAS_CODEC.encodeInts(ints))];
  ok('signed ints (including ~i references) round-trip', ints.every((v, i) => rt[i] === v), rt.join(','));
}

// ──────────────────────────────────────────────────────────── the topology ──
console.log('\ntopology');
{
  // Two unit squares sharing the edge x=1. The answer is known: three arcs —
  // the shared border, and one boundary chain each — and the two squares are
  // adjacent to each other and to nobody else.
  const sq = (x0, x1) => ({
    geometry: { type: 'Polygon', coordinates: [[[x0, 0], [x1, 0], [x1, 1], [x0, 1], [x0, 0]]] },
  });
  const t = buildTopology([sq(0, 1), sq(1, 2)], { quantization: 1001, id: (f, i) => 'u' + i, name: 'u' });

  ok('two squares sharing an edge give exactly 3 arcs', t.arcs.length === 3, String(t.arcs.length));

  const refs = t.objects.u.geometries.map((g) => g.arcs[0].map((r) => (r < 0 ? ~r : r)));
  const shared = refs[0].filter((a) => refs[1].includes(a));
  ok('exactly one arc is shared', shared.length === 1, String(shared.length));

  // and it is stored ONCE and referenced in opposite directions
  const dirA = t.objects.u.geometries[0].arcs[0].find((r) => (r < 0 ? ~r : r) === shared[0]);
  const dirB = t.objects.u.geometries[1].arcs[0].find((r) => (r < 0 ? ~r : r) === shared[0]);
  ok('the shared arc is traversed in opposite directions', (dirA < 0) !== (dirB < 0));

  // Watertightness under simplification is the whole reason for the topology:
  // simplify hard, and the shared border is still literally the same array.
  const s = requantize(simplifyTopology(t, 1e6), 101);
  const a = s.arcs[shared[0]];
  ok('a shared border survives simplification as one object', Array.isArray(a) && a.length >= 2);
  ok('simplification never grows the point count', pointCount(s) <= pointCount(t));

  // A ring that quantisation degenerates to a sliver is dropped rather than
  // emitted as a two-point "polygon" that the renderer would fill as a line.
  const sliver = { geometry: { type: 'Polygon', coordinates: [[[0, 0], [1e-9, 0], [1e-9, 1e-9], [0, 0]]] } };
  const t2 = buildTopology([sq(0, 1), sliver], { quantization: 1001, id: (f, i) => 'u' + i, name: 'u' });
  ok('a degenerate ring is dropped, not emitted', t2.objects.u.geometries.length === 1, String(t2.objects.u.geometries.length));
}

// ────────────────────────────────────────────────────────── the shapefile ──
console.log('\nshapefile and dbf readers');
{
  // A hand-built .shp with one square, and a .dbf with one row: the smallest
  // configuration that exercises the record framing, the big-endian header and
  // the little-endian content.
  const pts = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];      // clockwise = outer ring
  const content = Buffer.alloc(44 + 4 + pts.length * 16);
  content.writeInt32LE(5, 0);                                 // shape type: polygon
  content.writeInt32LE(1, 36);                                // numParts
  content.writeInt32LE(pts.length, 40);                       // numPoints
  content.writeInt32LE(0, 44);                                // parts[0]
  pts.forEach((p, i) => { content.writeDoubleLE(p[0], 48 + i * 16); content.writeDoubleLE(p[1], 56 + i * 16); });
  const shp = Buffer.alloc(100 + 8 + content.length);
  shp.writeInt32BE(9994, 0);
  shp.writeInt32BE((shp.length) / 2, 24);
  shp.writeInt32BE(1, 100);                                   // record number
  shp.writeInt32BE(content.length / 2, 104);
  content.copy(shp, 108);
  const geoms = readSHP(shp);
  ok('reads one polygon from a shapefile', geoms.length === 1 && geoms[0].type === 'Polygon');
  // GeoJSON wants counter-clockwise exteriors; the shapefile's are clockwise.
  const ring = geoms[0].coordinates[0];
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  ok('exterior ring is re-wound counter-clockwise for GeoJSON', area > 0, String(area / 2));

  // A dBASE III table with one 5-character field and one record. Header is 32
  // bytes plus 32 per field plus the 0x0d terminator = 65; the record is a
  // deletion flag plus the field.
  const HDR = 32 + 32 + 1;
  const dbf = Buffer.alloc(HDR + 1 + 5);
  dbf[0] = 3;
  dbf.writeUInt32LE(1, 4);            // one record
  dbf.writeUInt16LE(HDR, 8);          // header length
  dbf.writeUInt16LE(1 + 5, 10);       // record length
  dbf.write('NAME', 32, 'latin1');    // field name, null-padded to 11
  dbf.write('C', 32 + 11, 'latin1');  // type
  dbf[32 + 16] = 5;                   // length
  dbf[64] = 0x0d;                     // field-descriptor terminator
  dbf.write(' Utah ', HDR, 'latin1'); // deletion flag ' ' then the 5-char value
  const rowsOut = readDBF(dbf);
  ok('reads a dBASE character field', rowsOut.length === 1 && rowsOut[0].NAME === 'Utah', JSON.stringify(rowsOut));
}

// ──────────────────────────────────────────────────────────────────── csv ──
console.log('csv');
{
  const text = 'a,b,c\n"Doña Ana, NM",2,"say ""hi"""\n,3,\n';
  const recs = [...records(text)];
  ok('quoted delimiters survive', recs[0].a === 'Doña Ana, NM', recs[0].a);
  ok('doubled quotes unescape', recs[0].c === 'say "hi"', recs[0].c);
  ok('empty fields are empty, not undefined', recs[1].a === '' && recs[1].b === '3');
  ok('agency null tokens become null', num('(D)') === null && num('') === null && num('1,234') === 1234);
  ok('a UTF-8 BOM does not corrupt the first column name',
    [...rows('﻿ENTIDAD,MUN\n01,001\n')][0][0] === 'ENTIDAD');
}

// ─────────────────────────────────────────────────────────── projections ──
console.log('\nprojections');
{
  // EPSG:3347 — Statistics Canada Lambert. The projection origin must invert
  // back to (central meridian, latitude of origin) exactly.
  const wkt = 'PROJCS["x",GEOGCS["y",DATUM["z",SPHEROID["GRS_1980",6378137,298.2572221008916]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]],PROJECTION["Lambert_Conformal_Conic"],PARAMETER["standard_parallel_1",49],PARAMETER["standard_parallel_2",77],PARAMETER["latitude_of_origin",63.390675],PARAMETER["central_meridian",-91.86666666666666],PARAMETER["false_easting",6200000],PARAMETER["false_northing",3000000],UNIT["Meter",1]]';
  const p = readPrj(wkt);
  const inv = inverseLCC(p);
  const o = inv(6200000, 3000000);
  ok('inverse Lambert returns the projection origin', near(o[0], -91.866666, 1e-6) && near(o[1], 63.390675, 1e-6), o.join(','));

  // The equal-area claim, tested rather than asserted: two lon/lat cells of
  // equal true area, one at 25°N and one at 48°N, must project to equal areas.
  const cellArea = (proj, lat) => {
    const dLon = 2, dLat = 2 / Math.cos(lat * Math.PI / 180);   // equal solid angle-ish
    const q = [proj(-100, lat), proj(-100 + dLon, lat), proj(-100 + dLon, lat + dLat), proj(-100, lat + dLat)];
    let a = 0;
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; a += q[i][0] * q[j][1] - q[j][0] * q[i][1]; }
    return Math.abs(a / 2);
  };
  const albers = ATLAS_PROJ.albersLower48();
  const rA = cellArea(albers, 25) / cellArea(albers, 48);
  ok('Albers preserves area across latitude', near(rA, 1, 0.03), `ratio ${rA.toFixed(4)}`);

  const merc = ATLAS_PROJ.mercator();
  const rM = cellArea(merc, 25) / cellArea(merc, 48);
  ok('Mercator does NOT — the control for the test above', !near(rM, 1, 0.1), `ratio ${rM.toFixed(4)}`);

  // The composite routes by IDENTITY, so the Aleutians (which cross the
  // antimeridian) cannot be misfiled into the lower 48 by a bounding box.
  const usa = ATLAS_PROJ.albersUsa();
  ok('composite routes Alaska, Hawai‘i and Puerto Rico by id',
    usa.regionOf('US:02016') === 'alaska' && usa.regionOf('US:15003') === 'hawaii'
    && usa.regionOf('US:72127') === 'rico' && usa.regionOf('US:06037') === 'lower48');

  usa.fit(null, 960, 600);
  const inside = ([x, y]) => x > 0 && y > 0 && x < 960 && y < 600;
  ok('every block lands inside the frame after fit',
    [['US:53033', -122.3, 47.6], ['US:12086', -80.2, 25.8], ['US:02020', -149.9, 61.2],
     ['US:15003', -157.9, 21.3], ['US:72127', -66.1, 18.5]]
      .every(([id, lo, la]) => inside(usa(lo, la, usa.regionOf(id)))));
}

// ────────────────────────────────────────────────────────── colour scales ──
console.log('\nscales');
{
  // Three tight planted clusters: natural breaks must separate them, and the
  // breaks must land between the clusters rather than inside one.
  const vals = [];
  for (let i = 0; i < 60; i++) vals.push(10 + (i % 6));
  for (let i = 0; i < 60; i++) vals.push(200 + (i % 6));
  for (let i = 0; i < 60; i++) vals.push(900 + (i % 6));
  const s = ATLAS_SCALE.makeScale(vals, { method: 'jenks', classes: 3 });
  ok('Jenks recovers three planted clusters',
    s.breaks.length === 3 && s.breaks[0] <= 10 && s.breaks[1] >= 190 && s.breaks[1] <= 205 && s.breaks[2] >= 890,
    s.breaks.map((v) => Math.round(v)).join(','));
  ok('each cluster gets its own colour',
    s.colorOf(11) !== s.colorOf(201) && s.colorOf(201) !== s.colorOf(901));
  ok('a missing value gets the no-data colour, not class 0',
    s.colorOf(null) === s.palette.nodata && s.colorOf(NaN) === s.palette.nodata);

  // The fast Jenks uses the divide-and-conquer optimisation, which is only
  // valid because the segment cost obeys the quadrangle inequality. That is a
  // claim about the maths, so it is checked against a brute-force solver of the
  // same recurrence rather than trusted.
  const bruteJenks = (values, k) => {
    const v = values.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
    const n = v.length, mean = v.reduce((t, x) => t + x, 0) / n;
    const S1 = new Float64Array(n + 1), S2 = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { const x = v[i] - mean; S1[i + 1] = S1[i] + x; S2[i + 1] = S2[i] + x * x; }
    const ssd = (i, j) => { const m = j - i + 1; if (m <= 1) return 0; const q = S1[j + 1] - S1[i]; return Math.max(0, (S2[j + 1] - S2[i]) - q * q / m); };
    let prev = new Float64Array(n);
    for (let j = 0; j < n; j++) prev[j] = ssd(0, j);
    const arg = [];
    for (let c = 1; c < k; c++) {
      const cur = new Float64Array(n), a = new Int32Array(n);
      for (let j = 0; j < n; j++) {
        if (j < c) { cur[j] = 0; a[j] = j; continue; }
        let best = Infinity, bi = c;
        for (let i = c; i <= j; i++) { const cost = prev[i - 1] + ssd(i, j); if (cost < best) { best = cost; bi = i; } }
        cur[j] = best; a[j] = bi;
      }
      arg.push(a); prev = cur;
    }
    const br = new Array(k);
    let end = n - 1;
    for (let c = k - 1; c >= 1; c--) { const i = arg[c - 1][end]; br[c] = v[i]; end = Math.max(0, i - 1); }
    br[0] = v[0];
    return br;
  };
  let jenksMismatch = 0, jenksTrials = 0;
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 9; t++) {
    const N = 300 + Math.floor(rnd() * 300);
    const shape = t % 3;
    const vals = Array.from({ length: N }, () => (shape === 0 ? Math.exp(rnd() * 3) * 1000
      : shape === 1 ? rnd() * 100
      : (rnd() < 0.5 ? rnd() * 10 : 500 + rnd() * 30)));
    for (const kk of [3, 5, 7]) {
      jenksTrials++;
      const fast = ATLAS_SCALE.makeScale(vals, { method: 'jenks', classes: kk }).breaks;
      const slow = bruteJenks(vals, kk);
      if (fast.length !== slow.length || fast.some((v, i) => v !== slow[i])) jenksMismatch++;
    }
  }
  ok('fast Jenks equals the brute-force optimum on every shape',
    jenksMismatch === 0, `${jenksMismatch} of ${jenksTrials} differed`);

  const L = (hex) => ATLAS_SCALE.hexToOklab(hex)[0];
  const ramp = ATLAS_SCALE.ramp(ATLAS_SCALE.PALETTE.light.sequential, 9);
  ok('the sequential ramp is monotone in lightness',
    ramp.every((c, i) => i === 0 || L(c) < L(ramp[i - 1]) + 1e-9), ramp.join(' '));
  const dark = ATLAS_SCALE.ramp(ATLAS_SCALE.PALETTE.dark.sequential, 9);
  ok('so is the dark ramp, in the other direction',
    dark.every((c, i) => i === 0 || L(c) > L(dark[i - 1]) - 1e-9));
  ok('OKLab round-trips a colour', ATLAS_SCALE.oklabToHex(ATLAS_SCALE.hexToOklab('#2a78d6')) === '#2a78d6');
}

// ───────────────────────────────────────────────────────────── hierarchy ──
console.log('\nhierarchy');
{
  const { Hierarchy, level } = ATLAS_HIER;
  // The averaging trap, planted: a 48-person county at $100,000 a head and a
  // 9.8-million county at $92,000. The mean of the two is $96,000 and the truth
  // is $92,000. Rolling up must give the truth.
  const data = {
    ids: ['loving', 'la'],
    series: { 'income:2024': [4800, 901600000], 'pop:2024': [48, 9800000], 'employment:2022': [30, 5000000] },
  };
  const h = new Hierarchy(data, { levels: [level({ id: 'st', label: 'S', of: () => 'TX' })] });
  const m = { key: 'pcpi', num: 'income', den: 'pop', k: 1000 };
  const rolled = h.measure(m, 'st', 2024).values[0];
  const meanOfChildren = (4800 / 48 * 1000 + 901600000 / 9800000 * 1000) / 2;
  ok('a rolled-up rate is the ratio of sums, not the mean of ratios',
    near(rolled, 92000, 1) && !near(rolled, meanOfChildren, 100),
    `rolled ${Math.round(rolled)} vs mean-of-children ${Math.round(meanOfChildren)}`);

  // Stocks do not share a vintage; a per-stock year map must be honoured.
  const perStock = { income: 2024, pop: 2024, employment: 2022, _: 2024 };
  const gpj = h.measure({ num: 'income', den: 'employment', k: 1000 }, 'st', perStock).values[0];
  ok('a per-stock vintage map picks the right column', near(gpj, 901604800 / 5000030 * 1000, 1), String(Math.round(gpj)));

  // A published rate with no parts to rebuild it from is refused above the leaf.
  const h2 = new Hierarchy(
    { ids: ['a', 'b'], series: { 'median_household_income:2021': [70000, 90000] } },
    { noRollup: new Set(['median_household_income']), levels: [level({ id: 'st', label: 'S', of: () => 'X' })] },
  );
  const med = { key: 'med', stock: 'median_household_income' };
  ok('a median is served at the leaf', h2.measure(med, 'leaf', 2021).values[0] === 70000);
  ok('and refused above it — a median of medians is not a median',
    h2.measure(med, 'st', 2021).refused === 'no-rollup');

  // A partly-suppressed group sums what it has and reports the coverage.
  const h3 = new Hierarchy(
    { ids: ['a', 'b', 'c'], series: { 'income:2024': [10, null, 30] } },
    { levels: [level({ id: 'st', label: 'S', of: () => 'X' })] },
  );
  ok('a partly-suppressed group sums what is known', h3.rollup('income:2024', 'st').get('X') === 40);
  const cov = h3.coverage('income:2024', 'st').get('X');
  ok('and reports how much that was', cov.have === 2 && cov.of === 3);

  // Re-pointing a level is what a redrawn superstate map does; the cache must
  // not survive it.
  const h4 = new Hierarchy(data, { levels: [level({ id: 'r', label: 'R', of: () => 'A' })] });
  const before = h4.measure(m, 'r', 2024).values[0];
  h4.setLevel('r', (id) => (id === 'la' ? 'A' : 'B'));
  const after = h4.measure(m, 'r', 2024);
  ok('re-pointing a level invalidates the cache', after.ids.length === 2 && !near(after.values[0], before, 1e-9));
}

// ────────────────────────────────────────────────────── regionalisation ──
console.log('\nregionalisation');
{
  // A chain of 40 units with a planted step at the halfway point. The one right
  // answer is a cut exactly at the step, and two connected regions.
  const n = 40, ids = [], adjacency = {}, centroids = {}, col = [];
  for (let i = 0; i < n; i++) {
    ids.push('u' + i);
    centroids['u' + i] = [-100 + i * 0.5, 40];
    col.push(i < n / 2 ? 0 : 10);
  }
  for (let i = 0; i < n; i++) {
    adjacency['u' + i] = [i > 0 ? 'u' + (i - 1) : null, i < n - 1 ? 'u' + (i + 1) : null].filter(Boolean);
  }
  const r = ATLAS_REGION.skater({ ids, adjacency, centroids, columns: [col], k: 2, minWeightFrac: 0.5, minCount: 2 });
  ok('SKATER finds the planted step exactly',
    r.k === 2 && ids.every((id, i) => (r.region[i] === r.region[0]) === (i < n / 2)),
    r.sizes.join(','));

  // Contiguity is the whole constraint: assert it rather than assuming it.
  const at = Object.fromEntries(ids.map((id, i) => [id, i]));
  const connected = (g) => {
    const members = ids.filter((_, i) => r.region[i] === g);
    if (!members.length) return true;
    const seen = new Set([members[0]]), st = [members[0]];
    while (st.length) {
      const u = st.pop();
      for (const v of adjacency[u]) if (!seen.has(v) && r.region[at[v]] === g) { seen.add(v); st.push(v); }
    }
    return seen.size === members.length;
  };
  ok('every region is a single connected piece of ground', [...Array(r.k).keys()].every(connected));

  // Two disconnected components must be bridged, and the bridge recorded.
  const ids2 = ['a', 'b', 'island'];
  const r2 = ATLAS_REGION.skater({
    ids: ids2,
    adjacency: { a: ['b'], b: ['a'], island: [] },
    centroids: { a: [-100, 40], b: [-99, 40], island: [-95, 40] },
    columns: [[0, 0, 5]], k: 2, minWeightFrac: 0.2, minCount: 1,
  });
  ok('a stranded component is bridged, and the bridge is reported',
    r2.seaLinks.length === 1 && r2.seaLinks[0].km > 0, JSON.stringify(r2.seaLinks));

  // The size floor: without it the greedy rule shaves off single outliers.
  const big = [], bigIds = [], bigAdj = {}, bigCent = {};
  for (let i = 0; i < 60; i++) {
    bigIds.push('v' + i); bigCent['v' + i] = [-100 + i * 0.2, 40];
    big.push(i === 30 ? 100 : (i % 3));
    bigAdj['v' + i] = [i > 0 ? 'v' + (i - 1) : null, i < 59 ? 'v' + (i + 1) : null].filter(Boolean);
  }
  const rf = ATLAS_REGION.skater({ ids: bigIds, adjacency: bigAdj, centroids: bigCent, columns: [big], k: 3, minWeightFrac: 0.8, minCount: 5 });
  ok('the size floor keeps a single outlier from becoming a region',
    Math.min(...rf.sizes) >= 5, rf.sizes.join(','));

  // Standardisation must be scale-free: the same shape in dollars and in shares
  // has to produce the same partition.
  const z1 = ATLAS_REGION.standardize([col]);
  const z2 = ATLAS_REGION.standardize([col.map((v) => v * 1e6 + 5)]);
  ok('standardisation is invariant to units', z1[0].every((v, i) => near(v, z2[0][i], 1e-9)));
}

// ───────────────────────────────────────────────────────────────── names ──
console.log('naming');
{
  // Two regions with anchors in them: the name must follow the ground, and a
  // Canadian anchor must never name a U.S. region.
  const ids = ['US:36061', 'US:36047', 'US:06037', 'US:06059'];
  const centroids = { 'US:36061': [-73.97, 40.78], 'US:36047': [-73.95, 40.65], 'US:06037': [-118.2, 34.3], 'US:06059': [-117.8, 33.7] };
  const names = ATLAS_NAMES.nameRegions(Int32Array.from([0, 0, 1, 1]), ids, centroids, [1.6e6, 2.5e6, 9.8e6, 3.1e6]);
  ok('an anchor names the region that contains it', names[0] === 'The Empire' && names[1] === 'The Southland', names.join(' / '));
  ok('a Canadian anchor never names a U.S. region', !names.some((n) => ['New France', 'The Maritimes', 'The Shield'].includes(n)));
}

// ────────────────────────────────────────── the committed artefacts ──────
console.log('\ncommitted artefacts');
{
  const geoDir = join(ROOT, 'geo'), dataDir = join(ROOT, 'data');
  const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const has = (p) => existsSync(p);

  const need = ['geo/us-counties.json', 'geo/adjacency.json', 'data/places.json',
    'data/us-counties.json', 'data/sources.json'];
  ok('the artefacts the page needs are present', need.every((f) => has(join(ROOT, f))),
    need.filter((f) => !has(join(ROOT, f))).join(', '));

  if (need.every((f) => has(join(ROOT, f)))) {
    const places = load(join(dataDir, 'places.json'));
    const topo = ATLAS_CODEC.unpack(load(join(geoDir, 'us-counties.json')));
    const data = load(join(dataDir, 'us-counties.json'));

    ok('the geometry decodes to the unit count it declares', topo.ids.length === 3225, String(topo.ids.length));
    ok('every drawn county has a place record', topo.ids.every((id) => places[id]));
    ok('the data file covers exactly the drawn counties',
      data.ids.length === topo.ids.length && data.ids.every((id) => topo.index[id] !== undefined));

    const adj = load(join(geoDir, 'adjacency.json'));
    const asym = topo.ids.filter((id) => (adj[id] || []).some((j) => !(adj[j] || []).includes(id)));
    ok('adjacency is symmetric', asym.length === 0, asym.slice(0, 3).join(', '));
    const deg = topo.ids.reduce((s, id) => s + (adj[id] || []).length, 0) / topo.ids.length;
    ok('mean county adjacency is planar-plausible (5 to 6.5)', deg > 5 && deg < 6.5, deg.toFixed(2));

    // The national aggregates, against what the agencies publish. These are the
    // numbers that catch a rebuild that parsed the wrong column.
    const M = ATLAS_MEASURES;
    const h = new ATLAS_HIER.Hierarchy(data, {
      noRollup: M.NO_ROLLUP,
      levels: [ATLAS_HIER.level({ id: 'nation', label: 'US', of: () => 'US' })],
    });
    const tot = (k) => h.rollup(`${k}:${data.current[k]}`, 'nation').get('US');
    const pop = tot('pop'), inc = tot('income'), gdp = tot('gdp');
    ok('U.S. population is within 2% of 340 million', near(pop / 1e6, 340, 7), (pop / 1e6).toFixed(1) + 'M');
    ok('U.S. personal income is within 5% of $24.9 trillion', near(inc / 1e9, 24.9, 1.2), '$' + (inc / 1e9).toFixed(2) + 'T');
    ok('U.S. GDP is within 5% of $29.1 trillion', near(gdp / 1e9, 29.1, 1.5), '$' + (gdp / 1e9).toFixed(2) + 'T');
    const tShare = tot('transfers') / inc;
    ok('the transfer share of personal income is 15-21%', tShare > 0.15 && tShare < 0.21, (tShare * 100).toFixed(1) + '%');

    // Every measure the UI offers must actually evaluate.
    const broken = M.forNation('US').filter((m) => {
      const r = h.measure(m, 'leaf', data.current);
      return r.values.filter((v) => v != null).length < 500;
    }).map((m) => m.key);
    ok('every U.S. measure evaluates for most counties', broken.length === 0, broken.join(', '));

    // Every stock a measure names must exist in the file, or the picker offers
    // a measure that silently paints the whole map grey.
    const missing = new Set();
    for (const m of M.MEASURES) {
      for (const k of [m.num, m.den, m.plus, m.minus, m.stock].filter(Boolean)) {
        if (!M.STOCKS[k]) missing.add(k);
      }
    }
    ok('every measure names a declared stock', missing.size === 0, [...missing].join(', '));

    const srcs = load(join(dataDir, 'sources.json'));
    ok('every source carries a licence and a URL',
      srcs.sources.every((s) => s.licence && s.url && s.publisher),
      srcs.sources.filter((s) => !s.licence || !s.url).map((s) => s.id).join(', '));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
