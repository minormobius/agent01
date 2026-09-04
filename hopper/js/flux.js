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
export const DEFAULT_FLUX = { material: "off", strength: 3, az: 20, el: 55, lines: 200 };
const GRID = 30;                                   // samples per axis
const PAD = 7;                                     // edges of empty space around the crystal's box
const CELL = 4;                                    // multipole cell edge
const NEAR = 7;                                    // within this of a cell, its bricks are summed one by one
const STEP = 0.35, MAX_STEPS = 700;
const RMIN2 = 0.45;                                // a dipole's field is capped inside its own brick
const DIRS = [[1, 0], [0.8660254037844386, 0.5], [0.5, 0.8660254037844386], [0, 1], [-0.5, 0.8660254037844386], [-0.8660254037844386, 0.5]];

// the applied field's direction: azimuth in the plane from +x, elevation from the plane (90 = straight up)
export function fieldDir(az, el) {
  const a = az * Math.PI / 180, e = el * Math.PI / 180, c = Math.cos(e);
  return [Math.cos(a) * c, Math.sin(a) * c, Math.sin(e)];
}

// the substrate's easy axes: the directions a ferromagnet on it may magnetize along
export function axesOf(sub) {
  if (sub.kind === "ico") return sub.T.dirs.filter((d) => d[2] > 1e-9 || (Math.abs(d[2]) <= 1e-9 && (d[0] > 1e-9 || (Math.abs(d[0]) <= 1e-9 && d[1] > 0))));   // one of each oriented pair of two-fold axes
  if (sub.kind === "prism") { const out = DIRS.map((d) => [d[0], d[1], 0]); out.push([0, 0, 1]); return out; }
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
    const g = this.growth, sub = this.sub, o = this.opts, H = fieldDir(o.az, o.el), mo = sub.moteOffset;
    const br = g.bricks, n = br.length;
    const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n), mx = new Float64Array(n), my = new Float64Array(n), mz = new Float64Array(n);
    // easy axes per colony, for a ferromagnet
    const axes = axesOf(sub), easy = [];
    if (o.material === "ferro") {
      for (const col of g.colonies) {
        let best = null, bw = -Infinity;
        for (const d of axes) { const w = taste(col.genome.axis, d) * Math.abs(d[0] * H[0] + d[1] * H[1] + d[2] * H[2]); if (w > bw) { bw = w; best = d; } }
        const s = best[0] * H[0] + best[1] * H[1] + best[2] * H[2] >= 0 ? 1 : -1;
        easy.push([best[0] * s, best[1] * s, best[2] * s]);
      }
    }
    const sgn = o.material === "dia" ? -1 : 1, k = o.strength / (4 * Math.PI);
    let live = 0;
    for (let i = 0; i < n; i++) {
      const b = br[i];
      const s = sub.siteAt(b.tile !== undefined ? { tile: b.tile, z: b.z } : b);
      if (s < 0 || !sub.occ[s]) continue;            // eaten or demolished since
      px[live] = b.x + mo[0]; py[live] = b.y + mo[1]; pz[live] = b.z + mo[2];
      const V = sub.kind === "ico" ? sub.T.volume(b.tile) : sub.kind === "prism" ? sub.T.area[b.tile] : 1;
      if (o.material === "ferro") { const e = easy[b.c || 0]; mx[live] = k * V * e[0]; my[live] = k * V * e[1]; mz[live] = k * V * e[2]; }
      else { mx[live] = sgn * k * V * H[0]; my[live] = sgn * k * V * H[1]; mz[live] = sgn * k * V * H[2]; }
      live++;
    }
    this.n = live; this.px = px; this.py = py; this.pz = pz; this.mx = mx; this.my = my; this.mz = mz; this.H = H; this.easy = easy;
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
  // Returns GL_LINES segments [x, y, z, i, x, y, z, i, …], i = |B| / |H|.
  trace() {
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
}

// The driver a page uses: keeps a Flux for a growth, recomputes it a slice
// or two a frame when the crystal has changed or the dials have, and hands
// the renderer the lines. `tick(dt)` from the page's loop.
export class FluxDriver {
  constructor(growth, renderer) {
    this.growth = growth; this.renderer = renderer;
    this.opts = Object.assign({}, DEFAULT_FLUX);
    this.flux = null; this.dirty = true; this.seen = -1; this.since = 0; this.busy = false;
  }
  set(opts) { Object.assign(this.opts, opts); this.dirty = true; if (this.opts.material === "off") { this.flux = null; this.renderer.flux = null; } }
  setGrowth(growth) { this.growth = growth; this.flux = null; this.renderer.flux = null; this.dirty = true; this.seen = -1; }
  get on() { return this.opts.material !== "off"; }
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
      if (this.flux.done) { this.renderer.flux = this.flux.trace(); this.busy = false; }
    }
  }
  get status() {
    if (!this.on) return "";
    if (this.busy && this.flux) return `tracing the field… ${Math.round(this.flux.progress * 100)}%`;
    if (this.flux) return `${this.flux.lines} flux lines · ${this.flux.n.toLocaleString("en-US")} dipoles · the field reaches ${this.flux.maxI.toFixed(1)}× the applied field${this.opts.material === "ferro" ? ` · ${this.growth.colonies.length} domain${this.growth.colonies.length === 1 ? "" : "s"}` : ""}`;
    return "";
  }
}
