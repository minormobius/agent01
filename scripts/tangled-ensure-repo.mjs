#!/usr/bin/env node
// Ensure a sh.tangled.repo record exists under the owner's PDS for SITE, so
// the repository exists on tangled (clone/push become possible). This is the
// "create a repo" step the tangled UI does, reduced to a putRecord — copies
// the knot + knot-DID from an existing repo record as a template.
//
//   BLUESKY_HANDLE=minomobi.bsky.social BLUESKY_APP_PASSWORD=xxxx \
//   SITE=guthkatz DESC="…" node scripts/tangled-ensure-repo.mjs
//
// Runs in a GitHub Action (Node 20+, global fetch). Idempotent: putRecord
// overwrites, so re-running is harmless.

const handle = process.env.BLUESKY_HANDLE;
const password = process.env.BLUESKY_APP_PASSWORD;
const site = process.env.SITE;
const desc = process.env.DESC || `Remixable mino.mobi/${site}`;
if (!handle || !password || !site) {
  console.error('Need BLUESKY_HANDLE, BLUESKY_APP_PASSWORD, SITE.');
  process.exit(1);
}
const ENTRY = process.env.PDS_ENTRY || 'https://bsky.social';

async function call(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!r.ok) throw new Error(`${url} → ${r.status}: ${text}`);
  return body;
}

// 1) Authenticate (app-password session).
const session = await call(`${ENTRY}/xrpc/com.atproto.server.createSession`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identifier: handle, password }),
});
const did = session.did;
const jwt = session.accessJwt;
let pds = ENTRY;
const svc = (session.didDoc?.service || []).find(s => s.type === 'AtprotoPersonalDataServer');
if (svc?.serviceEndpoint) pds = svc.serviceEndpoint;
console.log(`auth ok: ${did} @ ${pds}`);
const authHeaders = { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' };

// 2) Template knot + repoDid from an existing repo record.
const tmplKnot = process.env.TANGLED_KNOT_NAME;
const tmplDid = process.env.TANGLED_KNOT_DID;
let knot = tmplKnot, repoDid = tmplDid;
if (!knot || !repoDid) {
  const list = await call(
    `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=sh.tangled.repo&limit=1`,
    { headers: authHeaders });
  const tmpl = list.records?.[0]?.value;
  if (!tmpl?.knot || !tmpl?.repoDid) {
    console.error('No existing sh.tangled.repo to copy knot/repoDid from — create one repo manually first, or set TANGLED_KNOT_NAME/TANGLED_KNOT_DID.');
    process.exit(1);
  }
  knot = tmpl.knot; repoDid = tmpl.repoDid;
}
console.log(`template: knot=${knot} repoDid=${repoDid}`);

// 3) Create/overwrite the repo record at rkey = site.
const record = {
  $type: 'sh.tangled.repo',
  knot,
  repoDid,
  createdAt: new Date().toISOString(),
  description: desc,
};
const res = await call(`${pds}/xrpc/com.atproto.repo.putRecord`, {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({ repo: did, collection: 'sh.tangled.repo', rkey: site, record }),
});
console.log(`✓ sh.tangled.repo/${site} → ${res.uri}`);
