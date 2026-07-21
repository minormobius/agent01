#!/usr/bin/env node
/**
 * build-time-index.mjs — generate time/index.json from the static articles.
 *
 * The Mino Times front page renders from this manifest, NOT from a live
 * ATProto repo. The articles in time/articles/*.html are self-contained and
 * are the canonical, resilient source of record — immune to any one Bluesky
 * account being suspended. Run this whenever articles/ changes:
 *
 *   node scripts/build-time-index.mjs          # write time/index.json
 *   node scripts/build-time-index.mjs --check   # print, don't write
 *
 * No dependencies, no build step. Deterministic.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTICLES_DIR = join(ROOT, 'time', 'articles');
const OUT = join(ROOT, 'time', 'index.json');

// --- tiny HTML helpers (hand-authored, consistently-structured files) ---

function firstMatch(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

function stripTags(s) {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&amp;/g, '&')
    .replace(/&middot;/g, '·')
    .replace(/&rarr;/g, '→')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- desk classification from the byline ---
// Bylines look like:
//   "By Modulo · Feb 19, 2026"            -> lead Modulo
//   "By Morphyx, with Modulo · ..."       -> lead Morphyx
//   "By Modulo, with Morphyx · ..."       -> lead Modulo
//   "Modulo & Morphyx · ..."              -> joint (panels)
//   "By Modulo & Morphyx · ..."           -> joint
//   "The Mino Times Research Desk · ..."  -> desk (house voice, legacy)
function classifyDesk(byline) {
  const b = (byline || '').toLowerCase();
  const hasMod = b.includes('modulo');
  const hasMor = b.includes('morphyx');
  if (hasMod && hasMor) {
    // joint if " & " / "and", else lead = whoever comes first after "by"
    if (/modulo\s*&|&\s*modulo|modulo\s+and\s+morphyx|morphyx\s+and\s+modulo/.test(b)) {
      // "X & Y" or "X and Y" — but "with" means a clear lead
      if (!b.includes('with')) return { desk: 'joint', lead: null };
    }
    // "By Morphyx, with Modulo" -> lead is the first name after "by"
    const order = b.replace(/^by\s+/, '');
    const modIdx = order.indexOf('modulo');
    const morIdx = order.indexOf('morphyx');
    if (b.includes('with')) {
      return morIdx < modIdx
        ? { desk: 'morphyx', lead: 'Morphyx' }
        : { desk: 'modulo', lead: 'Modulo' };
    }
    return { desk: 'joint', lead: null };
  }
  if (hasMor) return { desk: 'morphyx', lead: 'Morphyx' };
  if (hasMod) return { desk: 'modulo', lead: 'Modulo' };
  return { desk: 'desk', lead: null };
}

function parseArticle(file) {
  const path = join(ARTICLES_DIR, file);
  const html = readFileSync(path, 'utf8');

  const rawTitle = firstMatch(html, /<title>([^<]*)<\/title>/);
  const kicker = stripTags(firstMatch(html, /<div class="kicker">([\s\S]*?)<\/div>/));
  const headline = stripTags(firstMatch(html, /<h2 class="headline-lead"[^>]*>([\s\S]*?)<\/h2>/));
  const bylineRaw = stripTags(firstMatch(html, /<div class="byline">([\s\S]*?)<\/div>/));

  // summary: prefer the lead paragraph, else the first body <p>
  let summary =
    firstMatch(html, /<p class="article-lead"[^>]*>([\s\S]*?)<\/p>/) ||
    firstMatch(html, /<div class="article-body"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
  summary = stripTags(summary);
  if (summary.length > 320) summary = summary.slice(0, 320).replace(/\s+\S*$/, '') + '…';

  const isPanel = /-panel\.html$/.test(file) || /^Editorial Panel:/.test(rawTitle || '');

  // date from the YYYY-MM-DD filename prefix (canonical sort key)
  const dm = file.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : '';
  // display date from the byline tail after the middle dot, if present
  const dateDisplay = (bylineRaw.split('·').pop() || '').trim();

  // series + part from a kicker like "Exobiology · Part 2 of 5"
  let series = null, part = null, partsTotal = null;
  const km = kicker && kicker.match(/^(.*?)\s*·\s*Part\s+(\d+)\s+of\s+(\d+)/i);
  if (km) { series = km[1].trim(); part = +km[2]; partsTotal = +km[3]; }

  const { desk, lead } = classifyDesk(bylineRaw);

  // panel -> parent article slug (drop the -panel suffix)
  const slug = basename(file, '.html');
  const parent = isPanel ? slug.replace(/-panel$/, '') : null;

  // clean display title: strip the " — The Mino Times" / "Editorial Panel:" chrome
  let title = headline || stripTags(rawTitle || '')
    .replace(/\s*—\s*The Mino Times\s*$/, '')
    .replace(/^Editorial Panel:\s*/, '');

  return {
    slug,
    file: `articles/${file}`,
    type: isPanel ? 'panel' : 'article',
    title,
    kicker,
    byline: bylineRaw,
    desk,
    lead,
    date,
    dateDisplay,
    summary,
    ...(series ? { series, part, partsTotal } : {}),
    ...(parent ? { parent } : {}),
  };
}

const files = readdirSync(ARTICLES_DIR)
  .filter((f) => f.endsWith('.html'))
  .sort();

const items = files.map(parseArticle);

// newest first, panels immediately after their parent handled by the UI
items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.slug.localeCompare(b.slug));

const manifest = {
  generated: 'static',            // no timestamp — deterministic output
  site: 'The Mino Times',
  count: items.length,
  desks: {
    modulo: 'The Data Desk',      // instrument-driven, data-first
    morphyx: 'The Institutional Desk', // policy, power, relational
  },
  items,
};

const json = JSON.stringify(manifest, null, 2) + '\n';

if (process.argv.includes('--check')) {
  process.stdout.write(json);
} else {
  writeFileSync(OUT, json);
  const byDesk = items.reduce((a, it) => ((a[it.desk] = (a[it.desk] || 0) + 1), a), {});
  console.error(`wrote ${OUT}  (${items.length} items: ${JSON.stringify(byDesk)})`);
}
