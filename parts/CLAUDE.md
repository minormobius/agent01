# parts — cad.mino.mobi/parts/

Communities of CAD parts, Reddit-shaped, with nothing stored on our side
that a person's repo does not hold. The CAD it fronts is
[`packages/cad/`](../packages/cad/CLAUDE.md); the design reasoning is
[`docs/CAD.md`](../docs/CAD.md) §15 and the system page at
`cad.mino.mobi/docs/`.

## Facts

| | |
|---|---|
| Surface | `parts` |
| Dir | `parts/` — `worker.js` + `lib/` are the worker and the index; `site/` is the asset root |
| Endpoint | `cad.mino.mobi/parts/` — mounted by the cad worker through a service binding; no host of its own (Quirks) |
| Type | frontend (with one Durable Object) |
| Owning branch | `claude/browser-cad-ideation-ollmd3` |
| Deploy | [`.github/workflows/deploy-parts.yml`](../.github/workflows/deploy-parts.yml) |
| Uses | `auth.mino.mobi` (sign-in and the proxied writes); `cad.mino.mobi` (the front door, and its `/xrpc/` gateway for part details); Constellation for discovery |
| Provides | — |

## What it is

Four records, all in their authors' own repos, all in the auth worker's
scope ceiling (`workers/auth/src/oauth/scope.ts`, owned by this branch):

| record | in whose repo | holds |
|---|---|---|
| `com.minomobi.cad.community` | the founder's; **rkey = the slug** and the record's `name` must equal it | `name`, `title`, `description`, `rules`, `createdAt` |
| `com.minomobi.cad.post` | the poster's | `community` strongRef, `part` strongRef **to a revision** (never a head — what people voted on cannot change under them), `title`, `text`, `createdAt` |
| `com.minomobi.cad.comment` | the commenter's | `post` strongRef, optional `parent` strongRef to a comment, `text`, `createdAt` |
| `com.minomobi.cad.vote` | the voter's | `subject` strongRef (post or comment), `value` 1 or −1, `createdAt`; one per person per subject, the newest wins |

Alice founding a community does not make her host Bob's posts. Bob's post
lives in Bob's repo and points at Alice's community; the front page is an
**index**, not a repo.

- **`lib/index.js`** — the index over a two-call db seam (`run`, `all`).
  `indexRepo(did)` lists the four collections from that repo's PDS and makes
  the index agree with it, deletes included. `sweep()` discovers repos
  nobody told us about through **Constellation** backlinks (who links to
  each community, post and comment), in rounds, bounded per run, then
  refreshes the stalest known repos. Queries: `communities`, `community`,
  `feed` (hot / new / top; hot is Reddit's formula), `post`, `thread` (a
  tree, scored), `mine`, `status`.
- **`worker.js`** — `PartsIndex`, one Durable Object with its own SQLite
  (`ctx.storage.sql`; no D1, no migrations), a singleton by name; `/api/*`
  is forwarded to it; the cron (every 15 min) posts `/api/sweep`. Sweeps
  are serialised by a flag. **No firehose socket, on purpose:** the hose
  surface measured a permanently open Jetstream socket at most of the
  account's duration allowance; for a handful of CAD records a day,
  self-reporting plus backlinks is the honest design.
- **`site/`** — one page, hash-routed: front (hot / new / top, the
  communities), a community, a post with its thread, *post a part* (pick
  one of your files on cad.mino.mobi — its current revision is what gets
  posted — or paste a revision URI), *found a community*. Sign-in is the
  shared client (`site/vendor/auth.js`, synced from
  `packages/oauth-client/`) with the narrow scope of the four collections.
  **After every write the page posts `/api/index?repo=<me>`**, so what you
  wrote is on the page before Constellation has seen it. Part details come
  from `cad.mino.mobi/xrpc/` (the revision's own `invariants`); the part
  opens in the viewer by revision URI.

## How a post gets on the front page

1. Bob signs in on cad.mino.mobi/parts/ and posts: a `post` record is written to
   Bob's repo through auth.mino.mobi.
2. The page calls `POST /api/index?repo=<bob>`; the index lists Bob's repo
   and the post appears.
3. Had Bob written the record some other way, the next sweep would find
   him: Constellation indexes his post's link to the community, and the
   sweep asks "who links to this community" for every community it knows.

## Tests

- `node parts.selftest.mjs` — the index under `node:sqlite` with a fake PDS
  and a fake Constellation: shaping rules, indexRepo by handle, discovery in
  rounds, hot/new/top, threads, one vote per person, deletes propagating,
  staleness, unresolvable repos. The deploy runs it.
- `node browser.selftest.mjs` — the page in headless Chromium against the
  same index mounted on a local server under `/parts/` (`handleApi` from
  `worker.js`). Skips, saying so, when Playwright is not installed (`npm ci`
  in `packages/cad/bakeoff`), which is what the bare preflight runner sees.

## Quirks

- **No host of its own, and why.** This was to be `parts.mino.mobi`. The
  first deploy uploaded the worker and then failed binding the domain: the
  `mino.mobi` zone is at Cloudflare's ceiling of **100 Workers custom
  domains** (API code 100122), and the deploy token cannot write the DNS
  record a `routes` entry would need (`docs/DEPLOYS.md` §6). So the cad
  worker mounts this one at `/parts/` through its `PARTS` service binding
  (`packages/cad/wrangler.jsonc`), stripping the prefix, and this
  `wrangler.jsonc` declares no route and `workers_dev: false`. The page uses
  relative URLs (`api/…`, `./app.js`) so it works at either place; the
  browser selftest serves it under `/parts/` to keep that true. Same origin
  as the viewer is a gain: one auth cookie, the gateway is `'self'`.
- **Green is not proof.** Two deploys make the front door — this worker,
  then the cad worker with the binding. `curl
  https://cad.mino.mobi/parts/api/status` is the check; both workflows run it.
- The Durable Object's SQLite is the only state. Deleting the object (a
  migration `deleted_sqlite_classes`) empties the site; `/api/sweep` and
  writers' self-reports rebuild it from the network, which is the point.
- A community's slug is its rkey and cannot change; a `name` that disagrees
  with the rkey is not indexed. Two founders can use the same slug in two
  repos; `communityByName` returns the oldest seen, `community?uri=` is exact.
- No moderation yet beyond a founder deleting the community record (its
  posts leave the front page; the records stay in their repos). Labelers
  and the community's `rules` applied by the index are the next cut.
