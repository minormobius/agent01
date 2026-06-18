#!/usr/bin/env node
// Builds the monthly Bisk newsletter — a deterministic rollup over the daily
// digests in bisk/data/. No network, no inference: it only reads the archive
// the daily build already committed.
//
//   node scripts/build-bisk-monthly.mjs            # previous calendar month
//   node scripts/build-bisk-monthly.mjs 2026-06    # a specific month
//   BISK_MONTH=2026-06 node scripts/build-bisk-monthly.mjs
//
// Writes bisk/data/monthly/<YYYY-MM>.json, monthly/latest.json, updates
// monthly/index.json, and regenerates bisk/feed.xml (RSS of every month).
//
// Sections (all deterministic, rolled up from the dailies):
//   • Builders of the Month — who shipped, what they shipped, how often.
//   • Featured Ships        — the month's best individual Workshop dispatches.
//   • Chicken of the Month  — most-liked posts across every edition.
//   • Deepest Delve         — the deepest thread of the whole month.
//   • The Month's Weather   — sentiment trend, dominant mood, distinctive words.
//   • The Shingles          — the neighborhood's domain directory (+ new ones).
//   • Scenes                — a light sampling of the month's images.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'bisk', 'data');
const monthlyDir = join(dataDir, 'monthly');
const config = JSON.parse(readFileSync(join(root, 'bisk', 'config.json'), 'utf8'));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function targetMonth() {
  const arg = process.argv[2] || process.env.BISK_MONTH;
  if (arg && /^\d{4}-\d{2}$/.test(arg)) return arg;
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);   // previous calendar month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function loadDailies(ym) {
  if (!existsSync(dataDir)) return [];
  const files = readdirSync(dataDir)
    .filter(f => f.startsWith(ym + '-') && f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  const out = [];
  for (const f of files) {
    try { out.push(JSON.parse(readFileSync(join(dataDir, f), 'utf8'))); } catch {}
  }
  return out;
}

// ── rollup ───────────────────────────────────────────────────────────
function build(ym) {
  const dailies = loadDailies(ym);
  if (!dailies.length) {
    console.error(`No daily editions found for ${ym} in ${dataDir}.`);
    process.exit(1);
  }
  const dates = dailies.map(d => d.date).sort();
  const posts = dailies.reduce((a, d) => a + (d.postCount || 0), 0);

  // Builders of the Month — fold every Workshop dispatch into per-builder rows.
  // A builder's "projects" are deduped by URL (keeping the best-engaged post),
  // and the bench is ranked by distinct projects, then dispatch count, then likes.
  const byBuilder = new Map();            // handle -> { …, projects: Map<url, proj> }
  const allDispatches = [];
  for (const d of dailies) {
    for (const w of (d.workshop || [])) {
      allDispatches.push({ ...w, date: d.date });
      let b = byBuilder.get(w.handle);
      if (!b) {
        b = { handle: w.handle, displayName: w.displayName, avatar: w.avatar, dispatchCount: 0, likeTotal: 0, projects: new Map() };
        byBuilder.set(w.handle, b);
      }
      b.dispatchCount++;
      b.likeTotal += w.likeCount || 0;
      if (w.avatar && !b.avatar) b.avatar = w.avatar;
      const key = w.project.url;
      const prev = b.projects.get(key);
      const proj = {
        url: w.project.url, domain: w.project.domain, self: !!w.project.self,
        title: (w.card && w.card.title) || '', likeCount: w.likeCount || 0, postUrl: w.url,
      };
      if (!prev || proj.likeCount > prev.likeCount) b.projects.set(key, proj);
    }
  }
  const builders = [...byBuilder.values()].map(b => ({
    handle: b.handle, displayName: b.displayName, avatar: b.avatar,
    dispatchCount: b.dispatchCount, likeTotal: b.likeTotal,
    projectCount: b.projects.size,
    projects: [...b.projects.values()].sort((a, c) => c.likeCount - a.likeCount),
  })).sort((a, b) =>
    b.projectCount - a.projectCount || b.dispatchCount - a.dispatchCount || b.likeTotal - a.likeTotal
  ).slice(0, 12);

  // Featured Ships — the strongest individual dispatches, one per (handle,project).
  const seenShip = new Set();
  const featured = allDispatches
    .map(w => ({ w, score: (w.project.self ? 2000 : w.project.ownerHandle ? 1000 : 0) + (w.promo ? 300 : 0) + (w.likeCount || 0) + 2 * (w.repostCount || 0) }))
    .sort((a, b) => b.score - a.score)
    .filter(({ w }) => { const k = w.handle + '|' + w.project.url; if (seenShip.has(k)) return false; seenShip.add(k); return true; })
    .slice(0, 6)
    .map(({ w }) => ({
      handle: w.handle, displayName: w.displayName, avatar: w.avatar, text: w.text,
      likeCount: w.likeCount, repostCount: w.repostCount, replyCount: w.replyCount,
      url: w.url, date: w.date, project: w.project, card: w.card || null, promo: !!w.promo,
    }));

  // Chicken of the Month — top posts across every edition, deduped by URL.
  const seenChick = new Set();
  const chickens = dailies.flatMap(d => (d.chickens || []).map(c => ({ ...c, date: d.date })))
    .sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0))
    .filter(c => { if (seenChick.has(c.url)) return false; seenChick.add(c.url); return true; })
    .slice(0, 5);

  // Deepest Delve — the single deepest thread of the month.
  let delve = null;
  for (const d of dailies) {
    if (d.delver && (!delve || (d.delver.maxDepth || 0) > (delve.maxDepth || 0))) {
      delve = { ...d.delver, date: d.date };
    }
  }

  // The Month's Weather — per-day trend for a sparkline, plus aggregates and the
  // month's distinctive words (summed across the dailies).
  const trend = dailies
    .filter(d => d.weather)
    .map(d => ({ date: d.date, index: d.weather.index, label: d.weather.label, mood: d.weather.mood }));
  const moodCounts = {};
  const distinct = {};
  let idxSum = 0;
  for (const t of trend) { moodCounts[t.mood] = (moodCounts[t.mood] || 0) + 1; idxSum += t.index; }
  for (const d of dailies) for (const w of (d.weather?.distinctive || [])) distinct[w.word] = (distinct[w.word] || 0) + w.count;
  const sorted = [...trend].sort((a, b) => b.index - a.index);
  const weather = trend.length ? {
    avgIndex: +(idxSum / trend.length).toFixed(3),
    dominantMood: Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'calm',
    sunniest: sorted[0] || null,
    stormiest: sorted[sorted.length - 1] || null,
    trend,
    distinctive: Object.entries(distinct).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word, count]) => ({ word, count })),
  } : null;

  // The Shingles — union of every edition's builder directory. "New this month"
  // is computed against the previous monthly rollup, if one exists.
  const shMap = new Map();
  for (const d of dailies) for (const b of (d.builders || [])) if (!shMap.has(b.domain)) shMap.set(b.domain, b);
  const shingles = [...shMap.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  let prevDomains = new Set();
  const prevMonthFile = previousMonthFile(ym);
  if (prevMonthFile && existsSync(prevMonthFile)) {
    try { for (const b of (JSON.parse(readFileSync(prevMonthFile, 'utf8')).shingles || [])) prevDomains.add(b.domain); } catch {}
  }
  const newShingles = shingles.filter(b => !prevDomains.has(b.domain)).map(b => b.domain);

  // Scenes — a light sampling: a couple from each edition until we have a wall.
  const scenes = [];
  outer: for (const d of dailies) {
    let n = 0;
    for (const s of (d.scenes || [])) { scenes.push(s); if (++n >= 2 || scenes.length >= 16) break; if (scenes.length >= 16) break outer; }
    if (scenes.length >= 16) break;
  }

  return {
    month: ym,
    label: monthLabel(ym),
    title: config.title || 'Bisk',
    generatedAt: new Date().toISOString(),
    listUrl: config.listUrl || null,
    span: { from: dates[0], to: dates[dates.length - 1], editions: dailies.length, posts },
    builders, featured, chickens, delve, weather, shingles, newShingles, scenes,
  };
}

function previousMonthFile(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  const prev = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return join(monthlyDir, `${prev}.json`);
}

// ── RSS ──────────────────────────────────────────────────────────────
function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function summaryHtml(m) {
  const top = m.builders.slice(0, 5).map(b => `@${b.handle} (${b.projectCount} project${b.projectCount === 1 ? '' : 's'})`).join(', ');
  const chick = m.chickens[0];
  const w = m.weather;
  const parts = [];
  parts.push(`<p>${m.span.editions} editions · ${m.span.posts} posts surveyed · ${m.builders.length} builders shipped this month.</p>`);
  if (top) parts.push(`<p><strong>Builders of the month:</strong> ${xmlEsc(top)}.</p>`);
  if (chick) parts.push(`<p><strong>Chicken of the month:</strong> “${xmlEsc((chick.text || '').slice(0, 140))}” — @${xmlEsc(chick.handle)} (♥${chick.likeCount}).</p>`);
  if (m.delve) parts.push(`<p><strong>Deepest delve:</strong> ${m.delve.maxDepth} levels, ${m.delve.interactorCount} voices — @${xmlEsc(m.delve.handle)}.</p>`);
  if (w) parts.push(`<p><strong>Weather:</strong> avg sentiment ${w.avgIndex >= 0 ? '+' : ''}${w.avgIndex}, dominant mood ${xmlEsc(w.dominantMood)}; talking about ${xmlEsc(w.distinctive.slice(0, 5).map(d => d.word).join(', '))}.</p>`);
  if (m.newShingles.length) parts.push(`<p><strong>New shingles:</strong> ${xmlEsc(m.newShingles.join(', '))}.</p>`);
  return parts.join('');
}
function pubDate(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1, 13, 0, 0)).toUTCString();   // 1st of the FOLLOWING month
}
function writeRss(index) {
  const site = 'https://bisk.mino.mobi';
  const items = index.slice(0, 24).map(m => {
    let full = null;
    try { full = JSON.parse(readFileSync(join(monthlyDir, `${m.month}.json`), 'utf8')); } catch {}
    const desc = full ? summaryHtml(full) : '';
    return `    <item>
      <title>${xmlEsc('Bisk Monthly — ' + monthLabel(m.month))}</title>
      <link>${site}/monthly/#${m.month}</link>
      <guid isPermaLink="false">bisk-monthly-${m.month}</guid>
      <pubDate>${pubDate(m.month)}</pubDate>
      <description>${xmlEsc(desc)}</description>
    </item>`;
  }).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Bisk Monthly — The SimCluster Review</title>
    <link>${site}/monthly/</link>
    <description>A monthly deterministic review of what the SimCluster neighborhood shipped, said, and argued about — rolled up from the daily Bisk archive.</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  writeFileSync(join(root, 'bisk', 'feed.xml'), xml);
}

// ── main ─────────────────────────────────────────────────────────────
const ym = targetMonth();
console.log(`Rolling up ${ym} (${monthLabel(ym)})…`);
const digest = build(ym);

if (!existsSync(monthlyDir)) mkdirSync(monthlyDir, { recursive: true });
writeFileSync(join(monthlyDir, `${ym}.json`), JSON.stringify(digest, null, 2));

const idxPath = join(monthlyDir, 'index.json');
let idx = [];
if (existsSync(idxPath)) { try { idx = JSON.parse(readFileSync(idxPath, 'utf8')); } catch {} }
idx = idx.filter(e => e.month !== ym);
idx.unshift({ month: ym, label: digest.label, generatedAt: digest.generatedAt, editions: digest.span.editions, builders: digest.builders.length });
idx.sort((a, b) => b.month.localeCompare(a.month));
writeFileSync(idxPath, JSON.stringify(idx, null, 2));

// latest.json always points at the NEWEST month on file — so back-filling an
// older month never clobbers the live "latest" with stale data.
const newest = idx[0].month;
const newestDigest = newest === ym ? digest : JSON.parse(readFileSync(join(monthlyDir, `${newest}.json`), 'utf8'));
writeFileSync(join(monthlyDir, 'latest.json'), JSON.stringify(newestDigest, null, 2));

writeRss(idx);

console.log(`Wrote monthly/${ym}.json — ${digest.builders.length} builders, ${digest.featured.length} featured, ${digest.shingles.length} shingles (${digest.newShingles.length} new), delve ${digest.delve?.maxDepth ?? '—'}, ${digest.span.editions} editions.`);
