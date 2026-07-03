#!/usr/bin/env node
// prove-solvable.mjs — run the quest solvability oracle over the LIVE story pool.
//
//   node hoop/scripts/prove-solvable.mjs             # fetch morphyx's pool, prove the campaign
//   node hoop/scripts/prove-solvable.mjs --strict    # tier-filter defects are ERRORs (no-bypass mode)
//   node hoop/scripts/prove-solvable.mjs --json      # machine-readable report
//
// Exits non-zero when the campaign is NOT provably progressable, so this can gate a content publish
// (seed-hoop-pool / seed-story) the same way the selftests gate a deploy. The v101 surface force-places
// tier-invisible keepers (requiredKeeperIds), so the default run treats those as WARNs; --strict shows
// what a surface WITHOUT the bypass would suffer.
//
// Read-only: public listRecords against the service PDS. No secrets.

import { servePool } from '../v101/story/import.js';
import { proveProgression } from '../v101/story/solvable.js';

const SERVICE_DID = process.env.HOOP_SERVICE_DID || 'did:plc:yivyyp54vddf7qf2lpsikhe4';   // morphyx
const NSID = 'com.minomobi.hoop.story.content';
const strict = process.argv.includes('--strict');
const asJson = process.argv.includes('--json');

async function main() {
  const doc = await fetch('https://plc.directory/' + SERVICE_DID).then((r) => r.json());
  const svc = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
  if (!svc) throw new Error('no PDS in DID doc for ' + SERVICE_DID);
  const pds = svc.serviceEndpoint;

  const raw = [];
  let cursor;
  do {
    const u = `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(SERVICE_DID)}&collection=${NSID}&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const j = await fetch(u).then((r) => r.json());
    raw.push(...(j.records || []).map((r) => r.value));
    cursor = j.cursor;
  } while (cursor);

  const served = servePool(raw);
  const rep = proveProgression(served, { forcePlaced: !strict });

  if (asJson) { console.log(JSON.stringify({ records: raw.length, served: served.length, ...rep }, null, 2)); }
  else {
    console.log(`pool: ${raw.length} records → ${served.length} served · anchors: ${rep.chain.length} (${rep.chain.map((a) => `t${a.tier} ${a.name}`).join(' → ')})`);
    console.log(`verdict: ${rep.verdict}${strict ? ' (strict: no force-place bypass)' : ''}`);
    for (const i of rep.issues) console.log(`  ${i.level === 'error' ? '✗' : '⚠'} [t${i.tier}] ${i.code}${i.gate ? ' ' + i.gate : ''} — ${i.msg}`);
    if (rep.solvable) console.log('✓ the campaign is provably progressable end to end');
  }
  process.exit(rep.solvable ? 0 : 1);
}

main().catch((e) => { console.error('prove-solvable failed:', e && e.message || e); process.exit(2); });
