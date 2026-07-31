# v100 principal fixtures — worship + govern

The two big civic rooms that had no principal fixture (they fell through to the `learn` terminal and so
got nothing) now have their own. Both are **divinatory** and both publish to the player's `story.rumor`
outbox (`com.minomobi.hoop.story.rumor`) — the lexicon the engine (hoopy) tails off the firehose.

## Worship — two fixtures, both full tactile rituals (ported from the `clock/` surfaces)

The worship room carries **two** divination fixtures — a primary (central component) and a secondary
(grown wall console) — the same component/wall split the dwelling uses (bed + chest). Both perform the
real interaction by hand and — signed in — **release** the result as a `kind:'divination'` rumor.

### ☯ Primary — The Oracle: the yarrow yijing  (`worship/oracle.js` + `yarrow.js`)

Ported from `clock/yijing/index.html`: fifty stalks, one set aside, forty-nine divided **by hand**. A
marker sweeps the bundle; tap to split; the 49 persistent stalks physically divide into heaps, one is
lifted, the fours are counted off and set aside, the rest gather — three changes to a line, six lines to a
hexagram. Classic yarrow odds preserved (moving yin 1/16 … moving yang 3/16). The reading is **expanded**
(via the library's `composeReading` + the canonical Zhouyi): the **Image**, the **Judgment** (卦辭), the
surfaced **moving-line texts** (爻辭), and the **relating hexagram** it changes toward.

### 🜨 Secondary — The sand-stand: geomancy  (`worship/scry.js` + `sand.js`)

Ported from `clock/geocast/index.html` over the `soil.js` mass-conserving height-field: sixteen bracketed
lines in damp sand. **Poke dots** into each line; the parity of each line's dot-count builds the four
Mothers → the whole shield. The panel reports the **FULL SHIELD** — every figure (4 Mothers · 4 Daughters
· 4 Nieces · 2 Witnesses · Judge · Reconciler) with glyphs — plus the Judge headline + Fludd's
signification. WebGPU-shaded sand with a canvas2d fallback. It lives on the **grown wall console** (found
at `F.tip`, like the dwell chest), marked 🜨.

| File | Role |
|---|---|
| `worship/oracle-cast.js` | **Pure kernels** — `yijingFromLines(lines)` (expanded reading via `composeReading`+Zhouyi), `geomancyFromShield(shield)` (the **full** shield report + Judge), `shieldReport`/`figInfo`, `cast(system, seed)` (deterministic non-ritual path, still tested), `divinationRumor`. No DOM. |
| `worship/oracle.js` | Primary fixture UI — hosts the yarrow canvas; on completion shows the expanded reading + release. |
| `worship/scry.js` | Secondary (wall) fixture UI — hosts the sand canvas; on cast renders the full shield chart + release. |
| `worship/yarrow.js` | The yarrow-stalk physical sim + the three-changes-per-line division (canvas + tap). |
| `worship/sand.js` | The sand cast engine: poke→measure→shield over the `soil` Field, the bracket overlay, drag-to-stroke poking. |
| `worship/lib/` | **Vendored** kernels from `clock/lib/` (`iching`, `zhouyi`, `geomancy`, `geomancy-meanings`, `stalk-render`, `soil`, `soil-render`) + `hexagrams.js` (the King Wen `HEX` table from `clock/yijing`). Re-sync, never fork. |

The wall wiring mirrors the chest: `sim.js` `FIXTURE_ACTION.wall.worship = 'geomancy'`; `index.html`'s
`geomancyAt` finds the worship room's grown wall fixture by `F.tip` and opens the sand panel.

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

`test/fixtures.selftest.mjs` (104 checks): cast determinism, the hexagram lookup **cross-checked against
the library's own `composeReading`**, the ritual builders, the **expanded yijing reading** (Image /
Judgment / moving-line texts / relating hexagram present; a still cast has none), the **full shield**
(4+4+4 + Witnesses + Judge + Reconciler all named; Judge matches the headline), the `soil.js` Field engine
(deterministic reset, countable crater, settle), and both rumor builders. `test/sim.selftest.mjs` pins the
`FIXTURE_ACTION` mapping incl. `worship.wall = geomancy`. A headless-Chromium smoke test confirmed the
Oracle is yijing-only (no rite picker) and the sand-stand renders the **full 16-figure shield** (Judge
"Populus") with a release button — no console errors. (The inkblot govern fixture is unchanged.)
