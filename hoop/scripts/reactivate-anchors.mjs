#!/usr/bin/env node
/* reactivate-anchors — PUT THE CAMPAIGN SPINE BACK IN THE LIVE POOL.
 *
 *   node hoop/scripts/reactivate-anchors.mjs --dry     # fetch + re-gate + print, no creds, no write
 *   HOOP_STORY_HANDLE=… HOOP_STORY_PASSWORD=… node hoop/scripts/reactivate-anchors.mjs
 *
 * hoopy's content runs tombstone the previous corpus in place. The 2026-09-16 run regenerated 781
 * keepers — every one of the 23 gate flags — and did not republish the four LOAD-BEARING ANCHORS
 * (Olo Vashti · Factor Solen · Sevin · Luna), the only records that CONSUME a gate. So the live pool
 * holds every gate in the world and nothing to turn one in at, and `prove-solvable` says `no_anchors`.
 *
 * `servePool` already grafts the carried anchors back (story/import.js graftSpineAnchors) so the game
 * plays. This script fixes it at the SOURCE instead: it writes those same records back to the service
 * repo with `status: 'active'`, at their original rkeys. Two reasons to prefer that when you can:
 *   • the pool becomes self-describing — anyone reading morphyx (hoopy's tooling, /quests, a future
 *     client) sees a complete world, not a world that needs our client to be whole;
 *   • the graft then STANDS DOWN on its own (it no-ops the moment a live load-bearing anchor exists),
 *     so this changes nothing about what the game serves. That is the point: what gets published is
 *     `spineAnchorsFor()` — byte-identical to what the graft was already serving.
 *
 * It is NOT a replacement for the graft, and the graft should not be removed after running it: the
 * NEXT run will tombstone these again (that is what a run does), and the graft is what keeps the game
 * playable in the window between that run and someone noticing.
 *
 * What gets published is re-gated against the live run, not the list the anchors were authored with —
 * and our own `seed-anchor-briefings` splices are dropped, because this run authors six setters for
 * every gate including the two that used to have none. Do not run seed-anchor-briefings after this.
 *
 * Runs where an app password lives (a GitHub Action / a laptop), NOT the sandbox — `--dry` works
 * anywhere. Refuses to write if a live load-bearing anchor already exists (hoopy republished a spine:
 * his wins) or if the login lands on a repo other than the service one.
 */
import { resolveHandle, resolvePds, PdsClient } from '../../packages/atproto/pds.js';
import { spineAnchorsFor, isTombstoned } from '../v110/story/import.js';
import { contentToRecord, CONTENT_NSID } from '../v110/story/atproto.js';
import { servePool } from '../v110/story/import.js';
import { proveProgression } from '../v110/story/solvable.js';

const SERVICE_DID = process.env.HOOP_SERVICE_DID || 'did:plc:yivyyp54vddf7qf2lpsikhe4';   // morphyx
const DRY = process.argv.includes('--dry');

async function listAll(pds) {
  const out = []; let cursor;
  do {
    const u = `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(SERVICE_DID)}&collection=${CONTENT_NSID}&limit=100`
      + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const j = await fetch(u).then((r) => r.json());
    if (j.error) throw new Error(`${j.error}: ${j.message || ''}`);
    out.push(...(j.records || []));
    cursor = j.cursor;
  } while (cursor);
  return out;   // [{ uri, value }]
}

async function main() {
  const pds = await resolvePds(SERVICE_DID);
  console.log(`service ${SERVICE_DID} @ ${pds}`);
  const records = await listAll(pds);
  // the engine's field-shape, `id` materialised from the rkey (atproto.js#recordToContent)
  const all = records.map((r) => { const { $type, ...rest } = r.value || {}; return { id: String(r.uri).split('/').pop(), ...rest }; });
  const live = all.filter((r) => !isTombstoned(r));
  console.log(`pool: ${all.length} records · ${live.length} live · ${all.length - live.length} tombstoned`);

  const toPublish = spineAnchorsFor(live);
  if (!toPublish.length) {
    const already = live.filter((r) => r.content && r.content.load_bearing);
    console.log(already.length
      ? `\nnothing to do — the live pool already carries ${already.length} load-bearing anchor(s): `
        + already.map((a) => `t${a.content.load_bearing.tier} ${(a.content.npc || {}).name || a.content.name}`).join(', ')
      : '\nnothing to do — the live pool sets no gate flags, so there is nothing for an anchor to gate on.');
    return;
  }

  console.log(`\n${toPublish.length} anchor(s) to reactivate (re-gated against the live run):`);
  for (const a of toPublish) {
    const was = all.find((r) => r.id === a.id);
    const npc = a.content.npc || {};
    console.log(`  t${a.content.load_bearing.tier} ${npc.name} — ${a.content.name} (${a.content.zone})`);
    console.log(`     rkey    ${a.id}   status ${was ? was.status : '(absent)'} → active`);
    console.log(`     gates   ${a.content.load_bearing.gates.length}: ${a.content.load_bearing.gates.join(', ')}`);
    const wasGates = ((was && was.content && was.content.load_bearing) || {}).gates || [];
    const dropped = wasGates.filter((g) => !a.content.load_bearing.gates.includes(g));
    const added = a.content.load_bearing.gates.filter((g) => !wasGates.includes(g));
    if (dropped.length) console.log(`     -gates  ${dropped.join(', ')}  (this run sets no keeper for them)`);
    if (added.length) console.log(`     +gates  ${added.join(', ')}  (new in this run)`);
    const wasNodes = Object.keys((((was || {}).content || {}).npc || {}).dialogue?.nodes || {});
    const nowNodes = Object.keys(npc.dialogue?.nodes || {});
    const gone = wasNodes.filter((n) => !nowNodes.includes(n));
    if (gone.length) console.log(`     -nodes  ${gone.join(', ')}  (obsolete anchor-briefing splices)`);
  }

  // Prove the pool we are about to create, before creating it.
  const after = servePool([...live, ...toPublish], { spineAnchors: false });
  const rep = proveProgression(after, { forcePlaced: true });
  console.log(`\nproof (live pool + these records, graft OFF): ${rep.verdict} · anchors ${rep.chain.length}`
    + ` (${rep.chain.map((a) => `t${a.tier} ${a.name}`).join(' → ')})`);
  for (const e of rep.errors) console.log(`  ✗ [t${e.tier}] ${e.code}${e.gate ? ' ' + e.gate : ''} — ${e.msg}`);
  if (!rep.solvable) { console.error('\nrefusing to write: the result would not be provably progressable.'); process.exit(1); }

  if (DRY) { console.log('\n--dry: nothing written.'); return; }

  const handle = process.env.HOOP_STORY_HANDLE, password = process.env.HOOP_STORY_PASSWORD;
  if (!handle || !password) { console.error('Set HOOP_STORY_HANDLE + HOOP_STORY_PASSWORD (app password), or pass --dry.'); process.exit(1); }
  const did = await resolveHandle(handle);
  if (did !== SERVICE_DID) { console.error(`refusing to write: ${handle} resolves to ${did}, not the service repo ${SERVICE_DID}.`); process.exit(1); }
  const client = new PdsClient(await resolvePds(did));
  await client.login(handle, password);
  console.log(`\nwriting as ${handle} (${did})`);
  for (const a of toPublish) {
    const { rkey, value } = contentToRecord(a);
    await client.putRecord(CONTENT_NSID, rkey, value);
    console.log(`  ✓ wrote ${rkey} (${(a.content.npc || {}).name})`);
  }
  console.log(`\n✓ reactivated ${toPublish.length} anchor(s). Re-run hoop/scripts/prove-solvable.mjs --strict:`
    + '\n  it should still PASS, and the graft in story/import.js now no-ops (a live anchor exists).');
}

main().catch((e) => { console.error('reactivate-anchors failed:', (e && e.message) || e); process.exit(1); });
