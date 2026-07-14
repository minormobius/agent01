-- reef.mino.mobi — crowd judgement of procedural voxel species (specimen ids
-- are (species, seed) pairs; the shapes themselves are regenerated from
-- reef/js/species.js, so only votes are stored).
CREATE TABLE IF NOT EXISTS reef_votes (
  specimen TEXT NOT NULL,              -- e.g. 'eel:1234'
  voter TEXT NOT NULL,                 -- anonymous localStorage id
  vote INTEGER NOT NULL CHECK (vote IN (0, 1)),
  gen INTEGER NOT NULL DEFAULT 1,      -- species generator version at vote time
  voted_at INTEGER NOT NULL,
  PRIMARY KEY (specimen, voter)
);
CREATE INDEX IF NOT EXISTS idx_reef_votes_specimen ON reef_votes(specimen);
CREATE INDEX IF NOT EXISTS idx_reef_votes_voter ON reef_votes(voter);
