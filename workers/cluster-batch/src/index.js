// Cloudflare Worker — batch follow fetcher for mino.mobi/cluster
//
// Accepts POST { dids: ["did:plc:...", ...] }
// Returns  { follows: { did → [did, ...] }, profiles: { did → {handle, displayName, avatar} } }
//
// Subrequest budget: ~1000 on paid plan, ~50 on free.
// Each DID costs 1–10 subrequests (paginated getFollows).
// MAX_DIDS controls batch ceiling; client chunks accordingly.

const BSKY = 'https://public.api.bsky.app';
const MAX_CONCURRENT = 40;
const MAX_DIDS = 50;

async function fetchJSON(url) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, (1 << i) * 500));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  throw new Error('Rate limited');
}

async function getAllFollows(did) {
  const follows = [];
  let cursor;
  do {
    const params = new URLSearchParams({ actor: did, limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const data = await fetchJSON(`${BSKY}/xrpc/app.bsky.graph.getFollows?${params}`);
    follows.push(...(data.follows || []));
    cursor = data.cursor;
  } while (cursor);
  return follows;
}

async function mapConcurrent(items, concurrency, fn) {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (request.method !== 'POST') {
      return Response.json({ error: 'POST required' }, { status: 405, headers: CORS });
    }

    try {
      const { dids } = await request.json();

      if (!Array.isArray(dids) || dids.length === 0) {
        return Response.json({ error: 'dids array required' }, { status: 400, headers: CORS });
      }
      if (dids.length > MAX_DIDS) {
        return Response.json(
          { error: `max ${MAX_DIDS} dids per request` },
          { status: 400, headers: CORS }
        );
      }

      const follows = {};
      const profiles = {};

      await mapConcurrent(dids, MAX_CONCURRENT, async (did) => {
        try {
          const result = await getAllFollows(did);
          follows[did] = result.map(f => f.did);
          for (const f of result) {
            if (!profiles[f.did]) {
              profiles[f.did] = {
                handle: f.handle,
                displayName: f.displayName || '',
                avatar: f.avatar || '',
              };
            }
          }
        } catch {
          follows[did] = [];
        }
      });

      return Response.json({ follows, profiles }, { headers: CORS });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500, headers: CORS });
    }
  },
};
