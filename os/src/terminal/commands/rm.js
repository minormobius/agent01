// rm — delete a record
// rm app.bsky.feed.post/3k2yihz...
// rm 3k2yihz...  (uses current collection from cwd)

export default async function rm(args, flags, ctx) {
  const { fs, terminal, fmt } = ctx;
  const path = args[0];

  if (!path) {
    terminal.writeln(fmt.red('rm: missing record path'));
    return;
  }

  const force = flags.f || flags.force;

  if (!force) {
    // Show what we're about to delete
    try {
      const result = await fs.cat(path);
      terminal.writeln(fmt.yellow(`delete ${result.uri}?`));
      terminal.writeln(fmt.dim('use rm -f to skip confirmation, or re-run to confirm'));
      // TODO: interactive y/n prompt
      return;
    } catch (err) {
      terminal.writeln(fmt.red(`rm: ${err.message}`));
      return;
    }
  }

  try {
    await fs.rm(path);
    terminal.writeln(fmt.green('deleted'));
  } catch (err) {
    terminal.writeln(fmt.red(`rm: ${err.message}`));
  }
}
