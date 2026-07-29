#!/usr/bin/env node
// ideas-fetch.mjs — one day of arXiv, filtered to what has never been seen.
//
//   node scripts/ideas-fetch.mjs                    # today (UTC), write the inbox
//   node scripts/ideas-fetch.mjs --date 2026-07-29
//   node scripts/ideas-fetch.mjs --out - --limit 5  # stdout, for a look around
//
// Stage 1 of 3 (fetch → concepts → gate). Retrieval only: no scoring, no model
// call, no judgement. It answers "what is new today that we have not already
// pitched", and nothing else.
//
// WHY THE WINDOW IS WIDE. arXiv announces once per weekday, and submission time
// and announcement time are not the same clock. Rather than model that, the
// window is generous (the target date ±1 day) and .github/ideas/seen.json makes
// the overlap free — a paper fetched twice is dropped the second time. Being
// early is then harmless and being late is impossible.
//
// arXiv asks for ~3s between API requests. That is respected, so a full run over
// ~28 categories takes about 90 seconds. Do not parallelise it.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDEAS = join(ROOT, '.github', 'ideas');
const API = 'https://export.arxiv.org/api/query';
const POLITE_MS = 3000;

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};

const date = arg('date', new Date().toISOString().slice(0, 10));
const outPath = arg('out', join(IDEAS, 'inbox.json'));
const limit = Number(arg('limit', 0)) || 0;
const catsPath = arg('categories', join(IDEAS, 'categories.json'));
const seenPath = arg('seen', join(IDEAS, 'seen.json'));

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`::error::--date must be YYYY-MM-DD, got "${date}"`);
  process.exit(1);
}

// --- the window ------------------------------------------------------------
const stamp = (d) => d.toISOString().slice(0, 10).replace(/-/g, '') + '0000';
const day = new Date(`${date}T00:00:00Z`);
const from = stamp(new Date(day.getTime() - 86400_000));
const to = stamp(new Date(day.getTime() + 86400_000));

// --- config ----------------------------------------------------------------
const cfg = JSON.parse(readFileSync(catsPath, 'utf8'));
const categories = cfg.groups.flatMap((g) => g.categories.map((c) => ({ cat: c, family: g.family })));
const maxPerCategory = cfg.maxPerCategory ?? 40;

const seen = existsSync(seenPath) ? JSON.parse(readFileSync(seenPath, 'utf8')) : { ids: {} };
const seenIds = new Set(Object.keys(seen.ids || {}));

// --- the Atom feed ---------------------------------------------------------
// A hand parser rather than a dependency: the repo has no build step and this
// script has to run on a bare `node` in CI. The feed is machine-generated and
// its shape is stable, so entry-splitting is safe here in a way it would not be
// for arbitrary XML.
const unescape = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function parseFeed(xml) {
  return xml.split('<entry>').slice(1).map((e) => {
    const tag = (t) => {
      const m = e.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));
      return m ? unescape(m[1].replace(/\s+/g, ' ').trim()) : '';
    };
    const id = (tag('id').match(/abs\/(.+)$/) || [, ''])[1];
    return {
      id: id.replace(/v\d+$/, ''),
      version: id,
      title: tag('title'),
      abstract: tag('summary'),
      published: tag('published'),
      authors: [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => unescape(m[1].trim())),
      primary: (e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/) || [, ''])[1],
      categories: [...e.matchAll(/<category[^>]*term="([^"]+)"/g)].map((m) => m[1]),
    };
  }).filter((p) => p.id);
}

async function fetchCategory(cat) {
  const q = `cat:${cat}+AND+submittedDate:%5B${from}+TO+${to}%5D`;
  const url = `${API}?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=${maxPerCategory}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      if (!xml.includes('<feed')) throw new Error('response is not an Atom feed');
      return parseFeed(xml);
    } catch (e) {
      if (attempt === 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
  return [];
}

// --- run -------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('ideas-fetch.mjs')) {
  const byId = new Map();
  const failures = [];
  let fetched = 0;
  let alreadySeen = 0;

  for (const { cat, family } of categories) {
    let papers;
    try {
      papers = await fetchCategory(cat);
    } catch (e) {
      failures.push({ cat, error: e.message });
      console.log(`  ${cat.padEnd(22)} FAILED — ${e.message}`);
      await new Promise((r) => setTimeout(r, POLITE_MS));
      continue;
    }
    fetched += papers.length;
    let fresh = 0;
    for (const p of papers) {
      if (seenIds.has(p.id)) { alreadySeen++; continue; }
      const existing = byId.get(p.id);
      if (existing) { existing.families.add(family); existing.viaCategories.push(cat); continue; }
      byId.set(p.id, { ...p, families: new Set([family]), viaCategories: [cat] });
      fresh++;
    }
    console.log(`  ${cat.padEnd(22)} ${String(papers.length).padStart(3)} papers, ${fresh} new`);
    await new Promise((r) => setTimeout(r, POLITE_MS));
  }

  let papers = [...byId.values()].map((p) => ({ ...p, families: [...p.families] }));
  papers.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
  if (limit) papers = papers.slice(0, limit);

  const inbox = {
    date,
    window: { from, to },
    generatedAt: new Date().toISOString(),
    counts: {
      categories: categories.length,
      fetched,
      unique: papers.length,
      alreadySeen,
      failedCategories: failures.length,
    },
    failures,
    papers,
  };

  // A partial fetch is usable but must not look complete: the concept agent and
  // the daily report both read counts.failedCategories.
  if (failures.length) console.log(`::warning::${failures.length} categor(ies) failed — inbox is partial`);

  if (outPath === '-') {
    console.log(JSON.stringify(inbox, null, 2));
  } else {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(inbox, null, 2) + '\n');
    console.log(`\n✓ ${papers.length} unseen papers from ${categories.length} categories → ${outPath}`);
    console.log(`  (${fetched} fetched, ${alreadySeen} already pitched or considered)`);
  }
}
