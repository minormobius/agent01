// hoop/story/atproto.js — the ATProto-native bridge for the story layer.
//
// THE THESIS (ARCHITECTURE.md): there is no source-of-truth DB. Truth lives in repos; any cache is a
// disposable projection. This module is the mapping between the engine's plain data and ATProto records:
//   • the POOL (shared, read-mostly) ⇄ a SERVICE repo's `com.minomobi.hoop.story.content` collection
//   • a player's SAVE (durable per-player state) ⇄ the PLAYER'S repo `com.minomobi.hoop.story.save`
// It is transport-agnostic: it takes a `client` exposing a subset of the standard XRPC repo verbs
// ({listRecordsFrom, getRecordFrom, putRecord}), so the SAME code runs over packages/atproto PdsClient
// (node/seeder, authed), the shared OAuth AuthClient.pds (browser, authed writes), or the tiny unauthed
// publicClient below (browser, public reads). No DB anywhere — just records in, records out.

export const CONTENT_NSID = 'com.minomobi.hoop.story.content';
export const SAVE_NSID = 'com.minomobi.hoop.story.save';

const rkeyOf = (uri) => String(uri).split('/').pop();

// ── pool ⇄ content records (the content_item shape is stored verbatim, id ⇒ rkey) ──
export function contentToRecord(ci) {
  const { id, ...rest } = ci;
  return { rkey: id, value: { $type: CONTENT_NSID, createdAt: rest.createdAt || new Date().toISOString(), ...rest } };
}
export function recordToContent(rkey, value) {
  const { $type, createdAt, ...rest } = value || {};   // strip record metadata; the rest IS the content_item
  return { id: rkey, ...rest };
}
export const poolToRecords = (content) => content.map(contentToRecord);
export const recordsToPool = (records) => records.map((r) => recordToContent(rkeyOf(r.uri), r.value));

// Load the whole pool from a service repo (paginated). Returns the engine's content[] — feed straight
// into `new MemoryStore(content, world)`. Unauthed-readable, so the browser can source the pool live.
export async function loadPool(client, serviceDid) {
  const out = [];
  let cursor;
  do {
    const res = await client.listRecordsFrom(serviceDid, CONTENT_NSID, 100, cursor);
    for (const r of (res && res.records) || []) out.push(recordToContent(rkeyOf(r.uri), r.value));
    cursor = res && res.cursor;
  } while (cursor);
  return out;
}

// ── per-player save ⇄ the player's own repo (batched; localStorage is the hot buffer) ──
export async function loadSave(client, playerDid, world) {
  const rec = await client.getRecordFrom(playerDid, SAVE_NSID, world);
  if (!rec || !rec.value || !rec.value.stateJson) return null;
  try { return JSON.parse(rec.value.stateJson); } catch (e) { return null; }
}
// Own-repo variant for the authed browser client (AuthClient.pds.getRecord — no did, the worker scopes
// to the logged-in user). Tolerates both {value:{…}} and bare-value record shapes.
export async function loadOwnSave(client, world) {
  const rec = await client.getRecord(SAVE_NSID, world);
  const v = rec && (rec.value || rec);
  if (!v || !v.stateJson) return null;
  try { return JSON.parse(v.stateJson); } catch (e) { return null; }
}
// `client` here must be authed for the player's repo (PdsClient session, or AuthClient.pds).
export async function putSave(client, world, snapshot) {
  return client.putRecord(SAVE_NSID, world, {
    $type: SAVE_NSID, world, stateJson: JSON.stringify(snapshot), updatedAt: new Date().toISOString(),
  });
}

// Freeze one generated content_item (a side-quest, lane:'sidequest') into the PLAYER'S OWN repo. The
// shared spine is written by the service key (seed-story-pool.mjs); a player's personal arcs are theirs,
// $0 to us. rkey = the content id. `client` authed for the player's repo (AuthClient.pds). Returns the
// at-uri/cid the PDS assigns. contentToRecord already stamps $type + createdAt + the provenance fields.
export async function putContent(client, ci) {
  const { rkey, value } = contentToRecord(ci);
  return client.putRecord(CONTENT_NSID, rkey, value);
}

// ── a tiny UNAUTHED read client (browser): public listRecords/getRecord over any repo, no deps ──
export function publicClient(pdsBase) {
  const xrpc = async (method, params) => {
    const res = await fetch(pdsBase + '/xrpc/' + method + '?' + new URLSearchParams(params));
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(method + ' ' + res.status);
    return res.json();
  };
  return {
    listRecordsFrom: (did, collection, limit = 100, cursor) =>
      xrpc('com.atproto.repo.listRecords', cursor ? { repo: did, collection, limit: String(limit), cursor } : { repo: did, collection, limit: String(limit) }),
    getRecordFrom: (did, collection, rkey) => xrpc('com.atproto.repo.getRecord', { repo: did, collection, rkey }),
  };
}
