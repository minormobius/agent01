#!/usr/bin/env node
// lab-content-gate.mjs — refuse to publish a lab site that republishes other
// people's media from an unbounded stream.
//
//   node scripts/lab-content-gate.mjs lab/www/<name>
//
// WHY THIS EXISTS. The Bluesky bot that inspired this project was killed by one
// request: "pull cat images from the firehose". The agent obliged, and the site
// became an unattended republisher of whatever strangers were posting — which is
// adult content, gore, and eventually something that ends the account rather
// than embarrassing it.
//
// This repo has the same failure in `cat/`, which is exactly the point: a lab
// agent has Read and Grep over the whole checkout, so `cat/worker.js` is a
// working implementation of the thing we must not build, sitting right there as
// a template. Asking the agent nicely is not a control when the answer key is in
// the repo.
//
// THE RULE, and it is a line you can actually check:
//
//   A lab site may show media for a subject the VISITOR NAMED.
//   It may not show media from a stream the visitor did not name.
//
// That is what separates a handle resolver (fine — you typed the handle) from a
// firehose mirror (not fine — nobody chose what appears). It is enforced here as
// a FAIL-CLOSED allowlist of XRPC methods, because every allowed method takes a
// subject as an argument and every denied one returns whatever is going by.
//
// Two things this is NOT:
//   - Not a substitute for the CSP in lab/www/worker.js. That is the real
//     boundary: response headers a tenant cannot weaken. This is the earlier,
//     louder failure so a bad build never reaches the deploy at all.
//   - Not a content classifier. It does not look at what is on the page; it
//     looks at where the page can pull from.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/** XRPC methods a lab site may call. Every one of these takes a subject the
 *  visitor supplied. Notably absent, and deliberately: app.bsky.feed.searchPosts,
 *  getFeed, getTimeline, getSuggestions — all of them answer "what is out there"
 *  rather than "tell me about this". Widening this list is a human decision. */
const ALLOWED_XRPC = new Set([
  'com.atproto.identity.resolveHandle',
  'app.bsky.actor.getProfile',
  'app.bsky.actor.getProfiles',
  'app.bsky.actor.searchActors',
  'app.bsky.actor.searchActorsTypeahead',
  'app.bsky.feed.getAuthorFeed',
  'app.bsky.feed.getPostThread',
  'app.bsky.feed.getPosts',
  'app.bsky.feed.getLikes',
  'app.bsky.feed.getRepostedBy',
  'app.bsky.graph.getFollows',
  'app.bsky.graph.getFollowers',
  'app.bsky.graph.getList',
  'app.bsky.labeler.getServices',
]);

/** NSIDs that are RECORD TYPES, not callable methods — `$type: app.bsky.feed.post`
 *  appears in almost any page that touches ATProto data. These have to be
 *  enumerated rather than pattern-matched: the first version of this file
 *  excused anything matching /^app\.bsky\.(feed|actor|...)\.[a-z]/, which is
 *  also the shape of `app.bsky.feed.searchPosts` and `app.bsky.feed.getFeed`.
 *  The selftest caught it. An explicit list fails closed; a pattern failed open
 *  on exactly the two methods this gate exists to stop. */
const RECORD_TYPES = new Set([
  'app.bsky.feed.post', 'app.bsky.feed.like', 'app.bsky.feed.repost',
  'app.bsky.feed.generator', 'app.bsky.feed.threadgate', 'app.bsky.feed.postgate',
  'app.bsky.graph.follow', 'app.bsky.graph.block', 'app.bsky.graph.list',
  'app.bsky.graph.listitem', 'app.bsky.graph.listblock', 'app.bsky.graph.starterpack',
  'app.bsky.actor.profile',
  'app.bsky.embed.images', 'app.bsky.embed.external', 'app.bsky.embed.record',
  'app.bsky.embed.recordWithMedia', 'app.bsky.embed.video',
  'app.bsky.richtext.facet',
  'app.bsky.labeler.service',
]);

/** Substrings that are never acceptable, with the reason attached — an error
 *  that only says "denied" teaches the next agent nothing. */
const BANNED = [
  ['jetstream', 'the firehose has no takedown semantics: a deleted or moderated post keeps arriving'],
  ['subscribeRepos', 'raw repo subscription is the firehose by another name'],
  ['com.atproto.sync.', 'sync.* reads blobs and repos straight from a PDS, bypassing every moderation decision the AppView applies'],
  ['com.atproto.repo.listRecords', 'enumerating a repo directly bypasses AppView takedowns'],
  ['wss://', 'a live socket means content arrives without anyone choosing it; the CSP blocks this at runtime too'],
  ['new WebSocket', 'same as wss://'],
  ['EventSource', 'a server-sent-events stream is a firehose with different punctuation'],
  ['serviceWorker.register', 'a service worker persists code on a SHARED origin and outlives the page — one site must not install anything on minomobi.com'],
];

/** Hosts the CSP in lab/www/worker.js actually permits. Anything else is not a
 *  security finding — the CSP already blocks it — but it IS a broken page, and
 *  the agent has no way to discover that. Warn, do not fail. */
const CSP_CONNECT = ['public.api.bsky.app', 'plc.directory'];

// ---------------------------------------------------------------------------

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/lab-content-gate.mjs <tenant-dir>');
  process.exit(2);
}

// A TENANT directory, not the surface. lab/www/ holds worker.js — whose own
// comments explain what is banned and why, which this would dutifully flag. The
// infrastructure is human-owned and reviewed; the gate exists for the part
// nobody read before it shipped.
const base = dir.replace(/\/+$/, '').split('/').pop();
if (base === 'www' || base === 'lab' || base.startsWith('_')) {
  console.error(`refusing to scan "${dir}": pass a tenant directory (lab/www/<name>), not the surface.`);
  console.error('The surface and the kit are human-owned; this gate is for agent output.');
  process.exit(2);
}

const ci = Boolean(process.env.GITHUB_ACTIONS);
const err = (m) => console.log(ci ? `::error::${m}` : `  ✘ ${m}`);
const warn = (m) => console.log(ci ? `::warning::${m}` : `  ! ${m}`);

function walk(d, out = []) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (statSync(p).size < 2_000_000) out.push(p);
  }
  return out;
}

const TEXT = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.md', '.txt', '.svg']);
const files = walk(dir).filter((f) => TEXT.has(extname(f).toLowerCase()));

let failures = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;

  // BRIEF.md is prose written FOR a human and for the next run — it quotes what
  // the site does and may legitimately name what it deliberately avoided.
  // Scanning it produces failures for describing the rule correctly.
  const isProse = extname(file).toLowerCase() === '.md';

  if (!isProse) {
    for (const [needle, why] of BANNED) {
      const i = src.toLowerCase().indexOf(needle.toLowerCase());
      if (i !== -1) {
        err(`${file}:${lineOf(i)} — "${needle}" is not allowed here. ${why}`);
        failures++;
      }
    }
  }

  // Every XRPC call must name a subject. Matches both /xrpc/<method> and a bare
  // NSID in a string, so building the URL by concatenation does not evade it.
  const methods = new Set();
  for (const m of src.matchAll(/(?:xrpc\/)?((?:app\.bsky|com\.atproto)\.[a-zA-Z]+\.[a-zA-Z]+)/g)) {
    methods.add(m[1]);
  }
  for (const method of methods) {
    if (ALLOWED_XRPC.has(method)) continue;
    if (RECORD_TYPES.has(method)) continue;
    if (method.endsWith('.defs')) continue;
    err(`${file} — uses ${method}, which is not on the allowlist in scripts/lab-content-gate.mjs.`);
    err(`  Allowed methods all take a subject the visitor named; this one returns whatever is going by.`);
    err(`  If it is a record type rather than a method, it belongs in RECORD_TYPES there.`);
    failures++;
  }

  // Hosts the CSP will refuse at runtime. Not a failure — a heads-up that the
  // page is broken in a way that is invisible until someone loads it.
  if (!isProse) {
    for (const m of src.matchAll(/\b(?:fetch|fetchJson)\s*\(\s*[`'"]https?:\/\/([a-z0-9.-]+)/gi)) {
      if (!CSP_CONNECT.includes(m[1])) {
        warn(`${file} — fetches ${m[1]}, which the lab CSP does not allow in connect-src.`);
        warn(`  The request will fail in the browser. Allowed: ${CSP_CONNECT.join(', ')}.`);
      }
    }
  }
}

if (failures) {
  console.log('');
  err(`content gate: ${failures} violation(s) in ${dir} — refusing to publish`);
  process.exit(1);
}
console.log(`  ✓ content gate: ${files.length} file(s) in ${dir}, no unbounded-stream access`);
