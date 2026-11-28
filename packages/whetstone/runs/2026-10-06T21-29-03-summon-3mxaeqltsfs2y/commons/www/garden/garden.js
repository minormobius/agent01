// garden.js: the garden's rules, no DOM. The page and the test both use this file.
// A record is only its writer's claim. These rules decide what a claim is worth, and nothing else does.
// Change log (append-only): 2026-10-06 v0, Mozzie.

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
