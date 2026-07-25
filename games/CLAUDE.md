# games — games.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Multiplayer party games for Bluesky, with real-time rooms orchestrated by Durable Objects.

## Facts

| | |
|---|---|
| Surface | `games` |
| Dir | `games/` |
| Endpoint | `games.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/zombie-horde-defense-game-trsujp` |
| Deploy | `.github/workflows/deploy-games.yml` |
| Uses | `auth.mino.mobi` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "games"`.

## How it works

Three things live here:

- **the Jackbox-style party platform at `/`** — phone+TV, OAuth rooms,
  `RoomCoordinator` DO. Games are markdown in `games/games/`, compiled by
  `engine/runtime.js`; the catalogue is the hand-maintained `games/index.json`
  (the ASSETS binding exposes no directory listing).
- **The Ludographer at `/gen/`** — a borges-shaped procedural board-game
  catalogue (seed n -> a complete, coherent, deterministic board game: theme,
  board, mechanics, components, rulebook, win condition, twist).
- **Hold the Line at `/horde/`** — a one-thumb horde-defence game: six arcs, a
  gun that overheats, and a timed upgrade choice after every wave. Seeded, so
  `?seed=` is a permalink to a run. See [`horde/README.md`](horde/README.md).
- **Telegraph at `/telegraph/`** — a perfect-information tactics puzzle: every
  enemy shows the tile it will hit, and you never have enough actions. Its
  companion piece to `/horde/`, built from the opposite direction — no clock, no
  hidden state, so a turn can be searched exhaustively and the game can tell you
  how many of your options were right. See
  [`telegraph/README.md`](telegraph/README.md).
- **The Ratchet at `/ratchet/`** — a road crossed once with single-use tools.
  Third in the family; its solver answers "does any future still complete this
  road" after every choice and stays silent until the run ends, then names the
  move that actually killed it. See [`ratchet/README.md`](ratchet/README.md).
- **Pressure at `/pressure/`** — the hub for `/horde/`, `/telegraph/` and
  `/ratchet/`: the thesis behind them, what each one can measure about a
  decision, and briefs for the two still unbuilt. A single hand-written page. Start here before adding another game
  to this family: [`pressure/README.md`](pressure/README.md).

`/gen/`, `/horde/`, `/telegraph/`, `/ratchet/` and `/pressure/` are all **pure
static** (no worker or DO changes) and serve through the existing assets
fallback in `games/worker.js`. That is the pattern to copy for anything new that doesn't need a room: a
directory, its own script tags, no build step.

### Testing the static sub-games

They all carry node tests that need no browser, because their engines are plain
IIFEs attaching to `globalThis` — importing them for side effects is enough:

```bash
node games/horde/test/horde.selftest.mjs         # invariants; preflight runs this
node games/horde/test/balance.mjs 400            # difficulty-curve report
node games/telegraph/test/telegraph.selftest.mjs # invariants; preflight runs this
node games/telegraph/test/analysis.mjs 40        # choice-tightness report
node games/ratchet/test/ratchet.selftest.mjs     # invariants; preflight runs this
node games/ratchet/test/analysis.mjs 40         # difficulty + foresight report
node games/gen/test/smoke.mjs                    # Ludographer coherence sweep
```

The analysis reports are built on
[`packages/pressure-lab/`](../packages/pressure-lab/), which owns the parts every
game in this family needs — policy spreads, tightness bands, the
generate-check-repair loop — and encodes as warnings the traps all three games
fell into. It is **not** a solver: what "correct" means differs per game, which
is the whole point of the family. Read its README before adding a fourth.

`preflight` picks up `*.selftest.mjs` under any directory this branch touched,
so a change under `games/` runs all three selftests automatically. The reports
are *measurements*, not pass/fail — read each after moving any number in that
game's config or generator. They take a minute or so; none of them run in CI.

## Deploying

Pushes to `claude/zombie-horde-defense-game-trsujp` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-games.yml`](../.github/workflows/deploy-games.yml).

Ownership moved here from `claude/procedural-board-games-iFAiZ` when /horde/ was
added — a surface has exactly one owning branch plus `main`, so whichever branch
is actively shipping this surface holds it. Change it in
[`deploy-registry.json`](../deploy-registry.json), never in the YAML, then
`node scripts/preflight.mjs --fix` to rewrite the trigger.
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
