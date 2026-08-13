// sweep.mjs — THE COURIER. Finds new petitions and drops them in the council's queue.
//
// Discovery rides Bluesky: filing a petition in-game also posts a courier post tagged
// #harvestople (the game does this — store.sharePost after writePetition). The sweep searches
// the public appview for the tag, then goes to each author's OWN PDS for the authoritative
// com.minomobi.farm.petition records — the post is a flare and a reply anchor, never the source
// of truth. Keyless throughout; the watermark (queue/state.json) makes it idempotent.
//
//   node farm/sim/sweep.mjs            sweep, write queue files, print QUEUED <n>
//   node farm/sim/sweep.mjs --dry      sweep, print what would be queued, write nothing
//
// Writes: farm/council/queue/<rkey>.json  { uri, did, handle, text, createdAt, post: {uri, cid} }
//         farm/council/queue/state.json   { seen: [record uris], sweptAt ISO }
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const QUEUE = join(here, '../council/queue');
const STATE = join(QUEUE, 'state.json');
const TAG = '#harvestople';
const PETITION_COLLECTION = 'com.minomobi.farm.petition';
const APPVIEW = 'https://public.api.bsky.app/xrpc';
const DRY = process.argv.includes('--dry');

const jfetch = async (url) => {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(url.split('?')[0] + ' → ' + res.status);
  return res.json();
};

async function resolvePds(did) {
  const doc = did.startsWith('did:plc:')
    ? await jfetch('https://plc.directory/' + did)
    : did.startsWith('did:web:')
      ? await jfetch('https://' + did.slice(8).split(':').join('/') + '/.well-known/did.json')
      : null;
  const svc = doc && (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
  return svc ? svc.serviceEndpoint : null;
}

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { seen: [] };
const seen = new Set(state.seen);

// 1) the flares — courier posts under the tag, newest first. Public appview first; if that is
// refused (some deployments gate search), fall back to an authenticated PDS-proxied search with
// the town account's credentials when the workflow provides them.
async function searchFlares() {
  const q = '/xrpc/app.bsky.feed.searchPosts?q=' + encodeURIComponent(TAG) + '&sort=latest&limit=100';
  try { return await jfetch(APPVIEW.replace('/xrpc', '') + q); } catch (e) {
    const { BLUESKY_HANDLE, BLUESKY_APP_PASSWORD } = process.env;
    if (!BLUESKY_HANDLE || !BLUESKY_APP_PASSWORD) throw e;
    const s = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: BLUESKY_HANDLE, password: BLUESKY_APP_PASSWORD }),
    }).then((r) => r.json());
    if (!s.accessJwt) throw new Error('fallback session failed');
    const res = await fetch('https://bsky.social' + q, { headers: { authorization: 'Bearer ' + s.accessJwt } });
    if (!res.ok) throw new Error('authed searchPosts → ' + res.status);
    return res.json();
  }
}
const search = await searchFlares()
  .catch((e) => { console.log('::warning::searchPosts failed (' + e.message + ') — sweeping nothing'); return { posts: [] }; });
const byAuthor = new Map();   // did → { handle, posts: [{uri, cid, text}] }
for (const p of search.posts || []) {
  const did = p.author && p.author.did;
  if (!did) continue;
  if (!byAuthor.has(did)) byAuthor.set(did, { handle: p.author.handle, posts: [] });
  byAuthor.get(did).posts.push({ uri: p.uri, cid: p.cid, text: (p.record && p.record.text) || '' });
}

// 2) the truth — each flare author's own petition records
const queued = [];
for (const [did, a] of byAuthor) {
  let records = [];
  try {
    const pds = await resolvePds(did);
    if (!pds) continue;
    const out = await jfetch(pds + '/xrpc/com.atproto.repo.listRecords?repo=' + encodeURIComponent(did) +
      '&collection=' + PETITION_COLLECTION + '&limit=50');
    records = out.records || [];
  } catch (e) { console.log('::warning::' + a.handle + ': ' + e.message); continue; }
  for (const r of records) {
    if (seen.has(r.uri)) continue;
    const text = String((r.value && r.value.text) || '').slice(0, 2000);
    if (!text) continue;
    // the reply anchor: the courier post that carries this petition's opening words, else the latest flare
    const head = text.slice(0, 40);
    const post = a.posts.find((p) => p.text.includes(head)) || a.posts[0];
    queued.push({
      uri: r.uri, did, handle: a.handle, text,
      createdAt: (r.value && r.value.createdAt) || null,
      post: post ? { uri: post.uri, cid: post.cid } : null,
    });
    seen.add(r.uri);
  }
}

if (DRY) {
  for (const q of queued) console.log('would queue:', q.handle, '—', q.text.slice(0, 60));
  console.log('QUEUED ' + queued.length + ' (dry)');
  process.exit(0);
}

mkdirSync(QUEUE, { recursive: true });
for (const q of queued) {
  const rkey = q.uri.split('/').pop().replace(/[^a-z0-9]/gi, '');
  writeFileSync(join(QUEUE, rkey + '.json'), JSON.stringify(q, null, 2) + '\n');
  console.log('queued: ' + q.handle + ' — ' + q.text.slice(0, 60).replace(/\n/g, ' '));
}
writeFileSync(STATE, JSON.stringify({ sweptAt: new Date().toISOString(), seen: [...seen].slice(-1000) }, null, 2) + '\n');
console.log('QUEUED ' + queued.length);
