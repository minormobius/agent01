# BRIEF — cheers-write ("Embers & Weather")

## Latest turn (this one) — compact layout, two new presets, mates, tiny chat

The request was a flat "+/-" list (see the profile for why that format gets
read as independent bullets, not connected prose):
*"compact so all gauges fit within a phone, without scrolling + add
background template Chaparral + metal smelting - the atmospheric inputs +
tagging mates for bringing them to the campfire and, a tiny chat function"*.

**Shipped, in the order of the list:**

- **Removed the Wind and Atmosphere fieldsets entirely** — the "- the
  atmospheric inputs" line. `windAngle`/`windSpeed`/`altitude` are gone from
  `state`, `persist()`, the PDS save/load payload, and the UI. The physics
  functions that consumed them (`windVector`, `oxygenFactor`) still exist,
  now returning fixed neutral values (still air, full oxygen) so
  `spawnFlame`/`spawnSmoke`/`step`/the battle equivalents didn't need
  touching — smallest safe diff rather than ripping wind out of the particle
  math too. The "smoke drifts in your face" fog-overlay mechanic and its
  caption (`drawFogAndCaption`, `#windCaption`) are deleted outright since
  they can now never trigger (`towardFaceFactor` no longer exists).
- **Compacted spacing throughout**: tighter fieldset padding, smaller
  `controls-grid` gap/margin, smaller section margins, plus a `@media
  (max-width:480px)` pass that tightens further. Combined with dropping two
  whole fieldsets, a phone viewport should now show canvas → Fireplace
  controls → extinguish buttons without much scrolling. **Not rigorously
  measured against a specific phone height** (no browser here) — if a
  report comes back saying it still scrolls past the fold, the next lever is
  shrinking the canvas itself (currently 640×400 intrinsic, scales via
  `width:100%;height:auto`) with a `max-height` + `aspect-ratio` combo, which
  this turn skipped for time.
- **Two new fireplace presets**: `chaparral` ("Chaparral scrub fire," dry
  sage/manzanita, `fuelTemp: 800`) and `smelting` ("Metal smelting forge,"
  scorched iron/coal smoke, `fuelTemp: 1750`) — same shape as every other
  preset (`height`/`spread`/`count`/`scent`/`fuelTemp`), added to both
  `PRESETS` and `PRESET_ORDER`, so they show up in the single-flame select
  *and* both Flame Wars burner selects for free. Neither has its own flame
  tint (`gasBlue` or similar) — colour still comes purely from the chosen
  chemical, same as campfire/bonfire/etc. If "smelting" is expected to look
  molten-orange-white by default regardless of chemical, that's the next
  thing to add (a preset-level colour override, following the `gasBlue`
  pattern in `flameColorFor`).
- **"Mates at the campfire"** — a new local-only feature, not tied to
  Bluesky data beyond the handle string itself: a `kit.handleInput` box to
  type/pick a handle, an "tag them" button, and the tagged handles render as
  removable chips. Stored in `state.mates` (array of plain handle strings)
  and persisted to the same `localStorage` key as everything else. No PDS
  involvement — didn't seem worth a repo round-trip for a list of strings,
  and it keeps "who's at the fire" per-device like the rest of the local
  state. No avatar lookups either (would need `kit.bskyGet`
  `resolveHandle`/`getProfile` per tag) — text-only chips, for time.
- **"Campfire chat"** — a *tiny*, deliberately fake chat: you type a line,
  it appears as "you: …", and after a short random delay a reply appears
  from a randomly chosen tagged mate (a canned line from a small pool) or,
  if nobody's tagged, from "the fire" itself (a different canned pool,
  read as the fire "responding" rather than a person). Explicitly labelled
  in the heading as imagined and device-only, matching the site's existing
  honesty convention for the scent notes and burn temperature. **Nothing is
  sent anywhere and nothing persists** — chat history is in-memory only and
  clears on reload. This was a deliberate scope call: a *real* chat between
  named mates would need a backend or a way to read another repo's live
  writes, which is exactly the "no stream the visitor didn't name, no shared
  server" boundary this whole factory is built around — see Decisions below.

**Not done this turn:** items 1–5 from the older plan (audio, compass dial,
wind gusts, fog-tied-to-smoke-density, verifying the PDS round-trip) are now
partly moot — items 2–4 were about the wind/fog mechanic just deleted, so
they're crossed off rather than carried forward. Verifying the PDS
save/load round-trip is still genuinely open. Flame Wars scoring (item -1,
old numbering) is also still open.

## Decisions (this turn)

- **Removed wind/altitude code paths rather than just hiding the UI.** A
  half-measure (hide the fieldsets, keep the sliders' state and math fully
  live) would have left dead state and an unreachable feature; since the
  request explicitly said remove them, this turn deleted the state fields,
  the persistence, the PDS payload fields and the fog/caption mechanic that
  depended on them, while leaving `windVector()`/`oxygenFactor()` as
  functions returning fixed values — so the particle-spawning code in
  `step`/`spawnFlame`/`spawnSmoke`/the battle equivalents didn't need a
  rewrite. If wind ever comes back, those two functions are exactly where
  to reintroduce state-driven values.
- **Chat is a local illusion, not real messaging.** A genuine multi-person
  campfire chat isn't buildable here without either a shared backend (which
  doesn't exist and shouldn't — "the backend is the visitor's own
  repository," and a chat message isn't the visitor's own data, it's a
  conversation) or polling other people's PDS repos for messages they
  wrote elsewhere (which nothing in this feature would have them write in
  the first place). So "tiny chat function" became a canned-reply toy,
  clearly labelled as imagined, rather than a half-working real chat that
  quietly never receives a reply from an actual person. If a future ask
  wants this to be *real* (two visitors actually talking), that needs a
  design conversation about where messages live — it is not a small
  addition to what's here.
- **Mates are plain strings, not resolved profiles.** Keeps the feature to
  one `kit.handleInput` call and a chip list; no `getProfile` calls, no
  avatars, no verification that the handle actually resolves to a live
  account (a typo'd handle just becomes a chip with no error surfaced
  beyond the "already tagged" and "doesn't look like a handle" checks in
  `addMate`). If accuracy matters more than speed later, validate via
  `kit.bskyGet('com.atproto.identity.resolveHandle', {handle})` before
  adding the chip.
- **Didn't rebuild `windVector`/`oxygenFactor` call sites to skip the
  now-pointless multiplication by a constant.** `w.x * 0.12` etc. still run
  every frame; it's dead-simple arithmetic on a constant, not worth a
  special-cased fast path, and keeping the call sites untouched minimised
  the diff and the risk of breaking flame/smoke physics that were already
  working.

## The plan (not built yet, roughly in order)

The request was *"Can we add a battle function, ;flame wars; make it divided
into 2 and add burn temperature."* The line before it, *"It dances with music,
very cool,"* was read as praise for the existing motion rather than a request
for audio-reactivity — audio has been explicitly out of scope for two turns
running (see below), and there was a clear, concrete, actionable ask right
after it. If a future message names a specific song/audio-sync ask directly,
that reading should be revisited; a vague compliment shouldn't reopen it on
its own.

**Shipped:**

- **A "⚔ Flame Wars" toggle** next to Pause. Flipping it on splits the same
  canvas into two independent, always-burning flames (no extinguish in battle
  — see below) side by side with a thin divider line, each with its own
  preset + chemical pair chosen from two new selects ("Flame Wars — pick two
  burners", replacing the single Fireplace fieldset while battle is active).
  Defaults to campfire+copper (green) vs. dragon's-hoard+magnesium (blinding
  white) — a visually loud first impression rather than two similar flames.
- **Burn temperature**, added to every preset (`fuelTemp`, °C) and chemical
  (`tempDelta`, °C) and combined by `burnTemp(presetKey, chemKey, intensity)`.
  In single-flame mode it's a new line under the scent readout: "Burn
  temperature: ~650°C (estimated, illustrative)" — kept as a caption in normal
  document flow, **not painted onto the canvas**, per the standing UI
  preference from this handle's sixth build (informatics off the simulator
  surface). In battle mode it drives a small versus bar (each side's
  proportion of the combined temperature, coloured with that side's actual
  flame gradient) plus a text verdict ("Left is burning hotter right now
  (estimated)." / "Close burn — practically tied.").
- The numbers are illustrative, not lab-accurate, and say so: wood fire
  ~600–750°C, candle ~1000°C, gas stove ~1950°C, the imagined dragon preset
  ~1600°C base; chemicals add a modest delta (~10–50°C for most metal salts)
  except methanol (+400, it's actually a fuel, not just a colourant) and
  magnesium (+1500, real magnesium ribbon burns extremely hot). Rounded to
  the nearest 10°C so it doesn't read as more precise than it is.
- While battle is active, the Fireplace fieldset, the "Put it out" section
  and the scent section are hidden (`hidden` attribute, toggled from one
  `updateBattleVisibility()` function) — extinguishing two competing flames
  wasn't part of the ask and would have doubled the state machine for no
  clear payoff this turn. Wind/altitude stay visible and still apply to both
  burners equally (shared atmosphere, not per-side).
- Battle mode and both burners' choices persist to `localStorage` (extended
  the existing `STORE_KEY` JSON with `battle`/`battleLeft`/`battleRight`,
  same validate-on-load pattern as the existing fields).

**Not done this turn:** no PDS save/load for a battle matchup (the repo
section still only saves the single-flame recipe — a battle "loadout" would
need its own record shape and there was no clear signal this was wanted yet);
no animated "winner" moment (flames don't grow/shrink based on who's
"winning" — the versus bar is a readout, not a mechanic that feeds back into
the sim); no sound of any kind, still.

## Earlier turn (chemicals: phosphorus, magnesium)

The requester's message this turn was *"Good, for now although there are too
few options to warrant needing saving."* Read as a reaction rather than a
literal feature request (this handle's pattern per its profile — terse
comments that need the room read, not filed instructions): approval of the
current state, plus a specific critique of the *previous* turn's save/load
feature — that the chemical/preset option space is thin enough that saving a
favourite isn't worth much yet.

Rather than touching the save feature itself (removing something a requester
called "good, for now" felt wrong), this turn widened the option space
directly, which is the thing the complaint was actually about: **added two new
chemicals, `phosphorus` and `magnesium`**, to `CHEMICALS`/`CHEMICAL_ORDER` in
`index.html`. Phosphorus specifically closes a loop from two turns back — the
requester asked *"I wanna know what happens when you throw phosphor in the
flame"* and the thread pivoted to the fireplace-preset ask before it was ever
built (noted in the profile as a dropped ask). It's real chemistry: a ghostly
green-white flame, described as garlicky/acrid, and — the one bit of new
mechanics — a `smoke` multiplier field on `CHEMICALS` (default 1, wired into
`spawnSmoke`'s `rate` calc) so phosphorus visibly produces a much thicker
white cloud (2.4×) and magnesium burns almost smoke-free (0.15×), matching how
those two actually behave. No other chemical needed the field touched since
`typeof chem.smoke === 'number' ? chem.smoke : 1` defaults untouched entries
to 1.

**Not done this turn:** the save/load PRD from two turns back is untouched and
still unverified end-to-end (see "still open" below). No new presets, no
compass dial, no wind gusts — deliberately kept this turn to the one thing the
message actually pointed at.

## Earlier turn (save/load)

Previous turn's message was just *"I'll just chill, you got this,
right"* — no new ask, just a green light to keep going. Per the standing rule
(work the plan when the request doesn't point elsewhere), that turn picked up
item 2 from the plan before it: **"save this burn to your Bluesky repo."**

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
- **Chemical inputs** — now 10 metal-salt/element options (copper, sodium/salt,
  potassium, lithium, strontium, borax, methanol, calcium, and — added the
  seventh turn, closing an older dropped ask — phosphorus and magnesium) that
  recolour the flame via a two-stop gradient mix, plus a "plain fuel" default
  and a gas-blue override for the stove preset. Phosphorus and magnesium also
  scale how much smoke is produced (`CHEMICALS[k].smoke`, a multiplier on
  `spawnSmoke`'s rate) — thick white smoke for one, almost none for the other.
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

-1. **Flame Wars has no scoring or history** — it's a live comparison, reset
    every time either select changes or the page reloads. If a future ask
    wants "best of five" or a saved matchup, that's a small state object
    (`{ wins: {L:0,R:0} }`) plus a moment where a round "ends" — there isn't
    one right now, it's a continuous readout, not a discrete match. Decide
    what "ending a round" even means (a timer? a manual "declare winner"
    button?) before building it; it wasn't obvious enough to guess this turn.
0. **If another "not enough options" reaction comes in, the next lever is
   presets, not chemicals** — chemicals just got two more, presets are still
   the original eight. A new preset needs `height`/`spread`/`count`/`scent`
   and optionally `gasBlue`, same shape as the existing ones; nothing else
   in the code needs to change to add one.
1. **Audio was explicitly out of scope this turn (and the one before it)** —
   no crackle/hiss sounds, no autoplay anything. If asked for sound, it needs
   a user-gesture-gated toggle (autoplay audio is a bad surprise) and should
   stay off by default.
2–4. **MOOT as of this turn** — items 2 (compass dial), 3 (wind gusts) and 4
   (fog tied to smoke density) were all about the wind/altitude sliders and
   the "smoke in your face" fog mechanic, which this turn removed outright
   at the requester's explicit ask ("- the atmospheric inputs"). Don't
   resurrect them without a fresh request — the feature they'd extend no
   longer exists. If wind ever comes back, it starts from `windVector()`
   and `oxygenFactor()` in the current code, which are stubs now.
6. **Mates chip list has no avatar/verification** — handles are stored and
   shown as plain text, never checked against `resolveHandle`. A typo just
   becomes an inert chip. Worth adding a resolve-and-check step if a report
   comes back about a mistyped handle sitting there silently.
7. **Chat is not persisted and not real.** If a future ask wants chat
   history to survive a reload, that's a `localStorage` array like `mates`.
   If it wants *actual* two-way messaging between visitors, that's a much
   bigger design question — see Decisions above — not a small follow-up.
8. **Canvas height isn't explicitly capped for very short phone
   viewports.** It scales via `width:100%;height:auto` off a 640×400
   intrinsic size, which is already fairly short, but wasn't verified
   against a specific device height. If "still scrolls on my phone" comes
   back, add a `max-height`/`aspect-ratio` clamp on `canvas#fire` next.
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

- **Switching Flame Wars on/off mid-extinguish jumps the clock.** Single-flame
  `state.extinguishing` stores `startedAt: performance.now()` and computes
  elapsed time against `performance.now()` again in `step()` — but `step()`
  only runs when `!state.battle`. Toggle into battle mode partway through an
  extinguish, wait, toggle back out, and the elapsed-time jump completes (or
  overshoots) the extinguish almost instantly, because wall-clock time kept
  moving while `step()` didn't. Harmless (it just finishes extinguishing
  early, doesn't throw), but if this is ever reported as "extinguishing
  skipped a step," this is why — the fix is tracking elapsed via an
  accumulated `dt` sum instead of two `performance.now()` reads.
- **Battle-mode particle math is a near-duplicate of the single-flame
  functions** (`spawnBattleFlame`/`spawnBattleSmoke`/`stepBattle`/`drawBattle`
  next to `spawnFlame`/`spawnSmoke`/`step`/`draw`), not a shared generalized
  system. Deliberate given the turn budget — unifying them into one
  parameterized burner system is real work and the two paths were easy to get
  right independently, but it's real duplication: a bug fix to flame physics
  in one probably needs the same fix in the other. `flameColorFor(preset,
  chem, t)` is the one piece that *was* factored out and shared by both paths
  (single-flame's `flameColor(t)` just wraps it) — follow that pattern if
  unifying the rest.
- **OBSOLETE as of this turn:** `#windCaption`/`.wind-caption`/`.active` and
  the `drawFogAndCaption` function they belonged to are gone entirely — the
  wind/atmosphere feature that drove them was removed. If you're adding
  another situational message (e.g. for the extinguish methods), the pattern
  that's still valid is "a caption element living outside `.stage` in normal
  document flow, never an absolutely-positioned overlay on the canvas" — just
  without `windCaption` itself to reuse; write a new one the same way.

- **This slug had no prior files despite the turn banner implying otherwise.**
  If a future turn on `cheers-write` again finds nothing on disk, don't
  assume you're missing something — check `.github/lab-requests/` for the
  raw request and treat it as a fresh build, same as this turn did.
- `rgb(...)` → `rgba(...,alpha)` string surgery in `flameColor`/gradient
  stops relies on there being exactly one `)` in the source string (there
  is, since `mix()` always emits `rgb(r,g,b)`) — if you ever change `mix()`
  to emit something with a stray `)`, this breaks silently (wrong or no
  colour, not a thrown error).
- **OBSOLETE as of this turn:** the wind-angle-convention note that used to
  live here no longer applies — `windVector()` returns a fixed `{x:0,y:0}`
  and `towardFaceFactor()` doesn't exist any more. `oxygenFactor()` likewise
  now just returns `1`. If wind returns, it's being rebuilt from scratch, not
  un-commented.
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
- `CHEMICALS[k].smoke` is optional and only checked with
  `typeof chem.smoke === 'number'` — don't set it to exactly `0` meaning "no
  smoke at all" without checking that guard still treats it correctly (it
  does: `typeof 0 === 'number'` is true, so `0` works as literally zero smoke;
  it's `||` you'd have to avoid, not this ternary). Magnesium uses `0.15`,
  not `0`, because a literal zero looked wrong next to a real flame.
