// Batch-fetch engagement metrics (likes, reposts, replies) from public API.
// app.bsky.feed.getPosts accepts up to 25 URIs per call.

const API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts';
const BATCH_SIZE = 25;

// Cache: uri → { likeCount, repostCount, replyCount }
const cache = new Map();

export async function fetchEngagement(images, onProgress) {
  // Build unique URIs
  const uris = [];
  const uriSet = new Set();
  for (const img of images) {
    const uri = `at://${img.did}/app.bsky.feed.post/${img.rkey}`;
    if (!uriSet.has(uri) && !cache.has(uri)) {
      uriSet.add(uri);
      uris.push(uri);
    }
  }

  // Batch fetch
  let fetched = 0;
  for (let i = 0; i < uris.length; i += BATCH_SIZE) {
    const batch = uris.slice(i, i + BATCH_SIZE);
    const params = batch.map(u => `uris=${encodeURIComponent(u)}`).join('&');
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
      // Silently skip failed batches
    }
    fetched += batch.length;
    if (onProgress) onProgress(fetched, uris.length);
  }

  return cache;
}

export function getEngagement(did, rkey) {
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
  return cache.get(uri) || null;
}

export function hasEngagementData() {
  return cache.size > 0;
}
