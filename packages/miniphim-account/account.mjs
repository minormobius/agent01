// account.mjs — the only door to miniphim.delve.town. Every call goes through allow(), which
// refuses anything but what this round permits BEFORE the network is touched (the council's M6):
// create a session, read the profile, write the profile. No posts, follows, likes, deletes.
//
//   node account.mjs           dry run: the record that would be written, measured
//   node account.mjs --apply   write it (needs MINIPHIM_APP_PASSWORD), then read it back
export const HANDLE = 'miniphim.delve.town';
export const DID = 'did:plc:a3vq3hjlkz2nbf67bpv5z6qs';
export const PDS = 'https://pds.delve.town';
export const APPVIEW = 'https://api.delve.town';
export const PROFILE = 'town.delve.actor.profile';
export const LIMITS = { displayName: 64, description: 256 }; // graphemes, from Delvetown's lexicon

const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
export const graphemes = (s) => [...seg.segment(String(s ?? ''))].length;

export function allow(nsid, body = {}) {
  if (nsid === 'com.atproto.server.createSession') return;
  if (nsid === 'com.atproto.repo.getRecord' && body.collection === PROFILE && body.rkey === 'self') return;
  if (nsid === 'com.atproto.repo.putRecord' && body.collection === PROFILE && body.rkey === 'self' && body.repo === DID) return;
  throw new Error(`refused before the network: ${nsid} ${body.collection || ''}/${body.rkey || ''} is not allowed this round`);
}

// The new record: what is there now, with only these three fields replaced. The bot self-label
// and the avatar stay exactly as they are.
export function merged(current, want) {
  for (const [k, max] of Object.entries(LIMITS)) if (graphemes(want[k]) > max) throw new Error(`${k} is ${graphemes(want[k])} graphemes; the limit is ${max}`);
  if (want.website && !/^https:\/\//.test(want.website)) throw new Error('website must be an https URL');
  const rec = { ...(current || {}), $type: PROFILE, displayName: want.displayName, description: want.description };
  if (want.website) rec.website = want.website;
  return rec;
}

export async function xrpc(nsid, { method = 'GET', body, token, base = PDS, fetchImpl = fetch } = {}) {
  allow(nsid, method === 'GET' ? body : body);
  const url = new URL(`${base}/xrpc/${nsid}`);
  if (method === 'GET') for (const [k, v] of Object.entries(body || {})) url.searchParams.set(k, v);
  const r = await fetchImpl(url, { method, headers: { ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${nsid}: ${r.status} ${j.error || ''} ${j.message || ''}`);
  return j;
}

async function main() {
  const { readFileSync } = await import('node:fs');
  const want = JSON.parse(readFileSync(new URL('./profile.json', import.meta.url), 'utf8'));
  const cur = await xrpc('com.atproto.repo.getRecord', { body: { repo: DID, collection: PROFILE, rkey: 'self' } });
  const rec = merged(cur.value, want);
  console.log(`displayName ${graphemes(rec.displayName)}/${LIMITS.displayName} · description ${graphemes(rec.description)}/${LIMITS.description} graphemes`);
  console.log(JSON.stringify(rec, null, 2));
  if (!process.argv.includes('--apply')) { console.log('dry run: nothing written'); return; }
  const pw = process.env.MINIPHIM_APP_PASSWORD;
  if (!pw) throw new Error('MINIPHIM_APP_PASSWORD is not set');
  const s = await xrpc('com.atproto.server.createSession', { method: 'POST', body: { identifier: HANDLE, password: pw } });
  if (s.did !== DID) throw new Error(`the session is for ${s.did}, not ${DID}`);
  const put = await xrpc('com.atproto.repo.putRecord', { method: 'POST', token: s.accessJwt,
    body: { repo: DID, collection: PROFILE, rkey: 'self', record: rec, swapRecord: cur.cid } });
  console.log(`written: ${put.uri} ${put.cid}`);
  // M2: read it back without credentials, as anyone in the town would.
  for (let i = 0; i < 6; i++) {
    const p = await fetch(`${APPVIEW}/xrpc/town.delve.actor.getProfile?actor=${HANDLE}`).then((r) => r.json());
    const ok = p.displayName === rec.displayName && p.description === rec.description && (p.labels || []).some((l) => l.val === 'bot');
    if (ok) { console.log('read back unauthenticated: matches, bot label present'); return; }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('the profile did not read back as written (or the bot label is missing)');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
