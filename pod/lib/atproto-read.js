// Minimal unauthenticated ATProto reads for /prod — no build, no deps.
// Resolves a DID's PDS, reads public records, fetches public blobs.

const _pdsCache = new Map();

export async function resolvePds(did) {
  if (_pdsCache.has(did)) return _pdsCache.get(did);
  let doc;
  if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length).replace(/:/g, '/');
    doc = await (await fetch(`https://${host}/.well-known/did.json`)).json();
  } else {
    doc = await (await fetch(`https://plc.directory/${encodeURIComponent(did)}`)).json();
  }
  const svc = (doc.service || []).find((s) => /#atproto_pds$/.test(s.id) || s.id === '#atproto_pds');
  if (!svc) throw new Error('no PDS service in DID doc for ' + did);
  const ep = svc.serviceEndpoint.replace(/\/$/, '');
  _pdsCache.set(did, ep);
  return ep;
}

export function parseAtUri(uri) {
  const m = String(uri).match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!m) throw new Error('bad at-uri: ' + uri);
  return { did: m[1], collection: m[2], rkey: m[3] };
}

export async function getRecord(uri) {
  const { did, collection, rkey } = parseAtUri(uri);
  const pds = await resolvePds(did);
  const q = new URLSearchParams({ repo: did, collection, rkey });
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?${q}`);
  if (!res.ok) throw new Error(`getRecord ${uri}: HTTP ${res.status}`);
  return res.json(); // { uri, cid, value }
}

export async function getBlob(did, cid) {
  const pds = await resolvePds(did);
  const q = new URLSearchParams({ did, cid });
  const res = await fetch(`${pds}/xrpc/com.atproto.sync.getBlob?${q}`);
  if (!res.ok) throw new Error(`getBlob ${cid}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// A blob ref read back from a record looks like
// { $type:'blob', ref:{ $link:'<cid>' }, mimeType, size }. Normalize to its CID.
export function blobCid(blobRef) {
  return blobRef && blobRef.ref && (blobRef.ref.$link || blobRef.ref['$link']);
}
