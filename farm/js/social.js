// social.js — THE FRIEND WIRE. Two halves, deliberately separated:
//
//  • PURE half (top; node-tested in test/social.selftest.mjs): given lists of public records, decide
//    what counts — which tend records boost which plant (distinct-friend counts inside the growth
//    window), which gifts are addressed to me and unclaimed. No fetch, no DOM.
//
//  • FETCH half (bottom; browser-only): keyless public reads, the board/media.js pattern — resolve a
//    handle or DID, find the PDS, list a collection straight off someone else's repo. NOTHING here
//    goes through auth.mino.mobi: your friends' farms are public data and read as such.
//
// The social model in one line: friendship is your Bluesky follow graph. Your client scans the repos
// of people YOU follow for farm.tend records naming your DID (they watered your barley) and farm.gift
// records naming you (they sent you seeds). Everything is verifiable — both sides' records are public,
// and growthOf() recomputes the same boost on any machine.

export const TEND_COLLECTION = 'com.minomobi.farm.tend';
export const GIFT_COLLECTION = 'com.minomobi.farm.gift';
export const PLOT_COLLECTION = 'com.minomobi.farm.plot';
export const ACH_COLLECTION = 'com.minomobi.farm.achievement';
export const PETITION_COLLECTION = 'com.minomobi.farm.petition';
export const TENDS_PER_FRIEND_PER_DAY = 3;     // a friend can tend your bed this many times a day (client-honoured, publicly auditable)

// ── PURE ──────────────────────────────────────────────────────────────────────────────────────────

// tendCounts(myDid, myPlants, tendsByFriend) → { plantId → distinct-friend count }.
// tendsByFriend: [{ did, records: [{ value: { subject, plantId, createdAt } }] }].
// A tend counts when it names me + one of my LIVING plants and was made AFTER that plant went in the
// ground (no retro-boost from a past life of the same plant id).
export function tendCounts(myDid, plants, tendsByFriend) {
  const byPlant = {};
  const live = new Map((plants || []).map((p) => [p.id, p]));
  for (const f of tendsByFriend || []) {
    const seen = new Set();   // one friend counts once per plant, however many times they watered
    for (const r of f.records || []) {
      const v = r.value || r;
      if (!v || v.subject !== myDid) continue;
      const p = live.get(v.plantId);
      if (!p) continue;
      const t = Date.parse(v.createdAt || 0);
      if (!(t > p.at)) continue;
      if (seen.has(v.plantId)) continue;
      seen.add(v.plantId);
      byPlant[v.plantId] = (byPlant[v.plantId] || 0) + 1;
    }
  }
  return byPlant;
}

// unclaimedGifts(myDid, claimed, giftsByFriend) → [{ uri, from, item, note, createdAt }]
export function unclaimedGifts(myDid, claimed, giftsByFriend) {
  const done = new Set(claimed || []);
  const out = [];
  for (const f of giftsByFriend || []) {
    for (const r of f.records || []) {
      const v = r.value || {};
      if (v.to !== myDid || !r.uri || done.has(r.uri)) continue;
      if (!v.item || !v.item.kind) continue;
      out.push({ uri: r.uri, from: f.did, item: v.item, note: v.note || '', createdAt: v.createdAt || '' });
    }
  }
  return out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// myTendsToday(myTendRecords, friendDid, now) — how many times I've tended this friend since midnight
// UTC (the client-side courtesy limit; the records make it publicly auditable, not enforceable).
export function tendsToday(records, friendDid, now) {
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const t0 = dayStart.getTime();
  let n = 0;
  for (const r of records || []) {
    const v = r.value || r;
    if (v.subject === friendDid && Date.parse(v.createdAt || 0) >= t0) n++;
  }
  return n;
}

// ── FETCH (browser) — keyless public reads, board/media.js's pattern ─────────────────────────────

const PLC = 'https://plc.directory';
const PUB = 'https://public.api.bsky.app';
const pdsCache = new Map();

export async function resolveHandle(handle) {
  const h = String(handle || '').trim().replace(/^@/, '');
  if (h.startsWith('did:')) return h;
  const r = await fetch(PUB + '/xrpc/com.atproto.identity.resolveHandle?handle=' + encodeURIComponent(h));
  if (!r.ok) throw new Error('could not resolve @' + h);
  return (await r.json()).did;
}

export async function resolvePds(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  let doc;
  if (did.startsWith('did:plc:')) {
    const r = await fetch(PLC + '/' + did);
    if (!r.ok) return null;
    doc = await r.json();
  } else if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length).split(':').join('/');
    const r = await fetch('https://' + host + '/.well-known/did.json');
    if (!r.ok) return null;
    doc = await r.json();
  } else return null;
  const svc = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
  const url = svc ? svc.serviceEndpoint : null;
  if (url) pdsCache.set(did, url);
  return url;
}

// list a collection straight off someone's repo (public, keyless). Returns [] on any failure —
// a friend without a farm is normal, not an error.
export async function listRecordsFrom(did, collection, limit = 50) {
  try {
    const pds = await resolvePds(did);
    if (!pds) return [];
    const p = new URLSearchParams({ repo: did, collection, limit: String(limit) });
    const r = await fetch(pds + '/xrpc/com.atproto.repo.listRecords?' + p);
    if (!r.ok) return [];
    return (await r.json()).records || [];
  } catch (e) { return []; }
}

export async function getRecordFrom(did, collection, rkey) {
  try {
    const pds = await resolvePds(did);
    if (!pds) return null;
    const p = new URLSearchParams({ repo: did, collection, rkey });
    const r = await fetch(pds + '/xrpc/com.atproto.repo.getRecord?' + p);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// who I follow (DIDs), first pages only — the friend scan is capped anyway.
export async function getFollows(did, cap = 100) {
  const out = [];
  let cursor;
  try {
    while (out.length < cap) {
      const p = new URLSearchParams({ actor: did, limit: '100' });
      if (cursor) p.set('cursor', cursor);
      const r = await fetch(PUB + '/xrpc/app.bsky.graph.getFollows?' + p);
      if (!r.ok) break;
      const j = await r.json();
      for (const f of j.follows || []) out.push(f.did);
      cursor = j.cursor;
      if (!cursor) break;
    }
  } catch (e) { /* partial is fine */ }
  return out.slice(0, cap);
}

export async function getProfiles(dids) {
  const map = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    const batch = dids.slice(i, i + 25);
    try {
      const p = new URLSearchParams();
      for (const d of batch) p.append('actors', d);
      const r = await fetch(PUB + '/xrpc/app.bsky.actor.getProfiles?' + p);
      if (!r.ok) continue;
      for (const prof of (await r.json()).profiles || []) map.set(prof.did, { did: prof.did, handle: prof.handle, displayName: prof.displayName || '', avatar: prof.avatar || '' });
    } catch (e) { /* skip batch */ }
  }
  return map;
}

// the friend scan: which of the people I follow have farms, and what have they left for me?
// Capped + concurrent; every read is public. Returns { farmers, tendsByFriend, giftsByFriend }.
export async function scanFriends(myDid, cap = 60) {
  const follows = await getFollows(myDid, cap);
  const results = await Promise.all(follows.map(async (did) => {
    const plot = await listRecordsFrom(did, PLOT_COLLECTION, 1);
    if (!plot.length) return null;
    const [tends, gifts] = await Promise.all([
      listRecordsFrom(did, TEND_COLLECTION, 100),
      listRecordsFrom(did, GIFT_COLLECTION, 50),
    ]);
    return { did, plot: plot[0], tends, gifts };
  }));
  const farmers = results.filter(Boolean);
  return {
    farmers,
    tendsByFriend: farmers.map((f) => ({ did: f.did, records: f.tends })),
    giftsByFriend: farmers.map((f) => ({ did: f.did, records: f.gifts })),
  };
}

export default {
  TEND_COLLECTION, GIFT_COLLECTION, PLOT_COLLECTION, ACH_COLLECTION, TENDS_PER_FRIEND_PER_DAY,
  tendCounts, unclaimedGifts, tendsToday,
  resolveHandle, resolvePds, listRecordsFrom, getRecordFrom, getFollows, getProfiles, scanFriends,
};
