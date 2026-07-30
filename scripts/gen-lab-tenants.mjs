#!/usr/bin/env node
// gen-lab-tenants.mjs — build the tenant manifest the lab landing page reads.
//
// Every lab site is one subdirectory of lab/www/. The landing page renders its
// listing from ./tenants.json, which this script writes by listing them.
//
// tenants.json is a BUILD ARTEFACT, not a committed file — the deploy workflow
// runs this immediately before `wrangler deploy`, so the listing can never drift
// from what is actually on disk, and an agent adding a site never has to
// remember to regenerate anything. It is gitignored for the same reason.
//
//   node scripts/gen-lab-tenants.mjs            # lab/www
//   node scripts/gen-lab-tenants.mjs <dir>      # somewhere else
//
// Sorted by name so the listing is stable between deploys. There is no capacity
// and no eviction: names are permanent (docs/LAB-FACTORY.md §11.1).

import { readdirSync, readFileSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';

const SITE_DIR = process.argv[2] || 'lab/www';
const KIT_SRC = 'lab/_kit';
const REQUESTS = process.argv[3] || '.github/lab-requests';

// A site name must be a plain lowercase token — the same shape the landing page
// interpolates into a relative href, and the same shape lab-build.yml validates
// before it becomes a path segment. The leading-alphanumeric requirement also
// excludes the underscore-prefixed infrastructure dirs (_kit), which are not
// sites and must never be listed as one.
const SLUG = /^[a-z0-9][a-z0-9-]{0,30}$/;

// --- the request metadata -------------------------------------------------
//
// Each site has a .github/lab-requests/<slug>.json from the build that made it:
// who asked, when, and the Bluesky thread they asked in. The landing page shows
// the first two and links the third, which is what turns "request a change"
// into a reply on the thread that already exists rather than a second channel.
//
// THREE FIELDS OUT OF THAT FILE, AND NOT ONE MORE. The rest of it is `task` and
// `refs_from` — the requester's words plus a transcript of everyone else in the
// thread, quoted verbatim, from strangers. That is exactly the content
// lab/www/_headers exists to keep off this domain, and putting it on the front
// page would republish it under the factory's name. The page renders a handle,
// a date, and a link.
//
// NOTHING FROM THE FILE REACHES AN href. The thread URL is BUILT from a DID and
// an rkey that each had to match a pattern first, so a malformed or hostile
// value yields null rather than a link somewhere else. Validating a URL you were
// handed is a losing game; constructing one from validated parts is not.
const DID = /^did:(plc|web):[a-zA-Z0-9._:%-]{1,250}$/;
const RKEY = /^[A-Za-z0-9._~-]{1,512}$/;
const HANDLE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** at://did:plc:abc/app.bsky.feed.post/3kx → https://bsky.app/profile/did:plc:abc/post/3kx */
export function threadUrl(atUri) {
  if (typeof atUri !== 'string') return null;
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)$/.exec(atUri);
  if (!m) return null;
  const [, did, rkey] = m;
  if (!DID.test(did) || !RKEY.test(rkey)) return null;
  return `https://bsky.app/profile/${did}/post/${rkey}`;
}

export function readRequest(dir, slug) {
  const path = join(dir, `${slug}.json`);
  // A site with no request file is normal, not an error: the earliest tenants
  // predate the ledger. It lists with nulls and the page omits the byline.
  if (!existsSync(path)) return { requester: null, requestedAt: null, thread: null };
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    console.log(`  ! ${path}: not JSON — listing ${slug} without metadata`);
    return { requester: null, requestedAt: null, thread: null };
  }
  const requester = typeof raw.requester === 'string' && HANDLE.test(raw.requester)
    ? raw.requester : null;
  // Date, not datetime: the page shows a day, and the clock time is noise.
  const at = typeof raw.requestedAt === 'string' ? Date.parse(raw.requestedAt) : NaN;
  const requestedAt = Number.isNaN(at) ? null : new Date(at).toISOString().slice(0, 10);
  return {
    requester,
    requestedAt,
    thread: threadUrl(raw.thread_root) || threadUrl(raw.root_uri),
  };
}

export function listTenants(siteDir = SITE_DIR, requestsDir = REQUESTS) {
  return readdirSync(siteDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && SLUG.test(e.name))
    .map((e) => ({ name: e.name, ...readRequest(requestsDir, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Importable for the selftest, which needs threadUrl and readRequest without
// writing a manifest or copying a kit. Same guard idiom as ideas-gate.mjs.
if (process.argv[1] && process.argv[1].endsWith('gen-lab-tenants.mjs')) {
  if (!existsSync(SITE_DIR)) {
    console.error(`  ! ${SITE_DIR}: no such directory`);
    process.exit(1);
  }
  const tenants = listTenants();

  // Copy the shared kit in. It lives once at lab/_kit/ and is served at
  // minomobi.com/_kit/, so sites LINK it same-origin instead of each inlining a
  // fork — one edit re-skins every site. Copied at deploy time rather than
  // committed here so there is exactly one source of truth.
  if (existsSync(KIT_SRC)) {
    cpSync(KIT_SRC, join(SITE_DIR, '_kit'), { recursive: true });
    console.log(`  ✓ ${SITE_DIR}/_kit — shared style guide`);
  } else {
    console.log(`  ! ${KIT_SRC} missing — sites linking ../_kit/ will 404`);
    process.exitCode = 1;
  }

  writeFileSync(
    join(SITE_DIR, 'tenants.json'),
    JSON.stringify({ tenants }, null, 2) + '\n',
  );
  const withMeta = tenants.filter((t) => t.requester).length;
  console.log(`  ✓ ${SITE_DIR}/tenants.json — ${tenants.length} sites, ${withMeta} with a requester`);
}
