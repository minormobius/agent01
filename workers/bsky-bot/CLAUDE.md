# bsky-bot — the lab factory's outer loop

Turns a Bluesky mention into a built website. Cron-polls the service account's
notifications, decides which mentions are requests, reserves what each needs,
and fires the build. **It never touches code** — `lab-build.yml` does that.

```
mention → whitelist → SlotRegistry.claim → repository_dispatch → reply in-thread
```

Design record: [`docs/LAB-FACTORY.md`](../../docs/LAB-FACTORY.md), especially §10.

## Facts

| | |
|---|---|
| Surface | `bsky-bot` (headless — no domain) |
| Dir | `workers/bsky-bot/` |
| Deploy | [`.github/workflows/deploy-bsky-bot.yml`](../../.github/workflows/deploy-bsky-bot.yml) |
| State | `SlotRegistry` Durable Object + `STATE` KV |

## Routing needs no model call

Every ATProto reply carries `reply.root.uri`, and every later reply in a thread
carries the **same** root. So the thread root is an exact key:

```
th:<root_uri> → { slug, slot, did, handle, builds }
```

A mention with no matching row is a new site; one that matches is an iteration on
that site. Two branches, no ambiguity, no LLM in the router.

**An explicit @-mention is required to act.** A thread collects "nice!" and other
chatter, and deciding whether a reply is a change request is exactly the sort of
judgement that would otherwise want a model. Requiring the mention makes it a
string test.

**A thread belongs to whoever started it.** Someone else replying into your
thread cannot redirect your build — the DID is checked against the row.

## Three kinds of state, deliberately separate

They answer different questions and must not be conflated:

| Key | Question |
|---|---|
| `th:<root>` | which site is this mention about? *(identity)* |
| slot assignment | where does a new site go? *(capacity)* |
| `lock:<did>` | how many builds may this person have running? *(concurrency)* |

A Durable Object rather than KV because identity and concurrency are
read-modify-write under contention — KV is eventually consistent and would
cheerfully hand one slot to two simultaneous mentions.

## Two independent safety interlocks

Both in `wrangler.toml` [vars], both fail-closed:

- **`WHITELIST`** — comma-separated handles. **Empty admits nobody.** This is the
  admission control the bot that inspired this project lacked; it was pulled for
  cost because anyone could trigger it.
- **`BOT_ENABLED`** — anything but `"true"` means observe-and-reply: the bot
  routes, claims and answers in-thread, but never dispatches and never spends.
  Leave it off until the routing has been watched in a real thread.

## Human prereqs the deploy cannot do

1. Create the KV namespace (`create-kv-namespace.yml`), paste its `id` into
   `wrangler.toml` — the deploy hard-fails while it is empty.
2. Mint a Bluesky **app password** for the service account → GH secret
   `BLUESKY_BOT_APP_PASSWORD` (handle → `BLUESKY_BOT_HANDLE`).
3. Mint a fine-grained PAT with **`actions:write` on this repo only** → GH secret
   `LAB_DISPATCH_TOKEN`. Its sole job is `repository_dispatch`; it needs nothing
   else and should be scoped accordingly.
4. Put real handles in `WHITELIST`.

## `lab-build.yml` must be on `main` first

`repository_dispatch` only resolves for workflows present on the **default
branch** — GitHub 404s a workflow that exists only on a feature branch. So the
bot cannot fire anything until the inner loop merges, no matter how it is
configured. That is the current blocker, not a bug.

## Deploying

Pushes to the owning branch touching `workers/bsky-bot/**` deploy it. The deploy
typechecks first: this worker is a router, and a type error here is a mention
silently dropped at 3am.
