// human.mino.mobi — stats API for HUMAN MACHINERY, the bias arcade.
// Stores ONLY anonymous aggregate counters: one row per (exhibit, bucket),
// n += 1 per event. Exhibits bin everything client-side (reaction times,
// estimates) before sending, so the server never sees a raw value — and
// there are no ids, cookies, or fingerprints to see either.

const EXHIBITS = ['stroop', 'anchoring', 'framing', 'change-blindness', 'sunk-cost', 'contested'];
const BUCKET_RE = /^[a-z0-9][a-z0-9:|+\-. ]{0,79}$/;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      });
    }

    try {
      if (pathname === '/api/human/health') {
        const n = await env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM human_stats').first('n');
        return json({ ok: true, events: n, exhibits: EXHIBITS.length });
      }

      // One aggregate event. Body: {exhibit, bucket}. Fire-and-forget from the
      // client; deliberately idempotent-hostile (no dedup) — these are vibes-
      // grade crowd counters, not ballots, and the client sends each once.
      if (pathname === '/api/human/event' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body) return json({ error: 'bad json' }, 400);
        const exhibit = String(body.exhibit || '');
        const bucket = String(body.bucket || '');
        if (!EXHIBITS.includes(exhibit) || !BUCKET_RE.test(bucket)) {
          return json({ error: 'bad event' }, 400);
        }
        await env.DB.prepare(
          `INSERT INTO human_stats (exhibit, bucket, n, updated_at) VALUES (?, ?, 1, ?)
           ON CONFLICT (exhibit, bucket) DO UPDATE SET n = n + 1, updated_at = excluded.updated_at`
        ).bind(exhibit, bucket, Date.now()).run();
        return json({ ok: true });
      }

      if (pathname === '/api/human/summary' && request.method === 'GET') {
        const exhibit = String(url.searchParams.get('exhibit') || '');
        if (!EXHIBITS.includes(exhibit)) return json({ error: 'bad exhibit' }, 400);
        const rows = (await env.DB.prepare(
          'SELECT bucket, n FROM human_stats WHERE exhibit = ?'
        ).bind(exhibit).all()).results;
        const buckets = {};
        let total = 0;
        for (const r of rows) { buckets[r.bucket] = r.n; total += r.n; }
        return json({ exhibit, buckets, total });
      }

      // Everything, grouped — powers the lobby counters and the /stats board.
      if (pathname === '/api/human/all' && request.method === 'GET') {
        const rows = (await env.DB.prepare(
          'SELECT exhibit, bucket, n FROM human_stats ORDER BY exhibit, bucket'
        ).all()).results;
        const exhibits = {};
        for (const slug of EXHIBITS) exhibits[slug] = { buckets: {}, total: 0 };
        for (const r of rows) {
          if (!exhibits[r.exhibit]) exhibits[r.exhibit] = { buckets: {}, total: 0 };
          exhibits[r.exhibit].buckets[r.bucket] = r.n;
          exhibits[r.exhibit].total += r.n;
        }
        return json({ exhibits });
      }

      if (pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }

    return env.ASSETS.fetch(request);
  },
};
