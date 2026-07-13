// homunculus.js — turn an FLTD system description (AscentialPlatform
// systems/<id>, the system-description.schema.yaml shape) into the world model's
// HOMUNCULUS: a tjs deck (kinematic mount tree + labware + keep-apart relations)
// plus the device PROFILES that bind each axis to its amp + its rendered joint.
//
// The deck is a faithful self-image of the instrument's MOTION skeleton:
//   * a `kinematics` hbot/corexy block  -> one tjs `hbot` device (2-DOF plane),
//   * every other linear/plunger axis    -> a tjs `linear` device, chained onto
//                                           its parent_axis's carriage,
//   * deck slots + labware defs           -> tjs labware (rack/tip/plate/box),
//   * rotary axes (magnet spin, etc.)     -> a profile only (tjs has no rotary
//                                           body; the bridge time-advances them).
//
// Frame convention: FLTD deck coords are mm, Z-up; tjs is mm, Y-up, with each
// device placed relative to the deck centroid. We map (x, y, z)_fltd ->
// (x, z, y)_tjs so "up" stays "up" and the bench depth axis stays horizontal.
//
// Pure module (no DOM, node-safe). The browser surface and the node tests both
// call systemToHomunculus().

import { Deck } from './deck.js';
import { buildProfile, motorPresetFor, limitsToTjs, isRotary } from './profiles.js';
import { STEPPER_PRESETS } from './motor.js';

// ---- small helpers ---------------------------------------------------------
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const indexBy = (arr, k) => Object.fromEntries((arr || []).map((x) => [x[k], x]));

// The modeled steppers have a hard rev/s ceiling (preset.maxSpeed). FLTD axis
// limits are TODO_RESOLVE placeholders (e.g. 1000 mm/s on a 40 mm/rev belt =
// 25 rev/s) that fly past it → overspeed → infinite torque utilization. For a
// believable self-image we DERATE the modeled velocity to ~60% of the motor's
// ceiling for the chosen drivetrain. The oracle stays honest: any move that
// still exceeds the (derated) torque envelope is flagged. Tighten the system
// description's limits/motors and the derate lifts.
const BELT_REV_PER_MM = 1 / 40;        // 20-tooth pulley × 2 mm pitch
const SCREW_LEAD_MM = 12;              // modeled lead-screw pitch
function presetMaxRevS(motorName) {
  return (STEPPER_PRESETS[motorName] || STEPPER_PRESETS['NEMA 17 (0.44 N·m)']).maxSpeed;
}
// derate vmax (overspeed cause) and amax (torque cause) to a deliverable band.
function derate(lim, motorName, revPerMm) {
  const vSafe = 0.6 * presetMaxRevS(motorName) / revPerMm;   // mm/s within the rev ceiling
  const vmax = Math.max(20, Math.min(lim.vmax, Math.round(vSafe)));
  const amax = Math.min(lim.amax, Math.round(vmax * 12));     // reach vmax in ~80 ms — gentle on torque
  return { vmax, amax, jmax: Math.min(lim.jmax, amax * 12) };
}

// id suffix -> tjs linear travel axis ('x','y','z'); default vertical.
function axisLetter(id) {
  const s = String(id).toLowerCase();
  if (/-x$|_x$|(^|[^a-z])x([^a-z]|$)/.test(s)) return 'x';
  if (/-y$|_y$|(^|[^a-z])y([^a-z]|$)/.test(s)) return 'y';
  return 'z';
}

// FLTD labware definition -> a tjs labware device {type, params}.
function labwareToTjs(def) {
  if (!def) return { type: 'waste', params: { width: 90, depth: 70, height: 25 } };
  const pos = def.positions || {};
  const rows = pos.rows || 1, cols = pos.cols || 1;
  const pitch = (pos.pitchMm && (pos.pitchMm.x || pos.pitchMm.y)) || 14;
  const z = (def.footprintMm && def.footprintMm.z) || 40;
  const height = Math.min(z, 60);
  const k = (def.kind || '').toLowerCase();
  if (k === 'tip-box' || k === 'tip-rack' || k === 'tip') return { type: 'tiprack', params: { rows, cols, pitch, height } };
  if (k === 'rack') return { type: 'tuberack', params: { rows, cols, pitch, height } };
  if (k === 'plate' || k === 'wellplate') return { type: 'wellplate', params: { rows, cols, pitch, height } };
  if (k === 'tube' || k === 'cap' || k === 'cover') return { type: 'tuberack', params: { rows: 1, cols: 1, pitch: 20, height } };
  if (k === 'trash' || k === 'waste' || k === 'bin') return { type: 'waste', params: { width: 70, depth: 70, height: 50 } };
  return { type: 'waste', params: { width: 90, depth: 70, height: 25 } }; // undefined-on-deck placeholder
}

/**
 * @param {object} sys  parsed FLTD system description (merged shape; see systems/mps-1.system.json)
 * @returns {{ deck: Deck, profiles: object[], notes: string[] }}
 */
export function systemToHomunculus(sys, opts = {}) {
  const axes = sys.axes || [];
  const kin = sys.kinematics || [];
  const elements = sys.active_elements || [];
  const deckDef = sys.deck || { slots: [], axisAnchors: {} };
  const slots = deckDef.slots || [];
  const labwareDefs = indexBy(sys.labware || [], 'id');
  const axisById = indexBy(axes, 'id');
  const motorProfile = Object.keys(sys.motor_profiles || {})[0] || null;
  const notes = [];

  // deck centroid (FLTD x,y) so the self-image is centred on screen
  const cx = mean(slots.map((s) => s.anchorMm.x));
  const cy = mean(slots.map((s) => s.anchorMm.y));
  const toTjs = (p) => [p.x - cx, p.z || 0, p.y - cy]; // (x,y,z)_fltd -> (x,z,y)_tjs

  function axisAnchorTjs(axisId) {
    const a = deckDef.axisAnchors && deckDef.axisAnchors[axisId];
    if (!a) return null;
    const slot = slots.find((s) => s.id === a.deckRef);
    if (!slot) return null;
    const o = a.offsetMm || {};
    return toTjs({
      x: slot.anchorMm.x + (o.x || 0),
      y: slot.anchorMm.y + (o.y || 0),
      z: (slot.anchorMm.z || 0) + (o.z || 0),
    });
  }

  const devices = [];
  const profiles = [];
  const deviceForAxis = {};               // FLTD axis id -> tjs device id
  const carriageChildren = {};            // parent device id -> [child device id]
  const consumed = new Set();
  let node = 1;

  // 1) kinematics blocks -> hbot devices --------------------------------------
  for (const k of kin) {
    if (k.type !== 'hbot' && k.type !== 'corexy') { notes.push(`kinematics '${k.id}' type '${k.type}' unsupported — skipped`); continue; }
    const [ox, oy] = k.outputs || [];
    const ax = axisById[ox], ay = axisById[oy];
    const id = k.id.replace(/[-_]?hbot$/i, '') || k.id; // gantry-hbot -> gantry
    const anchor = axisAnchorTjs(ox) || [0, 0, 0];
    const heightOff = (deckDef.axisAnchors && deckDef.axisAnchors[ox] && deckDef.axisAnchors[ox].offsetMm && deckDef.axisAnchors[ox].offsetMm.z) || 160;
    const hbotMotor = motorPresetFor((ax && ax.drive && ax.drive.motor_type) || 'bldc');
    devices.push({
      id, type: 'hbot',
      params: {
        bedX: (ax && ax.limits && ax.limits.stroke_mm) || 300,
        bedY: (ay && ay.limits && ay.limits.stroke_mm) || 300,
        height: heightOff,
        motor: hbotMotor,
        pulleyTeeth: 20, beltPitch: 2, beamMass: 1.8, carriageMass: 0.6,
        limits: derate(limitsToTjs(ax && ax.limits), hbotMotor, BELT_REV_PER_MM),
      },
      mount: { parent: null, attach: 'frame', position: [anchor[0], 0, anchor[2]], rotation: [0, 0, 0] },
    });
    if (ox) { deviceForAxis[ox] = id; consumed.add(ox); }
    if (oy) { deviceForAxis[oy] = id; consumed.add(oy); }
    carriageChildren[id] = [];
    // motor-level profiles (real amps) + logical output profiles (rendered joints)
    (k.motors || []).forEach((mid, i) => {
      const ma = axisById[mid];
      if (!ma) return;
      consumed.add(mid);
      profiles.push(buildProfile(ma, { deviceId: id, joint: null, role: i === 0 ? 'hbot-a' : 'hbot-b', node: node++, motorProfile }));
    });
    if (ax) profiles.push(buildProfile(ax, { deviceId: id, joint: 'x', role: 'hbot-x' }));
    if (ay) profiles.push(buildProfile(ay, { deviceId: id, joint: 'y', role: 'hbot-y' }));
  }

  // 2) remaining axes -> linear devices (or rotary profiles) ------------------
  for (const a of axes) {
    if (consumed.has(a.id)) continue;
    if (isRotary(a)) {
      profiles.push(buildProfile(a, { deviceId: null, joint: null, role: 'rotary', node: a.drive ? node++ : null, motorProfile }));
      notes.push(`axis '${a.id}' is rotary — no tjs body; recorded as a real-plant profile only`);
      continue;
    }
    const letter = axisLetter(a.id);
    const parentDev = a.parent_axis ? deviceForAxis[a.parent_axis] : null;
    const el = elements.find((e) => e.mounted_on === a.id && (e.kind === 'pipettor' || e.kind === 'gripper'));
    const tool = el ? el.kind : 'none';
    let mount;
    if (parentDev) {
      mount = { parent: parentDev, attach: 'carriage', position: [0, 0, 0], rotation: [0, 0, 0] };
      (carriageChildren[parentDev] = carriageChildren[parentDev] || []).push(a.id);
    } else {
      const anchor = axisAnchorTjs(a.id) || [0, (a.limits && a.limits.stroke_mm) || 100, 0];
      mount = { parent: null, attach: 'frame', position: anchor, rotation: [0, 0, 0] };
    }
    const linMotor = motorPresetFor(a.drive && a.drive.motor_type);
    const revPerMm = letter === 'z' ? 1 / SCREW_LEAD_MM : BELT_REV_PER_MM;
    devices.push({
      id: a.id, type: 'linear',
      params: {
        axis: letter, drive: letter === 'z' ? 'screw' : 'belt',
        travel: (a.limits && a.limits.stroke_mm) || 100,
        motor: linMotor,
        lead: SCREW_LEAD_MM, pulleyTeeth: 20, beltPitch: 2, carriageMass: 0.6, tool,
        limits: derate(limitsToTjs(a.limits), linMotor, revPerMm),
      },
      tool,
      mount,
    });
    deviceForAxis[a.id] = a.id;
    profiles.push(buildProfile(a, { deviceId: a.id, joint: 'p', role: 'linear', node: node++, motorProfile: a.drive && a.drive.motor_type === 'stepper' ? motorProfile : null }));
  }

  // 3) spread co-mounted carriage children + keep-apart relations -------------
  const relations = [];
  for (const [parent, kids] of Object.entries(carriageChildren)) {
    kids.forEach((kid, i) => {
      const dev = devices.find((d) => d.id === kid);
      if (dev) dev.mount.position = [(i - (kids.length - 1) / 2) * 60, 0, 0];
    });
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      relations.push({ type: 'collision', between: [kids[i], kids[j]], minDist: 25, note: `co-mounted on ${parent} carriage` });
    }
  }

  // 4) deck slots + labware -> static labware devices -------------------------
  for (const slot of slots) {
    const defId = (slot.accepts || [])[0];
    const def = labwareDefs[defId];
    if (!defId) continue;
    const { type, params } = labwareToTjs(def);
    if (!def) notes.push(`slot '${slot.id}' labware '${defId}' has no def — rendered as a placeholder box`);
    const pos = toTjs(slot.anchorMm);
    devices.push({
      id: slot.id.replace(/^slot-/, '') || slot.id,
      type, params,
      mount: { parent: null, attach: 'frame', position: pos, rotation: [0, 0, 0] },
    });
  }

  // 4b) keep the standalone motion axes (dispenser / mixer / aspirator) within
  // the deck envelope. The placeholder axisAnchors can float them past the deck
  // (e.g. aspirator-z parks ~200 mm outside); clamp each so its origin AND its
  // full travel sweep stay inside the labware footprint's XZ bounds.
  const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const labXZ = devices
    .filter((d) => d.mount.parent === null && ['tuberack', 'tiprack', 'wellplate', 'waste'].includes(d.type))
    .map((d) => d.mount.position);
  if (labXZ.length) {
    const M = 30; // margin (mm), ~half a labware footprint
    const minX = Math.min(...labXZ.map((p) => p[0])) - M, maxX = Math.max(...labXZ.map((p) => p[0])) + M;
    const minZ = Math.min(...labXZ.map((p) => p[2])) - M, maxZ = Math.max(...labXZ.map((p) => p[2])) + M;
    for (const d of devices) {
      if (d.type !== 'linear' || d.mount.parent) continue;
      const [x, y, z] = d.mount.position, tr = d.params.travel, ax = d.params.axis;
      const nx = ax === 'x' ? clampN(x, minX, Math.max(minX, maxX - tr)) : clampN(x, minX, maxX);
      const nz = ax === 'y' ? clampN(z, minZ, Math.max(minZ, maxZ - tr)) : clampN(z, minZ, maxZ);
      if (nx !== x || nz !== z) { d.mount.position = [nx, y, nz]; notes.push(`axis '${d.id}' clamped into the deck envelope`); }
    }
  }

  // 5) a prep-flavored demo sequence (approximates the real recipe) ----------
  // Uses the IK/labware verbs against REACHABLE deck labware: pick a tube, stage
  // it, pick a tip, aspirate from the rack, dispense to the plate. The mixer seat
  // is intentionally out of the gantry plane (it is serviced by mixer-Y transport
  // + a cross-device handoff that the verb layer can't yet express — see
  // HOMUNCULUS.md "Closing the loop"); we transport mixer-Y to show the axis, then
  // dispense to the cold plate as a reachable stand-in for the mixer.
  const gantry = devices.find((d) => d.type === 'hbot');
  const gripper = devices.find((d) => d.tool === 'gripper');
  const pipettor = devices.find((d) => d.tool === 'pipettor');
  const rack = devices.find((d) => d.type === 'tuberack' && /sample|rack/i.test(d.id)) || devices.find((d) => d.type === 'tuberack');
  const tips = devices.find((d) => d.type === 'tiprack');
  const plate = devices.find((d) => d.type === 'wellplate' && /cold|plate/i.test(d.id)) || devices.find((d) => d.type === 'wellplate');
  const mixerY = devices.find((d) => d.type === 'linear' && /mixer/i.test(d.id) && d.params.axis === 'y');
  const sequences = [];
  const steps = [];
  if (mixerY) steps.push({ name: 'transport mixer seat toward load zone', device: mixerY.id, move: { p: Math.round(mixerY.params.travel * 0.5) } });
  if (gripper && rack && plate) {
    steps.push({ name: 'pick tube from sample rack', device: gripper.id, grip: `${rack.id}.A1` });
    steps.push({ name: 'place tube (mixer stand-in)', device: gripper.id, release: `${plate.id}.A1` });
  }
  if (pipettor && rack && tips && plate) {
    steps.push({ name: 'pick a tip', device: pipettor.id, pickTip: `${tips.id}.1` });
    steps.push({ name: 'aspirate from rack', device: pipettor.id, aspirate: `${rack.id}.A2`, uL: 50 });
    steps.push({ name: 'dispense to mixer (stand-in)', device: pipettor.id, dispense: `${plate.id}.A1`, uL: 50 });
  }
  if (!steps.length && gantry) steps.push({ device: gantry.id, move: { x: Math.round(gantry.params.bedX * 0.6), y: Math.round(gantry.params.bedY * 0.4) } });
  if (steps.length) sequences.push({ id: 'prep-demo', steps });

  const deck = new Deck({
    name: (sys.meta && sys.meta.name) || 'Homunculus',
    units: 'mm',
    devices, relations, sequences,
  });
  return { deck, profiles, notes };
}

if (typeof globalThis !== 'undefined') {
  globalThis.HOMUNCULUS = { systemToHomunculus };
}
