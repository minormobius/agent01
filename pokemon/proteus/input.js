// input.js — pointer/touch handling. Translates strokes on the map canvas
// into intent fields painted onto sensor nodes.
//
// Left button / single touch  -> intent_push (extrude outward).
// Right button / two-finger   -> intent_release (drop adhesion).
//
// Mapping rule: a brush at canvas pixel (px, py) with radius R writes a
// Gaussian falloff into every node whose (mapU, mapV) is within R, with
// horizontal wrap. Magnitude scales with stroke speed / dwell time.

const INTENT_GAIN = 0.06;     // per-frame contribution at brush center
const INTENT_MAX  = 1.0;

export function attachInput({ canvas, sim, getBrushRadius }) {
  const state = {
    pressed: false,
    mode: 'push',
    px: 0, py: 0,
    activePointers: new Map(),  // pointerId -> {x, y}
  };

  // Suppress browser context menu so right-click is usable.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function setPointer(e) {
    const rect = canvas.getBoundingClientRect();
    state.px = (e.clientX - rect.left) * (canvas.width  / rect.width);
    state.py = (e.clientY - rect.top)  * (canvas.height / rect.height);
  }

  // We use pointer events to unify mouse + touch + pen.
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    state.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setPointer(e);
    state.pressed = true;
    // Mode decision:
    //   - mouse right button (button === 2) -> release
    //   - 2+ simultaneous touches -> release
    //   - otherwise -> push
    if (e.pointerType === 'mouse') {
      state.mode = (e.button === 2) ? 'release' : 'push';
    } else {
      state.mode = state.activePointers.size >= 2 ? 'release' : 'push';
    }
    paint(sim, canvas, state.px, state.py, getBrushRadius() * dpr(canvas), state.mode);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!state.pressed) return;
    if (state.activePointers.has(e.pointerId)) {
      state.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    // For touch, two simultaneous pointers = release; otherwise push. Keep
    // mouse mode sticky (it was set by the button at pointerdown).
    if (e.pointerType !== 'mouse') {
      state.mode = state.activePointers.size >= 2 ? 'release' : 'push';
    }
    setPointer(e);
    paint(sim, canvas, state.px, state.py, getBrushRadius() * dpr(canvas), state.mode);
  });

  function endPointer(e) {
    if (state.activePointers.has(e.pointerId)) {
      state.activePointers.delete(e.pointerId);
    }
    if (state.activePointers.size === 0) state.pressed = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', endPointer);

  return state;
}

function dpr(canvas) {
  // Brush slider is in CSS pixels; canvas backbuffer is scaled by devicePixelRatio.
  const rect = canvas.getBoundingClientRect();
  return rect.width > 0 ? (canvas.width / rect.width) : 1;
}

// Paint intent at (px, py) with given radius (pixels) and mode ('push'|'release').
function paint(sim, canvas, px, py, brushPxRad, mode) {
  if (sim.detached) return;     // can't intent without a self
  if (brushPxRad < 2) return;
  const W = canvas.width, H = canvas.height;
  const cu = px / W;
  const cv = py / H;
  const ruU = brushPxRad / W;
  const rvV = brushPxRad / H;
  // Convert to a single Gaussian sigma in UV-space — pick the smaller axis so
  // the brush stays "round" in pixel space.
  const sigU = Math.max(ruU, 1e-3);
  const sigV = Math.max(rvV, 1e-3);

  const nodes = sim.nodes;
  for (let i = 0; i < sim.N; i++) {
    const n = nodes[i];
    let du = n.mapU - cu;
    // Horizontal wrap (azimuth).
    if (du > 0.5)  du -= 1;
    if (du < -0.5) du += 1;
    const dv = n.mapV - cv;
    const r2 = (du * du) / (sigU * sigU) + (dv * dv) / (sigV * sigV);
    if (r2 > 6) continue;       // outside ~3 sigma
    const w = Math.exp(-0.5 * r2);
    if (mode === 'push') {
      n.intent_push = Math.min(INTENT_MAX, n.intent_push + w * INTENT_GAIN);
    } else {
      n.intent_release = Math.min(INTENT_MAX, n.intent_release + w * INTENT_GAIN);
    }
  }
}
