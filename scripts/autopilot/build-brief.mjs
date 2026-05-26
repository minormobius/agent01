#!/usr/bin/env node
// Autopilot brief builder — a bisk offshoot.
//
// Regenerates the <!-- BRIEF_START -->...<!-- BRIEF_END --> region inside
// scripts/autopilot/build-prompt.md from two deterministic inputs:
//   1. the live catalog (index.html PROJECTS + top-level dirs) -> taken slugs
//      and per-category saturation, so the autopilot never rebuilds what exists.
//   2. bisk/data/latest.json -> the neighborhood's mood + distinctive words,
//      used as the day's inspiration spark.
//
// Same marker-rewrite pattern as scripts/generate-search-catalog.mjs; same
// cron-then-commit shape as scripts/build-bisk-digest.mjs. No dependencies.
//
//   node scripts/autopilot/build-brief.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const promptPath = join(root, 'scripts', 'autopilot', 'build-prompt.md');

// --- 1. Catalog: taken slugs + category saturation ------------------------
const html = readFileSync(join(root, 'index.html'), 'utf8');
const entries = [...html.matchAll(
  /\{\s*n:'([^']+)',\s*u:'([^']+)',\s*c:'([^']+)'/g,
)].map((m) => ({ name: m[1], url: m[2], category: m[3] }));

const catCounts = {};
for (const e of entries) catCounts[e.category] = (catCounts[e.category] || 0) + 1;
const saturation = Object.entries(catCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([c, n]) => `${c} ${n}`)
  .join(', ');

// Taken slugs = top-level dirs + project names (lowercased), deduped.
const dirs = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
  .map((d) => d.name);
const taken = [...new Set([...dirs, ...entries.map((e) => e.name.toLowerCase())])]
  .sort()
  .join(', ');

// --- 2. bisk spark --------------------------------------------------------
let spark = '_(bisk digest not found — relying on evergreen gaps)_';
const biskPath = join(root, 'bisk', 'data', 'latest.json');
if (existsSync(biskPath)) {
  const b = JSON.parse(readFileSync(biskPath, 'utf8'));
  const words = (b.weather?.distinctive || [])
    .slice(0, 12)
    .map((w) => w.word)
    .join(', ');
  const top = b.chickens?.[0];
  const topLine = top
    ? `"${(top.text || '').replace(/\s+/g, ' ').slice(0, 120)}" — @${top.handle}`
    : '(none)';
  const mood = b.weather?.label
    ? `${b.weather.label}${b.weather.glyph ? ' ' + b.weather.glyph : ''}${b.weather.mood ? ` (${b.weather.mood})` : ''}`
    : '(unknown)';
  spark = [
    `**Neighborhood spark** (bisk ${b.date}, ${b.memberCount} members / ${b.postCount} posts):`,
    `- Mood: ${mood}`,
    `- Distinctive words: ${words || '(none)'}`,
    `- Top post: ${topLine}`,
  ].join('\n');
}

// --- 3. Compose + rewrite the marked region ------------------------------
const today = new Date().toISOString().slice(0, 10);
const block = [
  `_Regenerated ${today} by build-brief.mjs — do not edit by hand._`,
  '',
  `**Already taken** (never reuse these slugs/sites): ${taken}`,
  '',
  `**Catalog saturation** (sites per category): ${saturation}.`,
  '',
  spark,
].join('\n');

const md = readFileSync(promptPath, 'utf8');
const re = /<!-- BRIEF_START -->[\s\S]*?<!-- BRIEF_END -->/;
if (!re.test(md)) {
  console.error('BRIEF markers not found in build-prompt.md');
  process.exit(1);
}
const next = md.replace(re, `<!-- BRIEF_START -->\n${block}\n<!-- BRIEF_END -->`);
writeFileSync(promptPath, next);
console.log(`Brief updated (${today}): ${entries.length} catalog entries, ${dirs.length} dirs.`);
