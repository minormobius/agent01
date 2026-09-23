#!/usr/bin/env node
// pull-world.mjs — RE-FORM THE BUNDLED WORLD AROUND THE LIVE RECORDS.
//
//   node hoop/scripts/pull-world.mjs            # refresh spine-anchors.js + world_export.json
//   node hoop/scripts/pull-world.mjs --report   # census only, write nothing
//   node hoop/scripts/pull-world.mjs --pretty   # write world_export.json indented (bigger, diffable)
//
// hoopy regenerates the corpus in RUNS. A run publishes a fresh set of `com.minomobi.hoop.story.content`
// records and SOFT-DELETES the previous set in place (`status: 'retired'` — the tombstone `import.js`
// drops). Two things in this repo are projections of whatever run is current and must be re-pulled when
// one lands:
//
//   • `v110/story/spine-anchors.js` — the four LOAD-BEARING anchors (Olo · Solen · Sevin · Luna). They are
//     the campaign's spine: every other record's gate flag is turned in at one of them. A run that
//     regenerates the keepers but not the anchors tombstones the spine and leaves a world with no campaign
//     in it (the 2026-09-16 run did exactly this), so we carry them and graft them back — see
//     `graftSpineAnchors` in story/import.js. Preferred source: a LIVE anchor. Fallback: the newest
//     tombstoned one, which is the same authored character the live prose still refers to by name.
//   • `v110/story/world_export.json` — the OFFLINE FALLBACK the client loads when the service repo is
//     unreachable. If it holds a previous run it is a museum of records the live world has retired.
//
// Read-only against the service PDS (public listRecords, no secrets); writes only into hoop/v110/story/.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const STORY = join(HERE, '..', 'v110', 'story');
const SERVICE_DID = process.env.HOOP_SERVICE_DID || 'did:plc:yivyyp54vddf7qf2lpsikhe4';   // morphyx
const NSID = 'com.minomobi.hoop.story.content';
const REPORT = process.argv.includes('--report');
const PRETTY = process.argv.includes('--pretty');

const isTomb = (v) => ['retired', 'tombstoned', 'deleted'].includes(v && v.status)
  || (v && (v.tombstone === true || v.deleted === true || v.deletedAt != null));
const loadBearing = (v) => v && v.content && typeof v.content === 'object' && v.content.load_bearing;
const census = (rs) => { const c = {}; for (const r of rs) c[r.type] = (c[r.type] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '); };

async function pds(did) {
  const doc = await fetch('https://plc.directory/' + did).then((r) => r.json());
  const svc = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
  if (!svc) throw new Error('no PDS in the DID doc for ' + did);
  return svc.serviceEndpoint;
}

// every record in the collection, `id` materialised from the rkey exactly as atproto.js#recordToContent does.
async function fetchAll(host, did) {
  const out = [];
  let cursor;
  do {
    const u = `${host}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${NSID}&limit=100`
      + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const j = await fetch(u).then((r) => r.json());
    if (j.error) throw new Error(`${j.error}: ${j.message || ''}`);
    for (const r of j.records || []) {
      const { $type, createdAt, ...rest } = r.value || {};
      out.push({ id: String(r.uri).split('/').pop(), ...rest, createdAt });
    }
    cursor = j.cursor;
  } while (cursor);
  return out;
}

// The anchors to carry. One per load_bearing.tier: a LIVE anchor wins over a tombstoned one (hoopy
// re-authored it), and among tombstoned ones the newest wins. Sorted by tier so the file reads as the chain.
function pickAnchors(all) {
  const best = new Map();
  for (const r of all) {
    const lb = loadBearing(r);
    if (!lb || typeof lb.tier !== 'number') continue;
    const cur = best.get(lb.tier);
    const better = !cur
      || (isTomb(cur) && !isTomb(r))
      || (isTomb(cur) === isTomb(r) && String(r.createdAt || '') > String(cur.createdAt || ''));
    if (better) best.set(lb.tier, r);
  }
  return [...best.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => ({ ...r, status: 'active' }));
}

const main = async () => {
  const host = await pds(SERVICE_DID);
  const all = await fetchAll(host, SERVICE_DID);
  const live = all.filter((r) => !isTomb(r));
  const dead = all.filter(isTomb);
  const anchors = pickAnchors(all);
  const liveAnchors = anchors.filter((a) => live.some((r) => r.id === a.id));
  const runs = [...new Set(live.map((r) => String(r.createdAt || '').slice(0, 10)))].sort();

  console.log(`service  ${SERVICE_DID} @ ${host}`);
  console.log(`records  ${all.length} total · ${live.length} live · ${dead.length} tombstoned`);
  console.log(`live     ${census(live)}`);
  console.log(`run(s)   ${runs.join(', ') || '(none)'}`);
  console.log(`anchors  ${anchors.length} (${liveAnchors.length} live, ${anchors.length - liveAnchors.length} recovered from tombstones)`);
  for (const a of anchors) {
    const npc = (a.content.npc || {});
    console.log(`         t${a.content.load_bearing.tier} ${npc.name || a.content.name} — ${a.content.name} (${a.content.zone}) · ${a.content.load_bearing.gates.length} gates · ${live.some((r) => r.id === a.id) ? 'live' : 'recovered ' + a.id}`);
  }
  if (!live.length) throw new Error('the service repo served no live records — refusing to write an empty world');
  if (anchors.length < 4) console.log(`  ! only ${anchors.length} anchors found — the chain will be short`);
  if (REPORT) return;

  // ── spine-anchors.js ──────────────────────────────────────────────────────────────────────────
  const banner = `// hoop/v110/story/spine-anchors.js — THE CAMPAIGN SPINE, CARRIED.
//
// GENERATED by \`node hoop/scripts/pull-world.mjs\` — do not hand-edit; re-pull after a content run.
//
// The four LOAD-BEARING anchors (one per narrative tier) from the service repo's story.content
// collection. Every gate flag the keeper corpus sets is turned in at one of these four, so without them
// the pool is a set of rooms and not a campaign — \`proveProgression\` reports \`no_anchors\` and no seed is
// progressable. hoopy's runs regenerate the keepers and tombstone the previous corpus wholesale; the
// 2026-09-16 run took the anchors with it (its prose still names all four). \`servePool\` therefore grafts
// these back whenever the live pool carries no load-bearing anchor of its own, re-gated against the gates
// that run actually sets, and STANDS DOWN the moment the pool has a spine of its own.
//
// AT THIS PULL: ${liveAnchors.length === anchors.length
    ? 'all ' + anchors.length + ' anchors are LIVE upstream, so the graft is dormant — these are the net for\n// the next run, which will tombstone them again unless it republishes them.'
    : (anchors.length - liveAnchors.length) + ' of ' + anchors.length + ' anchors are TOMBSTONED upstream and the graft is load-bearing.\n// scripts/reactivate-anchors.mjs publishes these back to the service repo to fix it at the source.'}
//
// Records are hoopy's, verbatim, as \`listRecords\` served them (\`id\` = rkey, \`status\` forced to 'active'):
${anchors.map((a) => `//   t${a.content.load_bearing.tier}  at://${SERVICE_DID}/${NSID}/${a.id}  — ${(a.content.npc || {}).name}, ${a.content.name}${live.some((r) => r.id === a.id) ? '' : ' (tombstoned upstream)'}`).join('\n')}

export const SPINE_PROVENANCE = ${JSON.stringify({
    service: SERVICE_DID, collection: NSID, pulled: new Date().toISOString().slice(0, 10),
    anchors: anchors.map((a) => ({ rkey: a.id, tier: a.content.load_bearing.tier, name: (a.content.npc || {}).name || a.content.name, room: a.content.name, recovered: !live.some((r) => r.id === a.id) })),
  }, null, 2)};

export const SPINE_ANCHORS = ${JSON.stringify(anchors, null, 2)};

export default SPINE_ANCHORS;
`;
  writeFileSync(join(STORY, 'spine-anchors.js'), banner);
  console.log(`  → v110/story/spine-anchors.js (${anchors.length} anchors)`);

  // ── world_export.json (the offline fallback) ──────────────────────────────────────────────────
  // The live run PLUS the carried anchors, so the fallback world has the same spine the live one gets.
  const fallback = [...live, ...anchors.filter((a) => !live.some((r) => r.id === a.id))];
  writeFileSync(join(STORY, 'world_export.json'), JSON.stringify(fallback, null, PRETTY ? 2 : 0) + '\n');
  console.log(`  → v110/story/world_export.json (${fallback.length} records, ${(JSON.stringify(fallback).length / 1048576).toFixed(2)} MB)`);
};

main().catch((e) => { console.error('pull-world failed:', (e && e.message) || e); process.exit(2); });
