// jurassic — Worker entry. The site is pure static and every sample of audio
// and every metre of propagation is computed client-side in the Rust/WASM
// kernel, so the worker only serves assets. It exists so the deploy `name`
// owns the custom domain via a routes entry (the golden rule, docs/DEPLOYS.md
// §4). No D1, no DO, no secrets beyond the shared Cloudflare credentials.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
