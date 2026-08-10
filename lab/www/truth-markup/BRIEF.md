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

Turn 7 shipped in response to "There's a squirrel and maybe Mobius is laying
underneath the tree tops" — no squirrel, no Mobius, no tree tops concept
exists anywhere on this page, and unlike turn 5's "particled ninja lie
dispeller" (concrete, actionable, overrode the plan) this names nothing
buildable. Read the same way turns 2/3 were: a reaction/riff, not an ask, so
per the standing instruction it worked the plan rather than inventing
something to match "squirrel."

Built plan item 6: per-asset dispel. Each row of the breakdown table now has
its own small "Go" button (`asset-dispel`, event-delegated off `tbody`) that
dispels *that* asset specifically, alongside the existing "Dispel a lie"
button which still does a random weighted pick. This required turning
`purity` from one global 0..1 number into `a.purity` per asset — `priceOf`,
the purity bar, `youText`/`maybePostScore` (versus scoring) and the
full-purity check (`allFull()`, requires every asset at 1, not just the
average) all now read per-asset state; `overallPurity()` (the average across
all five) drives the single progress bar and label, which is unchanged from
the visitor's point of view. The global button's weighting changed from
"proportional to total span" to "proportional to *remaining* span" so an
asset already finished off by its own button stops eating picks meant for
the others. `dispelCount`/scoring is unaffected — it still increments once
per dispel, from either control, so the versus race is unchanged.

Turn 8 shipped in response to "Push it to the fullest" — no new concept named
on the page, same shape as turns 2/3/16/17 (per the profile: an opaque
one-liner that doesn't parse as a literal instruction and doesn't point
anywhere else), so it worked the plan rather than guessing a feature. Built
plan item 7: the chart now shares one y-axis across all five assets instead
of each line normalizing independently within its own `[floor*0.75,
truth*1.1]` band. Added `AXIS_MIN`/`AXIS_MAX` (the min floor and max truth
across all five assets, each with the same 0.75/1.1 padding the old per-asset
bands used) computed once at load from the static `ASSETS` table, and switched
the normalization in `drawChart` to `(Math.log(price) - LOG_AXIS_MIN) /
(LOG_AXIS_MIN - LOG_AXIS_MAX)`* — log rather than linear, because HBM
(~$21/GB) and NAND (~$0.085/GB) are almost 250x apart and a linear shared
axis would flatten NAND to a barely-visible line at the bottom.

*(written as `(LOG_AXIS_MAX - LOG_AXIS_MIN)` in the actual code — see below.)

This is a real behavior change, not just internal math: NAND now sits in a
narrow band near the bottom of the chart and HBM near the top, for the whole
run, rather than each line individually filling the full height of the
`.stage` box. That's the intended reading of item 7 ("doesn't let you compare
absolute scale") — the tradeoff is that a visitor watching only the NAND line
sees less vertical travel than before, even though the same proportional
noise/dispel movement is still there (log scale preserves proportional
change, just compressed by NAND's small absolute range). Left everything else
on the page untouched — this was a pure math swap inside `drawChart`, no new
UI, no new controls.

Turn 9 shipped in response to "Demand for truths go up as supply increases" —
unlike turns 2/3/7's opaque riffs, this names the site's own core concept
(price, supply, demand) directly and proposes a concrete inversion of normal
econ-101 (more supply usually cools price; here, more supply of dispelled
truth should raise demand for more of it), so it was read as a direct ask and
built now rather than treated as a reaction to work the plan against.

Added a global `demandFactor()` = `1 + overallPurity() * DEMAND_STRENGTH`
(`DEMAND_STRENGTH = 0.4`), multiplied into every asset's price in `priceOf()`
after the existing floor→truth interpolation and noise. Because it reads
`overallPurity()` (the average across all five) rather than each asset's own
`a.purity`, dispelling lies about DRAM now nudges NAND's price up a little
too, even before anyone has touched NAND specifically — one market-wide
restructuring event, matching this page's existing "one lever, not five"
framing (see Decisions above). At full purity every price sits ~40% above its
"true value," not capped at it — "true value" is now a floor the market can
run past, not a ceiling. Surfaced as a new line under the purity bar
("demand for truth: +N% above true value") and one sentence each added to
the lede and footer — the footer sentence is the honest-labelling pattern
this requester responds to (see Decisions): stating plainly that this is a
deliberate inversion of the normal rule, not an error.

`AXIS_MAX` (the shared log-scale ceiling from turn 8) had to move from
`truth * 1.1` to `truth * (1 + DEMAND_STRENGTH) * 1.05`, since the old 10%
headroom no longer covers a price that can run 40% over truth at full
purity — worked out algebraically (max price occurs exactly at `allFull()`,
where every `a.purity` and `overallPurity()` are simultaneously 1, so the
provable worst case is `truth * (1 + DEMAND_STRENGTH)` with no need to search
over partial-purity states), not just bumped until it looked right.

Turn 10 shipped in response to "It's gr8" — a positive reaction naming nothing
on the page (no "session instances"/"squirrel"-style riff either, just a
compliment), the same shape as turns 2/3/7/8's opaque one-liners, so it worked
the plan rather than inventing a feature to match "gr8."

Built the follow-up named at the end of plan item 7 (turn 8's shared log-axis
work): a one-sentence caption under the legend, in HTML (not painted on
`#chart` — the standing "no text on the canvas" rule), saying plainly that all
five lines share one log-scale axis and why that matters (NAND's cent-level
moves vs. HBM's ten-dollar moves would otherwise read as "NAND is just flat").
Picked this over item 9's ninja-effect follow-up or item 10's demand-decay
follow-up because both of those are explicitly gated on "if a future request
pushes further in that direction" — a request specific to that line — and "gr8"
isn't specific to anything, so the plan item with no such gate (item 7's) is
the one that's actually next in line rather than waiting on a trigger that
hasn't arrived.

Pure addition: one `<p class="chart-note">` between the legend and the
controls row, `.legend`'s own `margin-bottom` shrunk from `1.5rem` to `.5rem`
so the two sit closer together as a unit and `.chart-note` carries the
`1.5rem` bottom margin instead — same total spacing before the controls row,
just split between two elements now. No JS touched.

Turn 11 shipped in response to "Center the dispel button and make it flash like
lightning for every instance" — a direct, concrete ask naming two specific
changes (unlike turns 2/3/7/8/10's opaque riffs), so it was built now rather
than worked off the plan.

Two changes, both pure CSS/markup/JS, no new state:

1. **Centered the dispel button.** The `.controls` row used to lay the global
   "Dispel a lie" button, "Reset the record" and the purity bar out side by
   side, left-aligned as a group. Split it into `.dispel-row` (just the
   button, `justify-content: center`, its own row) sitting above
   `.controls-secondary` (reset + purity bar, same flex-wrap row as before).
   Reads as: the one button that matters most is now the visual centerpiece,
   everything else sits secondary underneath it.
2. **Lightning flash on every dispel control.** Read "for every instance" as
   "every button that can trigger a dispel" — the global button *and* each of
   the five per-asset "Go" buttons in the breakdown table, not just the first
   click. Added a `lightning-flash` CSS keyframe (white glow via `box-shadow`
   + `filter: brightness()`, no colour dependency so it reads the same
   regardless of which asset's row it's on) and a `flashLightning(el)` helper
   that toggles the class with a forced reflow so a rapid double-click
   restarts the animation instead of no-opping. Called from both click sites:
   the global `dispelBtn` handler and the delegated `.asset-dispel` handler in
   `tbody`'s click listener — both already had a direct reference to the
   button that was actually pressed, so no new lookup was needed.

**No separate reduced-motion branch was needed for the flash**, unlike the
ninja fx or the chart. `tokens.css`'s global rule caps every CSS
`animation-duration` to `.01ms` under `prefers-reduced-motion: reduce`, and
this is a one-shot, interaction-triggered `@keyframes` animation (not a
self-running loop) — exactly the case that rule is written to leave alone. So
under reduced motion the flash still fires but resolves to its end state
almost instantly instead of visibly animating, which matches the site's
existing pattern of "redraw once per interaction, never animate on its own"
without writing a second code path for it.

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
6. ~~Per-asset dispel~~ — done turn 7. Each breakdown-table row has its own
   "Go" button; the global button still exists and picks randomly, weighted
   by *remaining* gap among assets not yet full.
7. ~~Shared, comparable axis across assets~~ — done turn 8, as a shared
   log-scale y-axis (`AXIS_MIN`/`AXIS_MAX`, fixed once from all five assets'
   own floor/truth values). ~~Axis legibility caption~~ — done turn 10: one
   `<p class="chart-note">` under the legend, plain HTML, explaining the
   shared log axis in one sentence.
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
10. ~~Demand rises with supply of dispelled truth~~ — done turn 9, as a
    global `demandFactor()` pushing every price up to ~40% past "true value"
    at full purity. **Not built, worth doing next if this line continues:**
    demand currently only ever rises (it's a pure function of `overallPurity`,
    which never decreases except on Reset) — there's no cooling-off, no sense
    that unmet demand could fade if a visitor stops dispelling for a while.
    If a request asks for that, it needs its own decaying state variable
    (something like `demandMomentum`, ticked down slowly in the rAF loop,
    separate from `overallPurity` which should probably stay a pure function
    of dispel state) rather than turning `demandFactor` itself into something
    with memory.

## Screenshot review (turn 7)

Not re-verified this turn — the new fifth table column (per-row "Go"
buttons) has never been rendered. Worth a specific look next time a
screenshot comes back: does the table stay one row's worth of height at
narrow widths (`table.breakdown td:last-child { width: 1%; white-space:
nowrap }` is meant to shrink that column to just fit the button, letting the
other four compress, rather than wrapping or forcing horizontal scroll at
360px), and is each button actually ≥44px tall (`min-height: 44px` on
`.asset-dispel` — should be, but table cell padding/line-height stacking
with it hasn't been seen in a browser).

## Screenshot review (turn 8)

Not re-verified this turn — the shared log-axis math has never been rendered.
Worth a specific look next time a screenshot comes back: the five lines
should sit in distinct, mostly non-overlapping vertical bands ordered by
absolute price (NAND lowest, then DRAM/transfer overlapping in the middle,
then supply, then HBM highest), not all still spanning the full chart height
independently — if every line still fills the box top-to-bottom the same as
before, the shared-axis math isn't taking effect (check `LOG_AXIS_MIN`/
`LOG_AXIS_MAX` are computed after `ASSETS` exists and before first
`drawChart()` call, and that the pre-fill loop at the bottom of the script
runs after both are defined).

## Screenshot review (turn 9)

Not re-verified this turn — the demand line under the purity bar and the
demand-inflated chart ceiling have never been rendered. Worth a specific look
next time a screenshot comes back: at 0% purity `demand-pct` should read
`+0%` (not blank or `NaN%`, which would mean `demandPctEl` was queried before
the DOM element existed — it's declared right after `purity-fill` in the
script, same pattern), and the five chart lines should sit lower in the
`.stage` box than turn 8's screenshot showed, since `AXIS_MAX` grew ~34%
(`1.1` → `1 + 0.4) * 1.05 = 1.47`) — if they still hug the top of the box,
the axis-headroom math isn't taking effect.

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

## Screenshot review (turn 10)

Not re-verified this turn — the new chart-note caption has never been
rendered. Worth a specific look next time a screenshot comes back: it should
sit as a single muted line directly under the legend, wrapping normally at
360px wide (it's a plain `<p>` in the normal flow, no special narrow-width
handling written), and it should read clearly against `--bg` since it's
outside `.stage` (not drawn over `--bg-raised` like the chart itself).

## Screenshot review (turn 11)

Not re-verified this turn — the centered dispel button and the lightning flash
have never been rendered. Worth a specific look next time a screenshot comes
back: the "Dispel a lie" button should sit centered above "Reset the record"
and the purity bar (not still in a single left-aligned row with them — if it
is, `.dispel-row`/`.controls-secondary` didn't take), and a screenshot taken
mid-click should show a bright white glow around whichever button was pressed
(the `.lightning-flash` `box-shadow`/`filter` — a static screenshot has good
odds of missing a .55s animation entirely, so absence of a visible glow isn't
necessarily a bug; a *persistent* glow that never fades, or a glow with the
wrong colour cast, would be).

## Screenshot review (turn 6)

Not re-verified this turn — the new "Versus" section (handle input, Compare
button, and the two result lines) was added but never seen rendered. Since
`#versus-result` starts `hidden`, a fresh screenshot should show only the
lede, the input row and an empty status line above the gallery heading — if
the result lines are visible before any comparison, the `hidden` attribute
toggle didn't take. Also worth checking the input+button row wraps cleanly
at 360px wide like the existing sign-in row does (same CSS pattern, but not
independently confirmed for this one).
