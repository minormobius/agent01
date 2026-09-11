// cad — cad.mino.mobi. Thin worker in front of static assets, plus one read
// gateway.
//
// The site is static: one HTML file, the ES modules, the 1.7 MB Rust engine
// and the 0.5 MB Manifold module. Workers Static Assets serves an asset match
// directly without invoking this — the headers that apply come from
// `_headers`; this exists for misses, to keep the wasm content type right,
// and for `/xrpc/*`.
//
// /xrpc/ is how the page reads anyone's public CAD records without talking to
// a PDS host itself (the page's CSP is connect-src 'self'). It accepts the two
// public read methods, resolves `repo` (a handle or a DID) to that repo's PDS
// through the public directory, forwards the call, and caches the answer
// briefly. Only `com.minomobi.cad.*` collections pass, so it is a CAD
// gateway, not a general proxy. Nothing here needs a secret; every record it
// returns is public already. Writes never come here — they go through the
// signed-in user's session on the shared auth worker.

const METHODS = new Set(['com.atproto.repo.getRecord', 'com.atproto.repo.listRecords']);
const COLLECTION = /^com\.minomobi\.cad\./;
const DIRECTORY = 'https://plc.directory';
const PUBLIC_API = 'https://public.api.bsky.app';

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': status === 200 ? 'public, max-age=30' : 'no-store', ...extra } });

async function resolveDid(repo, f) {
  if (repo.startsWith('did:')) return repo;
  const r = await f(`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(repo)}`);
  if (!r.ok) throw new Error(`cannot resolve handle ${repo}`);
  return (await r.json()).did;
}
async function resolvePds(did, f) {
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/xrpc/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400' } });
      if (request.method !== 'GET') return json({ error: 'MethodNotAllowed' }, 405);
      return xrpc(url);
    }
    const res = await env.ASSETS.fetch(request);
    if (url.pathname.endsWith('.wasm')) {
      const headers = new Headers(res.headers);
      headers.set('content-type', 'application/wasm');
      return new Response(res.body, { status: res.status, headers });
    }
    return res;
  },
};
