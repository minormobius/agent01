-- 0038_zest_status.sql — zest: make the basis cron's outcome visible.
--
-- The basis fit runs in a cron and in ctx.waitUntil, so when it throws there is
-- nowhere for the error to go. It DID throw — "sample too thin: 116 posts"
-- against a floor of 120 — and from the outside that was indistinguishable
-- from "still building": /health just showed basis: null, forever.
--
-- The page degrades honestly either way (it fits a session-local basis and says
-- so on screen), so this is not about users. It is so the next person to look
-- at /health is told what went wrong instead of having to reproduce it.

CREATE TABLE IF NOT EXISTS zest_status (
  key        TEXT PRIMARY KEY,   -- 'basis-build'
  ok         INTEGER NOT NULL,   -- 1 success, 0 failure
  detail     TEXT,               -- the error message, or a short success summary
  updated_at INTEGER NOT NULL
);
