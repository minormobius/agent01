# Provenance — vendored from a collaborator

This directory is a **vendored snapshot** of a collaborator's repository, brought
into the minomobi monorepo so its story/content engine can be wired into **hoop**
(the infinite game at `hoop.mino.mobi`). It is **not** authored here.

| | |
|---|---|
| **Upstream** | `tangled.org/huwupy.kawaii.social/hoop-backend` (git-on-ATProto) |
| **Knot** | `knot1.tangled.sh` |
| **Snapshot rev** | `835cfc67cac5cb961bb5a59561e3cc4d9e3479e2` ("openrouter support") |
| **Vendored** | 2026-06-13 |
| **Language** | Python 3.12 (uv-managed) + a small JS/HTML prototype client |

## Rules for this copy (same discipline as `hoop/vendor/auth.js`)

- **Treat as upstream.** Prefer re-syncing from the collaborator's repo over forking
  it in place. Integration glue that is *ours* belongs in `hoop/` or in clearly
  marked adapter files, **not** scattered as edits across his modules.
- **It does not deploy.** There is no Python deploy workflow, and this lives
  **outside `hoop/`** on purpose — `hoop/wrangler.jsonc` sets `assets.directory: "."`,
  so anything under `hoop/` is uploaded as public static assets and is on the
  `hoop/**` deploy trigger. Keeping the backend a top-level sibling keeps it out of
  both. Do not move it under `hoop/`.
- **Attribution stays.** His `README.md` and `CLAUDE.md` are kept verbatim.

## What it is (one line)

A procedurally-generated persistent-world content engine for an infinite, Qud-like
game, built on one rule: **no LLM in the player hot path.** LLM work is offline
(`ingestion/`) or async (`poller/`); every player verb is deterministic SQL.

See [`INTEGRATION.md`](INTEGRATION.md) for how this is proposed to meet hoop.
</content>
</invoke>
