// Cloudflare Pages Function — CORS proxy for Project Gutenberg texts
// GET /gutenberg-proxy?id=2701 → proxies gutenberg.org/cache/epub/2701/pg2701.txt

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (!id || !/^\d+$/.test(id)) {
    return new Response('Missing or invalid id parameter', { status: 400 });
  }

  const gutUrl = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
  const resp = await fetch(gutUrl);

  if (!resp.ok) {
    return new Response(`Gutenberg returned ${resp.status}`, { status: resp.status });
  }

  return new Response(resp.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
