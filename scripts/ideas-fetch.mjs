#!/usr/bin/env node
// ideas-fetch.mjs — one day of arXiv, appended to the candidate pool.
//
//   node scripts/ideas-fetch.mjs                    # today (UTC), append to the pool
//   node scripts/ideas-fetch.mjs --date 2026-07-29
//   node scripts/ideas-fetch.mjs --out - --limit 5  # stdout, change nothing
//
// Stage 1 of 4 (pull → batch → concepts → gate). Retrieval only: no scoring, no
// model call, no judgement, no model credentials. It answers "what exists that we
// have never seen", and nothing else.
//
// IT APPENDS TO A POOL RATHER THAN WRITING A DAY-FILE, and that is the point of
// separating this from review. A day-file couples ideation to the calendar: a
// weekend produces nothing, and every paper the reviewer did not get to is lost
// at midnight. The pool has per-paper state instead — a paper is fetched, and
// later reviewed, and those are different facts. The reviewer works a backlog.
//
// TWO LEDGERS, DELIBERATELY:
//   seen.json    every id ever fetched. Permanent, compact, never pruned — it is
//                what stops a pruned paper being re-fetched forever.
//   pool.jsonl   the working corpus, with abstracts. Prunable once reviewed.
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
const outPath = arg('out', join(IDEAS, 'pool.jsonl'));
const limit = Number(arg('limit', 0)) || 0;
const catsPath = arg('categories', join(IDEAS, 'categories.json'));
const seenPath = arg('seen', join(IDEAS, 'seen.json'));
// Reviewed papers older than this are dropped from the pool. They stay in
// seen.json, so pruning cannot resurrect them.
const pruneDays = Number(arg('prune-days', 30));

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

  // A partial fetch is usable — the pool is additive, so a category that failed
  // today simply arrives tomorrow. It must still be said out loud.
  if (failures.length) {
    console.log(`::warning::${failures.length} categor(ies) failed: ${failures.map((f) => f.cat).join(', ')}`);
  }

  if (outPath === '-') {
    console.log(JSON.stringify({ date, window: { from, to }, failures, papers }, null, 2));
    process.exit(0);
  }

  // --- merge into the pool -------------------------------------------------
  mkdirSync(dirname(outPath), { recursive: true });
  const existing = existsSync(outPath)
    ? readFileSync(outPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
    : [];

  const fetchedAt = new Date().toISOString();
  const additions = papers.map((p) => ({
    id: p.id,
    title: p.title,
    abstract: p.abstract,
    authors: p.authors,
    primary: p.primary,
    categories: p.categories,
    viaCategories: p.viaCategories,
    families: p.families,
    published: p.published,
    fetchedAt,
    // null until a review batch has actually shown this paper to an agent. The
    // distinction between "we have it" and "we looked at it" is the whole reason
    // pull and review are separate jobs.
    reviewed: null,
  }));

  const cutoff = Date.now() - pruneDays * 86400_000;
  const kept = existing.filter((e) => !(e.reviewed?.at && Date.parse(e.reviewed.at) < cutoff));
  const pruned = existing.length - kept.length;

  const pool = [...kept, ...additions];
  writeFileSync(outPath, pool.map((e) => JSON.stringify(e)).join('\n') + '\n');

  // seen.json is the permanent ledger and is updated for everything fetched,
  // reviewed or not — it exists so a pruned paper is never fetched twice.
  for (const p of papers) seen.ids[p.id] = seen.ids[p.id] || date;
  writeFileSync(seenPath, JSON.stringify(seen, null, 0) + '\n');

  const unreviewed = pool.filter((e) => !e.reviewed).length;
  console.log(`\n✓ ${additions.length} new papers from ${categories.length} categories`);
  console.log(`  (${fetched} fetched, ${alreadySeen} already known)`);
  console.log(`  pool: ${pool.length} papers, ${unreviewed} awaiting review${pruned ? `, ${pruned} pruned` : ''}`);
  console.log(`  → ${outPath}`);
}
