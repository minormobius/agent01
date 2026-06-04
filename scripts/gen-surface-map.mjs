#!/usr/bin/env node
// Regenerate the "Deploy surface map" table on the landing page (index.html)
// from deploy-registry.json — the single source of truth. Only mino.mobi /
// minomobi.com domains are listed (the public surfaces you'd QB). Worker-only
// endpoints (e.g. minomobi-cron, *-minomobi project names) and non-minomobi
// aliases (ai.ascential.work) are intentionally excluded.
//
// Rewrites only the rows between the SURFACE-MAP:BEGIN/END markers; the section
// scaffold + styles in index.html are left untouched.
//
// Usage:
//   node scripts/gen-surface-map.mjs          # dry run — print the rows + drift
//   node scripts/gen-surface-map.mjs --write   # apply to index.html

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

const reg = JSON.parse(readFileSync(join(ROOT, 'deploy-registry.json'), 'utf8'));
const isMino = (d) => /(^|\.)mino\.mobi$/.test(d) || /(^|\.)minomobi\.com$/.test(d);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const rows = [];
for (const s of reg.surfaces) {
  if (!s.endpoint) continue;
  const domains = s.endpoint.split(/[,/]/)
    .map((e) => e.replace(/\(.*?\)/g, '').trim())   // strip "(landing)", "(planned)"
    .filter((e) => e && isMino(e));
  if (!domains.length) continue;
  const extra = Array.isArray(s.dirs) ? s.dirs.length - 1 : 0;
  const src = (s.dir === '.' ? '/' : s.dir) + (extra > 0 ? ` (+${extra})` : '');
  for (const d of domains) {
    rows.push({ domain: d, surface: s.surface, kind: s.type || '', src });
  }
}
rows.sort((a, b) => a.domain.localeCompare(b.domain));

const indent = '      ';
const lines = rows.map((r) =>
  `${indent}<tr>` +
  `<td class="dom"><a href="https://${esc(r.domain)}">${esc(r.domain)}</a></td>` +
  `<td class="surf"><code>${esc(r.surface)}</code></td>` +
  `<td class="kind">${esc(r.kind)}</td>` +
  `<td class="src"><code>${esc(r.src)}</code></td>` +
  `</tr>`,
);
const block = lines.join('\n');

const file = join(ROOT, 'index.html');
const html = readFileSync(file, 'utf8');
const re = /(<!-- SURFACE-MAP:BEGIN[^>]*-->)[\s\S]*?(<!-- SURFACE-MAP:END -->)/;
if (!re.test(html)) {
  console.error('! SURFACE-MAP markers not found in index.html — add the scaffold first.');
  process.exit(1);
}

const out = html.replace(re, `$1\n${block}\n      $2`);
console.log(`${rows.length} minomobi-domain rows:\n`);
for (const r of rows) console.log(`  ${r.domain.padEnd(24)} -> ${r.surface}`);

if (out === html) {
  console.log('\n✓ table already in sync');
} else if (write) {
  writeFileSync(file, out);
  console.log('\n✓ index.html surface-map table rewritten');
} else {
  console.log('\n(dry run — re-run with --write to apply)');
}
