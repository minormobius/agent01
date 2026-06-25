-- speclab — speculative-feedback playground (fin.mino.mobi)
-- Shares the atpolls-db D1 instance (poll/feed/rite/airchat). All tables are
-- prefixed spec_ to stay clearly namespaced. Applied by deploy-finance.yml.

-- Durable experiment store: one row per walk-forward run. The full RunRecord
-- (metrics + series) lives in payload; the flat columns are for cheap listing
-- and compare without parsing the blob.
CREATE TABLE IF NOT EXISTS spec_runs (
  id               TEXT PRIMARY KEY,
  created_at       TEXT NOT NULL,
  model            TEXT NOT NULL,
  dataset_id       TEXT,
  dataset_label    TEXT,
  contract_version TEXT,
  brier_model      REAL,
  brier_pm         REAL,
  sharpe           REAL,
  total_return     REAL,
  abstain_rate     REAL,
  exogeneity_score REAL,
  payload          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spec_runs_created ON spec_runs (created_at DESC);

-- Forward-accruing real prediction-market snapshots. Liquid daily BTC PM history
-- is not freely backfillable, so the cron in worker.js appends a snapshot of the
-- linked asset price and the market-implied probability each run; over time this
-- becomes a real paired series for the "Real BTC · live PM" dataset.
CREATE TABLE IF NOT EXISTS spec_pm_snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL,       -- ISO snapshot time
  source       TEXT NOT NULL,       -- e.g. 'kalshi'
  market       TEXT NOT NULL,       -- market ticker
  asset_symbol TEXT NOT NULL,       -- e.g. 'BTC-USD'
  asset_price  REAL,                -- spot at snapshot
  strike       REAL,                -- market strike/cap
  implied_prob REAL,                -- yes-mid as probability [0,1]
  close_time   TEXT,                -- market resolution time
  raw          TEXT                 -- raw market JSON (audit)
);
CREATE INDEX IF NOT EXISTS idx_spec_pm_market_ts ON spec_pm_snapshots (market, ts);
CREATE INDEX IF NOT EXISTS idx_spec_pm_ts ON spec_pm_snapshots (ts DESC);
