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

    // /_img/<cdn.bsky.app path> — SAME-ORIGIN AVATARS, so a canvas can be exported.
    //
    // cdn.bsky.app sends no Access-Control-Allow-Origin. An avatar therefore
    // DISPLAYS fine (img-src allows it) and then TAINTS any canvas it is drawn
    // on, so toBlob and toDataURL throw. crossOrigin="anonymous" does not help;
    // it makes the load fail outright, because the header is not coming.
    //
    // That is a browser rule, not our policy, and it blocks the single most
    // on-mission thing a lab site can do: compose a shareable image with the
    // people in it. A tenant found this the hard way and reported it.
    //
    // Same-origin bytes do not taint, so this re-serves them. It is NOT an open
    // proxy — the path must match Bluesky's CDN shape exactly, one host, no
    // query strings, no redirects. Anything else is a 400, because an image
    // proxy that will fetch arbitrary URLs is a way to launder any content on
    // the internet through this domain's reputation.
    if (url.pathname.startsWith('/_img/')) return imgProxy(url);

    return harden(await env.ASSETS.fetch(request));
  },
};

/** Bluesky CDN paths, and nothing else. Deliberately strict: a DID, a blob CID,
 *  a known image kind and a known format. Extending this is a human decision. */
const CDN_PATH = /^img\/(avatar|avatar_thumbnail|banner|feed_thumbnail|feed_fullsize)\/plain\/(did:(?:plc|web):[a-zA-Z0-9._:%-]+)\/([a-z0-9]+)@(jpeg|png|webp)$/;

async function imgProxy(url) {
  const rest = url.pathname.slice('/_img/'.length);
  if (!CDN_PATH.test(rest) || url.search) {
    return new Response('not a Bluesky CDN image path\n', {
      status: 400,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    });
  }
  const upstream = await fetch(`https://cdn.bsky.app/${rest}`, { redirect: 'error' });
  if (!upstream.ok) {
    return new Response('upstream said no\n', {
      status: upstream.status === 404 ? 404 : 502,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    });
  }
  const h = new Headers();
  h.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
  // Blob CIDs are content-addressed, so this can be cached hard.
  h.set('Cache-Control', 'public, max-age=86400');
  h.set('X-Content-Type-Options', 'nosniff');
  return new Response(upstream.body, { status: 200, headers: h });
}

/**
 * The egress boundary — for the requests that reach this Worker at all.
 *
 * ⚠ READ `_headers` FIRST. It is the copy that actually applies to lab pages.
 * Workers Static Assets serves a request matching an asset DIRECTLY, without
 * invoking the Worker, so this function never runs for `/name/index.html`. That
 * was found the way these things are found: the worker version shipped, the live
 * response had no CSP header. This copy still covers the paths the asset server
 * misses, and the two must be kept identical.
 *
 * Every lab page is agent-written, so nothing the page itself promises is a
 * control — the page is the untrusted part. Headers are added on the way out,
 * which is the one place a tenant cannot reach. Same reasoning as taking Bash
 * away from the build agent: prompts leak, tool grants don't.
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
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cdn.bsky.app",
  "font-src 'self'",
  "connect-src 'self' https://public.api.bsky.app https://plc.directory https://*.host.bsky.network",
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

  // AN ERROR MUST NOT BE CACHED, and this one had a whole failure mode.
  //
  // The bot posts "It'll be at minomobi.com/<name>/ shortly" the moment a build
  // starts. The requester CLICKS IT. The site does not exist yet, so they get a
  // 404 — and Cloudflare caches 404s by default, so that URL keeps serving the
  // 404 at the edge for minutes after the deploy lands.
  //
  // The build's screenshot step then photographs it. A 404 here has an empty
  // body, so Chrome renders its OWN error page, and the Bluesky link card became
  // a picture of "minomobi.com is currently unable to handle this request".
  // Announcing the URL is what broke the announcement.
  //
  // no-store, so an error is never held. The equivalent for a page that exists
  // is already in _headers (max-age=0, must-revalidate).
  if (res.status >= 400) h.set('Cache-Control', 'no-store');

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
