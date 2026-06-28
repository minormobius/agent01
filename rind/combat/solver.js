// solver.js — the COMBAT SOLVABILITY ORACLE. The combat cousin of fable/forge's BFS oracle.
//
// forge certifies a puzzle with one BFS over a closed, deterministic state space → {solvable, par,
// path} (par = optimal-play length). Combat needs the same so that procedurally-built encounters
// (summon / blast / bigger boards, where hand-tuning dies) are provably winnable and gradeable.
//
// The combat analog, and why it stays tractable:
//   • DETERMINISTIC engine mode (engine `det:true`) — no RNG, damage = expected value — makes every
//     transition a pure function of (state, action), exactly like forge's world.
//   • The FOE is the deterministic AI (aiPlan), not an adversary. So we certify "can the player party,
//     played well, beat THIS AI?" — which collapses the foe branching to one line and makes the search
//     single-agent (a forge-style BFS) rather than full minimax. The tree branches only on PLAYER turns.
//   • Player turns branch over a small MACRO-ACTION menu (engage each enemy with the best reachable
//     attack · each affordable self/support skill · advance · hold), not every tile×skill×target — so
//     branching stays bounded.
//   • A node cap (forge's `capped`) bounds blowup: past it we return solvable:false, capped:true =
//     "couldn't certify within budget" (inconclusive), never a false "unwinnable".
//
// Output: { solvable, par, margin, nodes, capped }. par = player decisions to the win (≈ optimal via
// BFS by ply). margin = player HP fraction at the win (how much was left = how comfortable). Pure +
// deterministic, so a given encounter always grades the same — the encounter-design feedback loop.

import * as E from './engine.js';

const dist = E.dist;
const Q = 1;   // position quantum: round continuous coords to this grid in the state key so near-equal
               // positions dedup (the continuum would otherwise give an unbounded state space).

// deep-clone a battle state so a branch can mutate freely (rng is unused in det mode; log dropped).
function cloneState(s) {
  return {
    ...s,
    units: s.units.map((u) => ({ ...u, buff: { ...u.buff }, status: cloneStatus(u.status) })),
    order: s.order.slice(),
    log: [],
  };
}
function cloneStatus(st) { const o = {}; for (const k in st) o[k] = { ...st[k] }; return o; }

// a compact, time-invariant signature of a state (excludes turn count so equal positions dedup).
// continuous coords are quantized to the Q grid so near-identical positions collapse to one node.
function stateKey(s) {
  const q = (v) => Math.round(v / Q);
  return s.idx + '|' + s.order.length + '|' + s.units.map((u) =>
    `${u.id}:${u.alive ? 1 : 0}:${q(u.x)},${q(u.y)}:${u.hp}:${u.flux}:${u.buff.turns}:${Object.keys(u.status).sort().map((k) => k + u.status[k].turns).join('')}`
  ).join(';');
}

const teamHpFrac = (s, team) => { let hp = 0, mx = 0; for (const u of s.units) if (u.team === team) { hp += Math.max(0, u.hp); mx += u.maxhp; } return mx ? hp / mx : 0; };

// the macro-action menu for the active player unit — each is a sequence of engine actions ending in 'end'.
function playerPlans(s) {
  const u = E.active(s); const plans = [];
  const enemies = E.enemiesOf(s, u);
  const skills = E.skillsFor(u);
  const can = (id) => skills.includes(id) && E.costOf(u, id) <= u.flux;

  // 1) engage each enemy with the best reachable attack
  const atkOpts = skills.filter((id) => E.SKILLS[id].kind === 'attack' && E.costOf(u, id) <= u.flux)
    .sort((a, b) => (E.SKILLS[b].range - E.SKILLS[a].range) || ((E.SKILLS[b].mult || 1) - (E.SKILLS[a].mult || 1)));
  if (!atkOpts.includes('strike')) atkOpts.push('strike');
  for (const e of enemies) plans.push(engage(s, u, e, atkOpts));

  // 2) each affordable self/support skill (no target). NB: `summon` is intentionally excluded — the
  // certificate means "winnable with your direct kit"; bringing extra agents only makes it easier, and
  // searching a growing party would blow up the tree. Summons are gravy in real play, not required.
  for (const id of ['mend', 'scavenge', 'brace', 'bulwark', 'harden', 'adrenal']) {
    if (can(id)) plans.push([{ type: 'skill', skillId: id }, { type: 'end' }]);
  }
  // 3) revive a downed ally / assist a living ally (if any in range) — keeps the party verbs in-search
  const downed = s.units.find((x) => !x.alive && x.team === u.team && E.inRange(u, x, 1));
  if (can('revive') && downed) plans.push([{ type: 'skill', skillId: 'revive', targetId: downed.id }, { type: 'end' }]);

  // 4) advance toward the nearest enemy / hold
  const near = enemies.slice().sort((a, b) => dist(u, a) - dist(u, b))[0];
  if (near) plans.push(advance(s, u, near));
  plans.push([{ type: 'end' }]);

  // dedupe identical plans (by JSON) to trim the frontier
  const seen = new Set(); return plans.filter((p) => { const k = JSON.stringify(p); if (seen.has(k)) return false; seen.add(k); return true; });
}

function engage(s, u, e, atkOpts) {
  for (const id of atkOpts) {
    const sk = E.SKILLS[id];
    if (E.canTarget(s, u, e, sk)) return [{ type: 'skill', skillId: id, targetId: e.id }, { type: 'end' }];   // in range + clear shot
    const p = E.moveToward(s, u, e.x, e.y, E.moveRange(u), (sk.range || 1) - 0.25);   // close to just inside range
    if ((p.x !== u.x || p.y !== u.y) && E.canTarget(s, { x: p.x, y: p.y }, e, sk)) return [{ type: 'move', x: p.x, y: p.y }, { type: 'skill', skillId: id, targetId: e.id }, { type: 'end' }];
  }
  return advance(s, u, e);   // couldn't reach to strike → just close in
}
function advance(s, u, e) {
  const p = E.moveToward(s, u, e.x, e.y, E.moveRange(u), 2 * E.UNIT_R);
  return (p.x !== u.x || p.y !== u.y) ? [{ type: 'move', x: p.x, y: p.y }, { type: 'end' }] : [{ type: 'end' }];
}

function applyPlan(s, plan) { for (const a of plan) { if (s.winner) break; E.act(s, a); } }

// ── the oracle ────────────────────────────────────────────────────────────────────────────────
// setup: { player, allies?, foes?, seed?, W?, H?, maxTurns? } (same shape as createBattle).
export function solveCombat(setup, opts = {}) {
  const cap = opts.cap ?? 60000;
  const root = E.createBattle({ ...setup, det: true });
  if (root.winner === 'player') return { solvable: true, par: 0, margin: teamHpFrac(root, 'player'), nodes: 1, capped: false };
  if (root.winner) return { solvable: false, par: -1, margin: 0, nodes: 1, capped: false };

  const seen = new Set([stateKey(root)]);
  let frontier = [{ s: root, pturns: 0 }], nodes = 1, capped = false;

  while (frontier.length && !capped) {
    const next = [];
    for (const node of frontier) {
      const u = E.active(node.s);
      if (!u) continue;

      if (u.team !== 'player') {                 // foe (or summoned non-controlled) → the deterministic AI plays
        const ns = cloneState(node.s); E.runAiTurn(ns);
        const k = stateKey(ns);
        if (!seen.has(k)) {
          seen.add(k); nodes++;
          if (ns.winner === 'player') return { solvable: true, par: node.pturns, margin: teamHpFrac(ns, 'player'), nodes, capped: false };
          if (!ns.winner) next.push({ s: ns, pturns: node.pturns });
          if (nodes > cap) { capped = true; break; }
        }
        continue;
      }

      for (const plan of playerPlans(node.s)) {  // player unit → branch over the macro menu
        const ns = cloneState(node.s); applyPlan(ns, plan);
        const k = stateKey(ns);
        if (seen.has(k)) continue;
        seen.add(k); nodes++;
        if (ns.winner === 'player') return { solvable: true, par: node.pturns + 1, margin: teamHpFrac(ns, 'player'), nodes, capped: false };
        if (!ns.winner) next.push({ s: ns, pturns: node.pturns + 1 });
        if (nodes > cap) { capped = true; break; }
      }
      if (capped) break;
    }
    frontier = next;
  }
  return { solvable: false, par: -1, margin: 0, nodes, capped };
}

// a one-line difficulty read for an encounter. The margin cut-points are the SAME bands the encounter
// generator targets (encounter.js DIFFICULTY), so tier === the difficulty an encounter was built for.
//   capped → 'unknown' (raise cap) · !solvable → 'impossible' · else by HP-left margin:
export function gradeEncounter(setup, opts = {}) {
  const r = solveCombat(setup, opts);
  let tier;
  if (r.capped) tier = 'unknown';
  else if (!r.solvable) tier = 'impossible';
  else if (r.margin >= 0.70) tier = 'trivial';
  else if (r.margin >= 0.50) tier = 'comfortable';
  else if (r.margin >= 0.30) tier = 'fair';
  else if (r.margin >= 0.15) tier = 'tight';
  else tier = 'brutal';
  return { ...r, tier };
}

const SOLVER = { solveCombat, gradeEncounter };
if (typeof globalThis !== 'undefined') globalThis.MEGA_SOLVER = SOLVER;
export default SOLVER;
