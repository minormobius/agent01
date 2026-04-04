import type { BlueskyThreadNode, BlueskyFeedItem } from './types';

const BSKY_PUBLIC = 'https://public.api.bsky.app';

/** Small delay to stay under rate limits. */
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Retry-aware fetch: backs off on 429. */
async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url);
    if (res.status === 429 && i < retries) {
      await delay(1500 * (i + 1));
      continue;
    }
    return res;
  }
  throw new Error('unreachable');
}

/**
 * Fetch recent posts from a user's feed.
 * Returns only original posts (not reposts/replies) by default.
 */
export async function getAuthorFeed(
  did: string,
  limit = 20
): Promise<BlueskyFeedItem[]> {
  const params = new URLSearchParams({
    actor: did,
    limit: String(limit),
    filter: 'posts_no_replies',
  });
  const res = await fetchWithRetry(
    `${BSKY_PUBLIC}/xrpc/app.bsky.feed.getAuthorFeed?${params}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.feed || [];
}

/** Fetch a full thread with replies, up to depth 10. */
export async function getPostThread(uri: string): Promise<BlueskyThreadNode> {
  const url = `${BSKY_PUBLIC}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=10&parentHeight=0`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.thread;
}

/** Batch-fetch profiles (handles + avatars). */
export async function getProfiles(
  dids: string[]
): Promise<Map<string, { handle: string; avatar: string | null }>> {
  const result = new Map<string, { handle: string; avatar: string | null }>();
  const BATCH = 25;

  for (let i = 0; i < dids.length; i += BATCH) {
    const batch = dids.slice(i, i + BATCH);
    const params = batch.map((d) => `actors=${encodeURIComponent(d)}`).join('&');
    try {
      const res = await fetchWithRetry(
        `${BSKY_PUBLIC}/xrpc/app.bsky.actor.getProfiles?${params}`
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const profile of data.profiles || []) {
        result.set(profile.did, {
          handle: profile.handle || '',
          avatar: profile.avatar || null,
        });
      }
    } catch {
      // skip failed batches
    }
  }
  return result;
}

/**
 * Run async tasks in chunked batches with a delay between batches.
 * Returns results in order.
 */
export async function chunkedParallel<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  delayMs: number,
  onProgress?: (done: number, total: number) => void
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let done = 0;

  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map((fn) => fn()));

    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      results[i + j] = r.status === 'fulfilled' ? r.value : (undefined as T);
      done++;
    }

    onProgress?.(done, tasks.length);

    if (i + concurrency < tasks.length) {
      await delay(delayMs);
    }
  }

  return results;
}
