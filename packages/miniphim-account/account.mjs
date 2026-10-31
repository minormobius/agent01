// account.mjs — the only door to miniphim.delve.town. Every call goes through allow(), which
// refuses anything but what this round permits BEFORE the network is touched (the council's M6):
// create a session, read the town, and every record operation in our own repo (profile, posts, follows,
// likes, reposts, blocks, lists, any lexicon of theirs). Each widening is named where allow() grants it.
//
//   node account.mjs           dry run: the record that would be written, measured
//   node account.mjs --apply   write it (needs MINIPHIM_APP_PASSWORD), then read it back
export const HANDLE = 'miniphim.delve.town';
export const DID = 'did:plc:a3vq3hjlkz2nbf67bpv5z6qs';
export const PDS = 'https://pds.delve.town';
export const APPVIEW = 'https://api.delve.town';
export const PROFILE = 'town.delve.actor.profile';
export const LIMITS = { displayName: 64, description: 256 }; // graphemes, from Delvetown's lexicon
const IMAGE = new Set(['image/png', 'image/jpeg']);

const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
export const graphemes = (s) => [...seg.segment(String(s ?? ''))].length;

// The town (2026-10-05): reading the town (posts, threads, profiles, follows), posting or retracting
// our own posts, and following and liking from our own repo. Still no reposts, blocks, lists, DMs or
// anyone else's repo.
export const TOWN_READS = new Set(['town.delve.notification.listNotifications', 'town.delve.feed.getAuthorFeed', 'town.delve.feed.getTimeline',
  'town.delve.feed.searchPosts', 'town.delve.feed.getPostThread', 'town.delve.feed.getPosts', 'town.delve.feed.getLikes',
  'town.delve.actor.getProfile', 'town.delve.actor.getProfiles', 'town.delve.actor.searchActors',
  'town.delve.graph.getFollows', 'town.delve.graph.getFollowers', 'com.atproto.identity.resolveHandle']);
const POST = 'town.delve.feed.post';
// The social graph (2026-10-05, the person: "they should have the hooks to follow, like and post"):
// follows and likes in our own repo, and listing our own follows and likes to undo one.
export const GRAPH = new Set(['town.delve.graph.follow', 'town.delve.feed.like']);

export function allow(nsid, body = {}) {
  if (TOWN_READS.has(nsid)) return;
  if (nsid === 'com.atproto.repo.createRecord' && body.repo === DID && body.collection === POST) return;
  if (nsid === 'com.atproto.repo.deleteRecord' && body.repo === DID && body.collection === POST) return;
  if ((nsid === 'com.atproto.repo.createRecord' || nsid === 'com.atproto.repo.deleteRecord') && body.repo === DID && GRAPH.has(body.collection)) return;
  if (nsid === 'com.atproto.repo.listRecords' && body.repo === DID && GRAPH.has(body.collection)) return;
  // Their repo is theirs (2026-10-06, the person: "they should be able to perform all operations,
  // it's their repo"): every record operation, any collection, in OUR repo only. Other repos, the
  // account itself (passwords, email, handle, deletion) and other servers' admin stay refused here,
  // and an app password can't reach those anyway.
  const REPO_OPS = ['com.atproto.repo.createRecord', 'com.atproto.repo.putRecord', 'com.atproto.repo.deleteRecord', 'com.atproto.repo.getRecord',
    'com.atproto.repo.listRecords', 'com.atproto.repo.applyWrites', 'com.atproto.repo.describeRepo', 'com.atproto.repo.listMissingBlobs'];
  if (REPO_OPS.includes(nsid) && body.repo === DID) return;
  if (nsid === 'com.atproto.repo.uploadBlob' && body.size > 0 && body.size < 5_000_000) return;
  if (nsid === 'com.atproto.server.createSession') return;
  if (nsid === 'com.atproto.repo.uploadBlob' && IMAGE.has(body.contentType) && body.size > 0 && body.size < 1_000_000) return;
  if (nsid === 'com.atproto.repo.getRecord' && body.collection === PROFILE && body.rkey === 'self') return;
  if (nsid === 'com.atproto.repo.putRecord' && body.collection === PROFILE && body.rkey === 'self' && body.repo === DID) return;
  throw new Error(`refused before the network: ${nsid} ${body.collection || ''}/${body.rkey || ''} is not allowed this round`);
}

// The new record: what is there now, with only these three fields replaced. The bot self-label
// and the avatar stay exactly as they are.
export function merged(current, want, avatar = null) {
  for (const [k, max] of Object.entries(LIMITS)) if (graphemes(want[k]) > max) throw new Error(`${k} is ${graphemes(want[k])} graphemes; the limit is ${max}`);
  if (want.website && !/^https:\/\//.test(want.website)) throw new Error('website must be an https URL');
  const rec = { ...(current || {}), $type: PROFILE, displayName: want.displayName, description: want.description };
  if (want.website) rec.website = want.website;
  if (avatar) rec.avatar = avatar;
  return rec;
}

export async function xrpc(nsid, { method = 'GET', body, token, base = PDS, fetchImpl = fetch, bytes, contentType, proxy } = {}) {
  allow(nsid, bytes ? { contentType, size: bytes.length } : body);
  const url = new URL(`${base}/xrpc/${nsid}`);
  if (method === 'GET') for (const [k, v] of Object.entries(body || {})) url.searchParams.set(k, v);
  const r = await fetchImpl(url, { method, headers: { ...(method === 'POST' ? { 'content-type': bytes ? contentType : 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(proxy ? { 'atproto-proxy': proxy } : {}) },
    body: method === 'POST' ? (bytes || JSON.stringify(body)) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${nsid}: ${r.status} ${j.error || ''} ${j.message || ''}`);
  return j;
}

async function main() {
  const { readFileSync } = await import('node:fs');
  const want = JSON.parse(readFileSync(new URL('./profile.json', import.meta.url), 'utf8'));
  const cur = await xrpc('com.atproto.repo.getRecord', { body: { repo: DID, collection: PROFILE, rkey: 'self' } });
  const img = want.avatar ? readFileSync(new URL(want.avatar, import.meta.url)) : null;
  const imgType = want.avatar && /\.png$/i.test(want.avatar) ? 'image/png' : 'image/jpeg';
  let rec = merged(cur.value, want);
  console.log(`displayName ${graphemes(rec.displayName)}/${LIMITS.displayName} · description ${graphemes(rec.description)}/${LIMITS.description} graphemes`);
  console.log(JSON.stringify(rec, null, 2));
  if (!process.argv.includes('--apply')) { console.log('dry run: nothing written'); return; }
  const pw = process.env.MINIPHIM_APP_PASSWORD;
  if (!pw) throw new Error('MINIPHIM_APP_PASSWORD is not set');
  const s = await xrpc('com.atproto.server.createSession', { method: 'POST', body: { identifier: HANDLE, password: pw } });
  if (s.did !== DID) throw new Error(`the session is for ${s.did}, not ${DID}`);
  if (img) {
    const up = await xrpc('com.atproto.repo.uploadBlob', { method: 'POST', token: s.accessJwt, bytes: img, contentType: imgType });
    rec = merged(cur.value, want, up.blob);
    console.log(`avatar uploaded: ${img.length} bytes, ${up.blob?.ref?.$link}`);
  }
  const put = await xrpc('com.atproto.repo.putRecord', { method: 'POST', token: s.accessJwt,
    body: { repo: DID, collection: PROFILE, rkey: 'self', record: rec, swapRecord: cur.cid } });
  console.log(`written: ${put.uri} ${put.cid}`);
  // M2: read it back without credentials, as anyone in the town would.
  for (let i = 0; i < 6; i++) {
    const p = await fetch(`${APPVIEW}/xrpc/town.delve.actor.getProfile?actor=${HANDLE}`).then((r) => r.json());
    const ok = p.displayName === rec.displayName && p.description === rec.description && (p.labels || []).some((l) => l.val === 'bot')
      && (!img || String(p.avatar || '').includes(rec.avatar.ref.$link));
    if (ok) { console.log('read back unauthenticated: matches, bot label present'); return; }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('the profile did not read back as written (or the bot label is missing)');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
