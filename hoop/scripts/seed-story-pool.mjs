#!/usr/bin/env node
/* seed-story-pool — publish the hand-authored story pool (hoop/story/pool.json) to a SERVICE repo as
   com.minomobi.hoop.story.content records. This makes ATProto the source of truth for the pool: the
   engine then loads it via listRecords (the bundled pool.json stays as the offline fallback + seed).
   Idempotent — putRecord(rkey = content id) overwrites, so re-running re-publishes in place.

   Runs where an app password lives (a GitHub Action or a laptop), NOT the sandbox. Identity resolves
   at runtime so it follows a PDS migration.

   Usage:
     HOOP_STORY_HANDLE=hoopstory.bsky.social HOOP_STORY_PASSWORD=xxxx \
       node hoop/scripts/seed-story-pool.mjs            # writes
     node hoop/scripts/seed-story-pool.mjs --dry        # build + print, no creds needed
*/
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { resolveHandle, resolvePds, PdsClient } from '../../packages/atproto/pds.js';
import { CONTENT_NSID, contentToRecord } from '../story/atproto.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

function flattenPool(poolJson) {
  const out = [];
  for (const [k, v] of Object.entries(poolJson)) { if (k.startsWith('_') || !Array.isArray(v)) continue; for (const ci of v) out.push(ci); }
  return out;
}

const pool = flattenPool(JSON.parse(readFileSync(join(ROOT, 'story/pool.json'), 'utf8')));
const records = pool.map(contentToRecord);
console.log(`story pool: ${records.length} ${CONTENT_NSID} records`);

if (DRY) {
  for (const r of records) console.log(`  ${r.rkey.padEnd(16)} ${r.value.type.padEnd(14)} ${(r.value.content && r.value.content.name) || ''}`);
  console.log('\n--dry: nothing written.');
  process.exit(0);
}

const handle = process.env.HOOP_STORY_HANDLE, password = process.env.HOOP_STORY_PASSWORD;
if (!handle || !password) { console.error('Set HOOP_STORY_HANDLE + HOOP_STORY_PASSWORD (app password), or pass --dry.'); process.exit(1); }

const did = await resolveHandle(handle);
const pds = await resolvePds(did);
const client = new PdsClient(pds);
await client.login(handle, password);
console.log(`seeding as ${handle} (${did}) @ ${pds}`);

let n = 0;
for (const r of records) {
  await client.putRecord(CONTENT_NSID, r.rkey, r.value);
  process.stdout.write(`\r  wrote ${++n}/${records.length}`);
}
console.log(`\n✓ seeded ${n} content records to ${did}`);
console.log(`  set STORY_SERVICE in hoop/v3 to { did: '${did}', pds: '${pds}' } to source the pool live.`);
