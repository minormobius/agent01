/**
 * Constellation (Relay) client for discovering engagement signals.
 * Uses getBacklinks to find likes/reposts/replies from community members.
 */

export interface EngagementSignal {
  postUri: string;
  engagerDid: string;
  type: 'like' | 'repost' | 'reply';
  indexedAt: string;
}

interface BacklinkRecord {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
}

interface BacklinksResponse {
  backlinks: BacklinkRecord[];
  cursor?: string;
}

const BSKY_PUBLIC = 'https://public.api.bsky.app';

/**
 * Fetch recent engagement (likes, reposts) targeting a specific post
 * using Constellation's getBacklinks endpoint.
 */
export async function getPostEngagement(
  relayUrl: string,
  postUri: string,
  collections: string[] = ['app.bsky.feed.like', 'app.bsky.feed.repost'],
  limit = 50
): Promise<EngagementSignal[]> {
  const signals: EngagementSignal[] = [];

  for (const collection of collections) {
    const params = new URLSearchParams({
      uri: postUri,
      collection,
      limit: String(limit),
    });

    try {
      const res = await fetch(
        `${relayUrl}/xrpc/app.bsky.unspecced.getBacklinksBySubject?${params}`
      );
      if (!res.ok) continue;

      const data = (await res.json()) as BacklinksResponse;
      for (const bl of data.backlinks) {
        // URI format: at://did:plc:xxx/app.bsky.feed.like/rkey
        const engagerDid = bl.uri.split('/')[2];
        const type = collection === 'app.bsky.feed.like'
          ? 'like' as const
          : 'repost' as const;

        signals.push({
          postUri,
          engagerDid,
          type,
          indexedAt: (bl.value as { createdAt?: string }).createdAt || '',
        });
      }
    } catch {
      // Constellation endpoint may be unavailable; degrade gracefully
    }
  }

  return signals;
}

export interface FeedPost {
  uri: string;
  indexedAt: string;
  replyCount: number;
  likeCount: number;
  repostCount: number;
}

/**
 * Fetch recent posts from a user's feed.
 * Includes engagement counts (replyCount, likeCount, repostCount) from the API.
 */
export async function getAuthorFeed(
  did: string,
  limit = 30
): Promise<FeedPost[]> {
  const params = new URLSearchParams({
    actor: did,
    limit: String(limit),
    filter: 'posts_no_replies',
  });

  try {
    const res = await fetch(
      `${BSKY_PUBLIC}/xrpc/app.bsky.feed.getAuthorFeed?${params}`
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      feed: {
        post: {
          uri: string;
          indexedAt: string;
          replyCount?: number;
          likeCount?: number;
          repostCount?: number;
        };
      }[];
    };
    return data.feed.map(item => ({
      uri: item.post.uri,
      indexedAt: item.post.indexedAt,
      replyCount: item.post.replyCount ?? 0,
      likeCount: item.post.likeCount ?? 0,
      repostCount: item.post.repostCount ?? 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch a post thread and compute depth + top-level reply count.
 * Returns null on failure. Used for lazy enrichment on user interaction.
 */
export async function getPostThreadDepth(
  postUri: string
): Promise<{ maxDepth: number; topLevelReplies: number; interactorDids: string[] } | null> {
  const params = new URLSearchParams({
    uri: postUri,
    depth: '10',
    parentHeight: '0',
  });

  try {
    const res = await fetch(
      `${BSKY_PUBLIC}/xrpc/app.bsky.feed.getPostThread?${params}`
    );
    if (!res.ok) return null;
    const data = await res.json() as { thread: ThreadNode };
    if (!data.thread || data.thread.$type === 'app.bsky.feed.defs#blockedPost') return null;

    const interactors = new Set<string>();
    let maxDepth = 0;
    let topLevelReplies = 0;

    function walk(node: ThreadNode, depth: number) {
      if (!node || node.$type === 'app.bsky.feed.defs#blockedPost') return;
      if (node.post?.author?.did) interactors.add(node.post.author.did);
      if (depth > maxDepth) maxDepth = depth;
      if (depth === 1) topLevelReplies++;
      for (const reply of node.replies || []) {
        walk(reply, depth + 1);
      }
    }

    // Walk replies (depth 0 = root post, depth 1 = top-level replies)
    for (const reply of data.thread.replies || []) {
      walk(reply, 1);
    }
    // Include root author
    if (data.thread.post?.author?.did) interactors.add(data.thread.post.author.did);

    return { maxDepth, topLevelReplies, interactorDids: [...interactors] };
  } catch {
    return null;
  }
}

interface ThreadNode {
  $type?: string;
  post?: { author?: { did: string }; uri?: string };
  replies?: ThreadNode[];
}

/**
 * Discover candidate posts by sampling recent activity from community members.
 * Pulls recent posts from a subset of members, then checks engagement breadth.
 */
export async function discoverCandidates(
  relayUrl: string,
  memberDids: string[],
  maxMembers = 20,
  postsPerMember = 10
): Promise<Map<string, EngagementSignal[]>> {
  // Sample members to stay within subrequest limits
  const sampled = memberDids.length <= maxMembers
    ? memberDids
    : shuffle(memberDids).slice(0, maxMembers);

  // Gather recent posts from sampled members
  const postUris = new Set<string>();
  const feedResults = await Promise.allSettled(
    sampled.map(did => getAuthorFeed(did, postsPerMember))
  );

  for (const result of feedResults) {
    if (result.status === 'fulfilled') {
      for (const post of result.value) {
        postUris.add(post.uri);
      }
    }
  }

  // Check engagement on each post via Constellation
  const engagementMap = new Map<string, EngagementSignal[]>();
  const uris = [...postUris].slice(0, 50); // Cap to stay within limits

  const engResults = await Promise.allSettled(
    uris.map(uri => getPostEngagement(relayUrl, uri))
  );

  for (let i = 0; i < uris.length; i++) {
    const result = engResults[i];
    if (result.status === 'fulfilled' && result.value.length > 0) {
      engagementMap.set(uris[i], result.value);
    }
  }

  return engagementMap;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Fetch recent likes from a user via the public API.
 * Returns post URIs that this user liked, with timestamps.
 */
export async function getActorLikes(
  did: string,
  limit = 30
): Promise<{ postUri: string; likedAt: string }[]> {
  const params = new URLSearchParams({
    actor: did,
    limit: String(limit),
  });

  try {
    const res = await fetch(
      `${BSKY_PUBLIC}/xrpc/app.bsky.feed.getActorLikes?${params}`
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      feed: {
        post: { uri: string; indexedAt: string };
      }[];
    };
    return data.feed.map(item => ({
      postUri: item.post.uri,
      likedAt: item.post.indexedAt,
    }));
  } catch {
    return [];
  }
}
