#!/usr/bin/env node
// port-skyfeed — lift a live SkyFeed feed onto hose.mino.mobi.
//
//   node workers/hose/port-skyfeed.mjs <at-uri | bsky.app feed url> [--video] [--out DIR]
//
// Reads the feed's `app.bsky.feed.generator` record off its owner's PDS,
// converts the `skyfeedBuilder` to a feedgen definition, and writes the two
// records that make it real. Read-only against the network — it never writes to
// a PDS, because that is the owner's call and needs their credentials.
//
//   --video   append a "no video" filter, the thing SkyFeed never shipped
//   --out     where to write the records (default: alongside, ./ported/)

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fromSkyfeed, parseFeedRef } from '../../packages/feedgen/skyfeed.js';

const SERVICE_DID = 'did:web:hose.mino.mobi';
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ref = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out');

if (!ref) {
  console.error('usage: node workers/hose/port-skyfeed.mjs <at-uri | bsky.app feed url> [--video] [--out DIR]');
  process.exit(2);
}

async function resolveDid(actor) {
  if (actor.startsWith('did:')) return actor;
  const r = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
  if (!r.ok) throw new Error(`could not resolve handle ${actor}`);
  return (await r.json()).did;
}

async function resolvePds(did) {
  if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length).replace(/:/g, '/');
    const r = await fetch(`https://${host}/.well-known/did.json`);
    if (!r.ok) throw new Error(`did:web doc unreachable for ${did}`);
    const doc = await r.json();
    return (doc.service || []).find((s) => s.id === '#atproto_pds')?.serviceEndpoint;
  }
  const r = await fetch(`https://plc.directory/${did}`);
  if (!r.ok) throw new Error(`plc.directory has no ${did}`);
  const doc = await r.json();
  const svc = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
  if (!svc) throw new Error(`no PDS in the DID document for ${did}`);
  return svc.serviceEndpoint;
}

const parsed = parseFeedRef(ref);
if (!parsed) { console.error(`not a feed reference: ${ref}`); process.exit(2); }

const did = await resolveDid(parsed.repo);
const pds = await resolvePds(did);
const r = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord`
  + `?repo=${encodeURIComponent(did)}&collection=app.bsky.feed.generator&rkey=${encodeURIComponent(parsed.rkey)}`);
if (!r.ok) { console.error(`no feed record ${parsed.rkey} in ${did} (HTTP ${r.status})`); process.exit(1); }
const record = (await r.json()).value;

const { def, warnings } = fromSkyfeed(record);
if (!def) { console.error(`cannot port: ${warnings[0]}`); process.exit(1); }

if (flag('--video')) {
  def.filters.push({ type: 'media', has: ['video'], mode: 'none' });
}

const outDir = val('--out', join(process.cwd(), 'ported'));
mkdirSync(outDir, { recursive: true });
const now = new Date().toISOString();

const defRecord = { $type: 'com.minomobi.feedgen.def', ...def, createdAt: record.createdAt || now };
const genRecord = { ...record, did: SERVICE_DID };
delete genRecord.skyfeedBuilder;   // the native def supersedes it; leaving both invites drift

const defPath = join(outDir, `${parsed.rkey}.def.json`);
const genPath = join(outDir, `${parsed.rkey}.generator.json`);
writeFileSync(defPath, JSON.stringify(defRecord, null, 2));
writeFileSync(genPath, JSON.stringify(genRecord, null, 2));

console.log(`\n${record.displayName}  (${did}/${parsed.rkey})`);
console.log(`  currently served by : ${record.did}`);
console.log(`  after porting       : ${SERVICE_DID}`);
console.log(`  blocks → filters    : ${(record.skyfeedBuilder.blocks || []).length} → ${def.filters.length}`);
console.log(`  inputs              : ${def.inputs.map((i) => i.type + (i.seconds ? ` (${i.seconds}s)` : '')).join(', ') || 'none'}`);
if (flag('--video')) console.log('  video filter        : added');
console.log(warnings.length ? `  warnings            : ${warnings.length}` : '  warnings            : none');
for (const w of warnings) console.log(`      · ${w}`);
console.log(`\nwrote:\n  ${defPath}\n  ${genPath}`);
console.log(`
To make it live, write both records to your own PDS with the rkey "${parsed.rkey}":

  com.minomobi.feedgen.def/${parsed.rkey}      ← the definition
  app.bsky.feed.generator/${parsed.rkey}       ← repointed at ${SERVICE_DID}

The feed keeps its URL, its likes and its subscribers — only the service
answering for it changes. hose.mino.mobi starts ingesting within a minute and
the ring fills from there; it does not backfill, so give it a little while
before judging how full it looks.
`);
