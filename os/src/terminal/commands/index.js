// index — rebuild or inspect the record_index table
// index            → rebuild index from records table
// index --info     → show index stats and column list

import { buildIndex, query, tableExists, isReady } from '../../lib/duckdb.js';

export default async function index(args, flags, ctx) {
  const { terminal, fmt } = ctx;

  if (!await isReady()) {
    terminal.writeln(fmt.red('DuckDB not initialized — run sync first'));
    return;
  }

  if (!await tableExists()) {
    terminal.writeln(fmt.red('no records table — run sync first'));
    return;
  }

  if (flags.info) {
    try {
      const cols = await query('DESCRIBE record_index');
      terminal.writeln(fmt.bold('record_index'));
      terminal.writeln(fmt.dim('─'.repeat(60)));
      for (const row of cols) {
        terminal.writeln(`  ${fmt.cyan(String(row.column_name).padEnd(20))} ${fmt.dim(String(row.column_type))}`);
      }
      terminal.writeln('');

      const stats = await query(`
        SELECT
          count(*) as total,
          count(created_at) as with_date,
          count(text) as with_text,
          count(subject_uri) as with_subject,
          count(reply_root) as in_threads,
          count(CASE WHEN has_media THEN 1 END) as with_media
        FROM record_index
      `);
      if (stats.length > 0) {
        const s = stats[0];
        terminal.writeln(fmt.bold('Stats'));
        terminal.writeln(fmt.dim('─'.repeat(60)));
        terminal.writeln(`  ${fmt.dim('total records:'.padEnd(20))} ${fmt.cyan(String(s.total))}`);
        terminal.writeln(`  ${fmt.dim('with date:'.padEnd(20))} ${fmt.cyan(String(s.with_date))}`);
        terminal.writeln(`  ${fmt.dim('with text:'.padEnd(20))} ${fmt.cyan(String(s.with_text))}`);
        terminal.writeln(`  ${fmt.dim('with subject:'.padEnd(20))} ${fmt.cyan(String(s.with_subject))}`);
        terminal.writeln(`  ${fmt.dim('in threads:'.padEnd(20))} ${fmt.cyan(String(s.in_threads))}`);
        terminal.writeln(`  ${fmt.dim('with media:'.padEnd(20))} ${fmt.cyan(String(s.with_media))}`);
      }
    } catch (err) {
      terminal.writeln(fmt.red(`index not built yet — run ${fmt.cyan('index')} to create`));
    }
    return;
  }

  // Rebuild
  terminal.write(fmt.dim('rebuilding index... '));
  const start = Date.now();
  try {
    const count = await buildIndex();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    terminal.writeln(`${fmt.green('done')} ${fmt.cyan(String(count) + ' records')} in ${elapsed}s`);
    terminal.writeln('');
    terminal.writeln(fmt.dim('Queryable columns:'));
    terminal.writeln(`  ${fmt.cyan('collection, rkey, uri, cid, size_bytes, created_at,')}`);
    terminal.writeln(`  ${fmt.cyan('text, subject_uri, subject_cid, reply_root, reply_parent,')}`);
    terminal.writeln(`  ${fmt.cyan('has_media, embed_type, display_name, description, name')}`);
    terminal.writeln('');
    terminal.writeln(`${fmt.dim('Try:')} ${fmt.cyan("sql SELECT text, created_at FROM record_index WHERE collection='app.bsky.feed.post' ORDER BY created_at DESC LIMIT 5")}`);
  } catch (err) {
    terminal.writeln(fmt.red(`index failed: ${err.message}`));
  }
}
