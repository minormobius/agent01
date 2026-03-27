import type { HydratedPost, PostDot } from '../api/types';

/**
 * Flat layout: posts arranged by magnitude in a packed spiral.
 * No community sectors. Biggest posts at center, smaller ones radiate out.
 * Color comes from each post's primary community.
 */
export function layoutPosts(posts: HydratedPost[]): PostDot[] {
  if (posts.length === 0) return [];

  // Sort by magnitude descending — biggest at center
  const sorted = [...posts].sort((a, b) => b.magnitude - a.magnitude);

  const dots: PostDot[] = [];

  // World-space sizing: normalize radii so the layout fits in ~[-1, 1]
  const maxMag = sorted[0].magnitude || 1;

  // Place posts in a Fermat spiral (golden angle) — even packing, no overlaps
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.5 degrees
  const BASE_R = 0.015; // minimum post radius in world coords
  const MAX_R = 0.08;   // maximum post radius

  // Pre-compute radii to figure out spacing
  const radii = sorted.map((p) => {
    const t = Math.sqrt(p.magnitude / maxMag);
    return BASE_R + t * (MAX_R - BASE_R);
  });

  // Spacing factor — controls how spread out the spiral is
  const SPACING = 0.12;

  for (let i = 0; i < sorted.length; i++) {
    const post = sorted[i];
    const r = radii[i];

    // Fermat spiral: r_pos = spacing * sqrt(i), theta = i * golden_angle
    const spiralR = SPACING * Math.sqrt(i);
    const theta = i * GOLDEN_ANGLE;
    const x = spiralR * Math.cos(theta);
    const y = spiralR * Math.sin(theta);

    dots.push({
      _type: 'post',
      _x: x,
      _y: y,
      _r: r,
      _post: post,
      _hue: post.primaryCommunityHue,
      _magnitude: post.magnitude,
    });
  }

  return dots;
}
