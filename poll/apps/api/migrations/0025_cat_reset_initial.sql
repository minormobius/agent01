-- 0025_cat_reset_initial.sql — one-shot wipe of cat_posts.
--
-- The DELETE is guarded by a marker row in cat_state. First apply: marker
-- doesn't exist yet, so NOT EXISTS is true and every row is deleted. Same
-- statement on every subsequent deploy: marker exists, NOT EXISTS is false,
-- DELETE deletes nothing. Self-disabling, idempotent.

DELETE FROM cat_posts
  WHERE NOT EXISTS (SELECT 1 FROM cat_state WHERE k = 'reset_2026_05_v1');

INSERT OR IGNORE INTO cat_state (k, v)
  VALUES ('reset_2026_05_v1', strftime('%s','now'));
