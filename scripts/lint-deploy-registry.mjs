#!/usr/bin/env node
// Validates deploy-registry.json against the deploy invariant.
//
// INVARIANT: a surface maps to exactly ONE feature branch (a function
// surface -> branch). A branch MAY own many surfaces (one Claude consciously
// taking several). FORBIDDEN: a wildcard branch, or the same surface appearing
// twice. (One surface owned by two branches is impossible by construction here,
// since `branch` is a single field — the lint instead guards the things that
// CAN go wrong: wildcards, dup surfaces, missing workflows, dangling deps.)
//
// Exit non-zero on any error so CI fails. Warnings don't fail the build.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const reg = JSON.parse(readFileSync(join(root, 'deploy-registry.json'), 'utf8'));

const errors = [];
const warnings = [];
const surfaces = reg.surfaces ?? [];

// 1. surface names unique
const seen = new Map();
for (const s of surfaces) {
  if (seen.has(s.surface)) errors.push(`duplicate surface "${s.surface}"`);
  seen.set(s.surface, s);
}

// 2. every surface has exactly one non-wildcard branch
for (const s of surfaces) {
  if (typeof s.branch !== 'string' || !s.branch) {
    errors.push(`surface "${s.surface}" has no branch`);
  } else if (s.branch.includes('*')) {
    errors.push(`surface "${s.surface}" uses a WILDCARD branch "${s.branch}" — forbidden (any branch could deploy it)`);
  }
}

// 3. managed surfaces must have a real workflow file; flag the unwired ones
for (const s of surfaces) {
  const wf = join(root, '.github', 'workflows', `deploy-${s.surface}.yml`);
  if (!existsSync(wf)) {
    (s.status?.includes('needs-workflow') ? warnings : errors)
      .push(`surface "${s.surface}" has no workflow (.github/workflows/deploy-${s.surface}.yml)`);
  }
}

// 4. dependency edges resolve to a real provider (resource or providing surface)
const provided = new Set(surfaces.map(s => s.provides).filter(Boolean));
const knownResources = new Set(['atpolls-db', 'mino-auth-db', 'mino-scores-db', 'bounty-board']);
for (const s of surfaces) {
  for (const dep of s.uses ?? []) {
    if (!provided.has(dep) && !knownResources.has(dep)) {
      warnings.push(`surface "${s.surface}" depends on "${dep}" which nothing in the registry provides`);
    }
  }
}

// ---- report ----
const byBranch = new Map();
for (const s of surfaces) {
  if (!byBranch.has(s.branch)) byBranch.set(s.branch, []);
  byBranch.get(s.branch).push(s.surface);
}

console.log(`\ndeploy-registry: ${surfaces.length} managed surfaces across ${byBranch.size} branch(es)\n`);
console.log('Branch ownership (a branch owning >1 surface = deliberate co-ownership):');
for (const [branch, list] of [...byBranch].sort((a, b) => b[1].length - a[1].length)) {
  const tag = list.length > 1 ? `  [${list.length} surfaces — co-owned]` : '';
  console.log(`  ${branch}${tag}\n    ${list.sort().join(', ')}`);
}

console.log('\nShared backends (repointing these ripples to dependents):');
for (const s of surfaces.filter(s => s.provides && s.provides !== 'landing')) {
  const consumers = surfaces.filter(c => (c.uses ?? []).includes(s.provides)).map(c => c.surface);
  console.log(`  ${s.surface} (${s.provides})  <-  ${consumers.length ? consumers.join(', ') : '(no registry consumers)'}`);
}

if (reg.unmanaged) {
  const u = reg.unmanaged;
  const n = (u.sites?.length ?? 0) + (u.in_progress?.length ?? 0) + (u.reference_workers?.length ?? 0);
  console.log(`\nUnmanaged (wrangler config, no workflow — needs triage): ${n}`);
}

if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} warning(s):`);
  warnings.forEach(w => console.log(`  - ${w}`));
}
if (errors.length) {
  console.log(`\n✖ ${errors.length} error(s):`);
  errors.forEach(e => console.log(`  - ${e}`));
  process.exit(1);
}
console.log('\n✓ registry valid (invariant holds)\n');
