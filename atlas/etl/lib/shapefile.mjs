// shapefile.mjs — ESRI shapefile (.shp) + dBASE (.dbf) reader. No dependencies.
//
// WHY NOT A LIBRARY: this surface's whole claim is that its geometry comes from
// the primary source — the Census Bureau's own cartographic boundary files,
// Statistics Canada's own boundary files, INEGI's own Marco Geoestadístico —
// rather than from somebody's re-publication. All three ship shapefiles. A
// reader is ~200 lines; a supply chain is forever.
//
// Format references: ESRI Shapefile Technical Description (July 1998) for .shp,
// and the dBASE III+/IV table layout for .dbf.

// ---------------------------------------------------------------- dBASE ----

const LATIN1 = (b, s, e) => b.toString('latin1', s, e);

/**
 * Read a .dbf table.
 * @param {Buffer} buf
 * @param {(b:Buffer,s:number,e:number)=>string} decode  text decoder (default latin1)
 * @returns {Array<Record<string, string|number|boolean|null>>}
 */
export function readDBF(buf, decode = LATIN1) {
  const numRecords = buf.readUInt32LE(4);
  const headerLen  = buf.readUInt16LE(8);
  const recordLen  = buf.readUInt16LE(10);

  const fields = [];
  for (let p = 32; p < headerLen - 1 && buf[p] !== 0x0d; p += 32) {
    const name = decode(buf, p, p + 11).replace(/\0.*$/, '').trim();
    fields.push({ name, type: String.fromCharCode(buf[p + 11]), length: buf[p + 16] });
  }

  const rows = [];
  for (let r = 0; r < numRecords; r++) {
    const base = headerLen + r * recordLen;
    if (base + recordLen > buf.length) break;
    if (buf[base] === 0x2a) continue;              // 0x2a '*' = deleted record
    const row = {};
    let off = base + 1;
    for (const f of fields) {
      const raw = decode(buf, off, off + f.length).trim();
      off += f.length;
      switch (f.type) {
        case 'N': case 'F':
          row[f.name] = raw === '' ? null : Number(raw); break;
        case 'L':
          row[f.name] = /^[YyTt]$/.test(raw) ? true : /^[NnFf]$/.test(raw) ? false : null; break;
        case 'D':
          row[f.name] = /^\d{8}$/.test(raw) ? `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}` : null; break;
        default:
          row[f.name] = raw;
      }
    }
    rows.push(row);
  }
  return rows;
}

// ------------------------------------------------------------- geometry ----

const ringArea = (ring) => {
  // Shoelace, y-up. Counter-clockwise is positive.
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
};

/**
 * Read a .shp geometry file.
 * @returns {Array<null | {type:string, coordinates:any}>}  one entry per record,
 *   index-aligned with readDBF's rows, GeoJSON geometry objects (null for null shapes).
 */
export function readSHP(buf) {
  const fileLen = buf.readInt32BE(24) * 2;         // header stores 16-bit words
  const end = Math.min(fileLen, buf.length);
  const out = [];
  let p = 100;

  while (p + 8 <= end) {
    const contentLen = buf.readInt32BE(p + 4) * 2;
    const c = p + 8;                                // start of record content
    const type = buf.readInt32LE(c);
    p = c + contentLen;

    if (type === 0) { out.push(null); continue; }

    // Point (1) / PointZ (11) / PointM (21)
    if (type === 1 || type === 11 || type === 21) {
      out.push({ type: 'Point', coordinates: [buf.readDoubleLE(c + 4), buf.readDoubleLE(c + 12)] });
      continue;
    }

    // Polygon (5/15/25) and PolyLine (3/13/23) share the parts+points layout.
    const isPoly = type === 5 || type === 15 || type === 25;
    const isLine = type === 3 || type === 13 || type === 23;
    if (!isPoly && !isLine) { out.push(null); continue; }

    const numParts  = buf.readInt32LE(c + 36);
    const numPoints = buf.readInt32LE(c + 40);
    const partsOff  = c + 44;
    const ptsOff    = partsOff + numParts * 4;

    const parts = [];
    for (let i = 0; i < numParts; i++) {
      const start = buf.readInt32LE(partsOff + i * 4);
      const stop  = i + 1 < numParts ? buf.readInt32LE(partsOff + (i + 1) * 4) : numPoints;
      const ring = new Array(stop - start);
      for (let j = start; j < stop; j++) {
        ring[j - start] = [buf.readDoubleLE(ptsOff + j * 16), buf.readDoubleLE(ptsOff + j * 16 + 8)];
      }
      parts.push(ring);
    }

    if (isLine) {
      out.push(parts.length === 1
        ? { type: 'LineString', coordinates: parts[0] }
        : { type: 'MultiLineString', coordinates: parts });
      continue;
    }

    // Polygon: the spec orders outer rings CLOCKWISE (negative shoelace area,
    // y-up) and holes counter-clockwise, with each hole following its outer
    // ring. So a new polygon begins at every clockwise ring.
    const polys = [];
    for (const ring of parts) {
      if (ring.length < 4) continue;
      if (ringArea(ring) < 0 || polys.length === 0) polys.push([ring]);
      else polys[polys.length - 1].push(ring);
    }
    // GeoJSON (RFC 7946) wants exteriors counter-clockwise, holes clockwise:
    // the exact opposite of the shapefile convention, so reverse every ring.
    for (const poly of polys) for (const ring of poly) ring.reverse();

    out.push(polys.length === 0 ? null
      : polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] }
      : { type: 'MultiPolygon', coordinates: polys });
  }
  return out;
}

/**
 * Read a shapefile pair out of an extracted-zip map, matching by basename.
 * @param {Record<string,Buffer>} files   name → bytes (from zip.extract)
 * @param {RegExp} match                  matches the .shp entry name
 * @returns {{type:'FeatureCollection', features:Array}}
 */
export function readShapefile(files, match, decode = LATIN1) {
  const shpName = Object.keys(files).find((n) => /\.shp$/i.test(n) && match.test(n));
  if (!shpName) throw new Error(`shapefile: no .shp matching ${match} in [${Object.keys(files).join(', ')}]`);
  const dbfName = Object.keys(files).find((n) => n.replace(/\.dbf$/i, '') === shpName.replace(/\.shp$/i, ''));
  const prjName = Object.keys(files).find((n) => n.replace(/\.prj$/i, '') === shpName.replace(/\.shp$/i, ''));

  const geoms = readSHP(files[shpName]);
  const rows  = dbfName ? readDBF(files[dbfName], decode) : geoms.map(() => ({}));
  const prj   = prjName ? files[prjName].toString('latin1') : '';

  const features = [];
  for (let i = 0; i < geoms.length; i++) {
    if (!geoms[i]) continue;
    features.push({ type: 'Feature', properties: rows[i] || {}, geometry: geoms[i] });
  }
  return { type: 'FeatureCollection', features, prj, source: shpName };
}
