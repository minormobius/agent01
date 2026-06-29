// story/verdicts.js — the CLIENT side of the rumor mill / async-result feed.
//
// The engine can't write into a player's own repo, so it tags verdicts with the recipient's DID and
// drops them in the SERVICE repo (morphyx) as com.minomobi.hoop.story.verdict records (rkey = a TID,
// so a listRecords sweep is time-ordered). This module is the consumer the lexicon describes: list the
// collection, keep the ones whose subjectDid is mine, apply them since a cursor (rkey > lastSeen), fold
// them into UI effects, and hand back the new cursor to persist. Pure over a MemoryStore — no transport,
// no DOM; index.html injects the client + store and renders the notices/redraw the digest returns.

export const VERDICT_NSID = 'com.minomobi.hoop.story.verdict';
const rkeyOf = (uri) => String(uri).split('/').pop();

// List MY unapplied verdicts from the service repo, oldest→newest (TID order = apply order).
// `client` only needs listRecordsFrom(did, nsid, limit, cursor) — the same shape loadPool uses.
export async function loadVerdicts(client, serviceDid, { myDid, since = '', world = null } = {}) {
  const out = [];
  let cursor;
  do {
    const res = await client.listRecordsFrom(serviceDid, VERDICT_NSID, 100, cursor);
    for (const r of (res && res.records) || []) {
      const rkey = rkeyOf(r.uri), v = r.value || {};
      if (v.subjectDid !== myDid) continue;          // service-repo-plus-tag: filter to my DID
      if (since && rkey <= since) continue;          // already applied (cursor = last applied rkey)
      if (world && v.world && v.world !== world) continue;
      out.push({ rkey, ...v });
    }
    cursor = res && res.cursor;
  } while (cursor);
  out.sort((a, b) => (a.rkey < b.rkey ? -1 : a.rkey > b.rkey ? 1 : 0));
  return out;
}

// Apply ONE verdict to the in-process store → an effect descriptor the UI consumes. Pure over the store.
//   entity_changed → notify (+ redraw the card if held)      entity_retired → tombstone the held content
//   invalidation   → evict named bindings + un-see (re-roll) rumor/input_result → notify (retcon ⇒ redraw)
export function applyVerdict(store, playerId, v) {
  const eff = { type: v.type, subject: v.subject || null, notice: null, evicted: [], redraw: false };
  const held = (cid) => (cid ? store.listPlacements(playerId).filter((p) => p.content_item_id === cid) : []);
  const payload = v.payload || {};
  switch (v.type) {
    case 'entity_changed':
      eff.notice = payload.summary || `${payload.entity || v.subject || 'Something'} has changed.`;
      eff.redraw = held(v.subject).length > 0;
      break;
    case 'entity_retired': {
      const ci = store.contentById(v.subject); if (ci) ci.status = 'retired';   // recall renders 'retired', keeps the binding
      eff.notice = payload.summary || `${(store.contentById(v.subject) || {}).id || v.subject || 'Something'} is gone now.`;
      eff.redraw = held(v.subject).length > 0;
      break;
    }
    case 'invalidation': {
      const ids = payload.contentIds || (Array.isArray(v.subject) ? v.subject : v.subject ? [v.subject] : []);
      const keys = payload.featureKeys || [];
      for (const cid of ids) { for (const pl of held(cid)) { store.unbindPlacement(playerId, pl.feature_key); eff.evicted.push(pl.feature_key); } store.unsee(playerId, cid); }
      for (const k of keys) { if (store.getPlacement(playerId, k)) eff.evicted.push(k); store.unbindPlacement(playerId, k); }
      eff.notice = payload.summary || 'The Tabard rearranges itself beneath you.';
      eff.redraw = eff.evicted.length > 0;
      break;
    }
    case 'rumor':
      eff.notice = payload.message || payload.summary || 'Word reaches you of changes elsewhere.';
      eff.redraw = !!payload.retcon;                 // a retcon rumor forces a full pool redraw
      break;
    case 'input_result':
      eff.notice = payload.message || payload.summary || 'Your effort resolves.';
      break;
    default:
      eff.notice = payload.summary || `Update: ${v.type}`;
  }
  return eff;
}

// Fold a time-ordered batch into one result: notices to show, bindings evicted, whether to redraw, and
// the cursor (last applied rkey) to persist so the next sweep resumes after it. worldVersion bump in any
// verdict also forces a redraw (the read-only pool cache key moved).
export function digestVerdicts(store, playerId, verdicts) {
  const notices = [], evicted = [];
  let redraw = false, cursor = '', maxWorldVersion = 0;
  for (const v of verdicts) {
    const e = applyVerdict(store, playerId, v);
    if (e.notice) notices.push({ type: e.type, subject: e.subject, notice: e.notice });
    evicted.push(...e.evicted);
    redraw = redraw || e.redraw || (typeof v.worldVersion === 'number' && v.worldVersion > 0);
    if (typeof v.worldVersion === 'number') maxWorldVersion = Math.max(maxWorldVersion, v.worldVersion);
    cursor = v.rkey || cursor;
  }
  return { notices, evicted, redraw, cursor, worldVersion: maxWorldVersion, applied: verdicts.length };
}
