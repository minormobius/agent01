# auto/ — autopilot-built sites

Sites in here are generated unattended by the **autopilot routine**
(`scripts/autopilot/build-prompt.md`), one per run. Each lives in its own
`auto/<slug>/` dir with a self-contained `index.html`, a `wrangler.jsonc`
(Worker name `auto-<slug>`), and an `ANNOUNCE.md`.

## Lifecycle

1. The routine builds `auto/<slug>/` and pushes `claude/auto-<slug>`.
2. `.github/workflows/deploy-autopilot.yml` deploys each changed site as an
   isolated Worker at `auto-<slug>.workers.dev` and posts the announce from
   the bot account (`BLUESKY_BOT_*`, falling back to `BLUESKY_MODULO_*`).
3. **Promotion is manual.** Nothing here appears on the curated apex front
   page until a human moves it to a top-level dir, adds it to `index.html`'s
   `PROJECTS` array, and regenerates the search catalog + OG card.

This namespace is the autopilot's sandbox: generated sites go live on their
own subdomain immediately, but the front page stays curated.
