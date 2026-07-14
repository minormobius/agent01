#!/usr/bin/env node
/* seed-anchor-briefings — splice the AUTHORED anchor briefings (hoop/story/anchor-briefings.json) into the
   live load-bearing anchor records on the service repo, so each anchor SETS the one turn-in gate that no
   keeper in the pool provides. Fixes the two `gate_no_setter` errors the solvability oracle reports
   (flag.rind.rindwalker_scale_a on Sevin/t3, flag.signal.chamber_key on Luna/t4) with real content instead
   of the runtime waiver — the campaign becomes PROVABLY progressable end to end.

   HOW: fetch each anchor's current com.minomobi.hoop.story.content record, add a new `briefing` CHOICE to its
   greet node (whose effects.set_facts sets the ungated gate) plus the node it goes to, and putRecord it back
   in place (rkey unchanged). IDEMPOTENT + non-destructive: it only ADDS the briefing (skips if the gate is
   already set anywhere in the anchor's dialogue), preserving every other field hoopy authored/generated.

   Runs where an app password lives (a GitHub Action / a laptop), NOT the sandbox. Identity resolves at
   runtime. Default service account: morphyx (the repo the game reads).

     HOOP_STORY_HANDLE=morphyxmino.bsky.social HOOP_STORY_PASSWORD=xxxx node hoop/scripts/seed-anchor-briefings.mjs
     node hoop/scripts/seed-anchor-briefings.mjs --dry        # fetch + patch + print, no creds, no write
*/
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { resolveHandle, resolvePds, PdsClient } from '../../packages/atproto/pds.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const NSID = 'com.minomobi.hoop.story.content';
const SERVICE_DID = process.env.HOOP_SERVICE_DID || 'did:plc:yivyyp54vddf7qf2lpsikhe4';   // morphyx

const briefings = JSON.parse(readFileSync(join(ROOT, 'story/anchor-briefings.json'), 'utf8'));
const GATES = Object.keys(briefings).filter((k) => !k.startsWith('_'));

const dialogueOf = (v) => (v && v.content && v.content.npc && v.content.npc.dialogue)
  || (v && v.content && v.content.dialogue) || null;
// does ANY choice in this dialogue already set `flag`?
function alreadySets(dlg, flag) {
  for (const node of Object.values((dlg && dlg.nodes) || {}))
    for (const ch of (node.choices || []))
      if (Object.prototype.hasOwnProperty.call((ch.effects && ch.effects.set_facts) || {}, flag)) return true;
  return false;
}
// splice the briefing choice + its node into the anchor's dialogue. Returns true if it changed anything.
function spliceBriefing(v, flag, brief) {
  const dlg = dialogueOf(v);
  if (!dlg || !dlg.nodes) throw new Error('anchor record has no dialogue.nodes');
  if (alreadySets(dlg, flag)) return false;                     // idempotent
  const start = dlg.start || 'greet';
  const greet = dlg.nodes[start];
  if (!greet) throw new Error('anchor dialogue has no start node "' + start + '"');
  const nodeId = brief.nodeId || ('brief_' + flag.split('.').pop());
  dlg.nodes[nodeId] = {
    says: brief.says,
    choices: [{ id: 'go', text: brief.goText || '(go)', effects: { end: true } }],
  };
  greet.choices = greet.choices || [];
  // prepend so it's the first thing offered (the anchor briefs you before anything else)
  greet.choices.unshift({ id: nodeId, goto: nodeId, text: brief.choiceText, effects: { set_facts: { [flag]: true } } });
  return true;
}

async function listAll(pds) {
  const out = []; let cursor;
  do {
    const u = `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(SERVICE_DID)}&collection=${NSID}&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const j = await fetch(u).then((r) => r.json());
    out.push(...(j.records || []));
    cursor = j.cursor;
  } while (cursor);
  return out;   // [{ uri, value }]
}

async function main() {
  const pds = await resolvePds(SERVICE_DID);
  console.log(`service ${SERVICE_DID} @ ${pds}`);
  const records = await listAll(pds);
  const anchors = records.filter((r) => r.value && r.value.content && r.value.content.load_bearing);
  console.log(`pool: ${records.length} records · ${anchors.length} load-bearing anchors`);

  const patched = [];   // { rkey, value, flag, brief }
  for (const flag of GATES) {
    const brief = briefings[flag];
    // find the anchor at the briefing's tier
    const rec = anchors.find((r) => (r.value.content.load_bearing || {}).tier === brief.tier);
    if (!rec) { console.warn(`  ! no load-bearing anchor at tier ${brief.tier} for ${flag} — skipping`); continue; }
    const name = (rec.value.content.npc && rec.value.content.npc.name) || rec.value.content.name;
    if (!(rec.value.content.load_bearing.gates || []).includes(flag)) {
      console.warn(`  ! ${name} (t${brief.tier}) does not gate on ${flag} — its gates changed; skipping (re-check anchor-briefings.json)`);
      continue;
    }
    // is the gate ALREADY set by some OTHER keeper now? then the briefing is unnecessary — don't add a duplicate.
    const setElsewhere = records.some((r) => r.uri !== rec.uri && alreadySets(dialogueOf(r.value), flag));
    if (setElsewhere) { console.log(`  = ${flag} now has a keeper elsewhere — leaving ${name} unpatched`); continue; }
    const rkey = rec.uri.split('/').pop();
    const changed = spliceBriefing(rec.value, flag, brief);
    if (!changed) { console.log(`  = ${name} already sets ${flag} — up to date`); continue; }
    patched.push({ rkey, value: rec.value, flag, brief, name });
    console.log(`  + ${name} (t${brief.tier}, ${rkey}) now sets ${flag} via "${brief.choiceText}"`);
  }

  if (!patched.length) { console.log('\nnothing to publish — every briefing is already in place.'); return; }
  if (DRY) {
    for (const p of patched) console.log(`\n--- ${p.name} · sets ${p.flag} ---\n` + JSON.stringify(dialogueOf(p.value).nodes[p.brief.nodeId], null, 1));
    console.log('\n--dry: nothing written.');
    return;
  }

  const handle = process.env.HOOP_STORY_HANDLE, password = process.env.HOOP_STORY_PASSWORD;
  if (!handle || !password) { console.error('Set HOOP_STORY_HANDLE + HOOP_STORY_PASSWORD (app password), or pass --dry.'); process.exit(1); }
  const did = await resolveHandle(handle);
  if (did !== SERVICE_DID) console.warn(`  ! login handle resolves to ${did}, not the service ${SERVICE_DID} — writing to ${did}`);
  const client = new PdsClient(await resolvePds(did));
  await client.login(handle, password);
  console.log(`\nseeding as ${handle} (${did})`);
  for (const p of patched) {
    await client.putRecord(NSID, p.rkey, p.value);
    console.log(`  ✓ wrote ${p.rkey} (${p.name})`);
  }
  console.log(`\n✓ published ${patched.length} anchor briefing(s). Re-run hoop/scripts/prove-solvable.mjs — the two gate_no_setter errors should be gone.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
