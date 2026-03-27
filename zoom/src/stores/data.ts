import { create } from 'zustand';
import type {
  Community, HydratedPost, PostDot, BlueskyThreadNode,
} from '../api/types';
import { getCommunities } from '../api/client';
import { getAuthorFeed, getPostThread, chunkedParallel } from '../api/bluesky';
// Note: avatars loaded directly from URLs in feed/thread data, no separate getProfiles call
import { layoutPosts } from '../layout/posts';
import type { HydratedResult } from '../workers/threadHydrator';

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

function communityHue(idx: number, total: number): number {
  return (idx / Math.max(total, 1)) * 360;
}

function scoreMagnitude(
  topLevelReplies: number,
  threadDepth: number,
  likeCount: number,
  authorShell: number
): number {
  const threadSignal = topLevelReplies * Math.max(threadDepth, 1);

  let likeSignal: number;
  if (likeCount <= 0) likeSignal = 0;
  else if (likeCount <= 50) likeSignal = Math.log2(1 + likeCount);
  else if (likeCount <= 100) likeSignal = Math.log2(51);
  else {
    const overshoot = likeCount - 100;
    likeSignal = Math.log2(51) * Math.pow(0.5, overshoot / 200);
  }

  let authorWeight: number;
  if (authorShell === 0) authorWeight = 3.0;
  else if (authorShell === 1) authorWeight = 1.5;
  else if (authorShell <= 3) authorWeight = 1.0;
  else authorWeight = 0.3;

  return (threadSignal + likeSignal) * authorWeight;
}

/** Load an Image from a URL. Returns null on failure. */
function loadImage(
  url: string,
  did: string,
  get: () => DataStore,
  set: (p: Partial<DataStore>) => void,
  scheduleDraw: () => void
) {
  if (get().avatarImages.has(did)) return;
  const m = new Map(get().avatarImages);
  m.set(did, null); // placeholder
  set({ avatarImages: m });

  const img = new Image();
  // No crossOrigin — Bluesky CDN doesn't send CORS headers.
  // We only need drawImage (not pixel readback), so tainted canvas is fine.
  img.src = url;
  img.onload = () => {
    const m2 = new Map(get().avatarImages);
    m2.set(did, img);
    set({ avatarImages: m2 });
    scheduleDraw();
  };
  img.onerror = () => {
    const m2 = new Map(get().avatarImages);
    m2.set(did, null);
    set({ avatarImages: m2 });
  };
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
      // ── Phase 1: Community membership ──────────────────────────
      set({ loadPhase: 'communities', status: 'fetching communities\u2026' });
      const comRes = await getCommunities();
      const communities = comRes.communities || [];

      if (communities.length === 0) {
        set({ status: 'no communities yet', loadPhase: 'done' });
        return;
      }

      const authorCommunity = new Map<string, { id: number; label: string; size: number; hue: number; shell: number }>();
      for (let ci = 0; ci < communities.length; ci++) {
        const c = communities[ci];
        const hue = communityHue(ci, communities.length);
        for (const m of c.members || []) {
          const existing = authorCommunity.get(m.did);
          if (!existing || m.shell < existing.shell || (m.shell === existing.shell && c.totalSize > existing.size)) {
            authorCommunity.set(m.did, { id: c.id, label: c.label, size: c.totalSize, hue, shell: m.shell });
          }
        }
      }

      const allMemberDids = [...new Set(communities.flatMap((c) => (c.members || []).map((m) => m.did)))];

      // The Bluesky list can't include the list author — add them manually
      const EXTRA_HANDLES = ['minormobius.bsky.social'];
      for (const h of EXTRA_HANDLES) {
        if (!allMemberDids.includes(h)) allMemberDids.push(h);
      }

      set({ communities });

      // ── Phase 2: Fetch feeds ───────────────────────────────────
      set({ loadPhase: 'feeds', status: `fetching feeds\u2026 0/${allMemberDids.length}` });

      const feedTasks = allMemberDids.map((did) => () => getAuthorFeed(did, 15));
      const feedResults = await chunkedParallel(feedTasks, 8, 150, (done, total) => {
        set({ status: `fetching feeds\u2026 ${done}/${total}` });
      });

      // Dedupe and collect avatars from feed data
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

          // Load avatar directly from feed data (no separate getProfiles call)
          if (p.author?.avatar && p.author?.did) {
            loadImage(p.author.avatar, p.author.did, get, set, scheduleDraw);
          }

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

      const withReplies = [...postMap.values()].filter((p) => p.replyCount > 0);
      withReplies.sort((a, b) => b.replyCount - a.replyCount);

      set({ status: `${postMap.size} posts, ${withReplies.length} threads \u2014 hydrating\u2026` });

      // ── Phase 3: Hydrate threads via Web Worker ────────────────
      set({ loadPhase: 'threads' });

      const workerPosts = withReplies.map((post) => {
        const com = authorCommunity.get(post.authorDid);
        return {
          ...post,
          authorShell: com?.shell ?? 99,
          primaryCommunityId: com?.id ?? null,
          primaryCommunityLabel: com?.label ?? '',
          primaryCommunityHue: com?.hue ?? 0,
        };
      });

      const hydratedPosts: HydratedPost[] = [];

      await new Promise<void>((resolve) => {
        const worker = new Worker(
          new URL('../workers/threadHydrator.ts', import.meta.url),
          { type: 'module' }
        );

        worker.onmessage = (e: MessageEvent) => {
          if (e.data.type === 'batch') {
            const batch = e.data.posts as HydratedResult[];
            for (const r of batch) {
              // Load avatar from thread data (freshest URL)
              if (r.authorAvatar) {
                loadImage(r.authorAvatar, r.post.authorDid, get, set, scheduleDraw);
              }

              hydratedPosts.push({
                uri: r.post.uri,
                authorDid: r.post.authorDid,
                authorHandle: r.authorHandle,
                authorAvatar: r.authorAvatar,
                text: r.text,
                replyCount: r.replyCount,
                likeCount: r.likeCount,
                repostCount: r.repostCount,
                indexedAt: r.post.indexedAt,
                threadDepth: r.threadDepth,
                topLevelReplies: r.topLevelReplies,
                authorShell: r.post.authorShell,
                primaryCommunityId: r.post.primaryCommunityId,
                primaryCommunityLabel: r.post.primaryCommunityLabel,
                primaryCommunityHue: r.post.primaryCommunityHue,
                magnitude: r.magnitude,
              });
            }

            // Incremental update
            set({ posts: [...hydratedPosts] });
            get().recomputeLayout();
            scheduleDraw();
          }

          if (e.data.type === 'progress') {
            set({ status: `hydrating threads\u2026 ${e.data.done}/${e.data.total}` });
          }

          if (e.data.type === 'done') {
            worker.terminate();
            resolve();
          }
        };

        worker.postMessage({
          type: 'hydrate',
          posts: workerPosts,
          concurrency: 8,
          delayMs: 100,
        });
      });

      // Also include like-only posts from core/shell members
      for (const [, post] of postMap) {
        if (post.replyCount > 0) continue;
        if (post.likeCount < 3) continue;
        const com = authorCommunity.get(post.authorDid);
        const authorShell = com?.shell ?? 99;
        const mag = scoreMagnitude(0, 0, post.likeCount, authorShell);
        if (mag < 0.5) continue;
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
