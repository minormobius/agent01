/**
 * SimCluster Feed Generator Worker
 *
 * Scheduled (cron): Recomputes communities from mutual-follow graph, stores in D1.
 * HTTP: Serves getFeedSkeleton for Bluesky feed protocol + did:web document.
 * Also serves avatar proxy, community graph, activity heatmap, and thread depth endpoints.
 */

import { detectCommunities, detectBridges, type Community } from './graph';
import { discoverCandidates, getAuthorFeed, getPostThreadDepth, getActorLikes, type EngagementSignal, type FeedPost } from './constellation';
import { scoreCandiates, type ScoredPost } from './scoring';

export interface Env {
  DB: D1Database;
  STATE: KVNamespace;
  FEED_URI: string;
  LIKED_FEED_URI: string;
  PUBLISHER_DID: string;
  HOSTNAME: string;
  CONSTELLATION_RELAY: string;
  BLUESKY_SEED_LIST?: string; // at:// URI of a Bluesky list to seed from
}

// ─── Scheduled: Community Recomputation ────────────────────────────

async function recomputeCommunities(env: Env): Promise<void> {
  // 1. Get seed DIDs — from KV (cached list) or a Bluesky list
  const seedDids = await getSeedDids(env);
  if (seedDids.length < 10) {
    console.log(`Only ${seedDids.length} seed DIDs, skipping recomputation`);
    return;
  }

  // 2. Fetch follow relationships for all seeds
  const follows = await fetchAllFollows(seedDids);

  // 3. Run community detection (Bron-Kerbosch + shell peeling)
  const communities = detectCommunities(follows);
  if (communities.length === 0) {
    console.log('No communities detected');
    return;
  }

  // 4. Detect bridge nodes
  const bridges = detectBridges(communities);

  // 5. Write to D1 (atomic: delete old, insert new)
  await persistCommunities(env.DB, communities, bridges);

  console.log(
    `Computed ${communities.length} communities, ` +
    `${communities.reduce((n, c) => n + c.core.length, 0)} core members, ` +
    `${bridges.size} bridges`
  );
}

// ─── Scheduled: Collect Liked Posts from Community Members ─────────

async function collectLikedPosts(env: Env): Promise<void> {
  // 1. Get all community member DIDs
  const members = await env.DB.prepare(
    'SELECT DISTINCT did FROM feed_community_members'
  ).all<{ did: string }>();

  if (!members.results || members.results.length === 0) {
    console.log('No community members, skipping like collection');
    return;
  }

  const allDids = members.results.map(r => r.did);

  // 2. Sample members — prioritize core (shell=0), cap at 40 to stay within limits
  const coreMembers = await env.DB.prepare(
    'SELECT DISTINCT did FROM feed_community_members WHERE shell = 0'
  ).all<{ did: string }>();
  const coreDids = new Set((coreMembers.results || []).map(r => r.did));

  // Core first, then shell members
  const sorted = [...allDids].sort((a, b) => {
    const aCore = coreDids.has(a) ? 0 : 1;
    const bCore = coreDids.has(b) ? 0 : 1;
    return aCore - bCore;
  });
  const sampled = sorted.slice(0, 40);

  // 3. Fetch recent likes from each member (chunked to avoid rate limits)
  const BATCH = 5;
  const now = new Date().toISOString();
  let totalLikes = 0;

  for (let i = 0; i < sampled.length; i += BATCH) {
    const batch = sampled.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(did => getActorLikes(did, 20))
    );

    const stmts: D1PreparedStatement[] = [];

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status !== 'fulfilled') continue;
      const likerDid = batch[j];

      for (const like of r.value) {
        stmts.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO feed_liked_posts (post_uri, liker_did, liked_at, collected_at)
             VALUES (?, ?, ?, ?)`
          ).bind(like.postUri, likerDid, like.likedAt, now)
        );
        totalLikes++;
      }
    }

    // Batch insert
    for (let k = 0; k < stmts.length; k += 80) {
      await env.DB.batch(stmts.slice(k, k + 80));
    }

    // Small delay between batches
    if (i + BATCH < sampled.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // 4. Prune old likes (older than 7 days)
  await env.DB.prepare(
    "DELETE FROM feed_liked_posts WHERE collected_at < datetime('now', '-7 days')"
  ).run();

  console.log(`Collected ${totalLikes} likes from ${sampled.length} members`);
}

async function getSeedDids(env: Env): Promise<string[]> {
  // Try cached seed list first
  const cached = await env.STATE.get('seed_dids', 'json') as string[] | null;
  if (cached && cached.length > 0) return cached;

  // Fallback: fetch from a Bluesky list if configured
  if (env.BLUESKY_SEED_LIST) {
    const dids = await fetchListMembers(env.BLUESKY_SEED_LIST);
    if (dids.length > 0) {
      await env.STATE.put('seed_dids', JSON.stringify(dids), { expirationTtl: 86400 });
      return dids;
    }
  }

  return [];
}

async function fetchListMembers(listUri: string): Promise<string[]> {
  const BSKY = 'https://public.api.bsky.app';
  const dids: string[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ list: listUri, limit: '100' });
    if (cursor) params.set('cursor', cursor);

    try {
      const res = await fetch(`${BSKY}/xrpc/app.bsky.graph.getList?${params}`);
      if (!res.ok) break;
      const data = await res.json() as {
        items: { subject: { did: string } }[];
        cursor?: string;
      };
      for (const item of data.items) dids.push(item.subject.did);
      cursor = data.cursor;
    } catch {
      break;
    }
  } while (cursor);

  return dids;
}

async function fetchAllFollows(
  dids: string[]
): Promise<Map<string, Set<string>>> {
  const BSKY = 'https://public.api.bsky.app';
  const follows = new Map<string, Set<string>>();

  // Process in batches to respect rate limits
  const BATCH = 5;
  for (let i = 0; i < dids.length; i += BATCH) {
    const batch = dids.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (did) => {
        const set = new Set<string>();
        let cursor: string | undefined;
        let pages = 0;

        do {
          const params = new URLSearchParams({ actor: did, limit: '100' });
          if (cursor) params.set('cursor', cursor);
          const res = await fetch(`${BSKY}/xrpc/app.bsky.graph.getFollows?${params}`);
          if (!res.ok) break;
          const data = await res.json() as {
            follows: { did: string }[];
            cursor?: string;
          };
          for (const f of data.follows) set.add(f.did);
          cursor = data.cursor;
          pages++;
        } while (cursor && pages < 20); // Cap at 2000 follows

        return { did, set };
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        follows.set(r.value.did, r.value.set);
      }
    }
  }

  return follows;
}

async function persistCommunities(
  db: D1Database,
  communities: Community[],
  bridges: Map<string, Set<number>>
): Promise<void> {
  // Clear old data
  await db.batch([
    db.prepare('DELETE FROM feed_bridges'),
    db.prepare('DELETE FROM feed_community_members'),
    db.prepare('DELETE FROM feed_communities'),
  ]);

  // Insert communities and members
  for (const c of communities) {
    const insert = await db.prepare(
      'INSERT INTO feed_communities (label, core_size, total_size) VALUES (?, ?, ?)'
    ).bind(
      c.label,
      c.core.length,
      c.core.length + c.shells.reduce((n, s) => n + s.members.length, 0)
    ).run();

    const communityId = insert.meta.last_row_id;

    // Batch insert members (core + shells)
    const stmts: D1PreparedStatement[] = [];

    for (const did of c.core) {
      stmts.push(
        db.prepare(
          'INSERT INTO feed_community_members (community_id, did, shell, mutual_count) VALUES (?, ?, 0, ?)'
        ).bind(communityId, did, c.core.length - 1)
      );
    }

    for (const shell of c.shells) {
      for (const m of shell.members) {
        stmts.push(
          db.prepare(
            'INSERT INTO feed_community_members (community_id, did, shell, mutual_count) VALUES (?, ?, ?, ?)'
          ).bind(communityId, m.did, shell.threshold, m.count)
        );
      }
    }

    // D1 batch limit is ~100 statements; chunk if needed
    for (let i = 0; i < stmts.length; i += 80) {
      await db.batch(stmts.slice(i, i + 80));
    }
  }

  // Insert bridges
  const bridgeStmts: D1PreparedStatement[] = [];
  for (const [did, cIds] of bridges) {
    bridgeStmts.push(
      db.prepare(
        'INSERT INTO feed_bridges (did, community_ids) VALUES (?, ?)'
      ).bind(did, JSON.stringify([...cIds]))
    );
  }
  if (bridgeStmts.length > 0) {
    for (let i = 0; i < bridgeStmts.length; i += 80) {
      await db.batch(bridgeStmts.slice(i, i + 80));
    }
  }
}

// ─── HTTP: Feed Skeleton + DID Document ────────────────────────────

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  // DID document for did:web
  if (path === '/.well-known/did.json') {
    return Response.json(didDocument(env), { headers: corsHeaders() });
  }

  // Feed skeleton endpoint
  if (path === '/xrpc/app.bsky.feed.getFeedSkeleton') {
    return handleGetFeedSkeleton(url, env);
  }

  // Describe feeds
  if (path === '/xrpc/app.bsky.feed.describeFeedGenerator') {
    const feeds = [{ uri: env.FEED_URI }];
    if (env.LIKED_FEED_URI) feeds.push({ uri: env.LIKED_FEED_URI });
    return Response.json({
      did: `did:web:${env.HOSTNAME}`,
      feeds,
    }, { headers: corsHeaders() });
  }

  // Health check
  if (path === '/health') {
    const count = await env.DB.prepare('SELECT COUNT(*) as n FROM feed_communities').first<{ n: number }>();
    const likedCount = await env.DB.prepare('SELECT COUNT(*) as n FROM feed_liked_posts').first<{ n: number }>().catch(() => ({ n: 0 }));
    return Response.json({
      ok: true,
      communities: count?.n ?? 0,
      likedPosts: (likedCount as any)?.n ?? 0,
    }, { headers: corsHeaders() });
  }

  // Manual cron trigger — runs community recomputation + like collection
  if (path === '/admin/refresh') {
    const start = Date.now();
    try {
      await recomputeCommunities(env);
      await collectLikedPosts(env);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const count = await env.DB.prepare('SELECT COUNT(*) as n FROM feed_communities').first<{ n: number }>();
      const likedCount = await env.DB.prepare('SELECT COUNT(*) as n FROM feed_liked_posts').first<{ n: number }>().catch(() => ({ n: 0 }));
      return Response.json({
        ok: true,
        elapsed: `${elapsed}s`,
        communities: count?.n ?? 0,
        likedPosts: (likedCount as any)?.n ?? 0,
      }, { headers: corsHeaders() });
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      return Response.json({
        ok: false,
        elapsed: `${elapsed}s`,
        error: String(err),
      }, { status: 500, headers: corsHeaders() });
    }
  }

  // Community graph endpoint — feeds the cluster visualizer
  if (path === '/xrpc/com.minomobi.feed.getCommunities') {
    return handleGetCommunities(env);
  }

  // Community activity endpoint — post scores per community for heatmap
  if (path === '/xrpc/com.minomobi.feed.getCommunityActivity') {
    return handleGetCommunityActivity(env);
  }

  // Post thread depth — lazy enrichment for post dot sizing
  if (path === '/xrpc/com.minomobi.feed.getPostThreadDepth') {
    const postUri = url.searchParams.get('uri');
    if (!postUri) {
      return Response.json({ error: 'missing uri param' }, { status: 400, headers: corsHeaders() });
    }
    // Check KV cache (1-hour TTL)
    const cacheKey = `thread_depth:${postUri}`;
    const cached = await env.STATE.get(cacheKey, 'json');
    if (cached) {
      return Response.json(cached, { headers: corsHeaders() });
    }
    const result = await getPostThreadDepth(postUri);
    if (!result) {
      return Response.json({ error: 'thread not found' }, { status: 404, headers: corsHeaders() });
    }
    await env.STATE.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 });
    return Response.json(result, { headers: corsHeaders() });
  }

  // Avatar proxy — KV-cached, server-side fetched (avoids browser rate limits)
  if (path === '/xrpc/com.minomobi.feed.getAvatars') {
    return handleGetAvatars(url, env);
  }

  return new Response('not found', { status: 404, headers: corsHeaders() });
}

async function handleGetCommunities(env: Env): Promise<Response> {
  try {
    // Fetch communities
    const comRows = await env.DB.prepare(
      'SELECT id, label, core_size, total_size FROM feed_communities ORDER BY total_size DESC'
    ).all<{ id: number; label: string; core_size: number; total_size: number }>();

    if (!comRows.results || comRows.results.length === 0) {
      return Response.json({ communities: [], bridges: [], members: [] }, { headers: corsHeaders() });
    }

    // Fetch all members
    const memRows = await env.DB.prepare(
      'SELECT community_id, did, shell, mutual_count FROM feed_community_members ORDER BY community_id, shell, mutual_count DESC'
    ).all<{ community_id: number; did: string; shell: number; mutual_count: number }>();

    // Fetch bridges
    const bridgeRows = await env.DB.prepare(
      'SELECT did, community_ids FROM feed_bridges'
    ).all<{ did: string; community_ids: string }>();

    // Resolve DIDs to handles (best-effort, cached in KV)
    const allDids = new Set<string>();
    for (const m of memRows.results || []) allDids.add(m.did);
    const handles = await resolveHandlesBatch(env, [...allDids]);

    // Shape the response
    const communities = (comRows.results || []).map(c => ({
      id: c.id,
      label: c.label,
      coreSize: c.core_size,
      totalSize: c.total_size,
      members: (memRows.results || [])
        .filter(m => m.community_id === c.id)
        .map(m => ({
          did: m.did,
          handle: handles.get(m.did) || null,
          shell: m.shell,
          mutualCount: m.mutual_count,
        })),
    }));

    const bridges = (bridgeRows.results || []).map(b => ({
      did: b.did,
      handle: handles.get(b.did) || null,
      communityIds: JSON.parse(b.community_ids) as number[],
    }));

    return Response.json({ communities, bridges }, { headers: corsHeaders() });
  } catch (err) {
    console.error('getCommunities error:', err);
    return Response.json(
      { error: 'InternalError', message: 'Failed to fetch communities' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/**
 * Best-effort batch resolve DIDs → handles via Bluesky public API.
 * Caches results in KV for 24h. Failures return empty string.
 */
async function resolveHandlesBatch(
  env: Env,
  dids: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const BSKY = 'https://public.api.bsky.app';

  // Check KV cache first
  const uncached: string[] = [];
  for (const did of dids) {
    const cached = await env.STATE.get(`handle:${did}`);
    if (cached) {
      result.set(did, cached);
    } else {
      uncached.push(did);
    }
  }

  // Resolve uncached in batches of 5
  const BATCH = 5;
  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (did) => {
        const res = await fetch(
          `${BSKY}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`
        );
        if (!res.ok) return { did, handle: '' };
        const data = await res.json() as { handle?: string };
        return { did, handle: data.handle || '' };
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.handle) {
        result.set(r.value.did, r.value.handle);
        // Cache for 24h — fire and forget
        env.STATE.put(`handle:${r.value.did}`, r.value.handle, { expirationTtl: 86400 });
      }
    }
  }

  return result;
}

/**
 * Returns post activity per community for heatmap visualization.
 * Samples member feeds, scores posts, aggregates by community.
 * Cached in KV for 10 minutes to avoid hammering Bluesky API.
 */
async function handleGetCommunityActivity(env: Env): Promise<Response> {
  try {
    // Check KV cache (10-minute TTL)
    const cached = await env.STATE.get('community_activity', 'json');
    if (cached) {
      return Response.json(cached, { headers: corsHeaders() });
    }

    // Load community members from D1
    const members = await env.DB.prepare(
      'SELECT community_id, did, shell FROM feed_community_members'
    ).all<{ community_id: number; did: string; shell: number }>();

    if (!members.results || members.results.length === 0) {
      return Response.json({ communities: {}, posts: [] }, { headers: corsHeaders() });
    }

    // Build member index
    const memberIndex = new Map<string, { communityId: number; shell: number }[]>();
    const allMemberDids: string[] = [];
    for (const row of members.results) {
      if (!memberIndex.has(row.did)) {
        memberIndex.set(row.did, []);
        allMemberDids.push(row.did);
      }
      memberIndex.get(row.did)!.push({ communityId: row.community_id, shell: row.shell });
    }

    // Load bridges
    const bridgeRows = await env.DB.prepare('SELECT did FROM feed_bridges').all<{ did: string }>();
    const bridgeDids = new Set((bridgeRows.results || []).map(r => r.did));

    // Sample members — prefer bridges and multi-community members
    const sorted = [...allMemberDids].sort((a, b) => {
      const aScore = (memberIndex.get(a)?.length ?? 0) + (bridgeDids.has(a) ? 2 : 0);
      const bScore = (memberIndex.get(b)?.length ?? 0) + (bridgeDids.has(b) ? 2 : 0);
      return bScore - aScore;
    });
    const sampled = sorted.slice(0, 25);

    // Fetch recent posts from sampled members
    const feedResults = await Promise.allSettled(
      sampled.map(did => getAuthorFeed(did, 10))
    );

    const HALF_LIFE_MS = 6 * 60 * 60 * 1000;
    const now = Date.now();

    // Per-community activity aggregation
    const communityActivity = new Map<number, { postCount: number; totalScore: number }>();
    // Post list with community attribution
    const posts: {
      uri: string;
      authorDid: string;
      communityIds: number[];
      score: number;
      replyCount: number;
      likeCount: number;
      repostCount: number;
      indexedAt: string;
    }[] = [];

    for (let i = 0; i < sampled.length; i++) {
      const result = feedResults[i];
      if (result.status !== 'fulfilled') continue;

      const did = sampled[i];
      const memberships = memberIndex.get(did) || [];
      const communityIds = [...new Set(memberships.map(m => m.communityId))];
      const isBridge = bridgeDids.has(did);

      for (const post of result.value) {
        const age = now - new Date(post.indexedAt).getTime();
        const recency = Math.pow(0.5, age / HALF_LIFE_MS);
        const breadth = communityIds.length >= 2 ? 2.0 * communityIds.length : 1.0;
        const bridge = isBridge ? 1.5 : 1.0;
        const score = breadth * bridge * recency;

        posts.push({
          uri: post.uri,
          authorDid: did,
          communityIds,
          score,
          replyCount: post.replyCount,
          likeCount: post.likeCount,
          repostCount: post.repostCount,
          indexedAt: post.indexedAt,
        });

        // Attribute activity to each community the author belongs to
        for (const cid of communityIds) {
          const entry = communityActivity.get(cid) || { postCount: 0, totalScore: 0 };
          entry.postCount++;
          entry.totalScore += score;
          communityActivity.set(cid, entry);
        }
      }
    }

    // Sort posts by score descending, cap at 100
    posts.sort((a, b) => b.score - a.score);
    const topPosts = posts.slice(0, 100);

    // Build community activity map
    const activityMap: Record<number, { postCount: number; totalScore: number }> = {};
    for (const [cid, entry] of communityActivity) {
      activityMap[cid] = entry;
    }

    const response = { communities: activityMap, posts: topPosts };

    // Cache for 10 minutes
    await env.STATE.put('community_activity', JSON.stringify(response), { expirationTtl: 600 });

    return Response.json(response, { headers: corsHeaders() });
  } catch (err) {
    console.error('getCommunityActivity error:', err);
    return Response.json(
      { error: 'InternalError', message: 'Failed to fetch activity' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/**
 * Avatar proxy: resolves DIDs → avatar URLs via Bluesky public API.
 * Caches in KV for 6 hours. Retries on 429 with exponential backoff.
 * Accepts up to 100 DIDs per request (?dids=did1&dids=did2...).
 */
async function handleGetAvatars(url: URL, env: Env): Promise<Response> {
  const dids = url.searchParams.getAll('dids').slice(0, 100);
  if (dids.length === 0) {
    return Response.json({ avatars: {} }, { headers: corsHeaders() });
  }

  const BSKY = 'https://public.api.bsky.app';
  const KV_TTL = 6 * 60 * 60; // 6 hours
  const avatars: Record<string, string | null> = {};

  // Check KV cache first
  const uncached: string[] = [];
  for (const did of dids) {
    const cached = await env.STATE.get(`avatar:${did}`);
    if (cached !== null) {
      avatars[did] = cached === '' ? null : cached;
    } else {
      uncached.push(did);
    }
  }

  // Fetch uncached in batches of 25 (getProfiles limit)
  const BATCH = 25;
  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH);
    const params = batch.map(d => `actors=${encodeURIComponent(d)}`).join('&');

    let data: { profiles?: { did: string; avatar?: string }[] } | null = null;

    // Retry with exponential backoff on 429
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(`${BSKY}/xrpc/app.bsky.actor.getProfiles?${params}`);
        if (res.status === 429) {
          await new Promise(r => setTimeout(r, (1 << attempt) * 500));
          continue;
        }
        if (!res.ok) break;
        data = await res.json() as { profiles?: { did: string; avatar?: string }[] };
        break;
      } catch {
        break;
      }
    }

    if (data?.profiles) {
      const seen = new Set<string>();
      for (const profile of data.profiles) {
        seen.add(profile.did);
        const avatarUrl = profile.avatar || '';
        avatars[profile.did] = avatarUrl || null;
        // Cache — empty string means "no avatar" (still cache to avoid re-fetching)
        env.STATE.put(`avatar:${profile.did}`, avatarUrl, { expirationTtl: KV_TTL });
      }
      // DIDs not in response — cache as no-avatar
      for (const d of batch) {
        if (!seen.has(d)) {
          avatars[d] = null;
          env.STATE.put(`avatar:${d}`, '', { expirationTtl: KV_TTL });
        }
      }
    }
  }

  return Response.json({ avatars }, { headers: corsHeaders() });
}

async function handleGetFeedSkeleton(url: URL, env: Env): Promise<Response> {
  const feed = url.searchParams.get('feed');
  const isLikedFeed = env.LIKED_FEED_URI && feed === env.LIKED_FEED_URI;
  const isMainFeed = feed === env.FEED_URI;

  if (!isMainFeed && !isLikedFeed) {
    return Response.json(
      { error: 'UnknownFeed', message: 'Unknown feed' },
      { status: 400, headers: corsHeaders() }
    );
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const cursor = url.searchParams.get('cursor');

  try {
    if (isLikedFeed) {
      return await handleLikedFeedSkeleton(env, limit, cursor);
    }

    const posts = await generateFeed(env, limit, cursor);

    const response: { cursor?: string; feed: { post: string }[] } = {
      feed: posts.map(p => ({ post: p.uri })),
    };

    if (posts.length === limit && posts.length > 0) {
      const last = posts[posts.length - 1];
      response.cursor = `${last.score}::${last.uri}`;
    }

    return Response.json(response, { headers: corsHeaders() });
  } catch (err) {
    console.error('Feed generation error:', err);
    return Response.json(
      { error: 'InternalError', message: 'Feed generation failed' },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/**
 * "Liked by SimCluster" feed: posts liked by community members,
 * ranked by number of distinct community members who liked them.
 * Core members' likes count 3x.
 */
async function handleLikedFeedSkeleton(
  env: Env,
  limit: number,
  cursor: string | null
): Promise<Response> {
  // Pagination: cursor is "score::uri"
  let cursorScore = Infinity;
  let cursorUri = '';
  if (cursor) {
    const parts = cursor.split('::');
    if (parts.length === 2) {
      cursorScore = parseFloat(parts[0]);
      cursorUri = parts[1];
    }
  }

  // Query: count likes per post, weighting core members higher.
  // Core members (shell=0) contribute 3 points, shell members contribute 1.
  const rows = await env.DB.prepare(`
    SELECT
      lp.post_uri,
      SUM(CASE WHEN cm.shell = 0 THEN 3 ELSE 1 END) as weighted_likes,
      COUNT(DISTINCT lp.liker_did) as liker_count,
      MAX(lp.liked_at) as latest_like
    FROM feed_liked_posts lp
    LEFT JOIN feed_community_members cm ON cm.did = lp.liker_did
    WHERE lp.collected_at > datetime('now', '-3 days')
    GROUP BY lp.post_uri
    HAVING liker_count >= 2
    ORDER BY weighted_likes DESC, latest_like DESC
    LIMIT ?
  `).bind(limit + 50).all<{
    post_uri: string;
    weighted_likes: number;
    liker_count: number;
    latest_like: string;
  }>();

  if (!rows.results || rows.results.length === 0) {
    return Response.json({ feed: [] }, { headers: corsHeaders() });
  }

  // Apply cursor filtering and limit
  let posts = rows.results;
  if (cursor) {
    const idx = posts.findIndex(
      p => p.weighted_likes <= cursorScore && p.post_uri === cursorUri
    );
    if (idx >= 0) {
      posts = posts.slice(idx + 1);
    } else {
      posts = posts.filter(p => p.weighted_likes < cursorScore);
    }
  }
  posts = posts.slice(0, limit);

  const response: { cursor?: string; feed: { post: string }[] } = {
    feed: posts.map(p => ({ post: p.post_uri })),
  };

  if (posts.length === limit && posts.length > 0) {
    const last = posts[posts.length - 1];
    response.cursor = `${last.weighted_likes}::${last.post_uri}`;
  }

  return Response.json(response, { headers: corsHeaders() });
}

async function generateFeed(
  env: Env,
  limit: number,
  cursor: string | null
): Promise<ScoredPost[]> {
  // 1. Load all community members from D1
  const members = await env.DB.prepare(
    'SELECT community_id, did, shell FROM feed_community_members'
  ).all<{ community_id: number; did: string; shell: number }>();

  if (!members.results || members.results.length === 0) {
    return [];
  }

  // Build member index: did → [{communityId, shell}]
  const memberIndex = new Map<string, { communityId: number; shell: number }[]>();
  const allMemberDids: string[] = [];

  for (const row of members.results) {
    if (!memberIndex.has(row.did)) {
      memberIndex.set(row.did, []);
      allMemberDids.push(row.did);
    }
    memberIndex.get(row.did)!.push({
      communityId: row.community_id,
      shell: row.shell,
    });
  }

  // 2. Load bridge DIDs
  const bridgeRows = await env.DB.prepare('SELECT did FROM feed_bridges').all<{ did: string }>();
  const bridgeDids = new Set((bridgeRows.results || []).map(r => r.did));

  // 3. Discover candidates via Constellation
  const engagementMap = await discoverCandidates(
    env.CONSTELLATION_RELAY,
    allMemberDids,
    20,  // sample 20 members
    10   // 10 posts each
  );

  // 4. Score candidates
  let scored = scoreCandiates(engagementMap, memberIndex, bridgeDids);

  // 4b. Fallback: if Constellation returned no engagement data, score posts
  // directly from member feeds based on author community membership + recency
  if (scored.length === 0) {
    scored = await fallbackFromMemberFeeds(allMemberDids, memberIndex, bridgeDids);
  }

  // 5. Apply cursor (pagination)
  let filtered = scored;
  if (cursor) {
    const [cursorScore] = cursor.split('::');
    const score = parseFloat(cursorScore);
    if (!isNaN(score)) {
      filtered = scored.filter(p => p.score < score);
    }
  }

  return filtered.slice(0, limit);
}

/**
 * Fallback when Constellation engagement data is unavailable.
 * Fetches recent posts from community members and scores by:
 * - Author community breadth (members in multiple communities score higher)
 * - Bridge node bonus
 * - Recency decay
 */
async function fallbackFromMemberFeeds(
  allMemberDids: string[],
  memberIndex: Map<string, { communityId: number; shell: number }[]>,
  bridgeDids: Set<string>
): Promise<ScoredPost[]> {
  const HALF_LIFE_MS = 6 * 60 * 60 * 1000;
  const now = Date.now();

  // Sample members, preferring those in multiple communities or bridges
  const sorted = [...allMemberDids].sort((a, b) => {
    const aScore = (memberIndex.get(a)?.length ?? 0) + (bridgeDids.has(a) ? 2 : 0);
    const bScore = (memberIndex.get(b)?.length ?? 0) + (bridgeDids.has(b) ? 2 : 0);
    return bScore - aScore;
  });
  const sampled = sorted.slice(0, 30);

  // Fetch their recent posts
  const feedResults = await Promise.allSettled(
    sampled.map(did => getAuthorFeed(did, 10))
  );

  const scored: ScoredPost[] = [];

  for (let i = 0; i < sampled.length; i++) {
    const result = feedResults[i];
    if (result.status !== 'fulfilled') continue;

    const did = sampled[i];
    const memberships = memberIndex.get(did) || [];
    const communityHits = new Set(memberships.map(m => m.communityId)).size;
    const isBridge = bridgeDids.has(did);

    for (const post of result.value) {
      const age = now - new Date(post.indexedAt).getTime();
      const recency = Math.pow(0.5, age / HALF_LIFE_MS);
      const breadth = communityHits >= 2 ? 2.0 * communityHits : 1.0;
      const bridge = isBridge ? 1.5 : 1.0;

      scored.push({
        uri: post.uri,
        score: breadth * bridge * recency,
        communityHits,
        engagementCount: 0,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function didDocument(env: Env) {
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: `did:web:${env.HOSTNAME}`,
    service: [
      {
        id: '#bsky_fg',
        type: 'BskyFeedGenerator',
        serviceEndpoint: `https://${env.HOSTNAME}`,
      },
    ],
  };
}

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// ─── Export ────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      console.error('Unhandled error:', err);
      return Response.json(
        { error: 'InternalError', message: 'Internal server error' },
        { status: 500, headers: corsHeaders() },
      );
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      recomputeCommunities(env)
        .then(() => collectLikedPosts(env))
    );
  },
};
