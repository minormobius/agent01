// echo — create a record
// echo '{"$type":"app.bsky.feed.post","text":"hello","createdAt":"..."}' > app.bsky.feed.post
// echo '{"text":"update"}' > app.bsky.feed.post/3k2yihz  (putRecord if rkey given)

export default async function echo(args, flags, ctx) {
  const { fs, terminal, fmt } = ctx;

  // Find the > redirect
  const redirectIdx = args.indexOf('>');
  if (redirectIdx === -1) {
    terminal.writeln(fmt.red('echo: usage: echo \'{"json":"data"}\' > collection[/rkey]'));
    return;
  }

  const jsonStr = args.slice(0, redirectIdx).join(' ');
  const target = args[redirectIdx + 1];

  if (!target) {
    terminal.writeln(fmt.red('echo: missing target path'));
    return;
  }

  let value;
  try {
    value = JSON.parse(jsonStr);
  } catch {
    terminal.writeln(fmt.red('echo: invalid JSON'));
    return;
  }

  try {
    const result = await fs.write(target, value);
    terminal.writeln(fmt.green('created') + ' ' + fmt.dim(result.uri));
    if (result.cid) terminal.writeln(fmt.dim(`cid: ${result.cid}`));
  } catch (err) {
    terminal.writeln(fmt.red(`echo: ${err.message}`));
  }
}
