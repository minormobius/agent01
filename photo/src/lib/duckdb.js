// DuckDB-Wasm integration for Arena
// Ingests NDJSON from CAR parser, extracts image data via SQL

import { cidFromRef } from './cid.js';

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
//
// The naive `split('\n')` → filter → `join('\n')` → `TextEncoder.encode()` chain
// materialised the whole repo three more times on top of the NDJSON string
// itself (which is already ~2× its byte size, since JS strings are UTF-16).
// This walks the string with indexOf and encodes each kept line straight into a
// growing byte buffer: one pass, one output allocation, no intermediate array of
// 225,000 substrings.
//
// The `"app.bsky.feed.post"` test is a prefilter, not the filter — it matches on
// the quoted collection name, and every query downstream still says
// `WHERE collection = 'app.bsky.feed.post'`, so a false positive costs a row in
// DuckDB and nothing else.
export function filterPostsToBytes(ndjson) {
  const encoder = new TextEncoder();
  let out = new Uint8Array(1 << 20);
  let length = 0;
  let totalLines = 0;
  let kept = 0;

  const push = (bytes) => {
    if (length + bytes.length + 1 > out.length) {
      let size = out.length * 2;
      while (size < length + bytes.length + 1) size *= 2;
      const bigger = new Uint8Array(size);
      bigger.set(out.subarray(0, length));
      out = bigger;
    }
    out.set(bytes, length);
    length += bytes.length;
    out[length++] = 0x0a; // '\n'
  };

  let start = 0;
  while (start < ndjson.length) {
    let end = ndjson.indexOf('\n', start);
    if (end === -1) end = ndjson.length;
    if (end > start) {
      totalLines++;
      const line = ndjson.slice(start, end);
      if (line.includes('"app.bsky.feed.post"')) {
        push(encoder.encode(line));
        kept++;
      }
    }
    start = end + 1;
  }

  return { bytes: out.subarray(0, length), totalLines, kept };
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

    const cid = cidFromRef(embed.video.ref);
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

// Ingest already-encoded NDJSON bytes for a specific DID — replaces any
// existing data for that DID. Takes bytes rather than a string because
// `filterPostsToBytes` produced them without ever building the intermediate
// string; re-encoding here would put the copy straight back.
// totalLines: count of total records before filtering (for display)
export async function ingestNdjson(bytes, did, totalLines) {
  if (!conn) throw new Error('DuckDB not initialized');

  // Remove existing records for this DID
  await conn.query(`DELETE FROM records WHERE did = '${did.replace(/'/g, "''")}'`);

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
/**
 * The four JSON paths a picture array can live at, as one SQL expression.
 * Exported so the selftest can assert every path this file relies on is in it,
 * and so `getStats` counts exactly the posts `extractImages` will return.
 */
export const IMAGE_ARRAY_PATHS = [
  '$.embed.images',        // app.bsky.embed.images
  '$.embed.items',         // app.bsky.embed.gallery
  '$.embed.media.images',  // recordWithMedia wrapping images
  '$.embed.media.items',   // recordWithMedia wrapping a gallery
];

const IMAGE_ARRAY_SQL = `COALESCE(${
  IMAGE_ARRAY_PATHS.map((p) => `json_extract(value, '${p}')`).join(', ')
})`;

export async function extractImages() {
  if (!conn) throw new Error('DuckDB not initialized');

  // First, get the raw value JSON as a string so we parse it in JS
  // DuckDB's JSON type can mangle $ keys — cast to VARCHAR to get raw JSON
  //
  // MATCH ON SHAPE, NOT ON NAME. This used to name the two embed lexicons it
  // knew — `app.bsky.embed.images` and `app.bsky.embed.recordWithMedia` — and
  // when Bluesky shipped `app.bsky.embed.gallery` (posts with more than four
  // pictures, and now the default composer path for several clients) every one
  // of those posts silently vanished from the grid. No error, no warning: the
  // WHERE clause simply matched nothing, and an account's best posts were
  // missing from its own archive.
  //
  // A picture embed is any embed carrying an array of entries with a blob under
  // `.image`. Gallery calls that array `items`, images calls it `images`, and
  // recordWithMedia nests either one under `.media`. Asking for the *shape*
  // means the next lexicon works without a code change; anything in the array
  // without a resolvable blob ref is dropped below anyway.
  const result = await conn.query(`
    SELECT
      did,
      rkey,
      json_extract_string(value, '$.text') as text,
      json_extract_string(value, '$.createdAt') as created_at,
      CAST(${IMAGE_ARRAY_SQL} AS VARCHAR) as images_json
    FROM records
    WHERE collection = 'app.bsky.feed.post'
      AND ${IMAGE_ARRAY_SQL} IS NOT NULL
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
      // The $link key appears in several forms across PDS versions — and a bare
      // string ref has to be ruled out before touching `.link`, which every
      // string inherits from String.prototype. See cid.js.
      const cid = cidFromRef(img.image?.ref);
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
  // Same predicate as extractImages, so the count and the grid agree.
  const byDid = await query(`
    SELECT did, count(*) as records,
      count(*) FILTER (WHERE ${IMAGE_ARRAY_SQL} IS NOT NULL) as image_posts
    FROM records
    WHERE collection = 'app.bsky.feed.post'
    GROUP BY did
  `);

  return { totalRecords: total[0]?.n ?? 0, byDid };
}

export async function isReady() {
  return db !== null && conn !== null;
}
