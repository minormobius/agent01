// sync — download entire repo as CAR, parse to records, load into DuckDB
// sync                → full repo sync
// sync --stats        → show CAR stats without full ingest
//
// After sync, use `sql` command to query your PDS with SQL.

import { syncRepo, downloadRepo, getCarStats } from '../../lib/repo.js';
import { initDuckDB, ingestNdjson, listCollections, buildIndex } from '../../lib/duckdb.js';

export default async function sync(args, flags, ctx) {
  const { session, terminal, fmt, signal } = ctx;
  const statsOnly = flags.stats;

  terminal.writeln(fmt.bold('Repo Sync'));
  terminal.writeln(fmt.dim('─'.repeat(50)));

  // Step 1: Download CAR
  terminal.write(fmt.dim('downloading repo... '));
  const startDl = Date.now();
  let carBytes;

  try {
    carBytes = await downloadRepo(session.pdsUrl, session.did, session.accessJwt, {
      onProgress: ({ received, total }) => {
        const mb = (received / 1024 / 1024).toFixed(1);
        const pct = total ? ` (${Math.round(received / total * 100)}%)` : '';
        terminal.write(`\r${fmt.dim('downloading repo...')} ${fmt.cyan(mb + ' MB')}${pct}  `);
      }
    });
  } catch (err) {
    terminal.writeln('');
    terminal.writeln(fmt.red(`download failed: ${err.message}`));
    return;
  }

  const dlTime = ((Date.now() - startDl) / 1000).toFixed(1);
  const mb = (carBytes.length / 1024 / 1024).toFixed(1);
  terminal.writeln(`\r${fmt.green('downloaded')} ${fmt.cyan(mb + ' MB')} in ${dlTime}s${' '.repeat(20)}`);

  if (signal.aborted) return;

  // Step 2: Parse CAR with Rust/WASM
  if (statsOnly) {
    terminal.write(fmt.dim('parsing... '));
    try {
      const stats = await getCarStats(carBytes);
      terminal.writeln(fmt.green('done'));
      terminal.writeln('');
      terminal.writeln(`${fmt.dim('Total blocks:')}  ${fmt.cyan(fmt.formatCount(stats.totalBlocks))}`);
      terminal.writeln(`${fmt.dim('Total records:')} ${fmt.cyan(fmt.formatCount(stats.totalRecords))}`);
      terminal.writeln(`${fmt.dim('CAR size:')}      ${fmt.cyan(mb + ' MB')}`);
      terminal.writeln('');
      terminal.writeln(fmt.bold('Collections:'));
      for (const col of stats.collections.sort((a, b) => b.records - a.records)) {
        terminal.writeln(`  ${fmt.blue(col.name.padEnd(45))} ${fmt.cyan(fmt.formatCount(col.records).padStart(8))}  ${fmt.dim(fmt.formatBytes(col.bytes))}`);
      }
    } catch (err) {
      terminal.writeln(fmt.red(`parse failed: ${err.message}`));
    }
    return;
  }

  terminal.write(fmt.dim('parsing CAR (Rust/WASM)... '));
  const startParse = Date.now();
  let ndjson;
  try {
    const { parseCar } = await import('../../lib/repo.js');
    ndjson = await parseCar(carBytes, session.did);
  } catch (err) {
    terminal.writeln(fmt.red(`parse failed: ${err.message}`));
    return;
  }
  const parseTime = ((Date.now() - startParse) / 1000).toFixed(1);
  const lines = ndjson.split('\n').filter(Boolean).length;
  terminal.writeln(`${fmt.green('parsed')} ${fmt.cyan(fmt.formatCount(lines) + ' records')} in ${parseTime}s`);

  if (signal.aborted) return;

  // Step 3: Load into DuckDB
  terminal.write(fmt.dim('initializing DuckDB... '));
  try {
    await initDuckDB();
    terminal.writeln(fmt.green('ready'));
  } catch (err) {
    terminal.writeln(fmt.red(`DuckDB init failed: ${err.message}`));
    return;
  }

  terminal.write(fmt.dim('ingesting records... '));
  const startIngest = Date.now();
  try {
    const count = await ingestNdjson(ndjson);
    const ingestTime = ((Date.now() - startIngest) / 1000).toFixed(1);
    terminal.writeln(`${fmt.green('loaded')} ${fmt.cyan(fmt.formatCount(count) + ' records')} in ${ingestTime}s`);
  } catch (err) {
    terminal.writeln(fmt.red(`ingest failed: ${err.message}`));
    return;
  }

  // Step 4: Build index
  terminal.write(fmt.dim('building index... '));
  try {
    const indexCount = await buildIndex();
    terminal.writeln(`${fmt.green('indexed')} ${fmt.cyan(fmt.formatCount(indexCount) + ' records')}`);
  } catch (err) {
    terminal.writeln(fmt.yellow(`index skipped: ${err.message}`));
  }

  // Summary
  terminal.writeln('');
  terminal.writeln(fmt.bold('Collections:'));
  try {
    const collections = await listCollections();
    for (const col of collections) {
      terminal.writeln(`  ${fmt.blue(String(col.collection).padEnd(45))} ${fmt.cyan(String(col.record_count).padStart(8))}  ${fmt.dim(fmt.formatBytes(Number(col.total_bytes)))}`);
    }
  } catch { /* ignore summary errors */ }

  terminal.writeln('');
  terminal.writeln(`${fmt.dim('Use')} ${fmt.cyan('sql')} ${fmt.dim('to query — e.g.')} ${fmt.cyan("sql SELECT count(*) FROM records")}`);
}
