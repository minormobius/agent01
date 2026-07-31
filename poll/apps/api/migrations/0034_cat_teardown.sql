-- 0034_cat_teardown.sql — remove the cAT firehose index.
--
-- cat.mino.mobi republished firehose images behind a metadata-only NSFW
-- filter that could not see the images themselves. The surface was taken
-- down; these tables held the scraped index (post URIs, blob CIDs and the
-- hashtags used to select them) that made the grid renderable.
--
-- Numbered ABOVE 0024_cat.sql / 0025_cat_reset_initial.sql on purpose. Two
-- workflows (d1-migrate.yml, deploy-poll.yml) replay `migrations/*.sql` in
-- sorted order on every run, so 0024 will keep re-creating cat_posts. Because
-- this file sorts last, any full replay now ends with the table dropped
-- instead of re-created. Do not renumber it below 0025.
--
-- No other surface reads these tables: `cat_posts` and `cat_state` appear
-- only in 0024, 0025 and the (now decommissioned) cat/worker.js.

DROP TABLE IF EXISTS cat_posts;
DROP TABLE IF EXISTS cat_state;
