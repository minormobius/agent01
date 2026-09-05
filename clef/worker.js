// clef worker — static assets for clef.mino.mobi.
//
// The engraver, the parser, the synth and the MIDI writer all run in the
// browser: a score never leaves the reader's machine unless they publish it,
// and then it goes to their own ATProto repository rather than here. So this
// worker serves files and answers a health probe, and that is the whole of it.
//
// No D1, no Durable Object, no KV, no secrets beyond the shared deploy creds.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'clef' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
