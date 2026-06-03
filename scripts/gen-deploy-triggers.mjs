#!/usr/bin/env node
// Sync each deploy-<surface>.yml's `branches:` trigger to the owner declared in
// deploy-registry.json. The registry is the single source of truth for which
// branch deploys which surface; this rewrites the workflows to match — killing
// wildcards (`claude/*`), de-colliding shared branches, and ensuring `main` is
// always present.
//
// Only the `branches:` list is rewritten. `paths:`, `workflow_dispatch:`, and
// every build step are left untouched (they're project-specific and stable).
//
// Handles both declaration forms:
//   inline:  branches: [main, 'claude/foo']
//   block:   branches:
//              - main
//              - 'claude/foo'
//
// Usage:
//   node scripts/gen-deploy-triggers.mjs          # dry run — show the diff
//   node scripts/gen-deploy-triggers.mjs --write  # apply

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF = join(ROOT, '.github', 'workflows');
const write = process.argv.includes('--write');

const reg = JSON.parse(readFileSync(join(ROOT, 'deploy-registry.json'), 'utf8'));
const trunk = reg.trunk || 'main';

let changed = 0, skipped = 0, missing = 0;

for (const s of reg.surfaces) {
  const file = join(WF, `deploy-${s.surface}.yml`);
  if (!existsSync(file)) {
    if (!/needs-workflow/.test(s.status || '')) { console.log(`  ! ${s.surface}: no workflow file`); missing++; }
    continue;
  }
  if (!s.branch || s.branch.includes('*')) { console.log(`  ! ${s.surface}: bad registry branch "${s.branch}"`); continue; }

  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const want = `[${trunk}, '${s.branch}']`;

  // locate the first `branches:` line (inside on.push)
  const bi = lines.findIndex(l => /^\s*branches:/.test(l));
  if (bi === -1) { console.log(`  ! ${s.surface}: no branches: line`); continue; }
  const indent = lines[bi].match(/^(\s*)/)[1];

  let oldRepr, newLines;
  if (/branches:\s*\[/.test(lines[bi])) {
    // inline form — replace the bracket list on this line
    oldRepr = lines[bi].replace(/^\s*branches:\s*/, '');
    newLines = lines.slice();
    newLines[bi] = `${indent}branches: ${want}`;
  } else {
    // block form — consume following `- item` lines
    let j = bi + 1;
    const items = [];
    while (j < lines.length && /^\s*-\s/.test(lines[j])) { items.push(lines[j].trim()); j++; }
    const itemIndent = (lines[bi + 1] && lines[bi + 1].match(/^(\s*)/)[1]) || indent + '  ';
    oldRepr = items.join(' ');
    newLines = lines.slice(0, bi + 1)
      .concat([`${itemIndent}- ${trunk}`, `${itemIndent}- '${s.branch}'`])
      .concat(lines.slice(j));
  }

  const out = newLines.join('\n');
  if (out === src) { skipped++; continue; }
  changed++;
  console.log(`  ~ ${s.surface}`);
  console.log(`      was: ${oldRepr}`);
  console.log(`      now: ${want}`);
  if (write) writeFileSync(file, out);
}

console.log(`\n${changed} workflow(s) ${write ? 'rewritten' : 'would change'}, ${skipped} already in sync` +
            (missing ? `, ${missing} missing a workflow` : ''));
if (!write && changed) console.log('(dry run — re-run with --write to apply)');
