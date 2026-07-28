# board — the infinite whiteboard (board.mino.mobi)

A spatial canvas that holds pictures, voice notes, links, files and text snips —
and other canvases. One board is **one `com.minomobi.board.canvas` record in the
author's own repo**; media are blobs on their own PDS. There is no backend, no
database, no server-side state. The Worker serves files and nothing else.

Owning branch: `claude/atproto-infinite-whiteboard-usdpzx`. Worker `board`,
custom domain `board.mino.mobi`, assets `.` (so `lexicons/` is published too).

---

## The one idea

A whiteboard can contain a whiteboard. Select a few things, press `⌘G`, and they
move into a child board that is a record of its own, leaving a **portal** item
where they were. That single gesture is doing three jobs at once, which is why
the whole app is built around it:

1. **Organisation.** It is the "put this in a folder" move, except the folder
   keeps its position on the canvas and you can still draw arrows to it.
2. **Abstraction.** A connector that crossed the boundary is *not* deleted — it
   re-points at the portal. "These three notes relate to that one" becomes
   "that cluster relates to that one", which is what you meant.
3. **Sharding.** A PDS record has a size ceiling (~1 MB). Nesting is how a board
   stays under it. The size meter in the footer turns amber before it matters
   and the nag says *nest*, because that is the actual fix.

`board/engine.js` implements `nest`, `absorb` (drag a selection onto an existing
portal) and `unnest` (unpack it again). All three are pure functions, and the
edge-rewiring rules are asserted in `engine.selftest.mjs` — read those tests
before changing any of it. The lossy step is deliberate and documented: nesting
collapses several crossing edges onto one portal edge, so unpacking cannot know
which inner item each meant, and re-attaches by proximity.

## Files

| File | What it is |
|---|---|
| `engine.js` | pure core: geometry, camera, hit testing, edge routing, nest/absorb/unnest, record ↔ doc |
| `engine.selftest.mjs` | 157 known-answer assertions. `node board/engine.selftest.mjs` |
| `store.js` | two-tier persistence: localStorage + IndexedDB mirror, PDS records via the shared auth worker |
| `media.js` | DID/PDS resolution, blob URLs, image shrinking, waveforms, voice recording, link unfurl |
| `render.js` | doc → DOM. The canvas is transformed DOM, not `<canvas>` |
| `app.js` | input, tools, routing, chrome |
| `lexicons/` | `com.minomobi.board.canvas` + `com.minomobi.board.defs`, published at `/lexicons/…` |
| `vendor/auth.js` | **generated** — `scripts/vendor-board.sh` copies `packages/oauth-client/auth.js`. Gitignored; the deploy workflow writes it. Never edit |

## Data model decisions worth not re-litigating

- **Items carry their own coordinates, inside the board record.** Not one record
  per item. A board is the unit you open, share and version; splitting it would
  mean N round-trips and no atomic save, in exchange for a granularity nobody
  asked for. Nesting bounds the size instead.
- **A portal points with an `at-uri`, not a strongRef.** The target is mutable
  by design; a CID would make every child edit invalidate its parent.
- **An `embed` item does use a strongRef** — it quotes immutable content.
- **`camera` is stored per board.** Reopening should put you where you left off;
  that continuity is most of what makes a canvas feel like a place.
- **Coordinates are integers, rounded in exactly one place** (`toRecord`).
  Sub-pixel drift in a record rewritten on every drag is an endless stream of
  no-op writes to someone's repo. `toRecord(fromRecord(x)) === x` is a test.
- **Unknown `content` union members are dropped on load, not rendered.** A board
  written by a newer client still opens here, minus what this build can't draw.
- **Items whose blob has not uploaded yet are withheld from the record**, not
  written half-formed.

## Auth and scope

Shared OAuth worker (`auth.mino.mobi`) via `AuthClient`. Scope requested is
deliberately narrow — `atproto`, `repo:com.minomobi.board.canvas`, and the three
blob types — so the consent screen reads like a description of this app.

`com.minomobi.board.canvas` is in `WRITE_COLLECTIONS`
(`workers/auth/src/oauth/scope.ts`). **That worker must be redeployed from its
own branch before writes work in production** — the metadata ceiling has to be a
superset of what this site asks for.

## Signed out

Everything works: boards live in `localStorage`, dropped media in IndexedDB.
Boards mint their own TID rkey at birth, so a local board already has a stable
identity and its portals already know which rkey they point at — signing in only
fills in the `at://`s (`withIdentity`), uploads the parked blobs and writes it
all up (`store.promoteLocal`). Nothing is re-identified, so nothing breaks.

## Sharing

A board record is public the moment it is written, so `#/at/<did>/<rkey>` renders
anyone's board read-only, reading `com.atproto.repo.getRecord` straight off their
PDS and blobs via `com.atproto.sync.getBlob`. No appview, no server of ours,
no auth. Portals inside a shared board resolve too, so a whole tree is shareable
by its root.

## Quirks

- Blob URLs point at the **author's** PDS, resolved through `plc.directory`.
  A viewer on a foreign board needs that resolution to work; there is no proxy
  fallback for other people's blobs by design.
- Link unfurling uses Bluesky's public `cardyb` extractor, best-effort. A
  failure gives a bare card with the hostname, which is still a usable object.
- The inspector panel only rebuilds when the *selection* changes — otherwise a
  render triggered by anything else would yank focus out of a field mid-type.
- `_fillKey` in `render.js` decides when a card's innards are rebuilt. Keeping
  it precise is what stops a re-render from stomping a half-typed note.
- Last write wins. Two tabs on one board will clobber each other; the PDS proxy
  has no compare-and-swap.

## Deploying

Push to the owning branch with something under `board/**` touched. The workflow
runs the engine selftest, vendors `auth.js`, then `wrangler deploy`.
**Confirm the run binds `board.mino.mobi (custom domain)`** — the domain has
never been attached before, and if the account cannot attach it from the API
that is a dashboard step (`docs/DEPLOYS.md` §7). Green is not proof.
