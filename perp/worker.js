// perp.mino.mobi — thin fallback in front of the static assets.
//
// NOTE: Workers Static Assets answers a request for an existing asset without
// ever invoking this worker, so setting cache headers here does nothing. The
// data files' caching lives in ./_headers. This handler exists only for paths
// with no matching asset.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
