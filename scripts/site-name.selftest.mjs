#!/usr/bin/env node
// site-name.selftest.mjs — the slug a site gets from the name its agent chose.
//
//   node scripts/site-name.selftest.mjs
//
// A SLUG HERE IS A PERMANENT PUBLIC URL, posted to Bluesky the moment it is
// decided. That makes this function's failure mode unusually expensive: not a
// wrong render somebody reloads, but an address that outlives the mistake. So
// the cases below are mostly the ugly half — the titles that produce something
// embarrassing if nobody thought about them.
//
// Every "real" case is an actual <title> from lab/www/, not an invention. Three
// of them are here because running this over the live estate produced something
// wrong and the fix needed pinning.

import { slugFromTitle, rename, words, isRedirectStub } from './lib/site-name.mjs';

let pass = 0, fail = 0;
const ck = (cond, msg) => { if (cond) pass++; else { fail++; console.error(`  ✗ ${msg}`); } };
const eq = (a, b, msg) => ck(a === b, `${msg}\n      expected: ${JSON.stringify(b)}\n      actual:   ${JSON.stringify(a)}`);

// --- the whole point: real titles, real improvements -----------------------
const real = [
  ['Bottomless — a fractal that never runs out of zoom', 'bottomless'],
  ['Wormhole Eats — food delivery across the infinite multiverse', 'wormhole-eats'],
  ['beakstreak — flashcards from your own hits, guarded by a crow', 'beakstreak'],
  ['Nevermore, Rate-Limited — slingshot a doomposting raven off his laptop', 'nevermore-rate-limited'],
  ['Iron Ledger — a rail-building game you can tag and share', 'iron-ledger'],
  ['my commute — Lake Merritt to Redwood Shores by water', 'commute'],
  ['Shoal — a hyperbolic fish tiling you can swim through', 'shoal'],
  ['concourse — a packed room has no winning move', 'concourse'],
  ['The Mention Hazard — a workplace safety filmstrip', 'mention-hazard'],
  ['minutiae — an impossible quiz about one Bluesky account', 'minutiae'],
];
for (const [title, want] of real) eq(slugFromTitle(title), want, `real title → ${want}`);

// A hyphen INSIDE a name is part of the name; a spaced hyphen is punctuation.
eq(slugFromTitle('Cosine-Twist Map Explorer — orbits, fractal'), 'cosine-twist-map',
   'an internal hyphen survives, the description does not');
eq(slugFromTitle('handle → did - a mino.mobi lab site'), 'handle-did',
   'a spaced hyphen separates name from blurb');

// --- what the live run got wrong, before it was fixed ----------------------
//
// Truncating at the word cap lands mid-phrase, and the leftover reads as a
// sentence somebody cut off rather than as a name. These three were produced by
// the first version against real sites.
eq(slugFromTitle('Hats on a Book — proper hat-guessing on two-spine book graphs'), 'hats-on-a-book',
   'was `hats-on-a` — a slug must not end on an article');
eq(slugFromTitle('Newman, Borwein &amp; Littlewood polynomial roots'), 'newman-borwein',
   'was `newman-borwein-and` — nor on a conjunction');
eq(slugFromTitle('Minutes of the Committee — item by item, forever'), 'minutes-of-the-committee',
   'a function word INSIDE the name is fine; only a trailing one is not');
eq(slugFromTitle('capabilities, found by trial and error'), 'capabilities-found',
   'was `capabilities-found-by` — trailing preposition trimmed');

// THE ONE THAT WOULD HAVE DONE DAMAGE. A retired path serves a stub so old
// links keep working. Renaming it moves the redirect, which breaks the exact
// thing it exists to preserve — and the first version proposed calling it
// `moved`.
ck(isRedirectStub('moved — /tube-stacker/'), 'a redirect stub is recognised');
ck(isRedirectStub('Moved'), 'case-insensitively');
ck(!isRedirectStub('Moving Day — a game about boxes'), 'a real site that starts with "Moving" is not a stub');
eq(slugFromTitle('moved — /tube-stacker/'), null, 'a redirect stub yields no slug at all');

// --- shape, and the rules a permanent URL has to obey ----------------------
eq(slugFromTitle('a song, sung in emoji'), 'song-sung-in-emoji', 'leading article dropped');
eq(slugFromTitle('The'), 'the', 'leading filler is never dropped down to nothing');
eq(slugFromTitle('Soupᵒᵖ — the opposite category'), 'soupop', 'superscripts fold to letters');
eq(slugFromTitle('Foam &amp; Seam — architecture brainstorm'), 'foam-and-seam', '&amp; becomes "and"');
eq(slugFromTitle('Foam & Seam'), 'foam-and-seam', 'a bare ampersand too');
eq(slugFromTitle("don't panic"), 'dont-panic', 'an apostrophe closes up rather than splitting');
eq(slugFromTitle('Café Números'), 'cafe-numeros', 'accents keep their letter');

// Nothing usable is null, never a guess — the caller keeps the name it has.
for (const empty of ['', '   ', '—', '///', '日本語', null, undefined]) {
  eq(slugFromTitle(empty), null, `nothing usable in ${JSON.stringify(empty)} → null`);
}
// Not in that list, and the first draft of this test wrongly put it there: a
// site whose title is a number has a perfectly good name. `42` is a slug.
eq(slugFromTitle(42), '42', 'a numeric title is usable, not empty');

// A slug that would collide with the factory's own paths is refused outright,
// exactly as claim() refuses it.
eq(slugFromTitle('admin — the control panel'), null, 'RESERVED is refused');
eq(slugFromTitle('kit'), null, 'so is the shared kit');

// Marks: the same list claim() uses. A derived name must never carry somebody
// else's trademark into a permanent URL on the operator's domain.
eq(slugFromTitle('Tetris — falling blocks'), null, 'a trademark in a derived name is refused, not shortened');

// Length: whole words only. A stump like `wormhole-ea` reads as a bug.
const long = slugFromTitle('Extraordinarily Comprehensive Documentation Repository System');
ck(long === null || (long.length <= 24 && !long.endsWith('-')), `long titles stay within 24 and end on a word: ${long}`);
ck(!/--/.test(String(long)), 'no doubled hyphens');

// --- rename(): no change is the default ------------------------------------
eq(rename('Bottomless — a fractal', 'actually-let'), 'bottomless', 'proposes the better name');
eq(rename('Bottomless', 'bottomless'), null, 'already correct → no rename');
eq(rename('moved — /elsewhere/', 'old-path'), null, 'never renames a redirect');
eq(rename('', 'keep-me'), null, 'no title → no rename');
eq(rename('Bottomless', 'actually-let', (s) => s === 'bottomless'), 'bottomless-2',
   'a taken name takes a suffix rather than clobbering a live URL');
eq(rename('Bottomless', 'actually-let', () => true), null,
   'if every candidate is taken it declines rather than inventing');

eq(words('Foo—Bar').join(' '), 'foo bar', 'words() splits on an em dash');

console.log(fail ? `✗ site-name: ${fail} failed, ${pass} passed` : `✓ site-name — ${pass} passed`);
process.exit(fail ? 1 : 0);
