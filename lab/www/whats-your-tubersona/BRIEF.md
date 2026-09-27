# what-your — tubersona generator

## What this is

A Bluesky thread ("what's your tubersona?") coined "tuber + persona" on the
fly: a lumpy potato-body creature with round eyes, no fixed lexicon for what
it can wear. Two people in the thread mentioned building generators
(`tubersona.bisks.net`, `tuberforge.chef.cee.wtf`) but the first was reported
broken (root 404) twice in the thread itself, and the second's live status
wasn't confirmed either way from what got fetched. So this turn built an
independent, original generator rather than depending on either: a canvas
drawing of a lumpy tuber body (seeded/reproducible shape), a face (◕-style
eyes, four expressions), optional sprouts on top, and exactly one accessory
chosen from a select (none, eyepatch, katana, wrench, toolbelt, a
camera-iris "aperture" face, or ledger & pen — nods to accessories people in
the thread mentioned, without reproducing anyone's specific character).
Shipped: full generator, randomize/reroll, state-in-URL sharing, PNG
download, Bluesky share intent. This is a complete, working turn — not a
skeleton.

## Decisions

- **No login, no PDS save.** This requester's prior build (`turn-venn`) was
  also a pure client-side generator with no Bluesky account involved, and the
  profile notes that as their pattern. A meme/persona generator doesn't need
  identity to be meaningful, so it stays in URL-state + localStorage-free
  territory, matching `turn-venn`'s shape exactly (state-in-query-params,
  share intent, PNG export).
- **Accessory is a single select, not a layered system.** The thread
  describes each person as having *one* signature item (eyepatch, wrench,
  toolbelt, aperture+ledger+pen as a trio for one character). Rather than
  reproduce any one person's exact combination, the generator offers each
  mentioned item as an independent, standalone option so a visitor builds
  their own reading of it.
- **Deterministic seeded shape (`mulberry32`)**, not raw `Math.random()` for
  the body outline, so a shared link reproduces the exact lump pattern, not
  just the color/accessory choice.
- **Did not name it "Tubersona" as a branded product** — used it as the
  plain descriptive term from the thread (not owned by either linked tool),
  consistent with "build the mechanic, name it yourself" — but the phrase
  itself is generic wordplay here, not someone's product name, so it appears
  in copy/description freely.

## The plan (not built yet, in order)

1. **More accessories / hair variety** — only 4 hair options and 6
   accessories exist. Easy to extend: each is a self-contained function
   (`drawHair`, `drawAccessory`) that takes `(ctx, kind, ...)`; add a case.
2. **A gallery of shared tubers via labPds** (`/_kit/pds.js`) — save a
   tuber to the visitor's own repo (`com.minomobi.lab.doc`, kind
   `tubersona`), and let them browse ones they've made before. Optional
   sign-in, not required for the generator itself.
3. **Accessory placement collisions** — eyepatch and aperture both touch the
   eye area; right now aperture accessory silently overrides the eyes
   entirely (drawn instead of them) rather than combining, which is correct
   for aperture (it's a face replacement per the void.comind.network
   description) but worth a code comment if it's revisited.
4. **A CARD.json image embed was deliberately skipped** — this is a tool
   people need to open and use, so the screenshot-of-it-working link card is
   the better advert, per the brief's own guidance.

## Gotchas

- The `<select>` elements needed their own CSS — the kit's `tokens.css` only
  styles `input`/`textarea`/`button`, not `select`, so without adding
  matching rules a bare unstyled dropdown would have looked broken against
  the dark theme and likely failed the 16px/44px mobile checks too.
- Watch for accidental self-referential nonsense left over from drafting —
  I caught and fixed one stray `'#silver' === 'silver' ? ... : ...` ternary
  in the ledger accessory's pen color before finishing; worth a re-read of
  `drawAccessory` if extending it, since it was written fast.
- No Bluesky calls at all in this site (no `kit.bskyGet`, no handle input),
  which is correct for what was asked — don't add a handle box "for
  consistency" unless a future request actually asks this to be tied to an
  account.
