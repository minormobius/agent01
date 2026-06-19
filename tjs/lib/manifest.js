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
import { initWorld, expand, VERB_DEFS } from './verbs.js';

export const MANIFEST_SCHEMA = 'tjs.deck.manifest/1';

// The full sequence grammar (primitives + IK / labware verbs) lives in verbs.js.
export const VERBS = VERB_DEFS;
// Reserved for the next pass.
export const PLANNED_VERBS = [
  { verb: 'liquidClass', args: { device: '<pipettor>', class: '<name>' }, note: 'aspirate/dispense speed + air-gap profiles' },
  { verb: 'parallel', args: { steps: '[...]' }, note: 'run independent device moves concurrently to shorten cycle time' },
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
  const world = initWorld(deck);
  let cycle = 0, anyStall = false, anyCollision = false;

  (steps || []).forEach((step, i) => {
    // Expand high-level verbs (moveOver/aspirate/grip/...) into primitive moves,
    // validating tool/labware preconditions against the running world state.
    const ex = expand(deck, step, world, stateMap);
    if (ex.error) { diagnostics.push(err(i, ex.code || 'verb_error', ex.error)); return; }
    for (const w of ex.warnings || []) diagnostics.push(warn(i, w.code, w.message));
    for (const prim of ex.primitives) {
      const r = runPrimitive(deck, prim, stateMap, i, diagnostics);
      cycle += r.dt; if (r.stall) anyStall = true; if (r.collision) anyCollision = true;
    }
    ex.apply(world);
  });

  return { ok: !diagnostics.some((d) => d.severity === 'error'), cycleTime: +cycle.toFixed(3), anyStall, anyCollision, diagnostics };
}

// Run one primitive (move/tool/dwell) through the physics: torque + collision for
// moves, and accumulate time. Pushes diagnostics for the owning step index.
function runPrimitive(deck, prim, stateMap, stepIdx, diag) {
  let dt = 0, stall = false, collision = false;
  if (prim.move) {
    const dev = deck.getDevice(prim.device);
    if (!dev) { diag.push(err(stepIdx, 'unknown_device', `no device "${prim.device}"`)); return { dt, stall, collision }; }
    const joints = deviceJoints(dev);
    if (!joints.length) { diag.push(err(stepIdx, 'not_motorized', `"${dev.id}" has no joints to move`)); return { dt, stall, collision }; }
    for (const k of Object.keys(prim.move)) {
      if (!joints.includes(k)) { diag.push(err(stepIdx, 'bad_joint', `"${dev.id}" has no joint "${k}" (has: ${joints.join(', ')})`)); continue; }
      const mx = jointMax(dev, k), val = prim.move[k];
      if (val < 0 || val > mx) diag.push(warn(stepIdx, 'out_of_range', `${dev.id}.${k}=${val} outside [0, ${mx}] — will clamp`));
    }
    const target = { ...stateMap[dev.id], ...prim.move };
    const mv = planDeviceMove(deck, dev.id, target, stateMap);
    if (mv) {
      const sim = simulateDevice(deck, dev.id, mv, 200);
      dt = mv.T;
      for (const mkk of sim.motorKeys) {
        if (sim.verdict.stall[mkk]) { stall = true; diag.push(err(stepIdx, 'stall', `motor ${mkk} on ${dev.id} stalls (peak ${Math.round(sim.verdict.peakUtil[mkk] * 100)}%${sim.verdict.overspeed[mkk] ? ', overspeed' : ''})`)); }
        else if (sim.verdict.peakUtil[mkk] > 0.9) diag.push(warn(stepIdx, 'near_limit', `motor ${mkk} on ${dev.id} at ${Math.round(sim.verdict.peakUtil[mkk] * 100)}%`));
      }
      stateMap[dev.id] = target;
      for (const c of deck.collisions(stateMap)) if (c.violated) { collision = true; diag.push(err(stepIdx, 'collision', `${c.between.join(' ↔ ')} at ${c.dist.toFixed(0)}mm (min ${c.minDist})`)); }
    }
  } else if (prim.tool) {
    dt = 0.1;
    const dev = deck.getDevice(prim.device);
    if (dev && (!dev.tool || dev.tool === 'none')) diag.push(warn(stepIdx, 'no_tool', `"${dev.id}" has no tool to actuate`));
  } else if (prim.dwell != null) {
    dt = prim.dwell;
  }
  return { dt, stall, collision };
}

if (typeof globalThis !== 'undefined') {
  globalThis.MANIFEST = { buildManifest, checkSequence, VERBS };
}
