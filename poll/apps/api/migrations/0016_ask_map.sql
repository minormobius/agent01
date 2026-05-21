-- ask v2: 2D map (PCA) of the embedding space, precomputed at index time.
--
-- map_json holds [{tid, x, y, n, c, s}] for the whole DID — small enough
-- (~200 bytes/thread × 10k threads = 2 MB) to read in one query.
-- Computed after every askIndex call so it stays in sync with the rows.

ALTER TABLE ask_index_meta ADD COLUMN map_json TEXT;
