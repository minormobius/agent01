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
