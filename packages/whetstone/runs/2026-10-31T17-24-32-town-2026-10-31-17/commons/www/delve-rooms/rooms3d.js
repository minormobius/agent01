// rooms3d.js: lay a door graph out in 3D with no two doors touching, and prove it with a number.
// Pure functions; node or browser.
// Why 3D settles it: any graph fits in space with straight edges and no crossings (put vertex i at
// (i, i^2, i^3), the moment curve: no four of those points are coplanar, so no two edges can meet).
// The plane can't do that (K5, K3,3). Here a force layout makes it readable, then a separation pass
// pushes apart any two doors (or a door and a room) closer than `gap`, and clearance() measures the result.
(function (root) {
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const clamp = x => Math.max(0, Math.min(1, x));

  // Closest points between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9).
  function segSeg(p1, q1, p2, q2) {
    const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
    const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
    let s, t;
    if (a < 1e-12 && e < 1e-12) { s = t = 0; }
    else if (a < 1e-12) { s = 0; t = clamp(f / e); }
    else {
      const c = dot(d1, r);
      if (e < 1e-12) { t = 0; s = clamp(-c / a); }
      else {
        const b = dot(d1, d2), den = a * e - b * b;
        s = den > 1e-12 ? clamp((b * f - c * e) / den) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a); } else if (t > 1) { t = 1; s = clamp((b - c) / a); }
      }
    }
    const c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s], c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
    return { d: Math.hypot(...sub(c1, c2)), s, t, c1, c2 };
  }
  function pointSeg(p, a, b) {
    const ab = sub(b, a), L = dot(ab, ab), t = L ? clamp(dot(sub(p, a), ab) / L) : 0;
    const c = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
    return { d: Math.hypot(...sub(p, c)), t, c };
  }

  // Undirected, deduplicated door list for geometry.
  const pairs = links => { const m = new Map(); for (const [a, b] of links) if (a !== b) m.set(Math.min(a, b) + ' ' + Math.max(a, b), [Math.min(a, b), Math.max(a, b)]); return [...m.values()]; };

  // The two numbers that say "no intersections": the closest approach of two doors that share no room,
  // and of a door to a room it doesn't touch. Both in the layout's units; median door length for scale.
  function clearance(pos, links) {
    const E = pairs(links); let doors = Infinity, rooms = Infinity, worst = null;
    for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
      const [a, b] = E[i], [c, d] = E[j]; if (a === c || a === d || b === c || b === d) continue;
      const r = segSeg(pos[a], pos[b], pos[c], pos[d]); if (r.d < doors) { doors = r.d; worst = [E[i], E[j]]; }
    }
    for (const [a, b] of E) for (let k = 0; k < pos.length; k++) if (k !== a && k !== b) rooms = Math.min(rooms, pointSeg(pos[k], pos[a], pos[b]).d);
    const lens = E.map(([a, b]) => Math.hypot(...sub(pos[a], pos[b]))).sort((x, y) => x - y);
    return { doors, rooms, median: lens.length ? lens[lens.length >> 1] : 0, pairs: E.length, worst };
  }

  function layout3d(n, links, opt = {}) {
    const R = rng(opt.seed || 7), L = opt.len || 100, E = pairs(links);
    const p = Array.from({ length: n }, () => [(R() - .5) * L * 2, (R() - .5) * L * 2, (R() - .5) * L * 2]);
    const v = p.map(() => [0, 0, 0]);
    for (let it = 0; it < (opt.iters || 500); it++) {
      const cool = 1 - it / (opt.iters || 500);
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        const d = sub(p[a], p[b]), d2 = dot(d, d) + 1, f = L * L * 0.8 / d2, r = Math.sqrt(d2);
        for (let k = 0; k < 3; k++) { v[a][k] += f * d[k] / r; v[b][k] -= f * d[k] / r; }
      }
      for (const [a, b] of E) { const d = sub(p[b], p[a]), r = Math.hypot(...d) || 1, f = (r - L) * 0.06; for (let k = 0; k < 3; k++) { v[a][k] += f * d[k] / r; v[b][k] -= f * d[k] / r; } }
      for (let a = 0; a < n; a++) for (let k = 0; k < 3; k++) { v[a][k] -= p[a][k] * 0.01; p[a][k] += v[a][k] * 0.5 * cool; v[a][k] *= 0.6; }
    }
    separate(p, links, opt.gap ?? L * 0.2);
    return p;
  }

  // Push apart anything closer than gap: door/door (non-adjacent) and room/door (non-incident).
  function separate(p, links, gap, rounds = 200) {
    const E = pairs(links);
    for (let r = 0; r < rounds; r++) {
      let bad = 0;
      for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
        const [a, b] = E[i], [c, d] = E[j]; if (a === c || a === d || b === c || b === d) continue;
        const q = segSeg(p[a], p[b], p[c], p[d]); if (q.d >= gap) continue; bad++;
        let u = sub(q.c1, q.c2), m = Math.hypot(...u); if (m < 1e-9) { u = [Math.sin(i + j), Math.cos(i * 3 + j), Math.sin(j * 5)]; m = Math.hypot(...u); }
        const push = (gap - q.d) * 0.5 / m;
        for (let k = 0; k < 3; k++) { p[a][k] += u[k] * push * (1 - q.s); p[b][k] += u[k] * push * q.s; p[c][k] -= u[k] * push * (1 - q.t); p[d][k] -= u[k] * push * q.t; }
      }
      for (const [a, b] of E) for (let k = 0; k < p.length; k++) {
        if (k === a || k === b) continue;
        const q = pointSeg(p[k], p[a], p[b]); if (q.d >= gap) continue; bad++;
        let u = sub(p[k], q.c), m = Math.hypot(...u); if (m < 1e-9) { u = [1, 0.3, 0.7]; m = Math.hypot(...u); }
        const push = (gap - q.d) * 0.5 / m;
        for (let x = 0; x < 3; x++) { p[k][x] += u[x] * push; p[a][x] -= u[x] * push * (1 - q.t); p[b][x] -= u[x] * push * q.t; }
      }
      if (!bad) return r;
    }
    return rounds;
  }

  // Rotate (yaw about y, then pitch about x) and project with perspective. Returns [x, y, depth, scale].
  function project(pt, yaw, pitch, dist, f) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = cy * pt[0] + sy * pt[2], z1 = -sy * pt[0] + cy * pt[2];
    const y2 = cp * pt[1] - sp * z1, z2 = sp * pt[1] + cp * z1;
    const s = f / (dist + z2);
    return [x1 * s, y2 * s, z2, s];
  }

  const api = { layout3d, separate, clearance, segSeg, pointSeg, project, pairs };
  if (typeof module !== 'undefined') module.exports = api; else root.Rooms3D = api;
})(this);
