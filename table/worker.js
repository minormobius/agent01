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
        // system id -> the licence its shipped rules text is used under
        systems: { cairn: 'CC BY-SA 4.0' },
        tools: ['/cairn/', '/cairn/encounter/', '/cairn/items/'],
      });
    }
    // Everything else is a static asset (the assets binding resolves directory
    // indexes, e.g. /cairn/ -> /cairn/index.html).
    return env.ASSETS.fetch(request);
  },
};
