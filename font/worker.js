// Thin assets worker for font.mino.mobi. Serves the static site (index.html,
// app.js) and the wasm-pack output under /pkg/. All generation is client-side;
// there is no server logic, no D1, no secrets.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
