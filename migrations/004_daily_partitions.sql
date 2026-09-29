-- Converts check_results from monthly to daily partitions so 7-day retention can be enforced
-- by dropping whole old partitions (a fast catalog operation) instead of a slow row-by-row
-- DELETE (full scan, index churn, needs VACUUM afterward — exactly the load this avoids).
--
-- Generic over whatever partitions currently exist: an empty one is dropped directly, one with
-- data is detached, its rows re-inserted through the parent (which auto-routes each row into a
-- freshly created daily partition by its own checked_at), then the old partition is dropped.
DO $$
DECLARE
  part RECORD;
  d DATE;
  min_d DATE;
  max_d DATE;
  n BIGINT;
  daily_name TEXT;
BEGIN
  FOR part IN
    SELECT child.relname AS name
    FROM pg_inherits
    JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
    JOIN pg_class child ON pg_inherits.inhrelid = child.oid
    WHERE parent.relname = 'check_results'
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', part.name) INTO n;

    IF n = 0 THEN
      EXECUTE format('ALTER TABLE check_results DETACH PARTITION %I', part.name);
      EXECUTE format('DROP TABLE %I', part.name);
      CONTINUE;
    END IF;

    EXECUTE format('SELECT min(checked_at)::date, max(checked_at)::date FROM %I', part.name)
      INTO min_d, max_d;

    EXECUTE format('ALTER TABLE check_results DETACH PARTITION %I', part.name);

    d := min_d;
    WHILE d <= max_d LOOP
      daily_name := 'check_results_y' || to_char(d, 'YYYY') || 'm' || to_char(d, 'MM') || 'd' || to_char(d, 'DD');
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF check_results FOR VALUES FROM (%L) TO (%L)',
        daily_name, d, d + 1
      );
      d := d + 1;
    END LOOP;

    EXECUTE format('INSERT INTO check_results SELECT * FROM %I', part.name);
    EXECUTE format('DROP TABLE %I', part.name);
  END LOOP;
END $$;

-- Safety net for any future out-of-range row (a gap in daily pre-creation, a clock issue, etc.)
CREATE TABLE IF NOT EXISTS check_results_default PARTITION OF check_results DEFAULT;
