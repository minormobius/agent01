# hoop — CLAUDE.md (the GAME wing · main site)

You are working on **hoop**, the game wing and **main site** of the O'Neill cylinder
modelling package. Read `hoop/README.md` first — this file is the operational quick-reference.

## What hoop is

**The infinite game.** A collaborative design space where *the map is the forum*: you walk an
`@` around a glyph world stitched from an endless, deterministic ship engine; every glowing
node is a *place* that anchors one long-running conversation thread, and every place and
message is an ATProto record. The canvas is the engine surface; the right rail is the forum.

- `js/ship.js` — the deterministic, infinite, chunked ship engine (global `HoopShip`; loaded
  as a classic script *before* the module app so `world.js` can read it off the global).
- `js/world.js` — the canvas adventure: Voronoi-cell "foam" map, `@` movement, click-to-walk,
  gravity regimes, live peers.
- `js/app.js` — the controller wiring world ⇆ store ⇆ thread rail ⇆ auth ⇆ presence.
- `js/store.js` — data model + two backends (Local / ATProto) + threading.
- `js/{presence,atproto,ink}.js` — presence socket client · public ATProto reads · seeded vector drawing.
- `worker.js` — assets + the **HoopRoom** presence Durable Object (live positions over WebSockets).

## The package it belongs to

Four surfaces, one cylinder. **game → hoop (you, main site)** · **structure → [rind](../rind)** ·
**thermodynamics → [tide](../tide)** · **ecosystem → [biome](../biome)**. hoop shed its
structural half (the old `cylinder.html` / `foam.js` / `solver/` tooling) to **rind** in the
cylinder-refactor — what remains here is purely the game. The three modelling wings are
reachable from hoop's topbar pills (⬡ rind · ☁ tide · ❧ biome); keep those links working.

## Run / test (all run from the sandbox; deploy does not)

```bash
node hoop/test/ship.selftest.mjs            # ship engine invariants (determinism, seamless chunks)
node hoop/test/world.selftest.mjs           # the Voronoi-ship rewrite: mesh + gravity movement
node hoop/test/cylinder-ring.selftest.mjs   # does the generated world substrate come out ROUND
for t in hoop/test/*.selftest.mjs; do node "$t" || echo "FAIL $t"; done
```

(`cylinder-ring.selftest.mjs` tests `ship.js` + `world.js` — the *game's* world substrate,
despite the name. It stayed with hoop, not rind.)

## State model — two tiers (the /mmo pattern)

- **Hot / ephemeral → HoopRoom DO** (`worker.js`): live positions + online list, in-memory,
  broadcast over `/ws`. Identity is borrowed from the shared auth worker (validates the session
  token against `auth.mino.mobi/api/me`). Nothing persists — disconnect = you fade from the map.
- **Cold / durable → ATProto lexicons** (`com.minomobi.hoop.place` / `.message`), written to
  each user's PDS. User-owned, permanent. Lexicons in `lexicons/`.

## Deploy

- Push `hoop/**` on `main` or `claude/oneill-cylinder-refactor-xjknww` → `deploy-hoop.yml`
  runs `wrangler deploy` (worker + assets + the HoopRoom DO migration). The sandbox cannot
  deploy; push and let the Action run. Verify the log binds `hoop.mino.mobi (custom domain)`.
- Ownership is in `deploy-registry.json` (surface `hoop`). Edit the registry, then
  `node scripts/gen-deploy-triggers.mjs --write` + `node scripts/lint-deploy-registry.mjs`.

## Invariants — do not break

1. **The ship engine is deterministic.** `(shipSeed, chunkCoord, genomeSnapshot)` →
   identical rooms on every machine and across ATProto repos. Don't introduce unseeded
   randomness into generation — it breaks reproducibility and atproto-persistability.
2. **`ship.js` is a classic global script**, loaded before the module `app.js`. Keep that
   ordering; `world.js` reads `globalThis.HoopShip`.
3. **Presence is never a lexicon.** You can't write a permanent firehose record on every
   footstep — the DO is the only home for live positions.
4. **`vendor/auth.js` is a verbatim copy** of `packages/oauth-client/auth.js` (a no-build
   static site can't reach `/packages/` at runtime). Re-sync it from source; don't fork it.
