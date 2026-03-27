import type { Camera, PostDot, LayoutNode, ThreadDepth } from '../../api/types';
import { w2s } from '../camera';

/**
 * Draw posts as the PRIMARY visual elements.
 * Big circles with author PFP + text snippet at zoom.
 */
export function drawPosts(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cam: Camera,
  postDots: PostDot[],
  threadCache: Record<string, ThreadDepth>,
  avatarImages: Map<string, HTMLImageElement | null>,
  selected: LayoutNode | null,
  hovered: LayoutNode | null
) {
  for (const dot of postDots) {
    const [sx, sy] = w2s(cam, W, H, dot._x, dot._y);
    const sr = dot._r * cam.scale;

    if (sx + sr < -10 || sx - sr > W + 10) continue;
    if (sy + sr < -10 || sy - sr > H + 10) continue;
    if (sr < 3) continue;

    const mag = dot._magnitude;
    const t = Math.min(1, mag / 50);
    const hue = dot._hue;
    const sat = 35 + t * 35;
    const lum = 25 + t * 25;
    const alpha = 0.6 + t * 0.3;

    // Glow for high-magnitude posts
    if (mag > 8 && sr > 5) {
      const glowR = sr * 2.5;
      const grad = ctx.createRadialGradient(sx, sy, sr * 0.3, sx, sy, glowR);
      grad.addColorStop(0, `hsla(${hue}, ${sat + 10}%, ${lum + 15}%, ${alpha * 0.35})`);
      grad.addColorStop(1, `hsla(${hue}, ${sat}%, ${lum}%, 0)`);
      ctx.beginPath();
      ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Main circle
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha})`;
    ctx.fill();

    // Ring — solid if thread data loaded, dashed if estimated
    const hasThread = dot._hasThreadData;
    ctx.strokeStyle = hasThread
      ? `hsla(${hue}, ${sat + 15}%, ${lum + 20}%, ${alpha + 0.1})`
      : `hsla(${hue}, 20%, 40%, 0.3)`;
    ctx.lineWidth = hasThread ? 2 : 1;
    ctx.stroke();

    // Author PFP inside circle (when circle is large enough)
    if (sr > 14) {
      const pfpR = Math.min(sr * 0.55, 20);
      const img = avatarImages.get(dot._post.authorDid);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, pfpR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, sx - pfpR, sy - pfpR, pfpR * 2, pfpR * 2);
        ctx.restore();
        // PFP border
        ctx.beginPath();
        ctx.arc(sx, sy, pfpR, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue}, 30%, 50%, 0.5)`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Thread depth indicator (ring segments for depth)
    const tc = threadCache[dot._post.uri];
    if (tc && tc.maxDepth > 1 && sr > 10) {
      const depthRings = Math.min(tc.maxDepth, 6);
      for (let d = 0; d < depthRings; d++) {
        const ringR = sr + 3 + d * 2.5;
        const arcAlpha = 0.3 - d * 0.04;
        if (arcAlpha <= 0) break;
        ctx.beginPath();
        ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lum + 10}%, ${arcAlpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Reply count + depth label
    if (sr > 18) {
      const labelY = sy + sr + 12;
      const fontSize = Math.max(8, Math.min(11, sr * 0.25));
      ctx.font = `${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const p = dot._post;
      const depth = tc ? `d${tc.maxDepth}` : '';
      const label = `${p.replyCount}r ${p.likeCount}♥ ${depth}`;
      ctx.fillStyle = `hsla(0, 0%, 55%, 0.7)`;
      ctx.fillText(label, sx, labelY);
    }

    // Hover / selection highlights
    if (dot === hovered && dot !== selected) {
      ctx.strokeStyle = `hsla(${hue}, 60%, 65%, .8)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, sr + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (dot === selected) {
      ctx.strokeStyle = '#f92';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(sx, sy, sr + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
