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
//
// Every `at` element, `rotate.deg`, `rotate.axis` element, `offset`
// element, `repeat` and the `drive`'s numbers take a number or an
// expression over params + derived + t + theta (+ `i` inside a repeat).
// That is how a lead screw moves a nut, a crank moves a slider, a link
// closes a loop: the pose math lives in the document, and the interference
// check stays the safety net. Mates propagate rotation and travel from the
// drive; expressions compose with that.
//
// Repeat. `repeat: n` makes n instances, `id[0]` … `id[n-1]`, each with `i`
// in scope for its placement, its references and its `params` — six bolts
// on a bolt circle are one component.
//
// Place by feature. `at: "@plate.pivot[2]"` puts the component's origin on
// that named face of that component — a cylinder's axis point (a bore's
// centre on its sketch plane), a plane's centroid — and `rotate: { align:
// "@plate.pivot[2]" }` turns its local +z onto the face's axis or normal
// (`deg` then spins about it; `offset` moves along the aligned frame).
// Bracket contents in a reference are expressions (`"@plate.pivot[i]"`),
// so a repeat lands one bolt per hole. The referenced component must be
// declared earlier in the same document, and the reference follows it
// through its kinematics: a bolt in a hole on a plate that turns, orbits.
// Face geometry comes from the exact kernel through the `facesOf` hook the
// caller passes to `flatten` (node: agent/common.mjs; the page: its build
// worker); without it a reference is an error, not a guess.
//
// A sub-assembly is its own document with its own params and derived; its
// placement in the parent is evaluated in the parent's scope. `theta` is the
// top document's drive everywhere.
//
// `hidden: true` is display only: the page draws the component dim or not
// at all, and every tool still counts it. `reference: true` is the other
// thing — construction geometry, a placeholder pin, a ghost of the mating
// part — which the page draws translucent and the interference check, the
// clearance table and the export leave out. A part you want ignored by the
// checks is a reference, not a hidden part.
//
// Component `params` (overrides of a part's parameters) are evaluated in the
// assembly's scope at t = 0 when they can be — so `"pin_z": "L/2"` binds the
// assembly's L — and are otherwise handed to the part as expressions in the
// part's own language. Part geometry does not change with time.
//
// Mates (solveAngles): from the driven component outward, breadth first.
//   gear   {a, b, za, zb}            b turns −za/zb × a
//   belt   {a, b, ra, rb | za, zb}    b turns +ra/rb × a (same sense: pulleys, chain)
//   fixed  {a, b}                     b turns and travels with a
//   screw  {a, b, lead, axis?}        a's turns move b by lead per turn along
//                                     `axis` (b's local, default +z); b does not turn
//   rack   {a, b, r | m, z, axis?}    a's turns move b by r·θ along its axis (a pinion on a rack)
//   slider {a, b, ratio?}             b travels ratio × a's travel
// Travel carried by fixed and slider is turned into the follower's own frame
// (through world, by the rest placements). A component placed on another's
// face by reference follows it already; a mate between the two is ignored.
// `fits: [{ a, b, min, max }]` records the clearance a pair is designed to
// keep (`contact: true` for a designed touch), which the clearance verdicts
// honour; ids may end in `[*]` for every instance of a repeat.
// Each works in either direction (a rack driven moves its pinion). A
// component's pose is its placement, then its travel (a vector in its own
// frame), then its rotation about its own z. Nothing here is a constraint
// solver: the mates say how motion propagates, the placements say where
// things are, and check.mjs says whether that was right.

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
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/// The rotation that takes local +z onto the unit vector n (about z × n).
export function alignZ(n) {
  const d = n[2];
  if (d > 1 - 1e-12) return IDENT;
  if (d < -1 + 1e-12) return R([1, 0, 0], 180);
  return R([-n[1], n[0], 0], (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI);
}

// ── scopes: a document's params, its derived, and the env at an instant ──
function makeScope(doc, name) {
  let params;
  try { params = resolveParams(doc.params || {}); } catch (e) { throw new Error(`${name}: ${e.message}`); }
  const derived = doc.derived || {};
  for (const [k, v] of Object.entries(derived)) if (typeof v !== 'number' && typeof v !== 'string') throw new Error(`${name}: derived \`${k}\` must be a number or expression`);
  // a derived that mentions `i` is per repeat instance, not per document
  const usesI = Object.values(derived).some((v) => typeof v === 'string' && /(^|[^\w.])i([^\w]|$)/.test(v));
  return { name, params, derived, usesI, memo: null, memoI: new Map() };
}
/// The variables in force at (t, theta): params, then derived resolved in
/// dependency order over params + t + theta (+ i, for a repeat instance
/// whose derived use it; 0 outside a repeat). Memoised per instant (and per i).
function envAt(scope, t, theta, i) {
  // outside a repeat (the document env, a non-repeated component) `i` is 0
  if (scope.usesI) { if (i === undefined) i = 0;
    const key = `${t}|${theta}|${i}`; const hit = scope.memoI.get(key); if (hit) return hit;
    let env;
    try { env = resolveParams(scope.derived, { ...scope.params, t, theta, i }); } catch (e) { throw new Error(`${scope.name}[${i}]: derived ${e.message.replace(/^param /, '')}`); }
    if (scope.memoI.size > 256) scope.memoI.clear();
    scope.memoI.set(key, env); return env;
  }
  const m = scope.memo;
  if (m && m.t === t && m.theta === theta) return m.env;
  let env;
  try { env = resolveParams(scope.derived, { ...scope.params, t, theta }); } catch (e) { throw new Error(`${scope.name}: derived ${e.message.replace(/^param /, '')}`); }
  scope.memo = { t, theta, env };
  return env;
}
const isExpr = (v) => typeof v === 'string';
const MATE_NUMBERS = ['lead', 'r', 'm', 'z', 'ratio', 'ra', 'rb', 'za', 'zb'];
const isRef = (v) => typeof v === 'string' && v.startsWith('@');
const hasExpr = (c) => (Array.isArray(c.at) && c.at.some(isExpr)) || isRef(c.at) || (c.rotate ? isExpr(c.rotate.deg) || (c.rotate.axis || []).some(isExpr) || !!c.rotate.align : false) || (c.offset || []).some(isExpr);

// ── references: "@component.face[expr]" → a component and a face's anchor and axis ──
const bracketsIn = (s, env) => s.replace(/\[([^\]]+)\]/g, (_, e) => `[${/^\d+$/.test(e.trim()) ? e.trim() : Math.round(num(e, env, 'index'))}]`);
const anchorOf = (f) => (f.geom?.kind === 'cylinder' ? f.geom.center : f.geom?.kind === 'plane' ? f.centroid : f.centroid);
const axisOf = (f) => (f.geom?.kind === 'cylinder' ? f.geom.axis : f.geom?.kind === 'plane' ? f.geom.normal : f.normal);
/// A face by name. The op prefix may be left off (`pivot[2]` finds
/// `plate.pivot[2][0]`), and a circle's four arcs answer to their loop name
/// (`plate.pivot[2]` names four faces on one cylinder; any will do).
export function findFace(faces, name) {
  const tries = [(n) => n === name, (n) => n.endsWith('.' + name), (n) => n.startsWith(name + '['), (n) => n.includes('.' + name + '[')];
  for (const ok of tries) { const f = faces.find((f) => f.names.some(ok)); if (f) return f; }
  return null;
}
async function resolveRefString(ref, env, prefix, byId, partTrees, facesOf, what) {
  const s = bracketsIn(ref.slice(1), env);
  const dotAt = s.indexOf('.');
  if (dotAt <= 0) throw new Error(`${what}: a reference is @component.face, got \`${ref}\``);
  const compId = prefix + s.slice(0, dotAt), faceName = s.slice(dotAt + 1);
  const comp = byId.get(compId);
  if (!comp) throw new Error(`${what}: \`${ref}\` — no component \`${s.slice(0, dotAt)}\` declared before this one in this document`);
  if (!facesOf) throw new Error(`${what}: \`${ref}\` needs face geometry — pass facesOf to flatten (the exact kernel names the faces)`);
  const faces = await facesOf(comp.partKey, partTrees.get(comp.partKey));
  const face = findFace(faces, faceName);
  if (!face) throw new Error(`${what}: \`${ref}\` — ${comp.part} has no face named ${faceName}; it has ${faces.slice(0, 12).map((f) => f.names[0]).join(', ')}${faces.length > 12 ? ', …' : ''}`);
  return { comp, face: { name: faceName, anchor: anchorOf(face), axis: norm(axisOf(face)) } };
}

/// The model matrix of a referenced component at an instant: its full pose
/// when angles are known (so a bolt orbits with its plate), else its rest placement.
const modelFor = (comp, t, theta, angles) => (angles ? modelOf(comp, angles) : placeAt(comp, t, theta));

function placement(link, t, theta, angles) {
  const { spec, scope, refs } = link;
  const name = `${scope.name}${spec.id ? ' ' + spec.id : ''}${link.i === undefined ? '' : `[${link.i}]`}`;
  const base = envAt(scope, t, theta, link.i);
  const env = link.i === undefined ? base : { ...base, i: link.i };
  const field = (v, what) => { try { return num(v, env, what); } catch (e) { throw new Error(`${name}: ${what}: ${e.message}`); } };
  let m;
  if (refs?.at) m = T(xform(modelFor(refs.at.comp, t, theta, angles), refs.at.face.anchor));
  else m = T((Array.isArray(spec.at) ? spec.at : [0, 0, 0]).map((v, i) => field(v, `at[${i}]`)));
  if (refs?.align) m = mul4(m, alignZ(norm(xformDir(modelFor(refs.align.comp, t, theta, angles), refs.align.face.axis))));
  if (spec.rotate && (spec.rotate.deg !== undefined || spec.rotate.axis)) {
    const axis = (spec.rotate.axis || [0, 0, 1]).map((v, i) => field(v, `rotate.axis[${i}]`));
    m = mul4(m, R(axis, field(spec.rotate.deg ?? 0, 'rotate.deg')));
  }
  if (spec.offset) m = mul4(m, T(spec.offset.map((v, i) => field(v, `offset[${i}]`))));
  return m;
}
/// World placement of a component at an instant: the product of its chain of
/// links from the root document down. `angles` (from solveAngles) lets
/// references follow the components they point at through their motion.
export function placeAt(c, t = 0, theta = 0, angles = null) {
  let m = IDENT;
  for (const link of c.chain) m = mul4(m, placement(link, t, theta, angles));
  return m;
}

/// `resolveRef(ref)` turns "bench:<name>" or an inline object into a tree
/// object (a fresh copy each call). `facesOf(partKey, treeJson)` returns the
/// exact kernel's named faces for a part (only asked for when a placement
/// references one). Returns {components, mates, drive, partTrees, params}.
export async function flatten(asm, resolveRef, { facesOf = null } = {}) {
  const components = [], mates = [], partTrees = new Map(), byId = new Map();
  async function walk(a, prefix, chain, docName) {
    const scope = makeScope(a, docName);
    const env0 = envAt(scope, 0, 0);
    const parts = a.parts || {};
    for (const c of a.components || []) {
      if (!c.id) throw new Error(`${docName}: a component needs an id`);
      let n = 1;
      if (c.repeat !== undefined) { try { n = Math.round(num(c.repeat, env0, 'repeat')); } catch (e) { throw new Error(`${docName} ${c.id}: repeat: ${e.message}`); } if (!(n >= 0)) throw new Error(`${docName} ${c.id}: repeat must be 0 or more`); }
      for (let k = 0; k < n; k++) {
        const i = c.repeat === undefined ? undefined : k;
        const id = prefix + c.id + (i === undefined ? '' : `[${i}]`);
        const env = i === undefined ? env0 : { ...envAt(scope, 0, 0, i), i };
        const link = { spec: c, scope, i, refs: null };
        const what = `${docName} ${c.id}${i === undefined ? '' : `[${i}]`}`;
        if (isRef(c.at) || c.rotate?.align) {
          link.refs = {};
          if (isRef(c.at)) link.refs.at = await resolveRefString(c.at, env, prefix, byId, partTrees, facesOf, `${what}: at`);
          if (c.rotate?.align) { if (!isRef(c.rotate.align)) throw new Error(`${what}: rotate.align must be a @component.face reference`); link.refs.align = await resolveRefString(c.rotate.align, env, prefix, byId, partTrees, facesOf, `${what}: rotate.align`); }
        }
        const myChain = [...chain, link];
        if (c.assembly !== undefined) { const sub = await resolveRef(c.assembly); await walk(sub, id + '/', myChain, id); continue; }
        const tree = await resolveRef(parts[c.part] ?? `bench:${c.part}`);
        let params = c.params;
        if (params) {
          // an override the assembly can evaluate is a number to the part; the rest is the part's own expression
          params = Object.fromEntries(Object.entries(params).map(([k, v]) => { if (!isExpr(v)) return [k, v]; try { return [k, evaluate(v, env)]; } catch { return [k, v]; } }));
          tree.params = { ...(tree.params || {}), ...params };
        }
        const partKey = `${c.part}${params ? '|' + JSON.stringify(params) : ''}`;
        if (!partTrees.has(partKey)) partTrees.set(partKey, JSON.stringify(tree));
        // placed on another component's face: it follows that component's pose already, so a mate to it must not move it again
        const anchor = [...myChain].reverse().find((l) => l.refs?.at)?.refs.at.comp.id ?? null;
        const comp = { id, part: c.part, partKey, chain: myChain, dynamic: myChain.some((l) => hasExpr(l.spec)), phase: c.phase || 0, phaseGiven: c.phase !== undefined, hidden: !!c.hidden, reference: !!c.reference, anchoredTo: anchor };
        comp.place = placeAt(comp, 0, 0); // the pose at rest, for gear phases and static documents
        components.push(comp); byId.set(id, comp);
      }
    }
    for (const m of a.mates || []) {
      const out = { ...m, a: prefix + m.a, b: prefix + m.b };
      for (const k of MATE_NUMBERS) if (isExpr(out[k])) { try { out[k] = num(out[k], env0, k); } catch (e) { throw new Error(`${docName}: mate ${m.kind} ${m.a} ↔ ${m.b}: ${k}: ${e.message}`); } }
      if (out.axis) out.axis = out.axis.map((v, i) => { try { return num(v, env0, `axis[${i}]`); } catch (e) { throw new Error(`${docName}: mate ${m.kind} ${m.a} ↔ ${m.b}: axis[${i}]: ${e.message}`); } });
      mates.push(out);
    }
    return env0;
  }
  const env0 = await walk(asm, '', [], asm.name || 'assembly');
  // designed fits: `fits: [{ a, b, min, max }]` — the clearance a pair is meant to have (ids may end in `[*]` for a repeat)
  const fits = [];
  for (const f of asm.fits || []) {
    if (!f || !f.a || !f.b) throw new Error('fits: each entry needs a and b');
    const n = (v, what) => { try { return v === undefined ? undefined : num(v, env0, what); } catch (e) { throw new Error(`fits ${f.a} ↔ ${f.b}: ${what}: ${e.message}`); } };
    fits.push({ a: String(f.a), b: String(f.b), min: n(f.min, 'min') ?? 0, max: n(f.max, 'max') ?? Infinity, contact: !!f.contact });
  }
  const d = asm.drive;
  const n = (v, dflt, what) => { try { return num(v ?? dflt, env0, what); } catch (e) { throw new Error(`drive: ${what}: ${e.message}`); } };
  const drive = !d ? null : d.escapement ? { kind: 'escapement', wheel: d.escapement.wheel, pallet: d.escapement.pallet, balance: d.escapement.balance, teeth: n(d.escapement.teeth, 15, 'teeth'), beat: n(d.escapement.beat, 1, 'beat'), lift: n(d.escapement.lift, 8, 'lift'), swing: n(d.escapement.swing, 220, 'swing') } : { kind: 'rpm', component: d.component, rpm: n(d.rpm, 6, 'rpm') };
  for (const m of mates) { const known = new Set(components.map((c) => c.id)); if (!known.has(m.a) || !known.has(m.b)) throw new Error(`mate ${m.kind} ${m.a} ↔ ${m.b}: no such component ${known.has(m.a) ? m.b : m.a}`); }
  autoPhase(components, mates);
  return { components, mates, drive, partTrees, params: env0, fits };
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

/// One period of the drive, in seconds: a turn of the driven component, or
/// two beats of an escapement. What check.mjs --sweep samples over.
export function periodOf(drive) {
  if (!drive) return 1;
  if (drive.kind === 'escapement') return 2 * drive.beat;
  return drive.rpm ? 60 / Math.abs(drive.rpm) : 1;
}

/// Pairs that are expected to touch: a bore on its arbor (fixed), a nut on
/// its screw. The interference check lists them but does not fail on them.
export function expectedTouch(mates) {
  const set = new Set(mates.filter((m) => m.kind === 'fixed' || m.kind === 'screw').map((m) => [m.a, m.b].sort().join('\0')));
  return (a, b) => set.has([a, b].sort().join('\0'));
}

/// What a pair is designed to do: touch (a fixed or screw mate, or a fit with
/// `contact: true`), or keep a clearance between `min` and `max` (a `fits`
/// entry; ids may end in `[*]` to cover every instance of a repeat). Returns
/// (a, b) → { touch, fit: { min, max } | null }.
export function expectations(mates, fits = []) {
  const touch = expectedTouch(mates);
  const pat = (id) => (id.includes('*') ? new RegExp('^' + id.replace(/[.+?^${}()|\\]/g, '\\$&').replace(/\[\*\]/g, '\\[\\d+\\]').replace(/\*/g, '.*') + '$') : null);
  const rules = fits.map((f) => ({ ...f, ra: pat(f.a), rb: pat(f.b) }));
  const hits = (r, x, y) => (r.ra ? r.ra.test(x) : r.a === x) && (r.rb ? r.rb.test(y) : r.b === y);
  return (a, b) => {
    const r = rules.find((f) => hits(f, a, b) || hits(f, b, a));
    // a declared fit is more specific than the touch a mate implies (a nut on a screw with a fit is judged by the fit)
    if (r) return r.contact ? { touch: true, fit: null } : { touch: false, fit: { min: r.min, max: r.max } };
    return { touch: touch(a, b), fit: null };
  };
}

/// Kinematics as a function of time in seconds. An rpm drive turns one
/// component; an escapement drive steps its wheel half a tooth per beat (a
/// quick slide over the first 15 % of the beat), rocks the pallet fork
/// ±lift with the same slide, and swings the balance over two beats. Mates
/// propagate from the root (the table at the top of this file); unreached
/// components stay at rest. The map holds each component's angle about its
/// own z; it also carries `t`, `theta` (the driven component's angle at t)
/// and `slide`, a map of each component's travel in its own frame.
export function solveAngles(components, mates, drive, t) {
  const angles = new Map(components.map((c) => [c.id, 0]));
  const slide = new Map(components.map((c) => [c.id, [0, 0, 0]]));
  angles.t = t; angles.theta = 0; angles.slide = slide;
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
  const byId = new Map(components.map((c) => [c.id, c]));
  // travel is kept in each component's own frame; carrying it across a mate
  // goes through world, using the rest placements' rotations (rigid, so the
  // inverse is the transpose) — a carriage sliding along its y moves a nut
  // fixed to it at 90° along the nut's x, not the nut's y
  const carry = (from, to, v) => { const pf = byId.get(from)?.place, pt = byId.get(to)?.place; if (!pf || !pt) return v; const w = xformDir(pf, v); return [w[0] * pt[0] + w[1] * pt[1] + w[2] * pt[2], w[0] * pt[4] + w[1] * pt[5] + w[2] * pt[6], w[0] * pt[8] + w[1] * pt[9] + w[2] * pt[10]]; };
  const seen = new Set([root]); const queue = [root];
  while (queue.length) {
    const cur = queue.shift();
    for (const m of mates) {
      const other = m.a === cur ? m.b : m.b === cur ? m.a : null;
      if (!other || seen.has(other)) continue;
      // a component placed on cur's face already follows cur's pose: a mate between them would move it twice
      if (byId.get(other)?.anchoredTo === cur) { seen.add(other); continue; }
      const forward = m.a === cur; // cur is a, other is b
      const θ = angles.get(cur), s = slide.get(cur);
      const axis = norm(m.axis || [0, 0, 1]);
      if (m.kind === 'gear') { const [zc, zo] = forward ? [m.za, m.zb] : [m.zb, m.za]; angles.set(other, -θ * (zc / zo)); }
      else if (m.kind === 'belt') { const [rc, ro] = forward ? [m.ra ?? m.za, m.rb ?? m.zb] : [m.rb ?? m.zb, m.ra ?? m.za]; angles.set(other, θ * (rc / ro)); }
      else if (m.kind === 'fixed') { angles.set(other, θ); slide.set(other, carry(cur, other, s)); }
      else if (m.kind === 'screw' || m.kind === 'rack') {
        const per = m.kind === 'screw' ? (m.lead ?? 1) / 360 : (m.r ?? ((m.m ?? 1) * (m.z ?? 1)) / 2) * (Math.PI / 180); // travel per degree of a
        if (forward) slide.set(other, axis.map((x) => x * per * θ));
        else angles.set(other, dot(s, axis) / per);
      }
      else if (m.kind === 'slider') { const ratio = m.ratio ?? 1; slide.set(other, carry(cur, other, forward ? s.map((x) => x * ratio) : s.map((x) => x / ratio))); }
      else continue;
      seen.add(other); queue.push(other);
    }
  }
  return angles;
}

/// World model matrix of a component at the given angles: its placement at
/// that instant (recomputed when it is written as expressions or references),
/// then its travel in its own frame, then its rotation about its own z.
export function modelOf(c, angles) {
  const place = c.dynamic && angles.t !== undefined ? placeAt(c, angles.t, angles.theta || 0, angles) : c.place;
  const s = angles.slide?.get(c.id);
  const moved = s && (s[0] || s[1] || s[2]) ? mul4(place, T(s)) : place;
  return mul4(moved, R([0, 0, 1], (angles.get(c.id) || 0) + c.phase));
}
