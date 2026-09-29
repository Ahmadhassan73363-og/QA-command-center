-- Singleton-row table used only by the client's periodic auto-check timer to dedupe across
-- multiple simultaneously-open dashboard tabs. Deliberately separate from `runs` (which gets
-- one row per site per cycle, including manual single-site re-tests) so a recent single-site
-- re-test can never suppress the scheduled all-sites check.
CREATE TABLE IF NOT EXISTS auto_check_state (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  last_run_at TIMESTAMPTZ
);
INSERT INTO auto_check_state (id, last_run_at) VALUES (true, NULL) ON CONFLICT DO NOTHING;
