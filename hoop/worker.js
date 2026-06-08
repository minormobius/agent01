// hoop worker — currently a pure static-asset server. Kept as a real Worker (not
// assets-only) so a thin API can be added later without restructuring the deploy.
// All app state today lives on ATProto (com.minomobi.hoop.*) via the shared auth
// worker; the browser talks to auth.mino.mobi directly, so we proxy nothing here.

export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
