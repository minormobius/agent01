// solvable.js — THE QUEST SOLVABILITY ORACLE. Proves, from content alone, that the anchor-turn-in
// campaign can be progressed through: every tier's turn-in gates have a keeper the PLACEMENT PIPELINE
// can actually put in front of the player at that tier. The combat solver proves a battle is winnable
// and the puzzle certifier proves a cabinet is solvable; this proves the STORY is — same house rule:
// nothing ships on vibes.
//
// Why this exists (the Kaelen Voss soft-lock): the quest waypoint names its keeper from CONTENT
// (anchors.js gateSetters), but placement (index.html populateChambers) draws from the tier-filtered
// pool (queryContent: narrative_tier ≤ player tier). A tier-2 keeper setting a tier-1 gate is named by
// the quest and INVISIBLE to placement — "find Kaelen Voss, keeper of the Rivet Chancel", who cannot
// exist yet. The oracle catches that class statically; requiredKeeperIds() is the runtime half that
// lets placement bypass the filter for load-bearing keepers.
//
// What is PROVEN here (the content/placement contract):
//   • the anchor chain is contiguous from tier 1 and every anchor has a turn-in (cleared flag),
//   • every gate flag has a setter in the pool,
//   • every gate's setter is PLACEABLE when the player needs it: visible at the anchor's tier (or
//     force-placed via requiredKeeperIds), not ambient, active + approved, its own requires
//     satisfiable from flags obtainable at earlier tiers, and seated in a zone whose deck is open,
//   • the gate's setting choice is REACHABLE inside the setter's dialogue (v102): walking from `start`
//     over choices whose own requires are meetable — a flag parked on an orphaned node, or behind a
//     choice gated on an unearnable fact, used to pass the proof and soft-lock the game anyway,
//   • the ending exists.
// What is NOT proven here (proven elsewhere): world geometry — that chambers exist, connect, and are
// walkable is pinned by the nave/rind/walkextend/playthrough selftests; presence of living residents
// to embiggen is guaranteed by flagKeeperResident's low-vitality fallback — and (v102, the Miren
// Tallow lock) the SURFACE must verify a "placed" keeper is still FINDABLE each session and re-place
// them when not: a static oracle cannot see a stale npc.discovered entry whose living resident failed
// to re-derive. requiredKeeperIds is that check's shopping list; index.html populateChambers owns the
// self-heal. For gates the pool PROVABLY cannot satisfy (the errors this oracle reports), the surface
// waives the gate at runtime (waivableGates) rather than letting the player wander a lock forever.
//
// Pure, DOM-free, node-tested (test/solvable.selftest.mjs). Run against the LIVE pool with
// hoop/scripts/prove-solvable.mjs.

import { anchorChain, gateSetters, advanceState } from './anchors.js';

const ERROR = 'error', WARN = 'warn';

// zone → the minimum narrative tier at which that zone's deck is reachable (index.html: the nave is
// always open; maybeBuildRind fires at tier ≥ 3; maybeBuildLowerRind at ≥ 4).
export const ZONE_TIER = { commons: 1, ward: 1, wards: 1, nave: 1, upper_rind: 3, rind: 3, lower_rind: 4, signal: 4 };

// a gate flag's scope names the zone its keeper is seated in (anchors.js GATE_RE taxonomy).
const SCOPE_ZONE = { commons: 'commons', ward: 'wards', rind: 'upper_rind', signal: 'lower_rind' };
const gateZone = (flag) => { const m = /^flag\.([a-z]+)\./.exec(flag || ''); return (m && SCOPE_ZONE[m[1]]) || null; };

const issue = (level, code, tier, msg, extra = {}) => ({ level, code, tier, msg, ...extra });

// ── dialogue reachability (v102) ────────────────────────────────────────────────────────────────────
// A setter is only a setter if the flag-setting CHOICE can actually be reached: walk the dialogue from
// `start` over choices whose own `requires.facts` are meetable from `earnable`. Facts set by traversable
// choices feed back into the walk (fixpoint), so "talk twice" trees still prove out.
const dialogueOf = (c) => (c && c.content && c.content.npc && c.content.npc.dialogue)
  || (c && c.content && c.content.dialogue) || null;
export function canReachFlag(c, flag, earnable) {
  const d = dialogueOf(c);
  if (!d || !d.nodes) return false;
  const have = new Set(earnable || []);
  const meets = (ch) => Object.keys((ch.requires && ch.requires.facts) || {}).every((k) => have.has(k));
  for (let round = 0; round < 8; round++) {   // fixpoint: each round may unlock choices that set new facts
    const seen = new Set(); const queue = [d.start || 'greet'];
    let grew = false;
    while (queue.length) {
      const nid = queue.shift();
      if (seen.has(nid)) continue; seen.add(nid);
      const node = d.nodes[nid]; if (!node) continue;
      for (const ch of (node.choices || [])) {
        if (!meets(ch)) continue;
        const sf = (ch.effects && ch.effects.set_facts) || {};
        if (Object.prototype.hasOwnProperty.call(sf, flag)) return true;
        for (const k of Object.keys(sf)) if (!have.has(k)) { have.add(k); grew = true; }
        if (ch.goto && !seen.has(ch.goto)) queue.push(ch.goto);
      }
    }
    if (!grew) break;
  }
  return false;
}

// ── the proof ───────────────────────────────────────────────────────────────────────────────────────
// content[] (a SERVED pool — run servePool first so room_bundles are exploded) → the report:
//   { solvable, verdict: 'PASS'|'BLOCK', chain, issues: [{level, code, tier, gate?, msg, contentId?}] }
// solvable ⇔ no ERROR-level issue. WARNs are pacing/coverage smells that don't wall progression.
export function proveProgression(content, opts = {}) {
  const issues = [];
  const chain = anchorChain(content);
  const setters = gateSetters(content);
  const byId = new Map((content || []).map((c) => [c.id, c]));

  if (!chain.length) {
    issues.push(issue(ERROR, 'no_anchors', 0, 'no load_bearing anchors in the pool — there is no campaign to prove'));
    return report(chain, issues);
  }
  // contiguity: anchors at 1..N with no gaps (a missing tier is an unclimbable rung).
  chain.forEach((a, i) => {
    if (a.tier !== i + 1) issues.push(issue(ERROR, 'chain_gap', i + 1, `expected an anchor at tier ${i + 1}, found '${a.name}' at tier ${a.tier} — the ladder has a missing rung`, { contentId: a.id }));
  });

  // flags obtainable strictly BEFORE working tier T: every earlier anchor's gates + cleared + choice flags.
  const obtainableBefore = (tier) => {
    const have = new Set();
    for (const a of chain) {
      if (a.tier >= tier) continue;
      for (const g of a.gates) have.add(g);
      if (a.clearedFlag) have.add(a.clearedFlag);
      for (const f of a.choiceFlags || []) have.add(f);
    }
    return have;
  };

  for (const a of chain) {
    if (!a.clearedFlag) issues.push(issue(ERROR, 'anchor_no_turnin', a.tier, `anchor '${a.name}' has no turn-in choice setting a flag.deck.*.cleared flag — the tier can never advance`, { contentId: a.id }));
    if (!a.gates.length) issues.push(issue(WARN, 'anchor_no_gates', a.tier, `anchor '${a.name}' gates on nothing — the turn-in is free`, { contentId: a.id }));
    const az = ZONE_TIER[a.zone] || 1;
    if (az > a.tier) issues.push(issue(ERROR, 'anchor_zone_locked', a.tier, `anchor '${a.name}' sits in ${a.zone} which only opens at tier ${az} — it can't be reached to turn in`, { contentId: a.id }));

    const earned = obtainableBefore(a.tier);
    for (const g of a.gates) {
      const s = setters[g];
      if (!s) { issues.push(issue(ERROR, 'gate_no_setter', a.tier, `gate '${g}' has NO setter anywhere in the pool — the turn-in can never open`, { gate: g })); continue; }
      const c = byId.get(s.contentId);
      if (!c) { issues.push(issue(ERROR, 'gate_no_setter', a.tier, `gate '${g}' names setter ${s.contentId} which is not in the pool`, { gate: g })); continue; }
      const who = `'${s.name}'${s.room ? ' (' + s.room + ')' : ''}`;
      if (c.content && c.content.ambient) issues.push(issue(ERROR, 'setter_ambient', a.tier, `gate '${g}' is set by ${who} who is AMBIENT — wanderers are never placed as keepers`, { gate: g, contentId: c.id }));
      if (c.status && c.status !== 'active') issues.push(issue(ERROR, 'setter_unservable', a.tier, `gate '${g}' is set by ${who} whose status is '${c.status}'`, { gate: g, contentId: c.id }));
      if (c.approved === false) issues.push(issue(ERROR, 'setter_unservable', a.tier, `gate '${g}' is set by ${who} who is unapproved`, { gate: g, contentId: c.id }));
      // the tier-filter trap: placement's pool query hides narrative_tier > player tier. requiredKeeperIds
      // bypasses it at runtime, so this is a WARN when the bypass is in play (opts.forcePlaced) and an
      // ERROR for a surface that hasn't wired the bypass.
      const nt = c.narrative_tier || 1;
      if (nt > a.tier) issues.push(issue(opts.forcePlaced ? WARN : ERROR, 'setter_invisible', a.tier, `gate '${g}' is set by ${who} at narrative_tier ${nt} — invisible to the tier-${a.tier} placement pool${opts.forcePlaced ? ' (force-placed via requiredKeeperIds)' : ''}`, { gate: g, contentId: c.id }));
      // the setter's own gates must be meetable from flags earnable at earlier tiers (or this tier's other gates).
      const need = Object.keys((c.requires && c.requires.facts) || {});
      const thisTier = new Set(a.gates);
      const unmeetable = need.filter((k) => !earned.has(k) && !thisTier.has(k));
      if (unmeetable.length) issues.push(issue(ERROR, 'setter_gated', a.tier, `gate '${g}' is set by ${who} who requires ${JSON.stringify(unmeetable)} — not obtainable by tier ${a.tier}`, { gate: g, contentId: c.id }));
      // the flag-setting choice must be REACHABLE inside the setter's own dialogue (v102): from `start`,
      // over choices meetable from what the player can hold while working this tier.
      const earnable = [...earned, ...a.gates];
      if (!canReachFlag(c, g, earnable)) issues.push(issue(ERROR, 'setter_flag_unreachable', a.tier, `gate '${g}' is set by ${who} but the setting choice is UNREACHABLE in their dialogue (orphaned node, or gated on facts not earnable at tier ${a.tier})`, { gate: g, contentId: c.id }));
      // zone: the keeper's seat must be on a deck that's open while the player works this tier.
      const z = s.zone || gateZone(g);
      const zt = ZONE_TIER[z] || 1;
      if (zt > a.tier) issues.push(issue(ERROR, 'setter_zone_locked', a.tier, `gate '${g}' is set by ${who} seated in ${z}, which only opens at tier ${zt}`, { gate: g, contentId: c.id }));
    }
  }

  // the ending: at least one conclusion beat must exist for the chapter to close.
  const hasConclusion = (content || []).some((c) => c.type === 'plot_beat' && c.status !== 'retired'
    && (c.tags || []).map((t) => String(t).toLowerCase()).includes('conclusion'));
  if (!hasConclusion) issues.push(issue(WARN, 'no_conclusion', chain[chain.length - 1].tier, 'no conclusion plot_beat in the pool — the final turn-in has no ending to land on'));

  return report(chain, issues);
}

function report(chain, issues) {
  const errors = issues.filter((i) => i.level === ERROR);
  return { solvable: errors.length === 0, verdict: errors.length ? 'BLOCK' : 'PASS', chain, issues, errors };
}

// ── the runtime half: which keepers MUST be placed right now ────────────────────────────────────────
// The active anchor's unmet gate setters, in gate order — the load-bearing NPCs placement has to seat
// regardless of the tier filter (fetch by id, bypass queryContent). Deduped; [] when the tier has no
// anchor or every gate is met.
export function requiredKeeperIds(chain, setters, facts, tier) {
  const st = advanceState(chain, facts, tier);
  if (!st || st.allGatesSet) return [];
  const out = [];
  for (const g of st.unmetGates) {
    const s = setters[g];
    if (s && s.contentId && !out.includes(s.contentId)) out.push(s.contentId);
  }
  return out;
}

// ── the runtime waiver: gates the pool PROVABLY cannot satisfy ──────────────────────────────────────
// From a proveProgression report, the gate flags at `tier` whose defect means NO play, however long,
// can ever set them — no setter at all, a tombstoned/ambient/unreachable/unearnable setter, or one
// seated behind a deck that only opens past this tier (circular). The SURFACE waives these (sets the
// fact with a notice) so a content gap degrades to a shortened tier instead of an unwinnable wander.
// setter_invisible is deliberately NOT waivable — requiredKeeperIds force-places those.
const WAIVABLE = new Set(['gate_no_setter', 'setter_ambient', 'setter_unservable', 'setter_gated', 'setter_flag_unreachable', 'setter_zone_locked']);
export function waivableGates(report, tier) {
  const out = [];
  for (const e of (report && report.errors) || []) {
    if (e.tier === tier && e.gate && WAIVABLE.has(e.code) && !out.includes(e.gate)) out.push(e.gate);
  }
  return out;
}

export default { proveProgression, requiredKeeperIds, waivableGates, canReachFlag, ZONE_TIER };
