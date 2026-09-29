# BRIEF — odyssey-trail (shipped as "NOSTOS")

## What this is

The request: "odyssey trail where it's a terminal game you're sailing around
the Aegean beset by various calamities and navigation by guest culture
correctly. Most runs end in your untimely demise but there is a wincon where
you get those suitors good."

Read as a checklist:

1. Terminal-styled game, sailing the Aegean. ✅ Monospace scrolling log,
   dark CRT-ish panel, stat bar (day / crew / supplies / ship / favor /
   Poseidon's wrath).
2. Beset by various calamities. ✅ Both scripted (one per landfall — Scylla,
   Charybdis, the Cyclops, Laestrygonians, Sirens, Thrinacia, Circe, Calypso…)
   and randomised (a weighted transit-leg table between landfalls: storms,
   squalls, becalming, mutiny grumbles, good omens).
3. Navigate by (i.e. the core mechanic is) guest-culture — xenia. ✅ Every
   landfall is framed as a test of the old host/guest law: who gives
   hospitality, who demands it, who breaks it. Good-faith choices raise
   `favor`/`guile`; violations cost crew, ship or raise Poseidon's `wrath`
   (which then makes every later storm worse — the name-reveal choice after
   blinding the Cyclops is the biggest single lever on this).
4. Most runs end in death. ✅ Multiple distinct death screens (no crew left,
   ship destroyed, drowned alone) plus one "soft loss" (staying with Calypso
   forever — you never go home, so the suitors never answer for anything).
5. A wincon where you get the suitors. ✅ Reaching Ithaca is NOT the win —
   it opens a separate finale (`finale()` → `stringTheBow()` →
   `resolveFinale()`) that rolls a score from `guile*3 + max(0,favor)*2 +
   (alone?0:5) + rand(12)` against two win thresholds and one loss. This is
   the intentional twist: a run that survived by playing it safe the whole
   way (never building guile/favor) can still lose the ending.

Fully built and tested end-to-end (see GOTCHAS for how, since there's no
Bash — I drove the live page with the eyes tools and `eval` against the
page's own top-level `let` bindings, which are visible to CDP Runtime.evaluate
even though they're not `window` properties).

## Decisions

- **Named it NOSTOS, not "Odyssey Trail."** "The Odyssey" itself is public
  domain, but the request's own phrasing echoes "Oregon Trail" closely enough
  that I didn't want the page's own title doing that work. Nostos (Greek:
  the journey home) is the more accurate word for what the game actually is,
  and it sidesteps the whole question. The directory name (`odyssey-trail`)
  was fixed by the dispatch, not by me — only the on-page brand is mine to
  choose, and it isn't on the marks list either way.
- **Choices are buttons, not a typed command line.** A "terminal game" read
  as free-text parsing risked (a) parsing edge cases eating the turn budget,
  and (b) a genuinely bad mobile experience (a keyboard fighting a fixed
  scrollback). Buttons styled as `> option text` keep the terminal feel and
  give large, unambiguous tap targets. If a future turn wants real typed
  commands, treat it as an additive input mode, not a replacement — the
  button list should stay as the accessible/mobile path either way.
- **Crew is a coastal-survival resource, not a finale input**, except for one
  flag (`alone`, whether you have ANY companions left) which costs the
  finale a flat +5. This matches the actual myth (Odysseus's ship's crew
  never reaches the palace fight; only he, Telemachus and two herdsmen do)
  without needing to model Telemachus as a separate character.
- **Thrinacia is scripted to (sometimes) strip you down to "alone" rather
  than end the run.** Eating the Sun God's cattle — the other big
  guest/sacred-property violation — always destroys the ship, but instead of
  a death screen it flips `S.alone = true` and continues you on to Ogygia
  crewless, which is the mythologically correct beat and reframes the rest
  of the voyage (transit events that need a crew — squalls washing a man
  overboard, mutiny grumbling — are weighted to zero while alone; see the
  fix in GOTCHAS).
- **Saving a run to the visitor's own repo is optional and post-hoc**, offered
  only on the end screen, never gating play. `postScore` records `{value:
  day reached, unit: 'day', detail: 'win: <title>' or 'death: <title>'}`.
  The rivals lookup (`scoresOf` + `rank`) only reveals itself after your
  first ended run, to avoid cluttering the first-time page.

## The plan (not built yet, in order)

1. **Balance pass.** The finale thresholds (14 / 24) and the transit-event
   weights are reasoned, not measured — I ran the engine programmatically via
   `eval` (forcing `Math.random`, jumping `S.landfallIdx`) rather than played
   dozens of organic runs, because that was the fastest way to prove each
   code path this turn. A future pass should log outcomes across many
   simulated auto-played runs (there's nothing stopping a `while(buttons)
   click(buttons[0])` loop like the one I used for testing, just run it
   hundreds of times and histogram the endings) and retune weights/thresholds
   so "most runs end in demise" holds without the finale feeling unfair to
   someone who *did* play well.
2. **More variety per landfall.** Right now each landfall has exactly 2
   choices and (mostly) 1–2 outcome branches. Circe and Thrinacia already
   have randomised sub-branches; the rest could use a similar treatment so a
   second playthrough doesn't feel identical when picking the same choice.
3. **A visible "guest-law" scorecard**, distinct from the raw stats — right
   now `favor`/`guile`/`wrath` are shown as numbers with no explanation of
   what they mean or how the finale uses them. A tooltip or an end-of-run
   breakdown ("you kept the guest-law 6 times, broke it 3") would make the
   central mechanic legible rather than implicit.
4. **Typed commands as an optional input mode**, if requested — keep the
   button list as the primary/accessible path (see DECISIONS).

## Gotchas

- **`drive`'s `eval` runs against the page's real top-level `let` bindings**
  (`S`, `finale`, `LANDFALLS`, etc.) even though they are not `window.*`
  properties — classic `<script>` top-level `let`/`const` land in the global
  lexical environment, which CDP `Runtime.evaluate` shares. This is how I
  drove the finale, the Thrinacia branch and the death paths directly without
  hundreds of clicks. Worth remembering for testing future lab sites: you
  don't need `window.foo = foo` exports to poke at internal state from the
  eyes tools.
- **Each separate `drive`/`look` call reloads the page from scratch.** State
  only persists *within* one `steps` array, not across tool calls. I lost
  time on this once (thought a stats bar had gone blank between two calls;
  it had just reset to a fresh game).
- **An object literal's fields are evaluated at parse time, not render
  time.** I first wrote the Ogygia landfall's `intro` as a plain array
  containing `S.alone ? … : …` — since `LANDFALLS` is built once at script
  load, before any game state changes, that ternary always baked in the
  "not alone" branch. Fixed by making `intro` a function (`() => [...]`) and
  having the renderer call it if it's a function. If you add more
  state-dependent intros, use the same pattern.
- **`auth.mino.mobi/api/me` fails CORS in the eyes-tool sandbox** (its
  origin is `127.0.0.1:<port>`, not `minomobi.com`, so the auth worker's
  `Access-Control-Allow-Origin: https://minomobi.com` rejects it). This is
  expected and not a bug in this page — `pds.js`'s `auth.init()` swallows the
  failure internally and resolves with no user, so the "save this voyage"
  button degrades correctly to the sign-in prompt. It should work for real
  once served from minomobi.com; I couldn't verify the actual OAuth
  round-trip from this sandbox (no way to complete a real Bluesky login),
  only that every step up to the redirect behaves correctly.
- The transit-event weight table originally let "a squall washes a man
  overboard" and "the crew grumbles about turning back" fire even while
  `S.alone` (crew already 0) — caught this during the Thrinacia test drive
  and zeroed both weights when alone. If you add more transit events, check
  whether they mention crew/ship and whether they make sense in alone mode.
