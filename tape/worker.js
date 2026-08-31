// tape — the open-source card audio player. Thin routing worker in front of
// static assets.
//
// The only non-static route is /c/<cardId>: the URL every card carries as its
// first NDEF record, so that tapping a stray card on any phone — with no app
// installed and the box switched off — says what the card is. It renders the
// card page, which reads the id back out of the path.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const seg = url.pathname.split('/').filter(Boolean);

    if (seg[0] === 'c' && seg.length <= 2) {
      return html(await env.ASSETS.fetch(new Request(new URL('/tags/', url.origin), request)));
    }

    return env.ASSETS.fetch(request);
  },
};

function html(res) {
  return new Response(res.body, {
    status: res.status,
    headers: { ...Object.fromEntries(res.headers), 'content-type': 'text/html; charset=utf-8' },
  });
}
