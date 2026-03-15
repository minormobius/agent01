// help — show available commands

const COMMANDS = [
  ['ls [path]', 'List collections or records'],
  ['ls -l', 'Long format with types and sizes'],
  ['cd <collection>', 'Navigate into a collection'],
  ['cd ..', 'Go up to root'],
  ['pwd', 'Print current collection path'],
  ['cat <rkey>', 'Display a record as JSON'],
  ['cat --raw <rkey>', 'Display uncolored JSON'],
  ['echo \'{"json":"..."}\' > path', 'Create or update a record'],
  ['edit <rkey>', 'Edit a record (interactive)'],
  ['rm <rkey>', 'Delete a record'],
  ['rm -f <rkey>', 'Force delete without confirmation'],
  ['find', 'Walk all collections, show counts'],
  ['find -text "term"', 'Search records by text content'],
  ['du', 'Repo summary'],
  ['du -v', 'Verbose — per-collection counts'],
  ['whoami', 'Show session info'],
  ['blob ls', 'List all blobs'],
  ['blob get <cid>', 'Show blob info'],
  ['blob push', 'Upload a blob'],
  ['curl <nsid> [params]', 'Raw XRPC call'],
  ['curl -X POST <nsid> \'{"body":"..."}\'', 'POST XRPC call'],
  ['history', 'Command history'],
  ['history --repo', 'Repo commit status'],
  ['clear', 'Clear terminal'],
  ['logout', 'End session'],
];

const PIPES = [
  ['| head N', 'Show first N results'],
  ['| tail N', 'Show last N results'],
  ['| grep term', 'Filter results by text'],
  ['| wc', 'Count results'],
];

const SHORTCUTS = [
  ['Ctrl+C', 'Cancel running command'],
  ['Ctrl+L', 'Clear screen'],
  ['↑/↓', 'Command history'],
  ['Tab', 'Autocomplete'],
];

export default async function help(args, flags, ctx) {
  const { terminal, fmt } = ctx;

  terminal.writeln(fmt.bold('PDS Shell — Commands'));
  terminal.writeln(fmt.dim('═'.repeat(60)));

  for (const [cmd, desc] of COMMANDS) {
    terminal.writeln(`  ${fmt.cyan(cmd.padEnd(38))} ${fmt.dim(desc)}`);
  }

  terminal.writeln('');
  terminal.writeln(fmt.bold('Pipes'));
  terminal.writeln(fmt.dim('─'.repeat(60)));
  for (const [pipe, desc] of PIPES) {
    terminal.writeln(`  ${fmt.yellow(pipe.padEnd(38))} ${fmt.dim(desc)}`);
  }

  terminal.writeln('');
  terminal.writeln(fmt.bold('Shortcuts'));
  terminal.writeln(fmt.dim('─'.repeat(60)));
  for (const [key, desc] of SHORTCUTS) {
    terminal.writeln(`  ${fmt.magenta(key.padEnd(38))} ${fmt.dim(desc)}`);
  }
}
