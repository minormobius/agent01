/* KATABASIS's body, no DOM: you, moving continuously as a box among the voxels, and flipping. The page drives
   it with your inputs; the selftest drives it along the solver's own solutions, so the game you play and the
   cave the solver proved are the same cave.
     walking: any way but up (where you face, w included), sliding flush against rock, stepping up a voxel when that's all that's in
       the way (and there's headroom)
     falling: toward your feet
     a flip: you're snapped to the whole-voxel position you're nearest, and the rules (flipFrom, the solver's)
       say whether you may and where you'll land; you hop a voxel, turn about your centre, and fall
   And your view, which turns continuously: up is always an axis of the grid, and the other three of your axes
   (R, F, N) turn freely in the 3D space that leaves. Turning is in a plane tilted TILT into w, so turning
   round turns w into your slice. The box never turns with it: it's a cube in those three directions. */
import { ORIENTATIONS, FLIP_NAMES, FLIP_TO, FLIPS, axisVec, dimsOf, supported, flipFrom, flipToward } from "./cave.js";

export const SPEED = 6, GRAV = 36, VMAX = 30, FLIP_T = 0.7, HOP = 0.25; // voxels a second (and per s²); a flip's seconds, the hop's share
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const unit = (v) => { const m = Math.hypot(...v); return v.map((x) => x / m); };
const E = 1e-6;

/* ---------------------------------------------------------------- the view frame
   A frame is { R, U, F, N }: four orthonormal world vectors. TILT: how far the plane you turn in leans into w.
   Turning by φ in the plane of F and R cos t + N sin t moves your N by up to 2t over a half turn, so at 45°
   turning round swaps w for a direction you can see. */
export const TILT = Math.PI / 4;
/* v turned by th in the plane of orthonormal a and b, a toward b */
export function rot(v, a, b, th) {
  const x = dot(v, a), y = dot(v, b), c = Math.cos(th) - 1, s = Math.sin(th);
  return v.map((vi, i) => vi + x * (c * a[i] + s * b[i]) + y * (c * b[i] - s * a[i]));
}
const rotFrame = (fr, a, b, th) => ({ R: rot(fr.R, a, b, th), U: rot(fr.U, a, b, th), F: rot(fr.F, a, b, th), N: rot(fr.N, a, b, th) });
/* turn right by φ (left if negative): F toward R, in the plane tilted t into w. Up never moves */
export function turn(fr, phi, t = TILT) { return rotFrame(fr, fr.F, add(fr.R.map((v) => v * Math.cos(t)), fr.N, Math.sin(t)), phi); }
/* twist by φ: R toward N, F and up still. With turn, it reaches every way of facing */
export function twist(fr, phi) { return rotFrame(fr, fr.R, fr.N, phi); }
/* tip by th from up U0 toward U1 (a flip's turn: U0 becomes U1 at 90°, the rest of the frame carried with it) */
export function tip(fr, U0, U1, th) { return rotFrame(fr, U0, U1, th); }
/* rounding drift out: up made exactly its grid axis, the rest made orthonormal to it again */
export function tidy(fr) {
  const U = fr.U.map(Math.round), perp = (v, ...bs) => unit(bs.reduce((w, b) => add(w, b, -dot(w, b)), v));
  const F = perp(fr.F, U), R = perp(fr.R, U, F), N = perp(fr.N, U, F, R);
  return { R, U, F, N };
}
/* the grid directions nearest your R, F and N, taken together so that they're three different axes: the walls a
   flip can put under you are these */
export function snap(fr) {
  const out = {}, used = new Set(fr.U.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)), left = ["R", "F", "N"];
  while (left.length) {
    let best = null;
    for (const k of left) for (let a = 0; a < 4; a++) if (!used.has(a) && (!best || Math.abs(fr[k][a]) > Math.abs(best.v))) best = { k, a, v: fr[k][a] };
    const g = [0, 0, 0, 0]; g[best.a] = best.v < 0 ? -1 : 1; out[best.k] = g; used.add(best.a); left.splice(left.indexOf(best.k), 1);
  }
  return out;
}
/* the up a named flip gives you from this frame: the flip's own rule (ahead: your up becomes −F, …), on the
   snapped frame */
export function flipUp(fr, name) { const sn = snap(fr), [b, s] = FLIPS[name][1]; return sn["RUFN"[b]].map((v) => v * s); }

export class Body {
  constructor(cave, c, o = 0) { this.cave = cave; this.p = c.slice(); this.o = o; this.vy = 0; this.flip = null; this.flips = 0; }
  get dims() { return dimsOf(ORIENTATIONS[this.o]); }
  /* does the box at p, extent d, overlap a voxel of this kind (1 rock, or outside the cave; 2 the goal)? */
  overlaps(p, d, kind) {
    const lo = p.map((v) => Math.floor(v + E)), hi = p.map((v, i) => Math.ceil(v + d[i] - E));
    for (let w = lo[3]; w < hi[3]; w++) for (let z = lo[2]; z < hi[2]; z++) for (let y = lo[1]; y < hi[1]; y++) for (let x = lo[0]; x < hi[0]; x++) if (this.cave.at(x, y, z, w) === kind) return true;
    return false;
  }
  free(p, d) { return !this.overlaps(p, d, 1); }
  /* along world axis a by dl, stopping flush against rock */
  slide(p, d, a, dl) {
    const q = p.slice(); q[a] += dl;
    if (this.free(q, d)) return { p: q, hit: false };
    q[a] = dl > 0 ? Math.floor(p[a] + d[a] + dl) - d[a] : Math.ceil(p[a] + dl);
    if ((dl > 0 ? q[a] < p[a] : q[a] > p[a]) || !this.free(q, d)) q[a] = p[a];
    return { p: q, hit: true };
  }
  grounded() { const O = ORIENTATIONS[this.o], [a, s] = O[1], q = this.p.slice(); q[a] -= s * 0.02; return !this.free(q, this.dims); }
  atGoal() { return this.overlaps(this.p, this.dims, 2); }
  /* walk (vel: a world vector perpendicular to your up, voxels a second) and fall, for dt */
  move(dt, vel) {
    if (this.flip) return this.turning(dt);
    const O = ORIENTATIONS[this.o], d = this.dims, [ua, us] = O[1], ground = this.grounded();
    for (let a = 0; a < 4; a++) {
      if (a === ua || !vel[a]) continue;
      const r = this.slide(this.p, d, a, vel[a] * dt);
      if (r.hit && ground) { // something in the way: up and over it, if a voxel is all it is
        const up = this.p.slice(); up[ua] += us;
        if (this.free(up, d)) { const r2 = this.slide(up, d, a, vel[a] * dt); if (!r2.hit || Math.abs(r2.p[a] - up[a]) > 1e-4) { this.p = r2.p; continue; } }
      }
      this.p = r.p;
    }
    this.vy = Math.max(-VMAX, this.vy - GRAV * dt);
    const r = this.slide(this.p, d, ua, this.vy * dt * us);
    if (r.hit) this.vy = 0;
    this.p = r.p;
  }
  /* a flip by name: null if you may (and it's begun), or why not */
  tryFlip(name) { return this.flipBy(FLIP_NAMES.indexOf(name), name); }
  /* a flip that makes up2 (a grid direction perpendicular to your up) your up: null if you may, or why not */
  tryFlipTo(up2, name = "") { const f = flipToward(this.o, up2); return f < 0 ? "no such flip" : this.flipBy(f, name); }
  flipBy(f, name) {
    if (this.flip) return "already turning";
    const O = ORIENTATIONS[this.o], d = this.dims, c = this.p.map(Math.round);
    if (!this.grounded() || !this.cave.clear(c, d) || !supported(this.cave, c, this.o)) return "ground";
    const r = flipFrom(this.cave, c, this.o, f);
    if (!r) return "room";
    const h = add(c, axisVec(O, 1)), ctr = h.map((v, i) => v + d[i] / 2), o2 = FLIP_TO[this.o][f], d2 = dimsOf(ORIENTATIONS[o2]);
    this.flip = { t: 0, from: this.p.slice(), ctr, o2, land: ctr.map((v, i) => v - d2[i] / 2), name, U0: axisVec(O, 1), U1: axisVec(ORIENTATIONS[o2], 1) };
    this.flips++;
    return null;
  }
  turning(dt) {
    const F = this.flip; F.t = Math.min(1, F.t + dt / FLIP_T);
    if (F.t >= 1) { this.o = F.o2; this.p = F.land.slice(); this.vy = 0; this.flip = null; }
  }
  /* your orientation's frame (R, U, F, N as four-vectors) and centre, mid-flip too: every axis turned toward
     its image by the same angle, the coupled turn at full coupling; and the flip's tip so far (th, from U0
     toward U1), which is what the page turns its free view frame by */
  frame() {
    const O = ORIENTATIONS[this.o], ax = [0, 1, 2, 3].map((b) => axisVec(O, b)), d = this.dims;
    if (!this.flip) return { ax, ctr: this.p.map((v, i) => v + d[i] / 2), th: 0 };
    const F = this.flip, k = F.t < HOP ? 0 : (F.t - HOP) / (1 - HOP), e = k * k * (3 - 2 * k), th = (e * Math.PI) / 2;
    const ax2 = [0, 1, 2, 3].map((b) => axisVec(ORIENTATIONS[F.o2], b));
    const hc = F.t < HOP ? F.t / HOP : 1, from = F.from.map((v, i) => v + d[i] / 2), ctr = from.map((v, i) => v + (F.ctr[i] - v) * hc);
    return { ax: ax.map((v, b) => v.map((x, i) => Math.cos(th) * x + Math.sin(th) * ax2[b][i])), ctr, th, U0: F.U0, U1: F.U1 };
  }
}
