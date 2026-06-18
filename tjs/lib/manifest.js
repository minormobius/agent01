// manifest.js — the agent-facing contract for a deck. Two pure functions:
//
//   buildManifest(deck)  -> a compact, self-describing document an LLM reads to
//     ground itself: what modules are on the deck, their ids, joints + ranges,
//     tools, what each carriage carries, world reach, the named interaction
//     sites (well A1 at world coords, which carriages can reach it), the verb
//     grammar for sequences, and the current sequence.
//
//   checkSequence(deck, steps) -> the ORACLE: dry-runs a candidate sequence
//     headlessly (same engine the browser uses) and returns structured
//     diagnostics — out-of-range joints, motor stalls (which motor, when),
//     collisions, missing tools — plus the total cycle time. This is the loop
//     closer: the agent writes a sequence, calls this, fixes what it flags.
//
// Pure module (no DOM): the CLI and a future MCP server both call it in node.

import { DEVICE_TYPES, interactionPoints } from './devices.js';
import { deviceJoints, defaultState, carriageBorneMass, planDeviceMove, simulateDevice } from './deckengine.js';

export const MANIFEST_SCHEMA = 'tjs.deck.manifest/1';

// The sequence grammar an agent may emit. Kept tiny and declarative.
export const VERBS = [
  { verb: 'move', args: { device: '<motorized id>', '<joint>': '<number, mm>' }, note: 'jerk-limited coordinated move; joints are x/y for hbot, p for linear' },
  { verb: 'tool', args: { device: '<id with a tool>', open: '<bool>' }, note: 'actuate the end-effector (gripper jaws / pipettor plunge)' },
  { verb: 'dwell', args: { device: '<id (optional)>', dwell: '<seconds>' }, note: 'pause' },
];
// Verbs not yet wired but reserved so the agent knows the direction.
export const PLANNED_VERBS = [
  { verb: 'moveOver', args: { device: '<id>', over: '<site ref e.g. plate.B3>' }, note: 'inverse-kinematic move to put a tool over a named site (needs IK — coming next)' },
  { verb: 'aspirate / dispense', args: { device: '<pipettor id>', site: '<site ref>', uL: '<number>' }, note: 'liquid transfer (needs the labware interaction state machine)' },
];

function jointRange(dev, k) {
  if (dev.type === 'hbot') return { min: 0, max: k === 'x' ? dev.params.bedX : dev.params.bedY, unit: 'mm' };
  if (dev.type === 'linear') return { min: 0, max: dev.params.travel, unit: 'mm' };
  return { min: 0, max: 0, unit: 'mm' };
}
function jointMax(dev, k) { return jointRange(dev, k).max; }

// World-space AABB reachable by a device's carriage (its tool), sampling joint
// extremes of the device AND its jointed carriage-ancestors (the kinematic chain).
function toolReachAABB(deck, id) {
  const chain = [];
  let cur = deck.getDevice(id);
  while (cur) { if (deviceJoints(cur).length) chain.push(cur); cur = cur.mount.parent ? deck.getDevice(cur.mount.parent) : null; }
  // corner states per jointed device
  const cornersFor = (dev) => dev.type === 'hbot'
    ? [{ x: 0, y: 0 }, { x: dev.params.bedX, y: 0 }, { x: 0, y: dev.params.bedY }, { x: dev.params.bedX, y: dev.params.bedY }]
    : [{ p: 0 }, { p: dev.params.travel }];
  // cartesian product of corners across the chain, capped
  let combos = [{}];
  for (const dev of chain) {
    const next = [];
    for (const base of combos) for (const c of cornersFor(dev)) next.push({ ...base, [dev.id]: c });
    combos = next.length > 256 ? next.slice(0, 256) : next;
  }
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const sm of combos) {
    const w = deck.carriageWorld(id, sm);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], w[i]); max[i] = Math.max(max[i], w[i]); }
  }
  return { min, max };
}

function moduleEntry(deck, dev) {
  const type = DEVICE_TYPES[dev.type];
  const joints = deviceJoints(dev);
  const e = {
    id: dev.id, type: dev.type, label: type.label,
    mount: { parent: dev.mount.parent, attach: dev.mount.attach, position: dev.mount.position, rotation: dev.mount.rotation },
  };
  if (joints.length) {
    e.joints = Object.fromEntries(joints.map((k) => [k, jointRange(dev, k)]));
    e.motor = dev.params.motor;
    e.tool = dev.tool && dev.tool !== 'none' ? dev.tool : null;
    e.carries_kg = +carriageBorneMass(deck, dev.id).toFixed(3);
    const r = toolReachAABB(deck, dev.id);
    e.reach = { min: r.min.map(round1), max: r.max.map(round1) };
  } else {
    e.static = true;
    const pts = interactionPoints(dev);
    if (pts.length) e.siteCount = pts.length;
  }
  return e;
}

function round1(v) { return Math.round(v * 10) / 10; }

// Named interaction sites (labware) in world coordinates, with which motorized
// tool-bearing devices can reach them (XZ within reach AABB).
function collectSites(deck, reachByDev) {
  const sites = [];
  for (const dev of deck.devices) {
    const pts = interactionPoints(dev);
    for (const pt of pts) {
      const w = deck.pointWorld(dev.id, pt.pos).map(round1);
      const reachableBy = [];
      for (const [mid, box] of Object.entries(reachByDev)) {
        if (w[0] >= box.min[0] - 1 && w[0] <= box.max[0] + 1 && w[2] >= box.min[2] - 1 && w[2] <= box.max[2] + 1) reachableBy.push(mid);
      }
      sites.push({ ref: `${dev.id}.${pt.id}`, kind: pt.kind, world: w, reachableBy });
    }
  }
  return sites;
}

export function buildManifest(deck) {
  const modules = deck.devices.map((d) => moduleEntry(deck, d));
  const reachByDev = {};
  for (const d of deck.devices) if (deviceJoints(d).length && d.tool && d.tool !== 'none') reachByDev[d.id] = toolReachAABB(deck, d.id);
  // also let bare-carriage motorized devices (e.g. the HBot) count as reachers
  for (const d of deck.devices) if (deviceJoints(d).length && !reachByDev[d.id]) reachByDev[d.id] = toolReachAABB(deck, d.id);
  return {
    schema: MANIFEST_SCHEMA,
    deck: deck.name, units: deck.units,
    modules,
    sites: collectSites(deck, reachByDev),
    verbs: VERBS,
    plannedVerbs: PLANNED_VERBS,
    relations: deck.relations,
    sequence: deck.sequences[0] ? deck.sequences[0].steps : [],
  };
}

// ---- the oracle ------------------------------------------------------------
const mk = (sev) => (step, code, message) => ({ step, severity: sev, code, message });
const err = mk('error'), warn = mk('warning');

export function checkSequence(deck, steps) {
  const v = deck.validate();
  const diagnostics = v.errors.map((m) => err(-1, 'deck_invalid', m));
  if (!v.ok) return { ok: false, cycleTime: 0, anyStall: false, anyCollision: false, diagnostics };

  const stateMap = {};
  for (const d of deck.devices) stateMap[d.id] = { ...defaultState(d) };
  let cycle = 0, anyStall = false, anyCollision = false;

  (steps || []).forEach((step, i) => {
    const dev = deck.getDevice(step.device);
    if (step.device && !dev) { diagnostics.push(err(i, 'unknown_device', `no device "${step.device}"`)); return; }

    if (step.move) {
      const joints = deviceJoints(dev);
      if (!joints.length) { diagnostics.push(err(i, 'not_motorized', `"${dev.id}" has no joints to move`)); return; }
      for (const k of Object.keys(step.move)) {
        if (!joints.includes(k)) { diagnostics.push(err(i, 'bad_joint', `"${dev.id}" has no joint "${k}" (has: ${joints.join(', ')})`)); continue; }
        const mx = jointMax(dev, k), val = step.move[k];
        if (val < 0 || val > mx) diagnostics.push(warn(i, 'out_of_range', `${dev.id}.${k}=${val} outside [0, ${mx}] — will clamp`));
      }
      const target = { ...stateMap[dev.id], ...step.move };
      const mv = planDeviceMove(deck, dev.id, target, stateMap);
      if (mv) {
        const sim = simulateDevice(deck, dev.id, mv, 200);
        cycle += mv.T;
        for (const mkk of sim.motorKeys) {
          if (sim.verdict.stall[mkk]) { anyStall = true; diagnostics.push(err(i, 'stall', `motor ${mkk} on ${dev.id} stalls (peak ${Math.round(sim.verdict.peakUtil[mkk] * 100)}% of pullout${sim.verdict.overspeed[mkk] ? ', overspeed' : ''})`)); }
          else if (sim.verdict.peakUtil[mkk] > 0.9) diagnostics.push(warn(i, 'near_limit', `motor ${mkk} on ${dev.id} at ${Math.round(sim.verdict.peakUtil[mkk] * 100)}% of pullout`));
        }
        stateMap[dev.id] = target;
        for (const c of deck.collisions(stateMap)) if (c.violated) { anyCollision = true; diagnostics.push(err(i, 'collision', `${c.between.join(' ↔ ')} at ${c.dist.toFixed(0)}mm (min ${c.minDist})`)); }
      }
    } else if (step.tool) {
      if (!dev) { diagnostics.push(err(i, 'unknown_device', 'tool step has no device')); return; }
      if (!dev.tool || dev.tool === 'none') diagnostics.push(warn(i, 'no_tool', `"${dev.id}" has no tool to actuate`));
    } else if (step.dwell != null) {
      cycle += step.dwell;
    } else {
      diagnostics.push(warn(i, 'unknown_step', 'unrecognized step shape'));
    }
  });

  return { ok: !diagnostics.some((d) => d.severity === 'error'), cycleTime: +cycle.toFixed(3), anyStall, anyCollision, diagnostics };
}

if (typeof globalThis !== 'undefined') {
  globalThis.MANIFEST = { buildManifest, checkSequence, VERBS };
}
