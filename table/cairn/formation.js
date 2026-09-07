// table/cairn/formation.js — one party, carried through the whole formation.
//
// THE PROBLEM THIS SOLVES. Four screens form a party: the roller rolls it, the
// player edits it, the kit screen equips it, the trials run it. Each screen
// reconstructed the party from the URL, and the URL only ever carried the roll
// seed — so every screen after the first was looking at a DIFFERENT party than
// the one you had been staring at, silently and plausibly:
//
//   * party size vanished. The roller omitted `n` when you rolled a single
//     character, and the kit screen's default is four. One delver became four.
//   * attribute swaps vanished. Cairn explicitly lets you swap two attributes,
//     the roller implements it, and the next screen rolled a fresh sheet.
//   * so did everything the player picked off a background table, typed in by
//     hand, or marked as Fatigue.
//
// THE FIX IS THE OBVIOUS ONE, WHICH IS WHY IT IS WORTH SAYING OUT LOUD: the
// seed stays the seed, and every later decision is another string layered on
// top of it. The URL is the whole formation, in order:
//
//   #s=oak-fen-317 & n=4 & e=0.sSD-t2!3.f1 & x=1.Um9wZQ & src=bought & h=12
//     |               |     |                 |            |
//     the roll        size  hand edits        typed items  kit settings
//
// Every screen decodes the same string and rebuilds the same party, because
// there is exactly one function that turns a formation into characters and
// they all call it. Nothing downstream is allowed to re-roll.
//
// WHY OPERATIONS AND NOT RESULTS. The edits are recorded as what the player
// DID — swap these two, take that offer — never as the resulting sheet. That
// keeps the string short, keeps the seed authoritative, and means a change to
// the roll tables shows up as a changed sheet rather than as a formation that
// silently no longer matches its own seed.

import { rollParty, rollCharacter, swapAttributes, parseItem } from './roll.js';

const ATTR = { S: 'STR', D: 'DEX', W: 'WIL' };
const CODE = { STR: 'S', DEX: 'D', WIL: 'W' };

// Hand-rolled base64url, because the free-typed item text is the one part of a
// formation that can contain anything at all, and it has to come back byte for
// byte through a URL fragment.
const b64 = {
  to: (s) => btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  from: (s) => {
    const pad = s.replace(/-/g, '+').replace(/_/g, '/');
    return decodeURIComponent(escape(atob(pad + '==='.slice((pad.length + 3) % 4))));
  },
};

/** An empty edit record for one member. */
const noEdits = () => ({ swaps: [], taken: [], typed: [], fatigue: 0 });

/**
 * The formation, defaulted. `edits` is sparse: only members who were touched
 * appear, keyed by index.
 */
export function emptyFormation(seed = '', size = 4) {
  return { seed, size, edits: {}, source: 'found', count: 8, mode: 'scaled', kit: true };
}

export const editsFor = (f, i) => (f.edits[i] || (f.edits[i] = noEdits()));

// ------------------------------------------------------------------ decoding

/**
 * Parse a location.hash (with or without the leading `#`) into a formation.
 *
 * Unknown fields are ignored and malformed ones fall back to their default
 * rather than throwing: a URL is user input, and a party that comes back
 * slightly wrong beats a page that shows nothing.
 */
export function decodeFormation(hash, { defaultSize = 4 } = {}) {
  // `defaultSize` is an ARGUMENT rather than a constant because the roller
  // opens on one character and every screen after it on four. That divergence
  // used to be two hard-coded numbers in two files, which is precisely how a
  // solo delver became a party of four on the way to the kit screen. It is
  // still two different defaults — but now they are visible at the call site,
  // and they only ever apply to a URL that carries no `n` at all.
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const size = p.has('n') ? Number(p.get('n')) : defaultSize;
  const f = emptyFormation(p.get('s') || '',
    Number.isFinite(size) ? Math.min(6, Math.max(1, Math.round(size))) : defaultSize);
  f.source = p.get('src') === 'bought' ? 'bought' : 'found';
  f.count = Math.min(12, Math.max(4, Number(p.get('h')) || 8));
  f.mode = p.get('m') === 'fixed' ? 'fixed' : 'scaled';
  f.kit = p.get('kit') !== '0';

  for (const group of (p.get('e') || '').split('!').filter(Boolean)) {
    const [idx, ops = ''] = group.split('.');
    const i = Number(idx);
    if (!Number.isInteger(i) || i < 0) continue;
    const e = editsFor(f, i);
    for (const op of ops.split('-').filter(Boolean)) {
      if (op[0] === 's' && ATTR[op[1]] && ATTR[op[2]]) e.swaps.push([ATTR[op[1]], ATTR[op[2]]]);
      else if (op[0] === 't' && /^\d+$/.test(op.slice(1))) e.taken.push(Number(op.slice(1)));
      else if (op[0] === 'f' && /^\d+$/.test(op.slice(1))) e.fatigue = Math.min(9, Number(op.slice(1)));
    }
  }
  for (const entry of (p.get('x') || '').split('!').filter(Boolean)) {
    const at = entry.indexOf('.');
    const i = Number(entry.slice(0, at));
    if (!Number.isInteger(i) || i < 0) continue;
    try { editsFor(f, i).typed.push(b64.from(entry.slice(at + 1))); } catch { /* skip junk */ }
  }
  return f;
}

// ------------------------------------------------------------------ encoding

/**
 * A formation as a hash string, WITHOUT the leading `#`.
 *
 * Built by hand rather than with URLSearchParams so the separators stay
 * literal: `!`, `-` and `.` are all legal unencoded in a fragment, and a URL
 * full of %21 is a URL nobody will read or trust.
 */
export function encodeFormation(f, { include = ['s', 'n', 'e', 'x', 'src', 'h', 'm', 'kit'] } = {}) {
  const out = [];
  const put = (k, v) => { if (include.includes(k)) out.push(`${k}=${v}`); };
  put('s', encodeURIComponent(f.seed));
  // ALWAYS written, even at 1. Omitting it when the value happened to look
  // like a default is exactly how a solo delver arrived next door as a party
  // of four: the next screen's default was not this screen's default.
  put('n', String(f.size));

  const groups = [];
  const typed = [];
  for (const key of Object.keys(f.edits).map(Number).sort((a, b) => a - b)) {
    const e = f.edits[key];
    if (!e) continue;
    const ops = [
      ...e.swaps.map(([a, b]) => `s${CODE[a]}${CODE[b]}`),
      ...e.taken.map((t) => `t${t}`),
      ...(e.fatigue ? [`f${e.fatigue}`] : []),
    ];
    if (ops.length) groups.push(`${key}.${ops.join('-')}`);
    for (const text of e.typed) typed.push(`${key}.${b64.to(text)}`);
  }
  if (groups.length) put('e', groups.join('!'));
  if (typed.length) put('x', typed.join('!'));
  if (f.source !== 'found') put('src', f.source);
  if (f.count !== 8) put('h', String(f.count));
  if (f.mode !== 'scaled') put('m', f.mode);
  if (!f.kit) put('kit', '0');
  return out.join('&');
}

// ------------------------------------------------------- rebuilding the party

/**
 * Every offer a character's background tables put on the table, flattened in
 * the order the roller renders them. THE INDEX IS THE IDENTITY: an earlier
 * version recorded picks by label, which cannot distinguish two offers of the
 * same thing and silently merged them.
 */
export function offersOf(character) {
  const out = [];
  character.background.tables.forEach((t, ti) => {
    (t.offers || []).forEach((o, oi) => out.push({ ...o, table: ti, option: oi, at: out.length }));
  });
  return out;
}

/** Everything one member has been given on top of the sheet the seed rolled. */
export function addedTo(character, edits) {
  const e = edits || noEdits();
  const offers = offersOf(character);
  return [
    ...e.taken.map((i) => offers[i]).filter(Boolean).map((o) => parseItem(o.label)),
    ...e.typed.map((text) => parseItem(text)),
    ...Array.from({ length: e.fatigue }, () => ({ ...parseItem('Fatigue'), fatigue: true })),
  ];
}

/**
 * THE ONE FUNCTION THAT TURNS A FORMATION INTO A PARTY. Every screen calls it;
 * no screen is allowed to roll its own.
 *
 * Returns characters with the swaps already applied, plus the `added` items
 * separately — because `combatantFromCharacter(character, added)` is how the
 * simulator wants them, and folding the additions into `gear` here would make
 * "what did the player add" unrecoverable one step later.
 */
export function buildParty(f) {
  const members = f.size === 1
    ? [rollCharacter(f.seed)]
    : rollParty(f.seed, f.size).members;
  return members.map((rolled, i) => {
    const e = f.edits[i];
    let character = rolled;
    // Applied in the order they were made: two swaps that share an attribute
    // do not commute, so replaying them out of order is a different sheet.
    for (const [a, b] of (e ? e.swaps : [])) character = swapAttributes(character, a, b);
    return { character, added: addedTo(character, e), edits: e || noEdits() };
  });
}

/** Convenience: just the characters, with additions folded into their gear. */
export function partyWithGear(f) {
  return buildParty(f).map(({ character, added }) => ({
    ...character,
    gear: [...character.gear, ...added],
  }));
}
