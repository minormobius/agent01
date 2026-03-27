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

export interface Post {
  uri: string;
  authorDid: string;
  communityIds: number[];
  score: number;
  replyCount: number;
  likeCount: number;
  repostCount: number;
  indexedAt: string;
}

export interface CommunityActivity {
  postCount: number;
  totalScore: number;
}

export interface ThreadDepth {
  maxDepth: number;
  topLevelReplies: number;
  interactorDids: string[];
}

// ── Layout node types ────────────────────────────────────────────────

export interface CommunityNode {
  _type: 'community';
  _x: number;
  _y: number;
  _r: number;
  _community: Community;
  _ci: number;
  _hue: number;
  _label: string;
}

export interface PostDot {
  _type: 'post';
  _x: number;
  _y: number;
  _r: number;
  _post: Post;
  _communityId: number;
  _ci: number;
  _hue: number;
  _magnitude: number;
  _hasThreadData: boolean;
  _interactorCount: number;
  _parent: CommunityNode;
}

export type LayoutNode = CommunityNode | PostDot;

// ── Bluesky thread types ─────────────────────────────────────────────

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

// ── Camera ───────────────────────────────────────────────────────────

export interface Camera {
  x: number;
  y: number;
  scale: number;
}
