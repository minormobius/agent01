// assembly.js — assemblies, shared by the page, the worker and the headless
// scripts. Flattens a document (sub-assemblies included) into components
// with world placements and distinct part trees, sets gear phases, and
// solves the kinematic chain as a function of time.

export const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export const T = (v) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, v[0], v[1], v[2], 1];
export function R(axis, deg) {
  const l = Math.hypot(...axis) || 1; const [x, y, z] = axis.map((v) => v / l); const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
}
export function mul4(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
export const xform = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
export const xformDir = (m, d) => [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
const placement = (c) => mul4(T(c.at || [0, 0, 0]), c.rotate ? R(c.rotate.axis || [0, 0, 1], c.rotate.deg || 0) : IDENT);
const mod = (x, n) => ((x % n) + n) % n;

/// `resolveRef(ref)` turns "bench:<name>" or an inline object into a tree
/// object (a fresh copy each call). Returns {components, mates, drive, partTrees}.
export async function flatten(asm, resolveRef) {
  const components = [], mates = [], partTrees = new Map();
  async function walk(a, prefix, parent) {
    const parts = a.parts || {};
    for (const c of a.components || []) {
      const id = prefix + c.id;
      const place = mul4(parent, placement(c));
      if (c.assembly !== undefined) { const sub = await resolveRef(c.assembly); await walk(sub, id + '/', place); continue; }
      const tree = await resolveRef(parts[c.part] ?? `bench:${c.part}`);
      if (c.params) tree.params = { ...(tree.params || {}), ...c.params };
      const partKey = `${c.part}${c.params ? '|' + JSON.stringify(c.params) : ''}`;
      if (!partTrees.has(partKey)) partTrees.set(partKey, JSON.stringify(tree));
      components.push({ id, part: c.part, partKey, place, phase: c.phase || 0, phaseGiven: c.phase !== undefined, hidden: !!c.hidden });
    }
    for (const m of a.mates || []) mates.push({ ...m, a: prefix + m.a, b: prefix + m.b });
  }
  await walk(asm, '', IDENT);
  const d = asm.drive;
  const drive = !d ? null : d.escapement ? { kind: 'escapement', wheel: d.escapement.wheel, pallet: d.escapement.pallet, balance: d.escapement.balance, teeth: d.escapement.teeth ?? 15, beat: d.escapement.beat ?? 1, lift: d.escapement.lift ?? 8, swing: d.escapement.swing ?? 220 } : { kind: 'rpm', component: d.component, rpm: d.rpm ?? 6 };
  autoPhase(components, mates);
  return { components, mates, drive, partTrees };
}

/// Gear phases: unless the document gives one, a gear's tooth 0 (its local
/// +x) is turned to point at its mate, and the mate turns half a pitch so a
/// gap faces back. Each gear component has one mesh, so this always lines up.
export function autoPhase(components, mates) {
  const byId = new Map(components.map((c) => [c.id, c]));
  const set = new Set(components.filter((c) => c.phaseGiven).map((c) => c.id));
  const deg = (v) => (v * 180) / Math.PI;
  for (const m of mates) {
    if (m.kind !== 'gear') continue;
    const a = byId.get(m.a), b = byId.get(m.b); if (!a || !b) continue;
    const dx = b.place[12] - a.place[12], dy = b.place[13] - a.place[13];
    const ab = deg(Math.atan2(dy, dx)), ba = ab + 180;
    const local = (c, ang) => ang - deg(Math.atan2(c.place[1], c.place[0]));
    if (!set.has(a.id)) { a.phase = mod(local(a, ab), 360 / m.za); set.add(a.id); }
    if (!set.has(b.id)) { b.phase = mod(local(b, ba) + 180 / m.zb, 360 / m.zb); set.add(b.id); }
  }
}

/// Kinematics as a function of time in seconds. An rpm drive turns one
/// component; an escapement drive steps its wheel half a tooth per beat (a
/// quick slide over the first 15 % of the beat), rocks the pallet fork
/// ±lift with the same slide, and swings the balance over two beats. Gear
/// and fixed mates propagate from the root; unreached components stay at 0.
export function solveAngles(components, mates, drive, t) {
  const angles = new Map(components.map((c) => [c.id, 0]));
  if (!drive) return angles;
  let root, theta;
  if (drive.kind === 'escapement') {
    const beats = t / drive.beat, n = Math.floor(beats), frac = beats - n;
    const e = Math.min(1, frac / 0.15); const ease = e * e * (3 - 2 * e);
    root = drive.wheel; theta = (360 / drive.teeth / 2) * (n + ease);
    const sign = n % 2 === 0 ? 1 : -1;
    angles.set(drive.pallet, drive.lift * (-sign + 2 * sign * ease));
    angles.set(drive.balance, (drive.swing / 2) * Math.cos(Math.PI * beats));
  } else { root = drive.component; theta = (drive.rpm * 360 * t) / 60; }
  angles.set(root, theta);
  const seen = new Set([root]); const queue = [root];
  while (queue.length) {
    const cur = queue.shift();
    for (const m of mates) {
      const other = m.a === cur ? m.b : m.b === cur ? m.a : null;
      if (!other || seen.has(other)) continue;
      const θ = angles.get(cur);
      let v;
      if (m.kind === 'gear') { const [zc, zo] = m.a === cur ? [m.za, m.zb] : [m.zb, m.za]; v = -θ * (zc / zo); }
      else if (m.kind === 'fixed') v = θ;
      else continue;
      angles.set(other, v); seen.add(other); queue.push(other);
    }
  }
  return angles;
}

/// World model matrix of a component at the given angles.
export const modelOf = (c, angles) => mul4(c.place, R([0, 0, 1], (angles.get(c.id) || 0) + c.phase));
