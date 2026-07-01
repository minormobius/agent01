# hoop — designing the infinite game

**Live at:** `hoop.mino.mobi`
**Stack:** Cloudflare Worker (ASSETS binding) + vanilla ES modules. No build step.

hoop is **the game**, and the **main site** of a four-part O'Neill cylinder modelling
package. The package splits the megastructure into four independent deploy surfaces, each
with its own subdomain, landing page and `CLAUDE.md`:

| Wing | Surface | What it is |
|---|---|---|
| **The game** | `hoop.mino.mobi` *(this — main site)* | the infinite game: a world you walk, where every place is a forum thread |
| **The structure** | [`rind.mino.mobi`](../rind) | the foam space-frame shell + the Rust/WASM frame solver that scores it |
| **The thermodynamics** | [`tide.mino.mobi`](../tide) | the radial atmosphere column, fog optics, the fountain & sun, the water/energy ledger |
| **The ecosystem** | [`biome.mino.mobi`](../biome) | the closed food-web box model + allometry + roster + stability lab |

The three modelling wings are reachable from hoop's topbar; each cross-links back. hoop
itself shed its structural half (the `cylinder.html` / foam / solver tooling) to `rind` in
the cylinder-refactor — what remains here is purely the game.

A collaborative design space for *the infinite game*. The pitch in one line:
**the map *is* the forum.** You walk an `@` around a Caves-of-Qud-flavoured
glyph world; every glowing node on the map is a *place* — a part of the game
design — and each place anchors one long-running conversation thread. Drop a new
node at your feet to open a new thread. Everything is quasi-permanent because
every place and every message is an **ATProto record**.

This is the preview of the eventual shape: **a game engine with a forum
attached.** The canvas is the engine surface; the right rail is the forum.

## Layout

```
hoop/
├── index.html          # shell: topbar, canvas pane, thread rail, status bar
├── research.html       # the research dossier: the supporting-world models (rind/tide/biome),
│                       #   collated as a scientific report with 3 live "active figures"
├── css/style.css       # phosphor-on-ink visual language
├── js/
│   ├── research.js     # the dossier's figure kernels (pure + node-testable) + canvas wiring
│   ├── app.js          # controller — wires world ⇆ store ⇆ thread rail ⇆ auth ⇆ presence
│   ├── world.js        # the canvas adventure: deterministic glyph map, @ movement,
│   │                   #   BFS click-to-walk, place glyphs, FOV dimming, live peers
│   ├── store.js        # data model + two backends (Local / ATProto) + threading
│   ├── presence.js     # client of the live presence socket (throttled, auto-reconnect)
│   └── atproto.js      # public read helpers (handle→DID→PDS, listRecords, profiles)
├── vendor/auth.js      # VERBATIM copy of /packages/oauth-client/auth.js (see banner)
├── lexicons/
│   ├── place.json      # com.minomobi.hoop.place   schema
│   └── message.json    # com.minomobi.hoop.message schema
├── worker.js           # serves static assets + exports the HoopRoom presence DO
└── wrangler.jsonc      # name=hoop, custom_domain route, HoopRoom DO binding
```

## Two tiers of state (the /mmo pattern)

State is split by temperature — the same hybrid `/mmo` (mmopaint) uses:

- **Hot / ephemeral → `HoopRoom` Durable Object** (`worker.js`). Live player
  positions and the online list, held in memory and broadcast over WebSockets at
  `/ws`. Nothing persists; disconnect = you fade from the map. This is what makes
  "I see you on the map, you see me" work. Presence is deliberately **not** a
  lexicon — you can't write a permanent firehose record on every footstep.
  - Identity is borrowed from the shared auth worker: the client passes its
    `mino_auth_session` token as `?session=…` (and the `.mino.mobi` SSO cookie
    rides along as a fallback); the DO validates it against `auth.mino.mobi/api/me`.
  - One global room (`idFromName('world')`). In-memory only — no DO storage —
    so eviction just drops the live socket set.
- **Cold / durable → ATProto lexicons** (`com.minomobi.hoop.place` / `.message`),
  written to each user's PDS. User-owned, forkable, permanent.

A future jetstream ghost layer (a mutable `com.minomobi.hoop.presence` record
tailed off the firehose) could give a no-socket, ~1–3s-laggy fallback.

## Data model (ATProto)

| Collection | What it is | rkey |
|---|---|---|
| `com.minomobi.hoop.place` | A node on the world map: `{title, glyph, kind, x, y, summary, createdAt}` | deterministic `"<x>-<y>"` so both designers converge on one place per coordinate |
| `com.minomobi.hoop.message` | A post in a place-thread: `{placeId, text, parentId?, createdAt}` | tid |

Messages reference a place by its deterministic `placeId` (not a cross-repo
strong ref), so each crew member's repo contributes to the same shared thread.
`parentId` nests replies.

## Two backends

- **Local (default).** `localStorage`, zero network, seeded with a starter world
  + a seed conversation between `mino` and `hoopy`. The preview is fully alive
  with no sign-in. The footer **persona** switch lets you post as either designer
  to demo a two-person thread.
- **ATProto (live).** Sign in (top-right) → "use atproto". Writes go to your PDS
  via the shared `auth.mino.mobi` worker proxy. Reads merge the public
  `hoop.place` / `hoop.message` records of everyone in the **crew** list (footer
  → `crew…`). Your own handle is always in the crew.

## Auth wiring (shared worker)

Uses the canonical `workers/auth/` worker, not a hand-rolled flow:

1. Origin `https://hoop.mino.mobi` is in `ALLOWED_ORIGINS` (`workers/auth/src/index.ts`).
2. `com.minomobi.hoop.place` + `com.minomobi.hoop.message` are in
   `WRITE_COLLECTIONS` (`workers/auth/src/oauth/scope.ts`) so the unified scope —
   and the Bluesky consent screen — cover them. **Redeploy the auth worker** for
   live writes to be granted.
3. The client is the shared `AuthClient`, vendored verbatim into `vendor/auth.js`
   (a no-build static site can't reach `/packages/` at runtime; the banner in the
   file explains how to re-sync it).

## Controls

`WASD` / arrows walk · **click** a node to open its thread · **click** floor to
walk there · **N** (or the footer button) drops a node where you stand.

## Deploy

`.github/workflows/deploy-hoop.yml` runs `npx wrangler deploy` from `hoop/` on
push to `main` or the owning branch in `deploy-registry.json` (currently
`claude/hoop-v101-audit-docs-xb82fs`) touching `hoop/**`.
Pure static Worker — no D1, no secrets beyond the shared Cloudflare credentials.
Verify the deploy log binds `hoop.mino.mobi (custom domain)` (the golden rule).
