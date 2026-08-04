// scale.js — which parameters are measured in PIXELS, and what to do about it.
//
// THE BUG THIS EXISTS FOR
// -----------------------
// A blur radius of 20 is 12% of a 168px thumbnail and 0.8% of a 2400px
// photograph. Shop is explicit that this is why it has no proxy resolution: a
// half-size preview is a different picture, so it composites at document size
// and what you see is what leaves.
//
// `/bloom` cannot do that. Two hundred variations at 2400px is not a slow
// feature but an impossible one, so it renders at 168px — and every effect
// whose parameters are lengths came out **exaggerated**, sometimes wildly.
// You picked a tile because of how hard the halftone hit, opened it in shop,
// and got something much gentler. The web was not previewing the editor; it
// was previewing a different, smaller picture.
//
// THE FIX, AND WHY IT IS THIS WAY ROUND
// -------------------------------------
// The recipe is authored at the **document's real resolution** and the preview
// is rendered at 1/k. Not the other way round.
//
// Scaling *up* on the way out was the obvious move and it is worse: the schema
// ranges are calibrated for full-size pictures, so a thumbnail-appropriate
// halftone cell of 6 multiplied by 14 is 84 against a maximum of 40, and the
// correction silently clamps for exactly the values that needed it most.
// Dividing *down* for the preview can only ever land inside the range, and
// where it bottoms out the cost is a preview that under-sells its own effect —
// which the render-time re-roll already catches, because a preview that
// under-sells all the way to nothing is a dead branch.
//
// WHICH PARAMETERS, AND HOW WE KNOW
// ---------------------------------
// Read out of the effects' own source, and then *measured*: a pixel parameter
// is one where doubling the value cancels doubling the resolution. That is a
// two-sided test — the scaled render matches and the plain one does not — and
// `shop.selftest.mjs` runs it over this whole table, so an effect whose units
// change stops matching its entry here rather than quietly mis-scaling.
//
// Deliberately NOT here, each for a reason:
//
//   cut:glass `pieces`        a COUNT. Nine hundred pieces is nine hundred
//                             pieces at any size; that is the tool's promise.
//   cut:mosaic `bands`        likewise.
//   lens:* `radius`, vignette normalised to the frame, so already invariant.
//   filter:edges `gain`       genuinely scale-dependent (gradients are steeper
//                             per pixel on a small image) but it is a contrast
//                             multiplier, not a length. Scaling a gain by 14
//                             does not mean what scaling a radius by 14 means.

/** Effect id → the parameters of it that are lengths in pixels. */
export const PIXEL_PARAMS = {
  'filter:blur': ['radius'],
  'filter:sharpen': ['radius'],
  'filter:clarity': ['radius'],
  'filter:shadows': ['radius'],
  'filter:median': ['radius'],
  'filter:kuwahara': ['radius'],
  'filter:pixelate': ['size'],
  'filter:halftone': ['cell'],
  'filter:grain': ['size'],
  'filter:bloom': ['radius'],
  'filter:aberration': ['offset', 'lateral'],
  'glitch:slice': ['shift'],
  'glitch:shift': ['spread'],
  'glitch:sort': ['maxRun'],
  'glitch:echo': ['delay'],
  'glitch:vhs': ['chromaLag'],
  'glitch:mosh': ['block'],
};

export const isPixelParam = (id, key) => (PIXEL_PARAMS[id] || []).includes(key);

/** Every pixel parameter in the registry, as `id.key` — for the selftest. */
export const pixelParamList = () =>
  Object.entries(PIXEL_PARAMS).flatMap(([id, keys]) => keys.map((k) => `${id}.${k}`));

const clampTo = (v, spec) => {
  if (!spec) return v;
  const lo = spec.min ?? -Infinity;
  const hi = spec.max ?? Infinity;
  const step = spec.step || 0.001;
  return Math.min(hi, Math.max(lo, +(Math.round(v / step) * step).toFixed(6)));
};

/**
 * The same stack, read at a different resolution.
 *
 * `k` is the ratio of the size you are rendering at to the size the stack was
 * written for — 168/2400 for a bloom thumbnail. Only lengths move; everything
 * else is a proportion, an angle, a count or a colour and would be wrong to
 * touch.
 *
 * Values are clamped to their own schema, so a radius that scales below its
 * minimum lands on the minimum rather than becoming a negative that some
 * effect will read as an array length. Nothing is mutated: the caller is
 * usually holding the authoritative stack and must keep holding it.
 */
export function scaleStack(stack, k, effects) {
  if (!Array.isArray(stack) || k === 1) return stack;
  return stack.map((entry) => {
    const keys = PIXEL_PARAMS[entry.fx];
    if (!keys) return entry;
    const params = { ...entry.params };
    const specs = effects?.[entry.fx]?.params || {};
    for (const key of keys) {
      if (typeof params[key] === 'number') params[key] = clampTo(params[key] * k, specs[key]);
    }
    return { ...entry, params };
  });
}

/**
 * How much smaller a preview is than the picture it is previewing.
 *
 * Both sides measured on the long edge, because that is what an import cap is
 * measured on. Guarded against a zero so a caller that has not loaded a picture
 * yet gets 1 (no scaling) rather than a NaN that would poison every parameter.
 */
export const previewScale = (previewLong, documentLong) =>
  (previewLong > 0 && documentLong > 0 ? previewLong / documentLong : 1);
