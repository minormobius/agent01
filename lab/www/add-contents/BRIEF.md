# BRIEF — add-contents ("Behind Iron Ledger")

## What this is

The request was terse: "add the contents of BRIEF.md to the page." Read
alongside the thread it arrived with — which is entirely about
`lab/www/add-atproto/` ("Iron Ledger", the train game + atproto ask from
@minormobius.bsky.social and @jauntywunderkind.bsky.social) — the ask reads
as: take that game's `BRIEF.md`, the handoff letter one build agent writes
for the next one, and publish it as an actual page. `BRIEF.md` is written for
an agent with no memory of the thread; nobody had made it readable by an
actual person.

This turn shipped exactly that: `lab/www/add-contents/index.html` is a
standalone devlog page. It opens with what shipped in Iron Ledger (terrain,
budgeted track, switches, share links, autosave) and what didn't (real
Bluesky login — explained honestly, not glossed over), then a toggle reveals
a longer "build notes" section reworded from the actual BRIEF.md prose:
why login is blocked (two separate causes, both named), why share links carry
the whole build state instead of a server pointer, the money/removal design
choices, and what a future pass should do first. Nothing here is invented —
every claim is carried over from `add-atproto/BRIEF.md`, reworded for a reader
who has never seen an agent handoff document, not re-reported from memory.

I did not touch `lab/www/add-atproto/` or `lab/www/train-game/` — this is a
separate, new site, and the hard boundary (write only inside this directory)
forbids editing either anyway.

## Decisions

- **Interpreted "BRIEF.md" as add-atproto's, not train-game's.** The thread
  context given for this task is specifically the add-atproto exchange
  (jauntywunderkind's atproto ask, the "sample link... minomobi.com/add-atproto/"
  post, minormobius's "it's awesome that worked"). `train-game/BRIEF.md` exists
  too but wasn't what the thread was pointing at, so it isn't used here.
- **No Bluesky API calls on this page.** The content is a fixed writeup, not a
  lookup — there's nothing to look up. Per this requester's own profile note,
  not every page needs a handle box or an AppView call; adding one here would
  have been decoration, not function. `kit.js` is still linked for `crumb()`
  and its CSS classes, but `bskyGet` is never called.
- **Reworded rather than pasted verbatim.** The real BRIEF.md is written in
  agent voice — "this turn," "the requester," internal file paths — and
  reads like an internal memo, not a page for a stranger who followed a link
  from Bluesky. The facts (what's built, what's blocked, why) are unchanged;
  only the audience-facing framing changed. Said so explicitly on the page
  itself (the small note under "build notes") so nobody mistakes this for
  the literal file contents.
- **Toggle instead of always-visible wall of text**, matching this
  requester's established preference (see their profile): lead with what a
  visitor actually wants — does the game work, what's in it — and let the
  "why," the mechanism, be an opt-in reveal rather than the first thing on
  the page. Gave the toggle the filled-gradient-plus-pulse treatment their
  profile calls for on any control that matters, not a plain outline.
- **Rainbow gradient chrome on headings/panel borders/button, plain-contrast
  body text** — the established split from this requester's profile, applied
  without being re-asked.
- **Linked to `../add-atproto/` as "play Iron Ledger"** near the top, since a
  devlog about a game is more useful with the game one tap away.

## The plan — not done yet, in order

1. **If the requester actually meant `train-game/BRIEF.md`** (the sibling
   site, no atproto component, same terrain/budget/switches shape but a
   different set of decisions and an open "no win condition yet" plan) —
   that would be a second, separate devlog page, not an edit to this one.
   Ask, don't guess a second time; the thread genuinely points at add-atproto,
   but if that reading turns out wrong this is the fix.
2. **This page will go stale the moment add-atproto changes** — there's no
   mechanism linking them; it's a snapshot in prose, not a live read of
   `BRIEF.md`. If add-atproto's real login work ever lands, this page's "what's
   still missing" section needs a manual update or it will actively mislead
   a reader. Worth a plain timestamp or "as of" note if this page gets a
   second turn.
3. **No `og:image`** — same as both sibling sites, nothing available to
   generate honestly this turn, so the link card is title/description only.

## Gotchas

- **Never rendered in a real browser** — no Bash, no WebFetch, same
  limitation every lab turn has. The one thing most worth a look in the
  harness's smoke pass: the `.notes` toggle (`display:none` → `.open` class)
  and the `aria-expanded` sync on the button — logic looks right reading it
  twice, but toggle-visibility bugs are exactly the kind that only show up
  once a real click fires.
- **This page makes claims about a *different* site's internals** (the CSP,
  the asset-root behavior) that I did not re-verify this turn — they're
  carried over from `add-atproto/BRIEF.md`'s own Gotchas section, which says
  its author re-checked them as of 2026-07-28. If that ever changes, this
  page's "what's still missing" panel is the thing that goes wrong quietly,
  not this file.
