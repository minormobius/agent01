import type { Camera, PostDot, LayoutNode } from '../../api/types';
import { w2s } from '../camera';

/**
 * Draw posts as the PRIMARY (and only) visual elements.
 * Big circles colored by community, with author PFP, depth rings, and labels.
 */
export function drawPosts(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cam: Camera,
  postDots: PostDot[],
  avatarImages: Map<string, HTMLImageElement | null>,
  selected: LayoutNode | null,
  hovered: LayoutNode | null
) {
  for (const dot of postDots) {
    const [sx, sy] = w2s(cam, W, H, dot._x, dot._y);
    const sr = dot._r * cam.scale;

    if (sx + sr < -10 || sx - sr > W + 10) continue;
    if (sy + sr < -10 || sy - sr > H + 10) continue;
    if (sr < 2) continue;

    const mag = dot._magnitude;
    const t = Math.min(1, mag / 50);
    const hue = dot._hue;
    const sat = 30 + t * 40;
    const lum = 20 + t * 25;
    const alpha = 0.5 + t * 0.4;

    // Glow for high-magnitude posts
    if (mag > 5 && sr > 4) {
      const glowR = sr * 2.5;
      const grad = ctx.createRadialGradient(sx, sy, sr * 0.3, sx, sy, glowR);
      grad.addColorStop(0, `hsla(${hue}, ${sat + 10}%, ${lum + 15}%, ${alpha * 0.3})`);
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

    // Border ring
    ctx.strokeStyle = `hsla(${hue}, ${sat + 15}%, ${lum + 20}%, ${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Thread depth rings — concentric rings radiating out = deep thread
    const depth = dot._post.threadDepth;
    if (depth > 1 && sr > 8) {
      const rings = Math.min(depth, 8);
      for (let d = 0; d < rings; d++) {
        const ringR = sr + 3 + d * 2.5;
        const ringAlpha = 0.25 - d * 0.025;
        if (ringAlpha <= 0.02) break;
        ctx.beginPath();
        ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lum + 10}%, ${ringAlpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Author PFP inside circle
    if (sr > 12) {
      const pfpR = Math.min(sr * 0.55, 22);
      const img = avatarImages.get(dot._post.authorDid);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, pfpR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, sx - pfpR, sy - pfpR, pfpR * 2, pfpR * 2);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(sx, sy, pfpR, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue}, 30%, 50%, 0.4)`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Labels at moderate zoom
    if (sr > 16) {
      const fontSize = Math.max(8, Math.min(11, sr * 0.22));
      ctx.font = `${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Author handle
      const handleY = sy + sr + 4;
      ctx.fillStyle = `hsla(210, 40%, 70%, 0.8)`;
      ctx.fillText(`@${dot._post.authorHandle}`, sx, handleY);

      // Stats line
      const statsY = handleY + fontSize + 2;
      const p = dot._post;
      const depthLabel = p.threadDepth > 0 ? ` d${p.threadDepth}` : '';
      ctx.fillStyle = `hsla(0, 0%, 50%, 0.6)`;
      ctx.fillText(`${p.replyCount}r ${p.likeCount}\u2665${depthLabel}`, sx, statsY);

      // Community label at deeper zoom
      if (sr > 30 && p.primaryCommunityLabel) {
        const comY = statsY + fontSize + 2;
        ctx.fillStyle = `hsla(${hue}, 30%, 45%, 0.5)`;
        ctx.fillText(p.primaryCommunityLabel, sx, comY);
      }
    }

    // Text snippet at deep zoom
    if (sr > 40) {
      const snippetY = sy - sr - 10;
      const maxChars = Math.min(60, Math.floor(sr * 0.8));
      const snippet = dot._post.text.slice(0, maxChars).replace(/\n/g, ' ');
      const fontSize = Math.max(8, Math.min(10, sr * 0.15));
      ctx.font = `${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = `hsla(0, 0%, 70%, 0.6)`;
      ctx.fillText(snippet + (dot._post.text.length > maxChars ? '\u2026' : ''), sx, snippetY);
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
