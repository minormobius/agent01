import type { HydratedPost, PostDot } from '../api/types';

/**
 * Flat layout: posts in a Fermat spiral, biggest at center.
 * Spacing compresses at the wings so low-magnitude posts pack tighter.
 */
export function layoutPosts(posts: HydratedPost[]): PostDot[] {
  if (posts.length === 0) return [];

  // Sort by magnitude descending — biggest at center
  const sorted = [...posts].sort((a, b) => b.magnitude - a.magnitude);

  const dots: PostDot[] = [];
  const maxMag = sorted[0].magnitude || 1;

  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const BASE_R = 0.012;
  const MAX_R = 0.08;

  for (let i = 0; i < sorted.length; i++) {
    const post = sorted[i];
    const t = Math.sqrt(post.magnitude / maxMag);
    const r = BASE_R + t * (MAX_R - BASE_R);

    // Spacing decreases with index — center is roomy, wings are dense.
    // Core spacing for first ~20 posts, then compresses logarithmically.
    const spacing = i < 20
      ? 0.12
      : 0.12 * Math.pow(20 / (i + 1), 0.3); // shrinks ~30% per decade of posts

    const spiralR = spacing * Math.sqrt(i);
    const theta = i * GOLDEN_ANGLE;

    dots.push({
      _type: 'post',
      _x: spiralR * Math.cos(theta),
      _y: spiralR * Math.sin(theta),
      _r: r,
      _post: post,
      _hue: post.primaryCommunityHue,
      _magnitude: post.magnitude,
    });
  }

  return dots;
}
