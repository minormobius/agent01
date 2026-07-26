/**
 * minomobi.com — the factory, and every site it has built.
 *
 * Three jobs:
 *   1. serve the landing page and every tenant site (static assets)
 *   2. serve /.well-known/atproto-did, which is what lets the Bluesky service
 *      account use `minomobi.com` (or `lab.minomobi.com`) as its handle
 *   3. put a CSP on every response — the egress boundary for agent-written
 *      pages, and the reason a lab site cannot become a firehose mirror. See
 *      harden() at the foot of this file; it is the load-bearing part.
 *
 * The DID is a [vars] value rather than a committed file on purpose: you cannot
 * know it until the account exists, and the account is easiest to create with a
 * throwaway handle first. So the order is — create the account, read its DID,
 * set BOT_DID, redeploy, then set the handle in Bluesky. A worker makes that a
 * config change instead of a code change.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/.well-known/atproto-did') {
      const did = (env.BOT_DID || '').trim();
      if (!did.startsWith('did:')) {
        // Say why, rather than 404ing and leaving someone to guess. Bluesky
        // reads this endpoint verbatim, so it must be the DID and nothing else
        // once configured — hence the explicit 503 while it is not.
        return new Response(
          'BOT_DID is not set on this worker, so the handle cannot verify yet.\n' +
          'Set it in lab/www/wrangler.jsonc [vars] to the service account DID.\n',
          { status: 503, headers: { 'Content-Type': 'text/plain' } },
        );
      }
      return new Response(did, {
        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'max-age=300' },
      });
    }

    return harden(await env.ASSETS.fetch(request));
  },
};

/**
 * THE EGRESS BOUNDARY. Every lab page is agent-written, so nothing the page
 * itself promises is a control — the page is the untrusted part. These headers
 * are added here, by the worker, on the way out, which is the one place a tenant
 * cannot reach. Same reasoning as taking Bash away from the build agent: prompts
 * leak, tool grants don't.
 *
 * What this is actually defending against, concretely: the Bluesky bot that
 * inspired this project was killed by "pull cat images from the firehose". The
 * site became an unattended republisher of whatever strangers were posting. Two
 * properties make that catastrophic rather than embarrassing — the firehose
 * carries content before any moderation decision reaches it, and a mirror keeps
 * serving a post after it is deleted or taken down. `cat/` in this repo has the
 * same shape and never processes delete events at all.
 *
 * connect-src is the line that matters:
 *   - no `wss:` at all, so a page cannot open a Jetstream socket. WebSocket is
 *     governed by connect-src, so this is absolute, not advisory.
 *   - only public.api.bsky.app, the AppView — which honours takedowns — and
 *     plc.directory for DID resolution. Not a PDS host, so
 *     com.atproto.sync.getBlob cannot be used to fetch bytes that the AppView
 *     would have withheld.
 *
 * Honest about what it does NOT buy: `script-src` keeps 'unsafe-inline' because
 * a lab site is one self-contained HTML file by design. So this is not an XSS
 * control and should not be described as one — the page's own script is
 * agent-written either way. What it buys is that the page cannot talk to
 * anywhere we did not choose.
 *
 * scripts/lab-content-gate.mjs enforces the same policy at BUILD time, where the
 * failure is loud and a human sees it. This is the version that holds when that
 * one is wrong.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://cdn.bsky.app",
  "font-src 'self'",
  "connect-src 'self' https://public.api.bsky.app https://plc.directory",
  "media-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
].join('; ');

function harden(res) {
  const h = new Headers(res.headers);
  h.set('Content-Security-Policy', CSP);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'no-referrer');
  // Visitors of one agent-built page should not be handing out device access on
  // a domain shared with ninety-nine others.
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
