#!/usr/bin/env node
// Builds the daily Bisk digest — deterministic superlatives over a SimCluster
// Bluesky list. Read-only public API; no auth, no inference.
//
//   node scripts/build-bisk-digest.mjs            # uses bisk/config.json listUri
//   node scripts/build-bisk-digest.mjs <listUri>  # override
//   BISK_LIST=<listUri> node scripts/build-bisk-digest.mjs
//
// Writes bisk/data/<YYYY-MM-DD>.json, bisk/data/latest.json, and updates
// bisk/data/index.json (the archive). Designed to run daily in a GitHub Action
// that commits the result; the static bisk site renders it.
//
// Sections (v1, all deterministic):
//   • Top Chickens — top 3 posts by like count in the last 24h.
//   • Delvers      — the deepest reply thread rooted in the last 24h.
//   • Weather      — neighborhood sentiment (AFINN) + mood (NRC) + verbosity.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getListMembers, getProfiles, getPostThreadDepth } from '../packages/atproto/bsky.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'bisk', 'data');
const BSKY_PUBLIC = 'https://public.api.bsky.app';
const WINDOW_MS = 24 * 60 * 60 * 1000;

const config = JSON.parse(readFileSync(join(root, 'bisk', 'config.json'), 'utf8'));
const listUri = process.argv[2] || process.env.BISK_LIST || config.listUri;
if (!listUri) { console.error('No list URI (argv / BISK_LIST / config.listUri).'); process.exit(1); }

const afinn = JSON.parse(readFileSync(join(root, 'rite', 'lexicon', 'data', 'afinn.json'), 'utf8'));
const nrc = JSON.parse(readFileSync(join(root, 'rite', 'lexicon', 'data', 'nrc.json'), 'utf8'));

// ── helpers ──────────────────────────────────────────────────────────
function rkeyOf(uri) { return uri.split('/').pop(); }
function postUrl(handleOrDid, uri) { return `https://bsky.app/profile/${handleOrDid}/post/${rkeyOf(uri)}`; }

// Rich author feed (bsky.js strips text/author, so fetch the full view here).
async function authorPosts(did, limit = 30) {
  const params = new URLSearchParams({ actor: did, limit: String(limit), filter: 'posts_no_replies' });
  try {
    const res = await fetch(`${BSKY_PUBLIC}/xrpc/app.bsky.feed.getAuthorFeed?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.feed || [])
      .filter(it => !it.reason)  // drop reposts; keep the author's own posts
      .map(it => ({
        uri: it.post.uri,
        text: it.post.record?.text || '',
        createdAt: it.post.record?.createdAt || it.post.indexedAt,
        indexedAt: it.post.indexedAt,
        likeCount: it.post.likeCount ?? 0,
        replyCount: it.post.replyCount ?? 0,
        repostCount: it.post.repostCount ?? 0,
        author: {
          did: it.post.author.did,
          handle: it.post.author.handle,
          displayName: it.post.author.displayName || it.post.author.handle,
          avatar: it.post.author.avatar || '',
        },
      }));
  } catch { return []; }
}

// ── sentiment / mood ─────────────────────────────────────────────────
function tokenize(text) {
  return (text.toLowerCase().match(/[a-z']+/g) || []);
}
function weatherReport(texts) {
  let scoreSum = 0, scored = 0, words = 0;
  const emo = {};
  for (const t of texts) {
    const toks = tokenize(t);
    words += toks.length;
    for (const w of toks) {
      if (w in afinn) { scoreSum += afinn[w]; scored++; }
      const tags = nrc[w];
      if (tags) for (const tag of tags) if (tag !== 'positive' && tag !== 'negative') emo[tag] = (emo[tag] || 0) + 1;
    }
  }
  const avg = scored ? scoreSum / scored : 0;          // ~[-5, 5]
  const index = Math.max(-1, Math.min(1, avg / 2.5));  // normalize to [-1, 1]
  const verbosity = texts.length ? Math.round(words / texts.length) : 0;
  const mood = Object.entries(emo).sort((a, b) => b[1] - a[1])[0]?.[0] || 'calm';
  let label, glyph;
  if (index >= 0.30)      { label = 'Sunny';    glyph = '☀'; }
  else if (index >= 0.10) { label = 'Fair';     glyph = '🌤'; }
  else if (index > -0.10) { label = 'Overcast'; glyph = '☁'; }
  else if (index > -0.30) { label = 'Drizzle';  glyph = '🌧'; }
  else                    { label = 'Stormy';   glyph = '⛈'; }
  return { index: +index.toFixed(3), label, glyph, mood, verbosity, scoredWords: scored };
}

// ── main ─────────────────────────────────────────────────────────────
async function main() {
  console.log('Resolving list members…');
  const dids = await getListMembers(listUri);
  console.log(`  ${dids.length} members`);
  const profiles = await getProfiles(dids);

  const now = Date.now();
  const all = [];
  for (const did of dids) {
    const posts = await authorPosts(did);
    for (const p of posts) {
      const ts = Date.parse(p.indexedAt);
      if (Number.isFinite(ts) && now - ts <= WINDOW_MS) all.push(p);
    }
  }
  console.log(`  ${all.length} posts in the last 24h`);

  // Top Chickens — top 3 by likes
  const chickens = [...all].sort((a, b) => b.likeCount - a.likeCount).slice(0, 3).map(p => ({
    handle: p.author.handle,
    displayName: p.author.displayName,
    avatar: p.author.avatar,
    text: p.text,
    likeCount: p.likeCount,
    replyCount: p.replyCount,
    repostCount: p.repostCount,
    url: postUrl(p.author.handle, p.uri),
  }));

  // Delvers — deepest thread. Probe the most-replied candidates (cap calls).
  const candidates = [...all].filter(p => p.replyCount >= 2).sort((a, b) => b.replyCount - a.replyCount).slice(0, 25);
  let delver = null;
  for (const p of candidates) {
    const d = await getPostThreadDepth(p.uri, 12);
    if (!d) continue;
    if (!delver || d.maxDepth > delver._depth || (d.maxDepth === delver._depth && d.topLevelReplies > delver._top)) {
      delver = {
        _depth: d.maxDepth, _top: d.topLevelReplies,
        handle: p.author.handle, displayName: p.author.displayName, avatar: p.author.avatar,
        text: p.text, maxDepth: d.maxDepth, topLevelReplies: d.topLevelReplies,
        interactorCount: d.interactorDids.length, replyCount: p.replyCount,
        url: postUrl(p.author.handle, p.uri),
        atUri: p.uri,
      };
    }
  }
  if (delver) { delete delver._depth; delete delver._top; }

  // Weather
  const weather = weatherReport(all.map(p => p.text));

  const date = new Date().toISOString().slice(0, 10);
  const digest = {
    date,
    generatedAt: new Date().toISOString(),
    listUri,
    listUrl: config.listUrl || null,
    memberCount: dids.length,
    postCount: all.length,
    chickens,
    delver,
    weather,
  };

  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, `${date}.json`), JSON.stringify(digest, null, 2));
  writeFileSync(join(dataDir, 'latest.json'), JSON.stringify(digest, null, 2));

  // archive index
  const idxPath = join(dataDir, 'index.json');
  let idx = [];
  if (existsSync(idxPath)) { try { idx = JSON.parse(readFileSync(idxPath, 'utf8')); } catch {} }
  idx = idx.filter(e => e.date !== date);
  idx.unshift({ date, generatedAt: digest.generatedAt, postCount: all.length });
  idx.sort((a, b) => b.date.localeCompare(a.date));
  writeFileSync(idxPath, JSON.stringify(idx, null, 2));

  console.log(`Wrote ${date}.json — ${chickens.length} chickens, delver depth ${delver?.maxDepth ?? '—'}, weather ${weather.label}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
