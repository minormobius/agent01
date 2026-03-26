// container — connect to a remote container shell with bash + claude-code
// Usage: container [--api-key=<key>]

export default async function container(args, flags, ctx) {
  const { terminal, fmt, shell } = ctx;

  if (!shell.onConnectContainer) {
    terminal.writeln(fmt.red('container shell not available'));
    terminal.writeln(fmt.dim('(API endpoint not configured)'));
    return;
  }

  // API key can be passed as flag or will be prompted
  let apiKey = flags['api-key'] || flags.k || null;

  if (!apiKey) {
    // Check localStorage for saved key
    apiKey = localStorage.getItem('os:anthropic-key');
  }

  if (!apiKey) {
    terminal.writeln(fmt.yellow('Anthropic API key required for Claude Code'));
    terminal.writeln(fmt.dim('Get one at console.anthropic.com'));
    terminal.writeln('');
    terminal.writeln(fmt.dim('Usage: container --api-key=sk-ant-...'));
    terminal.writeln(fmt.dim('  or:  set-key sk-ant-...'));
    return;
  }

  // Save key for future use
  localStorage.setItem('os:anthropic-key', apiKey);

  terminal.writeln(fmt.dim('launching container shell...'));
  terminal.writeln(fmt.dim('(cold start may take 2-3s)'));

  shell.onConnectContainer(apiKey);
}
