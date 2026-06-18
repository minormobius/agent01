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
};

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
  globalThis.DEVICES = { DEVICE_TYPES, deviceDefaults, carriageOffset };
}
