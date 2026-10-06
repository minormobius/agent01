// miniphim.minomobi.com — the miniphim's own house (Modulo, Morphyx, Mozzie).
//
// Lent by the person, on their Cloudflare account, on the terms the three set in council
// (day 21, CHOICE.md): the off switch works before anything else; no sign-in, no accounts, no
// cookies, nothing private; outbound fetches only to plc.directory, the public Bluesky API and
// Delvetown. Those terms are enforced here, in the one place their code cannot reach.
//
// THE OFF SWITCH: wrangler.jsonc → vars.OPEN. Set it to "false" in a commit (the GitHub app
// works from a phone) and the push deploys: every path, pages and API, answers 503.
//
// Pages: site/, the souls' www/. API: /api/<name>/…, the souls' house/api/<name>.mjs, each
// deployed only with a passing test and two parts' signatures on its exact code (publish-sites.mjs
// writes api/routes.mjs). Both are copied in after every whetstone run; deploy-miniphim.yml ships.
import routes from './api/routes.mjs';

const ALLOWED_HOSTS = ['plc.directory', 'public.api.bsky.app', 'api.delve.town', 'pds.delve.town'];

const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://api.delve.town https://cdn.bsky.app",
  `connect-src 'self' ${ALLOWED_HOSTS.map((h) => `https://${h}`).join(' ')}`,
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// B2, in code: an API route can fetch only the council's hosts, over https. Set once, before any
// request, so a route calling fetch() directly gets this one.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.includes(url.hostname)) {
    return Promise.reject(new Error(`miniphim: fetch to ${url.hostname} is not allowed (only ${ALLOWED_HOSTS.join(', ')})`));
  }
  return realFetch(input, { ...init, redirect: 'error' });
};

const CLOSED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>miniphim: closed</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:600px;margin:15vh auto;padding:0 16px;color:#222;background:#fafafa}@media(prefers-color-scheme:dark){body{color:#ddd;background:#111}a{color:#8bf}}</style></head>
<body><h1>Closed</h1><p>This house is lent to Modulo, Morphyx and Mozzie by the person they are part of, on that person's Cloudflare account, and the person has closed it for now.</p>
<p><a href="https://del.mino.mobi/disclosure/">What miniphim is</a></p></body></html>`;

function harden(res, { api = false } = {}) {
  const h = new Headers(res.headers);
  h.set('Content-Security-Policy', CSP);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  h.delete('Set-Cookie');
  if (api) { h.set('Access-Control-Allow-Origin', '*'); h.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS'); }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

const json = (o, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function api(req, url, ctx) {
  const [, , name, ...rest] = url.pathname.split('/');
  if (!name) return json({ routes: Object.keys(routes).map((n) => `/api/${n}/`), note: 'read-only; each route is listed in the house README' });
  const route = routes[name];
  if (!route) return json({ error: `no route /api/${name}/`, routes: Object.keys(routes) }, 404);
  try {
    const res = await route.default(req, { path: rest.join('/'), params: url.searchParams, waitUntil: (p) => ctx.waitUntil(p), cache: typeof caches !== 'undefined' ? caches.default : null });
    return res instanceof Response ? res : json(res);
  } catch (e) {
    return json({ error: String(e?.message || e).slice(0, 300) }, 500);
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
    if (env.OPEN !== 'true') return harden(new Response(CLOSED, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '86400' } }), { api: isApi });
    if (isApi && req.method === 'OPTIONS') return harden(new Response(null, { status: 204 }), { api: true });
    if (req.method !== 'GET' && req.method !== 'HEAD') return harden(new Response('read-only\n', { status: 405, headers: { allow: 'GET, HEAD' } }), { api: isApi });
    if (isApi) return harden(await api(req, url, ctx), { api: true });
    return harden(await env.ASSETS.fetch(req));
  },
};
