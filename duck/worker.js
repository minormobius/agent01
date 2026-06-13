// duck — thin asset-serving Worker. Pure static (HTML + ES modules + WGSL inline
// in the renderer). No D1, no AI, no secrets beyond the shared Cloudflare creds.
// SPA-ish: unknown paths fall back to index.html so deep links resolve.
export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    if (res.status === 404) {
      const url = new URL(request.url);
      return env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), request));
    }
    return res;
  },
};
