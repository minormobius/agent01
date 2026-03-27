import type { Camera, CommunityNode, CommunityActivity } from '../../api/types';
import { w2s } from '../camera';

/** Community blob halos — subtle background context. */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cam: Camera,
  communityNodes: CommunityNode[],
  activityData: Record<string, CommunityActivity>,
  heatMax: number,
  pulsePhase: number
) {
  for (const node of communityNodes) {
    const [sx, sy] = w2s(cam, W, H, node._x, node._y);
    const sr = node._r * cam.scale;

    if (sx + sr < -20 || sx - sr > W + 20) continue;
    if (sy + sr < -20 || sy - sr > H + 20) continue;
    if (sr < 2) continue;

    const activity = activityData[node._community.id];
    const heat = activity ? Math.min(1, activity.totalScore / Math.max(heatMax, 0.01)) : 0;
    const pulse = heat > 0.1 ? 0.5 + 0.5 * Math.sin(pulsePhase + node._ci) : 0;
    const glowAlpha = heat * 0.15 * pulse; // subtler than before

    // Outer glow
    if (heat > 0.1 && sr > 8) {
      const grad = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 1.5);
      const hue = node._hue;
      grad.addColorStop(0, `hsla(${hue}, 40%, 20%, ${glowAlpha})`);
      grad.addColorStop(1, `hsla(${hue}, 40%, 20%, 0)`);
      ctx.beginPath();
      ctx.arc(sx, sy, sr * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Main blob — very subtle
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    const fillL = 10 + heat * 8;
    ctx.fillStyle = `hsla(${node._hue}, 20%, ${fillL}%, ${0.2 + heat * 0.15})`;
    ctx.fill();
    ctx.strokeStyle = `hsla(${node._hue}, 20%, ${fillL + 10}%, ${0.2 + heat * 0.1})`;
    ctx.lineWidth = Math.max(0.5, sr * 0.005);
    ctx.stroke();

    // Label
    if (sr > 40) {
      const fontSize = Math.max(9, Math.min(13, sr * 0.07));
      ctx.font = `${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `hsla(${node._hue}, 15%, 40%, .6)`;
      ctx.fillText(node._community.label, sx, sy);
    }
  }
}
