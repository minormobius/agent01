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
import { marksIn, marksInSlug } from './lib/marks.mjs';

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

  // THE ONE sync.* METHOD, ADDED AS A DELIBERATE POLICY DECISION (2026-07-27).
  //
  // "Make me a repo analyser" turns out to be one of the most-requested shapes,
  // and it needs the CAR. getRepo takes a DID the visitor named and returns that
  // one account's repository — bounded, single-subject, nothing like a firehose.
  // The data is public, served over the open web, and a lab site is front-end
  // only: it holds no credential and stores nothing.
  //
  // WHAT IT DOES BYPASS, stated so nobody rediscovers it: a raw repo is not
  // filtered by the AppView, so labels, takedowns and blocks do not apply to
  // what comes out of it. A tool that analyses (counts, graphs, summarises) is
  // fine. One that REPUBLISHES another account's posts verbatim from a CAR is
  // showing moderated content with the moderation removed — build the analyser,
  // not the mirror.
  //
  // Everything else under com.atproto.sync.* stays banned: getBlob serves raw
  // media, subscribeRepos is the firehose itself.
  'com.atproto.sync.getRepo',

  // listRecords IS NOT HERE, and the reason is worth writing down because the
  // obvious carve-out was tried first and is unsound.
  //
  // The lab has no database: a visitor's work goes to the visitor's own repo
  // under com.minomobi.lab.doc / .score, and a leaderboard has to read those
  // back from other people or it is a list of one. So listRecords is needed.
  //
  // The first attempt allowed it when a com.minomobi.lab. literal sat within a
  // few hundred characters. That check passes on a toy and fails on real code:
  // lab/_kit/pds.js names its collection through a constant, so the literal is
  // eighty lines away and the "carve-out" simply did not fire. Widening the
  // window until it did would excuse every listRecords in any file that
  // mentioned the lab once — a control that looks present and is not.
  //
  // SO THE CAPABILITY LIVES IN THE KIT INSTEAD. lab/_kit/pds.js is human-written
  // and reviewed, it is LINKED same-origin rather than copied, and this gate
  // never scans it — the kit is not a tenant directory. Tenants call
  // store.scoresOf(handle), which can only read a handle the visitor named, in
  // one lab collection. The rule that a page shows what was asked for and never
  // what was going past is then enforced by the code that does the reading,
  // rather than by a regex hoping to recognise it.
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

/** Credential-collection shapes. These are about FUNCTION, never topic — a page
 *  that jokes about crypto is fine, a page that talks to a wallet is not, and a
 *  blocklist of words could not tell them apart. (`crypto.subtle` and
 *  `crypto.randomUUID` are Web Crypto and entirely legitimate, which is exactly
 *  why "crypto" is not on this list.)
 *
 *  THE ONLY LOGIN A LAB SITE MAY OFFER IS BLUESKY OAUTH, narrowly scoped. A
 *  password field on a domain full of agent-written pages is indistinguishable
 *  from a phishing farm — to a visitor, to a blocklist, and to a browser vendor.
 *  docs/LAB-FACTORY.md §11.2. */
const CREDENTIAL_SHAPES = [
  [/<input[^>]*type\s*=\s*["']?password/i, 'a password field. The only login here is Bluesky OAuth — a lab site never collects a password of any kind'],
  [/autocomplete\s*=\s*["']?(cc-number|cc-csc|cc-exp)/i, 'a payment card field. Lab sites take no payments'],
  [/window\.ethereum|ethereum\.request\s*\(/i, 'an Ethereum provider. No wallet connections'],
  [/\bweb3\b|WalletConnect|walletconnect/i, 'wallet-connect machinery. No wallet connections'],
  [/window\.solana|solana\.connect\s*\(|window\.phantom/i, 'a Solana wallet provider. No wallet connections'],
  [/\b(seed phrase|mnemonic phrase|recovery phrase|private key)\b[^.]{0,80}<input|<input[^>]{0,200}(seed|mnemonic)/i, 'a field that collects key material. Never'],
];

/** Every page must carry the tags that make a Bluesky link card. The whole point
 *  of the factory is attention on Bluesky; a post whose link renders as bare text
 *  has thrown that away. Note Bluesky does NOT fetch these itself — the poster
 *  supplies the embed — so lab-build.yml reads them off the page to build it.
 *  Missing tags therefore mean a worse post, not just worse SEO. */
const REQUIRED_META = [
  [/<title>\s*\S/i, '<title>'],
  [/<meta[^>]+property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']\s*\S/i, '<meta property="og:title" content="…">'],
  [/<meta[^>]+property\s*=\s*["']og:description["'][^>]*content\s*=\s*["']\s*\S/i, '<meta property="og:description" content="…">'],
];

/** Substrings that are never acceptable, with the reason attached — an error
 *  that only says "denied" teaches the next agent nothing. */
const BANNED = [
  ['jetstream', 'the firehose has no takedown semantics: a deleted or moderated post keeps arriving'],
  ['subscribeRepos', 'raw repo subscription is the firehose by another name'],
  // NOTE the getRepo carve-out below: this prefix still bans getBlob,
  // subscribeRepos, getLatestCommit and the rest.
  ['com.atproto.sync.', 'sync.* reads blobs and repos straight from a PDS, bypassing every moderation decision the AppView applies. The one exception is com.atproto.sync.getRepo — see ALLOWED_XRPC'],
  ['com.atproto.repo.listRecords', 'enumerating a repo directly bypasses AppView takedowns. To read saved lab records — yours or a handle the visitor typed — link /_kit/pds.js and call store.list() or store.scoresOf(handle). Do not copy the kit into your directory; link it'],
  ['wss://', 'a live socket means content arrives without anyone choosing it; the CSP blocks this at runtime too'],
  ['new WebSocket', 'same as wss://'],
  ['EventSource', 'a server-sent-events stream is a firehose with different punctuation'],
  ['serviceWorker.register', 'a service worker persists code on a SHARED origin and outlives the page — one site must not install anything on minomobi.com'],

  // NOTIFICATION PERMISSION IS PER-ORIGIN, AND THE ORIGIN IS SHARED.
  //
  // Prompted by the "spam or notification-abuse tools" line on Rob's no-build
  // list (docs/NO-BUILD.md). Our Permissions-Policy already pins camera,
  // microphone, geolocation, payment and usb to (), but notifications are not
  // governed by that header — so this was the one permission a tenant could
  // still reach for, and it is the worst one to leave open here.
  //
  // The damage is not that a page nags. It is that *every tenant shares
  // minomobi.com*, so the grant or the block belongs to the whole domain. One
  // annoying site gets notifications permanently denied for the origin, and the
  // denial is sticky and effectively irreversible from the site's side — it
  // takes every future tenant, and the landing page, down with it. A tenant must
  // not be able to spend a domain-wide, one-way resource.
  ['Notification.requestPermission', 'notification permission is per-ORIGIN and the origin is shared — one tenant must not spend minomobi.com\'s permission state for every other site on it'],
  ['new Notification(', 'same: notifications belong to the origin, not to one tenant'],
  ['showNotification', 'same: notifications belong to the origin, not to one tenant'],
  ['pushManager.subscribe', 'push subscription is per-origin and outlives the page, like a service worker'],
];

/** Hosts the CSP in lab/www/worker.js actually permits. Anything else is not a
 *  security finding — the CSP already blocks it — but it IS a broken page, and
 *  the agent has no way to discover that. Warn, do not fail. */
const CSP_CONNECT = ['public.api.bsky.app', 'plc.directory', 'host.bsky.network', 'auth.mino.mobi'];

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

/** Inert data the gate cannot read but that cannot execute either. Images are
 *  governed by img-src and are the only binary a tenant has any business
 *  shipping. */
const INERT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.avif']);

const all = walk(dir);
const files = all.filter((f) => TEXT.has(extname(f).toLowerCase()));

/** A FILE THE GATE CANNOT READ IS A FILE THE GATE CANNOT GATE.
 *
 *  Everything above works by reading source text. Anything outside TEXT was
 *  simply filtered out and shipped unread — which was survivable only because
 *  nothing else could execute. Enabling 'wasm-unsafe-eval' ends that: a .wasm in
 *  a tenant directory would be executable code that no check ever looked at, and
 *  the CSP would permit it because it is same-origin.
 *
 *  Agents cannot produce a binary anyway — no compiler, no network, no shell —
 *  so this costs nothing legitimate. It makes the invariant explicit instead of
 *  incidental: NO UNREVIEWABLE BYTES SHIP FROM A TENANT DIRECTORY. Shared
 *  binaries live in lab/_kit/, which is human-owned and off-limits to the
 *  containment gate. */
const opaque = all.filter((f) => {
  const e = extname(f).toLowerCase();
  return !TEXT.has(e) && !INERT.has(e);
});
for (const f of opaque) {
  violations.push(`${f} — the gate reads source, and it cannot read this. A tenant directory may only contain reviewable text and inert images; shared binaries (three.js, wasm modules) belong in lab/_kit/, which a human owns.`);
}

let failures = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;

  // BRIEF.md is prose written FOR a human and for the next run — it quotes what
  // the site does and may legitimately name what it deliberately avoided.
  // Scanning it produces failures for describing the rule correctly.
  const isProse = extname(file).toLowerCase() === '.md';

  if (!isProse) {
    // The sync.* prefix ban has exactly one carve-out, so the substring search
    // has to ignore occurrences that are part of it. Blanking only the exact
    // allowed method keeps every other sync.* call detectable in the same file.
    const scan = src.replace(/com\.atproto\.sync\.getRepo/gi, 'com.atproto.SYNCALLOWED');
    for (const [needle, why] of BANNED) {
      const i = scan.toLowerCase().indexOf(needle.toLowerCase());
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

  if (!isProse) {
    for (const [re, why] of CREDENTIAL_SHAPES) {
      const m = src.match(re);
      if (m) {
        err(`${file}:${lineOf(m.index)} — ${why}.`);
        failures++;
      }
    }
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

// The link card, checked once against the site's entry point rather than every
// file — a fragment or a sub-page is not what gets posted.
const index = join(dir, 'index.html');
if (files.includes(index)) {
  const src = readFileSync(index, 'utf8');
  for (const [re, what] of REQUIRED_META) {
    if (!re.test(src)) {
      err(`${index} — missing ${what}.`);
      err(`  Bluesky does not fetch these itself; the bot reads them off the page to build`);
      err(`  the link card on the "it's live" reply. Without them the post is a bare URL.`);
      failures++;
    }
  }
}

// ---------------------------------------------------------------------- marks
// THE NAME, NOT THE GAME. Someone asked for a Tetris variant and the factory
// published it, permanently, as minomobi.com/tube-tetris/ — with "tube tetris"
// in the <title>, in the og:title, and painted onto the share card that gets
// posted to Bluesky. The mechanic was nobody's property. The label was the
// operator holding a stranger's trademark out as the name of a page on their
// own domain, and a complaint lands against minomobi.com — which is one domain
// shared by every tenant and the landing page.
//
// SO THE LINE IS THE NAME VERSUS THE COMPARISON. "Tetris on a cylinder" in the
// description is nominative, honest, and the clearest possible link card;
// banning it would push agents toward vague copy and make every card worse.
// Calling the thing Tetris is different in kind. Only the naming surfaces fail:
//
//   the slug (the permanent URL)   the <title>      og:title
//   any heading                    share-card text drawn with fillText
//
// Descriptions and body prose are deliberately untouched. See scripts/lib/
// marks.mjs for what is on the list and why the list is short.
const NAMING_SURFACES = [
  [/<title>([\s\S]*?)<\/title>/gi, '<title>'],
  [/<meta[^>]+property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']*)/gi, 'og:title'],
  [/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, 'a heading'],
  [/(?:fill|stroke)Text\(\s*(['"`])([^'"`]*)\1/g, 'the share card'],
];
if (files.includes(index)) {
  const slugHits = marksInSlug(base);
  if (slugHits.length) {
    err(`the site name "${base}" contains ${slugHits.join(', ')} — a name we will not publish under.`);
    err(`  The URL is permanent and it sits on minomobi.com, so the name is the operator`);
    err(`  holding somebody else's mark out as their own page. Build the mechanic; give it`);
    err(`  a name of its own. You may say what it is LIKE in the description.`);
    failures++;
  }
  for (const f of files.filter((x) => /\.(html?|js|mjs)$/i.test(x))) {
    const src = readFileSync(f, 'utf8');
    for (const [re, where] of NAMING_SURFACES) {
      for (const m of src.matchAll(re)) {
        const text = (m[2] ?? m[1] ?? '').replace(/<[^>]+>/g, ' ');
        const hits = marksIn(text);
        if (!hits.length) continue;
        err(`${f} — ${hits.join(', ')} in ${where}: ${JSON.stringify(text.trim().slice(0, 60))}`);
        err(`  Naming it after the original is the one thing that is not yours to do. Rename`);
        err(`  it; "inspired by …" in the description or the body is fine and is better copy.`);
        failures++;
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
