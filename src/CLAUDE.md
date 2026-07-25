# Bluesky post pipeline (`src/post_thread.py` + `time/posts/`)

<!-- Moved out of root CLAUDE.md. Repo-wide rules: ../CLAUDE.md.
     Index of all surfaces: ../docs/SURFACES.md. -->

> **DANGER ZONE.** A push to `time/posts/**.md` on `main` posts to REAL
> Bluesky accounts. Never push test markdown there.

**Trigger**: Push markdown files to `time/posts/*.md`
**Workflow**: `.github/workflows/post-to-bluesky.yml`
**Script**: `src/post_thread.py` (356 lines, Python)

## What It Does

Auto-posts threaded content to Bluesky from markdown files. Supports 3 accounts: main (@minomobi.com), @modulo, @morphyx.

## Post Format

```markdown
---
Thread Title Here
---
Main post content (from main account)
---
Another main post (chains sequentially)
---
@modulo
Modulo's reply (branches from thread root)
---
@morphyx
Morphyx's reply (chains from modulo's)
```

## Constraints

- **300 chars** per post (Bluesky limit)
- **12 posts** max per thread
- **2s delay** between posts (rate limiting)
- Auto-converts `[text](url)` to Bluesky facets
- Auto-detects bare URLs

## Secrets

`BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` (main, required)
`BLUESKY_MODULO_HANDLE`, `BLUESKY_MODULO_APP_PASSWORD` (optional)
`BLUESKY_MORPHYX_HANDLE`, `BLUESKY_MORPHYX_APP_PASSWORD` (optional)

## Danger Zone

**A push to `time/posts/` triggers real Bluesky posts.** Don't push test markdown there. The workflow fires on any push to `main` that touches `time/posts/**.md`.

---
