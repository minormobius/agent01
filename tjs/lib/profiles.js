// profiles.js — the DEVICE PROFILE contract: one record per axis/device that is
// shared by all three backends of the FLTD plant seam:
//
//   * the REAL plant  (CopleyBench.Server) — uses {node, board, channel, countsPerMm,
//                       motorProfile} to address a CAN amp and command it,
//   * the SIM amp      (CopleyBench.SimServer) — uses the same node + motion limits,
//   * the TWIN         (this three.js plant) — uses {deviceId, joint, mechanism,
//                       limitsMm, torqueCurve} to plan + render the move in deckengine.
//
// One profile, three readers. The twin and the SimServer are interchangeable
// backends behind ScriptHost's `Copley.ServerUrl`; the profile is what keeps a
// move meaning the same thing whether it runs on metal or in the twin.
//
// Pure module (no DOM, node-safe). Shapes mirror AscentialPlatform's
// SpecsStore.AxisSpec + motor_profiles/*.json, plus the tjs render binding.

export const PROFILE_SCHEMA = 'tjs.device.profile/1';

// Map an FLTD motor_type onto a tjs STEPPER preset key (deckengine falls back to
// 'NEMA 17 (0.44 N·m)' on an unknown key, so this is advisory, not load-bearing).
export function motorPresetFor(motorType) {
  switch ((motorType || '').toLowerCase()) {
    case 'bldc':
    case 'servo_brushless': return 'NEMA 23 (1.26 N·m)';
    case 'stepper':
    case 'dc':
    default: return 'NEMA 17 (0.44 N·m)';
  }
}

// FLTD axis limits (v_max_mm_s / a_max_mm_s2 / j_max_mm_s3) -> the tjs deck's
// per-device limit block (vmax / amax / jmax, all in mm units). Units already
// match (mm, s) so this is a rename with sane fallbacks.
export function limitsToTjs(limits = {}) {
  return {
    vmax: limits.v_max_mm_s ?? 300,
    amax: limits.a_max_mm_s2 ?? 4000,
    jmax: limits.j_max_mm_s3 ?? 40000,
  };
}

// Is this an FLTD axis a rotary one (continuous magnet / belt motor), i.e. one
// the tjs deck has no device type for? Linear/plunger axes map; rotary don't.
export function isRotary(axis) {
  if (!axis) return false;
  if (axis.kind === 'rotary') return true;
  const L = axis.limits || {};
  return L.stroke_deg != null || L.v_max_deg_s != null;
}

/**
 * Build one device profile.
 * @param {object} a   the FLTD axis record (id, kind, drive, limits, parent_axis)
 * @param {object} bind  the twin binding: { deviceId, joint, role, node, motorProfile, mechanism }
 */
export function buildProfile(a, bind = {}) {
  const drive = a.drive || {};
  return {
    schema: PROFILE_SCHEMA,
    axis: a.id,                          // logical axis name scripts use
    kind: a.kind || 'linear',
    role: bind.role || 'linear',         // hbot-a | hbot-b | linear | rotary
    parentAxis: a.parent_axis || null,
    // --- real-plant addressing (CopleyBench.Server / SimServer) ---
    node: bind.node ?? null,             // amp address: /api/amp/{node}/...
    board: drive.board || null,
    channel: drive.channel ?? null,
    motorType: drive.motor_type || null,
    countsPerMm: bind.countsPerMm ?? null,   // null = uncalibrated; bridge treats counts as mm
    motorProfile: bind.motorProfile || null, // ref into motor_profiles
    // --- shared motion envelope ---
    limitsMm: limitsToTjs(a.limits),
    strokeMm: (a.limits && a.limits.stroke_mm) ?? null,
    // --- twin binding (this three.js plant) ---
    deviceId: bind.deviceId ?? null,     // tjs deck device id
    joint: bind.joint ?? null,           // 'x' | 'y' | 'p' | null (rotary/unrendered)
    rendered: bind.deviceId != null && bind.joint != null,
  };
}

// ---- lookups used by the plant bridge --------------------------------------
export function byNode(profiles, node) {
  const n = Number(node);
  return profiles.find((p) => p.node === n) || null;
}
export function byAxis(profiles, axisName) {
  return profiles.find((p) => p.axis === axisName) || null;
}
// Resolve a script-facing name (logical axis id OR numeric node) to a profile.
export function resolve(profiles, nameOrNode) {
  if (nameOrNode == null) return null;
  const asNum = Number(nameOrNode);
  if (Number.isFinite(asNum) && String(asNum) === String(nameOrNode)) return byNode(profiles, asNum);
  return byAxis(profiles, String(nameOrNode));
}
// mm <-> amp "counts". countsPerMm null => 1:1 (the twin works in mm natively).
export function countsToMm(profile, counts) { return counts / (profile.countsPerMm || 1); }
export function mmToCounts(profile, mm) { return mm * (profile.countsPerMm || 1); }

if (typeof globalThis !== 'undefined') {
  globalThis.PROFILES = { PROFILE_SCHEMA, buildProfile, byNode, byAxis, resolve, motorPresetFor, limitsToTjs, isRotary, countsToMm, mmToCounts };
}
