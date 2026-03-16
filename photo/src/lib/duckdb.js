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

// Filter NDJSON to only keep app.bsky.feed.post records.
// For a 225K-record repo, this drops ~95% of lines (likes, follows, blocks, etc.)
// reducing memory for DuckDB ingest from ~200MB to ~10MB.
export function filterPostsNdjson(ndjson) {
  const lines = ndjson.split('\n');
  const kept = [];
  let totalLines = 0;
  for (const line of lines) {
    if (!line) continue;
    totalLines++;
    // Fast string check before JSON parse
    if (line.includes('"app.bsky.feed.post"')) {
      kept.push(line);
    }
  }
  return { filtered: kept.join('\n'), totalLines };
}

// Extract video embeds from synced repos
export async function extractVideos() {
  if (!conn) throw new Error('DuckDB not initialized');

  const result = await conn.query(`
    SELECT
      did,
      rkey,
      json_extract_string(value, '$.text') as text,
      json_extract_string(value, '$.createdAt') as created_at,
      CAST(json_extract(value, '$.embed') AS VARCHAR) as embed_json
    FROM records
    WHERE collection = 'app.bsky.feed.post'
      AND json_extract_string(value, '$.embed.$type') = 'app.bsky.embed.video'
    ORDER BY json_extract_string(value, '$.createdAt') DESC
  `);

  const rows = result.toArray().map(r => typeof r.toJSON === 'function' ? r.toJSON() : r);
  const videos = [];

  for (const row of rows) {
    let embed;
    try {
      embed = typeof row.embed_json === 'string' ? JSON.parse(row.embed_json) : row.embed_json;
    } catch { continue; }
    if (!embed?.video) continue;

    const ref = embed.video.ref;
    const cid = ref?.$link ?? ref?.['$link'] ?? ref?.link ?? (typeof ref === 'string' ? ref : null);
    if (!cid) continue;

    videos.push({
      type: 'video',
      did: row.did,
      rkey: row.rkey,
      text: row.text || '',
      createdAt: row.created_at,
      cid,
      alt: embed.alt || '',
      aspectRatio: embed.aspectRatio || null,
      mimeType: embed.video?.mimeType || 'video/mp4',
    });
  }

  return videos;
}

// Ingest NDJSON for a specific DID — replaces any existing data for that DID
// totalLines: optional count of total records before filtering (for display)
export async function ingestNdjson(ndjson, did, totalLines) {
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
  // Return total repo records (for display), ingested count is the post subset
  return totalLines || (rows[0]?.n ?? 0);
}

// Extract all images from synced repos
// Uses UNNEST + json path to pull CIDs directly via SQL rather than
// relying on JS-side parsing of DuckDB JSON objects
export async function extractImages() {
  if (!conn) throw new Error('DuckDB not initialized');

  // First, get the raw value JSON as a string so we parse it in JS
  // DuckDB's JSON type can mangle $ keys — cast to VARCHAR to get raw JSON
  const result = await conn.query(`
    SELECT
      did,
      rkey,
      json_extract_string(value, '$.text') as text,
      json_extract_string(value, '$.createdAt') as created_at,
      CAST(COALESCE(
        json_extract(value, '$.embed.images'),
        json_extract(value, '$.embed.media.images')
      ) AS VARCHAR) as images_json
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
  let parseFailures = 0;
  let cidMissing = 0;

  for (const row of rows) {
    let imageArray;
    try {
      const raw = row.images_json;
      if (!raw) { parseFailures++; continue; }
      imageArray = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      parseFailures++;
      continue;
    }
    if (!Array.isArray(imageArray)) { parseFailures++; continue; }

    for (const img of imageArray) {
      // Try multiple paths to find the CID — the $link key can appear in different forms
      const ref = img.image?.ref;
      const cid = ref?.$link ?? ref?.['$link'] ?? ref?.link ?? (typeof ref === 'string' ? ref : null);
      if (!cid) { cidMissing++; continue; }

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

  if (parseFailures > 0 || cidMissing > 0) {
    console.warn(`[ATPhoto] Image extraction: ${images.length} found, ${parseFailures} parse failures, ${cidMissing} missing CIDs`);
    // Log a sample row for debugging
    if (rows.length > 0) {
      console.log('[ATPhoto] Sample images_json:', typeof rows[0].images_json, rows[0].images_json?.substring?.(0, 500) ?? rows[0].images_json);
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
