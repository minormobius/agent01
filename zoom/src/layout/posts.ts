import type {
  Post, CommunityNode, Bridge, PostDot, ThreadDepth,
} from '../api/types';

/**
 * Lay out posts as the PRIMARY visual elements within community sectors.
 *
 * Posts are sized by magnitude: replyCount * max(depth, 1) + likeCount/10.
 * Highest-magnitude posts sit closest to the community center.
 * Posts are MUCH larger than in the old community-centric view.
 */
export function layoutPostDots(
  posts: Post[],
  communityNodes: CommunityNode[],
  bridges: Bridge[],
  threadCache: Record<string, ThreadDepth>
): PostDot[] {
  if (posts.length === 0 || communityNodes.length === 0) return [];

  const dots: PostDot[] = [];
  const communityNodeMap = new Map<number, CommunityNode>();
  for (const cn of communityNodes) {
    communityNodeMap.set(cn._community.id, cn);
  }

  // Group posts by community, keeping best per-community
  const postsByCommunity = new Map<number, { post: Post; tc: ThreadDepth | null }[]>();
  for (const post of posts) {
    for (const cid of post.communityIds) {
      if (!postsByCommunity.has(cid)) postsByCommunity.set(cid, []);
      postsByCommunity.get(cid)!.push({ post, tc: threadCache[post.uri] || null });
    }
  }

  for (const [cid, cPosts] of postsByCommunity) {
    const cNode = communityNodeMap.get(cid);
    if (!cNode) continue;

    // Sort by magnitude descending — biggest posts get best placement
    const withMag = cPosts.map(({ post, tc }) => {
      const replyCount = post.replyCount || 0;
      const likeCount = post.likeCount || 0;
      const maxDepth = tc ? tc.maxDepth : 1;
      const topLevel = tc ? tc.topLevelReplies : replyCount;
      const magnitude = topLevel * Math.max(maxDepth, 1) + likeCount / 10;
      return { post, tc, magnitude };
    });
    withMag.sort((a, b) => b.magnitude - a.magnitude);

    // Lay out in concentric rings from center — biggest posts near center
    const maxPosts = Math.min(withMag.length, 30); // cap per community
    for (let i = 0; i < maxPosts; i++) {
      const { post, tc, magnitude } = withMag[i];

      // Ring placement: first post at center, then spiral out
      const ring = Math.floor(Math.sqrt(i));
      const posInRing = i - ring * ring;
      const ringCapacity = 2 * ring + 1;
      const ringAngle = (posInRing / ringCapacity) * Math.PI * 2;

      // Distance from community center increases with ring
      const ringDist = ring * cNode._r * 0.18;
      const px = cNode._x + ringDist * Math.cos(ringAngle);
      const py = cNode._y + ringDist * Math.sin(ringAngle);

      // Deterministic jitter from URI hash
      let hash = 0;
      for (let j = 0; j < post.uri.length; j++) {
        hash = ((hash << 5) - hash + post.uri.charCodeAt(j)) | 0;
      }
      const jAngle = ((hash & 0xffff) / 0xffff) * Math.PI * 2;
      const jDist = cNode._r * 0.02 * (((hash >> 16) & 0xff) / 255);

      // Post radius: MUCH larger than old version
      // Min 3% of community radius, max 20%
      const minR = cNode._r * 0.03;
      const maxR = cNode._r * 0.20;
      const r = Math.max(
        minR,
        Math.min(maxR, minR + Math.sqrt(magnitude) * cNode._r * 0.025)
      );

      dots.push({
        _type: 'post',
        _x: px + jDist * Math.cos(jAngle),
        _y: py + jDist * Math.sin(jAngle),
        _r: r,
        _post: post,
        _communityId: cid,
        _ci: cNode._ci,
        _hue: cNode._hue,
        _magnitude: magnitude,
        _hasThreadData: !!tc,
        _interactorCount: tc ? tc.interactorDids.length : 0,
        _parent: cNode,
      });
    }
  }

  // Sort by magnitude so biggest render on top
  dots.sort((a, b) => a._magnitude - b._magnitude);
  return dots;
}
