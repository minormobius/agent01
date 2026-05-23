#!/usr/bin/env node
// Generates the site catalogue embedded in functions/search.js from the
// landing page's PROJECTS array (`var P`) + the curated <li> descriptions.
// Run after editing index.html's project list so the search bot stays in sync:
//   node scripts/generate-search-catalog.mjs
//
// Rewrites only the region between /*CATALOG_START*/ and /*CATALOG_END*/.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

// 1. Parse the PROJECTS array entries: { n:'..', u:'..', c:'..', k:N, a:'..', p:'..' }
const entries = [...html.matchAll(/\{\s*n:'([^']+)',\s*u:'([^']+)',\s*c:'([^']+)'[^}]*?(?:p:'([^']+)')?\s*\}/g)]
  .map(m => ({ name: m[1], url: m[2], category: m[3], parent: m[4] || null }));

// 2. Parse the curated <li> blocks: name-row anchor + tags + desc.
const descMap = new Map();
for (const m of html.matchAll(/<li>\s*<div class="name-row">([\s\S]*?)<\/div>\s*<div class="desc">([\s\S]*?)<\/div>\s*<\/li>/g)) {
  const href = (m[1].match(/href="([^"]+)"/) || [])[1];
  if (!href) continue;
  const tags = [...m[1].matchAll(/<span class="tag">([^<]+)<\/span>/g)].map(t => t[1]);
  const desc = decode(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  descMap.set(href, { tags, desc });
}

function decode(s) {
  return s
    .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/<sub>|<\/sub>|<sup>|<\/sup>/g, '');
}

// 3. Merge, dedupe by url, build catalogue lines.
const seen = new Set();
const lines = [];
for (const e of entries) {
  if (seen.has(e.url)) continue;
  seen.add(e.url);
  const meta = descMap.get(e.url);
  let line = `- ${e.name} [${e.category}] ${e.url}`;
  if (e.parent) line += ` (part of ${e.parent})`;
  if (meta && meta.desc) line += ` — ${meta.desc}`;
  if (meta && meta.tags.length) line += ` {${meta.tags.join(', ')}}`;
  lines.push(line);
}

// Also include any described sites that weren't in the PROJECTS array.
for (const [url, meta] of descMap) {
  if (seen.has(url)) continue;
  seen.add(url);
  const name = (url.match(/\/\/([^.]+)\.mino|mobi\/([^/]+)/) || [])[1] || url;
  lines.push(`- ${name} ${url} — ${meta.desc} {${meta.tags.join(', ')}}`);
}

const catalogText = lines.join('\n');
const approxTokens = Math.round(catalogText.length / 4);

// 4. Inject into functions/search.js between markers.
const fnPath = join(root, 'functions', 'search.js');
const src = readFileSync(fnPath, 'utf8');
const block = '/*CATALOG_START*/\nconst CATALOG = ' + JSON.stringify(catalogText) + ';\n/*CATALOG_END*/';
const out = src.replace(/\/\*CATALOG_START\*\/[\s\S]*?\/\*CATALOG_END\*\//, block);
writeFileSync(fnPath, out);

console.log(`Catalogue: ${lines.length} sites, ${catalogText.length} chars (~${approxTokens} tokens).`);
console.log(`Wrote into ${fnPath}`);
