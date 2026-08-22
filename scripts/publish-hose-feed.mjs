#!/usr/bin/env node
// publish-hose-feed — put a hose-backed feed on the network under a service
// account, so it can be looked at and iterated on without anyone having to
// hand-write records to their own PDS.
//
//   node scripts/publish-hose-feed.mjs workers/hose/feeds/<name>.json [--dry-run]
//
// WRITES TO A REAL PDS. Idempotent: both halves are putRecord at a fixed rkey,
// so a re-run converges rather than piling up feeds.
//
// The feed's FILTERS are not stored in this repo. The config names a `source`
// feed, and the definition is read off that feed's live record and converted at
// publish time. Two reasons, and the second is the one that decided it:
//
//   1. the published feed tracks its source — edit the SkyFeed original and
//      re-run, rather than keeping two copies in sync by hand;
//   2. txt for airports filters on a blocklist that is, necessarily, a list of
//      slurs. It is a content filter doing its job, but it does not need to be
//      committed to a repo to do it.
//
// `addFilters` in the config is the delta this repo *does* own — the video
// filter SkyFeed never had.

import { readFileSync } from 'node:fs';
import { fromSkyfeed, parseFeedRef } from '../packages/feedgen/skyfeed.js';

const SERVICE_DID = 'did:web:hose.mino.mobi';
const ENTRY = 'https://bsky.social';
const DEF_COLLECTION = 'com.minomobi.feedgen.def';
const GEN_COLLECTION = 'app.bsky.feed.generator';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const configPath = args.find((a) => !a.startsWith('--'));
if (!configPath) {
  console.error('usage: node scripts/publish-hose-feed.mjs <config.json> [--dry-run]');
  process.exit(2);
}

const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
for (const k of ['rkey', 'publisher', 'source', 'displayName']) {
  if (!cfg[k]) { console.error(`config is missing "${k}"`); process.exit(2); }
}

async function xrpc(base, method, { body, token, params } = {}) {
  const u = new URL(`${base}/xrpc/${method}`);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(u, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} → HTTP ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function resolvePds(did) {
  const r = await fetch(`https://plc.directory/${did}`);
  if (!r.ok) throw new Error(`plc.directory has no ${did}`);
  const doc = await r.json();
  const svc = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
  if (!svc) throw new Error(`no PDS in the DID document for ${did}`);
  return svc.serviceEndpoint;
}

// ── 1. read the source feed and convert it ───────────────────────────────────

const ref = parseFeedRef(cfg.source);
if (!ref) { console.error(`config.source is not a feed reference: ${cfg.source}`); process.exit(2); }
if (!ref.repo.startsWith('did:')) { console.error('config.source must use a DID, not a handle'); process.exit(2); }

const sourcePds = await resolvePds(ref.repo);
const sourceRec = (await xrpc(sourcePds, 'com.atproto.repo.getRecord', {
  params: { repo: ref.repo, collection: GEN_COLLECTION, rkey: ref.rkey },
})).value;

const { def, warnings } = fromSkyfeed(sourceRec);
if (!def) { console.error(`cannot convert source feed: ${warnings[0]}`); process.exit(1); }

for (const f of cfg.addFilters || []) def.filters.push(f);
def.name = cfg.displayName;
def.description = cfg.description || '';

console.log(`source        : ${cfg.source}`);
console.log(`  blocks      : ${(sourceRec.skyfeedBuilder.blocks || []).length}`);
console.log(`  filters     : ${def.filters.length} (${(cfg.addFilters || []).length} added by this repo)`);
console.log(`  inputs      : ${def.inputs.map((i) => i.type + (i.seconds ? ` ${i.seconds}s` : '')).join(', ')}`);
console.log(`  warnings    : ${warnings.length || 'none'}`);
for (const w of warnings) console.log(`      · ${w}`);

if (!def.inputs.some((i) => i.type === 'firehose')) {
  console.error('\nthis feed has no firehose input, so hose.mino.mobi would never ingest for it');
  process.exit(1);
}

// ── 2. publish under the service account ─────────────────────────────────────

const HANDLE = process.env[`BLUESKY_${cfg.publisher.toUpperCase()}_HANDLE`];
const PASSWORD = process.env[`BLUESKY_${cfg.publisher.toUpperCase()}_APP_PASSWORD`];

if (dryRun) {
  console.log('\n--dry-run: converted cleanly, nothing written');
  process.exit(0);
}
if (!HANDLE || !PASSWORD) {
  console.error(`\nmissing BLUESKY_${cfg.publisher.toUpperCase()}_HANDLE / _APP_PASSWORD`);
  process.exit(1);
}

const session = await xrpc(ENTRY, 'com.atproto.server.createSession', {
  body: { identifier: HANDLE, password: PASSWORD },
});
const did = session.did;
const token = session.accessJwt;
// The DID is public and derived, so it is safe to log — unlike the handle,
// which GitHub masks anyway because it is the secret that was passed in.
console.log(`\npublishing as : ${did}`);

// Preserve createdAt across re-runs so the feed does not appear to be new.
let existingCreatedAt = null;
try {
  const prev = await xrpc(ENTRY, 'com.atproto.repo.getRecord', {
    params: { repo: did, collection: GEN_COLLECTION, rkey: cfg.rkey },
  });
  existingCreatedAt = prev.value && prev.value.createdAt;
} catch { /* first publish */ }
const createdAt = existingCreatedAt || new Date().toISOString();

await xrpc(ENTRY, 'com.atproto.repo.putRecord', {
  token,
  body: {
    repo: did, collection: DEF_COLLECTION, rkey: cfg.rkey,
    record: { $type: DEF_COLLECTION, ...def, createdAt },
  },
});
console.log(`  ✓ ${DEF_COLLECTION}/${cfg.rkey}`);

await xrpc(ENTRY, 'com.atproto.repo.putRecord', {
  token,
  body: {
    repo: did, collection: GEN_COLLECTION, rkey: cfg.rkey,
    record: {
      $type: GEN_COLLECTION,
      did: SERVICE_DID,
      displayName: cfg.displayName.slice(0, 240),
      description: (cfg.description || '').slice(0, 300),
      createdAt,
    },
  },
});
console.log(`  ✓ ${GEN_COLLECTION}/${cfg.rkey} → ${SERVICE_DID}`);

console.log(`\nfeed uri      : at://${did}/${GEN_COLLECTION}/${cfg.rkey}`);
console.log(`open it       : https://bsky.app/profile/${did}/feed/${cfg.rkey}`);
console.log(`\nhose ingests for it on its next wake (hourly). The ring starts empty and`);
console.log(`fills from live samples — give it a few hours before judging how full it looks.`);
