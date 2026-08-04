// tools.js — what the pointer does. One entry per tool: `down`, `move`, `up`,
// plus the options bar it wants.
//
// Two behaviours are shared by every tool and are worth stating once:
//
// * **The selection constrains painting.** A brush dab, an erase, a fill and a
//   mask stroke are all multiplied by the active selection, so "paint only
//   inside the lasso" needs no separate mode. That is the same mask the effect
//   stack uses — one idea, applied everywhere.
// * **A stroke is one undo step.** The tool pushes history once on `down` and
//   detaches the buffer once (`beginPixelEdit`), then mutates freely until
//   `up`. See history.js for why that rule is load-bearing.

import { clamp01, clampi, hexToRgb } from '../core/pixels.js';
import * as sel from '../core/select.js';
import { beginMaskEdit, beginPixelEdit, push } from '../core/history.js';

export const TOOLS = [
  { id: 'move', icon: '✥', label: 'move layer', key: 'v' },
  { id: 'marquee', icon: '▭', label: 'rectangular marquee', key: 'm' },
  { id: 'ellipse', icon: '◯', label: 'elliptical marquee', key: 'e' },
  { id: 'lasso', icon: '𝒮', label: 'lasso', key: 'l' },
  { id: 'poly', icon: '⬡', label: 'polygonal lasso', key: 'p' },
  { id: 'wand', icon: '✦', label: 'magic wand', key: 'w' },
  { sep: true },
  { id: 'brush', icon: '✎', label: 'brush', key: 'b' },
  { id: 'eraser', icon: '⌫', label: 'eraser', key: 'x' },
  { id: 'mask', icon: '◐', label: 'paint the layer mask', key: 'k' },
  { id: 'dropper', icon: '⊙', label: 'eyedropper', key: 'i' },
  { sep: true },
  { id: 'hand', icon: '✋', label: 'pan (or hold space)', key: 'h' },
  { id: 'zoom', icon: '⌕', label: 'zoom (or scroll)', key: 'z' },
];

/** Which options each tool shows. Data, so the bar builds itself. */
export const TOOL_OPTIONS = {
  marquee: ['combine'],
  ellipse: ['combine'],
  lasso: ['combine'],
  poly: ['combine'],
  wand: ['combine', 'tolerance', 'contiguous', 'sampleAll'],
  brush: ['size', 'soft', 'flow', 'color'],
  eraser: ['size', 'soft', 'flow'],
  mask: ['size', 'soft', 'flow', 'maskTo'],
  move: [],
  dropper: [],
  hand: [],
  zoom: [],
};

export const defaultOptions = () => ({
  combine: 'replace',
  tolerance: 0.12,
  contiguous: true,
  sampleAll: true,
  size: 40,
  soft: 0.5,
  flow: 1,
  color: '#f0a136',
  maskTo: 'reveal',
});

// ─────────────────────────────────────────────────────────── painting ──

/**
 * One dab. Coverage falls from 1 at the centre to 0 at the rim, with `soft`
 * setting where the falloff starts — smoothstep rather than linear, because a
 * linear edge leaves a visible ring where consecutive dabs overlap.
 */
export function stamp(px, W, H, x, y, radius, soft, rgb, flow, mode, selection) {
  const r = Math.max(0.5, radius);
  const inner = r * clamp01(soft);
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
  const [cr, cg, cb] = rgb;
  for (let py = y0; py <= y1; py++) {
    for (let pxx = x0; pxx <= x1; pxx++) {
      const d = Math.hypot(pxx + 0.5 - x, py + 0.5 - y);
      if (d > r) continue;
      let cov = d <= inner ? 1 : 1 - (d - inner) / (r - inner || 1e-6);
      cov = cov * cov * (3 - 2 * cov);
      const i = py * W + pxx;
      let a = cov * flow;
      if (selection) a *= selection[i];
      if (a <= 0) continue;
      const q = i * 4;
      if (mode === 'erase') {
        px[q + 3] = px[q + 3] * (1 - a);
        continue;
      }
      const ab = px[q + 3] / 255;
      const ao = a + ab * (1 - a);
      if (ao <= 0) { px[q + 3] = 0; continue; }
      px[q] = (a * cr + ab * (1 - a) * px[q]) / ao;
      px[q + 1] = (a * cg + ab * (1 - a) * px[q + 1]) / ao;
      px[q + 2] = (a * cb + ab * (1 - a) * px[q + 2]) / ao;
      px[q + 3] = ao * 255;
    }
  }
}

export function stampMask(mask, W, H, x, y, radius, soft, flow, target, selection) {
  const r = Math.max(0.5, radius);
  const inner = r * clamp01(soft);
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
  for (let py = y0; py <= y1; py++) {
    for (let pxx = x0; pxx <= x1; pxx++) {
      const d = Math.hypot(pxx + 0.5 - x, py + 0.5 - y);
      if (d > r) continue;
      let cov = d <= inner ? 1 : 1 - (d - inner) / (r - inner || 1e-6);
      cov = cov * cov * (3 - 2 * cov);
      const i = py * W + pxx;
      let a = cov * flow;
      if (selection) a *= selection[i];
      if (a <= 0) continue;
      mask[i] = mask[i] * (1 - a) + target * a;
    }
  }
}

/** Dabs along a segment at a fixed spacing — a stroke, not a string of blobs. */
export function stampLine(fn, x0, y0, x1, y1, spacing) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(dist / Math.max(0.5, spacing)));
  for (let i = 1; i <= n; i++) fn(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
}

// ──────────────────────────────────────────────────────── the handlers ──

/**
 * @param app the application object — `doc`, `view`, `opts`, `history`, and the
 *   callbacks (`commitSelection`, `render`, `refresh`, `status`).
 */
export function createTools(app) {
  let drag = null;

  const optSel = () => (app.doc.selection && !sel.isEmpty(app.doc.selection) ? app.doc.selection : null);
  const layer = () => app.doc.layers.find((l) => l.id === app.doc.active);

  function beginShape(kind, p, ev) {
    drag = {
      kind, x0: p.x, y0: p.y, x1: p.x, y1: p.y,
      pts: [[p.x, p.y]],
      combine: modeFor(ev, app.opts.combine),
    };
  }

  const modeFor = (ev, fallback) => {
    if (ev.shiftKey && ev.altKey) return 'intersect';
    if (ev.shiftKey) return 'add';
    if (ev.altKey) return 'subtract';
    return fallback;
  };

  function finishSelection(mask, mode) {
    app.commitSelection(sel.combine(app.doc.selection, mask, mode));
  }

  return {
    get drag() { return drag; },

    down(p, ev) {
      const t = app.tool;
      const d = app.doc;
      if (t === 'hand' || ev.button === 1 || app.spaceDown) {
        drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, px: app.view.panx, py: app.view.pany };
        return;
      }
      if (t === 'zoom') { app.zoomBy(ev.altKey ? 1 / 1.4 : 1.4, p.screen.x, p.screen.y); return; }

      if (t === 'marquee') { beginShape('rect', p, ev); return; }
      if (t === 'ellipse') { beginShape('ellipse', p, ev); return; }
      if (t === 'lasso') { beginShape('lasso', p, ev); return; }

      if (t === 'poly') {
        if (!drag || drag.kind !== 'poly') {
          drag = { kind: 'poly', pts: [[p.x, p.y]], combine: modeFor(ev, app.opts.combine), sticky: true };
        } else {
          const first = drag.pts[0];
          const close = drag.pts.length > 2 && Math.hypot(p.x - first[0], p.y - first[1]) * app.view.zoom < 10;
          if (close) {
            finishSelection(sel.polygon(d.W, d.H, drag.pts), drag.combine);
            drag = null;
          } else drag.pts.push([p.x, p.y]);
        }
        return;
      }

      if (t === 'wand') {
        const src = app.opts.sampleAll ? app.lastComposite : layer()?.pixels;
        if (!src) return;
        const m = sel.wand(src, d.W, d.H, p.x, p.y, {
          tolerance: app.opts.tolerance,
          contiguous: app.opts.contiguous,
          softness: 0.35,
        });
        finishSelection(m, modeFor(ev, app.opts.combine));
        return;
      }

      if (t === 'dropper') {
        const src = app.lastComposite;
        if (!src) return;
        const q = (clampi(Math.floor(p.y), d.H) * d.W + clampi(Math.floor(p.x), d.W)) * 4;
        const hex = `#${[src[q], src[q + 1], src[q + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        app.setOption('color', hex);
        app.status(`picked ${hex}`);
        return;
      }

      if (t === 'move') {
        const l = layer();
        if (!l || l.locked) return;
        push(app.history, d, 'move layer');
        drag = { kind: 'move', sx: p.x, sy: p.y, ox: l.transform.x, oy: l.transform.y, layer: l };
        return;
      }

      if (t === 'brush' || t === 'eraser' || t === 'mask') {
        const l = layer();
        if (!l) return;
        if (t === 'mask' && !l.mask) { app.status('this layer has no mask — layer ▸ add layer mask'); return; }
        if (l.locked) { app.status('layer is locked'); return; }
        if (l.kind !== 'raster' && t !== 'mask') { app.status('an adjustment layer has no pixels to paint'); return; }
        push(app.history, d, t === 'mask' ? 'paint mask' : t);
        if (t === 'mask') beginMaskEdit(l); else beginPixelEdit(l);
        app.markDirty(l.id, t === 'mask' ? 'mask' : 'pixels');
        drag = { kind: 'paint', tool: t, layer: l, lx: p.x, ly: p.y, invert: ev.altKey };
        paintDab(drag, p.x, p.y);
        app.render();
      }
    },

    move(p, ev) {
      if (!drag) return false;
      if (drag.kind === 'pan') {
        app.view.panx = drag.px + (ev.clientX - drag.sx);
        app.view.pany = drag.py + (ev.clientY - drag.sy);
        return true;
      }
      if (drag.kind === 'move') {
        let dx = p.x - drag.sx, dy = p.y - drag.sy;
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        drag.layer.transform.x = Math.round(drag.ox + dx);
        drag.layer.transform.y = Math.round(drag.oy + dy);
        app.render();
        return true;
      }
      if (drag.kind === 'paint') {
        stampLine((x, y) => paintDab(drag, x, y), drag.lx, drag.ly, p.x, p.y, Math.max(1, app.opts.size * 0.12));
        drag.lx = p.x; drag.ly = p.y;
        app.render();
        return true;
      }
      if (drag.kind === 'lasso') {
        const last = drag.pts[drag.pts.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) > 1.2) drag.pts.push([p.x, p.y]);
        return true;
      }
      drag.x1 = p.x; drag.y1 = p.y;
      return true;
    },

    up(p) {
      if (!drag) return;
      const d = app.doc;
      if (drag.kind === 'rect') {
        finishSelection(sel.rect(d.W, d.H, drag.x0, drag.y0, drag.x1, drag.y1), drag.combine);
      } else if (drag.kind === 'ellipse') {
        finishSelection(sel.ellipse(d.W, d.H, drag.x0, drag.y0, drag.x1, drag.y1), drag.combine);
      } else if (drag.kind === 'lasso') {
        if (drag.pts.length > 2) finishSelection(sel.polygon(d.W, d.H, drag.pts), drag.combine);
      } else if (drag.kind === 'paint') {
        app.markDirty(drag.layer.id, drag.tool === 'mask' ? 'mask' : 'pixels');
        app.render();
      }
      if (drag.kind !== 'poly') drag = null;
      app.refresh();
    },

    /** Escape / Enter, and the polygonal lasso's close-on-enter. */
    key(ev) {
      if (!drag) return false;
      if (ev.key === 'Escape') { drag = null; return true; }
      if (ev.key === 'Enter' && drag.kind === 'poly' && drag.pts.length > 2) {
        finishSelection(sel.polygon(app.doc.W, app.doc.H, drag.pts), drag.combine);
        drag = null;
        return true;
      }
      return false;
    },

    /** What the overlay should draw for the gesture in progress. */
    preview(cursor) {
      if (!drag) return null;
      if (drag.kind === 'rect') return { kind: 'rect', x0: drag.x0, y0: drag.y0, x1: drag.x1, y1: drag.y1 };
      if (drag.kind === 'ellipse') return { kind: 'ellipse', x0: drag.x0, y0: drag.y0, x1: drag.x1, y1: drag.y1 };
      if (drag.kind === 'lasso') return { kind: 'path', pts: drag.pts, close: true };
      if (drag.kind === 'poly') return { kind: 'path', pts: cursor ? [...drag.pts, [cursor.x, cursor.y]] : drag.pts, close: false };
      return null;
    },
  };

  function paintDab(state, x, y) {
    const o = app.opts;
    const s = optSel();
    if (state.tool === 'mask') {
      const reveal = o.maskTo === 'reveal' ? 1 : 0;
      const target = state.invert ? 1 - reveal : reveal;
      stampMask(state.layer.mask, app.doc.W, app.doc.H, x, y, o.size / 2, 1 - o.soft, o.flow, target, s);
    } else {
      stamp(state.layer.pixels, app.doc.W, app.doc.H, x, y, o.size / 2, 1 - o.soft,
        hexToRgb(o.color), o.flow, state.tool === 'eraser' ? 'erase' : 'paint', s);
    }
  }
}
