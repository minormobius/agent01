import type { Camera, CommunityNode, PostDot, LayoutNode } from '../api/types';
import { s2w } from './camera';

/**
 * Hit test with priority: post dots > community blobs.
 * Posts are the primary interactive target.
 */
export function hitTest(
  sx: number,
  sy: number,
  cam: Camera,
  W: number,
  H: number,
  postDots: PostDot[],
  communityNodes: CommunityNode[]
): LayoutNode | null {
  const [wx, wy] = s2w(cam, W, H, sx, sy);

  // 1. Post dots (primary targets)
  let bestPost: PostDot | null = null;
  let bestPostDist = Infinity;
  for (const dot of postDots) {
    if (dot._r * cam.scale < 3) continue;
    const dx = wx - dot._x;
    const dy = wy - dot._y;
    const d = Math.sqrt(dx * dx + dy * dy);
    // Generous hit area — 1.3x radius for easier clicking
    if (d < dot._r * 1.3 && d < bestPostDist) {
      bestPostDist = d;
      bestPost = dot;
    }
  }
  if (bestPost) return bestPost;

  // 2. Community blobs (fallback)
  let bestCom: CommunityNode | null = null;
  let bestComR = Infinity;
  for (const n of communityNodes) {
    if (n._r * cam.scale < 2) continue;
    const dx = wx - n._x;
    const dy = wy - n._y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < n._r * 0.9 && n._r < bestComR) {
      bestComR = n._r;
      bestCom = n;
    }
  }
  return bestCom;
}
