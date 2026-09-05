# bsky — bsky.mino.mobi

<!-- HAND-OWNED. Seeded by scripts/gen-surface-docs.mjs, then rewritten.
     Repo-wide rules live in ../CLAUDE.md; the index is ../docs/SURFACES.md. -->

An **AppView with no database**. Type a handle; the page assembles that account's
timeline in-tab and keeps it live. There is no index here, no cron, no D1, and
nothing is persisted — reload and it's gone.

It exists to prove a specific claim in [`docs/APPVIEW-FEASIBILITY.md`](../docs/APPVIEW-FEASIBILITY.md):
that the aggregation an AppView is *for* is now available to a browser, free,
from public services — so most of what people mean by "build our own AppView"
needs no backend at all.

## Facts

| | |
|---|---|
| Surface | `bsky` |
| Dir | `bsky/` |
| Endpoint | `bsky.mino.mobi` |
| Type | frontend (Worker-with-assets; the worker is one route) |
| Owning branch | `claude/bsky-app-view-feasibility-8sdflz` |
| Deploy | [`.github/workflows/deploy-bsky.yml`](../.github/workflows/deploy-bsky.yml) |
| Uses | — (no shared backend; three public services, none of ours) |
| Provides | — |

## How it works

Three services do the work an AppView would otherwise do, and each answers a
different kind of question:

| Question | Answered by | Auth |
|---|---|---|
| what did the people I follow just post? | **Jetstream v2** live tail, `dids` filtered to the follow graph | none |
| how many likes / reposts / replies / quotes? | **Constellation**, the global backlink index | none |
| who is this account (name, avatar)? | the public AppView, hydration only | none |

**The load-bearing trick is Jetstream v2's `dids` filter.** It accepts up to
10,000 accounts and filters *server-side*, so a personal timeline is one
WebSocket rather than one request per followed account. That single fact is
what removes the backend. `packages/atproto/jetstream.js` is the client.

Constellation is the other half: a network-wide *reverse* index (target →
records pointing at it), which is the one thing a browser genuinely cannot
compute for itself. `packages/atproto/constellation.js` wraps it; `postCounts()`
returns the `{likeCount, repostCount, replyCount, quoteCount}` an AppView would
have handed you, in one request.

The public AppView is used **only** for profile hydration and the seed fallback.
Sourcing the feed from it would make this a client, not an AppView, which is the
whole distinction the surface is here to demonstrate.

## Why there is a worker at all

One asymmetry in Jetstream v2:

- **live tail** — WebSocket, no auth, not metered → the browser does it itself.
- **replay / snapshot** — HTTP, **API key**, metered in bytes → needs a secret holder.

A key in a static page is a published key, so `worker.js` proxies the archive
endpoints at `/api/replay/*` behind `JETSTREAM_API_KEY`, with an allowlist
(`planSnapshot`, `listSegments`, `getSegment`) rather than a pass-through — this
worker holds a metered credential. `Range` and `Retry-After` pass through both
ways, because a metered download that hits its quota resumes from a byte offset
instead of re-paying for what it already has.

**The secret is not set.** Until it is, `/api/replay/*` answers 503 with a
reason, `/api/health` reports `replay: false`, and the page says so in its
status strip. History then falls back to `seedFromAppView()` — a capped
fan-out over the public AppView, which is the expensive path and is labelled as
such in the UI. That is deliberate: the fallback makes the cost of *not* having
replay visible instead of hidden.

## Quirks

- **It starts empty, and that is the product.** A live tail has no past. A quiet
  follow graph stays quiet for a while; the empty state explains this rather
  than spinning.
- **Delivery is at-least-once.** Jetstream replays the cursor inclusively and may
  redeliver across a reconnect, so every write is keyed on the record's `at://`
  URI (`eventUri()`). Handlers must stay idempotent.
- **Deletes arrive as events**, carrying no record — just collection and rkey.
  The feed removes the post rather than ignoring the event.
- **Account-level events** (`identity`, `account`, `sync`) carry no collection
  and flow even to a collection-filtered consumer, by design. This surface only
  subscribes `kinds=commit`, so it doesn't see them; anything that needs to react
  to an account deletion must widen `kinds` rather than filter them out later.
- **The DOM is the only store.** A 400-post ring buffer, trimmed oldest-first.
- `bsky/packages/` is **gitignored** and staged at deploy time from
  `packages/atproto/` (the `b/` and mappa pattern) — the assets root is `bsky/`,
  so `../packages/` would 404 in the browser. Edit `packages/atproto/`, never a
  staged copy. Changes to those three modules are in this workflow's `paths:`,
  so they redeploy this surface.

## Deploying

Pushes to `claude/bsky-app-view-feasibility-8sdflz` touching this surface's
paths trigger [`deploy-bsky.yml`](../.github/workflows/deploy-bsky.yml).
`main` does not deploy — see the repo [`CLAUDE.md`](../CLAUDE.md).

**`bsky.mino.mobi` did not resolve before this branch.** No worker owned it, so
the first deploy attaches the custom domain. Per the golden rule, green is not
proof: **confirm the run log binds `bsky.mino.mobi (custom domain)`**, and
`curl -sI https://bsky.mino.mobi` before believing the surface is live.

## Not done yet

- Nothing has been run against a browser. The Constellation helper was tested
  live from node; the Jetstream client's URL building and DID bounding were
  unit-checked, but **no WebSocket has been opened from this sandbox** — the
  live tail is unverified end to end.
- No moderation. Labels, blocks and mutes are not applied. An AppView that
  showed anyone else's timeline would need them before it were fair to call it
  one; see §6 of the feasibility doc.
- Threads, notifications and search are absent by design — the first two need
  state, the third needs an inverted index.
