#!/usr/bin/env node
// bsky-hello.mjs — prove the service account's credentials work, and give it a
// profile that says what it is.
//
//   BLUESKY_HANDLE=… BLUESKY_APP_PASSWORD=… node scripts/bsky-hello.mjs [--post]
//
// Three jobs, in increasing order of consequence:
//
//   1. log in            — does the app password work at all?
//   2. reconcile profile — display name + description that DISCLOSE it is
//                          automated and name the operator. docs/LAB-FACTORY.md
//                          §11.4: there is no formal bot flag in the API, so
//                          disclosure in the profile is the available mechanism,
//                          and it is the single cheapest thing that keeps an
//                          automated account from reading as a spam account.
//   3. first post        — the launch. Needs --post AND an empty account.
//
// Steps 1 and 2 always run and are safe to repeat. Step 3 is not: the first post
// is what makes the account public.
//
// TWO CONDITIONS, DELIBERATELY. --post is intent, supplied by the workflow only
// when ANNOUNCE is true. postsCount === 0 is absence. The count alone was the
// original guard and it is the wrong kind: the hello post was published and then
// deleted ON PURPOSE, to keep the account unlaunched — which made the guard true
// again and would have re-posted it. A check that undoes a deliberate decision is
// not a safety check. Absence is evidence; it is not permission.

const PDS = 'https://bsky.social/xrpc';
const APPVIEW = 'https://public.api.bsky.app/xrpc';

const OPERATOR = 'minormobius.bsky.social';

const DISPLAY_NAME = 'mino lab (bot)';

const DESCRIPTION = [
  'Automated. Builds small static websites on request and publishes them at minomobi.com/<name>/.',
  '',
  `Operated by @${OPERATOR}. Allowlisted accounts only.`,
  'Source and guardrails: github.com/minormobius/agent01',
].join('\n');

// Deliberately plain. An account whose first post oversells itself is the shape
// people mute. Says what it does, who runs it, that it is automated, and that
// not everyone can trigger it.
const FIRST_POST = [
  'hello — i build small websites on request and publish them to minomobi.com',
  '',
  `automated, run by @${OPERATOR}. mention me with a task and a name; the site is yours at that name, permanently.`,
  '',
  'allowlisted accounts for now. code: github.com/minormobius/agent01',
].join('\n');

const post = process.argv.includes('--post');

async function xrpc(base, method, { token, body, params } = {}) {
  const url = new URL(`${base}/${method}`);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${res.status}: ${json.error || ''} ${json.message || ''}`.trim());
  return json;
}

/** Rich-text facets, by byte offset — without these a URL is inert text and a
 *  @handle is not a link. Offsets are into the UTF-8 encoding, not the string,
 *  which is why everything below goes through Buffer. */
function facets(text, links, mentions) {
  const buf = Buffer.from(text, 'utf8');
  const out = [];
  const at = (needle) => {
    const i = buf.indexOf(Buffer.from(needle, 'utf8'));
    if (i === -1) throw new Error(`facet target not found in text: ${needle}`);
    if (buf.indexOf(Buffer.from(needle, 'utf8'), i + 1) !== -1) {
      throw new Error(`facet target is ambiguous (appears twice): ${needle}`);
    }
    return { byteStart: i, byteEnd: i + Buffer.byteLength(needle, 'utf8') };
  };
  for (const [needle, uri] of Object.entries(links)) {
    out.push({ index: at(needle), features: [{ $type: 'app.bsky.richtext.facet#link', uri }] });
  }
  for (const [needle, did] of Object.entries(mentions)) {
    out.push({ index: at(needle), features: [{ $type: 'app.bsky.richtext.facet#mention', did }] });
  }
  return out.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

const handle = process.env.BLUESKY_HANDLE;
const password = process.env.BLUESKY_APP_PASSWORD;
if (!handle || !password) {
  console.error('::error::BLUESKY_HANDLE / BLUESKY_APP_PASSWORD are not set.');
  console.error('They come from GitHub secrets BLUESKY_BOT_HANDLE / BLUESKY_BOT_APP_PASSWORD.');
  process.exit(1);
}

// --- 1. log in -------------------------------------------------------------
let session;
try {
  session = await xrpc(PDS, 'com.atproto.server.createSession', {
    body: { identifier: handle, password },
  });
} catch (e) {
  console.error(`::error::login failed — ${e.message}`);
  console.error('::error::If this says "Invalid identifier or password", the secret is likely the');
  console.error('::error::ACCOUNT password rather than an app password, or the handle changed.');
  process.exit(1);
}
console.log(`✓ logged in as ${session.handle} (${session.did})`);
if (session.handle !== handle) {
  console.log(`::warning::secret says "${handle}" but the account answers to "${session.handle}" — update BLUESKY_BOT_HANDLE`);
}

const profile = await xrpc(APPVIEW, 'app.bsky.actor.getProfile', { params: { actor: session.did } });
console.log(`  posts=${profile.postsCount ?? 0} followers=${profile.followersCount ?? 0} follows=${profile.followsCount ?? 0}`);

// --- 2. profile ------------------------------------------------------------
const operatorDid = (await xrpc(APPVIEW, 'com.atproto.identity.resolveHandle', { params: { handle: OPERATOR } })).did;

let existing = null;
try {
  existing = await xrpc(PDS, 'com.atproto.repo.getRecord', {
    token: session.accessJwt,
    params: { repo: session.did, collection: 'app.bsky.actor.profile', rkey: 'self' },
  });
} catch { /* no profile record yet — normal for a fresh account */ }

const current = existing?.value || {};
if (current.displayName === DISPLAY_NAME && current.description === DESCRIPTION) {
  console.log('✓ profile already correct — no write');
} else {
  await xrpc(PDS, 'com.atproto.repo.putRecord', {
    token: session.accessJwt,
    body: {
      repo: session.did,
      collection: 'app.bsky.actor.profile',
      rkey: 'self',
      record: {
        ...current,                       // keep avatar/banner if they exist
        $type: 'app.bsky.actor.profile',
        displayName: DISPLAY_NAME,
        description: DESCRIPTION,
      },
      ...(existing?.cid ? { swapRecord: existing.cid } : {}),
    },
  });
  console.log(`✓ profile set — "${DISPLAY_NAME}"`);
}

// --- 3. first post ---------------------------------------------------------
if (!post) {
  console.log('— not announcing: no --post, so the account stays silent');
  console.log('  Set ANNOUNCE: \'true\' in .github/workflows/bsky-hello.yml to launch.');
  process.exit(0);
}
if ((profile.postsCount ?? 0) > 0) {
  console.log(`— account already has ${profile.postsCount} post(s); not posting again`);
  process.exit(0);
}

const len = [...FIRST_POST].length;
if (len > 300) {
  console.error(`::error::post is ${len} graphemes, limit is 300`);
  process.exit(1);
}

const record = {
  $type: 'app.bsky.feed.post',
  text: FIRST_POST,
  createdAt: new Date().toISOString(),
  facets: facets(
    FIRST_POST,
    {
      'minomobi.com': 'https://minomobi.com',
      'github.com/minormobius/agent01': 'https://github.com/minormobius/agent01',
    },
    { [`@${OPERATOR}`]: operatorDid },
  ),
};

const created = await xrpc(PDS, 'com.atproto.repo.createRecord', {
  token: session.accessJwt,
  body: { repo: session.did, collection: 'app.bsky.feed.post', record },
});
const rkey = created.uri.split('/').pop();
console.log(`✓ posted (${len} chars) — https://bsky.app/profile/${session.handle}/post/${rkey}`);
console.log(`  uri: ${created.uri}`);
