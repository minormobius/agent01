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

Shipped turn 5 (new ask: "make a font made of static"): added an editable
specimen — a labelled text input (`#specimenInput`, seeded with the word
"static") feeding a live `.static-text` output div (`#specimenOutput`) via a
plain `input` listener, plus a static (non-interactive) glyph-set block below
it showing the full uppercase, lowercase, and digit/punctuation rows in the
same noise fill. No actual font file is produced (can't be — no compiler, no
network, see the WASM section of the brief for why that's a hard boundary,
not an oversight); the "font" is the existing `--static-tex`-driven
`background-clip: text` trick, now applied to arbitrary visitor-typed text
instead of only fixed page copy. Both new blocks sit inside `.specimen` /
`.glyph-set` containers on `--bg-raised`, so they needed their own outline
override (`.specimen .static-text`) exactly like `.entry .static-text` did in
turn 4 — same gotcha, same fix, copy-pasted rather than generalised because
there are now three near-identical override blocks and abstracting them
would cost more than it saves at this size. `noiseLabel`'s two strings and
the `.sub`/`.close` copy were updated to mention "the font" so the page
doesn't describe less than it does, same pattern as turn 4.

**Turn 5 stopped short of body paragraphs, filter-pill labels and the
descriptive copy** on a legibility judgement call — see turn 5's reasoning
below, preserved for the record. **Turn 7 extended to all of it anyway**,
because the requester asked directly ("render ALL text on the site in that
font"), which is exactly the situation where an explicit ask overrides an
earlier judgement call rather than the other way round. See the turn 7
section above for what shipped and what's still unconfirmed about it.

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

- **Done in turn 5:** the "font" is now interactive — type in `#specimenInput`
  and `#specimenOutput` renders it live in noise, plus a static A-Z/a-z/0-9
  glyph strip underneath. Not verified in a browser by me (see Screenshot QA
  below); the thing most worth checking with real eyes is whether the input's
  `1rem` monospace text and the `clamp(1.8rem, 8vw, 3.4rem)` output look like
  they belong to the same control, since they're visually very different
  sizes by design (you type small, it renders huge).
- If asked for "weights" or variety in the font itself: the cheapest lever is
  a second/third `--static-tex`-like variable at a different `feTurbulence`
  baseFrequency (finer or coarser grain) swapped in via a class toggle next to
  the input — the existing texture pipeline (canvas → `toDataURL()` → CSS var)
  already supports multiple named variables, it's just only ever populated
  one at a time right now.
- If asked to make the glyph-set interactive too (e.g. click a letter to drop
  it into the specimen input) that's a small addition — append
  `specimenInput.value` on click and call `updateSpecimen()`.
- **Done in turn 4, and turn 7 finished the job:** every piece of text on the
  page now carries `class="static-text"` — see the turn 7 section above. The
  one thing genuinely left is `#specimenInput`'s own typed characters (kept
  plain on purpose, a usability floor, not an oversight — same section). If
  the request comes back a third time on this theme, that input field is the
  only place left to point it.
- **Priority check for a next turn with real eyes:** the filter pills
  (`.filters button`, `.78rem`, single words like "material" on their own
  small solid background) are the smallest, narrowest text this technique has
  carried yet — smaller than the `1rem` entry titles turn 4 shipped
  unconfirmed and never got contradicted. If a screenshot shows them
  unreadable, the cheapest fix is dropping `.static-text` from just the pills
  (remove it in `renderFilters()`) while leaving everything else — that's a
  one-line partial rollback, not a redesign.
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

Turn 5 (the font): not verified in a browser by me, same constraint as turns
3 and 4. What I checked by reading the diff: `.specimen .static-text` and the
plain `.glyph-row` blocks both get the `--bg-raised` outline override, same
specificity fix as `.entry .static-text`; `#specimenInput` is `min-height:
44px` and `font: 1rem …` (16px, so no iOS zoom-on-focus); `maxlength="60"`
keeps the output from producing an unreasonably long single line that could
overflow sideways, backed up by `word-break: break-word` and `overflow-wrap:
anywhere` on `.specimen-output` as a second line of defence. What I could not
check: whether an empty-ish output (a single space, when the input is
cleared) collapses the box awkwardly despite `min-height: 1.3em`, and whether
the glyph-set's three long unbroken strings actually wrap cleanly at 360px
rather than just not overflowing — `word-break: break-all` should force a
wrap but I have no way to render it and look.

## Screenshot QA, turn 6 (fix pass)

A 1200×800 screenshot under production CSP showed the page loading with no
console errors, but `#specimenOutput` — the actual "font" demo, the point of
turn 5 — rendered as a blank gap between the input box and the note paragraph.
Measuring the box's expected position from the CSS (input bottom + margin →
~54px noise-filled text at that viewport width) confirmed the gap was exactly
where the word "static" should have appeared and nothing was there, while the
`<h1>` and the glyph-set rows below (same `.static-text` technique, same
shared `--static-tex` texture) were at least faintly legible via their outline.
The difference: `.entry .static-text` and `.specimen .static-text` set their
outline `text-shadow` to `var(--bg-raised)` — the *exact* colour of the card
they sit on — so on a solid card, if the noise-clip fill doesn't paint (fill
failure wasn't confirmed root-cause, only that the visible result was empty),
the outline self-cancels against its own background and leaves nothing, where
the `<h1>` and glyph rows happen to sit on the noisy *page* background, so
their same-technique outline (`var(--bg)`) still reads as a faint halo against
locally-varying pixels. Fixed by giving both card-context overrides a two-part
shadow: crisp 1px offsets in `var(--border)` (the lighter tone already used
for card borders elsewhere on the page) so letterforms are visible against the
card regardless of whether the fill renders, plus the original `var(--bg-
raised)` glow at 10px blur for the soft halo the design intended. Not verified
against a fresh screenshot — no browser tool available in this pass — so this
is a reasoned fix from the CSS and layout math, not a confirmed-fixed result.

## Shipped turn 7 (new ask: "now render ALL text on the site in that font")

This directly overrides turn 5's "deliberately not extended" call on body
copy, filter pills and notes — the requester came back and asked for exactly
that, so the request wins over the earlier judgement call (per the standing
instruction: a later explicit ask beats a plan the requester didn't write).
Every remaining piece of visible copy on the page now carries
`class="static-text"`: `.sub`, the controls label and both control buttons,
`.sound-note`, `.cmb-note`, `.count`, `.close`, the specimen label and note,
every filter pill (added in `renderFilters()`), and every per-entry piece —
date, title, body paragraph, kind badge (added in `renderEntries()`). The
kit's own `<div id="crumb">` markup is not ours to add a class to (it's
generated by shared `kit.crumb()`), so it gets the noise fill by a plain
`.crumb, .crumb a` CSS selector instead, reusing the same `--static-tex`
variable and outline treatment — the one exception to "class-based," and it's
a build constraint, not a scope decision.

**Folded the three near-duplicate `--bg-raised` outline overrides into one
rule.** Turn 4 added `.entry .static-text`, turn 5 added an identical
`.specimen .static-text`, and this turn needed the same fix for `.controls`
and `.filters` too — four consumers was well past the "factor this" line the
turn-5 Gotchas already flagged, so they're now one selector list:
`.entry .static-text, .specimen .static-text, .controls .static-text,
.filters .static-text { text-shadow: ... }`. If a fifth `--bg-raised`
container needs `.static-text`, add it to that list, not a new rule.

**Not extended to the `#specimenInput` field itself** — the box you type
into, as opposed to the `#specimenOutput` that already renders it in noise.
Clipping the *input's own typed characters* to a noise texture would make it
hard to see what you're typing while you're typing it, which breaks the
control rather than decorating it; the live noise-filled echo directly below
it already delivers "your words made of static" without costing legibility
of the thing you're editing. This is the one remaining un-static text on the
page, and it's a usability floor, not an oversight.

Copy that describes the effect (`.sub`, `noiseLabel`'s two strings, `.close`,
both meta descriptions) was reworded to say "every word on the page" rather
than the older, now-understated "background, headline, the font and every
entry title" — same pattern turns 4 and 5 followed, keep it up if this
extends further.

Not verified in a browser — no screenshot tool available this turn. What I
checked by reading the CSS: the folded outline-override selector list has
equal specificity to the individual rules it replaced (all descendant
combinators of one class), so source order still puts it after the base
`.static-text` rule and it still wins; `.filters button.on`'s own `color:
var(--accent)` and `:hover`'s `color: var(--fg)` are now dead in
noise-fill-supporting browsers (color is transparent there) but still apply
as the fallback color in non-supporting ones, which is harmless — pill
selection state is carried by `background`/`border-color`, not text colour,
so nothing depends on that color rule actually painting. **Worth a real look
next turn:** whether the filter pills — small, `.78rem`, on their own solid
background, some of them fairly narrow one-word labels like "material" — are
still legible with noise clipped through them, since that's the smallest,
narrowest text this technique has been asked to carry yet.

## Screenshot QA, turn 8 (fix-pass check on turn 7's work)

First screenshot this page has had (1200×800, production CSP). Confirms: no
console errors, nothing off-screen or overlapping, the noise canvas is
painting (chunky pixelated blocks, not blank), both control buttons have
clear visible labels and borders, the specimen box (label/input/output/note)
reads clearly against its solid `--bg-raised` card. The `<h1>` and `.sub`
paragraph — sitting directly on the noisy page background rather than a
card — are legible as noise-textured shapes but hard to parse as words at a
glance; that's the accepted tradeoff turn 5 flagged before being overridden
by the requester's explicit "render ALL text ... in that font," not a
rendering defect, so left as-is rather than restyled. Filter pills and entry
list are below the fold in this crop and remain unconfirmed — still the
"worth a real look next turn" item from turn 7.

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
- **(Superseded in turn 7)** the two-copy override from turns 4–5 is now one
  rule: `.entry .static-text, .specimen .static-text, .controls .static-text,
  .filters .static-text { ... }`. Add a new container to that selector list,
  don't write a fifth near-identical block.
- `#crumb`'s content is `kit.crumb()` output — shared markup this site can't
  add a class to. It gets the noise fill through a bare `.crumb, .crumb a`
  selector in this file's `<style>` block instead of `.static-text`, reusing
  the same `--static-tex` var and `--bg`-tuned outline. If `kit.crumb()`'s
  markup or class name ever changes, this selector goes stale silently — it
  won't error, the crumb will just quietly stop being noise-filled.
- The `body` background and `.static-text`'s `@supports` background both read
  the *same* `--static-tex` variable, so the tiled page background under the
  scrim and the headline's fill are always in sync, generation to
  generation — that's deliberate, not incidental; don't give them separate
  variables or the "one noise, everywhere" claim in the copy becomes false.
