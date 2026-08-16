// table.mino.mobi — procedural character sheets for open-licensed tabletop RPGs.
// Thin Worker over a static-assets binding: it serves the site and answers a
// health probe. No D1, no secrets, no inference — every generator runs in the
// browser, deterministically from a seed, over rules text committed to the repo.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return Response.json({
        ok: true,
        surface: 'table',
        // The commit this worker was built from, stamped in by the deploy
        // workflow (`wrangler deploy --var COMMIT:$GITHUB_SHA`). It exists so
        // the workflow's own verification can tell "MY deploy is live" from
        // "A deploy is live" — without it the check passed against the
        // previous release and reported success. 'dev' when run locally.
        version: env.COMMIT || 'dev',
        // system id -> the licence its shipped rules text is used under
        systems: { cairn: 'CC BY-SA 4.0', srd5: 'CC BY 4.0' },
        tools: ['/cairn/', '/cairn/encounter/', '/cairn/arena/', '/cairn/items/', '/srd5/', '/srd5/corpus/'],
      });
    }
    // Everything else is a static asset (the assets binding resolves directory
    // indexes, e.g. /cairn/ -> /cairn/index.html).
    return env.ASSETS.fetch(request);
  },
};
