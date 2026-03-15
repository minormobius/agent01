// edit — edit a record in-line
// edit app.bsky.feed.post/3k2yihz...
// Opens the record JSON for editing in a basic line editor.
// For now, fetches the record and lets you type replacement JSON.

export default async function edit(args, flags, ctx) {
  const { fs, terminal, fmt } = ctx;
  const path = args[0];

  if (!path) {
    terminal.writeln(fmt.red('edit: missing record path'));
    return;
  }

  try {
    const result = await fs.cat(path);
    terminal.writeln(fmt.dim('Current record:'));
    terminal.writeln(fmt.colorizeJSON(result.value));
    terminal.writeln('');
    terminal.writeln(fmt.yellow('edit: inline editing coming soon'));
    terminal.writeln(fmt.dim('For now, use: echo \'{"updated":"json"}\' > ' + path));
  } catch (err) {
    terminal.writeln(fmt.red(`edit: ${err.message}`));
  }
}
