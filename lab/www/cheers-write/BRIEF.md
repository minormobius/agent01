# BRIEF — cheers-write ("Embers & Weather")

## Latest turn (this one)

The requester's feedback: *"amazing, something to build on, informatics
shouldn't be in the actual simulator window."* Read as: the "wind's turned —
that's your own smoke now." message was rendered as a text box floating on
top of the canvas (`.overlay-msg`, `position: absolute` inside `.stage`) — a
readout painted over the visual. That's the "informatics in the simulator
window" this turn removed.

**What changed:** the message moved out of the canvas entirely. It's now a
normal-flow `<p id="windCaption" aria-live="polite">` sitting right below the
`.stage` div, styled as a caption (muted by default, brightens with an
`.active` class when there's something to say), empty otherwise. The canvas
itself now carries only the flame/smoke/ember pixels and the fog gradient —
no text is ever drawn or overlaid on it. The Pause button was left where it
was (top-right of the stage) since it's a control, not a readout; if a future
note says otherwise, move it into the caption row/toolbar below the stage too.

Nothing else changed this turn — same sim, same presets, same chemicals, same
extinguish methods. See below for what was already built and what's still
open; that plan is unchanged by this turn's fix.

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

- **No Bluesky/PDS integration at all.** Nothing here needs a subject the
  visitor named, and a save-to-repo "recipe" feature felt like scope creep
  for a first turn — see the plan below for where it'd go if wanted.
- **localStorage over PDS for now.** Simpler, no OAuth friction, and the
  brief says sign-in should be optional unless the page is meaningless
  without it — this one isn't.
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

1. **Audio was explicitly out of scope this turn** — no crackle/hiss sounds,
   no autoplay anything. If asked for sound, it needs a user-gesture-gated
   toggle (autoplay audio is a bad surprise) and should stay off by default.
2. **A "save this burn to your Bluesky repo" button** using `/_kit/pds.js`
   (`com.minomobi.lab.doc`, kind `'ember-recipe'`) so a visitor can keep a
   favourite preset+chemical+wind combination and reload it on another
   device. Sign-in stays optional; this is additive.
3. **A compass dial UI** instead of a bare angle slider — the number "137°"
   means less than a little rotating arrow. Skipped for time, not for
   difficulty; it's a small drawing exercise on its own tiny canvas or SVG.
4. **Wind gusts** — right now wind is a constant vector. A Perlin/simplex-ish
   noise wobble on top (even just a sine sum) would make sustained high wind
   look more like weather and less like a fan.
5. The hard part still open: the fog overlay is a flat gradient tied only to
   the wind's south-component. A next pass could tie its intensity partly to
   smoke density actually near the bottom of the canvas (read particle
   positions rather than just the wind formula) so it responds to the
   simulation state, not just the slider.

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
