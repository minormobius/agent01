// view.js — the viewport: document coordinates in, screen pixels out, and the
// overlay that draws everything which is not the picture.
//
// The composite lands in an offscreen canvas at document resolution and is
// scaled by `drawImage`, so panning and zooming never re-composite — they only
// re-blit. That is the difference between a zoom that tracks the pointer and
// one that waits for a full render of a 4-megapixel stack.
//
// Above 100% the picture is drawn with smoothing off, because at that point you
// are looking at pixels and want to see them; below 100% smoothing is on, or
// every downscale would alias into a mess of moiré.

import { contours } from '../core/select.js';

export function createView(canvas, overlay) {
  const ctx = canvas.getContext('2d');
  const octx = overlay.getContext('2d');
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d', { willReadFrequently: false });

  return {
    canvas, overlay, ctx, octx, off, offCtx,
    zoom: 1, panx: 0, pany: 0, dpr: 1,
    W: 1, H: 1,
    antPhase: 0,
    cachedSelection: null,
    cachedContours: null,
  };
}

/** Resize the backing stores to the element's box, at device resolution. */
export function fitCanvas(view, el) {
  const r = el.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  view.dpr = dpr;
  for (const c of [view.canvas, view.overlay]) {
    c.style.width = `${r.width}px`;
    c.style.height = `${r.height}px`;
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
  }
  view.cssW = r.width;
  view.cssH = r.height;
}

export function setFrame(view, px, W, H) {
  if (view.off.width !== W || view.off.height !== H) {
    view.off.width = W; view.off.height = H;
  }
  view.W = W; view.H = H;
  view.offCtx.putImageData(new ImageData(px, W, H), 0, 0);
}

/**
 * Tell the view how big the document is, before any frame has arrived.
 * `setFrame` also does this, but `zoomToFit` runs first — at document-open and
 * after a crop — and fitting to the *previous* size is how a freshly opened
 * picture lands at 800% in the corner.
 */
export function setDocSize(view, W, H) {
  view.W = W; view.H = H;
}

/** Centre the document and pick the zoom that shows all of it. */
export function zoomToFit(view, pad = 40) {
  const k = Math.min((view.cssW - pad) / view.W, (view.cssH - pad) / view.H);
  view.zoom = Math.max(0.02, Math.min(8, k));
  view.panx = (view.cssW - view.W * view.zoom) / 2;
  view.pany = (view.cssH - view.H * view.zoom) / 2;
}

/** Zoom about a screen point, so the document pixel under the cursor stays put. */
export function zoomAt(view, factor, sx, sy) {
  const before = toDoc(view, sx, sy);
  view.zoom = Math.max(0.02, Math.min(32, view.zoom * factor));
  const after = toDoc(view, sx, sy);
  view.panx += (after.x - before.x) * view.zoom;
  view.pany += (after.y - before.y) * view.zoom;
}

export const toDoc = (view, sx, sy) => ({
  x: (sx - view.panx) / view.zoom,
  y: (sy - view.pany) / view.zoom,
});

export const toScreen = (view, x, y) => ({
  x: x * view.zoom + view.panx,
  y: y * view.zoom + view.pany,
});

export function drawPicture(view) {
  const { ctx, dpr } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, view.cssW, view.cssH);
  ctx.imageSmoothingEnabled = view.zoom < 1;
  ctx.imageSmoothingQuality = 'high';
  // the document's own transparency checker, so it reads as document rather
  // than as stage
  ctx.save();
  ctx.translate(view.panx, view.pany);
  ctx.scale(view.zoom, view.zoom);
  ctx.drawImage(view.off, 0, 0);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(view.panx - 0.5, view.pany - 0.5, view.W * view.zoom + 1, view.H * view.zoom + 1);
}

/**
 * Everything that is not the picture: the selection's marching ants, the shape
 * being dragged, the brush footprint, the moved layer's frame.
 *
 * The ants are the real 0.5 contour of the mask (marching squares), not a
 * traced bitmap — feathering a selection then changes its *softness* without
 * the outline jumping a pixel, which is what you would see if the outline came
 * from a threshold.
 */
export function drawOverlay(view, {
  selection = null, W = 0, H = 0, shape = null, brush = null, frame = null, ants = true,
} = {}) {
  const { octx, dpr } = view;
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, view.cssW, view.cssH);

  if (selection) {
    if (view.cachedSelection !== selection) {
      view.cachedSelection = selection;
      view.cachedContours = contours(selection, W, H, 0.5);
    }
    const segs = view.cachedContours;
    octx.save();
    octx.translate(view.panx, view.pany);
    octx.scale(view.zoom, view.zoom);
    octx.lineWidth = 1 / view.zoom;
    octx.beginPath();
    for (const [a, b] of segs) { octx.moveTo(a[0], a[1]); octx.lineTo(b[0], b[1]); }
    octx.strokeStyle = '#000';
    octx.setLineDash([]);
    octx.stroke();
    octx.strokeStyle = '#fff';
    if (ants) {
      octx.setLineDash([4 / view.zoom, 4 / view.zoom]);
      octx.lineDashOffset = -view.antPhase / view.zoom;
    }
    octx.stroke();
    octx.setLineDash([]);
    octx.restore();
  }

  if (shape) {
    octx.save();
    octx.strokeStyle = '#f0a136';
    octx.lineWidth = 1;
    octx.setLineDash([5, 4]);
    octx.beginPath();
    if (shape.kind === 'rect') {
      const a = toScreen(view, shape.x0, shape.y0), b = toScreen(view, shape.x1, shape.y1);
      octx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    } else if (shape.kind === 'ellipse') {
      const a = toScreen(view, shape.x0, shape.y0), b = toScreen(view, shape.x1, shape.y1);
      octx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    } else if (shape.kind === 'path' && shape.pts.length) {
      const p0 = toScreen(view, shape.pts[0][0], shape.pts[0][1]);
      octx.moveTo(p0.x, p0.y);
      for (const p of shape.pts.slice(1)) { const s = toScreen(view, p[0], p[1]); octx.lineTo(s.x, s.y); }
      if (shape.close) octx.closePath();
    }
    octx.stroke();
    octx.setLineDash([]);
    octx.restore();
  }

  if (brush) {
    const c = toScreen(view, brush.x, brush.y);
    const r = brush.radius * view.zoom;
    octx.save();
    octx.strokeStyle = 'rgba(0,0,0,0.85)';
    octx.lineWidth = 3;
    octx.beginPath(); octx.arc(c.x, c.y, r, 0, Math.PI * 2); octx.stroke();
    octx.strokeStyle = '#fff';
    octx.lineWidth = 1;
    octx.beginPath(); octx.arc(c.x, c.y, r, 0, Math.PI * 2); octx.stroke();
    if (brush.soft < 1) {
      octx.setLineDash([3, 3]);
      octx.strokeStyle = 'rgba(255,255,255,0.5)';
      octx.beginPath(); octx.arc(c.x, c.y, r * brush.soft, 0, Math.PI * 2); octx.stroke();
      octx.setLineDash([]);
    }
    octx.restore();
  }

  if (frame) {
    const a = toScreen(view, frame.x0, frame.y0), b = toScreen(view, frame.x1, frame.y1);
    octx.save();
    octx.strokeStyle = '#35c4b5';
    octx.lineWidth = 1;
    octx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    octx.fillStyle = '#35c4b5';
    for (const [px, py] of [[a.x, a.y], [b.x, a.y], [a.x, b.y], [b.x, b.y]]) {
      octx.fillRect(px - 3, py - 3, 6, 6);
    }
    octx.restore();
  }
}
