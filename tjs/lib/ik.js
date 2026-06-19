// ik.js — inverse kinematics for the deck. Every joint here is translational
// (belts, lead screws), so a tool's world position is an AFFINE function of the
// joint vector: world = p0 + J·θ. That means exact IK by sampling — evaluate the
// forward map at the origin and at each unit joint to recover p0 and the
// Jacobian J, then solve. No iteration, no local minima.
//
//   resolveSite(deck, "plate.B3")        -> world coords of a named labware site
//   solveOver(deck, toolId, siteWorld)   -> positioner joints so the tool's XZ
//                                           lands over the site (min-norm move)
//   solvePlunge(deck, toolId, worldY)    -> the tool's own plunge to reach a depth
//
// Pure module (no DOM); node-tested.

import { DEVICE_TYPES, interactionPoints } from './devices.js';
import { deviceJoints, defaultState } from './deckengine.js';

const REACH_TOL = 2.0;       // mm — XZ residual below which a site counts reached
export const TOOL_REACH = 20; // mm the tool tip hangs below its carriage

export function jointMax(dev, k) {
  if (dev.type === 'hbot') return k === 'x' ? dev.params.bedX : dev.params.bedY;
  if (dev.type === 'linear') return dev.params.travel;
  return 0;
}

// "deviceId.siteId" -> { world:[x,y,z], device, site } or null.
export function resolveSite(deck, ref) {
  const dot = ref.lastIndexOf('.');
  if (dot < 0) return null;
  const devId = ref.slice(0, dot), siteId = ref.slice(dot + 1);
  const dev = deck.getDevice(devId); if (!dev) return null;
  const pt = interactionPoints(dev).find((p) => p.id === siteId);
  if (!pt) return null;
  return { world: deck.pointWorld(devId, pt.pos), device: devId, site: siteId, kind: pt.kind };
}

// Jointed devices from the named device UP the chain (nearest first), including
// the device itself — so moveOver works whether you name the tool device or the
// positioner. A purely vertical plunge axis contributes a ~zero XZ column and is
// harmlessly ignored by the min-norm solve, so it won't move during positioning.
function positionerChain(deck, toolId) {
  const chain = [];
  let cur = deck.getDevice(toolId);
  while (cur) { if (deviceJoints(cur).length) chain.push(cur); cur = cur.mount.parent ? deck.getDevice(cur.mount.parent) : null; }
  return chain;
}

function baseState(deck, stateMap) {
  const sm = {};
  for (const d of deck.devices) sm[d.id] = { ...defaultState(d), ...(stateMap[d.id] || {}) };
  return sm;
}

// Solve positioner joints so the tool device's carriage XZ sits over siteWorld.
// Returns { reachable, residual, joints:{ devId:{k:v} }, dims }.
export function solveOver(deck, toolId, siteWorld, stateMap = {}) {
  const chain = positionerChain(deck, toolId);
  const dims = [];
  for (const d of chain) for (const k of deviceJoints(d)) dims.push({ id: d.id, key: k, dev: d });
  if (!dims.length) return { reachable: false, residual: Infinity, joints: {}, dims };

  const base = baseState(deck, stateMap);
  const at = (delta) => {
    const sm = JSON.parse(JSON.stringify(base));
    dims.forEach((dd, i) => { sm[dd.id][dd.key] = base[dd.id][dd.key] + delta[i]; });
    return deck.carriageWorld(toolId, sm);
  };
  const zero = dims.map(() => 0);
  const p0 = at(zero);
  // Jacobian columns in XZ (constant — the map is affine).
  const cols = dims.map((_, i) => { const e = zero.slice(); e[i] = 1; const p = at(e); return [p[0] - p0[0], p[2] - p0[2]]; });

  // Iterative clamp-and-redistribute: solve min-norm over the free joints, clamp,
  // fix whatever hit a travel limit, and re-solve the residual on the rest. This
  // lets a joint with range absorb the correction a clamped joint couldn't.
  const absVals = dims.map((dd) => base[dd.id][dd.key]);
  const fixed = dims.map(() => false);
  for (let iter = 0; iter <= dims.length; iter++) {
    const curDelta = dims.map((dd, i) => absVals[i] - base[dd.id][dd.key]);
    const cur = at(curDelta);
    const t = [siteWorld[0] - cur[0], siteWorld[2] - cur[2]];
    if (Math.hypot(t[0], t[1]) < 1e-7) break;
    const freeIdx = dims.map((_, i) => i).filter((i) => !fixed[i]);
    if (!freeIdx.length) break;
    const dd = solveMinNorm(freeIdx.map((i) => cols[i]), t);
    let clampedAny = false;
    freeIdx.forEach((i, j) => {
      const want = absVals[i] + dd[j];
      const cl = clamp(want, 0, jointMax(dims[i].dev, dims[i].key));
      if (Math.abs(cl - want) > 1e-6) { fixed[i] = true; clampedAny = true; }
      absVals[i] = cl;
    });
    if (!clampedAny) break;
  }

  const joints = {};
  dims.forEach((dd, i) => { (joints[dd.id] || (joints[dd.id] = {}))[dd.key] = Math.round(absVals[i] * 100) / 100; });
  const reached = at(dims.map((dd, i) => absVals[i] - base[dd.id][dd.key]));
  const residual = Math.hypot(reached[0] - siteWorld[0], reached[2] - siteWorld[2]);
  return { reachable: residual <= REACH_TOL, residual, joints, dims };
}

// Solve the tool device's own plunge so its tip reaches targetWorldY.
export function solvePlunge(deck, toolId, targetWorldY, stateMap = {}) {
  const dev = deck.getDevice(toolId);
  const joints = deviceJoints(dev);
  if (!joints.includes('p')) return { reachable: false, p: 0 };
  const base = baseState(deck, stateMap);
  const yAt = (p) => { const sm = JSON.parse(JSON.stringify(base)); sm[toolId].p = p; return deck.carriageWorld(toolId, sm)[1] - TOOL_REACH; };
  const y0 = yAt(0), y1 = yAt(1);
  const slope = y1 - y0;
  if (Math.abs(slope) < 1e-9) return { reachable: false, p: 0 };
  let p = (targetWorldY - y0) / slope;
  const max = jointMax(dev, 'p');
  const clamped = clamp(p, 0, max);
  return { reachable: Math.abs(clamped - p) < 1e-6, p: Math.round(clamped * 100) / 100 };
}

// ---- 2×n min-norm solve: δ = Mᵀ(MMᵀ)⁻¹ t, M built from XZ Jacobian columns ----
function solveMinNorm(cols, t) {
  const n = cols.length;
  // MMᵀ (2×2): sum over columns of outer products.
  let a = 0, b = 0, c = 0, d = 0;
  for (const [cx, cz] of cols) { a += cx * cx; b += cx * cz; c += cx * cz; d += cz * cz; }
  const det = a * d - b * c;
  let lambda;
  if (Math.abs(det) > 1e-9) {
    // (MMᵀ)⁻¹ t
    lambda = [(d * t[0] - b * t[1]) / det, (-c * t[0] + a * t[1]) / det];
  } else {
    // degenerate (e.g. single 1-DOF axis): project onto the available direction.
    const norm = a + d || 1;
    lambda = [t[0] / norm, t[1] / norm];
  }
  // δ = Mᵀ λ
  return cols.map(([cx, cz]) => cx * lambda[0] + cz * lambda[1]);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

if (typeof globalThis !== 'undefined') {
  globalThis.IK = { resolveSite, solveOver, solvePlunge, jointMax, TOOL_REACH };
}
