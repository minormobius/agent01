// fifty — worker in front of the static tools.
//
// Most of the fifty tools are pure browser code and this worker just serves
// them. Four things genuinely need a server, and they are the reason it exists:
//
//   /av/<handle>            concept 1  — avatar endpoint any <img> can point at
//   /go/<handle>/<slug>     concept 22 — link resolver that stores nothing
//   /api/rss?url=           concept 27 — RSS fetched and parsed server-side
//   /api/*                  the read proxy every tool uses (CORS + one cache)
//
// Plus routing: /c/<n> serves that concept's tool if it exists and the
// write-up page if it does not, so the index never has to know which is which.
//
// Everything here is a GET of public data. There is no auth, no storage, and
// no path that writes to anybody's repo.

const APPVIEW = 'https://public.api.bsky.app';
const PLC = 'https://plc.directory';

// XRPC methods this worker will proxy to an arbitrary PDS. Read-only by
// construction — the proxy cannot be talked into a write because no write
// method is on the list, and every request is issued as a GET.
const PDS_METHODS = new Set([
  'com.atproto.repo.describeRepo',
  'com.atproto.repo.listRecords',
  'com.atproto.repo.getRecord',
  'com.atproto.identity.resolveHandle',
  'com.atproto.server.describeServer',
]);

// Appview methods, likewise.
const APPVIEW_METHODS = new Set([
  'com.atproto.identity.resolveHandle',
  'app.bsky.actor.getProfile',
  'app.bsky.actor.getProfiles',
  'app.bsky.actor.searchActors',
  'app.bsky.feed.getAuthorFeed',
  'app.bsky.feed.getPostThread',
  'app.bsky.feed.getPosts',
  'app.bsky.feed.getLikes',
  'app.bsky.graph.getFollows',
  'app.bsky.graph.getFollowers',
  'app.bsky.graph.getList',
  'app.bsky.graph.getLists',
]);

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=120',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'MethodNotAllowed' }, 405);
    }

    try {
      if (path.startsWith('/av/')) return avatar(path.slice(4), url);
      if (path.startsWith('/go/')) return shortlink(path.slice(4));
      if (path.startsWith('/api/')) return api(path.slice(5), url);
    } catch (e) {
      return json({ error: 'Unhandled', message: String(e && e.message || e) }, 500);
    }

    // Static assets, with the /c/<n> fallback to the write-up page.
    const res = await env.ASSETS.fetch(request);
    if (res.status === 404) {
      const m = /^\/c\/(\d{1,2})\/?$/.exec(path);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= 50) {
        // Fetch the note page by its CANONICAL extensionless path. The assets
        // layer 307-redirects '/note.html' → '/note', and a 307 has an empty
        // body — so asking for the .html and stamping 200 on the result serves
        // a blank page. (Same trap as unit/worker.js; it is easy to walk into.)
        const note = await env.ASSETS.fetch(new Request(new URL('/note', url.origin), request));
        if (note.status !== 200) return note;   // never re-label a redirect as 200
        return new Response(note.body, {
          status: 200,
          headers: { ...Object.fromEntries(note.headers), 'content-type': 'text/html; charset=utf-8' },
        });
      }
    }
    return res;
  },
};

// ───────────────────────────────────────────── concept 1: avatars ──

// GET /av/<handle-or-did>[.png|.jpg][?size=thumbnail|avatar]
//
// The whole point is that it works in a bare <img src>, on a site that has
// never heard of ATProto. So: resolve, look up the profile, 302 to the blob.
// A miss returns a generated SVG rather than a broken image, because a broken
// image is a worse answer than a placeholder on somebody else's page.
async function avatar(rest, url) {
  const handle = decodeURIComponent(rest.replace(/\.(png|jpg|jpeg|webp)$/i, '')).replace(/^@/, '');
  if (!handle) return svgFallback('?');

  try {
    const profile = await fetchJson(
      `${APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`
    );
    let src = profile.avatar;
    if (!src) return svgFallback(profile.handle || handle);
    // The CDN serves avatar_thumbnail and avatar; honour ?size= if asked.
    if (url.searchParams.get('size') === 'full') src = src.replace('/avatar_thumbnail/', '/avatar/');
    return new Response(null, {
      status: 302,
      headers: {
        location: src,
        'cache-control': 'public, max-age=1800',
        'access-control-allow-origin': '*',
      },
    });
  } catch {
    return svgFallback(handle);
  }
}

// A deterministic identicon so the endpoint always returns an image.
function svgFallback(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const hue = h % 360;
  const initial = (seed.replace(/^did:\w+:/, '')[0] || '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
<rect width="96" height="96" rx="48" fill="hsl(${hue} 45% 32%)"/>
<text x="48" y="48" fill="hsl(${hue} 60% 88%)" font-family="system-ui,sans-serif" font-size="44"
 font-weight="600" text-anchor="middle" dominant-baseline="central">${escapeXml(initial)}</text>
</svg>`;
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=600',
      'access-control-allow-origin': '*',
    },
  });
}

// ────────────────────────────────────── concept 22: link resolver ──

// GET /go/<handle>/<slug>
//
// The link lives in the user's own repo. This server holds no database: it
// resolves the handle, reads com.minomobi.fifty.link/<slug> out of their PDS,
// and redirects. Anyone can run the same three lines and serve the identical
// link, which is the portability the pitch is asking for.
const LINK_COLLECTION = 'com.minomobi.fifty.link';

async function shortlink(rest) {
  const [rawHandle, ...slugParts] = rest.split('/');
  const handle = decodeURIComponent(rawHandle || '').replace(/^@/, '');
  const slug = decodeURIComponent(slugParts.join('/') || '');
  if (!handle || !slug) return htmlError(400, 'Bad link', 'Expected /go/&lt;handle&gt;/&lt;slug&gt;.');

  let who;
  try {
    who = await identity(handle);
  } catch {
    return htmlError(404, 'No such account', `Could not resolve <code>${escapeHtml(handle)}</code>.`);
  }

  try {
    const rec = await fetchJson(
      `${who.pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(who.did)}` +
      `&collection=${LINK_COLLECTION}&rkey=${encodeURIComponent(slug)}`
    );
    const target = rec && rec.value && rec.value.target;
    if (!target || !/^https?:\/\//i.test(target)) throw new Error('no target');
    return new Response(null, {
      status: 302,
      headers: { location: target, 'cache-control': 'public, max-age=60', 'referrer-policy': 'no-referrer' },
    });
  } catch {
    return htmlError(404, 'No such link',
      `<code>${escapeHtml(handle)}</code> has no link named <code>${escapeHtml(slug)}</code> ` +
      `in <code>${LINK_COLLECTION}</code>. Links are records in the owner's repo — ` +
      `<a href="/c/22">make one here</a>.`);
  }
}

// ─────────────────────────────────────────────────────── /api ──

async function api(rest, url) {
  // /api/did/<did> — the DID document, which is where the PDS host comes from.
  if (rest.startsWith('did/')) {
    const did = decodeURIComponent(rest.slice(4));
    if (did.startsWith('did:plc:')) {
      return proxyJson(`${PLC}/${encodeURIComponent(did)}`);
    }
    if (did.startsWith('did:web:')) {
      const host = did.slice(8).replace(/:/g, '/');
      if (!publicHost(host.split('/')[0])) return json({ error: 'BadHost' }, 400);
      return proxyJson(`https://${host}/.well-known/did.json`);
    }
    return json({ error: 'UnsupportedDidMethod', message: did }, 400);
  }

  // /api/appview/<nsid>?…
  if (rest.startsWith('appview/')) {
    const nsid = rest.slice(8);
    if (!APPVIEW_METHODS.has(nsid)) return json({ error: 'MethodNotAllowed', message: nsid }, 400);
    const q = new URLSearchParams(url.search);
    q.delete('__pds');
    return proxyJson(`${APPVIEW}/xrpc/${nsid}?${q}`);
  }

  // /api/pds/<nsid>?…&__pds=https://host
  if (rest.startsWith('pds/')) {
    const nsid = rest.slice(4);
    if (!PDS_METHODS.has(nsid)) return json({ error: 'MethodNotAllowed', message: nsid }, 400);
    const q = new URLSearchParams(url.search);
    const host = q.get('__pds') || '';
    q.delete('__pds');
    let target;
    try { target = new URL(host); } catch { return json({ error: 'BadPds' }, 400); }
    if (target.protocol !== 'https:' || !publicHost(target.hostname)) {
      return json({ error: 'BadPds', message: 'PDS must be a public https host' }, 400);
    }
    return proxyJson(`${target.origin}/xrpc/${nsid}?${q}`);
  }

  // /api/rss?url=… — concept 27.
  if (rest === 'rss') return rss(url.searchParams.get('url'));

  // /api/verify?url=…&needle=… — concepts 8 and 26.
  // Deliberately NOT a text proxy: it fetches a page and answers one yes/no
  // question about it, so it cannot be used to read arbitrary pages through us.
  if (rest === 'verify') return verify(url.searchParams.get('url'), url.searchParams.get('needle'));

  return json({ error: 'NotFound', message: rest }, 404);
}

// ────────────────────────────────────────────── concept 27: RSS ──

// Fetching a feed from the browser fails on almost every blog (no CORS), which
// is exactly why this belongs on the server. Parsed here into the shape a
// publication record wants; the browser decides what to do with it.
async function rss(feedUrl) {
  if (!feedUrl) return json({ error: 'MissingUrl' }, 400);
  let target;
  try { target = new URL(feedUrl); } catch { return json({ error: 'BadUrl' }, 400); }
  if (!/^https?:$/.test(target.protocol) || !publicHost(target.hostname)) {
    return json({ error: 'BadUrl', message: 'feed must be a public http(s) URL' }, 400);
  }

  let res;
  try {
    res = await fetch(target.href, {
      headers: { accept: 'application/rss+xml, application/atom+xml, application/feed+json, application/xml, text/xml, */*' },
      cf: { cacheTtl: 300 },
    });
  } catch (e) {
    return json({ error: 'FetchFailed', message: String(e && e.message || e) }, 502);
  }
  if (!res.ok) return json({ error: 'FetchFailed', message: `HTTP ${res.status}` }, 502);

  const body = (await res.text()).slice(0, 4_000_000);

  // JSON Feed first — it is unambiguous.
  if (body.trimStart().startsWith('{')) {
    try {
      const feed = JSON.parse(body);
      if (feed.items) {
        return json({
          kind: 'jsonfeed',
          title: feed.title || '',
          home: feed.home_page_url || '',
          items: feed.items.slice(0, 200).map((i) => ({
            title: i.title || '',
            url: i.url || i.external_url || '',
            published: i.date_published || i.date_modified || '',
            summary: strip(i.summary || ''),
            content: strip(i.content_html || i.content_text || ''),
            author: (i.authors && i.authors[0] && i.authors[0].name) || (feed.author && feed.author.name) || '',
            tags: i.tags || [],
          })),
        });
      }
    } catch { /* fall through to XML */ }
  }

  return json(parseFeed(body));
}

// A small, forgiving XML feed reader. No DOMParser in Workers, and pulling in a
// parser for two element shapes is not worth it — feeds are regular enough.
function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const itemTag = isAtom ? 'entry' : 'item';
  const chunks = xml.split(new RegExp(`<${itemTag}[\\s>]`, 'i')).slice(1);

  const head = xml.split(new RegExp(`<${itemTag}[\\s>]`, 'i'))[0];
  const feedTitle = tagText(head, 'title');
  const home = isAtom
    ? (attrOf(head, 'link', 'href', /rel="alternate"/i) || attrOf(head, 'link', 'href'))
    : tagText(head, 'link');

  const items = chunks.slice(0, 200).map((raw) => {
    const body = raw.split(new RegExp(`</${itemTag}>`, 'i'))[0];
    const link = isAtom
      ? (attrOf(body, 'link', 'href', /rel="alternate"/i) || attrOf(body, 'link', 'href'))
      : (tagText(body, 'link') || attrOf(body, 'link', 'href'));
    return {
      title: tagText(body, 'title'),
      url: link,
      published: tagText(body, 'pubDate') || tagText(body, 'published') || tagText(body, 'updated')
        || tagText(body, 'dc:date'),
      summary: strip(tagText(body, 'description') || tagText(body, 'summary')),
      content: strip(tagText(body, 'content:encoded') || tagText(body, 'content')),
      author: tagText(body, 'dc:creator') || tagText(body, 'author') || tagText(body, 'name'),
      guid: tagText(body, 'guid') || tagText(body, 'id') || link,
      tags: (body.match(/<category[^>]*>([\s\S]*?)<\/category>/gi) || [])
        .map((c) => strip(c.replace(/<[^>]+>/g, ''))).filter(Boolean).slice(0, 12),
    };
  });

  return { kind: isAtom ? 'atom' : 'rss', title: feedTitle, home, items };
}

function tagText(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = re.exec(xml);
  return m ? decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim() : '';
}

function attrOf(xml, tag, attr, mustMatch) {
  const re = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  let m;
  while ((m = re.exec(xml))) {
    if (mustMatch && !mustMatch.test(m[0])) continue;
    const a = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i').exec(m[0]);
    if (a) return decodeEntities(a[1]);
  }
  return '';
}

function strip(html) {
  return decodeEntities(String(html)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|li|h\d|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

// ────────────────────────────────── verification (concepts 8, 26) ──

async function verify(pageUrl, needle) {
  if (!pageUrl || !needle) return json({ error: 'MissingParam' }, 400);
  let target;
  try { target = new URL(pageUrl); } catch { return json({ error: 'BadUrl' }, 400); }
  if (!/^https?:$/.test(target.protocol) || !publicHost(target.hostname)) {
    return json({ error: 'BadUrl' }, 400);
  }

  let res, body = '';
  try {
    res = await fetch(target.href, { headers: { accept: 'text/html,*/*' }, cf: { cacheTtl: 120 } });
    body = (await res.text()).slice(0, 2_000_000);
  } catch (e) {
    return json({ found: false, error: 'FetchFailed', message: String(e && e.message || e) }, 200);
  }

  const hay = body.toLowerCase();
  const hit = hay.indexOf(String(needle).toLowerCase());
  // Return only a small window around the match — enough to show the evidence,
  // not enough to be a page-reading proxy.
  const excerpt = hit >= 0 ? body.slice(Math.max(0, hit - 90), hit + needle.length + 90) : '';
  return json({
    found: hit >= 0,
    status: res.status,
    url: res.url || target.href,
    excerpt: excerpt.replace(/\s+/g, ' ').trim(),
  });
}

// ────────────────────────────────────────────────────── plumbing ──

async function identity(handle) {
  let did = handle;
  if (!handle.startsWith('did:')) {
    const r = await fetchJson(
      `${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
    );
    did = r.did;
  }
  let doc;
  if (did.startsWith('did:web:')) {
    const host = did.slice(8).replace(/:/g, '/');
    doc = await fetchJson(`https://${host}/.well-known/did.json`);
  } else {
    doc = await fetchJson(`${PLC}/${encodeURIComponent(did)}`);
  }
  const svc = (doc.service || []).find(
    (s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
  );
  return { did, pds: svc ? String(svc.serviceEndpoint).replace(/\/+$/, '') : 'https://bsky.social' };
}

async function fetchJson(u) {
  const res = await fetch(u, { headers: { accept: 'application/json' }, cf: { cacheTtl: 120 } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
  return res.json();
}

async function proxyJson(target) {
  let res;
  try {
    res = await fetch(target, { headers: { accept: 'application/json' }, cf: { cacheTtl: 120 } });
  } catch (e) {
    return json({ error: 'UpstreamUnreachable', message: String(e && e.message || e) }, 502);
  }
  const body = await res.text();
  return new Response(body, { status: res.status, headers: JSON_HEADERS });
}

// Keep the proxies pointed at the public internet: no loopback, no RFC1918, no
// link-local, no bare hostnames that could resolve inside a network.
function publicHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h || h.length > 253) return false;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (h.includes(':')) return false;            // IPv6 literal — not worth the audit
  return h.includes('.');                        // must be a real dotted name
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const escapeXml = escapeHtml;

function htmlError(status, title, detail) {
  return new Response(`<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — fifty</title>
<link rel="stylesheet" href="/styles.css">
<div class="wrap narrow" style="padding-top:60px">
  <p class="mono dim small">fifty</p>
  <h1>${escapeHtml(title)}</h1>
  <p style="color:var(--ink-2)">${detail}</p>
  <p><a href="/">← all fifty concepts</a></p>
</div>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
