#!/usr/bin/env node
// Regenerate the "Deploy surface map" table on the landing page (index.html)
// from deploy-registry.json — the single source of truth.
//
// Reports EVERY endpoint around each surface, not just public domains:
//   - Exposes : the surface's endpoint(s) — mino.mobi domains AND worker/project
//               names (auto, cards, minomobi-cron, …).
//   - Feeds in: the shared backends + D1 databases it `uses` (atpolls-db,
//               auth.mino.mobi, feed.mino.mobi, scores.mino.mobi, …).
//   - Provides: what it provides to other surfaces.
// Tokens containing a dot are rendered as reachable-domain links; the rest
// (workers, D1 databases) are plain code. A footnote lists the unmanaged sites.
//
// Rewrites only the rows between SURFACE-MAP:BEGIN/END and the text between
// SURFACE-MAP-UNMANAGED:BEGIN/END. The section scaffold + styles are untouched.
//
// Usage:
//   node scripts/gen-surface-map.mjs           # dry run
//   node scripts/gen-surface-map.mjs --write    # apply to index.html

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

const reg = JSON.parse(readFileSync(join(ROOT, 'deploy-registry.json'), 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const DASH = '<span class="sm-dash">&mdash;</span>';

// A token with a dot is a reachable host -> link it; otherwise it's a worker or
// a D1 database name -> plain code.
const tok = (t) => t.includes('.')
  ? `<a class="ep" href="https://${esc(t)}">${esc(t)}</a>`
  : `<code class="ep">${esc(t)}</code>`;
const list = (arr) => arr.length ? arr.map(tok).join(', ') : DASH;

// endpoint field may be "a.mino.mobi, b.mino.mobi" or "minomobi.com / mino.mobi (landing)"
const exposed = (s) => (s.endpoint || '').split(/[,/]/)
  .map((e) => e.replace(/\(.*?\)/g, '').trim())
  .filter(Boolean);

const surfaces = [...reg.surfaces].sort((a, b) => a.surface.localeCompare(b.surface));
const indent = '      ';
const rows = surfaces.map((s) =>
  `${indent}<tr>` +
  `<td class="surf"><code>${esc(s.surface)}</code></td>` +
  `<td class="kind">${esc(s.type || '')}</td>` +
  `<td class="eps">${list(exposed(s))}</td>` +
  `<td class="eps">${list(s.uses || [])}</td>` +
  `<td class="eps">${s.provides ? tok(s.provides) : DASH}</td>` +
  `</tr>`,
).join('\n');

// Unmanaged footnote (wrangler config, no surface yet)
const u = reg.unmanaged || {};
const code = (xs) => (xs || []).map((x) => `<code>${esc(x)}</code>`).join(', ');
let foot = `<b>Unmanaged</b> (wrangler config, no deploy surface yet): ${code(u.sites) || '—'}.`;
if (u.in_progress && u.in_progress.length) foot += ` In progress: ${code(u.in_progress)}.`;
foot += ' Each needs a workflow + registry entry, or a retire decision.';

const file = join(ROOT, 'index.html');
let html = readFileSync(file, 'utf8');
const before = html;

const reRows = /(<!-- SURFACE-MAP:BEGIN[^>]*-->)[\s\S]*?(<!-- SURFACE-MAP:END -->)/;
const reFoot = /(<!-- SURFACE-MAP-UNMANAGED:BEGIN[^>]*-->)[\s\S]*?(<!-- SURFACE-MAP-UNMANAGED:END -->)/;
if (!reRows.test(html) || !reFoot.test(html)) {
  console.error('! SURFACE-MAP markers not found in index.html — add the scaffold first.');
  process.exit(1);
}
html = html.replace(reRows, `$1\n${rows}\n      $2`);
html = html.replace(reFoot, `$1\n    ${foot}\n    $2`);

console.log(`${surfaces.length} surfaces reported (exposes / feeds-in / provides).`);
if (html === before) {
  console.log('✓ table already in sync');
} else if (write) {
  writeFileSync(file, html);
  console.log('✓ index.html surface-map table rewritten');
} else {
  console.log('(dry run — re-run with --write to apply)');
}
