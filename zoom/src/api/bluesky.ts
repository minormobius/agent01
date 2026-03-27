import type { BlueskyThreadNode } from './types';

const BSKY_PUBLIC = 'https://public.api.bsky.app';

export async function getPostThread(uri: string): Promise<BlueskyThreadNode> {
  const url = `${BSKY_PUBLIC}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=10&parentHeight=0`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.thread;
}

/** Batch-fetch avatar URLs from Bluesky public API. */
export async function getProfiles(
  dids: string[]
): Promise<Map<string, { handle: string; avatar: string | null }>> {
  const result = new Map<string, { handle: string; avatar: string | null }>();
  const BATCH = 25;

  for (let i = 0; i < dids.length; i += BATCH) {
    const batch = dids.slice(i, i + BATCH);
    const params = batch.map((d) => `actors=${encodeURIComponent(d)}`).join('&');
    try {
      let res = await fetch(`${BSKY_PUBLIC}/xrpc/app.bsky.actor.getProfiles?${params}`);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000));
        res = await fetch(`${BSKY_PUBLIC}/xrpc/app.bsky.actor.getProfiles?${params}`);
      }
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
