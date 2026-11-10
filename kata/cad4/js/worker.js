/* CAD⁴'s numbers, off the page's thread. One request at a time; the page kills and restarts this worker rather than
   wait for a fine measure it no longer wants. */
import { compile, measure, slice, fit } from "./kernel.js";
/* where the parts are along the direction you can't see: each part's cross-section volume at N offsets along it */
let cost = 0;
function profile(shape, C, E, N4, R, N = 24) {
  const t0 = performance.now(), ok = (b) => b.lo.every((v) => Math.abs(v) < 1e8) && b.hi.every((v) => Math.abs(v) < 1e8);
  const out = shape.parts.map((part) => { const q = ok(part.bbox) && part.dim === 4 ? part : { ...part, bbox: shape.bbox }, v = []; for (let k = 0; k < N; k++) { const o = -R + (2 * R * (k + 0.5)) / N; v.push(measure(slice(q, C.map((c, i) => c + o * N4[i]), E), 12, 2).volume); } return v; });
  cost = performance.now() - t0; return out;
}
self.onmessage = (ev) => {
  const { id, tree, vals, mode, O, E, C, N4, R } = ev.data;
  try {
    const shape = compile(tree, vals), out = { id, mode };
    const cut = () => { if (shape.dim === 4) { const m = measure(slice(shape, O, E), 56, 2); out.slice = { volume: m.volume, area: m.boundary }; out.profile = profile(shape, C, E, N4, R); } };
    if (mode === "fit") (out.fit = (tree.check || []).map(([a, b]) => ({ a, b, ...fit(tree, a, b, vals, 16) })), shape.dim === 4 && cost < 90 && (out.profile = profile(shape, C, E, N4, R)));
    else if (mode === "slice") cut();
    else if (mode === "quick") { out.fit = (tree.check || []).map(([a, b]) => ({ a, b, ...fit(tree, a, b, vals) })); out.measure = measure(shape, [0, 1000, 160, 40, 14][shape.dim], 2); cut(); }
    else out.measure = measure(shape);
    self.postMessage(out);
  } catch (e) { self.postMessage({ id, mode, error: e.message }); }
};
