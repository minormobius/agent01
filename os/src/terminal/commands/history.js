// history — show command history or repo commit history
// history           → command history
// history --repo    → repo commit log (latest commit)

export default async function history(args, flags, ctx) {
  const { shell, xrpc, session, terminal, fmt } = ctx;

  if (flags.repo) {
    try {
      const status = await xrpc.call('com.atproto.sync.getRepoStatus', {
        did: session.did
      });
      terminal.writeln(fmt.bold('Repo Status'));
      terminal.writeln(fmt.dim('─'.repeat(40)));
      terminal.writeln(`${fmt.dim('DID:')}    ${status.did}`);
      terminal.writeln(`${fmt.dim('Active:')} ${status.active ? fmt.green('yes') : fmt.red('no')}`);
      if (status.rev) terminal.writeln(`${fmt.dim('Rev:')}    ${status.rev}`);
      if (status.status) terminal.writeln(`${fmt.dim('Status:')} ${status.status}`);
    } catch (err) {
      terminal.writeln(fmt.red(`history: ${err.message}`));
    }
    return;
  }

  // Command history
  const cmds = shell.commandHistory;
  if (cmds.length === 0) {
    terminal.writeln(fmt.dim('no command history'));
    return;
  }

  const start = Math.max(0, cmds.length - 50);
  for (let i = start; i < cmds.length; i++) {
    terminal.writeln(`${fmt.dim(String(i + 1).padStart(4))}  ${cmds[i]}`);
  }
}
