# lab-gamm — gamm.minomobi.com

The third of three **lab slots**: leased tenant space for websites an agent builds
on request. Up to 100 tenants live here, each at `gamm.minomobi.com/<slug>/`.

The full design — leases, isolation, the OAuth story, the build loop — is in
[`docs/LAB-FACTORY.md`](../../docs/LAB-FACTORY.md). This file is just the slot.

## Facts

| | |
|---|---|
| Surface | `lab-gamm` |
| Dir | `lab/gamm/` |
| Endpoint | gamm.minomobi.com |
| Type | frontend (assets-only worker, no build step) |
| Deploy | [`.github/workflows/deploy-lab-gamm.yml`](../../.github/workflows/deploy-lab-gamm.yml) |
| Builds tenants | [`.github/workflows/lab-build.yml`](../../.github/workflows/lab-build.yml) |

## Layout

```
lab/gamm/
  index.html      the landing page — 10x10 tenant grid (hand-edited)
  wrangler.jsonc  worker `gamm`, custom_domain gamm.minomobi.com
  tenants.json    GENERATED at deploy time, gitignored — never commit it
  <slug>/         one tenant site: index.html + BRIEF.md
```

`tenants.json` is written by `scripts/gen-lab-tenants.mjs` in the deploy job, so
the grid cannot drift from what is on disk and an agent adding a tenant never has
to regenerate anything.

## Why this is on `minomobi.com`, not `mino.mobi`

**Deliberate, and load-bearing.** `*.mino.mobi` carries the shared SSO cookie
(`Domain=.mino.mobi`) and is blanket-allowed by the auth worker's origin check, so
a page served there can call `auth.mino.mobi/pds/*` with a signed-in visitor's
session and no consent screen. Agent-written JavaScript must never sit on that
origin. `minomobi.com` is outside the cookie's reach.

Do not "fix" this by moving the slot to `*.mino.mobi`.
See [`docs/LAB-FACTORY.md`](../../docs/LAB-FACTORY.md) §3.

## Tenants are leases, not homes

When the slot fills, the oldest tenant is recycled and its URL stops resolving.
Anything worth keeping is promoted to a real surface by a human. Tenant history
survives recycling on its own durable `claude/lab-<slug>` branch.

## Deploying

A push to this surface's owning branch touching `lab/gamm/**` deploys it. The
sandbox cannot reach Cloudflare — push, don't `wrangler deploy` locally. Confirm
the run logs `gamm.minomobi.com (custom domain)`; green alone is not proof.
