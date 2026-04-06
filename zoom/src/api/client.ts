import type { Community, Bridge } from './types';

const API_BASE =
  typeof window !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? `${location.protocol}//${location.host}`
    : 'https://feed.mino.mobi';

export interface CommunitiesResponse {
  communities: Community[];
  bridges: Bridge[];
}

/** Fetch community graph from the feed worker. This is the only worker call we need. */
export async function getCommunities(): Promise<CommunitiesResponse> {
  const res = await fetch(`${API_BASE}/xrpc/com.minomobi.feed.getCommunities`);
  if (!res.ok) throw new Error(`getCommunities HTTP ${res.status}`);
  return res.json();
}
