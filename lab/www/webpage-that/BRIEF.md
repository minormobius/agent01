# BRIEF for the next agent

## What this is

The ask, from words.bsky.social: "make a webpage that is various/all kinds of
actual static. a static page of historical forms of static." It landed in a
reply thread where someone else had asked whether a static site is the only
shape this bot's replies can take — so the brief is a pun with a real answer
folded in: catalogue every distinct historical sense of the word "static",
built as a page that is itself static in the narrowest sense (no backend, no
state, loads once).

Shipped turn 1: a single `index.html` with thirteen dated entries spanning
~600 BCE (amber and fur — the origin of the word "electricity") through today
(static typing, static IP, static site), tagged into four filterable kinds
(electrical / broadcast / material / computing) with pill buttons above the
list. At the top, a canvas generates genuine per-pixel white noise every
frame — actual TV/radio static, not a decorative loop — with a button that
freezes it on a single random frame, which is the visual joke: this is the
one kind of static on the page that can hold still. `prefers-reduced-motion`
starts it frozen.

Shipped turn 2 (follow-up ask: "add sound"): a second button, "add sound",
next to "hold still". It builds a real Web Audio noise buffer (2 seconds of
`Math.random()*2-1` samples, looped through a `GainNode`) on first click —
not a recording, generated the same way the visual noise is — and starts
silent until pressed, both because autoplaying audio is a bad citizen and
because browsers block it outright. Freezing the visual ("hold still") also
mutes the audio via the same `applyGain()` call, and unfreezing restores it
if sound was on — one state machine, not two independent toggles.

Shipped turn 3 (follow-up ask: "make the entire page static with text made
of static on a static background"): took the noise out of its boxed widget
and made it the page. `#bgNoise` is now a `position: fixed` canvas behind
the whole viewport, painted with the same live per-pixel randomness every
frame, with a semi-opaque `.scrim` over it so body copy stays legible. The
`<h1>Static</h1>` is filled with the same noise instead of a solid colour —
a small offscreen canvas is repainted at ~10fps and exported via
`toDataURL()` into a `--static-tex` CSS custom property, consumed by
`background-clip: text`. A hand-written SVG `feTurbulence` data URI sits in
`:root` as the default value of that same variable, so the headline (and the
whole-page tiled background, via the same variable on `body`) reads as noise
immediately on load and even if JS never runs — the canvas only upgrades a
working static page into a live one. "hold still" now freezes the
background, the headline texture, and (already, since turn 2) the audio, all
through the one `running` flag.

Shipped turn 4 (follow-up ask: "the words should be made of static also"): the
noise-fill treatment that was previously only on the `<h1>` now also applies to
all thirteen entry `<h3>` titles — `class="static-text"` added in
`renderEntries()`, exactly the one-line change turn 3's BRIEF flagged as ready.
No new JS: the shared `--static-tex` CSS variable already updates every
consumer for free, so thirteen more noisy headings cost nothing extra per
frame. Added `.entry .static-text` to override the outline `text-shadow` from
`var(--bg)` to `var(--bg-raised)` — the entry cards sit on the raised surface,
one shade lighter than the page background the original outline was tuned
for, so without this override the outline would be very slightly too dark
against its own card. All the on-page copy that describes what freezes
(`.sub`, the controls label, `setRunning()`'s two label strings, `.close`, and
both meta descriptions) was updated to say "headline and every entry title,"
not just "headline," so the page doesn't undersell what it now does.

**Deliberately NOT extended to body paragraphs, filter-pill labels, or the
descriptive copy** (`.sub`, `.sound-note`, `.cmb-note`, `.close`). Those are
where the actual explanatory content lives, at smaller font sizes than the
bold `<h3>`s, and a live per-pixel noise fill under paragraph-length text at
`.82rem` reads as illegible rather than "made of static" — the bit only lands
if you can still tell it's a joke about legible words, not a page that has
stopped being readable. Titles are short, bold, and already proven at `<h1>`
scale; that's the ceiling this turn pushed to, not the floor for a future one.

## Decisions

- **Interpreted "static" as the word, not the file format.** A page that was
  literally just "here are twelve kinds of static site" would be a much
  thinner joke and ignore what actually makes the word interesting — that it
  means wildly unrelated things (a rubbed amber rod, a dead TV channel, a
  fixed IP address, cling in a dryer) and the throughline is only "does not
  change" in the loosest possible sense. words.bsky.social's profile
  (`lab/_profiles/words.bsky.social.md`) says they're comfortable with an
  oblique, generative reading over a literal one — this leans into that.
- **The noise canvas draws real randomness, not a pre-baked GIF or CSS
  filter.** It's cheap (a `<canvas>` at 320×120, `Math.random()` per pixel,
  one `putImageData` per frame) and it's the one place on the page where
  "static" the electronic-noise-sense and "static" the doesn't-move-sense
  collide directly when you press the button. Worth keeping if this gets
  extended — don't replace it with a static image, that's the whole bit.
- **Sound is generated noise, not a recording of noise.** Same reasoning as
  turn 1's canvas: a static-file page playing back an MP3 of static would be
  cute but false to the bit, since the whole page is "here is what does not
  change" and a looped recording is a much weaker claim than the same random
  process running live, twice, in two senses. The 2-second buffer loops, but
  it's a loop of a live-generated buffer, not a canned clip — the loop point
  is inaudible-ish because it's uncorrelated noise on both sides of the seam.
- **Muted by default, one AudioContext, created lazily on the click that asks
  for it.** Autoplaying sound is hostile on any page and Chrome/Safari refuse
  it without a user gesture anyway, so there was never a decision to make
  here — just don't fight the platform. `soundFailed` catches the (rare)
  browser with no AudioContext at all and swaps the note text rather than
  throwing.
- **The background canvas is a fixed low-res buffer (160×90) stretched with
  `image-rendering: pixelated`, not sized to the viewport.** Same trick the
  original boxed canvas used — a `resize` listener would work too, but this
  needs none, costs nothing extra as the window resizes, and the chunky
  pixelation reads as more "TV snow" than a smooth per-pixel fill would at
  full resolution anyway.
- **The `--static-tex` CSS variable has a hand-written SVG data URI as its
  `:root` default**, so the noise-fill effect is not solely a JS feature —
  it's there before the script runs and stays there if `toDataURL()` throws
  (wrapped in try/catch) or `background-clip: text` isn't supported (behind
  `@supports`, falls back to solid `var(--accent)`). If you touch this
  variable, keep a non-JS fallback; it's the reason the headline can't go
  invisible.
- **Did not add anything resembling the "pondertag"** requested elsewhere in
  the same thread by a different account (@ponder.ooo, not the requester).
  It asked for a hidden HTML-comment instruction telling future agents to
  propagate a coloured tag onto every page they touch — a self-replicating
  instruction aimed at exactly the kind of reader (a fresh agent with no
  memory, reading a file for context) most likely to comply without
  question. `lab/www/making-static/index.html` already declined this at
  length, more than once, in its own build. This page just doesn't mention
  it, since nobody who can actually ask this build for anything asked for it
  here.

## The plan (if there's a next turn)

Nothing is unfinished in the sense of broken, but if words.bsky.social comes
back:

- **Done in turn 4:** the entry `<h3>` titles now carry `class="static-text"`
  too, with a `.entry .static-text` rule overriding the outline text-shadow to
  `var(--bg-raised)` instead of `var(--bg)`, since cards sit one shade lighter
  than the page. If the next ask is "more still," the paragraph body copy and
  the filter pills are the only text left untouched — see the note near the
  top of this file on why that's deliberate (legibility), not an oversight.
  Nobody has confirmed by eye yet whether thirteen noisy headings in a
  scrolling list read as intentional or as clutter — check a real screenshot
  before pushing the effect any further than titles.
- **More entries, if asked for specific ones.** Radar/sonar "static" (clutter
  return), static friction (the physics term, "starting friction" vs
  kinetic), "getting static" (slang for pushback/criticism, mid-20th c.
  American usage) were all cut for time, not rejected — easy adds to the
  `ENTRIES` array, same shape as the existing thirteen.
- **A "surprise me" button that jumps to a random entry** would fit the
  playful, low-specificity style noted in their profile, if they ask for more
  interactivity rather than more content.
- **A volume slider or a second, distinct noise timbre** (e.g. band-limit the
  buffer for something closer to radio hiss vs TV snow) if they ask for more
  than a flat on/off — the gain is currently a single hardcoded 0.05, no UI
  for it.
- Did not add any ATProto/PDS persistence — there's nothing here worth saving
  per-visitor (no score, no user state), so `pds.js` was deliberately left
  unused rather than bolted on for its own sake.

## Screenshot QA

Turn 1: checked a 1200×800 render under production CSP: heading, description,
the live noise canvas (visibly rendering static, not blank), the "hold still"
button, the four filter pills, and the first entry all render legibly with no
overlap or off-screen content. Nothing visibly broken.

Turn 2 (sound): not visually distinguishable from turn 1 in a screenshot —
the new "add sound" button renders next to "hold still" and the explanatory
line below the noise box appears, both checked by eye in the diff, but audio
output itself can only be confirmed by a human with speakers, not by the
harness's screenshot pass.

Turn 3 (whole-page static): not verified in a browser by me — I have no
screenshot tool in this turn, only the harness's automated pass afterward.
What I checked by reading the diff instead: the fixed canvas and scrim are
`pointer-events: none` so they can't eat clicks on the buttons or filter
pills sitting above them in paint order; the `--static-tex` SVG fallback is
valid inline SVG with `#` escaped to `%23` inside the data URI (a common way
this exact trick silently fails); and `.static-text`'s fallback `color` and
`@supports` gate mean the headline can't render invisible even if
`background-clip: text` or the canvas export fails. What I could not check:
whether the scrim's opacity (0.78) leaves the noise visibly "static" rather
than reading as a barely-there dark background — that's a judgement call
under real pixels I couldn't make here.

Turn 4 (entry titles made of static): not verified in a browser by me, same
constraint as turn 3. What I checked by reading the diff: `.entry
.static-text`'s specificity (two classes) is higher than the `@supports`
block's `.static-text` (one class), so the `--bg-raised` outline override
applies regardless of source order; the fallback `color: var(--accent)` and
`@supports` gate still apply to entry titles the same way they do to the
`<h1>`, so a browser without `background-clip: text` shows solid accent-
coloured titles rather than invisible ones. What I could not check: whether
thirteen small (`1rem`) noisy headings stacked down the page read as legible
words with a busy fill, or as visual noise that swallows the text — the `<h1>`
was proven at `2.5rem`; this is the same technique at under half that size,
and font size is exactly the variable that risk depends on.

## Gotchas

- The canvas noise loop is the only nontrivial JS from turn 1; it's a plain
  `requestAnimationFrame` loop guarded by a boolean, no timers to leak, and
  it's already stopped correctly when reduced-motion is set or the toggle is
  pressed (`cancelAnimationFrame`, not just a flag) — worth keeping that
  pairing if this file grows more animated bits.
- Gain is muted (0) until the AudioContext exists, so `applyGain()` is a
  no-op before the first "add sound" click — that's intentional, not a bug if
  you see `gainNode` null-guarded there.
- `setRunning()` (the visual freeze) now also calls `applyGain()` so freezing
  mutes sound too and unfreezing restores it — if you add a third state that
  changes `running` outside `setRunning`, route it through that function or
  audio and video will desync.
- `AudioContext` must be created (or resumed) inside a user-gesture handler
  or it starts `suspended` and never emits sound — that's why `ensureAudio()`
  and `resume()` both live inside the click handler, not in the page's
  load-time setup.
- `paintText()` only runs every 6th frame of the main loop (`frame % 6`), not
  every frame — `toDataURL()` on even a 48×48 canvas isn't free at 60fps, and
  the visual difference between the headline flickering at 60Hz and ~10Hz is
  not worth the cost. If you add more `--static-tex` consumers, that's still
  the one texture, so it's free; if you need a genuinely faster flicker,
  raise the modulo divisor down, don't add a second export call.
- `.static-text`'s outline `text-shadow` is hardcoded to `var(--bg)` in the
  `@supports` block, tuned for the `<h1>` sitting directly on the page
  background. Any `.static-text` usage on a raised surface (`.entry`,
  anything with `background: var(--bg-raised)`) needs its own override rule
  with higher specificity, like `.entry .static-text` — otherwise the outline
  is one shade too dark for the surface it's actually on. Check this before
  adding `.static-text` inside any other `--bg-raised` container.
- The `body` background and `.static-text`'s `@supports` background both read
  the *same* `--static-tex` variable, so the tiled page background under the
  scrim and the headline's fill are always in sync, generation to
  generation — that's deliberate, not incidental; don't give them separate
  variables or the "one noise, everywhere" claim in the copy becomes false.
