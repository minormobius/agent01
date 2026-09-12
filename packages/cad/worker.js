// cad — cad.mino.mobi. Thin worker in front of static assets, plus the read
// gateway (gateway.js) and the tool surface (mcp.js).
//
// The site is static: one HTML file, the ES modules, the 1.7 MB Rust engine
// and the 0.5 MB Manifold module. Workers Static Assets serves an asset match
// directly without invoking this — the headers that apply come from
// `_headers`; this exists for misses, to keep the wasm content type right,
// for `/xrpc/*`, for `/mcp`, and to mount `/parts/*`.
//
// /parts/ is the social layer: a separate worker (../../parts/) with its own
// Durable Object and cron, reached through the PARTS service binding with
// the prefix stripped, so it sees the same paths it would on its own host.
// It lives here because the mino.mobi zone is at Cloudflare's ceiling of 100
// Workers custom domains (code 100122 on its first deploy) and the deploy
// token cannot write DNS for a route. Same origin as the viewer: one auth
// cookie, and its reads of /xrpc/ are 'self'.
//
// /mcp is the headless library as Model Context Protocol tools: an agent with
// no clone checks, builds, measures and exports a tree here and gets the same
// numbers the page reports. The Rust engine runs inside this worker: the wasm
// is imported as a module (Workers cannot compile wasm from bytes at run
// time) and instantiated once per isolate on first use. That import is why
// this file cannot be loaded under node: the gateway is in gateway.js and the
// tools in mcp.js so the selftests can.
//
// Manifold is NOT here. Its Emscripten/embind glue generates every method
// invoker with `new Function`, and Workers forbid code generation from
// strings outright (the page grants its build worker 'unsafe-eval' for the
// same reason; there is no such grant here). Measured on the first deploy:
// "Code generation from strings disallowed for this context". So the tool
// list on this host omits interference and the preview kernel, and says so;
// those run locally (agent/check.mjs, agent/build.mjs --kernel manifold). A
// Manifold build with -sDYNAMIC_EXECUTION=0 would lift this.
//
// CPU: wrangler.jsonc raises the budget to 120 s, and an assembly is built
// three parts per call (maxParts) — the clock's seventeen distinct parts in
// one request was a 1102 on the first try.

import { createMcp } from './mcp.js';
import { xrpc, json } from './gateway.js';
import { loadEngine } from './lib/engine.js';
import cadWasm from './cad.wasm';

let kernelsPromise = null;
function kernels() {
  return (kernelsPromise ??= (async () => ({ engine: await loadEngine(cadWasm), manifold: null }))());
}

let mcp = null;
function mcpFor(env, origin) {
  // the file tools read through this worker's own gateway, in-process
  const localFetch = (u, init) => { const url = new URL(u); return url.pathname.startsWith('/xrpc/') ? xrpc(url) : fetch(u, init); };
  const fetchRef = async (ref) => {
    if (ref.startsWith('bench:')) { const r = await env.ASSETS.fetch(new Request(`${origin}/bench/${encodeURIComponent(ref.slice(6))}.json`)); if (!r.ok) throw new Error(`no bench part ${ref.slice(6)}`); return r.json(); }
    const { Drive, PublicBackend, parseAtUri, PART } = await import('./lib/drive.js');
    const { did, collection } = parseAtUri(ref);
    const d = new Drive(new PublicBackend(did, origin, { fetch: localFetch }), { pdsOf: async () => origin, fetch: localFetch });
    if (collection === PART) { const f = await d.get(ref); if (!f) throw new Error(`no file at ${ref}`); return f.revision.tree; }
    return d.treeAt(ref);
  };
  return (mcp ??= createMcp({ kernels, fetchRef, gateway: origin, fetch: localFetch, capabilities: { manifold: false, maxParts: 3, budgetMs: 90000 } }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/mcp' || url.pathname === '/mcp/') return mcpFor(env, url.origin).handle(request);
    if (url.pathname === '/parts') return Response.redirect(`${url.origin}/parts/${url.search}`, 308);
    if (url.pathname.startsWith('/parts/')) {
      if (!env.PARTS) return json({ error: 'parts is not bound here' }, 503);
      const inner = new URL(request.url); inner.pathname = url.pathname.slice('/parts'.length);
      return env.PARTS.fetch(new Request(inner, request));
    }
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
