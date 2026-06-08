# hoop — designing the infinite game

**Live at:** `hoop.mino.mobi`
**Stack:** Cloudflare Worker (ASSETS binding) + vanilla ES modules. No build step.

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
├── css/style.css       # phosphor-on-ink visual language
├── js/
│   ├── app.js          # controller — wires world ⇆ store ⇆ thread rail ⇆ auth
│   ├── world.js        # the canvas adventure: deterministic glyph map, @ movement,
│   │                   #   BFS click-to-walk, place glyphs, FOV dimming, scanlines
│   ├── store.js        # data model + two backends (Local / ATProto) + threading
│   └── atproto.js      # minimal public read helpers (handle→DID→PDS, listRecords)
├── vendor/auth.js      # VERBATIM copy of /packages/oauth-client/auth.js (see banner)
├── lexicons/
│   ├── place.json      # com.minomobi.hoop.place   schema
│   └── message.json    # com.minomobi.hoop.message schema
├── worker.js           # serves static assets (thin, room for a future API)
└── wrangler.jsonc      # name=hoop, custom_domain route = hoop.mino.mobi
```

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
push to `main` or `claude/hoop-mino-design-preview-htuxu9` touching `hoop/**`.
Pure static Worker — no D1, no secrets beyond the shared Cloudflare credentials.
Verify the deploy log binds `hoop.mino.mobi (custom domain)` (the golden rule).
