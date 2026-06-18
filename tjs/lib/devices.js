// devices.js — the device-type registry for the deck. Each type knows its
// degrees of freedom, default parameters, the local-frame offset of its MOVING
// output ("carriage") as a function of joint state, a reach envelope, and a
// geometry SPEC (a flat list of primitives tagged frame/carriage). The spec is
// plain data — deckscene.js turns it into three.js meshes — so this module stays
// three-free and node-testable.
//
// Local-frame conventions (millimetres, +Y up):
//   linear  — origin at the travel "zero" end; the stage slides along axisVec by
//             its joint value p ∈ [0, travel]. axis 'z' travels DOWNWARD.
//   hbot    — origin at the bed centre on the bed plane (Y=0); the carriage rides
//             at frame height H, with machine-x -> local X and machine-y -> local Z.
//
// A child device mounts to a parent at either the parent's 'frame' (static) or
// 'carriage' (moving) attach point; "carriage" is what makes B ride A.

// End-effector masses (kg). payload = the held part / aspirated liquid.
export const TOOLS = {
  none:     { label: 'none', mass: 0.0, payload: 0.0 },
  gripper:  { label: 'Pneumatic gripper', mass: 0.16, payload: 0.05 },
  pipettor: { label: 'Single-channel pipettor', mass: 0.21, payload: 0.002 },
};

export const DEVICE_TYPES = {
  linear: {
    label: 'Linear axis (1-DOF)',
    dof: 1,
    jointKeys: ['p'],
    defaults() {
      return {
        axis: 'z', drive: 'screw', travel: 120,
        motor: 'NEMA 17 (0.44 N·m)',
        lead: 8, pulleyTeeth: 20, beltPitch: 2,
        carriageMass: 0.6, tool: 'none',
        limits: { vmax: 80, amax: 1500, jmax: 40000 },
      };
    },
    axisVec(p) {
      return { x: [1, 0, 0], y: [0, 0, 1], z: [0, -1, 0] }[p.axis] || [0, -1, 0];
    },
    // Local position of the carriage frame given joint state {p} (mm).
    carriageOffset(p, state) {
      const v = this.axisVec(p);
      const d = clamp(state?.p ?? 0, 0, p.travel);
      return [v[0] * d, v[1] * d, v[2] * d];
    },
    reach(p) {
      // Swept box of the carriage frame over full travel.
      const v = this.axisVec(p);
      const a = [0, 0, 0], b = [v[0] * p.travel, v[1] * p.travel, v[2] * p.travel];
      return aabb(a, b, 24);
    },
    spec(p) {
      const v = this.axisVec(p);
      const L = p.travel;
      const railShape = p.drive === 'screw' ? 'cyl' : 'box';
      const frame = [
        // the guide rail / lead screw spanning the travel
        { role: 'frame', shape: railShape, size: p.drive === 'screw' ? [3.5, L, 3.5] : [8, L, 8],
          along: v, length: L, color: 0xb9bcc8, name: 'rail' },
        // a small motor block at the zero end
        { role: 'frame', shape: 'box', size: [14, 14, 14], pos: [0, 0, 0], color: 0x202028, name: 'motor' },
      ];
      const carriage = [
        { role: 'carriage', shape: 'box', size: [22, 16, 22], pos: [0, 0, 0], color: 0x39d6c8, emissive: 0x39d6c8, name: 'stage' },
      ];
      return { frame, carriage, mount: { frame: [0, 0, 0], carriage: [0, 0, 0] } };
    },
  },

  hbot: {
    label: 'HBot plane (2-DOF)',
    dof: 2,
    jointKeys: ['x', 'y'],
    defaults() {
      return {
        bedX: 300, bedY: 300, height: 160,
        motor: 'NEMA 17 (0.44 N·m)',
        pulleyTeeth: 20, beltPitch: 2,
        beamMass: 1.8, carriageMass: 0.6,
        limits: { vmax: 300, amax: 4000, jmax: 120000 },
      };
    },
    carriageOffset(p, state) {
      const x = clamp(state?.x ?? p.bedX / 2, 0, p.bedX);
      const y = clamp(state?.y ?? p.bedY / 2, 0, p.bedY);
      return [x - p.bedX / 2, p.height, y - p.bedY / 2];
    },
    reach(p) {
      return aabb([-p.bedX / 2, p.height - 10, -p.bedY / 2], [p.bedX / 2, p.height + 10, p.bedY / 2], 0);
    },
    spec(p) {
      const hx = p.bedX / 2, hy = p.bedY / 2, H = p.height;
      const frame = [
        { role: 'frame', shape: 'box', size: [p.bedX + 12, 4, p.bedY + 12], pos: [0, -2, 0], color: 0x16161e, name: 'bed' },
        // four posts
        ...[[-hx, -hy], [hx, -hy], [-hx, hy], [hx, hy]].map(([px, pz], i) => (
          { role: 'frame', shape: 'box', size: [6, H, 6], pos: [px, H / 2, pz], color: 0x33343f, name: 'post' + i }
        )),
        // two side rails along Y(local Z) at height H
        { role: 'frame', shape: 'box', size: [4, 4, p.bedY], pos: [-hx, H, 0], color: 0x2c2d36, name: 'railL' },
        { role: 'frame', shape: 'box', size: [4, 4, p.bedY], pos: [hx, H, 0], color: 0x2c2d36, name: 'railR' },
        // two stationary corner steppers (the HBot signature)
        { role: 'frame', shape: 'cyl', size: [12, 18, 12], pos: [-hx, H, hy], color: 0x202028, name: 'motorA', spin: 'x' },
        { role: 'frame', shape: 'cyl', size: [12, 18, 12], pos: [hx, H, hy], color: 0x202028, name: 'motorB', spin: 'x' },
      ];
      const carriage = [
        // cross-beam spans X and rides only in depth (local Z) + height, not X
        { role: 'carriage', shape: 'box', size: [p.bedX, 6, 6], pos: [0, 0, 0], color: 0x3a3b47, name: 'beam', follow: [0, 1, 1] },
        // the carriage block rides the full XZ travel
        { role: 'carriage', shape: 'box', size: [26, 16, 22], pos: [0, 0, 0], color: 0x39d6c8, emissive: 0x39d6c8, name: 'carriage' },
      ];
      return { frame, carriage, mount: { frame: [0, 0, 0], carriage: [0, 0, 0] } };
    },
  },

  // ---- labware: static deck components (0 DOF) with interaction-point grids --
  // These don't move; tools visit their interaction points. The motion suite can
  // target a point (e.g. well A1, tip 3) so a move ends with the carriage over it.
  wellplate: labwareType({
    label: 'Well plate', rows: 8, cols: 12, pitch: 9, height: 14,
    body: 0x20303a, feature: 0x0e1a20, featureShape: 'cyl', featureR: 6, naming: 'alpha',
  }),
  tiprack: labwareType({
    label: 'Pipette-tip rack', rows: 8, cols: 12, pitch: 9, height: 60,
    body: 0x2a2438, feature: 0xc08cff, featureShape: 'cone', featureR: 3.2, featureH: 48, naming: 'index',
  }),
  tuberack: labwareType({
    label: 'Tube rack', rows: 4, cols: 6, pitch: 20, height: 45,
    body: 0x243028, feature: 0x7ee787, featureShape: 'cyl', featureR: 7, featureH: 40, naming: 'alpha',
  }),
  waste: {
    label: 'Waste chute', dof: 0, jointKeys: [],
    defaults() { return { width: 70, depth: 70, height: 50 }; },
    carriageOffset() { return [0, 0, 0]; },
    reach(p) { return aabb([-p.width / 2, 0, -p.depth / 2], [p.width / 2, p.height, p.depth / 2], 0); },
    interactionPoints(p) { return [{ id: 'drop', pos: [0, p.height + 6, 0], kind: 'drop' }]; },
    spec(p) {
      const w = p.width, d = p.depth, h = p.height, t = 4;
      const frame = [
        { role: 'frame', shape: 'box', size: [w, t, d], pos: [0, t / 2, 0], color: 0x14140f, name: 'floor' },
        { role: 'frame', shape: 'box', size: [w, h, t], pos: [0, h / 2, -d / 2], color: 0x33271a, name: 'wallN' },
        { role: 'frame', shape: 'box', size: [w, h, t], pos: [0, h / 2, d / 2], color: 0x33271a, name: 'wallS' },
        { role: 'frame', shape: 'box', size: [t, h, d], pos: [-w / 2, h / 2, 0], color: 0x33271a, name: 'wallW' },
        { role: 'frame', shape: 'box', size: [t, h, d], pos: [w / 2, h / 2, 0], color: 0xffb454, emissive: 0xffb454, name: 'wallE' },
      ];
      return { frame, carriage: [], mount: { frame: [0, 0, 0], carriage: [0, 0, 0] } };
    },
  },
};

// Build a gridded labware type (well plate / tip rack / tube rack) from a config.
function labwareType(c) {
  return {
    label: c.label, dof: 0, jointKeys: [],
    defaults() { return { rows: c.rows, cols: c.cols, pitch: c.pitch, height: c.height }; },
    carriageOffset() { return [0, 0, 0]; },
    reach(p) {
      const w = p.cols * p.pitch, d = p.rows * p.pitch;
      return aabb([-w / 2, 0, -d / 2], [w / 2, p.height + (c.featureH || 0), d / 2], 0);
    },
    interactionPoints(p) {
      const pts = [];
      const ox = -(p.cols - 1) * p.pitch / 2, oz = -(p.rows - 1) * p.pitch / 2;
      for (let r = 0; r < p.rows; r++) for (let col = 0; col < p.cols; col++) {
        const id = c.naming === 'alpha' ? `${String.fromCharCode(65 + r)}${col + 1}` : String(r * p.cols + col + 1);
        pts.push({ id, pos: [ox + col * p.pitch, p.height, oz + r * p.pitch], kind: 'site' });
      }
      return pts;
    },
    spec(p) {
      const w = p.cols * p.pitch + p.pitch, d = p.rows * p.pitch + p.pitch;
      const frame = [{ role: 'frame', shape: 'box', size: [w, p.height, d], pos: [0, p.height / 2, 0], color: c.body, name: 'body' }];
      const fH = c.featureH || Math.min(8, p.height * 0.6);
      const ox = -(p.cols - 1) * p.pitch / 2, oz = -(p.rows - 1) * p.pitch / 2;
      // cap the rendered feature count so a dense plate stays light
      const stride = (p.rows * p.cols > 120) ? 2 : 1;
      for (let r = 0; r < p.rows; r += stride) for (let col = 0; col < p.cols; col += stride) {
        const fy = c.featureShape === 'cone' ? p.height + fH / 2 : p.height - fH / 2 + 0.5;
        frame.push({
          role: 'frame', shape: c.featureShape, size: [c.featureR * 2, fH, c.featureR * 2],
          pos: [ox + col * p.pitch, fy, oz + r * p.pitch], color: c.feature,
          emissive: c.featureShape === 'cone' ? c.feature : undefined, name: `f_${r}_${col}`,
        });
      }
      return { frame, carriage: [], mount: { frame: [0, 0, 0], carriage: [0, 0, 0] } };
    },
  };
}

// Interaction points of a placed device in its own local frame (or [] if none).
export function interactionPoints(device) {
  const t = DEVICE_TYPES[device.type];
  return t.interactionPoints ? t.interactionPoints(device.params) : [];
}

export function deviceDefaults(type) {
  const t = DEVICE_TYPES[type];
  if (!t) throw new Error(`unknown device type: ${type}`);
  return t.defaults();
}

export function carriageOffset(device, state) {
  const t = DEVICE_TYPES[device.type];
  return t.carriageOffset(device.params, state || {});
}

// ---- tiny geometry helpers -------------------------------------------------
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function aabb(a, b, pad) {
  return {
    min: [Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.min(a[2], b[2]) - pad],
    max: [Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad, Math.max(a[2], b[2]) + pad],
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.DEVICES = { DEVICE_TYPES, TOOLS, deviceDefaults, carriageOffset, interactionPoints };
}
