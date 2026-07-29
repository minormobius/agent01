#!/usr/bin/env node
// publish-lexicons.mjs — put the lab's lexicon schemas on the network.
//
//   node scripts/publish-lexicons.mjs --check       # validate, resolve, print. No writes.
//   node scripts/publish-lexicons.mjs --write       # publish to the service account's repo
//
//   BLUESKY_BOT_HANDLE / BLUESKY_BOT_APP_PASSWORD are required for --write.
//
// WHAT PUBLISHING A LEXICON MEANS. A schema in a repo is just JSON until two
// things are true, and the second one is the part people forget:
//
//   1. A com.atproto.lexicon.schema RECORD exists, whose rkey IS the NSID and
//      whose `id` field matches that rkey. This script writes those.
//   2. A DNS TXT record points at the DID that holds them. This script CANNOT
//      write that — it is a human step, once per namespace, and it is what
//      makes the schema authoritative rather than merely present.
//
// THE DNS NAME IS NOT THE OBVIOUS ONE. Resolution takes the NSID, drops the
// final segment, reverses the rest, and queries `_lexicon.<that>` — and it does
// not recurse up or down, so only the exact name works:
//
//   com.minomobi.lab.doc  →  authority com.minomobi.lab  →  lab.minomobi.com
//   →  TXT at  _lexicon.lab.minomobi.com  =  "did=did:plc:…"
//
// One record covers the whole com.minomobi.lab namespace, which is why both
// schemas sit under it. `lab.minomobi.com` is already a route on the lab worker,
// so the name is one we hold.
//
// WHY THE SERVICE ACCOUNT HOLDS THEM. did:plc:gd6m4mw3km2betcnbbs6362q is the
// account that owns the handle `minomobi.com` and posts as the factory. The
// schemas describe what the factory writes, so the same identity should assert
// them; anything else means the DNS record for minomobi's namespace points at
// an account with no visible relationship to minomobi.
//
// A LEXICON IS A PROMISE. Publishing says "records of this shape mean this".
// Changing a published schema in a way that invalidates existing records breaks
// every reader, including ones you do not know about — that is the whole point
// of putting it on the network. Add optional fields; do not repurpose or remove
// required ones. If a shape has to change incompatibly, it is a new NSID.

import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lexiconAuthority } from './lib/lexicon.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIR = join(ROOT, 'lab', 'lexicons');
const PDS = 'https://bsky.social/xrpc';
const COLLECTION = 'com.atproto.lexicon.schema';

const write = process.argv.includes('--write');
let bad = 0;
const fail = (m) => { bad++; console.error(`  ✘ ${m}`); };

const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
if (!files.length) { console.error(`no schemas in ${DIR}`); process.exit(2); }

const schemas = [];
for (const f of files) {
  const path = join(DIR, f);
  let doc;
  try { doc = JSON.parse(readFileSync(path, 'utf8')); } catch (err) {
    fail(`${f} is not valid JSON: ${err.message}`); continue;
  }
  const expected = basename(f, '.json');
  if (doc.lexicon !== 1) fail(`${f}: "lexicon" must be 1`);
  if (doc.id !== expected) fail(`${f}: "id" is ${JSON.stringify(doc.id)} but the filename says ${expected} — the record key IS the NSID and the id must match it`);
  if (!doc.defs?.main) fail(`${f}: no defs.main`);
  if (doc.defs?.main && !doc.defs.main.description) {
    fail(`${f}: defs.main has no description. A published schema is read by people who did not write it`);
  }
  const authority = lexiconAuthority(doc.id ?? expected);
  if (!authority) fail(`${f}: ${doc.id} is too short to have an authority`);
  schemas.push({ file: f, nsid: expected, doc, authority });
}

const authorities = [...new Set(schemas.map((s) => s.authority))];
console.log(`${schemas.length} schema(s) in lab/lexicons:`);
for (const s of schemas) console.log(`  ${s.nsid}`);
console.log('\nDNS records that must exist for these to resolve (human step, once):');
for (const a of authorities) console.log(`  _lexicon.${a}   TXT   "did=<the publishing DID>"`);

if (bad) { console.error(`\n${bad} problem(s) — nothing published`); process.exit(1); }
if (!write) {
  console.log('\n--check only. Pass --write to publish (needs BLUESKY_BOT_HANDLE / BLUESKY_BOT_APP_PASSWORD).');
  process.exit(0);
}

// --------------------------------------------------------------------- write
const handle = process.env.BLUESKY_BOT_HANDLE;
const password = process.env.BLUESKY_BOT_APP_PASSWORD;
if (!handle || !password) {
  console.error('\nBLUESKY_BOT_HANDLE and BLUESKY_BOT_APP_PASSWORD are required for --write');
  process.exit(2);
}

async function xrpc(method, endpoint, { token, body } = {}) {
  const res = await fetch(`${PDS}/${endpoint}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const session = await xrpc('POST', 'com.atproto.server.createSession', {
  body: { identifier: handle, password },
});
console.log(`\npublishing as @${session.handle} (${session.did})`);
console.log(`the DNS TXT value must therefore be:  did=${session.did}`);

for (const s of schemas) {
  // putRecord, not createRecord: the rkey IS the NSID, so republishing an
  // updated schema has to land on the same record rather than making a second.
  await xrpc('POST', 'com.atproto.repo.putRecord', {
    token: session.accessJwt,
    body: {
      repo: session.did,
      collection: COLLECTION,
      rkey: s.nsid,
      record: { $type: COLLECTION, lexicon: 1, id: s.nsid, defs: s.doc.defs },
    },
  });
  console.log(`  ✓ ${COLLECTION}/${s.nsid}`);
}
console.log(`\nPublished ${schemas.length}. They resolve once the DNS TXT record above exists.`);
