// gesture.js — moving the view. Pure: no DOM, no events, no canvas.
//
// The web is one canvas that can be bigger than any screen, so getting around
// it is not a nicety. On a desktop that is a wheel; on a phone it is two
// fingers, and bloom shipped with only the first — the whole tool was
// pan-only on the device it was designed to be panned with a thumb on.
//
// EVERY ZOOM IS ANCHORED
// ----------------------
// A zoom that scales about the origin makes whatever you were looking at fly
// off the screen, and on a fan four rings deep that means losing your place.
// `zoomAround` keeps one screen point pinned to the world point under it —
// the cursor, or the midpoint between two fingers. It is the same three lines
// either way, which is exactly why they live here rather than being written
// twice and drifting.
//
// PINCH IS INCREMENTAL, NOT ABSOLUTE
// ----------------------------------
// Each move compares against the *previous* move rather than the start of the
// gesture. That costs nothing in accuracy at this scale and buys the thing
// that matters: a finger lifting or landing mid-gesture just re-anchors, so
// going from two fingers to one continues as a pan instead of snapping the
// view to wherever the pair happened to start.

/** Below this the fan is a smear; above it a tile is bigger than a phone. */
export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 3;

/** Movement under this is a tap, not a drag. Fingers are not styluses. */
export const TAP_SLOP = 8;

export const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Screen → world. `cx, cy` is the canvas centre in the same coordinates as
 * `sx, sy`; passing the centre rather than the rect keeps this arithmetic and
 * lets the caller decide what "screen" means.
 */
export const toWorld = (view, sx, sy, cx, cy) => [
  (sx - cx) / view.zoom + view.x,
  (sy - cy) / view.zoom + view.y,
];

/**
 * Zoom so the world point currently under `(sx, sy)` stays under it.
 *
 * Returns a new view; nothing is mutated, because the caller usually wants to
 * chain this with a pan and reasoning about half-applied state is how anchored
 * zoom goes subtly wrong.
 */
export function zoomAround(view, sx, sy, cx, cy, nextZoom) {
  const [wx, wy] = toWorld(view, sx, sy, cx, cy);
  const zoom = clampZoom(nextZoom);
  return {
    zoom,
    x: wx - (wx - view.x) * (view.zoom / zoom),
    y: wy - (wy - view.y) * (view.zoom / zoom),
  };
}

/** Drag the world under the pointer: `d` screen pixels move `d / zoom` world. */
export const panBy = (view, dx, dy) => ({
  ...view,
  x: view.x - dx / view.zoom,
  y: view.y - dy / view.zoom,
});

/**
 * The two numbers a pinch is made of: how far apart the fingers are, and where
 * between them the gesture is centred.
 *
 * `dist` is floored at 1 — two fingers can land on the same pixel, and a zoom
 * factor of `now/0` is `Infinity`, which clamps to MAX_ZOOM and looks like the
 * view exploding for no reason.
 */
export function pinchOf(a, b) {
  return {
    dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    mx: (a.x + b.x) / 2,
    my: (a.y + b.y) / 2,
  };
}

/**
 * One step of a two-finger gesture.
 *
 * Zoom by however the separation changed, anchored at the midpoint — then pan
 * by however the midpoint itself moved. Both at once is what makes a pinch feel
 * like holding the picture rather than operating a control: you can spread two
 * fingers and slide them at the same time and the thing under them stays under
 * them.
 *
 * The pan is divided by the *new* zoom, because by then that is what a screen
 * pixel is worth.
 */
export function pinchStep(view, prev, now, cx, cy) {
  const zoomed = zoomAround(view, now.mx, now.my, cx, cy, view.zoom * (now.dist / prev.dist));
  return panBy(zoomed, now.mx - prev.mx, now.my - prev.my);
}

/**
 * One wheel notch. Exponential in the delta so a trackpad's small continuous
 * deltas and a mouse wheel's coarse ones both feel proportional, and the same
 * gesture zooms by the same factor wherever you already are.
 */
export function wheelStep(view, sx, sy, cx, cy, deltaY) {
  return zoomAround(view, sx, sy, cx, cy, view.zoom * Math.exp(-deltaY * 0.0015));
}

/**
 * Fit a box to a viewport, centred, never magnifying past 1:1.
 *
 * A first ring blown up to fill a desktop looks like an error rather than a
 * fan, so this only ever shrinks — and it is also the way back when a pinch
 * has taken someone somewhere they cannot find anything.
 */
export function fitView(box, cssW, cssH) {
  return {
    x: box.x + box.w / 2,
    y: box.y + box.h / 2,
    zoom: clampZoom(Math.min(1, cssW / box.w, cssH / box.h)),
  };
}
