// ringgear.mjs — an internal (annular) ring gear as one sketch loop.
//
// cad.mino.mobi's `gear` op builds external spur gears only: `z` is a u32 so a
// negative tooth count is refused, there is no `internal` flag, and the op has
// no `mode`, so it cannot be a cut tool either. Probed 2026-09-14; both an
// `internal: true` key and a `mode: "cut"` key are accepted and silently
// dropped. So a ring gear has to be drawn.
//
// It can be, exactly. An internal gear's tooth SPACE is an external gear's
// tooth: same base circle, same involute, same phase, same thickness at the
// pitch line. Only the tip and root radii swap — tip inside the pitch circle at
// r − m, root outside at r + 1.25 m. So this emits the same curves the engine's
// own `gear_loop` emits, as one closed `path` that goes in the sketch as the
// inner loop of a disc. One sweep, no boolean.
//
//   import { ringLoop } from './ringgear.mjs';
//   { op: 'sketch', id: 'face', loops: [circle('rim', [0,0], 'od / 2'), ringLoop(1, 54)] }
//
// Two things it took an afternoon to learn, both worth keeping:
//
//   * DO NOT ROUND THE COORDINATES. With `toFixed(6)` — a nanometre on a 30 mm
//     radius — Truck leaves the solid open: χ −165 against −16 for the same
//     loop at full double precision. A plain 50-gon is watertight at full
//     precision and leaks rounded. Whatever Truck matches edges with is tighter
//     than 1e-6 mm.
//   * `spline` segments still leak (χ −16) even at full precision, so the
//     flanks are cubic Béziers interpolating the involute at t = 0, ⅓, ⅔, 1.
//     That is 216 segments for z54, 27 KB, 330 ms, χ 0, watertight.
//
// Meshing it (probed on a z54 ring and a z18 planet at 18 mm centres, clean
// through 48 instants of a full turn):
//
//   * the centre distance is (z_ring − z_planet) · m / 2, not the sum;
//   * the `gear` mate's auto-phasing is external-only — it offsets the follower
//     by half a tooth. An internal mesh wants NO offset, so give the planet an
//     explicit `phase: 0`. Left to the auto-phaser the teeth overlap 41.6 mm³;
//   * an internal mesh turns the same way, and the mate has no flag for it, but
//     a NEGATIVE tooth count does it: the mate computes −θ·za/zb, so
//     `zb: -18` gives +3θ for a z54 ring. Undocumented, and it works.
const inv = (a) => Math.tan(a) - a;

/// The tooth loop of an internal gear, centred on the origin, tooth space 0
/// centred on +x so it meshes an external gear built by the `gear` op with the
/// same `m` and `alpha`. Returns a LoopSpec: put it in a sketch's `loops` after
/// the rim, and even-odd makes the annulus.
export function ringLoop(m, z, alphaDeg = 20, name = 'teeth') {
  const rp = (m * z) / 2, a = (alphaDeg * Math.PI) / 180, rb = rp * Math.cos(a);
  const rTip = rp - m, rRoot = rp + 1.25 * m;
  // the flank is an involute of the base circle, so the tooth has to end outside it
  if (rTip < rb) throw new Error(`internal gear m${m} z${z}: the tip circle ${rTip.toFixed(3)} is inside the base circle ${rb.toFixed(3)} — z must be at least ${Math.ceil(2 / (1 - Math.cos(a)))} at this pressure angle, or the tooth needs a profile shift`);
  const half = Math.PI / (2 * z), pitch = (2 * Math.PI) / z;
  const phi = (r) => half + inv(a) - inv(Math.acos(Math.min(1, rb / r)));
  const P = (r, th) => [r * Math.cos(th), r * Math.sin(th)];
  // one cubic Bézier interpolating the involute at t = 0, ⅓, ⅔, 1: the curve
  // itself in four numbers, where a chord fan would need forty
  const bez = (thc, sign, from, to) => {
    const S = [0, 1 / 3, 2 / 3, 1].map((u) => { const r = from + (to - from) * u; return P(r, thc + sign * phi(r)); });
    const mix = (c) => [0, 1].map((j) => c.reduce((s, k, i) => s + k * S[i][j], 0) / 6);
    return { bezier: { to: S[3], ctrl: [mix([-5, 18, -9, 2]), mix([2, -9, 18, -5])] } };
  };
  const segs = [], from = P(rTip, phi(rTip) - pitch);   // where space z−1 leaves the tip circle
  for (let k = 0; k < z; k++) {
    const thc = k * pitch;
    segs.push({ arc: { via: P(rTip, thc - pitch / 2), to: P(rTip, thc - phi(rTip)) } });   // across one ring tooth
    segs.push(bez(thc, -1, rTip, rRoot));                                                  // down the space's first flank
    segs.push({ arc: { via: P(rRoot, thc), to: P(rRoot, thc + phi(rRoot)) } });            // across the ring root
    segs.push(bez(thc, +1, rRoot, rTip));                                                  // back up the second flank
  }
  return { name, path: { from, segs } };
}

/// What the ring is, in numbers, for an audit or a note.
export function ringSpec(m, z, alphaDeg = 20) {
  const rp = (m * z) / 2, a = (alphaDeg * Math.PI) / 180;
  return { m, z, alphaDeg, r_pitch: rp, r_base: rp * Math.cos(a), r_tip: rp - m, r_root: rp + 1.25 * m,
    /// centre distance to an external gear of z2 teeth, and the mate that meshes them
    centres: (z2) => ((z - z2) * m) / 2, mate: (z2) => ({ za: z, zb: -z2, phase: 0 }) };
}
