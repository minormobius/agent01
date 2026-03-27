import type { Community, Bridge, CommunityNode } from '../api/types';

/** Assign each community an HSL hue spread evenly around the wheel. */
function communityHue(idx: number, total: number): number {
  return (idx / Math.max(total, 1)) * 360;
}

/**
 * Lay out communities as radial sectors.
 * These serve as background context — posts are the primary visual.
 */
export function layoutCommunities(
  communities: Community[],
  _bridges: Bridge[]
): CommunityNode[] {
  if (communities.length === 0) return [];

  const nodes: CommunityNode[] = [];
  const totalMembers = communities.reduce((n, c) => n + c.totalSize, 0);
  let angle = 0;
  const TWO_PI = Math.PI * 2;

  for (let ci = 0; ci < communities.length; ci++) {
    const c = communities[ci];
    const frac = c.totalSize / totalMembers;
    const sweep = TWO_PI * frac;
    const midAngle = angle + sweep / 2;
    const hue = communityHue(ci, communities.length);

    const dist = 0.35;
    const cx = dist * Math.cos(midAngle);
    const cy = dist * Math.sin(midAngle);
    const cRadius = Math.max(0.08, Math.sqrt(frac) * 0.4);

    nodes.push({
      _type: 'community',
      _x: cx,
      _y: cy,
      _r: cRadius,
      _community: c,
      _ci: ci,
      _hue: hue,
      _label: `${c.label} (${c.totalSize})`,
    });

    angle += sweep;
  }

  return nodes;
}
