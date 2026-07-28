#!/usr/bin/env node
/* seed-hoop-pool — publish hoopy's 600-beat corpus (hoop/v097/story/world_export.json) to a SERVICE repo
   as com.minomobi.hoop.story.content records. This is the "intended fashion": ATProto is the source of
   truth for the pool, and the game READS it live with listRecords (the bundled world_export.json stays as
   the offline fallback, byte-identical to the engine). Idempotent — putRecord(rkey = content id) overwrites,
   so re-running re-publishes in place rather than duplicating.

   The records are stored in the engine's NORMALIZED content_item shape (importWorldExport → contentToRecord),
   so loadPool() returns exactly what importWorldExport(world_export.json) returns — authored, generated and
   repo-sourced content are interchangeable.

   Runs where an app password lives (a GitHub Action or a laptop), NOT the sandbox. Identity resolves at
   runtime so it follows a PDS migration. Default service account: morphyx (the same repo the game reads).

   Usage:
     HOOP_STORY_HANDLE=morphyxmino.bsky.social HOOP_STORY_PASSWORD=xxxx \
       node hoop/scripts/seed-hoop-pool.mjs            # writes
     node hoop/scripts/seed-hoop-pool.mjs --dry        # build + print, no creds needed
*/
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { resolveHandle, resolvePds, PdsClient } from '../../packages/atproto/pds.js';
import { CONTENT_NSID, contentToRecord } from '../v097/story/atproto.js';
import { importWorldExport } from '../v097/story/import.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const EXPORT_PATH = join(ROOT, 'v097/story/world_export.json');

const pool = importWorldExport(JSON.parse(readFileSync(EXPORT_PATH, 'utf8'))).content;
const records = pool.map(contentToRecord);
const byType = {};
for (const r of records) byType[r.value.type] = (byType[r.value.type] || 0) + 1;
console.log(`hoop story pool: ${records.length} ${CONTENT_NSID} records`, JSON.stringify(byType));

if (DRY) {
  for (const r of records) console.log(`  ${r.rkey.padEnd(38)} ${String(r.value.type).padEnd(14)} ${(r.value.content && r.value.content.name) || ''}`);
  console.log('\n--dry: nothing written.');
  process.exit(0);
}

const handle = process.env.HOOP_STORY_HANDLE || process.env.HOOP_HANDLE;
const password = process.env.HOOP_STORY_PASSWORD || process.env.HOOP_PASSWORD;
if (!handle || !password) { console.error('Set HOOP_STORY_HANDLE + HOOP_STORY_PASSWORD (app password), or pass --dry.'); process.exit(1); }

const did = await resolveHandle(handle);
if (!did) throw new Error(`could not resolve handle: ${handle}`);
const pds = await resolvePds(did);
if (!pds) throw new Error(`could not resolve PDS for ${did}`);
const client = new PdsClient(pds);
await client.login(handle, password);
console.log(`seeding as ${handle} (${did}) @ ${pds}`);

let n = 0, fail = 0;
for (const r of records) {
  try { await client.putRecord(CONTENT_NSID, r.rkey, r.value); process.stdout.write(`\r  wrote ${++n}/${records.length}`); }
  catch (e) { fail++; console.error(`\n  ✗ ${r.rkey}: ${e.message}`); }
}
console.log(`\n✓ seeded ${n}/${records.length} content records to ${did}${fail ? ` (${fail} failed)` : ''}`);
console.log(`  the game reads these live: STORY_SERVICE.did = '${did}' in hoop/v097/index.html`);
