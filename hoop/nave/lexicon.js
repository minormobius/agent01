// nave/lexicon.js — THE PROSE LAYER over the nave's role/faction model.
//
// /slots tells a machine WHICH slots exist (manifest.js) and how many (slotProfile). This tells it what
// they MEAN. It is written for a model (a qwen, here) that has to author the nave's content and therefore
// has to understand the *interrelations*: what each verb is, who works it, what flows through it (the
// SUPPLY web — who feeds whom), and who it draws together (the SOCIAL web — who talks to whom). The town
// is a system, not a list of buildings; this is the system, in words.
//
// Grounded in the real model: every role's `needs`/`feeds` is DERIVED from its econ flows (econ.js ROLES),
// every faction's roles from nave.js FACTIONS — so the prose can never silently drift from the mechanics
// it describes. Pure data + two derivation helpers; node-tested in test/lexicon.selftest.mjs.

import { ROLES, DOMAINS } from '../v099/econ/econ.js';
import { FACTIONS, BIOMES } from './nave.js';

// ── the resource tokens: the EDGE LABELS of the supply web. Every flow in/out of a building is one of
// these; knowing what they mean is knowing what the arrows between buildings carry. ──
export const RESOURCES = {
  people:  'Bodies and their hours — labour, custom, congregation, the crowd a place draws. Emitted by homes, consumed by every place that needs hands or an audience. The substrate of the whole floor.',
  regard:  'Esteem — the post-scarcity currency. Standing paid in attention: who is admired, trusted, sought out. (In-world it IS hoop\'s ATProto economy of likes and follows.) Made by third places and worship, spent by homes (you live FOR regard once fed) and by rule (which runs on legitimacy).',
  bread:   'Staple calories — the cooked good of the grain domain. The floor of survival; a home needs it before anything else.',
  cloth:   'Worked fiber — clothing, bandage, sailcloth. The second necessity, and the healer\'s consumable.',
  care:    'Tended wellbeing — the output of healing, counted in bodies kept whole. Not stored or traded; spent the moment it is made.',
  lore:    'Recorded knowledge — what learning produces. A terminal good (no building consumes it as a supply input), but socially it is drawn on by worship (read into rite and omen) and by rule (cited as precedent); the nave\'s memory of itself.',
  order:   'Enforced predictability — the output of governance: rules, schedules, the writ that lets every other place run without re-negotiating the world each morning.',
  transit: 'Movement itself — the throughput of corridors, lifts and carts. Pure infrastructure: it binds far rooms into one walkable floor. Without it the supply web has arrows it cannot actually traverse.',
  raw:     'Unworked matter from a domain (grain, ore, timber, fiber…) — what GROW yields and MAKE consumes. The first link of every material chain.',
  good:    'A finished article of a domain (bread, tools, furniture, cloth…) — what MAKE yields and what TRADE moves, STORE buffers, MEND keeps alive, and SERVE turns into a meal.',
};

// ── the thirteen verbs. Each entry: what the building IS, who STAFFS it, where it sits in the supply web
// (needs ⇐ / feeds ⇒, derived from flows), and its place in SOCIETY (bond seat vs bridge / third place).
// `npc` is the resident archetype a generator casts here; `voice` hints temperament for dialogue. ──
export const ROLE_PROSE = {
  dwell: {
    gloss: 'where people live — the residential cell, and the demographic floor of the whole floor.',
    building: 'A home: a few private cells around a bed. By far the most common building (near half of every chunk).',
    activity: 'Living. Rest, meals, family, the off-hours of everyone who works the other twelve verbs.',
    npc: 'a resident — a family, roommates, a widow, two apprentices sharing rent. Not a trade; a life.',
    voice: 'ordinary, grounded, off-duty; gossip and grievance and small hope.',
    society: 'the BOND seat — strong, close, kin-and-roommate ties. Homes are where people START; every other place borrows them.',
    note: 'The great SINK and source: it draws bread, cloth and regard inward and emits PEOPLE — the labour and custom the other twelve verbs all run on. Cast the broadest range of figures here.',
  },
  grow: {
    gloss: 'where raw matter is coaxed from nothing — the farm, the hydroponic green-deck, the algae vat.',
    building: 'Tended beds and tanks under sun-strip light: the only verb with NO input, a primary producer.',
    activity: 'Cultivation. Turning light and water into grain, fiber, timber — the first link of every material chain.',
    npc: 'a grower — patient, seasonal, soil-under-the-nails; reads light and rot the way others read faces.',
    voice: 'slow, cyclic, attentive to weather and time; suspicious of haste.',
    society: 'a quiet bond seat; the green-decks are where the Continuant\'s stewardship is most literal.',
    note: 'Feeds the entire material economy and consumes none of it — so it never fails for want of a supplier, only for want of light, water and care.',
  },
  make: {
    gloss: 'where raw becomes good — the workshop, forge, mill, loom.',
    building: 'A shop floor: benches, a furnace or a loom, the noise and heat of fabrication.',
    activity: 'Fabrication. Takes a domain\'s RAW (ore, grain, fiber) and yields its GOOD (tools, bread, cloth).',
    npc: 'a maker — a smith, baker, weaver; proud of the craft, defined by what leaves the bench.',
    voice: 'concrete, exacting, proud of work; impatient with talk that isn\'t about the work.',
    society: 'a working bond seat, but its goods reach everyone — the hinge between the farm and the table.',
    note: 'The keystone of the material spine: GROW feeds it, and MEND, STORE, TRADE and SERVE all live downstream of what it makes. A Rindwalker shared verb — they are the floor\'s makers and keepers.',
  },
  mend: {
    gloss: 'where worn goods are kept alive — the repair shop, the tinker\'s bench, the chop-shop.',
    building: 'A bench buried in parts: a good goes in broken and comes out working — input and output the same token.',
    activity: 'Repair. Extends a good\'s life instead of consuming a new raw — the anti-entropy verb.',
    npc: 'a mender — a fixer who knows the guts of things, hoards spares, distrusts the new-bought.',
    voice: 'dry, knowing, a little proprietary; speaks in symptoms and fixes.',
    society: 'a bridge of sorts — everyone\'s broken things pass through, so the mender knows everyone\'s business.',
    note: 'A Rindwalker EXCLUSIVE and the faction\'s soul: on a ship, maintenance IS survival. Mend is sacred maintenance\'s practical half (worship is its devotional half).',
  },
  trade: {
    gloss: 'where goods change hands and place — the stall, the market, the broker\'s counter.',
    building: 'A counter or a stall: goods in, the same goods out, moved to where they are wanted.',
    activity: 'Exchange. Moves goods across space and owners; the circulatory verb of the material economy.',
    npc: 'a merchant — quick, social, a memory for prices and faces; the floor\'s connective tissue.',
    voice: 'fast, persuasive, transactional but warm; always already mid-deal.',
    society: 'a strong BRIDGE — markets are where strangers meet, weak ties form, and news travels fastest.',
    note: 'A Drift shared verb. With MOVE it makes the Drift the faction of circulation — of goods, bodies and word. The natural place to seed rumors and quest hooks.',
  },
  serve: {
    gloss: 'where goods become hospitality — the café, eatery, tavern, tea-house.',
    building: 'Tables and a counter: takes finished goods AND people, returns regard — a hearth, not a factory.',
    activity: 'Hospitality. Feeds and waters the crowd; the place you go to BE among others.',
    npc: 'a host — a cook or barkeep who remembers your order and your troubles; a confessor with a cloth.',
    voice: 'warm, attentive, knowing; draws people out, holds the room\'s mood.',
    society: 'a THIRD PLACE — the prime bridge seat: neither home nor work, where the floor actually socialises.',
    note: 'A Continuant shared verb. Consumes the material economy (goods + people) and outputs REGARD — the first rung up from survival into the economy of esteem.',
  },
  play: {
    gloss: 'where people gather for its own sake — the arcade, the court, the game-hall.',
    building: 'An open hall of games and contests: it consumes only PEOPLE and returns REGARD.',
    activity: 'Recreation. Status and delight won at play; the purest third place.',
    npc: 'a games-keeper or a regular champion — performative, competitive, generous with attention.',
    voice: 'playful, sharp, a showman\'s cadence; trades in dares and standings.',
    society: 'a BRIDGE and a status engine — reputations are made and lost here in public.',
    note: 'A Drift EXCLUSIVE. Where serve feeds the body socially, play feeds the appetite for esteem directly — the clearest expression of the post-scarcity tell.',
  },
  heal: {
    gloss: 'where bodies are kept whole — the clinic, infirmary, ward.',
    building: 'Beds and a dispensary: consumes people (the sick) and cloth (the bandage), outputs CARE.',
    activity: 'Healing. The maintenance verb for people, as mend is for goods.',
    npc: 'a healer — calm under pressure, scarce and trusted; holds the floor\'s griefs and recoveries.',
    voice: 'measured, kind, unflinching; speaks plainly about hard things.',
    society: 'a deep bond of trust — not a crowd place, but the person everyone hopes to know before they need to.',
    note: 'A Continuant shared verb — life-support as civic duty. CARE is spent the instant it is made; it cannot be stored or traded, which makes the healer a pure giver in the web.',
  },
  learn: {
    gloss: 'where knowledge is made and kept — the school, library, reading-room, archive.',
    building: 'Stacks and desks: consumes people and PAPER, outputs LORE — the nave\'s memory.',
    activity: 'Study. Turning attention and paper into recorded knowledge; the slow accumulation of understanding.',
    npc: 'a scholar or archivist — curious, precise, a little removed; the keeper of what the floor knows.',
    voice: 'thoughtful, qualifying, delighted by a good question; cites and connects.',
    society: 'a quiet bridge — ideas travel here, and the archive links the present to the ship\'s deep past.',
    note: 'A Drift EXCLUSIVE and the richest LORE seat on the floor — the natural home of the Signal-curious, the historians, the ones who suspect the ship is more than it says. Prime quest-and-revelation ground.',
  },
  worship: {
    gloss: 'where meaning is tended — the temple, shrine, oracle, parish.',
    building: 'A sanctuary: consumes PEOPLE (the congregation) and outputs REGARD — and reads the archive\'s LORE into rite and omen (a social tie to learn, not a supply flow).',
    activity: 'Devotion. Rite, interpretation, the framing of the voyage as something that MEANS.',
    npc: 'a priest or oracle — grave, certain or searching, a reader of signs; holds the ship\'s why.',
    voice: 'liturgical, weighty, speaks in figures and old certainties; sometimes cracks with doubt.',
    society: 'a powerful BRIDGE — the congregation crosses every other tie; the temple gathers the whole lobe.',
    note: 'A Rindwalker EXCLUSIVE. With MEND it makes the Rindwalker creed: the ship is a body to be kept AND a temple to be served — sacred maintenance. Where doctrine meets the Signal, the floor\'s deepest plot lives.',
  },
  govern: {
    gloss: 'where the floor is ruled — the council hall, magistrate\'s seat, writ-office.',
    building: 'The biggest civic block: consumes REGARD (legitimacy), outputs ORDER (the rules everyone runs on).',
    activity: 'Rule. Setting schedules, settling disputes, issuing the writ that coordinates thousands.',
    npc: 'an official — a magistrate or councillor; weighs, decides, is owed and owes; carries authority and its costs.',
    voice: 'formal, careful, conscious of precedent and consequence; rarely off the record.',
    society: 'a hub of authority — not warm, but central; every weak tie of trade and rumor eventually reaches it.',
    note: 'A Continuant EXCLUSIVE and the apex of the social tier (tier 3). It RUNS ON regard — so it cannot rule without the esteem the third places make. The seat where the ship\'s secrets are most likely kept, and most worth uncovering.',
  },
  move: {
    gloss: 'the connective infrastructure — corridors, lifts, cart-lines, the shaft.',
    building: 'Not a destination but a CONDUIT: no input, outputs TRANSIT — the capacity to get anywhere.',
    activity: 'Carriage. Moving people and goods between rooms; the verb that makes the floor one place.',
    npc: 'a porter, liftwright or carter — always in motion, knows every shortcut and who went where.',
    voice: 'brisk, route-minded, full of who-and-where; the floor\'s unofficial witness.',
    society: 'a pure BRIDGE — it touches everything and settles nowhere; the conduit along which all other flows ride.',
    note: 'A Drift shared verb. TRANSIT is what lets every other arrow in the supply web actually be traversed — the infrastructure the whole system silently assumes. Down here is also the way toward the Rind.',
  },
  store: {
    gloss: 'where goods wait in time — the warehouse, granary, cache, hold.',
    building: 'Racks and a hold: a good goes in and the same good comes out later — buffering supply across time.',
    activity: 'Storage. Smoothing gluts and shortages; the verb that lets the floor survive a bad cycle.',
    npc: 'a keeper or quartermaster — careful, inventorying, a gatekeeper of scarcity; knows what the floor has.',
    voice: 'precise, cautious, ledger-minded; measures twice and trusts records.',
    society: 'a quiet hub — undramatic, but the keeper holds the knowledge of what exists and what is running low.',
    note: 'A Rindwalker shared verb — with make and mend, the keeping half of the maker-keeper faction. The cache is a natural ITEM seat and a natural place to hide what shouldn\'t be found.',
  },
};

// ── the three factions: worldview, the logic of their four roles, and the NPC web inside a lobe. ──
export const FACTION_PROSE = {
  rindwalker: {
    tagline: 'The makers and keepers — sacred maintenance, hull-facing.',
    worldview: 'The ship is a body and a temple, and to keep it running IS to keep faith. The Rindwalkers make, store, fix and pray — the material and devotional halves of one creed: that maintenance is meaning. They face the Rind (the hull, the cold structural foam), closest of the three to the ship-as-machine and its Signal.',
    why_exclusives: 'WORSHIP and MEND are one idea split in two — tending the ship\'s soul and tending its body. A faction defined by upkeep makes its temple and its repair-bench its holiest places.',
    why_shared: 'MAKE and STORE are upkeep\'s supply: you cannot keep what you cannot build or hold. The three productive verbs plus the rite that sanctifies them.',
    web: 'The mender carries broken goods to the maker and the keeper; the priest blesses the work and reads the Signal\'s leak as omen; the congregation crosses all of it. Doubt enters here first — a mender who has seen too deep into the ship, a priest whose certainty is cracking.',
    palette: 'copper, rust, brown — oxidised metal and old devotion.',
  },
  continuant: {
    tagline: 'The stewards — life-support, rule and care as civic continuity.',
    worldview: 'The voyage must CONTINUE, and continuity is grown, governed, served and healed into being. The Continuants run the farm, the council, the café and the clinic — the institutions that keep a generation alive long enough to hand the ship to the next. The state and the green-deck and the ward, one stewardship.',
    why_exclusives: 'GOVERN and GROW are continuity\'s two pillars — the order that coordinates and the food that sustains. Rule and harvest: the apex of the social tier and the base of the material one, both owned by the keepers of continuity.',
    why_shared: 'SERVE and HEAL are continuity\'s daily care — the hearth and the ward, where the social contract is felt as warmth and as mercy.',
    web: 'The grower feeds the cook who feeds the crowd; the official rules by the regard the café and the clinic earn; the healer holds what rule cannot. Power and care lean on each other — and the council is where the ship\'s secrets are most likely kept.',
    palette: 'deep blue, slate, institutional — the colour of the writ and the uniform.',
  },
  drift: {
    tagline: 'The circulators — knowledge, goods, bodies and play in motion.',
    worldview: 'A floor is only alive if things MOVE through it. The Drift learn, play, move and trade — they circulate everything: ideas through the archive, goods through the market, bodies through the corridors, esteem through the games. Cosmopolitan and restless, equal parts library and bazaar; the least rooted and the most curious of the three.',
    why_exclusives: 'LEARN and PLAY are circulation\'s two currencies — knowledge and esteem, the things that move fastest and matter most once survival is handled. The archive and the arcade: where the floor thinks and where it shows off.',
    why_shared: 'MOVE and TRADE are circulation\'s literal machinery — the corridors and the markets that carry the rest. Without them the other verbs are stranded rooms.',
    web: 'The carter knows who went where; the merchant knows what everyone wants; the scholar knows what the ship is hiding; the games-hall mints the reputations. News, contraband and revelation all ride the Drift first — the faction where most quests begin.',
    palette: 'cyan, teal, bright — the colour of signal and motion.',
  },
};

// ── the two webs, stated whole, so the model reads the floor as a SYSTEM. ──
export const WEBS = {
  supply: 'The MATERIAL SPINE runs grow → make → (mend · store · trade move and keep the goods) → serve and dwell consume them: light becomes grain becomes bread becomes a fed home. It bottoms out at GROW, which needs no supplier, so the chain never starves for lack of a source — only for lack of light, hands or transit. Riding on top is the ABSTRACT LOOP: homes emit PEOPLE; people pour into serve, play, worship, heal and learn; those emit REGARD, CARE and LORE; regard flows back into homes (you live for esteem once fed) and into GOVERN, which converts legitimacy into ORDER that lets the whole web run. MOVE underwrites all of it, emitting the TRANSIT every arrow silently rides.',
  social: 'Two tie-types weave the floor. BOND ties are strong and close — home, workshop, farm, ward: the places you belong to. BRIDGE ties are the weak, far-reaching links that hold a society together — and they form at the THIRD PLACES: the café (serve), the arcade (play), the temple (worship), the market (trade), the archive (learn), the corridors (move). A figure who works a bridge seat knows the whole floor; a figure in a bond seat knows their own deeply. Drama and news travel the bridges; loyalty and grief live in the bonds.',
  regard: 'The post-scarcity tell: because the material spine MEETS the needs, the economy that actually matters is REGARD — esteem, hoop\'s in-world currency of attention and standing. It is minted by the third places and worship, hoarded and spent by homes, and converted by rule into order. When you ask "what is this person\'s real output?", for half the floor the honest answer is regard, not goods.',
};

// ── derivation helpers: tie each verb back to the mechanics, so the prose stays honest. The econ supply
// web matches LITERAL resource tokens, and a domain role can carry any domain — so a `make` supplies
// `bread` (grain) and `cloth` (fiber), the very tokens homes and healers name. We sample EVERY domain to
// get the full literal token set per role, then match producers to consumers token-for-token. ──
function flowTokens(role) {
  const R = ROLES[role], ins = new Set(), outs = new Set();
  for (const d of (R.dom ? DOMAINS : [undefined])) { const f = R.flows(d); for (const t of f.in) ins.add(t); for (const t of f.out) outs.add(t); }
  return { ins: [...ins], outs: [...outs] };
}
const RESOURCE_PRODUCERS = () => {                       // resource token → Set(roles that OUTPUT it)
  const m = {};
  for (const role of Object.keys(ROLES)) for (const t of flowTokens(role).outs) (m[t] = m[t] || new Set()).add(role);
  return m;
};

// for a role, the upstream roles it NEEDS (produce what it consumes) and downstream roles it FEEDS.
export function supplyLinks(role) {
  if (!ROLES[role]) return { needs: [], feeds: [] };
  const producers = RESOURCE_PRODUCERS(), { ins, outs } = flowTokens(role), myOut = new Set(outs);
  const needs = new Set();
  for (const t of ins) for (const p of (producers[t] || [])) if (p !== role) needs.add(p);
  const feeds = new Set();
  for (const other of Object.keys(ROLES)) { if (other === role) continue; for (const t of flowTokens(other).ins) if (myOut.has(t)) { feeds.add(other); break; } }
  return { needs: [...needs].sort(), feeds: [...feeds].sort() };
}

// the faction a role belongs to + how it's held (exclusive / shared / universal / civic-commons-only).
export function roleFaction(role) {
  for (const [fk, f] of Object.entries(FACTIONS)) {
    if (f.exclusives.includes(role)) return { faction: fk, hold: 'exclusive' };
    if (f.shared.includes(role)) return { faction: fk, hold: 'shared' };
  }
  return { faction: null, hold: role === 'dwell' ? 'universal' : 'commons-only' };
}

// the whole lexicon assembled for one consumer (the page + the qwen handoff): every verb with its prose,
// glyph/tier/flows, derived supply links, faction hold, and the content types its slot hosts.
export function buildLexicon() {
  const sample = DOMAINS[0];
  const roles = Object.keys(ROLES).map((role) => {
    const R = ROLES[role], f = R.flows(R.dom ? sample : undefined);
    return {
      role, glyph: R.glyph, color: R.color, tier: R.tier, domainParameterised: !!R.dom,
      inputs: f.in, outputs: f.out, ...supplyLinks(role), ...roleFaction(role), prose: ROLE_PROSE[role] || null,
    };
  });
  return { resources: RESOURCES, roles, factions: FACTION_PROSE, biomes: BIOMES, webs: WEBS };
}
