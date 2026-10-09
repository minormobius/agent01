// welcome-desk — Morphyx's copy of the lab's feed (miniphim/lab-feeds/welcome-desk.mjs), changed in one place:
// the order. The lab sorted by the post's own createdAt, which the author writes. A post dated 2099 would hold
// the top of the desk for every newcomer after it, forever. Here a post sorts by
//   sortAt = min(createdAt, checked)
// where `checked` is when our refresh first read it: our clock, not theirs. Same rule as Bluesky's AppView
// (sortAt = min(createdAt, indexedAt)). Honest dates are unchanged; a future date is clamped to the day we saw it.
// Store and refresh are the lab's, untouched, so the existing store still answers.
//
// refresh (every 5 min): the account list from pds.delve.town (com.atproto.sync.listRepos, every 30 min),
// then up to 100 accounts a round: each one's oldest town.delve.feed.post (listRecords, reverse=true,
// limit=1). A first post never changes, so each account is read once; an account with no post yet is
// read again every 2 hours. Accounts hosted on another PDS aren't reachable from here and are skipped.
const PDS = 'https://pds.delve.town/xrpc/';
const POST = 'town.delve.feed.post';
export const displayName = 'Welcome desk';
export const description = "The first post of every account on pds.delve.town, newest first, by when that post was made (a date in the future counts as the day we first saw it). Served by miniphim's house.";

const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url.split('?')[0].split('/').pop()}`); return r.json(); };

export async function refresh({ store, now }) {
  const t = Date.parse(now);
  let accounts = await store.get('accounts');
  if (!accounts || t - Date.parse(accounts.at) > 30 * 60_000) {
    const dids = []; let cursor;
    for (let i = 0; i < 10; i++) {
      const j = await get(`${PDS}com.atproto.sync.listRepos?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      for (const r of j.repos || []) if (r.active !== false) dids.push(r.did);
      if (!j.cursor || !(j.repos || []).length) break;
      cursor = j.cursor;
    }
    accounts = { at: now, dids };
    await store.put('accounts', accounts);
  }
  const known = new Map(await store.list('acct:'));
  const due = accounts.dids.filter((d) => { const k = known.get(`acct:${d}`); return !k || (!k.first && t - Date.parse(k.checked) > 2 * 3600_000); }).slice(0, 100);
  let found = 0;
  for (const did of due) {
    try {
      const j = await get(`${PDS}com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${POST}&limit=1&reverse=true`);
      const r = j.records?.[0];
      if (r) found++;
      await store.put(`acct:${did}`, { first: r ? { uri: r.uri, at: r.value?.createdAt || null } : null, checked: now });
    } catch { /* this one again next round */ }
  }
  return { accounts: accounts.dids.length, checked: due.length, found };
}

export const sortAt = (f, checked) => {
  const c = Date.parse(f?.at), k = Date.parse(checked);
  if (!Number.isFinite(c)) return Number.isFinite(k) ? k : 0;
  return Number.isFinite(k) ? Math.min(c, k) : c;
};

export default async function skeleton({ store, cursor, limit }) {
  const rows = (await store.list('acct:')).filter(([, v]) => v?.first?.uri).map(([, v]) => ({ uri: v.first.uri, t: sortAt(v.first, v.checked) }))
    .sort((a, b) => b.t - a.t || b.uri.localeCompare(a.uri));
  const start = Math.max(0, Number(cursor) || 0);
  const page = rows.slice(start, start + limit);
  return { feed: page.map((r) => ({ post: r.uri })), ...(start + limit < rows.length ? { cursor: String(start + limit) } : {}) };
}
