// ── Domain types ─────────────────────────────────────────────────────

export interface Member {
  did: string;
  handle?: string;
  shell: number;
  mutualCount: number;
}

export interface Community {
  id: number;
  label: string;
  coreSize: number;
  totalSize: number;
  members: Member[];
}

export interface Bridge {
  did: string;
  communityIds: number[];
}

/** A hydrated post with full thread data from Bluesky. */
export interface HydratedPost {
  uri: string;
  authorDid: string;
  authorHandle: string;
  authorAvatar: string | null;
  text: string;
  replyCount: number;
  likeCount: number;
  repostCount: number;
  indexedAt: string;
  // Thread info (populated after hydration)
  threadDepth: number;
  topLevelReplies: number;
  // Author's community membership
  authorShell: number; // 0 = core, 1+ = shell, 99 = not in any community
  primaryCommunityId: number | null;
  primaryCommunityLabel: string;
  primaryCommunityHue: number;
  // Scoring magnitude (see scoreMagnitude in stores/data.ts)
  magnitude: number;
}

// ── Layout node ──────────────────────────────────────────────────────

export interface PostDot {
  _type: 'post';
  _x: number;
  _y: number;
  _r: number;
  _post: HydratedPost;
  _hue: number;
  _magnitude: number;
}

export type LayoutNode = PostDot;

// ── Bluesky API types ────────────────────────────────────────────────

export interface BlueskyAuthor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface BlueskyPostRecord {
  text: string;
  createdAt: string;
}

export interface BlueskyImage {
  thumb?: string;
  fullsize?: string;
}

export interface BlueskyEmbed {
  images?: BlueskyImage[];
  media?: { images?: BlueskyImage[] };
}

export interface BlueskyPost {
  uri: string;
  author: BlueskyAuthor;
  record: BlueskyPostRecord;
  embed?: BlueskyEmbed;
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
}

export interface BlueskyThreadNode {
  $type?: string;
  post?: BlueskyPost;
  replies?: BlueskyThreadNode[];
}

export interface BlueskyFeedItem {
  post: BlueskyPost;
  reply?: { root: { uri: string }; parent: { uri: string } };
}

// ── Camera ───────────────────────────────────────────────────────────

export interface Camera {
  x: number;
  y: number;
  scale: number;
}
