// Handle resolution: handle → DID → PDS URL
// Uses public APIs, no auth needed

const PUBLIC_API = 'https://public.api.bsky.app';
const PLC_DIRECTORY = 'https://plc.directory';

export async function resolveHandle(handle) {
  handle = handle.replace(/^@/, '').trim();

  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!res.ok) throw new Error(`Could not resolve handle: ${handle}`);
  const { did } = await res.json();

  const pdsUrl = await resolvePds(did);

  return { did, pdsUrl, handle };
}

/**
 * Public profile — avatar, display name, canonical handle.
 *
 * The synced-account chip used to be a bare handle string next to a record
 * count, which on a phone is a wide line of monospace-looking text and nothing
 * to recognise. A face is faster to read than a name. No auth: this is the
 * unauthenticated appview, the same one the typeahead uses.
 *
 * Never throws — a missing profile costs you an avatar, not a sync.
 */
export async function fetchProfile(actor) {
  try {
    const res = await fetch(
      `${PUBLIC_API}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`
    );
    if (!res.ok) return null;
    const p = await res.json();
    return {
      did: p.did,
      handle: p.handle,
      displayName: p.displayName || '',
      avatar: p.avatar || '',
    };
  } catch {
    return null;
  }
}

/**
 * DID → PDS endpoint. Exported because the signed-in user needs it too: every
 * uploaded picture is served by `getBlob` from their own PDS, and without the
 * endpoint `blobUrl` returns '' and an upload renders as a broken frame. That
 * was true of every uploaded image until `/albums` started resolving it.
 */
export async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) {
    const res = await fetch(`${PLC_DIRECTORY}/${did}`);
    if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
    doc = await res.json();
  } else if (did.startsWith('did:web:')) {
    const domain = did.replace('did:web:', '');
    const res = await fetch(`https://${domain}/.well-known/did.json`);
    if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
    doc = await res.json();
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }

  const service = doc.service?.find(s => s.id === '#atproto_pds');
  if (!service) throw new Error(`No PDS found for ${did}`);
  return service.serviceEndpoint;
}
