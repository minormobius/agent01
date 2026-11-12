/* HOUSE's walker. No DOM.

   A body in a world given as a distance function f(x, y, z, w) (CAD⁴'s, compiled from the same tree the picture is
   drawn from). y is up; the ground you walk on is three-dimensional (x, z, w). You carry a frame of three ground
   directions: F ahead, R to your right, and N, the one you can't see. Your view is the slice through your eye spanned
   by R, up and F.

   The body is two balls, one at the hips and one at the head. Each step: turn, move, fall, then push each ball out of
   whatever it is in, along the function's gradient (which is the way out of a wall, in all four directions at once).
   The function must be a true distance where you walk: after a cut it is only a lower bound, so a hole's cutter should
   run well past the wall it cuts, or its end face stops you in mid-air.
   Landing on something sets you down on it. */
export const WALKABLE = 0.25, EYE = 1.55, BODY = [[0.34, 0.34], [1.3, 0.3]], SPEED = 2.4, G = 12;
export function makeWalker(pos = [0, 0, 0, 0]) { return { p: pos.slice(), vy: 0, F: [1, 0, 0, 0], R: [0, 0, 1, 0], N: [0, 0, 0, 1], pitch: 0, grounded: false }; }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
/* turn a toward b by th (both unit, orthogonal), in place */
function turn(a, b, th) { const c = Math.cos(th), s = Math.sin(th); for (let i = 0; i < 4; i++) { const x = a[i], y = b[i]; a[i] = c * x + s * y; b[i] = -s * x + c * y; } }
function ortho(W) { const n = (v) => { v[1] = 0; const l = Math.hypot(...v); for (let i = 0; i < 4; i++) v[i] /= l; }, sub = (v, u) => { const d = dot(v, u); for (let i = 0; i < 4; i++) v[i] -= d * u[i]; }; n(W.F); sub(W.R, W.F); n(W.R); sub(W.N, W.F); sub(W.N, W.R); n(W.N); }
/* input: move [ahead, right, unseen] each −1…1; look [yaw, pitch] and into [F→N, R→N], radians this step; jump */
export function step(W, f, inp, dt) {
  const look = inp.look || [0, 0], into = inp.into || [0, 0], mv = inp.move || [0, 0, 0];
  if (look[0]) turn(W.F, W.R, look[0]); if (into[0]) turn(W.F, W.N, into[0]); if (into[1]) turn(W.R, W.N, into[1]); ortho(W);
  W.pitch = Math.max(-1.3, Math.min(1.3, W.pitch + (look[1] || 0)));
  let l = Math.hypot(mv[0], mv[1], mv[2]); l = l > 1 ? 1 / l : 1;
  for (let i = 0; i < 4; i++) W.p[i] += (W.F[i] * mv[0] + W.R[i] * mv[1] + W.N[i] * mv[2]) * l * SPEED * dt;
  if (inp.jump && W.grounded) W.vy = 4.2;
  W.vy -= G * dt; W.p[1] += W.vy * dt; W.grounded = false;
  const e = 0.004;
  for (let pass = 0; pass < 4; pass++) { let moved = false;
    for (const [h, r] of BODY) { const x = W.p[0], y = W.p[1] + h, z = W.p[2], w = W.p[3], d = f(x, y, z, w); if (d >= r) continue;
      let gx = f(x + e, y, z, w) - f(x - e, y, z, w), gy = f(x, y + e, z, w) - f(x, y - e, z, w), gz = f(x, y, z + e, w) - f(x, y, z - e, w), gw = f(x, y, z, w + e) - f(x, y, z, w - e); const gl = Math.hypot(gx, gy, gz, gw); if (gl < 1e-9) { gy = 1; gx = gz = gw = 0; } else { gx /= gl; gy /= gl; gz /= gl; gw /= gl; }
      const push = r - d; moved = true;
      /* something you can stand on (its way out is mostly up) lifts you straight up, so a slope doesn't slide you down
         it and a stair's nosing is climbed (a ledge up to about a quarter of a metre: its corner meets the hip ball low); anything steeper pushes you off along its own way out */
      if (gy > WALKABLE && h === BODY[0][0]) { W.p[1] += Math.min(push / gy, 0.25); W.grounded = true; if (W.vy < 0) W.vy = 0; }
      else { W.p[0] += gx * push; W.p[1] += gy * push; W.p[2] += gz * push; W.p[3] += gw * push; if (gy < -0.6 && W.vy > 0) W.vy = 0; } }
    if (!moved) break; }
  if (W.p[1] < -30) { W.p[1] = 3; W.vy = 0; } // (fell off the world)
  return W;
}
/* the eye and the camera's three directions (the slice you see), pitch applied */
export function eye(W) { const c = Math.cos(W.pitch), s = Math.sin(W.pitch), up = [0, 1, 0, 0]; return { at: [W.p[0], W.p[1] + EYE, W.p[2], W.p[3]], fwd: W.F.map((v, i) => v * c + up[i] * s), up: W.F.map((v, i) => -v * s + up[i] * c), right: W.R.slice(), unseen: W.N.slice() }; }
/* square the frame up to the nearest axes (keeps what you are most nearly facing) */
export function square(W) { const snap = (v, used) => { let b = -1, m = 0; for (const i of [0, 2, 3]) if (!used.has(i) && Math.abs(v[i]) > m) { m = Math.abs(v[i]); b = i; } const o = [0, 0, 0, 0]; o[b] = Math.sign(v[b]) || 1; used.add(b); return o; }, used = new Set(); W.F = snap(W.F, used); W.R = snap(W.R, used); W.N = snap(W.N, used); return W; }
