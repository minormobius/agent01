# BRIEF — sketch-out

## The ask, in their words

From a Bluesky thread started by @cameron.stream ("Agentic Atmosphere — who's
building this"), arguing that ATProto is trivial-to-use free infrastructure,
that this favours small targeted products over platforms (marque.at as a
registrar example, integrating with wisp.place; praise for the agent
resources / llms.txt writeup), plus a joke from @juniperbevensee.bsky.social
that "revolutionary agent-to-agent comms with portable data" is just Bluesky
DMs. The actual task line: **"sketch out a pitch deck of agentic atproto,
where's the value captured and why is it the users."**

## Acceptance list (from the request, explicit + clearly implied)

1. A pitch-deck *shape* — slides, not a wall of prose. (Implied by "pitch deck".)
2. Makes an actual argument about **where value is captured** in an
   agentic-ATProto stack — not just "ATProto is cool."
3. Makes an actual argument for **why the user** ends up holding that value,
   not the platform/builder.
4. Grounded in the thread's own material: free infra framing, the
   small-targeted-product thesis (marque.at / wisp.place), the llms.txt /
   agent-resources nod, the DM-portable-data joke.
5. Not just assertion — something the visitor can poke at and see for
   themselves, since this is a lab site with real APIs available, not a
   slide export.

## What shipped

A full-bleed slide deck (`index.html`, 8 slides), keyboard/click/swipe
navigable, with:

- A **computed flow diagram** (canvas, curved ribbons from one source into
  three destinations — User / Builder / Platform-or-Protocol), toggled
  between an explicit "closed platform" split and an "open protocol" split.
  The numbers are a named illustrative model (stated on-page as illustrative,
  not measured), but the diagram itself draws from real numbers in an array,
  not a baked PNG — toggling actually recomputes ribbon geometry. Copy-image
  button per profile preference (big, primary-styled).
- A **live demo** ("this is already yours"): `kit.handleInput` on a text box,
  resolves via `kit.bskyGet('app.bsky.actor.getProfile', …)`, and shows the
  visitor's own real follower/follows/post counts and avatar pulled live from
  the AppView — the "free infrastructure" claim made concrete against the
  visitor's own account instead of asserted in prose.
- Slides covering: title, the free-infra claim, the diagram, the live demo,
  the case examples (marque.at/wisp.place/llms.txt, described not cloned),
  the DM joke taken seriously, the "why users" thesis, and a closing slide.

## Decisions

- **No handles quoted on the page.** The task's own framing said not to quote
  people without reason; I named the real *products* (marque.at, wisp.place)
  because they're the concrete evidence for the thesis, but I did not
  attribute opinions to named Bluesky accounts on the public page.
- **Illustrative numbers, said so out loud.** The value-split model (e.g.
  "platform keeps ~60%") is a sketched estimate to make the shape of the
  argument visible, not a cited statistic. The diagram's caption says this
  plainly rather than letting a confident chart imply real data.
- **No persistence/lab.doc/lab.score used.** The ask was for a pitch deck, not
  a tool with saved state; adding "sign the thesis" or similar would be scope
  creep nobody asked for. Kept it to one live read-only demo.
- **Deck navigation over one long scroll.** A pitch deck reads as discrete
  slides; used scroll-snap + arrow keys + dot nav rather than a single
  continuous page, since that's the format the ask names.

## The plan (not built yet)

- Nothing load-bearing is stubbed, but the value-split numbers in the diagram
  are a single hardcoded illustrative model. A next pass could make the
  toggle a *slider* the visitor drags between "closed" and "open" to feel the
  gradient rather than a binary switch — the ribbon-drawing function already
  takes a 0..1 mix argument, so this is a UI change, not a math one.
- Could add a second live-demo stat: fetch the visitor's own recent posts
  (`getAuthorFeed`, already in the allowed method list) filtered through
  `kit.visible()`, to show "an agent could already read/act on these" — cut
  for time, not difficulty.

## Gotchas

- `handleInput`'s `onPick` gives you the typeahead actor object
  (`searchActorsTypeahead` shape), which has **no follower/follow/post
  counts** — only `getProfile` does. Demo calls `getProfile` again after pick.
- Canvas ribbons need `devicePixelRatio` scaling or they're blurry on phone
  screens; sized the backing store at `rect * dpr` and scaled the context.
- Checked against `lab/_profiles/minormobius.bsky.social.md`: handle
  typeahead is mandatory (done), any graph needs a prominent copy-image
  button (done, primary/glow styled per their "big shiny" phrasing), and they
  dislike plain rectangular layouts — the diagram is curved ribbons on a
  circular-node layout, not a bar chart or grid, on purpose.

## Verified with the eyes tools

- [x] Desktop look at slide 1 (title) — clean, crumb + dot nav render, no errors.
- [x] Diagram slide, both toggle states — found and fixed a real bug: the
      canvas drew in a fixed 900×520 logical space but only scaled for
      `devicePixelRatio`, not for the actual CSS render width, so labels past
      ~670px were clipped off the right edge. Fixed by folding
      `rect.width / W` into the transform. Confirmed both "closed platform"
      (15/25/60) and "open protocol" (70/25/5) redraw correctly with the
      ribbons, node circles and labels all inside the canvas.
- [x] Mobile look (390×844, title + diagram + demo slides) — no horizontal
      scroll, canvas scales to the narrow width, toggle buttons and text stay
      legible, tap targets sized.
- [x] `drive`: ArrowDown twice moved slide 1 → slide 3 correctly; dot-nav click
      scrolls and snaps to the exact top of the target slide (needs ~1s for
      the smooth-scroll to settle before the IntersectionObserver updates
      `aria-current` — confirmed correct after waiting).
- [x] `drive`: diagram toggle recomputes ribbon widths and percentages live
      (not a swapped image) — screenshotted both states.
- [x] `drive`: copy-image button — clicked, canvas `toBlob` → clipboard write
      succeeded, button read "copied".
- [x] `drive`: handle typeahead — typed "minomobi", got a live dropdown result
      from the real AppView with avatar; picked it; profile card rendered
      real followers/follows/posts counts (66 / 1 / 1,491) and the real
      avatar image.
- [x] `drive`: bad-handle path — typed a handle that doesn't exist, pressed
      Enter (the non-dropdown submit path), got a clear inline error message
      instead of a silent failure or a stuck spinner.
- [x] Also fixed a real load-order bug found on the first `look`: `kit.js` and
      the page script were both marked `defer`, and in this environment that
      produced a `kit is not defined` ReferenceError on first paint (kit.js's
      execution apparently lagged behind the inline deferred script here,
      contrary to the usual spec ordering). Switched to the kit README's own
      documented pattern — a plain blocking `<script src="../_kit/kit.js">`
      in `<head>`, and the page's own script un-deferred at the end of
      `<body>` — which is a strictly safer ordering and matches what the kit
      docs actually show, rather than something I bolted on. No errors since.
