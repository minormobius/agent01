// statblock.js — ROLL AN NPC A CHARACTER, AND LET IT ANSWER FOR THEM.
//
// Two jobs, one seed.
//
// 1. THE BLOCK. Every NPC in the pool gets a FLESH·CHASSIS·ANIMA character rolled deterministically
//    from (worldSeed, npc id) off the live stat spine in `../stats.js` — the same spine the arena
//    and rind/combat read, so an NPC's numbers mean the same thing everywhere. Nothing is authored
//    and nothing is stored: the block is a pure function of the id, so it costs zero content, zero
//    records, and re-derives identically on every machine (invariant 1).
//
//    The seam is free. `stats.js` keys VOCATIONS by the thirteen civic verbs, and a room_bundle
//    already carries the `verb` its room is built around — so the NPC's vocation is not a mapping,
//    it is an identity. A `grow` room's keeper is a Tender; a `govern` room's is a Warden.
//
// 2. THE REACTIONS. Hoopy's NPCs carry a fixed twelve-slot reaction table — grief, shock, bribed,
//    accused … — and authoring twelve per NPC is the single largest content cost in the model
//    (37.7% of the prose in the 2026-08 rev, and until now all of it was dropped on import).
//    So: AUTHORED ALWAYS WINS, and every slot he leaves empty is DERIVED from the block.
//
//    Derivation composes rather than enumerating. Twelve slots × three dominant domains = 36 cells
//    describing how a body of that kind metabolises that situation; the full nine casts then tint
//    the wording, and the vocation supplies the props (a Tender reaches for the trays, a Celebrant
//    for the wick). 36 cells + 9 tints + 13 prop sets ⇒ 108 distinct cast×slot readings, so hoopy
//    authors only the two or three reactions that carry plot and the rest are covered.
//
//    Derived lines are marked `{ source: 'derived' }`. They are meant to be *right*, not to pass
//    for hand-written — hoopy's own lines are far more specific, and that is the point of the
//    split. Never overwrite an authored slot.
//
// Pure, DOM-free, node-tested (test/statblock.selftest.mjs). No engine change is required to roll a
// block: this is a READ of a content item, so it applies retroactively to every NPC already in the
// pool as well as to every bundle that follows.

import { rollCharacter, VOCATIONS, VOCATION_ORDER } from '../stats.js';

// hash32 — byte-identical to `weave.js`'s, and deliberately duplicated rather than imported: the
// worker serves the stat-block API (`/api/story/statblock`) and importing weave.js would drag
// anchors.js and mystery.js into that bundle for the sake of eight lines of FNV. The two copies
// are pinned equal by test/statblock.selftest.mjs, which imports both and asserts they agree — so
// this is a checked duplicate, not a fork.
export function hash32(...xs) {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    const s = String(x);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x9e3779b9; h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  }
  return (h ^ (h >>> 16)) >>> 0;
}

// The twelve slots, in hoopy's order. Identical on every NPC in the rev — that fixedness is what
// makes the table indexable, and is why a stat block can stand in for the missing entries.
export const REACTION_SLOTS = [
  'grief', 'shock', 'bribed', 'accused', 'flattered', 'questioned',
  'threatened', 'caught_in_a_lie', 'authority_arrives', 'the_ship_shudders',
  'someone_else_accused', 'asked_for_help_they_cannot_give',
];
const SLOT_SET = new Set(REACTION_SLOTS);

// ── the props a vocation reaches for ─────────────────────────────────────────────────────────────
// Keyed by the thirteen verbs (= VOCATIONS). `tool` is what's in their hands, `work` is the thing
// that suffers when they stop, `ledger` is the record they keep. Written as full noun phrases so
// templates stay grammatical without inflection.
export const VERB_PROPS = {
  dwell:   { tool: 'the door latch',     work: 'the berth',            ledger: 'the rent-book' },
  grow:    { tool: 'the water line',     work: 'the trays',            ledger: 'the cycle log' },
  make:    { tool: 'the bench tool',     work: 'the half-built piece',  ledger: 'the work order' },
  mend:    { tool: 'the patch kit',      work: 'the split seam',        ledger: 'the repair slip' },
  trade:   { tool: 'the scale',          work: 'the stall',             ledger: 'the day-book' },
  serve:   { tool: 'the ladle',          work: 'the line',              ledger: 'the roster' },
  play:    { tool: 'the marked deck',    work: 'the game',              ledger: 'the running score' },
  heal:    { tool: 'the clamp',          work: 'the open wound',        ledger: 'the chart' },
  learn:   { tool: 'the slip-stack',     work: 'the reading',           ledger: 'the index' },
  worship: { tool: 'the wick',           work: 'the rite',              ledger: 'the tale-count' },
  govern:  { tool: 'the stamp',          work: 'the hearing',           ledger: 'the docket' },
  move:    { tool: 'the strap',          work: 'the run',               ledger: 'the manifest' },
  store:   { tool: 'the tally stick',    work: 'the stacks',            ledger: 'the inventory' },
};
const FALLBACK_PROPS = { tool: 'their hands', work: 'the work', ledger: 'the record' };

// ── 36 cells × 2 phrasings: how a body of each dominant domain metabolises each situation ────────
// FLESH reacts in the body and recovers or doesn't. CHASSIS absorbs and continues. ANIMA reacts
// somewhere behind the eyes, and what shows is the leak. {name} {tool} {work} {ledger} interpolate.
//
// Two phrasings per cell, chosen by the NPC's own seed. Without them, any two keepers sharing a
// dominant domain print word-for-word identical lines — and a zone will routinely seat two, so the
// repetition is visible in play rather than theoretical. 3 dominants × 2 phrasings × 9 cast tints,
// over 13 prop sets, is enough spread that a collision needs the same cast AND the same verb.
const CELLS = {
  flesh: {
    grief: ['{name} keeps working, and the breathing goes wrong, a little, on every third pass at {work}.',
            '{name} does not stop. {tool} keeps moving and the face above it has gone somewhere else.'],
    shock: ['A sound gets out of {name} before the words do. {tool} is set down badly.',
            '{name} flinches with the whole body, and is embarrassed about it a moment later.'],
    bribed: ['{name} looks at the offer too long, and the wanting shows before the answer does.',
             'The offer lands, and {name} does the arithmetic on their face before doing it out loud.'],
    accused: ['Colour goes through {name} fast — the denial arrives after the face already has.',
              '{name} answers hot, then hears themselves, and the second sentence is quieter than the first.'],
    flattered: ['{name} warms in spite of themselves, then busies both hands with {work} to cover it.',
                'The praise gets in. {name} waves it off and is pleased for the rest of the watch.'],
    questioned: ['{name} answers between tasks, half-attending, {tool} still moving.',
                 '{name} talks while working, which is the only way they talk.'],
    threatened: ['{name} squares up on instinct, weight forward, before deciding whether to.',
                 'Something old and quick comes up in {name}, and is put back down with effort.'],
    caught_in_a_lie: ['The lie dies in {name}\'s throat. They look at {ledger} rather than at anyone.',
                      '{name} goes red and keeps going, which does not help.'],
    authority_arrives: ['{name} straightens without meaning to, the way a body learns to.',
                        '{name}\'s hands find {work} and stay there until the uniforms have passed.'],
    the_ship_shudders: ['{name} rides it out on braced legs and steadies {work} with one hand.',
                        '{name} is moving before the shudder finishes, and catches {tool} on the way down.'],
    someone_else_accused: ['{name} winces for them, and says nothing, and keeps not saying it.',
                           '{name} steps half in front of the accused without appearing to decide to.'],
    asked_for_help_they_cannot_give: ['"I can\'t." {name} says it plainly, and it plainly costs them.',
                                      '{name} starts to offer, remembers, and stops. The apology is in the hands.'],
  },
  chassis: {
    grief: ['{name} finishes the pass at {work} first. The grief is filed where it does not interrupt.',
            '{name} works the shift out. Whatever this is will be dealt with after {work} is safe.'],
    shock: ['{name} takes it standing, absorbs it, and asks what needs doing about it.',
            '{name} asks one clarifying question, in a level voice, and then another.'],
    bribed: ['{name} names the value of the offer out loud, flatly, as though pricing a part.',
             '{name} sets the offer beside {ledger} and looks at the two of them together.'],
    accused: ['"Show me where." {name} does not raise their voice and does not move.',
              '{name} asks for the accusation again, slower, and writes it into {ledger}.'],
    flattered: ['{name} accepts the praise as a delivery and returns to {work}.',
                '"Noted," says {name}, and {work} continues at the same rate as before.'],
    questioned: ['{name} answers in order, completely, and stops exactly when the answer does.',
                 '{name} gives the answer, then the reason for it, then nothing further.'],
    threatened: ['{name} does not move. Whatever is coming will have to come through the frame.',
                 '{name} looks at the threat the way one looks at weather on the schedule.'],
    caught_in_a_lie: ['{name} corrects the record without apology, as though amending {ledger}.',
                      '"That was wrong. Here is what is right." {name} does not elaborate.'],
    authority_arrives: ['{name} produces {ledger}, in order, before it is asked for.',
                        '{name} has already stood, already squared {work}, already begun.'],
    the_ship_shudders: ['{name} braces {work} and counts the shudder out. The count is what matters.',
                        '{name} rides it, checks {work}, checks {tool}, and reports the number.'],
    someone_else_accused: ['{name} states what they saw, and only that, and only once.',
                           '{name} gives the time, the place, and nothing that was not observed.'],
    asked_for_help_they_cannot_give: ['"Not mine to give." {name} says where it might be, and returns to {work}.',
                                      '{name} explains the limit exactly, and does not soften it.'],
  },
  anima: {
    grief: ['{name} has stopped being in the room. {tool} sits where it was put down.',
            '{name} says something true and slightly wrong, and does not notice which.'],
    shock: ['{name} goes very still, and something behind the face is still moving.',
            '{name} does not react, and then reacts to something else entirely.'],
    bribed: ['{name} answers a question nobody asked, and the offer is left standing.',
             '{name} is more interested in why the offer was made than in taking it.'],
    accused: ['{name} follows the accusation somewhere else entirely and comes back with the wrong reply.',
              '{name} agrees with part of it, the wrong part, and seems satisfied.'],
    flattered: ['{name} takes the compliment apart to see how it was meant.',
                '{name} thanks the wrong thing about what was said.'],
    questioned: ['{name} answers the question underneath the question, which is not always welcome.',
                 '{name} answers at length, accurately, and about something adjacent.'],
    threatened: ['{name}\'s attention scatters, then snaps back too sharply, and holds.',
                 '{name} looks at the threat with real curiosity, which is worse than fear.'],
    caught_in_a_lie: ['{name} does not deny it. They seem interested in having been caught.',
                      '{name} explains why the lie was the better shape, which is not a defence.'],
    authority_arrives: ['{name} notes the arrival the way one notes weather, and keeps to {work}.',
                        '{name} greets them by rank, correctly, and unsettles everyone.'],
    the_ship_shudders: ['{name} listens past the shudder for whatever it was that moved.',
                        '{name} is the only one still looking up a minute after it stops.'],
    someone_else_accused: ['{name} watches the accused instead of the accuser, and reads them.',
                           '{name} asks the accuser a question that changes the room.'],
    asked_for_help_they_cannot_give: ['{name} explains, at length and kindly, a thing that does not help.',
                                      '{name} offers the wrong help sincerely, and is hurt when it is declined.'],
  },
};

// ── the nine casts tint the wording ─────────────────────────────────────────────────────────────
// A tail clause the cast appends. Keyed exactly as stats.js's CASTS: `${dominant}.${second}`.
const CAST_TINT = {
  'flesh.flesh':     'It passes through them quickly and leaves nothing behind.',
  'flesh.chassis':   'They set their feet through it.',
  'flesh.anima':     'They run hot for a while afterwards.',
  'chassis.chassis': 'Nothing about the posture changes at all.',
  'chassis.flesh':   'Something under the plating registers it, briefly.',
  'chassis.anima':   'The frame holds; the thing inside it is elsewhere.',
  'anima.anima':     'The body catches up some time later.',
  'anima.flesh':     'It reaches them through the skin first.',
  'anima.chassis':   'The will decides, and the machine complies.',
};

// ── bond and omen — the two things worth taking from Cairn ───────────────────────────────────────
// BOND is a directed relation to another entity, phrased. It rides on `refs`, which import.js
// already carries first-class, so rolling bonds also thickens the graph spine.js matches over.
// OMEN is a line of foreboding — and under the chapter's premise it is the load-bearing one: an
// omen is a conclusion reached without evidence, which is precisely the mortal faculty the Seven
// lack and the player was rebuilt to have. Every NPC carrying one is the population quietly
// demonstrating the thing the plot turns on.
const BOND_FORMS = [
  'owes {other} a debt neither of them names aloud.',
  'was trained by {other}, and has never once said so.',
  'covers for {other} on the watches nobody checks.',
  'has not spoken to {other} since the thing at {work}.',
  'keeps something of {other}\'s, and means to return it.',
  'trusts {other} further than the ward would think wise.',
  'was wrong about {other} once, publicly, and remembers it.',
  'would take {other}\'s word over {ledger}.',
];
const OMEN_FORMS = [
  'The count comes out wrong lately, and always by the same amount.',
  'Something in the deep is keeping time, and it is not our time.',
  'The ceiling-towns went dark early twice this cycle. Nobody wrote it down.',
  'They have started dreaming in the notation on the walls.',
  'The sky arc looked further away last bell. It cannot have.',
  'Whatever the Seven are posting now, it is not for us.',
  'There is a draught coming up the shaft that should be going down it.',
  'The old machines have begun agreeing with each other.',
  'One of the tunnels has got longer. They are certain of it.',
  'Someone has been maintaining a thing nobody assigned.',
];

// ── seeding ──────────────────────────────────────────────────────────────────────────────────────
// (worldSeed, npc id) → a 32-bit seed, via the story lane's own hash. Two NPCs never collide
// because ids are already de-collided upstream (import.js), and the same NPC in the same world is
// the same person for ever.
export function statSeed(worldSeed, npcId) {
  return hash32('statblock', String(worldSeed ?? 0), String(npcId ?? ''));
}

const pick = (arr, seed, salt) => arr[hash32(salt, seed) % arr.length];
// Props are stored as lowercase noun phrases ("the water line") because they usually land mid-
// sentence — but several templates open a sentence with one, which printed "…does not stop. the
// water line keeps moving". Re-capitalise after substitution rather than duplicating every prop in
// two cases: capitalise position 0 and anything following a sentence terminator.
const sentenceCase = (s) => String(s).replace(/(^|[.!?]\s+)([a-z])/g, (m, pre, c) => pre + c.toUpperCase());
const fill = (tmpl, vars) => sentenceCase(String(tmpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)));

// Hoopy's own reaction lines use the SHORT name — "Shaban", not "Shaban Hosubara" — and a derived
// line that says the full name every time reads like a form letter beside them. Take the first
// token, stepping over a leading title ("Factor Merid Solen" → "Merid") and stopping before an
// epithet ("Tzitlil the Twice-Burned" → "Tzitlil").
// Leading ARTICLES matter as much as titles: the 720-record live corpus is full of generic names
// ("The Steward", "A Neighbour", "An Archivist"), and taking the first token there yields "The talks
// while working". Skip an article or a title; never return one as a name.
const SKIP_LEAD = new Set(['the', 'a', 'an',
                           'factor', 'warden', 'keeper', 'steward', 'adept', 'celebrant', 'chirurgeon',
                           'wright', 'mender', 'tender', 'runner', 'player', 'tenant', 'sister', 'brother']);
export function shortName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'they';
  let i = 0;
  // step over as many leading articles/titles as there are, while something is left to name.
  while (i < parts.length - 1 && SKIP_LEAD.has(parts[i].toLowerCase().replace(/[^a-z]/g, ''))) i++;
  return parts[i];
}

// The verb a content item was authored around. expandRoomBundle lifts it onto the served npc as
// `verb`, and tags it; fall back through both, then to the vocation roll.
export function verbOf(item) {
  const v = item && (item.verb || (item.content && item.content.verb));
  if (v && VOCATIONS[v]) return v;
  for (const t of (item && item.tags) || []) if (VOCATIONS[t]) return t;
  return null;
}

// ── the block ────────────────────────────────────────────────────────────────────────────────────
// item: a served content_item of type 'npc' (post-import). opts.worldSeed scopes it to a world;
// opts.peers is the pool the bond may point into (any items with {id, content.name}).
export function rollStatBlock(item, { worldSeed = 0, peers = null, power = 10 } = {}) {
  if (!item) return null;
  const id = item.id || '';
  const n = statSeed(worldSeed, id);
  const verb = verbOf(item) || VOCATION_ORDER[n % VOCATION_ORDER.length];
  const name = (item.content && item.content.name) || 'someone';

  // THE ESCAPE HATCH. A block is a roll, so it can land against a voice hoopy already has in mind —
  // Nolana's authored lines are procedurally cold, and a flesh-dominant roll would give her a temper
  // she doesn't have. So an NPC may carry `content.stats` to pin what matters:
  //   { triad: {flesh, chassis, anima} }  — pins the temperament outright (normalised for you)
  //   { vocation: 'govern' }              — overrides the room's verb
  //   { power: 14, quirks: 1 }            — depth and how many characteristics to roll
  // Everything unpinned still rolls. Authoring a reaction slot outright remains the finer control;
  // this is for when the whole character is off, not one line.
  // SHORT NAMES MUST STAY UNAMBIGUOUS. Derived lines use the given name ("Shaban") because hoopy's
  // own do — but two keepers can share one ("Ondine Dri2" / "Ondine Con2"), and the murder is exactly
  // where "Ondine answers…" becomes unreadable. When peers are supplied, a colliding keeper falls back
  // to their full name. hoopy's 2026-08 rev has no collisions; a few hundred bundles will.
  const shortForm = (() => {
    const s = shortName(name);
    if (!peers) return s;
    const clash = peers.some((p) => p && p.id !== id && p.content && p.content.name && shortName(p.content.name) === s);
    return clash ? name : s;
  })();

  const pin = (item.content && item.content.stats) || {};
  const vocation = pin.vocation && VOCATIONS[pin.vocation] ? pin.vocation : verb;
  const ch = rollCharacter(n, {
    vocation, name, power: pin.power || power,
    ...(pin.triad ? { triad: pin.triad } : {}),
    ...(pin.quirks != null ? { quirks: pin.quirks } : {}),
  });
  const props = VERB_PROPS[vocation] || VERB_PROPS[verb] || FALLBACK_PROPS;

  // bond — a directed edge to another entity, if we were given a pool to point into.
  let bond = null;
  const candidates = (peers || []).filter((p) => p && p.id && p.id !== id && (p.content && p.content.name));
  if (candidates.length) {
    const other = candidates[hash32('bond', n) % candidates.length];
    // BOND_FORMS are written as bare predicates so they read as a list; the emitted `text` is a
    // whole sentence with the keeper as its subject, so an API consumer can print it as-is.
    bond = {
      to: other.id,
      toName: other.content.name,
      text: fill('{name} ' + pick(BOND_FORMS, n, 'bondform'), {
        name: shortForm, other: shortName(other.content.name), ...props,
      }),
    };
  }
  const omen = pick(OMEN_FORMS, n, 'omen');

  return {
    id, n, name, short: shortForm,
    verb, vocation: ch.vocation, vocTag: ch.vocTag, kit: ch.kit, pinned: Object.keys(pin),
    triad: ch.triad, cast: ch.cast, attrs: ch.attrs, characteristics: ch.characteristics,
    props, bond, omen, power: ch.power,
  };
}

// ── reactions ────────────────────────────────────────────────────────────────────────────────────
// One slot. `authored` is hoopy's table (may be partial or absent). Authored always wins.
// `avoid` is a Set of lines already spoken IN THIS SCENE. Repetition across a world is fine —
// nobody compares two keepers a week apart — but a murder canvass lists six suspects one after
// another, and with two phrasings per cell the pigeonhole guarantees collisions: the first bench
// run printed "The will decides, and the machine complies" three times in one interrogation.
// So a caller rendering a group passes an accumulating set and each keeper takes a line nobody
// else in the scene has used. Deterministic: the order is the caller's, not chance.
export function reactionFor(block, slot, authored = null, { avoid = null } = {}) {
  if (!block || !SLOT_SET.has(slot)) return null;
  const written = authored && typeof authored[slot] === 'string' ? authored[slot].trim() : '';
  if (written) return { slot, text: written, source: 'authored' };

  const dom = block.cast && block.cast.dominant;
  const variants = (CELLS[dom] || CELLS.chassis)[slot];
  const vars = { name: block.short || block.name, ...block.props };
  const tint = CAST_TINT[block.cast && block.cast.key];
  const base = hash32('variant', block.n, slot);
  // The tint is a tail clause, so it only lands where it won't crowd the line. Seeded, not random.
  const wantTint = !!tint && (hash32('tint', block.n, slot) % 3 === 0);

  // Candidates in preference order: the keeper's own phrasing first, then the other variants, then
  // the same set with the tint flipped — two independent axes, so a scene of six still separates.
  //
  // The avoid KEY is the phrasing (slot + which variant + whether the tint is on), never the filled
  // text: the keeper's name is inside the line, so two different people can never produce an
  // identical string and de-duplicating on the string would silently do nothing. It is the SHAPE
  // that reads as boilerplate when it repeats, not the wording.
  const candidates = [];
  for (const t of [wantTint, !wantTint]) {
    for (let k = 0; k < variants.length; k++) {
      const idx = (base + k) % variants.length;
      candidates.push({ key: `${slot}|${dom}|${idx}|${t ? 1 : 0}`, cell: variants[idx], tinted: t });
    }
  }
  // Two passes when de-duplicating: an unused phrasing whose TINT is also unused, then any unused
  // phrasing. The tint is one string per cast, so three keepers of a cast would otherwise repeat
  // the same tail clause even with distinct cells — and a tail clause repeating is what reads as
  // machine-written. Dropping the tint costs nothing; the cell still carries the character.
  const tintKey = (c) => (c.tinted && tint ? 'tint|' + tint : null);
  const free = (c) => !avoid.has(c.key);
  const pick = (avoid
    ? (candidates.find((c) => free(c) && !avoid.has(tintKey(c) || ' ')) || candidates.find(free))
    : null) || candidates[0];
  if (avoid) {
    avoid.add(pick.key);
    const tk = tintKey(pick); if (tk) avoid.add(tk);
  }
  const text = fill(pick.cell, vars) + (pick.tinted && tint ? ' ' + tint : '');
  return { slot, text, source: 'derived', cast: block.cast && block.cast.key, dominant: dom };
}

// The whole table: every slot filled, authored where hoopy wrote one, derived where he didn't.
export function resolveReactions(block, authored = null, { avoid = null } = {}) {
  const out = {};
  for (const slot of REACTION_SLOTS) {
    const r = reactionFor(block, slot, authored, { avoid });
    if (r) out[slot] = r;
  }
  return out;
}

// Coverage, for the content tooling: how much of a pool's reaction surface is authored.
export function reactionCoverage(items) {
  let authored = 0, slots = 0, npcs = 0;
  for (const c of items || []) {
    if (c.type !== 'npc') continue;
    npcs++; slots += REACTION_SLOTS.length;
    const t = (c.content && c.content.reactions) || {};
    for (const s of REACTION_SLOTS) if (typeof t[s] === 'string' && t[s].trim()) authored++;
  }
  return { npcs, slots, authored, derived: slots - authored, pct: slots ? +(100 * authored / slots).toFixed(1) : 0 };
}

export default { REACTION_SLOTS, VERB_PROPS, statSeed, verbOf, rollStatBlock, reactionFor, resolveReactions, reactionCoverage };
