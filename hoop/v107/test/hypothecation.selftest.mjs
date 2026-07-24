// hypothecation.selftest — a full round of "hoopy test hypothecation": stand up a FAKE morphyx/service
// repo + a player repo (an in-memory ATProto exposing exactly the {listRecordsFrom, getRecordFrom,
// getRecord, putRecord} the client modules consume), then walk the WHOLE content loop the prose describes
// — backfill → mint → draw → crystallize → save → deplete → replenish → rumor-mill verdicts → redraw —
// driving the REAL client modules (import/atproto/engine/verdicts). "Their" side (persist, draw-pool
// calc, the rumor agent) is hypothecated as the documented contract; this asserts the CLIENT half holds.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { importWorldExport } from '../story/import.js';
import { loadPool, putContent, putSave, loadSave, CONTENT_NSID, SAVE_NSID, VERDICT_NSID } from '../story/atproto.js';
import { MemoryStore, dispatch, interact, listPlacements, poolCensus, needsReplenish } from '../story/engine.js';
import { loadVerdicts, digestVerdicts } from '../story/verdicts.js';
import { rollCharacter } from '../stats.js';

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0; const STEP = (s) => console.log('\n— ' + s);
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

// ── the fake ATProto: did → collection → rkey → value. Implements the client verbs the modules use. ──
function fakeAtproto() {
  const repos = new Map();
  const coll = (did, c) => { let r = repos.get(did); if (!r) repos.set(did, r = new Map()); let m = r.get(c); if (!m) r.set(c, m = new Map()); return m; };
  const reads = {
    listRecordsFrom(did, c, _limit, _cursor) {
      const records = [...coll(did, c).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([rkey, value]) => ({ uri: `at://${did}/${c}/${rkey}`, value }));
      return Promise.resolve({ records, cursor: undefined });   // one page (test scale) — loadPool/loadVerdicts loop is exercised, just terminates at once
    },
    getRecordFrom(did, c, rkey) { const v = coll(did, c).get(rkey); return Promise.resolve(v ? { uri: `at://${did}/${c}/${rkey}`, value: v } : null); },
  };
  // an authed client SCOPED to one repo (the seeder / player session): writes land in `did`, reads delegate
  const authed = (did) => ({
    ...reads,
    getRecord: (c, rkey) => reads.getRecordFrom(did, c, rkey),
    putRecord: (c, rkey, value) => { coll(did, c).set(rkey, value); return Promise.resolve({ uri: `at://${did}/${c}/${rkey}`, cid: 'cid' + Math.random().toString(36).slice(2) }); },
  });
  return { repos, reads, authed, coll };
}

const MORPHYX = 'did:plc:morphyx', PLAYER = 'did:plc:traveller', WORLD = 'ship-seed-42';

const main = async () => {
  const net = fakeAtproto();
  const service = net.authed(MORPHYX);   // "me" (backend) writing content + verdicts to the service repo
  const player = net.authed(PLAYER);     // "you" (client) writing the player's own save

  // ════ 1. CONTENT BACKFILL (me): mint world content from hoopy's export → publish to morphyx ════
  STEP('1. content backfill → morphyx (com.minomobi.hoop.story.content)');
  const exp = JSON.parse(readFileSync(join(HERE, '..', 'story', 'world_export.json'), 'utf8'));
  const imported = importWorldExport(exp).content;
  ok(imported.length > 50, `imported ${imported.length} content_items from the world_export`);
  for (const ci of imported) await putContent(service, ci);
  const written = net.coll(MORPHYX, CONTENT_NSID);
  ok(written.size === imported.length, `all ${imported.length} published to the service repo`);
  // lexicon conformance of what we published (required + enum)
  const TYPES = new Set(['npc', 'item', 'lore_fragment', 'creature', 'plot_beat', 'rumor']);
  const sample = [...written.values()];
  ok(sample.every((v) => v.$type === CONTENT_NSID && TYPES.has(v.type) && v.content != null && v.createdAt), 'every record conforms to story.content (type∈enum, content present, $type+createdAt stamped)');

  // ════ 2. real DRAW from morphyx (you): load the pool the client will dispatch from ════
  STEP('2. client loads the pool from morphyx (loadPool)');
  const pool = await loadPool(net.reads, MORPHYX);
  ok(pool.length === imported.length, `loadPool round-trips all ${pool.length} items back to the engine content shape`);
  ok(pool.every((c) => c.id && c.type && 'content' in c) && pool.some((c) => c.type === 'npc'), 'pool items carry {id,type,content}; npcs present');

  // ════ 3. character MINT + first SAVE (you), keyed (player, world) (me persists it) ════
  STEP('3. mint a character + publish a first save (player repo, rkey = world)');
  const store = new MemoryStore(pool, { features: [] });
  const character = rollCharacter(42, {});
  store.setFact(PLAYER, 'character', { name: character.name, vocation: character.vocation, sprite: character.sprite });
  // an advanced traveller so the whole tier-range of content is legal to draw (revelation/narrative/power)
  store.setPlayerTier(PLAYER, 'revelation_tier', 5); store.setPlayerTier(PLAYER, 'narrative_tier', 5); store.setPlayerXp(PLAYER, 300, 5);
  await putSave(player, WORLD, store.snapshot());
  const saveRec = net.coll(PLAYER, SAVE_NSID).get(WORLD);
  ok(saveRec && saveRec.world === WORLD && saveRec.$type === SAVE_NSID && saveRec.updatedAt, 'save conforms to story.save (world, stateJson, updatedAt) and is keyed by world in the PLAYER repo');
  ok(JSON.parse(saveRec.stateJson).players.length === 1, 'stateJson is the MemoryStore snapshot (the (player,world) state the backend persists)');
  ok(JSON.parse(saveRec.stateJson).facts.find(([id]) => id === PLAYER)[1].some(([k]) => k === 'character'), 'the minted character rides inside the save');

  // ════ 4. DRAW to populate the world + reify ENCOUNTERS (you hold them, no repeats, know location) ════
  STEP('4. draw + crystallize encounters onto map features');
  for (let i = 0; i < 6; i++) store.addFeature({ key: 'chamber-' + i, type: 'npc', label: 'Chamber ' + i });
  const drawn = dispatch(store, PLAYER, 'npc', 3);
  ok(drawn.length === 3 && new Set(drawn.map((c) => c.id)).size === 3, 'a draw returns N distinct npcs');
  ok(drawn.every((c) => store.getPlayerState(PLAYER).seen_ids.includes(c.id)), 'drawn content is marked SEEN (so it never re-draws)');
  // crystallize one onto a feature (the map location) — the keystone binding
  const r0 = interact(store, PLAYER, 'chamber-0');
  ok(r0.status === 'crystallized' && r0.item, `crystallized "${r0.item && r0.item.name}" at chamber-0`);
  const place0 = store.getPlacement(PLAYER, 'chamber-0');
  ok(place0 && place0.content_item_id === r0.item.content_item_id, 'the encounter is BOUND to its feature key (you know where it is → can put it back on a map)');
  // RECALL: same feature → the very same item, forever (you know what they hold)
  const r0b = interact(store, PLAYER, 'chamber-0');
  ok(r0b.status === 'recalled' && r0b.item.content_item_id === r0.item.content_item_id, 'returning to the feature RECALLS the same encounter');
  // NO REPEAT: a different feature crystallizes a DIFFERENT item
  const r1 = interact(store, PLAYER, 'chamber-1');
  ok(r1.item && r1.item.content_item_id !== r0.item.content_item_id, 'a second feature draws DIFFERENT content (the seen-set prevents repeats)');

  // ════ 5. publish a SAVE carrying the encounters (you) → backend persists (me) → restore round-trips ════
  STEP('5. save with encounters → reload → restore (the encounters survive the round-trip)');
  await putSave(player, WORLD, store.snapshot());
  const reloaded = JSON.parse(net.coll(PLAYER, SAVE_NSID).get(WORLD).stateJson);
  const store2 = new MemoryStore(pool, { features: [] }).restore(reloaded);
  for (let i = 0; i < 6; i++) store2.addFeature({ key: 'chamber-' + i, type: 'npc', label: 'Chamber ' + i });
  const recall = interact(store2, PLAYER, 'chamber-0');
  ok(recall.status === 'recalled' && recall.item.content_item_id === r0.item.content_item_id, 'after reload, the saved placement RECALLS the same encounter (encounters are durable save state)');
  ok(listPlacements(store2, PLAYER).length === store.listPlacements(PLAYER).length, 'all placements restored from the save');

  // ════ 6. DEPLETE a draw pool (you) → the client can DETECT it (the replenish signal) ════
  STEP('6. deplete the npc pool → census flags it');
  let guard = 0; while (dispatch(store, PLAYER, 'npc', 5).length && guard++ < 999) { /* draw until dry */ }
  const census = poolCensus(store, PLAYER, ['npc']);
  ok(census.npc.unseen === 0 && census.npc.depleted, `npc pool drained: ${census.npc.legal} legal, 0 unseen → depleted`);
  ok(needsReplenish(census), 'needsReplenish() raises the signal the backend listens for');
  const moreFeature = store.addFeature({ key: 'chamber-empty', type: 'npc', label: 'Empty' }) && interact(store, PLAYER, 'chamber-empty');
  ok(moreFeature.status === 'withheld', 'with the pool spent, a fresh feature is WITHHELD (nothing left to crystallize)');

  // ════ 7. REPLENISH (me publishes new content) → client folds it in → draws again (you) ════
  STEP('7. backend replenishes morphyx → client reloads → the slot fills');
  const fresh = ['np-new-keeper', 'np-new-warden', 'np-new-pilot'].map((id, i) => ({
    id, type: 'npc', approved: true, status: 'active', revelation_tier: 1, narrative_tier: 1, power_tier: 1,
    tags: ['replenished'], content: { name: 'Fresh ' + i, description: 'newly published' }, lane: 'spine', provider: 'authored',
  }));
  for (const ci of fresh) await putContent(service, ci);
  const pool2 = await loadPool(net.reads, MORPHYX);
  ok(pool2.length === imported.length + fresh.length, `morphyx now serves ${pool2.length} items (replenished by ${fresh.length})`);
  for (const ci of fresh) store.addContent(ci);   // the live store folds the new content (a reload does this)
  const censusAfter = poolCensus(store, PLAYER, ['npc']);
  ok(censusAfter.npc.unseen === fresh.length && !censusAfter.npc.depleted, 'census recovers — the new content is now drawable');
  const refill = interact(store, PLAYER, 'chamber-empty');
  ok(refill.status === 'crystallized' && fresh.some((f) => f.id === refill.item.content_item_id), 'the previously-withheld feature now crystallizes the FRESH content (live replenish)');

  // ════ 8. RUMOR MILL: backend executes a rumor → emits per-player verdicts → client applies + redraws ════
  STEP('8. rumor mill → story.verdict feed → client digests (apply since cursor, ack, redraw)');
  // me: the rumor agent writes verdicts to the SERVICE repo, tagged with the recipient's DID (rkey = TID).
  const heldId = r1.item.content_item_id;                    // an entity the player has crystallized
  const evictKey = 'chamber-1';
  const tid = (n) => 'v' + String(n).padStart(6, '0');
  const verdicts = [
    { rkey: tid(1), subjectDid: PLAYER, type: 'entity_changed', subject: heldId, world: WORLD, worldVersion: 2, payload: { entity: heldId, summary: 'The keeper has taken a new name.' } },
    { rkey: tid(2), subjectDid: 'did:plc:someone-else', type: 'rumor', payload: { message: 'not for this player' } },   // must be filtered out
    { rkey: tid(3), subjectDid: PLAYER, type: 'invalidation', world: WORLD, payload: { contentIds: [heldId], summary: 'A retcon unsettles the margin.' } },
    { rkey: tid(4), subjectDid: PLAYER, type: 'rumor', world: WORLD, payload: { message: 'The Bay 14 story is rewritten.', retcon: true } },
  ];
  for (const v of verdicts) { const { rkey, ...value } = v; await service.putRecord(VERDICT_NSID, rkey, { $type: VERDICT_NSID, createdAt: new Date().toISOString(), ...value }); }

  // you: list MY verdicts since the cursor, fold them in
  const cursor0 = store2.getFact(PLAYER, 'verdict.cursor', '');
  const mine = await loadVerdicts(net.reads, MORPHYX, { myDid: PLAYER, since: cursor0 });
  ok(mine.length === 3 && mine.every((v) => v.subjectDid === PLAYER), 'loadVerdicts keeps only MY verdicts (the foreign one is filtered)');
  ok(mine[0].rkey < mine[1].rkey && mine[1].rkey < mine[2].rkey, 'verdicts arrive in TID (time) order');
  const before = store2.getPlacement(PLAYER, evictKey);
  ok(before && before.content_item_id === heldId, 'pre-rumor: the player holds the soon-to-be-invalidated encounter');
  const digest = digestVerdicts(store2, PLAYER, mine);
  ok(digest.applied === 3 && digest.notices.length === 3, 'all three verdicts applied, each producing a player-facing notice (the "verdicts" you display)');
  ok(digest.evicted.includes(evictKey) && !store2.getPlacement(PLAYER, evictKey), 'the invalidation EVICTED the binding (the slot will re-crystallize)');
  ok(!store2.getPlayerState(PLAYER).seen_ids.includes(heldId), 'the invalidated content was un-seen → it can be drawn afresh');
  ok(digest.redraw === true && digest.worldVersion === 2, 'a retcon + worldVersion bump forces a FULL redraw');
  // re-crystallize the evicted slot → a fresh encounter (the redraw)
  const recrys = interact(store2, PLAYER, evictKey);
  ok(recrys.status === 'crystallized', 'the evicted feature re-crystallizes after the retcon (full content redraw)');
  // ack: persist the cursor; a second sweep returns nothing (idempotent — no double-apply)
  store2.setFact(PLAYER, 'verdict.cursor', digest.cursor);
  const second = await loadVerdicts(net.reads, MORPHYX, { myDid: PLAYER, since: digest.cursor });
  ok(second.length === 0, 'after acking the cursor, a re-sweep applies nothing (idempotent)');

  console.log(`\nhypothecation.selftest: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};
main().catch((e) => { console.log('HARNESS ERROR', e && e.stack || e); process.exit(1); });
