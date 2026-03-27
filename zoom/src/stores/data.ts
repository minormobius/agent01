import { create } from 'zustand';
import type {
  Community, Bridge, Post, CommunityActivity,
  CommunityNode, PostDot, ThreadDepth,
} from '../api/types';
import { getCommunities, getCommunityActivity, getThreadDepth } from '../api/client';
import { getPostThread, getProfiles } from '../api/bluesky';
import { layoutCommunities } from '../layout/communities';
import { layoutPostDots } from '../layout/posts';
import type { BlueskyThreadNode } from '../api/types';

interface DataStore {
  // Raw data
  communities: Community[];
  bridges: Bridge[];
  activityData: Record<string, CommunityActivity>;
  activityPosts: Post[];

  // Computed layout
  communityNodes: CommunityNode[];
  postDots: PostDot[];

  // Caches
  threadCache: Record<string, ThreadDepth>;
  fullThreadCache: Record<string, BlueskyThreadNode>;
  avatarImages: Map<string, HTMLImageElement | null>;
  avatarLoading: Set<string>;

  // Status
  status: string;
  heatMax: number;

  // Actions
  loadData: () => Promise<void>;
  recomputeLayout: () => void;
  fetchEagerThreadDepths: () => Promise<void>;
  fetchFullThread: (uri: string) => Promise<BlueskyThreadNode>;
  fetchAvatars: (dids: string[]) => void;
  updateThreadCache: (uri: string, info: ThreadDepth) => void;
  _drawScheduler: (() => void) | null;
  setDrawScheduler: (fn: () => void) => void;
}

export const useDataStore = create<DataStore>((set, get) => ({
  communities: [],
  bridges: [],
  activityData: {},
  activityPosts: [],
  communityNodes: [],
  postDots: [],
  threadCache: {},
  fullThreadCache: {},
  avatarImages: new Map(),
  avatarLoading: new Set(),
  status: 'loading\u2026',
  heatMax: 0,
  _drawScheduler: null,

  setDrawScheduler: (fn) => set({ _drawScheduler: fn }),

  loadData: async () => {
    set({ status: 'fetching communities\u2026' });
    try {
      const [comRes, actRes] = await Promise.all([
        getCommunities(),
        getCommunityActivity().catch(() => null),
      ]);

      const communities = comRes.communities || [];
      const bridges = comRes.bridges || [];
      let activityData: Record<string, CommunityActivity> = {};
      let activityPosts: Post[] = [];
      let heatMax = 0;

      if (actRes) {
        activityData = actRes.communities || {};
        activityPosts = actRes.posts || [];
        for (const cid in activityData) {
          if (activityData[cid].totalScore > heatMax) heatMax = activityData[cid].totalScore;
        }
      }

      if (communities.length === 0) {
        set({ status: 'no communities yet \u2014 waiting for cron' });
        return;
      }

      set({ communities, bridges, activityData, activityPosts, heatMax });
      get().recomputeLayout();

      const totalMembers = communities.reduce((n, c) => n + c.totalSize, 0);
      set({
        status: `${communities.length} communities \u00b7 ${totalMembers} members \u00b7 ${activityPosts.length} posts`,
      });

      // Eager: fetch thread depths for top posts
      get().fetchEagerThreadDepths();

      // Fetch author avatars for all posts
      const authorDids = [...new Set(activityPosts.map((p) => p.authorDid))];
      get().fetchAvatars(authorDids);
    } catch (e) {
      set({ status: `error: ${(e as Error).message}` });
    }
  },

  recomputeLayout: () => {
    const s = get();
    const communityNodes = layoutCommunities(s.communities, s.bridges);
    const postDots = layoutPostDots(
      s.activityPosts,
      communityNodes,
      s.bridges,
      s.threadCache
    );
    set({ communityNodes, postDots });
    s._drawScheduler?.();
  },

  fetchEagerThreadDepths: async () => {
    const { activityPosts, threadCache } = get();
    // Fetch thread depth for top 30 posts by score
    const toFetch = activityPosts
      .filter((p) => !threadCache[p.uri])
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);

    if (toFetch.length === 0) return;

    const results = await Promise.allSettled(
      toFetch.map((p) =>
        getThreadDepth(p.uri).then((data) => ({ uri: p.uri, data }))
      )
    );

    let updated = false;
    const newCache = { ...get().threadCache };
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.data) {
        newCache[r.value.uri] = r.value.data;
        updated = true;
      }
    }

    if (updated) {
      set({ threadCache: newCache });
      get().recomputeLayout();
    }
  },

  fetchFullThread: async (uri) => {
    const cached = get().fullThreadCache[uri];
    if (cached) return cached;

    const thread = await getPostThread(uri);
    set({ fullThreadCache: { ...get().fullThreadCache, [uri]: thread } });

    // Extract thread depth info and update cache
    if (thread?.replies) {
      const walkDepth = (n: BlueskyThreadNode, d: number): number => {
        let max = d;
        for (const r of n.replies || []) max = Math.max(max, walkDepth(r, d + 1));
        return max;
      };
      const maxDepth = walkDepth(thread, 0);
      const topLevelReplies = (thread.replies || []).length;
      const interactorDids: string[] = [];
      const walkDids = (n: BlueskyThreadNode) => {
        if (n.post?.author?.did) interactorDids.push(n.post.author.did);
        for (const r of n.replies || []) walkDids(r);
      };
      walkDids(thread);
      get().updateThreadCache(uri, { maxDepth, topLevelReplies, interactorDids });
    }

    return thread;
  },

  updateThreadCache: (uri, info) => {
    set({ threadCache: { ...get().threadCache, [uri]: info } });
    get().recomputeLayout();
  },

  fetchAvatars: (dids) => {
    const { avatarImages, avatarLoading } = get();
    const unresolved = dids.filter((d) => !avatarImages.has(d) && !avatarLoading.has(d));
    if (unresolved.length === 0) return;

    const newLoading = new Set(avatarLoading);
    unresolved.forEach((d) => newLoading.add(d));
    set({ avatarLoading: newLoading });

    getProfiles(unresolved).then((profiles) => {
      const newImages = new Map(get().avatarImages);
      const doneLoading = new Set(get().avatarLoading);

      for (const did of unresolved) {
        doneLoading.delete(did);
        const p = profiles.get(did);
        if (p?.avatar) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = p.avatar;
          img.onload = () => {
            const m = new Map(get().avatarImages);
            m.set(did, img);
            set({ avatarImages: m });
            get()._drawScheduler?.();
          };
          img.onerror = () => {
            const m = new Map(get().avatarImages);
            m.set(did, null);
            set({ avatarImages: m });
          };
          newImages.set(did, null); // placeholder until loaded
        } else {
          newImages.set(did, null);
        }
      }

      set({ avatarImages: newImages, avatarLoading: doneLoading });
      get()._drawScheduler?.();
    });
  },
}));
