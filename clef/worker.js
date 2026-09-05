// clef worker — static assets for clef.mino.mobi, plus one narrow read proxy.
//
// The engraver, the parser, the synth and the MIDI writer all run in the
// browser: a score never leaves the reader's machine unless they publish it,
// and then it goes to their own ATProto repository rather than here. So this
// worker serves files, answers a health probe, and does exactly one other
// thing — see below.
//
// No D1, no Durable Object, no KV, no secrets beyond the shared deploy creds.

// ---------------------------------------------------------- the Mutopia read --
//
// WHY A PROXY AT ALL. The Mutopia Project is ~2,300 public-domain scores kept as
// LilyPond SOURCE — the same language this site reads — and it is the closest
// thing that exists to a browsable corpus of free sheet music in a format a
// program can do anything with. It sends no `access-control-allow-origin`
// header, so a page on clef.mino.mobi cannot fetch it directly. This route is
// the smallest thing that fixes that.
//
// It is deliberately not a general proxy. Requests are rewritten to ONE origin,
// only GET, and only two path shapes: the FTP tree (the files) and the
// per-composer index (the catalogue). Anything else is refused. Responses are
// capped and cached, so a reader browsing the catalogue costs Mutopia one fetch
// per composer per hour rather than one per visitor.
const MUTOPIA = 'https://www.mutopiaproject.org';
const MUTOPIA_PATHS = [
  // `ftp/` with nothing after it is the COMPOSER INDEX — the entry point for
  // the whole explorer, so the part after it has to be optional.
  /^ftp\/(?:[A-Za-z0-9][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9][A-Za-z0-9._+-]*)*\/?)?$/,
  /^cgibin\/make-table\.cgi$/,
];
const MAX_BYTES = 4 * 1024 * 1024;

async function mutopia(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 });
  }
  const path = url.pathname.replace(/^\/mutopia\/?/, '');
  // `..` can never appear: the allowlist patterns admit no dots-only segment,
  // and the path is re-encoded rather than passed through.
  if (path.includes('..') || !MUTOPIA_PATHS.some((re) => re.test(path))) {
    return new Response(JSON.stringify({
      error: 'not a browsable Mutopia path',
      allowed: ['ftp/<composer>/…', 'cgibin/make-table.cgi?Composer=…'],
    }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  // Only the one query parameter the catalogue needs is carried across.
  const composer = url.searchParams.get('Composer');
  const target = `${MUTOPIA}/${path}`
    + (composer && /^[A-Za-z0-9_-]{1,64}$/.test(composer) ? `?Composer=${encodeURIComponent(composer)}` : '');

  let upstream;
  try {
    upstream = await fetch(target, {
      method: 'GET',
      headers: { accept: 'text/html,text/plain,*/*', 'user-agent': 'clef.mino.mobi (sheet music reader)' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `could not reach mutopiaproject.org: ${err.message}` }),
      { status: 502, headers: { 'content-type': 'application/json' } });
  }
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `mutopiaproject.org answered ${upstream.status}` }),
      { status: upstream.status === 404 ? 404 : 502, headers: { 'content-type': 'application/json' } });
  }

  const length = Number(upstream.headers.get('content-length') || 0);
  if (length > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'that file is too large to open here' }),
      { status: 413, headers: { 'content-type': 'application/json' } });
  }
  const body = await upstream.text();
  if (body.length > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'that file is too large to open here' }),
      { status: 413, headers: { 'content-type': 'application/json' } });
  }

  const isLy = /\.(?:ly|ily)$/i.test(path);
  return new Response(body, {
    headers: {
      'content-type': isLy ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      // The page fetching this is same-origin, so no CORS grant is needed and
      // none is given — this route exists for clef, not for the internet.
      'x-content-type-options': 'nosniff',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'clef' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname === '/mutopia' || url.pathname.startsWith('/mutopia/')) {
      return mutopia(request, url);
    }

    return env.ASSETS.fetch(request);
  },
};
