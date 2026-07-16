// fluxfield.selftest.mjs — pin the flux-line floor: the solenoid-with-shielded-chambers stream
// function and its marching-squares contours. Pure math, no canvas. Run:
//   node rind/upperrind/fluxfield.selftest.mjs
import { computeFluxLines, bandOffset, bandTangent } from './fluxfield.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// a straight horizontal spine at y=100, normal +y, so bandOffset == (y-100), tangent == +x
const straight = [];
for (let i = 0; i <= 40; i++) straight.push({ x: i * 10, y: 100, nx: 0, ny: 1 });

ok(Math.abs(bandOffset(straight, 200, 130) - 30) < 1e-6, 'bandOffset == signed perp distance from the spine');
ok(Math.abs(bandOffset(straight, 200, 60) + 40) < 1e-6, 'bandOffset is signed (below the spine → negative)');
{ const [tx, ty] = bandTangent(straight, 150, 90); ok(Math.abs(tx - 1) < 1e-9 && Math.abs(ty) < 1e-9, 'bandTangent runs along the spine (+x)'); }

// a rectangular concourse strip, all road, no chambers → ψ == bandOffset ⇒ contours are HORIZONTAL
// lines (every segment level-set runs along the axis, i.e. constant y)
{
  const cells = [], road = [];
  for (let gy = 40; gy <= 160; gy += 8) for (let gx = 0; gx <= 400; gx += 8) { cells.push({ x: gx, y: gy }); road.push(true); }
  const flux = computeFluxLines({ cells, road, rooms: [], region: { x0: 0, y0: 40, x1: 400, y1: 160 }, spine: straight, hub: null }, { pitch: 8, lines: 8 });
  ok(flux.levels.length >= 4, 'empty strip produces several flux lines');
  let horiz = true, n = 0;
  for (const g of flux.levels) for (let s = 0; s < g.segs.length; s += 4) { n++; if (Math.abs(g.segs[s + 1] - g.segs[s + 3]) > 1e-6) horiz = false; }
  ok(n > 0 && horiz, 'with no chambers the flux lines run straight along the axis (constant offset)');
  // brightest line is the centre one (offset 0 == the spine centreline)
  const bright = flux.levels.reduce((a, b) => (b.alpha > a.alpha ? b : a));
  ok(Math.abs(bright.value) < 20, 'the brightest flux line sits near the centreline (offset ≈ 0)');
}

// add ONE shielded chamber mid-strip: the field must DEFLECT — a contour that would pass at the
// chamber's offset is pushed away near the chamber (|offset| grows as it rounds the shield)
{
  const cells = [], road = [];
  for (let gy = 40; gy <= 160; gy += 6) for (let gx = 0; gx <= 400; gx += 6) { cells.push({ x: gx, y: gy }); road.push(true); }
  const spine = straight;
  const noCh = computeFluxLines({ cells, road, rooms: [], region: { x0: 0, y0: 40, x1: 400, y1: 160 }, spine, hub: null }, { pitch: 6, lines: 10 });
  const withCh = computeFluxLines({ cells, road, rooms: [{ x: 200, y: 100, r: 28 }], region: { x0: 0, y0: 40, x1: 400, y1: 160 }, spine, hub: null }, { pitch: 6, lines: 10 });
  // sample ψ directly: on the shield boundary ψ should be ~constant along it (a streamline), and the
  // deflection should be strongest beside the chamber, ~zero far upstream. Rebuild ψ via bandOffset+dipole:
  const psi = (x, y) => { const ex = 0, ey = 1; const ux = x - 200, uy = y - 100, w = ux * ex + uy * ey, r2 = ux * ux + uy * uy; return (y - 100) + (-(28 * 28) * w / Math.max(r2, 28 * 28)); };
  // top & bottom of the shield (u=0, w=±a): ψ ≈ 0 on both (boundary streamline through the centreline level)
  ok(Math.abs(psi(200, 128)) < 1e-6 && Math.abs(psi(200, 72)) < 1e-6, 'the shield boundary is a streamline (ψ≈0 around it)');
  // far upstream the field is undisturbed; beside the shield the flux is DEFLECTED — at a fixed height
  // just outside the shield ψ has collapsed (the contour that lived here has been shoved outward past it)
  ok(Math.abs(psi(20, 135) - 35) < 1, 'far from the chamber ψ ≈ the background offset');
  ok(psi(200, 135) < psi(20, 135) - 8, 'beside the shield the field is deflected (contours pushed outward around it)');
  ok(withCh.levels.length >= 4 && noCh.levels.length >= 4, 'both fields still yield flux lines');
}

// the shield MASKS the flux: with a big room whose cells are marked non-road, no flux segment falls
// deep inside the chamber interior
{
  const cells = [], road = [];
  for (let gy = 40; gy <= 160; gy += 6) for (let gx = 0; gx <= 400; gx += 6) {
    cells.push({ x: gx, y: gy });
    const inRoom = (gx > 170 && gx < 230 && gy > 74 && gy < 126);   // a 60×52 shielded block
    road.push(!inRoom);
  }
  const flux = computeFluxLines({ cells, road, rooms: [{ x: 200, y: 100, r: 28 }], region: { x0: 0, y0: 40, x1: 400, y1: 160 }, spine: straight, hub: null }, { pitch: 6, lines: 10 });
  let insideDeep = 0, total = 0;
  for (const g of flux.levels) for (let s = 0; s < g.segs.length; s += 4) {
    total++;
    const mx = (g.segs[s] + g.segs[s + 2]) / 2, my = (g.segs[s + 1] + g.segs[s + 3]) / 2;
    if (mx > 185 && mx < 215 && my > 86 && my < 114) insideDeep++;   // core of the shield
  }
  ok(total > 0, 'flux present around the shield');
  ok(insideDeep === 0, 'no flux inside the shielded chamber core (field is excluded)');
}

// determinism
{
  const cells = [], road = [];
  for (let gy = 40; gy <= 160; gy += 8) for (let gx = 0; gx <= 300; gx += 8) { cells.push({ x: gx, y: gy }); road.push(true); }
  const args = { cells, road, rooms: [{ x: 150, y: 100, r: 22 }], region: { x0: 0, y0: 40, x1: 300, y1: 160 }, spine: straight, hub: null };
  const a = computeFluxLines(args, { pitch: 8, lines: 9 }), b = computeFluxLines(args, { pitch: 8, lines: 9 });
  ok(JSON.stringify(a.levels) === JSON.stringify(b.levels), 'deterministic — identical output for identical input');
}

// the hub form (no spine): ψ == radius ⇒ flux rings the core
{
  const cells = [], road = [];
  for (let gy = 0; gy <= 300; gy += 8) for (let gx = 0; gx <= 300; gx += 8) { const r = Math.hypot(gx - 150, gy - 150); if (r < 140) { cells.push({ x: gx, y: gy }); road.push(true); } }
  const flux = computeFluxLines({ cells, road, rooms: [], region: { x0: 0, y0: 0, x1: 300, y1: 300 }, spine: null, hub: { x: 150, y: 150 } }, { pitch: 8, lines: 8 });
  ok(flux.levels.length >= 3, 'the hub produces concentric flux rings');
  // a mid ring: its segment midpoints are ~equidistant from the core
  const g = flux.levels[Math.floor(flux.levels.length / 2)];
  let okRing = true;
  for (let s = 0; s < g.segs.length; s += 4) { const mx = (g.segs[s] + g.segs[s + 2]) / 2, my = (g.segs[s + 1] + g.segs[s + 3]) / 2; if (Math.abs(Math.hypot(mx - 150, my - 150) - g.value) > 6) okRing = false; }
  ok(okRing, 'each hub flux line is a ring at its ψ-radius');
}

console.log(`\nfluxfield.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
