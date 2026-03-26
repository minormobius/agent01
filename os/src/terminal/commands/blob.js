// blob — blob operations
// blob ls         → list blobs (via listBlobs)
// blob push       → upload a blob (from file input or URL)
// blob get <cid>  → download/display a blob

export default async function blob(args, flags, ctx) {
  const { xrpc, session, terminal, fmt, signal } = ctx;
  const subcmd = args[0];

  if (!subcmd || subcmd === 'help') {
    terminal.writeln('Usage:');
    terminal.writeln(`  ${fmt.cyan('blob ls')}         list all blobs`);
    terminal.writeln(`  ${fmt.cyan('blob get')} <cid>  show blob info`);
    terminal.writeln(`  ${fmt.cyan('blob push')}       upload a blob (opens file picker)`);
    return;
  }

  if (subcmd === 'ls') {
    let count = 0;
    try {
      let cursor;
      do {
        if (signal.aborted) break;
        const res = await xrpc.call('com.atproto.sync.listBlobs', {
          did: session.did,
          limit: 500,
          cursor
        });
        const cids = res.cids || [];
        for (const cid of cids) {
          terminal.writeln(fmt.cyan(cid));
          count++;
        }
        cursor = res.cursor;
        if (count % 500 === 0 && cursor) {
          terminal.write(fmt.dim(`  ${count} blobs...\r`));
          await new Promise(r => setTimeout(r, 0));
        }
      } while (cursor);
    } catch (err) {
      terminal.writeln(fmt.red(`blob ls: ${err.message}`));
      return;
    }
    terminal.writeln(fmt.dim(`\n${count} blobs`));
    return;
  }

  if (subcmd === 'get') {
    const cid = args[1];
    if (!cid) {
      terminal.writeln(fmt.red('blob get: missing CID'));
      return;
    }
    try {
      const data = await xrpc.call('com.atproto.sync.getBlob', {
        did: session.did,
        cid
      });
      const bytes = new Uint8Array(data);
      terminal.writeln(`${fmt.dim('CID:')} ${cid}`);
      terminal.writeln(`${fmt.dim('Size:')} ${fmt.formatBytes(bytes.length)}`);
    } catch (err) {
      terminal.writeln(fmt.red(`blob get: ${err.message}`));
    }
    return;
  }

  if (subcmd === 'push') {
    terminal.writeln(fmt.yellow('blob push: file picker coming soon'));
    terminal.writeln(fmt.dim('Will open a native file picker to select and upload blobs.'));
    return;
  }

  terminal.writeln(fmt.red(`blob: unknown subcommand: ${subcmd}`));
}
