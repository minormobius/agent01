# hoop/v096/forge/ — vendored forge engine (verbatim)

These four modules are **verbatim copies** of `fable/forge/js/`:

| here | source of truth |
|---|---|
| `prng.js`  | `fable/forge/js/prng.js`   |
| `dsl.js`   | `fable/forge/js/dsl.js`    |
| `engine.js`| `fable/forge/js/engine.js` |
| `atlas.js` | `fable/forge/js/atlas.js`  |

Same rule as `hoop/vendor/auth.js`: **re-sync, never fork.** hoop is a no-build
static site and can't reach `../../fable/` at runtime, so the arcade fixture
(`hoop/v096/arcade.js`) vendors forge's puzzle pipeline here.

Only the runtime puzzle path is vendored — `compile`/`describe` (dsl) +
`makeWorld`/`initialState`/`isWin` (engine) + `puzzleFor` (atlas) + the seeded
PRNG. The discovery machinery (`foundry.js`, `fingerprint.js`) is **not** here:
the arcade serves one already-discovered ruleset (forge codex law № 1, "the
Withering Discipline"), baked into `arcade.js`. To add another cabinet ruleset,
run forge's `buildCodex(n)` offline and bake the entry — don't re-run discovery
in the browser.

If forge's DSL/engine/atlas drift, re-copy these four files so the puzzles the
arcade serves stay bit-identical to the ones at `fable.mino.mobi/forge`.
