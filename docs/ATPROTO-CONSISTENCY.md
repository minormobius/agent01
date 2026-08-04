# The ATProto touchpoints — an audit of `b` and `photo`

**Audited**: 2026-08-01 · **Scope**: `b/` (14 tools) and `photo/` — the two
surfaces that touch ATProto identity, auth and repositories, now owned by one
branch.

The question was whether these tools handle four things the same way: OAuth
scope, handle entry, reading someone's posts, and naming an account. They do
not, and the shape of the inconsistency is the finding:

> **Every shared capability already exists. Each is used by one or two tools,
> and the rest reimplement it or go without.**

This is the narrow companion to [`SOCIAL-STACK-AUDIT.md`](SOCIAL-STACK-AUDIT.md)
(2026-07-01), which catalogued the whole social stack. That audit had already
found two of the things below and filed them as **F-06** (feedgen's stale auth
fork, with the exact narrow scope prescribed) and **F-02** (photo missing its
golden-rule `routes` block). Both sat open for five weeks; both are closed by
this pass, and marked `✅` there. Where a finding here has a number, it is that
register's — one list, not two.

That is a better problem than "nobody built it", because the fix is adoption
rather than invention. It is also worse than it looks, because the copies drift
in ways that change behaviour rather than just duplicating it.

| Capability | Canonical home | Reach before | Reach after |
|---|---|---|---|
| OAuth client | `packages/oauth-client/auth.js`, staged at deploy | coin, lathe — **feedgen ran an old fork** | coin, lathe, feedgen |
| Handle typeahead | **two** implementations, two APIs | 6 tools + 5 tools | 11 tools, one file |
| handle → DID → PDS | **11 separate copies** | everyone rolls their own | `b/lib/identity.js` exists; adoption is incremental |
| Account as avatar + handle | `b/lib/hovercard.js` | lathe only | + `identityChip` in coin, feedgen, sleuth |
| Whole-repo CAR + cache | `b/lathe/runtime.js` | lathe only | unchanged — see §3 |

---

## 1. OAuth scope — one real over-ask, and it was not just the scope

Everything else was already narrow, and narrow in a way worth copying: `/coin`
declares `COIN_SCOPE`, `/lathe` **derives** a scope per genome (a toy with no
sink never loads the auth lib at all), `photo/albums` uses `ARENA_SCOPE`,
`photo/shop` asks for posting and escalates to albums only on first save.

`/feedgen` passed **no scope**, which falls back to the union of every
collection every mino.mobi site writes — forty lexicons on the consent screen to
build one feed. Now `atproto repo:com.minomobi.feedgen.def
repo:app.bsky.feed.generator`, which is exactly what it writes. Both were
already inside the auth worker's declared ceiling, so no worker change.

**But the scope was the symptom.** `/feedgen` imported a *private* `auth.js`,
170 lines diverged from the canonical client and missing:

- the entire scope family — `scopeTokens`, `hasScope`, `ensureScope`. It could
  not have asked for a narrow scope, and could not escalate.
- `_maybeSlideSession` — the sliding renewal. Its users were signed out every
  30 days regardless of use.
- `_loadUserCache` — the transient-failure grace. A radio still waking up read
  as "your session is gone".

Deleted; it imports the staged shared client like `/coin` does.

> **A copy of an auth client is not a copy of a utility.** It rots into a
> different security posture, and it does it quietly — nobody files a bug for
> "signed out again", they just sign in again.

## 2. Handle entry — two components, and markup asking for the absent one

There were two typeaheads: `b/lib/handle-typeahead.js` (imperative,
`attachHandleTypeahead(el, {onPick})`, 6 tools) and `b/feedgen/typeahead.js`
(declarative, auto-attaching to `[data-bsky-typeahead]`, 5 tools). Five tools
were reaching across a directory boundary to load one tool's private script.

The shared lib now understands **both spellings** — the function, and the
attribute, including on inputs added after first paint (feedgen builds one per
rule row, and a late input is exactly the one someone is about to type into).
`b/feedgen/typeahead.js` is gone and all eleven load `/lib/handle-typeahead.js`.

Still without one, and deliberately: `b/gc` takes *lists* of handles in
textareas — multi-handle entry is a different control, not a missing one.
`photo/dm` has a single handle input that should get it.

**This audit found a bug of its own**: `b/sleuth` was calling
`onPick: (a) => loadPosts(a.handle)`, but `onPick`'s first argument is the
handle *string* and the second is the actor. Picking from the dropdown silently
loaded `undefined`. Fixed.

## 3. Reading someone's posts — the CAR rule, stated

`b/lathe` has the whole-repo path and nothing else does: one
`com.atproto.sync.getRepo`, parsed by the Rust→WASM parser staged into
`b/lib/atproto` at deploy, **cached per DID in IndexedDB with a 6h TTL** so
several toys over one account pay the download once. It even has a rule for
when to use it — the *haystack rule*: a lens hunting rare things gets upgraded
from the paged feed to the full archive, because a needle hunt needs the stack.

Everything else paginates: `/sleuth` (10 × `listRecords` for 1000 posts),
`/squares`, `/disk`, `/feedgen`. `photo/explore` has its **own** CAR pipeline
and its own WASM copy.

**I have not unified this, and the reason is a measurement, not caution.** On a
real repo (`antiali.as`, 27,295 records) the CAR is **11.5 MB in one request**;
`/sleuth`'s thousand posts are **10 requests of a few hundred kB**. The CAR wins
decisively for completeness and loses badly for recency. So the rule, which is
lathe's rule generalised, is:

> **Download the CAR when the question is about the whole archive — anything
> rare, anything historical, anything counted. Paginate when the question is
> about recent posts.** A tool that starts paginating and then needs more than
> ~2,000 posts should have taken the CAR; one that needs the last 200 should
> never take it.
>
> And when you do take it, **cache the parse, not the bytes** — keyed by DID,
> in IndexedDB, as `b/coin/lexicon.js` and `b/lathe/runtime.js` both already do.

By that rule `/sleuth` is a genuine candidate (its dossier reads the *whole*
timeline; its search wants everything ever said) and `/squares` is not (last
week's interactions). Doing it properly means promoting the archive loader out
of `b/lathe/runtime.js` into `b/lib/`, which is a change to lathe's hot path and
wants its own pass with lathe's two selftests green — not a drive-by.

## 4. Naming an account — a DID is a key, not a name

`/coin` and `/feedgen` both rendered `user.handle || user.did`. The fallback
fires exactly when the label is least useful:
`did:plc:cp5hnfgqbgjdbizyqyp4zgdl` tells a reader nothing, does not fit a phone,
and is not what they typed.

`b/lib/identity.js` gained `identityChip(who)` — avatar, then `@handle`,
resolved from the public appview, filling the picture in asynchronously because
the handle is usually known immediately and should not wait on an image. It
falls back to a *shortened* DID only when the network is gone. Adopted in
`/coin`, `/feedgen` and `/sleuth`'s dossier header.

`b/lib/hovercard.js` is the richer version of the same idea — profile and post
previews on hover — and is still lathe-only. It is the obvious next adoption.

---

## The design language, in one paragraph

An ATProto-touching page here should: **ask for the scope it writes and nothing
more** (derive it if the write is dynamic, escalate just in time rather than up
front); **accept a handle through the shared typeahead**, by attribute or by
call; **name accounts with an avatar and a handle**, never a raw DID; and
**choose its read path by question** — the CAR for the archive, pagination for
the recent, and cache the parse either way.

## Deploy config, while we were here

`b/wrangler.jsonc` names its custom domain in a `routes` block; `photo` did not,
which is **F-02**. photo kept deploying correctly only because the domain is
attached to the same worker out of band — the deploy log said
`https://photo.majormobius.workers.dev` and nothing else, so a green run proved
nothing about the live site. That is precisely the failure `docs/DEPLOYS.md` §4
calls the golden rule. Now declared, so every deploy asserts the binding.

## Still open

- Promote the archive loader out of `b/lathe/runtime.js` into `b/lib/`, and move
  `/sleuth` onto it (§3).
- `photo/explore`'s CAR pipeline and `b`'s are two implementations of one thing,
  on two surfaces. Only worth merging when something else needs it.
- `photo/dm`'s handle input has no typeahead.
- `b/lib/hovercard.js` beyond lathe.
- `b/gc` resolves DIDs by hand and shows some of them.
