// cAT — DECOMMISSIONED 2026-07-28.
//
// This surface used to mirror images from the Bluesky firehose into a public
// grid, selected by hashtag. Its only safety control was metadata-based: the
// poster's self-applied labels plus a hashtag blocklist. That control cannot
// see the image, so unlabelled adult posts carrying an ordinary #cats tag were
// indexed and shown. Tuning the blocklist could not fix this — the leaking
// posts are precisely the ones that carry no marker to block. The feed was
// therefore taken down rather than filtered.
//
// This worker is deliberately inert. It holds NO D1 binding, NO Durable
// Object, NO cron trigger and NO assets, so it cannot connect to Jetstream,
// cannot write to the database and cannot serve an image. It exists only to
// answer the domain while `cat-firehose` still owns it.
//
// Fully removing the surface means deleting this worker and detaching
// cat.mino.mobi in the Cloudflare dashboard — that is not scriptable from CI
// (docs/DEPLOYS.md §7). Until then, this is what the domain says.

const BODY = `cat.mino.mobi — shut down

This site republished images from the Bluesky firehose. It had no way to
check what was in an image before showing it, so it was taken down.

Nothing here is coming back at this address.
`;

export default {
  async fetch() {
    return new Response(BODY, {
      status: 410, // Gone — permanent, and tells crawlers to drop the URLs.
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'x-robots-tag': 'noindex, nofollow',
      },
    });
  },
};
