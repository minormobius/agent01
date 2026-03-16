// set-key — save Anthropic API key for container shell
// Usage: set-key sk-ant-...

export default async function setkey(args, flags, ctx) {
  const { terminal, fmt } = ctx;

  const key = args[0];
  if (!key) {
    const existing = localStorage.getItem('os:anthropic-key');
    if (existing) {
      terminal.writeln(`${fmt.dim('key set:')} ${existing.slice(0, 12)}...`);
    } else {
      terminal.writeln(fmt.dim('no key set'));
    }
    terminal.writeln('');
    terminal.writeln(fmt.dim('Usage: set-key sk-ant-api03-...'));
    return;
  }

  localStorage.setItem('os:anthropic-key', key);
  terminal.writeln(`${fmt.green('saved')} ${fmt.dim('(stored in localStorage)')}`);
}
