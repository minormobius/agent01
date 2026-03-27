import type { Camera, PostDot, LayoutNode } from '../api/types';
import { s2w } from './camera';

/** Hit test against post dots. Posts are the only interactive target now. */
export function hitTest(
  sx: number,
  sy: number,
  cam: Camera,
  W: number,
  H: number,
  postDots: PostDot[]
): LayoutNode | null {
  const [wx, wy] = s2w(cam, W, H, sx, sy);

  let best: PostDot | null = null;
  let bestDist = Infinity;

  for (const dot of postDots) {
    if (dot._r * cam.scale < 2) continue;
    const dx = wx - dot._x;
    const dy = wy - dot._y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < dot._r * 1.3 && d < bestDist) {
      bestDist = d;
      best = dot;
    }
  }

  return best;
}
