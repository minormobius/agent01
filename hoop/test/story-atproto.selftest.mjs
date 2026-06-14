// story-atproto.selftest.mjs — pins the ATProto-native bridge (DB-as-projection) over a MOCK repo.
// No network: a tiny in-memory client stands in for a PDS, proving pool ⇄ records and save ⇄ record
// round-trip exactly, and that the engine runs identically whether the pool came from pool.json or a repo.
//   node hoop/test/story-atproto.selftest.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MemoryStore, flattenPool, interact, talk, choose } from '../story/engine.js';
import { poolToRecords, recordsToPool, loadPool, loadSave, putSave,
         contentToRecord, recordToContent, CONTENT_NSID, SAVE_NSID } from '../story/atproto.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const POOL = JSON.parse(readFileSync(join(HERE, '../story/pool.json'), 'utf8'));
const WORLD = JSON.parse(readFileSync(join(HERE, '../story/world.json'), 'utf8'));
const content = flattenPool(POOL);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } };

// A MOCK repo network: collections → Map(rkey → value). Implements the verbs the bridge uses.
function mockClient(did = 'did:plc:service') {
  const repos = new Map();
  const repo = (d) => { let m = repos.get(d); if (!m) { m = new Map(); repos.set(d, m); } return m; };
  const col = (d, c) => { const m = repo(d); let s = m.get(c); if (!s) { s = new Map(); m.set(c, s); } return s; };
  return {
    did,
    _put(d, collection, rkey, value) { col(d, collection).set(rkey, value); },
    listRecordsFrom(d, collection) {
      const recs = [...col(d, collection).entries()].map(([rkey, value]) => ({ uri: `at://${d}/${collection}/${rkey}`, value }));
      return Promise.resolve({ records: recs, cursor: undefined });   // single page (pool is small)
    },
    getRecordFrom(d, collection, rkey) {
      const v = col(d, collection).get(rkey);
      return Promise.resolve(v ? { uri: `at://${d}/${collection}/${rkey}`, value: v } : null);
    },
    putRecord(collection, rkey, value) { this._put(this.did, collection, rkey, value); return Promise.resolve({ uri: `at://${this.did}/${collection}/${rkey}` }); },
  };
}

// 1. content ⇄ record round-trips field-for-field (id ⇒ rkey, no transform on the body)
{
  const ci = content.find((c) => c.id === 'np-keeper');
  const rec = contentToRecord(ci);
  ok('contentToRecord uses id as rkey', rec.rkey === 'np-keeper' && rec.value.$type === CONTENT_NSID);
  const back = recordToContent(rec.rkey, rec.value);
  ok('record round-trips to identical content', JSON.stringify(back) === JSON.stringify(ci));
}

// 2. seed a service repo, then loadPool — the pool reconstitutes exactly
const svc = mockClient('did:plc:hoopstory');
for (const { rkey, value } of poolToRecords(content)) svc._put(svc.did, CONTENT_NSID, rkey, value);
const loaded = await loadPool(svc, svc.did);
ok('loadPool returns every item', loaded.length === content.length);
ok('loaded pool equals source pool', JSON.stringify(loaded.map((c) => c.id).sort()) === JSON.stringify(content.map((c) => c.id).sort()));
ok('a loaded NPC keeps its dialogue tree', (loaded.find((c) => c.id === 'np-keeper').content.dialogue || {}).start === 'greet');

// 3. THE THESIS: the engine runs identically over a repo-sourced pool (no DB) — crystallize + dialogue
{
  const store = new MemoryStore(loaded, WORLD);          // pool came from the repo, not pool.json
  const r = interact(store, 'p1', 'medbay.keeper');       // an npc feature
  ok('engine crystallizes over repo-sourced pool', r.status === 'crystallized' && r.item.type === 'npc');
  const t = talk(store, 'p1', r.item.content_item_id);
  ok('dialogue works over repo-sourced pool', Array.isArray(t.choices));
}

// 4. per-player SAVE ⇄ the player's repo: play, snapshot→putSave, fresh store→loadSave→restore recalls
{
  const player = mockClient('did:plc:alice');
  const s = new MemoryStore(loaded, WORLD);
  interact(s, 'did:plc:alice', 'medbay.shelf.a');         // crystallize an item
  s.setFact('did:plc:alice', 'flag.opened_hatch', true);
  await putSave(player, '7', s.snapshot());               // checkpoint to the player's repo
  ok('save record written to player repo', !!(await player.getRecordFrom(player.did, SAVE_NSID, '7')));
  const restored = await loadSave(player, player.did, '7');
  const s2 = new MemoryStore(loaded, WORLD).restore(restored);
  const recalled = interact(s2, 'did:plc:alice', 'medbay.shelf.a');
  ok('restored save recalls (not re-crystallizes)', recalled.status === 'recalled');
  ok('restored save keeps facts', s2.getFact('did:plc:alice', 'flag.opened_hatch') === true);
  ok('missing save loads as null', (await loadSave(player, player.did, 'nope')) === null);
}

console.log(`\n${fail ? '✗ FAIL' : '✓ PASS'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
