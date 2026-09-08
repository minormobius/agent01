#!/usr/bin/env node
// Generates the site catalogue embedded in functions/search.js — what the
// landing's ask panel hands the model on every question.
//
// Source: rethink/data.js (built by scripts/build-rethink.mjs from
// catalogue.json + the content pass + the git stats + the last probe). Every
// listed page gets a line, not just the ones the landing's curated <li> list
// describes: the prose is the catalogue's where it has one, the deploy
// registry's where it does not. Pages the last probe found dead are left out,
// so the guide never sends a visitor somewhere that 404s.
//
//   node scripts/generate-search-catalog.mjs           # rewrite the CATALOG region
//   node scripts/generate-search-catalog.mjs --check   # exit 1 if out of date
//
// Rewrites only the region between /*CATALOG_START*/ and /*CATALOG_END*/.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const w = {};
new Function('window', readFileSync(join(root, 'rethink/data.js'), 'utf8'))(w);
const R = w.RETHINK;

const rows = Object.fromEntries(R.rows.map((r) => [r.id, r]));
const tops = Object.fromEntries(R.top.map((t) => [t.id, t]));
const url = (m) => (rows[m.id] ? rows[m.id].u : 'https://' + m.id + '/');
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const lines = [];
const seen = new Set();
// hubs first, so the model can answer "what is X" for a whole pack
for (const t of R.top) {
  if (t.id === 'sites' || !t.u) continue;
  const door = R.members.find((m) => m.id === t.u);
  const prose = clean(t.blurb || (door && door.d) || '');
  const pages = R.members.filter((m) => m.top === t.id && m.depth === 1 && m.id !== t.u && m.action !== 'merge' && m.action !== 'retire' && !m.dead).map((m) => m.n);
  let line = `- ${t.label} [hub · ${t.kind}${t.pinned ? ' · pinned' : ''}] https://${t.u}/`;
  if (prose) line += ` — ${prose}`;
  if (pages.length) line += ` {pages: ${pages.join(', ')}}`;
  lines.push(line);
  seen.add('https://' + t.u + '/');
}
for (const m of R.members) {
  if (m.action === 'merge' || m.action === 'retire' || m.dead) continue;
  const u = url(m);
  if (seen.has(u)) continue;
  seen.add(u);
  const hub = m.top !== 'sites' ? tops[m.top] : null;
  const prose = clean(m.d);
  let line = `- ${m.label || m.n} [${m.kind}${m.domain && m.domain !== m.kind ? ' · ' + m.domain : ''}] ${u}`;
  if (hub) line += ` (in ${hub.label})`;
  else if (m.parent && m.parent !== 'sites') line += ` (in ${m.parent.split('/').pop()})`;
  if (prose) line += ` — ${prose}`;
  if (m.tech && m.tech.length) line += ` {${m.tech.join(', ')}}`;
  lines.push(line);
}

const catalogText = lines.join('\n');
const approxTokens = Math.round(catalogText.length / 4);

const fnPath = join(root, 'functions', 'search.js');
const src = readFileSync(fnPath, 'utf8');
const block = '/*CATALOG_START*/\nconst CATALOG = ' + JSON.stringify(catalogText) + ';\n/*CATALOG_END*/';
const out = src.replace(/\/\*CATALOG_START\*\/[\s\S]*?\/\*CATALOG_END\*\//, block);

if (process.argv.includes('--check')) {
  if (out === src) { console.log(`✓ functions/search.js catalogue in sync (${lines.length} lines)`); process.exit(0); }
  console.error('✗ functions/search.js catalogue is out of date — run: node scripts/generate-search-catalog.mjs');
  process.exit(1);
}

writeFileSync(fnPath, out);
console.log(`Catalogue: ${lines.length} lines (${R.top.length - 1} hubs), ${catalogText.length} chars (~${approxTokens} tokens).`);
console.log(`Wrote into ${fnPath}`);
