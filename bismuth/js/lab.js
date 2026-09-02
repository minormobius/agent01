// bismuth — the playground (/lab). The same engine and renderer as the
// specimen page, with every knob on the outside:
//   · the SUBSTRATE is the geometry: the cubic lattice, or any plane tiling
//     from packages/tilings stacked into prisms — Penrose included;
//   · the INITIAL CONDITION is a painted height map over that substrate —
//     what the masons build on (a plate, a ring, walls, whatever you draw);
//   · the BRAIN is every law the masons obey: Kossel rates, the rim, the
//     anisotropy, the walk, the two nucleation gates, the melt-is-above rule;
//   · the COLONY has births and retirements on top of its starting size.
// The whole state serialises into the URL hash, so a playground is a
// permalink like a specimen is. Edits mid-growth apply live (the engine reads
// its laws every tick); reset replays from scratch, which is what the link
// reproduces.

import { Growth } from "./crystal.js";
import { genome, normalizeSeed, GRID, DEFAULT_BRAIN, DEFAULT_POPULATION } from "./genome.js";
import { Renderer } from "./render.js";
import { SHAPES, SHAPE_INFO, tiling, FIX } from "./tilings.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const fmt = (n) => n.toLocaleString("en-US");

// ------------------------------------------------------------- state ----
// Everything the URL carries. Numbers only; the height maps are packed.
function defaultState() {
  const g = genome(48112);
  return {
    v: 2,
    seed: 48112,
    budget: 6000,
    masons: 12,
    rim: 3, k1: 0.007, k2: 0.75, k3: 0.96,
    patience: 90, mobility: 1.2, flight: 3,
    axis: [0.62, 0.62, 0.62, 0.62, 1.0],
    oxide: { base: Math.round(g.oxide.base), ramp: Math.round(g.oxide.ramp), grain: 3, warp: 0.6, wavelength: 16 },
    brain: Object.assign({}, DEFAULT_BRAIN),
    pop: Object.assign({}, DEFAULT_POPULATION),
    sub: { shape: "grid", R: 30 },
    ic: { n: 24, z: 0, h: null },     // cubic: h Uint8Array n*n, heights 0..15
    tic: { z: 0, cells: new Map() },  // tilings: tile index → height
  };
}

const b64 = (bytes) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64 = (str) => { try { return atob(str.replace(/-/g, "+").replace(/_/g, "/")); } catch (e) { return ""; } };

function packHeights(h) {
  const bytes = new Uint8Array(Math.ceil(h.length / 2));
  for (let i = 0; i < h.length; i++) bytes[i >> 1] |= (h[i] & 15) << ((i & 1) * 4);
  return b64(bytes);
}
function unpackHeights(str, n) {
  const h = new Uint8Array(n * n);
  const bin = unb64(str);
  for (let i = 0; i < h.length; i++) { const b = bin.charCodeAt(i >> 1) || 0; h[i] = (b >> ((i & 1) * 4)) & 15; }
  return h;
}
function packCells(cells) {
  const bytes = new Uint8Array(cells.size * 3);
  let i = 0;
  for (const [t, h] of cells) { if (!h) continue; bytes[i++] = t >> 8; bytes[i++] = t & 255; bytes[i++] = h & 15; }
  return b64(bytes.subarray(0, i));
}
function unpackCells(str) {
  const bin = unb64(str), m = new Map();
  for (let i = 0; i + 2 < bin.length; i += 3) m.set((bin.charCodeAt(i) << 8) | bin.charCodeAt(i + 1), bin.charCodeAt(i + 2) & 15);
  return m;
}
function encodeState(st) {
  const o = Object.assign({}, st, {
    ic: { n: st.ic.n, z: st.ic.z, h: packHeights(st.ic.h) },
    tic: { z: st.tic.z, c: packCells(st.tic.cells) },
  });
  return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeState(str) {
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/")))));
    if (!o || (o.v !== 1 && o.v !== 2)) return null;
    const st = defaultState();
    for (const k of ["seed", "budget", "masons", "rim", "k1", "k2", "k3", "patience", "mobility", "flight"]) if (typeof o[k] === "number") st[k] = o[k];
    if (Array.isArray(o.axis)) st.axis = o.axis.slice(0, 5).map(Number);
    Object.assign(st.oxide, o.oxide || {});
    Object.assign(st.brain, o.brain || {});
    Object.assign(st.pop, o.pop || {});
    if (o.sub && SHAPES.includes(o.sub.shape)) st.sub = { shape: o.sub.shape, R: Math.max(12, Math.min(44, +o.sub.R || 30)) };
    const n = Math.max(4, Math.min(48, o.ic && o.ic.n || 24));
    st.ic = { n, z: (o.ic && o.ic.z) || 0, h: unpackHeights((o.ic && o.ic.h) || "", n) };
    st.tic = { z: (o.tic && o.tic.z) || 0, cells: unpackCells((o.tic && o.tic.c) || "") };
    return st;
  } catch (e) { return null; }
}

// The engine's genome for a playground state. `habit: "lab"` so nothing
// downstream mistakes it for a specimen.
function toGenome(st) {
  const g = {
    seed: normalizeSeed(st.seed), habit: "lab", habitDesc: "playground", label: "playground", grid: GRID,
    masons: st.masons, budget: st.budget, rim: st.rim,
    k1: st.k1, k2: st.k2, k3: st.k3,
    patience: st.patience, mobility: st.mobility, flight: st.flight,
    axis: st.axis.concat([0]),
    nuclei: [],
    oxide: Object.assign({}, st.oxide),
    brain: Object.assign({}, st.brain),
    population: Object.assign({}, st.pop),
  };
  if (st.sub.shape === "grid") {
    const voxels = [];
    const n = st.ic.n, half = n >> 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const h = st.ic.h[j * n + i];
      for (let k = 0; k < h; k++) voxels.push([i - half, j - half, st.ic.z + k]);
    }
    g.voxels = voxels;
  } else {
    const cells = [];
    for (const [t, h] of st.tic.cells) if (h) cells.push([t, h]);
    g.substrate = { shape: st.sub.shape, R: st.sub.R, ic: { cells }, z0: 6 + st.tic.z };
  }
  return g;
}

// ------------------------------------------------------------ presets ----
// On the cubic grid, presets paint the height map; on a tiling they paint
// every tile whose centroid falls in the same footprint.
const PRESETS = {
  clear: () => [],
  plate: () => [[-3, -3, 3, 3, 2]],
  wide: () => [[-8, -8, 8, 8, 1]],
  ring: () => [[-7, -7, 7, 7, 2], [-4, -4, 4, 4, 0]],
  cross: () => [[-9, -1, 9, 1, 2], [-1, -9, 1, 9, 2]],
  bar: () => [[-10, -2, 10, 2, 2]],
  twins: () => [[-9, -3, -3, 3, 2], [3, -3, 9, 3, 2]],
  pillar: () => [[-2, -2, 2, 2, 10]],
  walls: () => [[-3, -3, 3, 3, 1], [-10, -10, 10, -9, 8], [-10, 9, 10, 10, 8], [-10, -10, -9, 10, 8]],
};
function paintBoxesGrid(h, n, boxes) {
  const half = n >> 1;
  for (const [x0, y0, x1, y1, v] of boxes) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = x + half, j = y + half;
    if (i >= 0 && j >= 0 && i < n && j < n) h[j * n + i] = v;
  }
}
function paintBoxesTiling(cells, T, boxes) {
  for (const [x0, y0, x1, y1, v] of boxes) {
    for (let t = 0; t < T.n; t++) {
      const x = T.cx[t] / FIX, y = T.cy[t] / FIX;
      if (x >= x0 - 0.5 && x <= x1 + 0.5 && y >= y0 - 0.5 && y <= y1 + 0.5) { if (v) cells.set(t, v); else cells.delete(t); }
    }
  }
}

// ---------------------------------------------------------------- app ----
class Lab {
  constructor() {
    this.canvas = $("#gl");
    this.renderer = new Renderer(this.canvas);
    this.renderer.autoSpin = 0.08;
    this.paused = false;
    this.turbo = false;
    this.pace = 240;
    this.last = performance.now();
    this.debt = 0;
    this.edited = false;
    this.tilingCache = new Map();
    const fromHash = location.hash.startsWith("#s=") ? decodeState(location.hash.slice(3)) : null;
    this.state = fromHash || defaultState();
    if (!fromHash) { this.state.ic.h = new Uint8Array(24 * 24); paintBoxesGrid(this.state.ic.h, 24, PRESETS.plate()); }
    this.bindPanel();
    this.bindPaint();
    this.bindActions();
    this.syncPanel();
    this.reset();
    requestAnimationFrame((t) => this.loop(t));
  }

  // the tiling the painter draws (built once per shape and radius)
  tilingFor(shape, R) {
    const key = shape + ":" + R;
    let T = this.tilingCache.get(key);
    if (!T) { T = tiling(shape, R); this.tilingCache.set(key, T); if (this.tilingCache.size > 6) this.tilingCache.delete(this.tilingCache.keys().next().value); }
    return T;
  }
  isTiling() { return this.state.sub.shape !== "grid"; }

  // --------------------------------------------------------- growth ----
  reset() {
    this.growth = new Growth(toGenome(this.state));
    this.renderer.setGrowth(this.growth);
    this.renderer.sync(true);
    this.renderer.snapCamera();
    this.renderer.cool = 1.6;
    this.debt = 0;
    this.finished = false;
    this.edited = false;
    window.__done = false;
    this.writeHash();
    this.updateHUD();
  }

  // Push the current laws into the running engine without restarting it.
  applyLive() {
    const g = this.growth, st = this.state;
    const gen = toGenome(st);
    // colony 0 follows the panel; deployed packs keep the laws they were deployed with
    Object.assign(g.genome, { budget: gen.budget, patience: gen.patience, mobility: gen.mobility, flight: gen.flight, oxide: gen.oxide });
    g.brain = Object.assign({}, DEFAULT_BRAIN, gen.brain);
    g.pop = Object.assign({}, DEFAULT_POPULATION, gen.population);
    g.axis = gen.axis.slice();
    g.rim = gen.rim;
    if (!g.cooling) g.K = [0, gen.k1, gen.k2, gen.k3, 1, 1, 1, 1, 1, 1, 1];
    else g.K = [0, 0, gen.k2, gen.k3, 1, 1, 1, 1, 1, 1, 1];
    const c0 = g.colonies[0];
    if (c0.done && c0.laid < gen.budget) { c0.done = false; c0.cooling = false; c0.stalled = 0; this.finished = false; }
    this.edited = true;
    this.writeHash();
    this.updateHUD();
  }

  skip() { this.growth.run(); this.renderer.sync(true); this.renderer.snapCamera(); this.finish(); }

  // reseed from this plane: a new colony on the summit, with the current laws
  deployPack(at) {
    const st = this.state, gen = toGenome(st);
    const pack = { masons: gen.masons, budget: gen.budget, rim: gen.rim, k1: gen.k1, k2: gen.k2, k3: gen.k3, patience: gen.patience, mobility: gen.mobility, flight: gen.flight,
      axis: gen.axis, brain: gen.brain, population: gen.population, oxide: gen.oxide, size: +$("#packsize").value, thick: 1 };
    const idx = this.growth.deploy(pack, at);
    if (idx < 0) { this.toast("nowhere to reseed"); return; }
    this.finished = false;
    this.edited = true;
    this.renderer.sync(false);
    const col = this.growth.colonies[idx];
    this.toast(`pack ${idx} on the plane at z ${col.floor} — ${gen.masons} masons, budget ${fmt(gen.budget)}; everything else froze`);
    this.updateHUD();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    const st = this.growth.stats();
    $("#stats").textContent =
      `${fmt(st.bricks)} bricks · ${st.terraces} terraces on the midline · pit ${fmt(st.pit)} cells · hollowness ${st.hollowness.toFixed(2)} · ` +
      `${st.box.map((v) => Math.round(v)).join("×")} · ${fmt(st.ticks)} ticks · ${st.masons} masons alive, ${st.retired} retired` +
      (st.tiling ? ` · ${fmt(st.tiles)} ${SHAPE_INFO[st.tiling].label} tiles` : "");
    window.__done = true;
    this.updateHUD();
  }

  updateHUD() {
    const g = this.growth, gen = g.genome;
    const laid = g.bricks.length - g.nucleusBricks;
    $("#bar").style.transform = `scaleX(${Math.min(1, laid / Math.max(1, gen.budget))})`;
    const alive = g.masons.length, onSurf = g.masons.filter((m) => m.state === "surface").length;
    $("#count").textContent = g.done
      ? `${fmt(g.bricks.length)} bricks · grown${this.edited ? " · edited live — reset to replay from the link" : ""}`
      : `${fmt(g.bricks.length)} bricks · ${onSurf}/${alive} masons on the surface${g.retired ? ` · ${g.retired} retired` : ""}${g.cooling ? " · cooling" : ""}${this.paused ? " · paused" : ""}${this.edited ? " · edited live" : ""}`;
    if (!g.done && this.finished === false) $("#stats").textContent = "";
    $("#pause").textContent = this.paused ? "resume" : "pause";
    $("#pause").hidden = g.done; $("#step").hidden = g.done; $("#skip").hidden = g.done;
    const ev = g.events.length, cols = g.colonies.length;
    const growing = g.colonies.filter((c) => !c.done).length, frozen = g.colonies.filter((c) => c.frozen).length;
    $("#packnote").textContent = cols > 1 || ev ? `${cols} colonies (${growing} growing, ${frozen} frozen) · floor z ${g.colonies[cols - 1].floor} · ${ev} events (${g.events.filter((e) => e.kind === "deploy").length} deployed, ${g.events.filter((e) => e.kind === "remove").length} removed)` : "one colony, no interventions yet";
    const P = this.state.pop;
    $("#popnote").textContent = P.birthEvery || P.retireAfter
      ? `${P.birthEvery ? "a birth every " + P.birthEvery + " bricks" : "no births"}, ${P.retireAfter ? "retire after " + P.retireAfter : "nobody retires"}; ${P.min}–${P.max} alive`
      : "a fixed colony — what the specimens use";
  }

  loop(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    const g = this.growth;
    if (!g.done && !this.paused) {
      this.debt += this.pace * dt;
      const deadline = performance.now() + 7;
      const before = g.bricks.length;
      let steps = 0;
      while (!g.done && (this.turbo || g.bricks.length - before < this.debt)) {
        g.step();
        if ((++steps & 63) === 0 && performance.now() > deadline) break;
      }
      this.debt -= g.bricks.length - before;
      if (this.debt > 40) this.debt = 40;
      this.renderer.sync(false);
      if (g.done) this.finish();
      this.updateHUD();
    }
    this.renderer.frame(dt, g.done ? null : g.masons);
    requestAnimationFrame((tt) => this.loop(tt));
  }

  // ---------------------------------------------------------- panel ----
  bindPanel() {
    const st = this.state;
    const wire = (input, get, set) => {
      const out = input.parentElement.querySelector("output");
      const show = () => { if (out) out.textContent = String(get()); };
      input._show = show;
      input.addEventListener("input", () => {
        set(input.type === "checkbox" ? input.checked : parseFloat(input.value));
        show();
        this.onEdit(input);
      });
    };
    for (const el of $$("[data-k]")) { const k = el.dataset.k; wire(el, () => st[k], (v) => { st[k] = v; }); }
    for (const el of $$("[data-axis]")) { const i = +el.dataset.axis; wire(el, () => st.axis[i].toFixed(2), (v) => { st.axis[i] = v; }); }
    for (const el of $$("[data-brain]")) { const k = el.dataset.brain; wire(el, () => st.brain[k], (v) => { st.brain[k] = v; }); }
    for (const el of $$("[data-pop]")) { const k = el.dataset.pop; wire(el, () => st.pop[k], (v) => { st.pop[k] = v; }); }
    for (const el of $$("[data-ox]")) { const k = el.dataset.ox; wire(el, () => st.oxide[k], (v) => { st.oxide[k] = v; }); }
    $("#pace").addEventListener("input", (e) => { this.pace = +e.target.value; $("#pace-out").textContent = this.pace; });
    $("#packsize").addEventListener("input", (e) => { $("#packsize-out").textContent = e.target.value; });
    $("#deploy").addEventListener("click", () => this.deployPack(null));
    const setMode = (mode) => {
      this.mode = this.mode === mode ? null : mode;
      $("#reseed").textContent = this.mode === "reseed" ? "reseed: click a brick — on" : "reseed: click a brick";
      $("#reseed").classList.toggle("primary", this.mode === "reseed");
      $("#demolish").textContent = "demolish: " + (this.mode === "demolish" ? "on — click bricks" : "off");
      $("#demolish").classList.toggle("primary", this.mode === "demolish");
      this.canvas.style.cursor = this.mode ? "crosshair" : "grab";
    };
    $("#reseed").addEventListener("click", () => setMode("reseed"));
    $("#demolish").addEventListener("click", () => setMode("demolish"));
    this.canvas.addEventListener("pointerdown", (e) => {
      if (!this.mode || e.button !== 0) return;
      const r = this.canvas.getBoundingClientRect();
      const s = this.renderer.pick(e.clientX - r.left, e.clientY - r.top);
      if (s < 0) return;
      e.stopImmediatePropagation();
      if (this.mode === "demolish") { if (this.growth.remove(s)) { this.edited = true; this.renderer.sync(false); this.updateHUD(); } }
      else { const at = this.growth.sub.describe(s); at.z += 1; this.deployPack(at); }
    }, true);
    $("#turbo").addEventListener("change", (e) => { this.turbo = e.target.checked; });
    $("#brain-default").addEventListener("click", () => { this.loadBrain(genome(48112), true); });
    $("#brain-random").addEventListener("click", () => { this.loadBrain(genome(1 + Math.floor(Math.random() * 900000))); });
    $("#seedload-btn").addEventListener("click", () => { const v = parseInt($("#seedload").value, 10); if (v > 0) this.loadBrain(genome(v)); });
    $("#seedload").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#seedload-btn").click(); } });
    // substrate chips
    const chips = $("#shapes");
    for (const sh of SHAPES) {
      const b = document.createElement("button");
      b.textContent = SHAPE_INFO[sh].label;
      b.dataset.shape = sh;
      b.addEventListener("click", () => this.setShape(sh));
      chips.appendChild(b);
    }
    $("#tileR").addEventListener("input", (e) => {
      st.sub.R = +e.target.value; $("#tileR-out").textContent = st.sub.R;
      // keep painted tiles that still exist; heights are by tile index, which
      // changes with the radius, so re-paint the same footprint by position
      const old = this.tilingFor(this.prevShape || st.sub.shape, this.prevR || st.sub.R);
      const T = this.tilingFor(st.sub.shape, st.sub.R);
      const cells = new Map();
      for (const [t, h] of st.tic.cells) { if (t < old.n) { const u = T.locate(old.cx[t], old.cy[t]); if (u >= 0) cells.set(u, h); } }
      st.tic.cells = cells; this.prevR = st.sub.R;
      this.drawPaint(); this.reset();
    });
  }

  setShape(sh) {
    const st = this.state;
    if (sh === st.sub.shape) return;
    const wasGrid = st.sub.shape === "grid";
    st.sub.shape = sh;
    this.prevShape = sh; this.prevR = st.sub.R;
    if (sh !== "grid" && (wasGrid || st.tic.cells.size === 0)) {
      // carry the painted footprint over from the grid, by position
      const T = this.tilingFor(sh, st.sub.R), cells = new Map();
      const n = st.ic.n, half = n >> 1;
      for (let t = 0; t < T.n; t++) {
        const i = Math.floor(T.cx[t] / FIX + half + 0.5), j = Math.floor(T.cy[t] / FIX + half + 0.5);
        if (i >= 0 && j >= 0 && i < n && j < n && st.ic.h[j * n + i]) cells.set(t, st.ic.h[j * n + i]);
      }
      if (cells.size === 0) paintBoxesTiling(cells, T, PRESETS.plate());
      st.tic.cells = cells;
    }
    this.syncPanel();
    this.reset();
  }

  // Which edits restart the growth (the substrate, initial condition and the
  // colony's starting size cannot change under a running crystal) and which
  // apply live.
  onEdit(input) {
    const restart = input.dataset.k === "masons" || input.dataset.k === "seed";
    if (restart) this.reset(); else this.applyLive();
  }

  // Import a specimen's laws (kinetics, anisotropy, oxide, colony size), and
  // with `defaults` the default brain too. The substrate and the painted
  // initial condition stay.
  loadBrain(g, defaults = false) {
    const st = this.state;
    Object.assign(st, { masons: g.masons, rim: g.rim, k1: g.k1, k2: g.k2, k3: g.k3, patience: g.patience, mobility: g.mobility, flight: g.flight });
    st.axis = g.axis.slice(0, 5);
    st.oxide = { base: Math.round(g.oxide.base), ramp: Math.round(g.oxide.ramp), grain: +g.oxide.grain.toFixed(1), warp: +g.oxide.warp.toFixed(2), wavelength: +g.oxide.wavelength.toFixed(1) };
    if (defaults) { st.brain = Object.assign({}, DEFAULT_BRAIN); st.pop = Object.assign({}, DEFAULT_POPULATION); }
    this.syncPanel();
    this.reset();
    this.toast(defaults ? "default brain" : `brain of specimen № ${fmt(g.seed)} — ${g.label}`);
  }

  syncPanel() {
    const st = this.state;
    const put = (el, v) => { if (el.type === "checkbox") el.checked = !!v; else el.value = v; if (el._show) el._show(); };
    for (const el of $$("[data-k]")) put(el, st[el.dataset.k]);
    for (const el of $$("[data-axis]")) put(el, st.axis[+el.dataset.axis]);
    for (const el of $$("[data-brain]")) put(el, st.brain[el.dataset.brain]);
    for (const el of $$("[data-pop]")) put(el, st.pop[el.dataset.pop]);
    for (const el of $$("[data-ox]")) put(el, st.oxide[el.dataset.ox]);
    $("#gridn").value = st.ic.n; $("#gridn-out").textContent = st.ic.n;
    $("#tileR").value = st.sub.R; $("#tileR-out").textContent = st.sub.R;
    for (const b of $$("#shapes button")) b.classList.toggle("on", b.dataset.shape === st.sub.shape);
    const info = SHAPE_INFO[st.sub.shape];
    $("#shapenote").textContent = st.sub.shape === "grid"
      ? "the cubic lattice — what the specimens grow on; right angles come from here, not from the brain"
      : `${info.note} · ${info.family}, ${info.symmetry}-fold · stacked into prisms: a ${info.family === "aperiodic" ? "quasicrystal" : "columnar crystal"}, periodic along z`;
    $("#gridrow").style.display = st.sub.shape === "grid" ? "" : "none";
    $("#rrow").style.display = st.sub.shape === "grid" ? "none" : "";
    this.drawPaint();
  }

  // ---------------------------------------------------------- paint ----
  bindPaint() {
    const cv = this.paintCanvas = $("#paint");
    const ctx = cv.getContext("2d");
    this.pctx = ctx;
    let painting = false, value = 0;
    const cellGrid = (e) => {
      const r = cv.getBoundingClientRect();
      const n = this.state.ic.n;
      const i = Math.floor((e.clientX - r.left) / r.width * n), j = Math.floor((e.clientY - r.top) / r.height * n);
      return i >= 0 && j >= 0 && i < n && j < n ? j * n + i : -1;
    };
    const tileAt = (e) => {
      const r = cv.getBoundingClientRect();
      const R = this.state.sub.R + 1;
      const x = ((e.clientX - r.left) / r.width * 2 - 1) * R, y = ((e.clientY - r.top) / r.height * 2 - 1) * R;
      return this.tilingFor(this.state.sub.shape, this.state.sub.R).locate(Math.round(x * FIX), Math.round(y * FIX));
    };
    const apply = (e) => {
      const st = this.state;
      if (this.isTiling()) {
        const t = tileAt(e);
        if (t < 0) return;
        const cur = st.tic.cells.get(t) || 0;
        if (cur !== value) { if (value) st.tic.cells.set(t, value); else st.tic.cells.delete(t); this.drawPaint(); this.paintDirty = true; }
        return;
      }
      const k = cellGrid(e);
      if (k < 0) return;
      const h = st.ic.h;
      if (h[k] !== value) { h[k] = value; this.drawPaint(); this.paintDirty = true; }
    };
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    cv.addEventListener("pointerdown", (e) => {
      painting = true;
      value = (e.button === 2 || e.shiftKey) ? 0 : +$("#brush").value;
      cv.setPointerCapture(e.pointerId);
      apply(e);
    });
    cv.addEventListener("pointermove", (e) => { if (painting) apply(e); });
    const up = () => { if (painting && this.paintDirty) { this.paintDirty = false; this.reset(); } painting = false; };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    $("#brush").addEventListener("input", (e) => { $("#brush-out").textContent = e.target.value; });
    $("#gridn").addEventListener("input", (e) => {
      const n = +e.target.value, old = this.state.ic;
      const h = new Uint8Array(n * n), oh = old.n >> 1, nh = n >> 1;
      for (let j = 0; j < old.n; j++) for (let i = 0; i < old.n; i++) {
        const x = i - oh + nh, y = j - oh + nh;
        if (x >= 0 && y >= 0 && x < n && y < n) h[y * n + x] = old.h[j * old.n + i];
      }
      this.state.ic = { n, z: old.z, h };
      $("#gridn-out").textContent = n;
      this.drawPaint();
      this.reset();
    });
    for (const b of $$("#presets button")) b.addEventListener("click", () => {
      const st = this.state, boxes = PRESETS[b.dataset.preset]();
      if (this.isTiling()) { st.tic.cells = new Map(); paintBoxesTiling(st.tic.cells, this.tilingFor(st.sub.shape, st.sub.R), boxes); }
      else { st.ic.h = new Uint8Array(st.ic.n * st.ic.n); paintBoxesGrid(st.ic.h, st.ic.n, boxes); }
      this.drawPaint();
      this.reset();
    });
  }

  heightColour(v) {
    const t = Math.min(1, v / 12);
    // dark bronze → gold → pale, the same climb the crystal makes
    return `rgb(${Math.round(90 + 150 * t)},${Math.round(60 + 130 * t)},${Math.round(30 + 90 * t * t)})`;
  }

  drawPaint() {
    const ctx = this.pctx, cv = this.paintCanvas, W = cv.width;
    ctx.fillStyle = "#0a0a10"; ctx.fillRect(0, 0, W, W);
    if (this.isTiling()) {
      const st = this.state, T = this.tilingFor(st.sub.shape, st.sub.R), R = st.sub.R + 1;
      const sx = (x) => (x / R + 1) * W / 2, sy = (y) => (y / R + 1) * W / 2;
      ctx.lineWidth = 0.6;
      for (let t = 0; t < T.n; t++) {
        const poly = T.polygon(t), h = st.tic.cells.get(t) || 0;
        ctx.beginPath();
        ctx.moveTo(sx(poly[0][0]), sy(poly[0][1]));
        for (let i = 1; i < poly.length; i++) ctx.lineTo(sx(poly[i][0]), sy(poly[i][1]));
        ctx.closePath();
        if (h) { ctx.fillStyle = this.heightColour(h); ctx.fill(); }
        ctx.strokeStyle = T.deep[t] ? "rgba(232,228,220,0.10)" : "rgba(232,228,220,0.035)";
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(224,179,90,0.5)";
      ctx.beginPath(); ctx.moveTo(W / 2 - 6, W / 2); ctx.lineTo(W / 2 + 6, W / 2); ctx.moveTo(W / 2, W / 2 - 6); ctx.lineTo(W / 2, W / 2 + 6); ctx.stroke();
      return;
    }
    const n = this.state.ic.n, h = this.state.ic.h, s = W / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = h[j * n + i];
      if (!v) continue;
      ctx.fillStyle = this.heightColour(v);
      ctx.fillRect(i * s + 0.5, j * s + 0.5, s - 1, s - 1);
      if (s >= 12) { ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.font = `${Math.floor(s * 0.55)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(v), i * s + s / 2, j * s + s / 2 + 1); }
    }
    ctx.strokeStyle = "rgba(232,228,220,0.07)";
    ctx.lineWidth = 1;
    for (let k = 0; k <= n; k++) { ctx.beginPath(); ctx.moveTo(k * s, 0); ctx.lineTo(k * s, W); ctx.moveTo(0, k * s); ctx.lineTo(W, k * s); ctx.stroke(); }
    const c = (n >> 1) * s;
    ctx.strokeStyle = "rgba(224,179,90,0.5)";
    ctx.beginPath(); ctx.moveTo(c - 6, c); ctx.lineTo(c + 6, c); ctx.moveTo(c, c - 6); ctx.lineTo(c, c + 6); ctx.stroke();
  }

  // -------------------------------------------------------- actions ----
  bindActions() {
    $("#pause").addEventListener("click", () => { this.paused = !this.paused; this.updateHUD(); });
    $("#step").addEventListener("click", () => { for (let i = 0; i < 100 && !this.growth.done; i++) this.growth.step(); this.renderer.sync(false); if (this.growth.done) this.finish(); this.updateHUD(); });
    $("#skip").addEventListener("click", () => this.skip());
    $("#reset").addEventListener("click", () => this.reset());
    const share = async (e) => {
      if (e) e.preventDefault();
      this.writeHash();
      const url = location.href;
      try { await navigator.clipboard.writeText(url); this.toast("link copied — this playground, exactly"); }
      catch (err) { this.toast(url); }
    };
    $("#share").addEventListener("click", share);
    $("#share2").addEventListener("click", share);
    $("#paneltoggle").addEventListener("click", () => $("#panel").classList.toggle("hidden"));
    window.addEventListener("keydown", (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") { e.preventDefault(); this.paused = !this.paused; this.updateHUD(); }
      else if (e.key === "r") this.reset();
      else if (e.key === "s") this.skip();
      else if (e.key === ".") $("#step").click();
      else if (e.key === "l") $("#panel").classList.toggle("hidden");
    });
    window.addEventListener("hashchange", () => {
      const st = location.hash.startsWith("#s=") ? decodeState(location.hash.slice(3)) : null;
      if (st && encodeState(st) !== encodeState(this.state)) { this.state = st; this.syncPanel(); this.reset(); }
    });
  }

  writeHash() {
    const enc = "#s=" + encodeState(this.state);
    if (location.hash !== enc) history.replaceState(null, "", enc);
  }

  toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(this._toast);
    this._toast = setTimeout(() => el.classList.remove("show"), 2400);
  }
}

try {
  window.__lab = new Lab();
} catch (err) {
  const el = $("#err");
  el.hidden = false;
  el.textContent = "the playground needs WebGL — " + (err && err.message ? err.message : err);
  console.error(err);
}
export { toGenome, encodeState, decodeState };
