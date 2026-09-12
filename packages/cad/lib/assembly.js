// assembly.js — assemblies, shared by the page, the worker and the headless
// scripts. Flattens a document (sub-assemblies included) into components
// with world placements and distinct part trees, sets gear phases, and
// solves the kinematic chain as a function of time.
//
// Placements are expressions. A document may carry `params` (numbers or
// expressions over each other, any order — the tree's own language,
// lib/expr.js) and `derived`, a second map resolved the same way at each
// instant, with two reserved variables in scope: `t`, seconds, and `theta`,
// the driven component's angle in degrees (the escapement wheel's, for an
// escapement). Any order, on purpose: a record's map keys come back from a
// PDS in DAG-CBOR order, not the author's, so nothing here may depend on
// the order keys were written in.
// Every `at` element, `rotate.deg`, `rotate.axis` element, and the `drive`'s
// numbers take a number or an expression over params + derived + t + theta.
// That is how a lead screw moves a nut, a crank moves a slider, a link
// closes a loop: the pose math lives in the document, and the interference
// check stays the safety net. Gear and fixed mates still propagate rotation
// about local z from the drive; expressions compose with that.
//
// A sub-assembly is its own document with its own params and derived; its
// placement in the parent is evaluated in the parent's scope. `theta` is the
// top document's drive everywhere.
//
// Component `params` (overrides of a part's parameters) are evaluated in the
// assembly's scope at t = 0 when they can be — so `"pin_z": "L/2"` binds the
// assembly's L — and are otherwise handed to the part as expressions in the
// part's own language. Part geometry does not change with time.

import { evaluate, num, resolveParams } from './expr.js';

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
const mod = (x, n) => ((x % n) + n) % n;

// ── scopes: a document's params, its derived, and the env at an instant ──
function makeScope(doc, name) {
  let params;
  try { params = resolveParams(doc.params || {}); } catch (e) { throw new Error(`${name}: ${e.message}`); }
  const derived = doc.derived || {};
  for (const [k, v] of Object.entries(derived)) if (typeof v !== 'number' && typeof v !== 'string') throw new Error(`${name}: derived \`${k}\` must be a number or expression`);
  return { name, params, derived, memo: null };
}
/// The variables in force at (t, theta): params, then derived resolved in
/// dependency order over params + t + theta. Memoised per instant.
function envAt(scope, t, theta) {
  const m = scope.memo;
  if (m && m.t === t && m.theta === theta) return m.env;
  let env;
  try { env = resolveParams(scope.derived, { ...scope.params, t, theta }); } catch (e) { throw new Error(`${scope.name}: derived ${e.message.replace(/^param /, '')}`); }
  scope.memo = { t, theta, env };
  return env;
}
const isExpr = (v) => typeof v === 'string';
const hasExpr = (c) => (c.at || []).some(isExpr) || (c.rotate ? isExpr(c.rotate.deg) || (c.rotate.axis || []).some(isExpr) : false);
function placement(c, env, name) {
  const field = (v, what) => { try { return num(v, env, what); } catch (e) { throw new Error(`${name}: ${what}: ${e.message}`); } };
  const at = (c.at || [0, 0, 0]).map((v, i) => field(v, `at[${i}]`));
  if (!c.rotate) return T(at);
  const axis = (c.rotate.axis || [0, 0, 1]).map((v, i) => field(v, `rotate.axis[${i}]`));
  return mul4(T(at), R(axis, field(c.rotate.deg ?? 0, 'rotate.deg')));
}
/// World placement of a component at an instant: the product of its chain of
/// (spec, scope) links from the root document down.
export function placeAt(c, t = 0, theta = 0) {
  let m = IDENT;
  for (const { spec, scope } of c.chain) m = mul4(m, placement(spec, envAt(scope, t, theta), `${scope.name}${spec.id ? ' ' + spec.id : ''}`));
  return m;
}

/// `resolveRef(ref)` turns "bench:<name>" or an inline object into a tree
/// object (a fresh copy each call). Returns {components, mates, drive, partTrees}.
export async function flatten(asm, resolveRef) {
  const components = [], mates = [], partTrees = new Map();
  async function walk(a, prefix, chain, docName) {
    const scope = makeScope(a, docName);
    const env0 = envAt(scope, 0, 0);
    const parts = a.parts || {};
    for (const c of a.components || []) {
      const id = prefix + c.id;
      const link = { spec: c, scope };
      const myChain = [...chain, link];
      if (c.assembly !== undefined) { const sub = await resolveRef(c.assembly); await walk(sub, id + '/', myChain, id); continue; }
      const tree = await resolveRef(parts[c.part] ?? `bench:${c.part}`);
      let params = c.params;
      if (params) {
        // an override the assembly can evaluate is a number to the part; the rest is the part's own expression
        params = Object.fromEntries(Object.entries(params).map(([k, v]) => { if (!isExpr(v)) return [k, v]; try { return [k, evaluate(v, env0)]; } catch { return [k, v]; } }));
        tree.params = { ...(tree.params || {}), ...params };
      }
      const partKey = `${c.part}${params ? '|' + JSON.stringify(params) : ''}`;
      if (!partTrees.has(partKey)) partTrees.set(partKey, JSON.stringify(tree));
      const comp = { id, part: c.part, partKey, chain: myChain, dynamic: myChain.some((l) => hasExpr(l.spec)), phase: c.phase || 0, phaseGiven: c.phase !== undefined, hidden: !!c.hidden };
      comp.place = placeAt(comp, 0, 0); // the pose at rest, for gear phases and static documents
      components.push(comp);
    }
    for (const m of a.mates || []) mates.push({ ...m, a: prefix + m.a, b: prefix + m.b });
    return env0;
  }
  const env0 = await walk(asm, '', [], asm.name || 'assembly');
  const d = asm.drive;
  const n = (v, dflt, what) => { try { return num(v ?? dflt, env0, what); } catch (e) { throw new Error(`drive: ${what}: ${e.message}`); } };
  const drive = !d ? null : d.escapement ? { kind: 'escapement', wheel: d.escapement.wheel, pallet: d.escapement.pallet, balance: d.escapement.balance, teeth: n(d.escapement.teeth, 15, 'teeth'), beat: n(d.escapement.beat, 1, 'beat'), lift: n(d.escapement.lift, 8, 'lift'), swing: n(d.escapement.swing, 220, 'swing') } : { kind: 'rpm', component: d.component, rpm: n(d.rpm, 6, 'rpm') };
  autoPhase(components, mates);
  return { components, mates, drive, partTrees, params: env0 };
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
/// The map also carries `t` and `theta` (the driven component's angle at t),
/// which `modelOf` needs for placements written as expressions.
export function solveAngles(components, mates, drive, t) {
  const angles = new Map(components.map((c) => [c.id, 0]));
  angles.t = t; angles.theta = 0;
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
  angles.set(root, theta); angles.theta = theta;
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

/// World model matrix of a component at the given angles: its placement at
/// that instant (recomputed when it is written as expressions), then the
/// kinematic rotation about local z.
export const modelOf = (c, angles) => mul4(c.dynamic && angles.t !== undefined ? placeAt(c, angles.t, angles.theta || 0) : c.place, R([0, 0, 1], (angles.get(c.id) || 0) + c.phase));
