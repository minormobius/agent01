# BRIEF — same-thing / "Soupᵒᵖ"

## What this is

abeliansoup asked for the mirror image of a request made *to a different bot*
elsewhere in the thread (`@buildthis.bisks.net`, not us): that other ask was
"clone @abeliansoup, take his 100 most-liked posts, rewrite them in Simple
English with emojis" — maximum comprehensibility. This request is the same
shape, inverted: an "enigmatic acc that isn't supposed to be understood,"
dense enough that even the real account couldn't parse it.

Shipped: a single-file generator, no network calls at all. A small recursive
grammar (category-theory/homotopy-theory vocabulary, theatrical Latin filler,
inline "math noise" tokens) builds one dense run-on sentence per post, with a
"curdle further" button that increases recursion depth (capped at 14) and a
joke "comprehensibility" stat that decays as `100/(depth+1)^3`. Each post has
a "copy" button and an "attempt translation" button that always fails with a
different deadpan error — a direct jab at the *other* clone's whole premise.

## Decisions

- **Generative grammar, not a scraped corpus.** This build has no network
  tools and the content gate only allows calls with a visitor-named subject
  anyway — there's no "pull his 100 most-liked posts" available here even if
  it were desirable. A from-scratch generator sidesteps that entirely and is
  actually a better fit for "so dense even he couldn't parse it": real posts
  have real jokes underneath; this has nothing underneath by construction.
- **Named it "soupᵒᵖ", not `@abeliansoup`.** The page is *about* the account
  and explicitly framed as its categorical opposite, but it never speaks
  *as* him — no fake avatar, no handle that could be mistaken for the real
  one, and a disclaimer up top says plainly that nothing below is a real
  post. Parody has to read as parody without being told; this also just
  tells you, cheaply, since the copy budget allowed it.
- **Recursion is linear, not branching** (`sentence()` makes at most one
  recursive call per invocation, decrementing depth each time), so depth 14
  is a long sentence, not an exponential blowup. Capped there anyway with an
  honest message ("longer, not denser") rather than letting someone mash the
  button into a multi-megabyte string.
- **No corpus, no `getAuthorFeed` call, no avatar fetch.** Deliberately zero
  Bluesky API surface — nothing here can 400, time out, or hit a moderation
  label, which also means nothing here needed the fixtures.

## The plan (next agent, if asked for more)

1. **Not yet verified in a real browser.** The harness screenshot pass is the
   first real look. Watch for: the recursive `.replace('%C%', ...)` chain
   producing visually broken nesting at high depth, the noise-token splicing
   landing mid-word, and whether 14 levels of connective clauses actually
   reads as "incomprehensible" or just as "long" — if the latter, the fix is
   more varied connector shapes, not more depth.
2. **If a future ask wants this to feel more like an actual bot account**
   (a persistent "feed" across visits, or posting into the visitor's own
   repo via `labPds()` as a saved "favorite curdle"), that's additive and
   fits the kit's `com.minomobi.lab.doc` collection — not built here since
   sign-in wasn't asked for and this page works with zero auth.
3. **The vocab lists are hand-picked and finite** (~20 nouns, 12 verbs/
   adverbs, 7 connectors, 8 terminals). Fine at depth 14 because the
   connector nesting varies the shape a lot, but a much bigger ask ("hundreds
   of distinct posts") would start showing repeats — grow the lists before
   the mechanism if that's ever the complaint.

## Gotchas

- `sentence()`'s connector interpolation uses literal `%C%` — grep for that
  token if adding new connector strings, not `{CLAUSE}` or similar.
- `withNoise()` bails out (returns the sentence unchanged) below 8 words so
  the splice math never goes out of bounds — don't remove that guard when
  tuning noise density.
- Depth starts at 2 on load/reset, not 0 — a depth-0 post is just one plain
  sentence, which reads as merely quirky rather than "impossible to parse,"
  and undersells the premise on first paint.
