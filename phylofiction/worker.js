// phylofiction — Worker entry. The reader is a pure static site and ALL
// computation runs client-side (the Rust/WASM engine, with a JS fallback), so
// the worker only needs to serve assets. It exists so the deploy `name` owns
// the custom domain via a routes entry (the repo's golden rule, docs/DEPLOYS.md
// §4). No D1, no AI, no secrets beyond the shared Cloudflare credentials.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
