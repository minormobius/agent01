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

async function resolvePds(did) {
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
