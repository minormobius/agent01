// site-name.mjs — turn the name the build agent already chose into a slug.
//
// WHY THIS EXISTS. The bot names a site before the build, from the request text
// alone, by taking the first two words over two characters that are not
// stopwords (registry.ts `slugify`). That is positional, not semantic, so
// "actually, let me see whether you can build…" became `actually-let`, and
// "make a fake doordash but for wormholes" became `fake-doordash`.
//
// Meanwhile the agent that actually builds the thing names it properly, in the
// <title>, every single time: those two are "Bottomless — a fractal that never
// runs out of zoom" and "Wormhole Eats — food delivery across the infinite
// multiverse". The judgement is already being made and thrown away. This is the
// function that stops throwing it away.
//
// PURE ON PURPOSE. No I/O, no network, no clock — the slug it returns has to be
// reproducible from the title alone, because it becomes a permanent public URL
// and anything that could vary would make that permanence a lie.

import { marksInSlug } from './marks.mjs';

/** Names the factory itself needs, or that would read as infrastructure.
 *  Kept in step with RESERVED in workers/bsky-bot/src/registry.ts. */
export const RESERVED = new Set([
  'kit', 'www', 'api', 'admin', 'static', 'assets', 'lab', 'index',
  'well-known', 'handle', 'atlink', 'site', 'sites', 'about', 'help',
  'new', 'edit', 'delete', 'search', 'feed', 'null', 'undefined',
]);

/** Leading filler that carries no identity. Dropped only when something is
 *  left over — "the-wall" losing "the" is fine, "a" alone is not. */
const LEADING = new Set(['a', 'an', 'the', 'my', 'your', 'our', 'some', 'this', 'that']);

/** Words a slug must not END on. Truncating "Hats on a Book" at three words
 *  gives `hats-on-a`, and "Newman, Borwein & Littlewood" gives
 *  `newman-borwein-and` — both read as a sentence someone cut off rather than a
 *  name. Trimming these back is what turns a truncation into a title. */
const TRAILING = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for',
  'by', 'with', 'from', 'into', 'as', 'is', 'are', 'that', 'this', 'your',
  'my', 'its', 'it', 'you', 'we',
]);

/** A retired path serves a stub titled "moved — /new-name/". It is a redirect,
 *  not a site, and renaming it would move the redirect and break the link it
 *  exists to keep working. Found by running this over the real estate: it
 *  cheerfully proposed renaming /tube-tetris/ to `moved`. */
export function isRedirectStub(title) {
  return /^\s*moved\b/i.test(String(title ?? ''));
}

/** Where a title stops being a name and starts being a description.
 *  "Bottomless — a fractal that never runs out of zoom" is a name and a blurb,
 *  and only the first half belongs in a URL. Em dash, en dash, colon, pipe, and
 *  a spaced hyphen: NOT a bare hyphen, or "Cosine-Twist Map" loses its spine. */
const SPLIT = /\s+[—–|:]\s*|\s+-\s+|—|–/;

const ENTITIES = { '&amp;': ' and ', '&lt;': ' ', '&gt;': ' ', '&quot;': ' ', '&#39;': '', '&nbsp;': ' ' };

/** Fold a display string down to slug words. Accents keep their letter, symbols
 *  and scripts we cannot render in a path are simply dropped. */
export function words(text) {
  let s = String(text ?? '');
  for (const [ent, rep] of Object.entries(ENTITIES)) s = s.split(ent).join(rep);
  return s
    .normalize('NFKD')                    // é → e +  ́ , ᴼ → O
    .replace(/[̀-ͯ]/g, '')      // drop the combining marks left behind
    .toLowerCase()
    .replace(/['’]/g, '')                 // don't → dont, not don-t
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * The slug for a site, from the title its own agent wrote.
 *
 * @param {string} title       the site's <title>
 * @param {{max?: number, maxLen?: number}} [opts]
 * @returns {string|null} a slug, or null when the title yields nothing usable —
 *   the caller keeps whatever name it already had rather than inventing one.
 */
export function slugFromTitle(title, opts = {}) {
  const { max = 4, maxLen = 24 } = opts;

  if (isRedirectStub(title)) return null;

  // The name half only. A title with no separator is already just a name.
  const head = String(title ?? '').split(SPLIT)[0];
  let ws = words(head);

  // Drop leading filler, but never all of it — "my commute" is allowed to
  // become "commute"; "This" alone has to stay something.
  while (ws.length > 1 && LEADING.has(ws[0])) ws.shift();
  if (!ws.length) return null;

  // Take whole words up to the cap. Truncating mid-word produces the kind of
  // stump ("wormhole-ea") that reads as a bug rather than a name.
  const out = [];
  for (const w of ws.slice(0, max)) {
    const next = out.length ? `${out.join('-')}-${w}` : w;
    if (next.length > maxLen) break;
    out.push(w);
  }
  // Trim back off a function word. Done AFTER the length cap, because the cap
  // is what creates the problem: the cut lands mid-phrase and leaves a dangling
  // "of", "and" or "a" doing the work of a name.
  while (out.length > 1 && TRAILING.has(out[out.length - 1])) out.pop();
  if (!out.length) return null;

  const slug = out.join('-');
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug)) return null;
  if (RESERVED.has(slug)) return null;
  // A DERIVED name is never allowed to carry somebody's mark into a permanent
  // URL on the operator's domain — same rule claim() applies, same list.
  if (marksInSlug(slug).length) return null;
  return slug;
}

/**
 * What a site should be called, given its title and the name it has now.
 * Returns null when there is no improvement to make, so "no change" is the
 * default and a rename is always a positive decision.
 *
 * @param {string} title    the site's <title>
 * @param {string} current  the slug it has today
 * @param {(slug: string) => boolean} isTaken  every name ever published here
 */
export function rename(title, current, isTaken = () => false) {
  const want = slugFromTitle(title);
  if (!want || want === current) return null;
  if (isTaken(want)) {
    // Somebody already has it. A suffix is honest — the alternative is
    // clobbering a live URL, and names here are permanent.
    for (let n = 2; n <= 9; n++) {
      const alt = `${want}-${n}`;
      if (!isTaken(alt) && alt !== current) return alt;
    }
    return null;
  }
  return want;
}
