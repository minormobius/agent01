// shift.js — PRODUCTION SIDE QUESTS FROM SEVIN'S KEEPERS (v106). Pure, no DOM, node-tested.
//
// The everything factory gets its player role as SHIFTS: side quests offered by the upper-rind
// keepers — the tier-3 cast Sevin's gates seat into the white threads (plus every chamber keeper
// seated up there). The generator key is the keeper themselves: a shift is deterministic from
// (npc id, the keeper's WHITE THREAD), and the thread's white-collar ROLE picks which of the THREE
// GENERATORS fires — so the same keeper always sets the same quest in the same world, and a new
// world seed re-casts the keepers (story/weave.js) and thereby re-deals the whole shift board.
//
//   ROLE → GENERATOR (the six white-collar roles, two per faction — weavecore FACTIONS):
//     dispatch · gate        (Drift)      → HAUL   — carry a commodity along a real supply-chain
//                                            edge (engines.js supplyChain), source hall → consumer.
//                                            The WAGE IS PRICED BY THE ROUTER: pay ∝ crossings.
//     perfusion · telemetry  (Rindwalker) → FIX    — a fault somewhere in the production half;
//                                            read TWO other white threads' lenses (diagnosis is
//                                            cross-referencing — no single lens localizes), reach
//                                            the fault, then perform the REPAIR ACT (the verb
//                                            fixture: halls ⚒ forge · rings ⬡ lapidary · antechambers
//                                            ⚗ brew — the errand act counters, reused).
//     schedule · inventory   (Continuant) → AUDIT  — walk a ring loop: visit three of its six
//                                            antechambers (any order — it's a loop) and report.
//
// THE SOLVABILITY ORACLE (proveShift): every step's pocket exists in the deck, every leg of the
// walk routes on the analytic weave (weavenav — provable before the deck even streams), a haul's
// commodity is genuinely produced by its source and consumed by its destination, a fix's lenses
// are distinct white threads other than the giver's own, an audit's antechambers belong to its
// ring, and the wage is finite. THE SELECTION PROCESS: shiftFor salt-steps its hash until the
// oracle passes (the castSpine retry pattern) — so an offered shift is provable BY CONSTRUCTION.
//
// State contract (the errand.js discipline — facts, save-riding): the book is one JSON fact
// 'shift.book' = { [npcId]: entry }; entry = the def plus per-step done flags + the act baseline;
// visits are marked by the surface on pocket arrival; repair acts count against 'act.<kind>'
// counters from the baseline snapshot taken when the fault is reached.

import { hash32, pickVariant } from './weave.js';
import { RADIAL_ENGINES, PAIRS, anteParts, isAnte, weaveLabel } from '../rindweave/pocketdeck.js';
import { routeWeave } from '../rindweave/weavenav.js';
import { ENGINES, supplyChain } from '../rindweave/engines.js';

// the six white-collar roles → generator kind (weavecore FACTIONS roleIds, interleaved R·C·D)
export const KIND_BY_ROLE = {
  dispatch: 'haul', gate: 'haul',
  perfusion: 'fix', telemetry: 'fix',
  schedule: 'audit', inventory: 'audit',
};

// engine id → pocket key (ring mode: assembly/reclaim became the rings, fulfillment is the nexus)
export function enginePocket(id) {
  if (id === 'fulfillment') return 'NX';
  if (id === 'assembly') return 'RA';
  if (id === 'reclaim') return 'RR';
  const i = RADIAL_ENGINES.indexOf(id);
  return i >= 0 ? 'P' + i : null;
}
const pocketEngine = (key) => key === 'NX' ? 'fulfillment' : key === 'RA' ? 'assembly' : key === 'RR' ? 'reclaim' : key[0] === 'P' ? RADIAL_ENGINES[+key.slice(1)] : null;

// the supply-chain edges that exist as pocket-to-pocket walks (both ends mapped)
export function haulEdges() {
  return supplyChain()
    .map((e) => ({ ...e, srcKey: enginePocket(e.from), dstKey: enginePocket(e.to) }))
    .filter((e) => e.srcKey && e.dstKey);
}

// the fault-site pool: the whole production half — six halls, two rings, twelve antechambers
export function fixSites() {
  const sites = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'RA', 'RR'];
  for (let i = 0; i < 6; i++) { sites.push('ZA:' + PAIRS[i][0] + '+' + PAIRS[i][1]); sites.push('ZR:' + PAIRS[i][0] + '+' + PAIRS[i][1]); }
  return sites;
}
const REPAIR_ACT = (siteKey) => siteKey[0] === 'P' ? 'forge' : isAnte(siteKey) ? 'brew' : 'lapidary';
const FAULTS = ['a starved intake', 'a jammed conveyor gate', 'a pressure fault', 'a mis-timed relay', 'a worn bearing run', 'a fouled filter bank'];

const OFFER = {
  haul: [
    'The rings move bulk, but bulk is slow. A priority load wants legs that can cross threads.',
    'Dispatch has a manifest no droid can carry — droids ride one thread. You walk them all.',
    'There is freight on the board. The pay is honest: it scales with the crossings.',
  ],
  fix: [
    'Something reads wrong on the floor. One lens never shows the whole fault — you will need two.',
    'The watch flagged an anomaly. Cross-check the lenses, then get your hands on the machine.',
    'A fault is loose in the production half. Diagnose it properly before you touch anything.',
  ],
  audit: [
    'The ledger wants eyes on the ring — walk it, count what passes the antechambers.',
    'Inventory drifts unless someone walks the loop. Three junctions, your own two eyes.',
    'The schedule says the ring is healthy. The schedule has been wrong before. Verify it.',
  ],
};
const DONE = {
  haul: ['Delivered, and the line never felt the gap. The wage is yours — crossings and all.', 'The board clears your manifest. Good legs.'],
  fix: ['The readings settle. Two lenses and a steady hand — that is the whole trade.', 'The fault is closed and the floor hums even. Take your pay.'],
  audit: ['The count holds — or it does now. The ledger thanks you in coin.', 'A walked loop is a true ledger. Paid in full.'],
};

// walking legs → total crossings on the analytic weave (the wage's price basis)
function chainCrossings(nav, keys) {
  let total = 0;
  for (let i = 0; i + 1 < keys.length; i++) {
    if (keys[i] === keys[i + 1]) continue;
    const r = routeWeave(nav, { key: keys[i], param: 0.5 }, { key: keys[i + 1], param: 0.5 });
    if (!r) return -1;
    total += r.crossings;
  }
  return total;
}

// ── the three generators (deterministic per (npcId, salt)) ────────────────────────────────────
function genHaul(st, nav, npcId, threadKey, salt) {
  const edges = haulEdges();
  if (!edges.length) return null;
  const e = edges[hash32('shift-haul' + salt + '@' + st.seed, npcId) % edges.length];
  const cross = chainCrossings(nav, [threadKey, e.srcKey, e.dstKey]);
  if (cross < 0) return null;
  const eng = ENGINES[e.from] || {};
  return {
    kind: 'haul', threadKey, commodity: e.commodity,
    title: `run ${e.commodity}: ${weaveLabel(st, e.srcKey)} → ${weaveLabel(st, e.dstKey)}`,
    steps: [
      { key: e.srcKey, label: `collect ${e.commodity} at ${weaveLabel(st, e.srcKey)}` },
      { key: e.dstKey, label: `deliver it to ${weaveLabel(st, e.dstKey)}` },
    ],
    ordered: true, act: null, wage: 4 + 3 * cross, crossings: cross,
    srcColor: eng.color || null,
  };
}
function genFix(st, nav, npcId, threadKey, salt) {
  const sites = fixSites();
  const site = sites[hash32('shift-fix' + salt + '@' + st.seed, npcId) % sites.length];
  const whites = ['W0', 'W1', 'W2', 'W3', 'W4', 'W5'].filter((w) => w !== threadKey);
  const a = hash32('shift-lens-a' + salt + '@' + st.seed, npcId) % whites.length;
  let b = hash32('shift-lens-b' + salt + '@' + st.seed, npcId) % (whites.length - 1); if (b >= a) b++;
  const lensA = whites[a], lensB = whites[b];
  const cross = chainCrossings(nav, [threadKey, lensA, lensB, site]);
  if (cross < 0) return null;
  const act = REPAIR_ACT(site);
  const fault = FAULTS[hash32('shift-fault' + salt + '@' + st.seed, npcId) % FAULTS.length];
  return {
    kind: 'fix', threadKey, site, fault,
    title: `trace ${fault} — ${weaveLabel(st, site)}`,
    steps: [
      // v107: the lens steps read as DIAGNOSIS, not busywork — no single thread localizes the fault, so you
      // walk to two others to triangulate it, THEN reach the site and make the repair.
      { key: lensA, label: `read the ${st.geo.warps[+lensA.slice(1)].id} thread to triangulate the fault` },
      { key: lensB, label: `cross-check against the ${st.geo.warps[+lensB.slice(1)].id} thread` },
      { key: site, label: `reach the fault in ${weaveLabel(st, site)}, then repair it` },
    ],
    ordered: true,
    act: { kind: act, need: 1 },   // the repair: ⚒ forge (halls) · ⬡ lapidary (rings) · ⚗ brew (antechambers)
    wage: 5 + 3 * cross, crossings: cross,
  };
}
function genAudit(st, nav, npcId, threadKey, salt) {
  const ring = hash32('shift-ring' + salt + '@' + st.seed, npcId) % 2 === 0 ? 'RA' : 'RR';
  const antes = PAIRS.map((p, i) => 'Z' + ring[1] + ':' + p[0] + '+' + p[1]);
  // pick three distinct of the six, hash-rotated
  const off = hash32('shift-antes' + salt + '@' + st.seed, npcId) % 6;
  const picks = [antes[off], antes[(off + 2) % 6], antes[(off + 4) % 6]];   // every other junction — a true walk of the loop
  const toRing = chainCrossings(nav, [threadKey, ring]);
  if (toRing < 0) return null;
  return {
    kind: 'audit', threadKey, ring,
    title: `audit ${weaveLabel(st, ring)} — three antechambers`,
    steps: picks.map((k) => ({ key: k, label: `count the flow through ${weaveLabel(st, k)}` })),
    ordered: false,   // it's a loop — walk it either way
    act: null, wage: 6 + 2 * (toRing + 3), crossings: toRing + 3,
  };
}

// ── THE SOLVABILITY ORACLE — a shift must be provably completable on the analytic weave ───────
export function proveShift(st, nav, q) {
  const errors = [];
  if (!q) return { ok: false, errors: ['no quest'] };
  const valid = (k) => st.pockets.has(k);
  if (!valid(q.threadKey) || q.threadKey[0] !== 'W') errors.push('giver_thread_invalid');
  for (const s of q.steps) if (!valid(s.key)) errors.push('step_pocket_missing:' + s.key);
  // every leg of the walk must route (giver thread → steps in order → back to the giver thread)
  const legs = [q.threadKey, ...q.steps.map((s) => s.key), q.threadKey];
  for (let i = 0; i + 1 < legs.length; i++) {
    if (legs[i] === legs[i + 1]) continue;
    if (!routeWeave(nav, { key: legs[i], param: 0.5 }, { key: legs[i + 1], param: 0.5 })) errors.push('leg_unroutable:' + legs[i] + '→' + legs[i + 1]);
  }
  if (!(q.wage > 0 && Number.isFinite(q.wage))) errors.push('wage_invalid');
  if (q.kind === 'haul') {
    const src = pocketEngine(q.steps[0].key), dst = pocketEngine(q.steps[1].key);
    const S = src === 'fulfillment' ? { output: ['waste'] } : ENGINES[src];
    const D = dst === 'fulfillment' ? { intake: ['product'] } : ENGINES[dst];
    if (!S || !(S.output || []).includes(q.commodity)) errors.push('haul_source_does_not_produce');
    if (!D || !(D.intake || []).includes(q.commodity)) errors.push('haul_dest_does_not_consume');
  }
  if (q.kind === 'fix') {
    const [a, b, site] = q.steps.map((s) => s.key);
    if (a[0] !== 'W' || b[0] !== 'W' || a === b || a === q.threadKey || b === q.threadKey) errors.push('fix_lenses_invalid');
    if (site[0] === 'W') errors.push('fix_site_not_production');
    if (!q.act || !['forge', 'brew', 'lapidary'].includes(q.act.kind)) errors.push('fix_act_invalid');
  }
  if (q.kind === 'audit') {
    for (const s of q.steps) { if (!isAnte(s.key) || anteParts(s.key).ring !== q.ring) errors.push('audit_ante_off_ring:' + s.key); }
    if (new Set(q.steps.map((s) => s.key)).size !== q.steps.length) errors.push('audit_antes_duplicate');
  }
  return { ok: errors.length === 0, errors };
}

// ── the selection process: generate → prove → salt-step until provable (castSpine's retry) ────
// threadKey = the white thread the keeper is SEATED in (the surface reads it off their home chunk).
export function shiftFor(st, nav, npc, threadKey) {
  if (!st || !nav || !npc || !threadKey || threadKey[0] !== 'W') return null;
  if (npc.type && npc.type !== 'npc') return null;
  if (npc.content && (npc.content.ambient || npc.content.load_bearing)) return null;   // anchors guide; wanderers drift
  if (npc.content && npc.content.shift === false) return null;                          // the per-bundle kill switch
  if (npc.status && npc.status !== 'active') return null;
  const warp = st.geo.warps[+threadKey.slice(1)];
  const role = warp ? warp.id : null;
  const kind = KIND_BY_ROLE[role];
  if (!kind) return null;
  const gen = kind === 'haul' ? genHaul : kind === 'fix' ? genFix : genAudit;
  for (let salt = 0; salt < 8; salt++) {
    const q = gen(st, nav, npc.id, threadKey, salt ? '#' + salt : '');
    if (!q) continue;
    q.role = role; q.giverId = npc.id;
    q.offer = pickVariant(OFFER[kind], 'shift-offer', npc.id);
    q.doneSays = pickVariant(DONE[kind], 'shift-done', npc.id);
    if (proveShift(st, nav, q).ok) return q;
  }
  return null;   // provably nothing offerable (should not happen on the full weave — pinned)
}

// ── progress: pure read of an OPEN book entry against facts (the errandProgress cousin) ───────
// entry = the def + steps[].done flags + actBase (set by the surface when the last step lands).
export function shiftProgress(entry, facts) {
  if (!entry) return null;
  const doneSteps = entry.steps.filter((s) => s.done).length;
  const allSteps = doneSteps === entry.steps.length;
  let actCount = 0, actReady = true;
  if (entry.act) {
    actReady = false;
    if (allSteps && entry.actBase != null) {
      actCount = Math.max(0, (+((facts || {})['act.' + entry.act.kind]) || 0) - entry.actBase);
      actReady = actCount >= entry.act.need;
    }
  }
  const next = entry.ordered ? entry.steps.find((s) => !s.done) : entry.steps.find((s) => !s.done);
  return {
    doneSteps, needSteps: entry.steps.length, allSteps,
    actCount, actReady, ready: allSteps && actReady,
    nextKey: !allSteps && next ? next.key : null,
    nextLabel: !allSteps && next ? next.label : (entry.act && !actReady ? repairLine(entry.act.kind) : null),
  };
}
export const repairLine = (kind) => kind === 'forge' ? 'repair it: forge a piece at a smithy (⚒)' : kind === 'brew' ? 'repair it: brew a preparation at a bench (⚗)' : 'repair it: work a stone at a gem-wheel (⬡)';

// mark arrivals: the surface calls this with the player's CURRENT pocket key; mutates entry, returns
// what changed ({ step } | { reachedSite } | null). Ordered quests advance in order; audits any order.
export function shiftArrive(entry, pocketKey, facts) {
  if (!entry || entry.done || !pocketKey) return null;
  const pending = entry.ordered
    ? [entry.steps.find((s) => !s.done)].filter(Boolean)
    : entry.steps.filter((s) => !s.done);
  const hit = pending.find((s) => s.key === pocketKey);
  if (!hit) return null;
  hit.done = true;
  const allSteps = entry.steps.every((s) => s.done);
  if (allSteps && entry.act && entry.actBase == null) {
    entry.actBase = +((facts || {})['act.' + entry.act.kind]) || 0;   // the repair counts from HERE
    return { step: hit, reachedSite: true };
  }
  return { step: hit };
}

export default { KIND_BY_ROLE, shiftFor, proveShift, shiftProgress, shiftArrive, haulEdges, fixSites, enginePocket, repairLine };
