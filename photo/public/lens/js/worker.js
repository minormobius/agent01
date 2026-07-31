// The warp is a few hundred milliseconds of transcendentals per layer, and the
// bench should stay draggable while it runs. The mip pyramid is built once and
// kept here, so only the recipe crosses on each render.

import { buildMips, render } from './conformal.js';

let mips = null;

self.onmessage = (e) => {
  const { type } = e.data;

  if (type === 'photo') {
    const { rgba, W, H } = e.data;
    mips = buildMips(new Uint8ClampedArray(rgba), W, H);
    self.postMessage({ ok: true, type: 'photo', levels: mips.length });
    return;
  }

  const { recipe, W, H, token, step } = e.data;
  try {
    if (!mips) throw new Error('no photograph loaded yet');
    const r = render(mips[0].data, mips[0].W, mips[0].H, W, H, recipe, { mips, step });
    self.postMessage({
      ok: true, type: 'render', token,
      rgba: r.rgba, width: W, height: H,
      field: r.field, scale: r.scale, unit: r.unit,
      K: r.K, flip: r.flip, reliable: r.reliable, cw: r.cw, ch: r.ch, mstep: r.step,
      stats: r.stats,
    }, [r.rgba.buffer, r.field.buffer, r.scale.buffer, r.K.buffer, r.flip.buffer, r.reliable.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, type: 'render', token, error: String((err && err.message) || err) });
  }
};
