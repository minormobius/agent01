// ── DuckDB-Wasm Integration ──
// Loads DuckDB-Wasm from CDN, initializes it, and provides SQL execution.
// Files from OPFS are registered as virtual tables for querying.

window.LabDuckDB = (() => {
  let db = null;
  let conn = null;
  let duckdb = null;

  const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/dist';

  // Create a same-origin worker from a cross-origin URL.
  // new Worker(cdnUrl) is blocked by browsers — wrap via importScripts.
  async function createWorker(url) {
    const blob = new Blob([`importScripts("${url}");`], { type: 'text/javascript' });
    return new Worker(URL.createObjectURL(blob));
  }

  async function init() {
    const statusEl = document.getElementById('status-duckdb');
    try {
      // Dynamically import DuckDB-Wasm
      const module = await import(`${CDN_BASE}/duckdb-browser.mjs`);
      duckdb = module;

      // Select the best bundle for this browser
      const bundles = await duckdb.selectBundle({
        mvp: {
          mainModule: `${CDN_BASE}/duckdb-mvp.wasm`,
          mainWorker: `${CDN_BASE}/duckdb-browser-mvp.worker.js`,
        },
        eh: {
          mainModule: `${CDN_BASE}/duckdb-eh.wasm`,
          mainWorker: `${CDN_BASE}/duckdb-browser-eh.worker.js`,
        },
      });

      const worker = await createWorker(bundles.mainWorker);
      const logger = new duckdb.ConsoleLogger();
      db = new duckdb.AsyncDuckDB(logger, worker);

      await db.instantiate(bundles.mainModule);
      conn = await db.connect();

      // Enable httpfs for remote file access
      await conn.query("INSTALL httpfs; LOAD httpfs;");

      if (statusEl) statusEl.dataset.status = 'ready';
      return true;
    } catch (err) {
      console.error('DuckDB init failed:', err);
      if (statusEl) statusEl.dataset.status = 'error';
      throw err;
    }
  }

  // Execute a SQL query and return results as an array of objects
  async function query(sql) {
    if (!conn) throw new Error('DuckDB not initialized');
    const result = await conn.query(sql);
    return arrowToObjects(result);
  }

  // Convert Arrow table to plain JS objects
  function arrowToObjects(arrowTable) {
    const columns = arrowTable.schema.fields.map(f => f.name);
    const rows = [];
    for (let i = 0; i < arrowTable.numRows; i++) {
      const row = {};
      for (const col of columns) {
        const val = arrowTable.getChild(col).get(i);
        row[col] = val;
      }
      rows.push(row);
    }
    return { columns, rows, numRows: arrowTable.numRows };
  }

  // Register a file from OPFS as a DuckDB table
  async function registerFile(name) {
    if (!db) throw new Error('DuckDB not initialized');
    const file = await LabStorage.readFile(name);
    const buffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    // Register the file in DuckDB's virtual filesystem
    await db.registerFileBuffer(name, uint8);

    // Auto-create a view based on file extension
    const ext = name.split('.').pop().toLowerCase();
    const tableName = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '');

    let createSQL;
    switch (ext) {
      case 'csv':
      case 'tsv':
        createSQL = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_csv_auto('${name}')`;
        break;
      case 'parquet':
        createSQL = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_parquet('${name}')`;
        break;
      case 'json':
        createSQL = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_json_auto('${name}')`;
        break;
      default:
        return { registered: true, view: null };
    }

    await conn.query(createSQL);
    return { registered: true, view: tableName };
  }

  // Register all OPFS files with DuckDB
  async function registerAllFiles() {
    const files = await LabStorage.listFiles();
    const results = [];
    for (const f of files) {
      try {
        const r = await registerFile(f.name);
        results.push({ name: f.name, ...r });
      } catch (err) {
        results.push({ name: f.name, error: err.message });
      }
    }
    return results;
  }

  // Get list of tables/views
  async function listTables() {
    const result = await query("SELECT table_name, table_type FROM information_schema.tables ORDER BY table_name");
    return result.rows;
  }

  // Describe a table
  async function describeTable(name) {
    const result = await query(`DESCRIBE "${name}"`);
    return result;
  }

  function isReady() {
    return db !== null && conn !== null;
  }

  return {
    init,
    query,
    registerFile,
    registerAllFiles,
    listTables,
    describeTable,
    isReady,
  };
})();
