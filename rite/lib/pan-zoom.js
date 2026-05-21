// rite/lib/pan-zoom — shared SVG pan/zoom helper for the analytical surfaces.
//
// Manages a visible domain (xDomain / yDomain) and emits onChange whenever
// the user pans (click-drag, single-finger touch) or zooms (mouse wheel).
// The chart owns its own re-render — this helper does not touch the SVG's
// viewBox or transform; it tells the chart what range to render next. The
// chart stays in charge of axes, tick labels, and any data filtering that
// depends on the visible range.
//
// Usage:
//   const pz = makePanZoom(svgEl, {
//     xDomain: [tMin, tMax],          // current visible x range
//     yDomain: [yMin, yMax],          // optional; supply if y is pannable
//     xBounds: [tMin, tMax],          // hard limits (won't pan/zoom past)
//     yBounds: [yMin, yMax],
//     axes: 'x' | 'y' | 'xy',         // default 'xy'
//     onChange: ({ xDomain, yDomain }) => { state.zoom = ...; render(); },
//   });
//   pz.reset();                       // restore initial domains
//   pz.setDomain({ xDomain, yDomain }); // programmatic
//   pz.destroy();                     // detach listeners
//
// Listeners attach to svgEl itself (not its children), so replacing
// svgEl.innerHTML on re-render does NOT lose the listeners. Chart code
// can re-render freely.

const WHEEL_FACTOR_IN  = 1 / 1.18;
const WHEEL_FACTOR_OUT = 1.18;
const MIN_DOMAIN_RATIO = 1 / 200;   // can't zoom in past 1/200 of original span
const DRAG_THRESHOLD = 4;           // pixels; below this, treat as a click

export function makePanZoom(svgEl, opts = {}) {
  let xDomain = opts.xDomain ? [...opts.xDomain] : null;
  let yDomain = opts.yDomain ? [...opts.yDomain] : null;
  const initialX = xDomain ? [...xDomain] : null;
  const initialY = yDomain ? [...yDomain] : null;
  const xBounds = opts.xBounds ? [...opts.xBounds] : (initialX ? [...initialX] : null);
  const yBounds = opts.yBounds ? [...opts.yBounds] : (initialY ? [...initialY] : null);
  const axes = (opts.axes || 'xy').toLowerCase();
  const wantsX = axes.includes('x') && !!xDomain;
  const wantsY = axes.includes('y') && !!yDomain;
  const onChange = opts.onChange || (() => {});

  // Cursor / event coords → domain coords. Assumes the SVG fills its element
  // bounds linearly (true for preserveAspectRatio "none" or default
  // "xMidYMid meet" with our charts' aspect ratios).
  function eventToDomain(e) {
    const rect = svgEl.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return {
      x: wantsX ? xDomain[0] + fx * (xDomain[1] - xDomain[0]) : null,
      // SVG y is top-down; chart y is bottom-up — flip.
      y: wantsY ? yDomain[1] - fy * (yDomain[1] - yDomain[0]) : null,
    };
  }

  function clampDomain(domain, bounds, initial) {
    if (!bounds || !initial) return domain;
    const width = domain[1] - domain[0];
    const boundWidth = bounds[1] - bounds[0];
    const minWidth = boundWidth * MIN_DOMAIN_RATIO;
    if (width <= minWidth) return [domain[0], domain[0] + minWidth];
    if (width >= boundWidth) return [...bounds];
    let [lo, hi] = domain;
    if (lo < bounds[0]) { hi += bounds[0] - lo; lo = bounds[0]; }
    if (hi > bounds[1]) { lo -= hi - bounds[1]; hi = bounds[1]; }
    return [Math.max(bounds[0], lo), Math.min(bounds[1], hi)];
  }

  function zoomAt(domain, anchor, factor) {
    if (anchor == null) return domain;
    const alpha = (anchor - domain[0]) / (domain[1] - domain[0]);
    const newWidth = (domain[1] - domain[0]) * factor;
    return [anchor - alpha * newWidth, anchor + (1 - alpha) * newWidth];
  }

  let rafPending = false;
  function emit() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      onChange({
        xDomain: xDomain ? [...xDomain] : null,
        yDomain: yDomain ? [...yDomain] : null,
      });
    });
  }

  function onWheel(e) {
    if (!wantsX && !wantsY) return;
    e.preventDefault();
    const { x: ax, y: ay } = eventToDomain(e);
    const factor = e.deltaY > 0 ? WHEEL_FACTOR_OUT : WHEEL_FACTOR_IN;
    if (wantsX) xDomain = clampDomain(zoomAt(xDomain, ax, factor), xBounds, initialX);
    if (wantsY) yDomain = clampDomain(zoomAt(yDomain, ay, factor), yBounds, initialY);
    emit();
  }

  let dragging = null;
  let suppressNextClick = false;
  function onPointerDown(e) {
    if (e.button === 2) return;       // skip right-click
    dragging = {
      x: e.clientX, y: e.clientY,
      startX: e.clientX, startY: e.clientY,
      pointerId: e.pointerId,
      panned: false,
    };
    try { svgEl.setPointerCapture(e.pointerId); } catch {}
  }
  function onPointerMove(e) {
    if (!dragging) return;
    // Ignore tiny movements so a click without intent-to-drag still selects.
    if (!dragging.panned) {
      const totalDx = Math.abs(e.clientX - dragging.startX);
      const totalDy = Math.abs(e.clientY - dragging.startY);
      if (totalDx < DRAG_THRESHOLD && totalDy < DRAG_THRESHOLD) return;
      dragging.panned = true;
      svgEl.style.cursor = 'grabbing';
    }
    const rect = svgEl.getBoundingClientRect();
    const dxFrac = (e.clientX - dragging.x) / rect.width;
    const dyFrac = (e.clientY - dragging.y) / rect.height;
    dragging.x = e.clientX;
    dragging.y = e.clientY;
    if (wantsX) {
      const w = xDomain[1] - xDomain[0];
      xDomain = clampDomain([xDomain[0] - dxFrac * w, xDomain[1] - dxFrac * w], xBounds, initialX);
    }
    if (wantsY) {
      const h = yDomain[1] - yDomain[0];
      yDomain = clampDomain([yDomain[0] + dyFrac * h, yDomain[1] + dyFrac * h], yBounds, initialY);
    }
    emit();
  }
  function onPointerUp() {
    if (!dragging) return;
    try { svgEl.releasePointerCapture(dragging.pointerId); } catch {}
    // If the user actually panned, swallow the click event that fires next so
    // we don't accidentally select whatever was under the cursor at release.
    if (dragging.panned) suppressNextClick = true;
    dragging = null;
    svgEl.style.cursor = 'grab';
  }
  function onClickCapture(e) {
    if (suppressNextClick) {
      suppressNextClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }

  svgEl.addEventListener('wheel', onWheel, { passive: false });
  svgEl.addEventListener('pointerdown', onPointerDown);
  svgEl.addEventListener('pointermove', onPointerMove);
  svgEl.addEventListener('pointerup', onPointerUp);
  svgEl.addEventListener('pointercancel', onPointerUp);
  // Capture phase so suppress fires before chart-level click handlers.
  svgEl.addEventListener('click', onClickCapture, { capture: true });
  svgEl.style.touchAction = 'none';
  svgEl.style.cursor = 'grab';

  return {
    setDomain({ xDomain: x, yDomain: y } = {}) {
      if (x && wantsX) xDomain = clampDomain([...x], xBounds, initialX);
      if (y && wantsY) yDomain = clampDomain([...y], yBounds, initialY);
      emit();
    },
    reset() {
      if (initialX) xDomain = [...initialX];
      if (initialY) yDomain = [...initialY];
      emit();
    },
    getDomain() {
      return {
        xDomain: xDomain ? [...xDomain] : null,
        yDomain: yDomain ? [...yDomain] : null,
      };
    },
    destroy() {
      svgEl.removeEventListener('wheel', onWheel);
      svgEl.removeEventListener('pointerdown', onPointerDown);
      svgEl.removeEventListener('pointermove', onPointerMove);
      svgEl.removeEventListener('pointerup', onPointerUp);
      svgEl.removeEventListener('pointercancel', onPointerUp);
      svgEl.removeEventListener('click', onClickCapture, { capture: true });
    },
  };
}
