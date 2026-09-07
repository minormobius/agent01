// table/cairn/roll.js — the Cairn 2e character roller. Pure logic, no DOM.
//
// THE ONE INVARIANT: a sheet is a pure function of its seed. Same seed, same
// character, forever — which is what makes the URL a permalink and lets a
// Warden hand out "the party at seed `oakmoss`" instead of six PDFs. Every
// draw therefore comes off ONE stream in a FIXED order (see rollCharacter),
// and nothing may be inserted in the middle of that order without changing
// every sheet ever shared. Append new draws at the end.
//
// The other job here is inventory. Cairn's slots are the whole encumbrance
// game, so we don't just list gear — we parse each line for the qualities that
// decide what it costs to carry (petty / bulky / +N slots) and pack it into the
// ten slots, four on the body and six in the backpack.
//
// Rules text quoted in comments is Cairn 2e by Yochai Gal, CC BY-SA 4.0.

import { CAIRN2E } from './data.js';

export const DATA = CAIRN2E;

// ---------------------------------------------------------------- randomness

// xmur3 + mulberry32: a tiny, well-behaved string-seeded PRNG. Not crypto —
// this is dice, and reproducibility matters more than unpredictability.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seeded dice tray. Every roll it makes is recorded in `rng.log`.
 *
 * TWO STEPS HERE ARE LOAD-BEARING, and both were put in after a party of four
 * came out holding the same first roll. A party seeds its members as
 * `seed/0`, `seed/1`, … — near-identical strings — and mulberry32's first
 * output is a weak function of its seed, so near-identical seeds produced the
 * same opening d20 and every character rolled the same background. So: mix two
 * hash words into the state rather than one, then discard the first dozen
 * outputs before any die is read. Nearby seeds diverge by the time the stream
 * is used.
 */
export function makeRng(seed) {
  const hash = xmur3(String(seed));
  const state = (hash() ^ Math.imul(hash(), 0x9E3779B1)) | 0;
  const next = mulberry32(state);
  for (let i = 0; i < 12; i++) next();
  const log = [];
  const d = (sides, label) => {
    const n = Math.floor(next() * sides) + 1;
    if (label) log.push({ label, notation: `d${sides}`, rolls: [n], total: n });
    return n;
  };
  const dice = (count, sides, label, plus = 0) => {
    const rolls = [];
    for (let i = 0; i < count; i++) rolls.push(Math.floor(next() * sides) + 1);
    const total = rolls.reduce((a, b) => a + b, 0) + plus;
    if (label) {
      log.push({ label, notation: `${count}d${sides}${plus ? `+${plus}` : ''}`, rolls, total });
    }
    return total;
  };
  return { seed: String(seed), d, dice, log, raw: next };
}

/** A short, pronounceable seed — easier to read aloud at a table than hex. */
export function coinSeed(rand = Math.random) {
  const parts = ['ash', 'bog', 'cair', 'dun', 'elm', 'fen', 'gorse', 'holl', 'ives', 'kelp',
    'loam', 'mere', 'nettle', 'oak', 'pike', 'quill', 'rook', 'sedge', 'thorn', 'vale',
    'wold', 'yarrow'];
  const pick = () => parts[Math.floor(rand() * parts.length)];
  return `${pick()}-${pick()}-${Math.floor(rand() * 900 + 100)}`;
}

// ------------------------------------------------------------------ items

const DIE = /\bd(4|6|8|10|12|20)\b/;

/**
 * Read one gear line for the qualities that decide what it costs to carry.
 *
 *   "Long Sword (d10, *bulky*)"        -> 2 slots, damage d10
 *   "Protective Gloves (*petty*)"      -> 0 slots
 *   "Cart (+4 slots, *bulky* when pulled)" -> 2 slots, +4 capacity
 *   "Brigandine (1 Armor, *bulky*)"    -> 2 slots, 1 armour
 *
 * Petty beats bulky: an item that costs no slots cannot also cost two.
 */
export function parseItem(text) {
  const flat = text.replace(/\*/g, '');
  const petty = /\bpetty\b/i.test(flat);
  const bulky = /\bbulky\b/i.test(flat);
  const armorMatch = flat.match(/\+?(\d)\s*Armou?r\b/i);
  const capacityMatch = flat.match(/\+(\d+)\s*slots?\b/i);
  // "(d12, blast, bulky, 1 use)" — Cairn's bombs, flasks and charged relics are
  // spent when used, and a model that ignores that arms a party with an
  // infinite grenade launcher.
  const usesMatch = flat.match(/(\d+)\s*(?:uses?|charges?)\b/i);
  // Only the parenthetical carries a weapon's damage die — a spellbook whose
  // description happens to say "d6" is not a weapon.
  const paren = flat.match(/\(([^)]*)\)/);
  const dmgMatch = paren && paren[1].match(DIE) ? paren[1].match(/\bd(?:4|6|8|10|12|20)(?:\s*\+\s*d(?:4|6|8|10|12|20))?/) : null;
  const name = text.split(' (')[0].replace(/\*/g, '').trim();

  return {
    text,
    name,
    petty,
    bulky: bulky && !petty,
    slots: petty ? 0 : (bulky ? 2 : 1),
    armor: armorMatch ? Number(armorMatch[1]) : 0,
    capacity: capacityMatch ? Number(capacityMatch[1]) : 0,
    damage: dmgMatch ? dmgMatch[0].replace(/\s+/g, '') : null,
    blast: /\bblast\b/i.test(flat),
    uses: usesMatch ? Number(usesMatch[1]) : null,
  };
}

/**
 * Pack items into Cairn's ten slots: four on the body, six in the backpack,
 * plus whatever a cart adds. Fatigue takes a slot like anything else.
 *
 * "Anyone carrying a full inventory (i.e. filling all 10 slots) is reduced to
 * 0 HP" — so `full` is a real condition to surface, not a cosmetic warning.
 */
export function packInventory(items) {
  const capacity = 10 + items.reduce((n, i) => n + (i.capacity || 0), 0);
  const used = items.reduce((n, i) => n + i.slots, 0);
  const slots = [];
  for (const item of items) {
    if (item.slots === 0) continue;
    for (let i = 0; i < item.slots; i++) {
      slots.push({ item, part: item.slots > 1 ? i + 1 : 0, of: item.slots });
    }
  }
  return {
    slots,
    petty: items.filter((i) => i.slots === 0),
    used,
    capacity,
    free: Math.max(0, capacity - used),
    over: Math.max(0, used - capacity),
    full: used >= capacity,
    armor: Math.min(3, items.reduce((n, i) => n + i.armor, 0)), // "cannot have more than 3 Armor"
    weapons: items.filter((i) => i.damage),
  };
}

// ------------------------------------------------------------- the character

/**
 * Bolded proper nouns in a table result are the items it hands you — "Take an
 * **Oilskin Coat** and **Mapping Paper**". This only ever PROPOSES: the player
 * clicks to accept, because the SRD bolds three different kinds of thing and no
 * heuristic separates them perfectly.
 *
 * Three patterns are excluded, each learned from the real tables:
 *
 *   RULES KEYWORDS. "**Tough** or **Perilous** terrain", "**Recharge**: wear
 *   the ring", "has your same **Attributes** and **HP**" — terms of art, not
 *   gear.
 *
 *   HEADINGS. Several entries open by naming the option in bold and then
 *   describing it: "**Falconry**. You keep a falcon…", "**Honesty**. Choose a
 *   weapon type…". A bold that starts the text and is followed by a full stop
 *   is a label for the entry, not a thing you put in a pack.
 *
 *   LOWERCASE EMPHASIS. "One **arm** is fully metal" — emphasis on an ordinary
 *   word rather than the name of a thing.
 *
 * It still over-offers a little: a three-column table's title cell may name a
 * specialty ("Arachnids") rather than an item, and those are indistinguishable
 * from the ones that name a relic ("Pullstones"). Over-offering is the safe
 * direction — nothing is added until the player says so, and the sheet has a
 * free-text add for whatever this misses.
 */
const NOT_ITEMS = /^(fatigue|deprived|scars?|recharge|blast|bulky|petty|impaired|enhanced|easy|tough|perilous|attributes|hp|str|dex|wil|bonds?|omens?)$/i;

export function offeredItems(title, text = '') {
  const out = [];
  const seen = new Set();
  // **Name** optionally followed by its (qualities)
  const re = /\*\*([^*]+?)\*\*\s*(\(([^)]*)\))?/g;

  const scan = (source, isBody) => {
    if (!source) return;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source))) {
      const name = m[1].trim().replace(/[.,;:]$/, '');
      if (!/^[A-Z]/.test(name)) continue;
      if (NOT_ITEMS.test(name)) continue;
      // a bold opening the body and closed by a full stop is a heading
      if (isBody && m.index === 0 && /^\s*\./.test(source.slice(re.lastIndex))) continue;
      // The qualities come out of prose, so they still carry its markup.
      const qualities = m[3] ? m[3].replace(/\*/g, '').trim() : '';
      const label = qualities ? `${name} (${qualities})` : name;
      if (seen.has(label)) continue;
      seen.add(label);
      out.push({ label });
    }
  };

  scan(title, false);
  scan(text, true);
  return out;
}

/**
 * Roll one character. THE DRAW ORDER IS THE FORMAT — see the header.
 *
 * @param {string} seed          any string; the same string always returns the same sheet
 * @param {object} [opts]
 * @param {number} [opts.backgroundIndex] force a background (0-19), for "reroll just this"
 */
export function rollCharacter(seed, opts = {}) {
  const rng = makeRng(seed);
  const { backgrounds, traits, bonds, omens } = CAIRN2E;

  // 1. background (d20), even when forced — so forcing one doesn't shift the stream
  const bgRoll = rng.d(20, 'Background');
  const bg = backgrounds[opts.backgroundIndex != null ? opts.backgroundIndex : bgRoll - 1];

  // 2. name (d10 over the background's list)
  const nameRoll = rng.d(bg.names.length, 'Name');
  const name = bg.names[nameRoll - 1];

  // 3. attributes: "Roll 3d6 for each of your character's Attributes, in order."
  const attributes = {
    STR: rng.dice(3, 6, 'STR'),
    DEX: rng.dice(3, 6, 'DEX'),
    WIL: rng.dice(3, 6, 'WIL'),
  };

  // 4. hit protection (1d6)
  const hp = rng.d(6, 'Hit Protection');

  // 5. starting gear — resolve any dice in the gear lines (gold, mostly)
  const gear = bg.gear.map((line) => {
    const m = line.match(/^(\d+)d(\d+)\s+(.*)$/);
    if (!m) return parseItem(line);
    const total = rng.dice(Number(m[1]), Number(m[2]), m[3]);
    // "A bag of coins worth less than 100gp is petty."
    const petty = /gold/i.test(m[3]) && total < 100;
    return parseItem(`${total} ${m[3]}${petty ? ' (*petty*)' : ''}`);
  });

  // 6. the background's own two tables (d6 each)
  const background = {
    id: bg.id,
    name: bg.name,
    blurb: bg.blurb,
    roll: bgRoll,
    tables: bg.tables.map((t) => {
      const n = rng.d(t.die, t.prompt);
      const entry = t.entries.find((e) => e.n === n) || t.entries[n - 1];
      return {
        prompt: t.prompt,
        roll: n,
        // Three-column tables name the result in its own cell, sometimes in
        // bold — the item can be in either half, so both are searched.
        title: entry.title ? entry.title.replace(/\*/g, '') : null,
        text: entry.text,
        offers: offeredItems(entry.title, entry.text),
      };
    }),
  };

  // 7. traits (d10 each, in the SRD's own order)
  const traitOrder = ['physique', 'skin', 'hair', 'face', 'speech', 'clothing', 'virtue', 'vice'];
  const rolledTraits = {};
  for (const key of traitOrder) {
    const list = traits[key];
    const n = rng.d(list.length, key[0].toUpperCase() + key.slice(1));
    rolledTraits[key] = { roll: n, value: list[n - 1] };
  }

  // 8. bond (d20)
  const bondRoll = rng.d(20, 'Bond');
  const bond = bonds.find((b) => b.n === bondRoll);

  // 9. age (2d20+10)
  const age = rng.dice(2, 20, 'Age', 10);

  // 10. omen (d20) — rolled for everyone, but by the rules only the youngest
  //     character in a party reads theirs aloud. Party mode decides who.
  const omenRoll = rng.d(20, 'Omen');
  const omen = omens.find((o) => o.n === omenRoll);

  const inventory = packInventory(gear);

  return {
    seed: String(seed),
    system: 'cairn-2e',
    name,
    background,
    attributes,
    hp,
    age,
    traits: rolledTraits,
    bond,
    omen,
    gear,
    inventory,
    log: rng.log,
  };
}

/** Swap two attributes — "You may then swap any two of the results." */
export function swapAttributes(character, a, b) {
  const attributes = { ...character.attributes };
  [attributes[a], attributes[b]] = [attributes[b], attributes[a]];
  return { ...character, attributes, swapped: [a, b] };
}

/**
 * A party from one seed. Each member is rolled from `${seed}/${i}`, so a
 * member's own sheet URL still reproduces them exactly on their own.
 * The youngest reads the omen (ties break toward the earlier member).
 */
export function rollParty(seed, size = 4) {
  const members = [];
  for (let i = 0; i < size; i++) members.push(rollCharacter(`${seed}/${i}`));
  let youngest = 0;
  for (let i = 1; i < members.length; i++) if (members[i].age < members[youngest].age) youngest = i;
  members.forEach((m, i) => { m.readsOmen = i === youngest; });
  return { seed: String(seed), size, members, youngest };
}

export const VERSION = '1.0.0';
