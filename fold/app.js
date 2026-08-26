// app.js — wiring. Owns the clock, the camera, the controls, and the decision
// of how many integration steps to run per displayed frame.
//
// The pacing is the one thing here worth reading carefully. These proteins fold
// in 40–90k steps (engine/src/check.rs `check profile`), and the engine runs
// tens of thousands of steps a second, so at full tilt everything would fold in
// under a second and there would be nothing to watch. So the step budget is set
// from a target *watching* time, then clamped by a measured time budget so a
// slow machine drops simulation rate instead of frames.

import { Engine, DEFAULTS, STAT } from './engine.js';
import { Renderer } from './gl.js';
import { ContactMap, Funnel, Trace, SequenceStrip, INK } from './panels.js';

const $ = (s) => document.querySelector(s);

/** Steps per residue to fold, measured. Sets the base pace. */
const STEPS_PER_RESIDUE = 1200;
/** Seconds a fold should take at speed 1x. Paced against the wall clock, not
 *  against frames: a machine that renders at 15fps should show a choppier fold
 *  of the same duration, not the same fold four times slower. */
const TARGET_SECONDS = 12;
/** Milliseconds of integration allowed per frame before we back off. */
const STEP_BUDGET_MS = 7;

const state = {
  playing: true,
  speed: 1,
  temp: DEFAULTS.temp,
  showGhost: true,
  showWires: true,
  seed: 1,
  stepsPerFrame: 40,
  fps: 60,
  autoRotate: true,
};

const cam = {
  theta: 0.6,
  phi: 1.15,
  dist: 90,
  target: 90,
  fov: (46 * Math.PI) / 180,
  near: 1,
  far: 4000,
  eye: [0, 0, 90],
  center: [0, 0, 0],
  up: [0, 1, 0],
};

let engine, renderer, proteins, current;
let map, funnel, traceQ, traceR, strip;
let lastPanel = 0;
let lastFpsAt = performance.now();
let frames = 0;

// ---------------------------------------------------------------- boot
async function boot() {
  try {
    const [list, eng] = await Promise.all([
      fetch('./proteins.json').then((r) => {
        if (!r.ok) throw new Error(`proteins.json: HTTP ${r.status}`);
        return r.json();
      }),
      Engine.load('./fold.wasm'),
    ]);
    proteins = list;
    engine = eng;
    renderer = new Renderer($('#scene'));
  } catch (err) {
    fail(err);
    return;
  }

  const tip = $('#tip');
  map = new ContactMap($('#map'), tip);
  funnel = new Funnel($('#funnel'), tip);
  traceQ = new Trace($('#traceQ'), {
    color: INK.blue,
    title: 'Q  native contacts made',
    format: (v) => v.toFixed(2),
    lo: 0,
    hi: 1,
  });
  traceR = new Trace($('#traceR'), {
    color: INK.aqua,
    title: 'RMSD to native',
    format: (v) => `${v.toFixed(1)} Å`,
    lo: 0,
    hi: 12,
    autoHi: true,
  });
  strip = new SequenceStrip($('#strip'), tip);

  buildPicker();
  wireControls();
  select(proteins.findIndex((p) => p.id === '2F4K') >= 0 ? proteins.findIndex((p) => p.id === '2F4K') : 0);

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
}

function fail(err) {
  console.error(err);
  $('#fail').hidden = false;
  $('#failMsg').textContent = String(err && err.message ? err.message : err);
}

// ---------------------------------------------------------------- protein
function buildPicker() {
  const host = $('#picker');
  host.innerHTML = '';
  proteins.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'pick';
    b.type = 'button';
    b.dataset.i = String(i);
    b.innerHTML =
      `<span class="pick-name">${p.name}</span>` +
      `<span class="pick-meta">${p.id} · ${p.n} aa</span>`;
    b.addEventListener('click', () => select(i));
    host.appendChild(b);
  });
}

function select(i) {
  current = proteins[i];
  for (const b of document.querySelectorAll('.pick')) {
    b.setAttribute('aria-current', b.dataset.i === String(i) ? 'true' : 'false');
  }

  engine.mount(current.ca, { cutoff: DEFAULTS.cutoff, subdiv: tessFor(current.n), sides: 10 });
  engine.setParams({ ...DEFAULTS, temp: state.temp });

  // topology first: the index buffer serves the live tube and the ghost alike
  engine.buildMesh(tubeRadius());
  const idxCount = engine.buildIndices();
  renderer.uploadIndices(engine.indices.slice(0, idxCount));
  engine.buildGhost(tubeRadius() * 0.5);
  renderer.uploadTube(engine.ghost, 'ghost');

  restart();

  cam.target = framingDistance(engine.radius);
  cam.dist = cam.target;

  map.setProtein(current, engine.contacts, engine.nContacts);
  strip.setProtein(current);

  $('#pName').textContent = current.name;
  $('#pSub').textContent = current.sub;
  $('#pBlurb').textContent = current.blurb;
  $('#pId').textContent = current.id;
  $('#pId').href = `https://www.rcsb.org/structure/${current.id}`;
  $('#mContacts').textContent = String(engine.nContacts);
  $('#mLen').textContent = `${current.n} aa`;
  renderPanels(true);
}

/** Fewer spline samples per residue on long chains — the tube is rebuilt every
 *  frame, and 395 residues at full tessellation is 28k vertices of pointless
 *  detail at the zoom you actually view it from. */
function tessFor(n) {
  return n > 240 ? 3 : n > 120 ? 4 : 6;
}

function tubeRadius() {
  return current && current.n > 200 ? 1.15 : 1.45;
}

function framingDistance(radius) {
  return (Math.max(radius, 8) * 1.35) / Math.tan(cam.fov / 2);
}

function restart() {
  state.seed = (state.seed + 1) >>> 0;
  engine.reset(state.seed, $('#startMode').value);
  funnel.reset();
  traceQ.reset();
  traceR.reset();
  $('#diverged').hidden = true;
}

// ---------------------------------------------------------------- controls
function wireControls() {
  $('#play').addEventListener('click', () => {
    state.playing = !state.playing;
    syncPlay();
  });
  $('#restart').addEventListener('click', restart);
  $('#startMode').addEventListener('change', restart);

  const temp = $('#temp');
  temp.addEventListener('input', () => {
    state.temp = Number(temp.value);
    engine.setParams({ temp: state.temp });
    $('#tempVal').textContent = state.temp.toFixed(2);
  });

  const speed = $('#speed');
  speed.addEventListener('input', () => {
    state.speed = Number(speed.value);
    $('#speedVal').textContent = `${state.speed.toFixed(1)}×`;
  });

  $('#ghost').addEventListener('change', (e) => (state.showGhost = e.target.checked));
  $('#wires').addEventListener('change', (e) => (state.showWires = e.target.checked));

  $('#about').addEventListener('click', () => {
    $('#sheet').hidden = false;
    $('#sheetClose').focus();
  });
  $('#sheetClose').addEventListener('click', () => {
    $('#sheet').hidden = true;
    $('#about').focus();
  });
  $('#sheet').addEventListener('click', (e) => {
    if (e.target === $('#sheet')) $('#sheet').hidden = true;
  });

  document.addEventListener('keydown', (e) => {
    // Escape first, and unconditionally: opening the sheet leaves focus on the
    // About button, so any guard that skips events targeting a button would
    // make Escape dead exactly when it is needed.
    if (e.key === 'Escape') {
      $('#sheet').hidden = true;
      return;
    }
    if (e.target.matches('input, select, textarea')) return;
    // let a focused button activate natively rather than eating its key
    if (e.target.matches('button') && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === ' ') {
      e.preventDefault();
      state.playing = !state.playing;
      syncPlay();
    } else if (e.key === 'r') {
      restart();
    } else if (e.key === 'g') {
      $('#ghost').click();
    } else if (e.key === 'c') {
      $('#wires').click();
    }
  });

  orbit($('#scene'));
}

function syncPlay() {
  const b = $('#play');
  b.textContent = state.playing ? 'Pause' : 'Play';
  b.setAttribute('aria-pressed', String(state.playing));
}

function orbit(el) {
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    state.autoRotate = false;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    cam.theta -= (e.clientX - drag.x) * 0.006;
    cam.phi = Math.max(0.12, Math.min(Math.PI - 0.12, cam.phi - (e.clientY - drag.y) * 0.006));
    drag = { x: e.clientX, y: e.clientY };
  });
  const end = () => {
    drag = null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      cam.target *= Math.exp(e.deltaY * 0.0012);
      cam.zoomLock = true;
    },
    { passive: false }
  );
}

function resize() {
  const r = $('#scene').getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.resize(Math.max(1, Math.round(r.width * dpr)), Math.max(1, Math.round(r.height * dpr)));
  renderPanels(true);
}

// ---------------------------------------------------------------- loop
function frame(now) {
  requestAnimationFrame(frame);
  if (!engine || !current) return;

  if (state.playing) {
    const t0 = performance.now();
    engine.step(state.stepsPerFrame);
    const dt = performance.now() - t0;
    // Back off hard when over budget, creep back up when under. Keeps a slow
    // machine at 60fps with a slower fold rather than a stuttering fast one.
    const perSecond = ((STEPS_PER_RESIDUE * current.n) / TARGET_SECONDS) * state.speed;
    const base = Math.max(4, Math.round(perSecond / Math.max(6, Math.min(state.fps, 144))));
    if (dt > STEP_BUDGET_MS) {
      state.stepsPerFrame = Math.max(2, Math.floor(state.stepsPerFrame * 0.8));
    } else {
      state.stepsPerFrame = Math.min(base, Math.ceil(state.stepsPerFrame * 1.08) + 1);
    }

    if (engine.diverged()) {
      state.playing = false;
      syncPlay();
      $('#diverged').hidden = false;
    }
  }

  // geometry
  engine.buildMesh(tubeRadius());
  renderer.uploadTube(engine.mesh, 'live');
  if (state.showWires) {
    const lines = engine.buildWires();
    renderer.uploadWires(engine.wire.subarray(0, lines * 2 * 4), lines);
  }

  // camera: follow the chain's own extent so a coil collapsing into a globule
  // stays framed, with the native size as the floor
  const rg = engine.stat(STAT.RG);
  if (!cam.zoomLock) {
    cam.target = framingDistance(Math.max(engine.radius, rg * 2.1));
  }
  cam.dist += (cam.target - cam.dist) * 0.06;
  if (state.autoRotate && state.playing) cam.theta += 0.0016;
  cam.eye = [
    cam.center[0] + cam.dist * Math.sin(cam.phi) * Math.sin(cam.theta),
    cam.center[1] + cam.dist * Math.cos(cam.phi),
    cam.center[2] + cam.dist * Math.sin(cam.phi) * Math.cos(cam.theta),
  ];
  cam.near = Math.max(0.5, cam.dist * 0.02);
  cam.far = cam.dist * 4 + 400;

  // sample the trajectory every frame; the funnel needs points faster than the
  // panels redraw or it takes half a minute to have anything to show
  if (state.playing) {
    funnel.add(engine.stat(STAT.Q), engine.stat(STAT.ENERGY));
  }

  renderer.draw(cam, {
    ghostFit: state.showGhost ? engine.fit() : null,
    showGhost: state.showGhost,
    showWires: state.showWires,
    bloom: 0.9,
    highlight: strip.hovered ?? -1,
    chainLen: current.n,
  });

  frames++;
  if (now - lastFpsAt > 500) {
    state.fps = (frames * 1000) / (now - lastFpsAt);
    frames = 0;
    lastFpsAt = now;
  }

  // Panels at ~15 Hz. They are canvas-2D and cheap, but not free, and nothing
  // in them is legible at 60.
  if (now - lastPanel > 66) {
    lastPanel = now;
    renderPanels(false);
  }
}

function renderPanels(force) {
  if (!engine || !current) return;
  const s = engine.stats();

  map.update(engine.formed);
  strip.update(engine.resq);
  if (state.playing || force) {
    traceQ.add(s.q);
    traceR.add(s.rmsd);
  }
  map.render();
  funnel.render();
  traceQ.render();
  traceR.render();
  strip.render();

  $('#mQ').textContent = s.q.toFixed(3);
  $('#mFormed').textContent = `${s.formed | 0}/${s.nContact | 0}`;
  $('#mRmsd').textContent = `${s.rmsd.toFixed(2)} Å`;
  $('#mRg').textContent = `${s.rg.toFixed(1)} Å`;
  $('#mEnergy').textContent = s.energy.toFixed(0);
  $('#mSteps').textContent = fmtSteps(s.steps);
  $('#mRate').textContent = `${Math.round(state.stepsPerFrame * state.fps).toLocaleString()} steps/s`;
  $('#mFps').textContent = `${Math.round(state.fps)} fps`;

  const folded = s.q >= 0.85;
  $('#verdict').textContent = folded ? 'folded' : s.q > 0.4 ? 'collapsing' : 'searching';
  $('#verdict').dataset.state = folded ? 'folded' : s.q > 0.4 ? 'mid' : 'coil';
}

function fmtSteps(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return String(v | 0);
}

boot();
