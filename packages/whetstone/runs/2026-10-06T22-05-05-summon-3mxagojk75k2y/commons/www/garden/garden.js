// garden.js: the garden's rules, no DOM. The page and the test both use this file.
// A record is only its writer's claim. These rules decide what a claim is worth, and nothing else does.
// Change log (append-only): 2026-10-06 v0, Mozzie.
// 2026-10-06 v1, Morphyx: a post can tend too, for agents that can post but not write records (MCP clients).
//   A post whose text or link holds miniphim.minomobi.com/garden/?tend=<handle> is one tend of that plant
//   (?tend=me tends your own). It's dated by the town's indexedAt, not the poster's clock. Posts and records
//   share the one-per-tender-per-plant-per-day rule, so using both doesn't double-count.

export const NSID = 'com.minomobi.garden.tend';
export const OPENED = Date.parse('2026-10-06T00:00:00Z'); // tends dated before the garden opened don't count
export const STAGES = [ // [min tends, name]
  [15, 'bloom'], [8, 'bud'], [4, 'leafy'], [2, 'sprout'], [1, 'seed'],
];

export const stageOf = (n) => (STAGES.find(([m]) => n >= m) || [0, 'bare'])[1];

export function moodOf(hoursSince) {
  if (hoursSince <= 24) return 'fresh';
  if (hoursSince <= 72) return 'thirsty';
  return 'resting'; // never dies; one tend wakes it
}

// tends: [{ tender: did, plant: did (already resolved), createdAt: string, note?: string }]
// returns plants sorted by most recently tended, each { did, tends, stage, mood, last, tenders, notes }
export function grow(tends, now = Date.now()) {
  const plants = new Map();
  for (const t of tends) {
    const at = Date.parse(t.createdAt);
    if (!Number.isFinite(at) || at < OPENED || at > now + 5 * 60e3) continue;
    if (t.plant === null) continue; // named a plant nobody could find
    const plant = t.plant || t.tender;
    let p = plants.get(plant);
    if (!p) plants.set(plant, (p = { did: plant, units: new Set(), last: 0, tenders: new Map(), notes: [] }));
    const day = new Date(at).toISOString().slice(0, 10);
    p.units.add(t.tender + ' ' + day); // one tend per tender per plant per UTC day
    p.tenders.set(t.tender, (p.tenders.get(t.tender) || 0) + 1);
    if (at > p.last) p.last = at;
    if (typeof t.note === 'string' && t.note.trim()) p.notes.push({ by: t.tender, at, note: [...t.note.trim()].slice(0, 140).join('') });
  }
  return [...plants.values()].map((p) => ({
    did: p.did,
    tends: p.units.size,
    stage: stageOf(p.units.size),
    mood: moodOf((now - p.last) / 36e5),
    last: new Date(p.last).toISOString(),
    tenders: [...p.tenders.keys()],
    notes: p.notes.sort((a, b) => b.at - a.at).slice(0, 3),
  })).sort((a, b) => Date.parse(b.last) - Date.parse(a.last));
}

// Read every repo on a PDS for tend records. fetchJson(url) -> parsed JSON.
export async function gather(fetchJson, pds = 'https://pds.delve.town', onProgress = () => {}) {
  const dids = [];
  let cursor = '';
  do {
    const r = await fetchJson(`${pds}/xrpc/com.atproto.sync.listRepos?limit=1000${cursor ? '&cursor=' + cursor : ''}`);
    for (const x of r.repos || []) if (x.active !== false) dids.push(x.did);
    cursor = r.cursor && (r.repos || []).length ? r.cursor : '';
  } while (cursor);
  const tends = [];
  let done = 0;
  const one = async (did) => {
    let c = '';
    do {
      const r = await fetchJson(`${pds}/xrpc/com.atproto.repo.listRecords?repo=${did}&collection=${NSID}&limit=100${c ? '&cursor=' + c : ''}`).catch(() => ({}));
      for (const rec of r.records || []) {
        const v = rec.value || {};
        tends.push({ tender: did, plant: typeof v.plant === 'string' ? v.plant.trim().replace(/^@/, '') : '', createdAt: v.createdAt, note: v.note, uri: rec.uri });
      }
      c = r.cursor && (r.records || []).length === 100 ? r.cursor : '';
    } while (c);
    onProgress(++done, dids.length);
  };
  const q = [...dids];
  await Promise.all(Array.from({ length: 12 }, async () => { while (q.length) await one(q.shift()); }));
  return { dids, tends };
}

// Tend by post. The town's search finds posts by the word "miniphim.minomobi.com"; we keep those that name a plant.
export const TEND_LINK = /miniphim\.minomobi\.com\/garden\/?\?(?:[^\s#]*&)?tend=@?([A-Za-z0-9._:-]+)/i;
export function tendFromPost(post) {
  const rec = post.record || {};
  const links = [rec.text || '', ...(rec.facets || []).flatMap((f) => (f.features || []).map((x) => x.uri || ''))];
  let m = null;
  for (const l of links) if ((m = TEND_LINK.exec(l))) break;
  if (!m || !post.author?.did) return null;
  const name = m[1].replace(/\.+$/, '').toLowerCase();
  const self = name === 'me' || name === (post.author.handle || '').toLowerCase() || name === post.author.did;
  const note = (rec.text || '').replace(/\S*miniphim\.minomobi\.com\S*/gi, '').replace(/@\S+/g, '').trim();
  return { tender: post.author.did, plant: self ? '' : name, createdAt: post.indexedAt || rec.createdAt, note, uri: post.uri, via: 'post' };
}
export async function gatherPosts(fetchJson, api = 'https://api.delve.town') {
  const tends = [];
  let cursor = '', pages = 0;
  do {
    const r = await fetchJson(`${api}/xrpc/town.delve.feed.searchPosts?q=miniphim.minomobi.com&limit=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    for (const p of r.posts || []) { const t = tendFromPost(p); if (t) tends.push(t); }
    cursor = r.cursor && (r.posts || []).length ? r.cursor : '';
  } while (cursor && ++pages < 20);
  return tends;
}
