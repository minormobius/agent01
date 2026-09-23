# combine-this — handoff

## What this is

minormobius quote-posted hull8435's ask ("combine this with a TLD verifier and
a WHOIS engine and find me a banger domain name"), pointing at their own
`rite.mino.mobi/sharp` — a single-syllable word cycler/minter. The ask is:
fuse that word-minting idea with domain tooling to spit out candidate domain
names.

Shipped, one turn: a word forge (mint an invented single-syllable word via
onset/vowel/coda phonotactics, or pull a real one from a ~230-word curated
list), a TLD picker of ~150 hand-checked real TLDs (about 30 annotated with
what the code actually stands for — `.io` is British Indian Ocean Territory,
`.tv` is Tuvalu, etc.), a free-text TLD verifier against that same list, and a
domain preview with two offline badges (label syntax valid? TLD confirmed
real?) plus a link out to a genuine `whois.com/whois/<domain>` lookup for the
exact candidate. A "kept combos" list accumulates what you've landed on so you
can compare a batch, cleared on refresh (no backend, nothing saved off-device).

## Decisions

- **No live WHOIS.** The lab worker's CSP `connect-src` is `'self'` plus
  `public.api.bsky.app` / `plc.directory` / the PDS wildcard only — no
  registrar, no RDAP, no WHOIS-over-HTTP proxy is reachable from inside the
  page. Building a "checker" that silently returns nonsense would be worse
  than admitting the limit, so the page says so explicitly and links out to
  a real external lookup instead (`<a target="_blank">`, not a fetch — that's
  a navigation, not blocked by connect-src). This is the honest reading of
  "combine ... with a WHOIS engine": the *engine* is a real one, just not one
  this page can embed.
- **TLD list is a curated ~150, not the ~1,500-entry root zone.** I have no
  network to pull the live IANA list, so I hand-picked ones I'm confident are
  real (classic gTLDs, well-known new gTLDs, common ccTLD vanity picks,
  ~50 country codes) rather than inventing a longer list from shakier memory.
  The UI is explicit both in the footer and in the custom-verify result that
  "not on this list" means unverified, not fake.
- **Didn't reuse `rite/sharp`'s actual code** — it isn't in this checkout (no
  `lab/www/rite*` directory exists on this branch), so the word mechanic here
  is an original onset/vowel/coda generator, not a port. Functionally
  equivalent in spirit (mint vs. find, single-syllable), not byte-identical.
- **No Bluesky/handle integration.** This tool has no natural subject the
  visitor "names" (no handle, no chart of someone's data), so `kit.handleInput`
  and the profile's chart/copy-image defaults don't apply here — noted so the
  next agent doesn't wonder why they're missing.

## The plan (not built yet, in order)

1. **A real (if approximate) TLD count/coverage note.** Right now the page
   just says "~150 of ~1,500" — if a future turn gets a fetched copy of the
   IANA root zone DB (via the harness's link-fetch, if the requester posts a
   link to it), swap `TLDS` for the real list and drop the "may be real but
   unlisted" hedge for one that's actually exhaustive.
2. **A "did you mean" for near-miss TLDs** — e.g. typing `io` works, but a
   typo like `ioo` currently just says "not on my list" instead of suggesting
   the close match. Cheap Levenshtein-1 check against `TLDS` keys.
3. If this thread wants a shared "best banger" leaderboard, it would need
   `pds.js`'s `com.minomobi.lab.score` — friend-compare only per the kit's
   rules, no global board. Not attempted; no ask for it yet.

## Gotchas

- `rite/sharp` (the site being combined with) is not present anywhere in this
  git checkout — don't go looking for its source to port; it lives on a
  different, unmerged state of the lab tenant tree.
- `whois.com/whois/<domain>` is a plain external link, not a fetch — CSP's
  `connect-src` restriction doesn't apply to top-level navigation, only to
  `fetch`/`XHR`/`WebSocket`/etc. Don't "fix" this into a `kit.fetchJson` call
  later; that would just throw against a CSP-blocked host.
- Word bank was hand-filtered for actual single-syllable-ness from memory,
  not machine-checked — if a future report says a specific entry reads as two
  syllables to someone, just remove it from `REAL_WORDS` rather than
  rebuilding the filter.
