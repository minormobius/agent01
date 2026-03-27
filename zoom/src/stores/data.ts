import { create } from 'zustand';
import type {
  Community, HydratedPost, PostDot, BlueskyThreadNode,
} from '../api/types';
import { getCommunities } from '../api/client';
import { getAuthorFeed, getPostThread, getProfiles, chunkedParallel } from '../api/bluesky';
import { layoutPosts } from '../layout/posts';

interface DataStore {
  // Raw
  communities: Community[];
  posts: HydratedPost[];

  // Layout
  postDots: PostDot[];

  // Caches
  fullThreadCache: Record<string, BlueskyThreadNode>;
  avatarImages: Map<string, HTMLImageElement | null>;

  // Status
  status: string;
  loadPhase: 'idle' | 'communities' | 'feeds' | 'threads' | 'done' | 'error';

  // Actions
  loadData: () => Promise<void>;
  recomputeLayout: () => void;
  fetchFullThread: (uri: string) => Promise<BlueskyThreadNode>;

  // Draw scheduler bridge
  _scheduleDraw: (() => void) | null;
  setScheduleDraw: (fn: () => void) => void;
}

/** Assign hues evenly across communities. */
function communityHue(idx: number, total: number): number {
  return (idx / Math.max(total, 1)) * 360;
}

/** Walk a thread tree to find max depth. */
function walkDepth(node: BlueskyThreadNode, d: number): number {
  let max = d;
  for (const r of node.replies || []) max = Math.max(max, walkDepth(r, d + 1));
  return max;
}

export const useDataStore = create<DataStore>((set, get) => ({
  communities: [],
  posts: [],
  postDots: [],
  fullThreadCache: {},
  avatarImages: new Map(),
  status: 'loading\u2026',
  loadPhase: 'idle',
  _scheduleDraw: null,

  setScheduleDraw: (fn) => set({ _scheduleDraw: fn }),

  loadData: async () => {
    const scheduleDraw = () => get()._scheduleDraw?.();

    try {
      // ── Phase 1: Get community membership from feed worker ───────
      set({ loadPhase: 'communities', status: 'fetching communities\u2026' });
      const comRes = await getCommunities();
      const communities = comRes.communities || [];

      if (communities.length === 0) {
        set({ status: 'no communities yet', loadPhase: 'done' });
        return;
      }

      // Build author → community mapping
      // Each author gets their "biggest" community (most members) for coloring
      const authorCommunity = new Map<string, { id: number; label: string; size: number; hue: number }>();
      for (let ci = 0; ci < communities.length; ci++) {
        const c = communities[ci];
        const hue = communityHue(ci, communities.length);
        for (const m of c.members || []) {
          const existing = authorCommunity.get(m.did);
          if (!existing || c.totalSize > existing.size) {
            authorCommunity.set(m.did, { id: c.id, label: c.label, size: c.totalSize, hue });
          }
        }
      }

      const allMemberDids = [...new Set(communities.flatMap((c) => (c.members || []).map((m) => m.did)))];
      set({ communities });

      // ── Phase 2: Fetch feeds from all members ───────────────────
      set({ loadPhase: 'feeds', status: `fetching feeds\u2026 0/${allMemberDids.length}` });

      const feedTasks = allMemberDids.map((did) => () => getAuthorFeed(did, 15));
      const feedResults = await chunkedParallel(feedTasks, 8, 150, (done, total) => {
        set({ status: `fetching feeds\u2026 ${done}/${total}` });
      });

      // Dedupe posts by URI, keep the one with highest engagement
      const postMap = new Map<string, {
        uri: string; authorDid: string; authorHandle: string; authorAvatar: string | null;
        text: string; replyCount: number; likeCount: number; repostCount: number;
        indexedAt: string;
      }>();

      for (let i = 0; i < feedResults.length; i++) {
        const items = feedResults[i];
        if (!items) continue;
        for (const item of items) {
          const p = item.post;
          if (!p?.uri) continue;
          const existing = postMap.get(p.uri);
          const engagement = (p.replyCount || 0) + (p.likeCount || 0);
          if (!existing || engagement > ((existing.replyCount || 0) + (existing.likeCount || 0))) {
            postMap.set(p.uri, {
              uri: p.uri,
              authorDid: p.author.did,
              authorHandle: p.author.handle || p.author.did.slice(0, 20),
              authorAvatar: p.author.avatar || null,
              text: p.record?.text || '',
              replyCount: p.replyCount || 0,
              likeCount: p.likeCount || 0,
              repostCount: p.repostCount || 0,
              indexedAt: p.record?.createdAt || '',
            });
          }
        }
      }

      // Filter to posts that have replies (threads worth exploring)
      const withReplies = [...postMap.values()].filter((p) => p.replyCount > 0);
      // Sort by reply count so we hydrate the juiciest threads first
      withReplies.sort((a, b) => b.replyCount - a.replyCount);

      set({ status: `${postMap.size} posts found, ${withReplies.length} with replies` });

      // Preload avatars for authors (non-blocking)
      const authorDids = [...new Set(withReplies.map((p) => p.authorDid))];
      loadAvatars(authorDids, get, set, scheduleDraw);

      // ── Phase 3: Hydrate threads for all posts with replies ─────
      set({ loadPhase: 'threads', status: `hydrating threads\u2026 0/${withReplies.length}` });

      const hydratedPosts: HydratedPost[] = [];

      const threadTasks = withReplies.map((post) => async () => {
        try {
          const thread = await getPostThread(post.uri);
          if (!thread?.post) return null;

          const depth = walkDepth(thread, 0);
          const topLevel = (thread.replies || []).length;

          // Cache the full thread
          const cache = get().fullThreadCache;
          set({ fullThreadCache: { ...cache, [post.uri]: thread } });

          // Update counts from live data
          const livePost = thread.post;
          const com = authorCommunity.get(post.authorDid);

          const replyCount = livePost.replyCount || post.replyCount;
          const likeCount = livePost.likeCount || post.likeCount;
          const magnitude = topLevel * Math.max(depth, 1) + likeCount / 10;

          const hydrated: HydratedPost = {
            uri: post.uri,
            authorDid: post.authorDid,
            authorHandle: livePost.author?.handle || post.authorHandle,
            authorAvatar: livePost.author?.avatar || post.authorAvatar,
            text: livePost.record?.text || post.text,
            replyCount,
            likeCount,
            repostCount: livePost.repostCount || post.repostCount,
            indexedAt: post.indexedAt,
            threadDepth: depth,
            topLevelReplies: topLevel,
            primaryCommunityId: com?.id ?? null,
            primaryCommunityLabel: com?.label ?? '',
            primaryCommunityHue: com?.hue ?? 0,
            magnitude,
          };
          return hydrated;
        } catch {
          return null;
        }
      });

      // Chunked: 5 concurrent thread fetches, 200ms between batches
      const threadResults = await chunkedParallel(threadTasks, 5, 200, (done, total) => {
        set({ status: `hydrating threads\u2026 ${done}/${total}` });

        // Incremental layout update every 10 threads
        if (done % 10 === 0 || done === total) {
          const current = get().posts;
          set({ posts: current }); // trigger re-read
          get().recomputeLayout();
          scheduleDraw();
        }
      });

      for (const r of threadResults) {
        if (r) hydratedPosts.push(r);
      }

      // Also include posts without replies but high likes (> 5)
      for (const [, post] of postMap) {
        if (post.replyCount > 0) continue; // already handled
        if (post.likeCount < 5) continue;
        const com = authorCommunity.get(post.authorDid);
        hydratedPosts.push({
          ...post,
          threadDepth: 0,
          topLevelReplies: 0,
          primaryCommunityId: com?.id ?? null,
          primaryCommunityLabel: com?.label ?? '',
          primaryCommunityHue: com?.hue ?? 0,
          magnitude: post.likeCount / 10,
        });
      }

      set({
        posts: hydratedPosts,
        loadPhase: 'done',
        status: `${hydratedPosts.length} threads loaded`,
      });
      get().recomputeLayout();
      scheduleDraw();
    } catch (e) {
      set({ status: `error: ${(e as Error).message}`, loadPhase: 'error' });
    }
  },

  recomputeLayout: () => {
    const { posts } = get();
    const postDots = layoutPosts(posts);
    set({ postDots });
  },

  fetchFullThread: async (uri) => {
    const cached = get().fullThreadCache[uri];
    if (cached) return cached;
    const thread = await getPostThread(uri);
    set({ fullThreadCache: { ...get().fullThreadCache, [uri]: thread } });
    return thread;
  },
}));

/** Non-blocking avatar preload. */
function loadAvatars(
  dids: string[],
  get: () => DataStore,
  set: (partial: Partial<DataStore>) => void,
  scheduleDraw: () => void
) {
  getProfiles(dids).then((profiles) => {
    const images = new Map(get().avatarImages);
    for (const [did, profile] of profiles) {
      if (profile.avatar) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = profile.avatar;
        img.onload = () => {
          const m = new Map(get().avatarImages);
          m.set(did, img);
          set({ avatarImages: m });
          scheduleDraw();
        };
        img.onerror = () => {
          const m = new Map(get().avatarImages);
          m.set(did, null);
          set({ avatarImages: m });
        };
        images.set(did, null); // placeholder
      } else {
        images.set(did, null);
      }
    }
    set({ avatarImages: images });
  });
}
