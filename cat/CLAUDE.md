# cat — cat.mino.mobi — **DECOMMISSIONED 2026-07-28**

<!-- Hand-owned. Repo-wide rules live in ../CLAUDE.md; the index of all
     surfaces is ../docs/SURFACES.md. -->

This surface is dead. It is not paused, not being fixed, and not coming back
at this address. Do not redeploy it, and do not "restore" it from git history
without reading why it went away.

## Why it was taken down

It republished images from the Bluesky firehose: any post carrying a cat
hashtag and an image was indexed and shown in a public grid, with no human in
the loop.

The only safety control was **metadata-based** — the poster's self-applied
Bluesky labels (`porn`, `sexual`, `nudity`, …) plus a large hashtag blocklist.
That control never sees the image. It only sees what the poster chose to
declare. So the posts it caught were the ones that had already announced
themselves, and the ones that got through were adult images tagged `#cats` with
nothing else to match on. A metadata-only scan of 800 live rows the day it was
taken down found 2 rows with any adult marker in text, tags or alt — one of
them a false positive (`#blackcat`, a cosplay post). The leak was never in the
rows a blocklist could see.

**This is why the blocklist was not tuned again.** Every previous pass added
more terms; the failure mode is posts with no term to add. Anything that
actually fixed it would need image classification on ingest and a moderation
queue before display — which is a different product, not a patch to this one.

## What is left

`cat-firehose` still exists as a Cloudflare worker and still owns
`cat.mino.mobi`, because deleting a worker and detaching a domain are
dashboard-only ([`docs/DEPLOYS.md`](../docs/DEPLOYS.md) §7). It now runs the
inert `worker.js` in this directory: **410 Gone on every path**, with no D1
binding, no Durable Object, no cron and no assets, so it cannot reach
Jetstream, the database, or an image.

The `CatListener` Durable Object was deleted via the `v2` `deleted_classes`
migration. The scraped index (`cat_posts`, `cat_state`) was dropped by
[`0034_cat_teardown.sql`](../poll/apps/api/migrations/0034_cat_teardown.sql),
which sorts last so the replayed `0024_cat.sql` cannot resurrect the table.

There is no `deploy-cat.yml` and no entry in `deploy-registry.json`, so no
branch can ship this directory.

## To finish the job (dashboard, manual)

1. Delete the `cat-firehose` worker.
2. Detach the `cat.mino.mobi` custom domain and remove its DNS record.

Until then the domain answers 410, which is the correct and safe resting state.
