// pod.mino.mobi — podcast studio + feed worker.
//
// Surfaces:
//   /            landing + episode listing (static index.html)
//   /room/       live recording lobby — WIP (static placeholder for now)
//   /prod/       multitrack editor — WIP (static placeholder for now)
//   /feed.xml    iTunes-compatible RSS of published episodes
//   /api/*       JSON endpoints
//
// Storage model: chunked atproto blobs (see pod/README.md). Published episodes
// are `com.minomobi.podcast.episode` records cached in D1 (`pod_episodes`); the
// RSS <enclosure> is stitched from the episode's ordered audio chunks by a
// future /enclosure/<rkey> route so podcast apps see one contiguous file.
//
// This is the scaffold: every D1 read is guarded so the surface deploys and
// serves a VALID (empty) feed before the `pod_episodes` migration lands.

const SITE = {
  title: 'minomobi — Podcast Studio',
  link: 'https://pod.mino.mobi',
  description:
    'Record conversations in the browser, edit them down, publish a podcast — built on ATProto.',
  language: 'en-us',
  author: 'minomobi',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/health' || pathname === '/api/health') {
      return json({ ok: true, surface: 'pod', ts: Date.now() });
    }
    if (pathname === '/feed.xml' || pathname === '/feed' || pathname === '/rss') {
      return feedXml(env);
    }
    if (pathname === '/api/episodes') {
      return json({ items: await listEpisodes(env) });
    }

    // Everything else (landing, /room/, /prod/, assets) → ASSETS binding.
    return env.ASSETS.fetch(request);
  },
};

async function listEpisodes(env) {
  // Guarded: `pod_episodes` arrives in a later migration. Until then the feed is
  // valid but empty, so the surface deploys before the schema lands.
  try {
    const rows = await env.DB.prepare(
      `SELECT guid, title, description, audio_url, mime, length_bytes,
              duration_sec, pub_date, episode_number, season_number
         FROM pod_episodes
        ORDER BY pub_date DESC
        LIMIT 200`
    ).all();
    return rows.results || [];
  } catch (_) {
    return [];
  }
}

async function feedXml(env) {
  const items = (await listEpisodes(env)).map(itemXml).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE.title)}</title>
    <link>${esc(SITE.link)}</link>
    <description>${esc(SITE.description)}</description>
    <language>${esc(SITE.language)}</language>
    <atom:link href="${esc(SITE.link)}/feed.xml" rel="self" type="application/rss+xml"/>
    <itunes:author>${esc(SITE.author)}</itunes:author>
    <itunes:explicit>false</itunes:explicit>
${items}
  </channel>
</rss>`;
  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}

function itemXml(e) {
  const lines = [
    '    <item>',
    `      <title>${esc(e.title || 'Untitled')}</title>`,
    `      <description>${esc(e.description || '')}</description>`,
  ];
  if (e.audio_url) {
    lines.push(
      `      <enclosure url="${esc(e.audio_url)}" length="${e.length_bytes || 0}" type="${esc(e.mime || 'audio/mpeg')}"/>`
    );
  }
  if (e.pub_date) lines.push(`      <pubDate>${new Date(e.pub_date).toUTCString()}</pubDate>`);
  if (e.duration_sec) lines.push(`      <itunes:duration>${hms(e.duration_sec)}</itunes:duration>`);
  lines.push(`      <guid>${esc(e.guid || e.audio_url || '')}</guid>`);
  lines.push('    </item>');
  return lines.join('\n');
}

function hms(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
