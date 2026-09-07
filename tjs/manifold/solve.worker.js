// tjs/manifold/solve.worker.js — the structural solve, off the main thread.
//
// A profile LDLᵀ over ~4000 degrees of freedom is one to three seconds. On the
// main thread that is a frozen page every time a slider moves, so it runs here
// and the bench keeps its frame rate. The worker owns nothing: it is handed
// params, it regenerates the same lattice deterministically (which is the whole
// point of the seed), solves, and posts back only what the page draws.
//
// Requests carry a monotonic id and the page ignores stale replies, so dragging
// a slider through ten values does not paint the results in whatever order the
// solves happen to finish.

import { generate } from './shell.js';
import { solve, modeField, forceField } from './struct.js';

self.onmessage = (ev) => {
  const { id, params, hazard, opts } = ev.data;
  try {
    const b = generate(params);
    const res = solve(b, hazard, opts || {});
    const force = forceField(b, res, 'service');
    const mode = modeField(b, res, 'mode', 1);
    const buck = res.buckling ? modeField(b, res, 'buckling', 1) : new Float64Array(0);

    // Everything the page needs and nothing it does not: the raw stiffness
    // vectors and the DOF map stay here.
    const payload = {
      id,
      nodes: b.nodes.length,
      members: b.members.length,
      dof: res.dof,
      profile: res.profile,
      checks: res.checks,
      governing: res.governing,
      pass: res.pass,
      funicular: res.funicular,
      ring: res.ring,
      feet: res.feet,
      loads: res.loads,
      pinned: res.pinned,
      buckling: res.buckling ? { lambda: res.buckling.lambda, converged: res.buckling.converged } : null,
      mechanisms: res.pivots.nonPositive,
      softness: res.softness,
      cases: res.cases,
      forceScale: force.scale,
      worst: res.members.reduce((a, m, i) => (m.util > res.members[a].util ? i : a), 0),
      utils: Float32Array.from(res.members, (m) => m.util),
      force: force.f,
      mode,
      buck,
    };
    self.postMessage(payload, [payload.utils.buffer, payload.force.buffer, payload.mode.buffer, payload.buck.buffer]);
  } catch (e) {
    self.postMessage({ id, error: (e && e.stack) || String(e) });
  }
};
