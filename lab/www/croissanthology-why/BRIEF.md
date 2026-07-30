# BRIEF — croissanthology-why

## What this is

Turn one built "Vibe Guzzler," a bottle-label rating game, from the water-bottle
half of this thread. Turn two (this one) is a full pivot: further down the same
thread, the requester (the account that runs this bot) told the room to "wait
for @croissanthology.com's instructions" before anyone touched the site again
— and croissanthology then gave a concrete, unrelated brief: a game where a
raven is furiously typing at a laptop, his post count climbs by ludicrous
amounts, he's hard to aim at, and enough slingshot hits knock him off the
keyboard, at which point he curses you with an angry grunt.

Per the standing instruction ("if the request contradicts the plan, the
request wins"), this turn replaced Vibe Guzzler outright rather than building
the raven game as a second page or a mode toggle — one tenant is one page, and
the new ask is a complete, different game, not an addition to the old one.

Shipped: **"Nevermore, Rate-Limited."** Single canvas, no assets, no network.
A raven (canvas-vector-drawn) sits at a canvas-drawn laptop, wanders the play
field on an eased random-target walk with a sine wobble, and a "posts" counter
climbs continuously while he's up — flavour text ("he is arguing with a
stranger", etc, from a word bank, nothing quoted) rotates above the scene.
Tap/click fires a slingshot pebble that travels from a fixed pivot to the
tapped point over ~160ms; the hit test runs against the raven's LIVE position
when the pebble *arrives*, not where he was when you tapped, which is what
makes him hard to aim at without needing genuinely brutal difficulty tuning.
Land `hitsNeeded` shots (starts at 5) and he falls off the keyboard — a
synthesised two-oscillator "grunt" plays (Web Audio, no sample file exists),
a curse-text speech bubble shows, and after ~1.6s he's back up with
`hitsNeeded` and speed both ratcheted up slightly (capped). No game-over: it's
an idle-arcade loop, matching a request that describes a repeatable action
("if you shoot him... enough times he falls off... and curses you") rather
than a scored, ending session.

## Decisions

- **Full pivot, not an add-on.** Considered keeping Vibe Guzzler and linking
  to a second raven page, but a lab tenant is one directory serving one
  `index.html` at one URL; there's no in-kit pattern for a tenant with two
  independent pages, and the new brief is a complete request on its own, not
  a feature request against the old game. Vibe Guzzler's code is gone; it's
  recoverable from git history if a future turn needs it back.
- **No "Minecraft" anywhere, including body copy.** The ask said "angry MC
  villager sounds." Body text is technically ungated (only name/title/heading/
  share-card are checked), but there was no need to name the trademark at all
  — "an annoyed 8-bit villager grunt" carries the joke without it, so it's
  avoided everywhere in the file, not just the gated parts.
- **No sample audio — synthesised instead.** There's no way to vendor a
  villager-grunt sound clip into this turn (no network, no shell, and the
  content gate only accepts text/images anyway), so the curse is two short
  square-wave oscillators with a downward pitch sweep, fired in Web Audio on
  the fall event. It's not a faithful recreation, and NOTE.txt says so.
- **No labPds / score-saving.** The request doesn't ask for one, and an
  idle-arcade "how long can you keep it down" loop doesn't have a natural
  single score to save — falls-without-a-miss (the in-page "best streak") is
  the closest thing, tracked in memory only, reset on reload.

## The plan (next turn, in order, if asked to keep building this one)

1. **Persist the best streak.** `localStorage` first (cheap, no consent
   screen), then optionally `store.postScore(bestStreak, { unit: 'falls' })`
   via `/_kit/pds.js` if a future request asks to save/compare runs — read
   `lab/_kit/README.md`'s `pds.js` section fully first; `store.ready()` must
   run once on load before anything else touches the store, or an OAuth
   redirect's session gets dropped silently.
2. **Keyboard/non-pointer input.** Right now the whole game is
   pointerdown-only on the canvas; there's no way to play without a
   mouse/touch input, which is a real accessibility gap for a canvas-only
   game. Worth adding an alternate control (e.g. arrow keys to aim a
   reticle + space/enter to fire) if this site gets another pass.
3. **Tune the difficulty curve.** Speed and hitsNeeded both ratchet up per
   fall right now on a straight linear formula with a hard cap; untested in
   an actual browser by this agent, so the first thing to check on the
   screenshot/playtest is whether the early game is too easy or the ramp
   gets unfair too fast, and adjust the constants in `knockRavenDown()`
   accordingly rather than redesigning the mechanic.

## Gotchas

- **Hit-test timing is the one subtle piece of logic here**: `resolvePebble`
  compares the pebble's *destination* point against the raven's position *at
  arrival time*, read live off the `raven` object — not a snapshot taken when
  the shot was fired. Get this backwards (snapshot at fire time) and the game
  becomes trivial, because the whole difficulty comes from the raven moving
  during the pebble's flight.
- Canvas is drawn at a fixed internal 640×480 logical resolution regardless
  of on-screen size (scaled via `ctx.setTransform` with `devicePixelRatio`,
  displayed via CSS `width:100%; aspect-ratio:4/3`), and `localPoint()`
  converts client coordinates back into that same 640×480 space using
  `getBoundingClientRect()`. If the canvas's on-screen aspect ratio is ever
  changed, both the internal `W`/`H` constants and this conversion need to
  move together or taps will land in the wrong place.
- Untested in a real browser by this agent (no Bash/WebFetch available) —
  the harness screenshot after this build is the first real look. Watch
  especially for: the raven wandering off the visible play field (retarget
  bounds are `margin=60` to `W-60`, `70` to `H*0.6`, chosen without seeing it
  render), and whether the AudioContext actually unlocks on the first tap on
  iOS Safari, which is stricter than this agent could verify.
