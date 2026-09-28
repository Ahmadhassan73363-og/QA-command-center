-- Phase 1 schema (Revised Spec v2, "Revised data model").
-- Tables are created in dependency order.

CREATE TABLE alert_policies (
  id                 BIGSERIAL PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,
  channels           JSONB NOT NULL DEFAULT '[]',   -- [{"type":"slack","url":"env:SLACK_WEBHOOK_URL"}]
  quiet_hours        JSONB,                         -- reserved (deferred past MVP)
  escalate_after_min INT,                           -- reserved (deferred past MVP)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE site_profiles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  extends     TEXT REFERENCES site_profiles(id),
  config      JSONB NOT NULL,
  adapter     TEXT,
  is_builtin  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sites (
  id                 BIGSERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  url                TEXT NOT NULL,
  region             TEXT NOT NULL DEFAULT 'global',
  profile_id         TEXT NOT NULL REFERENCES site_profiles(id),
  timezone           TEXT NOT NULL DEFAULT 'UTC',
  tags               TEXT[] NOT NULL DEFAULT '{}',
  overrides          JSONB NOT NULL DEFAULT '{}',   -- site-level layer, as entered
  resolved_config    JSONB NOT NULL,                -- computed at save
  alert_policy_id    BIGINT REFERENCES alert_policies(id),
  adapter_config_enc BYTEA,
  head_unsupported   BOOLEAN NOT NULL DEFAULT false,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (url, region)
);

CREATE TABLE runs (
  id           UUID PRIMARY KEY,
  trigger      TEXT NOT NULL,          -- 'schedule' | 'manual'
  tier         SMALLINT NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);

CREATE TABLE check_results (
  id               BIGSERIAL,
  site_id          BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  run_id           UUID REFERENCES runs(id),
  check_type       TEXT NOT NULL,
  status           TEXT NOT NULL,   -- pass | warn | fail | error | flaky | skipped_no_probe
  attempt          SMALLINT NOT NULL DEFAULT 1,
  error_code       TEXT,
  response_code    INT,
  response_time_ms INT,
  expected_value   JSONB,
  actual_value     JSONB,
  error_message    TEXT,
  metadata         JSONB,
  worker_id        TEXT,
  probe_region     TEXT,
  checked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, checked_at)
) PARTITION BY RANGE (checked_at);

-- Safety net; monthly partitions are created ahead of time by ensurePartitions().
CREATE TABLE check_results_default PARTITION OF check_results DEFAULT;

CREATE INDEX check_results_site_type_time ON check_results (site_id, check_type, checked_at DESC);

CREATE TABLE incidents (
  id                 BIGSERIAL PRIMARY KEY,
  site_id            BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  check_type         TEXT NOT NULL,
  severity           TEXT NOT NULL,      -- warn | critical
  status             TEXT NOT NULL,      -- open | acked | resolved | suppressed
  error_code         TEXT,
  summary            TEXT NOT NULL,
  opened_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  acked_at           TIMESTAMPTZ,
  resolved_at        TIMESTAMPTZ,
  consecutive_passes SMALLINT NOT NULL DEFAULT 0,
  notified           BOOLEAN NOT NULL DEFAULT true  -- false = opened silently under a root-cause incident
);

-- One open incident per site + check: dedup enforced by the database.
CREATE UNIQUE INDEX incidents_one_open
  ON incidents (site_id, check_type) WHERE status IN ('open', 'acked');

-- Default policy. Secrets are env references, never stored in the database.
INSERT INTO alert_policies (name, channels) VALUES (
  'default',
  '[{"type":"slack","url":"env:SLACK_WEBHOOK_URL"},{"type":"webhook","url":"env:ALERT_WEBHOOK_URL"}]'
);
