import type { Community, Bridge, Post, CommunityActivity } from './types';

const API_BASE =
  typeof window !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? `${location.protocol}//${location.host}`
    : 'https://feed.mino.mobi';

export interface CommunitiesResponse {
  communities: Community[];
  bridges: Bridge[];
}

export interface ActivityResponse {
  communities: Record<string, CommunityActivity>;
  posts: Post[];
}

export async function getCommunities(): Promise<CommunitiesResponse> {
  const res = await fetch(`${API_BASE}/xrpc/com.minomobi.feed.getCommunities`);
  if (!res.ok) throw new Error(`getCommunities HTTP ${res.status}`);
  return res.json();
}

export async function getCommunityActivity(): Promise<ActivityResponse> {
  const res = await fetch(`${API_BASE}/xrpc/com.minomobi.feed.getCommunityActivity`);
  if (!res.ok) throw new Error(`getCommunityActivity HTTP ${res.status}`);
  return res.json();
}

export async function getThreadDepth(
  uri: string
): Promise<{ maxDepth: number; topLevelReplies: number; interactorDids: string[] }> {
  const res = await fetch(
    `${API_BASE}/xrpc/com.minomobi.feed.getPostThreadDepth?uri=${encodeURIComponent(uri)}`
  );
  if (!res.ok) throw new Error(`getThreadDepth HTTP ${res.status}`);
  return res.json();
}
