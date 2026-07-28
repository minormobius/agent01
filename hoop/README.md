# hoop — the infinite game

**Live at:** `hoop.mino.mobi`
**Stack:** Cloudflare Worker (ASSETS binding) + vanilla ES modules. No build step.

hoop is **the game**, and the **main site** of the four-part O'Neill cylinder modelling
package. The current version of the game (`v108/`) is served at the domain root: a
deterministic glyph-world adventure over the cylinder — walk the nave's commons and six
faction wards, descend to the upper and lower rind, follow a seeded quest spine cast from
a live ATProto content pool, brew, forge, garden, and fight. Every place, save and message
is an ATProto record in the player's own PDS; sign-in is the shared `*.mino.mobi` OAuth
worker.

| Wing | Surface | What it is |
|---|---|---|
| **The game** | `hoop.mino.mobi` *(this — main site)* | the current version, mirrored at the root |
| **The structure** | [`rind.mino.mobi`](../rind) | the foam space-frame shell + the frame solver |
| **The thermodynamics** | [`tide.mino.mobi`](../tide) | atmosphere, optics, water/energy ledgers |
| **The ecosystem** | [`biome.mino.mobi`](../biome) | the closed food-web model |
| **The past** | [`hoop-archive.mino.mobi`](../hoop-archive) | the museum: the first-pass room, v2–v8, v090–v107 |

Alongside the game, this surface keeps the design wings it imports at runtime: the engine
snapshot (`v099/`), the floor builders (`nave/`, `rind/`), the industrial-metabolism
research pages (`forge/`), and the design tools (`chunkroller/`, `paint/`, `econ/`).

Everything older than the current version was moved to **hoop-archive** in the 2026-07
wrap-up; this worker 301-redirects archived paths there. The intellectual history of the
whole project is told at `mino.mobi/hoop-history/`.

Operational details, invariants, and the version-promotion recipe: [`CLAUDE.md`](CLAUDE.md).
