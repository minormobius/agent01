import type { Camera, PostDot, LayoutNode } from '../../api/types';
import { w2s } from '../camera';

/**
 * Draw posts. Each post IS its author's face — PFP fills the entire circle.
 * Community color shows as a ring around the PFP.
 * Thread depth shown as concentric rings radiating out.
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

    const hue = dot._hue;
    const mag = dot._magnitude;
    const t = Math.min(1, mag / 30);

    // ── Community-colored ring (always visible) ─────────────────
    const ringWidth = Math.max(1.5, sr * 0.12);
    const ringR = sr + ringWidth / 2;

    // Core members get brighter, thicker rings
    const shell = dot._post.authorShell;
    const ringSat = shell === 0 ? 60 : shell <= 1 ? 45 : 25;
    const ringLum = shell === 0 ? 55 : shell <= 1 ? 40 : 30;
    const ringAlpha = shell === 0 ? 0.9 : shell <= 1 ? 0.7 : 0.4;

    ctx.beginPath();
    ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, ${ringSat}%, ${ringLum}%, ${ringAlpha})`;
    ctx.lineWidth = shell === 0 ? ringWidth * 1.3 : ringWidth;
    ctx.stroke();

    // ── PFP fills the entire circle ─────────────────────────────
    const img = avatarImages.get(dot._post.authorDid);
    if (img && sr > 3) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, sx - sr, sy - sr, sr * 2, sr * 2);
      ctx.restore();
    } else {
      // Fallback: colored circle with initial
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 25%, 22%, 0.85)`;
      ctx.fill();

      if (sr > 6) {
        const initial = (dot._post.authorHandle || '?')[0].toUpperCase();
        ctx.font = `bold ${Math.round(sr * 0.7)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `hsla(${hue}, 30%, 55%, 0.9)`;
        ctx.fillText(initial, sx, sy);
      }
    }

    // ── Glow for high-magnitude posts ───────────────────────────
    if (mag > 5 && sr > 5) {
      const glowR = sr * 2.2;
      const grad = ctx.createRadialGradient(sx, sy, sr, sx, sy, glowR);
      grad.addColorStop(0, `hsla(${hue}, ${ringSat}%, ${ringLum}%, ${t * 0.2})`);
      grad.addColorStop(1, `hsla(${hue}, ${ringSat}%, ${ringLum}%, 0)`);
      ctx.beginPath();
      ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // ── Thread depth rings ──────────────────────────────────────
    const depth = dot._post.threadDepth;
    if (depth > 1 && sr > 6) {
      const rings = Math.min(depth, 8);
      for (let d = 0; d < rings; d++) {
        const depthR = ringR + ringWidth + 1 + d * 2.5;
        const depthAlpha = 0.2 - d * 0.02;
        if (depthAlpha <= 0.02) break;
        ctx.beginPath();
        ctx.arc(sx, sy, depthR, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue}, ${ringSat}%, ${ringLum}%, ${depthAlpha})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // ── Labels at moderate zoom ─────────────────────────────────
    if (sr > 14) {
      const fontSize = Math.max(8, Math.min(11, sr * 0.22));
      ctx.font = `${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const labelY = sy + sr + ringWidth + 3;

      // Author handle
      ctx.fillStyle = `hsla(210, 40%, 70%, 0.8)`;
      ctx.fillText(`@${dot._post.authorHandle}`, sx, labelY);

      // Stats
      const statsY = labelY + fontSize + 2;
      const p = dot._post;
      const depthLabel = p.threadDepth > 0 ? ` d${p.threadDepth}` : '';
      const shellLabel = p.authorShell === 0 ? ' \u2605' : ''; // star for core
      ctx.fillStyle = `hsla(0, 0%, 50%, 0.6)`;
      ctx.fillText(`${p.replyCount}r ${p.likeCount}\u2665${depthLabel}${shellLabel}`, sx, statsY);
    }

    // ── Text snippet at deep zoom ───────────────────────────────
    if (sr > 35) {
      const snippetY = sy - sr - ringWidth - 6;
      const maxChars = Math.min(60, Math.floor(sr * 0.8));
      const snippet = dot._post.text.slice(0, maxChars).replace(/\n/g, ' ');
      const fontSize = Math.max(8, Math.min(10, sr * 0.15));
      ctx.font = `${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = `hsla(0, 0%, 70%, 0.6)`;
      ctx.fillText(snippet + (dot._post.text.length > maxChars ? '\u2026' : ''), sx, snippetY);
    }

    // ── Hover / selection ───────────────────────────────────────
    if (dot === hovered && dot !== selected) {
      ctx.strokeStyle = `hsla(${hue}, 60%, 65%, .8)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, sr + ringWidth + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (dot === selected) {
      ctx.strokeStyle = '#f92';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(sx, sy, sr + ringWidth + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
