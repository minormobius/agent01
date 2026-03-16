// DuckDB-Wasm integration for Arena
// Ingests NDJSON from CAR parser, extracts image data via SQL

const DUCKDB_CDN = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/dist';

let db = null;
let conn = null;

export async function initDuckDB() {
  if (db) return;

  const duckdb = await import(/* @vite-ignore */ `${DUCKDB_CDN}/duckdb-browser.mjs`);

  const DUCKDB_BUNDLES = {
    mvp: {
      mainModule: `${DUCKDB_CDN}/duckdb-mvp.wasm`,
      mainWorker: `${DUCKDB_CDN}/duckdb-browser-mvp.worker.js`,
    },
    eh: {
      mainModule: `${DUCKDB_CDN}/duckdb-eh.wasm`,
      mainWorker: `${DUCKDB_CDN}/duckdb-browser-eh.worker.js`,
    },
  };

  const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
  const workerBlob = new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' });
  const worker = new Worker(URL.createObjectURL(workerBlob));
  const logger = new duckdb.ConsoleLogger();

  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule);
  conn = await db.connect();

  // Create the records table (empty, ready for inserts)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS records (
      did VARCHAR,
      collection VARCHAR,
      rkey VARCHAR,
      uri VARCHAR,
      cid VARCHAR,
      size_bytes INTEGER,
      value JSON
    )
  `);
}

// Ingest NDJSON for a specific DID — replaces any existing data for that DID
export async function ingestNdjson(ndjson, did) {
  if (!conn) throw new Error('DuckDB not initialized');

  // Remove existing records for this DID
  await conn.query(`DELETE FROM records WHERE did = '${did.replace(/'/g, "''")}'`);

  // Register NDJSON as a file
  const encoder = new TextEncoder();
  const bytes = encoder.encode(ndjson);
  const filename = `repo_${did.replace(/[^a-zA-Z0-9]/g, '_')}.ndjson`;
  await db.registerFileBuffer(filename, bytes);

  // Insert with DID column — use explicit columns + json format to avoid
  // schema inference failures on records with unexpected keys (e.g. "via")
  await conn.query(`
    INSERT INTO records
    SELECT
      '${did.replace(/'/g, "''")}' as did,
      collection,
      rkey,
      uri,
      cid,
      size_bytes,
      value
    FROM read_json('${filename}',
      format='newline_delimited',
      columns={
        collection: 'VARCHAR',
        rkey: 'VARCHAR',
        uri: 'VARCHAR',
        cid: 'VARCHAR',
        size_bytes: 'INTEGER',
        value: 'JSON'
      },
      maximum_object_size=10485760
    )
  `);

  const result = await conn.query(`SELECT count(*) as n FROM records WHERE did = '${did.replace(/'/g, "''")}'`);
  const rows = result.toArray();
  return rows[0]?.n ?? 0;
}

// Extract all images from synced repos
// Returns array of { did, rkey, text, createdAt, images: [{cid, alt, aspectRatio}] }
export async function extractImages() {
  if (!conn) throw new Error('DuckDB not initialized');

  const result = await conn.query(`
    SELECT
      did,
      rkey,
      json_extract_string(value, '$.text') as text,
      json_extract_string(value, '$.createdAt') as created_at,
      COALESCE(
        json_extract(value, '$.embed.images'),
        json_extract(value, '$.embed.media.images')
      ) as images_json
    FROM records
    WHERE collection = 'app.bsky.feed.post'
      AND (
        json_extract_string(value, '$.embed.$type') = 'app.bsky.embed.images'
        OR json_extract_string(value, '$.embed.$type') = 'app.bsky.embed.recordWithMedia'
      )
    ORDER BY json_extract_string(value, '$.createdAt') DESC
  `);

  const rows = result.toArray().map(r => typeof r.toJSON === 'function' ? r.toJSON() : r);
  const images = [];

  for (const row of rows) {
    let imageArray;
    try {
      imageArray = typeof row.images_json === 'string'
        ? JSON.parse(row.images_json)
        : row.images_json;
    } catch {
      continue;
    }
    if (!Array.isArray(imageArray)) continue;

    for (const img of imageArray) {
      const cid = img.image?.ref?.$link || img.image?.ref?.['$link'];
      if (!cid) continue;

      images.push({
        did: row.did,
        rkey: row.rkey,
        text: row.text || '',
        createdAt: row.created_at,
        cid,
        alt: img.alt || '',
        aspectRatio: img.aspectRatio || null,
        mimeType: img.image?.mimeType || 'image/jpeg',
      });
    }
  }

  return images;
}

// Run arbitrary SQL
export async function query(sql) {
  if (!conn) throw new Error('DuckDB not initialized');
  const result = await conn.query(sql);
  return result.toArray().map(r => typeof r.toJSON === 'function' ? r.toJSON() : r);
}

// Get stats about synced data
export async function getStats() {
  if (!conn) throw new Error('DuckDB not initialized');

  const total = await query('SELECT count(*) as n FROM records');
  const byDid = await query(`
    SELECT did, count(*) as records,
      count(*) FILTER (WHERE
        json_extract_string(value, '$.embed.$type') = 'app.bsky.embed.images'
        OR json_extract_string(value, '$.embed.$type') = 'app.bsky.embed.recordWithMedia'
      ) as image_posts
    FROM records
    WHERE collection = 'app.bsky.feed.post'
    GROUP BY did
  `);

  return { totalRecords: total[0]?.n ?? 0, byDid };
}

export async function isReady() {
  return db !== null && conn !== null;
}
