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

/**
 * Scoring function: heavily weights community membership and thread depth.
 * Likes use a tent/parabolic shape — peaks around 30-80, decays above 100.
 * Core members get 3x, shell-1 gets 1.5x, shell-2+ gets 1x, non-members 0.3x.
 */
function scoreMagnitude(
  topLevelReplies: number,
  threadDepth: number,
  likeCount: number,
  authorShell: number
): number {
  // Thread signal: replies * depth is the core signal for "deep conversation"
  const threadSignal = topLevelReplies * Math.max(threadDepth, 1);

  // Likes: tent function peaking around 50, decaying hard above 100
  // 0-50 likes: ramps up (log scale)
  // 50-100: plateau
  // 100+: decays (penalty for mega-viral)
  let likeSignal: number;
  if (likeCount <= 0) {
    likeSignal = 0;
  } else if (likeCount <= 50) {
    likeSignal = Math.log2(1 + likeCount); // 0→0, 10→3.5, 50→5.7
  } else if (likeCount <= 100) {
    likeSignal = Math.log2(51); // plateau at ~5.7
  } else {
    // Decay: the further past 100, the more it drops
    const overshoot = likeCount - 100;
    likeSignal = Math.log2(51) * Math.pow(0.5, overshoot / 200); // halves every 200 extra likes
  }

  // Author weight: core members dominate, non-members are noise
  let authorWeight: number;
  if (authorShell === 0) authorWeight = 3.0;       // core
  else if (authorShell === 1) authorWeight = 1.5;   // shell 1
  else if (authorShell <= 3) authorWeight = 1.0;    // shell 2-3
  else authorWeight = 0.3;                           // non-member or deep shell

  return (threadSignal + likeSignal) * authorWeight;
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
      // Each author gets their "biggest" community for coloring, plus best (lowest) shell
      const authorCommunity = new Map<string, { id: number; label: string; size: number; hue: number; shell: number }>();
      for (let ci = 0; ci < communities.length; ci++) {
        const c = communities[ci];
        const hue = communityHue(ci, communities.length);
        for (const m of c.members || []) {
          const existing = authorCommunity.get(m.did);
          // Prefer: lowest shell first, then biggest community for ties
          if (!existing || m.shell < existing.shell || (m.shell === existing.shell && c.totalSize > existing.size)) {
            authorCommunity.set(m.did, { id: c.id, label: c.label, size: c.totalSize, hue, shell: m.shell });
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
          const authorShell = com?.shell ?? 99;

          const replyCount = livePost.replyCount || post.replyCount;
          const likeCount = livePost.likeCount || post.likeCount;
          const magnitude = scoreMagnitude(topLevel, depth, likeCount, authorShell);

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
            authorShell,
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

      // Also include posts without replies but with some likes
      for (const [, post] of postMap) {
        if (post.replyCount > 0) continue; // already handled
        if (post.likeCount < 3) continue;
        const com = authorCommunity.get(post.authorDid);
        const authorShell = com?.shell ?? 99;
        const mag = scoreMagnitude(0, 0, post.likeCount, authorShell);
        if (mag < 0.5) continue; // skip noise
        hydratedPosts.push({
          ...post,
          threadDepth: 0,
          topLevelReplies: 0,
          authorShell,
          primaryCommunityId: com?.id ?? null,
          primaryCommunityLabel: com?.label ?? '',
          primaryCommunityHue: com?.hue ?? 0,
          magnitude: mag,
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
