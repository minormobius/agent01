// deck.js — the deck data model: a set of devices wired into a KINEMATIC MOUNT
// TREE (each device bolted to the deck origin or onto a parent's frame/carriage),
// plus SPATIAL relations (keep-apart / collision) and SEQUENCING rules (triggers)
// authored here and executed by the motion suite. Pure module: a compact mat4 is
// included so world transforms + collisions resolve headlessly (node-testable),
// and the same Euler 'XYZ' convention as three.js keeps the 3D preview in step.

import { DEVICE_TYPES, carriageOffset, deviceDefaults } from './devices.js';

export const SCHEMA_VERSION = 1;

export class Deck {
  constructor(data = {}) {
    this.name = data.name || 'Untitled deck';
    this.units = data.units || 'mm';
    this.devices = (data.devices || []).map(normalizeDevice);
    this.relations = data.relations || [];   // {type:'collision', between:[a,b], minDist, note}
    this.sequences = data.sequences || [];    // {id, steps:[...]}  (executed by /gantry)
  }

  getDevice(id) { return this.devices.find((d) => d.id === id) || null; }
  children(id) { return this.devices.filter((d) => d.mount.parent === id); }

  addDevice(type, opts = {}) {
    const id = opts.id || uniqueId(type, this.devices);
    const dev = normalizeDevice({
      id, type, params: { ...deviceDefaults(type), ...(opts.params || {}) },
      mount: { parent: null, attach: 'frame', position: [0, 0, 0], rotation: [0, 0, 0], ...(opts.mount || {}) },
      tool: opts.tool || (type === 'linear' ? 'none' : undefined),
      previewState: opts.previewState || {},
    });
    this.devices.push(dev);
    return dev;
  }

  removeDevice(id) {
    // Re-parent orphans to the deleted device's parent (keeps the tree valid).
    const victim = this.getDevice(id);
    if (!victim) return;
    for (const c of this.children(id)) { c.mount.parent = victim.mount.parent; c.mount.attach = 'frame'; }
    this.devices = this.devices.filter((d) => d.id !== id);
    this.relations = this.relations.filter((r) => !(r.between || []).includes(id));
  }

  // Devices in parent-before-child order. Throws on a cycle.
  topo() {
    const order = [], seen = new Set(), temp = new Set();
    const byId = new Map(this.devices.map((d) => [d.id, d]));
    const visit = (d) => {
      if (seen.has(d.id)) return;
      if (temp.has(d.id)) throw new Error(`mount cycle at "${d.id}"`);
      temp.add(d.id);
      const p = d.mount.parent && byId.get(d.mount.parent);
      if (p) visit(p);
      temp.delete(d.id); seen.add(d.id); order.push(d);
    };
    for (const d of this.devices) visit(d);
    return order;
  }

  // World 4x4 of a device's own origin frame, given a joint-state map id->state.
  worldMatrix(id, stateMap = {}) {
    const d = this.getDevice(id);
    if (!d) return mat4();
    let parentW = mat4();
    if (d.mount.parent) {
      parentW = this.worldMatrix(d.mount.parent, stateMap);
      if (d.mount.attach === 'carriage') {
        const off = carriageOffset(this.getDevice(d.mount.parent), stateMap[d.mount.parent] || {});
        parentW = mul(parentW, translation(off[0], off[1], off[2]));
      }
    }
    const local = mul(translation(...d.mount.position), eulerXYZ(...d.mount.rotation.map(deg2rad)));
    return mul(parentW, local);
  }

  originWorld(id, stateMap = {}) { return applyPoint(this.worldMatrix(id, stateMap), [0, 0, 0]); }

  // World position of a device's moving carriage point.
  carriageWorld(id, stateMap = {}) {
    const d = this.getDevice(id);
    const off = carriageOffset(d, stateMap[id] || {});
    return applyPoint(this.worldMatrix(id, stateMap), off);
  }

  // Evaluate collision/keep-apart relations at a given state. Returns violations.
  collisions(stateMap = {}) {
    const out = [];
    for (const r of this.relations) {
      if (r.type !== 'collision' || !r.between || r.between.length < 2) continue;
      const [a, b] = r.between;
      if (!this.getDevice(a) || !this.getDevice(b)) continue;
      const pa = this.carriageWorld(a, stateMap), pb = this.carriageWorld(b, stateMap);
      const dist = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
      out.push({ between: [a, b], dist, minDist: r.minDist ?? 0, violated: dist < (r.minDist ?? 0), note: r.note });
    }
    return out;
  }

  validate() {
    const errors = [], warnings = [];
    const ids = new Set();
    for (const d of this.devices) {
      if (ids.has(d.id)) errors.push(`duplicate device id "${d.id}"`);
      ids.add(d.id);
      if (!DEVICE_TYPES[d.type]) errors.push(`device "${d.id}" has unknown type "${d.type}"`);
      if (d.mount.parent && !this.devices.some((x) => x.id === d.mount.parent)) errors.push(`device "${d.id}" mounts on missing parent "${d.mount.parent}"`);
    }
    try { this.topo(); } catch (e) { errors.push(e.message); }
    for (const r of this.relations) {
      for (const id of r.between || []) if (!ids.has(id)) warnings.push(`relation references missing device "${id}"`);
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  toJSON() {
    return {
      version: SCHEMA_VERSION, name: this.name, units: this.units,
      devices: this.devices.map((d) => ({
        id: d.id, type: d.type, params: d.params, mount: d.mount,
        ...(d.tool !== undefined ? { tool: d.tool } : {}),
        ...(Object.keys(d.previewState || {}).length ? { previewState: d.previewState } : {}),
      })),
      relations: this.relations,
      sequences: this.sequences,
    };
  }
}

function normalizeDevice(d) {
  const mount = d.mount || {};
  return {
    id: d.id,
    type: d.type,
    params: d.params || deviceDefaults(d.type),
    mount: {
      parent: mount.parent ?? null,
      attach: mount.attach || 'frame',
      position: (mount.position || [0, 0, 0]).slice(0, 3),
      rotation: (mount.rotation || [0, 0, 0]).slice(0, 3),
    },
    tool: d.tool,
    previewState: d.previewState || {},
  };
}

function uniqueId(base, devices) {
  let i = 1, id;
  do { id = `${base}${i++}`; } while (devices.some((d) => d.id === id));
  return id;
}

export function defaultDeck() {
  const deck = new Deck({ name: 'Pipetting cell' });
  const rail = deck.addDevice('linear', { id: 'transfer', params: { axis: 'x', drive: 'belt', travel: 600, motor: 'NEMA 23 (1.26 N·m)' }, mount: { position: [0, 40, 0] } });
  const bridge = deck.addDevice('hbot', { id: 'bridge', mount: { parent: rail.id, attach: 'carriage', position: [0, 30, 0] } });
  deck.addDevice('linear', { id: 'z_grip', params: { axis: 'z', drive: 'screw', travel: 120 }, tool: 'gripper', mount: { parent: bridge.id, attach: 'carriage', position: [-30, 0, 0] } });
  deck.addDevice('linear', { id: 'z_pip', params: { axis: 'z', drive: 'screw', travel: 120 }, tool: 'pipettor', mount: { parent: bridge.id, attach: 'carriage', position: [30, 0, 0] } });
  deck.relations.push({ type: 'collision', between: ['z_grip', 'z_pip'], minDist: 25, note: 'keep the two Z tools clear of each other' });
  deck.sequences.push({ id: 'pick_place', steps: [
    { device: 'bridge', move: { x: 60, y: 80 } },
    { device: 'z_grip', move: { p: 95 } },
    { device: 'z_grip', tool: { open: false }, dwell: 0.25 },
    { device: 'z_grip', move: { p: 0 } },
    { device: 'bridge', move: { x: 240, y: 220 } },
    { device: 'z_grip', move: { p: 95 } },
    { device: 'z_grip', tool: { open: true }, dwell: 0.25 },
    { device: 'z_grip', move: { p: 0 } },
  ] });
  return deck;
}

// ---- minimal column-major mat4 (subset, matches three.js conventions) ------
function mat4() { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
function translation(x = 0, y = 0, z = 0) { const m = mat4(); m[12] = x; m[13] = y; m[14] = z; return m; }
function eulerXYZ(x, y, z) {
  // Mirror three.js Matrix4.makeRotationFromEuler order 'XYZ'.
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  const m = mat4();
  m[0] = c * e; m[4] = -c * f; m[8] = d;
  m[1] = af + be * d; m[5] = ae - bf * d; m[9] = -b * c;
  m[2] = bf - ae * d; m[6] = be + af * d; m[10] = a * c;
  return m;
}
function mul(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function applyPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}
function deg2rad(d) { return (d * Math.PI) / 180; }

if (typeof globalThis !== 'undefined') {
  globalThis.DECK = { Deck, defaultDeck, SCHEMA_VERSION };
}
