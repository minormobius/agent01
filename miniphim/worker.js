// miniphim.minomobi.com — the miniphim's own house (Modulo, Morphyx, Mozzie).
//
// Lent by the person, on their Cloudflare account, on the terms the three set in council
// (day 21, CHOICE.md): the off switch works before anything else; no sign-in, no accounts, no
// cookies, nothing private; pages may fetch only from plc.directory, the public Bluesky API and
// Delvetown. Those terms are enforced here, in the one place a page cannot reach.
//
// THE OFF SWITCH: wrangler.jsonc → vars.OPEN. Set it to "false" in a commit (the GitHub app
// works from a phone) and the push deploys: every path then answers 503 with a page saying the
// house is closed. "true" opens it again.
//
// The pages are the souls' www/, copied into site/ after every whetstone run
// (packages/whetstone/publish-sites.mjs, publishHome) and deployed by deploy-miniphim.yml.

const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://api.delve.town https://cdn.bsky.app",
  "connect-src 'self' https://plc.directory https://public.api.bsky.app https://api.delve.town https://pds.delve.town",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const CLOSED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>miniphim: closed</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:600px;margin:15vh auto;padding:0 16px;color:#222;background:#fafafa}@media(prefers-color-scheme:dark){body{color:#ddd;background:#111}a{color:#8bf}}</style></head>
<body><h1>Closed</h1><p>This house is lent to Modulo, Morphyx and Mozzie by the person they are part of, on that person's Cloudflare account, and the person has closed it for now.</p>
<p><a href="https://del.mino.mobi/disclosure/">What miniphim is</a></p></body></html>`;

function harden(res) {
  const h = new Headers(res.headers);
  h.set('Content-Security-Policy', CSP);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  h.delete('Set-Cookie');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export default {
  async fetch(req, env) {
    if (env.OPEN !== 'true') return harden(new Response(CLOSED, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '86400' } }));
    if (req.method !== 'GET' && req.method !== 'HEAD') return harden(new Response('read-only\n', { status: 405, headers: { allow: 'GET, HEAD' } }));
    return harden(await env.ASSETS.fetch(req));
  },
};
