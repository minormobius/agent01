// trajectory.selftest — the arena lob tool: endpoints, apex bulge, monotonic-x, determinism.
import { arcPoint, defaultApex, lob, spin } from '../arena/trajectory.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

const a = { x: 2, y: 8 }, b = { x: 12, y: 6 };

// 1. endpoints are exact (the throw starts at the thrower, lands on the target)
ok(near(arcPoint(a, b, 0).x, a.x) && near(arcPoint(a, b, 0).y, a.y), 'arc at t=0 is the origin');
ok(near(arcPoint(a, b, 1).x, b.x) && near(arcPoint(a, b, 1).y, b.y), 'arc at t=1 is the target');

// 2. the apex bulges UP (smaller y in arena coords) at the midpoint
const mid = arcPoint(a, b, 0.5), chordY = (a.y + b.y) / 2;
ok(mid.y < chordY, 'the arc rises above the chord at its midpoint (a lob, not a straight line)');
ok(near(chordY - mid.y, defaultApex(a, b)), 'the midpoint rise equals the apex height');

// 3. x advances monotonically along the arc (no backtracking)
{
  const pts = lob(a, b, { n: 20 });
  let mono = true; for (let i = 1; i < pts.length; i++) if (pts[i].x < pts[i - 1].x - 1e-9) mono = false;
  ok(mono, 'x is monotonic from origin to target');
  ok(pts.length === 21, 'lob samples n+1 points');
}

// 4. apex scales with distance (a long throw arcs higher than a short lob), and is bounded
ok(defaultApex({ x: 0, y: 0 }, { x: 30, y: 0 }) > defaultApex({ x: 0, y: 0 }, { x: 3, y: 0 }), 'a longer throw arcs higher');
ok(defaultApex({ x: 0, y: 0 }, { x: 999, y: 0 }) <= 4, 'apex is bounded (a very long throw does not arc absurdly high)');
ok(defaultApex({ x: 0, y: 0 }, { x: 0.1, y: 0 }) >= 0.6, 'even an adjacent lob has a readable arc');

// 5. determinism — pure function of the inputs
ok(JSON.stringify(lob(a, b)) === JSON.stringify(lob(a, b)), 'lob is deterministic');
ok(near(spin(a, b, 0), 0) && spin(a, b, 1) > 0, 'spin grows from 0 with progress');

console.log(`trajectory.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
