// pipeline.js — one stack runner that both the worker and the main-thread
// fallback use, so there is exactly one definition of what a recipe means.
//
// glitch.js's `render()` is the pure, synchronous version (and the one the
// selftest pins down). This is the same loop with `await` in it, because the
// codec-native operators have to go out to a real encoder and come back.

import {
  OPS, seedOf, seedFor, fieldFor, blend, defaults, applyLayer,
} from './glitch.js';
import './codec.js';           // side effect: registers the jpeg databender

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

export async function renderAsync(rgba, W, H, recipe, { paint = null, onStep = null } = {}) {
  const N = W * H;
  const cur = new Uint8ClampedArray(rgba);
  const scratch = new Uint8ClampedArray(N * 4);
  const base = seedOf(recipe.seed ?? 'glitch');
  const log = [];

  const ops = recipe.ops || [];
  for (let index = 0; index < ops.length; index++) {
    const layer = ops[index];
    const spec = OPS[layer.op];
    if (!spec) continue;
    if (!layer.on) { log.push({ op: layer.op, ms: 0, off: true }); continue; }

    const seed = seedFor(base, index, layer.seed);
    const t0 = now();

    if (spec.async) {
      const mask = fieldFor(layer, cur, W, H, seed, paint);
      const P = { ...defaults(layer.op), ...layer.params };
      const res = await spec.run(cur, W, H, P, { seed, mask, index });
      if (res.rgba) blend(cur, res.rgba, mask, layer.amount ?? 1, N);
      log.push({ op: layer.op, ms: now() - t0, note: res.note, failed: !res.rgba });
    } else {
      applyLayer(cur, W, H, layer, seed, paint, scratch);
      log.push({ op: layer.op, ms: now() - t0 });
    }
    if (onStep) onStep(index, layer.op);
  }

  return { rgba: cur, width: W, height: H, log };
}
