#!/usr/bin/env node
// rebuild-arena.mjs — regenerate the landing + play pages for a run that is
// ALREADY staged under os/public/arena/<run-id>/.
//
//   node bakeoff/rebuild-arena.mjs race-01
//
// The entries and their filmstrips are committed to the repo once a run has
// been published, so the pages around them can be rewritten from here without
// re-downloading a single CI artifact — and certainly without re-running any
// agents. Presentation is cheap to iterate; the run is not.
//
// It reads bakeoff/results/<run-id>/results.json for the scorecards and judge
// panel, and rewrites only index.html and play/**. Entry directories are never
// touched.

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { landingHtml, playHtml } from './arena.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const runId = process.argv[2];
if (!runId) { console.error('usage: rebuild-arena.mjs <run-id>'); process.exit(2); }

const pub = join(REPO, 'os/public/arena', runId);
if (!existsSync(join(pub, 'entries'))) {
  console.error(`no staged entries at ${pub}/entries — publish the run first`);
  process.exit(2);
}

const resultsPath = join(HERE, 'results', runId, 'results.json');
if (!existsSync(resultsPath)) {
  console.error(`no ${resultsPath} — fetch it from the bakeoff/${runId} branch`);
  process.exit(2);
}
const results = JSON.parse(readFileSync(resultsPath, 'utf8'));

// Only build pages for entries that are actually on disk: a scorecard without
// a staged entry would produce a play page framing a 404.
const staged = new Set(
  readdirSync(join(pub, 'entries')).filter((d) => existsSync(join(pub, 'entries', d, 'index.html')))
);
const entries = results.entries.filter((e) => staged.has(e.cell));
const dropped = results.entries.filter((e) => !staged.has(e.cell));
for (const d of dropped) console.log(`  skipping ${d.cell} — no index.html staged`);

if (!entries.length) { console.error('nothing to build'); process.exit(2); }

// Filmstrip frames, read from what is actually staged rather than trusting the
// record — a run published before capture existed would otherwise 404.
for (const e of entries) {
  const capDir = join(pub, 'entries', e.cell, 'capture');
  e.frames = existsSync(capDir)
    ? readdirSync(capDir).filter((f) => f.endsWith('.png')).sort()
    : [];
}

const ctx = { runId, brief: results.brief, entries, judges: results.judges };

// Landing page, ordered the same way the cards are.
writeFileSync(join(pub, 'index.html'), landingHtml(ctx));
console.log(`wrote ${join(pub, 'index.html')}`);

// Play pages, in the landing page's order so prev/next matches what you saw.
const ordered = [...entries].sort((a, b) => {
  const score = (cell) => {
    const rs = (results.judges?.reviews || []).filter((r) => r.cell === cell && r.ok);
    const h = rs.map((r) => r.ok.rank_hint).filter((n) => typeof n === 'number');
    return h.length ? h.reduce((x, y) => x + y, 0) / h.length : -1;
  };
  const d = score(b.cell) - score(a.cell);
  return d !== 0 ? d : a.cell.localeCompare(b.cell);
});

const playRoot = join(pub, 'play');
if (existsSync(playRoot)) rmSync(playRoot, { recursive: true, force: true });
ordered.forEach((entry, i) => {
  const dir = join(playRoot, entry.cell);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), playHtml({
    runId,
    brief: results.brief,
    entry,
    prev: i > 0 ? ordered[i - 1] : null,
    next: i < ordered.length - 1 ? ordered[i + 1] : null,
    index: i,
    total: ordered.length,
  }));
});
console.log(`wrote ${ordered.length} play pages under ${playRoot}`);

const bytes = (function du(p) {
  const s = statSync(p);
  if (!s.isDirectory()) return s.size;
  return readdirSync(p).reduce((a, f) => a + du(join(p, f)), 0);
})(pub);
console.log(`arena/${runId} is ${(bytes / 1e6).toFixed(1)} MB`);
