# BRIEF — "Truth Markup"

## What this is

The request thread (thegodfungi.bsky.social, replying to their own earlier
post after minormobius told them to "just tell this guy to build it") asked
for a site around one idea: DRAM and "ilk" — memory, transfer, load, supply —
carry a price that's artificially low because some of what everyone believes
about them is wrong ("lies and misconceptions"). As the misinformation gets
dispelled/shed, the real price should surface, and whatever gets discarded
should turn into "the tiniest piece of entertaining art, maybe to gawk at."

Turn 1 shipped a full, working single-page simulation. Five commodities
(DRAM, NAND flash, HBM, transfer bandwidth, supply capacity), each starting
under-priced ("floor") with a noisy, jittery signal. Clicking "Dispel a lie"
raises global `purity` (0→1), which both damps the noise and interpolates
every asset's price toward its honestly-labelled "true value." Each click
also credits the asset with the largest remaining gap and paints a small
procedural-art tile from that removed noise into a gallery below, newest
first, capped at 30 tiles.

Turn 2 shipped item 1 from turn 1's plan: gallery persistence. The request
that turn was just "u are funny" — a reaction, not a new ask — so per the
standing instruction ("if the request does not point somewhere else, work
the plan") that turn worked the plan rather than inventing something new.
Signing in (optional, `kit.handleInput` + `labPds`) saves the gallery to the
visitor's own repo as `{key, removed, seed}` tiles rather than pixels, and
`mulberry32(seed)` repaints the exact same art deterministically on the next
visit. Sign-in/out UI sits above the gallery; `store.onChange` keeps it in
sync if a session expires mid-visit.

Turn 3 (this turn) shipped items 5 and 6 from turn 2's plan. The request
this turn — "cool how session instances react to fine touch" — doesn't name
anything that exists on the page (no "session instances" or "touch" concept
here) and doesn't point anywhere else, so it reads the same way "u are
funny" did last turn: a reaction, not a new ask. Worked the plan again.
Shipped: (a) signing in mid-visit no longer discards whatever was painted
before the redirect — `doSignIn` stashes the in-memory `tiles` array into
`sessionStorage` right before `store.signIn` navigates away, and the
`store.ready().then(...)` chain reads it back, merges it in front of
whatever was already saved, re-persists the merged list, and clears the
stash key; (b) a "Clear saved gallery" button next to Sign out, calling
`store.remove('gallery')` and resetting the in-memory/on-screen gallery to
empty.

## Decisions

- **No real DRAM/NAND/HBM market data.** There's no network access and no
  live-pricing API on the allowlist even if there were — `connect-src` is
  `public.api.bsky.app` / `plc.directory` only. Rather than pretend, the
  footer says plainly these are illustrative stand-ins, not sourced prices.
  This is the honest-labelling pattern this requester has responded well to
  before (flame-simulator combustion temps, "estimated" and clearly said).
- **One global purity control, not five separate sliders.** The ask reads as
  one restructuring event across "every and all instances," not five
  independent markets, so one button driving all five keeps the metaphor
  intact. The *breakdown table* underneath is still per-asset (this
  requester's profile flags a standing preference for a breakdown over a
  single score) — so the multi-item structure they like is there, it's just
  driven by one lever instead of five.
- **No text drawn on the canvas** — not the chart, not the gallery tiles.
  This requester gave explicit past feedback on a different site ("cheers-
  write"): keep readouts out of the simulation surface. Numbers live in the
  HTML breakdown table; gallery captions are `<figcaption>` elements below
  each tile, never painted over it.
- **Sign-in is now wired up, but stays optional.** Turn 1 argued against
  adding OAuth "just to have it"; turn 1's own plan then named the gallery
  as the obviously-missing durable piece, so this turn adds it without
  making it required — the price simulation and the in-session gallery both
  still work with zero clicks toward Bluesky. `store.save`/`store.load` only
  fire when `store.user()` is truthy.
- **Store the seed, not the pixels.** A tile's `paintArt` used
  `Math.random()` five separate times per tile; saving a screenshot would
  work but can't be "repainted," and JSON-encoding a canvas as a data URL
  bloats the record for no reason. Swapped every `Math.random()` inside
  `paintArt` for a passed-in `rng()` and seed each tile with one 32-bit
  integer (`mulberry32`), so `{key, removed, seed}` is ~40 bytes and
  reproduces pixel-for-pixel on reload.
- **`prefers-reduced-motion` gets a real branch**, not just CSS: the rAF
  loop never starts, history is pre-seeded once statically, and interaction
  (dispel/reset) still redraws once per click so the page isn't frozen, it's
  just not animating on its own.

Turn 4 shipped in response to "Nice, could those tidbits of art be comparted
into an imaging mover" — garbled phrasing, read as "composite the [gallery]
tiles into one movable/downloadable image." Added a "Save gallery as one
image" button next to the gallery heading: it grabs every `<canvas>` element
currently in `#gallery` (no repainting — reuses the DOM tiles as-is), lays
them into a grid on one offscreen canvas with a `--bg-raised` background and
rounded-rect clipping per tile (feature-detected via `ctx.roundRect`), and
triggers a `download`-attribute link with `toDataURL('image/png')`. Disabled
while the gallery is empty; `updateExportState()` is called from every place
`tiles` changes (`addArtwork`, the clear-gallery handler, and the
sign-in/merge chain) to keep that in sync. Works signed in or out, since it
only reads what's already painted — no repo round-trip involved.

NOTE.txt flags the ambiguity: if the requester actually meant an *animated*
image (a GIF-like flipbook cycling through tiles, matching "imaging mover"
read as "a moving image" rather than "a movable image"), that's a different
and bigger build — no GIF encoder is available client-side, so it'd mean a
canvas loop cycling frames, which is buildable but wasn't started this turn
since the static-composite reading felt more likely given no other signal in
the thread. If the next request confirms "moving" was literal, start there
rather than treating this turn's export as *it* just needing to loop.

Turn 5 shipped in response to "Tangible - yes, want a particled ninja lie
dispeller" — read as a direct, concrete ask (unlike turns 2/3's "u are funny"
/ "cool how session instances react to fine touch", which named nothing on
the page and were worked as reactions), so it overrode the standing plan per
"if the request contradicts the plan, the request wins." Added a `#fx`
canvas absolutely positioned exactly over `#chart` inside `.stage`
(`position: relative` on `.stage`, `top:0;left:0;right:0;height:220px` on
`#fx` — same content box as `#chart`, no manual `.75rem` offset needed
because an absolutely-positioned child's containing block is the padding
box of its positioned ancestor). Every "Dispel a lie" click now spawns a
four-pointed shuriken (`drawShuriken`, a canvas path — no image asset) that
flies edge-to-edge across the chart over ~22 frames, entering from a random
side at a random height, rotating, dragging a short fading dot-trail behind
it (`spawnNinja`/`updateAndDrawFx`, folded into the existing rAF `loop()`
rather than a second loop). `prefers-reduced-motion` gets its own path
(`drawStaticNinja`): no flight, just one static shuriken-plus-burst-lines
mark drawn once per click at a random point, matching the existing
reduced-motion pattern of "redraw once per interaction, never animate on
its own." Reset clears both the effect queue and the fx canvas.

Turn 6 shipped in response to "Induce with flame wars" — read against
minormobius's "you can just tell this guy to build it" reply and this
requester's own established pattern (see the profile's eighth build, "Flame
Wars" battle mode on the flame simulator: they ask for versus/competitive
mechanics explicitly, by name, when they want them). Turn 5's own plan (item
5) already flagged this exact trigger and said not to build it speculatively
— this request is that trigger arriving, so it's built now.

Read "flame wars" as "bring over that site's competitive-mechanic pattern,"
not literally — this page is about dispelling misinformation with a
shuriken, not fire, so the feature is named on its own terms ("race a rival
to full purity") rather than importing the other site's name. Added a new
"Versus" section between the breakdown table and the gallery: reaching full
purity (100%) scores the number of "Dispel a lie" clicks it took
(`store.postScore`, `unit: 'dispels'`, `higherIsBetter: false` — fewer is
better, it's a race). A handle box (`kit.handleInput`) below it looks up
that handle's own posted scores via `store.scoresOf` + `store.rank` and
shows their best against yours. Posting needs sign-in (uses the existing
optional sign-in already on the page); looking a rival up never does, since
`scoresOf` reads their public repo unauthenticated.

## The plan (not built yet, roughly in order)

1. ~~Save the gallery to the visitor's own repo~~ — done turn 2.
2. ~~Merge a signed-out session's tiles into an account on sign-in~~ — done
   turn 3.
3. ~~A "clear my saved gallery" control~~ — done turn 3.
4. ~~Composite the gallery into one downloadable image~~ — done this turn
   (turn 4). See note above about the animated-image alternate reading if a
   follow-up asks for it explicitly.
5. ~~A `scoresOf`/leaderboard angle~~ — done this turn (turn 6), as the
   "race a rival to full purity" versus section, scored in dispel-clicks.
   **Not built as part of it, and worth doing next if this line continues:**
   the score only ever fires once, at full purity — there's no way to see a
   rival's score without already knowing their handle, and no "recent
   racers" list (deliberately: the lexicon rule is a leaderboard built from
   named handles only, never a global scoreboard query, so there's no
   `getAll`-style call to add even if asked — the honest answer to "show me
   everyone who's played" is that this factory has no way to do that).
6. **Per-asset dispel** (five small buttons instead of one) if a follow-up
   wants finer control — straightforward, `priceOf`/`ASSETS` already have
   the per-asset state, just needs per-asset `purity` instead of one global
   number.
7. Chart currently normalizes each line independently within its own
   `[floor*0.75, truth*1.1]` band for display — fine for "the noise is
   calming down" but doesn't let you compare absolute scale across assets.
   If a future ask wants that, it needs a real shared axis and probably a
   log scale (HBM at $21/GB dwarfs NAND at $0.085/GB).
8. **Not built:** the sign-in merge (item 2, above) is still untested past
   reading the code carefully — there's no way to exercise an OAuth
   round-trip from this sandbox. Same for this turn's export button: the
   composite math (grid layout, `roundRect` clipping, the download link) is
   correct on paper but has never actually run in a browser. If a
   screenshot/report shows a blank or malformed download, check
   `canvas.toDataURL` isn't throwing on a tainted canvas first — it
   shouldn't be, every source canvas is drawn by this page's own script, not
   loaded from any origin — before suspecting the grid math.

8. **The fx canvas is untested in a browser.** The composite math (edge
   entry, rotation, trail fade, `roundRect`-free path drawing) is correct on
   paper — watch the screenshot for whether the shuriken is visible against
   `--bg-raised` (color is `cssVar('--fg')`, should have plenty of
   contrast) and whether it's positioned over the chart rather than offset
   from it, which would mean the "containing block is the padding box"
   assumption above was wrong for the actual browser.
9. "Tangible" reads like it was answering an earlier question — possibly
   from the harness or a DM not present in the captured thread — about
   whether the requester wanted this abstract (numbers only) or physical
   (something rendered/moving). If a follow-up pushes further in that
   direction (more particles, a bigger burst, a full "cut" animation on the
   gallery tile itself when it's created), that's the next step in this
   line rather than a new one.

## Gotchas

- `kit.crumb(name)` returns the whole `<div class="crumb">…</div>` markup —
  don't hand-roll the breadcrumb, just give it an empty `#crumb` div and
  set `.innerHTML` on load, matching every other tenant.
- CSS custom properties referenced from JS (`var(--dram)` etc.) need
  stripping down to the bare `--dram` before `getComputedStyle(...).
  getPropertyValue(...)` — the small `cssVar()` helper does this; passing
  the `var(...)` wrapper straight through returns an empty string silently.
- The reduced-motion CSS in `tokens.css` only kills declarative
  transitions/animations, not `requestAnimationFrame` — had to add an
  explicit `matchMedia` check and a second code path, per the kit's own
  comment about this.
- The whole inline script had to become `<script type="module">` to
  `import { labPds } from '/_kit/pds.js'`. That's fine — modules run after
  the DOM parses regardless of position, and `kit.js` is a blocking classic
  script loaded in `<head>`, so `window.kit` already exists by the time the
  module body runs. Kept the original IIFE nested inside the module (the
  `import` statement has to be a top-level statement, so it sits just above
  the `(function () { ... })()`, not inside it).
- The crumb was still passing `'data-real'` — a leftover from the directory
  rename in an earlier turn that nobody had touched since. Fixed it to
  `'truth-markup'` while in the file; it's cosmetic (just breadcrumb text)
  but no reason to leave it wrong.
- `sessionStorage`, not `localStorage`, for the pre-signin tile stash — it
  survives the OAuth round trip (same tab) but clears itself once that tab
  closes, which is the right lifetime for "notes to self about to redirect,"
  and it won't leak into a different tab's signed-out session.
- `store.postScore` throws `TypeError` on a non-integer value — `dispelCount`
  is a plain click counter (always an integer) so this is safe here, but it's
  the reason the score is "clicks to full purity" rather than something
  derived from `purity` (a 0..1 float) without rounding it first.
- `postScore` is append-only and calls `ensureScope` itself if the visitor
  only granted the doc scope during the existing gallery sign-in — so the
  first score post after an existing sign-in may trigger a second, separate
  OAuth consent screen for `repo:com.minomobi.lab.score`. That's expected,
  not a bug; didn't request the scores scope upfront in `doSignIn` because
  most visits won't finish a run, and asking for a permission unused that
  session makes the consent screen longer for no benefit.
- `#fx`'s `top:0;left:0;right:0` is relative to `.stage`'s **padding box**,
  not its border box, because `.stage` is the nearest `position: relative`
  ancestor and that's how CSS defines the containing block for an
  absolutely-positioned descendant — so it lines up with `#chart` (also
  inside that padding box) without adding `.stage`'s `.75rem` padding by
  hand. Don't "fix" a perceived offset by adding padding to `#fx`'s inset
  values; if it's actually offset, the bug is more likely `.stage` losing
  `position: relative` or a DPR scaling mismatch between the two canvases.

## Screenshot review (turn 1, no changes made — not re-verified this turn)

The review screenshot caught the chart mid-ramp: only a small cluster of
lines near the left edge of the `.stage` box instead of spanning it. That's
expected, not broken — history fills one point per animation frame up to
`HIST_LEN = 140`, so a screenshot taken within the first ~20 frames only has
that fraction of the width drawn. Canvas sizing and drawing math are both
correct; a visitor watching for a couple of seconds sees it fill normally.
Rest of the page (header, lede, legend, controls, purity bar, table header)
matched the request and rendered cleanly, so nothing was changed.

This turn added the sign-in row, the "signed in as" row, and the save-status
text above the gallery — none of that existed when the screenshot above was
taken, so it hasn't been eyeballed yet. If this turn's own screenshot review
turns up a layout problem there, it's new, not the chart-fill artifact above.

## Screenshot review (quality-qualifier pass)

Same chart-fill issue as above, but this time visibly broken: the stage box
showed only two short line stubs balled up in the bottom-left corner, not
five lines spanning the width — the rest of the box was empty apart from the
three decorative grid lines. Rest of the page (header, lede, legend,
controls, purity bar, breakdown-table header) rendered correctly and
unchanged.

Fixed: history is now pre-filled synchronously (`HIST_LEN` steps) before the
first `drawChart()`/`requestAnimationFrame` call, for both the reduced-motion
and normal paths, so the chart opens full instead of growing one point per
frame from empty. `reducedMotion` no longer needs its own fill loop since the
shared pre-fill covers it; it just skips starting the rAF loop afterward.

## Screenshot review (turn 4)

Not re-verified this turn — the export button and its composite canvas were
added but never seen rendered. Worth a specific look next time a screenshot
comes back: does the button sit sensibly next to "the discarded, kept as
art" heading at narrow widths (it's in a `flex-wrap` row so it should stack,
but hasn't been confirmed), and does it stay disabled-looking (not just
disabled) before any tile exists.

## Screenshot review (turn 6)

Not re-verified this turn — the new "Versus" section (handle input, Compare
button, and the two result lines) was added but never seen rendered. Since
`#versus-result` starts `hidden`, a fresh screenshot should show only the
lede, the input row and an empty status line above the gallery heading — if
the result lines are visible before any comparison, the `hidden` attribute
toggle didn't take. Also worth checking the input+button row wraps cleanly
at 360px wide like the existing sign-in row does (same CSS pattern, but not
independently confirmed for this one).
