// anchors.js — THE ANCHOR-TURN-IN ADVANCEMENT (v100, hoopy's 2026-06 load-bearing model).
//
// Hoopy's design, run forward: progression is NOT a code-side state machine — it is encoded entirely in
// his content as dialogue trees. One LOAD-BEARING ANCHOR per tier (Olo · Solen · Sevin · Luna). Each
// anchor's `greet` node carries a hidden TURN-IN choice gated (`requires.facts`) on a set of GATE FLAGS;
// those flags are set by talking to ordinary KEEPER NPCs scattered through the tier's zone (the randomness
// of where they're seated is the forcing function for exploration). Once every gate is set the turn-in
// choice appears; selecting it sets a `flag.deck.<deck>.cleared` flag (and, at Sevin/Luna, a CHOICE flag:
// `flag.chose.<faction>` / `flag.signal.disposition`) and directs the player to the next anchor.
//
// The ENGINE already gates choices on facts and applies `set_facts` — so the keepers, the gating, and the
// flag-setting all work with no code. This module is the thin GLUE the surface needs:
//   • the anchor chain, DERIVED from his content (`content.load_bearing` + the turn-in node's set_facts),
//   • the gate-flag → keeper-setter map (so the quest can point a waypoint at an unmet keeper),
//   • the cleared-flag → narrative-tier mapping (the actual level-up),
//   • the ending selector (the conclusion plot_beat for a (faction, disposition) pair).
//
// Pure, DOM-free, node-tested (test/anchors.selftest.mjs). Add a tier to his export and the chain grows
// with no code change.

// ── flag taxonomy ──────────────────────────────────────────────────────────────────────────────────
// a gate flag is a per-tier keeper flag: flag.<scope>.<...> where scope ∈ {commons, ward, rind, signal}.
const GATE_RE = /^flag\.(commons|ward|rind|signal)\./;
// a deck-clear flag is what an anchor turn-in sets; it IS the level-up signal.
const CLEAR_RE = /^flag\.deck\.([a-z_]+)\.cleared$/;
// the two "choice" turn-ins also set these (captured, not gated on):
const isChoiceFlag = (k) => /^flag\.chose\./.test(k) || k === 'flag.signal.disposition';

const dialogueNodes = (c) => (c && c.content && c.content.npc && c.content.npc.dialogue && c.content.npc.dialogue.nodes)
  || (c && c.content && c.content.dialogue && c.content.dialogue.nodes) || {};
const npcName = (c) => String((c && c.content && ((c.content.npc && c.content.npc.name) || c.content.name)) || '').trim();

// walk every choice of an item's dialogue tree → [{node, choice}]
function eachChoice(c) {
  const out = [];
  for (const [nid, node] of Object.entries(dialogueNodes(c))) for (const ch of (node.choices || [])) out.push({ node: nid, choice: ch });
  return out;
}

// ── the anchor chain ─────────────────────────────────────────────────────────────────────────────
// content[] → ordered anchors. An anchor is any item carrying `content.load_bearing` (his explicit
// {tier, gates} block). We read the cleared-flag + any choice-flags off its turn-in node's effects.
export function anchorChain(content) {
  const anchors = [];
  for (const c of content || []) {
    const lb = c && c.content && c.content.load_bearing;
    if (!lb || typeof lb.tier !== 'number') continue;
    let clearedFlag = null, clearedDeck = null; const choiceFlags = [];
    for (const { choice } of eachChoice(c)) {
      const sf = (choice.effects && choice.effects.set_facts) || {};
      for (const k of Object.keys(sf)) {
        const m = CLEAR_RE.exec(k); if (m) { clearedFlag = k; clearedDeck = m[1]; }
        else if (isChoiceFlag(k)) choiceFlags.push(k);
      }
    }
    anchors.push({
      id: c.id, name: npcName(c), tier: lb.tier,
      zone: (c.content && c.content.zone) || c.zone || null,
      navefac: (c.content && c.content.nave_faction) || c.naveFaction || null,
      room: c.roomName || (c.content && c.content.name) || null,
      gates: (lb.gates || []).slice(),
      clearedFlag, clearedDeck,
      choiceFlags: [...new Set(choiceFlags)],
    });
  }
  anchors.sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : 1));
  // chain each anchor to the next (for "go to <next> now" directions)
  anchors.forEach((a, i) => { a.next = anchors[i + 1] ? { id: anchors[i + 1].id, name: anchors[i + 1].name, zone: anchors[i + 1].zone } : null; });
  return anchors;
}

// the anchor whose turn-in advances FROM `tier` (the active anchor: its load_bearing.tier === tier).
export function anchorForTier(chain, tier) { return (chain || []).find((a) => a.tier === tier) || null; }

// ── the gate-flag → keeper-setter map ──────────────────────────────────────────────────────────────
// content[] → { gateFlag: {contentId, name, room, zone, verb, navefac} }. The keeper that sets each gate
// (the person you must find + talk to). First setter wins (his pool has one canonical setter per flag).
export function gateSetters(content) {
  const map = {};
  for (const c of content || []) {
    for (const { choice } of eachChoice(c)) {
      const sf = (choice.effects && choice.effects.set_facts) || {};
      for (const k of Object.keys(sf)) {
        if (!GATE_RE.test(k) || CLEAR_RE.test(k) || isChoiceFlag(k) || map[k]) continue;
        map[k] = {
          contentId: c.id, name: npcName(c),
          room: c.roomName || (c.content && c.content.name) || null,
          zone: (c.content && c.content.zone) || c.zone || null,
          verb: c.verb || (c.content && c.content.verb) || null,
          navefac: (c.content && c.content.nave_faction) || c.naveFaction || null,
        };
      }
    }
  }
  return map;
}

// ── advancement state for the current tier (what the quest readout renders) ─────────────────────────
// facts is the player's flat fact map; tier is narrative_tier. Returns the active anchor + how many of
// its gates are met + whether the turn-in is available + whether it's already been turned in.
export function advanceState(chain, facts, tier) {
  const anchor = anchorForTier(chain, tier);
  if (!anchor) return null;
  const f = facts || {};
  const unmet = anchor.gates.filter((g) => f[g] !== true);
  const gatesSet = anchor.gates.length - unmet.length;
  return {
    anchor,
    tier,
    gatesSet, gatesTotal: anchor.gates.length,
    unmetGates: unmet,
    allGatesSet: unmet.length === 0,
    turnedIn: !!(anchor.clearedFlag && f[anchor.clearedFlag] === true),
  };
}

// the next keeper to find = the setter of the first unmet gate (so the waypoint has a target). Falls
// back to null (no known setter → an exploration objective with no pin).
export function nextKeeper(chain, setters, facts, tier) {
  const st = advanceState(chain, facts, tier);
  if (!st || st.allGatesSet) return null;
  for (const g of st.unmetGates) if (setters[g]) return { flag: g, ...setters[g] };
  return null;
}

// ── the level-up: cleared flags → narrative tier ───────────────────────────────────────────────────
// An anchor at load_bearing.tier T, once turned in (its clearedFlag set), advances the player to T+1.
// Returns the highest tier reachable from the flags currently set (never below `curTier`, capped at cap).
export function tierFromClears(chain, facts, curTier, cap = Infinity) {
  const f = facts || {};
  let t = curTier || 1;
  for (const a of chain || []) if (a.clearedFlag && f[a.clearedFlag] === true) t = Math.max(t, Math.min(cap, a.tier + 1));
  return t;
}

// the deck-clear flag for a given tier's anchor (so the surface can detect a fresh turn-in).
export function clearedFlagForTier(chain, tier) { const a = anchorForTier(chain, tier); return a ? a.clearedFlag : null; }

// ── the ending: the conclusion plot_beat for a (faction, disposition) pair ──────────────────────────
// Luna's turn-in sets flag.chose.<faction> (carried from Sevin) + flag.signal.disposition ∈
// {answer,refuse,amplify,suppress}. The 12 conclusion plot_beats are tagged `conclusion` + a faction +
// a disposition; pick the one matching both. Falls back to faction-only, then any conclusion beat.
const DISPOSITIONS = ['answer', 'refuse', 'amplify', 'suppress'];
export function endingBeat(content, faction, disposition) {
  const beats = (content || []).filter((c) => c.type === 'plot_beat' && c.status !== 'retired'
    && (c.tags || []).map((t) => String(t).toLowerCase()).includes('conclusion'));
  const has = (c, t) => (c.tags || []).map((x) => String(x).toLowerCase()).includes(t);
  return beats.find((c) => faction && disposition && has(c, faction) && has(c, disposition))
    || beats.find((c) => faction && has(c, faction))
    || beats.find((c) => disposition && has(c, disposition))
    || beats[0] || null;
}

// the disposition the player chose at Luna's turn-in (or null).
export function chosenDisposition(facts) {
  const d = facts && facts['flag.signal.disposition'];
  return DISPOSITIONS.includes(d) ? d : null;
}
// the faction the player chose at Sevin's turn-in (flag.chose.<faction>) — the v100 narrow-flag form.
export function chosenFactionFlag(facts) {
  if (!facts) return null;
  for (const k of Object.keys(facts)) { const m = /^flag\.chose\.([a-z_]+)$/.exec(k); if (m && facts[k] === true) return m[1]; }
  return null;
}

export default {
  anchorChain, anchorForTier, gateSetters, advanceState, nextKeeper,
  tierFromClears, clearedFlagForTier, endingBeat, chosenDisposition, chosenFactionFlag,
};
