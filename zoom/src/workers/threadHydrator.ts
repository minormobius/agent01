/**
 * Web Worker: hydrates threads in parallel by fetching getPostThread
 * from Bluesky public API. Posts results back in batches.
 *
 * Messages IN:  { type: 'hydrate', posts: RawPost[], concurrency: number, delayMs: number }
 * Messages OUT: { type: 'batch', posts: HydratedResult[] }
 *               { type: 'done' }
 *               { type: 'progress', done: number, total: number }
 */

const BSKY_PUBLIC = 'https://public.api.bsky.app';

interface RawPost {
  uri: string;
  authorDid: string;
  authorHandle: string;
  authorAvatar: string | null;
  text: string;
  replyCount: number;
  likeCount: number;
  repostCount: number;
  indexedAt: string;
  authorShell: number;
  primaryCommunityId: number | null;
  primaryCommunityLabel: string;
  primaryCommunityHue: number;
}

export interface HydratedResult {
  post: RawPost;
  threadDepth: number;
  topLevelReplies: number;
  magnitude: number;
  // Updated from live data
  replyCount: number;
  likeCount: number;
  repostCount: number;
  authorHandle: string;
  authorAvatar: string | null;
  text: string;
}

interface ThreadNode {
  $type?: string;
  post?: {
    uri: string;
    author: { did: string; handle: string; avatar?: string };
    record: { text: string; createdAt: string };
    likeCount?: number;
    replyCount?: number;
    repostCount?: number;
  };
  replies?: ThreadNode[];
}

function walkDepth(node: ThreadNode, d: number): number {
  let max = d;
  for (const r of node.replies || []) max = Math.max(max, walkDepth(r, d + 1));
  return max;
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
  else authorWeight = 0.03;

  return (threadSignal + likeSignal) * authorWeight;
}

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url);
    if (res.status === 429 && i < retries) {
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      continue;
    }
    return res;
  }
  throw new Error('unreachable');
}

async function hydrateOne(post: RawPost): Promise<HydratedResult | null> {
  try {
    const url = `${BSKY_PUBLIC}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(post.uri)}&depth=10&parentHeight=0`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return null;
    const data = await res.json();
    const thread = data.thread as ThreadNode;
    if (!thread?.post) return null;

    const depth = walkDepth(thread, 0);
    const topLevel = (thread.replies || []).length;
    const lp = thread.post;
    const replyCount = lp.replyCount || post.replyCount;
    const likeCount = lp.likeCount || post.likeCount;

    return {
      post,
      threadDepth: depth,
      topLevelReplies: topLevel,
      magnitude: scoreMagnitude(topLevel, depth, likeCount, post.authorShell),
      replyCount,
      likeCount,
      repostCount: lp.repostCount || post.repostCount,
      authorHandle: lp.author?.handle || post.authorHandle,
      authorAvatar: lp.author?.avatar || post.authorAvatar,
      text: lp.record?.text || post.text,
    };
  } catch {
    return null;
  }
}

self.onmessage = async (e: MessageEvent) => {
  if (e.data.type !== 'hydrate') return;

  const { posts, concurrency, delayMs } = e.data as {
    posts: RawPost[];
    concurrency: number;
    delayMs: number;
  };

  let done = 0;
  const BATCH_SIZE = 10; // post results back in batches of 10

  for (let i = 0; i < posts.length; i += concurrency) {
    const chunk = posts.slice(i, i + concurrency);
    const results = await Promise.allSettled(chunk.map((p) => hydrateOne(p)));

    const batch: HydratedResult[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        batch.push(r.value);
      }
      done++;
    }

    if (batch.length > 0) {
      self.postMessage({ type: 'batch', posts: batch });
    }

    self.postMessage({ type: 'progress', done, total: posts.length });

    if (i + concurrency < posts.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  self.postMessage({ type: 'done' });
};
