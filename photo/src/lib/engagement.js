// Batch-fetch engagement metrics (likes, reposts, replies) from public API.
// app.bsky.feed.getPosts accepts up to 25 URIs per call.

const API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts';
const BATCH_SIZE = 25;
// Batches ran strictly one after another, so 3,000 images meant 120 serial
// round trips before "most liked" could sort anything. Four in flight is
// polite to a public API and cuts that to 30 waves.
const CONCURRENCY = 4;

// Cache: uri → { likeCount, repostCount, replyCount }
const cache = new Map();

export async function fetchEngagement(images, onProgress) {
  // Build unique URIs. Uploaded images have no post behind them, so asking
  // about them would waste a slot in every batch.
  const uris = [];
  const uriSet = new Set();
  for (const img of images) {
    if (img.source && img.source !== 'post') continue;
    const uri = `at://${img.did}/app.bsky.feed.post/${img.rkey}`;
    if (!uriSet.has(uri) && !cache.has(uri)) {
      uriSet.add(uri);
      uris.push(uri);
    }
  }

  const batches = [];
  for (let i = 0; i < uris.length; i += BATCH_SIZE) batches.push(uris.slice(i, i + BATCH_SIZE));

  let fetched = 0;
  let next = 0;

  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++];
      const params = batch.map((u) => `uris=${encodeURIComponent(u)}`).join('&');
      try {
        const res = await fetch(`${API}?${params}`);
        if (res.ok) {
          const data = await res.json();
          for (const post of (data.posts || [])) {
            cache.set(post.uri, {
              likeCount: post.likeCount ?? 0,
              repostCount: post.repostCount ?? 0,
              replyCount: post.replyCount ?? 0,
            });
          }
        }
      } catch {
        // A failed batch means those posts sort as zero, which is better than
        // failing the whole sort.
      }
      fetched += batch.length;
      if (onProgress) onProgress(Math.min(fetched, uris.length), uris.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => worker()));
  return cache;
}

export function getEngagement(did, rkey) {
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
  return cache.get(uri) || null;
}

export function hasEngagementData() {
  return cache.size > 0;
}
