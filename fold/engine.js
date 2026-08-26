// engine.js — browser glue for the Rust folding engine (fold/engine).
//
// No wasm-bindgen. The module exports plain C functions plus its memory; every
// bulky thing is read straight out of linear memory as a typed-array view.
//
// Views: `load()` allocates every buffer up front and nothing resizes after
// that, so views stay valid for the life of a protein. We re-make them in
// `mount()` and never per frame. If you add a call that can grow the heap, it
// must re-run `_views()` or the old views silently detach.
//
// The strides below MUST match engine/src/lib.rs; `layout()` reports what the
// wasm was built with and we assert at load, so a field added on one side and
// not the other fails loudly instead of rendering nonsense.

export const VERTEX_STRIDE = 8; // pos(3) normal(3) t(1) q(1)
export const WIRE_STRIDE = 4; // pos(3) strength(1)
export const ABI_VERSION = 4;

export const PARAM = { TEMP: 0, GAMMA: 1, DT: 2, EPS: 3, TORSION: 4 };
export const STAT = {
  Q: 0, ENERGY: 1, E_CONTACT: 2, RG: 3, STEPS: 4,
  KINETIC_T: 5, FORMED: 6, N_CONTACT: 7, RMSD: 8,
};

/** Defaults measured in engine/src/check.rs (`check profile`): at these values
 *  every protein under ~60 residues reaches Q >= 0.85 in 40-80k steps, which is
 *  a few seconds of watching. Changing them changes whether the site is worth
 *  looking at, so change them with a measurement, not a hunch. */
export const DEFAULTS = { temp: 0.8, gamma: 0.1, dt: 0.01, eps: 1.0, torsion: 1.0, cutoff: 8.0 };

export class Engine {
  constructor(exports) {
    this.x = exports;
    const stride = exports.layout(0);
    const wire = exports.layout(1);
    const abi = exports.layout(2);
    if (stride !== VERTEX_STRIDE || wire !== WIRE_STRIDE || abi !== ABI_VERSION) {
      throw new Error(
        `fold.wasm layout mismatch: wasm says ${stride}/${wire}/abi ${abi}, ` +
          `js expects ${VERTEX_STRIDE}/${WIRE_STRIDE}/abi ${ABI_VERSION} — rebuild with engine/build.sh`
      );
    }
    this.maxSubdiv = exports.layout(4);
    this.maxSides = exports.layout(5);
    this.n = 0;
    this.subdiv = 6;
    this.sides = 10;
  }

  static async load(url = './fold.wasm') {
    // A plain fetch rather than instantiateStreaming: static hosts serve .wasm
    // as application/octet-stream often enough that streaming is not worth the
    // fussiness for 54 KB.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
    return new Engine(instance.exports);
  }

  get mem() {
    return this.x.memory.buffer;
  }

  /**
   * Point the engine at a protein. `ca` is a flat array of 3n C-alpha
   * coordinates in angstrom. Returns the native contact count.
   */
  mount(ca, { cutoff = DEFAULTS.cutoff, subdiv = 6, sides = 10 } = {}) {
    const n = ca.length / 3;
    if (!Number.isInteger(n) || n < 4) throw new Error(`bad coordinate count ${ca.length}`);
    this.n = n;
    this.subdiv = Math.min(subdiv, this.maxSubdiv);
    this.sides = Math.min(sides, this.maxSides);

    const natPtr = this.x.load(n);
    new Float32Array(this.mem, natPtr, 3 * n).set(ca);
    this.nContacts = this.x.build(cutoff);
    this.radius = this.x.native_radius();
    this._views();
    return this.nContacts;
  }

  /** Re-make every view. Only safe to skip while nothing reallocates. */
  _views() {
    const n = this.n;
    const m = this.mem;
    this.pos = new Float32Array(m, this.x.pos_ptr(), 3 * n);
    this.native = new Float32Array(m, this.x.native_ptr(), 3 * n);
    this.resq = new Float32Array(m, this.x.resq_ptr(), n);
    this.formed = new Uint8Array(m, this.x.formed_ptr(), this.nContacts);
    // (u32, u32, f32) records: read the pair fields with stride 3
    this.contacts = new Uint32Array(m, this.x.contacts_ptr(), 3 * this.nContacts);

    this.rings = (n - 1) * this.subdiv + 1;
    this.vertCount = this.rings * this.sides;
    this.mesh = new Float32Array(m, this.x.mesh_ptr(), this.vertCount * VERTEX_STRIDE);
    this.ghost = new Float32Array(m, this.x.ghost_ptr(), this.vertCount * VERTEX_STRIDE);
    this.maxWire = (this.nContacts * 2 * WIRE_STRIDE) | 0;
    this.wire = new Float32Array(m, this.x.wire_ptr(), this.maxWire);
  }

  setParams(p) {
    if (p.temp !== undefined) this.x.set_param(PARAM.TEMP, p.temp);
    if (p.gamma !== undefined) this.x.set_param(PARAM.GAMMA, p.gamma);
    if (p.dt !== undefined) this.x.set_param(PARAM.DT, p.dt);
    if (p.eps !== undefined) this.x.set_param(PARAM.EPS, p.eps);
    if (p.torsion !== undefined) this.x.set_param(PARAM.TORSION, p.torsion);
  }

  /** mode: 'coil' | 'native' | 'extended' */
  reset(seed, mode = 'coil') {
    this.x.reset(seed >>> 0, mode === 'native' ? 1 : mode === 'extended' ? 2 : 0);
  }

  step(k) {
    this.x.step(k);
  }

  diverged() {
    return this.x.diverged() !== 0;
  }

  stat(i) {
    return this.x.stat(i);
  }

  stats() {
    return {
      q: this.stat(STAT.Q),
      energy: this.stat(STAT.ENERGY),
      eContact: this.stat(STAT.E_CONTACT),
      rg: this.stat(STAT.RG),
      steps: this.stat(STAT.STEPS),
      kT: this.stat(STAT.KINETIC_T),
      formed: this.stat(STAT.FORMED),
      nContact: this.stat(STAT.N_CONTACT),
      rmsd: this.stat(STAT.RMSD),
    };
  }

  /** Rebuild the live tube. Returns vertex count. */
  buildMesh(radius) {
    return this.x.mesh(this.subdiv, this.sides, radius);
  }

  /** Rebuild the native ghost with matching topology. */
  buildGhost(radius) {
    return this.x.mesh_native(this.subdiv, this.sides, radius);
  }

  /** Triangulate the current topology. Returns index count. */
  buildIndices() {
    const count = this.x.indices();
    this.indices = new Uint32Array(this.mem, this.x.index_ptr(), count);
    return count;
  }

  /** Optimal superposition of the native structure onto the live chain, as a
   *  column-major mat4. Recomputed per frame; the ghost is drawn with it so the
   *  chain is seen converging into its target rather than drifting beside it. */
  fit() {
    return new Float32Array(this.mem, this.x.superpose(), 16);
  }

  /** Contact filaments for every contact currently made. Returns line count. */
  buildWires() {
    this.wireCount = this.x.wires();
    return this.wireCount;
  }
}
