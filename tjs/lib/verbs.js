// verbs.js — the sequence verb set + the tool↔labware interaction state machine.
//
// Primitive verbs run directly:  move · tool · dwell
// High-level verbs LOWER to primitives (via IK) and mutate a world state:
//   moveOver  — IK move so a tool's XZ lands over a named site
//   pickTip   — pipettor acquires a tip from a tiprack site (tip consumed)
//   dropTip   — pipettor ejects its tip (default: a waste chute)
//   aspirate  — draw uL at a site (needs a tip; respects capacity)
//   dispense  — expel uL at a site (needs a tip; respects held volume)
//   grip      — gripper closes on a part at a site
//   release   — gripper opens, placing its part
//
// expand(deck, step, world, stateMap) validates preconditions against `world`,
// lowers to primitive steps, and returns an apply() that mutates world AFTER the
// primitives run. checkSequence (the oracle) and the animator both call it, so a
// dry-run and a live run agree. Pure module (no DOM); node-tested.

import { resolveSite, solveOver, solvePlunge, TOOL_REACH } from './ik.js';
import { deviceJoints, defaultState } from './deckengine.js';
import { interactionPoints, DEVICE_TYPES } from './devices.js';

export const PIPETTE_CAPACITY_UL = 1000;
const APPROACH = 0;   // engage at the site top (no separate approach-height move modelled)
const IMMERSION = 2;  // mm below a well top to aspirate/dispense

export const VERB_DEFS = [
  { verb: 'move', args: { device: 'id', '<joint>': 'mm' }, note: 'raw jerk-limited move (x,y for hbot; p for linear)' },
  { verb: 'tool', args: { device: 'id', tool: { open: 'bool' } }, note: 'actuate the end-effector' },
  { verb: 'dwell', args: { device: 'id?', dwell: 'seconds' }, note: 'pause' },
  { verb: 'moveOver', args: { device: 'tool id', site: 'ref e.g. plate.B3' }, note: 'IK move so the tool sits over a named site' },
  { verb: 'pickTip', args: { device: 'pipettor', site: 'tiprack ref' }, note: 'acquire a tip (consumes the tip site)' },
  { verb: 'dropTip', args: { device: 'pipettor', site: 'ref? (default waste)' }, note: 'eject the tip' },
  { verb: 'aspirate', args: { device: 'pipettor', site: 'ref', uL: 'number' }, note: 'draw liquid (needs a tip)' },
  { verb: 'dispense', args: { device: 'pipettor', site: 'ref', uL: 'number' }, note: 'expel liquid (needs held volume)' },
  { verb: 'grip', args: { device: 'gripper', site: 'ref' }, note: 'close on a part at a site' },
  { verb: 'release', args: { device: 'gripper', site: 'ref' }, note: 'open, placing the part' },
];

// Initial world state for a deck: tools empty, all tiprack sites stocked.
export function initWorld(deck) {
  const tools = {};
  for (const d of deck.devices) if (d.tool && d.tool !== 'none') tools[d.id] = { tip: false, volume: 0, holding: null };
  const tipsAvailable = new Set();
  for (const d of deck.devices) if (d.type === 'tiprack') for (const pt of interactionPoints(d)) tipsAvailable.add(`${d.id}.${pt.id}`);
  return { tools, tipsAvailable, wells: {} };
}

function toolKind(deck, id) { const d = deck.getDevice(id); return d ? (d.tool || 'none') : null; }
function defaultWaste(deck) { const w = deck.devices.find((d) => d.type === 'waste'); return w ? `${w.id}.drop` : null; }

const fail = (code, message) => ({ error: message, code, primitives: [], apply: () => {} });

// Lower a "go to a site, plunge, (act), retract" motion. Returns primitive steps
// and the reachability of each phase. immersionY adjusts the plunge depth.
function goToSite(deck, toolId, site, stateMap, depthOffset) {
  const sol = solveOver(deck, toolId, site.world, stateMap);
  if (!sol.reachable) return { error: `site ${site.device}.${site.site} is out of reach for ${toolId} (${sol.residual.toFixed(0)}mm short)`, code: 'unreachable' };
  // positioner moves (one per device whose joints changed), outer-first
  const cur = stateMap;
  const moves = [];
  const ids = Object.keys(sol.joints).reverse();
  for (const id of ids) {
    const j = sol.joints[id];
    const changed = Object.keys(j).some((k) => Math.abs((cur[id]?.[k] ?? defaultState(deck.getDevice(id))[k]) - j[k]) > 1e-3);
    if (changed) moves.push({ device: id, move: j });
  }
  // projected state after positioning, for the vertical solve
  const projected = JSON.parse(JSON.stringify(stateMap));
  for (const [id, j] of Object.entries(sol.joints)) projected[id] = { ...defaultState(deck.getDevice(id)), ...projected[id], ...j };
  const targetY = site.world[1] + depthOffset;
  const pl = solvePlunge(deck, toolId, targetY, projected);
  const down = { device: toolId, move: { p: pl.p } };
  const up = { device: toolId, move: { p: 0 } };
  return { moves, down, up, plungeReachable: pl.reachable, joints: sol.joints };
}

// Validate + lower one step. Returns { primitives, apply(world), error?, code?, warnings? }.
export function expand(deck, step, world, stateMap = {}) {
  const v = stepVerb(step);
  const dev = step.device ? deck.getDevice(step.device) : null;

  // ---- primitives pass straight through ----
  if (v === 'move' || v === 'tool' || v === 'dwell') return { primitives: [step], apply: () => {} };

  if (step.device && !dev) return fail('unknown_device', `no device "${step.device}"`);

  // High-level verbs carry their site ref as the verb key's value:
  //   { device, moveOver: "plate.B3" } · { device, aspirate: "src.A1", uL: 50 }
  //   { device, dropTip: true }  (defaults to a waste chute)
  const ref = typeof step[v] === 'string' ? step[v] : (v === 'dropTip' ? defaultWaste(deck) : null);

  if (v === 'moveOver') {
    const site = resolveSite(deck, ref);
    if (!site) return fail('bad_site', `unknown site "${ref}"`);
    const sol = solveOver(deck, step.device, site.world, stateMap);
    if (!sol.reachable) return fail('unreachable', `${step.device} can't reach ${ref} (${sol.residual.toFixed(0)}mm short)`);
    const prims = Object.keys(sol.joints).reverse()
      .map((id) => ({ device: id, move: sol.joints[id] }))
      .filter((p) => Object.keys(p.move).length);
    return { primitives: prims, apply: () => {} };
  }

  // remaining verbs are site-directed tool actions
  const site = resolveSite(deck, ref);
  if (!site) return fail('bad_site', `${v} needs a valid site (got "${ref}")`);

  const kind = toolKind(deck, step.device);
  const t = world.tools[step.device];

  if (v === 'pickTip') {
    if (kind !== 'pipettor') return fail('wrong_tool', `pickTip needs a pipettor, ${step.device} is ${kind}`);
    if (t.tip) return fail('already_has_tip', `${step.device} already holds a tip — dropTip first`);
    if (!world.tipsAvailable.has(`${site.device}.${site.site}`)) return fail('no_tip_at_site', `no tip at ${step.site}`);
    const g = goToSite(deck, step.device, site, stateMap, APPROACH); if (g.error) return fail(g.code, g.error);
    return { primitives: [...g.moves, g.down, { device: step.device, dwell: 0.2 }, g.up], warnings: plungeWarn(g),
      apply: (w) => { w.tools[step.device].tip = true; w.tipsAvailable.delete(`${site.device}.${site.site}`); } };
  }

  if (v === 'dropTip') {
    if (kind !== 'pipettor') return fail('wrong_tool', `dropTip needs a pipettor`);
    if (!t.tip) return fail('no_tip', `${step.device} has no tip to drop`);
    const g = goToSite(deck, step.device, site, stateMap, APPROACH); if (g.error) return fail(g.code, g.error);
    return { primitives: [...g.moves, g.down, { device: step.device, dwell: 0.2 }, g.up], warnings: plungeWarn(g),
      apply: (w) => { w.tools[step.device].tip = false; w.tools[step.device].volume = 0; } };
  }

  if (v === 'aspirate' || v === 'dispense') {
    if (kind !== 'pipettor') return fail('wrong_tool', `${v} needs a pipettor`);
    if (!t.tip) return fail('no_tip', `${step.device} has no tip — pickTip first`);
    const uL = +step.uL || 0;
    if (uL <= 0) return fail('bad_volume', `${v} needs uL > 0`);
    if (v === 'aspirate' && t.volume + uL > PIPETTE_CAPACITY_UL) return fail('over_capacity', `aspirate ${uL}µL would exceed ${PIPETTE_CAPACITY_UL}µL (holding ${t.volume})`);
    if (v === 'dispense' && uL > t.volume + 1e-6) return fail('insufficient_volume', `dispense ${uL}µL but only ${t.volume}µL held`);
    const g = goToSite(deck, step.device, site, stateMap, -IMMERSION); if (g.error) return fail(g.code, g.error);
    return { primitives: [...g.moves, g.down, { device: step.device, dwell: 0.4 }, g.up], warnings: plungeWarn(g),
      apply: (w) => {
        const delta = v === 'aspirate' ? uL : -uL;
        w.tools[step.device].volume += delta;
        w.wells[`${site.device}.${site.site}`] = (w.wells[`${site.device}.${site.site}`] || 0) - delta;
      } };
  }

  if (v === 'grip' || v === 'release') {
    if (kind !== 'gripper') return fail('wrong_tool', `${v} needs a gripper`);
    if (v === 'grip' && t.holding) return fail('already_holding', `${step.device} already holds a part`);
    if (v === 'release' && !t.holding) return fail('not_holding', `${step.device} holds nothing to release`);
    const g = goToSite(deck, step.device, site, stateMap, APPROACH); if (g.error) return fail(g.code, g.error);
    const act = { device: step.device, tool: { open: v === 'release' } };
    return { primitives: [...g.moves, g.down, act, { device: step.device, dwell: 0.2 }, g.up], warnings: plungeWarn(g),
      apply: (w) => { w.tools[step.device].holding = v === 'grip' ? `${site.device}.${site.site}` : null; } };
  }

  return fail('unknown_verb', `unrecognized step (verb "${v}")`);
}

function plungeWarn(g) { return g.plungeReachable === false ? [{ code: 'plunge_short', message: 'Z travel can\'t fully reach the site depth — clamped' }] : []; }

function stepVerb(step) {
  for (const k of ['moveOver', 'pickTip', 'dropTip', 'aspirate', 'dispense', 'grip', 'release']) if (k in step) return k;
  if (step.move) return 'move';
  if (step.tool) return 'tool';
  if (step.dwell != null) return 'dwell';
  return 'unknown';
}

if (typeof globalThis !== 'undefined') {
  globalThis.VERBS = { VERB_DEFS, initWorld, expand, PIPETTE_CAPACITY_UL };
}
