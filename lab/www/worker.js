/**
 * minomobi.com — the factory, and every site it has built.
 *
 * Two jobs:
 *   1. serve the landing page and every tenant site (static assets)
 *   2. serve /.well-known/atproto-did, which is what lets the Bluesky service
 *      account use `minomobi.com` (or `lab.minomobi.com`) as its handle
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

    return env.ASSETS.fetch(request);
  },
};
