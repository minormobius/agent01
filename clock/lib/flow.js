// Shared swirling flow field — a handful of drifting world-space vortices that
// bend filaments, so parts of an organism passing through the same region braid
// and pour together. Vortices orbit and alternate spin direction, so the field
// churns and shears. Pure: buildFlow() returns a sampler closed over `time`.
import { norm } from './vec.js';

const NV = 5;
// params: { flowScale (tightness), flowChurn (drift speed) }; time in seconds.
export function buildFlow(params, time) {
  const tight = params.flowScale;
  const vort = [];
  for (let i = 0; i < NV; i++) {
    const sp = time * params.flowChurn * (0.6 + 0.18 * i);
    const c = [
      1.3 * Math.sin(sp + i * 1.7) * Math.cos(i * 0.9),
      0.7 * Math.sin(sp * 0.8 + i * 2.1),
      1.3 * Math.cos(sp * 1.07 + i * 1.1),
    ];
    const ax = norm([
      Math.sin(sp * 0.5 + i),
      0.6 + 0.4 * Math.cos(sp * 0.4 + i * 1.3),
      Math.cos(sp * 0.6 + i * 0.7),
    ]);
    vort.push({ c, ax, s: (i % 2 ? -1 : 1) });
  }
  return function flowAt(p) {
    let v0 = 0, v1 = 0, v2 = 0;
    for (let i = 0; i < NV; i++) {
      const q = vort[i];
      const dx = p[0] - q.c[0], dy = p[1] - q.c[1], dz = p[2] - q.c[2];
      const w = q.s * Math.exp(-(dx * dx + dy * dy + dz * dz) * tight);
      const a = q.ax;
      v0 += (a[1] * dz - a[2] * dy) * w;
      v1 += (a[2] * dx - a[0] * dz) * w;
      v2 += (a[0] * dy - a[1] * dx) * w;
    }
    return [v0, v1, v2];
  };
}
