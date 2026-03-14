// Worker entry point — handles /gutenberg-proxy, falls through to static assets

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/gutenberg-proxy') {
      return handleProxy(url);
    }

    // Everything else: serve static assets
    return env.ASSETS.fetch(request);
  }
};

async function handleProxy(url) {
  const id = url.searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) {
    return new Response('Missing or invalid id parameter', { status: 400 });
  }

  const urls = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
    `https://www.gutenberg.org/files/${id}/${id}.txt`,
  ];

  for (const gutUrl of urls) {
    try {
      const resp = await fetch(gutUrl, { redirect: 'follow' });
      if (!resp.ok) continue;
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('text/plain') || ct.includes('charset')) {
        return new Response(resp.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
    } catch { /* try next */ }
  }

  return new Response(`Book ${id} not found on Gutenberg`, { status: 404 });
}
