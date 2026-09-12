// gateway.js — the /xrpc/ read gateway: how the page (and the MCP file tools)
// read anyone's public CAD records without talking to a PDS host themselves.
// Accepts the two public read methods, resolves `repo` (a handle or a DID) to
// that repo's PDS through the public directory, forwards the call, and caches
// the answer briefly. Only `com.minomobi.cad.*` collections pass, so it is a
// CAD gateway, not a general proxy. Nothing here needs a secret; every record
// it returns is public already. Writes never come here.
//
// Two public actor methods pass too — `app.bsky.actor.searchActorsTypeahead`
// (handle suggestions on every handle field, packages/oauth-client/
// typeahead.js) and `app.bsky.actor.getProfile` (a DID's handle on the parts
// page) — forwarded to the public API with their declared parameters only.
// They are here so a page's CSP names this host and nothing else.
//
// Plain functions of a URL and a fetch, so drive.selftest.mjs runs them under
// node; worker.js mounts them on the live host.

const METHODS = new Set(['com.atproto.repo.getRecord', 'com.atproto.repo.listRecords']);
const ACTOR = { 'app.bsky.actor.searchActorsTypeahead': ['q', 'limit'], 'app.bsky.actor.getProfile': ['actor'] };
const COLLECTION = /^com\.minomobi\.cad\./;
const DIRECTORY = 'https://plc.directory';
const PUBLIC_API = 'https://public.api.bsky.app';

export const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': status === 200 ? 'public, max-age=30' : 'no-store', ...extra } });

export async function resolveDid(repo, f) {
  if (repo.startsWith('did:')) return repo;
  const r = await f(`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(repo)}`);
  if (!r.ok) throw new Error(`cannot resolve handle ${repo}`);
  return (await r.json()).did;
}
export async function resolvePds(did, f) {
  const url = did.startsWith('did:plc:') ? `${DIRECTORY}/${did}` : did.startsWith('did:web:') ? `https://${did.slice(8)}/.well-known/did.json` : null;
  if (!url) throw new Error(`unsupported DID ${did}`);
  const r = await f(url, { cf: { cacheTtl: 300 } });
  if (!r.ok) throw new Error(`cannot resolve ${did}`);
  const svc = (await r.json()).service?.find((s) => s.id === '#atproto_pds');
  if (!svc) throw new Error(`no PDS for ${did}`);
  return svc.serviceEndpoint.replace(/\/$/, '');
}

export async function xrpc(url, f = fetch) {
  const method = url.pathname.slice('/xrpc/'.length);
  if (ACTOR[method]) {
    const out = new URL(`${PUBLIC_API}/xrpc/${method}`);
    for (const k of ACTOR[method]) if (url.searchParams.has(k)) out.searchParams.set(k, url.searchParams.get(k));
    if (method.endsWith('searchActorsTypeahead')) out.searchParams.set('limit', String(Math.min(10, Number(url.searchParams.get('limit')) || 8)));
    try {
      const r = await f(out, { headers: { accept: 'application/json' } });
      return new Response(await r.text(), { status: r.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': r.ok ? 'public, max-age=60' : 'no-store' } });
    } catch (e) { return json({ error: 'UpstreamFailed', message: String(e?.message ?? e) }, 502); }
  }
  if (!METHODS.has(method)) return json({ error: 'MethodNotSupported', message: `${method} is not served here` }, 404);
  const repo = url.searchParams.get('repo'), collection = url.searchParams.get('collection');
  if (!repo || !collection) return json({ error: 'InvalidRequest', message: 'repo and collection are required' }, 400);
  if (!COLLECTION.test(collection)) return json({ error: 'InvalidRequest', message: 'only com.minomobi.cad.* collections are served here' }, 400);
  try {
    const did = await resolveDid(repo, f);
    const pds = await resolvePds(did, f);
    const out = new URL(`${pds}/xrpc/${method}`);
    for (const k of ['collection', 'rkey', 'limit', 'cursor', 'reverse']) if (url.searchParams.has(k)) out.searchParams.set(k, url.searchParams.get(k));
    out.searchParams.set('repo', did);
    const r = await f(out, { headers: { accept: 'application/json' } });
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': r.ok ? 'public, max-age=30' : 'no-store' } });
  } catch (e) {
    return json({ error: 'UpstreamFailed', message: String(e?.message ?? e) }, 502);
  }
}
