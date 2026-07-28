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
