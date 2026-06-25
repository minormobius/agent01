# v099 principal fixtures — worship + govern

The two big civic rooms that had no principal fixture (they fell through to the `learn` terminal and so
got nothing) now have their own. Both are **divinatory** and both publish to the player's `story.rumor`
outbox (`com.minomobi.hoop.story.rumor`) — the lexicon the engine (hoopy) tails off the firehose.

## Worship → ☯ The Oracle  (`worship/`)

A divination seal-stand. The player draws an **entropic omen** by one of two rites and — signed in —
**releases** it to the ship as a `kind:'divination'` rumor (the engine's entropic-omen signal).

- **Yijing** — the three-coin oracle: 6 lines → a King Wen hexagram + moving lines + the hexagram it
  changes toward.
- **Geomancy** — sixteen tallies → four Mothers → the shield → its **Judge** figure + Robert Fludd's
  signification (planet · zodiac · nature).

| File | Role |
|---|---|
| `worship/oracle-cast.js` | **Pure cast kernel** — seeded (reproducible), no DOM. `cast(system, seed)` → `{system, omen, profile, seed}`; `divinationRumor(world, reading)` builds the record. |
| `worship/oracle.js` | The fixture UI — self-contained overlay (own DOM + scoped CSS). Pick a rite → draw → release. |
| `worship/lib/` | **Vendored** I Ching + geomancy kernels (`iching.js`, `zhouyi.js`, `geomancy.js`, `geomancy-meanings.js`) from `clock/lib/`; `hexagrams.js` is the King Wen `HEX` table extracted from `clock/yijing/index.html`. Re-sync, never fork. |

## Govern → ❦ The Seal-stand  (`govern/`)

A Rorschach seal-stand. The player **flips through seeded inkblots** until one rings true, reads its
measured archetype, optionally adds a line of their own **colour** (free text), and **stamps** it — a
`kind:'inkblot'` rumor carrying the blot's archetype profile + their colour.

| File | Role |
|---|---|
| `govern/inkblot-rumor.js` | **Pure payload builder** — `inkblotRumor(world, {seed, portrait, traits, color})` → the record. node-tested independent of the DOM. |
| `govern/inkblot.js` | The fixture UI — overlay with a live blot canvas, flip (prev/another), the archetype, a colour input, stamp. |
| `govern/ink/` | **Vendored** inkblot engine from `wars/ink/js/` (`prng·attractors·traits·judge·engine`). Classic IIFE globals (`INKENGINE`/`INKJUDGE`/…), loaded as `<script>` tags **before** the module (the classic-global-before-module pattern). `smush.js` not vendored (line mode only). |

## The wiring (in `index.html` + `sim.js`)

- `sim.js` `FIXTURE_ACTION.component`: `worship → 'oracle'`, `govern → 'inkblot'` (were both `'terminal'`,
  which rendered nothing). One table entry per fixture — the whole "turn on a fixture" surface.
- `index.html`: `isOracle`/`isInkblot` detectors → `oracleAt`/`inkblotAt` finders → the click dispatch
  walks the `@` there and opens the panel; glyphs ☯ (indigo) / ❦ (slate) drawn in `paintChunkInto`.
- **One shared publisher** `publishRumor(rumor)` (factored out of `spreadRumor`) handles the auth/scope/
  `putRumor` for spread-word, the oracle, and the seal-stand alike. Sign-in is required only to *release*
  (rumors live in the player's own repo); casting/flipping works offline.

## Rumor lexicon extension (`hoop/lexicons/story.rumor.json`)

Added optional fields so one outbox carries all three rumor kinds: `kind` (`sighting`|`divination`|
`inkblot`), `seed` (reproduce the cast/blot), `profileJson` (the JSON archetype profile — string-carried
like `story.save`'s `stateJson`, so the shape can evolve without a lexicon bump), `color` (the player's
inkblot colour). Back-compatible — every field is optional; an absent `kind` reads as `sighting`.

## Tests

`test/fixtures.selftest.mjs` (82 checks): cast determinism, the hexagram lookup **cross-checked against
the library's own `composeReading`**, geomancy Judge/profile, and both rumor builders. `test/sim.selftest.mjs`
pins the new `FIXTURE_ACTION` mapping. A headless-Chromium smoke test confirmed both panels open and render
(a full I Ching reading; an inkblot archetype with painted pixels) with no console errors.
