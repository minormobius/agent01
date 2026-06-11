-- pod (pod.mino.mobi) — published podcast episodes cache.
-- One row per com.minomobi.podcast.episode that has been published to the
-- communal feed. audio_url points at the worker's /enclosure route, which
-- stitches the episode's chunked atproto blobs into one streamable URL.
CREATE TABLE IF NOT EXISTS pod_episodes (
  guid           TEXT PRIMARY KEY,   -- the episode record AT-URI
  did            TEXT,               -- publisher DID
  title          TEXT,
  description    TEXT,
  audio_url      TEXT,               -- https://pod.mino.mobi/enclosure?uri=...
  mime           TEXT,
  length_bytes   INTEGER,
  duration_sec   INTEGER,
  pub_date       TEXT,
  episode_number INTEGER,
  season_number  INTEGER,
  created_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_pod_episodes_pub ON pod_episodes (pub_date DESC);
