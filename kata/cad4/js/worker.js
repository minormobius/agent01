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
/* how far a motion can really go: each leg of the path walked until a checked pair touches (within TOUCH, to the
   grid's resolution), then bisected back to the last clear pose. The next leg starts from where this one stopped */
const TOUCH = 0.05;
function reach(tree, vals, path) {
  const pairs = tree.check || [], start = { ...vals, ...path[0] };
  // (a pair that sits closer than that by design, a pin in its bore, is held to not overlapping)
  const tight = pairs.map(([a, b]) => { const f = fit(tree, a, b, start, 16); return f.overlap === 0 && f.gap < 2 * TOUCH; });
  const bad = (v) => pairs.some(([a, b], i) => { const f = fit(tree, a, b, v, 16); return f.overlap > 0 || (!tight[i] && f.gap < TOUCH); });
  const keys = [...new Set(path.flatMap((p) => Object.keys(p)))], pick = (v) => Object.fromEntries(keys.map((k) => [k, v[k]]));
  let cur = start; if (bad(cur)) return { path, stopped: [], stuck: true };
  const out = [pick(cur)], stopped = [];
  for (let s = 1; s < path.length; s++) { const to = { ...cur, ...path[s] }, at = (t) => { const v = { ...cur }; for (const k of keys) v[k] = cur[k] + (to[k] - cur[k]) * t; return v; };
    const len = Math.max(...keys.map((k) => Math.abs(to[k] - cur[k]))), steps = Math.min(24, Math.max(4, Math.ceil(len / 0.1))); let lo = 0, hi = 0, hit = false;
    for (let k = 1; k <= steps && !hit; k++) { if (bad(at(k / steps))) { hit = true; hi = k / steps; } else lo = k / steps; }
    if (hit) for (let q = 0; q < 5; q++) { const m = (lo + hi) / 2; if (bad(at(m))) hi = m; else lo = m; }
    cur = at(lo); out.push(pick(cur)); stopped.push(hit); }
  return { path: out, stopped };
}
self.onmessage = (ev) => {
  const { id, tree, vals, mode, O, E, C, N4, R } = ev.data;
  try {
    const shape = compile(tree, vals), out = { id, mode };
    const cut = () => { if (shape.dim === 4) { const m = measure(slice(shape, O, E), 56, 2); out.slice = { volume: m.volume, area: m.boundary }; out.profile = profile(shape, C, E, N4, R); } };
    if (mode === "reach") out.reach = reach(tree, vals, ev.data.path);
    else if (mode === "fit") (out.fit = (tree.check || []).map(([a, b]) => ({ a, b, ...fit(tree, a, b, vals, 16) })), shape.dim === 4 && cost < 90 && (out.profile = profile(shape, C, E, N4, R)));
    else if (mode === "slice") cut();
    else if (mode === "quick") { out.fit = (tree.check || []).map(([a, b]) => ({ a, b, ...fit(tree, a, b, vals) })); out.measure = measure(shape, [0, 1000, 160, 40, 14][shape.dim], 2); cut(); }
    else out.measure = measure(shape);
    self.postMessage(out);
  } catch (e) { self.postMessage({ id, mode, error: e.message }); }
};
