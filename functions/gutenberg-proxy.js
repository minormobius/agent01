// Cloudflare Pages Function — CORS proxy for Project Gutenberg texts
// GET /gutenberg-proxy?id=2701 → proxies gutenberg.org plain text

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (!id || !/^\d+$/.test(id)) {
    return new Response('Missing or invalid id parameter', { status: 400 });
  }

  // Gutenberg uses several URL patterns depending on the book
  const urls = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
    `https://www.gutenberg.org/files/${id}/${id}.txt`,
  ];

  for (const gutUrl of urls) {
    try {
      const resp = await fetch(gutUrl, { redirect: 'follow' });
      if (resp.ok) {
        const contentType = resp.headers.get('content-type') || '';
        // Ensure we got text, not an HTML error page
        if (contentType.includes('text/plain') || contentType.includes('charset')) {
          return new Response(resp.body, {
            status: 200,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=86400',
            },
          });
        }
      }
    } catch { /* try next URL */ }
  }

  return new Response(`Book ${id} not found on Gutenberg`, { status: 404 });
}
