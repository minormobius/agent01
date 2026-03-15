// find — search across all collections
// find                      → walk everything, show counts per collection
// find -name "*.post"       → filter by collection name pattern
// find -text "search term"  → search record text fields
// find | wc                 → count total records

export default async function find(args, flags, ctx) {
  const { fs, terminal, fmt, signal, pipeFilter } = ctx;
  const namePattern = flags.name;
  const textSearch = flags.text || args[0];

  const isCount = pipeFilter?.trim() === 'wc';

  // Get all collections
  const collections = [];
  for await (const entry of fs.ls('/')) {
    if (signal.aborted) return;
    if (entry.type === 'collection') {
      if (namePattern && !entry.name.includes(namePattern)) continue;
      collections.push(entry.name);
    }
  }

  let totalRecords = 0;
  const stats = [];

  for (const collection of collections) {
    if (signal.aborted) break;
    let count = 0;
    let matches = 0;

    for await (const record of fs.ls(`/${collection}`)) {
      if (signal.aborted) break;
      count++;
      totalRecords++;

      if (textSearch) {
        const json = JSON.stringify(record.value || {}).toLowerCase();
        if (json.includes(textSearch.toLowerCase())) {
          matches++;
          if (!isCount) {
            terminal.writeln(
              `${fmt.blue(collection)}/${fmt.cyan(record.rkey)}  ${fmt.dim(getPreview(record.value, textSearch))}`
            );
          }
        }
      }

      // Periodic yield for responsiveness
      if (count % 200 === 0) {
        if (!isCount && !textSearch) {
          terminal.write(`\r${fmt.dim(`scanning ${collection}... ${count} records`)}`);
        }
        await new Promise(r => setTimeout(r, 0));
      }
    }

    stats.push({ collection, count, matches });

    if (!textSearch && !isCount) {
      terminal.writeln(`${fmt.blue(collection.padEnd(50))} ${fmt.cyan(fmt.formatCount(count))} records`);
    }
  }

  if (isCount) {
    terminal.writeln(String(textSearch ? stats.reduce((s, c) => s + c.matches, 0) : totalRecords));
  } else {
    terminal.writeln('');
    terminal.writeln(fmt.dim(`${fmt.formatCount(totalRecords)} total records across ${collections.length} collections`));
  }
}

function getPreview(val, highlight) {
  if (!val) return '';
  const text = val.text || val.title || val.name || val.description || '';
  if (!text) return '';
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) return text.slice(0, 60);
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + highlight.length + 20);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}
