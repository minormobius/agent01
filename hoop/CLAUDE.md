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
- `js/postal.js` + `js/nav.js` — **the navigation plumbing** (design: `NAV.md`). `postal.js` derives
  stable, hierarchical, Merkle-able **chamber addresses** from the deterministic engine (NPCs/places
  bind to `(chunk, ordinal)` — genome-stable slots); `nav.js` is two-tier **HPA\*** routing (coarse
  portal-graph A\* + fine `isFloor` A\*), the 2-D-deck cousin of `rind/wayfind.js`. Pure + node-tested.
  Wiring status (`NAV.md`): **steps 1 & 3 done** — places carry `{gid, addr, depth}` (via
  `store.setChamberLookup` ← `world.field.chamberAt`), and `world.js`'s click-to-walk now routes
  through `navRoute(field.seed, …, { ports: foamPorts })` (no ±48 window; `stepMotion` still walks
  the tiles). `nav.js` also exports **`wayfan()`** — the geodesic player→perimeter tree that is the
  substrate for the **map overhaul**: `world.js`'s `_draw` renders a **light planar-fan overlay** —
  `_ensureFan` recomputes the player's fan only on tile/depth change (radius ~26, ~3 ms) and bakes
  flat arrays so `_drawFan` is one stroke (routes) + one fill (tips) per frame. (Per-cell dimming
  was tried and reverted — it tanked the framerate.) A dedicated rendering pass + the corkscrew
  (`cost`/`connectorAt`) are next.
- `js/store.js` — places now bind to a **chamber address** (postal): `setChamberLookup`/`withAddress`
  attach `gid`/`addr`/`depth`; the `hoop.place` lexicon gained those optional fields. Tile stays the rkey.
- `worker.js` — assets + the **HoopRoom** presence Durable Object (live positions over WebSockets).
- `research.html` + `js/research.js` — the **research dossier** (linked from the topbar `❖ research`
  pill): the supporting-world models from the three modelling wings, collated as a scientific report
  with three live "active figures" — the hull section + secant cable web (rind), the circular axis
  cross-section over the real ratchet topography (lakes as equipotential arcs + the ratchet river,
  ported from tide/ratchet) (tide), the closed food-web loop (biome). Note the
  secant duality across the two circular figures: a cable IS a secant (structure), a lake is NOT one
  (the ratchet's equipotential arc). The figure kernels in `research.js` are pure/zero-dep and
  re-derive each wing's headline physics (hoop is pure-static and can't import a sibling wing at
  runtime); they're pinned by `test/research.selftest.mjs` against the numbers the wings publish.
- `paint/` (`paint/index.html` + `paint/voronoi.js`) — a **rendering playground** at
  `hoop.mino.mobi/paint/` for how the foam rooms are drawn: seed the floor-plan **membranes** with
  fine Voronoi nuclei (**wall spacing** ⇒ wall thickness), and **density-grade** the floor nuclei — a
  big seed at each room centre, fining toward the walls (**room spacing** ⇒ interior coarseness) — so
  detail goes where it's needed and the cells fit between the two. **Doors** are two-nuclei-wide gaps
  cut in the wall + floor-bridged (a spanning tree keeps every room connected; `loops` adds roads).
  **Zones** force higher-order structure: rooms agglomerate into sized super-regions (graph-Voronoi,
  weighted so a "program" can mix housing-16 + hospital-64) — dense doors inside a zone, a sparse
  arterial tree between zones. Sliders for wall/room spacing, room size, loops, zone size; mixed-
  program + tint/floor-plan/roads/nuclei toggles. Geometry kernel is pure + node-tested
  (`test/paint.selftest.mjs`, 34 checks: grading, door connectivity, zone connectivity + arterials);
  the page only draws what `buildScene()` returns. A sandbox to iterate the look before world.js.
- `econ/` (`econ/index.html` + `econ/econ.js`) — **economies as ecosystems**, the ideation canvas at
  `hoop.mino.mobi/econ/`. A place is the economic cousin of a biome species: a **role** (verb) × a
  **domain** (matter) × **flows** (`in`/`out` resource tokens). `buildField()` scatters a big field,
  Voronoi-tiles it (reuses `paint/voronoi.js` primitives) and wires each `in` to its nearest `out` —
  a **supply web** you read like a food web (closure %, gaps, keystones). Post-scarcity tell: the
  real output is `regard` (the ATProto economy of esteem). Brutalist render (flat cells, thin lines,
  the web as faint edges); colour by role/domain/tier. Pure + node-tested (`test/econ.selftest.mjs`).
  **Ideation stage** — the real build is intended for a fresh `main` later; this is the sketchpad.

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
node hoop/test/research.selftest.mjs        # dossier figure kernels vs. the wings' published numbers
node hoop/test/postal.selftest.mjs          # the postal system: addressing, locality, Merkle digests
node hoop/test/nav.selftest.mjs             # two-tier HPA* routing over the real engine tiles
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
