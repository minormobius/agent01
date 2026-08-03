# BRIEF — cheers-write ("Embers & Weather")

## Latest turn (this one)

The requester's message this turn was just *"I'll just chill, you got this,
right"* — no new ask, just a green light to keep going. Per the standing rule
(work the plan when the request doesn't point elsewhere), this turn picked up
item 2 from the previous turn's plan: **"save this burn to your Bluesky repo."**

**What shipped:** a new "Keep this burn" section below the scent readout,
using `/_kit/pds.js` exactly as documented (`labPds()`, `com.minomobi.lab.doc`,
`kind: 'ember-recipe'`). Sign-in is a handle field wired through
`kit.handleInput` plus a sign-in/sign-out button pair, same shape as
`lab/www/clear-name/index.html`'s repo section (read as a reference before
writing this — it's the clearest existing example of this exact pattern).
Once signed in, "save this burn" writes the current preset/chemical/wind/
altitude to one overwriting slot (`store.save('recipe', …)`), and "load saved
burn" reads it back and applies it to the sim (updates `state`, the selects,
the sliders, calls `updateReadouts()` and `persist()` so it also becomes the
new localStorage default). All status text goes through one `#repoStatus`
element with `ok`/`bad` modifier classes rather than the kit's global `.err`
box, to avoid inheriting its padding/border for a one-line inline message.

The script tag became `type="module"` to allow the `import { labPds } from
'../_kit/pds.js'` at the top; everything else stayed inside the same IIFE as
before, which still closes over the import via normal module scope. No other
behaviour changed — same sim, same presets, same chemicals, same extinguish
methods, same wind/fog mechanic from the previous turn.

**Not done this turn, still open:** items 3 (compass dial), 4 (wind gusts),
and 5 (fog tied to real smoke density) from the plan below, in that order.
Also unverified: the actual OAuth round-trip and PDS write, since this
sandbox has no network — read the fixtures/reference code carefully instead
of guessing field names, but a live save/load has not been watched happen.

## What this is

The request thread (see `.github/lab-requests/cheers-write.json`) wandered
through several ideas before landing on one: `name: flame simulator` with a
bullet list — chemical inputs, ways to put it out, smoke scent, imagined
fireplace settings — and the most recent line, "different atmospheres, winds,
what makes the smoke fly in your face."

Despite the turn framing saying this was a later turn on an existing site,
**nothing was on disk**: `lab/www/cheers-write/` did not exist, and the recent
commit log shows a prior build attempt failed the gate and left no files
behind. So this turn built the whole thing from scratch rather than iterating.

Shipped this turn, one file, no dependencies:

- A canvas 2D particle sim: flame, rising smoke, embers, extinguish bursts.
- **Chemical inputs** — 8 metal-salt options (copper, sodium/salt, potassium,
  lithium, strontium, borax, methanol, calcium) that recolour the flame via a
  two-stop gradient mix, plus a "plain fuel" default and a gas-blue override
  for the stove preset.
- **Imagined fireplace settings** — 8 presets (campfire, indoor fireplace,
  bonfire, candle, beach bonfire, chiminea, stove burner, and a whimsical
  "dragon's hoard") that scale flame height/spread/particle count and set a
  base scent line.
- **Wind + atmosphere, the newest ask** — a direction slider (-180..180°) and
  a speed slider (0-12) drive a wind vector that bends the flame and drags the
  smoke. Angle 180° (south) is defined as blowing *at* the viewer: past a
  threshold the canvas gets a bottom-up grey fog overlay and a caption reads
  "the wind's turned — that's your own smoke now." An altitude slider thins
  the air: less oxygen means a shorter, bluer flame and thinner smoke.
- **Four ways to put it out** — water (fast, steam burst), smother/sand-or-
  blanket (slow, thick grey cloud), CO₂ (near-instant, minimal residual
  smoke), and starving it (slow 6s fade, dying embers). Each drives intensity
  to 0 over its own duration and swaps the scent line while it runs and after.
- **Scent readout** — plain text, explicitly labelled "imagined — your screen
  has no nose," combining preset + chemical + (if applicable) the "drifts
  right at you" wind note or the current extinguish method's line.
- Settings (preset, chemical, wind, altitude) persist to `localStorage` only.
  A pause button defaults engaged when `prefers-reduced-motion: reduce`, per
  the kit's own guidance that a movement-based site needs its own pause.

## Decisions

- **PDS save/load is one overwriting slot (`recipe`), not a named-save
  list.** The earlier plan note said "keep a favourite preset+chemical+wind
  combination" — singular. A list of named burns would need its own naming
  UI and a picker; skipped for scope, and `store.save`'s "overwrites" model
  fits a single favourite better anyway. If someone asks for multiple saved
  burns later, that's a `name` text field plus `store.save(userGivenName, …)`
  and a `store.list()`-driven picker instead of the hardcoded `'recipe'` key.
- **localStorage stays the primary store; PDS is additive.** Sign-in is still
  optional — the page works fully without it, exactly as before. Loading a
  saved burn also writes it into localStorage via the existing `persist()`,
  so "load" and "the device already remembers your last settings" don't
  fight each other; the repo copy just becomes the new local default too.
- **No Bluesky/PDS integration for anything else** — no leaderboard, no
  sharing a burn's URL, nothing that would need a subject the visitor named.
  The one rule with teeth doesn't apply here regardless (nothing renders
  another account's content), but scope stayed to what was asked: save/load
  your own burn.
- **Rejected building a literal weather model.** "Different atmospheres" and
  "altitude" could have become a much bigger simulation (pressure, humidity,
  real combustion chemistry). Kept it to one altitude/oxygen slider that
  visibly changes flame height and colour plus smoke density — legible over
  physically exhaustive.
- **The "in your face" mechanic is a screen-space fog overlay + caption, not
  a literal camera.** There's no 3D scene here (didn't reach for three.js —
  a flat particle sim reads better at this scale and there's no need for a
  third dimension), so "wind blows the smoke into the viewer" is simulated
  by a canvas-covering fog gradient plus a text cue rather than any real
  depth or camera effect.

## The plan (not built yet, roughly in order)

1. **Audio was explicitly out of scope this turn (and the one before it)** —
   no crackle/hiss sounds, no autoplay anything. If asked for sound, it needs
   a user-gesture-gated toggle (autoplay audio is a bad surprise) and should
   stay off by default.
2. **A compass dial UI** instead of a bare angle slider — the number "137°"
   means less than a little rotating arrow. Skipped for time again, not for
   difficulty; it's a small drawing exercise on its own tiny canvas or SVG,
   reading `state.windAngle` and drawing an arrow, driven by the same
   `input[type=range]` or replacing it with drag-to-rotate.
3. **Wind gusts** — right now wind is a constant vector. A Perlin/simplex-ish
   noise wobble on top (even just a sine sum) would make sustained high wind
   look more like weather and less like a fan.
4. The hard part still open: the fog overlay is a flat gradient tied only to
   the wind's south-component. A next pass could tie its intensity partly to
   smoke density actually near the bottom of the canvas (read particle
   positions rather than just the wind formula) so it responds to the
   simulation state, not just the slider.
5. **Verify the PDS save/load actually round-trips.** This turn wired it up
   against the documented API and an existing working example
   (`clear-name/index.html`) but could not exercise OAuth or a real repo
   write from this sandbox. If a save/load report comes back broken, check
   first whether `store.save`'s third-arg shape (`{ kind, title }`) or the
   scope requested by `store.signIn(h)` (no `{ scores: true }` here — this
   site never calls `postScore`) is the mismatch.

## Visual QA (screenshot pass)

Checked a 1200x800 production-CSP screenshot. Renders correctly: heading,
subtitle, breadcrumb, Pause button, the Fireplace/Wind fieldsets are all
visible and legible. The canvas shows the dark log-ellipse base with a small
orange campfire glow above it — nothing blank, off-screen, overlapping, or
missing a label. The flame reads as small against the 400px-tall canvas
because the campfire preset's default height/intensity keeps it near the
base; that's a size/tuning choice, not something visibly broken, so nothing
was changed.

## Gotchas

- The old `#overlayMsg` / `.overlay-msg` / `.hidden` element is gone — replaced
  by `#windCaption` / `.wind-caption` / `.active`, living outside `.stage` in
  normal document flow. If you're adding another situational message (e.g.
  for the extinguish methods), put it in `windCaption` or a sibling caption
  element, never back inside `.stage` as an absolutely-positioned overlay —
  that's the exact pattern this turn was asked to remove.

- **This slug had no prior files despite the turn banner implying otherwise.**
  If a future turn on `cheers-write` again finds nothing on disk, don't
  assume you're missing something — check `.github/lab-requests/` for the
  raw request and treat it as a fresh build, same as this turn did.
- `rgb(...)` → `rgba(...,alpha)` string surgery in `flameColor`/gradient
  stops relies on there being exactly one `)` in the source string (there
  is, since `mix()` always emits `rgb(r,g,b)`) — if you ever change `mix()`
  to emit something with a stray `)`, this breaks silently (wrong or no
  colour, not a thrown error).
- Wind angle convention: 0° is away/up, 180° is straight at the viewer. Get
  the sign wrong on `windVector()` or `towardFaceFactor()` and the fog
  overlay triggers on the wrong slider end — there's no test harness for
  this, so if it's ever touched, sanity-check by hand: angle 180, high
  speed, should fog the canvas and show the caption.
- **The script tag is `type="module"` now** (needed for the top-level
  `import { labPds } from '../_kit/pds.js'`). The rest of the script is still
  one big `(function () { 'use strict'; ... })();` IIFE sitting after that
  import in the same module — that's deliberate, not leftover: it keeps this
  diff small instead of de-indenting the whole file. A future edit that adds
  another `import` must keep it at the top level of the module, not inside
  the IIFE, or it's a syntax error.
- `store.signIn(h)` here is called with no options — this site never posts a
  score, so it only requests `repo:com.minomobi.lab.doc`, not
  `repo:com.minomobi.lab.score`. Don't copy the `{ scores: true }` option
  from `clear-name` unless this site actually starts using `postScore`.
