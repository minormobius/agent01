#!/usr/bin/env node
// ideas-post.mjs — post the next concept from the queue. One post per run.
//
//   node scripts/ideas-post.mjs                 # dry run: render it, post nothing
//   IDEAS_ENABLED=true node scripts/ideas-post.mjs --post
//
// The hourly half of the ideas bot. Deliberately the dumbest component: it does
// not fetch, does not think, and cannot invent a post. If the queue is empty it
// exits quietly having done nothing.
//
// WHY AN EMPTY QUEUE IS A NORMAL OUTCOME, NOT AN ERROR. arXiv announces once per
// weekday; the mining run is daily and the gate is strict, so a good day yields
// perhaps five to ten concepts, not twenty-four. An hourly schedule against that
// supply will drain the queue, and the only two ways to keep posting on the hour
// are to lower the bar or to repeat. Both are worse than silence. So the cadence
// is a CEILING, not a promise: up to one post an hour, and nothing when there is
// nothing worth posting. `--strict-empty` is available for a caller that wants an
// empty queue to be loud.
//
// TWO INTERLOCKS, both fail-closed, matching the pattern in bsky-hello.mjs:
//   --post          intent, supplied only by the workflow
//   IDEAS_ENABLED   the operator's switch, checked at the last moment
// Either one missing means render-and-exit. A dry run is the default because the
// consequence of a mistake here is public and cannot be taken back cleanly.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, createPost, graphemes, externalEmbed } from './lib/bsky.mjs';
import { renderPost } from './ideas-gate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDEAS = join(ROOT, '.github', 'ideas');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };

const queuePath = arg('queue', join(IDEAS, 'queue.jsonl'));
const wantPost = argv.includes('--post');
const strictEmpty = argv.includes('--strict-empty');
const maxPerDay = Number(process.env.IDEAS_MAX_PER_DAY || 24);

// --- the queue -------------------------------------------------------------
if (!existsSync(queuePath)) {
  console.log(`— no queue at ${queuePath}; nothing to post`);
  process.exit(strictEmpty ? 1 : 0);
}
const raw = readFileSync(queuePath, 'utf8');
const entries = raw.split('\n').filter((l) => l.trim()).map((l, i) => {
  try { return JSON.parse(l); } catch (e) { throw new Error(`queue line ${i + 1} is not JSON: ${e.message}`); }
});

const pending = entries.filter((e) => !e.posted);
const postedToday = entries.filter((e) => e.posted?.at && Date.now() - Date.parse(e.posted.at) < 86400_000);

console.log(`queue: ${entries.length} total, ${pending.length} pending, ${postedToday.length} posted in the last 24h`);

if (!pending.length) {
  console.log('— queue is empty. Posting nothing beats posting filler; the miner refills it daily.');
  process.exit(strictEmpty ? 1 : 0);
}

// The daily cap is a floor under the account's dignity, not a rate limit: 24
// posts a day from one account is a lot, and this is the knob to turn down.
if (postedToday.length >= maxPerDay) {
  console.log(`— daily cap reached (${postedToday.length}/${maxPerDay}); holding`);
  process.exit(0);
}

// Oldest first. A concept keyed to "settled this morning" goes stale, so the
// queue is FIFO and a backlog is visible in the report rather than reordered
// away.
const next = pending[0];
const text = renderPost(next);

// THE PAPER IS A CARD, NOT A LINE OF TEXT. An inline `arxiv.org/abs/…` cost 24
// of the 300 graphemes and took all four of the first review run's concepts down
// with it. A card costs nothing, shows the paper's real title, and is what a link
// on Bluesky is meant to look like. Bluesky does not fetch Open Graph tags — the
// poster supplies the card — which is why the title comes from the queue entry.
const embed = externalEmbed({
  uri: `https://arxiv.org/abs/${next.arxivId}`,
  title: next.paperTitle,
  description: `arXiv:${next.arxivId}${next.categories?.length ? ` · ${next.categories.join(', ')}` : ''}`,
});

console.log(`\nnext: ${next.name} (${next.arxivId}, queued ${next.queuedAt})`);
console.log('─'.repeat(64));
console.log(text);
console.log('─'.repeat(64));
console.log(`${graphemes(text)} graphemes of 300 — the card is free`);
console.log(`card: ${embed.external.title}`);
console.log(`      ${embed.external.uri}`);
if (next.plan) console.log(`plan: ${String(next.plan).split(/\s+/).length} words, carried to the build agent`);

// --- the interlocks --------------------------------------------------------
const enabled = process.env.IDEAS_ENABLED === 'true';
if (!wantPost || !enabled) {
  const reason = !wantPost ? 'no --post flag' : 'IDEAS_ENABLED is not "true"';
  console.log(`\n— dry run (${reason}). Nothing was posted and the queue is unchanged.`);
  process.exit(0);
}

const handle = process.env.BLUESKY_HANDLE;
const password = process.env.BLUESKY_APP_PASSWORD;
if (!handle || !password) {
  console.error('::error::BLUESKY_HANDLE / BLUESKY_APP_PASSWORD are not set');
  console.error('::error::they come from secrets BLUESKY_BOT_HANDLE / BLUESKY_BOT_APP_PASSWORD');
  process.exit(1);
}

// --- post ------------------------------------------------------------------
const session = await login(handle, password);
console.log(`✓ logged in as ${session.handle} (${session.did})`);

const result = await createPost(session, { text, embed });
console.log(`✓ posted — ${result.url}`);

// Mark it posted in place. Written immediately after the post succeeds and before
// anything else can fail: the failure that matters is a post that happened and
// was not recorded, because the next run would send it again.
next.posted = { at: new Date().toISOString(), uri: result.uri, url: result.url };
writeFileSync(queuePath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
console.log(`✓ queue updated — ${pending.length - 1} still pending`);
