// identity.js — handle → DID → PDS, and a public profile.
//
// Two unauthenticated calls against the public appview and plc.directory. Every
// tool here that has to reach an account's own server needs them, and they were
// being written out again in each one.
//
// Deliberately NOT a vendored copy of photo's `src/lib/resolve.js`, even though
// it does the same job: that file is bundled by Vite and this surface has no
// build step, so a byte-identical copy would carry a sync obligation
// (`scripts/sync-dataviz.mjs`) for forty lines of two fetch calls against a
// frozen public API. If a third surface needs it, promote it to `packages/`
// and vendor it properly — that is the point at which the bookkeeping pays.

const PUBLIC_API = 'https://public.api.bsky.app';
const PLC = 'https://plc.directory';

/** handle (or DID) → `{ did, handle, pdsUrl }`. */
export async function resolveHandle(input) {
  const raw = String(input || '').replace(/^@/, '').trim();
  if (!raw) throw new Error('no handle given');

  let did = raw;
  if (!raw.startsWith('did:')) {
    const res = await fetch(
      `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(raw)}`,
    );
    if (!res.ok) throw new Error(`no such handle: ${raw}`);
    ({ did } = await res.json());
  }
  return { did, handle: raw, pdsUrl: await resolvePds(did) };
}

/** DID → the PDS that actually holds the repo. */
export async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) {
    const res = await fetch(`${PLC}/${did}`);
    if (!res.ok) throw new Error(`could not resolve ${did}`);
    doc = await res.json();
  } else if (did.startsWith('did:web:')) {
    const res = await fetch(`https://${did.slice('did:web:'.length)}/.well-known/did.json`);
    if (!res.ok) throw new Error(`could not resolve ${did}`);
    doc = await res.json();
  } else {
    throw new Error(`unsupported DID method: ${did}`);
  }
  const service = (doc.service || []).find((s) => s.id === '#atproto_pds');
  if (!service) throw new Error(`no PDS listed for ${did}`);
  return service.serviceEndpoint;
}

/** Avatar, display name, canonical handle. Never throws — it is decoration. */
export async function fetchProfile(actor) {
  try {
    const res = await fetch(`${PUBLIC_API}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
    if (!res.ok) return null;
    const p = await res.json();
    return { did: p.did, handle: p.handle, displayName: p.displayName || '', avatar: p.avatar || '' };
  } catch {
    return null;
  }
}
