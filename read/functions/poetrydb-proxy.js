// Cloudflare Pages Function — CORS proxy for PoetryDB
// GET /poetrydb-proxy?path=/author/Shakespeare → proxies poetrydb.org

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.searchParams.get('path');

  if (!path || !path.startsWith('/')) {
    return new Response('Missing or invalid path parameter', { status: 400 });
  }

  try {
    const resp = await fetch(`https://poetrydb.org${path}`, {
      headers: { 'Accept': 'application/json' }
    });

    return new Response(resp.body, {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
