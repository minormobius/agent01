// bismuth — flux. The crystal as a magnet, and the field lines that show it.
//
// Every brick is a magnetic dipole and the crystal's field is the applied
// field plus the sum of them; flux lines are streamlines through that
// field. What the dipoles are is the MATERIAL, and the material is a dial:
//
//   dia    — a diamagnet, which is what bismuth actually is (the strongest
//            diamagnet among the metals; a slab of it floats a magnet). Every
//            brick's moment opposes the applied field, so the crystal expels
//            flux: the lines bend around its walls and crowd into its hollow.
//            Real bismuth's susceptibility is −1.7 × 10⁻⁴, invisible at any
//            scale you could draw, so the strength here is exaggerated by
//            four orders of magnitude: bismuth as it would be if it meant it.
//   para   — the same, aligned instead of opposed: flux drawn into the walls.
//   ferro  — a ferromagnet with magnetocrystalline anisotropy: each COLONY
//            magnetizes to saturation along an easy axis of the substrate,
//            the one its own growth anisotropy favours where the applied
//            field points, so deployed packs are magnetic domains and the
//            crystal's field is the gestalt of them — the flux lines read the
//            domain structure out.
//
// The applied field is a switch. Off, a diamagnet or paramagnet has nothing
// left (an induced moment needs a field to induce it) — but a ferromagnet
// keeps the magnetization the field gave it: REMANENCE. The domains hold
// their easy axes, the applied term goes to zero, and what remains is the
// crystal's own field, which falls off as a dipole's should. Its lines are
// seeded on the crystal itself, where the field leaves the surface, and
// traced until they re-enter it.
//
// Two views. FLUX: the lines in three dimensions. FIELD: a SECTION — a plane
// through the crystal's centre, facing the camera (or along an axis, or
// locked), with the near half of the crystal cut away; on it the field's
// strength as colour on a log scale about the reference (the applied field,
// or the remanent scale), its direction as line integral convolution, and
// the crystal's own cut in the domains' colours.
//
// First order only: the dipoles are induced by the applied field and do not
// feel each other (no demagnetizing self-consistency), which is right for a
// weak susceptibility and a fair cartoon for the rest. The field is evaluated
// on a coarse grid over the crystal's box — bricks near a sample point one
// by one, far ones as one dipole per cell — a slice or two per frame so the
// page never stalls, and the lines are traced through the grid by midpoint
// steps, seeded on the planes upstream and downstream of the crystal, and
// stopped where they enter a brick. Rendering, not physics: nothing here
// touches the engine or a permalink, and determinism is by construction
// (fixed seeds, fixed order).

export const MATERIALS = ["off", "dia", "para", "ferro"];
export const MATERIAL_INFO = {
  off: "no field",
  dia: "diamagnet — bismuth as it is, × 10⁴: the crystal expels the flux, and the lines crowd into its hollow",
  para: "paramagnet — the flux is drawn into the walls",
  ferro: "ferromagnet — every colony a domain, magnetized along an easy axis of the substrate; the lines read the domains out",
};
export const VIEWS = ["flux", "field", "both"];
export const VIEW_INFO = { flux: "the lines in three dimensions", field: "a section: the field on a plane through the crystal, the near half cut away", both: "the section, with the lines through it" };
export const PLANES = ["facing", "x", "y", "z", "lock"];
export const PLANE_INFO = { facing: "the section faces the camera", x: "the section is the plane x = centre", y: "the section is the plane y = centre", z: "the section is the plane z = centre, a floor plan", lock: "the section stays where it was when locked" };
export const DEFAULT_FLUX = { material: "off", strength: 3, az: 20, el: 55, lines: 200, applied: true, view: "flux", plane: "facing", offset: 0, pn: null };
const SECTION_RES = 128;                           // the section's texture, samples per side
const LIC_LEN = 9;                                 // line integral convolution: steps each way, in texels
const GRID = 30;                                   // samples per axis
const PAD = 7;                                     // edges of empty space around the crystal's box
const CELL = 4;                                    // multipole cell edge
const NEAR = 7;                                    // within this of a cell, its bricks are summed one by one
const STEP = 0.35, MAX_STEPS = 700;
const RMIN2 = 0.45;                                // a dipole's field is capped inside its own brick
const DIRS = [[1, 0], [0.8660254037844386, 0.5], [0.5, 0.8660254037844386], [0, 1], [-0.5, 0.8660254037844386], [-0.8660254037844386, 0.5]];
// probes around a brick, to find which way its surface faces: the six axes and the eight diagonals
const PROBES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) PROBES.push([sx * 0.5773502691896258, sy * 0.5773502691896258, sz * 0.5773502691896258]);
const COLD = [0.16, 0.22, 0.55], EVEN = [0.55, 0.62, 0.9], WARM = [1.0, 0.78, 0.35];   // the lines' palette, shared with the section

// the applied field's direction: azimuth in the plane from +x, elevation from the plane (90 = straight up)
export function fieldDir(az, el) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180, c = Math.cos(e);
  return [Math.cos(a) * c, Math.sin(a) * c, Math.sin(e)];
}

// the substrate's easy axes: the directions a ferromagnet on it may magnetize along — on a
// polycrystal, `grain` picks the grain, whose axes are turned with its lattice
export function axesOf(sub, grain = 0) {
  if (sub.kind === "ico") return sub.T.dirs.filter((d) => d[2] > 1e-9 || (Math.abs(d[2]) <= 1e-9 && (d[0] > 1e-9 || (Math.abs(d[0]) <= 1e-9 && d[1] > 0))));   // one of each oriented pair of two-fold axes
  if (sub.kind === "prism") {
    const g = sub.grains && sub.grains[grain], c = g ? g.c / 1048576 : 1, s = g ? g.s / 1048576 : 0;
    const out = DIRS.map((d) => [c * d[0] - s * d[1], s * d[0] + c * d[1], 0]); out.push([0, 0, 1]); return out;
  }
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
}
// a colony's taste for a direction, from its growth anisotropy (+x −x +y −y +z −z)
function taste(axis, d) {
  const a = axis || [1, 1, 1, 1, 1, 0];
  return 0.05 + Math.max(0, d[0]) * a[0] + Math.max(0, -d[0]) * a[1] + Math.max(0, d[1]) * a[2] + Math.max(0, -d[1]) * a[3] + Math.max(0, d[2]) * (a[4] || 0) + Math.max(0, -d[2]) * (a[5] || 0);
}

export class Flux {
  constructor(growth, opts = {}) {
    this.growth = growth;
    this.sub = growth.sub;
    this.opts = Object.assign({}, DEFAULT_FLUX, opts);
    this.done = false;
    this.slice = 0;
  }

  // the dipoles, the multipole cells, the grid — for the crystal as it stands
  prepare() {
    const g = this.growth, sub = this.sub, o = this.opts, D = fieldDir(o.az, o.el), mo = sub.moteOffset;
    // D is the magnetizing direction; H the applied field — the same, or nothing once the field is switched off
    const applied = o.applied !== false, H = applied ? D : [0, 0, 0];
    const br = g.bricks, n = br.length;
    const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n), mx = new Float64Array(n), my = new Float64Array(n), mz = new Float64Array(n);
    // easy axes per DOMAIN, for a ferromagnet: a colony is a domain; on a polycrystal every grain of a
    // colony is one, with the grain's own turned axes
    const grains = sub.grains ? sub.grains.length : 1, easy = [];
    const domainOf = (b) => (b.c || 0) * grains + (sub.grains ? sub.grainOf(b.tile) : 0);
    if (o.material === "ferro") {
      for (const col of g.colonies) for (let gi = 0; gi < grains; gi++) {
        const axes = axesOf(sub, gi);
        let best = null, bw = -Infinity;
        for (const d of axes) { const w = taste(col.genome.axis, d) * Math.abs(d[0] * D[0] + d[1] * D[1] + d[2] * D[2]); if (w > bw) { bw = w; best = d; } }
        const s = best[0] * D[0] + best[1] * D[1] + best[2] * D[2] >= 0 ? 1 : -1;
        easy.push([best[0] * s, best[1] * s, best[2] * s]);
      }
    }
    const sgn = o.material === "dia" ? -1 : 1, k = o.strength / (4 * Math.PI);
    const colOf = new Map();                       // site → colony, for the section's cut
    let live = 0;
    for (let i = 0; i < n; i++) {
      const b = br[i];
      const s = sub.siteAt(b.tile !== undefined ? { tile: b.tile, z: b.z } : b);
      if (s < 0 || !sub.occ[s]) continue;            // eaten or demolished since
      colOf.set(s, domainOf(b));
      px[live] = b.x + mo[0]; py[live] = b.y + mo[1]; pz[live] = b.z + mo[2];
      const V = sub.kind === "ico" ? sub.T.volume(b.tile) : sub.kind === "prism" ? sub.T.area[b.tile] : 1;
      if (o.material === "ferro") { const e = easy[domainOf(b)]; mx[live] = k * V * e[0]; my[live] = k * V * e[1]; mz[live] = k * V * e[2]; }
      else { mx[live] = sgn * k * V * H[0]; my[live] = sgn * k * V * H[1]; mz[live] = sgn * k * V * H[2]; }
      live++;
    }
    this.n = live; this.px = px; this.py = py; this.pz = pz; this.mx = mx; this.my = my; this.mz = mz; this.H = H; this.D = D; this.easy = easy; this.colOf = colOf;
    this.domains = new Set(colOf.values()).size;
    this.applied = applied;
    // the reference the field is drawn against: the applied field, or for a remanent magnet a quarter of
    // the equatorial field of a uniformly magnetized sphere of this strength — a dipole's field falls as
    // r⁻³, so the scale sits low enough that the field a few bricks out still reads, and the poles glow
    this.ref = applied ? 1 : o.strength / 12;
    this.remanent = !applied && o.material === "ferro";
    // the box
    const bb = sub.bounds();
    const lo = [bb.min[0] - PAD, bb.min[1] - PAD, bb.min[2] - PAD], hi = [bb.max[0] + PAD, bb.max[1] + PAD, bb.max[2] + PAD];
    for (let a = 0; a < 3; a++) { const w = hi[a] - lo[a]; if (w < 2 * PAD + 6) { const c = (hi[a] + lo[a]) / 2; lo[a] = c - PAD - 3; hi[a] = c + PAD + 3; } }
    this.lo = lo; this.hi = hi;
    this.G = GRID; this.h = [(hi[0] - lo[0]) / (GRID - 1), (hi[1] - lo[1]) / (GRID - 1), (hi[2] - lo[2]) / (GRID - 1)];
    // multipole cells
    const cw = [Math.ceil((hi[0] - lo[0]) / CELL), Math.ceil((hi[1] - lo[1]) / CELL), Math.ceil((hi[2] - lo[2]) / CELL)];
    const key = (i) => (Math.floor((pz[i] - lo[2]) / CELL) * cw[1] + Math.floor((py[i] - lo[1]) / CELL)) * cw[0] + Math.floor((px[i] - lo[0]) / CELL);
    const cellOf = new Int32Array(live), count = new Map();
    for (let i = 0; i < live; i++) { const c = key(i); cellOf[i] = c; count.set(c, (count.get(c) || 0) + 1); }
    const ids = [...count.keys()].sort((a, b) => a - b), index = new Map(ids.map((c, j) => [c, j])), nc = ids.length;
    const start = new Int32Array(nc + 1), list = new Int32Array(live), fill = new Int32Array(nc);
    for (let j = 0; j < nc; j++) start[j + 1] = start[j] + count.get(ids[j]);
    for (let i = 0; i < live; i++) { const j = index.get(cellOf[i]); list[start[j] + fill[j]++] = i; }
    const cx = new Float64Array(nc), cy = new Float64Array(nc), cz = new Float64Array(nc), cmx = new Float64Array(nc), cmy = new Float64Array(nc), cmz = new Float64Array(nc);
    for (let j = 0; j < nc; j++) {
      let sx = 0, sy = 0, sz = 0;
      for (let q = start[j]; q < start[j + 1]; q++) { const i = list[q]; sx += px[i]; sy += py[i]; sz += pz[i]; cmx[j] += mx[i]; cmy[j] += my[i]; cmz[j] += mz[i]; }
      const m = start[j + 1] - start[j]; cx[j] = sx / m; cy[j] = sy / m; cz[j] = sz / m;
    }
    this.cells = { n: nc, start, list, cx, cy, cz, mx: cmx, my: cmy, mz: cmz };
    this.B = new Float32Array(GRID * GRID * GRID * 3);
    this.slice = 0; this.done = false;
    if (live === 0) this.fillUniform();
    return this;
  }
  fillUniform() { const B = this.B, H = this.H; for (let i = 0; i < B.length; i += 3) { B[i] = H[0]; B[i + 1] = H[1]; B[i + 2] = H[2]; } this.slice = this.G; this.done = true; }

  // the field at a point: the applied field plus every dipole, near ones one by one
  fieldAt(x, y, z, out) {
    const H = this.H, C = this.cells, px = this.px, py = this.py, pz = this.pz, mx = this.mx, my = this.my, mz = this.mz;
    let bx = H[0], by = H[1], bz = H[2];
    const near2 = (NEAR + CELL) * (NEAR + CELL);
    for (let j = 0; j < C.n; j++) {
      const dx = x - C.cx[j], dy = y - C.cy[j], dz = z - C.cz[j], d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > near2) {
        const r2 = d2, r = Math.sqrt(r2), inv3 = 1 / (r2 * r);
        const md = (C.mx[j] * dx + C.my[j] * dy + C.mz[j] * dz) / r2;
        bx += (3 * md * dx - C.mx[j]) * inv3; by += (3 * md * dy - C.my[j]) * inv3; bz += (3 * md * dz - C.mz[j]) * inv3;
      } else {
        for (let q = C.start[j]; q < C.start[j + 1]; q++) {
          const i = C.list[q];
          const ex = x - px[i], ey = y - py[i], ez = z - pz[i];
          let r2 = ex * ex + ey * ey + ez * ez;
          if (r2 < RMIN2) r2 = RMIN2;
          const r = Math.sqrt(r2), inv3 = 1 / (r2 * r);
          const md = (mx[i] * ex + my[i] * ey + mz[i] * ez) / r2;
          bx += (3 * md * ex - mx[i]) * inv3; by += (3 * md * ey - my[i]) * inv3; bz += (3 * md * ez - mz[i]) * inv3;
        }
      }
    }
    out[0] = bx; out[1] = by; out[2] = bz;
    return out;
  }

  // fill the next `n` z-slices of the grid; true when the grid is complete
  step(n = 1) {
    if (this.done) return true;
    const G = this.G, B = this.B, lo = this.lo, h = this.h, out = [0, 0, 0];
    for (let k = 0; k < n && this.slice < G; k++, this.slice++) {
      const z = lo[2] + this.slice * h[2];
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        this.fieldAt(lo[0] + i * h[0], lo[1] + j * h[1], z, out);
        const at = ((this.slice * G + j) * G + i) * 3;
        B[at] = out[0]; B[at + 1] = out[1]; B[at + 2] = out[2];
      }
    }
    this.done = this.slice >= G;
    return this.done;
  }
  compute() { this.prepare(); while (!this.step(4)) { /* all at once */ } return this; }
  get progress() { return this.slice / this.G; }

  // trilinear read of the grid; the applied field outside it
  sample(x, y, z, out) {
    const G = this.G, lo = this.lo, h = this.h, B = this.B;
    const fx = (x - lo[0]) / h[0], fy = (y - lo[1]) / h[1], fz = (z - lo[2]) / h[2];
    if (fx < 0 || fy < 0 || fz < 0 || fx >= G - 1 || fy >= G - 1 || fz >= G - 1) { out[0] = this.H[0]; out[1] = this.H[1]; out[2] = this.H[2]; return out; }
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz), tx = fx - i, ty = fy - j, tz = fz - k;
    const at = (ii, jj, kk) => ((kk * G + jj) * G + ii) * 3;
    for (let c = 0; c < 3; c++) {
      const c00 = B[at(i, j, k) + c] * (1 - tx) + B[at(i + 1, j, k) + c] * tx, c10 = B[at(i, j + 1, k) + c] * (1 - tx) + B[at(i + 1, j + 1, k) + c] * tx;
      const c01 = B[at(i, j, k + 1) + c] * (1 - tx) + B[at(i + 1, j, k + 1) + c] * tx, c11 = B[at(i, j + 1, k + 1) + c] * (1 - tx) + B[at(i + 1, j + 1, k + 1) + c] * tx;
      out[c] = (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
    }
    return out;
  }
  inside(x, y, z) { const lo = this.lo, hi = this.hi; return x >= lo[0] && y >= lo[1] && z >= lo[2] && x <= hi[0] && y <= hi[1] && z <= hi[2]; }
  solid(x, y, z) { const s = this.sub.siteAtWorld(x, y, z); return s >= 0 && this.sub.occ[s] === 1; }

  // The lines: seeded on a lattice across the planes upstream and downstream
  // of the crystal, traced with the field (upstream) or against it
  // (downstream) by midpoint steps, stopped at the box or at a brick.
  // Returns GL_LINES segments [x, y, z, i, x, y, z, i, …], i = |B| / ref.
  // With the applied field off the lines are the crystal's own, seeded on
  // its surface where the field leaves it (traceSurface).
  trace() {
    if (!this.applied) return this.traceSurface();
    const H = this.H, lo = this.lo, hi = this.hi;
    // a basis across the field
    const up = Math.abs(H[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let ux = H[1] * up[2] - H[2] * up[1], uy = H[2] * up[0] - H[0] * up[2], uz = H[0] * up[1] - H[1] * up[0];
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = H[1] * uz - H[2] * uy, vy = H[2] * ux - H[0] * uz, vz = H[0] * uy - H[1] * ux;
    const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const half = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;   // the seed planes sit outside the box
    const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 - PAD + 3;   // the seed lattice spans the crystal, not the box
    const per = Math.max(2, Math.round(Math.sqrt(this.opts.lines / 2)));
    const segs = [];
    const b = [0, 0, 0], m = [0, 0, 0];
    let lines = 0, maxI = 0;
    for (let side = -1; side <= 1; side += 2) {
      const ox = c[0] + H[0] * half * side, oy = c[1] + H[1] * half * side, oz = c[2] + H[2] * half * side;
      const dir = -side;                                                    // upstream seeds go with the field, downstream against it
      for (let a = 0; a < per; a++) for (let e = 0; e < per; e++) {
        const s = ((a + 0.5) / per - 0.5) * 2 * ext, t = ((e + 0.5) / per - 0.5) * 2 * ext;
        let x = ox + ux * s + vx * t, y = oy + uy * s + vy * t, z = oz + uz * s + vz * t;
        // walk in to the box first
        let k = 0;
        while (!this.inside(x, y, z) && k++ < 200) { x += H[0] * dir * STEP; y += H[1] * dir * STEP; z += H[2] * dir * STEP; }
        if (!this.inside(x, y, z)) continue;
        let drew = false;
        for (let n = 0; n < MAX_STEPS; n++) {
          this.sample(x, y, z, b);
          let bl = Math.hypot(b[0], b[1], b[2]) || 1e-9;
          const mxp = x + dir * STEP * 0.5 * b[0] / bl, myp = y + dir * STEP * 0.5 * b[1] / bl, mzp = z + dir * STEP * 0.5 * b[2] / bl;
          this.sample(mxp, myp, mzp, m);
          const ml = Math.hypot(m[0], m[1], m[2]) || 1e-9;
          const nx = x + dir * STEP * m[0] / ml, ny = y + dir * STEP * m[1] / ml, nz = z + dir * STEP * m[2] / ml;
          if (!this.inside(nx, ny, nz) || this.solid(nx, ny, nz) || this.solid(mxp, myp, mzp)) break;
          const i0 = bl, i1 = ml;
          segs.push(x, y, z, i0, nx, ny, nz, i1);
          if (i1 > maxI) maxI = i1;
          x = nx; y = ny; z = nz; drew = true;
        }
        if (drew) lines++;
      }
    }
    this.lines = lines; this.maxI = maxI;
    return Float32Array.from(segs);
  }

  // Which way a brick's surface faces: the mean of the probe directions that
  // find open space, or null for a buried brick. `r` is the probe reach.
  outward(i, r, out) {
    const x = this.px[i], y = this.py[i], z = this.pz[i];
    let nx = 0, ny = 0, nz = 0, open = 0;
    for (const d of PROBES) if (!this.solid(x + d[0] * r, y + d[1] * r, z + d[2] * r)) { nx += d[0]; ny += d[1]; nz += d[2]; open++; }
    if (!open) return null;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-6) return null;                     // open on opposite sides only: a bridge, not a face
    out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
    return out;
  }

  // The crystal's own lines: seeds on the surface bricks with the strongest
  // outward flux, spread so no two crowd, traced with the field until they
  // re-enter the crystal or leave the box. The first steps off the surface
  // read the dipoles directly (the grid is coarse against a brick); the
  // rest read the grid.
  traceSurface() {
    const n = this.n, r = this.sub.kind === "ico" ? 1.2 : 1.0, gap = r + 0.35;
    const nrm = [0, 0, 0], b = [0, 0, 0], m = [0, 0, 0];
    const cand = [];
    for (let i = 0; i < n; i++) {
      if (!this.outward(i, r, nrm)) continue;
      const x = this.px[i] + nrm[0] * gap, y = this.py[i] + nrm[1] * gap, z = this.pz[i] + nrm[2] * gap;
      if (this.solid(x, y, z) || !this.inside(x, y, z)) continue;
      this.sample(x, y, z, b);
      const out = b[0] * nrm[0] + b[1] * nrm[1] + b[2] * nrm[2];
      if (out > 1e-6) cand.push({ i, x, y, z, out });
    }
    cand.sort((p, q) => q.out - p.out || p.i - q.i);
    // spread: about `lines` seeds over the outflux half of the surface, one brick face ≈ one unit of area
    const want = Math.max(1, this.opts.lines), dmin = Math.max(0.8, 0.9 * Math.sqrt(cand.length / want)), dmin2 = dmin * dmin;
    const taken = new Map(), keyOf = (x, y, z) => `${Math.floor(x / dmin)},${Math.floor(y / dmin)},${Math.floor(z / dmin)}`;
    const seeds = [];
    for (const c of cand) {
      if (seeds.length >= want) break;
      let near = false;
      const cx = Math.floor(c.x / dmin), cy = Math.floor(c.y / dmin), cz = Math.floor(c.z / dmin);
      for (let dx = -1; dx <= 1 && !near; dx++) for (let dy = -1; dy <= 1 && !near; dy++) for (let dz = -1; dz <= 1 && !near; dz++) {
        const l = taken.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (l) for (const s of l) if ((s.x - c.x) ** 2 + (s.y - c.y) ** 2 + (s.z - c.z) ** 2 < dmin2) { near = true; break; }
      }
      if (near) continue;
      const k = keyOf(c.x, c.y, c.z);
      if (!taken.has(k)) taken.set(k, []);
      taken.get(k).push(c); seeds.push(c);
    }
    const segs = [], ref = this.ref;
    let lines = 0, maxI = 0;
    const NEAR_STEPS = 6;
    for (const s of seeds) {
      let x = s.x, y = s.y, z = s.z, drew = false;
      for (let k = 0; k < MAX_STEPS; k++) {
        const direct = k < NEAR_STEPS;
        if (direct) this.fieldAt(x, y, z, b); else this.sample(x, y, z, b);
        const bl = Math.hypot(b[0], b[1], b[2]) || 1e-9;
        const mxp = x + STEP * 0.5 * b[0] / bl, myp = y + STEP * 0.5 * b[1] / bl, mzp = z + STEP * 0.5 * b[2] / bl;
        if (direct) this.fieldAt(mxp, myp, mzp, m); else this.sample(mxp, myp, mzp, m);
        const ml = Math.hypot(m[0], m[1], m[2]) || 1e-9;
        const nx = x + STEP * m[0] / ml, ny = y + STEP * m[1] / ml, nz = z + STEP * m[2] / ml;
        if (!this.inside(nx, ny, nz) || this.solid(nx, ny, nz) || this.solid(mxp, myp, mzp)) break;
        const i0 = bl / ref, i1 = ml / ref;
        segs.push(x, y, z, i0, nx, ny, nz, i1);
        if (i1 > maxI) maxI = i1;
        x = nx; y = ny; z = nz; drew = true;
      }
      if (drew) lines++;
    }
    this.lines = lines; this.maxI = maxI; this.seeds = seeds.length; this.candidates = cand.length; this.seedPts = seeds;
    return Float32Array.from(segs);
  }

  // A section through the field: see Section.
  section(spec) { return new Section(this, spec); }
}

// the lines' palette, for the section: cold where the field is weak, warm where it is strong, on a log
// scale — a factor of 2.8 either way of the reference spans the whole range, so a diamagnet's shadow and
// a paramagnet's core both read
function tone(i, out) {
  const t = Math.max(-3, Math.min(3, Math.log2(Math.max(i, 1e-6))));
  const f = Math.min(1, Math.abs(t) / 1.5);
  const a = EVEN, c = t < 0 ? COLD : WARM;
  const lum = 0.4 + 0.6 * Math.max(0, Math.min(1, 0.5 + t / 3));
  out[0] = (a[0] + (c[0] - a[0]) * f) * lum; out[1] = (a[1] + (c[1] - a[1]) * f) * lum; out[2] = (a[2] + (c[2] - a[2]) * f) * lum;
  out[3] = t;
  return out;
}
// a colony's colour on the cut: a hue per domain for a ferromagnet, the metal's grey otherwise
function domainTone(c, ferro, out) {
  if (!ferro) { out[0] = 0.40; out[1] = 0.40; out[2] = 0.43; return out; }
  const h = (c * 0.6180339887498949) % 1, s = 0.42, l = 0.4;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const hue = (t) => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  out[0] = hue(h + 1 / 3); out[1] = hue(h); out[2] = hue(h - 1 / 3);
  return out;
}
// a small deterministic PRNG for the convolution's noise
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// A section: the field on a square plane through point c with normal n, as
// an RGBA texture. `quick()` reads the grid (trilinear, instant); `refine()`
// re-evaluates rows from the dipoles directly, a few milliseconds at a time,
// until the texture is sharp. Colour is the field's strength about the
// reference; the line integral convolution shows its direction in the plane
// (faded where the field runs through the plane instead); where the plane
// cuts a brick, the cut shows the domain's colour.
export class Section {
  constructor(flux, spec) {
    this.flux = flux;
    const n = spec.n, l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.n = [n[0] / l, n[1] / l, n[2] / l];
    this.c = spec.c.slice();
    this.ext = spec.ext;
    this.res = spec.res || SECTION_RES;
    // an in-plane basis: u along the horizon, v up the plane
    let up = Math.abs(this.n[2]) < 0.95 ? [0, 0, 1] : [0, 1, 0];
    const nn = this.n;
    let ux = up[1] * nn[2] - up[2] * nn[1], uy = up[2] * nn[0] - up[0] * nn[2], uz = up[0] * nn[1] - up[1] * nn[0];
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    this.u = [ux, uy, uz];
    this.v = [nn[1] * uz - nn[2] * uy, nn[2] * ux - nn[0] * uz, nn[0] * uy - nn[1] * ux];
    const R = this.res, N = R * R;
    this.bu = new Float32Array(N); this.bv = new Float32Array(N); this.bm = new Float32Array(N);
    this.solid = new Int16Array(N);                // colony + 1 where the plane cuts a brick, 0 in space
    this.lic = new Float32Array(N);
    this.rgba = new Uint8Array(N * 4);
    this.row = 0; this.done = false; this.stamp = 0;
    this.quick();
  }
  at(i, j, out) {
    const s = ((i + 0.5) / this.res - 0.5) * 2 * this.ext, t = ((j + 0.5) / this.res - 0.5) * 2 * this.ext;
    out[0] = this.c[0] + this.u[0] * s + this.v[0] * t; out[1] = this.c[1] + this.u[1] * s + this.v[1] * t; out[2] = this.c[2] + this.u[2] * s + this.v[2] * t;
    return out;
  }
  store(k, b) {
    const u = this.u, v = this.v;
    this.bu[k] = b[0] * u[0] + b[1] * u[1] + b[2] * u[2];
    this.bv[k] = b[0] * v[0] + b[1] * v[1] + b[2] * v[2];
    this.bm[k] = Math.hypot(b[0], b[1], b[2]);
  }
  // the whole plane from the grid, then its convolution and paint
  quick() {
    const F = this.flux, R = this.res, p = [0, 0, 0], b = [0, 0, 0], sub = F.sub;
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const k = j * R + i;
      this.at(i, j, p);
      const s = sub.siteAtWorld(p[0], p[1], p[2]);
      this.solid[k] = s >= 0 && sub.occ[s] === 1 ? (F.colOf.get(s) || 0) + 1 : 0;
      F.sample(p[0], p[1], p[2], b);
      this.store(k, b);
    }
    this.convolve();
    this.paint();
    return this;
  }
  // rows from the dipoles directly, within a time budget; true when the plane is sharp
  refine(ms = 5, now = () => (typeof performance !== "undefined" ? performance.now() : Date.now())) {
    if (this.done) return true;
    const F = this.flux, R = this.res, p = [0, 0, 0], b = [0, 0, 0], t0 = now();
    while (this.row < R && now() - t0 < ms) {
      const j = this.row++;
      for (let i = 0; i < R; i++) { const k = j * R + i; if (this.solid[k]) continue; this.at(i, j, p); F.fieldAt(p[0], p[1], p[2], b); this.store(k, b); }
    }
    if (this.row >= R) { this.done = true; this.convolve(); }
    this.paint();
    return this.done;
  }
  // line integral convolution of white noise along the in-plane field, both ways
  convolve() {
    const R = this.res, N = R * R, bu = this.bu, bv = this.bv, lic = this.lic;
    const rnd = mulberry(7), noise = new Float32Array(N);
    for (let k = 0; k < N; k++) noise[k] = rnd();
    const dir = (x, y, out) => {
      // bilinear direction at texel coordinates
      const i = Math.max(0, Math.min(R - 2, Math.floor(x))), j = Math.max(0, Math.min(R - 2, Math.floor(y)));
      const tx = Math.max(0, Math.min(1, x - i)), ty = Math.max(0, Math.min(1, y - j));
      const k = j * R + i;
      const fu = (bu[k] * (1 - tx) + bu[k + 1] * tx) * (1 - ty) + (bu[k + R] * (1 - tx) + bu[k + R + 1] * tx) * ty;
      const fv = (bv[k] * (1 - tx) + bv[k + 1] * tx) * (1 - ty) + (bv[k + R] * (1 - tx) + bv[k + R + 1] * tx) * ty;
      const l = Math.hypot(fu, fv);
      if (l < 1e-9) { out[0] = 0; out[1] = 0; return false; }
      out[0] = fu / l; out[1] = fv / l; return true;
    };
    const d = [0, 0];
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      let acc = noise[j * R + i], cnt = 1;
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        let x = i + 0.5, y = j + 0.5;
        for (let s = 0; s < LIC_LEN; s++) {
          if (!dir(x, y, d)) break;
          x += sgn * d[0]; y += sgn * d[1];
          if (x < 0 || y < 0 || x >= R || y >= R) break;
          acc += noise[Math.floor(y) * R + Math.floor(x)]; cnt++;
        }
      }
      lic[j * R + i] = acc / cnt;
    }
  }
  paint() {
    const R = this.res, N = R * R, F = this.flux, ref = F.ref, ferro = F.opts.material === "ferro", remanent = F.remanent, rgba = this.rgba, col = [0, 0, 0, 0];
    for (let k = 0; k < N; k++) {
      const o = k * 4;
      if (this.solid[k]) { domainTone(this.solid[k] - 1, ferro, col); rgba[o] = col[0] * 255; rgba[o + 1] = col[1] * 255; rgba[o + 2] = col[2] * 255; rgba[o + 3] = 255; continue; }
      const bm = this.bm[k];
      tone(bm / ref, col);
      const t = col[3];
      // the convolution's contrast, stretched, and faded where the field runs through the plane
      const inplane = bm > 1e-9 ? Math.hypot(this.bu[k], this.bv[k]) / bm : 0;
      const v = 0.5 + (this.lic[k] - 0.5) * 3.2 * inplane;
      const f = 0.6 + 0.8 * Math.max(0, Math.min(1, v));
      // the plane is opaque where the field matters: away from the reference under an applied field,
      // near the crystal for a remanent one — elsewhere the far half of the crystal shows through
      const a = remanent ? 0.3 + 0.65 * Math.max(0, Math.min(1, (t + 3) / 3)) : 0.55 + 0.4 * Math.min(1, Math.abs(t) / 1.5);
      rgba[o] = Math.min(255, col[0] * f * 255 * a); rgba[o + 1] = Math.min(255, col[1] * f * 255 * a); rgba[o + 2] = Math.min(255, col[2] * f * 255 * a); rgba[o + 3] = a * 255;
    }
    this.stamp++;
  }
  // the quad's corners in substrate coordinates, for the renderer: (−u−v, +u−v, +u+v, −u+v)
  corners() {
    const c = this.c, u = this.u, v = this.v, e = this.ext, out = [];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push(c[0] + (u[0] * a + v[0] * b) * e, c[1] + (u[1] * a + v[1] * b) * e, c[2] + (u[2] * a + v[2] * b) * e);
    return out;
  }
}

// The driver a page uses: keeps a Flux for a growth, recomputes it a slice
// or two a frame when the crystal has changed or the dials have, hands the
// renderer the lines, and in the field view keeps a Section facing the
// camera (or where the dials put it) with the near half of the crystal
// clipped away — a quick plane from the grid whenever the camera moves,
// sharpened from the dipoles once it rests. `tick(dt)` from the page's loop.
export class FluxDriver {
  constructor(growth, renderer) {
    this.growth = growth; this.renderer = renderer;
    this.opts = Object.assign({}, DEFAULT_FLUX);
    this.flux = null; this.segs = null; this.dirty = true; this.seen = -1; this.since = 0; this.busy = false;
    this.section = null; this.still = 0; this.spin = null;
  }
  set(opts) {
    Object.assign(this.opts, opts);
    if (!VIEWS.includes(this.opts.view)) this.opts.view = "flux";
    if (!PLANES.includes(this.opts.plane)) this.opts.plane = "facing";
    this.opts.offset = Math.max(-1, Math.min(1, +this.opts.offset || 0));
    if (this.opts.plane === "lock" && !(Array.isArray(this.opts.pn) && this.opts.pn.length === 3)) this.opts.pn = this.facing() || [0, -1, 0];
    this.dirty = true;
    if (this.opts.material === "off") { this.flux = null; this.segs = null; this.renderer.flux = null; this.dropSection(); }
    this.show();
  }
  setGrowth(growth) { this.growth = growth; this.flux = null; this.segs = null; this.renderer.flux = null; this.dropSection(); this.dirty = true; this.seen = -1; }
  get on() { return this.opts.material !== "off"; }
  get sectioning() { return this.on && this.opts.view !== "flux"; }
  dropSection() { this.section = null; this.renderer.section = null; this.renderer.clip = null; }
  // the direction from the crystal's centre to the eye, in substrate coordinates — null before the first frame
  facing() {
    const r = this.renderer, cam = r.cam;
    if (!cam) return null;
    const T = r.target, e = [cam.eye[0] + T[0], -cam.eye[2] + T[1], cam.eye[1] + T[2]], c = this.centre();
    const d = [e[0] - c[0], e[1] - c[1], e[2] - c[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
    return [d[0] / l, d[1] / l, d[2] / l];
  }
  centre() {
    if (this.flux) return [(this.flux.lo[0] + this.flux.hi[0]) / 2, (this.flux.lo[1] + this.flux.hi[1]) / 2, (this.flux.lo[2] + this.flux.hi[2]) / 2];
    const bb = this.growth.sub.bounds();
    return [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
  }
  normal() {
    const p = this.opts.plane;
    if (p === "x") return [1, 0, 0];
    if (p === "y") return [0, 1, 0];
    if (p === "z") return [0, 0, 1];
    if (p === "lock") return this.opts.pn;
    return this.facing();
  }
  // what the renderer draws: lines, section, clip — from the view
  show() {
    const r = this.renderer, v = this.opts.view;
    r.flux = this.on && v !== "field" ? this.segs : null;
    if (!this.sectioning) { this.dropSection(); if (this.spin !== null) { r.autoSpin = this.spin; this.spin = null; } }
    else if (this.spin === null) { this.spin = r.autoSpin; r.autoSpin = 0; }   // the section would chase a spinning camera
  }
  tick(dt) {
    if (!this.on) return;
    this.since += dt;
    const g = this.growth, stamp = g.bricks.length * 4 + g.removed.length;
    const changed = stamp !== this.seen;
    if (!this.busy && (this.dirty || (changed && (this.since > 2.5 || g.done)))) {
      this.flux = new Flux(g, this.opts).prepare();
      this.busy = true; this.dirty = false; this.seen = stamp; this.since = 0;
    }
    if (this.busy) {
      const t0 = performance.now();
      while (!this.flux.step(1) && performance.now() - t0 < 6) { /* a few slices a frame */ }
      if (this.flux.done) { this.segs = this.flux.trace(); this.busy = false; this.section = null; this.show(); }
    }
    if (this.sectioning && this.flux && this.flux.done) this.tickSection(dt);
  }
  tickSection(dt) {
    const F = this.flux, r = this.renderer, n = this.normal();
    if (!n) return;
    const c = this.centre(), ext = Math.max(F.hi[0] - F.lo[0], F.hi[1] - F.lo[1], F.hi[2] - F.lo[2]) / 2;
    const off = this.opts.offset * (ext - PAD) + 0.013;   // a hair off the centre so an axis plane never sits on a brick face
    c[0] += n[0] * off; c[1] += n[1] * off; c[2] += n[2] * off;
    const S = this.section;
    const moved = !S || S.n[0] * n[0] + S.n[1] * n[1] + S.n[2] * n[2] < 0.99996 || Math.hypot(S.c[0] - c[0], S.c[1] - c[1], S.c[2] - c[2]) > 1e-3;
    // a coarse plane while the camera moves, the full one once it rests, sharpened a few rows a frame
    if (moved) { this.section = F.section({ c, n, ext, res: SECTION_RES / 2 }); this.still = 0; }
    else {
      this.still += dt;
      if (this.still > 0.2) { if (this.section.res < SECTION_RES) this.section = F.section({ c, n, ext }); else if (!this.section.done) this.section.refine(5); }
    }
    r.section = this.section;
    r.clip = { p: this.section.c, n: this.section.n };
  }
  get status() {
    if (!this.on) return "";
    if (this.busy && this.flux) return `tracing the field… ${Math.round(this.flux.progress * 100)}%`;
    if (!this.flux) return "";
    const F = this.flux, o = this.opts, dom = o.material === "ferro" ? ` · ${F.domains} domain${F.domains === 1 ? "" : "s"}` : "";
    if (!F.applied && !F.remanent) return "the applied field is off, and an induced magnet has no field of its own";
    const lines = `${F.lines} flux lines · ${F.n.toLocaleString("en-US")} dipoles`;
    const reach = F.remanent ? `the remanent field reaches ${F.maxI.toFixed(1)}× its scale` : `the field reaches ${F.maxI.toFixed(1)}× the applied field`;
    const sec = this.sectioning && this.section ? ` · section ${this.section.done ? "sharp" : "sharpening…"}` : "";
    return `${F.remanent ? "remanent — the field is off and the crystal keeps its magnetization · " : ""}${lines} · ${reach}${dom}${sec}`;
  }
}
