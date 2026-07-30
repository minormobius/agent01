# vendored — forge engine (play-time subset)

Verbatim copies of `fable/forge/js/{prng,engine,dsl,atlas}.js` — the deterministic,
DOM-free play-time core of **forge** (`fable.mino.mobi/forge`, "laws no one wrote").
hoop is a no-build static site and can't import a sibling surface at runtime, so these
are vendored (same rule as `vendor/auth.js`: re-sync, never fork).

NOT vendored: `fingerprint.js` + `foundry.js` — those mint the codex (the novelty
search, ~28 s), which is an OFFLINE step. The minted laws are baked into `codex.json`
by `scripts/mint-forge-codex.mjs`. At play time we only run `dsl.compile` +
`atlas.puzzleFor` (one BFS, ~6 ms) on a law loaded from the codex.

The hoop minigame layer (`hoop/minigame/play.js`) renders + drives these in an
in-world modal; solving a puzzle fires a story-engine hook (a fact/item), which is how
a forge puzzle becomes a lock-pick (#5) or a quest beat.
