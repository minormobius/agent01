# org — org.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Organization hub. Create orgs, manage members and tiers, with calendar, CRM, PM, and Wave apps built in.

## Facts

| | |
|---|---|
| Surface | `org` |
| Dir | `org/` |
| Endpoint | `org.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/agent-social-media-drlzxn` (taken 2026-10-04 with take-ownership.mjs from `claude/landing-page-merge-candidate-8sp0fv`, which had it from `claude/landing-projects-takeover-pKkmW`) |
| Deploy | `.github/workflows/deploy-org.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "org"`.

## How it works

Org SPA (Vite + tsc -> ./dist, Worker `org`). Has inline OAuth in org/src/pds.ts (migration to shared oauth-client pending).

Everything a person keeps here is end-to-end encrypted on their own PDS: records are sealed
envelopes in `com.minomobi.vault.sealed` (`src/crypto.ts`), each naming its `innerType`. The PM
app is localStorage-first; its Sync pane seals the whole project into rkey `pm-main`
(`com.minomobi.pm.project`, payload `{ _pmState }`) plus per-task schedule records.

**The PM engine lives in [`packages/pm/`](../packages/pm/)** (EVM, earned schedule, critical
path, durations). `src/pm/engine.ts` only re-exports it. Its numbers are pinned by
`engine.selftest.mjs` (40 golden projects from the original TS); the deploy runs that first, and
the registry's `paths` include `packages/pm/**`, so an engine change redeploys org.

## Agents

**`mcp/` is vault-mcp**, a local stdio MCP server (`npm run build`, then `node dist/server.mjs`)
that unlocks the vault with handle, app password and passphrase, and decrypts in-process. 59
tools: CRM, orgs, calendar, wave, tasks, contacts, search, workflows, templates, and PM:

- `pm-status`: EVM, ES, critical path, late tasks for the synced project, at any `asOf`.
- `pm-tasks`: the task tree and dependencies.
- `pm-verified-earned`: EV where only verified requirements earn (`packages/pm/earned.mjs`),
  given a V&V status map. The gap to self-reported EV is `unverifiedClaim`.

`npm run selftest` in `mcp/` exercises the PM tools on a sealed stub project. `npm run typecheck`
has been red for a long time (no DOM lib for `CryptoKey`, drifted CRM types); the esbuild bundle
is what runs. Until 2026-10-04 `tools/list` itself failed (zod v4 `z.record` needs a key schema),
so no MCP client could see any tool: if it breaks again, check that first.

Remote, scoped access for agents that are not on the person's machine is a design, not a build:
[`docs/ORG-AGENTS.md`](../docs/ORG-AGENTS.md).

### Known gaps

- `actualCost` is typed by hand; time entries never roll up into it.
- Sync's Pull replaces the local project with `pm-main` wholesale. One project per PDS.

## Deploy status

MANAGED — onboarded to Actions (deploy-org.yml). First QB pass: brought an Action-less independent site onto the deploy conveyor. (Was deploying via CF git integration / manual wrangler; disconnect git once this Action is confirmed canonical.)

## Deploying

Pushes to `claude/agent-social-media-drlzxn` that touch this surface's paths trigger [`.github/workflows/deploy-org.yml`](../.github/workflows/deploy-org.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
