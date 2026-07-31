#!/usr/bin/env node
// Sync each deploy-<surface>.yml's `branches:` trigger to the owner declared in
// deploy-registry.json. The registry is the single source of truth for which
// branch deploys which surface; this rewrites the workflows to match — killing
// wildcards (`claude/*`), de-colliding shared branches, and keeping `main` OUT
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
const check = process.argv.includes('--check');
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').map(s => s.trim())) : null;

const reg = JSON.parse(readFileSync(join(ROOT, 'deploy-registry.json'), 'utf8'));

let changed = 0, skipped = 0, missing = 0;

for (const s of reg.surfaces) {
  if (only && !only.has(s.surface)) continue;
  const file = join(WF, `deploy-${s.surface}.yml`);
  if (!existsSync(file)) {
    if (!/needs-workflow/.test(s.status || '')) { console.log(`  ! ${s.surface}: no workflow file`); missing++; }
    continue;
  }
  if (!s.branch || s.branch.includes('*')) { console.log(`  ! ${s.surface}: bad registry branch "${s.branch}"`); continue; }

  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  // MAIN IS NOT A DEPLOY TRIGGER. The trunk used to be in every list, and that
  // made merging to main a deploy event for every surface the merge touched —
  // which is fine only while main holds everything those surfaces serve.
  //
  // It does not. lab/www/ is the proof: the tenant sites live on the surface's
  // owning branch, claude/lab-www, and main has none of them. Workers Static
  // Assets replaces the whole manifest on deploy, so merging a feature branch to
  // main and firing deploy-lab from there would have published a lab/www/ with
  // two of the four live sites missing. Both would have 404'd, from a green run.
  //
  // The registry already says each surface has ONE owning branch. This makes the
  // workflow agree with it, so a merge to main is an integration event and
  // nothing else — which is the only way a merge-master workflow is safe.
  //
  // THE COST, PLAINLY: a fix merged to main does NOT deploy. Push it to the
  // surface's owning branch, which is what deploys it. `trunk` stays in the
  // registry because other things read it; it is simply not a deploy trigger.
  const want = `['${s.branch}']`;

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
    // Same rule as the inline form above — the owning branch, and NOT the trunk.
    // This half was missed when main stopped being a deploy trigger, so every
    // workflow that happened to use the block form kept `- main` and went on
    // deploying from a merge: rant, board, games, bisk, io and poll were all
    // still live on a push to main, which is exactly what the inline branch was
    // changed to prevent. Two spellings of one list must not mean two policies.
    newLines = lines.slice(0, bi + 1)
      .concat([`${itemIndent}- '${s.branch}'`])
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

if (check) {
  if (!changed) { console.log(`✓ workflow triggers in sync (${skipped} workflows)`); process.exit(0); }
  console.error(`✗ ${changed} workflow trigger(s) drifted from the registry — run: node scripts/gen-deploy-triggers.mjs --write`);
  process.exit(1);
}

console.log(`\n${changed} workflow(s) ${write ? 'rewritten' : 'would change'}, ${skipped} already in sync` +
            (missing ? `, ${missing} missing a workflow` : ''));
if (!write && changed) console.log('(dry run — re-run with --write to apply)');
