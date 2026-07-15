#!/usr/bin/env node
// prove-weave.mjs — run the v105 SEEDED QUEST SPINE proof against the LIVE morphyx pool.
// For each seed in the sweep: cast the spine, weave it (charge splices + the tier-2 mystery), and run
// the solvability oracle on the woven pool; also certify the mystery's deductive closure. The node
// cousin of the /quests board's seed roller.
//
//   node hoop/scripts/prove-weave.mjs                 # sweep seeds 1..50
//   node hoop/scripts/prove-weave.mjs 7               # one seed, verbose (the cast + the case)
//   node hoop/scripts/prove-weave.mjs --sweep 500     # a wider sweep
//   node hoop/scripts/prove-weave.mjs --pool file.json  # offline: a saved listRecords dump
import { readFileSync } from 'node:fs';
import { servePool } from '../v105/story/import.js';
import { proveProgression } from '../v105/story/solvable.js';
import { weaveWorld } from '../v105/story/weave.js';

const SERVICE_DID = 'did:plc:yivyyp54vddf7qf2lpsikhe4';
const FALLBACK_PDS = 'https://chalciporus.us-west.host.bsky.network';
const NSID = 'com.minomobi.hoop.story.content';

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const oneSeed = args.find((a, i) => /^\d+$/.test(a) && !String(args[i - 1] || '').startsWith('--'));
const sweepN = +(flag('--sweep') || 50);
const poolFile = flag('--pool');

async function loadLive() {
  let pds = FALLBACK_PDS;
  try {
    const d = await fetch('https://plc.directory/' + SERVICE_DID).then((r) => r.json());
    const s = (d.service || []).find((x) => x.id === '#atproto_pds'); if (s) pds = s.serviceEndpoint;
  } catch {}
  const raw = []; let cursor, pages = 0;
  do {
    const u = new URL(pds + '/xrpc/com.atproto.repo.listRecords');
    u.searchParams.set('repo', SERVICE_DID); u.searchParams.set('collection', NSID); u.searchParams.set('limit', '100');
    if (cursor) u.searchParams.set('cursor', cursor);
    const j = await fetch(u).then((r) => r.json());
    raw.push(...(j.records || []).map((r) => r.value)); cursor = j.cursor; pages++;
  } while (cursor && pages < 40);
  return raw;
}

const raw = poolFile ? JSON.parse(readFileSync(poolFile, 'utf8')) : await loadLive();
const served = servePool(raw);
console.log(`pool: ${raw.length} raw → ${served.length} served`);

function proveSeed(seed, verbose = false) {
  const w = weaveWorld(served, seed);
  const rep = proveProgression(w.content, { forcePlaced: true });
  let caseOk = null;
  if (w.mystery) {
    const alive = new Set(w.mystery.suspects.map((s) => s.id));
    for (const c of w.mystery.clues) for (const id of c.eliminates) alive.delete(id);
    caseOk = alive.size === 1 && alive.has(w.mystery.truth.culpritId);
  }
  if (verbose) {
    console.log(`\n══ seed ${seed} — ${rep.verdict} (${rep.errors.length} errors, ${w.issues.length} weave issues)`);
    for (const e of w.cast.plan) console.log(`  t${e.tier} ${e.gate.padEnd(36)} → ${e.briefing ? '[anchor briefing] ' : ''}${e.keeperName}${e.room ? ' · ' + e.room : ''}${e.authoredPick ? ' (authored pick)' : ''}`);
    if (w.mythograph) console.log(`  t${w.mythograph.tier} ${w.mythograph.gate.padEnd(36)} → [send → terminal ▤ → report] ${w.mythograph.keeperName}${w.mythograph.room ? ' · ' + w.mythograph.room : ''}`);
    for (const i of w.issues) console.log('  ⚠', i.code, i.msg || '');
    if (w.mystery) {
      const m = w.mystery;
      console.log(`  ── the case: ${m.victim.name} found at ${m.sceneRoom}, ${m.tickLabel}`);
      console.log(`     case-giver: ${m.caseGiver.name} (${m.caseGiver.room}) · ${m.suspects.length} suspects · ${m.clues.length} clues · closure ${caseOk ? 'CERTIFIED' : 'FAILED'}${m.usedEyewitness ? ' (eyewitness closer)' : ''}`);
      console.log(`     truth: ${m.truth.name} — ${m.truth.motive.tag} — ${m.truth.item}`);
    } else console.log('  ── no mystery cast');
    for (const err of rep.errors) console.log('  ✗', err.code, err.msg);
  }
  return { solvable: rep.solvable, errors: rep.errors, mystery: !!w.mystery, caseOk };
}

if (oneSeed) {
  const r = proveSeed(+oneSeed, true);
  process.exit(r.solvable && (r.caseOk !== false) ? 0 : 1);
} else {
  let pass = 0, caseFail = 0, noCase = 0;
  const t0 = Date.now();
  for (let s = 1; s <= sweepN; s++) {
    const r = proveSeed(s);
    if (r.solvable && r.caseOk !== false) pass++;
    else { console.log(`  ✗ seed ${s}:`, r.errors.slice(0, 2).map((e) => e.code + ' ' + (e.gate || '')).join(' · ') || (r.caseOk === false ? 'case closure failed' : '')); }
    if (!r.mystery) noCase++;
    if (r.caseOk === false) caseFail++;
  }
  console.log(`\n${pass}/${sweepN} seeds PROVABLY PROGRESSABLE woven (${noCase} without a case, ${caseFail} case-closure failures) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(pass === sweepN ? 0 : 1);
}
