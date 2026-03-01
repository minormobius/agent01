// Cloudflare Pages Function — batch follow fetcher for mino.mobi/cluster
//
// POST /cluster-batch { dids: ["did:plc:...", ...] }
// → { follows: { did → [did] }, profiles: { did → {handle, displayName, avatar} } }
//
// Free-tier safe: MAX_DIDS=10, ~3-5 pages each ≈ 30-50 subrequests (limit: 50).

const BSKY = 'https://public.api.bsky.app';
const MAX_CONCURRENT = 10;
const MAX_DIDS = 10;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

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

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost({ request }) {
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
}
