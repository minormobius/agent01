#!/usr/bin/env node
// gen-surface-docs.mjs — give every deploy surface its own instruction file.
//
// THE POINT: root CLAUDE.md used to carry deep sections for 8 projects while
// 38 of 74 surfaces went unmentioned. That shape can't scale — a doc organised
// as "N projects in depth" covers a shrinking fraction as N grows, and it
// duplicated (and contradicted) the per-project files that already existed.
// So: root CLAUDE.md carries only what applies everywhere, and each surface
// carries its own <dir>/CLAUDE.md.
//
// This script SEEDS a doc for any surface that lacks one, from the prose
// already in deploy-registry.json (`note` + `status` — which is where that
// documentation had accumulated, up to 10 KB per surface, in single-line JSON
// strings). Once seeded, the file is HAND-OWNED: this script never rewrites an
// existing doc.
//
// With --write it also MOVES the prose: a seeded surface's registry `note` is
// replaced by a one-line blurb, so the prose has exactly one home. Surfaces
// whose doc was hand-written (poll, hoop, biome, rind, tide, iris) keep their
// registry note untouched, because their doc was not seeded from it.
//
// Usage:
//   node scripts/gen-surface-docs.mjs           # dry run — what would be seeded
//   node scripts/gen-surface-docs.mjs --check    # exit 1 if any surface lacks a doc
//   node scripts/gen-surface-docs.mjs --write    # seed docs + trim moved notes

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRegistry, loadLanding, loadCurated, surfaceResolver, describe } from './lib/landing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const check = process.argv.includes('--check');

const reg = loadRegistry(ROOT);
const landing = loadLanding(ROOT);
const curated = loadCurated(ROOT);
const resolver = surfaceResolver(reg);

const REGISTRY = join(ROOT, 'deploy-registry.json');

// Surfaces whose dir is the repo root would put a CLAUDE.md on top of the root
// one — they're documented by root CLAUDE.md itself.
const isRootDir = (s) => !s.dir || s.dir === '.';

function docPath(s) { return join(ROOT, s.dir, 'CLAUDE.md'); }

function seedFor(s) {
  const wf = `.github/workflows/deploy-${s.surface}.yml`;
  const hasWf = existsSync(join(ROOT, wf));
  const blurb = describe(s, { landing, resolver, curated, cap: 400 });
  const note = (s.note || '').trim();
  const status = (s.status || '').trim();
  const depth = s.dir.split('/').length;   // link back to repo root
  const up = '../'.repeat(depth);

  const rows = [
    ['Surface', `\`${s.surface}\``],
    ['Dir', `\`${s.dir}/\``],
    ['Endpoint', s.endpoint ? `\`${s.endpoint}\`` : '—'],
    ['Type', s.type || '—'],
    ['Owning branch', `\`${s.branch}\``],
    ['Deploy', hasWf ? `\`${wf}\`` : '— (no workflow — unwired)'],
    ['Uses', (s.uses || []).length ? (s.uses || []).map((u) => `\`${u}\``).join(', ') : '—'],
    ['Provides', s.provides ? `\`${s.provides}\`` : '—'],
  ].map(([k, v]) => `| ${k} | ${v} |`).join('\n');

  return `# ${s.surface}${s.endpoint ? ` — ${s.endpoint}` : ''}

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ${up}CLAUDE.md; the index of all surfaces is ${up}docs/SURFACES.md. -->

${blurb || '_No description yet — add one._'}

## Facts

| | |
|---|---|
${rows}

Machine-readable entry: [\`deploy-registry.json\`](${up}deploy-registry.json) → \`surfaces[]\` where \`surface == "${s.surface}"\`.
${note ? `\n## How it works\n\n${note}\n` : ''}${status ? `\n## Deploy status\n\n${status}\n` : ''}
## Deploying

Pushes to \`${s.branch}\` or \`main\` that touch this surface's paths trigger${hasWf ? ` [\`${wf}\`](${up}${wf})` : ' its deploy'}.
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't \`wrangler deploy\` locally**.
Read [\`docs/DEPLOYS.md\`](${up}docs/DEPLOYS.md) first, especially the golden rule:
the \`wrangler.jsonc\` \`name\` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
`;
}

// ------------------------------------------------------------------- run ----
const missing = [];
const seeded = [];
const kept = [];

for (const s of reg.surfaces) {
  if (isRootDir(s)) { kept.push(s.surface); continue; }
  if (!existsSync(join(ROOT, s.dir))) { kept.push(s.surface); continue; }
  if (existsSync(docPath(s))) { kept.push(s.surface); continue; }
  missing.push(s);
}

if (check) {
  if (!missing.length) {
    console.log(`✓ every surface has an instruction file (${kept.length} surfaces)`);
    process.exit(0);
  }
  console.error(`✗ ${missing.length} surface(s) have no <dir>/CLAUDE.md: ${missing.map((s) => s.surface).join(', ')}`);
  console.error('  run: node scripts/gen-surface-docs.mjs --write');
  process.exit(1);
}

if (write) {
  for (const s of missing) {
    writeFileSync(docPath(s), seedFor(s));
    seeded.push(s.surface);
  }
  // Move the prose: a seeded surface's note is now duplicated in its doc, so
  // the registry keeps only the blurb. Hand-written docs are left alone —
  // their note was never copied anywhere.
  if (seeded.length) {
    const seededSet = new Set(seeded);
    let trimmed = 0;
    for (const s of reg.surfaces) {
      if (!seededSet.has(s.surface)) continue;
      const full = (s.note || '').trim();
      if (full.length <= 400) continue;
      s.note = describe(s, { landing, resolver, curated, cap: 240 })
        || full.slice(0, 240);
      s.note += ` (full description: ${s.dir}/CLAUDE.md)`;
      trimmed++;
    }
    writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
    console.log(`✓ seeded ${seeded.length} instruction file(s); trimmed ${trimmed} registry note(s) whose prose moved into them`);
    for (const n of seeded) console.log(`    + ${reg.surfaces.find((x) => x.surface === n).dir}/CLAUDE.md`);
  } else {
    console.log('= nothing to seed — every surface already has an instruction file');
  }
} else {
  console.log(`${kept.length} surface(s) already documented, ${missing.length} would be seeded`);
  for (const s of missing) console.log(`    + ${s.dir}/CLAUDE.md`);
}
