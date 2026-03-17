// du — disk usage / repo statistics
// du              → summary of repo
// du -v           → verbose, show per-collection counts

export default async function du(args, flags, ctx) {
  const { fs, xrpc, session, terminal, fmt, signal } = ctx;
  const verbose = flags.v || flags.verbose;

  terminal.writeln(fmt.bold('Repo Statistics'));
  terminal.writeln(fmt.dim('─'.repeat(50)));

  // Describe repo
  const desc = await fs.describeRepo();
  terminal.writeln(`${fmt.dim('DID:')}         ${session.did}`);
  terminal.writeln(`${fmt.dim('Handle:')}      ${session.handle}`);
  terminal.writeln(`${fmt.dim('Collections:')} ${desc.collections?.length || 0}`);

  if (desc.didDoc?.service) {
    for (const svc of desc.didDoc.service) {
      terminal.writeln(`${fmt.dim('Service:')}     ${svc.id} → ${svc.serviceEndpoint}`);
    }
  }

  if (verbose && desc.collections) {
    terminal.writeln('');
    terminal.writeln(fmt.bold('Per-collection record counts:'));
    terminal.writeln(fmt.dim('─'.repeat(50)));

    let totalRecords = 0;
    for (const collection of desc.collections) {
      if (signal.aborted) break;
      let count = 0;
      for await (const _ of fs.ls(`/${collection}`)) {
        count++;
        if (signal.aborted) break;
        if (count % 500 === 0) {
          terminal.write(`\r  ${collection.padEnd(45)} ${fmt.formatCount(count)}...`);
          await new Promise(r => setTimeout(r, 0));
        }
      }
      terminal.write(`\r`);
      terminal.writeln(`  ${fmt.blue(collection.padEnd(45))} ${fmt.cyan(fmt.formatCount(count))}`);
      totalRecords += count;
    }

    terminal.writeln(fmt.dim('─'.repeat(50)));
    terminal.writeln(`  ${'Total'.padEnd(45)} ${fmt.bold(fmt.formatCount(totalRecords))}`);
  }
}
