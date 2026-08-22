/* ken — thin assets worker. Everything is static; this exists only to serve
   the directory and to keep clean URLs working for the two article pages. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const clean = {
      '/syllabus': '/syllabus.html',
      '/methods': '/methods.html',
      '/protocol': '/protocol.html',
    };
    if (clean[url.pathname]) {
      return env.ASSETS.fetch(new Request(new URL(clean[url.pathname], url), request));
    }
    return env.ASSETS.fetch(request);
  },
};
