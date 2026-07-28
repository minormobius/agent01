// hoop/v105/story/promote.js — EMERGENCY NPC PROMOTION (the v105 npc reform). Pure, no DOM/LLM/network.
//
// THE BUG THIS FIXES: a waypoint must always be able to point at a PERSON. Two live objectives name people:
//   • the MAIN quest's next KEEPER  — anchors.js#nextKeeper (the setter of the first unmet gate),
//   • a SIDE thread's person of interest — quests.js#seekCandidates (a theme corroborator).
// The surface normally LOCATES them (a placed anchor / a living keeper) or SEATS one from the live content
// pool (discoverPlacedNpc). But when the pool can offer nobody — the named person's content is absent from
// the live tier, or a thread's theme has zero placeable corroborators — the old marker DEGRADED to a room
// (questMarker fell through to a terminal / the rind / a role-matched place). That is the "waypoint chases a
// room when it should target an npc" bug: you are told to "find Elias Vance", he exists nowhere in the pool,
// and the ◇ quietly points you at the nearest console instead.
//
// THE REFORM: when a person-objective has no locatable and no seatable person, MINT a minimal stand-in NPC
// (`emergencyNpc`) so a resident can be promoted into the role and the waypoint resolves to a WALKABLE PERSON.
// Deterministic: same name → same stand-in id on every machine (atproto-stable), so an emergency promotion is
// reproducible, not a random spawn. The stand-in carries the thread's themes (so it corroborates), a one-node
// greet tree (so a click reads), and `content.promoted:true` (so the surface can tell it apart + the sprite
// layer inherits the promoted resident's genome). Node-tested: test/promote.selftest.mjs.

const norm = (s) => String(s || '').toLowerCase().trim();

// a stable, id-safe key for a promoted stand-in — one per NAME (so "Elias Vance" is always the same person).
export const promotedId = (name) => 'npc:promoted:' + norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const isPromoted = (ci) => !!(ci && ci.content && ci.content.promoted);

// Does a quest/keeper REF read as a PERSONAL NAME (vs a place, an abstraction, or a console)? A name is
// 1–4 Capitalized word-tokens, none of them a place/role/terminal keyword, with no leading article. This is
// the discriminator that keeps "find Elias Vance" (a person) from collapsing into the same bucket as "read a
// Tabard terminal" / "the Signal Chamber" / "the rind" (all rooms) inside questMarker.
const PLACEISH = /\b(terminal|console|room|rind|shaft|signal|deck|nave|ward|commons|bay|margin|market|spire|hall|court|garden|works|forge|clinic|archive|library|chamber|ship|tabard|drift|continuant|rindwalker|seven)\b/i;
export function namesAPerson(ref) {
  const s = String(ref || '').trim();
  if (!s || PLACEISH.test(s)) return false;
  if (/^(the|a|an|his|her|their|our|this|that)\b/i.test(s)) return false;
  const words = s.split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  return words.every((w) => /^[A-Z][A-Za-z'’.-]*$/.test(w)) && /[A-Z][a-z]/.test(s);
}

// The NAME a person-objective should be promoted to, from its refs: the first ref that reads as a person and
// isn't already a known NPC (npcNames: lowercased-name → content id). Null when no ref names an absent person.
export function personRef(refs, npcNames) {
  for (const r of (refs || [])) {
    const nm = String(r || '').trim();
    if (namesAPerson(nm) && !(npcNames && npcNames.get(norm(nm)))) return nm;
  }
  return null;
}

// Mint the stand-in content item. Always tier-1 legal (so it can be seated at any point in the campaign),
// carries the thread's themes as tags (so seekCandidates/corroborates picks it up), and a single greet node
// (so a click crystallizes + reads like any NPC). `from` records what objective summoned it (provenance).
export function emergencyNpc(name, { tags = [], from = null } = {}) {
  const nm = String(name || '').trim() || 'a stranger';
  const themes = [...new Set((tags || []).map(norm).filter(Boolean))];
  return {
    id: promotedId(nm),
    type: 'npc',
    approved: true,
    status: 'active',
    revelation_tier: 1, narrative_tier: 1, power_tier: 1,
    tags: themes,
    provenance: { lane: 'promote', from: from || null },
    content: {
      name: nm,
      ambient: false,       // NOT a wanderer — a wanderer can't hold a waypoint (seekCandidates/discoverNpc reject ambient)
      promoted: true,       // the tell: the surface reads this to inherit the promoted resident's genome + skip re-promotion
      description: nm + ' — the deck put this face forward when the one you were sent to find could not be located. '
        + 'They carry a little of the thread you are chasing.',
      npc: {
        name: nm,
        dialogue: {
          start: 'g0',
          nodes: {
            g0: {
              says: '“You were sent to find ' + nm + '? Near enough — word of that has reached me. Ask, and I will tell what I have heard of it.”',
              choices: [
                { id: 'heard', text: '(hear them out)', effects: { end: true } },
                { id: 'go', text: '(nod, and go)', effects: { end: true } },
              ],
            },
          },
        },
      },
    },
  };
}

// Does this objective NEED an emergency promotion right now? True when it names a person, that person is not
// locatable in the loaded world, and the live pool holds nobody seatable for the thread. The surface passes
// its own live probes so this stays pure. (`located` = locateNpc(cid) truthy; `seatable` = a non-empty
// seekCandidates pool.)
export function needsPromotion({ personName = null, located = false, seatable = false } = {}) {
  return !!personName && !located && !seatable;
}

// ── keeper-in-ward placement (the Factor Solen bug) ──────────────────────────────────────────────────────
// A LOAD-BEARING keeper (a gate-setter the main-quest waypoint points at) is a FACTION principal, so it belongs
// in its faction's WARD. But the nave streams ward-by-ward as the campaign unlocks, and a keeper force-placed
// while its ward hasn't streamed yet lands in the commons (or a wrong ward) and — because it is recorded
// "placed" — never moves. The waypoint then faithfully points at the WRONG chamber. (The pinned guide-anchors
// already relocate when their lobe opens; the mobile keepers never did.) These two pure helpers decide where a
// keeper should sit and whether a placed one is now stranded, so the surface's relocation is node-testable.

// The chambers a fresh keeper should be seated in: its OWN ward's built chambers when any exist, else the
// scatter fallback (so a keeper whose ward hasn't streamed yet still appears somewhere — and gets relocated
// once the ward opens). `wardChunkIds` / `fallbackChunkIds` are world.chunks ids.
export function keeperSeatChunks(wardChunkIds, fallbackChunkIds) {
  const ward = (wardChunkIds || []).filter((x) => x != null);
  return ward.length ? ward.slice() : (fallbackChunkIds || []).filter((x) => x != null).slice();
}

// Is a placed MOBILE keeper STRANDED outside its own ward now that the ward is built? True ⇒ re-seat it into a
// ward chamber. False when it isn't mobile, has no known ward yet (nothing streamed — leave it where it is),
// or already sits in one of its ward chambers.
export function needsWardReseat({ mobile = false, currentChunk = null, wardChunkIds = [] } = {}) {
  const ward = (wardChunkIds || []).filter((x) => x != null);
  return !!mobile && ward.length > 0 && !ward.includes(currentChunk);
}

export default { promotedId, isPromoted, namesAPerson, personRef, emergencyNpc, needsPromotion, keeperSeatChunks, needsWardReseat };
