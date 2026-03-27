import type { Camera, CommunityNode, Bridge } from '../../api/types';
import { w2s } from '../camera';

export function drawBridges(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cam: Camera,
  bridges: Bridge[],
  communityNodes: CommunityNode[]
) {
  for (const b of bridges) {
    if (b.communityIds.length < 2) continue;
    const nodes = b.communityIds
      .map((cid) => communityNodes.find((n) => n._community.id === cid))
      .filter(Boolean) as CommunityNode[];
    if (nodes.length < 2) continue;

    for (let i = 0; i < nodes.length - 1; i++) {
      const [sx1, sy1] = w2s(cam, W, H, nodes[i]._x, nodes[i]._y);
      const [sx2, sy2] = w2s(cam, W, H, nodes[i + 1]._x, nodes[i + 1]._y);
      const sr1 = nodes[i]._r * cam.scale;
      const sr2 = nodes[i + 1]._r * cam.scale;
      if (sr1 < 2 && sr2 < 2) continue;

      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      const mx = (sx1 + sx2) / 2;
      const my = (sy1 + sy2) / 2;
      const perpX = -(sy2 - sy1) * 0.15;
      const perpY = (sx2 - sx1) * 0.15;
      ctx.quadraticCurveTo(mx + perpX, my + perpY, sx2, sy2);
      ctx.strokeStyle = 'rgba(255,153,34,.08)';
      ctx.lineWidth = Math.max(0.5, Math.min(1.5, cam.scale * 0.002));
      ctx.stroke();
    }
  }
}
