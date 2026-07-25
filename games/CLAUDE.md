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

- **Pressure at `/pressure/`** — the hub for `/horde/` and `/telegraph/`: the
  thesis behind them, what each one can measure about a decision, and briefs for
  three more. A single hand-written page. Start here before adding another game
  to this family: [`pressure/README.md`](pressure/README.md).

`/gen/`, `/horde/`, `/telegraph/` and `/pressure/` are all **pure static** (no
worker or DO changes) and serve through the existing assets fallback in
`games/worker.js`.
That is the pattern to copy for anything new that doesn't need a room: a
directory, its own script tags, no build step.

### Testing the static sub-games

Both carry node tests that need no browser, because their engines are plain
IIFEs attaching to `globalThis` — importing them for side effects is enough:

```bash
node games/horde/test/horde.selftest.mjs         # invariants; preflight runs this
node games/horde/test/balance.mjs 400            # difficulty-curve report
node games/telegraph/test/telegraph.selftest.mjs # invariants; preflight runs this
node games/telegraph/test/analysis.mjs 40        # choice-tightness report
node games/gen/test/smoke.mjs                    # Ludographer coherence sweep
```

`preflight` picks up `*.selftest.mjs` under any directory this branch touched,
so a change under `games/` runs both selftests automatically. The two reports
are *measurements*, not pass/fail — read `balance.mjs` after moving any number
in `horde/js/config.js`, and `analysis.mjs` after touching Telegraph's rules or
generator. Both take a minute or so; neither runs in CI.

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
