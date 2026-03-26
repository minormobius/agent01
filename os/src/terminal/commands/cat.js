// cat — read and display a record
// cat 3k2yihz...          → show record by rkey (in current collection)
// cat app.bsky.feed.post/3k2yihz...  → full path
// cat --raw 3k2yihz...    → raw JSON without colorization

export default async function cat(args, flags, ctx) {
  const { fs, terminal, fmt } = ctx;
  const path = args[0];
  if (!path) {
    terminal.writeln(fmt.red('cat: missing record path'));
    return;
  }

  const raw = flags.raw || flags.r;

  try {
    const result = await fs.cat(path);

    // Show metadata
    terminal.writeln(fmt.dim(`uri: ${result.uri}`));
    if (result.cid) terminal.writeln(fmt.dim(`cid: ${result.cid}`));
    terminal.writeln('');

    // Show value
    if (raw) {
      terminal.writeln(JSON.stringify(result.value, null, 2));
    } else {
      terminal.writeln(fmt.colorizeJSON(result.value));
    }
  } catch (err) {
    terminal.writeln(fmt.red(`cat: ${err.message}`));
  }
}
