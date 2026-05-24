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
import { getListMembers, getProfiles } from '../packages/atproto/bsky.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'bisk', 'data');
const BSKY_PUBLIC = 'https://public.api.bsky.app';
const WINDOW_MS = 24 * 60 * 60 * 1000;

const config = JSON.parse(readFileSync(join(root, 'bisk', 'config.json'), 'utf8'));
const listUri = process.argv[2] || process.env.BISK_LIST || config.listUri;
if (!listUri) { console.error('No list URI (argv / BISK_LIST / config.listUri).'); process.exit(1); }

const afinn = JSON.parse(readFileSync(join(root, 'rite', 'lexicon', 'data', 'afinn.json'), 'utf8'));
const nrc = JSON.parse(readFileSync(join(root, 'rite', 'lexicon', 'data', 'nrc.json'), 'utf8'));
const baseline = JSON.parse(readFileSync(join(root, 'rite', 'lexicon', 'data', 'baseline.json'), 'utf8'));
const baselineTotal = Object.values(baseline).reduce((a, b) => a + b, 0);

const EMO8 = ['anger', 'anticipation', 'disgust', 'fear', 'joy', 'sadness', 'surprise', 'trust'];
const STOP = new Set(('the a an and or but if then so of to in on at for with from by as is are was were be been being it its this that these those i you he she we they them him her his our your their me my mine no not just like got get really very much many more most some any all out up down over into than too can will would could should may might must have has had do does did was http https com www bsky social thing things kinda sorta gonna wanna yeah yep nah lol about what when where who why how there here also been being because there their what your you you re ve ll don doesn isn wasn didn couldn wouldn shouldn haven hasn hadn aren weren werent dont cant wont ain theyre youre were one two way back time day people good bad new now know think going want see say said going make made even still well right thats whats').split(/\s+/));

// ── helpers ──────────────────────────────────────────────────────────
function rkeyOf(uri) { return uri.split('/').pop(); }
function postUrl(handleOrDid, uri) { return `https://bsky.app/profile/${handleOrDid}/post/${rkeyOf(uri)}`; }

// Pull image views out of a post's embed (direct images or record-with-media).
function extractImages(post) {
  const e = post.embed;
  if (!e) return [];
  let view = null;
  if (typeof e.$type === 'string' && e.$type.startsWith('app.bsky.embed.images')) view = e;
  else if (e.media && typeof e.media.$type === 'string' && e.media.$type.startsWith('app.bsky.embed.images')) view = e.media;
  if (!view || !Array.isArray(view.images)) return [];
  return view.images.map(im => ({
    thumb: im.thumb,
    fullsize: im.fullsize,
    alt: im.alt || '',
    ratio: im.aspectRatio && im.aspectRatio.height ? +(im.aspectRatio.width / im.aspectRatio.height).toFixed(4) : null,
  })).filter(im => im.thumb);
}

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
        images: extractImages(it.post),
      }));
  } catch { return []; }
}

// Fully hydrate a thread: walk the entire reply tree, recording the true
// nesting depth of the deepest comment AND the text of every post (so the
// same fetch feeds both the delver ranking and the weather corpus — the
// neighbourhood does its real talking down in the threads).
const DEAD = new Set(['app.bsky.feed.defs#blockedPost', 'app.bsky.feed.defs#notFoundPost']);
async function hydrateThread(postUri, depth = 50) {
  const params = new URLSearchParams({ uri: postUri, depth: String(depth), parentHeight: '0' });
  try {
    const res = await fetch(`${BSKY_PUBLIC}/xrpc/app.bsky.feed.getPostThread?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const root = data.thread;
    if (!root || DEAD.has(root.$type)) return null;
    const interactors = new Set();
    const posts = [];
    let maxDepth = 0, topLevelReplies = 0;
    function walk(node, d) {
      if (!node || DEAD.has(node.$type)) return;
      const p = node.post;
      if (p?.author?.did) {
        interactors.add(p.author.did);
        posts.push({ uri: p.uri, text: p.record?.text || '', did: p.author.did, depth: d });
      }
      if (d > maxDepth) maxDepth = d;          // depth of the deepest comment
      if (d === 1) topLevelReplies++;
      for (const r of node.replies || []) walk(r, d + 1);
    }
    walk(root, 0);                              // root at depth 0, replies at 1, 2, …
    return { maxDepth, topLevelReplies, interactorDids: [...interactors], posts };
  } catch { return null; }
}

// ── sentiment / mood / distinctiveness ───────────────────────────────
function tokenize(text) {
  // Drop apostrophes so contractions split into fragments that fall out via
  // the length/stop filters, rather than surviving as bogus "novel" tokens.
  return (text.toLowerCase().replace(/['’]/g, ' ').match(/[a-z]+/g) || []);
}

// Top-k words by represented × overrepresented: raw occurrences in the
// corpus times how much more often they appear than in general English
// (baseline.json, the same baseline rite/atlas uses). The product rewards
// words that are both frequently said AND unusual — neither a rare one-off
// nor a common stopword wins.
function distinctiveWords(texts, k = 3) {
  const counts = {};
  let total = 0;
  for (const t of texts) for (const w of tokenize(t)) {
    if (w.length < 3 || STOP.has(w)) continue;
    counts[w] = (counts[w] || 0) + 1; total++;
  }
  if (!total) return [];
  const FLOOR = 0.15;  // per-million floor for words absent from the baseline
  return Object.entries(counts)
    .filter(([, c]) => c >= 2)
    .map(([w, c]) => {
      const over = (c / total) / ((baseline[w] ?? FLOOR) / baselineTotal);  // overrepresentation
      return { word: w, count: c, over: +over.toFixed(1), score: c * over };  // represented × overrepresented
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ word, count, over }) => ({ word, count, over }));
}
function weatherReport(texts) {
  let scoreSum = 0, scored = 0, words = 0;
  const emo = {};
  for (const e of EMO8) emo[e] = 0;
  for (const t of texts) {
    const toks = tokenize(t);
    words += toks.length;
    for (const w of toks) {
      if (w in afinn) { scoreSum += afinn[w]; scored++; }
      const tags = nrc[w];
      if (tags) for (const tag of tags) if (tag in emo) emo[tag]++;
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
  return {
    index: +index.toFixed(3), label, glyph, mood, verbosity,
    scoredWords: scored,
    corpusPosts: texts.length,
    emotions: emo,
    distinctive: distinctiveWords(texts, 3),
  };
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

  // Delvers — hydrate EVERY thread that has any reply and rank by the actual
  // nesting depth of its deepest comment (not by reply count — a narrow,
  // two-person chain can run far deeper than a wide-but-shallow thread).
  // The same hydration harvests text for the weather corpus.
  const memberSet = new Set(dids);
  const corpus = new Map();                       // uri -> { text, did }
  for (const p of all) corpus.set(p.uri, { text: p.text, did: p.author.did });

  const probe = all.filter(p => p.replyCount >= 1).sort((a, b) => b.replyCount - a.replyCount).slice(0, 160);
  console.log(`  hydrating ${probe.length} threads for depth + sentiment…`);
  let delver = null;
  for (const p of probe) {
    const h = await hydrateThread(p.uri, 50);
    if (!h) continue;
    for (const node of h.posts) corpus.set(node.uri, { text: node.text, did: node.did });
    if (!delver || h.maxDepth > delver._depth ||
        (h.maxDepth === delver._depth && h.interactorDids.length > delver._voices)) {
      delver = {
        _depth: h.maxDepth, _voices: h.interactorDids.length,
        handle: p.author.handle, displayName: p.author.displayName, avatar: p.author.avatar,
        text: p.text, maxDepth: h.maxDepth, topLevelReplies: h.topLevelReplies,
        interactorCount: h.interactorDids.length, replyCount: p.replyCount,
        url: postUrl(p.author.handle, p.uri),
        atUri: p.uri,
      };
    }
  }
  if (delver) { delete delver._depth; delete delver._voices; }

  // Scenes — every image in a top-level post today, best-liked first,
  // capped so the page stays light. An are.na-style wall of the day's art.
  const SCENES_CAP = 60;
  const scenes = [];
  for (const p of [...all].sort((a, b) => b.likeCount - a.likeCount)) {
    for (const im of p.images || []) {
      scenes.push({
        thumb: im.thumb, fullsize: im.fullsize, alt: im.alt, ratio: im.ratio,
        handle: p.author.handle, url: postUrl(p.author.handle, p.uri),
      });
      if (scenes.length >= SCENES_CAP) break;
    }
    if (scenes.length >= SCENES_CAP) break;
  }

  // Weather — sentiment/emotion/distinctiveness over everything the list
  // members said today, top-level posts AND their deep-thread replies.
  const corpusTexts = [...corpus.values()].filter(v => memberSet.has(v.did) && v.text).map(v => v.text);
  const weather = weatherReport(corpusTexts);

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
    scenes,
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

  console.log(`Wrote ${date}.json — ${chickens.length} chickens, delver depth ${delver?.maxDepth ?? '—'}, weather ${weather.label}, ${scenes.length} scenes.`);
}

main().catch(e => { console.error(e); process.exit(1); });
