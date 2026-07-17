// container — connect to your remote container shell (bash + git + agents)
// Usage: container [--model=<profile>] [--api-key=<key>]
//   container               → plain bash (run `agent kimi3` or `claude` inside)
//   container --model=kimi3 → boot straight into the Kimi agent (same as `kimi`)
//   --api-key / set-key     → only needed for the NATIVE claude profile; the
//                             kimi3 key lives on the worker, not in the browser.

export default async function container(args, flags, ctx) {
  const { terminal, fmt, shell } = ctx;

  if (!shell.onConnectContainer) {
    terminal.writeln(fmt.red('container shell not available'));
    terminal.writeln(fmt.dim('(API endpoint not configured — see os/RUNBOOK.md)'));
    return;
  }

  const boot = typeof flags.model === 'string' ? flags.model : null;

  // Anthropic key (optional): rides along for the native `claude` profile.
  let apiKey = flags['api-key'] || flags.k || null;
  if (apiKey && typeof apiKey === 'string') {
    localStorage.setItem('os:anthropic-key', apiKey);
  } else {
    apiKey = localStorage.getItem('os:anthropic-key');
  }

  terminal.writeln(fmt.dim(boot ? `launching ${boot} agent...` : 'launching container shell...'));
  terminal.writeln(fmt.dim('(cold start may take 2-3s)'));
  if (!apiKey && !boot) {
    terminal.writeln(fmt.dim("tip: `agent kimi3` inside needs no key; native `claude` needs set-key"));
  }

  shell.onConnectContainer({ apiKey: apiKey || undefined, boot: boot || undefined });
}
