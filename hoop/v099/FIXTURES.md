# v099 principal fixtures — worship + govern

The two big civic rooms that had no principal fixture (they fell through to the `learn` terminal and so
got nothing) now have their own. Both are **divinatory** and both publish to the player's `story.rumor`
outbox (`com.minomobi.hoop.story.rumor`) — the lexicon the engine (hoopy) tails off the firehose.

## Worship → ☯ The Oracle  (`worship/`)

A divination fixture with two **full tactile rituals** (not instant rolls — the real interactions ported
from the `clock/` divination surfaces). The player performs the rite by hand and — signed in — **releases**
the omen to the ship as a `kind:'divination'` rumor (the engine's entropic-omen signal).

- **Yijing — the yarrow division** (`worship/yarrow.js`, ported from `clock/yijing/index.html`): fifty
  stalks, one set aside, forty-nine divided **by hand**. A marker sweeps the bundle; tap to split; the 49
  persistent stalks physically divide into heaps, one is lifted, the fours are counted off and set aside,
  the rest gather — three changes to a line, six lines to a hexagram (+ moving lines + the hexagram it
  changes toward). The classic yarrow odds (moving yin 1/16 … moving yang 3/16) are preserved.
- **Geomancy — stabbed in sand** (`worship/sand.js`, ported from `clock/geocast/index.html`): sixteen
  bracketed lines in damp sand (the `soil.js` mass-conserving height-field). **Poke dots** into each line;
  the parity of each line's dot-count builds the four Mothers → the shield → its **Judge** figure + Robert
  Fludd's signification (planet · zodiac · nature). WebGPU-shaded sand with a canvas2d fallback.

| File | Role |
|---|---|
| `worship/oracle-cast.js` | **Pure kernels** — `yijingFromLines(lines)` / `geomancyFromShield(shield)` (the ritual outputs → the reading + profile), `cast(system, seed)` (the deterministic non-ritual path, still used/tested), `divinationRumor(world, reading)` (the record). No DOM. |
| `worship/oracle.js` | The fixture UI — self-contained overlay hosting whichever ritual canvas; on completion shows the omen + release. |
| `worship/yarrow.js` | The yarrow-stalk physical sim + the three-changes-per-line division (canvas + tap). DOM/canvas; the page's element-ids swapped for an injected canvas + callbacks. |
| `worship/sand.js` | The sand cast: poke→measure→shield over the `soil` Field, the bracket overlay, drag-to-stroke poking. Injected sand+overlay canvases + callbacks. |
| `worship/lib/` | **Vendored** kernels from `clock/lib/` (`iching`, `zhouyi`, `geomancy`, `geomancy-meanings`, `stalk-render`, `soil`, `soil-render`) + `hexagrams.js` (the King Wen `HEX` table from `clock/yijing`). Re-sync, never fork. |

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

`test/fixtures.selftest.mjs` (95 checks): cast determinism, the hexagram lookup **cross-checked against
the library's own `composeReading`**, the ritual builders (`yijingFromLines`/`geomancyFromShield`), the
`soil.js` Field engine (deterministic reset, mass-conserving poke leaves a countable crater, settle), and
both rumor builders. `test/sim.selftest.mjs` pins the new `FIXTURE_ACTION` mapping. A headless-Chromium
smoke test drove both rituals: the yarrow stalk sim paints and the division advances (aim→split→count),
and the sand cast produced a full reading ("The Judge is Coniunctio, under Mercury") with the 16-line
bracket overlay painted — no console errors. (The inkblot govern fixture is unchanged.)
