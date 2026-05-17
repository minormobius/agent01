// input.js — pointer/touch handling for the pressure model.
//
// Mechanic:
//   - pointerdown sets an *anchor* at the touch point. The brush is centred at
//     the anchor for the duration of the press; the rest of the pointer's
//     motion is interpreted as a vertical-slider gesture.
//   - dy = currentY - anchorY (canvas backbuffer pixels).
//       dy >= 0  (no drag or pulled down): drive local cortexK *down* toward
//                CORTEX_LOW. Pressure wins locally and the foot extends.
//       dy <  0  (dragged up):              drive local cortexK *up* toward
//                CORTEX_HIGH. Cortex wins, the region retracts.
//   - tickInput() is called once per render frame so a held finger keeps
//     pulling cortexK toward its target even without pointer events.
//   - The brush has a soft Gaussian footprint around the anchor in (mapU, V)
//     space, with V centred on the equator (where the sensor nodes are).

const RATE        = 4.0;     // per-second approach rate for cortexK -> target
const CORTEX_LOW  = 0.05;    // extreme extend (very weak cortex)
const CORTEX_MID  = 0.35;    // mild extend (default when held with no drag)
const CORTEX_HIGH = 2.20;    // extreme retract (very stiff cortex)
const DRAG_PX     = 60;      // CSS pixels of drag for full-strength input

export function attachInput({ canvas, sim, getBrushRadius }) {
  const state = {
    pressed: false,
    anchor: null,     // { px, py } in canvas backbuffer coords
    cur: { px: 0, py: 0 },
    target: 1.0,      // current cortexK target (display + tickInput read this)
    pointerType: 'mouse',
    activePointers: new Map(),
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function setPointer(e) {
    const rect = canvas.getBoundingClientRect();
    state.cur.px = (e.clientX - rect.left) * (canvas.width  / rect.width);
    state.cur.py = (e.clientY - rect.top)  * (canvas.height / rect.height);
  }

  function updateTarget() {
    if (!state.anchor) return;
    const dy = state.cur.py - state.anchor.py;
    const px = DRAG_PX * dpr(canvas);
    if (dy < 0) {
      // Dragged up: retract. Lerp from MID (at dy=0) toward HIGH (at dy=-px).
      const t = Math.min(1, -dy / px);
      state.target = CORTEX_MID + (CORTEX_HIGH - CORTEX_MID) * t;
    } else {
      // No drag or pulled down: extend. Lerp from MID (dy=0) toward LOW (dy=+px).
      const t = Math.min(1, dy / px);
      state.target = CORTEX_MID + (CORTEX_LOW - CORTEX_MID) * t;
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    state.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setPointer(e);
    state.pressed = true;
    state.pointerType = e.pointerType;
    state.anchor = { px: state.cur.px, py: state.cur.py };
    updateTarget();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!state.pressed) return;
    if (state.activePointers.has(e.pointerId)) {
      state.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    setPointer(e);
    updateTarget();
  });

  function endPointer(e) {
    if (state.activePointers.has(e.pointerId)) {
      state.activePointers.delete(e.pointerId);
    }
    if (state.activePointers.size === 0) {
      state.pressed = false;
      state.anchor = null;
      state.target = 1.0;
    }
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', endPointer);

  return state;
}

function dpr(canvas) {
  const rect = canvas.getBoundingClientRect();
  return rect.width > 0 ? (canvas.width / rect.width) : 1;
}

// Called once per render frame from the main loop. Drives cortexK at the
// brush footprint toward state.target at RATE per second.
export function tickInput(canvas, sim, state, getBrushRadius, dt) {
  if (!state.pressed || !state.anchor || sim.detached) return;
  const W = canvas.width, H = canvas.height;
  if (W < 2 || H < 2) return;

  const brushPxRad = getBrushRadius() * dpr(canvas);
  if (brushPxRad < 2) return;

  const cu = state.anchor.px / W;
  const cv = state.anchor.py / H;
  const sigU = Math.max(brushPxRad / W, 1e-3);
  const sigV = Math.max(brushPxRad / H, 1e-3);
  const target = state.target;
  const stepFactor = 1 - Math.exp(-RATE * dt);

  const nodes = sim.nodes;
  for (let i = 0; i < sim.N; i++) {
    const n = nodes[i];
    let du = n.mapU - cu;
    if (du > 0.5)  du -= 1;
    if (du < -0.5) du += 1;
    const dv = 0.5 - cv;
    const r2 = (du * du) / (sigU * sigU) + (dv * dv) / (sigV * sigV);
    if (r2 > 6) continue;
    const w = Math.exp(-0.5 * r2);
    // Pull cortexK toward target. Brush strength weights the approach so the
    // centre of the brush moves fastest, edges barely.
    n.cortexK += (target - n.cortexK) * stepFactor * w;
  }
}
