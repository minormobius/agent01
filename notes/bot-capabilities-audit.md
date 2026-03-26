# Bot Capabilities Audit — 2026-03-25

## What Exists Today

### Posting & Publishing
- **Thread posting** (`src/post_thread.py`): 3-account threading (main + modulo + morphyx), rich text facets, 300-char enforcement, CI-triggered via `time/posts/*.md` push
- **Article publishing** (`scripts/publish-whtwnd.py`): Markdown → PDS `com.whtwnd.blog.entry` records, image blob upload + rewrite, WhiteWind cross-post
- **Feed generator** (`workers/feed/`): SimCluster community detection from mutual-follow graphs, Constellation engagement signals, cross-community post ranking. Deployed at `feed.mino.mobi`

### Polls & Interactive
- **Full poll system** (`poll/`): Public (like-based) and anonymous (blind signature) modes
- **OG chart generation**: SVG bar charts → PNG via Resvg WASM (poll tallies only)
- **Poll → Bluesky**: Posts poll with option links, replies with tally on close

### ATProto Infrastructure
- Raw XRPC calls (no SDK dependency), OAuth 2.1 + DPoP in poll system, app-password auth elsewhere
- Identity resolution (handle → DID → PDS) in multiple places
- Phylo tree sync to custom lexicon records

## What's Missing

| Feature | Gap | Effort |
|---------|-----|--------|
| **Mention/notification handling** | No listener for @mentions or replies | Medium — Cloudflare Worker cron polling `listNotifications` |
| **General figure generation** | Only poll charts. No matplotlib/plotly for biotech data | Medium — Python script + blob upload pipeline |
| **Discussion hosting** | No structured discussion beyond linear threads | Medium — could extend poll infrastructure |
| **Scheduled posting** | Posts only on git push, no time-delay | Low — cron worker or GitHub scheduled workflow |
| **Survey deployment** | Code exists at `poll/apps/api/src/routes/surveys.ts` but undeployed | Low |

## Recommended Next Steps
1. **Notification listener** — Cloudflare Worker cron checking `app.bsky.notification.listNotifications`, filtering mentions, triggering responses
2. **Figure generation** — Python + matplotlib producing PNGs, piped through existing blob upload in `publish-whtwnd.py`
3. **Discussion polls** — Post a question, let people vote on takes, auto-post results via existing poll infra
