# auth — auth.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../../CLAUDE.md; the index of all surfaces is ../../docs/SURFACES.md. -->

The shared ATProto OAuth worker (BFF confidential client: PKCE + DPoP + PAR + private_key_jwt). One login = SSO across every *.mino.mobi site via a domain cookie; narrow per-site scopes with just-in-time escalation; browsers never hold PDS tokens — writes go through the DPoP-bound /pds/* proxy. Sessions in D1 mino-auth-db.

## Facts

| | |
|---|---|
| Surface | `auth` |
| Dir | `workers/auth/` |
| Endpoint | `auth.mino.mobi` |
| Type | backend |
| Owning branch | `claude/atproto-infinite-whiteboard-usdpzx` (contested — see below) |
| Deploy | `.github/workflows/deploy-auth.yml` |
| Uses | `mino-auth-db` |
| Provides | `auth.mino.mobi` |

Machine-readable entry: [`deploy-registry.json`](../../deploy-registry.json) → `surfaces[]` where `surface == "auth"`.

## Who owns this, and why it is contested

Three branches have claimed `auth` at once. Before you deploy it, know which
tree you are deploying, because this worker is the highest blast radius in the
repo — a bad push signs everyone out of every site.

| Branch | State of its `workers/auth` |
|---|---|
| `claude/feature-merge-candidate-l4dkwq` | what `main`'s registry still names, and **stale**: 2509 commits ahead / 216 behind, and its `workers/auth` diff against `main` is a net *deletion* of 65 lines. Deploying auth from it would strip collections other live sites depend on. Do not. |
| `claude/standard-site-blog-page-319rod` | claims `auth` on its own branch; carries the `rant.mino.mobi` origin plus the four `site.standard.*` collections, not yet on `main`. |
| `claude/atproto-infinite-whiteboard-usdpzx` | current claimant. Carries **both** 319rod's additions and `com.minomobi.board.canvas`, so it is a strict superset of `main`, of 319rod, and of what production had. |

**The claim is a convention, not a lock.** A workflow's trigger list lives in the
workflow file *on the branch being pushed* — so 319rod pushing a change under
`workers/auth/**` still deploys auth from its own tree, which does not have
`com.minomobi.board.canvas`. If that happens, board's writes break again until
the merge candidate reconciles the two. The durable fix is the merge, not the
registry field.

Because of that, the rule for this surface is: **only ever add to
`WRITE_COLLECTIONS` and `ALLOWED_ORIGINS`, never remove**, and before deploying
check `git diff origin/main -- workers/auth` is additive. A superset can lose a
race harmlessly; a subset takes other people's sites down with it.

### The 2026-07-29 narrowing (what the rule is for)

Auth run #38 deployed from `claude/feature-merge-candidate-l4dkwq`, whose
`workers/auth` predates most of the current one. The ceiling went **66 → 61**
collections in one green build, taking out:

`com.minomobi.board.canvas` · `com.minomobi.ecdysium.save` ·
`com.minomobi.hoop.story.content` · `com.minomobi.hoop.story.rumor` ·
the four `site.standard.*`

so board, aub, hoop and rant all started failing login with
`PAR request failed (400): invalid_scope`. Nothing alerted; the symptom surfaced
as one user unable to sign in. (It also dropped four `ALLOWED_ORIGINS` entries,
which did no harm only because `isAllowedOrigin` has a `*.mino.mobi` wildcard
behind the list.)

Recovered by deploying the **union** — the 61 live collections, including that
branch's new `com.minomobi.lab.*`, plus the 8 it dropped.

`scripts/check-auth-scope.mjs` now runs in the deploy workflow and **fails the
build** if the tree would remove any collection the live ceiling has. Run it by
hand before touching this file:

```bash
node scripts/check-auth-scope.mjs        # vs production
```

It fails open if production is unreachable (a network blip should not wedge
deploys) and closed on a real narrowing. It lives in the workflow, which is
per-branch like every trigger list — so it protects this branch and `main`, and
protects everyone once the merge candidate lands.

### client-metadata.json is cached — deploying is not the same as propagating

The recovery above exposed a second, independent trap. `client-metadata.json`
used to be served with `Cache-Control: public, max-age=3600`, and **both**
Cloudflare's edge and the authorization server cache on it. So after a correct
deploy you could watch this happen:

```
$ curl -s https://auth.mino.mobi/client-metadata.json | …   # 61 collections (stale edge copy)
$ curl -s 'https://auth.mino.mobi/client-metadata.json?cb=1' | …   # 69 — the real one
```

and bsky.social kept rejecting PAR with `invalid_scope` for a collection the
worker was already serving. Three of the four recovered sites came back at once
because their collections were in the copy the AS happened to hold; board did
not, because it was added after that copy was taken.

Now `max-age=60`. **You still cannot purge a third party's cache** — after a
scope change, allow a minute (and up to the AS's own policy) before concluding
a deploy failed. Verify with a cache-busting query first:

```bash
curl -s "https://auth.mino.mobi/client-metadata.json?cb=$RANDOM" | jq -r '.scope' | tr ' ' '\n' | grep repo: | wc -l
```

and confirm end-to-end with a real PAR, which is the only check that proves the
AS agrees:

```bash
curl -s -X POST https://auth.mino.mobi/oauth/start \
  -H 'Content-Type: application/json' -H 'Origin: https://<site>.mino.mobi' \
  -d '{"handle":"<any.handle>","origin":"https://<site>.mino.mobi","scope":"atproto repo:<your.collection>"}'
```

An `authUrl` in the response means the ceiling is live and agreed. A PAR that is
never completed grants nothing, so this is safe to run against production.

## Deploying

Pushes to the owning branch above, or `main`, that touch this surface's paths trigger [`.github/workflows/deploy-auth.yml`](../../.github/workflows/deploy-auth.yml).
That workflow type-checks, ensures the D1 database, runs **every** migration in
`migrations/` against remote D1, then deploys. Verify afterwards by fetching
`https://auth.mino.mobi/client-metadata.json` and confirming the `scope` string
still contains every collection it did before, plus yours.
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
