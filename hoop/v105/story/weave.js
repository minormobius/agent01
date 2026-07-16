// weave.js — THE SEEDED QUEST SPINE (v105). Pure, no DOM, no LLM, node-tested.
//
// hoopy's pool carries ~168 room bundles, but the campaign always ran through the same two dozen
// authored setters — every world had the same quest NPCs. This module ties the pull to the WORLD
// GENERATION SEED: for every gate flag of every anchor tier, a keeper is CAST deterministically from
// the zone-and-faction-legal slice of the room-bundle pool, and the gate-setting exchange is SPLICED
// (additively) onto that keeper's own authored dialogue. Same (pool, seed) → same cast, forever
// (atproto-stable); a different seed → a different set of quest NPCs, provably progressable.
//
// The abstraction contract (room bundles will change under our feet):
//   • nothing here names a bundle — candidates are derived from the SERVED pool's shape (type npc,
//     carries a `room`, zone/nave_faction on content, not ambient, not load_bearing),
//   • gates are derived from the anchors' load_bearing blocks (anchors.js), never hard-coded,
//   • the splice is ADDITIVE — the keeper's authored tree is untouched except for one new choice on
//     the start node + one new namespaced node (`q_charge_*`), so a republished bundle re-weaves
//     cleanly. The gate's AUTHORED setter (when a different keeper was cast) has only that one
//     set_facts key stripped — their prose and every other effect survive.
//   • anchor-briefing gates (a gate whose authored setter IS an anchor — Sevin's first scale, Luna's
//     chamber key) are never re-cast: the anchor's own charge is the beat.
//
// weaveWorld() is the one entry the surface calls: servePool output + world seed → the woven pool +
// the cast plan + (optionally) the tier-2 murder mystery (mystery.js). proveProgression on the woven
// pool is the per-seed solvability proof; test/weave.selftest.mjs sweeps seeds to pin it.

import { anchorChain, gateSetters } from './anchors.js';
import { buildMystery, weaveMystery } from './mystery.js';

// ── seeded hashing (no Math.random/Date — the borges rule) ───────────────────────────────────────────
export function hash32(...xs) {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    const s = String(x);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x9e3779b9; h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  }
  return (h ^ (h >>> 16)) >>> 0;
}
export const pickVariant = (arr, ...seedParts) => arr[hash32(...seedParts) % arr.length];

// ── gate taxonomy ────────────────────────────────────────────────────────────────────────────────────
// flag.<scope>.<rest> where scope ∈ {commons, ward, rind, signal}; <rest> may lead with a faction.
export const FACTIONS = ['continuant', 'rindwalker', 'drift'];
export const FACTION_LABEL = { continuant: 'Continuant', rindwalker: 'Rindwalker', drift: 'Drift' };
// gate scope → the keeper zones that satisfy it (the served pool spells zones several ways).
const SCOPE_ZONES = {
  commons: ['commons', 'nave'],
  ward: ['ward', 'wards'],
  rind: ['rind', 'upper_rind'],
  signal: ['signal', 'lower_rind'],
};
export function parseGateFlag(flag) {
  const m = /^flag\.(commons|ward|rind|signal)\.(.+)$/.exec(String(flag || ''));
  if (!m) return null;
  const scope = m[1]; let rest = m[2], faction = null;
  for (const f of FACTIONS) if (rest === f || rest.startsWith(f + '_')) { faction = f; rest = rest.slice(f.length).replace(/^_/, ''); break; }
  return { scope, zones: SCOPE_ZONES[scope] || [], faction, slot: rest || scope };
}

// ── candidate shape (the room-bundle contract, read off the served pool) ─────────────────────────────
const keeperZone = (c) => String((c.content && c.content.zone) || c.zone || '').toLowerCase();
const keeperFaction = (c) => {
  const nf = String((c.content && c.content.nave_faction) || c.naveFaction || '').toLowerCase();
  if (FACTIONS.includes(nf)) return nf;
  for (const t of (c.tags || [])) if (FACTIONS.includes(String(t).toLowerCase())) return String(t).toLowerCase();
  return null;
};
const hasDialogue = (c) => { const d = c.content && c.content.dialogue; return !!(d && d.nodes && d.nodes[d.start || 'greet']); };
const isAnchor = (c) => !!(c.content && c.content.load_bearing);
const isBundleKeeper = (c) => c && c.type === 'npc' && c.room != null && !isAnchor(c)
  && !(c.content && c.content.ambient) && c.approved !== false && (c.status || 'active') === 'active' && hasDialogue(c)
  && !(c.requires && ((c.requires.facts && Object.keys(c.requires.facts).length) || (c.requires.items || []).length));

// every castable keeper for one gate, id-sorted (determinism). `exclude` = ids never eligible
// (anchors are excluded structurally; authored setters of OTHER gates are passed in by castSpine).
export function castCandidates(content, gate, anchorTier, exclude) {
  const g = parseGateFlag(gate); if (!g) return [];
  const ex = exclude || new Set();
  return (content || [])
    .filter((c) => isBundleKeeper(c) && !ex.has(c.id)
      && g.zones.includes(keeperZone(c))
      && (!g.faction || keeperFaction(c) === g.faction)
      && (c.narrative_tier || 1) <= (anchorTier || 5))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ── THE CAST: one keeper per gate, seeded off the world seed ─────────────────────────────────────────
// content = the SERVED pool (servePool output). Returns { plan, byGate, issues }:
//   plan[i] = { gate, tier, anchorId, zone, faction, slot, keeperId, keeperName, room, verb,
//               authoredId, authoredName, authoredPick, briefing }
// A gate whose authored setter is an ANCHOR keeps its briefing (briefing:true, no cast). A gate the
// pool cannot cast keeps its authored setter (issue logged; weaveCast leaves it untouched) — so a
// thin pool degrades to the authored spine, never to a broken one.
export function castSpine(content, worldSeed) {
  const chain = anchorChain(content);
  const authored = gateSetters(content);
  const byId = new Map((content || []).map((c) => [c.id, c]));
  const plan = [], issues = [];
  // authored setters of ANY gate are off the casting board (the named guys aren't double-booked) —
  // except each may still be drawn for its OWN gate (the seeded roll can land on the incumbent).
  const authoredIds = new Set(Object.values(authored).map((s) => s && s.contentId).filter(Boolean));
  const used = new Set();
  for (const a of chain) {
    for (const gate of a.gates) {
      const g = parseGateFlag(gate);
      const s = authored[gate] || null;
      const sc = s ? byId.get(s.contentId) : null;
      const entry = {
        gate, tier: a.tier, anchorId: a.id, zone: g ? g.zones[g.zones.length - 1] : (a.zone || null),
        faction: g && g.faction, slot: g ? g.slot : gate,
        authoredId: s ? s.contentId : null, authoredName: s ? s.name : null,
        keeperId: null, keeperName: null, room: null, verb: null, authoredPick: false, briefing: false,
      };
      if (sc && isAnchor(sc)) { entry.briefing = true; entry.keeperId = sc.id; entry.keeperName = s.name; entry.room = s.room; plan.push(entry); continue; }
      const exclude = new Set([...authoredIds].filter((id) => id !== (s && s.contentId)));
      const cands = castCandidates(content, gate, a.tier, exclude).filter((c) => !used.has(c.id));
      if (!cands.length) {
        issues.push({ gate, tier: a.tier, code: 'no_castable_keeper', msg: `gate '${gate}' has no castable room bundle — the authored setter stands` });
        if (s) { entry.keeperId = s.contentId; entry.keeperName = s.name; entry.room = s.room; entry.verb = s.verb; entry.authoredPick = true; used.add(s.contentId); }
        plan.push(entry); continue;
      }
      const pick = cands[hash32(worldSeed, gate) % cands.length];
      used.add(pick.id);
      entry.keeperId = pick.id;
      entry.keeperName = (pick.content && pick.content.name) || pick.id;
      entry.room = pick.roomName || null;
      entry.verb = pick.verb || null;
      entry.authoredPick = !!(s && s.contentId === pick.id);
      plan.push(entry);
    }
  }
  const byGate = {}; for (const e of plan) byGate[e.gate] = e;
  return { plan, byGate, issues };
}

// ── splice primitives (immutable — never mutate a pool item) ─────────────────────────────────────────
const cloneDialogue = (c) => {
  const cc = { ...c, content: { ...c.content } };
  const d = cc.content.dialogue || { start: 'greet', nodes: {} };
  cc.content.dialogue = { ...d, nodes: { ...(d.nodes || {}) } };
  return cc;
};
// add `choice` to `nodeId` (default: start) and register `nodes` — returns the cloned item.
export function spliceChoice(c, { choice, nodes, atNode }) {
  const cc = cloneDialogue(c);
  const d = cc.content.dialogue;
  const at = atNode || d.start || 'greet';
  const node = d.nodes[at] || { says: '', choices: [] };
  d.nodes[at] = { ...node, choices: [...(node.choices || []), choice] };
  for (const [nid, n] of Object.entries(nodes || {})) d.nodes[nid] = n;
  return cc;
}
// add a gate to a LOAD-BEARING anchor: load_bearing.gates gains it (LAST — a final subquest) and the
// turn-in choice (the one setting flag.deck.*.cleared) gains it in requires.facts. Immutable clone.
// Shared by the mystery and the mythograph weaves.
export function anchorWithGate(anchor, gate) {
  const cc = { ...anchor, content: { ...anchor.content } };
  const lb = cc.content.load_bearing || {};
  cc.content.load_bearing = { ...lb, gates: [...(lb.gates || []).filter((g) => g !== gate), gate] };
  const d = cc.content.dialogue || (cc.content.npc && cc.content.npc.dialogue);
  if (d && d.nodes) {
    const nodes = { ...d.nodes };
    for (const [nid, n] of Object.entries(nodes)) {
      if (!(n.choices || []).some((ch) => ch.effects && ch.effects.set_facts && Object.keys(ch.effects.set_facts).some((k) => /^flag\.deck\..*\.cleared$/.test(k)))) continue;
      nodes[nid] = {
        ...n,
        choices: n.choices.map((ch) => {
          const isTurnin = ch.effects && ch.effects.set_facts && Object.keys(ch.effects.set_facts).some((k) => /^flag\.deck\..*\.cleared$/.test(k));
          if (!isTurnin) return ch;
          const req = ch.requires || {};
          return { ...ch, requires: { ...req, facts: { ...(req.facts || {}), [gate]: true } } };
        }),
      };
    }
    if (cc.content.dialogue) cc.content.dialogue = { ...d, nodes };
    else cc.content.npc = { ...cc.content.npc, dialogue: { ...d, nodes } };
  }
  return cc;
}

// strip ONE set_facts key from every choice of an item's dialogue (the authored setter hand-off).
export function stripGateFromDialogue(c, gate) {
  const cc = cloneDialogue(c);
  const d = cc.content.dialogue;
  for (const [nid, n] of Object.entries(d.nodes)) {
    if (!(n.choices || []).some((ch) => ch.effects && ch.effects.set_facts && Object.prototype.hasOwnProperty.call(ch.effects.set_facts, gate))) continue;
    d.nodes[nid] = {
      ...n,
      choices: n.choices.map((ch) => {
        if (!(ch.effects && ch.effects.set_facts && Object.prototype.hasOwnProperty.call(ch.effects.set_facts, gate))) return ch;
        const sf = { ...ch.effects.set_facts }; delete sf[gate];
        const eff = { ...ch.effects }; if (Object.keys(sf).length) eff.set_facts = sf; else delete eff.set_facts;
        return { ...ch, effects: eff };
      }),
    };
  }
  return cc;
}

// ── the charge prose (per gate scope; interpolated, variant picked by seed) ──────────────────────────
// The player's ASK is quest-voiced (they carry the anchor's charge); the keeper's ANSWER is neutral-
// oracular so it sits under any bundle's authored voice; the CLOSE hands the piece back to the anchor.
const FACLINE = {
  continuant: 'The Continuants keep — air, records, succession. Their face is the ledger that outlives every hand that writes in it.',
  rindwalker: 'The Rindwalkers mend — every weld a vow, every fault a confession. Their face is devotion wearing work-gloves.',
  drift: 'The Drift move — bread, news, regard. Their face is the current, and the current never once stands still.',
};
const WARDLINE = {
  continuant: 'This ward holds the long ledger: life-support tended like an heirloom, records unbroken, everything handed on exactly. Know that, and you know us.',
  rindwalker: 'This ward reads the hull like scripture: the seams are verses, the faults confessions. What we keep faith with is the ship itself. Know that, and you know us.',
  drift: 'This ward is the Braid: everything circulates — goods, favours, secrets — and we are the current that carries them. Know that, and you know us.',
};
const RINDLINE = {
  continuant: 'Down here the Continuant work is scale itself: the trunk lines, the ledgers of air and water run structural. What the Nave tends as an heirloom, the rind tends as a body.',
  rindwalker: 'Down here the Rindwalker creed stops being metaphor: the skin of the ship is in your hands, and every plate you true is a prayer said at scale.',
  drift: 'Down here the Drift routes never rest: the arteries, the freight, the news that rides them. The rind is circulation made structural.',
};
const SIGNAL_GLOSS = {   // known slots get a hand gloss; anything new falls back to the humanized slot
  chamber_bearing: 'the bearing of the Signal Chamber — which way the deep hum leans',
  chamber_depth: 'how deep the chamber sits — further down than the plans admit',
  chamber_seal: 'the seal on the chamber — what was closed, and by whom',
  chamber_key: 'the key to the chamber',
  it_responds: 'the way the signal ANSWERS when spoken to',
  predates_all: 'the age of the signal — older than the ship, older than the plan',
  luna_prepared: 'what Luna made ready, long before you woke',
  translation_wakes: 'what wakes when the translation runs',
};
const humanize = (slot) => String(slot || '').replace(/_/g, ' ');

const CHARGE = {
  commons: {
    ask: [
      'I am learning how the city wears its skin. Show me the {fac} face of the Commons.',
      'Olo set me reading the mortar of this place. What face do the {fac} show the Commons?',
      'Three faces hold the Commons, I am told. Give me the {fac} one.',
    ],
    says: [
      'Then look from {room}, because you can see it from here. {facline}',
      'You ask it in the right room. {facline} That is the whole of it, and none of it is hidden.',
      '{facline} The Commons shows this face to anyone who stands still long enough to see it.',
    ],
    close: ['Then I have seen it. Olo will want to hear.', 'I can carry that back.', 'That is the piece I was missing.'],
  },
  ward: {
    ask: [
      'Factor Solen sent me to know the wards, not just walk them. Make me know the {fac} ward.',
      'The Factor asks what the wards will not say aloud. Tell me what the {fac} ward IS.',
      'I owe Solen an account of the {fac} ward. Give me the true one.',
    ],
    says: [
      '{wardline}',
      'Solen asks, does she. Then have the answer whole: {wardline}',
      'Few ask; fewer listen. {wardline}',
    ],
    close: ['Solen will hear it as you said it.', 'Then the ward is known to me.', 'I will carry that to the Quorum.'],
  },
  rind: {
    ask: [
      'Sevin is teaching me to read the rind at scale. What does the {fac} work look like down here?',
      'I walk the rind for Sevin — one scale of it is yours. Read it to me.',
      'The rind is tagged by whose domain you stand in. This is {fac} ground — tell me what it carries.',
    ],
    says: [
      '{rindline}',
      'You stand in {room}, so half the answer is around you. {rindline}',
      'At scale, then. {rindline}',
    ],
    close: ['One more scale read. Sevin keeps the tally.', 'Then the rind is one verse clearer.', 'I will bring that up the shaft.'],
  },
  signal: {
    ask: [
      'Luna gathers testimony about the deep signal. Yours is {gloss}.',
      'Before the chamber answers, Luna says I must hold every piece. Give me {gloss}.',
      'The deep keeps its facts in people. I am told you keep {gloss}.',
    ],
    says: [
      'So the waking one collects at last. Listen, then, and hold it exactly: {gloss} is mine to keep, and now it is yours to carry. The deep does not repeat itself.',
      'I wondered when you would come. What I keep is {gloss}. Take it whole — half of it is worse than none.',
      'The cold hull remembers what the Nave forgets. {gloss} — that is my piece of it. Carry it to Luna unbent.',
    ],
    close: ['Luna will have it unbent.', 'I hold it. The deep can stop repeating it now.', 'Then the chamber is one key nearer.'],
  },
};
export function chargeProse(entry, worldSeed) {
  const bank = CHARGE[parseGateFlag(entry.gate) ? parseGateFlag(entry.gate).scope : 'commons'] || CHARGE.commons;
  const fac = entry.faction || 'drift';
  const fill = (s) => String(s)
    .replace(/\{fac\}/g, FACTION_LABEL[fac] || fac)
    .replace(/\{room\}/g, entry.room || 'this room')
    .replace(/\{facline\}/g, FACLINE[fac] || '')
    .replace(/\{wardline\}/g, WARDLINE[fac] || '')
    .replace(/\{rindline\}/g, RINDLINE[fac] || '')
    .replace(/\{gloss\}/g, SIGNAL_GLOSS[entry.slot] || humanize(entry.slot));
  return {
    ask: fill(pickVariant(bank.ask, worldSeed, entry.gate, 'ask')),
    says: fill(pickVariant(bank.says, worldSeed, entry.gate, 'says')),
    close: fill(pickVariant(bank.close, worldSeed, entry.gate, 'close')),
  };
}

// ── weave the cast into the pool ─────────────────────────────────────────────────────────────────────
// For every cast (non-briefing, non-authoredPick) entry: splice the charge onto the cast keeper and
// strip the gate from its authored setter. Returns a NEW content array; untouched items pass by
// reference. Node/choice ids are namespaced q_charge_* so a re-weave of fresh servePool output (the
// only way this is called) can never collide with authored ids.
export function weaveCast(content, cast, worldSeed) {
  const byId = new Map((content || []).map((c) => [c.id, c]));
  for (const e of cast.plan || []) {
    if (e.briefing || e.authoredPick || !e.keeperId) continue;
    const keeper = byId.get(e.keeperId); if (!keeper) continue;
    const prose = chargeProse(e, worldSeed);
    const nid = 'q_charge_' + e.gate.replace(/[^a-z0-9]+/gi, '_');
    // the gate sets on the ASK — the moment the keeper gives their answer, the piece is heard. It used
    // to sit on the closing pleasantry, so a player who read the answer and hit Esc/⏎/close (the natural
    // exit) never fired it and the waypoint stayed stuck (the Havel bug). The ✒ marks the quest choice.
    byId.set(e.keeperId, spliceChoice(keeper, {
      choice: { id: nid + '_ask', goto: nid, text: '✒ ' + prose.ask, effects: { set_facts: { [e.gate]: true } } },
      nodes: { [nid]: { says: prose.says, choices: [{ id: nid + '_done', text: prose.close, effects: { end: true } }] } },
    }));
    if (e.authoredId && e.authoredId !== e.keeperId) {
      const auth = byId.get(e.authoredId);
      if (auth) byId.set(e.authoredId, stripGateFromDialogue(auth, e.gate));
    }
  }
  return (content || []).map((c) => byId.get(c.id) || c);
}

// ── THE MYTHOGRAPH QUEST (the Olo finale) ────────────────────────────────────────────────────────────
// The FINAL keeper of the tier-1 anchor's lineup sends the player to a LEARN TERMINAL to read the
// mythograph (the Tabard reading-room console; the game sets `flag.read_terminal` when any is read —
// a runtime fact the oracle treats as world-external), then hears the report — the report ASK sets
// flag.commons.mythograph_reported, which the anchor's turn-in now requires. Meeting the keeper never
// auto-sets this gate (the surface excludes it, like the mystery's): the terminal walk IS the quest.
export const MYTHOGRAPH_GATE = 'flag.commons.mythograph_reported';
// the SEND is a pool-produced fact (the keeper's own choice sets it); the READ is runtime — the surface
// sets it on the first terminal read AFTER the send, so a prologue terminal read can't skip the walk.
export const MYTHOGRAPH_SENT_FACT = 'fact.mythograph.sent';
export const MYTHOGRAPH_READ_FACT = 'fact.mythograph.read';
const MYTH_SEND = [
  'The three faces are only the skin. The reading rooms keep the ship’s memory of itself — find a learn terminal (▤) and read the mythograph posted there. Then come back and tell me what it made of you.',
  'You have heard the faces; now hear the record. A learn terminal (▤) keeps the mythograph — the tale the ship tells about the one who wakes. Read it. Then bring me what it says.',
  'One thing more, before {anchor} closes the ledger. Find a learn terminal (▤) and read the mythograph. The Commons wears its skin; the terminals keep its dreams. Come tell me what you find.',
];
const MYTH_REPORT_ASK = [
  '✒ I read the mythograph. My name is in it — stencilled over another’s.',
  '✒ The terminal showed me the mythograph. It seems to know me.',
  '✒ I have read the mythograph, as you asked.',
];
const MYTH_REPORT_SAYS = [
  'So it does know you. A tale posted before its telling, and your name in the stencil — carry that to {anchor} exactly as you found it. It is the last piece the ledger wants.',
  'Then you have seen what the reading rooms will not say aloud: the story was here before you were. {anchor} will want that from your own mouth. Go.',
  'Good. Do not decide yet what it means — only carry it. {anchor} keeps the ledger; this belongs in it.',
];
export function buildMythograph(content, cast, worldSeed) {
  const chain = anchorChain(content);
  const anchor = chain.find((a) => a.tier === 1);
  if (!anchor || !anchor.gates.length) return null;
  const entries = anchor.gates.map((g) => cast.byGate[g]).filter((e) => e && e.keeperId && !e.briefing);
  const fin = entries[entries.length - 1];                       // the FINAL person in the lineup
  if (!fin) return null;
  return {
    gate: MYTHOGRAPH_GATE, sentFact: MYTHOGRAPH_SENT_FACT, readFact: MYTHOGRAPH_READ_FACT,
    anchorId: anchor.id, anchorName: anchor.name, tier: anchor.tier,
    keeperId: fin.keeperId, keeperName: fin.keeperName, room: fin.room, keeperGate: fin.gate,
  };
}
export function weaveMythograph(content, q, worldSeed) {
  if (!q) return content;
  const byId = new Map((content || []).map((c) => [c.id, c]));
  const anchor = byId.get(q.anchorId);
  if (anchor) byId.set(q.anchorId, anchorWithGate(anchor, q.gate));
  const keeper = byId.get(q.keeperId);
  if (keeper) {
    const fill = (s) => String(s).replace(/\{anchor\}/g, q.anchorName || 'your guide');
    let woven = spliceChoice(keeper, {
      // the SEND: surfaces once their own charge is heard (auto-set on meeting), so the finale reads
      // as "one thing more" from the last keeper — not a parallel errand. Taking it marks you SENT
      // (the Havel rule: the fact lands on the ask), which arms the terminal read.
      choice: { id: 'q_myth_send', goto: 'q_myth_send', text: '✒ Is there more the Commons keeps?', requires: { facts: { [q.keeperGate]: true } }, effects: { set_facts: { [q.sentFact]: true } } },
      nodes: { q_myth_send: { says: fill(pickVariant(MYTH_SEND, worldSeed, 'myth_send')), choices: [{ id: 'q_myth_go', text: 'I will find a terminal.', effects: { end: true } }] } },
    });
    woven = spliceChoice(woven, {
      // the REPORT: gated on the runtime read fact; the ASK sets the gate (the Havel-bug rule).
      choice: { id: 'q_myth_report', goto: 'q_myth_report', text: pickVariant(MYTH_REPORT_ASK, worldSeed, 'myth_ask'), requires: { facts: { [q.readFact]: true } }, effects: { set_facts: { [q.gate]: true } } },
      nodes: { q_myth_report: { says: fill(pickVariant(MYTH_REPORT_SAYS, worldSeed, 'myth_says')), choices: [{ id: 'q_myth_done', text: 'To the ledger, then.', effects: { end: true } }] } },
    });
    byId.set(q.keeperId, woven);
  }
  return (content || []).map((c) => byId.get(c.id) || c);
}

// ── THE ENTRY: served pool + world seed → the woven world ────────────────────────────────────────────
// opts.mystery=false skips the tier-2 case (the board's cast-only view; the game leaves it on).
// Never throws — any defect degrades to the authored pool (the issues array says why).
export function weaveWorld(content, worldSeed, opts = {}) {
  const out = { content, cast: null, mystery: null, mythograph: null, issues: [] };
  try {
    const cast = castSpine(content, worldSeed);
    out.cast = cast; out.issues.push(...cast.issues);
    out.content = weaveCast(content, cast, worldSeed);
    if (opts.mythograph !== false) {
      const q = buildMythograph(out.content, cast, worldSeed);
      if (q) { out.content = weaveMythograph(out.content, q, worldSeed); out.mythograph = q; }
      else out.issues.push({ code: 'no_mythograph', msg: 'the tier-1 finale could not be cast (no commons anchor / no cast keeper) — the campaign runs without it' });
    }
    if (opts.mystery !== false) {
      const m = buildMystery(out.content, cast, worldSeed);
      if (m) { out.content = weaveMystery(out.content, m); out.mystery = m; }
      else out.issues.push({ code: 'no_mystery', msg: 'the tier-2 case could not be cast (no ward anchor, or the pool is too thin) — the campaign runs without it' });
    }
  } catch (e) {
    out.issues.push({ code: 'weave_failed', msg: String(e && e.message || e) });
    out.content = content; out.cast = out.cast || { plan: [], byGate: {}, issues: [] }; out.mystery = null; out.mythograph = null;
  }
  return out;
}

export default { hash32, pickVariant, parseGateFlag, castCandidates, castSpine, chargeProse, spliceChoice, stripGateFromDialogue, anchorWithGate, buildMythograph, weaveMythograph, weaveCast, weaveWorld, FACTIONS, FACTION_LABEL, MYTHOGRAPH_GATE, MYTHOGRAPH_READ_FACT };
