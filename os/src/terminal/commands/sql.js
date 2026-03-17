// sql — run SQL queries against your synced PDS data
// sql SELECT count(*) FROM records
// sql SELECT collection, count(*) as n FROM records GROUP BY collection ORDER BY n DESC
// sql SELECT rkey, json_extract_string(value, '$.text') as text FROM records WHERE collection = 'app.bsky.feed.post' LIMIT 10
// sql .tables    → show available tables
// sql .schema    → show records table schema

import { query, isReady, tableExists } from '../../lib/duckdb.js';

export default async function sql(args, flags, ctx) {
  const { terminal, fmt } = ctx;

  if (!await isReady()) {
    terminal.writeln(fmt.red('DuckDB not initialized — run sync first'));
    return;
  }

  const input = args.join(' ').trim();

  if (!input) {
    terminal.writeln(fmt.dim('usage: sql <query>'));
    terminal.writeln(fmt.dim(''));
    terminal.writeln(fmt.dim('examples:'));
    terminal.writeln(fmt.cyan('  sql SELECT count(*) as n FROM records'));
    terminal.writeln(fmt.cyan('  sql SELECT collection, count(*) as n FROM record_index GROUP BY collection ORDER BY n DESC'));
    terminal.writeln(fmt.cyan("  sql SELECT text, created_at FROM record_index WHERE collection = 'app.bsky.feed.post' ORDER BY created_at DESC LIMIT 10"));
    terminal.writeln(fmt.cyan('  sql .tables'));
    terminal.writeln(fmt.cyan('  sql .schema'));
    return;
  }

  // Meta-commands
  if (input === '.tables') {
    try {
      const rows = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'");
      for (const row of rows) {
        terminal.writeln(fmt.cyan(String(row.table_name)));
      }
    } catch (err) {
      terminal.writeln(fmt.red(err.message));
    }
    return;
  }

  if (input === '.schema') {
    if (!await tableExists()) {
      terminal.writeln(fmt.red('no records table — run sync first'));
      return;
    }
    try {
      const rows = await query("DESCRIBE records");
      terminal.writeln(fmt.bold('records'));
      terminal.writeln(fmt.dim('─'.repeat(60)));
      for (const row of rows) {
        terminal.writeln(`  ${fmt.cyan(String(row.column_name).padEnd(20))} ${fmt.dim(String(row.column_type))}`);
      }
    } catch (err) {
      terminal.writeln(fmt.red(err.message));
    }
    return;
  }

  // Run SQL
  const start = Date.now();
  try {
    const rows = await query(input);
    const elapsed = Date.now() - start;

    if (rows.length === 0) {
      terminal.writeln(fmt.dim('(empty result)'));
      return;
    }

    // Render as table
    const columns = Object.keys(rows[0]);
    const widths = columns.map(c => Math.max(c.length, 4));

    // Calculate column widths from data
    for (const row of rows.slice(0, 100)) {
      for (let i = 0; i < columns.length; i++) {
        const val = formatCell(row[columns[i]]);
        widths[i] = Math.min(Math.max(widths[i], val.length), 60);
      }
    }

    // Header
    const header = columns.map((c, i) => c.padEnd(widths[i])).join('  ');
    terminal.writeln(fmt.bold(header));
    terminal.writeln(fmt.dim(widths.map(w => '─'.repeat(w)).join('──')));

    // Rows
    const maxRows = 200;
    const showRows = rows.slice(0, maxRows);
    for (const row of showRows) {
      const line = columns.map((c, i) => {
        const val = formatCell(row[c]);
        return val.padEnd(widths[i]).slice(0, widths[i]);
      }).join('  ');
      terminal.writeln(line);
    }

    if (rows.length > maxRows) {
      terminal.writeln(fmt.dim(`  ... ${rows.length - maxRows} more rows`));
    }

    terminal.writeln(fmt.dim(`\n${rows.length} row${rows.length === 1 ? '' : 's'} (${elapsed}ms)`));

  } catch (err) {
    terminal.writeln(fmt.red(`SQL error: ${err.message}`));
  }
}

function formatCell(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 60);
  return String(val);
}
