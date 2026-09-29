-- Adds a Resend email channel to the default alert policy. The recipient list and API key
-- live in env (RESEND_API_KEY, ALERT_EMAIL_TO) per the "secrets never live in the database"
-- rule (see 001_init.sql) — sending is skipped until ALERT_EMAIL_TO is set.
-- Idempotent: only appends if no email channel is present yet.
UPDATE alert_policies
SET channels = channels || '[{"type":"email","to":"env:ALERT_EMAIL_TO"}]'::jsonb
WHERE name = 'default'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(channels) c WHERE c->>'type' = 'email'
  );
