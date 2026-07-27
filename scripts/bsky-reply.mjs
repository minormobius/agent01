#!/usr/bin/env node
// bsky-reply.mjs — tell the requester what happened, in their own thread.
//
//   node scripts/bsky-reply.mjs --root <uri> --root-cid <cid> \
//                               --parent <uri> --parent-cid <cid> \
//                               --state live|failed [--url …] [--page …] [--reason …]
//
// WHY THIS EXISTS. The bot replied on dispatch and then never again, so a failed
// build looked exactly like a slow one. That is a usability failure that becomes
// a moderation problem: an automated account that leaves people hanging collects
// "is this broken?" replies, and that is the traffic that gets an account
// reported (docs/LAB-FACTORY.md §11.4). One reply per outcome, then silence.
//
// THE LINK CARD IS NOT AUTOMATIC. Bluesky does not fetch Open Graph tags for
// you — the client composing the post builds the embed and the network renders
// what it is given. A post created through the API with a bare URL in the text
// gets a bare URL, which is the whole "get attention on Bluesky" premise thrown
// away. So this reads the page's own og:title / og:description off disk and
// constructs app.bsky.embed.external from them, which is also why the content
// gate treats those tags as required rather than nice-to-have.

import { readFileSync } from 'node:fs';

const PDS = 'https://bsky.social/xrpc';

const args = {};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    args[argv[i].slice(2)] = next && !next.startsWith('--') ? next : '';
  }
}

const need = (k) => {
  if (!args[k]) { console.error(`::error::bsky-reply: --${k} is required`); process.exit(1); }
  return args[k];
};

/** Upload the card image and get a blob ref back. Separate from xrpc() because
 *  this posts raw bytes with an image content-type, not JSON — and because a
 *  failure here must degrade to "post without a thumbnail" rather than swallow
 *  the reply. The picture is the nice-to-have; the reply is the point. */
async function uploadThumb(token, path) {
  try {
    const bytes = readFileSync(path);
    const res = await fetch(`${PDS}/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
      body: bytes,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${res.status} ${json.error || ''} ${json.message || ''}`.trim());
    console.log(`  uploaded thumbnail (${bytes.length} bytes)`);
    return json.blob;
  } catch (e) {
    console.log(`::warning::thumbnail upload failed (${e.message}) — posting without it`);
    return null;
  }
}

async function xrpc(method, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${PDS}/${method}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${res.status}: ${json.error || ''} ${json.message || ''}`.trim());
  return json;
}

/** Pull the card's copy from the page itself. The site authored it; this just
 *  carries it. Falls back rather than failing — a missing tag should degrade the
 *  card, never swallow the only message the requester gets. */
function cardFrom(pagePath) {
  if (!pagePath) return null;
  let html;
  try { html = readFileSync(pagePath, 'utf8'); } catch { return null; }
  const meta = (prop) =>
    html.match(new RegExp(`<meta[^>]+property\\s*=\\s*["']${prop}["'][^>]*content\\s*=\\s*["']([^"']*)`, 'i'))?.[1];
  const title = meta('og:title') || html.match(/<title>([^<]*)</i)?.[1] || '';
  const description = meta('og:description') || '';
  return { title: title.trim().slice(0, 300), description: description.trim().slice(0, 1000) };
}

const state = need('state');
const rootUri = need('root');
const rootCid = need('root-cid');
const parentUri = args.parent || rootUri;
const parentCid = args['parent-cid'] || rootCid;

const handle = process.env.BLUESKY_HANDLE;
const password = process.env.BLUESKY_APP_PASSWORD;
if (!handle || !password) {
  // A missing credential must not fail the build — the site is already live and
  // the deploy already happened. Say so loudly and exit clean.
  console.log('::warning::bsky-reply: no credentials, skipping the reply');
  process.exit(0);
}

const session = await xrpc('com.atproto.server.createSession', {
  body: { identifier: handle, password },
});

let text;
let embed;
if (state === 'live' || state === 'building') {
  const url = need('url');
  // Two different claims, because they are two different facts. Saying "live"
  // about a URL that has not started serving is the kind of small dishonesty
  // that teaches people to distrust every other thing the bot says.
  text = state === 'live'
    ? `it's live — ${url}`
    : `built and shipping — ${url} should come up within a minute or two.`;
  const card = cardFrom(args.page);
  if (card?.title) {
    embed = {
      $type: 'app.bsky.embed.external',
      external: { uri: url, title: card.title, description: card.description || url },
    };
    if (args.thumb) {
      const blob = await uploadThumb(session.accessJwt, args.thumb);
      if (blob) embed.external.thumb = blob;
    }
  } else {
    console.log('::warning::no og:title on the page — posting without a link card');
  }
} else {
  // Say what failed without pasting a log into someone's replies. The reason is
  // one short line chosen by the workflow, not stderr.
  const reason = args.reason || 'the build did not finish';
  text = `that one didn't make it — ${reason}. reply here to try again.`;
}

if ([...text].length > 300) text = [...text].slice(0, 297).join('') + '…';

const record = {
  $type: 'app.bsky.feed.post',
  text,
  createdAt: new Date().toISOString(),
  reply: { root: { uri: rootUri, cid: rootCid }, parent: { uri: parentUri, cid: parentCid } },
  ...(embed ? { embed } : {}),
};

const created = await xrpc('com.atproto.repo.createRecord', {
  token: session.accessJwt,
  body: { repo: session.did, collection: 'app.bsky.feed.post', record },
});
console.log(`✓ replied (${state}${embed ? ', with card' : ''}) — ${created.uri}`);
