// Cloudflare Pages Function — batch profile + activity enrichment for seek
//
// POST /seek-profiles { dids: ["did:plc:...", ...] }
// → { profiles: { did → { handle, displayName, avatar, followersCount,
//                          followsCount, postsCount, lastPost } } }
//
// Free-tier safe: MAX_DIDS=25 → 1 getProfiles + 25 getAuthorFeed = 26 subrequests.

const BSKY = 'https://public.api.bsky.app';
const MAX_DIDS = 25;

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

    const profiles = {};

    // Batch profile fetch — up to 25 actors per call
    const params = new URLSearchParams();
    for (const did of dids) params.append('actors', did);
    try {
      const data = await fetchJSON(`${BSKY}/xrpc/app.bsky.actor.getProfiles?${params}`);
      for (const p of (data.profiles || [])) {
        profiles[p.did] = {
          handle: p.handle,
          displayName: p.displayName || '',
          avatar: p.avatar || '',
          description: p.description || '',
          followersCount: p.followersCount || 0,
          followsCount: p.followsCount || 0,
          postsCount: p.postsCount || 0,
          lastPost: null,
        };
      }
    } catch {
      // If getProfiles fails, populate stubs so we can still try activity
      for (const did of dids) {
        if (!profiles[did]) {
          profiles[did] = {
            handle: did, displayName: '', avatar: '', description: '',
            followersCount: 0, followsCount: 0, postsCount: 0, lastPost: null,
          };
        }
      }
    }

    // Activity check — getAuthorFeed limit=1 per actor
    await mapConcurrent(dids, 5, async (did) => {
      try {
        const data = await fetchJSON(
          `${BSKY}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=1`
        );
        const firstPost = data.feed?.[0]?.post;
        if (firstPost && profiles[did]) {
          profiles[did].lastPost = firstPost.record?.createdAt
            || firstPost.indexedAt
            || null;
        }
      } catch {
        // Activity check failed — leave lastPost null
      }
    });

    return Response.json({ profiles }, { headers: CORS });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
