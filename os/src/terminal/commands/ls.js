// ls — list collections or records
// ls              → list collections at root
// ls posts/       → list records in collection
// ls -l           → long format with record type
// ls | head 20    → first 20 entries
// ls | grep term  → filter entries

export default async function ls(args, flags, ctx) {
  const { fs, terminal, fmt, signal, pipeFilter } = ctx;
  const path = args[0] || '.';
  const long = flags.l || flags.long;

  let headLimit = Infinity;
  let grepPattern = null;

  // Parse pipe filter
  if (pipeFilter) {
    const parts = pipeFilter.trim().split(/\s+/);
    if (parts[0] === 'head') {
      headLimit = parseInt(parts[1]) || 20;
    } else if (parts[0] === 'tail') {
      // For tail, we collect all then show last N
      headLimit = -(parseInt(parts[1]) || 20);
    } else if (parts[0] === 'grep') {
      grepPattern = parts.slice(1).join(' ');
    } else if (parts[0] === 'wc') {
      // Count mode
      headLimit = -Infinity;
    }
  }

  let count = 0;
  let displayed = 0;
  const tailBuffer = [];
  const isTail = headLimit < 0 && headLimit !== -Infinity;
  const isCount = headLimit === -Infinity;
  const limit = isTail ? Math.abs(headLimit) : headLimit;

  for await (const entry of fs.ls(path)) {
    if (signal.aborted) break;
    count++;

    const line = long ? formatLong(entry, fmt) : fmt.formatLsEntry(entry);

    // Apply grep filter
    if (grepPattern) {
      const plain = stripAnsi(line);
      if (!plain.toLowerCase().includes(grepPattern.toLowerCase())) continue;
    }

    if (isCount) continue; // Just counting
    if (isTail) {
      tailBuffer.push(line);
      if (tailBuffer.length > limit) tailBuffer.shift();
      continue;
    }

    terminal.writeln(line);
    displayed++;
    if (displayed >= headLimit) {
      if (count > displayed) {
        terminal.writeln(fmt.dim(`  ... (Ctrl+C or pipe to see more)`));
      }
      break;
    }

    // Yield to event loop periodically for responsiveness
    if (count % 100 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  if (isTail) {
    for (const line of tailBuffer) terminal.writeln(line);
  }

  if (isCount) {
    terminal.writeln(String(count));
    return;
  }

  // Show count summary for large listings
  if (count > 50 && !isTail) {
    terminal.writeln(fmt.dim(`\n${fmt.formatCount(count)} entries`));
  }
}

function formatLong(entry, fmt) {
  if (entry.type === 'collection') {
    return `${fmt.blue('d')}  ${fmt.bold(entry.name)}/`;
  }
  const type = entry.value?.$type || '-';
  const size = JSON.stringify(entry.value || {}).length;
  return `${fmt.dim('r')}  ${fmt.cyan(entry.rkey.padEnd(24))}  ${fmt.dim(type.padEnd(40))}  ${fmt.formatBytes(size)}`;
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}
