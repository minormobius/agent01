// engine.js — the glue over sandconic.wasm.
//
// Same shape as the other four engines on this site: a plain cdylib with no
// imports, so instantiating it needs no import object and no generated shim.
//
// Every typed array handed back is a VIEW INTO WASM MEMORY. It is valid until
// the next call that can grow or reallocate a buffer — which here means any
// call to `step`, `settle` or `measure`. Read it or copy it before stepping.

export const KIND = {
  POINT_SOURCE: 0,
  POINT_SINK: 1,
  LINE_SOURCE: 2,
  LINE_SINK: 3,
};

export const CONIC = ['circle', 'ellipse', 'parabola', 'hyperbola', 'line', 'degenerate'];

export async function loadEngine(url = './sandconic.wasm') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sandconic.wasm: ${res.status}`);
  const bytes = await res.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const e = instance.exports;
  const mem = () => new DataView(e.memory.buffer);

  const f64s = (ptr, len) => new Float64Array(e.memory.buffer, ptr, len);
  const i32s = (ptr, len) => new Int32Array(e.memory.buffer, ptr, len);
  const u8s = (ptr, len) => new Uint8Array(e.memory.buffer, ptr, len);

  return {
    raw: e,

    /** Make a plate `n` cells square at a given angle of repose. */
    init(n, reposeDeg) {
      e.init(n, reposeDeg);
      return this;
    },

    get n() {
      return e.grid_n();
    },

    clearFeatures() {
      e.clear_features();
    },

    /**
     * Add a feature. For points `(nx, ny)` is ignored; for lines it is the
     * normal. Returns its index, or -1 if the table is full.
     */
    addFeature(kind, x, y, { nx = 0, ny = 1, rate = 1 } = {}) {
      return e.add_feature(kind, x, y, nx, ny, rate);
    },

    moveFeature(i, x, y) {
      e.move_feature(i, x, y);
    },
    setFeatureNormal(i, nx, ny) {
      e.set_feature_normal(i, nx, ny);
    },
    setFeatureRate(i, rate) {
      e.set_feature_rate(i, rate);
    },
    featureCount() {
      return e.feature_count();
    },
    featureKind(i) {
      return e.feature_kind(i);
    },
    featureXY(i) {
      return [e.feature_xy(i, 0), e.feature_xy(i, 1)];
    },

    setRepose(deg) {
      e.set_repose(deg);
    },
    reposeDeg() {
      return e.repose_deg();
    },
    setSeamPair(a, b) {
      e.set_seam_pair(a, b);
    },
    setRelax(passes, c) {
      e.set_relax(passes, c);
    },

    reset() {
      e.reset();
    },
    flood(depth) {
      e.flood(depth);
    },

    /** One or more table ticks: pour, topple, drain. Returns the worst
     *  remaining slope overshoot — how far the sand still is from settled. */
    step(ticks = 1) {
      return e.step(ticks);
    },

    /** Topple without pouring until settled or `cap` passes have gone by. */
    settle(eps = 1e-2, cap = 400) {
      return e.settle(eps, cap);
    },

    /** Re-read the curve out of the sand and re-fit it. Returns the number of
     *  seam points found. */
    measure() {
      return e.measure();
    },

    /** The measured seam, as [x0, y0, x1, y1, ...] in cell coordinates. */
    seam() {
      return f64s(e.seam_ptr(), e.seam_len());
    },

    /** Which feature governs each cell — the Voronoi picture. -1 is unclaimed. */
    labels() {
      return i32s(e.labels_ptr(), e.grid_n() * e.grid_n());
    },

    heights() {
      return f64s(e.height_ptr(), e.height_len());
    },

    /** A Lambert-shaded byte per cell. 0 means bare plate. */
    shade(zScale, lx, ly, lz) {
      return u8s(e.shade(zScale, lx, ly, lz), e.grid_n() * e.grid_n());
    },

    maxHeight: () => e.max_height(),
    totalMass: () => e.total_mass(),
    poured: () => e.poured(),
    drained: () => e.drained(),
    steps: () => e.steps(),
    oversteep: () => e.oversteep(),

    // ---- what the fit found, having been told nothing ----
    conicType: (tol = 0.08) => CONIC[e.conic_type(tol)] ?? null,
    eccentricity: () => e.conic_eccentricity(),
    rms: () => e.conic_rms(),
    coeffs: () => [0, 1, 2, 3, 4, 5].map((i) => e.conic_coeff(i)),
    focus: (i) => [e.conic_focus(i, 0), e.conic_focus(i, 1)],
    centre: () => [e.conic_center(0), e.conic_center(1)],
    focusError: (i) => e.focus_error(i),

    /** The statistic computed off his video: how constant r1 + r2 (or
     *  |r1 - r2|) is around the curve, as a percentage of its mean. */
    focalConstancy: (a, b, sum = true) => e.focal_constancy_pct(a, b, sum ? 1 : 0),

    /** What the theory says this pair should draw, from the feature kinds
     *  alone — so the page can show prediction and measurement side by side
     *  and let them disagree. */
    predictedType: () => CONIC[e.predicted_type()] ?? null,

    _mem: mem,
  };
}
