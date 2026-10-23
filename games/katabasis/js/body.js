/* KATABASIS's body, no DOM: you, moving continuously as a box among the voxels, and flipping. The page drives
   it with your inputs; the selftest drives it along the solver's own solutions, so the game you play and the
   cave the solver proved are the same cave.
     walking: along your R and F, sliding flush against rock, stepping up a voxel when that's all that's in
       the way (and there's headroom)
     falling: toward your feet
     a flip: you're snapped to the whole-voxel position you're nearest, and the rules (flipFrom, the solver's)
       say whether you may and where you'll land; you hop a voxel, turn about your centre, and fall */
import { ORIENTATIONS, FLIP_NAMES, FLIP_TO, axisVec, dimsOf, supported, flipFrom } from "./cave.js";

export const SPEED = 6, GRAV = 36, VMAX = 30, FLIP_T = 0.7, HOP = 0.25; // voxels a second (and per s²); a flip's seconds, the hop's share
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);
const E = 1e-6;

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
  /* walk (vel: a world vector in your R-F plane, voxels a second) and fall, for dt */
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
  tryFlip(name) {
    if (this.flip) return "already turning";
    const f = FLIP_NAMES.indexOf(name), O = ORIENTATIONS[this.o], d = this.dims, c = this.p.map(Math.round);
    if (!this.grounded() || !this.cave.clear(c, d) || !supported(this.cave, c, this.o)) return "ground";
    const r = flipFrom(this.cave, c, this.o, f);
    if (!r) return "room";
    const h = add(c, axisVec(O, 1)), ctr = h.map((v, i) => v + d[i] / 2), o2 = FLIP_TO[this.o][f], d2 = dimsOf(ORIENTATIONS[o2]);
    this.flip = { t: 0, from: this.p.slice(), ctr, o2, land: ctr.map((v, i) => v - d2[i] / 2), name };
    this.flips++;
    return null;
  }
  turning(dt) {
    const F = this.flip; F.t = Math.min(1, F.t + dt / FLIP_T);
    if (F.t >= 1) { this.o = F.o2; this.p = F.land.slice(); this.vy = 0; this.flip = null; }
  }
  /* your frame (R, U, F, N as four-vectors) and centre, mid-flip too: every axis turned toward its image by the
     same angle, the coupled turn at full coupling */
  frame() {
    const O = ORIENTATIONS[this.o], ax = [0, 1, 2, 3].map((b) => axisVec(O, b)), d = this.dims;
    if (!this.flip) return { ax, ctr: this.p.map((v, i) => v + d[i] / 2) };
    const F = this.flip, k = F.t < HOP ? 0 : (F.t - HOP) / (1 - HOP), e = k * k * (3 - 2 * k), th = (e * Math.PI) / 2;
    const ax2 = [0, 1, 2, 3].map((b) => axisVec(ORIENTATIONS[F.o2], b));
    const hc = F.t < HOP ? F.t / HOP : 1, from = F.from.map((v, i) => v + d[i] / 2), ctr = from.map((v, i) => v + (F.ctr[i] - v) * hc);
    return { ax: ax.map((v, b) => v.map((x, i) => Math.cos(th) * x + Math.sin(th) * ax2[b][i])), ctr };
  }
}
