-- 0024_cat.sql — cATProto: cat pictures from the firehose.
--
-- The CatListener Durable Object subscribes to Jetstream, filters for posts
-- with images AND a cat-related hashtag, and writes one row per matching post.
-- INSERT OR IGNORE keeps it idempotent against jetstream replays.

CREATE TABLE IF NOT EXISTS cat_posts (
  uri              TEXT PRIMARY KEY,            -- at://did/app.bsky.feed.post/rkey
  did              TEXT NOT NULL,
  rkey             TEXT NOT NULL,
  cid              TEXT,                        -- commit cid (informational)
  text             TEXT,
  langs            TEXT,                        -- JSON array
  image_cid        TEXT NOT NULL,               -- first image's blob CID
  image_alt        TEXT,
  image_aspect_w   INTEGER DEFAULT 0,
  image_aspect_h   INTEGER DEFAULT 0,
  hashtags         TEXT,                        -- JSON array of matched tags
  created_at       INTEGER NOT NULL,            -- record.createdAt (epoch ms)
  indexed_at       INTEGER NOT NULL             -- when we saw it
);

CREATE INDEX IF NOT EXISTS idx_cat_posts_indexed ON cat_posts(indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cat_posts_created ON cat_posts(created_at DESC);

CREATE TABLE IF NOT EXISTS cat_state (
  k  TEXT PRIMARY KEY,
  v  TEXT
);
