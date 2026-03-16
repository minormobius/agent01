// DuckDB-Wasm integration for PDS Shell
// Ingests NDJSON from CAR parser, enables SQL queries over your entire PDS

const DUCKDB_CDN = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/dist';

let db = null;
let conn = null;

export async function initDuckDB() {
  if (db) return;

  // Dynamic import from CDN
  const duckdb = await import(/* @vite-ignore */ `${DUCKDB_CDN}/duckdb-eh.js`);

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
  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();

  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule);
  conn = await db.connect();
}

// Ingest NDJSON string into DuckDB as the 'records' table
export async function ingestNdjson(ndjson) {
  if (!conn) throw new Error('DuckDB not initialized');

  // Register the NDJSON as a file in DuckDB's virtual filesystem
  const encoder = new TextEncoder();
  const bytes = encoder.encode(ndjson);
  await db.registerFileBuffer('repo.ndjson', bytes);

  // Drop existing table if present
  await conn.query('DROP TABLE IF EXISTS records');

  // Create table from NDJSON with inferred schema
  await conn.query(`
    CREATE TABLE records AS
    SELECT
      collection,
      rkey,
      uri,
      cid,
      size_bytes,
      value
    FROM read_json_auto('repo.ndjson',
      format='newline_delimited',
      maximum_object_size=10485760
    )
  `);

  // Get count
  const result = await conn.query('SELECT count(*) as n FROM records');
  const rows = result.toArray();
  return rows[0]?.n ?? 0;
}

// Run a SQL query and return results as array of objects
export async function query(sql) {
  if (!conn) throw new Error('DuckDB not initialized — run sync first');

  const result = await conn.query(sql);
  const rows = result.toArray();

  // Convert Arrow rows to plain objects
  return rows.map(row => {
    if (typeof row.toJSON === 'function') return row.toJSON();
    return row;
  });
}

// Convenience queries
export async function listCollections() {
  return query(`
    SELECT
      collection,
      count(*) as record_count,
      sum(size_bytes) as total_bytes
    FROM records
    GROUP BY collection
    ORDER BY record_count DESC
  `);
}

export async function searchRecords(term) {
  return query(`
    SELECT collection, rkey, uri, size_bytes,
           json_extract_string(value, '$.text') as text,
           json_extract_string(value, '$.title') as title
    FROM records
    WHERE
      json_extract_string(value, '$.text') ILIKE '%${term.replace(/'/g, "''")}%'
      OR json_extract_string(value, '$.title') ILIKE '%${term.replace(/'/g, "''")}%'
    LIMIT 100
  `);
}

export async function isReady() {
  return db !== null && conn !== null;
}

export async function tableExists() {
  if (!conn) return false;
  try {
    await conn.query('SELECT 1 FROM records LIMIT 0');
    return true;
  } catch {
    return false;
  }
}
